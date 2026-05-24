import { NextRequest, NextResponse } from "next/server";
import { mars, flattenServices } from "@/lib/mars";
import { requireApiKey } from "@/lib/api-auth";

/**
 * GET /api/v1/services?country=N&q=wa
 * Return list service untuk negara tertentu.
 */
export async function GET(req: NextRequest) {
  const auth = await requireApiKey(req);
  if (auth.error) return auth.error;

  const countryIdParam = req.nextUrl.searchParams.get("country") ?? "";
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const countryId = Number(countryIdParam);
  if (!Number.isFinite(countryId) || countryId < 0) {
    return NextResponse.json({ error: "Invalid country" }, { status: 400 });
  }

  try {
    const response = await mars.listServices(countryId);
    const data = flattenServices(response, q);
    return NextResponse.json({ data, total: data.length });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
