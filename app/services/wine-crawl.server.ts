import { load } from "cheerio";
import type { WineOffer, WineQuery, WineResult } from "./wine-search.server";

export class WineCrawlError extends Error {
  blocked: boolean;
  constructor(message: string, blocked = false) {
    super(message);
    this.blocked = blocked;
  }
}
const BASE = "https://www.wine-searcher.com";
export function wineSearchUrl(query: WineQuery) {
  const segment = (text: string) =>
    text.split(/\s+/).map(encodeURIComponent).join("+");
  return `${BASE}/find/${segment(query.name)}/${query.vintage === "2" ? "1" : segment(query.vintage.toLowerCase())}/${segment(query.location.toLowerCase())}`;
}
const text = (value: string) => value.replace(/\s+/g, " ").trim();
export function parseWineSearchHtml(
  html: string,
  sourceUrl: string,
  query: WineQuery,
  now = new Date(),
): WineResult {
  const $ = load(html);
  const title = $("title").text();
  if (
    /access.*denied|just a moment|verify.*human/i.test(title) ||
    (/press.*hold|사람.*확인/i.test($("body").text()) &&
      !$("#pjax-offers").length)
  )
    throw new WineCrawlError(
      "Wine-Searcher에서 사람 확인을 요청했습니다. 아래 원문 검색에서 확인해 주세요.",
      true,
    );
  const source = new URL(sourceUrl);
  if (
    source.origin !== BASE ||
    source.pathname.split("/").at(-1) !==
      query.location.toLowerCase().replace(/\s+/g, "+")
  )
    throw new WineCrawlError("선택한 국가의 검색 결과를 확인하지 못했습니다.");
  const container = $("#pjax-offers");
  const matchedName = text($("h1").first().text());
  if (!container.length || !matchedName)
    throw new WineCrawlError(
      "검색 결과 구조가 변경되었거나 상품을 특정하지 못했습니다. 원문 검색에서 확인해 주세요.",
    );
  const currency = $(
    "#Xcurrencycode-B-small .ds-dropdown__js-description .selected",
  ).attr("data-url-part");
  if (!currency || !/^[A-Z]{3}$/.test(currency))
    throw new WineCrawlError("판매 가격의 통화를 확인하지 못했습니다.");
  const offers: WineOffer[] = [];
  const seen = new Set<string>();
  let retailRows = 0;
  container.find(".js-offer-card").each((_index, element) => {
    const card = $(element);
    // Only ordinary retail offers. Auctions, pre-arrival, in-bond and by-request
    // carry .js-offer-type badges; do not present those as immediately purchasable.
    if (card.find(".js-offer-type").length) return;
    retailRows++;
    const merchant = text(card.find(".offer-card__merchant-name").text());
    const href = card.find("a.js-offer-link").attr("href");
    let url: URL;
    try {
      url = new URL(href || "");
    } catch {
      return;
    }
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.hostname === "wine-searcher.com" ||
      url.hostname.endsWith(".wine-searcher.com")
    )
      return;
    const priceNode = card.find(".price__detail_main").first();
    const integer = text(priceNode.find(".price__integer-part").text());
    const fraction = text(priceNode.find(".price__fractional-part").text());
    if (
      !/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(integer) ||
      (fraction && !/^\.\d{1,2}$/.test(fraction))
    )
      return;
    const price = Number(integer.replaceAll(",", "") + fraction);
    const bottleSize = text(card.find(".badge-bottle").text());
    const vintage = text(
      card
        .find(".offer-card__badges .badge")
        .not(".badge-bottle")
        .first()
        .text(),
    );
    if (
      !merchant ||
      !bottleSize ||
      !Number.isFinite(price) ||
      price <= 0 ||
      (query.vintage !== "2" && vintage.toUpperCase() !== query.vintage)
    )
      return;
    const identity = JSON.stringify([
      url.href,
      vintage,
      bottleSize,
      price,
      currency,
    ]);
    if (seen.has(identity)) return;
    seen.add(identity);
    offers.push({
      merchant,
      price,
      currency,
      bottleSize,
      vintage,
      url: url.href,
      country: query.location,
      description: text(card.find(".offer-card__location-address").text()),
      tax: text(card.find(".price__tax-status").text()),
    });
  });
  if (retailRows && !offers.length)
    throw new WineCrawlError(
      "판매처 정보를 정확히 읽지 못했습니다. 원문 검색에서 확인해 주세요.",
    );
  // Without a verified no-results marker, an absent card list is not an empty search.
  if (!container.find(".js-offer-card").length)
    throw new WineCrawlError(
      "표시 가능한 판매 정보를 확인하지 못했습니다. 원문 검색에서 확인해 주세요.",
    );
  return {
    state: offers.length ? "ready" : "empty",
    offers: offers.sort((a, b) => a.price - b.price).slice(0, 100),
    fetchedAt: now.toISOString(),
    sourceUrl,
    matchedName,
    partial: true,
  };
}
export async function crawlWineOffers(
  query: WineQuery,
  fetcher: typeof fetch = fetch,
): Promise<WineResult> {
  let url = new URL(wineSearchUrl(query));
  const signal = AbortSignal.timeout(12000);
  try {
    for (let redirects = 0; redirects <= 3; redirects++) {
      const response = await fetcher(url, {
        redirect: "manual",
        signal,
        headers: {
          Accept: "text/html",
          "Accept-Language": "en-US,en;q=0.9",
          "User-Agent": "TownWine-Search/1.0 (+https://town.wine)",
        },
      });
      if ([401, 403, 429].includes(response.status)) {
        await response.body?.cancel();
        throw new WineCrawlError(
          "Wine-Searcher에서 자동 수집을 제한했습니다. 아래 원문 검색에서 판매처를 확인해 주세요.",
          true,
        );
      }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location) throw new Error("redirect without location");
        const next = new URL(location, url);
        if (
          next.origin !== BASE ||
          !next.pathname.startsWith("/find/") ||
          next.username ||
          next.password
        )
          throw new Error("unexpected redirect");
        url = next;
        continue;
      }
      if (
        !response.ok ||
        !response.headers.get("content-type")?.includes("text/html")
      ) {
        await response.body?.cancel();
        throw new Error("unexpected response");
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("missing body");
      const chunks: Uint8Array[] = [];
      let length = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 3_000_000) {
          await reader.cancel();
          throw new Error("oversized response");
        }
        chunks.push(value);
      }
      return parseWineSearchHtml(
        Buffer.concat(chunks).toString("utf8"),
        url.href,
        query,
      );
    }
    throw new Error("too many redirects");
  } catch (error) {
    if (error instanceof WineCrawlError) throw error;
    throw new WineCrawlError(
      "판매처를 자동으로 불러오지 못했습니다. 원문 검색에서 확인해 주세요.",
    );
  }
}
