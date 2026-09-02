import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateTaskDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  assigneePersonId?: string;

  @IsOptional()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  dueAt?: Date;
}
