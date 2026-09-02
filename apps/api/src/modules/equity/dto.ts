import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

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
}
