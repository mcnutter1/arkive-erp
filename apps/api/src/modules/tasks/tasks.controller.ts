import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { RequirePermissions } from '../authorization/permissions.decorator.js';
import { PermissionsGuard } from '../authorization/permissions.guard.js';
import { CreateTaskDto } from './dto.js';
import { TasksService } from './tasks.service.js';

@Controller({ path: 'tasks', version: '1' })
@UseGuards(AuthGuard, PermissionsGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @RequirePermissions('tasks.write')
  createTask(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateTaskDto) {
    return this.tasksService.createTask(actor, dto);
  }

  @Get('my-notifications')
  @RequirePermissions('notifications.read.self')
  listMyNotifications(@CurrentUser() actor: AuthenticatedUser) {
    return this.tasksService.listMyNotifications(actor);
  }
}
