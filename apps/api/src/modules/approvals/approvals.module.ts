import { Module } from '@nestjs/common';

import { PrismaService } from '../common/prisma.service.js';
import { ApprovalsController } from './approvals.controller.js';
import { ApprovalsService } from './approvals.service.js';

@Module({
  controllers: [ApprovalsController],
  providers: [PrismaService, ApprovalsService],
})
export class ApprovalsModule {}
