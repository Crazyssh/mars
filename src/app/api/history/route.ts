import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncOrderFromLive, outcomeToStatus } from "@/lib/order-sync";
import { getCachedValue, CACHE_KEYS } from "@/lib/live-cache";
import type { HistoryOrder } from "@/lib/mars";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/history — return riwayat order user yang lagi login.
 *
 * Strategi: baca dari OrderLog DB (poller udah jamin sync max 10s).
 * Kalau ada cached live data dari provider (TTL 7s) yang sama freshness,
 * dipake juga buat sync OTP yang baru — tanpa hit provider.
 */
export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  try {
    const myLogs = await prisma.orderLog.findMany({
      where: { userId: auth.user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    if (myLogs.length === 0) {
      return NextResponse.json(
        { data: [] },
        { headers: { "Cache-Control": "no-store, must-revalidate" } }
      );
    }

    // Coba dapet live data dari cache memory (gak hit provider).
    const cached = getCachedValue<HistoryOrder[]>(CACHE_KEYS.HISTORY_PAGE_1);
    const dzMap = new Map<string, HistoryOrder>();
    if (cached) {
      for (const o of cached) {
        dzMap.set(o.order_id, o);
        // Sync ke DB → save OTP yang baru muncul (idempotent)
        await syncOrderFromLive(o).catch(() => undefined);
      }
    }

    // Re-fetch DB setelah sync
    const refreshed = await prisma.orderLog.findMany({
      where: { userId: auth.user.id, id: { in: myLogs.map((l) => l.id) } },
      orderBy: { createdAt: "desc" },
    });

    const data = refreshed.map((log) => {
      const live = dzMap.get(log.orderId);
      const otp =
        log.otp ??
        (live && live.otp !== "Menunggu" ? live.otp : null);
      return {
        orderId: log.orderId,
        number: live?.number || log.number,
        serviceName: live?.service_name || log.serviceName,
        country: live?.country || log.country,
        status: live?.status ?? outcomeToStatus(log.outcome),
        otp,
        orderTime: live?.order_time ?? Math.floor(log.createdAt.getTime() / 1000),
        createdAt: log.createdAt.toISOString(),
      };
    });

    return NextResponse.json(
      { data },
      {
        headers: {
          "Cache-Control": "no-store, must-revalidate",
        },
      }
    );
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
