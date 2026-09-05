import { PutObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';

@Injectable()
export class StorageService {
  private readonly bucket: string;
  private readonly client: S3Client;

  constructor() {
    this.bucket = process.env.S3_BUCKET ?? 'arkive-documents';
    this.client = new S3Client({
      region: process.env.S3_REGION ?? 'us-east-1',
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') === 'true',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
      },
    });
  }

  async createUploadUrl(orgId: string, mimeType: string): Promise<{ key: string; url: string }> {
    const key = `${orgId}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}`;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: mimeType,
    });

    const url = await getSignedUrl(this.client, command, { expiresIn: 300 });
    return { key, url };
  }

  async createDownloadUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, { expiresIn: 120 });
  }

  async uploadObject(
    orgId: string,
    mimeType: string,
    body: Uint8Array,
    subFolder = 'generated',
  ): Promise<{ key: string; sha256: string; byteSize: number }> {
    const key = `${orgId}/${new Date().toISOString().slice(0, 10)}/${subFolder}/${randomUUID()}`;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: mimeType,
      Body: body,
    });

    await this.client.send(command);

    return {
      key,
      sha256: createHash('sha256').update(body).digest('hex'),
      byteSize: body.byteLength,
    };
  }
}
