import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

const SharePermissionValues = {
  READ: 'READ',
  WRITE: 'WRITE',
  APPROVE: 'APPROVE',
  SIGN: 'SIGN',
} as const;

type SharePermission = (typeof SharePermissionValues)[keyof typeof SharePermissionValues];

export class CreateRecordShareDto {
  @IsString()
  resourceType!: string;

  @IsString()
  resourceId!: string;

  @IsUUID()
  personId!: string;

  @IsEnum(SharePermissionValues)
  permission!: SharePermission;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
