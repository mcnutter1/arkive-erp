import { Module } from '@nestjs/common';

import { AccessPolicyService } from '../authorization/access-policy.service.js';
import { PrismaService } from '../common/prisma.service.js';
import { SignaturesController } from './signatures.controller.js';
import { SignaturesService } from './signatures.service.js';

@Module({
  controllers: [SignaturesController],
  providers: [PrismaService, AccessPolicyService, SignaturesService],
})
export class SignaturesModule {}
