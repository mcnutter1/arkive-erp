import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { Prisma } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';

import { AuthenticatedUser } from '../auth/auth.types.js';
import { PrismaService } from '../common/prisma.service.js';
import { StorageService } from '../documents/storage.service.js';
import { createSignerLinkToken } from '../signatures/signer-link-token.js';
import { VestingService } from '../vesting/vesting.service.js';
import {
  CreateGrantESignPackageDto,
  CreateEquityPlanDto,
  CreateEquityTransactionDto,
  CreateGrantAwardDto,
  UpdateCapTableBaseDto,
  UpdateCapTablePoolsDto,
  UpdateEquityPlanDto,
  UpdateGrantAwardDto,
} from './dto.js';

export type GrantESignCaptureContext = {
  ipAddress?: string;
  userAgent?: string;
  localeHint?: string;
};

type CapTablePoolConfig = {
  advisorPoolShares: Decimal;
  managementPoolShares: Decimal;
  advisorPlanIds: Set<string>;
  managementPlanIds: Set<string>;
};

type GrantLetterPayload = {
  title: string;
  fileName: string;
  mimeType: string;
  contentBase64: string;
  previewText: string;
  defaultParticipants: Array<{
    personId: string;
    role: string;
    signingOrder: number;
  }>;
  eSignConfigured: boolean;
};

type GrantLetterAcceptanceLayout = {
  company: {
    name: string;
    title: string;
    companyName: string;
  };
  recipient: {
    name: string;
    title?: string;
  };
  footer: string;
};

type PersonWorkInfo = {
  jobTitle?: string;
  department?: string;
  companySignatory: boolean;
};

@Injectable()
export class EquityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vestingService: VestingService,
    private readonly storage: StorageService,
  ) {}

  private parseSettingObject(value: unknown): Record<string, unknown> {
    if (typeof value === 'object' && value && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }

    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        return {};
      }
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

  private readString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim();
    return normalized || undefined;
  }

  private toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((entry) => this.readString(entry))
      .filter((entry): entry is string => typeof entry === 'string');
  }

  private readWorkInfoFromProfile(hrisProfile: Prisma.JsonValue | null | undefined): PersonWorkInfo {
    const profile = this.parseSettingObject(hrisProfile);
    const workInfoPrimary = this.parseSettingObject(profile.workInfo);
    const workInfoFallback = this.parseSettingObject(profile.workProfile);
    const workContainer = this.parseSettingObject(profile.work);
    const employmentContainer = this.parseSettingObject(profile.employment);
    const workInfo =
      Object.keys(workInfoPrimary).length > 0
        ? workInfoPrimary
        : Object.keys(workInfoFallback).length > 0
          ? workInfoFallback
          : Object.keys(workContainer).length > 0
            ? workContainer
            : employmentContainer;

    return {
      jobTitle:
        this.readString(workInfo.jobTitle) ??
        this.readString(workInfo.title) ??
        this.readString(employmentContainer.jobTitle) ??
        this.readString(profile.jobTitle) ??
        this.readString(profile.title),
      department:
        this.readString(workInfo.department) ??
        this.readString(workInfo.team) ??
        this.readString(employmentContainer.department) ??
        this.readString(profile.department),
      companySignatory: this.toBoolean(
        workInfo.companySignatory ??
          workInfo.isCompanySignatory ??
          workInfo.company_signatory ??
          employmentContainer.companySignatory ??
          employmentContainer.isCompanySignatory ??
          employmentContainer.company_signatory ??
          profile.companySignatory ??
          profile.isCompanySignatory ??
          profile.company_signatory,
      ),
    };
  }

  private readTransactionInstrumentType(
    metadata: Prisma.JsonValue | null | undefined,
    fallbackType: string,
  ): string {
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
      const candidate = this.readString((metadata as Record<string, unknown>).instrumentType);
      if (candidate) {
        return candidate;
      }
    }

    if (fallbackType === 'EXERCISE') {
      return 'COMMON_EXERCISED';
    }

    if (fallbackType === 'CONVERT') {
      return 'COMMON_SAFE';
    }

    if (fallbackType === 'ISSUE') {
      return 'COMMON_FOUNDER';
    }

    return 'COMMON_OTHER';
  }

  private async getCapTablePoolConfig(organizationId: string): Promise<CapTablePoolConfig> {
    const setting = await this.prisma.systemSetting.findFirst({
      where: {
        organizationId,
        section: 'equity',
        key: 'capTablePools',
      },
      select: {
        value: true,
      },
    });

    const payload = this.parseSettingObject(setting?.value);
    const advisorPoolShares = this.parseDecimalInput(payload.advisorPoolShares ?? '0', 'advisor pool shares', {
      allowZero: true,
    });
    const managementPoolShares = this.parseDecimalInput(
      payload.managementPoolShares ?? '0',
      'management pool shares',
      { allowZero: true },
    );

    return {
      advisorPoolShares,
      managementPoolShares,
      advisorPlanIds: new Set(this.toStringArray(payload.advisorPlanIds)),
      managementPlanIds: new Set(this.toStringArray(payload.managementPlanIds)),
    };
  }

  private normalizeLocaleTag(input?: string): string | undefined {
    if (!input) {
      return undefined;
    }

    const normalized = input.trim().replaceAll('_', '-');
    if (!normalized) {
      return undefined;
    }

    return normalized.slice(0, 40);
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

  private async ensurePlanInOrg(organizationId: string, planId: string): Promise<void> {
    const plan = await this.prisma.equityPlan.findFirst({
      where: {
        id: planId,
        organizationId,
      },
      select: {
        id: true,
      },
    });

    if (!plan) {
      throw new NotFoundException('Equity plan not found for this organization');
    }
  }

  private async assertPlanCapacity(
    tx: Prisma.TransactionClient,
    organizationId: string,
    planId: string,
    requiredQuantity: Decimal,
    excludeGrantId?: string,
  ): Promise<void> {
    const plan = await tx.equityPlan.findFirst({
      where: {
        id: planId,
        organizationId,
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
        organizationId,
        planId,
        ...(excludeGrantId
          ? {
              id: {
                not: excludeGrantId,
              },
            }
          : {}),
      },
      _sum: {
        quantity: true,
      },
    });

    const alreadyGranted = this.decimal(granted._sum.quantity);
    const remaining = new Decimal(plan.reservedShares).sub(alreadyGranted);
    if (remaining.lt(requiredQuantity)) {
      throw new BadRequestException(`Plan ${plan.code} has insufficient remaining reserve for this grant`);
    }
  }

  private renderDecimal(value: Decimal | string | number | null | undefined): string {
    return this.decimal(value).toFixed(2);
  }

  private serializeLedgerTransaction<
    T extends {
      ledgerSequence: bigint;
      quantity: Decimal | string | number;
      unitPrice: Decimal | string | number | null;
    },
  >(txn: T) {
    return {
      ...txn,
      ledgerSequence: txn.ledgerSequence.toString(),
      quantity: this.renderDecimal(txn.quantity),
      unitPrice: txn.unitPrice === null ? null : this.renderDecimal(txn.unitPrice),
    };
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
        grantedShares: this.renderDecimal(granted),
        remainingShares: this.renderDecimal(remaining),
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
      grant: {
        ...grant,
        equityTxns: grant.equityTxns.map((txn) => this.serializeLedgerTransaction(txn)),
      },
      vestingPreview,
      exercisedQuantity: this.renderDecimal(exercisedQuantity),
      remainingQuantity: this.renderDecimal(remainingQuantity),
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
        subtitle: `${personName} · ${this.renderDecimal(grant.quantity)} units`,
      });
    });

    exercises.forEach((exercise) => {
      const personName = `${exercise.grant.person.legalFirstName} ${exercise.grant.person.legalLastName}`;
      const status = exercise.status;
      timeline.push({
        date: exercise.completedAt ?? exercise.requestedAt,
        type: 'EXERCISE',
        title: `Exercise ${status.toLowerCase()}`,
        subtitle: `${personName} · ${this.renderDecimal(exercise.quantity)} units`,
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
        subtitle: `${personName} · forfeited ${this.renderDecimal(termination.unvestedQuantityAtEnd)}`,
      });
    });

    timeline.sort((a, b) => b.date.getTime() - a.date.getTime());

    return {
      cards: {
        outstandingOptions: this.renderDecimal(outstandingOptions),
        outstandingRsus: this.renderDecimal(outstandingRsus),
        exercised: this.renderDecimal(exercised),
        forfeited: this.renderDecimal(forfeitedTotal),
      },
      timeline: timeline.slice(0, 120),
    };
  }

  private asNonEmptyString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim();
    return normalized || undefined;
  }

  private wrapTextForPdf(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
    const normalized = text.trim();
    if (!normalized) {
      return [''];
    }

    if (font.widthOfTextAtSize(normalized, fontSize) <= maxWidth) {
      return [normalized];
    }

    const words = normalized.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      return [''];
    }

    const segments: string[] = [];
    let current = words[0] ?? '';

    for (let i = 1; i < words.length; i += 1) {
      const nextWord = words[i] ?? '';
      const candidate = `${current} ${nextWord}`;
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        current = candidate;
        continue;
      }

      segments.push(current);
      current = nextWord;
    }

    if (current) {
      segments.push(current);
    }

    return segments;
  }

  private async renderGrantLetterPdf(
    lines: string[],
    acceptanceLayout: GrantLetterAcceptanceLayout,
  ): Promise<Uint8Array> {
    const pdf = await PDFDocument.create();
    const bodyFont = await pdf.embedFont(StandardFonts.Helvetica);
    const headingFont = await pdf.embedFont(StandardFonts.HelveticaBold);

    const pageWidth = 612;
    const pageHeight = 792;
    const margin = 42;
    const maxLineWidth = pageWidth - margin * 2;

    let page: PDFPage = pdf.addPage([pageWidth, pageHeight]);
    let cursorY = pageHeight - margin;

    const drawWrappedLine = (text: string, font: PDFFont, fontSize: number) => {
      const wrapped = this.wrapTextForPdf(text, font, fontSize, maxLineWidth);
      for (const line of wrapped) {
        if (cursorY < margin + fontSize * 1.6) {
          page = pdf.addPage([pageWidth, pageHeight]);
          cursorY = pageHeight - margin;
        }

        page.drawText(line, {
          x: margin,
          y: cursorY,
          size: fontSize,
          font,
          color: rgb(0.12, 0.15, 0.2),
        });
        cursorY -= fontSize * 1.3;
      }
    };

    for (const sourceLine of lines) {
      const line = sourceLine.trimEnd();
      if (!line.trim()) {
        cursorY -= 6;
        continue;
      }

      let font = bodyFont;
      let fontSize = 9;
      let text = line;

      if (line.startsWith('# ')) {
        font = headingFont;
        fontSize = 15;
        text = line.slice(2).trim();
      } else if (line.startsWith('## ')) {
        font = headingFont;
        fontSize = 12;
        text = line.slice(3).trim();
      } else if (line.startsWith('### ')) {
        font = headingFont;
        fontSize = 10;
        text = line.slice(4).trim();
      } else if (line.startsWith('_') && line.endsWith('_')) {
        fontSize = 8;
        text = line.slice(1, -1).trim();
      }

      drawWrappedLine(text, font, fontSize);
      cursorY -= line.startsWith('# ') ? 5 : 1;
    }

    const acceptanceBlockHeight = 136;
    if (cursorY < margin + acceptanceBlockHeight) {
      page = pdf.addPage([pageWidth, pageHeight]);
      cursorY = pageHeight - margin;
    }

    const columnGap = 16;
    const columnWidth = (maxLineWidth - columnGap) / 2;
    const leftX = margin;
    const rightX = margin + columnWidth + columnGap;
    const panelTop = cursorY - 8;
    const panelHeight = 96;

    page.drawRectangle({
      x: leftX,
      y: panelTop - panelHeight,
      width: columnWidth,
      height: panelHeight,
      borderWidth: 1,
      borderColor: rgb(0.82, 0.85, 0.9),
    });

    page.drawRectangle({
      x: rightX,
      y: panelTop - panelHeight,
      width: columnWidth,
      height: panelHeight,
      borderWidth: 1,
      borderColor: rgb(0.82, 0.85, 0.9),
    });

    const drawAcceptancePanel = (x: number, heading: string, values: string[]) => {
      let y = panelTop - 14;
      page.drawText(heading, {
        x: x + 10,
        y,
        size: 10,
        font: headingFont,
        color: rgb(0.1, 0.13, 0.18),
      });
      y -= 18;

      page.drawText('Signature: _______________________', {
        x: x + 10,
        y,
        size: 8,
        font: bodyFont,
        color: rgb(0.35, 0.4, 0.47),
      });
      y -= 14;

      for (const value of values) {
        const trimmed = value.trim();
        if (!trimmed) {
          continue;
        }
        page.drawText(trimmed, {
          x: x + 10,
          y,
          size: 9,
          font: bodyFont,
          color: rgb(0.12, 0.15, 0.2),
        });
        y -= 12;
      }
    };

    const companyTitleLine = acceptanceLayout.company.title;
    const recipientTitleLine = acceptanceLayout.recipient.title;

    drawAcceptancePanel(leftX, 'Company Acceptance', [
      acceptanceLayout.company.name,
      companyTitleLine,
      acceptanceLayout.company.companyName,
    ]);
    drawAcceptancePanel(rightX, 'Recipient Acceptance', [
      acceptanceLayout.recipient.name,
      recipientTitleLine ?? '',
    ]);

    const footerY = panelTop - panelHeight - 12;
    page.drawText(acceptanceLayout.footer, {
      x: margin,
      y: footerY,
      size: 8,
      font: bodyFont,
      color: rgb(0.35, 0.4, 0.47),
    });

    return pdf.save();
  }

  private buildPortalSigningUrl(participantId: string, token: string): string {
    const configured = this.asNonEmptyString(process.env.APP_BASE_URL);
    const corsOrigin = this.asNonEmptyString(process.env.API_CORS_ORIGIN?.split(',')[0]);
    const baseUrl = (configured ?? corsOrigin ?? 'http://localhost:3000').replace(/\/+$/, '');
    return `${baseUrl}/sign/${encodeURIComponent(participantId)}?token=${encodeURIComponent(token)}`;
  }

  private async sendGrantPacketInviteEmails(actor: AuthenticatedUser, signatureRequestId: string, title: string) {
    const participants = await this.prisma.signatureParticipant.findMany({
      where: {
        organizationId: actor.organizationId,
        signatureRequestId,
      },
      include: {
        signatureRequest: {
          select: {
            expiresAt: true,
          },
        },
        person: {
          select: {
            id: true,
            legalFirstName: true,
            legalLastName: true,
            primaryEmail: true,
            businessEmail: true,
            user: {
              select: {
                email: true,
              },
            },
          },
        },
      },
      orderBy: { signingOrder: 'asc' },
    });

    const sesSetting = await this.prisma.systemSetting.findFirst({
      where: {
        organizationId: actor.organizationId,
        section: 'integrations',
        key: 'awsSes',
      },
      select: {
        value: true,
      },
    });

    const sesConfig = this.parseSettingObject(sesSetting?.value);
    const fromEmail = this.asNonEmptyString(sesConfig.fromEmail);
    const replyToEmail = this.asNonEmptyString(sesConfig.replyToEmail);
    const region =
      this.asNonEmptyString(sesConfig.region) ??
      this.asNonEmptyString(process.env.AWS_REGION) ??
      this.asNonEmptyString(process.env.S3_REGION) ??
      'us-east-1';
    const accessKeyId =
      this.asNonEmptyString(sesConfig.accessKeyId) ?? this.asNonEmptyString(process.env.AWS_ACCESS_KEY_ID);
    const secretAccessKey =
      this.asNonEmptyString(sesConfig.secretAccessKey) ??
      this.asNonEmptyString(process.env.AWS_SECRET_ACCESS_KEY);

    const results = participants.map((participant) => ({
      participantId: participant.id,
      personId: participant.personId,
      url: this.buildPortalSigningUrl(
        participant.id,
        createSignerLinkToken({
          participantId: participant.id,
          organizationId: participant.organizationId,
          expiresAt: participant.signatureRequest.expiresAt ?? undefined,
        }),
      ),
      email:
        this.asNonEmptyString(participant.person.primaryEmail) ??
        this.asNonEmptyString(participant.person.businessEmail) ??
        this.asNonEmptyString(participant.person.user?.email),
      status: 'SKIPPED' as 'SKIPPED' | 'SENT' | 'FAILED',
      reason: 'Not attempted',
    }));

    if (!fromEmail) {
      return {
        total: results.length,
        sent: 0,
        failed: results.length,
        results: results.map((row) => ({
          ...row,
          status: 'FAILED' as const,
          reason: 'AWS SES fromEmail is not configured',
        })),
      };
    }

    const ses = new SESClient({
      region,
      credentials:
        accessKeyId && secretAccessKey
          ? {
              accessKeyId,
              secretAccessKey,
            }
          : undefined,
    });

    const completed: Array<{
      participantId: string;
      personId: string;
      url: string;
      email?: string;
      status: 'SENT' | 'FAILED';
      reason?: string;
    }> = [];

    for (const invite of results) {
      if (!invite.email) {
        completed.push({
          ...invite,
          status: 'FAILED',
          reason: 'No email found for participant',
        });
        continue;
      }

      const participantRecord = participants.find((participant) => participant.id === invite.participantId);
      const recipientName = participantRecord
        ? `${participantRecord.person.legalFirstName} ${participantRecord.person.legalLastName}`.trim()
        : 'there';

      const body = [
        `Hello ${recipientName},`,
        '',
        `You have been requested to sign: ${title}`,
        '',
        'Open the secure signing packet using this link (no login required):',
        invite.url,
        '',
        'This is a direct signer link tied to this recipient and request.',
      ].join('\n');

      try {
        await ses.send(
          new SendEmailCommand({
            Source: fromEmail,
            Destination: {
              ToAddresses: [invite.email],
            },
            ReplyToAddresses: replyToEmail ? [replyToEmail] : undefined,
            Message: {
              Subject: {
                Data: `Signature request: ${title}`,
                Charset: 'UTF-8',
              },
              Body: {
                Text: {
                  Data: body,
                  Charset: 'UTF-8',
                },
              },
            },
          }),
        );

        completed.push({
          ...invite,
          status: 'SENT',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown SES error';
        completed.push({
          ...invite,
          status: 'FAILED',
          reason: message,
        });
      }
    }

    const sent = completed.filter((row) => row.status === 'SENT').length;
    return {
      total: completed.length,
      sent,
      failed: completed.length - sent,
      results: completed,
    };
  }

  async generateGrantLetter(
    actor: AuthenticatedUser,
    grantId: string,
    requestedSignatoryPersonId?: string,
  ): Promise<GrantLetterPayload> {
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
    const configuredSignatoryPersonId = this.readString(grantLetters.signatoryPersonId);
    const selectedSignatoryPersonId = this.readString(requestedSignatoryPersonId) ?? configuredSignatoryPersonId;

    const people = await this.prisma.person.findMany({
      where: {
        organizationId: actor.organizationId,
        id: {
          in: [...new Set([grant.personId, ...(selectedSignatoryPersonId ? [selectedSignatoryPersonId] : [])])],
        },
      },
      select: {
        id: true,
        legalFirstName: true,
        legalLastName: true,
        primaryEmail: true,
        businessEmail: true,
        hrisProfile: true,
      },
    });
    const peopleById = new Map(people.map((person) => [person.id, person]));
    const recipientPerson = peopleById.get(grant.personId);

    let signatoryName = String(grantLetters.signatoryName ?? 'Authorized Signatory');
    let signatoryTitle = String(grantLetters.signatoryTitle ?? 'Company Officer');
    let signatoryPersonId: string | undefined;

    if (selectedSignatoryPersonId) {
      if (selectedSignatoryPersonId === grant.personId) {
        if (requestedSignatoryPersonId) {
          throw new BadRequestException('Company signatory must be different from the grant recipient');
        }
      } else {
        const signatoryPerson = peopleById.get(selectedSignatoryPersonId);
        if (!signatoryPerson) {
          throw new NotFoundException('Selected company signatory was not found');
        }

        const signatoryWorkInfo = this.readWorkInfoFromProfile(signatoryPerson.hrisProfile);
        if (requestedSignatoryPersonId && !signatoryWorkInfo.companySignatory) {
          throw new BadRequestException(
            'Selected person is not marked as Company Signatory in employee profile',
          );
        }

        signatoryName = `${signatoryPerson.legalFirstName} ${signatoryPerson.legalLastName}`.trim();
        const signatoryTitleParts = [signatoryWorkInfo.jobTitle, signatoryWorkInfo.department].filter(
          (value): value is string => Boolean(value),
        );
        if (signatoryTitleParts.length > 0) {
          signatoryTitle = signatoryTitleParts.join(' - ');
        }
        signatoryPersonId = selectedSignatoryPersonId;
      }
    }

    const recipientName = `${grant.person.legalFirstName} ${grant.person.legalLastName}`;
    const recipientWorkInfo = this.readWorkInfoFromProfile(recipientPerson?.hrisProfile);
    const recipientTitleLine = [recipientWorkInfo.jobTitle, recipientWorkInfo.department]
      .filter((value): value is string => Boolean(value))
      .join(' - ');
    const grantDate = grant.grantDate ? new Date(grant.grantDate).toISOString().slice(0, 10) : '';
    const vestingSchedule = grant.vestingSchedules[0];
    const exercisePriceLine = grant.exercisePrice
      ? `${this.renderDecimal(grant.exercisePrice)} ${grant.currency}`
      : 'Not applicable (RSU award)';

    const vestingSummary = vestingSchedule
      ? `Start Date: ${new Date(vestingSchedule.startDate).toISOString().slice(0, 10)} | Cliff: ${vestingSchedule.cliffMonths} months | Duration: ${vestingSchedule.durationMonths} months | Interval: ${vestingSchedule.intervalMonths} month(s)`
      : 'No vesting schedule configured.';

    const vestingStatus = detail.vestingPreview
      ? `Current Vested Position: ${this.renderDecimal(detail.vestingPreview.vestedQuantity)} vested and ${this.renderDecimal(detail.vestingPreview.unvestedQuantity)} unvested as of ${new Date().toISOString().slice(0, 10)}.`
      : 'Current Vested Position: unavailable until schedule is configured.';

    const expirationDate = grant.expirationDate
      ? new Date(grant.expirationDate).toISOString().slice(0, 10)
      : 'Per plan and agreement terms';

    const title = `${grant.awardType} Grant Letter - ${recipientName}`;
    const fileName = `${recipientName.replace(/\s+/g, '-').toLowerCase()}-${grant.awardType.toLowerCase()}-grant-letter.pdf`;

    const bodyLines = [
      `# ${legalEntityName}`,
      '',
      '## Notice of Equity Grant',
      '',
      `Date: ${grantDate || new Date().toISOString().slice(0, 10)}`,
      '',
      'Recipient:',
      `${recipientName}`,
      `${recipientPerson?.primaryEmail ?? recipientPerson?.businessEmail ?? grant.person.primaryEmail ?? 'N/A'}`,
      '',
      'You are hereby granted the following equity award (the "Award") by the Company, subject to the terms of the governing equity incentive plan and the applicable award agreement.',
      '',
      '### Grant Details',
      '',
      `Award Type: ${grant.awardType}`,
      `Grant Quantity: ${this.renderDecimal(grant.quantity)}`,
      `Exercise Price per Share/Unit: ${exercisePriceLine}`,
      `Currency: ${grant.currency}`,
      `Grant Date: ${grantDate || new Date().toISOString().slice(0, 10)}`,
      `Expiration Date: ${expirationDate}`,
      `Plan: ${grant.plan ? `${grant.plan.code} - ${grant.plan.name}` : 'Unassigned plan reference'}`,
      '',
      '### Vesting Schedule',
      '',
      vestingSummary,
      vestingStatus,
      '',
      '### Conditions of Award',
      '',
      'This Award is subject to all terms, definitions, and conditions contained in the governing equity incentive plan and your individual award agreement, including transfer restrictions, post-termination treatment, withholding obligations, and other applicable provisions.',
      '',
      'No right to continued employment, advisory, director, or service relationship is conferred by this Award. The Company reserves all rights as described in the governing plan documents and applicable law.',
      '',
      'You are responsible for obtaining personal legal and tax advice regarding this Award and its exercise, settlement, or disposition. The Company does not provide legal or tax advice through this notice.',
      '',
      'By signing this notice, you confirm that you have reviewed and accept the Award terms and consent to electronic records and signatures for this Award package.',
      '',
      '### Acceptance',
      '',
      'Company and recipient acceptance signature blocks are included below.',
    ];

    const previewLines = [
      ...bodyLines,
      '',
      '### Company Acceptance',
      '',
      `${signatoryName}`,
      `${signatoryTitle}`,
      `${companyName}`,
      '',
      '### Recipient Acceptance',
      '',
      `${recipientName}`,
      ...(recipientTitleLine ? [recipientTitleLine] : []),
      '',
      '_Generated by Arkive Equity Workspace - native e-sign ready_',
    ];

    const previewText = previewLines.join('\n');
    const pdfBytes = await this.renderGrantLetterPdf(bodyLines, {
      company: {
        name: signatoryName,
        title: signatoryTitle,
        companyName,
      },
      recipient: {
        name: recipientName,
        title: recipientTitleLine || undefined,
      },
      footer: 'Generated by Arkive Equity Workspace - native e-sign ready',
    });

    return {
      title,
      fileName,
      mimeType: 'application/pdf',
      contentBase64: Buffer.from(pdfBytes).toString('base64'),
      previewText,
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

  async createGrantESignPackage(
    actor: AuthenticatedUser,
    grantId: string,
    dto: CreateGrantESignPackageDto,
    capture: GrantESignCaptureContext = {},
  ) {
    const detail = await this.getGrantDetail(actor, grantId);
    const grant = detail.grant;

    const signatoryPerson = await this.prisma.person.findFirst({
      where: {
        id: dto.signatoryPersonId,
        organizationId: actor.organizationId,
      },
      select: {
        id: true,
        hrisProfile: true,
      },
    });

    if (!signatoryPerson) {
      throw new NotFoundException('Selected company signatory was not found');
    }

    const signatoryWorkInfo = this.readWorkInfoFromProfile(signatoryPerson.hrisProfile);
    if (!signatoryWorkInfo.companySignatory) {
      throw new BadRequestException(
        'Selected person is not marked as Company Signatory in employee profile',
      );
    }

    if (dto.signatoryPersonId === grant.personId) {
      throw new BadRequestException('Company signatory must be different from the grant recipient');
    }

    const letter = await this.generateGrantLetter(actor, grantId, dto.signatoryPersonId);
    const letterMimeType = letter.mimeType || 'application/pdf';
    const letterBytes = Buffer.from(letter.contentBase64, 'base64');
    const expiresAt = this.parseDateInput(dto.expiresAt, 'expiresAt');

    let uploaded: { key: string; sha256: string; byteSize: number };
    try {
      uploaded = await this.storage.uploadObject(
        actor.organizationId,
        letterMimeType,
        letterBytes,
        'grant-letters',
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown storage error';
      throw new BadRequestException(`Unable to store grant letter in document storage: ${reason}`);
    }

    const requestTitle = `${letter.title} - Signature Packet`;

    const result = await this.prisma.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          organizationId: actor.organizationId,
          category: 'grant-letter',
          title: letter.title,
          personId: grant.personId,
          status: 'ACTIVE',
          version: 1,
        },
      });

      const documentVersion = await tx.documentVersion.create({
        data: {
          organizationId: actor.organizationId,
          documentId: document.id,
          versionNumber: 1,
          storageKey: uploaded.key,
          sha256: uploaded.sha256,
          mimeType: letterMimeType,
          byteSize: uploaded.byteSize,
          createdByUserId: actor.id,
        },
      });

      const signatureRequest = await tx.signatureRequest.create({
        data: {
          organizationId: actor.organizationId,
          documentId: document.id,
          documentVersionId: documentVersion.id,
          title: requestTitle,
          status: 'SENT',
          signingOrderRequired: true,
          expiresAt: expiresAt ?? undefined,
          createdByUserId: actor.id,
          participants: {
            create: [
              {
                organizationId: actor.organizationId,
                personId: grant.personId,
                signingOrder: 1,
                role: 'Recipient',
              },
              {
                organizationId: actor.organizationId,
                personId: dto.signatoryPersonId,
                signingOrder: 2,
                role: 'Company Signatory',
              },
            ],
          },
          events: {
            create: {
              organizationId: actor.organizationId,
              eventType: 'REQUEST_CREATED',
              payload: {
                source: 'equity-grant-package',
                requesterUserId: actor.id,
                originIpAddress: capture.ipAddress ?? null,
                originUserAgent: capture.userAgent ?? null,
                originLocale: this.normalizeLocaleTag(capture.localeHint) ?? null,
                createdAt: new Date().toISOString(),
              } as Prisma.InputJsonValue,
            },
          },
        },
      });

      return {
        documentId: document.id,
        documentVersionId: documentVersion.id,
        signatureRequestId: signatureRequest.id,
      };
    });

    const emailInvites = await this.sendGrantPacketInviteEmails(actor, result.signatureRequestId, requestTitle);

    return {
      ...result,
      title: letter.title,
      recipientPersonId: grant.personId,
      signatoryPersonId: dto.signatoryPersonId,
      emailInvites,
    };
  }

  async listLedger(actor: AuthenticatedUser) {
    const txns = await this.prisma.equityTransaction.findMany({
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

    return txns.map((txn) => this.serializeLedgerTransaction(txn));
  }

  async getCapTable(actor: AuthenticatedUser) {
    const [
      totalAvailableShares,
      poolConfig,
      securityClassTotals,
      latestValuation,
      grants,
      completedExercisesByGrant,
      terminations,
      txns,
    ] = await Promise.all([
      this.getConfiguredBaseOutstandingShares(actor.organizationId),
      this.getCapTablePoolConfig(actor.organizationId),
      this.prisma.securityClass.aggregate({
        where: { organizationId: actor.organizationId },
        _sum: { authorizedShares: true },
      }),
      this.prisma.valuation.findFirst({
        where: {
          organizationId: actor.organizationId,
          enterpriseValue: { not: null },
        },
        orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          effectiveDate: true,
          enterpriseValue: true,
        },
      }),
      this.prisma.grantAward.findMany({
        where: { organizationId: actor.organizationId },
        select: {
          id: true,
          personId: true,
          planId: true,
          awardType: true,
          quantity: true,
        },
      }),
      this.prisma.exerciseRequest.groupBy({
        by: ['grantId'],
        where: {
          organizationId: actor.organizationId,
          status: 'COMPLETED',
        },
        _sum: {
          quantity: true,
        },
      }),
      this.prisma.terminationRecord.findMany({
        where: {
          organizationId: actor.organizationId,
          grantId: { not: null },
        },
        orderBy: [{ grantId: 'asc' }, { terminatedAt: 'desc' }],
        select: {
          grantId: true,
          terminatedAt: true,
          unvestedQuantityAtEnd: true,
        },
      }),
      this.prisma.equityTransaction.findMany({
        where: {
          organizationId: actor.organizationId,
          OR: [{ toPersonId: { not: null } }, { fromPersonId: { not: null } }],
        },
        select: {
          type: true,
          grantId: true,
          quantity: true,
          toPersonId: true,
          fromPersonId: true,
          metadata: true,
        },
        orderBy: [{ effectiveAt: 'asc' }, { ledgerSequence: 'asc' }],
        take: 4000,
      }),
    ]);

    const exerciseByGrant = new Map<string, Decimal>();
    completedExercisesByGrant.forEach((row) => {
      exerciseByGrant.set(row.grantId, this.decimal(row._sum.quantity));
    });

    const terminationByGrant = new Map<string, { terminatedAt: Date; unvestedQuantityAtEnd: Decimal }>();
    for (const row of terminations) {
      if (!row.grantId || terminationByGrant.has(row.grantId)) {
        continue;
      }
      terminationByGrant.set(row.grantId, {
        terminatedAt: row.terminatedAt,
        unvestedQuantityAtEnd: this.decimal(row.unvestedQuantityAtEnd),
      });
    }

    const positionMap = new Map<string, { personId: string; shareType: string; shares: Decimal }>();
    const addPosition = (personId: string, shareType: string, delta: Decimal) => {
      const key = `${personId}:${shareType}`;
      const existing = positionMap.get(key);
      if (existing) {
        existing.shares = existing.shares.add(delta);
        return;
      }
      positionMap.set(key, {
        personId,
        shareType,
        shares: delta,
      });
    };

    let outstandingOptions = new Decimal(0);
    let outstandingRsus = new Decimal(0);
    let advisorAssigned = new Decimal(0);
    let advisorOutstanding = new Decimal(0);
    let advisorReturned = new Decimal(0);
    let managementAssigned = new Decimal(0);
    let managementOutstanding = new Decimal(0);
    let managementReturned = new Decimal(0);

    for (const grant of grants) {
      const grantQuantity = this.decimal(grant.quantity);
      const exercised = exerciseByGrant.get(grant.id) ?? new Decimal(0);
      const remainingAfterExercise = this.clampNonNegative(grantQuantity.sub(exercised));
      const terminated = terminationByGrant.has(grant.id);
      const returnedOnTermination = terminated ? remainingAfterExercise : new Decimal(0);
      const outstanding = terminated ? new Decimal(0) : remainingAfterExercise;

      if (grant.awardType === 'OPTION_ISO' || grant.awardType === 'OPTION_NSO') {
        outstandingOptions = outstandingOptions.add(outstanding);
      }
      if (grant.awardType === 'RSU') {
        outstandingRsus = outstandingRsus.add(outstanding);
      }

      if (outstanding.gt(0)) {
        addPosition(grant.personId, grant.awardType, outstanding);
      }

      const inAdvisorPool = grant.planId ? poolConfig.advisorPlanIds.has(grant.planId) : false;
      const inManagementPool = grant.planId
        ? poolConfig.managementPlanIds.size === 0 || poolConfig.managementPlanIds.has(grant.planId)
        : true;

      if (inAdvisorPool) {
        advisorAssigned = advisorAssigned.add(grantQuantity);
        advisorOutstanding = advisorOutstanding.add(outstanding);
        advisorReturned = advisorReturned.add(returnedOnTermination);
      } else if (inManagementPool) {
        managementAssigned = managementAssigned.add(grantQuantity);
        managementOutstanding = managementOutstanding.add(outstanding);
        managementReturned = managementReturned.add(returnedOnTermination);
      } else {
        managementAssigned = managementAssigned.add(grantQuantity);
        managementOutstanding = managementOutstanding.add(outstanding);
        managementReturned = managementReturned.add(returnedOnTermination);
      }
    }

    for (const txn of txns) {
      if (txn.type === 'GRANT') {
        continue;
      }

      const instrumentType = this.readTransactionInstrumentType(txn.metadata, txn.type);
      const quantity = this.decimal(txn.quantity);

      if (txn.toPersonId) {
        addPosition(txn.toPersonId, instrumentType, quantity);
      }
      if (txn.fromPersonId) {
        addPosition(txn.fromPersonId, instrumentType, quantity.neg());
      }
    }

    const positivePositions = Array.from(positionMap.values()).filter((row) => row.shares.gt(0));
    const personIds = Array.from(new Set(positivePositions.map((row) => row.personId)));

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

    const commonIssuedShares = positivePositions
      .filter((row) => row.shareType.startsWith('COMMON_'))
      .reduce((sum, row) => sum.add(row.shares), new Decimal(0));

    const equityInstrumentsOutstanding = outstandingOptions.add(outstandingRsus);
    const fullyDilutedShares = totalAvailableShares.gt(0)
      ? totalAvailableShares
      : commonIssuedShares.add(equityInstrumentsOutstanding);

    const valuationDenominator = fullyDilutedShares.gt(0) ? fullyDilutedShares : new Decimal(0);
    const enterpriseValue = this.decimal(latestValuation?.enterpriseValue);
    const perShareValue = valuationDenominator.gt(0)
      ? enterpriseValue.div(valuationDenominator)
      : new Decimal(0);

    const ownershipTable = positivePositions
      .map((row) => {
        const ownershipPercent = valuationDenominator.gt(0)
          ? row.shares.div(valuationDenominator).mul(100)
          : new Decimal(0);
        const estimatedValue = row.shares.mul(perShareValue);

        return {
          personId: row.personId,
          personName: peopleMap.get(row.personId) ?? 'Unknown',
          shareType: row.shareType,
          sharesOwned: this.renderDecimal(row.shares),
          ownershipPercent: ownershipPercent.toFixed(4),
          estimatedValue: estimatedValue.toFixed(2),
        };
      })
      .sort((a, b) => new Decimal(b.sharesOwned).cmp(new Decimal(a.sharesOwned)));

    const holderAggregate = new Map<string, Decimal>();
    ownershipTable.forEach((row) => {
      holderAggregate.set(row.personId, (holderAggregate.get(row.personId) ?? new Decimal(0)).add(row.sharesOwned));
    });

    const holderRows = Array.from(holderAggregate.entries())
      .map(([personId, quantity]) => ({
        personId,
        personName: peopleMap.get(personId) ?? 'Unknown',
        outstandingQuantity: this.renderDecimal(quantity),
      }))
      .sort((a, b) => new Decimal(b.outstandingQuantity).cmp(new Decimal(a.outstandingQuantity)));

    const advisorUnassigned = this.clampNonNegative(poolConfig.advisorPoolShares.sub(advisorOutstanding));
    const managementUnassigned = this.clampNonNegative(poolConfig.managementPoolShares.sub(managementOutstanding));

    const reservedConfigured = commonIssuedShares
      .add(poolConfig.advisorPoolShares)
      .add(poolConfig.managementPoolShares);
    const unassignedOverall = totalAvailableShares.gt(0)
      ? this.clampNonNegative(totalAvailableShares.sub(reservedConfigured))
      : new Decimal(0);
    const overAllocated = totalAvailableShares.gt(0) && reservedConfigured.gt(totalAvailableShares)
      ? reservedConfigured.sub(totalAvailableShares)
      : new Decimal(0);

    const authorizedShares = this.decimal(securityClassTotals._sum.authorizedShares);

    return {
      generatedAt: new Date().toISOString(),
      valuation: {
        sourceValuationId: latestValuation?.id ?? null,
        effectiveDate: latestValuation?.effectiveDate?.toISOString() ?? null,
        enterpriseValue: this.renderDecimal(enterpriseValue),
        perShareValue: perShareValue.toFixed(6),
        denominatorShares: this.renderDecimal(valuationDenominator),
      },
      shares: {
        totalAvailableShares: this.renderDecimal(totalAvailableShares),
        issuedCommonShares: this.renderDecimal(commonIssuedShares),
        advisorPoolShares: this.renderDecimal(poolConfig.advisorPoolShares),
        managementPoolShares: this.renderDecimal(poolConfig.managementPoolShares),
        unassignedOverallShares: this.renderDecimal(unassignedOverall),
        overAllocatedShares: this.renderDecimal(overAllocated),
        baseOutstandingShares: this.renderDecimal(totalAvailableShares),
        authorizedShares: this.renderDecimal(authorizedShares),
        outstandingOptions: this.renderDecimal(outstandingOptions),
        outstandingRsus: this.renderDecimal(outstandingRsus),
        equityInstrumentsOutstanding: this.renderDecimal(equityInstrumentsOutstanding),
        fullyDilutedShares: this.renderDecimal(fullyDilutedShares),
      },
      pools: {
        advisor: {
          configuredShares: this.renderDecimal(poolConfig.advisorPoolShares),
          assignedShares: this.renderDecimal(advisorAssigned),
          outstandingShares: this.renderDecimal(advisorOutstanding),
          returnedShares: this.renderDecimal(advisorReturned),
          unassignedShares: this.renderDecimal(advisorUnassigned),
          planIds: Array.from(poolConfig.advisorPlanIds),
        },
        management: {
          configuredShares: this.renderDecimal(poolConfig.managementPoolShares),
          assignedShares: this.renderDecimal(managementAssigned),
          outstandingShares: this.renderDecimal(managementOutstanding),
          returnedShares: this.renderDecimal(managementReturned),
          unassignedShares: this.renderDecimal(managementUnassigned),
          planIds: Array.from(poolConfig.managementPlanIds),
        },
      },
      optionPool: {
        reservedShares: this.renderDecimal(poolConfig.managementPoolShares),
        grantedShares: this.renderDecimal(managementAssigned),
        remainingShares: this.renderDecimal(managementUnassigned),
      },
      holders: holderRows,
      ownershipTable,
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
          outstandingShares: this.renderDecimal(outstandingShares),
        } as Prisma.InputJsonValue,
        updatedByUserId: actor.id,
      },
      create: {
        organizationId: actor.organizationId,
        section: 'equity',
        key: 'capTableBase',
        value: {
          outstandingShares: this.renderDecimal(outstandingShares),
        } as Prisma.InputJsonValue,
        updatedByUserId: actor.id,
      },
    });

    return this.getCapTable(actor);
  }

  async updateCapTablePools(actor: AuthenticatedUser, dto: UpdateCapTablePoolsDto) {
    const advisorPoolShares = this.parseDecimalInput(dto.advisorPoolShares, 'advisor pool shares', {
      allowZero: true,
    });
    const managementPoolShares = this.parseDecimalInput(dto.managementPoolShares, 'management pool shares', {
      allowZero: true,
    });

    if (dto.advisorPlanIds && dto.advisorPlanIds.length > 0) {
      const found = await this.prisma.equityPlan.count({
        where: {
          organizationId: actor.organizationId,
          id: { in: dto.advisorPlanIds },
        },
      });
      if (found !== dto.advisorPlanIds.length) {
        throw new BadRequestException('One or more advisor pool plan IDs are invalid');
      }
    }

    if (dto.managementPlanIds && dto.managementPlanIds.length > 0) {
      const found = await this.prisma.equityPlan.count({
        where: {
          organizationId: actor.organizationId,
          id: { in: dto.managementPlanIds },
        },
      });
      if (found !== dto.managementPlanIds.length) {
        throw new BadRequestException('One or more management pool plan IDs are invalid');
      }
    }

    await this.prisma.systemSetting.upsert({
      where: {
        organizationId_section_key: {
          organizationId: actor.organizationId,
          section: 'equity',
          key: 'capTablePools',
        },
      },
      update: {
        value: {
          advisorPoolShares: this.renderDecimal(advisorPoolShares),
          managementPoolShares: this.renderDecimal(managementPoolShares),
          advisorPlanIds: dto.advisorPlanIds ?? [],
          managementPlanIds: dto.managementPlanIds ?? [],
        } as Prisma.InputJsonValue,
        updatedByUserId: actor.id,
      },
      create: {
        organizationId: actor.organizationId,
        section: 'equity',
        key: 'capTablePools',
        value: {
          advisorPoolShares: this.renderDecimal(advisorPoolShares),
          managementPoolShares: this.renderDecimal(managementPoolShares),
          advisorPlanIds: dto.advisorPlanIds ?? [],
          managementPlanIds: dto.managementPlanIds ?? [],
        } as Prisma.InputJsonValue,
        updatedByUserId: actor.id,
      },
    });

    return this.getCapTable(actor);
  }

  async createTransaction(actor: AuthenticatedUser, dto: CreateEquityTransactionDto) {
    const quantity = this.parseDecimalInput(dto.quantity, 'quantity');
    const effectiveAt = this.parseDateInput(dto.effectiveAt, 'effectiveAt', true) as Date;
    const instrumentType = dto.instrumentType?.trim().toUpperCase();

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

    const txn = await this.prisma.equityTransaction.create({
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
        metadata: instrumentType
          ? ({
              instrumentType,
            } as Prisma.InputJsonValue)
          : undefined,
        ledgerSequence,
        createdByUserId: actor.id,
      },
    });

    return this.serializeLedgerTransaction(txn);
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
    const poolConfig = await this.getCapTablePoolConfig(actor.organizationId);

    if (!planId) {
      throw new BadRequestException('Grants must be assigned to a management equity pool plan');
    }

    if (poolConfig.managementPlanIds.size > 0 && !poolConfig.managementPlanIds.has(planId)) {
      throw new BadRequestException('Selected plan is not configured as a management equity pool');
    }

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

    const grantDate = this.parseDateInput(dto.grantDate, 'grantDate', true) as Date;
    const vestingStartDate = this.parseDateInput(dto.vestingStartDate, 'vestingStartDate', true) as Date;
    const expirationDate = this.parseDateInput(dto.expirationDate, 'expirationDate');
    const currency = (dto.currency ?? 'USD').trim().toUpperCase();

    if (!currency) {
      throw new BadRequestException('Currency is required');
    }

    return this.prisma.$transaction(async (tx) => {
      if (planId) {
        await this.assertPlanCapacity(tx, actor.organizationId, planId, quantity);
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

  async updatePlan(actor: AuthenticatedUser, planId: string, dto: UpdateEquityPlanDto) {
    const reservedShares = this.parseDecimalInput(dto.reservedShares, 'reserved shares');
    const name = dto.name.trim();

    if (!name) {
      throw new BadRequestException('Plan name is required');
    }

    await this.ensurePlanInOrg(actor.organizationId, planId);

    const granted = await this.prisma.grantAward.aggregate({
      where: {
        organizationId: actor.organizationId,
        planId,
      },
      _sum: {
        quantity: true,
      },
    });

    const alreadyGranted = this.decimal(granted._sum.quantity);
    if (reservedShares.lt(alreadyGranted)) {
      throw new BadRequestException('Reserved shares cannot be less than already granted shares in this plan');
    }

    return this.prisma.equityPlan.update({
      where: {
        id: planId,
      },
      data: {
        name,
        reservedShares,
        effectiveDate: this.parseDateInput(dto.effectiveDate, 'effective date'),
        expiryDate: this.parseDateInput(dto.expiryDate, 'expiry date'),
        status: dto.status ?? undefined,
      },
    });
  }

  async updateGrant(actor: AuthenticatedUser, grantId: string, dto: UpdateGrantAwardDto) {
    const quantity = this.parseDecimalInput(dto.quantity, 'grant quantity');

    if (dto.durationMonths < dto.cliffMonths) {
      throw new BadRequestException('Vesting duration must be greater than or equal to cliff months');
    }

    if (dto.durationMonths % dto.intervalMonths !== 0) {
      throw new BadRequestException('Vesting duration must divide evenly by interval months');
    }

    const existing = await this.prisma.grantAward.findFirst({
      where: {
        id: grantId,
        organizationId: actor.organizationId,
      },
      include: {
        vestingSchedules: {
          orderBy: {
            createdAt: 'asc',
          },
          take: 1,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Grant not found');
    }

    const [exerciseCount, terminationCount] = await this.prisma.$transaction([
      this.prisma.exerciseRequest.count({
        where: {
          organizationId: actor.organizationId,
          grantId,
        },
      }),
      this.prisma.terminationRecord.count({
        where: {
          organizationId: actor.organizationId,
          grantId,
        },
      }),
    ]);

    if (exerciseCount > 0 || terminationCount > 0) {
      throw new BadRequestException(
        'This grant already has lifecycle events and cannot be edited. Create a correcting transaction instead.',
      );
    }

    await this.ensurePersonInOrg(actor.organizationId, dto.personId);

    const planId = dto.planId?.trim() || undefined;
    const poolConfig = await this.getCapTablePoolConfig(actor.organizationId);

    if (!planId) {
      throw new BadRequestException('Grants must be assigned to a management equity pool plan');
    }

    if (poolConfig.managementPlanIds.size > 0 && !poolConfig.managementPlanIds.has(planId)) {
      throw new BadRequestException('Selected plan is not configured as a management equity pool');
    }

    await this.ensurePlanInOrg(actor.organizationId, planId);

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

    const grantDate = this.parseDateInput(dto.grantDate, 'grantDate', true) as Date;
    const vestingStartDate = this.parseDateInput(dto.vestingStartDate, 'vestingStartDate', true) as Date;
    const expirationDate = this.parseDateInput(dto.expirationDate, 'expirationDate');
    const currency = (dto.currency ?? 'USD').trim().toUpperCase();

    if (!currency) {
      throw new BadRequestException('Currency is required');
    }

    return this.prisma.$transaction(async (tx) => {
      if (planId) {
        await this.assertPlanCapacity(tx, actor.organizationId, planId, quantity, grantId);
      }

      const updatedGrant = await tx.grantAward.update({
        where: {
          id: grantId,
        },
        data: {
          personId: dto.personId,
          planId,
          awardType: dto.awardType,
          quantity,
          exercisePrice: isOption ? exercisePrice : null,
          currency,
          grantDate,
          expirationDate,
        },
      });

      const currentSchedule = existing.vestingSchedules[0];
      if (currentSchedule) {
        await tx.vestingSchedule.update({
          where: {
            id: currentSchedule.id,
          },
          data: {
            startDate: vestingStartDate,
            cliffMonths: dto.cliffMonths,
            durationMonths: dto.durationMonths,
            intervalMonths: dto.intervalMonths,
          },
        });
      } else {
        await tx.vestingSchedule.create({
          data: {
            organizationId: actor.organizationId,
            grantId,
            startDate: vestingStartDate,
            cliffMonths: dto.cliffMonths,
            durationMonths: dto.durationMonths,
            intervalMonths: dto.intervalMonths,
          },
        });
      }

      await tx.equityTransaction.updateMany({
        where: {
          organizationId: actor.organizationId,
          grantId,
          type: 'GRANT',
        },
        data: {
          planId,
          toPersonId: dto.personId,
          quantity,
          unitPrice: isOption ? exercisePrice : null,
          currency,
          effectiveAt: grantDate,
          reason: dto.notes ?? `${dto.awardType} grant`,
        },
      });

      return updatedGrant;
    });
  }

  async deleteGrant(actor: AuthenticatedUser, grantId: string) {
    const existing = await this.prisma.grantAward.findFirst({
      where: {
        id: grantId,
        organizationId: actor.organizationId,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Grant not found');
    }

    const [exerciseCount, terminationCount] = await this.prisma.$transaction([
      this.prisma.exerciseRequest.count({
        where: {
          organizationId: actor.organizationId,
          grantId,
        },
      }),
      this.prisma.terminationRecord.count({
        where: {
          organizationId: actor.organizationId,
          grantId,
        },
      }),
    ]);

    if (exerciseCount > 0 || terminationCount > 0) {
      throw new BadRequestException(
        'This grant already has lifecycle events and cannot be deleted. Set status via governance workflow instead.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.vestingSchedule.deleteMany({
        where: {
          organizationId: actor.organizationId,
          grantId,
        },
      });

      await tx.equityTransaction.updateMany({
        where: {
          organizationId: actor.organizationId,
          grantId,
        },
        data: {
          grantId: null,
          reason: 'Unlinked from deleted grant',
        },
      });

      await tx.grantAward.delete({
        where: {
          id: grantId,
        },
      });
    });

    return {
      id: grantId,
      deleted: true,
    };
  }
}
