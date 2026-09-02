import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { RequirePermissions } from '../authorization/permissions.decorator.js';
import { PermissionsGuard } from '../authorization/permissions.guard.js';
import { ApprovalDecisionDto, CreateApprovalRequestDto } from './dto.js';
import { ApprovalsService } from './approvals.service.js';

@Controller({ path: 'approvals', version: '1' })
@UseGuards(AuthGuard, PermissionsGuard)
export class ApprovalsController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  @Get('requests')
  @RequirePermissions('approvals.read')
  list(@CurrentUser() actor: AuthenticatedUser) {
    return this.approvalsService.list(actor);
  }

  @Post('requests')
  @RequirePermissions('approvals.write')
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateApprovalRequestDto) {
    return this.approvalsService.create(actor, dto);
  }

  @Post('requests/:approvalId/decide')
  @RequirePermissions('approvals.approve')
  decide(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('approvalId') approvalId: string,
    @Body() dto: ApprovalDecisionDto,
  ) {
    return this.approvalsService.decide(actor, approvalId, dto);
  }
}
