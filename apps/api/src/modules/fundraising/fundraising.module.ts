import { Module } from '@nestjs/common';

import { PrismaService } from '../common/prisma.service.js';
import { FundraisingController } from './fundraising.controller.js';
import { FundraisingScenariosController } from './scenarios.controller.js';
import { FundraisingService } from './fundraising.service.js';

@Module({
  controllers: [FundraisingController, FundraisingScenariosController],
  providers: [PrismaService, FundraisingService],
})
export class FundraisingModule {}
