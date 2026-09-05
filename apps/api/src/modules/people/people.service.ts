import { randomBytes, scryptSync } from 'node:crypto';

import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { RbacService, RBAC_ROLE_CODES } from '../auth/rbac.service.js';
import { PrismaService } from '../common/prisma.service.js';
import { PaginatedResponse } from '../common/paginated-response.js';
import { AuthenticatedUser } from '../auth/auth.types.js';
import {
  CreateEngagementDto,
  CreatePersonDto,
  PeopleQueryDto,
  ResetPersonAccountPasswordDto,
  UpdatePersonDto,
  UpsertPersonAccountDto,
} from './dto.js';

@Injectable()
export class PeopleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  private hashPassword(password: string, salt: string): string {
    return scryptSync(password, salt, 64).toString('hex');
  }

  private normalizeRoleCodes(roleCodes: string[]): string[] {
    return [...new Set(roleCodes.map((code) => code.trim().toUpperCase()).filter((code) => RBAC_ROLE_CODES.includes(code)))];
  }

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

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new BadRequestException('Account email, username, or identity is already linked to another user');
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
      user: {
        id: string;
        email: string;
        status: string;
        microsoftUserId: string | null;
        localUsername: string | null;
        userRoles: Array<{
          role: {
            code: string;
          };
        }>;
      } | null;
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
      user: {
        id: string;
        email: string;
        status: string;
        microsoftUserId: string | null;
        localUsername: string | null;
        userRoles: Array<{
          role: {
            code: string;
          };
        }>;
      } | null;
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
            user: {
              select: {
                id: true,
                email: true,
                status: true,
                microsoftUserId: true,
                localUsername: true,
                userRoles: {
                  where: {
                    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
                  },
                  select: {
                    role: {
                      select: {
                        code: true,
                      },
                    },
                  },
                },
              },
            },
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

  async getPersonAccount(actor: AuthenticatedUser, personId: string) {
    await this.rbac.ensureCatalog(actor.organizationId);

    const [person, roles] = await Promise.all([
      this.prisma.person.findFirst({
        where: {
          id: personId,
          organizationId: actor.organizationId,
          archivedAt: null,
        },
        select: {
          id: true,
          legalFirstName: true,
          legalLastName: true,
          primaryEmail: true,
          businessEmail: true,
          user: {
            select: {
              id: true,
              email: true,
              status: true,
              localUsername: true,
              microsoftUserId: true,
              mustRotatePassword: true,
              userRoles: {
                where: {
                  OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
                },
                include: {
                  role: {
                    select: {
                      code: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.role.findMany({
        where: {
          organizationId: actor.organizationId,
          code: { in: RBAC_ROLE_CODES },
        },
        orderBy: { code: 'asc' },
        select: {
          code: true,
          name: true,
        },
      }),
    ]);

    if (!person) {
      throw new NotFoundException('Person not found for this organization');
    }

    return {
      person: {
        id: person.id,
        legalFirstName: person.legalFirstName,
        legalLastName: person.legalLastName,
        primaryEmail: person.primaryEmail,
        businessEmail: person.businessEmail,
      },
      roles,
      account: person.user
        ? {
            id: person.user.id,
            email: person.user.email,
            status: person.user.status,
            localUsername: person.user.localUsername,
            microsoftUserId: person.user.microsoftUserId,
            mustRotatePassword: person.user.mustRotatePassword,
            roleCodes: person.user.userRoles.map((userRole) => userRole.role.code),
          }
        : null,
    };
  }

  async upsertPersonAccount(actor: AuthenticatedUser, personId: string, dto: UpsertPersonAccountDto) {
    await this.rbac.ensureCatalog(actor.organizationId);

    const person = await this.prisma.person.findFirst({
      where: {
        id: personId,
        organizationId: actor.organizationId,
        archivedAt: null,
      },
      select: {
        id: true,
        primaryEmail: true,
        businessEmail: true,
      },
    });

    if (!person) {
      throw new NotFoundException('Person not found for this organization');
    }

    const roleCodes = this.normalizeRoleCodes(dto.roleCodes ?? []);
    if (roleCodes.length === 0) {
      throw new BadRequestException('At least one valid role code is required');
    }

    const requestedEmail = dto.email?.trim().toLowerCase();
    const inferredEmail = person.businessEmail?.trim().toLowerCase() || person.primaryEmail?.trim().toLowerCase();
    const email = requestedEmail || inferredEmail;
    if (!email) {
      throw new BadRequestException('Account email is required. Provide an email or update person email first.');
    }

    const status = dto.status ?? 'ACTIVE';
    const localUsername = dto.localUsername?.trim().toLowerCase();
    const microsoftUserId = dto.microsoftUserId?.trim();

    const existing = await this.prisma.user.findFirst({
      where: {
        organizationId: actor.organizationId,
        personId,
      },
      select: {
        id: true,
        localPasswordHash: true,
        localPasswordSalt: true,
      },
    });

    if (dto.loginType === 'LOCAL') {
      if (!localUsername) {
        throw new BadRequestException('Local username is required for LOCAL login type');
      }

      if (!dto.localPassword && (!existing?.localPasswordHash || !existing.localPasswordSalt)) {
        throw new BadRequestException('Local password is required when creating a local account');
      }
    }

    if (dto.loginType === 'M365' && !microsoftUserId) {
      throw new BadRequestException('Microsoft user ID is required for M365 login type');
    }

    const roles = await this.prisma.role.findMany({
      where: {
        organizationId: actor.organizationId,
        code: { in: roleCodes },
      },
      select: {
        id: true,
        code: true,
      },
    });

    if (roles.length !== roleCodes.length) {
      throw new BadRequestException('One or more role codes are not available in this organization');
    }

    const password = dto.localPassword?.trim();
    const passwordSalt = password ? randomBytes(16).toString('hex') : null;
    const passwordHash = password && passwordSalt ? this.hashPassword(password, passwordSalt) : null;

    let user:
      | {
          id: string;
          email: string;
          status: string;
          localUsername: string | null;
          microsoftUserId: string | null;
          mustRotatePassword: boolean;
        }
      | undefined;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const persisted = existing
          ? await tx.user.update({
              where: { id: existing.id },
              data: {
                email,
                status,
                localUsername: dto.loginType === 'LOCAL' ? localUsername : null,
                localPasswordHash: dto.loginType === 'LOCAL' ? (passwordHash ?? undefined) : null,
                localPasswordSalt: dto.loginType === 'LOCAL' ? (passwordSalt ?? undefined) : null,
                mustRotatePassword:
                  dto.loginType === 'LOCAL'
                    ? dto.mustRotatePassword ?? false
                    : false,
                microsoftUserId: dto.loginType === 'M365' ? microsoftUserId : null,
              },
            })
          : await tx.user.create({
              data: {
                organizationId: actor.organizationId,
                personId,
                email,
                status,
                localUsername: dto.loginType === 'LOCAL' ? localUsername : null,
                localPasswordHash: dto.loginType === 'LOCAL' ? (passwordHash ?? null) : null,
                localPasswordSalt: dto.loginType === 'LOCAL' ? (passwordSalt ?? null) : null,
                mustRotatePassword: dto.loginType === 'LOCAL' ? dto.mustRotatePassword ?? true : false,
                microsoftUserId: dto.loginType === 'M365' ? microsoftUserId : null,
              },
            });

        await tx.userRole.deleteMany({
          where: {
            userId: persisted.id,
          },
        });

        await tx.userRole.createMany({
          data: roles.map((role) => ({
            userId: persisted.id,
            roleId: role.id,
            assignedBy: actor.id,
          })),
          skipDuplicates: true,
        });

        return persisted;
      });
    } catch (error) {
      this.normalizePrismaError(error);
    }

    if (!user) {
      throw new ServiceUnavailableException('Unable to update linked account');
    }

    return {
      id: user.id,
      personId,
      email: user.email,
      status: user.status,
      loginType: dto.loginType,
      roleCodes,
      localUsername: user.localUsername,
      microsoftUserId: user.microsoftUserId,
      mustRotatePassword: user.mustRotatePassword,
    };
  }

  async resetPersonAccountPassword(
    actor: AuthenticatedUser,
    personId: string,
    dto: ResetPersonAccountPasswordDto,
  ) {
    const user = await this.prisma.user.findFirst({
      where: {
        organizationId: actor.organizationId,
        personId,
        archivedAt: null,
      },
      select: {
        id: true,
        localUsername: true,
      },
    });

    if (!user) {
      throw new NotFoundException('No account is linked to this person');
    }

    if (!user.localUsername) {
      throw new BadRequestException('Linked account is not configured for local login');
    }

    const passwordSalt = randomBytes(16).toString('hex');
    const passwordHash = this.hashPassword(dto.newPassword, passwordSalt);

    try {
      await this.prisma.user.update({
        where: {
          id: user.id,
        },
        data: {
          localPasswordHash: passwordHash,
          localPasswordSalt: passwordSalt,
          mustRotatePassword: dto.mustRotatePassword ?? true,
        },
      });
    } catch (error) {
      this.normalizePrismaError(error);
    }

    return {
      personId,
      reset: true,
    };
  }
}
