import { NextRequest, NextResponse } from "next/server";
import { mars } from "@/lib/mars";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/search/operators?country=N
 * Versi internal (session auth) dari /api/v1/operators — dipakai dashboard.
 * "any" selalu di depan (auto-pilih operator).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const countryId = Number(req.nextUrl.searchParams.get("country") ?? "");
  if (!Number.isFinite(countryId) || countryId < 0) {
    return NextResponse.json({ error: "Invalid country" }, { status: 400 });
  }

  try {
    const operators = await mars.listOperators(countryId);
    const data = ["any", ...operators.filter((o) => o !== "any")];
    return NextResponse.json({ data, total: data.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
