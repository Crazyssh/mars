import { NextRequest, NextResponse } from "next/server";
import { mars } from "@/lib/mars";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const q = req.nextUrl.searchParams.get("q") ?? "";
  // Lazy-load countries kalau cache kosong (mis. server baru start)
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
  // Return all countries — client side filter biar instant tanpa API roundtrip
  const all = mars.searchCountries(q, 9999);
  return NextResponse.json({ data: all });
}
