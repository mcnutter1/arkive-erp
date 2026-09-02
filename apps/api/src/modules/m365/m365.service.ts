import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

import { AuthenticatedUser } from '../auth/auth.types.js';
import { PrismaService } from '../common/prisma.service.js';
import { CreateProvisioningJobDto } from './dto.js';

@Injectable()
export class M365Service {
  private readonly queue: Queue;

  constructor(private readonly prisma: PrismaService) {
    const redis = new Redis(process.env.REDIS_URL ?? 'redis://redis:6379', {
      maxRetriesPerRequest: null,
    });
    const queuePrefix = process.env.QUEUE_PREFIX ?? 'arkive';
    const queueName = 'm365';
    this.queue = new Queue(queueName, { connection: redis, prefix: queuePrefix });
  }

  async listJobs(actor: AuthenticatedUser) {
    return this.prisma.m365ProvisioningJob.findMany({
      where: {
        organizationId: actor.organizationId,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async createJob(actor: AuthenticatedUser, dto: CreateProvisioningJobDto) {
    const record = await this.prisma.m365ProvisioningJob.create({
      data: {
        organizationId: actor.organizationId,
        personId: dto.personId,
        engagementId: dto.engagementId,
        operation: dto.operation,
        requestedUsername: dto.requestedUsername,
        requestedEmail: dto.requestedEmail,
        payload: {
          dryRun: (process.env.M365_DRY_RUN ?? 'true') === 'true',
        },
        status: 'QUEUED',
        createdByUserId: actor.id,
      },
    });

    await this.queue.add('m365.lifecycle', { jobId: record.id }, { attempts: 5 });
    return record;
  }
}
