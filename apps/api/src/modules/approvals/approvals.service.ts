import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { AuthenticatedUser } from '../auth/auth.types.js';
import { PrismaService } from '../common/prisma.service.js';
import { ApprovalDecisionDto, CreateApprovalRequestDto } from './dto.js';

@Injectable()
export class ApprovalsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthenticatedUser) {
    return this.prisma.approvalRequest.findMany({
      where: {
        organizationId: actor.organizationId,
      },
      include: {
        decisions: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 200,
    });
  }

  async create(actor: AuthenticatedUser, dto: CreateApprovalRequestDto) {
    return this.prisma.approvalRequest.create({
      data: {
        organizationId: actor.organizationId,
        requestType: dto.requestType,
        title: dto.title,
        requiredCount: dto.requiredCount ?? 1,
        status: 'SUBMITTED',
        submittedAt: new Date(),
        createdByUserId: actor.id,
      },
    });
  }

  async decide(actor: AuthenticatedUser, approvalId: string, dto: ApprovalDecisionDto) {
    if (!actor.personId) {
      throw new ForbiddenException('Decision requires person-linked actor');
    }

    const approval = await this.prisma.approvalRequest.findFirst({
      where: {
        id: approvalId,
        organizationId: actor.organizationId,
      },
    });

    if (!approval) {
      throw new NotFoundException('Approval request not found');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.approvalDecision.create({
        data: {
          organizationId: actor.organizationId,
          approvalRequestId: approval.id,
          approverPersonId: actor.personId,
          decision: dto.decision,
          comment: dto.comment,
        },
      });

      const approvedCount = await tx.approvalDecision.count({
        where: {
          approvalRequestId: approval.id,
          decision: 'APPROVED',
        },
      });

      const rejectedCount = await tx.approvalDecision.count({
        where: {
          approvalRequestId: approval.id,
          decision: 'REJECTED',
        },
      });

      let nextStatus: 'SUBMITTED' | 'APPROVED' | 'REJECTED' = 'SUBMITTED';
      if (approvedCount >= approval.requiredCount) {
        nextStatus = 'APPROVED';
      } else if (rejectedCount > 0) {
        nextStatus = 'REJECTED';
      }

      const updated = await tx.approvalRequest.update({
        where: { id: approval.id },
        data: {
          status: nextStatus,
          finalizedAt: nextStatus === 'SUBMITTED' ? null : new Date(),
        },
        include: {
          decisions: true,
        },
      });

      return updated;
    });
  }
}
