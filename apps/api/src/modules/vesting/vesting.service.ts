import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { VestingInput, VestingResult } from './vesting.types.js';

function isLastDayOfMonth(date: Date): boolean {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
  return next.getUTCDate() === 1;
}

function addMonthsClampedUtc(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const targetMonth = month + months;
  const firstTarget = new Date(Date.UTC(year, targetMonth, 1));
  const firstAfter = new Date(Date.UTC(firstTarget.getUTCFullYear(), firstTarget.getUTCMonth() + 1, 1));
  const lastDay = new Date(firstAfter.getTime() - 24 * 60 * 60 * 1000).getUTCDate();
  const alignedDay = isLastDayOfMonth(date) ? lastDay : Math.min(day, lastDay);
  return new Date(Date.UTC(firstTarget.getUTCFullYear(), firstTarget.getUTCMonth(), alignedDay));
}

@Injectable()
export class VestingService {
  calculate(input: VestingInput): VestingResult {
    const total = new Prisma.Decimal(input.totalQuantity);
    if (total.lte(0)) {
      return {
        vestedQuantity: '0',
        unvestedQuantity: '0',
        elapsedIntervals: 0,
        totalIntervals: 0,
      };
    }

    if (input.paused) {
      return {
        vestedQuantity: '0',
        unvestedQuantity: total.toString(),
        elapsedIntervals: 0,
        totalIntervals: Math.ceil(input.durationMonths / input.intervalMonths),
      };
    }

    const totalIntervals = Math.ceil(input.durationMonths / input.intervalMonths);
    const cliffDate = addMonthsClampedUtc(input.startDate, input.cliffMonths);
    if (input.asOfDate < cliffDate) {
      return {
        vestedQuantity: '0',
        unvestedQuantity: total.toString(),
        elapsedIntervals: 0,
        totalIntervals,
      };
    }

    const endDate = addMonthsClampedUtc(input.startDate, input.durationMonths);
    let elapsedIntervals = 0;
    for (let i = 1; i <= totalIntervals; i += 1) {
      const milestone = addMonthsClampedUtc(input.startDate, i * input.intervalMonths);
      if (milestone <= input.asOfDate || input.asOfDate >= endDate) {
        elapsedIntervals = i;
      }
    }

    elapsedIntervals = Math.min(totalIntervals, elapsedIntervals);

    const vestedBase = total.mul(elapsedIntervals).div(totalIntervals);
    const acceleration = input.accelerationQuantity
      ? new Prisma.Decimal(input.accelerationQuantity)
      : new Prisma.Decimal(0);

    let vested = vestedBase.add(acceleration);
    if (vested.gt(total)) {
      vested = total;
    }

    const unvested = total.sub(vested);

    return {
      vestedQuantity: vested.toFixed(6),
      unvestedQuantity: unvested.toFixed(6),
      elapsedIntervals,
      totalIntervals,
    };
  }
}
