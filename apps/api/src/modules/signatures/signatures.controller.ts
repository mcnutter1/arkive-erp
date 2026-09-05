import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { Public } from '../auth/public.decorator.js';
import { RequirePermissions } from '../authorization/permissions.decorator.js';
import { PermissionsGuard } from '../authorization/permissions.guard.js';
import {
  CompleteNativeSignatureDto,
  CreateNativeSignatureRequestDto,
  DeclineNativeSignatureDto,
} from './dto.js';
import { SignatureCaptureContext, SignaturesService } from './signatures.service.js';

type HeaderValue = string | string[] | undefined;
type SignatureRequestLike = {
  ip?: string;
  headers?: Record<string, HeaderValue>;
};

function firstHeader(value: HeaderValue): string | undefined {
  if (!value) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value[0]?.trim() || undefined;
  }

  return value.trim() || undefined;
}

function readIpAddress(req: SignatureRequestLike): string | undefined {
  const headers = req.headers ?? {};
  const forwarded = firstHeader(headers['x-forwarded-for']);
  if (forwarded) {
    const candidate = forwarded.split(',')[0]?.trim();
    if (candidate) {
      return candidate;
    }
  }

  return req.ip?.trim() || undefined;
}

function readLocaleHint(req: SignatureRequestLike): string | undefined {
  const headers = req.headers ?? {};
  const country =
    firstHeader(headers['x-vercel-ip-country']) ??
    firstHeader(headers['cf-ipcountry']) ??
    firstHeader(headers['x-country-code']);
  const region = firstHeader(headers['x-vercel-ip-country-region']);

  if (country && region) {
    return `${country.toUpperCase()}-${region.toUpperCase()}`;
  }

  if (country) {
    return country.toUpperCase();
  }

  const acceptLanguage = firstHeader(headers['accept-language']);
  if (!acceptLanguage) {
    return undefined;
  }

  const first = acceptLanguage.split(',')[0]?.trim();
  return first || undefined;
}

function captureContext(req: SignatureRequestLike): SignatureCaptureContext {
  return {
    ipAddress: readIpAddress(req),
    userAgent: firstHeader(req.headers?.['user-agent']),
    localeHint: readLocaleHint(req),
  };
}

@Controller({ path: 'signatures', version: '1' })
@UseGuards(AuthGuard, PermissionsGuard)
export class SignaturesController {
  constructor(private readonly signaturesService: SignaturesService) {}

  @Post('requests')
  @RequirePermissions('documents.sign.request')
  createRequest(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateNativeSignatureRequestDto,
    @Req() req: SignatureRequestLike,
  ) {
    return this.signaturesService.createNativeRequest(actor, dto, captureContext(req));
  }

  @Get('my-requests')
  @RequirePermissions('documents.sign.self')
  listMine(@CurrentUser() actor: AuthenticatedUser) {
    return this.signaturesService.listMyRequests(actor);
  }

  @Get('participants/:participantId')
  @RequirePermissions('documents.sign.self')
  packet(@CurrentUser() actor: AuthenticatedUser, @Param('participantId') participantId: string) {
    return this.signaturesService.getMyParticipantPacket(actor, participantId);
  }

  @Get('public/participants/:participantId')
  @Public()
  publicPacket(
    @Param('participantId') participantId: string,
    @Query('token') token: string | undefined,
    @Req() req: SignatureRequestLike,
  ) {
    return this.signaturesService.getPublicParticipantPacket(participantId, token, captureContext(req));
  }

  @Post('participants/:participantId/sign')
  @RequirePermissions('documents.sign.self')
  signMine(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('participantId') participantId: string,
    @Body() dto: CompleteNativeSignatureDto,
    @Req() req: SignatureRequestLike,
  ) {
    return this.signaturesService.completeMySignature(actor, participantId, dto, captureContext(req));
  }

  @Post('public/participants/:participantId/sign')
  @Public()
  signPublic(
    @Param('participantId') participantId: string,
    @Query('token') token: string | undefined,
    @Body() dto: CompleteNativeSignatureDto,
    @Req() req: SignatureRequestLike,
  ) {
    return this.signaturesService.completePublicSignature(participantId, token, dto, captureContext(req));
  }

  @Post('participants/:participantId/decline')
  @RequirePermissions('documents.sign.self')
  declineMine(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('participantId') participantId: string,
    @Body() dto: DeclineNativeSignatureDto,
    @Req() req: SignatureRequestLike,
  ) {
    return this.signaturesService.declineMySignature(actor, participantId, dto, captureContext(req));
  }

  @Post('public/participants/:participantId/decline')
  @Public()
  declinePublic(
    @Param('participantId') participantId: string,
    @Query('token') token: string | undefined,
    @Body() dto: DeclineNativeSignatureDto,
    @Req() req: SignatureRequestLike,
  ) {
    return this.signaturesService.declinePublicSignature(participantId, token, dto, captureContext(req));
  }
}
