import { NextRequest, NextResponse } from "next/server";
import { mars, flattenServices } from "@/lib/mars";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
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
    // Return semua — client side filter
    return NextResponse.json({ data: all, total: all.length });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
