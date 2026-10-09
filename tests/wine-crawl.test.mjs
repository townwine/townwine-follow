import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  parseWineSearchHtml,
  crawlWineOffers,
  wineSearchUrl,
  WineCrawlError,
} from "../app/services/wine-crawl.server.ts";
const html = fs.readFileSync(
  new URL("./fixtures/wine-search-public.html", import.meta.url),
  "utf8",
);
const query = { name: "Chateau Margaux", vintage: "2018", location: "USA" };
const source =
  "https://www.wine-searcher.com/find/margaux+medoc+bordeaux+france/2018/usa";
test("observed public DOM yields actual price, unit, tax and merchant URL", () => {
  const result = parseWineSearchHtml(html, source, query);
  assert.equal(result.offers[0].price, 882726);
  assert.equal(result.offers[0].currency, "KRW");
  assert.equal(result.offers[0].bottleSize, "Bottle (750ml)");
  assert.equal(result.offers[0].tax, "ex. sales tax");
  assert.equal(
    result.offers[0].url,
    "https://europeanwineresource.com/products/2018-chateau-margaux",
  );
  assert.equal(result.partial, true);
  assert.equal(result.matchedName, "2018 Chateau Margaux");
});
test("uses case price, not secondary 750ml-equivalent price", () => {
  const input = html
    .replace("Bottle (750ml)", "Case of 6 Btls")
    .replace("882,726", "5,296,356")
    .replace(
      '</div><div class="price__tax-status">',
      '</div><div class="price__detail_secondary"><span class="price__integer-part">882,726</span></div><div class="price__tax-status">',
    );
  assert.equal(
    parseWineSearchHtml(input, source, query).offers[0].price,
    5296356,
  );
});
test("auction, pre-arrival or by-request badge excludes offer", () => {
  const input = html.replace(
    '<a class="offer-card__merchant-name">',
    '<span class="js-offer-type">Pre Arrival</span><a class="offer-card__merchant-name">',
  );
  assert.equal(parseWineSearchHtml(input, source, query).state, "empty");
});
test("rejects unknown DOM, wrong location, unknown currency, invalid price and unsafe links", () => {
  for (const input of [
    "<html><h1>Missing</h1></html>",
    html.replace('data-url-part="KRW"', 'data-url-part="???"'),
    html.replace("882,726", "12,34"),
    html.replace(
      "https://europeanwineresource.com/products/2018-chateau-margaux",
      "javascript:alert(1)",
    ),
    html.replace(">2018</span>", ">2017</span>"),
  ])
    assert.throws(
      () => parseWineSearchHtml(input, source, query),
      WineCrawlError,
    );
  assert.throws(() =>
    parseWineSearchHtml(html, source.replace("/usa", "/south+korea"), query),
  );
});
test("does not turn human-verification or an empty card container into zero results", () => {
  assert.throws(
    () =>
      parseWineSearchHtml(
        "<html><title>Access to this page has been denied</title></html>",
        source,
        query,
      ),
    (e) => e.blocked,
  );
  assert.throws(() =>
    parseWineSearchHtml(
      html.replace('class="js-offer-card"', 'class="changed-card"'),
      source,
      query,
    ),
  );
});
test("URLs encode slash, percent, unicode and map any vintage to public all-vintages route", () => {
  const url = wineSearchUrl({ ...query, name: "A/B & C%", vintage: "2" });
  assert.ok(url.includes("A%2FB+%26+C%25/1/usa"));
  assert.equal(new URL(url).origin, "https://www.wine-searcher.com");
});
test("crawler accepts HTML and follows only bounded same-origin find redirects", async () => {
  let calls = 0;
  const result = await crawlWineOffers(query, async () =>
    ++calls === 1
      ? new Response(null, { status: 302, headers: { location: source } })
      : new Response(html, { headers: { "Content-Type": "text/html" } }),
  );
  assert.equal(calls, 2);
  assert.equal(result.offers.length, 1);
  calls = 0;
  await assert.rejects(
    crawlWineOffers(query, async () => {
      calls++;
      return new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/admin" },
      });
    }),
  );
  assert.equal(calls, 1);
});
test("403 and 429 stop immediately without retry or exporting browser credentials", async () => {
  for (const status of [403, 429]) {
    let calls = 0;
    await assert.rejects(
      crawlWineOffers(query, async (_url, init) => {
        calls++;
        assert.equal(init.headers.Cookie, undefined);
        return new Response("", { status });
      }),
      (e) => e.blocked,
    );
    assert.equal(calls, 1);
  }
});
test("200 challenge is detected and oversized bodies are rejected", async () => {
  await assert.rejects(
    crawlWineOffers(
      query,
      async () =>
        new Response("<title>Access to this page has been denied</title>", {
          headers: { "Content-Type": "text/html" },
        }),
    ),
    (e) => e.blocked,
  );
  await assert.rejects(
    crawlWineOffers(
      query,
      async () =>
        new Response("x".repeat(3_000_001), {
          headers: { "Content-Type": "text/html" },
        }),
    ),
  );
});
