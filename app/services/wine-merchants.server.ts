import { load } from "cheerio";
import merchants from "../data/wine-merchants.json" with { type: "json" };
import type { WineOffer, WineQuery, WineResult } from "./wine-search.server";

type Merchant = (typeof merchants)[number];
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export function matchesProduct(title: string, query: WineQuery) {
  const words = normalize(title).split(" ");
  const requested = normalize(query.name)
    .split(" ")
    .filter((w) => w.length > 1);
  if (!requested.length || !requested.every((w) => words.includes(w)))
    return false;
  if (query.vintage === "2") return true;
  return query.vintage === "NV"
    ? /\b(?:nv|non vintage)\b/.test(normalize(title))
    : words.includes(query.vintage);
}
function sameShop(raw: string, origin: string) {
  try {
    const u = new URL(raw, origin);
    return u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      u.origin === origin
      ? u
      : null;
  } catch {
    return null;
  }
}
// Some shop themes emit unescaped literal newlines within JSON-LD strings.
function jsonLd(raw: string) {
  let quoted = false,
    escaped = false,
    result = "";
  for (const c of raw) {
    if (quoted && c.charCodeAt(0) < 32) {
      result += JSON.stringify(c).slice(1, -1);
      continue;
    }
    result += c;
    if (c === '"' && !escaped) quoted = !quoted;
    if (c === "\\" && !escaped) escaped = true;
    else escaped = false;
  }
  return JSON.parse(result);
}
export function parseMerchantProduct(
  html: string,
  pageUrl: string,
  merchant: { name: string; country: string; origin: string },
  query: WineQuery,
): WineOffer[] {
  const $ = load(html);
  const found: WineOffer[] = [];
  const decode = (s: unknown) =>
    typeof s === "string"
      ? load(`<span>${s}</span>`)("span").text().trim()
      : "";
  const walk = (node: any, depth = 0) => {
    if (!node || depth > 12 || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((n) => walk(n, depth + 1));
      return;
    }
    if ([node["@type"]].flat().includes("Product")) {
      const title = decode(node.name);
      if (
        !matchesProduct(title, query) ||
        /pre[ -]?arrival|future arrival|in[ -]bond|auction/i.test(title)
      )
        return;
      for (const offer of [node.offers].flat()) {
        if (
          !offer ||
          !/^https?:\/\/schema.org\/InStock$/.test(offer.availability || "")
        )
          continue;
        const url = sameShop(offer.url || node.url || pageUrl, merchant.origin);
        const price = Number(offer.price);
        if (
          !url ||
          !url.pathname.includes("/products/") ||
          !/^[A-Z]{3}$/.test(offer.priceCurrency || "") ||
          !Number.isFinite(price) ||
          price <= 0
        )
          continue;
        const variantTitle = `${title} ${decode(offer.name)}`;
        const size =
          variantTitle
            .match(/\b\d+(?:[.,]\d+)?\s*(?:ml|cl|l)\b/i)?.[0]
            ?.replace(",", ".") || "";
        found.push({
          merchant: merchant.name,
          country: merchant.country,
          title,
          price,
          currency: offer.priceCurrency,
          url: url.href,
          vintage: /\bNV\b|non[ -]vintage/i.test(title)
            ? "NV"
            : title.match(/\b(?:19|20)\d{2}\b/)?.[0] || "",
          bottleSize: size,
          description: "판매처에서 재고 있음으로 표시",
          availability: "재고 있음",
          fetchedAt: new Date().toISOString(),
        });
      }
      return;
    }
    for (const value of Object.values(node)) walk(value, depth + 1);
  };
  $("script[type='application/ld+json']").each((_i, el) => {
    try {
      walk(jsonLd($(el).text()));
    } catch {
      /* Unknown theme markup is not a price. */
    }
  });
  return [...new Map(found.map((o) => [o.url, o])).values()];
}
async function readShop(url: URL, signal: AbortSignal, fetcher: typeof fetch) {
  const r = await fetcher(url, {
    signal,
    redirect: "manual",
    headers: {
      "User-Agent": "TownWine-Search/1.0 (+https://town.wine)",
      Accept: "text/html",
    },
  });
  if (!r.ok || !r.headers.get("content-type")?.includes("text/html")) {
    await r.body?.cancel();
    throw new Error("merchant unavailable");
  }
  const reader = r.body?.getReader();
  if (!reader) throw new Error("empty response");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 3_000_000) {
      await reader.cancel();
      throw new Error("oversized response");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
async function searchMerchant(
  merchant: Merchant,
  query: WineQuery,
  fetcher: typeof fetch,
) {
  const origin = merchant.origin!;
  const signal = AbortSignal.timeout(11000);
  const search = new URL("/search", origin);
  search.searchParams.set("type", "product");
  search.searchParams.set(
    "q",
    `${query.name}${query.vintage === "2" ? "" : ` ${query.vintage}`}`,
  );
  const html = await readShop(search, signal, fetcher);
  const $ = load(html);
  if (!$('form[action="/search"]').length)
    throw new Error("unrecognized search page");
  const candidates = new Set<string>();
  $("a[href*='/products/']").each((_i, el) => {
    const url = sameShop($(el).attr("href") || "", origin);
    const label = $(el).text() + " " + ($(el).find("img").attr("alt") || "");
    if (url && matchesProduct(label, query)) {
      url.search = "";
      url.hash = "";
      candidates.add(url.href);
    }
  });
  // Previously observed product links can fill gaps in client-rendered search
  // pages. Re-fetch and re-validate the title, price and stock; never use old prices.
  if (merchant.exampleUrl) {
    const known = new URL(merchant.exampleUrl);
    const canonical = new URL(known.pathname, origin);
    if (
      canonical.pathname.startsWith("/products/") &&
      matchesProduct(decodeURIComponent(canonical.pathname), query)
    )
      candidates.add(canonical.href);
  }
  const products = [...candidates].slice(0, 4);
  const results = await Promise.allSettled(
    products.map(async (url) =>
      parseMerchantProduct(
        await readShop(new URL(url), signal, fetcher),
        url,
        { ...merchant, origin },
        query,
      ),
    ),
  );
  return {
    offers: results.flatMap((r) => (r.status === "fulfilled" ? r.value : [])),
    incomplete:
      candidates.size > 4 || results.some((r) => r.status === "rejected"),
  };
}
type FxRates = { date: string; rates: Record<string, number> };
let fxCache: { at: number; value: FxRates } | undefined;
export function parseReferenceRates(xml: string, now = Date.now()): FxRates {
  const $ = load(xml, { xmlMode: true });
  const date = $("Cube[time]").attr("time") || "";
  const age = now - Date.parse(date + "T00:00:00Z");
  if (!Number.isFinite(age) || age < -86400000 || age > 7 * 86400000)
    throw new Error("stale rates");
  const rates: Record<string, number> = { EUR: 1 };
  $("Cube[currency]").each((_i, el) => {
    const currency = $(el).attr("currency") || "";
    const rate = Number($(el).attr("rate"));
    if (/^[A-Z]{3}$/.test(currency) && Number.isFinite(rate) && rate > 0)
      rates[currency] = rate;
  });
  if (!rates.KRW) throw new Error("missing KRW rate");
  return { date, rates };
}
async function referenceRates(
  fetcher: typeof fetch,
): Promise<FxRates | undefined> {
  if (fxCache && Date.now() - fxCache.at < 86400000) return fxCache.value;
  try {
    const r = await fetcher(
      "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml",
      { signal: AbortSignal.timeout(4000), redirect: "error" },
    );
    if (!r.ok) {
      await r.body?.cancel();
      return;
    }
    const body = await r.text();
    if (body.length > 100000) return;
    const value = parseReferenceRates(body);
    fxCache = { at: Date.now(), value };
    return value;
  } catch {
    return;
  }
}
export function applyReferenceRates(offers: WineOffer[], fx: FxRates) {
  return offers.map((o) => ({
    ...o,
    priceKrw: fx.rates[o.currency]
      ? (o.price / fx.rates[o.currency]) * fx.rates.KRW
      : undefined,
  }));
}
export async function searchMerchants(
  query: WineQuery,
  fetcher: typeof fetch = fetch,
): Promise<WineResult> {
  const selected = merchants.filter(
    (m) =>
      (query.location === "ALL" || m.country === query.location) &&
      m.status === "enabled",
  );
  const results = await Promise.allSettled(
    selected.map((m) => searchMerchant(m, query, fetcher)),
  );
  const offers = results.flatMap((r) =>
    r.status === "fulfilled" ? r.value.offers : [],
  );
  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  let unique = [...new Map(offers.map((o) => [o.url, o])).values()];
  const fx = unique.length ? await referenceRates(fetcher) : undefined;
  if (fx) unique = applyReferenceRates(unique, fx);
  unique.sort(
    (a, b) =>
      (a.priceKrw ?? Infinity) - (b.priceKrw ?? Infinity) ||
      a.currency.localeCompare(b.currency) ||
      a.price - b.price,
  );
  return {
    state: unique.length ? "ready" : "empty",
    offers: unique,
    fetchedAt: new Date().toISOString(),
    source: "merchants",
    fxDate: fx?.date,
    coverage: {
      registered: merchants.filter(
        (m) => query.location === "ALL" || m.country === query.location,
      ).length,
      searched: selected.length,
      succeeded,
      incomplete: results.filter(
        (r) => r.status === "rejected" || r.value.incomplete,
      ).length,
    },
    partial: true,
  };
}
