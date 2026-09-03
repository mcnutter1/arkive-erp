import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsEmail, IsEnum, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';

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
  PAUSED: 'PAUSED',
  OFFBOARDING: 'OFFBOARDING',
  TERMINATED: 'TERMINATED',
  ALUMNI: 'ALUMNI',
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

  @IsOptional()
  @IsEmail()
  businessEmail?: string;

  @IsOptional()
  @IsString()
  classification?: string;

  @IsOptional()
  @IsString()
  employmentStatus?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PersonHrisProfileDto)
  hrisProfile?: PersonHrisProfileDto;
}

class PersonAddressDto {
  @IsOptional()
  @IsString()
  line1?: string;

  @IsOptional()
  @IsString()
  line2?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsOptional()
  @IsString()
  country?: string;
}

class PersonEmergencyContactDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  relationship?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;
}

class PersonCompensationDto {
  @IsOptional()
  @IsString()
  payFrequency?: string;

  @IsOptional()
  @IsString()
  annualSalary?: string;

  @IsOptional()
  @IsString()
  hourlyRate?: string;

  @IsOptional()
  @IsString()
  currency?: string;
}

class PersonGovernmentIdsDto {
  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  nationalIdLast4?: string;

  @IsOptional()
  @IsString()
  taxIdLast4?: string;
}

class PersonHrisProfileDto {
  @IsOptional()
  @IsString()
  legalMiddleName?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  personalEmail?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  maritalStatus?: string;

  @IsOptional()
  @IsString()
  nationality?: string;

  @IsOptional()
  @IsString()
  citizenshipStatus?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PersonAddressDto)
  homeAddress?: PersonAddressDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PersonAddressDto)
  mailingAddress?: PersonAddressDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PersonEmergencyContactDto)
  emergencyContact?: PersonEmergencyContactDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PersonCompensationDto)
  compensation?: PersonCompensationDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PersonGovernmentIdsDto)
  governmentIds?: PersonGovernmentIdsDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdatePersonDto {
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
  @IsEmail()
  businessEmail?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  classification?: string;

  @IsOptional()
  @IsString()
  employmentStatus?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PersonHrisProfileDto)
  hrisProfile?: PersonHrisProfileDto;
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
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class PeopleQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;
}
