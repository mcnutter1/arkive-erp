import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { RequirePermissions } from '../authorization/permissions.decorator.js';
import { PermissionsGuard } from '../authorization/permissions.guard.js';
import { CreateEngagementDto, CreatePersonDto, PeopleQueryDto } from './dto.js';
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

  @Post('engagements')
  @RequirePermissions('people.write')
  createEngagement(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateEngagementDto) {
    return this.peopleService.createEngagement(actor, dto);
  }
}
