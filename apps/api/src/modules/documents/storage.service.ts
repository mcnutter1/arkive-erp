import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';

@Injectable()
export class StorageService {
  private readonly bucket: string;
  private readonly client: S3Client;
  private bucketReadyPromise: Promise<void> | null = null;

  constructor() {
    this.bucket = (process.env.S3_BUCKET ?? 'arkive-documents').trim();
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

  private isMissingBucketError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
      return false;
    }

    const metadata = (error as { $metadata?: { httpStatusCode?: number } }).$metadata;
    const name = String((error as { name?: string }).name ?? '');
    const message = String((error as { message?: string }).message ?? '').toLowerCase();
    return (
      metadata?.httpStatusCode === 404 ||
      name === 'NoSuchBucket' ||
      message.includes('nosuchbucket') ||
      message.includes('bucket does not exist')
    );
  }

  private async ensureBucketReady(): Promise<void> {
    if (!this.bucketReadyPromise) {
      this.bucketReadyPromise = (async () => {
        try {
          await this.client.send(
            new HeadBucketCommand({
              Bucket: this.bucket,
            }),
          );
          return;
        } catch (headError) {
          if (!this.isMissingBucketError(headError)) {
            const reason = headError instanceof Error ? headError.message : 'unknown error';
            throw new Error(`Unable to access S3 bucket "${this.bucket}": ${reason}`);
          }
        }

        try {
          await this.client.send(
            new CreateBucketCommand({
              Bucket: this.bucket,
            }),
          );
        } catch (createError) {
          const reason = createError instanceof Error ? createError.message : 'unknown error';
          throw new Error(
            `S3 bucket "${this.bucket}" does not exist and could not be created automatically. ` +
              `Set S3_BUCKET to an existing bucket or create "${this.bucket}" before generating documents. ${reason}`,
          );
        }
      })();
    }

    try {
      await this.bucketReadyPromise;
    } catch (error) {
      this.bucketReadyPromise = null;
      throw error;
    }
  }

  async createUploadUrl(orgId: string, mimeType: string): Promise<{ key: string; url: string }> {
    await this.ensureBucketReady();

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
    await this.ensureBucketReady();

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, { expiresIn: 120 });
  }

  async downloadObject(key: string): Promise<Uint8Array> {
    await this.ensureBucketReady();

    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );

    const body = result.Body as
      | {
          transformToByteArray?: () => Promise<Uint8Array>;
        }
      | AsyncIterable<Uint8Array | Buffer | string>
      | undefined;

    if (!body) {
      throw new Error(`No object body returned for key "${key}"`);
    }

    if ('transformToByteArray' in body && typeof body.transformToByteArray === 'function') {
      return body.transformToByteArray();
    }

    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array | Buffer | string>) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
  }

  async uploadObject(
    orgId: string,
    mimeType: string,
    body: Uint8Array,
    subFolder = 'generated',
  ): Promise<{ key: string; sha256: string; byteSize: number }> {
    await this.ensureBucketReady();

    const key = `${orgId}/${new Date().toISOString().slice(0, 10)}/${subFolder}/${randomUUID()}`;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: mimeType,
      ContentLength: body.byteLength,
      Body: body,
    });

    try {
      await this.client.send(command);
    } catch (directError) {
      try {
        const fallbackCommand = new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ContentType: mimeType,
        });
        const signedUrl = await getSignedUrl(this.client, fallbackCommand, { expiresIn: 300 });
        const response = await fetch(signedUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': mimeType,
          },
          body: Buffer.from(body),
        });

        if (!response.ok) {
          const responseBody = await response.text().catch(() => '');
          throw new Error(
            `signed URL PUT failed (${response.status}) ${response.statusText}${
              responseBody ? `: ${responseBody.slice(0, 240)}` : ''
            }`,
          );
        }
      } catch (fallbackError) {
        const directReason = directError instanceof Error ? directError.message : 'unknown direct upload error';
        const fallbackReason =
          fallbackError instanceof Error ? fallbackError.message : 'unknown fallback upload error';
        throw new Error(`direct upload failed (${directReason}); fallback upload failed (${fallbackReason})`);
      }
    }

    return {
      key,
      sha256: createHash('sha256').update(body).digest('hex'),
      byteSize: body.byteLength,
    };
  }
}
