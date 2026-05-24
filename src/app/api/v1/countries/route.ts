import { NextRequest, NextResponse } from "next/server";
import { mars } from "@/lib/mars";
import { requireApiKey } from "@/lib/api-auth";

/**
 * GET /api/v1/countries?q=indo
 * Return list negara yang tersedia di ditznesia.
 */
export async function GET(req: NextRequest) {
  const auth = await requireApiKey(req);
  if (auth.error) return auth.error;

  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (mars.countries.length === 0) {
    try {
      await mars.loadCountries();
    } catch (e) {
      return NextResponse.json(
        { error: (e as Error).message },
        { status: 500 }
      );
    }
  }
  const data = mars.searchCountries(q, 9999);
  return NextResponse.json({ data, total: data.length });
}
