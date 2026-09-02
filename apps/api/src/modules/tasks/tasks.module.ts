import { Module } from '@nestjs/common';

import { PrismaService } from '../common/prisma.service.js';
import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';

@Module({
  controllers: [TasksController],
  providers: [PrismaService, TasksService],
})
export class TasksModule {}
