import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../common/prisma.service.js';
import { PaginatedResponse } from '../common/paginated-response.js';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { CreateEngagementDto, CreatePersonDto, PeopleQueryDto, UpdatePersonDto } from './dto.js';

@Injectable()
export class PeopleService {
  constructor(private readonly prisma: PrismaService) {}

  private parseOptionalDate(value: string | undefined, fieldName: string): Date | undefined {
    const normalized = value?.trim();
    if (!normalized) {
      return undefined;
    }

    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid ${fieldName}`);
    }

    return parsed;
  }

  private normalizePrismaError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
      throw new ServiceUnavailableException(
        'Database schema is not initialized. Run scripts/update.sh to apply schema.',
      );
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      throw new BadRequestException('Engagement references an invalid person or related record');
    }

    throw error;
  }

  async listPeople(
    actor: AuthenticatedUser,
    query: PeopleQueryDto,
  ): Promise<
    PaginatedResponse<{
      id: string;
      legalFirstName: string;
      legalLastName: string;
      preferredName: string | null;
      primaryEmail: string | null;
      businessEmail: string | null;
      timezone: string;
      classification: string | null;
      employmentStatus: string | null;
      hrisProfile: Prisma.JsonValue | null;
    }>
  > {
    const where: Prisma.PersonWhereInput = {
      organizationId: actor.organizationId,
      archivedAt: null,
      ...(query.search
        ? {
            OR: [
              { legalFirstName: { contains: query.search, mode: 'insensitive' } },
              { legalLastName: { contains: query.search, mode: 'insensitive' } },
              { preferredName: { contains: query.search, mode: 'insensitive' } },
              { primaryEmail: { contains: query.search, mode: 'insensitive' } },
              { businessEmail: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const skip = (query.page - 1) * query.pageSize;
    let total: number;
    let data: {
      id: string;
      legalFirstName: string;
      legalLastName: string;
      preferredName: string | null;
      primaryEmail: string | null;
      businessEmail: string | null;
      timezone: string;
      classification: string | null;
      employmentStatus: string | null;
      hrisProfile: Prisma.JsonValue | null;
    }[];

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
            preferredName: true,
            primaryEmail: true,
            businessEmail: true,
            timezone: true,
            classification: true,
            employmentStatus: true,
            hrisProfile: true,
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
          businessEmail: dto.businessEmail,
          timezone: dto.timezone ?? 'UTC',
          classification: dto.classification,
          employmentStatus: dto.employmentStatus,
          hrisProfile: dto.hrisProfile
            ? (dto.hrisProfile as unknown as Prisma.InputJsonValue)
            : undefined,
        },
      });
    } catch (error) {
      this.normalizePrismaError(error);
    }
  }

  async updatePerson(actor: AuthenticatedUser, personId: string, dto: UpdatePersonDto) {
    const existing = await this.prisma.person.findFirst({
      where: {
        id: personId,
        organizationId: actor.organizationId,
        archivedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Person not found for this organization');
    }

    try {
      const hrisProfileUpdate = dto.hrisProfile
        ? (dto.hrisProfile as unknown as Prisma.InputJsonValue)
        : dto.hrisProfile === undefined
          ? undefined
          : Prisma.JsonNull;

      return await this.prisma.person.update({
        where: {
          id: personId,
        },
        data: {
          legalFirstName: dto.legalFirstName.trim(),
          legalLastName: dto.legalLastName.trim(),
          preferredName: dto.preferredName?.trim() || null,
          primaryEmail: dto.primaryEmail?.trim() || null,
          businessEmail: dto.businessEmail?.trim() || null,
          timezone: dto.timezone?.trim() || undefined,
          classification: dto.classification?.trim() || null,
          employmentStatus: dto.employmentStatus?.trim() || null,
          hrisProfile: hrisProfileUpdate,
        },
      });
    } catch (error) {
      this.normalizePrismaError(error);
    }
  }

  async deletePerson(actor: AuthenticatedUser, personId: string) {
    const existing = await this.prisma.person.findFirst({
      where: {
        id: personId,
        organizationId: actor.organizationId,
        archivedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Person not found for this organization');
    }

    const [engagementCount, grantCount, exerciseCount, documentCount, signatureCount, jobCount] =
      await this.prisma.$transaction([
        this.prisma.engagement.count({
          where: {
            organizationId: actor.organizationId,
            personId,
            archivedAt: null,
          },
        }),
        this.prisma.grantAward.count({
          where: {
            organizationId: actor.organizationId,
            personId,
          },
        }),
        this.prisma.exerciseRequest.count({
          where: {
            organizationId: actor.organizationId,
            personId,
          },
        }),
        this.prisma.document.count({
          where: {
            organizationId: actor.organizationId,
            personId,
            archivedAt: null,
          },
        }),
        this.prisma.signatureParticipant.count({
          where: {
            organizationId: actor.organizationId,
            personId,
          },
        }),
        this.prisma.m365ProvisioningJob.count({
          where: {
            organizationId: actor.organizationId,
            personId,
          },
        }),
      ]);

    if (engagementCount > 0 || grantCount > 0 || exerciseCount > 0 || documentCount > 0 || signatureCount > 0 || jobCount > 0) {
      throw new BadRequestException(
        'Person cannot be deleted because related records exist. Archive the person and retain linked history.',
      );
    }

    try {
      await this.prisma.person.update({
        where: {
          id: personId,
        },
        data: {
          archivedAt: new Date(),
        },
      });
    } catch (error) {
      this.normalizePrismaError(error);
    }

    return {
      id: personId,
      archived: true,
    };
  }

  async createEngagement(actor: AuthenticatedUser, dto: CreateEngagementDto) {
    try {
      const person = await this.prisma.person.findFirst({
        where: {
          id: dto.personId,
          organizationId: actor.organizationId,
          archivedAt: null,
        },
        select: {
          id: true,
        },
      });

      if (!person) {
        throw new NotFoundException('Person not found for this organization');
      }

      const startDate = this.parseOptionalDate(dto.startDate, 'start date');
      const endDate = this.parseOptionalDate(dto.endDate, 'end date');

      if (startDate && endDate && endDate.getTime() < startDate.getTime()) {
        throw new BadRequestException('End date cannot be earlier than start date');
      }

      return await this.prisma.engagement.create({
        data: {
          organizationId: actor.organizationId,
          personId: dto.personId,
          kind: dto.kind,
          status: dto.status ?? 'DRAFT',
          department: dto.department,
          title: dto.title,
          startDate,
          endDate,
        },
      });
    } catch (error) {
      this.normalizePrismaError(error);
    }
  }
}
