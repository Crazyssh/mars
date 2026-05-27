import { NextRequest, NextResponse } from "next/server";
import { mars2 } from "@/lib/mars2";
import { requireApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

const CANCEL_MIN_AGE_SEC = 120;

/**
 * POST /api/v2/order/:id/cancel
 * id = publicId 8-digit. Internal call mars2.cancelOrder pake orderId raw.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiKey(req);
  if (auth.error) return auth.error;

  const { id } = await ctx.params;

  const log = await prisma.orderLog.findFirst({
    where: { publicId: id, userId: auth.user.id, provider: "v2" },
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
    // Pakai orderId raw dari provider untuk hit ditznesia
    const res = await mars2.cancelOrder(log.orderId);
    if (!res.success) {
      return NextResponse.json({ error: "Cancel failed" }, { status: 502 });
    }
    await prisma.orderLog
      .updateMany({
        where: { id: log.id, outcome: "pending" },
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
