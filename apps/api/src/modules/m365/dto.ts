import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateProvisioningJobDto {
  @IsUUID()
  personId!: string;

  @IsOptional()
  @IsUUID()
  engagementId?: string;

  @IsString()
  operation!: 'PROVISION' | 'DEPROVISION' | 'RECONCILE';

  @IsOptional()
  @IsString()
  requestedUsername?: string;

  @IsOptional()
  @IsString()
  requestedEmail?: string;
}
