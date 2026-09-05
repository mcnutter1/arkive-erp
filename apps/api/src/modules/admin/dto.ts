import { Type } from 'class-transformer';
import { IsArray, IsObject, IsString, MaxLength, ValidateNested } from 'class-validator';

export class UpsertSettingDto {
  @IsString()
  @MaxLength(80)
  section!: string;

  @IsString()
  @MaxLength(120)
  key!: string;

  @IsObject()
  value!: Record<string, unknown>;
}

export class RbacSectionRoleDto {
  @IsString()
  @MaxLength(80)
  section!: string;

  @IsArray()
  @IsString({ each: true })
  roleCodes!: string[];
}

export class UpdateRbacSectionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RbacSectionRoleDto)
  sections!: RbacSectionRoleDto[];
}
