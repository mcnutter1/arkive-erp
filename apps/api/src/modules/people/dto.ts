import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

const EngagementKindValues = {
  EMPLOYEE: 'EMPLOYEE',
  CONTRACTOR: 'CONTRACTOR',
  ADVISOR: 'ADVISOR',
  DIRECTOR: 'DIRECTOR',
  INTERN: 'INTERN',
  CONSULTANT: 'CONSULTANT',
  OTHER: 'OTHER',
} as const;

const EngagementStatusValues = {
  DRAFT: 'DRAFT',
  PREBOARDING: 'PREBOARDING',
  ACTIVE: 'ACTIVE',
  LEAVE: 'LEAVE',
  TERMINATED: 'TERMINATED',
  ENDED: 'ENDED',
} as const;

type EngagementKind = (typeof EngagementKindValues)[keyof typeof EngagementKindValues];
type EngagementStatus = (typeof EngagementStatusValues)[keyof typeof EngagementStatusValues];

import { PaginationDto } from '../common/pagination.dto.js';

export class CreatePersonDto {
  @IsString()
  @MaxLength(120)
  legalFirstName!: string;

  @IsString()
  @MaxLength(120)
  legalLastName!: string;

  @IsOptional()
  @IsString()
  preferredName?: string;

  @IsOptional()
  @IsEmail()
  primaryEmail?: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}

export class CreateEngagementDto {
  @IsUUID()
  personId!: string;

  @IsEnum(EngagementKindValues)
  kind!: EngagementKind;

  @IsOptional()
  @IsEnum(EngagementStatusValues)
  status?: EngagementStatus;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  startDate?: Date;

  @IsOptional()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  endDate?: Date;
}

export class PeopleQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;
}
