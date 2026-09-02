import { Module } from '@nestjs/common';

import { PrismaService } from '../common/prisma.service.js';
import { VestingController } from './vesting.controller.js';
import { VestingService } from './vesting.service.js';

@Module({
  controllers: [VestingController],
  providers: [PrismaService, VestingService],
  exports: [VestingService],
})
export class VestingModule {}
