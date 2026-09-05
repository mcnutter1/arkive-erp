import { Injectable } from '@nestjs/common';
import { SharePermission } from '@prisma/client';

import { AuthenticatedUser } from '../auth/auth.types.js';
import { PrismaService } from '../common/prisma.service.js';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  private hasPermission(actor: AuthenticatedUser, permission: string): boolean {
    return actor.permissions.includes('*') || actor.permissions.includes(permission);
  }

  async globalSearch(actor: AuthenticatedUser, q: string) {
    const query = q.trim();
    if (query.length < 2) {
      return { people: [], documents: [], grants: [], rounds: [] };
    }

    let sharedDocumentIds: string[] = [];
    const canReadAllDocuments = this.hasPermission(actor, 'documents.read');
    if (!canReadAllDocuments && actor.personId) {
      const now = new Date();
      const shares = await this.prisma.recordShare.findMany({
        where: {
          organizationId: actor.organizationId,
          resourceType: 'DOCUMENT',
          personId: actor.personId,
          permission: {
            in: [SharePermission.READ, SharePermission.WRITE],
          },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: {
          resourceId: true,
        },
      });
      sharedDocumentIds = shares.map((share) => share.resourceId);
    }

    const documentAccessFilter = canReadAllDocuments
      ? undefined
      : actor.personId
        ? {
            OR: [
              { personId: actor.personId },
              ...(sharedDocumentIds.length > 0 ? [{ id: { in: sharedDocumentIds } }] : []),
            ],
          }
        : {
            id: '__NO_ACCESS__',
          };

    const [people, documents, grants, rounds] = await Promise.all([
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
          archivedAt: null,
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { category: { contains: query, mode: 'insensitive' } },
          ],
          ...(documentAccessFilter ? { AND: [documentAccessFilter] } : {}),
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
