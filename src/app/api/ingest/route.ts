import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { syncOrderFromLive } from "@/lib/order-sync";
import { recordHealth } from "@/lib/health";
import { config } from "@/lib/config";
import { setCacheValue, CACHE_KEYS } from "@/lib/live-cache";
import type { HistoryOrder } from "@/lib/mars";

export const dynamic = "force-dynamic";

/**
 * POST /api/ingest
 *
 * Penerima data infoOrder dari "relay" — userscript di browser PC rumah yang
 * polling ditznesia (dapet fast-lane 200ms), terus push hasilnya ke sini.
 * VPS tinggal nyimpen ke DB. Gak ada request ke ditznesia dari sini.
 *
 * Auth: header X-Ingest-Secret harus cocok dengan INGEST_SECRET di .env.
 *
 * Body: { orders: HistoryOrder[] }
 */
const orderSchema = z.object({
  order_id: z.union([z.string(), z.number()]).transform(String),
  number: z.string().optional().default(""),
  service_name: z.string().optional().default(""),
  status: z.string().optional().default(""),
  otp: z.string().nullable().optional(),
  order_time: z.number().optional(),
  order_service_id: z.string().optional(),
  country: z.string().optional(),
  harga: z.union([z.string(), z.number()]).optional(),
  created_at: z.string().optional(),
});

const schema = z.object({
  orders: z.array(orderSchema).max(500),
});

export async function POST(req: NextRequest) {
  // Auth via shared secret
  const secret = req.headers.get("x-ingest-secret") ?? "";
  if (!config.ingestSecret || secret !== config.ingestSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const orders = parsed.data.orders as unknown as HistoryOrder[];

  // Update cache (dipake endpoint order/[id] biar dapet data fresh)
  setCacheValue(CACHE_KEYS.HISTORY_PAGE_1, orders, 5_000);

  // Relay sukses kirim data → provider dianggap UP (durasi 0 = via relay)
  recordHealth("v1", true, 0, "via relay");

  let updated = 0;
  for (const o of orders) {
    try {
      const changed = await syncOrderFromLive(o);
      if (changed) updated++;
    } catch {
      // skip 1 order error, lanjut
    }
  }

  return NextResponse.json(
    { ok: true, received: orders.length, updated },
    { headers: { "Cache-Control": "no-store" } }
  );
}
