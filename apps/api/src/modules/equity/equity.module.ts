import { Module } from '@nestjs/common';

import { PrismaService } from '../common/prisma.service.js';
import { StorageService } from '../documents/storage.service.js';
import { VestingService } from '../vesting/vesting.service.js';
import { EquityController } from './equity.controller.js';
import { EquityService } from './equity.service.js';

@Module({
  controllers: [EquityController],
  providers: [PrismaService, VestingService, StorageService, EquityService],
})
export class EquityModule {}
