import { NextResponse } from "next/server";
import { mars } from "@/lib/mars";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncOrderFromLive, outcomeToStatus } from "@/lib/order-sync";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/history — return riwayat order user yang lagi login.
 *
 * Source-of-truth: tabel OrderLog (per-user, dari DB).
 * Ditznesia /infoOrder dipake untuk dapetin status & OTP terkini, lalu
 * di-sync ke DB lewat syncOrderFromLive() biar OTP gak ilang setelah
 * order keluar dari page 1 ditznesia.
 */
export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  try {
    // 1. Ambil log order milik user ini dari DB (max 100)
    const myLogs = await prisma.orderLog.findMany({
      where: { userId: auth.user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    if (myLogs.length === 0) {
      return NextResponse.json({ data: [] });
    }

    // 2. Ambil ditznesia history (live status + OTP) — best-effort
    const dzMap = new Map<string, Awaited<ReturnType<typeof mars.getHistory>>[number]>();
    try {
      const dz = await mars.getHistory();
      for (const o of dz) {
        dzMap.set(o.order_id, o);
        // Sync ke DB → save OTP value supaya gak ilang setelah rotate keluar
        await syncOrderFromLive(o).catch(() => undefined);
      }
    } catch {
      // Kalau gagal ambil dari ditznesia, fallback ke data DB saja
    }

    // 3. Re-fetch DB setelah sync biar dapet OTP value yang baru di-save
    const refreshed = await prisma.orderLog.findMany({
      where: { userId: auth.user.id, id: { in: myLogs.map((l) => l.id) } },
      orderBy: { createdAt: "desc" },
    });

    // 4. Merge: prefer data live untuk number/serviceName, fallback ke DB
    const data = refreshed.map((log) => {
      const live = dzMap.get(log.orderId);
      const otp = log.otp ?? (live && live.otp !== "Menunggu" ? live.otp : null);
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
