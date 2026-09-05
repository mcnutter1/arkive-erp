import { BadRequestException, Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';

import { AuthenticatedUser } from '../auth/auth.types.js';
import { PrismaService } from '../common/prisma.service.js';
import { CreateValuationDto } from './dto.js';

@Injectable()
export class ValuationsService {
  constructor(private readonly prisma: PrismaService) {}

  private parseOptionalDecimal(value: string | undefined, fieldName: string): Decimal | undefined {
    if (!value) {
      return undefined;
    }

    const normalized = value.trim().replaceAll(',', '');
    if (!normalized) {
      return undefined;
    }

    let parsed: Decimal;
    try {
      parsed = new Decimal(normalized);
    } catch {
      throw new BadRequestException(`${fieldName} must be a valid number`);
    }

    if (!parsed.isFinite() || parsed.lt(0)) {
      throw new BadRequestException(`${fieldName} must be a non-negative number`);
    }

    return parsed;
  }

  private parseEffectiveDate(value: string): Date {
    const normalized = value.trim();
    if (!normalized) {
      throw new BadRequestException('effectiveDate is required');
    }

    const isoInput = /^\d{4}-\d{2}-\d{2}$/.test(normalized)
      ? `${normalized}T00:00:00.000Z`
      : normalized;

    const parsed = new Date(isoInput);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('effectiveDate must be a valid date');
    }

    return parsed;
  }

  async listValuations(actor: AuthenticatedUser) {
    return this.prisma.valuation.findMany({
      where: { organizationId: actor.organizationId },
      orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createValuation(actor: AuthenticatedUser, dto: CreateValuationDto) {
    const valuationType = dto.valuationType.trim();
    if (!valuationType) {
      throw new BadRequestException('valuationType is required');
    }

    return this.prisma.valuation.create({
      data: {
        organizationId: actor.organizationId,
        valuationType,
        effectiveDate: this.parseEffectiveDate(dto.effectiveDate),
        commonFmv: this.parseOptionalDecimal(dto.commonFmv, 'commonFmv'),
        enterpriseValue: this.parseOptionalDecimal(dto.enterpriseValue, 'enterpriseValue'),
      },
    });
  }
}
