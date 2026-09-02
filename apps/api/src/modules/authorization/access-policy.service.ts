import { ForbiddenException, Injectable } from '@nestjs/common';

import { AuthenticatedUser } from '../auth/auth.types.js';
import { PrismaService } from '../common/prisma.service.js';

@Injectable()
export class AccessPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async assertDocumentRead(actor: AuthenticatedUser, documentId: string): Promise<void> {
    const doc = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        organizationId: actor.organizationId,
      },
      select: {
        id: true,
        personId: true,
      },
    });

    if (!doc) {
      throw new ForbiddenException('Document access denied');
    }

    await this.assertDocumentPermission(actor, doc.id, doc.personId, 'READ', 'documents.read');
  }

  async assertDocumentWrite(actor: AuthenticatedUser, documentId: string): Promise<void> {
    const doc = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        organizationId: actor.organizationId,
      },
      select: {
        id: true,
        personId: true,
      },
    });

    if (!doc) {
      throw new ForbiddenException('Document access denied');
    }

    await this.assertDocumentPermission(actor, doc.id, doc.personId, 'WRITE', 'documents.write');
  }

  private async assertDocumentPermission(
    actor: AuthenticatedUser,
    documentId: string,
    ownerPersonId: string | null,
    sharePermission: 'READ' | 'WRITE',
    broadPermission: string,
  ): Promise<void> {
    const broad = actor.permissions.includes(broadPermission);
    const owner = !!actor.personId && ownerPersonId === actor.personId;

    if (broad || owner) {
      return;
    }

    if (!actor.personId) {
      throw new ForbiddenException('Document access denied');
    }

    const now = new Date();
    const share = await this.prisma.recordShare.findFirst({
      where: {
        organizationId: actor.organizationId,
        resourceType: 'DOCUMENT',
        resourceId: documentId,
        personId: actor.personId,
        permission: sharePermission,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });

    if (!share) {
      throw new ForbiddenException('Document access denied');
    }
  }
}
