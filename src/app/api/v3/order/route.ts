import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { mars3, flattenV3Services, parseHarga } from "@/lib/mars3";
import { requireApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { generatePublicId } from "@/lib/public-id";

const schema = z.object({
  countryId: z.union([z.number().int().min(0), z.string().min(1)]),
  service: z.string().min(1), // format "service:operator" (mis. "whatsapp:virtual53")
});

const STOCK_ERROR = { error: "Stok habis", code: "OUT_OF_STOCK" };

/**
 * POST /api/v3/order
 * Body: { countryId, service: "service:operator" }
 *
 * Service field WAJIB pake format "service:operator" (lihat /api/v3/services).
 * Return publicId 8-digit ke client.
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

  // Parse "service:operator"
  const [serviceCode, operator] = serviceWithOperator.split(":", 2);
  if (!serviceCode || !operator) {
    return NextResponse.json(
      { error: "service must be in 'service:operator' format" },
      { status: 400 }
    );
  }

  // Resolve country slug
  if (mars3.countries.length === 0) {
    await mars3.loadCountries().catch(() => undefined);
  }
  let countrySlug: string;
  let countryName: string;
  let countryIdNumeric: number | undefined;
  const asNumber = typeof countryId === "number" ? countryId : Number(countryId);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    const country = mars3.findCountry(asNumber);
    if (!country) {
      return NextResponse.json(STOCK_ERROR, { status: 409 });
    }
    countrySlug = country.slug;
    countryName = country.name;
    countryIdNumeric = country.id;
  } else {
    countrySlug = String(countryId).toLowerCase();
    const found = mars3.findCountryBySlug(countrySlug);
    countryName = found?.name ?? countrySlug;
    countryIdNumeric = found?.id;
  }

  try {
    const response = await mars3.listServices(countrySlug);
    const operators = response[serviceCode];
    if (!operators) {
      return NextResponse.json(STOCK_ERROR, { status: 409 });
    }
    const info = operators[operator];
    if (!info || Number(info.stok) <= 0) {
      return NextResponse.json(STOCK_ERROR, { status: 409 });
    }

    const priceIdr = parseHarga(info.harga);

    const result = await mars3.createOrder({
      countrySlug,
      service: serviceCode,
      operator,
      priceIdr,
    });

    if (!result.success || !result.orderId) {
      return NextResponse.json(STOCK_ERROR, { status: 409 });
    }

    const publicId = await generatePublicId();
    const displayPrice = Math.round(priceIdr * 0.6); // Diskon 40% untuk client display

    await prisma.orderLog.create({
      data: {
        userId: auth.user.id,
        provider: "v3",
        orderId: result.orderId,
        publicId,
        service: serviceWithOperator,
        serviceName: serviceCode,
        country: countryName,
        countryId: countryIdNumeric,
        number: result.number ?? "",
        costIdr: priceIdr, // harga asli ke provider (yang dipotong saldo)
        priceIdr: displayPrice, // harga jual ke user (yang ditagih)
        outcome: "pending",
      },
    });

    return NextResponse.json({
      data: {
        orderId: publicId,
        number: result.number,
        service: serviceWithOperator,
        serviceName: serviceCode,
        country: countryName,
        countryId: countryIdNumeric,
        priceIdr: displayPrice,
        status: "PENDING",
        otp: null,
      },
    });
  } catch {
    return NextResponse.json(STOCK_ERROR, { status: 409 });
  }
}
