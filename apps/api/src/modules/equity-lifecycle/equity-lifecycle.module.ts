import { Module } from '@nestjs/common';

import { PrismaService } from '../common/prisma.service.js';
import { VestingModule } from '../vesting/vesting.module.js';
import { EquityLifecycleController } from './equity-lifecycle.controller.js';
import { EquityLifecycleService } from './equity-lifecycle.service.js';

@Module({
  imports: [VestingModule],
  controllers: [EquityLifecycleController],
  providers: [PrismaService, EquityLifecycleService],
})
export class EquityLifecycleModule {}
