import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as cheerio from "cheerio";
const mod = { exports: {} };
const registry = JSON.parse(
  fs.readFileSync(new URL("../app/data/wine-merchants.json", import.meta.url)),
);
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync(
      new URL("../app/services/wine-merchants.server.ts", import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    },
  ).outputText,
  {
    exports: mod.exports,
    require: (p) => (p === "cheerio" ? cheerio : registry),
    URL,
    AbortSignal,
    setTimeout,
    clearTimeout,
    Buffer,
    fetch,
    Date,
  },
);
const { matchesProduct, parseMerchantProduct, searchMerchants } = mod.exports;
const q = { name: "Savart Ouverture", vintage: "2", location: "USA" };
const m = { name: "Shop", origin: "https://shop.example", country: "USA" };
const product = (overrides = {}) =>
  `<script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: "Savart L'Ouverture NV 750ml", offers: { availability: "https://schema.org/InStock", price: "71.89", priceCurrency: "USD", url: "https://shop.example/products/savart" }, ...overrides })}</script>`;
test("match accents and punctuation, but require every meaningful token and vintage", () => {
  assert.equal(matchesProduct("Savart L'Ouverture NV", q), true);
  assert.equal(matchesProduct("Savart Accomplie NV", q), false);
  assert.equal(
    matchesProduct("Savart L'Ouverture 2019", { ...q, vintage: "2018" }),
    false,
  );
  assert.equal(
    matchesProduct("Savart L'Ouverture", { ...q, vintage: "NV" }),
    false,
  );
});
test("real structured price, title, bottle and availability", () => {
  const [o] = parseMerchantProduct(
    product(),
    m.origin + "/products/savart",
    m,
    q,
  );
  assert.equal(o.price, 71.89);
  assert.equal(o.currency, "USD");
  assert.equal(o.bottleSize, "750ml");
  assert.equal(o.vintage, "NV");
});
test("reject sold out, unknown availability, foreign urls and invalid prices", () => {
  for (const change of [
    { availability: "https://schema.org/OutOfStock" },
    { availability: undefined },
    { url: "https://evil.example/products/foo" },
    { price: "NaN" },
    { priceCurrency: "unknown" },
  ]) {
    const offers = {
      availability: "https://schema.org/InStock",
      price: "71.89",
      priceCurrency: "USD",
      url: "https://shop.example/products/savart",
      ...change,
    };
    assert.equal(
      parseMerchantProduct(product({ offers }), m.origin, m, q).length,
      0,
    );
  }
});
test("exclude auctions and mismatched products", () => {
  for (const name of ["Savart Ouverture NV auction", "Savart Accomplie NV"])
    assert.equal(
      parseMerchantProduct(product({ name }), m.origin, m, q).length,
      0,
    );
});
test("unsupported country returns explicit zero coverage without network", async () => {
  const r = await searchMerchants({ ...q, location: "Japan" }, () => {
    throw Error("must not fetch");
  });
  assert.equal(r.coverage.searched, 0);
  assert.equal(r.offers.length, 0);
});
test("all merchant failures remain distinguishable from an empty search", async () => {
  const r = await searchMerchants(
    q,
    async () => new Response("blocked", { status: 403 }),
  );
  assert.equal(r.coverage.succeeded, 0);
  assert.ok(r.coverage.incomplete > 0);
});
if (process.env.LIVE_MERCHANT_CHECK === "1") {
  const result = await searchMerchants({
    ...q,
    location: process.env.LIVE_COUNTRY || q.location,
  });
  console.log(JSON.stringify(result, null, 2));
  assert.ok(result.offers.length > 0, "live merchant offers required");
}

test("decimal comma size and NV base year are not misrepresented", () => {
  const [o] = parseMerchantProduct(
    product({ name: "Savart Ouverture NV Base 2023 0,75L" }),
    m.origin,
    m,
    q,
  );
  assert.equal(o.bottleSize, "0.75L");
  assert.equal(o.vintage, "NV");
});
test("currency comparison uses a single dated reference and rejects stale rates", () => {
  const xml =
    "<Cube><Cube time='2026-10-08'><Cube currency='USD' rate='1.1'/><Cube currency='GBP' rate='0.8'/><Cube currency='KRW' rate='1600'/></Cube></Cube>";
  const fx = mod.exports.parseReferenceRates(
    xml,
    Date.parse("2026-10-09T00:00:00Z"),
  );
  const converted = mod.exports.applyReferenceRates(
    [
      { price: 110, currency: "USD" },
      { price: 80, currency: "GBP" },
      { price: 100, currency: "EUR" },
    ],
    fx,
  );
  for (const offer of converted)
    assert.ok(Math.abs(offer.priceKrw - 160000) < 0.01);
  assert.throws(() =>
    mod.exports.parseReferenceRates(xml, Date.parse("2026-11-01T00:00:00Z")),
  );
});

const lamy = {
  name: "2019 Domaine Hubert Lamy Les Frionnes, Saint-Aubin Premier Cru, France",
  vintage: "2",
  location: "ALL",
};
const fixture = (name) =>
  fs.readFileSync(
    new URL(`./fixtures/lamy-${name}.html`, import.meta.url),
    "utf8",
  );
test("long wine names match equivalent appellation spelling without losing cuvee or vintage", () => {
  assert.equal(
    matchesProduct(
      "Saint Aubin 1er Cru Les Frionnes 2019, Hubert Lamy, 1x1500ml",
      lamy,
    ),
    true,
  );
  assert.equal(
    matchesProduct(
      "2019 St Aubin Les Frionnes 1er Cru Domaine Hubert Lamy Burgundy",
      lamy,
    ),
    true,
  );
  for (const wrong of [
    "2020 Hubert Lamy St Aubin 1er Cru Les Frionnes",
    "2019 Hubert Lamy St Aubin 1er Cru En Remilly",
    "2019 Hubert Lamy St Aubin Grand Cru Frionnes",
    "2019 Olivier Leflaive St Aubin 1er Cru Frionnes",
  ])
    assert.equal(matchesProduct(wrong, lamy), false);
});
test("Cellar Select distinguishes bonded and duty-paid variants", () => {
  const shop = {
    name: "Cellar Select UK",
    country: "UK",
    origin: "https://www.cellarselect.co.uk",
  };
  const offers = parseMerchantProduct(
    fixture("cellar"),
    shop.origin,
    shop,
    lamy,
  );
  assert.equal(offers.length, 2);
  const dutyPaid = offers.find((o) => o.price === 243.59);
  assert.equal(dutyPaid.bottleSize, "1500ml");
  assert.match(dutyPaid.url, /variant=54028812779848/);
  assert.equal(offers.find((o) => o.price === 200).availability, "보세 상품");
});
test("Millesima reads HTML product URLs and explicit 1.5L size, not 5l from display label", () => {
  const shop = {
    name: "Millesima France",
    country: "France",
    origin: "https://www.millesima.fr",
  };
  const [offer] = parseMerchantProduct(
    fixture("millesima"),
    shop.origin,
    shop,
    lamy,
  );
  assert.equal(offer.price, 355);
  assert.equal(offer.bottleSize, "1.5L");
  assert.equal(offer.vintage, "2019");
});
test("Y18 requires product-scoped current price, stock and purchase button", () => {
  const shop = {
    name: "Y18",
    country: "Hong Kong",
    origin: "https://www.y18.hk",
  };
  const url =
    shop.origin +
    "/St-Aubin-Les-Frionnes-1er-Cru-Domaine-Hubert-Lamy-2019-(750ml)-LC90-X-15044";
  const html = fixture("y18");
  const [offer] = mod.exports.parseY18Product(html, url, shop, lamy);
  assert.equal(offer.price, 1024);
  assert.equal(offer.currency, "HKD");
  assert.equal(offer.bottleSize, "750ml");
  for (const bad of [
    html.replace("Availability: In Stock", "Availability: Out Of Stock"),
    html.replace("LC90-X-15044", "PO-16-15044"),
    html.replace("HK$1,024.00", "USD 1,024.00"),
  ])
    assert.equal(mod.exports.parseY18Product(bad, url, shop, lamy).length, 0);
});
test("observed product URLs are rechecked even when merchant search fails", async () => {
  let productFetches = 0;
  const result = await searchMerchants(
    { ...lamy, location: "UK" },
    async (input) => {
      const url = String(input);
      if (url.includes("cellarselect.co.uk/products/")) {
        productFetches++;
        return new Response(fixture("cellar"), {
          headers: { "content-type": "text/html" },
        });
      }
      return new Response("Unavailable", { status: 503 });
    },
  );
  assert.ok(productFetches > 0);
  assert.equal(result.offers.length, 2);
  assert.ok(result.offers.some((o) => o.price === 243.59));
  assert.ok(result.coverage.incomplete > 0);
});

test("merchant can omit cru after 1er without changing classification", () => {
  assert.equal(
    matchesProduct(
      "Hubert Lamy St Aubin 1er Frionnes Blanc 2019 (750ml)",
      lamy,
    ),
    true,
  );
  assert.equal(
    matchesProduct("Hubert Lamy St Aubin Grand Cru Frionnes Blanc 2019", lamy),
    false,
  );
});

test("preorders, packs, and minimum bottle orders retain their purchase conditions", () => {
  const html = product({ name: "Savart Ouverture NV 6x1.5Ltr PRE ARRIVAL" });
  const [pack] = parseMerchantProduct(html, m.origin, m, q);
  assert.equal(pack.bottleSize, "6 × 1.5Ltr");
  assert.equal(pack.availability, "예약·입고 후 배송");
  const [single] = parseMerchantProduct(
    product() + '<div class="summary">Minimum order 6 bottles</div>',
    m.origin,
    { ...m, adapter: "woocommerce-html" },
    q,
  );
  assert.match(single.tax, /병당 금액 · 최소 6병 주문/);
});
test("nested offers with price specifications are accepted only with explicit availability", () => {
  const offers = {
    "@type": "AggregateOffer",
    offers: [
      {
        availability: "https://schema.org/PreOrder",
        priceSpecification: { price: 120, priceCurrency: "USD" },
        url: m.origin + "/product/savart",
      },
    ],
  };
  const [o] = parseMerchantProduct(product({ offers }), m.origin, m, q);
  assert.equal(o.price, 120);
  assert.equal(o.availability, "예약·입고 후 배송");
});
test("microdata prices stay within the matched Product and Offer scopes", () => {
  const html = `<div itemscope itemtype="https://schema.org/Product"><h1 itemprop="name">Savart Ouverture NV 750ml</h1><div itemprop="offers" itemscope itemtype="https://schema.org/Offer"><meta itemprop="price" content="99.98"><meta itemprop="priceCurrency" content="USD"><link itemprop="availability" href="https://schema.org/InStock"></div></div><span itemprop="price">1</span>`;
  const [o] = parseMerchantProduct(html, m.origin + "/wines/savart", m, q);
  assert.equal(o.price, 99.98);
  assert.equal(o.bottleSize, "750ml");
  assert.equal(
    parseMerchantProduct(
      html.replace("InStock", "OutOfStock"),
      m.origin + "/wines/savart",
      m,
      q,
    ).length,
    0,
  );
});

test("deadline settles even if a merchant ignores cancellation", async () => {
  await assert.rejects(
    mod.exports.withDeadline(new Promise(() => {}), 10),
    /deadline exceeded/,
  );
  assert.equal(await mod.exports.withDeadline(Promise.resolve(42), 10), 42);
});

test("Shopify theme variants require explicit currency, availability, and the requested vintage", () => {
  const html =
    '<meta property="og:price:currency" content="TWD"><script type="application/json" id="ProductJson-product-template">' +
    JSON.stringify({
      title: "Savart Ouverture",
      variants: [
        { id: 123, title: "2019 / 750ml", price: 220000, available: true },
        { id: 124, title: "2020 / 750ml", price: 230000, available: true },
        { id: 125, title: "2019 / 1500ml", price: 440000, available: false },
      ],
    }) +
    "</script>";
  const shop = { ...m, adapter: "shopify-html" };
  const result = parseMerchantProduct(
    html,
    m.origin + "/products/savart",
    shop,
    { ...q, vintage: "2019" },
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].price, 2200);
  assert.equal(result[0].currency, "TWD");
  assert.match(result[0].url, /variant=123/);
  assert.equal(
    parseMerchantProduct(
      html.replace('content="TWD"', 'content="$"'),
      m.origin + "/products/savart",
      shop,
      q,
    ).length,
    0,
  );
});
