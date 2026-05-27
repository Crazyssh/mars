import { NextRequest, NextResponse } from "next/server";
import { mars2 } from "@/lib/mars2";
import { requireApiKey } from "@/lib/api-auth";

/**
 * GET /api/v2/countries?q=indo
 * List negara provider v2.
 */
export async function GET(req: NextRequest) {
  const auth = await requireApiKey(req);
  if (auth.error) return auth.error;

  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (mars2.countries.length === 0) {
    try {
      await mars2.loadCountries();
    } catch (e) {
      return NextResponse.json(
        { error: (e as Error).message },
        { status: 500 }
      );
    }
  }
  const data = mars2.searchCountries(q, 9999);
  return NextResponse.json({ data, total: data.length });
}
