import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { RequirePermissions } from '../authorization/permissions.decorator.js';
import { PermissionsGuard } from '../authorization/permissions.guard.js';
import { CreateValuationDto } from './dto.js';
import { ValuationsService } from './valuations.service.js';

@Controller({ path: 'valuations', version: '1' })
@UseGuards(AuthGuard, PermissionsGuard)
export class ValuationsController {
  constructor(private readonly valuationsService: ValuationsService) {}

  @Get()
  @RequirePermissions('valuations.read')
  listValuations(@CurrentUser() actor: AuthenticatedUser) {
    return this.valuationsService.listValuations(actor);
  }

  @Post()
  @RequirePermissions('valuations.write')
  createValuation(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateValuationDto) {
    return this.valuationsService.createValuation(actor, dto);
  }
}
