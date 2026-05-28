import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { mars } from "@/lib/mars";
import { mars2 } from "@/lib/mars2";
import { mars3 } from "@/lib/mars3";
import { mars4 } from "@/lib/mars4";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const [
    v1Sess, v1Cf,
    v2Sess, v2User, v2Exp,
    v3Sess, v3User, v3Exp,
    v4Sess, v4User, v4Exp,
  ] = await Promise.all([
    mars.getPhpsessid(), mars.getCfClearance(),
    mars2.getPhpsessid(), mars2.getUserId(), mars2.getExpiresAt(),
    mars3.getPhpsessid(), mars3.getUserId(), mars3.getExpiresAt(),
    mars4.getPhpsessid(), mars4.getUserId(), mars4.getExpiresAt(),
  ]);

  return NextResponse.json({
    data: {
      v1: { phpsessid: maskMiddle(v1Sess), cfClearance: maskMiddle(v1Cf), phpsessidLen: v1Sess.length, cfClearanceLen: v1Cf.length },
      v2: { phpsessid: maskMiddle(v2Sess), userId: v2User || "(empty)", expiresAt: v2Exp || "(empty)", phpsessidLen: v2Sess.length },
      v3: { phpsessid: maskMiddle(v3Sess), userId: v3User || "(empty)", expiresAt: v3Exp || "(empty)", phpsessidLen: v3Sess.length },
      v4: { phpsessid: maskMiddle(v4Sess), userId: v4User || "(empty)", expiresAt: v4Exp || "(empty)", phpsessidLen: v4Sess.length },
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
const v4Schema = userExpSchema.extend({ provider: z.literal("v4") });

const schema = z.union([v1Schema, v2Schema, v3Schema, v4Schema]);

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
    try { await mars.loadCountries(); }
    catch (e) {
      return NextResponse.json({ error: `V1 cookies disimpan tapi gagal test: ${(e as Error).message}`, warning: true }, { status: 200 });
    }
    return NextResponse.json({ ok: true, provider: "v1" });
  }

  const { phpsessid, userId, expiresAt } = parsed.data;
  const provider = parsed.data.provider;
  const client = provider === "v2" ? mars2 : provider === "v3" ? mars3 : mars4;

  await client.setCookies(phpsessid.trim(), userId.trim(), expiresAt.trim());
  try { await client.loadCountries(); }
  catch (e) {
    return NextResponse.json({ error: `${provider.toUpperCase()} cookies disimpan tapi gagal test: ${(e as Error).message}`, warning: true }, { status: 200 });
  }
  return NextResponse.json({ ok: true, provider });
}

function maskMiddle(s: string): string {
  if (!s) return "(empty)";
  if (s.length <= 12) return s.slice(0, 4) + "..." + s.slice(-4);
  return s.slice(0, 8) + "..." + s.slice(-8);
}
