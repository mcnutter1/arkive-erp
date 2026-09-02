import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal } from 'decimal.js';

import { AuthenticatedUser } from '../auth/auth.types.js';
import { PrismaService } from '../common/prisma.service.js';
import { CreateRoundDto, CreateScenarioDto } from './dto.js';

@Injectable()
export class FundraisingService {
  constructor(private readonly prisma: PrismaService) {}

  async listRounds(actor: AuthenticatedUser) {
    return this.prisma.fundraisingRound.findMany({
      where: { organizationId: actor.organizationId },
      orderBy: { createdAt: 'desc' },
      include: { instruments: true },
    });
  }

  async createRound(actor: AuthenticatedUser, dto: CreateRoundDto) {
    return this.prisma.fundraisingRound.create({
      data: {
        organizationId: actor.organizationId,
        name: dto.name,
        stage: dto.stage,
        status: dto.status ?? 'DRAFT',
        preMoney: dto.preMoney ? new Decimal(dto.preMoney) : undefined,
        postMoney: dto.postMoney ? new Decimal(dto.postMoney) : undefined,
      },
    });
  }

  async listScenarios(actor: AuthenticatedUser, roundId: string) {
    return this.prisma.fundraisingScenario.findMany({
      where: {
        organizationId: actor.organizationId,
        roundId,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createScenario(
    actor: AuthenticatedUser,
    roundId: string,
    body: CreateScenarioDto,
  ) {
    const round = await this.prisma.fundraisingRound.findFirst({
      where: {
        id: roundId,
        organizationId: actor.organizationId,
      },
      select: { id: true },
    });

    if (!round) {
      throw new NotFoundException('Fundraising round not found');
    }

    return this.prisma.fundraisingScenario.create({
      data: {
        organizationId: actor.organizationId,
        roundId,
        name: body.name,
        assumptions: body.assumptions as Prisma.InputJsonValue,
        createdByUserId: actor.id,
      },
    });
  }

  async simulateScenario(actor: AuthenticatedUser, roundId: string, scenarioId: string) {
    const scenario = await this.prisma.fundraisingScenario.findFirst({
      where: {
        id: scenarioId,
        organizationId: actor.organizationId,
        roundId,
      },
    });

    if (!scenario) {
      throw new NotFoundException('Scenario not found');
    }

    const assumptions = scenario.assumptions as Record<string, unknown>;
    const raiseAmount = assumptions.raiseAmount ? Number(assumptions.raiseAmount) : 0;
    const preMoney = assumptions.preMoney ? Number(assumptions.preMoney) : 0;
    const postMoney = preMoney + raiseAmount;
    const dilution = postMoney > 0 ? raiseAmount / postMoney : 0;

    return this.prisma.fundraisingScenario.update({
      where: { id: scenario.id },
      data: {
        output: {
          raiseAmount,
          preMoney,
          postMoney,
          dilution,
          generatedAt: new Date().toISOString(),
          note: 'Scenario output only. Authoritative ledger unchanged.',
        },
      },
    });
  }
}
