import { parseHarga } from "./mars";

export function extractSaldo(html: string): number | null {
  const matches = html.matchAll(/(\d{1,3}(?:\.\d{3})+)/g);
  const candidates: number[] = [];
  for (const m of matches) {
    const value = parseHarga(m[1]);
    if (value >= 1000 && value <= 999_999_999_999) candidates.push(value);
  }
  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}

export function extractCountriesV3(
  html: string
): Array<{ id: number; slug: string; name: string }> {
  const list: Array<{ id: number; slug: string; name: string }> = [];
  const regex =
    /<option\s+value="(\d+)"\s+data-negara="([^"]+)"[^>]*>([^<]+)<\/option>/g;
  for (const m of html.matchAll(regex)) {
    const id = Number(m[1]);
    const slug = m[2].trim();
    const name = m[3].trim();
    if (Number.isFinite(id) && id >= 0 && slug && name) {
      list.push({ id, slug, name });
    }
  }
  return list;
}
