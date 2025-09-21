// utils/s3.ts
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Create S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
  },
});

/**
 * Generate a presigned URL for uploading a file to S3
 * @param key - S3 object key (e.g., tenantId/openingId/timestamp_filename.pdf)
 * @param expiresIn - Expiration time in seconds (default: 15 minutes)
 */
export default async function getPresignedUrls(key: string, expiresIn = 900) {
  const bucket = process.env.AWS_S3_BUCKET as string;
  if (!bucket) throw new Error("AWS_S3_BUCKET not set in environment");

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const url = await getSignedUrl(s3Client, command, { expiresIn });
  return url;
}
