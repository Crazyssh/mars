import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { mars, parseHarga } from "@/lib/mars";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyPricing } from "@/lib/pricing";

const schema = z.object({
  countryId: z.number().int().min(0),
  service: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }
  const { countryId, service } = parsed.data;

  try {
    const services = await mars.listServices(countryId);
    const info = services[service];
    if (!info || Number(info.stok) <= 0) {
      return NextResponse.json(
        { error: "Service gak available / stok habis" },
        { status: 409 }
      );
    }

    const costIdr = parseHarga(info.harga);
    const priced = await applyPricing(costIdr, service, countryId);
    const country = mars.findCountry(countryId);

    // Order ke ditznesia pakai harga asli (cost) — saldo ditznesia yang dipotong.
    const result = await mars.createOrder({
      countryId,
      service,
      serviceName: info.layanan,
      operator: "any",
      namaNegara: country?.slug,
      priceIdr: costIdr,
    });

    if (!result.success || !result.orderId) {
      return NextResponse.json(
        { error: result.errorMessage ?? "Gagal order" },
        { status: 502 }
      );
    }

    // Log ke DB — simpan cost & price untuk tracking margin
    await prisma.orderLog.create({
      data: {
        userId: auth.user.id,
        orderId: result.orderId,
        service,
        serviceName: info.layanan,
        country: country?.name ?? String(countryId),
        countryId,
        number: result.number ?? "",
        costIdr,
        priceIdr: priced.price,
        outcome: "pending",
      },
    });

    return NextResponse.json({
      data: {
        orderId: result.orderId,
        number: result.number,
        serviceName: info.layanan,
        country: country?.name ?? String(countryId),
        priceIdr: priced.price,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
