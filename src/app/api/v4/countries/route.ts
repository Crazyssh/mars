import { NextRequest, NextResponse } from "next/server";
import { mars4 } from "@/lib/mars4";
import { requireApiKey } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  const auth = await requireApiKey(req);
  if (auth.error) return auth.error;

  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (mars4.countries.length === 0) {
    try {
      await mars4.loadCountries();
    } catch (e) {
      return NextResponse.json(
        { error: (e as Error).message },
        { status: 500 }
      );
    }
  }
  const data = mars4.searchCountries(q, 9999);
  return NextResponse.json({ data, total: data.length });
}
