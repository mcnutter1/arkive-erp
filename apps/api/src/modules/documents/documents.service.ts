import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { AuthenticatedUser } from '../auth/auth.types.js';
import { AccessPolicyService } from '../authorization/access-policy.service.js';
import { PrismaService } from '../common/prisma.service.js';
import { CreateDocumentDto, CreateUploadUrlDto, FinalizeDocumentVersionDto } from './dto.js';
import { StorageService } from './storage.service.js';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async createDocument(actor: AuthenticatedUser, dto: CreateDocumentDto) {
    return this.prisma.document.create({
      data: {
        organizationId: actor.organizationId,
        category: dto.category,
        title: dto.title,
        personId: dto.personId,
        engagementId: dto.engagementId,
        status: 'DRAFT',
      },
    });
  }

  async createUploadUrl(actor: AuthenticatedUser, dto: CreateUploadUrlDto) {
    if (!dto.mimeType.includes('/')) {
      throw new BadRequestException('Invalid mime type');
    }
    return this.storage.createUploadUrl(actor.organizationId, dto.mimeType);
  }

  async finalizeVersion(actor: AuthenticatedUser, documentId: string, dto: FinalizeDocumentVersionDto) {
    await this.accessPolicy.assertDocumentWrite(actor, documentId);

    const doc = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        organizationId: actor.organizationId,
        archivedAt: null,
      },
    });

    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    const latest = await this.prisma.documentVersion.findFirst({
      where: { documentId },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true },
    });

    const nextVersion = (latest?.versionNumber ?? 0) + 1;
    return this.prisma.documentVersion.create({
      data: {
        organizationId: actor.organizationId,
        documentId,
        versionNumber: nextVersion,
        storageKey: dto.storageKey,
        sha256: dto.sha256,
        mimeType: dto.mimeType,
        byteSize: dto.byteSize,
        createdByUserId: actor.id,
      },
    });
  }

  async getDownloadUrl(actor: AuthenticatedUser, documentVersionId: string) {
    const version = await this.prisma.documentVersion.findFirst({
      where: {
        id: documentVersionId,
        organizationId: actor.organizationId,
      },
      select: {
        id: true,
        storageKey: true,
        documentId: true,
      },
    });

    if (!version) {
      throw new NotFoundException('Document version not found');
    }

    await this.accessPolicy.assertDocumentRead(actor, version.documentId);

    const url = await this.storage.createDownloadUrl(version.storageKey);
    return { url, expiresInSeconds: 120 };
  }
}
