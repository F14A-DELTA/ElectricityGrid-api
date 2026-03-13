import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const bucketName = process.env.S3_BUCKET ?? process.env.OBJECT_STORAGE_BUCKET ?? "";
const region = process.env.AWS_REGION ?? process.env.OBJECT_STORAGE_REGION ?? "us-east-1";

const accessKeyId = process.env.AWS_ACCESS_KEY_ID ?? process.env.OBJECT_STORAGE_ACCESS_KEY;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY ?? process.env.OBJECT_STORAGE_SECRET_KEY;
const sessionToken = process.env.AWS_SESSION_TOKEN ?? process.env.OBJECT_STORAGE_SESSION_TOKEN;
