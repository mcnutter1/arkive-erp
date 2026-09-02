import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { RequirePermissions } from '../authorization/permissions.decorator.js';
import { PermissionsGuard } from '../authorization/permissions.guard.js';
import { CreateDocumentDto, CreateUploadUrlDto, FinalizeDocumentVersionDto } from './dto.js';
import { DocumentsService } from './documents.service.js';

@Controller({ path: 'documents', version: '1' })
@UseGuards(AuthGuard, PermissionsGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  @RequirePermissions('documents.write')
  createDocument(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateDocumentDto) {
    return this.documentsService.createDocument(actor, dto);
  }

  @Post('upload-url')
  @RequirePermissions('documents.write')
  createUploadUrl(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateUploadUrlDto) {
    return this.documentsService.createUploadUrl(actor, dto);
  }

  @Post(':documentId/versions')
  @RequirePermissions('documents.write')
  finalizeVersion(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('documentId') documentId: string,
    @Body() dto: FinalizeDocumentVersionDto,
  ) {
    return this.documentsService.finalizeVersion(actor, documentId, dto);
  }

  @Get('versions/:documentVersionId/download-url')
  @RequirePermissions('documents.read')
  getDownloadUrl(@CurrentUser() actor: AuthenticatedUser, @Param('documentVersionId') documentVersionId: string) {
    return this.documentsService.getDownloadUrl(actor, documentVersionId);
  }
}
