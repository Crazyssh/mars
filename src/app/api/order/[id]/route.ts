import { NextRequest, NextResponse } from "next/server";
import { mars } from "@/lib/mars";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
  try {
    const order = await mars.getOrder(id);
    if (!order) {
      return NextResponse.json(
        { data: { orderId: id, status: "unknown" } },
        { status: 200 }
      );
    }

    // Update log kalau status berubah jadi terminal
    const hasOtp = order.otp && order.otp !== "Menunggu";
    if (hasOtp) {
      await prisma.orderLog
        .updateMany({
          where: { orderId: id, outcome: "pending" },
          data: { outcome: "otp_received", otpAt: new Date() },
        })
        .catch(() => undefined);
    } else if (order.status === "TIME OUT") {
      await prisma.orderLog
        .updateMany({
          where: { orderId: id, outcome: "pending" },
          data: { outcome: "expired" },
        })
        .catch(() => undefined);
    } else if (order.status === "Dibatalkan") {
      await prisma.orderLog
        .updateMany({
          where: { orderId: id, outcome: "pending" },
          data: { outcome: "cancelled" },
        })
        .catch(() => undefined);
    }

    return NextResponse.json({
      data: {
        orderId: order.order_id,
        number: order.number,
        serviceName: order.service_name,
        country: order.country,
        status: order.status,
        otp: hasOtp ? order.otp : null,
        createdAt: order.order_time,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
