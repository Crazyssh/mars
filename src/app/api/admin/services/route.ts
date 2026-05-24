import { NextRequest, NextResponse } from "next/server";
import { mars, flattenServices } from "@/lib/mars";
import { requireAdmin } from "@/lib/auth";

/**
 * GET /api/admin/services?country=N&q=wa
 * Return harga RAW dari ditznesia (cost) — tanpa apply pricing rule.
 * Khusus admin untuk halaman /admin/pricing.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const countryIdParam = req.nextUrl.searchParams.get("country") ?? "";
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const countryId = Number(countryIdParam);
  if (!Number.isFinite(countryId) || countryId < 0) {
    return NextResponse.json({ error: "Invalid country" }, { status: 400 });
  }

  try {
    const response = await mars.listServices(countryId);
    const all = flattenServices(response, q);
    return NextResponse.json({ data: all, total: all.length });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
