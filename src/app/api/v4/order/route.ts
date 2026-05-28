import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { mars } from "@/lib/mars";
import {
  mars4,
  parseHarga,
  findOperatorsAtSamePrice,
} from "@/lib/mars4";
import { requireApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { generatePublicId } from "@/lib/public-id";

const schema = z.object({
  countryId: z.number().int().min(0),
  service: z.string().min(1), // format "service:operator" (mis. "wa:2295")
});

const STOCK_ERROR = { error: "Stok habis", code: "OUT_OF_STOCK" };

/**
 * POST /api/v4/order
 * Body: { countryId, service: "service:operator" }
 *
 * Server resolve operator dengan harga yang sama, random-pick salah satu
 * dari yang stock-nya ada (load balancing antar operator harga sama).
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
  const { countryId, service: serviceWithOperator } = parsed.data;

  const [serviceCode, requestedOperator] = serviceWithOperator.split(":", 2);
  if (!serviceCode || !requestedOperator) {
    return NextResponse.json(
      { error: "service must be in 'service:operator' format" },
      { status: 400 }
    );
  }

  try {
    const response = await mars4.listServices(countryId);
    const operators = response[serviceCode];
    if (!operators) {
      return NextResponse.json(STOCK_ERROR, { status: 409 });
    }
    const requestedInfo = operators[requestedOperator];
    if (!requestedInfo) {
      return NextResponse.json(STOCK_ERROR, { status: 409 });
    }

    const targetPrice = parseHarga(requestedInfo.harga);
    const displayPrice = Math.round(targetPrice * 0.6);

    // Block WA & TG kalau harga display di bawah 2000 (konsisten dengan filter list)
    if (
      (serviceCode === "wa" || serviceCode === "tg") &&
      displayPrice < 2000
    ) {
      return NextResponse.json(STOCK_ERROR, { status: 409 });
    }

    // Cari semua operator yang harganya sama (yg stock > 0)
    const candidates = findOperatorsAtSamePrice(
      response,
      serviceCode,
      targetPrice
    );
    if (candidates.length === 0) {
      return NextResponse.json(STOCK_ERROR, { status: 409 });
    }

    // Random pick di antara candidate
    const picked = candidates[Math.floor(Math.random() * candidates.length)];

    // Resolve country slug + name dari mars (v1) cache
    if (mars.countries.length === 0) {
      await mars.loadCountries().catch(() => undefined);
    }
    const country = mars.findCountry(countryId);
    const namaNegara = country?.slug ?? "";
    const countryName = country?.name ?? String(countryId);

    const result = await mars4.createOrder({
      countryId,
      namaNegara,
      service: serviceCode,
      operator: picked.operator,
      serviceName: picked.serviceName,
      priceIdr: targetPrice,
    });

    if (!result.success || !result.orderId) {
      return NextResponse.json(STOCK_ERROR, { status: 409 });
    }

    const publicId = await generatePublicId();

    await prisma.orderLog.create({
      data: {
        userId: auth.user.id,
        provider: "v4",
        orderId: result.orderId,
        publicId,
        service: `${serviceCode}:${picked.operator}`, // operator AKTUAL yang dipake
        serviceName: picked.serviceName,
        country: countryName,
        countryId,
        number: result.number ?? "",
        costIdr: targetPrice,
        priceIdr: displayPrice,
        outcome: "pending",
      },
    });

    return NextResponse.json({
      data: {
        orderId: publicId,
        number: result.number,
        service: serviceWithOperator, // return apa yg user kirim, biar UX consistent
        serviceName: picked.serviceName,
        country: countryName,
        countryId,
        priceIdr: displayPrice,
        status: "PENDING",
        otp: null,
      },
    });
  } catch {
    return NextResponse.json(STOCK_ERROR, { status: 409 });
  }
}
