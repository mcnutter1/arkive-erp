import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import { PermissionsGuard } from './permissions.guard.js';

describe('PermissionsGuard', () => {
  it('allows request when no permissions are required', () => {
    const guard = new PermissionsGuard({ getAllAndOverride: () => undefined } as Reflector);
    const result = guard.canActivate({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({}) }),
    } as never);
    expect(result).toBe(true);
  });

  it('throws when permission is missing', () => {
    const guard = new PermissionsGuard({ getAllAndOverride: () => ['system.read'] } as Reflector);
    expect(() =>
      guard.canActivate({
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({ getRequest: () => ({ user: { permissions: [] } }) }),
      } as never),
    ).toThrow(ForbiddenException);
  });
});
