import { createHash, timingSafeEqual } from "node:crypto";

import type { FastifyReply, FastifyRequest } from "fastify";

function hashValue(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function extractBearerToken(authorizationHeader?: string): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
}

export function isAuthorized(authorizationHeader?: string): boolean {
  const expectedApiKey = process.env.API_KEY;
  const token = extractBearerToken(authorizationHeader);

  if (!expectedApiKey || !token) {
    return false;
  }

  return timingSafeEqual(hashValue(token), hashValue(expectedApiKey));
}

export function validateAuth(request: FastifyRequest): boolean {
  const authorizationHeader = typeof request.headers.authorization === "string" ? request.headers.authorization : undefined;
  return isAuthorized(authorizationHeader);
}

export async function enforceAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!validateAuth(request)) {
    reply.code(401).send({
      success: false,
      error: "Unauthorized",
    });
  }
}
