import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { RequirePermissions } from '../authorization/permissions.decorator.js';
import { PermissionsGuard } from '../authorization/permissions.guard.js';
import { CreateScenarioDto } from './dto.js';
import { FundraisingService } from './fundraising.service.js';

@Controller({ path: 'fundraising/scenarios', version: '1' })
@UseGuards(AuthGuard, PermissionsGuard)
export class FundraisingScenariosController {
  constructor(private readonly service: FundraisingService) {}

  @Get(':roundId')
  @RequirePermissions('scenarios.read')
  list(@CurrentUser() actor: AuthenticatedUser, @Param('roundId') roundId: string) {
    return this.service.listScenarios(actor, roundId);
  }

  @Post(':roundId')
  @RequirePermissions('scenarios.write')
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('roundId') roundId: string,
    @Body() body: CreateScenarioDto,
  ) {
    return this.service.createScenario(actor, roundId, body);
  }

  @Post(':roundId/:scenarioId/simulate')
  @RequirePermissions('scenarios.write')
  simulate(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('roundId') roundId: string,
    @Param('scenarioId') scenarioId: string,
  ) {
    return this.service.simulateScenario(actor, roundId, scenarioId);
  }
}
