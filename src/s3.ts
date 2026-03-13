import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const bucketName = process.env.S3_BUCKET ?? process.env.OBJECT_STORAGE_BUCKET ?? "";
const region = process.env.AWS_REGION ?? process.env.OBJECT_STORAGE_REGION ?? "us-east-1";

const accessKeyId = process.env.AWS_ACCESS_KEY_ID ?? process.env.OBJECT_STORAGE_ACCESS_KEY;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY ?? process.env.OBJECT_STORAGE_SECRET_KEY;
const sessionToken = process.env.AWS_SESSION_TOKEN ?? process.env.OBJECT_STORAGE_SESSION_TOKEN;

export const s3Client = new S3Client({
  region,
  credentials:
    accessKeyId && secretAccessKey
      ? {
          accessKeyId,
          secretAccessKey,
          sessionToken,
        }
      : undefined,
});

function requireBucket(): string {
  if (!bucketName) {
    throw new Error("Missing S3 bucket configuration. Set S3_BUCKET.");
  }

  return bucketName;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toUtcParts(date: Date): { year: number; month: string; day: string; hour: string; iso: string } {
  return {
    year: date.getUTCFullYear(),
    month: pad(date.getUTCMonth() + 1),
    day: pad(date.getUTCDate()),
    hour: pad(date.getUTCHours()),
    iso: date.toISOString().replace(/\.\d{3}Z$/, "Z"),
  };
}

function floorToFiveMinutes(date: Date): Date {
  const floored = new Date(date);
  floored.setUTCSeconds(0, 0);
  floored.setUTCMinutes(Math.floor(floored.getUTCMinutes() / 5) * 5);
  return floored;
}

function floorToHour(date: Date): Date {
  const floored = new Date(date);
  floored.setUTCMinutes(0, 0, 0);
  return floored;
}

function startOfUtcDay(date: Date): Date {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}
