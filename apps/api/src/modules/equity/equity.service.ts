import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AuthenticatedUser } from '../auth/auth.types.js';
import { PrismaService } from '../common/prisma.service.js';
import { CreateEquityTransactionDto } from './dto.js';

@Injectable()
export class EquityService {
  constructor(private readonly prisma: PrismaService) {}

  async listLedger(actor: AuthenticatedUser) {
    return this.prisma.equityTransaction.findMany({
      where: { organizationId: actor.organizationId },
      orderBy: [{ effectiveAt: 'asc' }, { ledgerSequence: 'asc' }],
      take: 500,
    });
  }

  async createTransaction(actor: AuthenticatedUser, dto: CreateEquityTransactionDto) {
    const quantity = new Prisma.Decimal(dto.quantity);
    if (quantity.lte(0)) {
      throw new BadRequestException('Quantity must be positive');
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

      const outgoing = sent._sum.quantity ?? new Prisma.Decimal(0);
      const incoming = received._sum.quantity ?? new Prisma.Decimal(0);
      const available = incoming.sub(outgoing);

      if (available.lt(quantity)) {
        throw new BadRequestException('Insufficient available balance for fromPersonId');
      }
    }

    const seq = await this.prisma.equityTransaction.aggregate({
      where: { organizationId: actor.organizationId },
      _max: { ledgerSequence: true },
    });

    const ledgerSequence = BigInt(seq._max.ledgerSequence ?? 0n) + 1n;

    return this.prisma.equityTransaction.create({
      data: {
        organizationId: actor.organizationId,
        type: dto.type,
        effectiveAt: new Date(dto.effectiveAt),
        quantity,
        unitPrice: dto.unitPrice ? new Prisma.Decimal(dto.unitPrice) : undefined,
        securityClassId: dto.securityClassId,
        fromPersonId: dto.fromPersonId,
        toPersonId: dto.toPersonId,
        reason: dto.reason,
        ledgerSequence,
        createdByUserId: actor.id,
      },
    });
  }
}
