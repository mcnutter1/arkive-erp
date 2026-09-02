import { Controller, Get, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { RequirePermissions } from '../authorization/permissions.decorator.js';
import { PermissionsGuard } from '../authorization/permissions.guard.js';

@Controller({ path: 'system', version: '1' })
@UseGuards(AuthGuard, PermissionsGuard)
export class SystemController {
  @Get('me')
  @RequirePermissions('system.read')
  getCurrentUser(
    @CurrentUser() user: AuthenticatedUser,
  ): { user: Pick<AuthenticatedUser, 'id' | 'email' | 'organizationId' | 'permissions'> } {
    return {
      user: {
        id: user.id,
        email: user.email,
        organizationId: user.organizationId,
        permissions: user.permissions,
      },
    };
  }
}
