import { IsOptional, IsString, MinLength } from 'class-validator';

export class LocalLoginDto {
  @IsString()
  username!: string;

  @IsString()
  password!: string;

  @IsOptional()
  @IsString()
  returnTo?: string;
}

export class RotateLocalAdminPasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(12)
  newPassword!: string;
}
