import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

import { SharePermission } from '@prisma/client';

export class CreateRecordShareDto {
  @IsString()
  resourceType!: string;

  @IsString()
  resourceId!: string;

  @IsUUID()
  personId!: string;

  @IsEnum(SharePermission)
  permission!: SharePermission;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
