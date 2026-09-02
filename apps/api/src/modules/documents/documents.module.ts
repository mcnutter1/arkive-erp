import { Module } from '@nestjs/common';

import { AccessPolicyService } from '../authorization/access-policy.service.js';
import { PrismaService } from '../common/prisma.service.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { StorageService } from './storage.service.js';

@Module({
  controllers: [DocumentsController],
  providers: [PrismaService, AccessPolicyService, StorageService, DocumentsService],
})
export class DocumentsModule {}
