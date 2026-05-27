import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { mars2, parseHarga } from "@/lib/mars2";
import { requireApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { generatePublicId } from "@/lib/public-id";

const schema = z.object({
  countryId: z.number().int().min(0),
  service: z.string().min(1),
});

const STOCK_ERROR = { error: "Stok habis", code: "OUT_OF_STOCK" };

/**
 * POST /api/v2/order
 * Body: { countryId, service }
 *
 * Return publicId 8-digit ke client (raw provider orderId disembunyikan).
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
    const services = await mars2.listServices(countryId);
    const info = services[service];
    if (!info || Number(info.stok) <= 0) {
      return NextResponse.json(STOCK_ERROR, { status: 409 });
    }

    const priceIdr = parseHarga(info.harga);

    if (mars2.countries.length === 0) {
      await mars2.loadCountries().catch(() => undefined);
    }
    const country = mars2.findCountry(countryId);

    const result = await mars2.createOrder({
      countryId,
      service,
      serviceName: info.layanan,
      namaNegara: country?.slug,
      priceIdr,
    });

    if (!result.success || !result.orderId) {
      return NextResponse.json(STOCK_ERROR, { status: 409 });
    }

    const publicId = await generatePublicId();

    await prisma.orderLog.create({
      data: {
        userId: auth.user.id,
        provider: "v2",
        orderId: result.orderId,
        publicId,
        service,
        serviceName: info.layanan,
        country: country?.name ?? String(countryId),
        countryId,
        number: result.number ?? "",
        costIdr: priceIdr,
        priceIdr,
        outcome: "pending",
      },
    });

    return NextResponse.json({
      data: {
        orderId: publicId, // Expose publicId ke client (bukan raw provider id)
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
