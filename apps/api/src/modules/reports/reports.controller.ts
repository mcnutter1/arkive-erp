import { Controller, Get, Header, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { RequirePermissions } from '../authorization/permissions.decorator.js';
import { PermissionsGuard } from '../authorization/permissions.guard.js';
import { ReportsService } from './reports.service.js';

@Controller({ path: 'reports', version: '1' })
@UseGuards(AuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('cap-table-summary')
  @RequirePermissions('reports.read')
  capTableSummary(@CurrentUser() actor: AuthenticatedUser) {
    return this.reportsService.capTableSummary(actor);
  }

  @Get('people-roster.csv')
  @RequirePermissions('reports.export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async peopleRosterCsv(@CurrentUser() actor: AuthenticatedUser): Promise<string> {
    return this.reportsService.peopleRosterCsv(actor);
  }

  @Get('equity-ledger.csv')
  @RequirePermissions('reports.export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async equityLedgerCsv(@CurrentUser() actor: AuthenticatedUser): Promise<string> {
    return this.reportsService.equityLedgerCsv(actor);
  }
}
