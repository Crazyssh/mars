/**
 * Mars V3 HTTP client — provider /order endpoint.
 *
 * Beda dari v1/v2:
 * - URL path: /order
 * - listServices return nested: { service: { operator: { harga, stok, ... } } }
 * - createOrder body pake `country=<slug>` + `operator=<virtualXX>` (no countryId)
 * - infoOrder format sama kayak v1/v2
 *
 * Cookies: PHPSESSID + user_id + expires_at (sama struktur kayak v2,
 * tapi disimpan terpisah di SETTING_KEYS.MARS3_*)
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "./config";
import { extractCountriesV3FromSlug, extractSaldo } from "./parse-html";
import { withCache, setCacheValue, CACHE_KEYS } from "./live-cache";
import { getSharedCfClearance, getDynamicUserAgent, refreshCfSession, getSharedPhpsessid, getSharedUserId, getSharedExpiresAt, setSharedCookies } from "./cf-session";
import {
  MarsError,
  parseHarga,
  parseCancelResponse,
  type HistoryOrder,
  type CreateOrderResult,
  type CancelResult,
  type MarsCountry,
} from "./mars";

const execFileAsync = promisify(execFile);
const CURL_BINARY = process.platform === "win32" ? "curl.exe" : "curl";

// ==================== TYPES ====================

/** Entry untuk 1 operator dari sebuah service. */
export interface V3OperatorInfo {
  harga: string;
  stok: number;
  rate?: string;
  service?: string;
}

/** Response listServices v3: nested service → operator → info. */
export type V3ServicesResponse = Record<
  string,
  Record<string, V3OperatorInfo>
>;

/** Flattened entry untuk client: kombinasi service + operator. */
export interface V3ServiceOption {
  code: string; // format "service:operator"
  name: string; // "service (operator)"
  service: string;
  operator: string;
  priceIdr: number;
  stock: number;
  rate: string;
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

/**
 * Flatten v3 response ke list V3ServiceOption (per operator).
 * Skip operator yang stok 0.
 */
export function flattenV3Services(
  response: V3ServicesResponse,
  filterQuery?: string
): V3ServiceOption[] {
  const flat: V3ServiceOption[] = [];
  const query = filterQuery?.toLowerCase();
  for (const [service, operators] of Object.entries(response)) {
    if (!operators || typeof operators !== "object") continue;
    if (query && !service.toLowerCase().includes(query)) continue;
    for (const [operator, info] of Object.entries(operators)) {
      if (!info || typeof info !== "object") continue;
      const stock = Number(info.stok) || 0;
      if (stock <= 0) continue;
      flat.push({
        code: `${service}:${operator}`,
        name: `${service} (${operator})`,
        service,
        operator,
        priceIdr: parseHarga(info.harga),
        stock,
        rate: info.rate ?? "n/a",
      });
    }
  }
  flat.sort((a, b) => a.priceIdr - b.priceIdr);
  return flat;
}

// ==================== CLIENT ====================

class Mars3Client {
  private countriesCache: MarsCountry[] = [];

  async getPhpsessid(): Promise<string> {
    return getSharedPhpsessid();
  }

  async getUserId(): Promise<string> {
    return getSharedUserId();
  }

  async getExpiresAt(): Promise<string> {
    return getSharedExpiresAt();
  }

  async getCfClearance(): Promise<string> {
    return getSharedCfClearance();
  }

  async setCookies(
    phpsessid: string,
    userId: string,
    expiresAt: string,
    cfClearance: string
  ): Promise<void> {
    await setSharedCookies(phpsessid, userId, expiresAt, cfClearance);
  }

  private async cookieHeader(): Promise<string> {
    const [phpsessid, userId, expiresAt, cfClearance] = await Promise.all([
      this.getPhpsessid(),
      this.getUserId(),
      this.getExpiresAt(),
      this.getCfClearance(),
    ]);
    return `PHPSESSID=${phpsessid}; user_id=${userId}; expires_at=${expiresAt}; cf_clearance=${cfClearance}`;
  }

  get countries(): MarsCountry[] {
    return this.countriesCache;
  }

  async loadCountries(): Promise<MarsCountry[]> {
    const html = await this.getOrderPageHtml();
    const list = extractCountriesV3FromSlug(html);
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

  findCountryBySlug(slug: string): MarsCountry | undefined {
    return this.countriesCache.find((c) => c.slug === slug);
  }

  private async request(opts: {
    method: "GET" | "POST";
    path: string;
    body?: string;
    accept?: string;
    referer?: string;
  }): Promise<{ status: number; body: string }> {
    const url = `${config.mars.baseUrl}${opts.path}`;

    const buildArgs = async (): Promise<string[]> => {
      const ua = await getDynamicUserAgent();
      const a: string[] = [
        "-s",
        "-w", "\n%{http_code}",
        "--compressed",
        "--max-time", "45",
        "--connect-timeout", "10",
        "--retry", "2",
        "--retry-delay", "2",
        "--retry-connrefused",
        "-X", opts.method,
        "-H", `User-Agent: ${ua}`,
        "-H", `Accept: ${opts.accept ?? "*/*"}`,
        "-H", "Accept-Language: id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        "-H", `Referer: ${opts.referer ?? config.mars.baseUrl + "/order"}`,
        "-H", "X-Requested-With: XMLHttpRequest",
        "-H", "DNT: 1",
        "-H", "Priority: u=1, i",
        "-H", 'sec-ch-ua: "Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
        "-H", 'sec-ch-ua-arch: "x86"',
        "-H", 'sec-ch-ua-bitness: "64"',
        "-H", 'sec-ch-ua-full-version: "149.0.7827.103"',
        "-H", 'sec-ch-ua-full-version-list: "Google Chrome";v="149.0.7827.103", "Chromium";v="149.0.7827.103", "Not)A;Brand";v="24.0.0.0"',
        "-H", "sec-ch-ua-mobile: ?0",
        "-H", 'sec-ch-ua-model: ""',
        "-H", 'sec-ch-ua-platform: "Windows"',
        "-H", 'sec-ch-ua-platform-version: "19.0.0"',
        "-H", "sec-fetch-dest: empty",
        "-H", "sec-fetch-mode: cors",
        "-H", "sec-fetch-site: same-origin",
        "-b", await this.cookieHeader(),
      ];
      if (opts.method === "POST" && opts.body !== undefined) {
        a.push("-H", `Origin: ${config.mars.baseUrl}`);
        a.push("-H", "Content-Type: application/x-www-form-urlencoded; charset=UTF-8");
        a.push("--data-raw", opts.body);
      }
      a.push(url);
      return a;
    };

    const runOnce = async (): Promise<{ status: number; body: string }> => {
      let stdout: string;
      try {
        const result = await execFileAsync(CURL_BINARY, await buildArgs(), {
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
      return { status: Number.isFinite(status) ? status : 0, body };
    };

    let res = await runOnce();
    if (res.status === 403 && (await refreshCfSession())) {
      res = await runOnce();
    }
    return res;
  }

  async getOrderPageHtml(): Promise<string> {
    const res = await this.request({
      method: "GET",
      path: "/order",
      accept: "text/html,application/xhtml+xml",
    });
    if (res.status !== 200) {
      throw new MarsError(
        "Gagal load halaman provider — kemungkinan session expired",
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

  /**
   * V3 listServices pakai country slug, bukan id.
   */
  async listServices(countrySlug: string): Promise<V3ServicesResponse> {
    return withCache(CACHE_KEYS.V3_SERVICES(countrySlug), 30_000, async () => {
      const res = await this.request({
        method: "POST",
        path: "/order",
        body: `country=${encodeURIComponent(countrySlug)}`,
      });
      if (res.status !== 200) {
        throw new MarsError(
          `Gagal listServices (country ${countrySlug})`,
          res.status,
          res.body.slice(0, 200)
        );
      }
      const data = parseJsonSafe<V3ServicesResponse>(res.body);
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

  async createOrder(params: {
    countrySlug: string;
    service: string; // tanpa operator
    operator: string;
    priceIdr: number;
  }): Promise<CreateOrderResult> {
    const body = new URLSearchParams({
      order_service_id: params.service,
      country: params.countrySlug,
      service_name: params.service,
      harga: String(params.priceIdr),
      operator: params.operator,
    }).toString();

    try {
      const res = await this.request({
        method: "POST",
        path: "/order",
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

  async cancelOrder(orderId: string): Promise<CancelResult> {
    const res = await this.request({
      method: "POST",
      path: "/order?nomor=&status=&limit=100&page=1",
      body: `cancel=${encodeURIComponent(orderId)}`,
    });
    const { success, message } = parseCancelResponse(res.body, res.status === 200);
    return {
      success: res.status === 200 && success,
      message,
      raw: res.body.slice(0, 500),
    };
  }

  async getHistory(page = 1, limit = 100): Promise<HistoryOrder[]> {
    if (page === 1 && limit === 100) {
      return withCache(CACHE_KEYS.V3_HISTORY_PAGE_1, 2_000, () =>
        this.fetchHistory(page, limit)
      );
    }
    return this.fetchHistory(page, limit);
  }

  async fetchHistoryFresh(page = 1, limit = 100): Promise<HistoryOrder[]> {
    const data = await this.fetchHistory(page, limit);
    if (page === 1 && limit === 100) {
      setCacheValue(CACHE_KEYS.V3_HISTORY_PAGE_1, data, 2_000);
    }
    return data;
  }

  private async fetchHistory(page: number, limit: number): Promise<HistoryOrder[]> {
    const path = `/order?nomor=&status=&limit=${limit}&page=${page}&action=infoOrder`;
    const res = await this.request({
      method: "GET",
      path,
    });
    if (res.status === 429) {
      throw new MarsError("Provider rate limited (HTTP 429)", 429);
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

  async getOrder(orderId: string): Promise<HistoryOrder | null> {
    const list = await this.getHistory(1, 100);
    return list.find((o) => o.order_id === orderId) ?? null;
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __mars3Client: Mars3Client | undefined;
}

export const mars3 =
  global.__mars3Client ?? (global.__mars3Client = new Mars3Client());

export { parseHarga };
