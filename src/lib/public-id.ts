/**
 * Public order ID generator untuk v2.
 *
 * Format: 8-digit decimal (10000000 - 99999999) → ~90 juta unique IDs.
 * Random + retry kalau collision di DB.
 *
 * Tujuan: hide raw orderId provider dari client API.
 */
import { prisma } from "./prisma";
import { randomInt } from "node:crypto";

const MIN = 10_000_000;
const MAX = 99_999_999;
const MAX_RETRIES = 10;

function generateRandom(): string {
  return String(randomInt(MIN, MAX + 1));
}

/**
 * Generate publicId yang belum dipake di DB.
 * Throw kalau gak nemu unique ID dalam MAX_RETRIES (kondisi sangat jarang).
 */
export async function generatePublicId(): Promise<string> {
  for (let i = 0; i < MAX_RETRIES; i++) {
    const candidate = generateRandom();
    const exists = await prisma.orderLog.findUnique({
      where: { publicId: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
  }
  throw new Error("Gagal generate publicId unique setelah retry");
}
