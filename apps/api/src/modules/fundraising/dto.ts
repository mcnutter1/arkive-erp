import { IsObject, IsOptional, IsString } from 'class-validator';

export class CreateRoundDto {
  @IsString()
  name!: string;

  @IsString()
  stage!: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  preMoney?: string;

  @IsOptional()
  @IsString()
  postMoney?: string;
}

export class CreateScenarioDto {
  @IsString()
  name!: string;

  @IsObject()
  assumptions!: Record<string, unknown>;
}
