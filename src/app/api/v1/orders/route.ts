import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { syncOrderFromLive, outcomeToStatus } from "@/lib/order-sync";
import { getCachedValue, CACHE_KEYS } from "@/lib/live-cache";
import type { HistoryOrder } from "@/lib/mars";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/orders
 * List order milik API key (riwayat). DB-based, gak hit provider.
 *
 * Query params:
 *   - status: filter outcome (pending|otp_received|expired|cancelled). Optional.
 *   - limit:  jumlah hasil (default 100, max 100)
 *   - page:   halaman (default 1)
 *
 * Return order terbaru duluan.
 */
const STATUS_MAP: Record<string, string> = {
  pending: "pending",
  success: "otp_received",
  otp_received: "otp_received",
  expired: "expired",
  cancelled: "cancelled",
  canceled: "cancelled",
};

export async function GET(req: NextRequest) {
  const auth = await requireApiKey(req);
  if (auth.error) return auth.error;

  const sp = req.nextUrl.searchParams;
  const statusParam = (sp.get("status") ?? "").toLowerCase().trim();
  const outcome = STATUS_MAP[statusParam];

  const limit = Math.min(100, Math.max(1, Number(sp.get("limit")) || 100));
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const skip = (page - 1) * limit;

  const where = {
    userId: auth.user.id,
    ...(outcome ? { outcome } : {}),
  };

  try {
    const [total, logs] = await Promise.all([
      prisma.orderLog.count({ where }),
      prisma.orderLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
    ]);

    // Sync OTP terbaru dari cache (gak hit provider)
    const cached = getCachedValue<HistoryOrder[]>(CACHE_KEYS.HISTORY_PAGE_1);
    const liveMap = new Map<string, HistoryOrder>();
    if (cached) {
      for (const o of cached) liveMap.set(o.order_id, o);
      // Sync hanya order yang muncul di halaman ini + masih pending
      for (const log of logs) {
        if (log.outcome === "pending" && liveMap.has(log.orderId)) {
          await syncOrderFromLive(liveMap.get(log.orderId)!).catch(() => undefined);
        }
      }
    }

    // Re-read kalau ada yang ke-sync
    const refreshed = await prisma.orderLog.findMany({
      where: { id: { in: logs.map((l) => l.id) } },
      orderBy: { createdAt: "desc" },
    });

    const data = refreshed.map((log) => {
      const live = liveMap.get(log.orderId);
      const otp = log.otp ?? (live && live.otp !== "Menunggu" ? live.otp : null);
      return {
        // v2/v3/v4 pakai publicId; v1 pakai orderId raw
        orderId: log.publicId || log.orderId,
        number: live?.number || log.number,
        service: log.service,
        serviceName: live?.service_name || log.serviceName,
        country: live?.country || log.country,
        status: live?.status ?? outcomeToStatus(log.outcome),
        otp,
        createdAt: Math.floor(log.createdAt.getTime() / 1000),
      };
    });

    return NextResponse.json(
      { data, total, page, limit },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
