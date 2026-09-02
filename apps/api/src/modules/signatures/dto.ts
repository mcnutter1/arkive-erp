import { IsArray, IsBoolean, IsInt, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class SignatureParticipantInputDto {
  @IsUUID()
  personId!: string;

  @IsInt()
  @Min(1)
  signingOrder!: number;

  @IsString()
  role!: string;
}

export class CreateNativeSignatureRequestDto {
  @IsUUID()
  documentId!: string;

  @IsUUID()
  documentVersionId!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsBoolean()
  signingOrderRequired?: boolean;

  @IsOptional()
  @IsString()
  expiresAt?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SignatureParticipantInputDto)
  participants!: SignatureParticipantInputDto[];
}

export class CompleteNativeSignatureDto {
  @IsString()
  consentText!: string;
}

export class DeclineNativeSignatureDto {
  @IsString()
  reason!: string;
}
