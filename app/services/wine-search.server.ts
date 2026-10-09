import merchantRegistry from "../data/wine-merchants.json" with { type: "json" };
/** Wine-Searcher Market price API. Field names: https://www.wine-searcher.com/trade/ws-api */
export const LOCATIONS = [
  "USA",
  "France",
  "Germany",
  "Hong Kong",
  "Japan",
  "China",
  "Taiwan",
  "Thailand",
] as const;
export const COUNTRY_LABELS: Record<string, string> = {
  USA: "미국",
  UK: "영국",
  France: "프랑스",
  Italy: "이탈리아",
  Germany: "독일",
  "Hong Kong": "홍콩",
  Japan: "일본",
  Australia: "호주",
  China: "중국",
  Taiwan: "대만",
  Thailand: "태국",
  Singapore: "싱가포르",
  Switzerland: "스위스",
  Belgium: "벨기에",
  Denmark: "덴마크",
};
// HootTown deliveryAgency center list, checked 2026-10-09. Center presence
// does not establish alcohol acceptance or merchant delivery to that center.
export const FORWARDING_CENTERS: Record<string, string> = {
  USA: "OR · DE · NJ · CA",
  Germany: "독일",
  France: "프랑스",
  Japan: "일본",
  China: "중국",
  "Hong Kong": "홍콩",
  Taiwan: "대만",
  Thailand: "태국",
};
export const MERCHANT_DIRECTORY = merchantRegistry.filter((m) =>
  (LOCATIONS as readonly string[]).includes(m.country),
);
export type WineQuery = { name: string; vintage: string; location: string };
export type WineOffer = {
  merchant: string;
  title?: string;
  availability?: string;
  fetchedAt?: string;
  vintage: string;
  price: number;
  currency: string;
  country: string;
  bottleSize: string;
  url: string;
  description: string;
  tax?: string;
};
export type WineResult = {
  source?: "merchants";
  coverage?: {
    registered: number;
    searched: number;
    succeeded: number;
    incomplete: number;
  };
  state: "ready" | "empty" | "ambiguous";
  offers: WineOffer[];
  fetchedAt: string;
  sourceUrl?: string;
  matchedName?: string;
  partial?: boolean;
};
export class WineSearchError extends Error {
  kind: "input" | "unconfigured" | "busy" | "provider";
  constructor(kind: WineSearchError["kind"], message: string) {
    super(message);
    this.kind = kind;
  }
}
export function parseWineQuery(params: URLSearchParams): WineQuery {
  const name = (params.get("q") || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
  const vintage = (params.get("vintage") || "2").toUpperCase();
  const location = params.get("location") || "USA";
  if (
    name.length < 2 ||
    name.length > 160 ||
    Array.from(name).some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    )
  )
    throw new WineSearchError("input", "상품명을 2~160자로 입력해 주세요.");
  if (
    vintage !== "2" &&
    vintage !== "NV" &&
    (!/^\d{4}$/.test(vintage) ||
      Number(vintage) < 1900 ||
      Number(vintage) > new Date().getFullYear() + 1)
  )
    throw new WineSearchError(
      "input",
      "빈티지는 1900년 이후의 연도 또는 NV로 입력해 주세요.",
    );
  if (!(LOCATIONS as readonly string[]).includes(location))
    throw new WineSearchError("input", "판매 국가를 다시 선택해 주세요.");
  return { name, vintage, location };
}
function apiConfig() {
  const key = process.env.WINE_SEARCHER_API_KEY?.trim();
  const raw = process.env.WINE_SEARCHER_API_URL?.trim();
  if (process.env.WINE_SEARCHER_ENABLED !== "true" || !key || !raw) return null;
  try {
    const url = new URL(raw);
    if (
      url.protocol !== "https:" ||
      !(
        url.hostname === "wine-searcher.com" ||
        url.hostname.endsWith(".wine-searcher.com")
      ) ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash
    )
      return null;
    return { key, url };
  } catch {
    return null;
  }
}
export function wineSearchAvailable() {
  return process.env.WINE_SEARCHER_MODE !== "api" || Boolean(apiConfig());
}
const string = (value: unknown) =>
  typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
function safeLink(value: unknown) {
  try {
    const url = new URL(string(value));
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
}
// The public docs specify field names, not JSON wrapper names. Traverse wrappers,
// but never interpret unknown fields as offers or successful empty results.
export function parseWineResponse(
  payload: unknown,
  now = new Date(),
): WineResult {
  const records: Record<string, unknown>[] = [];
  function walk(value: unknown, depth = 0) {
    if (depth > 12 || records.length > 5000)
      throw new WineSearchError(
        "provider",
        "판매처 응답 형식을 확인할 수 없습니다.",
      );
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
    } else if (value && typeof value === "object") {
      records.push(value as Record<string, unknown>);
      for (const item of Object.values(value))
        if (item && typeof item === "object") walk(item, depth + 1);
    }
  }
  walk(payload);
  const header = records.find((r) => Object.hasOwn(r, "return-code"));
  const code = string(header?.["return-code"]);
  const fetchedAt = now.toISOString();
  if (["1", "9"].includes(code))
    return { state: "empty", offers: [], fetchedAt };
  if (code === "8") return { state: "ambiguous", offers: [], fetchedAt };
  if (code !== "0")
    throw new WineSearchError(
      "provider",
      code === "5"
        ? "오늘의 검색 한도에 도달했습니다. 잠시 후 다시 시도해 주세요."
        : "판매처 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
  const currency = string(header?.["list-currency-code"]);
  if (!/^[A-Z]{3}$/.test(currency))
    throw new WineSearchError(
      "provider",
      "판매 가격의 통화를 확인할 수 없습니다.",
    );
  const offers: WineOffer[] = [];
  const seen = new Set<string>();
  for (const row of records.filter((r) => Object.hasOwn(r, "merchant-name"))) {
    const merchant = string(row["merchant-name"]),
      url = safeLink(row.link);
    const rawPrice = string(row.price);
    const price = /^\d+(\.\d+)?$/.test(rawPrice) ? Number(rawPrice) : NaN;
    if (!merchant || !url || !Number.isFinite(price) || price <= 0) continue;
    const offer = {
      merchant,
      url,
      price,
      currency,
      vintage: string(row.vintage),
      country: string(row.country),
      bottleSize: string(row["bottle-size"]),
      description: string(row["merchant-description"]),
    };
    const identity = JSON.stringify([
      url,
      offer.vintage,
      offer.bottleSize,
      price,
      currency,
    ]);
    if (!seen.has(identity)) {
      seen.add(identity);
      offers.push(offer);
    }
  }
  if (!offers.length) {
    if (string(header?.["list-count"]) === "0")
      return { state: "empty", offers: [], fetchedAt };
    throw new WineSearchError(
      "provider",
      "판매처 응답을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.",
    );
  }
  return {
    state: "ready",
    offers: offers.sort((a, b) => a.price - b.price).slice(0, 100),
    fetchedAt,
  };
}
export async function fetchWineOffers(
  query: WineQuery,
  config: { key: string; url: URL },
  fetcher: typeof fetch = fetch,
): Promise<WineResult> {
  const url = new URL(config.url);
  for (const [name, value] of Object.entries({
    api_key: config.key,
    winename: query.name,
    vintage: query.vintage,
    location: query.location,
    currencycode: "USD",
    format: "J",
    offer_type: "R",
    bottle_size: "B",
    autoexpand: "N",
  }))
    url.searchParams.set(name, value);
  try {
    const response = await fetcher(url, {
      signal: AbortSignal.timeout(10000),
      redirect: "error",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("upstream status");
    // Bound the decoded body too; content-length alone is not trustworthy.
    const reader = response.body?.getReader();
    if (!reader) throw new Error("missing body");
    const chunks: Uint8Array[] = [];
    let length = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 2_000_000) {
        await reader.cancel();
        throw new Error("body too large");
      }
      chunks.push(value);
    }
    return parseWineResponse(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
  } catch (error) {
    if (error instanceof WineSearchError) throw error;
    // Never return/log the request URL: it contains the API key.
    throw new WineSearchError(
      "provider",
      "판매처 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
  }
}
const inFlight = new Map<string, Promise<WineResult>>();
const crawlCache = new Map<string, { time: number; result: WineResult }>();
let crawlBlockedUntil = 0;
let windowStart = 0,
  requests = 0;
export async function searchWine(query: WineQuery): Promise<WineResult> {
  const config = apiConfig();
  const crawl = process.env.WINE_SEARCHER_MODE !== "api";
  if (!crawl && !config)
    throw new WineSearchError(
      "unconfigured",
      "해외 판매처 검색을 준비 중입니다. 데이터 연결이 완료되면 검색할 수 있습니다.",
    );
  const direct =
    process.env.WINE_SEARCHER_MODE !== "api" &&
    process.env.WINE_SEARCHER_MODE !== "crawl";
  const key = JSON.stringify([direct, crawl, query]);
  const cached = crawlCache.get(key);
  if (crawl && cached && Date.now() - cached.time < 15 * 60_000)
    return cached.result;
  if (crawl && !direct && Date.now() < crawlBlockedUntil)
    throw new WineSearchError(
      "provider",
      "Wine-Searcher에서 자동 수집을 제한하고 있습니다. 원문 검색에서 판매처를 확인해 주세요.",
    );
  const pending = inFlight.get(key);
  if (pending) return pending;
  if (Date.now() - windowStart >= 60000) {
    windowStart = Date.now();
    requests = 0;
  }
  if (requests >= (direct ? 6 : 20) || inFlight.size >= (direct ? 2 : 4))
    throw new WineSearchError(
      "busy",
      "검색 요청이 많습니다. 1분 후 다시 시도해 주세요.",
    );
  requests++;
  const task = (async () => {
    if (direct) {
      const { searchMerchants } = await import("./wine-merchants.server");
      const result = await searchMerchants(query);
      if (crawlCache.size >= 100)
        crawlCache.delete(crawlCache.keys().next().value!);
      if (result.coverage?.succeeded)
        crawlCache.set(key, { time: Date.now(), result });
      return result;
    }
    if (!crawl) return fetchWineOffers(query, config!);
    const { crawlWineOffers, WineCrawlError } =
      await import("./wine-crawl.server");
    try {
      const result = await crawlWineOffers(query);
      if (crawlCache.size >= 100)
        crawlCache.delete(crawlCache.keys().next().value!);
      crawlCache.set(key, { time: Date.now(), result });
      return result;
    } catch (error) {
      if (error instanceof WineCrawlError) {
        if (error.blocked) crawlBlockedUntil = Date.now() + 15 * 60_000;
        throw new WineSearchError("provider", error.message);
      }
      throw error;
    }
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, task);
  return task;
}
