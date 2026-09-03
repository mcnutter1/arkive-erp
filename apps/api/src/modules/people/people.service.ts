import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../common/prisma.service.js';
import { PaginatedResponse } from '../common/paginated-response.js';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { CreateEngagementDto, CreatePersonDto, PeopleQueryDto } from './dto.js';

@Injectable()
export class PeopleService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizePrismaError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
      throw new ServiceUnavailableException(
        'Database schema is not initialized. Run scripts/update.sh to apply schema.',
      );
    }

    throw error;
  }

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
    let total: number;
    let data: { id: string; legalFirstName: string; legalLastName: string; primaryEmail: string | null }[];

    try {
      [total, data] = await this.prisma.$transaction([
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
    } catch (error) {
      this.normalizePrismaError(error);
    }

    return {
      data,
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async createPerson(actor: AuthenticatedUser, dto: CreatePersonDto) {
    try {
      return await this.prisma.person.create({
        data: {
          organizationId: actor.organizationId,
          legalFirstName: dto.legalFirstName,
          legalLastName: dto.legalLastName,
          preferredName: dto.preferredName,
          primaryEmail: dto.primaryEmail,
          timezone: dto.timezone ?? 'UTC',
        },
      });
    } catch (error) {
      this.normalizePrismaError(error);
    }
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
