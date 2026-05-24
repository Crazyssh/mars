/**
 * Pricing rule resolver — apply markup/markdown ke harga ditznesia.
 *
 * Resolusi (paling spesifik dulu):
 *   1. exact match: serviceCode + countryId
 *   2. service-level default: serviceCode + countryId=0
 *   3. fallback: harga provider apa adanya (no markup)
 */
import { prisma } from "./prisma";

interface PriceRule {
  serviceCode: string;
  countryId: number;
  priceType: string;
  value: number;
  active: boolean;
}

let cachedRules: PriceRule[] | null = null;
let cacheTime = 0;
let pendingFetch: Promise<PriceRule[]> | null = null;
const CACHE_TTL_MS = 60_000;

async function getRules(): Promise<PriceRule[]> {
  const now = Date.now();
  if (cachedRules && now - cacheTime < CACHE_TTL_MS) {
    return cachedRules;
  }
  if (pendingFetch) return pendingFetch;

  pendingFetch = prisma.priceRule
    .findMany({
      where: { active: true },
      select: {
        serviceCode: true,
        countryId: true,
        priceType: true,
        value: true,
        active: true,
      },
    })
    .then((rules) => {
      cachedRules = rules;
      cacheTime = Date.now();
      pendingFetch = null;
      return rules;
    })
    .catch((err) => {
      pendingFetch = null;
      throw err;
    });

  return pendingFetch;
}

export function calcPrice(
  basePrice: number,
  rule: { priceType: string; value: number } | null | undefined
): number {
  if (!rule) return basePrice;
  switch (rule.priceType) {
    case "fixed":
      return rule.value;
    case "multiply":
      return Math.ceil((basePrice * rule.value) / 100);
    case "markup":
      return basePrice + rule.value;
    default:
      return basePrice;
  }
}

export interface PricedResult {
  price: number;
  cost: number;
  hasRule: boolean;
}

/**
 * Apply pricing rule ke harga provider.
 * Cuma service "wa" & "tg" yang dicek — service lain langsung pass-through.
 */
export async function applyPricing(
  basePrice: number,
  serviceCode: string,
  countryId: number
): Promise<PricedResult> {
  const code = serviceCode.toLowerCase();
  // Cuma WA & TG yang di-markup-able. Service lain ikut harga provider.
  if (code !== "wa" && code !== "tg") {
    return { price: basePrice, cost: basePrice, hasRule: false };
  }

  const rules = await getRules();
  const exact = rules.find(
    (r) => r.serviceCode === code && r.countryId === countryId
  );
  const serviceDefault = rules.find(
    (r) => r.serviceCode === code && r.countryId === 0
  );
  const rule = exact ?? serviceDefault ?? null;

  return {
    price: calcPrice(basePrice, rule),
    cost: basePrice,
    hasRule: !!rule,
  };
}

export function invalidatePriceCache(): void {
  cachedRules = null;
  cacheTime = 0;
}
