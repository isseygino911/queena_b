/**
 * AWS CloudFront Configuration
 * Generates signed URLs for S3 content via CloudFront
 */

import { getSignedUrl } from '@aws-sdk/cloudfront-signer';

// CloudFront configuration
const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN || ''; // e.g., d1234.cloudfront.net
const CLOUDFRONT_KEY_PAIR_ID = process.env.CLOUDFRONT_KEY_PAIR_ID || '';
const CLOUDFRONT_PRIVATE_KEY = process.env.CLOUDFRONT_PRIVATE_KEY || '';

// 7 days in seconds
const SEVEN_DAYS = 7 * 24 * 60 * 60;

/**
 * Generate a signed CloudFront URL
 * @param s3Key - S3 object key (e.g., tracks/uuid/processed/file.wav)
 * @param expirationSeconds - URL expiration time (default: 7 days)
 * @returns Signed CloudFront URL
 */
export function getCloudFrontSignedUrl(
  s3Key: string,
  expirationSeconds: number = SEVEN_DAYS
): string {
  if (!CLOUDFRONT_DOMAIN || !CLOUDFRONT_KEY_PAIR_ID || !CLOUDFRONT_PRIVATE_KEY) {
    throw new Error('CloudFront configuration missing');
  }

  const url = `https://${CLOUDFRONT_DOMAIN}/${s3Key}`;
  const dateLessThan = new Date(Date.now() + expirationSeconds * 1000);

  return getSignedUrl({
    url,
    keyPairId: CLOUDFRONT_KEY_PAIR_ID,
    privateKey: CLOUDFRONT_PRIVATE_KEY,
    dateLessThan: dateLessThan.toISOString(),
  });
}

/**
 * Generate signed URL from S3 URL
 * Extracts the key from S3 URL and creates CloudFront signed URL
 */
export function getCloudFrontUrlFromS3(
  s3Url: string,
  expirationSeconds: number = SEVEN_DAYS
): string | null {
  try {
    const urlObj = new URL(s3Url);
    // Extract path without leading slash
    const key = urlObj.pathname.substring(1);
    return getCloudFrontSignedUrl(key, expirationSeconds);
  } catch {
    return null;
  }
}

/**
 * Extract S3 key from S3 URL (for reference)
 */
export function getS3KeyFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname.substring(1);
  } catch {
    return null;
  }
}
