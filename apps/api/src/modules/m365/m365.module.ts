import { Module } from '@nestjs/common';

import { PrismaService } from '../common/prisma.service.js';
import { M365Controller } from './m365.controller.js';
import { M365Service } from './m365.service.js';

@Module({
  controllers: [M365Controller],
  providers: [PrismaService, M365Service],
})
export class M365Module {}
