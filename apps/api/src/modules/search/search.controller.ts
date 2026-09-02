import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { RequirePermissions } from '../authorization/permissions.decorator.js';
import { PermissionsGuard } from '../authorization/permissions.guard.js';
import { SearchService } from './search.service.js';

@Controller({ path: 'search', version: '1' })
@UseGuards(AuthGuard, PermissionsGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('global')
  @RequirePermissions('search.read')
  globalSearch(@CurrentUser() actor: AuthenticatedUser, @Query('q') q = '') {
    return this.searchService.globalSearch(actor, q);
  }

  @Get('timeline/:targetType/:targetId')
  @RequirePermissions('search.read')
  activityTimeline(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('targetType') targetType: string,
    @Param('targetId') targetId: string,
  ) {
    return this.searchService.activityTimeline(actor, targetType, targetId);
  }
}
