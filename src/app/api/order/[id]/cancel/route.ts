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

  // Ownership check
  const log = await prisma.orderLog.findFirst({
    where: { orderId: id, userId: auth.user.id },
  });
  if (!log) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // 2-minute rule — pakai createdAt dari DB sebagai fallback kalau live fail
  const ageSec = Math.floor((Date.now() - log.createdAt.getTime()) / 1000);
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
