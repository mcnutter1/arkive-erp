import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateDocumentDto {
  @IsString()
  category!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsUUID()
  personId?: string;

  @IsOptional()
  @IsUUID()
  engagementId?: string;
}

export class CreateUploadUrlDto {
  @IsString()
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(50 * 1024 * 1024)
  byteSize!: number;
}

export class FinalizeDocumentVersionDto {
  @IsString()
  storageKey!: string;

  @IsString()
  sha256!: string;

  @IsString()
  mimeType!: string;

  @IsInt()
  @Min(1)
  byteSize!: number;
}
