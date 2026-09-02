import { IsObject, IsString, MaxLength } from 'class-validator';

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
