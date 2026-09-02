import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { RequirePermissions } from '../authorization/permissions.decorator.js';
import { PermissionsGuard } from '../authorization/permissions.guard.js';
import {
  CompleteNativeSignatureDto,
  CreateNativeSignatureRequestDto,
  DeclineNativeSignatureDto,
} from './dto.js';
import { SignaturesService } from './signatures.service.js';

@Controller({ path: 'signatures', version: '1' })
@UseGuards(AuthGuard, PermissionsGuard)
export class SignaturesController {
  constructor(private readonly signaturesService: SignaturesService) {}

  @Post('requests')
  @RequirePermissions('documents.sign.request')
  createRequest(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateNativeSignatureRequestDto) {
    return this.signaturesService.createNativeRequest(actor, dto);
  }

  @Get('my-requests')
  @RequirePermissions('documents.sign.self')
  listMine(@CurrentUser() actor: AuthenticatedUser) {
    return this.signaturesService.listMyRequests(actor);
  }

  @Post('participants/:participantId/sign')
  @RequirePermissions('documents.sign.self')
  signMine(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('participantId') participantId: string,
    @Body() dto: CompleteNativeSignatureDto,
    @Req() req: { ip?: string; headers: Record<string, string | undefined> },
  ) {
    return this.signaturesService.completeMySignature(
      actor,
      participantId,
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Post('participants/:participantId/decline')
  @RequirePermissions('documents.sign.self')
  declineMine(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('participantId') participantId: string,
    @Body() dto: DeclineNativeSignatureDto,
    @Req() req: { ip?: string; headers: Record<string, string | undefined> },
  ) {
    return this.signaturesService.declineMySignature(
      actor,
      participantId,
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }
}
