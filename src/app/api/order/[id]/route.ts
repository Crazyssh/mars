import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncOrderFromLive, outcomeToStatus } from "@/lib/order-sync";
import { getCachedValue, CACHE_KEYS } from "@/lib/live-cache";
import type { HistoryOrder } from "@/lib/mars";

/**
 * GET /api/order/[id] — return current status order.
 *
 * Strategi:
 * - Baca DB (yang udah di-sync sama poller tiap 10s)
 * - Kalau ada cached live data dari ditznesia (TTL 7s), pake juga (gak hit ditznesia)
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { id } = await ctx.params;

  const log = await prisma.orderLog.findFirst({
    where: { orderId: id, userId: auth.user.id },
  });
  if (!log) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Coba pake cache live data — kalau ada, sync ke DB
  const cached = getCachedValue<HistoryOrder[]>(CACHE_KEYS.HISTORY_PAGE_1);
  const live = cached?.find((o) => o.order_id === id);
  if (live) {
    await syncOrderFromLive(live).catch(() => undefined);
    // Re-read log biar dapet OTP yang baru di-save
    const fresh = await prisma.orderLog.findFirst({
      where: { id: log.id },
    });
    const hasOtp = !!live.otp && live.otp !== "Menunggu";
    return NextResponse.json({
      data: {
        orderId: live.order_id,
        number: live.number || fresh?.number || log.number,
        serviceName: live.service_name,
        country: live.country,
        status: live.status,
        otp: fresh?.otp ?? (hasOtp ? live.otp : null),
        createdAt: live.order_time,
      },
    });
  }

  // Fallback: data dari DB only (poller pasti udah update)
  return NextResponse.json({
    data: {
      orderId: log.orderId,
      number: log.number,
      serviceName: log.serviceName,
      country: log.country,
      status: outcomeToStatus(log.outcome),
      otp: log.otp ?? null,
      createdAt: Math.floor(log.createdAt.getTime() / 1000),
    },
  });
}
