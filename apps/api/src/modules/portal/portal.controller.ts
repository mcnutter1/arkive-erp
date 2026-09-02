import { Controller, Get, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { RequirePermissions } from '../authorization/permissions.decorator.js';
import { PermissionsGuard } from '../authorization/permissions.guard.js';
import { PortalService } from './portal.service.js';

@Controller({ path: 'portal', version: '1' })
@UseGuards(AuthGuard, PermissionsGuard)
export class PortalController {
  constructor(private readonly portalService: PortalService) {}

  @Get('me')
  @RequirePermissions('portal.read.self')
  mySummary(@CurrentUser() actor: AuthenticatedUser) {
    return this.portalService.mySummary(actor);
  }
}
