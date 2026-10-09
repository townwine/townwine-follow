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
    .trim()
    .replace(/\bsaint\b/g, "st")
    .replace(/\bpremier\b/g, "1er");
const optionalWords = new Set([
  "domaine",
  "dom",
  "les",
  "le",
  "la",
  "de",
  "du",
  "des",
  "france",
  "burgundy",
  "bourgogne",
  "cru",
]);
function productWords(name: string) {
  return normalize(name)
    .split(" ")
    .filter((w) => w.length > 1 && !optionalWords.has(w));
}
export function matchesProduct(title: string, query: WineQuery) {
  const words = normalize(title).split(" ");
  const requested = productWords(query.name);
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
  merchant: {
    name: string;
    country: string;
    origin: string;
    adapter?: string | null;
  },
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
      if (!matchesProduct(title, query) || /auction/i.test(title)) return;
      const flattenOffers = (value: any): any[] =>
        [value]
          .flat()
          .flatMap((o) => (o?.offers ? flattenOffers(o.offers) : o ? [o] : []));
      for (const offer of flattenOffers(node.offers)) {
        if (
          !offer ||
          !/^https?:\/\/schema.org\/(?:InStock|PreOrder|BackOrder)$/.test(
            offer.availability || "",
          )
        )
          continue;
        const url = sameShop(offer.url || node.url || pageUrl, merchant.origin);
        const specification = [offer.priceSpecification]
          .flat()
          .find((p) => p && p.price !== undefined);
        const price = Number(offer.price ?? specification?.price);
        const currency = offer.priceCurrency || specification?.priceCurrency;
        if (
          !url ||
          url.pathname === "/" ||
          !/^[A-Z]{3}$/.test(currency || "") ||
          !Number.isFinite(price) ||
          price <= 0
        )
          continue;
        const variantTitle = `${decode(node.size)} ${title} ${decode(offer.name)}`;
        const conditions = `${title} ${decode(node.description)} ${decode(offer.name)} ${decode(offer.description)} ${merchant.adapter === "woocommerce-html" ? $(".summary").text() : ""}`;
        const availability = /in[ -]bond/i.test(
          `${title} ${decode(offer.name)}`,
        )
          ? "보세 상품"
          : /PreOrder|BackOrder/.test(offer.availability) ||
              /pre[ -]?arrival|future arrival|stock abroad|(?:shipping|delivery|transfer)[^.!]{0,70}\b(?:weeks|months)\b/i.test(
                conditions,
              )
            ? "예약·입고 후 배송"
            : "재고 있음";
        const size =
          variantTitle
            .match(
              /(?:^|[^0-9.,])(?:\d+\s*x\s*)?(\d+(?:[.,]\d+)?\s*(?:ml|cl|ltr|litres?|liters?|l))\b/i,
            )?.[1]
            ?.replace(",", ".") || "";
        const pack =
          variantTitle.match(
            /\b(\d+)\s*x\s*\d+(?:[.,]\d+)?\s*(?:ml|cl|ltr|litres?|liters?|l)\b/i,
          )?.[1] || variantTitle.match(/\b(\d+)\s*(?:pk|pack|bottles)\b/i)?.[1];
        found.push({
          merchant: merchant.name,
          country: merchant.country,
          title,
          price,
          currency,
          url: url.href,
          vintage: /\bNV\b|non[ -]vintage/i.test(title)
            ? "NV"
            : title.match(/\b(?:19|20)\d{2}\b/)?.[0] || "",
          bottleSize:
            pack && Number(pack) > 1
              ? `${pack} × ${size || "용량 확인"}`
              : size,
          description: availability,
          availability,
          tax:
            [
              availability === "보세 상품" ? "관세·현지 세금 별도" : "",
              merchant.adapter === "woocommerce-html" &&
              /Minimum order\s+(\d+)\s+bottles/i.test($(".summary").text())
                ? `병당 금액 · 최소 ${
                    $(".summary")
                      .text()
                      .match(/Minimum order\s+(\d+)\s+bottles/i)![1]
                  }병 주문`
                : "",
            ]
              .filter(Boolean)
              .join(" · ") || undefined,
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
  // WineFetch and several legacy stores publish schema.org microdata rather
  // than JSON-LD. Read values within each Product/Offer scope, never site-wide.
  $('[itemscope][itemtype$="/Product"]').each((_i, el) => {
    const root = $(el);
    const value = (scope: ReturnType<typeof $>, prop: string) => {
      const field = scope
        .find(`[itemprop="${prop}"]`)
        .filter((_j, n) => $(n).parents("[itemscope]").first()[0] === scope[0])
        .first();
      return field.attr("content") || field.attr("href") || field.text().trim();
    };
    const name = value(root, "name");
    root.find('[itemprop="offers"]').each((_j, offerEl) => {
      const offer = $(offerEl);
      const availability = value(offer, "availability");
      walk({
        "@type": "Product",
        name,
        offers: {
          price: value(offer, "price"),
          priceCurrency: value(offer, "priceCurrency"),
          url: value(offer, "url") || pageUrl,
          availability: availability.startsWith("http")
            ? availability
            : `https://schema.org/${availability}`,
        },
      });
    });
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
export function parseY18Product(
  html: string,
  pageUrl: string,
  merchant: {
    name: string;
    country: string;
    origin: string;
    adapter?: string | null;
  },
  query: WineQuery,
): WineOffer[] {
  const $ = load(html);
  const info = $(".product-info");
  const title = info.find(".product-title").text().trim();
  const stock = info
    .find("li")
    .toArray()
    .some((el) => /^Availability:\s*In Stock$/i.test($(el).text().trim()));
  const code = info.find(".pModel").text();
  const rawPrice = info.find(".price").text().trim();
  const priceMatch = rawPrice.match(/^HK\$([\d,]+\.\d{2})$/);
  const url = sameShop(pageUrl, merchant.origin);
  if (
    !url ||
    !matchesProduct(title, query) ||
    !stock ||
    /\bPO-/i.test(code) ||
    !priceMatch ||
    !info.find("#button-cart").length
  )
    return [];
  // Reuse the structured parser after reading the verified product-scoped fields.
  return parseMerchantProduct(
    `<script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: title, offers: { availability: "https://schema.org/InStock", price: priceMatch[1].replace(/,/g, ""), priceCurrency: "HKD", url: url.href } }).replace(/</g, "\\u003c")}</script>`,
    pageUrl,
    merchant,
    query,
  );
}
function merchantSearch(merchant: Merchant, query: WineQuery) {
  // Remove optional geography/classification from discovery only. Final product
  // validation still requires the producer, cuvee, appellation and vintage.
  const terms = productWords(query.name).filter(
    (w) => !["st", "aubin", "1er", "cru"].includes(w),
  );
  if (query.vintage !== "2" && !terms.includes(query.vintage.toLowerCase()))
    terms.push(query.vintage);
  const search = new URL("/search", merchant.origin!);
  if (merchant.adapter === "woocommerce-html") {
    search.pathname = "/";
    search.searchParams.set("s", terms.join(" "));
    search.searchParams.set("post_type", "product");
  } else if (merchant.adapter === "winefetch-html") {
    search.pathname = "/websearch_results.html";
    search.searchParams.set("kw", terms.join(" "));
  } else if (merchant.adapter === "b21-html") {
    search.pathname = "/searchprods.asp";
    search.searchParams.set("txtsearch", terms.join(" "));
  } else if (merchant.adapter === "bigcommerce-html") {
    search.pathname = "/search.php";
    search.searchParams.set("search_query", terms.join(" "));
  } else if (merchant.adapter === "millesima-html")
    search.searchParams.set("searchTerm", terms.join(" "));
  else if (merchant.adapter === "y18-html") {
    search.pathname = "/index.php";
    search.searchParams.set("route", "product/search");
    // OpenCart searches the literal phrase; use one distinctive token, then
    // validate every identity token and vintage on the returned products.
    const keyword =
      terms
        .filter((w) => /[a-z]/i.test(w))
        .sort((a, b) => b.length - a.length)[0] || terms.join(" ");
    search.searchParams.set("search", keyword);
    search.searchParams.set("limit", "100");
  } else {
    search.searchParams.set("type", "product");
    search.searchParams.set("q", terms.join(" "));
  }
  return search;
}
async function searchMerchant(
  merchant: Merchant,
  query: WineQuery,
  fetcher: typeof fetch,
) {
  const origin = merchant.origin!;
  const signal = AbortSignal.timeout(15000);
  const candidates = new Set<string>();
  // Observed product URLs are discovery seeds, never cached prices. Validate
  // their origin and re-read current title, stock, vintage and price each time.
  for (const raw of [...(merchant.productUrls || []), merchant.exampleUrl]) {
    if (!raw) continue;
    const url = sameShop(raw, origin);
    if (url && matchesProduct(decodeURIComponent(url.pathname), query))
      candidates.add(url.href);
  }
  let searchFailed = false;
  try {
    const html = await readShop(
      merchantSearch(merchant, query),
      AbortSignal.any([signal, AbortSignal.timeout(7000)]),
      fetcher,
    );
    const $ = load(html);
    if (
      merchant.adapter === "shopify-html" &&
      !$('form[action="/search"]').length
    )
      throw new Error("unrecognized search page");
    const selector =
      merchant.adapter === "millesima-html"
        ? "a[href*='.html']"
        : merchant.adapter === "y18-html"
          ? ".product-layout a[href]"
          : merchant.adapter === "woocommerce-html"
            ? "a[href*='/product/'],a[href*='/wine/']"
            : merchant.adapter === "winefetch-html"
              ? "a[href*='/wines/'],a[href*='/spirits/']"
              : merchant.adapter === "b21-html"
                ? "a[href*='/productinfo/']"
                : merchant.adapter === "bigcommerce-html"
                  ? ".product a[href]"
                  : "a[href*='/products/']";
    $(selector).each((_i, el) => {
      const url = sameShop($(el).attr("href") || "", origin);
      const label = $(el).text() + " " + ($(el).find("img").attr("alt") || "");
      if (
        url &&
        (matchesProduct(label, query) ||
          matchesProduct(decodeURIComponent(url.pathname), query))
      ) {
        url.search = "";
        url.hash = "";
        candidates.add(url.href);
      }
    });
  } catch {
    searchFailed = true;
  }
  if (searchFailed && !candidates.size)
    throw new Error("merchant search unavailable");
  const products = [...candidates].slice(0, 6);
  const results = await Promise.allSettled(
    products.map(async (url) => {
      const html = await readShop(new URL(url), signal, fetcher);
      return (
        merchant.adapter === "y18-html" ? parseY18Product : parseMerchantProduct
      )(html, url, { ...merchant, origin }, query);
    }),
  );
  if (searchFailed && results.every((r) => r.status === "rejected"))
    throw new Error("merchant products unavailable");
  return {
    offers: results.flatMap((r) => (r.status === "fulfilled" ? r.value : [])),
    incomplete:
      searchFailed ||
      candidates.size > 6 ||
      results.some((r) => r.status === "rejected"),
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
