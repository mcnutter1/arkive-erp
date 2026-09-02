import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { AuditResult } from '@prisma/client';
import { Observable, catchError, tap, throwError } from 'rxjs';

import { AuthenticatedUser } from '../auth/auth.types.js';
import { requestContext } from '../common/request-context.js';
import { AuditService } from './audit.service.js';

const mutatingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{
      method: string;
      url: string;
      params: Record<string, string | undefined>;
      ip?: string;
      headers: Record<string, string | undefined>;
      user?: AuthenticatedUser;
    }>();

    if (!mutatingMethods.has(req.method)) {
      return next.handle();
    }

    const orgId = req.user?.organizationId;
    if (!orgId) {
      return next.handle();
    }

    const requestId = requestContext.getStore()?.requestId;
    const targetId = req.params.id;

    return next.handle().pipe(
      tap(async () => {
        await this.auditService.write({
          organizationId: orgId,
          actorUserId: req.user?.id,
          actorType: req.user ? 'USER' : 'SYSTEM',
          action: `${req.method} ${req.url}`,
          targetType: context.getClass().name,
          targetId,
          result: AuditResult.SUCCESS,
          requestId,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });
      }),
      catchError((error: unknown) => {
        void this.auditService.write({
          organizationId: orgId,
          actorUserId: req.user?.id,
          actorType: req.user ? 'USER' : 'SYSTEM',
          action: `${req.method} ${req.url}`,
          targetType: context.getClass().name,
          targetId,
          result: AuditResult.FAILURE,
          requestId,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          metadata: { message: error instanceof Error ? error.message : 'unknown error' },
        });
        return throwError(() => error);
      }),
    );
  }
}
