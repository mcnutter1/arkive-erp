import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';

import { AuthenticatedUser } from '../auth/auth.types.js';
import { PrismaService } from '../common/prisma.service.js';
import { CreateValuationDto } from './dto.js';

@Injectable()
export class ValuationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listValuations(actor: AuthenticatedUser) {
    return this.prisma.valuation.findMany({
      where: { organizationId: actor.organizationId },
      orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createValuation(actor: AuthenticatedUser, dto: CreateValuationDto) {
    return this.prisma.valuation.create({
      data: {
        organizationId: actor.organizationId,
        valuationType: dto.valuationType,
        effectiveDate: new Date(dto.effectiveDate),
        commonFmv: dto.commonFmv ? new Decimal(dto.commonFmv) : undefined,
        enterpriseValue: dto.enterpriseValue ? new Decimal(dto.enterpriseValue) : undefined,
      },
    });
  }
}
