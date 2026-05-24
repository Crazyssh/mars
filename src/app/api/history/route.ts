import { NextResponse } from "next/server";
import { mars } from "@/lib/mars";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/history — return riwayat order user yang lagi login.
 *
 * Source-of-truth: tabel OrderLog (per-user, dari DB).
 * Ditznesia /infoOrder dipake untuk dapetin status terkini + OTP value.
 *
 * Akun ditznesia di-share semua user, tapi orderId di OrderLog cuma punya
 * user yang bikin → filter via DB jadi private per-user.
 */
export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  try {
    // 1. Ambil log order milik user ini dari DB (max 50)
    const myLogs = await prisma.orderLog.findMany({
      where: { userId: auth.user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    if (myLogs.length === 0) {
      return NextResponse.json({ data: [] });
    }

    // 2. Ambil ditznesia history (live status + OTP) — best-effort
    const dzMap = new Map<string, Awaited<ReturnType<typeof mars.getHistory>>[number]>();
    try {
      const dz = await mars.getHistory();
      for (const o of dz) dzMap.set(o.order_id, o);
    } catch {
      // Kalau gagal ambil dari ditznesia, fallback ke data DB saja
    }

    // 3. Merge: prefer data live dari ditznesia, fallback ke DB
    const data = myLogs.map((log: (typeof myLogs)[number]) => {
      const live = dzMap.get(log.orderId);
      if (live) {
        const hasOtp = live.otp && live.otp !== "Menunggu";
        return {
          orderId: live.order_id,
          number: live.number,
          serviceName: live.service_name,
          country: live.country,
          status: live.status,
          otp: hasOtp ? live.otp : null,
          orderTime: live.order_time,
          createdAt: live.created_at,
        };
      }
      // Fallback: data dari DB (ditznesia mungkin udah purge dari page 1)
      return {
        orderId: log.orderId,
        number: log.number,
        serviceName: log.serviceName,
        country: log.country,
        status: outcomeToStatus(log.outcome),
        otp: null,
        orderTime: Math.floor(log.createdAt.getTime() / 1000),
        createdAt: log.createdAt.toISOString(),
      };
    });

    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}

function outcomeToStatus(outcome: string): string {
  switch (outcome) {
    case "otp_received":
      return "Sukses";
    case "expired":
    case "timeout":
      return "TIME OUT";
    case "cancelled":
      return "Dibatalkan";
    default:
      return "PENDING";
  }
}
