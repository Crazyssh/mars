import { NextRequest, NextResponse } from "next/server";
import { mars4, flattenV4Services } from "@/lib/mars4";
import { requireApiKey } from "@/lib/api-auth";

/**
 * GET /api/v4/services?country=N&q=wa
 *
 * Dedup per (service, harga): operator dengan harga sama digabung jadi 1 entry,
 * stock = total semua operator di harga itu, operator terpilih = yg stock tertinggi.
 *
 * Saat order, server akan random-pick operator yang harganya sama.
 *
 * Display: harga × 0.6 (diskon 40%), stock × 2.
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
    const response = await mars4.listServices(countryId);
    const data = flattenV4Services(response, q)
      .map((s) => ({
        ...s,
        priceIdr: Math.round(s.priceIdr * 0.6),
        stock: s.stock * 2,
      }))
      // Khusus WA & TG: hide harga display di bawah 2000
      .filter((s) => {
        const isWaOrTg = s.service === "wa" || s.service === "tg";
        if (isWaOrTg && s.priceIdr < 2000) return false;
        return true;
      });
    return NextResponse.json({ data, total: data.length });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
