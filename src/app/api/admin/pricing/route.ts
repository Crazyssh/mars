import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidatePriceCache } from "@/lib/pricing";

/**
 * GET /api/admin/pricing — list semua price rules (admin only).
 */
export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const rules = await prisma.priceRule.findMany({
    orderBy: [{ serviceCode: "asc" }, { countryId: "asc" }],
  });
  return NextResponse.json({ data: rules });
}

const upsertSchema = z.object({
  serviceCode: z.enum(["wa", "tg"]),
  countryId: z.number().int().min(0).default(0),
  priceType: z.enum(["fixed", "multiply", "markup"]),
  value: z.number().int().min(0),
  active: z.boolean().optional(),
});

/**
 * POST /api/admin/pricing — upsert price rule.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 }
    );
  }
  const { serviceCode, countryId, priceType, value, active } = parsed.data;

  const rule = await prisma.priceRule.upsert({
    where: { serviceCode_countryId: { serviceCode, countryId } },
    update: { priceType, value, active: active ?? true },
    create: { serviceCode, countryId, priceType, value, active: active ?? true },
  });

  invalidatePriceCache();
  return NextResponse.json({ data: rule });
}

/**
 * DELETE /api/admin/pricing — hapus by id atau bulk reset.
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  if (body?.deleteAll) {
    const result = await prisma.priceRule.deleteMany({});
    invalidatePriceCache();
    return NextResponse.json({ ok: true, deleted: result.count });
  }
  if (!body?.id || typeof body.id !== "string") {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  await prisma.priceRule.delete({ where: { id: body.id } });
  invalidatePriceCache();
  return NextResponse.json({ ok: true });
}
