import { Module } from '@nestjs/common';

import { PrismaService } from '../common/prisma.service.js';
import { PeopleController } from './people.controller.js';
import { PeopleService } from './people.service.js';

@Module({
  controllers: [PeopleController],
  providers: [PrismaService, PeopleService],
})
export class PeopleModule {}
