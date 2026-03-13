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

function isMissingObjectError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = typeof (error as { message?: unknown }).message === "string" ? error.message : "";
  return ["NoSuchKey", "NotFound", "The specified key does not exist"].some(
    (token) => error.name === token || message.includes(token),
  );
}

export async function putJson(key: string, data: unknown, maxAge: number): Promise<void> {
  const cacheControl = maxAge > 0 ? `max-age=${maxAge}, public` : "no-cache";

  await s3Client.send(
    new PutObjectCommand({
      Bucket: requireBucket(),
      Key: key,
      Body: JSON.stringify(data),
      ContentType: "application/json",
      CacheControl: cacheControl,
    }),
  );
}

export async function putNdjson(key: string, rows: unknown[]): Promise<void> {
  const body = rows.map((row) => JSON.stringify(row)).join("\n");

  await s3Client.send(
    new PutObjectCommand({
      Bucket: requireBucket(),
      Key: key,
      Body: body,
      ContentType: "application/x-ndjson",
    }),
  );
}

export async function getJson<T>(key: string): Promise<T | null> {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: requireBucket(),
        Key: key,
      }),
    );

    const text = await response.Body?.transformToString();
    return text ? (JSON.parse(text) as T) : null;
  } catch (error) {
    if (isMissingObjectError(error)) {
      return null;
    }

    throw error;
  }
}

export async function getNdjson<T>(key: string): Promise<T[]> {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: requireBucket(),
        Key: key,
      }),
    );

    const text = await response.Body?.transformToString();
    if (!text) {
      return [];
    }

    return text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as T);
  } catch (error) {
    if (isMissingObjectError(error)) {
      return [];
    }

    throw error;
  }
}

export async function getJsonMany<T>(keys: string[]): Promise<Array<T | null>> {
  return Promise.all(keys.map((key) => getJson<T>(key)));
}

export async function getNdjsonMany<T>(keys: string[]): Promise<T[]> {
  const rows = await Promise.all(keys.map((key) => getNdjson<T>(key)));
  return rows.flat();
}

export function getLiveKey(network?: string, region?: string): string {
  if (!network) {
    return "live/snapshot.json";
  }

  const networkPath = network.toLowerCase();
  if (!region) {
    return `live/${networkPath}/snapshot.json`;
  }

  return `live/${networkPath}/${region}.json`;
}

export function getRawKey(network: string, timestamp: Date): string {
  const { year, month, day, iso } = toUtcParts(floorToFiveMinutes(timestamp));
  return `raw/network=${network}/year=${year}/month=${month}/day=${day}/${iso}.json`;
}

export function getHourlyRollupKey(network: string, year: number, month: number, day: number, hour: number): string {
  const monthPart = pad(month);
  const dayPart = pad(day);
  const hourPart = pad(hour);
  return `rollups/network=${network}/year=${year}/month=${monthPart}/hourly/${year}-${monthPart}-${dayPart}T${hourPart}.ndjson`;
}

export function getDailyRollupKey(network: string, year: number, month: number, day: number): string {
  const monthPart = pad(month);
  const dayPart = pad(day);
  return `rollups/network=${network}/year=${year}/month=${monthPart}/daily/${year}-${monthPart}-${dayPart}.ndjson`;
}

export function getRawKeysForRange(network: string, from: Date, to: Date): string[] {
  const keys: string[] = [];
  const cursor = floorToFiveMinutes(from);
  const end = floorToFiveMinutes(to);

  while (cursor <= end) {
    keys.push(getRawKey(network, cursor));
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 5);
  }

  return keys;
}

export function getHourlyRollupKeysForRange(network: string, from: Date, to: Date): string[] {
  const keys: string[] = [];
  const cursor = floorToHour(from);
  const end = floorToHour(to);

  while (cursor <= end) {
    keys.push(
      getHourlyRollupKey(
        network,
        cursor.getUTCFullYear(),
        cursor.getUTCMonth() + 1,
        cursor.getUTCDate(),
        cursor.getUTCHours(),
      ),
    );
    cursor.setUTCHours(cursor.getUTCHours() + 1);
  }

  return keys;
}

export function getDailyRollupKeysForDays(network: string, numDays: number): string[] {
  const keys: string[] = [];
  const cursor = startOfUtcDay(new Date());

  for (let index = 0; index < numDays; index += 1) {
    const target = new Date(cursor);
    target.setUTCDate(cursor.getUTCDate() - index);
    keys.push(getDailyRollupKey(network, target.getUTCFullYear(), target.getUTCMonth() + 1, target.getUTCDate()));
  }

  return keys;
}
