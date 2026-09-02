import { Module } from '@nestjs/common';

import { PrismaService } from '../common/prisma.service.js';
import { ValuationsController } from './valuations.controller.js';
import { ValuationsService } from './valuations.service.js';

@Module({
  controllers: [ValuationsController],
  providers: [PrismaService, ValuationsService],
})
export class ValuationsModule {}
