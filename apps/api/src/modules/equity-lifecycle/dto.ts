import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class RecordTerminationDto {
  @IsUUID()
  personId!: string;

  @IsOptional()
  @IsUUID()
  engagementId?: string;

  @IsOptional()
  @IsUUID()
  grantId?: string;

  @IsDateString()
  terminatedAt!: string;

  @IsOptional()
  @IsString()
  overrideReason?: string;
}

export class CreateExerciseRequestDto {
  @IsUUID()
  grantId!: string;

  @IsString()
  quantity!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ExerciseDecisionDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
