/**
 * AWS S3 Configuration
 * Handles S3 client setup and file operations
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'stream';

// S3 Client configuration
export const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

export const S3_BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || process.env.S3_BUCKET_NAME || '';

/**
 * Upload a file to S3
 * @param key - S3 object key (path/filename)
 * @param body - File buffer or stream
 * @param contentType - MIME type
 * @returns S3 URL of the uploaded file
 */
export async function uploadToS3(
  key: string,
  body: Buffer | Readable,
  contentType: string
): Promise<string> {
  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: S3_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
    },
  });

  await upload.done();
  
  // Return the S3 URL
  return `https://${S3_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`;
}

/**
 * Delete a file from S3
 * @param key - S3 object key
 */
export async function deleteFromS3(key: string): Promise<void> {
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: key,
    })
  );
}

/**
 * Generate S3 key for a track file
 * @param trackId - Track UUID
 * @param filename - Original filename
 * @param type - 'original' or 'processed'
 */
export function generateS3Key(trackId: string, filename: string, type: 'original' | 'processed'): string {
  const timestamp = Date.now();
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `tracks/${trackId}/${type}/${timestamp}_${safeFilename}`;
}

/**
 * Extract S3 key from S3 URL
 */
export function getKeyFromS3Url(url: string): string | null {
  try {
    const urlObj = new URL(url);
    // Remove leading slash
    return urlObj.pathname.substring(1);
  } catch {
    return null;
  }
}

/**
 * Generate a presigned URL for accessing an S3 object
 * @param s3Url - Full S3 URL
 * @param expirationSeconds - URL expiration time in seconds (default: 3600 = 1 hour)
 * @returns Presigned URL
 */
export async function getPresignedUrl(
  s3Url: string,
  expirationSeconds: number = 3600
): Promise<string | null> {
  const key = getKeyFromS3Url(s3Url);
  if (!key) return null;

  const command = new GetObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn: expirationSeconds });
}
