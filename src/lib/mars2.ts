/**
 * Mars V2 HTTP client — provider /orderv2 endpoint.
 *
 * Beda dari v1 (mars.ts):
 * - URL path: /orderv2 (bukan /orderv3)
 * - Cookies: PHPSESSID + user_id + expires_at (bukan cf_clearance)
 * - createOrder body tanpa `operator`
 *
 * Cookies v2 disimpan di tabel Setting dengan keys mars2.*
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "./config";
import { extractCountriesV3, extractSaldo } from "./parse-html";
import { getSetting, setSetting, SETTING_KEYS } from "./settings";
import { withCache, setCacheValue, CACHE_KEYS } from "./live-cache";
import {
  MarsError,
  parseHarga,
  type HistoryOrder,
  type ServicesResponse,
  type CreateOrderResult,
  type MarsCountry,
} from "./mars";

const execFileAsync = promisify(execFile);
const CURL_BINARY = process.platform === "win32" ? "curl.exe" : "curl";

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

class Mars2Client {
  private countriesCache: MarsCountry[] = [];

  async getPhpsessid(): Promise<string> {
    return (await getSetting(SETTING_KEYS.MARS2_PHPSESSID)) ?? "";
  }

  async getUserId(): Promise<string> {
    return (await getSetting(SETTING_KEYS.MARS2_USER_ID)) ?? "";
  }

  async getExpiresAt(): Promise<string> {
    return (await getSetting(SETTING_KEYS.MARS2_EXPIRES_AT)) ?? "";
  }

  async setCookies(
    phpsessid: string,
    userId: string,
    expiresAt: string
  ): Promise<void> {
    await setSetting(SETTING_KEYS.MARS2_PHPSESSID, phpsessid);
    await setSetting(SETTING_KEYS.MARS2_USER_ID, userId);
    await setSetting(SETTING_KEYS.MARS2_EXPIRES_AT, expiresAt);
  }

  private async cookieHeader(): Promise<string> {
    const [phpsessid, userId, expiresAt] = await Promise.all([
      this.getPhpsessid(),
      this.getUserId(),
      this.getExpiresAt(),
    ]);
    return `PHPSESSID=${phpsessid}; user_id=${userId}; expires_at=${expiresAt}`;
  }

  get countries(): MarsCountry[] {
    return this.countriesCache;
  }

  async loadCountries(): Promise<MarsCountry[]> {
    const html = await this.getOrderPageHtml();
    const list = extractCountriesV3(html);
    if (list.length === 0) {
      throw new MarsError(
        "Gagal parse country list dari provider — HTML format mungkin berubah",
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
      "-H", `Referer: ${opts.referer ?? config.mars.baseUrl + "/orderv2"}`,
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
      path: "/orderv2",
      accept: "text/html,application/xhtml+xml",
    });
    if (res.status !== 200) {
      throw new MarsError(
        "Gagal load halaman provider v2 — kemungkinan session expired",
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
    return withCache(CACHE_KEYS.V2_SERVICES(countryId), 30_000, async () => {
      const res = await this.request({
        method: "POST",
        path: "/orderv2",
        body: `country=${countryId}`,
      });
      if (res.status !== 200) {
        throw new MarsError(
          `Gagal listServices v2 (country ${countryId})`,
          res.status,
          res.body.slice(0, 200)
        );
      }
      const data = parseJsonSafe<ServicesResponse>(res.body);
      if (!data || typeof data !== "object") {
        throw new MarsError(
          `Response listServices v2 bukan JSON valid`,
          res.status,
          res.body.slice(0, 200)
        );
      }
      return data;
    });
  }

  async createOrder(params: {
    countryId: number;
    service: string;
    serviceName?: string;
    namaNegara?: string;
    priceIdr: number;
  }): Promise<CreateOrderResult> {
    // Body v2: TANPA `operator`
    const body = new URLSearchParams({
      order_service_id: params.service,
      country: String(params.countryId),
      nama_negara: params.namaNegara ?? "",
      service_name: params.serviceName ?? params.service,
      harga: String(params.priceIdr),
    }).toString();

    try {
      const res = await this.request({
        method: "POST",
        path: "/orderv2",
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
      path: "/orderv2",
      body: `cancel=${encodeURIComponent(orderId)}`,
    });
    return {
      success: res.status === 200,
      raw: res.body.slice(0, 500),
    };
  }

  async getHistory(page = 1, limit = 100): Promise<HistoryOrder[]> {
    if (page === 1 && limit === 100) {
      return withCache(CACHE_KEYS.V2_HISTORY_PAGE_1, 7_000, () =>
        this.fetchHistory(page, limit)
      );
    }
    return this.fetchHistory(page, limit);
  }

  async fetchHistoryFresh(page = 1, limit = 100): Promise<HistoryOrder[]> {
    const data = await this.fetchHistory(page, limit);
    if (page === 1 && limit === 100) {
      setCacheValue(CACHE_KEYS.V2_HISTORY_PAGE_1, data, 7_000);
    }
    return data;
  }

  private async fetchHistory(page: number, limit: number): Promise<HistoryOrder[]> {
    const path = `/orderv2?nomor=&status=&limit=${limit}&page=${page}&action=infoOrder`;
    const res = await this.request({
      method: "GET",
      path,
    });
    if (res.status === 429) {
      throw new MarsError("Provider v2 rate limited (HTTP 429)", 429);
    }
    if (res.status !== 200) {
      throw new MarsError(
        `Gagal ambil history v2 (HTTP ${res.status})`,
        res.status,
        res.body.slice(0, 300)
      );
    }
    const trimmed = res.body.trimStart();
    if (trimmed.startsWith("<")) {
      throw new MarsError(
        "Endpoint v2 return HTML, bukan JSON (cek cookies)",
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
        `Response history v2 bukan array JSON. Body: ${res.body.slice(0, 200)}`,
        res.status
      );
    }
    return arr as HistoryOrder[];
  }

  async getOrder(orderId: string): Promise<HistoryOrder | null> {
    const list = await this.getHistory(1, 100);
    return list.find((o) => o.order_id === orderId) ?? null;
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __mars2Client: Mars2Client | undefined;
}

export const mars2 =
  global.__mars2Client ?? (global.__mars2Client = new Mars2Client());

// Re-export untuk convenience
export { parseHarga };
