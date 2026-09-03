import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal } from 'decimal.js';

import { AuthenticatedUser } from '../auth/auth.types.js';
import { PrismaService } from '../common/prisma.service.js';
import { VestingService } from '../vesting/vesting.service.js';
import { CreateEquityPlanDto, CreateEquityTransactionDto, CreateGrantAwardDto, UpdateCapTableBaseDto } from './dto.js';

@Injectable()
export class EquityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vestingService: VestingService,
  ) {}

  private parseSettingObject(value: unknown): Record<string, unknown> {
    if (typeof value === 'object' && value) {
      return value as Record<string, unknown>;
    }
    return {};
  }

  private toBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    return false;
  }

  private decimal(value: Decimal | string | number | null | undefined): Decimal {
    if (value === null || value === undefined) {
      return new Decimal(0);
    }
    return new Decimal(value);
  }

  private clampNonNegative(value: Decimal): Decimal {
    if (value.lt(0)) {
      return new Decimal(0);
    }
    return value;
  }

  private parseDecimalInput(
    value: unknown,
    fieldName: string,
    options?: {
      allowZero?: boolean;
    },
  ): Decimal {
    const allowZero = options?.allowZero ?? false;

    if (value === null || value === undefined) {
      throw new BadRequestException(`${fieldName} is required`);
    }

    let normalized: string | number | Decimal;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        throw new BadRequestException(`${fieldName} is required`);
      }
      normalized = trimmed.replaceAll(',', '');
    } else if (typeof value === 'number' || value instanceof Decimal) {
      normalized = value;
    } else {
      throw new BadRequestException(`Invalid ${fieldName}`);
    }

    let parsed: Decimal;
    try {
      parsed = new Decimal(normalized);
    } catch {
      throw new BadRequestException(`Invalid ${fieldName}`);
    }

    if (!parsed.isFinite()) {
      throw new BadRequestException(`Invalid ${fieldName}`);
    }

    if (allowZero ? parsed.lt(0) : parsed.lte(0)) {
      throw new BadRequestException(
        allowZero ? `${fieldName} cannot be negative` : `${fieldName} must be positive`,
      );
    }

    return parsed;
  }

  private parseDateInput(value: string | undefined, fieldName: string, required = false): Date | undefined {
    const normalized = value?.trim();

    if (!normalized) {
      if (required) {
        throw new BadRequestException(`${fieldName} is required`);
      }
      return undefined;
    }

    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid ${fieldName}`);
    }

    return parsed;
  }

  private async getConfiguredBaseOutstandingShares(organizationId: string): Promise<Decimal> {
    const setting = await this.prisma.systemSetting.findFirst({
      where: {
        organizationId,
        section: 'equity',
        key: 'capTableBase',
      },
      select: {
        value: true,
      },
    });

    if (!setting) {
      return new Decimal(0);
    }

    const payload = this.parseSettingObject(setting.value);
    const raw = payload.outstandingShares;
    if (raw === null || raw === undefined || raw === '') {
      return new Decimal(0);
    }

    try {
      return this.parseDecimalInput(raw, 'outstanding shares', { allowZero: true });
    } catch {
      return new Decimal(0);
    }
  }

  private async ensurePersonInOrg(organizationId: string, personId: string): Promise<void> {
    const person = await this.prisma.person.findFirst({
      where: {
        id: personId,
        organizationId,
        archivedAt: null,
      },
      select: { id: true },
    });

    if (!person) {
      throw new NotFoundException('Person not found for this organization');
    }
  }

  private async nextLedgerSequence(organizationId: string): Promise<bigint> {
    const seq = await this.prisma.equityTransaction.aggregate({
      where: { organizationId },
      _max: { ledgerSequence: true },
    });

    return BigInt(seq._max.ledgerSequence ?? 0n) + 1n;
  }

  async createPlan(actor: AuthenticatedUser, dto: CreateEquityPlanDto) {
    const reservedShares = this.parseDecimalInput(dto.reservedShares, 'reserved shares');

    const code = dto.code.trim().toUpperCase();
    const name = dto.name.trim();
    if (!code || !name) {
      throw new BadRequestException('Plan code and name are required');
    }

    try {
      return await this.prisma.equityPlan.create({
        data: {
          organizationId: actor.organizationId,
          code,
          name,
          reservedShares,
          effectiveDate: this.parseDateInput(dto.effectiveDate, 'effective date'),
          expiryDate: this.parseDateInput(dto.expiryDate, 'expiry date'),
          status: dto.status ?? 'DRAFT',
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('An equity plan with this code already exists');
      }
      throw error;
    }
  }

  async listPlans(actor: AuthenticatedUser) {
    const plans = await this.prisma.equityPlan.findMany({
      where: {
        organizationId: actor.organizationId,
      },
      select: {
        id: true,
        code: true,
        name: true,
        reservedShares: true,
        status: true,
      },
      orderBy: [{ status: 'asc' }, { code: 'asc' }],
      take: 200,
    });

    const grouped = await this.prisma.grantAward.groupBy({
      by: ['planId'],
      where: {
        organizationId: actor.organizationId,
        planId: {
          not: null,
        },
      },
      _sum: {
        quantity: true,
      },
    });

    const grantedByPlan = new Map<string, Decimal>();
    grouped.forEach((row) => {
      if (!row.planId) {
        return;
      }
      grantedByPlan.set(row.planId, this.decimal(row._sum.quantity));
    });

    return plans.map((plan) => {
      const granted = grantedByPlan.get(plan.id) ?? new Decimal(0);
      const remaining = this.clampNonNegative(new Decimal(plan.reservedShares).sub(granted));

      return {
        ...plan,
        grantedShares: granted.toFixed(6),
        remainingShares: remaining.toFixed(6),
      };
    });
  }

  async listGrants(actor: AuthenticatedUser) {
    const grants = await this.prisma.grantAward.findMany({
      where: {
        organizationId: actor.organizationId,
      },
      include: {
        person: {
          select: {
            id: true,
            legalFirstName: true,
            legalLastName: true,
            primaryEmail: true,
          },
        },
        plan: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        vestingSchedules: {
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
      orderBy: [{ grantDate: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });

    return grants.map((grant) => {
      const firstSchedule = grant.vestingSchedules[0];
      const { vestingSchedules, ...base } = grant;
      return {
        ...base,
        vestingSchedule: firstSchedule
          ? {
              startDate: firstSchedule.startDate,
              cliffMonths: firstSchedule.cliffMonths,
              durationMonths: firstSchedule.durationMonths,
              intervalMonths: firstSchedule.intervalMonths,
            }
          : null,
      };
    });
  }

  async getGrantDetail(actor: AuthenticatedUser, grantId: string, asOf?: string) {
    const grant = await this.prisma.grantAward.findFirst({
      where: {
        id: grantId,
        organizationId: actor.organizationId,
      },
      include: {
        person: {
          select: {
            id: true,
            legalFirstName: true,
            legalLastName: true,
            primaryEmail: true,
          },
        },
        plan: {
          select: {
            id: true,
            code: true,
            name: true,
            reservedShares: true,
          },
        },
        vestingSchedules: {
          orderBy: {
            createdAt: 'asc',
          },
        },
        exerciseRequests: {
          orderBy: {
            requestedAt: 'desc',
          },
          take: 100,
        },
        equityTxns: {
          orderBy: [{ effectiveAt: 'desc' }, { ledgerSequence: 'desc' }],
          take: 200,
        },
        terminations: {
          orderBy: {
            terminatedAt: 'desc',
          },
          take: 20,
        },
      },
    });

    if (!grant) {
      throw new NotFoundException('Grant not found');
    }

    const schedule = grant.vestingSchedules[0];
    const asOfDate = asOf ? new Date(asOf) : new Date();
    const vestingPreview = schedule
      ? this.vestingService.calculate({
          totalQuantity: grant.quantity.toString(),
          startDate: schedule.startDate,
          cliffMonths: schedule.cliffMonths,
          durationMonths: schedule.durationMonths,
          intervalMonths: schedule.intervalMonths,
          asOfDate,
          paused: schedule.paused,
        })
      : null;

    const exercisedCompleted = await this.prisma.exerciseRequest.aggregate({
      where: {
        organizationId: actor.organizationId,
        grantId: grant.id,
        status: 'COMPLETED',
      },
      _sum: {
        quantity: true,
      },
    });

    const exercisedQuantity = this.decimal(exercisedCompleted._sum.quantity);
    const remainingQuantity = this.clampNonNegative(new Decimal(grant.quantity).sub(exercisedQuantity));

    return {
      grant,
      vestingPreview,
      exercisedQuantity: exercisedQuantity.toFixed(6),
      remainingQuantity: remainingQuantity.toFixed(6),
    };
  }

  async getDashboard(actor: AuthenticatedUser) {
    const [grants, exercises, terminations] = await this.prisma.$transaction([
      this.prisma.grantAward.findMany({
        where: {
          organizationId: actor.organizationId,
        },
        select: {
          id: true,
          awardType: true,
          quantity: true,
          grantDate: true,
          createdAt: true,
          person: {
            select: {
              legalFirstName: true,
              legalLastName: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 200,
      }),
      this.prisma.exerciseRequest.findMany({
        where: {
          organizationId: actor.organizationId,
        },
        select: {
          id: true,
          grantId: true,
          quantity: true,
          status: true,
          requestedAt: true,
          completedAt: true,
          grant: {
            select: {
              awardType: true,
              person: {
                select: {
                  legalFirstName: true,
                  legalLastName: true,
                },
              },
            },
          },
        },
        orderBy: {
          requestedAt: 'desc',
        },
        take: 200,
      }),
      this.prisma.terminationRecord.findMany({
        where: {
          organizationId: actor.organizationId,
        },
        select: {
          id: true,
          terminatedAt: true,
          unvestedQuantityAtEnd: true,
          grant: {
            select: {
              awardType: true,
              person: {
                select: {
                  legalFirstName: true,
                  legalLastName: true,
                },
              },
            },
          },
        },
        orderBy: {
          terminatedAt: 'desc',
        },
        take: 200,
      }),
    ]);

    let optionsGranted = new Decimal(0);
    let rsusGranted = new Decimal(0);
    grants.forEach((grant) => {
      if (grant.awardType === 'OPTION_ISO' || grant.awardType === 'OPTION_NSO') {
        optionsGranted = optionsGranted.add(this.decimal(grant.quantity));
      }
      if (grant.awardType === 'RSU') {
        rsusGranted = rsusGranted.add(this.decimal(grant.quantity));
      }
    });

    let exercised = new Decimal(0);
    exercises.forEach((request) => {
      if (request.status === 'COMPLETED') {
        exercised = exercised.add(this.decimal(request.quantity));
      }
    });

    let forfeitedOptions = new Decimal(0);
    let forfeitedRsus = new Decimal(0);
    terminations.forEach((term) => {
      const qty = this.decimal(term.unvestedQuantityAtEnd);
      if (term.grant?.awardType === 'RSU') {
        forfeitedRsus = forfeitedRsus.add(qty);
      } else {
        forfeitedOptions = forfeitedOptions.add(qty);
      }
    });

    const outstandingOptions = this.clampNonNegative(optionsGranted.sub(exercised).sub(forfeitedOptions));
    const outstandingRsus = this.clampNonNegative(rsusGranted.sub(forfeitedRsus));
    const forfeitedTotal = forfeitedOptions.add(forfeitedRsus);

    const timeline: Array<{ date: Date; type: string; title: string; subtitle: string }> = [];

    grants.forEach((grant) => {
      const personName = `${grant.person.legalFirstName} ${grant.person.legalLastName}`;
      timeline.push({
        date: grant.grantDate ?? grant.createdAt,
        type: 'GRANT',
        title: `${grant.awardType} grant issued`,
        subtitle: `${personName} · ${new Decimal(grant.quantity).toFixed(6)} units`,
      });
    });

    exercises.forEach((exercise) => {
      const personName = `${exercise.grant.person.legalFirstName} ${exercise.grant.person.legalLastName}`;
      const status = exercise.status;
      timeline.push({
        date: exercise.completedAt ?? exercise.requestedAt,
        type: 'EXERCISE',
        title: `Exercise ${status.toLowerCase()}`,
        subtitle: `${personName} · ${new Decimal(exercise.quantity).toFixed(6)} units`,
      });
    });

    terminations.forEach((termination) => {
      const personName = termination.grant
        ? `${termination.grant.person.legalFirstName} ${termination.grant.person.legalLastName}`
        : 'Person';
      timeline.push({
        date: termination.terminatedAt,
        type: 'TERMINATION',
        title: 'Termination recorded',
        subtitle: `${personName} · forfeited ${this.decimal(termination.unvestedQuantityAtEnd).toFixed(6)}`,
      });
    });

    timeline.sort((a, b) => b.date.getTime() - a.date.getTime());

    return {
      cards: {
        outstandingOptions: outstandingOptions.toFixed(6),
        outstandingRsus: outstandingRsus.toFixed(6),
        exercised: exercised.toFixed(6),
        forfeited: forfeitedTotal.toFixed(6),
      },
      timeline: timeline.slice(0, 120),
    };
  }

  async generateGrantLetter(actor: AuthenticatedUser, grantId: string) {
    const detail = await this.getGrantDetail(actor, grantId);
    const grant = detail.grant;

    const settings = await this.prisma.systemSetting.findMany({
      where: {
        organizationId: actor.organizationId,
        OR: [
          { section: 'company', key: 'profile' },
          { section: 'equity', key: 'grantLetters' },
          { section: 'integrations', key: 'esign' },
        ],
      },
    });

    const companyProfile = this.parseSettingObject(
      settings.find((s) => s.section === 'company' && s.key === 'profile')?.value,
    );
    const grantLetters = this.parseSettingObject(
      settings.find((s) => s.section === 'equity' && s.key === 'grantLetters')?.value,
    );
    const esign = this.parseSettingObject(
      settings.find((s) => s.section === 'integrations' && s.key === 'esign')?.value,
    );

    const companyName = String(companyProfile.companyName ?? grantLetters.companyName ?? 'Arkive Company');
    const legalEntityName = String(
      companyProfile.legalEntityName ?? grantLetters.legalEntityName ?? companyName,
    );
    const signatoryName = String(grantLetters.signatoryName ?? 'Authorized Signatory');
    const signatoryTitle = String(grantLetters.signatoryTitle ?? 'Company Officer');
    const signatoryPersonId =
      typeof grantLetters.signatoryPersonId === 'string' ? grantLetters.signatoryPersonId : undefined;

    const recipientName = `${grant.person.legalFirstName} ${grant.person.legalLastName}`;
    const grantDate = grant.grantDate ? new Date(grant.grantDate).toISOString().slice(0, 10) : '';
    const exercisePriceLine = grant.exercisePrice
      ? `Exercise Price: ${new Decimal(grant.exercisePrice).toFixed(6)} ${grant.currency}`
      : 'Exercise Price: Not applicable (RSU award)';

    const vesting = detail.vestingPreview
      ? `Vesting Terms: ${detail.vestingPreview.elapsedIntervals}/${detail.vestingPreview.totalIntervals} intervals vested as of today.`
      : 'Vesting Terms: Not configured.';

    const title = `${grant.awardType} Grant Letter - ${recipientName}`;
    const fileName = `${recipientName.replace(/\s+/g, '-').toLowerCase()}-${grant.awardType.toLowerCase()}-grant-letter.md`;

    const content = [
      `# ${legalEntityName}`,
      '',
      '## Equity Grant Letter',
      '',
      `Date: ${grantDate || new Date().toISOString().slice(0, 10)}`,
      '',
      `Recipient: ${recipientName}`,
      `Recipient Email: ${grant.person.primaryEmail ?? 'N/A'}`,
      '',
      `Award Type: ${grant.awardType}`,
      `Grant Quantity: ${new Decimal(grant.quantity).toFixed(6)}`,
      exercisePriceLine,
      `Plan: ${grant.plan ? `${grant.plan.code} - ${grant.plan.name}` : 'Unassigned'}`,
      '',
      vesting,
      '',
      'By signing this letter, the Recipient acknowledges acceptance of this award subject to the plan, applicable company policies, and governing equity agreements.',
      '',
      '### Company Signatory',
      '',
      `${signatoryName}`,
      `${signatoryTitle}`,
      `${companyName}`,
      '',
      '### Recipient',
      '',
      `${recipientName}`,
      '',
      '_Generated by Arkive Equity Workspace_',
    ].join('\n');

    return {
      title,
      fileName,
      mimeType: 'text/markdown',
      content,
      defaultParticipants: [
        {
          personId: grant.personId,
          role: 'Recipient',
          signingOrder: 1,
        },
        ...(signatoryPersonId
          ? [
              {
                personId: signatoryPersonId,
                role: 'Company Signatory',
                signingOrder: 2,
              },
            ]
          : []),
      ],
      eSignConfigured: this.toBoolean(esign.enabled),
    };
  }

  async listLedger(actor: AuthenticatedUser) {
    return this.prisma.equityTransaction.findMany({
      where: { organizationId: actor.organizationId },
      include: {
        plan: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        grant: {
          select: {
            id: true,
            awardType: true,
            personId: true,
          },
        },
      },
      orderBy: [{ effectiveAt: 'asc' }, { ledgerSequence: 'asc' }],
      take: 500,
    });
  }

  async getCapTable(actor: AuthenticatedUser) {
    const [
      baseOutstandingShares,
      securityClassTotals,
      planReserveTotals,
      grantTotals,
      optionGrantTotals,
      rsuGrantTotals,
      completedExerciseTotals,
      forfeitedOptionTotals,
      forfeitedRsuTotals,
      issuedTo,
      issuedFrom,
    ] = await Promise.all([
      this.getConfiguredBaseOutstandingShares(actor.organizationId),
      this.prisma.securityClass.aggregate({
        where: { organizationId: actor.organizationId },
        _sum: { authorizedShares: true },
      }),
      this.prisma.equityPlan.aggregate({
        where: { organizationId: actor.organizationId },
        _sum: { reservedShares: true },
      }),
      this.prisma.grantAward.aggregate({
        where: {
          organizationId: actor.organizationId,
          planId: { not: null },
        },
        _sum: { quantity: true },
      }),
      this.prisma.grantAward.aggregate({
        where: {
          organizationId: actor.organizationId,
          awardType: {
            in: ['OPTION_ISO', 'OPTION_NSO'],
          },
        },
        _sum: {
          quantity: true,
        },
      }),
      this.prisma.grantAward.aggregate({
        where: {
          organizationId: actor.organizationId,
          awardType: 'RSU',
        },
        _sum: {
          quantity: true,
        },
      }),
      this.prisma.exerciseRequest.aggregate({
        where: {
          organizationId: actor.organizationId,
          status: 'COMPLETED',
        },
        _sum: {
          quantity: true,
        },
      }),
      this.prisma.terminationRecord.aggregate({
        where: {
          organizationId: actor.organizationId,
          grant: {
            is: {
              awardType: {
                in: ['OPTION_ISO', 'OPTION_NSO'],
              },
            },
          },
        },
        _sum: {
          unvestedQuantityAtEnd: true,
        },
      }),
      this.prisma.terminationRecord.aggregate({
        where: {
          organizationId: actor.organizationId,
          grant: {
            is: {
              awardType: 'RSU',
            },
          },
        },
        _sum: {
          unvestedQuantityAtEnd: true,
        },
      }),
      this.prisma.equityTransaction.groupBy({
        by: ['toPersonId'],
        orderBy: { toPersonId: 'asc' },
        where: {
          organizationId: actor.organizationId,
          toPersonId: { not: null },
        },
        _sum: { quantity: true },
      }),
      this.prisma.equityTransaction.groupBy({
        by: ['fromPersonId'],
        orderBy: { fromPersonId: 'asc' },
        where: {
          organizationId: actor.organizationId,
          fromPersonId: { not: null },
        },
        _sum: { quantity: true },
      }),
    ]);

    const outgoingMap = new Map<string, Decimal>();
    for (const row of issuedFrom) {
      if (row.fromPersonId) {
        outgoingMap.set(row.fromPersonId, row._sum?.quantity ?? new Decimal(0));
      }
    }

    const personIds = issuedTo
      .map((row) => row.toPersonId)
      .filter((personId): personId is string => typeof personId === 'string');

    const people = personIds.length
      ? await this.prisma.person.findMany({
          where: {
            organizationId: actor.organizationId,
            id: { in: personIds },
          },
          select: {
            id: true,
            legalFirstName: true,
            legalLastName: true,
          },
        })
      : [];

    const peopleMap = new Map(people.map((person) => [person.id, `${person.legalFirstName} ${person.legalLastName}`]));

    const holderRows = issuedTo
      .filter((row) => row.toPersonId)
      .map((row) => {
        const incoming = row._sum?.quantity ?? new Decimal(0);
        const outgoing = outgoingMap.get(row.toPersonId as string) ?? new Decimal(0);
        const net = incoming.sub(outgoing);
        return {
          personId: row.toPersonId as string,
          personName: peopleMap.get(row.toPersonId as string) ?? 'Unknown',
          outstandingQuantity: this.clampNonNegative(net).toFixed(6),
        };
      })
      .filter((row) => new Decimal(row.outstandingQuantity).gt(0))
      .sort((a, b) => new Decimal(b.outstandingQuantity).cmp(new Decimal(a.outstandingQuantity)));

    const optionsGranted = this.decimal(optionGrantTotals._sum.quantity);
    const rsusGranted = this.decimal(rsuGrantTotals._sum.quantity);
    const exercised = this.decimal(completedExerciseTotals._sum.quantity);
    const forfeitedOptions = this.decimal(forfeitedOptionTotals._sum.unvestedQuantityAtEnd);
    const forfeitedRsus = this.decimal(forfeitedRsuTotals._sum.unvestedQuantityAtEnd);

    const outstandingOptions = this.clampNonNegative(optionsGranted.sub(exercised).sub(forfeitedOptions));
    const outstandingRsus = this.clampNonNegative(rsusGranted.sub(forfeitedRsus));
    const equityInstrumentsOutstanding = outstandingOptions.add(outstandingRsus);
    const fullyDilutedShares = baseOutstandingShares.add(equityInstrumentsOutstanding);

    const reservedPoolShares = this.decimal(planReserveTotals._sum.reservedShares);
    const grantedPoolShares = this.decimal(grantTotals._sum.quantity);
    const remainingPoolShares = this.clampNonNegative(reservedPoolShares.sub(grantedPoolShares));
    const authorizedShares = this.decimal(securityClassTotals._sum.authorizedShares);

    return {
      generatedAt: new Date().toISOString(),
      shares: {
        baseOutstandingShares: baseOutstandingShares.toFixed(6),
        authorizedShares: authorizedShares.toFixed(6),
        outstandingOptions: outstandingOptions.toFixed(6),
        outstandingRsus: outstandingRsus.toFixed(6),
        equityInstrumentsOutstanding: equityInstrumentsOutstanding.toFixed(6),
        fullyDilutedShares: fullyDilutedShares.toFixed(6),
      },
      optionPool: {
        reservedShares: reservedPoolShares.toFixed(6),
        grantedShares: grantedPoolShares.toFixed(6),
        remainingShares: remainingPoolShares.toFixed(6),
      },
      holders: holderRows,
    };
  }

  async updateCapTableBase(actor: AuthenticatedUser, dto: UpdateCapTableBaseDto) {
    const outstandingShares = this.parseDecimalInput(dto.outstandingShares, 'outstanding shares', {
      allowZero: true,
    });

    await this.prisma.systemSetting.upsert({
      where: {
        organizationId_section_key: {
          organizationId: actor.organizationId,
          section: 'equity',
          key: 'capTableBase',
        },
      },
      update: {
        value: {
          outstandingShares: outstandingShares.toFixed(6),
        } as Prisma.InputJsonValue,
        updatedByUserId: actor.id,
      },
      create: {
        organizationId: actor.organizationId,
        section: 'equity',
        key: 'capTableBase',
        value: {
          outstandingShares: outstandingShares.toFixed(6),
        } as Prisma.InputJsonValue,
        updatedByUserId: actor.id,
      },
    });

    return this.getCapTable(actor);
  }

  async createTransaction(actor: AuthenticatedUser, dto: CreateEquityTransactionDto) {
    const quantity = this.parseDecimalInput(dto.quantity, 'quantity');
    const effectiveAt = this.parseDateInput(dto.effectiveAt, 'effectiveAt', true);

    if (dto.fromPersonId) {
      await this.ensurePersonInOrg(actor.organizationId, dto.fromPersonId);
    }
    if (dto.toPersonId) {
      await this.ensurePersonInOrg(actor.organizationId, dto.toPersonId);
    }

    if (dto.type === 'TRANSFER' && (!dto.fromPersonId || !dto.toPersonId)) {
      throw new BadRequestException('Transfer requires both from and to holders');
    }

    if (dto.type === 'GRANT' && dto.fromPersonId) {
      throw new BadRequestException('Grants are issued by the company and cannot set fromPersonId');
    }

    if ((dto.type === 'TRANSFER' || dto.type === 'EXERCISE' || dto.type === 'CANCEL') && dto.fromPersonId) {
      const sent = await this.prisma.equityTransaction.aggregate({
        where: {
          organizationId: actor.organizationId,
          fromPersonId: dto.fromPersonId,
          securityClassId: dto.securityClassId ?? null,
        },
        _sum: { quantity: true },
      });
      const received = await this.prisma.equityTransaction.aggregate({
        where: {
          organizationId: actor.organizationId,
          toPersonId: dto.fromPersonId,
          securityClassId: dto.securityClassId ?? null,
        },
        _sum: { quantity: true },
      });

      const outgoing = sent._sum.quantity ?? new Decimal(0);
      const incoming = received._sum.quantity ?? new Decimal(0);
      const available = incoming.sub(outgoing);

      if (available.lt(quantity)) {
        throw new BadRequestException('Insufficient available balance for fromPersonId');
      }
    }

    const ledgerSequence = await this.nextLedgerSequence(actor.organizationId);

    return this.prisma.equityTransaction.create({
      data: {
        organizationId: actor.organizationId,
        type: dto.type,
        effectiveAt,
        quantity,
        unitPrice: dto.unitPrice ? this.parseDecimalInput(dto.unitPrice, 'unit price', { allowZero: true }) : undefined,
        securityClassId: dto.securityClassId,
        fromPersonId: dto.fromPersonId,
        toPersonId: dto.toPersonId,
        reason: dto.reason,
        ledgerSequence,
        createdByUserId: actor.id,
      },
    });
  }

  async createGrant(actor: AuthenticatedUser, dto: CreateGrantAwardDto) {
    const quantity = this.parseDecimalInput(dto.quantity, 'grant quantity');

    if (dto.durationMonths < dto.cliffMonths) {
      throw new BadRequestException('Vesting duration must be greater than or equal to cliff months');
    }

    if (dto.durationMonths % dto.intervalMonths !== 0) {
      throw new BadRequestException('Vesting duration must divide evenly by interval months');
    }

    await this.ensurePersonInOrg(actor.organizationId, dto.personId);

    const planId = dto.planId?.trim() || undefined;

    const isOption = dto.awardType === 'OPTION_ISO' || dto.awardType === 'OPTION_NSO';
    const exercisePrice = dto.exercisePrice
      ? this.parseDecimalInput(dto.exercisePrice, 'exercise price', { allowZero: true })
      : undefined;

    if (isOption && !exercisePrice) {
      throw new BadRequestException('Exercise price is required for option grants');
    }

    if (!isOption && exercisePrice) {
      throw new BadRequestException('Exercise price is only valid for option grants');
    }

    const grantDate = this.parseDateInput(dto.grantDate, 'grantDate', true);
    const vestingStartDate = this.parseDateInput(dto.vestingStartDate, 'vestingStartDate', true);
    const expirationDate = this.parseDateInput(dto.expirationDate, 'expirationDate');
    const currency = (dto.currency ?? 'USD').trim().toUpperCase();

    if (!currency) {
      throw new BadRequestException('Currency is required');
    }

    return this.prisma.$transaction(async (tx) => {
      if (planId) {
        const plan = await tx.equityPlan.findFirst({
          where: {
            id: planId,
            organizationId: actor.organizationId,
          },
          select: {
            id: true,
            code: true,
            reservedShares: true,
          },
        });

        if (!plan) {
          throw new NotFoundException('Equity plan not found for this organization');
        }

        const granted = await tx.grantAward.aggregate({
          where: {
            organizationId: actor.organizationId,
            planId,
          },
          _sum: {
            quantity: true,
          },
        });

        const alreadyGranted = this.decimal(granted._sum.quantity);
        const remaining = new Decimal(plan.reservedShares).sub(alreadyGranted);
        if (remaining.lt(quantity)) {
          throw new BadRequestException(
            `Plan ${plan.code} has insufficient remaining reserve for this grant`,
          );
        }
      }

      const seq = await tx.equityTransaction.aggregate({
        where: { organizationId: actor.organizationId },
        _max: { ledgerSequence: true },
      });
      const ledgerSequence = BigInt(seq._max.ledgerSequence ?? 0n) + 1n;

      const grant = await tx.grantAward.create({
        data: {
          organizationId: actor.organizationId,
          personId: dto.personId,
          planId,
          awardType: dto.awardType,
          quantity,
          exercisePrice: isOption ? exercisePrice : undefined,
          currency,
          grantDate,
          expirationDate,
          status: 'ACTIVE',
        },
      });

      await tx.vestingSchedule.create({
        data: {
          organizationId: actor.organizationId,
          grantId: grant.id,
          startDate: vestingStartDate,
          cliffMonths: dto.cliffMonths,
          durationMonths: dto.durationMonths,
          intervalMonths: dto.intervalMonths,
        },
      });

      await tx.equityTransaction.create({
        data: {
          organizationId: actor.organizationId,
          planId,
          grantId: grant.id,
          type: 'GRANT',
          effectiveAt: grantDate,
          quantity,
          unitPrice: isOption ? exercisePrice : undefined,
          currency,
          toPersonId: dto.personId,
          ledgerSequence,
          reason: dto.notes ?? `${dto.awardType} grant`,
          createdByUserId: actor.id,
        },
      });

      return grant;
    });
  }
}
