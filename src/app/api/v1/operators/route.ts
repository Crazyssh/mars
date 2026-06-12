import { NextRequest, NextResponse } from "next/server";
import { mars } from "@/lib/mars";
import { requireApiKey } from "@/lib/api-auth";

/**
 * GET /api/v1/operators?country=N
 * List operator yang tersedia untuk negara tertentu (v1 / orderv3).
 * "any" selalu valid (auto-pilih operator).
 */
export async function GET(req: NextRequest) {
  const auth = await requireApiKey(req);
  if (auth.error) return auth.error;

  const countryId = Number(req.nextUrl.searchParams.get("country") ?? "");
  if (!Number.isFinite(countryId) || countryId < 0) {
    return NextResponse.json({ error: "Invalid country" }, { status: 400 });
  }

  try {
    const operators = await mars.listOperators(countryId);
    // Selalu sertakan "any" di depan (auto-pilih)
    const data = ["any", ...operators.filter((o) => o !== "any")];
    return NextResponse.json({ data, total: data.length });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
