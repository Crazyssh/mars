/**
 * Mars (ditznesia.com) HTTP client untuk web dashboard.
 * Pakai curl subprocess biar TLS fingerprint match Chrome (Node.js https
 * langsung kena Cloudflare WAF).
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "./config";
import { extractCountriesV3, extractSaldo } from "./parse-html";
import { getSetting, setSetting, SETTING_KEYS } from "./settings";
import { withCache, setCacheValue, CACHE_KEYS } from "./live-cache";

const execFileAsync = promisify(execFile);
const CURL_BINARY = process.platform === "win32" ? "curl.exe" : "curl";

// ==================== TYPES ====================

export type OrderStatus =
  | "PENDING"
  | "Sukses"
  | "TIME OUT"
  | "Dibatalkan"
  | string;

export interface HistoryOrder {
  service_name: string;
  number: string;
  order_id: string;
  status: OrderStatus;
  otp: string; // "Menunggu" kalau belum ada
  order_time: number;
  order_service_id: string;
  country: string;
  harga: string;
  created_at: string;
}

export interface ServiceInfo {
  harga: string;
  stok: number;
  layanan: string;
}

export type ServicesResponse = Record<string, ServiceInfo>;

export interface ServicesOption {
  code: string;
  name: string;
  priceIdr: number;
  stock: number;
}

export interface MarsCountry {
  id: number;
  slug: string;
  name: string;
}

export interface CreateOrderResult {
  success: boolean;
  orderId?: string;
  number?: string;
  raw: unknown;
  errorMessage?: string;
}

// ==================== ERROR ====================

export class MarsError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public raw?: unknown
  ) {
    super(message);
    this.name = "MarsError";
  }

  get isAuthError(): boolean {
    return this.statusCode === 401 || this.statusCode === 403;
  }
}

// ==================== HELPERS ====================

function parseJsonSafe<T>(data: unknown): T | null {
  if (data === null || data === undefined) return null;
  if (typeof data === "object") return data as T;
  if (typeof data === "string") {
    try {
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  }
  return null;
}

function extractField(
  data: unknown,
  keys: string[]
): string | number | undefined {
  if (!data || typeof data !== "object") return undefined;
  const obj = data as Record<string, unknown>;
  for (const k of keys) {
    if (obj[k] !== undefined && (typeof obj[k] === "string" || typeof obj[k] === "number")) {
      return obj[k] as string | number;
    }
    if (obj.data && typeof obj.data === "object") {
      const nested = (obj.data as Record<string, unknown>)[k];
      if (nested !== undefined && (typeof nested === "string" || typeof nested === "number")) {
        return nested as string | number;
      }
    }
  }
  return undefined;
}

export function parseHarga(raw: string | number): number {
  if (typeof raw === "number") return raw;
  const cleaned = raw.replace(/\./g, "").replace(/,/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function formatRupiah(n: number): string {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

export function flattenServices(
  response: ServicesResponse,
  filterQuery?: string
): ServicesOption[] {
  const flat: ServicesOption[] = [];
  const query = filterQuery?.toLowerCase();
  for (const [code, info] of Object.entries(response)) {
    if (!info || typeof info !== "object") continue;
    const name = (info.layanan ?? code).toString();
    if (query && !code.toLowerCase().includes(query) && !name.toLowerCase().includes(query)) {
      continue;
    }
    const stock = Number(info.stok) || 0;
    if (stock <= 0) continue;
    flat.push({
      code,
      name,
      priceIdr: parseHarga(info.harga),
      stock,
    });
  }
  flat.sort((a, b) => a.priceIdr - b.priceIdr);
  return flat;
}

// ==================== STARTUP ====================

export async function verifyCurlAvailable(): Promise<void> {
  try {
    await execFileAsync(CURL_BINARY, ["--version"], { timeout: 5000 });
  } catch (e) {
    throw new Error(
      `curl binary tidak ditemukan di PATH. (${(e as Error).message})`
    );
  }
}

// ==================== CLIENT ====================

class MarsClient {
  private countriesCache: MarsCountry[] = [];

  /**
   * Get current PHPSESSID — prefer DB (live update via /admin/cookies),
   * fallback ke .env.
   */
  async getPhpsessid(): Promise<string> {
    return (
      (await getSetting(SETTING_KEYS.MARS_PHPSESSID)) ??
      config.mars.phpsessid
    );
  }

  async getCfClearance(): Promise<string> {
    return (
      (await getSetting(SETTING_KEYS.MARS_CF_CLEARANCE)) ??
      config.mars.cfClearance
    );
  }

  /**
   * Update cookies di DB. Live — request berikutnya pakai value baru.
   */
  async setCookies(phpsessid: string, cfClearance: string): Promise<void> {
    await setSetting(SETTING_KEYS.MARS_PHPSESSID, phpsessid);
    await setSetting(SETTING_KEYS.MARS_CF_CLEARANCE, cfClearance);
  }

  private async cookieHeader(): Promise<string> {
    const [phpsessid, cfClearance] = await Promise.all([
      this.getPhpsessid(),
      this.getCfClearance(),
    ]);
    return `PHPSESSID=${phpsessid}; cf_clearance=${cfClearance}`;
  }

  get countries(): MarsCountry[] {
    return this.countriesCache;
  }

  async loadCountries(): Promise<MarsCountry[]> {
    const html = await this.getOrderPageHtml();
    const list = extractCountriesV3(html);
    if (list.length === 0) {
      throw new MarsError(
        "Gagal parse country list dari /orderv3 — HTML format mungkin berubah",
        0
      );
    }
    this.countriesCache = list;
    return list;
  }

  searchCountries(query: string, limit = 10): MarsCountry[] {
    const q = query.toLowerCase().trim();
    if (!q) return this.countriesCache.slice(0, limit);
    return this.countriesCache
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q)
      )
      .slice(0, limit);
  }

  findCountry(id: number): MarsCountry | undefined {
    return this.countriesCache.find((c) => c.id === id);
  }

  private async request(opts: {
    method: "GET" | "POST";
    path: string;
    body?: string;
    accept?: string;
    referer?: string;
  }): Promise<{ status: number; body: string }> {
    const url = `${config.mars.baseUrl}${opts.path}`;
    const args: string[] = [
      "-s",
      "-w", "\n%{http_code}",
      "--compressed",
      "--max-time", "30",
      "--connect-timeout", "10",
      "--retry", "2",
      "--retry-delay", "2",
      "--retry-connrefused",
      "-X", opts.method,
      "-H", `User-Agent: ${config.mars.userAgent}`,
      "-H", `Accept: ${opts.accept ?? "*/*"}`,
      "-H", "Accept-Language: id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      "-H", `Origin: ${config.mars.baseUrl}`,
      "-H", `Referer: ${opts.referer ?? config.mars.baseUrl + "/orderv3"}`,
      "-H", "X-Requested-With: XMLHttpRequest",
      "-H", "DNT: 1",
      "-H", 'sec-ch-ua: "Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"',
      "-H", "sec-ch-ua-mobile: ?0",
      "-H", 'sec-ch-ua-platform: "Windows"',
      "-H", "sec-fetch-dest: empty",
      "-H", "sec-fetch-mode: cors",
      "-H", "sec-fetch-site: same-origin",
      "-H", "Priority: u=1, i",
      "-b", await this.cookieHeader(),
    ];
    if (opts.method === "POST" && opts.body !== undefined) {
      args.push("-H", "Content-Type: application/x-www-form-urlencoded; charset=UTF-8");
      args.push("--data-raw", opts.body);
    }
    args.push(url);

    let stdout: string;
    try {
      const result = await execFileAsync(CURL_BINARY, args, {
        maxBuffer: 50 * 1024 * 1024,
        timeout: 35_000,
      });
      stdout = result.stdout;
    } catch (e) {
      // execFile throws kalau curl exit non-zero. Bisa karena:
      // - timeout (max-time 30s)
      // - network/DNS error
      // - cf_clearance challenge yang return body kosong
      // Wrap as MarsError biar caller bisa handle.
      const err = e as Error & { code?: number; stdout?: string };
      const msg = err.code
        ? `curl exit code ${err.code}`
        : err.message?.slice(0, 100) ?? "unknown";
      throw new MarsError(`curl failed: ${msg}`, 0, err.stdout?.slice(0, 200));
    }
    const lastNl = stdout.lastIndexOf("\n");
    if (lastNl < 0) {
      throw new MarsError(`Empty curl response`, 0, stdout);
    }
    const statusStr = stdout.slice(lastNl + 1).trim();
    const status = parseInt(statusStr, 10);
    const body = stdout.slice(0, lastNl);
    return {
      status: Number.isFinite(status) ? status : 0,
      body,
    };
  }

  async getOrderPageHtml(): Promise<string> {
    const res = await this.request({
      method: "GET",
      path: "/orderv3",
      accept: "text/html,application/xhtml+xml",
    });
    if (res.status !== 200) {
      throw new MarsError(
        "Gagal load /orderv3 — kemungkinan session expired",
        res.status,
        res.body.slice(0, 200)
      );
    }
    return res.body;
  }

  async getSaldo(): Promise<number | null> {
    const html = await this.getOrderPageHtml();
    return extractSaldo(html);
  }

  async listServices(countryId: number): Promise<ServicesResponse> {
    return withCache(CACHE_KEYS.SERVICES(countryId), 30_000, async () => {
      const res = await this.request({
        method: "POST",
        path: "/orderv3",
        body: `country=${countryId}`,
      });
      if (res.status !== 200) {
        throw new MarsError(
          `Gagal listServices (country ${countryId})`,
          res.status,
          res.body.slice(0, 200)
        );
      }
      const data = parseJsonSafe<ServicesResponse>(res.body);
      if (!data || typeof data !== "object") {
        throw new MarsError(
          `Response listServices bukan JSON valid`,
          res.status,
          res.body.slice(0, 200)
        );
      }
      return data;
    });
  }

  async listOperators(countryId: number): Promise<string[]> {
    const res = await this.request({
      method: "POST",
      path: "/orderv3",
      body: `getoperator=${countryId}`,
    });
    if (res.status !== 200) return [];
    const data = parseJsonSafe<Record<string, string[]>>(res.body);
    if (!data) return [];
    const list = data[String(countryId)] ?? [];
    return Array.isArray(list) ? list : [];
  }

  async createOrder(params: {
    countryId: number;
    service: string;
    serviceName?: string;
    operator?: string;
    namaNegara?: string;
    priceIdr: number;
  }): Promise<CreateOrderResult> {
    const body = new URLSearchParams({
      order_service_id: params.service,
      country: String(params.countryId),
      operator: params.operator ?? "any",
      nama_negara: params.namaNegara ?? "",
      service_name: params.serviceName ?? params.service,
      harga: String(params.priceIdr),
    }).toString();

    try {
      const res = await this.request({
        method: "POST",
        path: "/orderv3",
        body,
      });
      const parsed = parseJsonSafe<Record<string, unknown>>(res.body);
      const data: Record<string, unknown> | string = parsed ?? res.body;
      const orderId = extractField(data, ["order_id", "id", "orderId"]);
      const number = extractField(data, ["number", "phone", "nomor"]);
      return {
        success: res.status === 200 && !!orderId,
        orderId: orderId ? String(orderId) : undefined,
        number: number ? String(number) : undefined,
        raw: data,
        errorMessage:
          res.status !== 200
            ? `HTTP ${res.status}`
            : orderId
              ? undefined
              : typeof data === "string"
                ? data.slice(0, 200)
                : JSON.stringify(data).slice(0, 200),
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { success: false, raw: null, errorMessage: msg };
    }
  }

  async cancelOrder(orderId: string): Promise<{ success: boolean; raw: unknown }> {
    const res = await this.request({
      method: "POST",
      path: "/orderv3",
      body: `cancel=${encodeURIComponent(orderId)}`,
    });
    return {
      success: res.status === 200,
      raw: res.body.slice(0, 500),
    };
  }

  async getHistory(page = 1, limit = 100): Promise<HistoryOrder[]> {
    // Page 1 di-cache karena sering dipake (poller, history endpoint, getOrder).
    // TTL 7s < poller interval 10s → poller selalu refresh, semua call lain
    // baca cache.
    if (page === 1 && limit === 100) {
      return withCache(CACHE_KEYS.HISTORY_PAGE_1, 7_000, () =>
        this.fetchHistory(page, limit)
      );
    }
    return this.fetchHistory(page, limit);
  }

  /** Force-fetch ke ditznesia, bypass cache. Dipake oleh poller. */
  async fetchHistoryFresh(page = 1, limit = 100): Promise<HistoryOrder[]> {
    const data = await this.fetchHistory(page, limit);
    if (page === 1 && limit === 100) {
      // Update cache supaya call lain dapet data fresh
      setCacheValue(CACHE_KEYS.HISTORY_PAGE_1, data, 7_000);
    }
    return data;
  }

  private async fetchHistory(page: number, limit: number): Promise<HistoryOrder[]> {
    const path = `/orderv3?nomor=&status=&limit=${limit}&page=${page}&action=infoOrder`;
    const res = await this.request({
      method: "GET",
      path,
    });
    if (res.status === 429) {
      throw new MarsError("Rate limited oleh ditznesia (HTTP 429)", 429);
    }
    if (res.status !== 200) {
      throw new MarsError(
        `Gagal ambil history (HTTP ${res.status})`,
        res.status,
        res.body.slice(0, 300)
      );
    }
    const trimmed = res.body.trimStart();
    if (trimmed.startsWith("<")) {
      throw new MarsError(
        "Endpoint return HTML, bukan JSON (cek cookies)",
        res.status,
        res.body.slice(0, 200)
      );
    }
    const data = parseJsonSafe<HistoryOrder[] | { data: HistoryOrder[] }>(
      res.body
    );
    let arr: unknown = data;
    if (data && typeof data === "object" && !Array.isArray(data) && "data" in data) {
      arr = (data as { data: unknown }).data;
    }
    if (!Array.isArray(arr)) {
      throw new MarsError(
        `Response history bukan array JSON. Body: ${res.body.slice(0, 200)}`,
        res.status
      );
    }
    return arr as HistoryOrder[];
  }

  /**
   * Multi-page sampai dapet semua row unik. Default 1 page (limit=100 row),
   * itu udah cukup untuk hampir semua kasus.
   */
  async getHistoryAll(maxPages = 1, limit = 100): Promise<HistoryOrder[]> {
    const all: HistoryOrder[] = [];
    const seen = new Set<string>();
    for (let p = 1; p <= maxPages; p++) {
      let pageData: HistoryOrder[];
      try {
        pageData = await this.getHistory(p, limit);
      } catch (e) {
        if (p === 1) throw e;
        break;
      }
      if (pageData.length === 0) break;
      let newCount = 0;
      for (const o of pageData) {
        if (!seen.has(o.order_id)) {
          seen.add(o.order_id);
          all.push(o);
          newCount++;
        }
      }
      if (newCount === 0) break;
    }
    return all;
  }

  async getOrder(orderId: string): Promise<HistoryOrder | null> {
    const list = await this.getHistory(1, 100);
    return list.find((o) => o.order_id === orderId) ?? null;
  }
}

// Single global instance (Next.js server reuses across requests)
declare global {
  // eslint-disable-next-line no-var
  var __marsClient: MarsClient | undefined;
}

export const mars = global.__marsClient ?? (global.__marsClient = new MarsClient());
