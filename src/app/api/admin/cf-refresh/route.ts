import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { refreshCfSession, getCfRefreshStatus } from "@/lib/cf-session";
import { isFlaresolverrEnabled } from "@/lib/flaresolverr";

/**
 * POST /api/admin/cf-refresh
 * Trigger refresh cf_clearance via FlareSolverr — FIRE & FORGET.
 *
 * FlareSolverr solve bisa 60-90 detik, lebih lama dari timeout Nginx/Cloudflare.
 * Kalau request ditahan sampe selesai → gateway timeout → UI "Network error".
 * Jadi kita mulai refresh di background & langsung balikin respons. UI cek
 * hasilnya via GET /api/admin/cf-refresh (polling).
 */
export async function POST() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  if (!isFlaresolverrEnabled()) {
    return NextResponse.json(
      { error: "FlareSolverr belum dikonfigurasi (set FLARESOLVERR_URL di .env)" },
      { status: 400 }
    );
  }

  // Fire & forget — jangan tahan request (hindari gateway timeout).
  refreshCfSession().catch(() => undefined);

  return NextResponse.json({
    ok: true,
    started: true,
    message: "Refresh dimulai di background (~30-90 detik). Status ke-update otomatis.",
  });
}

/**
 * GET /api/admin/cf-refresh
 * Cek status refresh terakhir (dipakai UI buat polling setelah trigger POST).
 */
export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  return NextResponse.json({ ok: true, status: getCfRefreshStatus() });
}
