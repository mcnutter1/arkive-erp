import { createHash } from 'node:crypto';

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AuthenticatedUser } from '../auth/auth.types.js';
import { AccessPolicyService } from '../authorization/access-policy.service.js';
import { PrismaService } from '../common/prisma.service.js';
import { StorageService } from '../documents/storage.service.js';
import {
  CompleteNativeSignatureDto,
  CreateNativeSignatureRequestDto,
  DeclineNativeSignatureDto,
} from './dto.js';

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

    const captured = await this.captureSignedArtifact(actor, participant.signatureRequestId);
    return {
      participant: result.participant,
      artifactCaptured: captured.captured,
      signedDocumentVersionId: captured.documentVersionId,
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

  private async captureSignedArtifact(actor: AuthenticatedUser, signatureRequestId: string) {
    const existing = await this.prisma.signatureEvent.findFirst({
      where: {
        organizationId: actor.organizationId,
        signatureRequestId,
        eventType: 'SIGNED_ARTIFACT_CAPTURED',
      },
      select: { id: true },
    });

    if (existing) {
      return { captured: false, documentVersionId: undefined as string | undefined };
    }

    const signatureRequest = await this.prisma.signatureRequest.findFirst({
      where: {
        id: signatureRequestId,
        organizationId: actor.organizationId,
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
      organizationId: actor.organizationId,
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
      signatures: signatureRequest.participants.map((requestParticipant) => {
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
    const uploaded = await this.storage.uploadObject(
      actor.organizationId,
      'application/json',
      Buffer.from(artifactJson, 'utf8'),
      'signed-artifacts',
    );

    const createdVersion = await this.prisma.$transaction(async (tx) => {
      const latest = await tx.documentVersion.findFirst({
        where: {
          documentId: signatureRequest.documentId,
          organizationId: actor.organizationId,
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
          organizationId: actor.organizationId,
          documentId: signatureRequest.documentId,
          versionNumber: nextVersion,
          storageKey: uploaded.key,
          sha256: uploaded.sha256,
          mimeType: 'application/json',
          byteSize: uploaded.byteSize,
          createdByUserId: actor.id,
        },
      });

      await tx.signatureEvent.create({
        data: {
          organizationId: actor.organizationId,
          signatureRequestId,
          eventType: 'SIGNED_ARTIFACT_CAPTURED',
          payload: {
            documentVersionId: version.id,
            storageKey: uploaded.key,
            sha256: uploaded.sha256,
            byteSize: uploaded.byteSize,
            capturedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });

      return version;
    });

    return { captured: true, documentVersionId: createdVersion.id };
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
