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
test("exclude prearrival and mismatched products", () => {
  for (const name of ["Savart Ouverture NV PRE ARRIVAL", "Savart Accomplie NV"])
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
test('currency comparison uses a single dated reference and rejects stale rates', () => {
 const xml="<Cube><Cube time='2026-10-08'><Cube currency='USD' rate='1.1'/><Cube currency='GBP' rate='0.8'/><Cube currency='KRW' rate='1600'/></Cube></Cube>";
 const fx=mod.exports.parseReferenceRates(xml,Date.parse('2026-10-09T00:00:00Z'));
 const converted=mod.exports.applyReferenceRates([{price:110,currency:'USD'},{price:80,currency:'GBP'},{price:100,currency:'EUR'}],fx);
 for (const offer of converted) assert.ok(Math.abs(offer.priceKrw-160000)<0.01);
 assert.throws(()=>mod.exports.parseReferenceRates(xml,Date.parse('2026-11-01T00:00:00Z')));
});
