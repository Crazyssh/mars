import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/orders — list semua order semua user (admin only).
 *
 * Query params:
 *   - success=1  → filter outcome=otp_received aja
 *   - limit=N    → batas hasil (default 100, max 500)
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const successOnly = req.nextUrl.searchParams.get("success") === "1";
  const limit = Math.min(
    Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? "100")),
    500
  );

  const orders = await prisma.orderLog.findMany({
    where: successOnly ? { outcome: "otp_received" } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  return NextResponse.json({ data: orders });
}

/**
 * DELETE /api/admin/orders — hapus order log (admin only).
 *
 * Query param:
 *   - olderThanDays=N → cuma hapus order > N hari (default: semua kecuali pending)
 *   - all=1           → hapus SEMUA termasuk pending (hati-hati)
 *
 * Default (tanpa param): hapus semua yang outcome != pending (biar order
 * yang lagi jalan gak ke-hapus).
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const all = req.nextUrl.searchParams.get("all") === "1";
  const olderThanDays = Number(req.nextUrl.searchParams.get("olderThanDays") ?? "0");

  const where: {
    outcome?: { not: string };
    createdAt?: { lt: Date };
  } = {};

  if (!all) {
    where.outcome = { not: "pending" };
  }
  if (olderThanDays > 0) {
    where.createdAt = { lt: new Date(Date.now() - olderThanDays * 86400_000) };
  }

  const result = await prisma.orderLog.deleteMany({
    where: Object.keys(where).length > 0 ? where : undefined,
  });

  return NextResponse.json({ ok: true, deleted: result.count });
}
