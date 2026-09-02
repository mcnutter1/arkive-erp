import { Injectable } from '@nestjs/common';

import { AuthenticatedUser } from '../auth/auth.types.js';
import { PrismaService } from '../common/prisma.service.js';
import { CreateTaskDto } from './dto.js';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async createTask(actor: AuthenticatedUser, dto: CreateTaskDto) {
    let createdByPersonId: string | undefined;
    if (actor.personId) {
      createdByPersonId = actor.personId;
    }

    return this.prisma.task.create({
      data: {
        organizationId: actor.organizationId,
        title: dto.title,
        description: dto.description,
        assigneePersonId: dto.assigneePersonId,
        createdByPersonId,
        dueAt: dto.dueAt,
      },
    });
  }

  async listMyNotifications(actor: AuthenticatedUser) {
    if (!actor.personId) {
      return [];
    }

    return this.prisma.notification.findMany({
      where: {
        organizationId: actor.organizationId,
        personId: actor.personId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 100,
    });
  }
}
