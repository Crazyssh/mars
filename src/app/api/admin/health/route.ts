import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getHealthHistory } from "@/lib/health";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/health — history ping ke provider (last 50, terbaru di depan).
 */
export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const history = getHealthHistory();

  // Ringkasan
  const recent = history.slice(0, 20).filter((h) => h.ttfbMs >= 0);
  const avgTtfb =
    recent.length > 0
      ? Math.round(recent.reduce((s, h) => s + h.ttfbMs, 0) / recent.length)
      : 0;
  const okCount = history.slice(0, 20).filter((h) => h.ok).length;
  const last = history[0] ?? null;

  return NextResponse.json(
    {
      data: {
        last,
        avgTtfbMs: avgTtfb,
        uptimePct: history.length > 0 ? Math.round((okCount / Math.min(20, history.length)) * 100) : 0,
        history,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
