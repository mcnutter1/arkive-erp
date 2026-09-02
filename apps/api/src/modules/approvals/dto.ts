import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateApprovalRequestDto {
  @IsString()
  requestType!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  requiredCount?: number;
}

export class ApprovalDecisionDto {
  @IsString()
  decision!: 'APPROVED' | 'REJECTED' | 'ABSTAINED';

  @IsOptional()
  @IsString()
  comment?: string;
}
