import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { RequirePermissions } from '../authorization/permissions.decorator.js';
import { PermissionsGuard } from '../authorization/permissions.guard.js';
import {
  CreateEngagementDto,
  CreatePersonDto,
  PeopleQueryDto,
  ResetPersonAccountPasswordDto,
  UpdatePersonDto,
  UpsertPersonAccountDto,
} from './dto.js';
import { PeopleService } from './people.service.js';

@Controller({ path: 'people', version: '1' })
@UseGuards(AuthGuard, PermissionsGuard)
export class PeopleController {
  constructor(private readonly peopleService: PeopleService) {}

  @Get()
  @RequirePermissions('people.read')
  listPeople(@CurrentUser() actor: AuthenticatedUser, @Query() query: PeopleQueryDto) {
    return this.peopleService.listPeople(actor, query);
  }

  @Post()
  @RequirePermissions('people.write')
  createPerson(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreatePersonDto) {
    return this.peopleService.createPerson(actor, dto);
  }

  @Patch(':personId')
  @RequirePermissions('people.write')
  updatePerson(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('personId') personId: string,
    @Body() dto: UpdatePersonDto,
  ) {
    return this.peopleService.updatePerson(actor, personId, dto);
  }

  @Delete(':personId')
  @RequirePermissions('people.write')
  deletePerson(@CurrentUser() actor: AuthenticatedUser, @Param('personId') personId: string) {
    return this.peopleService.deletePerson(actor, personId);
  }

  @Post('engagements')
  @RequirePermissions('people.write')
  createEngagement(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateEngagementDto) {
    return this.peopleService.createEngagement(actor, dto);
  }

  @Get(':personId/account')
  @RequirePermissions('people.write')
  getPersonAccount(@CurrentUser() actor: AuthenticatedUser, @Param('personId') personId: string) {
    return this.peopleService.getPersonAccount(actor, personId);
  }

  @Post(':personId/account')
  @RequirePermissions('people.write')
  upsertPersonAccount(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('personId') personId: string,
    @Body() dto: UpsertPersonAccountDto,
  ) {
    return this.peopleService.upsertPersonAccount(actor, personId, dto);
  }

  @Post(':personId/account/reset-password')
  @RequirePermissions('people.write')
  resetPersonAccountPassword(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('personId') personId: string,
    @Body() dto: ResetPersonAccountPasswordDto,
  ) {
    return this.peopleService.resetPersonAccountPassword(actor, personId, dto);
  }
}
