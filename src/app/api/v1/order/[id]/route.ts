import { NextRequest, NextResponse } from "next/server";
import { mars } from "@/lib/mars";
import { requireApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { syncOrderFromLive, outcomeToStatus } from "@/lib/order-sync";

/**
 * GET /api/v1/order/:id
 * Return status order + OTP value (kalau udah masuk).
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiKey(req);
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
    const live = await mars.getOrder(id);
    if (live) {
      await syncOrderFromLive(live);
      const hasOtp = live.otp && live.otp !== "Menunggu";
      return NextResponse.json({
        data: {
          orderId: live.order_id,
          number: live.number || log.number,
          service: log.service,
          serviceName: live.service_name,
          country: live.country,
          status: live.status,
          otp: hasOtp ? live.otp : log.otp ?? null,
          createdAt: live.order_time,
        },
      });
    }
  } catch {
    // ignore — fallback ke DB
  }

  return NextResponse.json({
    data: {
      orderId: log.orderId,
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
