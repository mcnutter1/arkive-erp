import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { RequirePermissions } from '../authorization/permissions.decorator.js';
import { PermissionsGuard } from '../authorization/permissions.guard.js';
import { CreateProvisioningJobDto } from './dto.js';
import { M365Service } from './m365.service.js';

@Controller({ path: 'm365', version: '1' })
@UseGuards(AuthGuard, PermissionsGuard)
export class M365Controller {
  constructor(private readonly m365Service: M365Service) {}

  @Get('jobs')
  @RequirePermissions('m365.read')
  listJobs(@CurrentUser() actor: AuthenticatedUser) {
    return this.m365Service.listJobs(actor);
  }

  @Post('jobs')
  @RequirePermissions('m365.write')
  createJob(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateProvisioningJobDto) {
    return this.m365Service.createJob(actor, dto);
  }
}
