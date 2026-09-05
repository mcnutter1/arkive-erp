import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { RequirePermissions } from '../authorization/permissions.decorator.js';
import { PermissionsGuard } from '../authorization/permissions.guard.js';
import {
  CreateGrantESignPackageDto,
  CreateEquityPlanDto,
  CreateEquityTransactionDto,
  CreateGrantAwardDto,
  UpdateCapTableBaseDto,
  UpdateEquityPlanDto,
  UpdateGrantAwardDto,
} from './dto.js';
import { EquityService, GrantESignCaptureContext } from './equity.service.js';

type HeaderValue = string | string[] | undefined;
type CaptureRequest = {
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

function readIpAddress(req: CaptureRequest): string | undefined {
  const forwarded = firstHeader(req.headers?.['x-forwarded-for']);
  if (forwarded) {
    const candidate = forwarded.split(',')[0]?.trim();
    if (candidate) {
      return candidate;
    }
  }

  return req.ip?.trim() || undefined;
}

function readLocaleHint(req: CaptureRequest): string | undefined {
  const country =
    firstHeader(req.headers?.['x-vercel-ip-country']) ??
    firstHeader(req.headers?.['cf-ipcountry']) ??
    firstHeader(req.headers?.['x-country-code']);
  const region = firstHeader(req.headers?.['x-vercel-ip-country-region']);

  if (country && region) {
    return `${country.toUpperCase()}-${region.toUpperCase()}`;
  }

  if (country) {
    return country.toUpperCase();
  }

  const acceptLanguage = firstHeader(req.headers?.['accept-language']);
  if (!acceptLanguage) {
    return undefined;
  }

  const first = acceptLanguage.split(',')[0]?.trim();
  return first || undefined;
}

function captureContext(req: CaptureRequest): GrantESignCaptureContext {
  return {
    ipAddress: readIpAddress(req),
    userAgent: firstHeader(req.headers?.['user-agent']),
    localeHint: readLocaleHint(req),
  };
}

@Controller({ path: 'equity', version: '1' })
@UseGuards(AuthGuard, PermissionsGuard)
export class EquityController {
  constructor(private readonly equityService: EquityService) {}

  @Get('ledger')
  @RequirePermissions('equity.read')
  listLedger(@CurrentUser() actor: AuthenticatedUser) {
    return this.equityService.listLedger(actor);
  }

  @Get('dashboard')
  @RequirePermissions('equity.read')
  dashboard(@CurrentUser() actor: AuthenticatedUser) {
    return this.equityService.getDashboard(actor);
  }

  @Get('cap-table')
  @RequirePermissions('equity.read')
  capTable(@CurrentUser() actor: AuthenticatedUser) {
    return this.equityService.getCapTable(actor);
  }

  @Post('cap-table/base')
  @RequirePermissions('equity.write')
  updateCapTableBase(@CurrentUser() actor: AuthenticatedUser, @Body() dto: UpdateCapTableBaseDto) {
    return this.equityService.updateCapTableBase(actor, dto);
  }

  @Post('ledger')
  @RequirePermissions('equity.write')
  createTransaction(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateEquityTransactionDto) {
    return this.equityService.createTransaction(actor, dto);
  }

  @Get('grants')
  @RequirePermissions('equity.read')
  listGrants(@CurrentUser() actor: AuthenticatedUser) {
    return this.equityService.listGrants(actor);
  }

  @Get('grants/:grantId')
  @RequirePermissions('equity.read')
  grantDetail(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('grantId') grantId: string,
    @Query('asOf') asOf: string | undefined,
  ) {
    return this.equityService.getGrantDetail(actor, grantId, asOf);
  }

  @Get('grants/:grantId/letter')
  @RequirePermissions('equity.read')
  grantLetter(@CurrentUser() actor: AuthenticatedUser, @Param('grantId') grantId: string) {
    return this.equityService.generateGrantLetter(actor, grantId);
  }

  @Post('grants/:grantId/esign-package')
  @RequirePermissions('documents.write', 'documents.sign.request')
  createGrantESignPackage(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('grantId') grantId: string,
    @Body() dto: CreateGrantESignPackageDto,
    @Req() req: CaptureRequest,
  ) {
    return this.equityService.createGrantESignPackage(actor, grantId, dto, captureContext(req));
  }

  @Post('grants')
  @RequirePermissions('equity.write')
  createGrant(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateGrantAwardDto) {
    return this.equityService.createGrant(actor, dto);
  }

  @Patch('grants/:grantId')
  @RequirePermissions('equity.write')
  updateGrant(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('grantId') grantId: string,
    @Body() dto: UpdateGrantAwardDto,
  ) {
    return this.equityService.updateGrant(actor, grantId, dto);
  }

  @Delete('grants/:grantId')
  @RequirePermissions('equity.write')
  deleteGrant(@CurrentUser() actor: AuthenticatedUser, @Param('grantId') grantId: string) {
    return this.equityService.deleteGrant(actor, grantId);
  }

  @Get('plans')
  @RequirePermissions('equity.read')
  listPlans(@CurrentUser() actor: AuthenticatedUser) {
    return this.equityService.listPlans(actor);
  }

  @Post('plans')
  @RequirePermissions('equity.write')
  createPlan(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateEquityPlanDto) {
    return this.equityService.createPlan(actor, dto);
  }

  @Patch('plans/:planId')
  @RequirePermissions('equity.write')
  updatePlan(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('planId') planId: string,
    @Body() dto: UpdateEquityPlanDto,
  ) {
    return this.equityService.updatePlan(actor, planId, dto);
  }
}
