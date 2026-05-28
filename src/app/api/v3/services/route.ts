import { NextRequest, NextResponse } from "next/server";
import { mars3, flattenV3Services } from "@/lib/mars3";
import { requireApiKey } from "@/lib/api-auth";

/**
 * GET /api/v3/services?country=N&q=whatsapp
 *
 * Param `country` bisa countryId (number) atau slug (string).
 * Return list per service+operator (skip operator yang stok 0).
 *
 * Stock display dikalikan 2 (bukan asli).
 */
export async function GET(req: NextRequest) {
  const auth = await requireApiKey(req);
  if (auth.error) return auth.error;

  const countryParam = req.nextUrl.searchParams.get("country") ?? "";
  const q = req.nextUrl.searchParams.get("q") ?? "";

  if (!countryParam) {
    return NextResponse.json({ error: "Param 'country' required" }, { status: 400 });
  }

  // Lazy-load countries cache
  if (mars3.countries.length === 0) {
    await mars3.loadCountries().catch(() => undefined);
  }

  // Resolve slug: kalau param numeric, lookup id → slug; kalau string, pakai langsung
  let countrySlug: string;
  const asNumber = Number(countryParam);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    const country = mars3.findCountry(asNumber);
    if (!country) {
      return NextResponse.json(
        { error: `Country id ${asNumber} not found` },
        { status: 400 }
      );
    }
    countrySlug = country.slug;
  } else {
    countrySlug = countryParam.toLowerCase();
  }

  try {
    const response = await mars3.listServices(countrySlug);
    const data = flattenV3Services(response, q).map((s) => ({
      ...s,
      priceIdr: Math.round(s.priceIdr * 0.6), // Diskon 40% display
      stock: s.stock * 2, // multiplier display
    }));
    return NextResponse.json({ data, total: data.length });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
