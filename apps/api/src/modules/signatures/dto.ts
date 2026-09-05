import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
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
  @MaxLength(2000)
  consentText!: string;

  @IsIn(['DRAWN', 'TYPED'])
  signatureType!: 'DRAWN' | 'TYPED';

  @IsOptional()
  @IsString()
  @MaxLength(180)
  typedFullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500000)
  drawnSignatureDataUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  signerLocale?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  signerTimezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  signerDevice?: string;
}

export class DeclineNativeSignatureDto {
  @IsString()
  reason!: string;
}
