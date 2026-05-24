import { NextRequest, NextResponse } from "next/server";
import { mars } from "@/lib/mars";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const CANCEL_MIN_AGE_SEC = 120;

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { id } = await ctx.params;

  // 2-minute rule
  try {
    const order = await mars.getOrder(id);
    if (order?.order_time) {
      const ageSec = Math.floor(Date.now() / 1000) - order.order_time;
      if (ageSec < CANCEL_MIN_AGE_SEC) {
        const remain = CANCEL_MIN_AGE_SEC - ageSec;
        const mm = Math.floor(remain / 60);
        const ss = remain % 60;
        return NextResponse.json(
          {
            error: `Order baru bisa dibatalkan setelah 2 menit. Sisa: ${mm}m ${ss}s`,
            code: "TOO_EARLY",
          },
          { status: 400 }
        );
      }
    }
  } catch {
    // ignore, biarin lanjut cancel
  }

  try {
    const res = await mars.cancelOrder(id);
    if (!res.success) {
      return NextResponse.json(
        { error: "Cancel gagal", raw: res.raw },
        { status: 502 }
      );
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
