import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '../config/env.js';

let s3Client: S3Client | null = null;
const bucket = env.AWS_S3_BUCKET;

function getS3Client(): S3Client {
  if (!bucket) throw Object.assign(new Error('Image storage is not configured yet.'), { statusCode: 503 });
  s3Client ??= new S3Client({ region: env.AWS_REGION });
  return s3Client;
}

export async function uploadProductImage(file: Buffer, contentType: string, extension: string): Promise<{ key: string; url: string }> {
  const client = getS3Client();
  const key = `products/${randomUUID()}.${extension}`;
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: file,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable',
    Metadata: { purpose: 'product-image' },
  }));
  const baseUrl = env.ASSET_BASE_URL?.replace(/\/$/, '')
    ?? `https://${bucket}.s3.${env.AWS_REGION}.amazonaws.com`;
  return { key, url: `${baseUrl}/${key}` };
}

export async function deleteProductImage(key: string): Promise<void> {
  const client = getS3Client();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
