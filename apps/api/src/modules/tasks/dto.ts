import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID } from 'class-validator';

import { PaginationDto } from '../common/pagination.dto.js';

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

export class ListTasksQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;
}
