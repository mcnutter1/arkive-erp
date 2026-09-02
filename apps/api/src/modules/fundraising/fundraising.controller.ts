import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { RequirePermissions } from '../authorization/permissions.decorator.js';
import { PermissionsGuard } from '../authorization/permissions.guard.js';
import { CreateRoundDto } from './dto.js';
import { FundraisingService } from './fundraising.service.js';

@Controller({ path: 'fundraising', version: '1' })
@UseGuards(AuthGuard, PermissionsGuard)
export class FundraisingController {
  constructor(private readonly fundraisingService: FundraisingService) {}

  @Get('rounds')
  @RequirePermissions('fundraising.read')
  listRounds(@CurrentUser() actor: AuthenticatedUser) {
    return this.fundraisingService.listRounds(actor);
  }

  @Post('rounds')
  @RequirePermissions('fundraising.write')
  createRound(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateRoundDto) {
    return this.fundraisingService.createRound(actor, dto);
  }
}
