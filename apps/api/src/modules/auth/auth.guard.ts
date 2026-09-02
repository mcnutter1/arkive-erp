import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { requestContext } from '../common/request-context.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { AuthenticatedUser } from './auth.types.js';
import { AuthService } from './auth.service.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: AuthenticatedUser;
    }>();

    const authHeader = req.headers.authorization ?? '';
    let authUser: AuthenticatedUser | null = null;

    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice('Bearer '.length).trim();
      if (!token) {
        throw new UnauthorizedException('Invalid bearer token');
      }
      authUser = await this.authService.getAuthenticatedUserFromBearer(token);
    } else {
      authUser = await this.authService.getAuthenticatedUserFromCookie(req.headers.cookie);
    }

    if (!authUser) {
      throw new UnauthorizedException('Authentication required');
    }

    req.user = authUser;

    const current = requestContext.getStore();
    if (current) {
      current.actorUserId = authUser.id;
    }

    return true;
  }
}
