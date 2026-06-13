import { NextRequest, NextResponse } from "next/server";
import { mars2 } from "@/lib/mars2";
import { requireApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * POST /api/v2/order/:id/cancel
 * id = publicId 8-digit. Keputusan cancel murni dari jawaban provider.
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

  try {
    const res = await mars2.cancelOrder(log.orderId);
    if (!res.success) {
      return NextResponse.json(
        { error: res.message || "Order cannot be cancelled", code: "CANCEL_REJECTED" },
        { status: 409 }
      );
    }
    await prisma.orderLog
      .updateMany({
        where: { id: log.id, outcome: "pending" },
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
