/**
 * Sinkron data live dari ditznesia ke tabel OrderLog.
 *
 * - Save OTP value ke kolom `otp` pas pertama kali muncul → gak akan ilang
 *   walaupun ditznesia /infoOrder udah rotate keluar dari page 1.
 * - Update `outcome` & `status` sesuai status terkini.
 * - Idempotent: aman dipanggil berkali-kali.
 */
import { prisma } from "./prisma";
import type { HistoryOrder } from "./mars";

// OTP order ditznesia biasanya hidup ~20 menit. Setelah itu:
//   - Live status mestinya jadi "TIME OUT".
//   - Tapi kalau live response lambat sync atau format status beda,
//     fallback ke umur biar gak stuck PENDING.
const ORDER_LIFETIME_SEC = 20 * 60;

/** Normalize status string: case-insensitive, whitespace-insensitive. */
function normalizeStatus(s: string | undefined | null): string {
  return (s ?? "").toLowerCase().replace(/\s+/g, "");
}

function classifyStatus(rawStatus: string, hasOtp: boolean): string | null {
  if (hasOtp) return "otp_received";
  const s = normalizeStatus(rawStatus);
  if (s === "sukses" || s === "success") return "otp_received";
  if (s === "timeout" || s === "expired" || s.includes("timeout"))
    return "expired";
  if (s === "dibatalkan" || s === "cancelled" || s === "canceled")
    return "cancelled";
  return null;
}

export async function syncOrderFromLive(live: HistoryOrder): Promise<boolean> {
  const hasOtp = !!live.otp && normalizeStatus(live.otp) !== "menunggu";
  let nextOutcome = classifyStatus(live.status ?? "", hasOtp);

  // Fallback: live status masih PENDING tapi udah lewat lifetime → anggap expired.
  // (Ditznesia kadang lambat update status ke TIME OUT.)
  if (!nextOutcome && live.order_time) {
    const age = Math.floor(Date.now() / 1000) - live.order_time;
    if (age > ORDER_LIFETIME_SEC) {
      nextOutcome = "expired";
    }
  }

  const log = await prisma.orderLog.findFirst({
    where: { orderId: live.order_id },
  });
  if (!log) return false;

  const data: {
    outcome?: string;
    status?: string;
    number?: string;
    otp?: string;
    otpAt?: Date;
  } = {};

  // Jangan downgrade dari terminal state ke pending
  if (nextOutcome && log.outcome === "pending" && nextOutcome !== "pending") {
    data.outcome = nextOutcome;
  }
  // Save OTP value pas pertama muncul (atau kalau outcome legacy belum punya OTP)
  if (hasOtp && !log.otp) {
    data.outcome = "otp_received";
    data.otp = live.otp;
    data.otpAt = new Date();
  }
  if (live.status && log.status !== live.status) {
    data.status = live.status;
  }
  if (live.number && !log.number) {
    data.number = live.number;
  }

  if (Object.keys(data).length === 0) return false;

  await prisma.orderLog.update({
    where: { id: log.id },
    data,
  });
  return true;
}

/**
 * Map outcome internal → status display ala ditznesia.
 */
export function outcomeToStatus(outcome: string): string {
  switch (outcome) {
    case "otp_received":
      return "Sukses";
    case "expired":
    case "timeout":
      return "TIME OUT";
    case "cancelled":
      return "Dibatalkan";
    default:
      return "PENDING";
  }
}
