import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as wine from "../app/services/wine-search.server.ts";
import * as crawl from "../app/services/wine-crawl.server.ts";
const pageModule = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync(
      new URL("../app/services/wine-search-page.server.ts", import.meta.url),
      "utf8",
    ),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText,
  {
    exports: pageModule.exports,
    require: (path) => (path.includes("wine-crawl") ? crawl : wine),
    Intl,
    Date,
  },
);
const { renderWineSearchPage } = pageModule.exports;
const query = { name: "Château Margaux", vintage: "2018", location: "USA" };
const row = {
  "merchant-name": "Example Merchant",
  vintage: "2018",
  price: "125.50",
  country: "USA",
  "bottle-size": "750ml",
  link: "https://merchant.example/wine?id=1",
};
const payload = (rows = [row], code = "0") => ({
  result: {
    header: {
      "return-code": code,
      "list-currency-code": "USD",
      "list-count": rows.length,
    },
    offers: rows,
  },
});
test("normalizes unicode/whitespace and defaults empty vintage to any", () => {
  assert.deepEqual(
    wine.parseWineQuery(
      new URLSearchParams({ q: "  Château   Margaux  ", vintage: "" }),
    ),
    { name: "Château Margaux", vintage: "2", location: "ALL" },
  );
});
test("rejects short names, invalid years, unsupported countries", () => {
  for (const params of [
    { q: "a" },
    { q: "a".repeat(161) },
    { q: "Margaux", vintage: "202x" },
    { q: "Margaux", vintage: "1899" },
    { q: "Margaux", location: "arbitrary" },
  ])
    assert.throws(
      () => wine.parseWineQuery(new URLSearchParams(params)),
      wine.WineSearchError,
    );
  assert.equal(
    wine.parseWineQuery(new URLSearchParams({ q: "Champagne", vintage: "nv" }))
      .vintage,
    "NV",
  );
});
test("parses documented fields, sorts prices, deduplicates and preserves sizes", () => {
  const result = wine.parseWineResponse(
    payload([
      row,
      row,
      { ...row, price: "90", link: "https://other.example/wine" },
      { ...row, "bottle-size": "375ml" },
    ]),
  );
  assert.equal(result.offers.length, 3);
  assert.equal(result.offers[0].price, 90);
  assert.equal(result.offers[1].currency, "USD");
});
test("unsafe URLs and missing prices cannot become purchase offers", () => {
  const result = wine.parseWineResponse(
    payload([
      row,
      { ...row, link: "javascript:alert(1)" },
      { ...row, link: "https://user:secret@example.com/" },
      { ...row, price: "" },
    ]),
  );
  assert.equal(result.offers.length, 1);
  assert.throws(() =>
    wine.parseWineResponse(payload([{ ...row, price: "unknown" }])),
  );
});
test("empty, ambiguous and provider errors are distinct", () => {
  assert.equal(wine.parseWineResponse(payload([], "1")).state, "empty");
  assert.equal(wine.parseWineResponse(payload([], "8")).state, "ambiguous");
  assert.equal(wine.parseWineResponse(payload([])).state, "empty");
  for (const code of ["2", "3", "4", "5", "6", "7", "10", "99", ""])
    assert.throws(() => wine.parseWineResponse(payload([], code)));
  assert.throws(() => wine.parseWineResponse({ unexpected: [] }));
});
test("currency is required and not guessed from requested currency", () => {
  const data = payload();
  delete data.result.header["list-currency-code"];
  assert.throws(() => wine.parseWineResponse(data));
});
test("request encodes names and sends exact documented API options", async () => {
  const result = await wine.fetchWineOffers(
    { ...query, name: "A & B / C%" },
    {
      key: "test-secret",
      url: new URL("https://api.wine-searcher.com/issued-endpoint"),
    },
    async (url, init) => {
      assert.equal(url.searchParams.get("winename"), "A & B / C%");
      assert.equal(url.searchParams.get("format"), "J");
      assert.equal(url.searchParams.get("offer_type"), "R");
      assert.equal(url.searchParams.get("bottle_size"), "B");
      assert.equal(url.searchParams.get("autoexpand"), "N");
      assert.equal(init.redirect, "error");
      return Response.json(payload());
    },
  );
  assert.equal(result.offers.length, 1);
});
test("network and invalid JSON errors never leak credentials", async () => {
  for (const fetcher of [
    async () => {
      throw new Error("test-secret");
    },
    async () => new Response("not json"),
    async () => new Response("", { status: 429 }),
  ]) {
    await assert.rejects(
      wine.fetchWineOffers(
        query,
        {
          key: "test-secret",
          url: new URL("https://api.wine-searcher.com/example"),
        },
        fetcher,
      ),
      (e) =>
        e instanceof wine.WineSearchError && !e.message.includes("test-secret"),
    );
  }
});
test("configuration fails closed, including unsafe or unconfirmed endpoint", () => {
  const old = { ...process.env };
  try {
    process.env.WINE_SEARCHER_MODE = "api";
    process.env.WINE_SEARCHER_ENABLED = "true";
    process.env.WINE_SEARCHER_API_KEY = "test";
    for (const url of [
      "http://wine-searcher.com/api",
      "https://wine-searcher.com.attacker.example/api",
      "https://evil.example/api",
      "https://wine-searcher.com/api?api_key=test",
    ]) {
      process.env.WINE_SEARCHER_API_URL = url;
      assert.equal(wine.wineSearchAvailable(), false);
    }
    process.env.WINE_SEARCHER_API_URL = "https://api.wine-searcher.com/example";
    assert.equal(wine.wineSearchAvailable(), true);
    delete process.env.WINE_SEARCHER_ENABLED;
    assert.equal(wine.wineSearchAvailable(), false);
  } finally {
    process.env = old;
  }
});
test("page escapes user/provider HTML and shows source, bottle units and external links", () => {
  const result = wine.parseWineResponse(
    payload([{ ...row, "merchant-name": "<script>alert(1)</script>" }]),
  );
  const html = renderWineSearchPage({
    query: { ...query, name: '"><img src=x onerror=alert(1)>' },
    result,
    available: true,
  });
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("750ml"));
  assert.ok(html.includes('rel="noopener noreferrer"'));
  assert.ok(!html.includes("Wine-Searcher"));
});
test("unconfigured page cannot imply live offers and disables submission", () => {
  const html = renderWineSearchPage({ available: false });
  assert.ok(html.includes("disabled"));
  assert.ok(html.includes("데이터 연결이 완료되면"));
  assert.ok(!html.includes('class="offer"'));
});

function routeLoader(auth, search) {
  const mod = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(
        new URL(
          "../app/routes/apps.townwine-follow.wine-search.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      { compilerOptions: { module: ts.ModuleKind.CommonJS } },
    ).outputText,
    {
      exports: mod.exports,
      URL,
      Response,
      require: (path) =>
        path.includes("shopify.server")
          ? { authenticate: { public: { appProxy: auth } } }
          : path.includes("wine-search-page")
            ? { renderWineSearchPage }
            : { ...wine, wineSearchAvailable: () => true, searchWine: search },
    },
  );
  return mod.exports.loader;
}
test("route rejects an invalid proxy signature before accessing paid API", async () => {
  let called = false;
  const loader = routeLoader(
    async () => {
      throw new Response("Unauthorized", { status: 401 });
    },
    async () => {
      called = true;
    },
  );
  await assert.rejects(
    loader({
      request: new Request(
        "https://app.example/apps/townwine-follow/wine-search?q=Margaux",
      ),
    }),
    (e) => e.status === 401,
  );
  assert.equal(called, false);
});
test("route renders successful search and uses no-store", async () => {
  const loader = routeLoader(
    async () => ({}),
    async (q) => {
      assert.equal(q.name, "Margaux");
      return wine.parseWineResponse(payload());
    },
  );
  const response = await loader({
    request: new Request(
      "https://app.example/apps/townwine-follow/wine-search?q=Margaux",
    ),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.ok((await response.text()).includes("Example Merchant"));
});
test("route validates before API calls and returns retry-after on busy", async () => {
  let called = false;
  const loader = routeLoader(
    async () => ({}),
    async () => {
      called = true;
      throw new wine.WineSearchError("busy", "잠시 후 다시 시도해 주세요.");
    },
  );
  assert.equal(
    (await loader({ request: new Request("https://app.example/?q=x") })).status,
    400,
  );
  assert.equal(called, false);
  const response = await loader({
    request: new Request("https://app.example/?q=Margaux"),
  });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "60");
});

function isolatedSearch(crawlWineOffers) {
  const mod = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(
        new URL("../app/services/wine-search.server.ts", import.meta.url),
        "utf8",
      ),
      {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.CommonJS,
        },
      },
    ).outputText,
    {
      exports: mod.exports,
      require: (path) => path.endsWith(".json") ? { default: [] } : ({ ...crawl, crawlWineOffers }),
      process: { env: { WINE_SEARCHER_MODE: "crawl" } },
      URL,
      Date,
      fetch,
    },
  );
  return mod.exports;
}
test("explicit crawling needs no API key and caches successful queries", async () => {
  let calls = 0;
  const service = isolatedSearch(async () => {
    calls++;
    return { state: "ready", offers: [], fetchedAt: new Date().toISOString() };
  });
  assert.equal(service.wineSearchAvailable(), true);
  await Promise.all([service.searchWine(query), service.searchWine(query)]);
  await service.searchWine(query);
  assert.equal(calls, 1);
});
test("a provider block stops further crawling but preserves existing valid cache", async () => {
  let calls = 0;
  const result = {
    state: "ready",
    offers: [],
    fetchedAt: new Date().toISOString(),
  };
  const service = isolatedSearch(async () => {
    calls++;
    if (calls === 1) return result;
    throw new crawl.WineCrawlError("Blocked", true);
  });
  await service.searchWine(query);
  await assert.rejects(
    service.searchWine({ ...query, name: "Different wine" }),
  );
  await assert.rejects(service.searchWine({ ...query, name: "Third wine" }));
  assert.equal(await service.searchWine(query), result);
  assert.equal(calls, 2);
});

test("Liquid theme rendering cannot execute query or provider Liquid tags", () => {
  const html = renderWineSearchPage({
    available: true,
    query: { ...query, name: '{{ shop.name }} {% render "secret" %}' },
  });
  assert.ok(!html.includes("{{ shop.name }}"));
  assert.ok(!html.includes("{% render &quot;secret&quot; %}"));
  assert.ok(html.includes("&#123;&#123; shop.name &#125;&#125;"));
  assert.ok(
    html.includes("{% render 'townwine-header', current: 'wine-search' %}"),
  );
});

test("storefront does not expose discovery providers or forwarding centers", () => {
  const html = renderWineSearchPage({
    available: true,
    query,
    error: "Wine-Searcher에서 자동 수집을 제한했습니다. 원문 검색",
  });
  assert.ok(!/Wine-Searcher|wine-searcher\.com|훗타운/.test(html));

  assert.ok(!html.includes('value="Italy"'));
});
test('country selection filters results after global search and keeps original prices',()=>{
 const result={state:'ready',source:'merchants',fetchedAt:new Date().toISOString(),fxDate:'2026-10-08',offers:[{merchant:'US Shop',country:'USA',price:100,currency:'USD',priceKrw:140000,url:'https://us.example/product',vintage:'NV',bottleSize:'750ml'},{merchant:'French Shop',country:'France',price:80,currency:'EUR',priceKrw:130000,url:'https://fr.example/product',vintage:'NV',bottleSize:'750ml'}]};
 const html=renderWineSearchPage({available:true,query:{...query,location:'France'},result});
 assert.ok(html.includes('French Shop'));assert.ok(!html.includes('US Shop'));
 assert.ok(html.includes('130,000'));assert.ok(html.includes('EUR'));
 assert.ok(html.indexOf('id="result-country"')>html.indexOf('aria-label="검색 결과"'));
 const initial=renderWineSearchPage({available:true});assert.ok(!initial.includes('name="location"'));
});
