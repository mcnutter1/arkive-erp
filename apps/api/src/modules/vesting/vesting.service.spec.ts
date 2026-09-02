import { describe, expect, it } from 'vitest';

import { VestingService } from './vesting.service.js';

describe('VestingService', () => {
  const svc = new VestingService();

  it('returns zero before cliff', () => {
    const result = svc.calculate({
      totalQuantity: '4800',
      startDate: new Date('2024-01-01T00:00:00Z'),
      cliffMonths: 12,
      durationMonths: 48,
      intervalMonths: 1,
      asOfDate: new Date('2024-12-30T00:00:00Z'),
    });
    expect(result.vestedQuantity).toBe('0');
  });

  it('handles leap year and month-end clamp deterministically', () => {
    const result = svc.calculate({
      totalQuantity: '1200',
      startDate: new Date('2024-01-31T00:00:00Z'),
      cliffMonths: 0,
      durationMonths: 12,
      intervalMonths: 1,
      asOfDate: new Date('2024-02-29T00:00:00Z'),
    });
    expect(result.elapsedIntervals).toBe(1);
  });

  it('caps acceleration at total quantity', () => {
    const result = svc.calculate({
      totalQuantity: '100',
      startDate: new Date('2024-01-01T00:00:00Z'),
      cliffMonths: 0,
      durationMonths: 10,
      intervalMonths: 1,
      asOfDate: new Date('2024-01-15T00:00:00Z'),
      accelerationQuantity: '200',
    });
    expect(result.vestedQuantity).toBe('100.000000');
    expect(result.unvestedQuantity).toBe('0.000000');
  });
});
