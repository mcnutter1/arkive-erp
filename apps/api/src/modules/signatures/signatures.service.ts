import { createHash } from 'node:crypto';

import { SendRawEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

import { AuthenticatedUser } from '../auth/auth.types.js';
import { AccessPolicyService } from '../authorization/access-policy.service.js';
import { PrismaService } from '../common/prisma.service.js';
import { StorageService } from '../documents/storage.service.js';
import {
  CompleteNativeSignatureDto,
  CreateNativeSignatureRequestDto,
  DeclineNativeSignatureDto,
} from './dto.js';
import { verifySignerLinkToken } from './signer-link-token.js';

const SignatureParticipantStatus = {
  PENDING: 'PENDING',
  VIEWED: 'VIEWED',
  SIGNED: 'SIGNED',
  DECLINED: 'DECLINED',
} as const;

const SignatureRequestStatus = {
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  PARTIALLY_SIGNED: 'PARTIALLY_SIGNED',
  SIGNED: 'SIGNED',
  DECLINED: 'DECLINED',
  CANCELED: 'CANCELED',
} as const;

export type SignatureCaptureContext = {
  ipAddress?: string;
  userAgent?: string;
  localeHint?: string;
};

type LocaleBindingResult = {
  matched: boolean;
  reason: string;
  originLocale?: string;
  signerLocale?: string;
};

type SignedCopyEmailSummary = {
  total: number;
  sent: number;
  failed: number;
  results: Array<{
    participantId: string;
    personId: string;
    email?: string;
    status: 'SENT' | 'FAILED';
    reason?: string;
  }>;
};

type ArtifactSignatureRow = {
  participantId: string;
  personId: string;
  personName: string;
  role: string;
  signingOrder: number;
  status: string;
  signedAt: string | null;
  declinedReason: string | null;
  consentText: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  signatureType: string | null;
  typedFullName: string | null;
  drawnSignatureDataUrl: string | null;
  drawnSignatureSha256: string | null;
  signerLocale: string | null;
  originLocale: string | null;
  localeMatch: boolean | null;
  signerTimezone: string | null;
  signerDevice: string | null;
};

@Injectable()
export class SignaturesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessPolicy: AccessPolicyService,
    private readonly storage: StorageService,
  ) {}

  async createNativeRequest(
    actor: AuthenticatedUser,
    dto: CreateNativeSignatureRequestDto,
    capture: SignatureCaptureContext = {},
  ) {
    await this.accessPolicy.assertDocumentWrite(actor, dto.documentId);

    const version = await this.prisma.documentVersion.findFirst({
      where: {
        id: dto.documentVersionId,
        documentId: dto.documentId,
        organizationId: actor.organizationId,
      },
    });

    if (!version) {
      throw new NotFoundException('Document version not found');
    }

    if (dto.participants.length === 0) {
      throw new BadRequestException('At least one participant is required');
    }

    const created = await this.prisma.signatureRequest.create({
      data: {
        organizationId: actor.organizationId,
        documentId: dto.documentId,
        documentVersionId: dto.documentVersionId,
        title: dto.title,
        status: SignatureRequestStatus.SENT,
        signingOrderRequired: dto.signingOrderRequired ?? true,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        createdByUserId: actor.id,
        participants: {
          create: dto.participants.map((p) => ({
            organizationId: actor.organizationId,
            personId: p.personId,
            signingOrder: p.signingOrder,
            role: p.role,
          })),
        },
        events: {
          create: {
            organizationId: actor.organizationId,
            eventType: 'REQUEST_CREATED',
            payload: {
              source: 'native-esign',
              requesterUserId: actor.id,
              originIpAddress: capture.ipAddress ?? null,
              originUserAgent: capture.userAgent ?? null,
              originLocale: this.normalizeLocaleTag(capture.localeHint) ?? null,
              createdAt: new Date().toISOString(),
            } as Prisma.InputJsonValue,
          },
        },
      },
      include: {
        participants: true,
      },
    });

    return created;
  }

  async listMyRequests(actor: AuthenticatedUser) {
    if (!actor.personId) {
      return [];
    }

    return this.prisma.signatureParticipant.findMany({
      where: {
        organizationId: actor.organizationId,
        personId: actor.personId,
      },
      include: {
        signatureRequest: {
          include: {
            document: {
              select: {
                id: true,
                title: true,
                category: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getMyParticipantPacket(actor: AuthenticatedUser, participantId: string) {
    if (!actor.personId) {
      throw new ForbiddenException('Only person-linked users can sign');
    }

    const participant = await this.prisma.signatureParticipant.findFirst({
      where: {
        id: participantId,
        organizationId: actor.organizationId,
        personId: actor.personId,
      },
      include: {
        signatureRequest: {
          include: {
            document: {
              select: {
                id: true,
                title: true,
                category: true,
              },
            },
            documentVersion: {
              select: {
                id: true,
                mimeType: true,
                byteSize: true,
                sha256: true,
                storageKey: true,
              },
            },
            participants: {
              orderBy: { signingOrder: 'asc' },
              include: {
                person: {
                  select: {
                    id: true,
                    legalFirstName: true,
                    legalLastName: true,
                    primaryEmail: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!participant) {
      throw new NotFoundException('Signature packet not found');
    }

    if (participant.status === SignatureParticipantStatus.PENDING) {
      await this.prisma.$transaction([
        this.prisma.signatureParticipant.update({
          where: { id: participant.id },
          data: { status: SignatureParticipantStatus.VIEWED },
        }),
        this.prisma.signatureEvent.create({
          data: {
            organizationId: actor.organizationId,
            signatureRequestId: participant.signatureRequestId,
            eventType: 'PARTICIPANT_VIEWED',
            payload: {
              participantId: participant.id,
              personId: actor.personId,
              viewedAt: new Date().toISOString(),
            } as Prisma.InputJsonValue,
          },
        }),
      ]);
    }

    const effectiveStatus =
      participant.status === SignatureParticipantStatus.PENDING
        ? SignatureParticipantStatus.VIEWED
        : participant.status;

    const downloadUrl = await this.storage.createDownloadUrl(
      participant.signatureRequest.documentVersion.storageKey,
    );

    return {
      participant: {
        id: participant.id,
        status: effectiveStatus,
        role: participant.role,
        signingOrder: participant.signingOrder,
      },
      request: {
        id: participant.signatureRequest.id,
        title: participant.signatureRequest.title,
        status: participant.signatureRequest.status,
        expiresAt: participant.signatureRequest.expiresAt,
        signingOrderRequired: participant.signatureRequest.signingOrderRequired,
        document: participant.signatureRequest.document,
        participants: participant.signatureRequest.participants.map((p) => ({
          id: p.id,
          role: p.role,
          signingOrder: p.signingOrder,
          status: p.status,
          signedAt: p.signedAt,
          person: p.person,
        })),
      },
      documentVersion: {
        id: participant.signatureRequest.documentVersion.id,
        mimeType: participant.signatureRequest.documentVersion.mimeType,
        byteSize: participant.signatureRequest.documentVersion.byteSize,
        sha256: participant.signatureRequest.documentVersion.sha256,
        downloadUrl,
      },
    };
  }

  async getPublicParticipantPacket(
    participantId: string,
    token: string | undefined,
    capture: SignatureCaptureContext = {},
  ) {
    const participant = await this.prisma.signatureParticipant.findFirst({
      where: {
        id: participantId,
      },
      include: {
        signatureRequest: {
          include: {
            document: {
              select: {
                id: true,
                title: true,
                category: true,
              },
            },
            documentVersion: {
              select: {
                id: true,
                mimeType: true,
                byteSize: true,
                sha256: true,
                storageKey: true,
              },
            },
            participants: {
              orderBy: { signingOrder: 'asc' },
              include: {
                person: {
                  select: {
                    id: true,
                    legalFirstName: true,
                    legalLastName: true,
                    primaryEmail: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!participant) {
      throw new NotFoundException('Signature packet not found');
    }

    this.assertPublicLinkAccess(participant.id, participant.organizationId, token);

    if (participant.status === SignatureParticipantStatus.PENDING) {
      await this.prisma.$transaction([
        this.prisma.signatureParticipant.update({
          where: { id: participant.id },
          data: { status: SignatureParticipantStatus.VIEWED },
        }),
        this.prisma.signatureEvent.create({
          data: {
            organizationId: participant.organizationId,
            signatureRequestId: participant.signatureRequestId,
            eventType: 'PARTICIPANT_VIEWED',
            payload: {
              participantId: participant.id,
              personId: participant.personId,
              viewedAt: new Date().toISOString(),
              accessMode: 'public-link',
              ipAddress: capture.ipAddress ?? null,
              userAgent: capture.userAgent ?? null,
            } as Prisma.InputJsonValue,
          },
        }),
      ]);
    }

    const effectiveStatus =
      participant.status === SignatureParticipantStatus.PENDING
        ? SignatureParticipantStatus.VIEWED
        : participant.status;

    const downloadUrl = await this.storage.createDownloadUrl(
      participant.signatureRequest.documentVersion.storageKey,
    );

    return {
      participant: {
        id: participant.id,
        status: effectiveStatus,
        role: participant.role,
        signingOrder: participant.signingOrder,
      },
      request: {
        id: participant.signatureRequest.id,
        title: participant.signatureRequest.title,
        status: participant.signatureRequest.status,
        expiresAt: participant.signatureRequest.expiresAt,
        signingOrderRequired: participant.signatureRequest.signingOrderRequired,
        document: participant.signatureRequest.document,
        participants: participant.signatureRequest.participants.map((p) => ({
          id: p.id,
          role: p.role,
          signingOrder: p.signingOrder,
          status: p.status,
          signedAt: p.signedAt,
          person: p.person,
        })),
      },
      documentVersion: {
        id: participant.signatureRequest.documentVersion.id,
        mimeType: participant.signatureRequest.documentVersion.mimeType,
        byteSize: participant.signatureRequest.documentVersion.byteSize,
        sha256: participant.signatureRequest.documentVersion.sha256,
        downloadUrl,
      },
    };
  }

  async completeMySignature(
    actor: AuthenticatedUser,
    participantId: string,
    dto: CompleteNativeSignatureDto,
    capture: SignatureCaptureContext = {},
  ) {
    if (!actor.personId) {
      throw new ForbiddenException('Only person-linked users can sign');
    }

    const participant = await this.prisma.signatureParticipant.findFirst({
      where: {
        id: participantId,
        organizationId: actor.organizationId,
      },
      include: {
        signatureRequest: {
          include: {
            participants: true,
            events: {
              where: { eventType: 'REQUEST_CREATED' },
              orderBy: { createdAt: 'asc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!participant || participant.personId !== actor.personId) {
      throw new ForbiddenException('Participant access denied');
    }

    if (participant.status === SignatureParticipantStatus.SIGNED) {
      return {
        participant,
        artifactCaptured: false,
      };
    }

    this.validateSignaturePayload(dto);

    if (participant.signatureRequest.signingOrderRequired) {
      const blocking = participant.signatureRequest.participants.some(
        (p) => p.signingOrder < participant.signingOrder && p.status !== SignatureParticipantStatus.SIGNED,
      );
      if (blocking) {
        throw new BadRequestException('Previous signers must complete first');
      }
    }

    const originLocale = this.extractOriginLocale(participant.signatureRequest.events[0]?.payload);
    const signerLocale =
      this.normalizeLocaleTag(capture.localeHint) ?? this.normalizeLocaleTag(dto.signerLocale) ?? undefined;
    const localeBinding = this.validateLocaleBinding(originLocale, signerLocale);

    const signatureData = dto.drawnSignatureDataUrl?.trim();
    const typedFullName = dto.typedFullName?.trim() || undefined;
    const consentText = dto.consentText.trim();
    const signatureDigest = signatureData ? this.sha256Hex(signatureData) : undefined;

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.signatureParticipant.update({
        where: { id: participant.id },
        data: {
          status: SignatureParticipantStatus.SIGNED,
          signedAt: new Date(),
          consentText,
          ipAddress: capture.ipAddress,
          userAgent: capture.userAgent,
        },
      });

      await tx.signatureEvent.create({
        data: {
          organizationId: actor.organizationId,
          signatureRequestId: participant.signatureRequestId,
          eventType: 'PARTICIPANT_SIGNED',
          payload: {
            participantId: participant.id,
            personId: actor.personId,
            signatureType: dto.signatureType,
            typedFullName: typedFullName ?? null,
            drawnSignatureDataUrl: signatureData ?? null,
            drawnSignatureSha256: signatureDigest ?? null,
            consentText,
            signerDevice: dto.signerDevice ?? null,
            signerTimezone: dto.signerTimezone ?? null,
            signerLocale: signerLocale ?? null,
            originLocale: localeBinding.originLocale ?? null,
            localeMatch: localeBinding.matched,
            localeBindingReason: localeBinding.reason,
            ipAddress: capture.ipAddress ?? null,
            userAgent: capture.userAgent ?? null,
            signedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });

      const allSigned = await tx.signatureParticipant.count({
        where: {
          signatureRequestId: participant.signatureRequestId,
          status: SignatureParticipantStatus.SIGNED,
        },
      });

      const total = participant.signatureRequest.participants.length;
      const nextStatus =
        allSigned >= total ? SignatureRequestStatus.SIGNED : SignatureRequestStatus.PARTIALLY_SIGNED;

      await tx.signatureRequest.update({
        where: { id: participant.signatureRequestId },
        data: {
          status: nextStatus,
        },
      });

      return {
        participant: updated,
        requestStatus: nextStatus,
      };
    });

    if (result.requestStatus !== SignatureRequestStatus.SIGNED) {
      return {
        participant: result.participant,
        artifactCaptured: false,
      };
    }

    const captured = await this.captureSignedArtifact({
      organizationId: actor.organizationId,
      signatureRequestId: participant.signatureRequestId,
      actorUserId: actor.id,
    });
    return {
      participant: result.participant,
      artifactCaptured: captured.captured,
      signedDocumentVersionId: captured.documentVersionId,
      signedCopyEmails: captured.signedCopyEmails,
    };
  }

  async completePublicSignature(
    participantId: string,
    token: string | undefined,
    dto: CompleteNativeSignatureDto,
    capture: SignatureCaptureContext = {},
  ) {
    const participant = await this.prisma.signatureParticipant.findFirst({
      where: {
        id: participantId,
      },
      include: {
        signatureRequest: {
          include: {
            participants: true,
            events: {
              where: { eventType: 'REQUEST_CREATED' },
              orderBy: { createdAt: 'asc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!participant) {
      throw new NotFoundException('Signature participant not found');
    }

    const tokenState = this.assertPublicLinkAccess(participant.id, participant.organizationId, token);

    if (participant.status === SignatureParticipantStatus.SIGNED) {
      return {
        participant,
        artifactCaptured: false,
      };
    }

    this.validateSignaturePayload(dto);

    if (participant.signatureRequest.signingOrderRequired) {
      const blocking = participant.signatureRequest.participants.some(
        (p) => p.signingOrder < participant.signingOrder && p.status !== SignatureParticipantStatus.SIGNED,
      );
      if (blocking) {
        throw new BadRequestException('Previous signers must complete first');
      }
    }

    const originLocale = this.extractOriginLocale(participant.signatureRequest.events[0]?.payload);
    const signerLocale =
      this.normalizeLocaleTag(capture.localeHint) ?? this.normalizeLocaleTag(dto.signerLocale) ?? undefined;
    const localeBinding = this.validateLocaleBinding(originLocale, signerLocale);

    const signatureData = dto.drawnSignatureDataUrl?.trim();
    const typedFullName = dto.typedFullName?.trim() || undefined;
    const consentText = dto.consentText.trim();
    const signatureDigest = signatureData ? this.sha256Hex(signatureData) : undefined;

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.signatureParticipant.update({
        where: { id: participant.id },
        data: {
          status: SignatureParticipantStatus.SIGNED,
          signedAt: new Date(),
          consentText,
          ipAddress: capture.ipAddress,
          userAgent: capture.userAgent,
        },
      });

      await tx.signatureEvent.create({
        data: {
          organizationId: participant.organizationId,
          signatureRequestId: participant.signatureRequestId,
          eventType: 'PARTICIPANT_SIGNED',
          payload: {
            participantId: participant.id,
            personId: participant.personId,
            signatureType: dto.signatureType,
            typedFullName: typedFullName ?? null,
            drawnSignatureDataUrl: signatureData ?? null,
            drawnSignatureSha256: signatureDigest ?? null,
            consentText,
            signerDevice: dto.signerDevice ?? null,
            signerTimezone: dto.signerTimezone ?? null,
            signerLocale: signerLocale ?? null,
            originLocale: localeBinding.originLocale ?? null,
            localeMatch: localeBinding.matched,
            localeBindingReason: localeBinding.reason,
            ipAddress: capture.ipAddress ?? null,
            userAgent: capture.userAgent ?? null,
            accessMode: 'public-link',
            linkTokenExpiresAt: tokenState.expiresAt?.toISOString() ?? null,
            signedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });

      const allSigned = await tx.signatureParticipant.count({
        where: {
          signatureRequestId: participant.signatureRequestId,
          status: SignatureParticipantStatus.SIGNED,
        },
      });

      const total = participant.signatureRequest.participants.length;
      const nextStatus =
        allSigned >= total ? SignatureRequestStatus.SIGNED : SignatureRequestStatus.PARTIALLY_SIGNED;

      await tx.signatureRequest.update({
        where: { id: participant.signatureRequestId },
        data: {
          status: nextStatus,
        },
      });

      return {
        participant: updated,
        requestStatus: nextStatus,
      };
    });

    if (result.requestStatus !== SignatureRequestStatus.SIGNED) {
      return {
        participant: result.participant,
        artifactCaptured: false,
      };
    }

    const captured = await this.captureSignedArtifact({
      organizationId: participant.organizationId,
      signatureRequestId: participant.signatureRequestId,
      actorUserId: undefined,
    });

    return {
      participant: result.participant,
      artifactCaptured: captured.captured,
      signedDocumentVersionId: captured.documentVersionId,
      signedCopyEmails: captured.signedCopyEmails,
    };
  }

  async declineMySignature(
    actor: AuthenticatedUser,
    participantId: string,
    dto: DeclineNativeSignatureDto,
    capture: SignatureCaptureContext = {},
  ) {
    if (!actor.personId) {
      throw new ForbiddenException('Only person-linked users can decline');
    }

    const participant = await this.prisma.signatureParticipant.findFirst({
      where: {
        id: participantId,
        organizationId: actor.organizationId,
        personId: actor.personId,
      },
    });

    if (!participant) {
      throw new ForbiddenException('Participant access denied');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.signatureParticipant.update({
        where: { id: participant.id },
        data: {
          status: SignatureParticipantStatus.DECLINED,
          declinedReason: dto.reason,
          ipAddress: capture.ipAddress,
          userAgent: capture.userAgent,
        },
      });

      await tx.signatureRequest.update({
        where: { id: participant.signatureRequestId },
        data: {
          status: SignatureRequestStatus.DECLINED,
        },
      });

      await tx.signatureEvent.create({
        data: {
          organizationId: actor.organizationId,
          signatureRequestId: participant.signatureRequestId,
          eventType: 'PARTICIPANT_DECLINED',
          payload: {
            participantId: participant.id,
            personId: actor.personId,
            reason: dto.reason,
            signerLocale: this.normalizeLocaleTag(capture.localeHint) ?? null,
            ipAddress: capture.ipAddress ?? null,
            userAgent: capture.userAgent ?? null,
          } as Prisma.InputJsonValue,
        },
      });

      return updated;
    });
  }

  async declinePublicSignature(
    participantId: string,
    token: string | undefined,
    dto: DeclineNativeSignatureDto,
    capture: SignatureCaptureContext = {},
  ) {
    const participant = await this.prisma.signatureParticipant.findFirst({
      where: {
        id: participantId,
      },
    });

    if (!participant) {
      throw new NotFoundException('Signature participant not found');
    }

    this.assertPublicLinkAccess(participant.id, participant.organizationId, token);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.signatureParticipant.update({
        where: { id: participant.id },
        data: {
          status: SignatureParticipantStatus.DECLINED,
          declinedReason: dto.reason,
          ipAddress: capture.ipAddress,
          userAgent: capture.userAgent,
        },
      });

      await tx.signatureRequest.update({
        where: { id: participant.signatureRequestId },
        data: {
          status: SignatureRequestStatus.DECLINED,
        },
      });

      await tx.signatureEvent.create({
        data: {
          organizationId: participant.organizationId,
          signatureRequestId: participant.signatureRequestId,
          eventType: 'PARTICIPANT_DECLINED',
          payload: {
            participantId: participant.id,
            personId: participant.personId,
            reason: dto.reason,
            signerLocale: this.normalizeLocaleTag(capture.localeHint) ?? null,
            ipAddress: capture.ipAddress ?? null,
            userAgent: capture.userAgent ?? null,
            accessMode: 'public-link',
          } as Prisma.InputJsonValue,
        },
      });

      return updated;
    });
  }

  private async captureSignedArtifact(input: {
    organizationId: string;
    signatureRequestId: string;
    actorUserId?: string;
  }): Promise<{
    captured: boolean;
    documentVersionId?: string;
    signedCopyEmails?: SignedCopyEmailSummary;
  }> {
    const existing = await this.prisma.signatureEvent.findFirst({
      where: {
        organizationId: input.organizationId,
        signatureRequestId: input.signatureRequestId,
        eventType: 'SIGNED_ARTIFACT_CAPTURED',
      },
      select: { id: true },
    });

    if (existing) {
      return { captured: false, documentVersionId: undefined as string | undefined };
    }

    const signatureRequest = await this.prisma.signatureRequest.findFirst({
      where: {
        id: input.signatureRequestId,
        organizationId: input.organizationId,
      },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            category: true,
          },
        },
        documentVersion: {
          select: {
            id: true,
            storageKey: true,
            sha256: true,
            mimeType: true,
            byteSize: true,
            createdAt: true,
          },
        },
        participants: {
          include: {
            person: {
              select: {
                id: true,
                legalFirstName: true,
                legalLastName: true,
                primaryEmail: true,
                businessEmail: true,
                user: {
                  select: {
                    email: true,
                  },
                },
              },
            },
          },
          orderBy: {
            signingOrder: 'asc',
          },
        },
        events: {
          where: {
            eventType: {
              in: ['REQUEST_CREATED', 'PARTICIPANT_SIGNED'],
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!signatureRequest) {
      throw new NotFoundException('Signature request not found');
    }

    const signatureEvidenceByParticipant = new Map<string, Record<string, unknown>>();
    for (const event of signatureRequest.events) {
      if (event.eventType !== 'PARTICIPANT_SIGNED') {
        continue;
      }

      const payload = this.toObject(event.payload);
      const participantKey = typeof payload.participantId === 'string' ? payload.participantId : undefined;
      if (participantKey) {
        signatureEvidenceByParticipant.set(participantKey, payload);
      }
    }

    const artifactPayload = {
      artifactType: 'ARKIVE_NATIVE_ESIGN_SIGNED_RECORD_V1',
      generatedAt: new Date().toISOString(),
      organizationId: input.organizationId,
      request: {
        id: signatureRequest.id,
        title: signatureRequest.title,
        status: signatureRequest.status,
        signingOrderRequired: signatureRequest.signingOrderRequired,
        expiresAt: signatureRequest.expiresAt?.toISOString() ?? null,
      },
      document: {
        id: signatureRequest.document.id,
        title: signatureRequest.document.title,
        category: signatureRequest.document.category,
      },
      sourceDocumentVersion: {
        id: signatureRequest.documentVersion.id,
        storageKey: signatureRequest.documentVersion.storageKey,
        sha256: signatureRequest.documentVersion.sha256,
        mimeType: signatureRequest.documentVersion.mimeType,
        byteSize: signatureRequest.documentVersion.byteSize,
        createdAt: signatureRequest.documentVersion.createdAt.toISOString(),
      },
      signatures: signatureRequest.participants.map((requestParticipant): ArtifactSignatureRow => {
        const evidence = signatureEvidenceByParticipant.get(requestParticipant.id) ?? {};
        return {
          participantId: requestParticipant.id,
          personId: requestParticipant.personId,
          personName: `${requestParticipant.person.legalFirstName} ${requestParticipant.person.legalLastName}`,
          role: requestParticipant.role,
          signingOrder: requestParticipant.signingOrder,
          status: requestParticipant.status,
          signedAt: requestParticipant.signedAt?.toISOString() ?? null,
          declinedReason: requestParticipant.declinedReason,
          consentText: requestParticipant.consentText,
          ipAddress: requestParticipant.ipAddress,
          userAgent: requestParticipant.userAgent,
          signatureType: this.readString(evidence.signatureType),
          typedFullName: this.readString(evidence.typedFullName),
          drawnSignatureDataUrl: this.readString(evidence.drawnSignatureDataUrl),
          drawnSignatureSha256: this.readString(evidence.drawnSignatureSha256),
          signerLocale: this.readString(evidence.signerLocale),
          originLocale: this.readString(evidence.originLocale),
          localeMatch: this.readBoolean(evidence.localeMatch),
          signerTimezone: this.readString(evidence.signerTimezone),
          signerDevice: this.readString(evidence.signerDevice),
        };
      }),
    };

    const artifactJson = JSON.stringify(artifactPayload, null, 2);
    const artifactUpload = await this.storage.uploadObject(
      input.organizationId,
      'application/json',
      Buffer.from(artifactJson, 'utf8'),
      'signed-artifacts',
    );

    const signedPdfBytes = await this.renderSignedPdf(
      signatureRequest.documentVersion.storageKey,
      signatureRequest.title,
      artifactPayload.signatures,
    );

    const signedDocumentUpload = await this.storage.uploadObject(
      input.organizationId,
      'application/pdf',
      Buffer.from(signedPdfBytes),
      'signed-documents',
    );

    const createdVersion = await this.prisma.$transaction(async (tx) => {
      const latest = await tx.documentVersion.findFirst({
        where: {
          documentId: signatureRequest.documentId,
          organizationId: input.organizationId,
        },
        select: {
          versionNumber: true,
        },
        orderBy: {
          versionNumber: 'desc',
        },
      });

      const nextVersion = (latest?.versionNumber ?? 0) + 1;

      await tx.document.update({
        where: { id: signatureRequest.documentId },
        data: {
          version: nextVersion,
          status: 'ACTIVE',
        },
      });

      const version = await tx.documentVersion.create({
        data: {
          organizationId: input.organizationId,
          documentId: signatureRequest.documentId,
          versionNumber: nextVersion,
          storageKey: signedDocumentUpload.key,
          sha256: signedDocumentUpload.sha256,
          mimeType: 'application/pdf',
          byteSize: signedDocumentUpload.byteSize,
          createdByUserId: input.actorUserId ?? null,
        },
      });

      await tx.signatureEvent.create({
        data: {
          organizationId: input.organizationId,
          signatureRequestId: input.signatureRequestId,
          eventType: 'SIGNED_ARTIFACT_CAPTURED',
          payload: {
            documentVersionId: version.id,
            signedDocumentStorageKey: signedDocumentUpload.key,
            signedDocumentSha256: signedDocumentUpload.sha256,
            signedDocumentByteSize: signedDocumentUpload.byteSize,
            artifactStorageKey: artifactUpload.key,
            artifactSha256: artifactUpload.sha256,
            artifactByteSize: artifactUpload.byteSize,
            capturedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });

      return version;
    });

    const signedCopyEmails = await this.sendSignedCopyEmails({
      organizationId: input.organizationId,
      title: signatureRequest.title,
      participants: signatureRequest.participants.map((participant) => ({
        participantId: participant.id,
        personId: participant.personId,
        legalFirstName: participant.person.legalFirstName,
        legalLastName: participant.person.legalLastName,
        primaryEmail: participant.person.primaryEmail,
        businessEmail: participant.person.businessEmail,
        userEmail: participant.person.user?.email,
      })),
      signedPdfBytes,
    });

    await this.prisma.signatureEvent.create({
      data: {
        organizationId: input.organizationId,
        signatureRequestId: input.signatureRequestId,
        eventType: 'SIGNED_COPY_EMAILS_SENT',
        payload: signedCopyEmails as Prisma.InputJsonValue,
      },
    });

    return {
      captured: true,
      documentVersionId: createdVersion.id,
      signedCopyEmails,
    };
  }

  private async renderSignedPdf(
    sourceStorageKey: string,
    requestTitle: string,
    signatures: ArtifactSignatureRow[],
  ): Promise<Uint8Array> {
    let pdf: PDFDocument;
    try {
      const sourceBytes = await this.storage.downloadObject(sourceStorageKey);
      pdf = await PDFDocument.load(sourceBytes);
    } catch {
      pdf = await PDFDocument.create();
      pdf.addPage([612, 792]);
    }

    const pageWidth = 612;
    const pageHeight = 792;
    const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
    const scriptFont = await pdf.embedFont(StandardFonts.HelveticaOblique);

    let page = pdf.addPage([pageWidth, pageHeight]);
    let y = pageHeight - 64;

    const drawHeading = () => {
      page.drawText('Signature Certificate', {
        x: 48,
        y,
        size: 20,
        font: boldFont,
        color: rgb(0.06, 0.09, 0.16),
      });
      y -= 28;
      page.drawText(`Document: ${requestTitle}`, {
        x: 48,
        y,
        size: 11,
        font: regularFont,
        color: rgb(0.22, 0.25, 0.3),
      });
      y -= 16;
      page.drawText(`Generated: ${new Date().toISOString()}`, {
        x: 48,
        y,
        size: 10,
        font: regularFont,
        color: rgb(0.35, 0.39, 0.45),
      });
      y -= 28;
    };

    drawHeading();

    const rows = [...signatures].sort((a, b) => a.signingOrder - b.signingOrder);
    for (const signer of rows) {
      if (y < 160) {
        page = pdf.addPage([pageWidth, pageHeight]);
        y = pageHeight - 64;
        drawHeading();
      }

      page.drawRectangle({
        x: 44,
        y: y - 96,
        width: pageWidth - 88,
        height: 104,
        borderWidth: 1,
        borderColor: rgb(0.85, 0.88, 0.92),
      });

      page.drawText(`${signer.signingOrder}. ${signer.personName} (${signer.role})`, {
        x: 56,
        y: y - 18,
        size: 12,
        font: boldFont,
        color: rgb(0.06, 0.09, 0.16),
      });

      const signedAtText = signer.signedAt ? new Date(signer.signedAt).toLocaleString() : 'Pending';
      page.drawText(`Signed At: ${signedAtText}`, {
        x: 56,
        y: y - 34,
        size: 9,
        font: regularFont,
        color: rgb(0.3, 0.34, 0.4),
      });
      page.drawText(`IP: ${signer.ipAddress ?? 'N/A'}  Locale: ${signer.signerLocale ?? 'N/A'}`, {
        x: 56,
        y: y - 46,
        size: 9,
        font: regularFont,
        color: rgb(0.3, 0.34, 0.4),
      });

      const decodedDrawn = signer.drawnSignatureDataUrl
        ? this.decodeImageDataUrl(signer.drawnSignatureDataUrl)
        : null;
      if (decodedDrawn) {
        const image = decodedDrawn.mimeType.includes('jpeg') || decodedDrawn.mimeType.includes('jpg')
          ? await pdf.embedJpg(decodedDrawn.bytes)
          : await pdf.embedPng(decodedDrawn.bytes);
        const scaled = image.scale(1);
        const maxWidth = 220;
        const maxHeight = 52;
        const widthRatio = maxWidth / scaled.width;
        const heightRatio = maxHeight / scaled.height;
        const ratio = Math.min(widthRatio, heightRatio, 1);

        page.drawImage(image, {
          x: 56,
          y: y - 88,
          width: Math.max(1, scaled.width * ratio),
          height: Math.max(1, scaled.height * ratio),
        });
      } else {
        const typed = signer.typedFullName ?? signer.personName;
        page.drawText(`/s/ ${typed}`, {
          x: 56,
          y: y - 78,
          size: 17,
          font: scriptFont,
          color: rgb(0.06, 0.09, 0.16),
        });
      }

      y -= 116;
    }

    return pdf.save();
  }

  private decodeImageDataUrl(dataUrl: string): { mimeType: string; bytes: Uint8Array } | null {
    const matched = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(dataUrl.trim());
    if (!matched) {
      return null;
    }

    const mimeType = matched[1];
    const base64Body = matched[2];
    if (!mimeType || !base64Body) {
      return null;
    }

    try {
      return {
        mimeType: mimeType.toLowerCase(),
        bytes: Buffer.from(base64Body, 'base64'),
      };
    } catch {
      return null;
    }
  }

  private async sendSignedCopyEmails(input: {
    organizationId: string;
    title: string;
    participants: Array<{
      participantId: string;
      personId: string;
      legalFirstName: string;
      legalLastName: string;
      primaryEmail: string | null;
      businessEmail: string | null;
      userEmail: string | null | undefined;
    }>;
    signedPdfBytes: Uint8Array;
  }): Promise<SignedCopyEmailSummary> {
    const sesSetting = await this.prisma.systemSetting.findFirst({
      where: {
        organizationId: input.organizationId,
        section: 'integrations',
        key: 'awsSes',
      },
      select: {
        value: true,
      },
    });

    const sesConfig = this.parseSettingObject(sesSetting?.value);
    const fromEmail = this.asNonEmptyString(sesConfig.fromEmail);
    const replyToEmail = this.asNonEmptyString(sesConfig.replyToEmail);
    const region =
      this.asNonEmptyString(sesConfig.region) ??
      this.asNonEmptyString(process.env.AWS_REGION) ??
      this.asNonEmptyString(process.env.S3_REGION) ??
      'us-east-1';
    const accessKeyId =
      this.asNonEmptyString(sesConfig.accessKeyId) ?? this.asNonEmptyString(process.env.AWS_ACCESS_KEY_ID);
    const secretAccessKey =
      this.asNonEmptyString(sesConfig.secretAccessKey) ??
      this.asNonEmptyString(process.env.AWS_SECRET_ACCESS_KEY);

    const recipients = input.participants.map((participant) => ({
      participantId: participant.participantId,
      personId: participant.personId,
      personName: `${participant.legalFirstName} ${participant.legalLastName}`.trim(),
      email: this.resolveParticipantEmail(participant.primaryEmail, participant.businessEmail, participant.userEmail),
    }));

    if (!fromEmail) {
      return {
        total: recipients.length,
        sent: 0,
        failed: recipients.length,
        results: recipients.map((recipient) => ({
          participantId: recipient.participantId,
          personId: recipient.personId,
          email: recipient.email,
          status: 'FAILED' as const,
          reason: 'AWS SES fromEmail is not configured',
        })),
      };
    }

    const ses = new SESClient({
      region,
      credentials:
        accessKeyId && secretAccessKey
          ? {
              accessKeyId,
              secretAccessKey,
            }
          : undefined,
    });

    const fileNameBase = this.sanitizeFileName(input.title) || 'signed-document';
    const attachmentName = `${fileNameBase}.pdf`;
    const completed: SignedCopyEmailSummary['results'] = [];

    for (const recipient of recipients) {
      if (!recipient.email) {
        completed.push({
          participantId: recipient.participantId,
          personId: recipient.personId,
          status: 'FAILED',
          reason: 'No email found for participant',
        });
        continue;
      }

      const textBody = [
        `Hello ${recipient.personName || 'there'},`,
        '',
        `Your signature request "${input.title}" is fully executed.`,
        'A signed PDF copy is attached to this email.',
      ].join('\n');

      const rawMessage = this.buildSignedCopyRawEmail({
        fromEmail,
        toEmail: recipient.email,
        replyToEmail,
        subject: `Signed copy: ${input.title}`,
        textBody,
        attachmentName,
        attachmentMimeType: 'application/pdf',
        attachmentBytes: input.signedPdfBytes,
      });

      try {
        await ses.send(
          new SendRawEmailCommand({
            RawMessage: {
              Data: Buffer.from(rawMessage, 'utf8'),
            },
          }),
        );

        completed.push({
          participantId: recipient.participantId,
          personId: recipient.personId,
          email: recipient.email,
          status: 'SENT',
        });
      } catch (error) {
        completed.push({
          participantId: recipient.participantId,
          personId: recipient.personId,
          email: recipient.email,
          status: 'FAILED',
          reason: error instanceof Error ? error.message : 'Unknown SES error',
        });
      }
    }

    const sent = completed.filter((row) => row.status === 'SENT').length;
    return {
      total: completed.length,
      sent,
      failed: completed.length - sent,
      results: completed,
    };
  }

  private buildSignedCopyRawEmail(input: {
    fromEmail: string;
    toEmail: string;
    replyToEmail?: string;
    subject: string;
    textBody: string;
    attachmentName: string;
    attachmentMimeType: string;
    attachmentBytes: Uint8Array;
  }): string {
    const boundary = `NextPart_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const safeFrom = this.sanitizeHeaderValue(input.fromEmail);
    const safeTo = this.sanitizeHeaderValue(input.toEmail);
    const safeSubject = this.sanitizeHeaderValue(input.subject);
    const safeReplyTo = input.replyToEmail ? this.sanitizeHeaderValue(input.replyToEmail) : undefined;
    const safeAttachmentName = this.sanitizeHeaderValue(input.attachmentName);

    const lines = [
      `From: ${safeFrom}`,
      `To: ${safeTo}`,
      `Subject: ${safeSubject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 7bit',
      '',
      input.textBody,
      '',
      `--${boundary}`,
      `Content-Type: ${input.attachmentMimeType}; name="${safeAttachmentName}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${safeAttachmentName}"`,
      '',
      this.toBase64Lines(Buffer.from(input.attachmentBytes).toString('base64')),
      `--${boundary}--`,
      '',
    ];

    if (safeReplyTo) {
      lines.splice(3, 0, `Reply-To: ${safeReplyTo}`);
    }

    return lines.join('\r\n');
  }

  private toBase64Lines(base64Value: string): string {
    const wrapped = base64Value.match(/.{1,76}/g) ?? [];
    return wrapped.join('\r\n');
  }

  private sanitizeHeaderValue(value: string): string {
    return value.replace(/[\r\n]+/g, ' ').trim();
  }

  private sanitizeFileName(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 72);
  }

  private resolveParticipantEmail(
    primaryEmail: string | null,
    businessEmail: string | null,
    userEmail: string | null | undefined,
  ): string | undefined {
    return (
      this.asNonEmptyString(primaryEmail) ??
      this.asNonEmptyString(businessEmail) ??
      this.asNonEmptyString(userEmail)
    );
  }

  private parseSettingObject(value: unknown): Record<string, unknown> {
    if (typeof value === 'object' && value) {
      return value as Record<string, unknown>;
    }
    return {};
  }

  private asNonEmptyString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim();
    return normalized || undefined;
  }

  private assertPublicLinkAccess(
    participantId: string,
    organizationId: string,
    token: string | undefined,
  ): { valid: boolean; expiresAt?: Date } {
    const tokenCheck = verifySignerLinkToken(token, {
      participantId,
      organizationId,
    });

    if (!tokenCheck.valid) {
      throw new ForbiddenException('Invalid or expired signing link');
    }

    return {
      valid: true,
      expiresAt: tokenCheck.expiresAt,
    };
  }

  private validateSignaturePayload(dto: CompleteNativeSignatureDto) {
    const consent = dto.consentText.trim();
    if (!consent) {
      throw new BadRequestException('Consent text is required');
    }

    if (dto.signatureType === 'TYPED') {
      const typedName = dto.typedFullName?.trim();
      if (!typedName) {
        throw new BadRequestException('Typed full name is required for typed signatures');
      }
      return;
    }

    const dataUrl = dto.drawnSignatureDataUrl?.trim();
    if (!dataUrl || !dataUrl.startsWith('data:image/')) {
      throw new BadRequestException('Drawn signature data must be a valid image data URL');
    }
  }

  private extractOriginLocale(payload: Prisma.JsonValue | null | undefined): string | undefined {
    const parsed = this.toObject(payload);
    return this.normalizeLocaleTag(this.readString(parsed.originLocale) ?? undefined);
  }

  private validateLocaleBinding(originLocale?: string, signerLocale?: string): LocaleBindingResult {
    if (!originLocale || !signerLocale) {
      return {
        matched: true,
        reason: 'insufficient-locale-signal',
        originLocale,
        signerLocale,
      };
    }

    const originCountry = this.toCountryCode(originLocale);
    const signerCountry = this.toCountryCode(signerLocale);

    if (originCountry && signerCountry && originCountry !== signerCountry) {
      return {
        matched: false,
        reason: `country-mismatch:${originCountry}:${signerCountry}`,
        originLocale,
        signerLocale,
      };
    }

    return {
      matched: true,
      reason: originCountry && signerCountry ? 'country-match' : 'partial-locale-match',
      originLocale,
      signerLocale,
    };
  }

  private normalizeLocaleTag(input?: string): string | undefined {
    if (!input) {
      return undefined;
    }

    const value = input.trim().replace(/_/g, '-');
    if (!value) {
      return undefined;
    }

    return value.slice(0, 40);
  }

  private toCountryCode(input: string): string | undefined {
    const cleaned = input.trim();
    if (!cleaned) {
      return undefined;
    }

    if (/^[A-Za-z]{2}$/.test(cleaned)) {
      return cleaned.toUpperCase();
    }

    const parts = cleaned.split('-');
    const maybeCountry = parts.length > 1 ? parts[0] : undefined;
    if (maybeCountry && /^[A-Za-z]{2}$/.test(maybeCountry)) {
      return maybeCountry.toUpperCase();
    }

    return undefined;
  }

  private toObject(payload: Prisma.JsonValue | null | undefined): Record<string, unknown> {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return {};
    }

    return payload as Record<string, unknown>;
  }

  private readString(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
  }

  private readBoolean(value: unknown): boolean | null {
    return typeof value === 'boolean' ? value : null;
  }

  private sha256Hex(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
