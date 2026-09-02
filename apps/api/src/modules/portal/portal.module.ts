import { Module } from '@nestjs/common';

import { PrismaService } from '../common/prisma.service.js';
import { PortalController } from './portal.controller.js';
import { PortalService } from './portal.service.js';

@Module({
  controllers: [PortalController],
  providers: [PrismaService, PortalService],
})
export class PortalModule {}
