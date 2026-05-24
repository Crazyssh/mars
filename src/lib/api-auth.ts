/**
 * API key auth helper untuk endpoint /api/v1/*.
 *
 * Format: header `Authorization: Bearer mars_<random>` atau `X-API-Key: ...`
 */
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "./prisma";

export interface ApiUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "user";
}

export function generateApiKey(): string {
  return `mars_${randomBytes(24).toString("hex")}`;
}

function extractKey(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth) {
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m) return m[1].trim();
  }
  const x = req.headers.get("x-api-key");
  if (x) return x.trim();
  return null;
}

export async function requireApiKey(
  req: NextRequest
): Promise<
  | { user: ApiUser; error: null }
  | { user: null; error: NextResponse }
> {
  const key = extractKey(req);
  if (!key) {
    return {
      user: null,
      error: NextResponse.json(
        { error: "Missing API key. Use Authorization: Bearer <key> or X-API-Key: <key>" },
        { status: 401 }
      ),
    };
  }

  const user = await prisma.user.findUnique({
    where: { apiKey: key },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!user) {
    return {
      user: null,
      error: NextResponse.json({ error: "Invalid API key" }, { status: 401 }),
    };
  }

  return {
    user: user as ApiUser,
    error: null,
  };
}
