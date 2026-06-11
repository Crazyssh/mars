import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getHealthHistory, getHealthStats, runManualCheck } from "@/lib/health";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/health — history + statistik ping ke provider.
 */
export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const history = getHealthHistory();
  const stats = getHealthStats();

  return NextResponse.json(
    {
      data: {
        last: history[0] ?? null,
        stats,
        history,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/**
 * POST /api/admin/health — trigger 1 manual ping sekarang.
 */
export async function POST() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const check = await runManualCheck();
  return NextResponse.json({ data: check });
}
