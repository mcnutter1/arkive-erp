import { Injectable } from '@nestjs/common';

import { AuthenticatedUser } from '../auth/auth.types.js';
import { PrismaService } from '../common/prisma.service.js';

@Injectable()
export class PortalService {
  constructor(private readonly prisma: PrismaService) {}

  async mySummary(actor: AuthenticatedUser) {
    if (!actor.personId) {
      return {
        person: null,
        engagements: [],
        pendingSignatures: [],
        tasks: [],
        grants: [],
      };
    }

    const [person, engagements, pendingSignatures, tasks, grants] = await this.prisma.$transaction([
      this.prisma.person.findFirst({
        where: {
          id: actor.personId,
          organizationId: actor.organizationId,
        },
      }),
      this.prisma.engagement.findMany({
        where: {
          personId: actor.personId,
          organizationId: actor.organizationId,
          archivedAt: null,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.signatureParticipant.findMany({
        where: {
          personId: actor.personId,
          organizationId: actor.organizationId,
          status: 'PENDING',
        },
        include: {
          signatureRequest: {
            select: { id: true, title: true, expiresAt: true, status: true },
          },
        },
      }),
      this.prisma.task.findMany({
        where: {
          assigneePersonId: actor.personId,
          organizationId: actor.organizationId,
          archivedAt: null,
        },
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
        take: 50,
      }),
      this.prisma.grantAward.findMany({
        where: {
          personId: actor.personId,
          organizationId: actor.organizationId,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return { person, engagements, pendingSignatures, tasks, grants };
  }
}
