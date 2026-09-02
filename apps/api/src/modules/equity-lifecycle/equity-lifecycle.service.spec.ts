import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { EquityLifecycleService } from './equity-lifecycle.service.js';

const actor = { id: 'user-1', organizationId: 'org-1' } as const;

describe('EquityLifecycleService', () => {
  it('declines only submitted requests', async () => {
    const prisma = {
      exerciseRequest: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'er-1',
          organizationId: actor.organizationId,
          status: 'APPROVED',
          notes: null,
        }),
        update: vi.fn(),
      },
    } as never;

    const svc = new EquityLifecycleService(prisma, { calculate: vi.fn() } as never);

    await expect(svc.declineExerciseRequest(actor as never, 'er-1', 'missing docs')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects cancel for terminal states', async () => {
    const prisma = {
      exerciseRequest: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'er-1',
          organizationId: actor.organizationId,
          status: 'COMPLETED',
          notes: null,
        }),
        update: vi.fn(),
      },
    } as never;

    const svc = new EquityLifecycleService(prisma, { calculate: vi.fn() } as never);

    await expect(svc.cancelExerciseRequest(actor as never, 'er-1', 'operator request')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('creates ledger entry only on completion', async () => {
    const update = vi.fn().mockResolvedValue({ id: 'er-2', status: 'COMPLETED' });
    const createTxn = vi.fn().mockResolvedValue({ id: 'txn-1' });

    const prisma = {
      exerciseRequest: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'er-2',
          organizationId: actor.organizationId,
          grantId: 'grant-1',
          personId: 'person-1',
          quantity: new Prisma.Decimal('25'),
          exercisePrice: new Prisma.Decimal('1.50'),
          currency: 'USD',
          status: 'APPROVED',
          grant: {
            quantity: new Prisma.Decimal('100'),
            vestingSchedules: [
              {
                startDate: new Date('2025-01-01T00:00:00Z'),
                cliffMonths: 0,
                durationMonths: 48,
                intervalMonths: 1,
                paused: false,
              },
            ],
          },
        }),
        aggregate: vi.fn().mockResolvedValue({ _sum: { quantity: new Prisma.Decimal('10') } }),
      },
      equityTransaction: {
        aggregate: vi.fn().mockResolvedValue({ _max: { ledgerSequence: 41n } }),
      },
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          exerciseRequest: { update },
          equityTransaction: { create: createTxn },
        }),
      ),
    } as never;

    const svc = new EquityLifecycleService(prisma, {
      calculate: vi.fn().mockReturnValue({ vestedQuantity: '80.000000' }),
    } as never);

    const result = await svc.completeExerciseRequest(actor as never, 'er-2');

    expect(result).toEqual({ id: 'er-2', status: 'COMPLETED' });
    expect(update).toHaveBeenCalledTimes(1);
    expect(createTxn).toHaveBeenCalledTimes(1);
    expect(createTxn.mock.calls[0][0].data.type).toBe('EXERCISE');
    expect(createTxn.mock.calls[0][0].data.metadata.exerciseRequestId).toBe('er-2');
  });

  it('throws when exercise request is missing', async () => {
    const prisma = {
      exerciseRequest: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    } as never;

    const svc = new EquityLifecycleService(prisma, { calculate: vi.fn() } as never);

    await expect(svc.approveExerciseRequest(actor as never, 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('blocks completion after post-termination deadline', async () => {
    const prisma = {
      exerciseRequest: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'er-3',
          organizationId: actor.organizationId,
          grantId: 'grant-1',
          personId: 'person-1',
          quantity: new Prisma.Decimal('1'),
          exercisePrice: null,
          currency: 'USD',
          status: 'APPROVED',
          grant: {
            quantity: new Prisma.Decimal('10'),
            vestingSchedules: [
              {
                startDate: new Date('2025-01-01T00:00:00Z'),
                cliffMonths: 0,
                durationMonths: 12,
                intervalMonths: 1,
                paused: false,
              },
            ],
          },
        }),
        aggregate: vi.fn(),
      },
      terminationRecord: {
        findFirst: vi.fn().mockResolvedValue({
          postTerminationExerciseBy: new Date('2025-01-01T00:00:00Z'),
        }),
      },
      equityTransaction: {
        aggregate: vi.fn(),
      },
      $transaction: vi.fn(),
    } as never;

    const svc = new EquityLifecycleService(prisma, {
      calculate: vi.fn().mockReturnValue({ vestedQuantity: '10.000000' }),
    } as never);

    await expect(svc.completeExerciseRequest(actor as never, 'er-3')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
