import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { syncOrderFromLive, outcomeToStatus } from "@/lib/order-sync";
import { getCachedValue, CACHE_KEYS } from "@/lib/live-cache";
import type { HistoryOrder } from "@/lib/mars";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiKey(req);
  if (auth.error) return auth.error;

  const { id } = await ctx.params;

  const log = await prisma.orderLog.findFirst({
    where: { publicId: id, userId: auth.user.id, provider: "v4" },
  });
  if (!log) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const cached = getCachedValue<HistoryOrder[]>(CACHE_KEYS.V4_HISTORY_PAGE_1);
  const live = cached?.find((o) => o.order_id === log.orderId);
  if (live) {
    await syncOrderFromLive(live).catch(() => undefined);
    const fresh = await prisma.orderLog.findFirst({ where: { id: log.id } });
    const hasOtp = !!live.otp && live.otp !== "Menunggu";
    return NextResponse.json({
      data: {
        orderId: log.publicId,
        number: live.number || fresh?.number || log.number,
        service: log.service,
        serviceName: log.serviceName,
        country: live.country || log.country,
        status: live.status,
        otp: fresh?.otp ?? (hasOtp ? live.otp : null),
        createdAt: live.order_time,
      },
    });
  }

  return NextResponse.json({
    data: {
      orderId: log.publicId,
      number: log.number,
      service: log.service,
      serviceName: log.serviceName,
      country: log.country,
      status: outcomeToStatus(log.outcome),
      otp: log.otp ?? null,
      createdAt: Math.floor(log.createdAt.getTime() / 1000),
    },
  });
}
