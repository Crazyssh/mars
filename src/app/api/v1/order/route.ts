import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { mars, parseHarga } from "@/lib/mars";
import { requireApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  countryId: z.number().int().min(0),
  service: z.string().min(1),
});

const STOCK_ERROR = { error: "Stok habis", code: "OUT_OF_STOCK" };

/**
 * POST /api/v1/order
 * Body: { countryId: number, service: string }
 *
 * Bikin order baru. Return orderId + nomor virtual.
 * Status awal "pending" — polling /api/v1/order/:id untuk dapetin OTP.
 *
 * Error handling: semua kegagalan order (stok habis, provider error,
 * cookies expired, rate limit) di-return sebagai "Stok habis" 409 biar
 * client gak tau detail internal.
 */
export async function POST(req: NextRequest) {
  const auth = await requireApiKey(req);
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid params: countryId & service required" },
      { status: 400 }
    );
  }
  const { countryId, service } = parsed.data;

  try {
    const services = await mars.listServices(countryId);
    const info = services[service];
    if (!info || Number(info.stok) <= 0) {
      return NextResponse.json(STOCK_ERROR, { status: 409 });
    }

    const priceIdr = parseHarga(info.harga);
    const country = mars.findCountry(countryId);

    const result = await mars.createOrder({
      countryId,
      service,
      serviceName: info.layanan,
      operator: "any",
      namaNegara: country?.slug,
      priceIdr,
    });

    if (!result.success || !result.orderId) {
      return NextResponse.json(STOCK_ERROR, { status: 409 });
    }

    await prisma.orderLog.create({
      data: {
        userId: auth.user.id,
        orderId: result.orderId,
        service,
        serviceName: info.layanan,
        country: country?.name ?? String(countryId),
        number: result.number ?? "",
        outcome: "pending",
      },
    });

    return NextResponse.json({
      data: {
        orderId: result.orderId,
        number: result.number,
        service,
        serviceName: info.layanan,
        country: country?.name ?? String(countryId),
        countryId,
        priceIdr,
        status: "PENDING",
        otp: null,
      },
    });
  } catch {
    return NextResponse.json(STOCK_ERROR, { status: 409 });
  }
}
