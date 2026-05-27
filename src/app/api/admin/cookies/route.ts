import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { mars } from "@/lib/mars";

/**
 * GET — return cookies yang sedang dipake (preview, di-mask).
 */
export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const [phpsessid, cfClearance] = await Promise.all([
    mars.getPhpsessid(),
    mars.getCfClearance(),
  ]);

  return NextResponse.json({
    data: {
      phpsessid: maskMiddle(phpsessid),
      cfClearance: maskMiddle(cfClearance),
      phpsessidLen: phpsessid.length,
      cfClearanceLen: cfClearance.length,
    },
  });
}

const schema = z.object({
  phpsessid: z.string().min(20, "PHPSESSID terlalu pendek (min 20 char)"),
  cfClearance: z.string().min(50, "cf_clearance terlalu pendek (min 50 char, biasanya 200+)"),
});

/**
 * POST — update cookies. Apply langsung tanpa restart.
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

  const phpsessid = parsed.data.phpsessid.trim();
  const cfClearance = parsed.data.cfClearance.trim();

  await mars.setCookies(phpsessid, cfClearance);

  // Test validity — coba load countries pake cookies baru
  try {
    await mars.loadCountries();
  } catch (e) {
    return NextResponse.json(
      {
        error: `Cookies disimpan tapi gagal test ke provider: ${(e as Error).message}`,
        warning: true,
      },
      { status: 200 } // Tetep 200 — cookies tersimpan, cuma warning
    );
  }

  return NextResponse.json({ ok: true });
}

function maskMiddle(s: string): string {
  if (!s) return "(empty)";
  if (s.length <= 12) return s.slice(0, 4) + "..." + s.slice(-4);
  return s.slice(0, 8) + "..." + s.slice(-8);
}
