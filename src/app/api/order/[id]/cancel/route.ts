import { NextRequest, NextResponse } from "next/server";
import { mars } from "@/lib/mars";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { id } = await ctx.params;

  // Ownership check
  const log = await prisma.orderLog.findFirst({
    where: { orderId: id, userId: auth.user.id },
  });
  if (!log) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  try {
    // Teruskan ke provider — keputusan cancel murni dari jawaban provider.
    const res = await mars.cancelOrder(id);
    if (!res.success) {
      // Provider nolak (mis. belum boleh dibatalkan / sudah ada OTP).
      return NextResponse.json(
        { error: res.message || "Order tidak bisa dibatalkan", code: "CANCEL_REJECTED" },
        { status: 409 }
      );
    }
    await prisma.orderLog
      .updateMany({
        where: { orderId: id, outcome: "pending" },
        data: { outcome: "cancelled" },
      })
      .catch(() => undefined);
    return NextResponse.json({ ok: true, message: res.message }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
