import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

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
  VOIDED: 'VOIDED',
} as const;

import { AuthenticatedUser } from '../auth/auth.types.js';
import { AccessPolicyService } from '../authorization/access-policy.service.js';
import { PrismaService } from '../common/prisma.service.js';
import {
  CompleteNativeSignatureDto,
  CreateNativeSignatureRequestDto,
  DeclineNativeSignatureDto,
} from './dto.js';

@Injectable()
export class SignaturesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async createNativeRequest(actor: AuthenticatedUser, dto: CreateNativeSignatureRequestDto) {
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

  async completeMySignature(
    actor: AuthenticatedUser,
    participantId: string,
    dto: CompleteNativeSignatureDto,
    ipAddress?: string,
    userAgent?: string,
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
          },
        },
      },
    });

    if (!participant || participant.personId !== actor.personId) {
      throw new ForbiddenException('Participant access denied');
    }

    if (participant.status === SignatureParticipantStatus.SIGNED) {
      return participant;
    }

    if (participant.signatureRequest.signingOrderRequired) {
      const blocking = participant.signatureRequest.participants.some(
        (p) => p.signingOrder < participant.signingOrder && p.status !== SignatureParticipantStatus.SIGNED,
      );
      if (blocking) {
        throw new BadRequestException('Previous signers must complete first');
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.signatureParticipant.update({
        where: { id: participant.id },
        data: {
          status: SignatureParticipantStatus.SIGNED,
          signedAt: new Date(),
          consentText: dto.consentText,
          ipAddress,
          userAgent,
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
          },
        },
      });

      const allSigned = await tx.signatureParticipant.count({
        where: {
          signatureRequestId: participant.signatureRequestId,
          status: SignatureParticipantStatus.SIGNED,
        },
      });

      const total = participant.signatureRequest.participants.length;
      await tx.signatureRequest.update({
        where: { id: participant.signatureRequestId },
        data: {
          status:
            allSigned >= total ? SignatureRequestStatus.SIGNED : SignatureRequestStatus.PARTIALLY_SIGNED,
        },
      });

      return updated;
    });

    return result;
  }

  async declineMySignature(
    actor: AuthenticatedUser,
    participantId: string,
    dto: DeclineNativeSignatureDto,
    ipAddress?: string,
    userAgent?: string,
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
          ipAddress,
          userAgent,
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
          },
        },
      });

      return updated;
    });
  }
}
