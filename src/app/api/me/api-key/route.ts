import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateApiKey } from "@/lib/api-auth";

/**
 * GET /api/me/api-key — return masked API key + tanggal generate.
 */
export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const user = await prisma.user.findUnique({
    where: { id: auth.user.id },
    select: { apiKey: true, apiKeyAt: true },
  });
  return NextResponse.json({
    data: {
      hasKey: !!user?.apiKey,
      masked: user?.apiKey ? mask(user.apiKey) : null,
      createdAt: user?.apiKeyAt ?? null,
    },
  });
}

/**
 * POST /api/me/api-key — generate / regenerate.
 * Return key utuh SEKALI di response. Setelah itu cuma masked.
 */
export async function POST() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const newKey = generateApiKey();
  await prisma.user.update({
    where: { id: auth.user.id },
    data: { apiKey: newKey, apiKeyAt: new Date() },
  });
  return NextResponse.json({ data: { apiKey: newKey } });
}

/**
 * DELETE /api/me/api-key — revoke.
 */
export async function DELETE() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  await prisma.user.update({
    where: { id: auth.user.id },
    data: { apiKey: null, apiKeyAt: null },
  });
  return NextResponse.json({ ok: true });
}

function mask(key: string): string {
  if (key.length <= 12) return "****";
  return key.slice(0, 8) + "..." + key.slice(-4);
}
