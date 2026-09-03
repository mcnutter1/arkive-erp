import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AuthenticatedUser } from '../auth/auth.types.js';
import { PaginatedResponse } from '../common/paginated-response.js';
import { PrismaService } from '../common/prisma.service.js';
import { CreateTaskDto, ListTasksQueryDto } from './dto.js';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async listTasks(
    actor: AuthenticatedUser,
    query: ListTasksQueryDto,
  ): Promise<PaginatedResponse<{ id: string; title: string; description: string | null; status: string; dueAt: Date | null }>> {
    const where: Prisma.TaskWhereInput = {
      organizationId: actor.organizationId,
      archivedAt: null,
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const skip = (query.page - 1) * query.pageSize;

    const [total, data] = await this.prisma.$transaction([
      this.prisma.task.count({ where }),
      this.prisma.task.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip,
        take: query.pageSize,
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          dueAt: true,
        },
      }),
    ]);

    return {
      data,
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

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
