import { Module } from '@nestjs/common';

import { PrismaService } from '../common/prisma.service.js';
import { AccessPolicyService } from './access-policy.service.js';
import { RecordShareController } from './record-share.controller.js';

@Module({
  controllers: [RecordShareController],
  providers: [PrismaService, AccessPolicyService],
  exports: [AccessPolicyService],
})
export class AuthorizationModule {}
