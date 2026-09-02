import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { RequirePermissions } from '../authorization/permissions.decorator.js';
import { PermissionsGuard } from '../authorization/permissions.guard.js';
import { CreateExerciseRequestDto, ExerciseDecisionDto, RecordTerminationDto } from './dto.js';
import { EquityLifecycleService } from './equity-lifecycle.service.js';

@Controller({ path: 'equity/lifecycle', version: '1' })
@UseGuards(AuthGuard, PermissionsGuard)
export class EquityLifecycleController {
  constructor(private readonly service: EquityLifecycleService) {}

  @Post('terminations')
  @RequirePermissions('terminations.write')
  recordTermination(@CurrentUser() actor: AuthenticatedUser, @Body() dto: RecordTerminationDto) {
    return this.service.recordTermination(actor, dto);
  }

  @Post('exercise-requests')
  @RequirePermissions('exercises.write')
  createExerciseRequest(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateExerciseRequestDto) {
    return this.service.createExerciseRequest(actor, dto);
  }

  @Post('exercise-requests/:requestId/approve')
  @RequirePermissions('exercises.write')
  approveExerciseRequest(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('requestId') requestId: string,
    @Body() dto: ExerciseDecisionDto,
  ) {
    return this.service.approveExerciseRequest(actor, requestId, dto.reason);
  }

  @Post('exercise-requests/:requestId/decline')
  @RequirePermissions('exercises.write')
  declineExerciseRequest(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('requestId') requestId: string,
    @Body() dto: ExerciseDecisionDto,
  ) {
    return this.service.declineExerciseRequest(actor, requestId, dto.reason);
  }

  @Post('exercise-requests/:requestId/cancel')
  @RequirePermissions('exercises.write')
  cancelExerciseRequest(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('requestId') requestId: string,
    @Body() dto: ExerciseDecisionDto,
  ) {
    return this.service.cancelExerciseRequest(actor, requestId, dto.reason);
  }

  @Post('exercise-requests/:requestId/complete')
  @RequirePermissions('exercises.write')
  completeExerciseRequest(@CurrentUser() actor: AuthenticatedUser, @Param('requestId') requestId: string) {
    return this.service.completeExerciseRequest(actor, requestId);
  }
}
