import { NextRequest, NextResponse } from "next/server";
import { mars3 } from "@/lib/mars3";
import { requireApiKey } from "@/lib/api-auth";

/**
 * GET /api/v3/countries?q=indo
 * List negara provider v3.
 */
export async function GET(req: NextRequest) {
  const auth = await requireApiKey(req);
  if (auth.error) return auth.error;

  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (mars3.countries.length === 0) {
    try {
      await mars3.loadCountries();
    } catch (e) {
      return NextResponse.json(
        { error: (e as Error).message },
        { status: 500 }
      );
    }
  }
  const data = mars3.searchCountries(q, 9999);
  return NextResponse.json({ data, total: data.length });
}
