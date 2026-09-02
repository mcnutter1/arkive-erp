import { Injectable } from '@nestjs/common';

import { PrismaService } from '../common/prisma.service.js';

type AuditResult = 'SUCCESS' | 'FAILURE';

export type AuditWriteInput = {
  organizationId: string;
  actorUserId?: string;
  actorType: string;
  action: string;
  targetType: string;
  targetId?: string;
  result: AuditResult;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  beforeData?: object;
  afterData?: object;
  metadata?: object;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async write(event: AuditWriteInput): Promise<void> {
    await this.prisma.auditEvent.create({
      data: {
        organizationId: event.organizationId,
        actorUserId: event.actorUserId,
        actorType: event.actorType,
        action: event.action,
        targetType: event.targetType,
        targetId: event.targetId,
        result: event.result,
        requestId: event.requestId,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        beforeData: event.beforeData,
        afterData: event.afterData,
        metadata: event.metadata,
      },
    });
  }
}
