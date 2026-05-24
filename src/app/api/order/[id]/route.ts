import { NextRequest, NextResponse } from "next/server";
import { mars } from "@/lib/mars";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncOrderFromLive, outcomeToStatus } from "@/lib/order-sync";

/**
 * GET /api/order/[id] — return current status order (polled by client).
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { id } = await ctx.params;

  // Ownership check: order ini harus milik user yang login
  const log = await prisma.orderLog.findFirst({
    where: { orderId: id, userId: auth.user.id },
  });
  if (!log) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  try {
    const live = await mars.getOrder(id);
    if (live) {
      // Sync DB dari live state (save OTP kalau baru muncul)
      await syncOrderFromLive(live);
      const hasOtp = live.otp && live.otp !== "Menunggu";
      return NextResponse.json({
        data: {
          orderId: live.order_id,
          number: live.number || log.number,
          serviceName: live.service_name,
          country: live.country,
          status: live.status,
          otp: hasOtp ? live.otp : log.otp ?? null,
          createdAt: live.order_time,
        },
      });
    }
  } catch {
    // ignore — fallback ke data DB di bawah
  }

  // Fallback: order udah keluar dari page 1 ditznesia, pake data tersimpan
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
