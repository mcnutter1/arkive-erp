import { Body, Controller, Post, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { PrismaService } from '../common/prisma.service.js';
import { RequirePermissions } from './permissions.decorator.js';
import { PermissionsGuard } from './permissions.guard.js';
import { CreateRecordShareDto } from './record-share.dto.js';

@Controller({ path: 'access', version: '1' })
@UseGuards(AuthGuard, PermissionsGuard)
export class RecordShareController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('shares')
  @RequirePermissions('access.share.write')
  createShare(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateRecordShareDto) {
    return this.prisma.recordShare.create({
      data: {
        organizationId: actor.organizationId,
        resourceType: dto.resourceType,
        resourceId: dto.resourceId,
        personId: dto.personId,
        permission: dto.permission,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        createdByUserId: actor.id,
      },
    });
  }
}
