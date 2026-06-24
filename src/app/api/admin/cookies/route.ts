import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { mars } from "@/lib/mars";

/**
 * Cookie sekarang SHARED — 1 akun dipake semua provider (v1-v4).
 * Cukup simpan/baca 1 set: PHPSESSID + user_id + expires_at + cf_clearance.
 */
export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const [sess, user, exp, cf] = await Promise.all([
    mars.getPhpsessid(),
    mars.getUserId(),
    mars.getExpiresAt(),
    mars.getCfClearance(),
  ]);

  return NextResponse.json({
    data: {
      phpsessid: maskMiddle(sess),
      userId: user || "(empty)",
      expiresAt: exp || "(empty)",
      cfClearance: maskMiddle(cf),
      phpsessidLen: sess.length,
      cfClearanceLen: cf.length,
    },
  });
}

const schema = z.object({
  phpsessid: z.string().min(20, "PHPSESSID terlalu pendek"),
  userId: z.string().min(1, "user_id required"),
  expiresAt: z.string().min(1, "expires_at required"),
  cfClearance: z.string().min(50, "cf_clearance terlalu pendek (biasanya 200+)"),
});

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

  const { phpsessid, userId, expiresAt, cfClearance } = parsed.data;

  // setCookies nulis ke key shared → otomatis kepake semua provider.
  await mars.setCookies(phpsessid.trim(), userId.trim(), expiresAt.trim(), cfClearance.trim());

  // Validasi pakai endpoint infoOrder yang ringan.
  try {
    await mars.fetchHistoryFresh(1, 5);
  } catch (e) {
    return NextResponse.json(
      { error: `Cookies disimpan tapi gagal test: ${(e as Error).message}`, warning: true },
      { status: 200 }
    );
  }

  // Warm country cache (best-effort)
  await mars.loadCountries().catch(() => undefined);

  return NextResponse.json({ ok: true });
}

function maskMiddle(s: string): string {
  if (!s) return "(empty)";
  if (s.length <= 12) return s.slice(0, 4) + "..." + s.slice(-4);
  return s.slice(0, 8) + "..." + s.slice(-8);
}
