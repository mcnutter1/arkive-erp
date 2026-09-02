import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../common/prisma.service.js';
import { PaginatedResponse } from '../common/paginated-response.js';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { CreateEngagementDto, CreatePersonDto, PeopleQueryDto } from './dto.js';

@Injectable()
export class PeopleService {
  constructor(private readonly prisma: PrismaService) {}

  async listPeople(
    actor: AuthenticatedUser,
    query: PeopleQueryDto,
  ): Promise<PaginatedResponse<{ id: string; legalFirstName: string; legalLastName: string; primaryEmail: string | null }>> {
    const where: Prisma.PersonWhereInput = {
      organizationId: actor.organizationId,
      archivedAt: null,
      ...(query.search
        ? {
            OR: [
              { legalFirstName: { contains: query.search, mode: 'insensitive' } },
              { legalLastName: { contains: query.search, mode: 'insensitive' } },
              { primaryEmail: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const skip = (query.page - 1) * query.pageSize;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.person.count({ where }),
      this.prisma.person.findMany({
        where,
        orderBy: [{ legalLastName: 'asc' }, { legalFirstName: 'asc' }],
        skip,
        take: query.pageSize,
        select: {
          id: true,
          legalFirstName: true,
          legalLastName: true,
          primaryEmail: true,
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

  async createPerson(actor: AuthenticatedUser, dto: CreatePersonDto) {
    return this.prisma.person.create({
      data: {
        organizationId: actor.organizationId,
        legalFirstName: dto.legalFirstName,
        legalLastName: dto.legalLastName,
        preferredName: dto.preferredName,
        primaryEmail: dto.primaryEmail,
        timezone: dto.timezone ?? 'UTC',
      },
    });
  }

  async createEngagement(actor: AuthenticatedUser, dto: CreateEngagementDto) {
    return this.prisma.engagement.create({
      data: {
        organizationId: actor.organizationId,
        personId: dto.personId,
        kind: dto.kind,
        status: dto.status ?? 'DRAFT',
        department: dto.department,
        title: dto.title,
        startDate: dto.startDate,
        endDate: dto.endDate,
      },
    });
  }
}
