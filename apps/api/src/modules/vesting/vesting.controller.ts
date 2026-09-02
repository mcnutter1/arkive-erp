import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { RequirePermissions } from '../authorization/permissions.decorator.js';
import { PermissionsGuard } from '../authorization/permissions.guard.js';
import { PrismaService } from '../common/prisma.service.js';
import { VestingService } from './vesting.service.js';

@Controller({ path: 'vesting', version: '1' })
@UseGuards(AuthGuard, PermissionsGuard)
export class VestingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vestingService: VestingService,
  ) {}

  @Get('grants/:grantId/preview')
  @RequirePermissions('vesting.read')
  async previewGrant(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('grantId') grantId: string,
    @Query('asOf') asOf: string | undefined,
  ) {
    const grant = await this.prisma.grantAward.findFirst({
      where: {
        id: grantId,
        organizationId: actor.organizationId,
      },
      include: {
        vestingSchedules: {
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });

    if (!grant || grant.vestingSchedules.length === 0) {
      throw new BadRequestException('Grant or vesting schedule not found');
    }

    const schedule = grant.vestingSchedules[0];
    const asOfDate = asOf ? new Date(asOf) : new Date();

    return this.vestingService.calculate({
      totalQuantity: grant.quantity.toString(),
      startDate: schedule.startDate,
      cliffMonths: schedule.cliffMonths,
      durationMonths: schedule.durationMonths,
      intervalMonths: schedule.intervalMonths,
      asOfDate,
      paused: schedule.paused,
      accelerationQuantity:
        typeof schedule.accelerationMeta === 'object' &&
        schedule.accelerationMeta &&
        'extraQuantity' in schedule.accelerationMeta
          ? String((schedule.accelerationMeta as Record<string, unknown>).extraQuantity)
          : undefined,
    });
  }
}
