import { IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

const EquityPlanStatusValues = ['DRAFT', 'ACTIVE', 'PAUSED', 'RETIRED'] as const;
type EquityPlanStatus = (typeof EquityPlanStatusValues)[number];

export class CreateEquityTransactionDto {
  @IsString()
  type!:
    | 'ISSUE'
    | 'GRANT'
    | 'VEST'
    | 'EXERCISE'
    | 'CANCEL'
    | 'TRANSFER'
    | 'CONVERT'
    | 'SPLIT'
    | 'REVERSE'
    | 'CORRECT';

  @IsDateString()
  effectiveAt!: string;

  @IsString()
  quantity!: string;

  @IsOptional()
  @IsString()
  unitPrice?: string;

  @IsOptional()
  @IsUUID()
  securityClassId?: string;

  @IsOptional()
  @IsUUID()
  fromPersonId?: string;

  @IsOptional()
  @IsUUID()
  toPersonId?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  instrumentType?: string;
}

const GrantAwardTypeValues = ['OPTION_ISO', 'OPTION_NSO', 'RSU'] as const;
type GrantAwardType = (typeof GrantAwardTypeValues)[number];

export class CreateGrantAwardDto {
  @IsUUID()
  personId!: string;

  @IsIn(GrantAwardTypeValues)
  awardType!: GrantAwardType;

  @IsString()
  quantity!: string;

  @IsOptional()
  @IsString()
  exercisePrice?: string;

  @IsOptional()
  @IsUUID()
  planId?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsDateString()
  grantDate!: string;

  @IsOptional()
  @IsDateString()
  expirationDate?: string;

  @IsDateString()
  vestingStartDate!: string;

  @IsInt()
  @Min(0)
  @Max(120)
  cliffMonths!: number;

  @IsInt()
  @Min(1)
  @Max(240)
  durationMonths!: number;

  @IsInt()
  @Min(1)
  @Max(60)
  intervalMonths!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateEquityPlanDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsString()
  reservedShares!: string;

  @IsOptional()
  @IsDateString()
  effectiveDate?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  @IsIn(EquityPlanStatusValues)
  status?: EquityPlanStatus;
}

export class UpdateCapTableBaseDto {
  @IsString()
  outstandingShares!: string;
}

export class UpdateCapTablePoolsDto {
  @IsString()
  advisorPoolShares!: string;

  @IsString()
  managementPoolShares!: string;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  advisorPlanIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  managementPlanIds?: string[];
}

export class UpdateGrantAwardDto {
  @IsUUID()
  personId!: string;

  @IsIn(GrantAwardTypeValues)
  awardType!: GrantAwardType;

  @IsString()
  quantity!: string;

  @IsOptional()
  @IsString()
  exercisePrice?: string;

  @IsOptional()
  @IsUUID()
  planId?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsDateString()
  grantDate!: string;

  @IsOptional()
  @IsDateString()
  expirationDate?: string;

  @IsDateString()
  vestingStartDate!: string;

  @IsInt()
  @Min(0)
  @Max(120)
  cliffMonths!: number;

  @IsInt()
  @Min(1)
  @Max(240)
  durationMonths!: number;

  @IsInt()
  @Min(1)
  @Max(60)
  intervalMonths!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateGrantESignPackageDto {
  @IsUUID()
  signatoryPersonId!: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class UpdateEquityPlanDto {
  @IsString()
  name!: string;

  @IsString()
  reservedShares!: string;

  @IsOptional()
  @IsDateString()
  effectiveDate?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  @IsIn(EquityPlanStatusValues)
  status?: EquityPlanStatus;
}
