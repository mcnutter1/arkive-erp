import { Injectable } from '@nestjs/common';

import { AuthenticatedUser } from '../auth/auth.types.js';
import { PrismaService } from '../common/prisma.service.js';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async globalSearch(actor: AuthenticatedUser, q: string) {
    const query = q.trim();
    if (query.length < 2) {
      return { people: [], documents: [], grants: [], rounds: [] };
    }

    const [people, documents, grants, rounds] = await this.prisma.$transaction([
      this.prisma.person.findMany({
        where: {
          organizationId: actor.organizationId,
          OR: [
            { legalFirstName: { contains: query, mode: 'insensitive' } },
            { legalLastName: { contains: query, mode: 'insensitive' } },
            { primaryEmail: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: 10,
      }),
      this.prisma.document.findMany({
        where: {
          organizationId: actor.organizationId,
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { category: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: 10,
      }),
      this.prisma.grantAward.findMany({
        where: {
          organizationId: actor.organizationId,
          awardType: { contains: query, mode: 'insensitive' },
        },
        take: 10,
      }),
      this.prisma.fundraisingRound.findMany({
        where: {
          organizationId: actor.organizationId,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { stage: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: 10,
      }),
    ]);

    return { people, documents, grants, rounds };
  }

  async activityTimeline(actor: AuthenticatedUser, targetType: string, targetId: string) {
    return this.prisma.auditEvent.findMany({
      where: {
        organizationId: actor.organizationId,
        targetType,
        targetId,
      },
      orderBy: { occurredAt: 'desc' },
      take: 200,
    });
  }
}
