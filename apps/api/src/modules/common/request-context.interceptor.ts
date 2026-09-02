import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Observable } from 'rxjs';

import { requestContext } from './request-context.js';

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const incoming = req.headers['x-request-id'];
    const requestId = incoming && incoming.trim().length > 0 ? incoming : randomUUID();

    return requestContext.run({ requestId }, () => next.handle());
  }
}
