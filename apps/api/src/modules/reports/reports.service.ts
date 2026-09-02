import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AuthenticatedUser } from '../auth/auth.types.js';
import { PrismaService } from '../common/prisma.service.js';

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async capTableSummary(actor: AuthenticatedUser) {
    const [issuedTo, issuedFrom] = await this.prisma.$transaction([
      this.prisma.equityTransaction.groupBy({
        by: ['toPersonId'],
        where: {
          organizationId: actor.organizationId,
          toPersonId: { not: null },
        },
        _sum: { quantity: true },
      }),
      this.prisma.equityTransaction.groupBy({
        by: ['fromPersonId'],
        where: {
          organizationId: actor.organizationId,
          fromPersonId: { not: null },
        },
        _sum: { quantity: true },
      }),
    ]);

    const outgoingMap = new Map<string, Prisma.Decimal>();
    for (const row of issuedFrom) {
      if (row.fromPersonId) {
        outgoingMap.set(row.fromPersonId, row._sum.quantity ?? new Prisma.Decimal(0));
      }
    }

    const personIds = issuedTo
      .map((row) => row.toPersonId)
      .filter((id): id is string => typeof id === 'string');

    const people = personIds.length
      ? await this.prisma.person.findMany({
          where: {
            organizationId: actor.organizationId,
            id: { in: personIds },
          },
          select: { id: true, legalFirstName: true, legalLastName: true },
        })
      : [];

    const peopleMap = new Map(people.map((p) => [p.id, `${p.legalFirstName} ${p.legalLastName}`]));

    const holdings = issuedTo
      .filter((row) => row.toPersonId)
      .map((row) => {
        const incoming = row._sum.quantity ?? new Prisma.Decimal(0);
        const outgoing = outgoingMap.get(row.toPersonId as string) ?? new Prisma.Decimal(0);
        return {
          personId: row.toPersonId as string,
          personName: peopleMap.get(row.toPersonId as string) ?? 'Unknown',
          netQuantity: incoming.sub(outgoing).toString(),
        };
      })
      .filter((h) => new Prisma.Decimal(h.netQuantity).gt(0));

    return {
      generatedAt: new Date().toISOString(),
      generatedByUserId: actor.id,
      assumptions: {
        method: 'net_incoming_minus_outgoing',
        note: 'Foundation summary for Phase delivery; finalize with full ledger engine.',
      },
      holdings,
    };
  }

  async peopleRosterCsv(actor: AuthenticatedUser): Promise<string> {
    const rows = await this.prisma.person.findMany({
      where: {
        organizationId: actor.organizationId,
        archivedAt: null,
      },
      orderBy: [{ legalLastName: 'asc' }, { legalFirstName: 'asc' }],
      select: {
        id: true,
        legalFirstName: true,
        legalLastName: true,
        preferredName: true,
        primaryEmail: true,
        businessEmail: true,
        timezone: true,
        employmentStatus: true,
      },
    });

    const header = [
      'report_date',
      'generated_by',
      'person_id',
      'legal_first_name',
      'legal_last_name',
      'preferred_name',
      'primary_email',
      'business_email',
      'timezone',
      'employment_status',
    ];

    const reportDate = new Date().toISOString();
    const lines = [header.join(',')];
    for (const row of rows) {
      lines.push(
        [
          reportDate,
          actor.id,
          row.id,
          row.legalFirstName,
          row.legalLastName,
          row.preferredName ?? '',
          row.primaryEmail ?? '',
          row.businessEmail ?? '',
          row.timezone,
          row.employmentStatus ?? '',
        ]
          .map((v) => csvEscape(v))
          .join(','),
      );
    }

    return lines.join('\n');
  }

  async equityLedgerCsv(actor: AuthenticatedUser): Promise<string> {
    const rows = await this.prisma.equityTransaction.findMany({
      where: {
        organizationId: actor.organizationId,
      },
      orderBy: [{ effectiveAt: 'asc' }, { ledgerSequence: 'asc' }],
      select: {
        id: true,
        effectiveAt: true,
        type: true,
        quantity: true,
        unitPrice: true,
        currency: true,
        ledgerSequence: true,
        reason: true,
      },
    });

    const header = [
      'report_date',
      'generated_by',
      'txn_id',
      'effective_at',
      'type',
      'quantity',
      'unit_price',
      'currency',
      'ledger_sequence',
      'reason',
    ];

    const reportDate = new Date().toISOString();
    const lines = [header.join(',')];
    for (const row of rows) {
      lines.push(
        [
          reportDate,
          actor.id,
          row.id,
          row.effectiveAt.toISOString(),
          row.type,
          row.quantity.toString(),
          row.unitPrice?.toString() ?? '',
          row.currency,
          row.ledgerSequence.toString(),
          row.reason ?? '',
        ]
          .map((v) => csvEscape(v))
          .join(','),
      );
    }

    return lines.join('\n');
  }
}
