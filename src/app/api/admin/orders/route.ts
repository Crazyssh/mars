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
