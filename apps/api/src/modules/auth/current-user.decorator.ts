import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { AuthenticatedUser } from './auth.types.js';

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
  return req.user;
});
