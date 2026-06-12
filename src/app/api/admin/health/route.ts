import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getHealthHistory, getHealthStats } from "@/lib/health";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/health — status provider dari hasil poller.
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
