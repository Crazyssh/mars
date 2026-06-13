import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { refreshCfSession } from "@/lib/cf-session";
import { isFlaresolverrEnabled } from "@/lib/flaresolverr";

/**
 * POST /api/admin/cf-refresh
 * Trigger refresh cf_clearance via FlareSolverr (manual, dari admin UI).
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

  const ok = await refreshCfSession();
  if (!ok) {
    return NextResponse.json(
      { error: "Refresh gagal — cek FlareSolverr jalan & log server" },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true, message: "cf_clearance berhasil di-refresh via FlareSolverr" });
}
