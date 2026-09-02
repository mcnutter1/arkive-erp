import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { RequirePermissions } from '../authorization/permissions.decorator.js';
import { PermissionsGuard } from '../authorization/permissions.guard.js';
import { CreateEquityTransactionDto } from './dto.js';
import { EquityService } from './equity.service.js';

@Controller({ path: 'equity/ledger', version: '1' })
@UseGuards(AuthGuard, PermissionsGuard)
export class EquityController {
  constructor(private readonly equityService: EquityService) {}

  @Get()
  @RequirePermissions('equity.read')
  listLedger(@CurrentUser() actor: AuthenticatedUser) {
    return this.equityService.listLedger(actor);
  }

  @Post()
  @RequirePermissions('equity.write')
  createTransaction(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateEquityTransactionDto) {
    return this.equityService.createTransaction(actor, dto);
  }
}
