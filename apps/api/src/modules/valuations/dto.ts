import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateValuationDto {
  @IsString()
  valuationType!: string;

  @IsDateString()
  effectiveDate!: string;

  @IsOptional()
  @IsString()
  commonFmv?: string;

  @IsOptional()
  @IsString()
  enterpriseValue?: string;
}
