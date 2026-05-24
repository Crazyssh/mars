import { NextRequest, NextResponse } from "next/server";
import { mars } from "@/lib/mars";
import { requireApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

const CANCEL_MIN_AGE_SEC = 120;

/**
 * POST /api/v1/order/:id/cancel
 * Batalkan order (min 2 menit setelah order dibuat).
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiKey(req);
  if (auth.error) return auth.error;

  const { id } = await ctx.params;

  const log = await prisma.orderLog.findFirst({
    where: { orderId: id, userId: auth.user.id },
  });
  if (!log) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const ageSec = Math.floor((Date.now() - log.createdAt.getTime()) / 1000);
  if (ageSec < CANCEL_MIN_AGE_SEC) {
    const remain = CANCEL_MIN_AGE_SEC - ageSec;
    return NextResponse.json(
      {
        error: `Order can only be cancelled after 2 minutes. ${remain}s remaining.`,
        code: "TOO_EARLY",
        retryAfterSec: remain,
      },
      { status: 400 }
    );
  }

  try {
    const res = await mars.cancelOrder(id);
    if (!res.success) {
      return NextResponse.json({ error: "Cancel failed" }, { status: 502 });
    }
    await prisma.orderLog
      .updateMany({
        where: { orderId: id, outcome: "pending" },
        data: { outcome: "cancelled" },
      })
      .catch(() => undefined);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
