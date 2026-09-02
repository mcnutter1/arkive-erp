import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';

import { AuthenticatedUser } from '../auth/auth.types.js';
import { PrismaService } from '../common/prisma.service.js';
import { VestingService } from '../vesting/vesting.service.js';
import { CreateExerciseRequestDto, RecordTerminationDto } from './dto.js';

@Injectable()
export class EquityLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vestingService: VestingService,
  ) {}

  async recordTermination(actor: AuthenticatedUser, dto: RecordTerminationDto) {
    const terminatedAt = new Date(dto.terminatedAt);

    let vestedQuantityAtEnd: Decimal | null = null;
    let unvestedQuantityAtEnd: Decimal | null = null;
    let postTerminationExerciseBy: Date | null = null;

    if (dto.grantId) {
      const grant = await this.prisma.grantAward.findFirst({
        where: {
          id: dto.grantId,
          organizationId: actor.organizationId,
          personId: dto.personId,
        },
        include: {
          vestingSchedules: {
            orderBy: { createdAt: 'asc' },
            take: 1,
          },
        },
      });

      if (!grant || grant.vestingSchedules.length === 0) {
        throw new NotFoundException('Grant or vesting schedule not found');
      }

      const schedule = grant.vestingSchedules[0];
      if (!schedule) {
        throw new NotFoundException('Grant vesting schedule not found');
      }
      const result = this.vestingService.calculate({
        totalQuantity: grant.quantity.toString(),
        startDate: schedule.startDate,
        cliffMonths: schedule.cliffMonths,
        durationMonths: schedule.durationMonths,
        intervalMonths: schedule.intervalMonths,
        asOfDate: terminatedAt,
        paused: schedule.paused,
      });

      vestedQuantityAtEnd = new Decimal(result.vestedQuantity);
      unvestedQuantityAtEnd = new Decimal(result.unvestedQuantity);

      const pteMonths = Number(process.env.DEFAULT_PTE_MONTHS ?? '3');
      const d = new Date(terminatedAt);
      d.setUTCMonth(d.getUTCMonth() + pteMonths);
      postTerminationExerciseBy = d;
    }

    return this.prisma.terminationRecord.create({
      data: {
        organizationId: actor.organizationId,
        personId: dto.personId,
        engagementId: dto.engagementId,
        grantId: dto.grantId,
        terminatedAt,
        vestedQuantityAtEnd,
        unvestedQuantityAtEnd,
        postTerminationExerciseBy,
        overrideReason: dto.overrideReason,
        createdByUserId: actor.id,
      },
    });
  }

  async createExerciseRequest(actor: AuthenticatedUser, dto: CreateExerciseRequestDto) {
    const qty = new Decimal(dto.quantity);
    if (qty.lte(0)) {
      throw new BadRequestException('Quantity must be positive');
    }

    const grant = await this.prisma.grantAward.findFirst({
      where: {
        id: dto.grantId,
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
      throw new NotFoundException('Grant or vesting schedule not found');
    }

    const schedule = grant.vestingSchedules[0];
    if (!schedule) {
      throw new NotFoundException('Grant vesting schedule not found');
    }

    const termination = await this.prisma.terminationRecord.findFirst({
      where: {
        organizationId: actor.organizationId,
        grantId: grant.id,
        personId: grant.personId,
      },
      orderBy: { terminatedAt: 'desc' },
    });

    if (termination?.postTerminationExerciseBy && new Date() > termination.postTerminationExerciseBy) {
      throw new BadRequestException('Post-termination exercise window has expired');
    }

    const vested = this.vestingService.calculate({
      totalQuantity: grant.quantity.toString(),
      startDate: schedule.startDate,
      cliffMonths: schedule.cliffMonths,
      durationMonths: schedule.durationMonths,
      intervalMonths: schedule.intervalMonths,
      asOfDate: new Date(),
      paused: schedule.paused,
    });

    const completed = await this.prisma.exerciseRequest.aggregate({
      where: {
        organizationId: actor.organizationId,
        grantId: grant.id,
        status: { in: ['APPROVED', 'COMPLETED'] },
      },
      _sum: {
        quantity: true,
      },
    });

    const alreadyExercised = completed._sum.quantity ?? new Decimal(0);
    const vestedQty = new Decimal(vested.vestedQuantity);
    const exercisable = vestedQty.sub(alreadyExercised);

    if (exercisable.lt(qty)) {
      throw new BadRequestException('Requested quantity exceeds exercisable amount');
    }

    return this.prisma.exerciseRequest.create({
      data: {
        organizationId: actor.organizationId,
        grantId: grant.id,
        personId: grant.personId,
        quantity: qty,
        exercisePrice: grant.exercisePrice,
        currency: grant.currency,
        status: 'SUBMITTED',
        notes: dto.notes,
        createdByUserId: actor.id,
      },
    });
  }

  async approveExerciseRequest(actor: AuthenticatedUser, requestId: string, reason?: string) {
    const request = await this.prisma.exerciseRequest.findFirst({
      where: {
        id: requestId,
        organizationId: actor.organizationId,
      },
    });

    if (!request) {
      throw new NotFoundException('Exercise request not found');
    }

    if (request.status !== 'SUBMITTED') {
      throw new BadRequestException('Only submitted requests can be approved');
    }

    return this.prisma.exerciseRequest.update({
      where: { id: request.id },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        notes: reason ? `${request.notes ?? ''}\n[APPROVED] ${reason}`.trim() : request.notes,
      },
    });
  }

  async declineExerciseRequest(actor: AuthenticatedUser, requestId: string, reason?: string) {
    const request = await this.prisma.exerciseRequest.findFirst({
      where: {
        id: requestId,
        organizationId: actor.organizationId,
      },
    });

    if (!request) {
      throw new NotFoundException('Exercise request not found');
    }

    if (request.status !== 'SUBMITTED') {
      throw new BadRequestException('Only submitted requests can be declined');
    }

    return this.prisma.exerciseRequest.update({
      where: { id: request.id },
      data: {
        status: 'DECLINED',
        notes: reason ? `${request.notes ?? ''}\n[DECLINED] ${reason}`.trim() : request.notes,
      },
    });
  }

  async cancelExerciseRequest(actor: AuthenticatedUser, requestId: string, reason?: string) {
    const request = await this.prisma.exerciseRequest.findFirst({
      where: {
        id: requestId,
        organizationId: actor.organizationId,
      },
    });

    if (!request) {
      throw new NotFoundException('Exercise request not found');
    }

    if (request.status === 'COMPLETED' || request.status === 'DECLINED' || request.status === 'CANCELED') {
      throw new BadRequestException('Cannot cancel an exercise request in a terminal state');
    }

    return this.prisma.exerciseRequest.update({
      where: { id: request.id },
      data: {
        status: 'CANCELED',
        notes: reason ? `${request.notes ?? ''}\n[CANCELED] ${reason}`.trim() : request.notes,
      },
    });
  }

  async completeExerciseRequest(actor: AuthenticatedUser, requestId: string) {
    const request = await this.prisma.exerciseRequest.findFirst({
      where: {
        id: requestId,
        organizationId: actor.organizationId,
      },
      include: {
        grant: {
          include: {
            vestingSchedules: {
              orderBy: { createdAt: 'asc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Exercise request not found');
    }

    if (request.status !== 'APPROVED') {
      throw new BadRequestException('Only approved requests can be completed');
    }

    if (request.grant.vestingSchedules.length === 0) {
      throw new BadRequestException('Grant vesting schedule not found');
    }

    const termination = await this.prisma.terminationRecord.findFirst({
      where: {
        organizationId: actor.organizationId,
        grantId: request.grantId,
        personId: request.personId,
      },
      orderBy: { terminatedAt: 'desc' },
    });

    if (termination?.postTerminationExerciseBy && new Date() > termination.postTerminationExerciseBy) {
      throw new BadRequestException('Post-termination exercise window has expired');
    }

    const schedule = request.grant.vestingSchedules[0];
    if (!schedule) {
      throw new BadRequestException('Grant vesting schedule not found');
    }
    const vested = this.vestingService.calculate({
      totalQuantity: request.grant.quantity.toString(),
      startDate: schedule.startDate,
      cliffMonths: schedule.cliffMonths,
      durationMonths: schedule.durationMonths,
      intervalMonths: schedule.intervalMonths,
      asOfDate: new Date(),
      paused: schedule.paused,
    });

    const alreadyCompleted = await this.prisma.exerciseRequest.aggregate({
      where: {
        organizationId: actor.organizationId,
        grantId: request.grantId,
        status: 'COMPLETED',
      },
      _sum: {
        quantity: true,
      },
    });

    const vestedQty = new Decimal(vested.vestedQuantity);
    const completedQty = alreadyCompleted._sum.quantity ?? new Decimal(0);
    const available = vestedQty.sub(completedQty);
    if (available.lt(request.quantity)) {
      throw new BadRequestException('Insufficient exercisable vested quantity at completion time');
    }

    const seq = await this.prisma.equityTransaction.aggregate({
      where: { organizationId: actor.organizationId },
      _max: { ledgerSequence: true },
    });
    const ledgerSequence = BigInt(seq._max.ledgerSequence ?? 0n) + 1n;

    const completedAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.exerciseRequest.update({
        where: { id: request.id },
        data: {
          status: 'COMPLETED',
          completedAt,
        },
      });

      await tx.equityTransaction.create({
        data: {
          organizationId: actor.organizationId,
          grantId: request.grantId,
          type: 'EXERCISE',
          effectiveAt: completedAt,
          quantity: request.quantity,
          unitPrice: request.exercisePrice ?? undefined,
          currency: request.currency,
          toPersonId: request.personId,
          ledgerSequence,
          reason: 'Exercise completion',
          metadata: {
            exerciseRequestId: request.id,
          },
          createdByUserId: actor.id,
        },
      });

      return updated;
    });
  }
}
