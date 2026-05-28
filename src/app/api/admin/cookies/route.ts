import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { mars } from "@/lib/mars";
import { mars2 } from "@/lib/mars2";
import { mars3 } from "@/lib/mars3";

/**
 * GET — return cookies v1 + v2 + v3 (preview, di-mask).
 */
export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const [v1Sess, v1Cf, v2Sess, v2User, v2Exp, v3Sess, v3User, v3Exp] =
    await Promise.all([
      mars.getPhpsessid(),
      mars.getCfClearance(),
      mars2.getPhpsessid(),
      mars2.getUserId(),
      mars2.getExpiresAt(),
      mars3.getPhpsessid(),
      mars3.getUserId(),
      mars3.getExpiresAt(),
    ]);

  return NextResponse.json({
    data: {
      v1: {
        phpsessid: maskMiddle(v1Sess),
        cfClearance: maskMiddle(v1Cf),
        phpsessidLen: v1Sess.length,
        cfClearanceLen: v1Cf.length,
      },
      v2: {
        phpsessid: maskMiddle(v2Sess),
        userId: v2User || "(empty)",
        expiresAt: v2Exp || "(empty)",
        phpsessidLen: v2Sess.length,
      },
      v3: {
        phpsessid: maskMiddle(v3Sess),
        userId: v3User || "(empty)",
        expiresAt: v3Exp || "(empty)",
        phpsessidLen: v3Sess.length,
      },
    },
  });
}

const v1Schema = z.object({
  provider: z.literal("v1"),
  phpsessid: z.string().min(20, "PHPSESSID terlalu pendek"),
  cfClearance: z.string().min(50, "cf_clearance terlalu pendek (biasanya 200+)"),
});

const userExpSchema = z.object({
  phpsessid: z.string().min(20, "PHPSESSID terlalu pendek"),
  userId: z.string().min(1, "user_id required"),
  expiresAt: z.string().min(1, "expires_at required"),
});

const v2Schema = userExpSchema.extend({ provider: z.literal("v2") });
const v3Schema = userExpSchema.extend({ provider: z.literal("v3") });

const schema = z.union([v1Schema, v2Schema, v3Schema]);

/**
 * POST — update cookies (v1 / v2 / v3 tergantung field `provider`).
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 }
    );
  }

  if (parsed.data.provider === "v1") {
    const { phpsessid, cfClearance } = parsed.data;
    await mars.setCookies(phpsessid.trim(), cfClearance.trim());
    try {
      await mars.loadCountries();
    } catch (e) {
      return NextResponse.json(
        {
          error: `V1 cookies disimpan tapi gagal test: ${(e as Error).message}`,
          warning: true,
        },
        { status: 200 }
      );
    }
    return NextResponse.json({ ok: true, provider: "v1" });
  }

  if (parsed.data.provider === "v2") {
    const { phpsessid, userId, expiresAt } = parsed.data;
    await mars2.setCookies(phpsessid.trim(), userId.trim(), expiresAt.trim());
    try {
      await mars2.loadCountries();
    } catch (e) {
      return NextResponse.json(
        {
          error: `V2 cookies disimpan tapi gagal test: ${(e as Error).message}`,
          warning: true,
        },
        { status: 200 }
      );
    }
    return NextResponse.json({ ok: true, provider: "v2" });
  }

  // v3
  const { phpsessid, userId, expiresAt } = parsed.data;
  await mars3.setCookies(phpsessid.trim(), userId.trim(), expiresAt.trim());
  try {
    await mars3.loadCountries();
  } catch (e) {
    return NextResponse.json(
      {
        error: `V3 cookies disimpan tapi gagal test: ${(e as Error).message}`,
        warning: true,
      },
      { status: 200 }
    );
  }
  return NextResponse.json({ ok: true, provider: "v3" });
}

function maskMiddle(s: string): string {
  if (!s) return "(empty)";
  if (s.length <= 12) return s.slice(0, 4) + "..." + s.slice(-4);
  return s.slice(0, 8) + "..." + s.slice(-8);
}
