import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { RequirePermissions } from '../authorization/permissions.decorator.js';
import { PermissionsGuard } from '../authorization/permissions.guard.js';
import { UpsertSettingDto } from './dto.js';
import { AdminService } from './admin.service.js';

@Controller({ path: 'admin', version: '1' })
@UseGuards(AuthGuard, PermissionsGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('settings/:section')
  @RequirePermissions('admin.settings.read')
  listSection(@CurrentUser() actor: AuthenticatedUser, @Param('section') section: string) {
    return this.adminService.listSection(actor, section);
  }

  @Post('settings')
  @RequirePermissions('admin.settings.write')
  upsertSetting(@CurrentUser() actor: AuthenticatedUser, @Body() dto: UpsertSettingDto) {
    return this.adminService.upsertSetting(actor, dto);
  }
}
