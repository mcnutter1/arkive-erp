import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { EngagementKind, EngagementStatus } from '@prisma/client';

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

  @IsEnum(EngagementKind)
  kind!: EngagementKind;

  @IsOptional()
  @IsEnum(EngagementStatus)
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
