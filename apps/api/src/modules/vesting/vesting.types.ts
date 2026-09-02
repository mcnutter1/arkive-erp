export type VestingInput = {
  totalQuantity: string;
  startDate: Date;
  cliffMonths: number;
  durationMonths: number;
  intervalMonths: number;
  asOfDate: Date;
  paused?: boolean;
  accelerationQuantity?: string;
};

export type VestingResult = {
  vestedQuantity: string;
  unvestedQuantity: string;
  elapsedIntervals: number;
  totalIntervals: number;
};
