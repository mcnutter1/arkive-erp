import { Injectable } from '@nestjs/common';

import { AuthenticatedUser } from '../auth/auth.types.js';
import { PrismaService } from '../common/prisma.service.js';
import { UpsertSettingDto } from './dto.js';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listSection(actor: AuthenticatedUser, section: string) {
    return this.prisma.systemSetting.findMany({
      where: {
        organizationId: actor.organizationId,
        section,
      },
      orderBy: [{ key: 'asc' }],
    });
  }

  async upsertSetting(actor: AuthenticatedUser, dto: UpsertSettingDto) {
    return this.prisma.systemSetting.upsert({
      where: {
        organizationId_section_key: {
          organizationId: actor.organizationId,
          section: dto.section,
          key: dto.key,
        },
      },
      update: {
        value: dto.value,
        updatedByUserId: actor.id,
      },
      create: {
        organizationId: actor.organizationId,
        section: dto.section,
        key: dto.key,
        value: dto.value,
        updatedByUserId: actor.id,
      },
    });
  }
}
