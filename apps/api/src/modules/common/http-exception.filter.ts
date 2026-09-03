import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { requestContext } from './request-context.js';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private extractMessage(payload: unknown, fallback: string): string {
    if (typeof payload === 'string' && payload.trim()) {
      return payload;
    }

    if (payload && typeof payload === 'object') {
      const candidate = (payload as { message?: string | string[] }).message;
      if (Array.isArray(candidate) && candidate.length > 0) {
        return candidate.join(', ');
      }
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate;
      }
    }

    return fallback;
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<{ status: (code: number) => { send: (body: unknown) => void } }>();

    const requestId = requestContext.getStore()?.requestId;

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      response.status(status).send({
        error: {
          code: status,
          message: this.extractMessage(payload, 'Request failed'),
          details: payload,
          requestId,
        },
      });
      return;
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const status =
        exception.code === 'P2021'
          ? HttpStatus.SERVICE_UNAVAILABLE
          : exception.code === 'P2002'
            ? HttpStatus.CONFLICT
            : HttpStatus.BAD_REQUEST;

      const message =
        exception.code === 'P2021'
          ? 'Database schema is not initialized. Run scripts/update.sh to apply schema.'
          : exception.code === 'P2002'
            ? 'A duplicate record violates a uniqueness constraint.'
            : exception.code === 'P2003'
              ? 'A referenced record was not found or violates relation constraints.'
              : 'Database request failed.';

      response.status(status).send({
        error: {
          code: status,
          message,
          details: {
            prismaCode: exception.code,
            meta: exception.meta,
          },
          requestId,
        },
      });
      return;
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
      error: {
        code: 500,
        message: 'Internal server error',
        requestId,
      },
    });
  }
}
