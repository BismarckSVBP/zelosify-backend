

import { S3Client, PutObjectCommand,GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import path from "path";

const s3Client = new S3Client({
  region: process.env.S3_AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY as string,
  },
});

// Detect Content-Type based on file extension
function getContentType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case ".pdf":
      return "application/pdf";
    case ".ppt":
      return "application/vnd.ms-powerpoint";
    case ".pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case ".doc":
      return "application/msword";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    default:
      return "application/octet-stream"; // fallback
  }
}

export async function getPresignedPutUrl(
  key: string
): Promise<string> {
  const bucket = process.env.S3_BUCKET_NAME as string;
  if (!bucket) throw new Error("S3_BUCKET_NAME not set in environment");

  const contentType = getContentType(key);

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(s3Client, command, );
}

export async function getPresignedGetUrl(
  key: string,
  expiresIn = 900 // 15 min default
): Promise<string> {
  const bucket = process.env.S3_BUCKET_NAME as string;
  if (!bucket) throw new Error("S3_BUCKET_NAME not set in environment");

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}
