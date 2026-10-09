import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import {
  notificationEmailKey,
  sendResendRequest,
} from "../app/services/resend-delivery.server.ts";
import {
  readNotificationQuery,
  refreshingNotificationAdmin,
} from "../app/services/notification-query.server.ts";

const identity = {
  shop: "store.myshopify.com",
  customerId: "1",
  productId: "2",
  notificationType: "FOLLOW_NEW_DEAL",
};
const message = {
  apiKey: "test-only",
  payload: { to: ["one@example.com"], subject: "A deal", html: "Hello" },
  timeoutMs: 1000,
  idempotencyKey: notificationEmailKey(identity),
};
const success = () => Response.json({ id: "email-1" });
const wait = async () => {};

test("idempotency is stable for one event and isolated by customer, product and type", () => {
  assert.equal(
    notificationEmailKey(identity),
    notificationEmailKey({
      ...identity,
      customerId: "gid://shopify/Customer/1",
      productId: "gid://shopify/Product/2",
    }),
  );
  for (const variation of [
    { customerId: "2" },
    { productId: "3" },
    { notificationType: "UPCOMING_OPEN_ALERT" },
    { shop: "other.myshopify.com" },
  ]) {
    assert.notEqual(
      notificationEmailKey(identity),
      notificationEmailKey({ ...identity, ...variation }),
    );
  }
});

test("a response lost after provider acceptance retries the exact key and payload", async () => {
  const requests = [];
  const id = await sendResendRequest(message, {
    wait,
    fetch: async (_url, init) => {
      requests.push(init);
      if (requests.length === 1)
        throw new TypeError("connection reset after send");
      return success();
    },
  });
  assert.equal(id, "email-1");
  assert.equal(requests.length, 2);
  assert.equal(requests[0].body, requests[1].body);
  assert.equal(
    requests[0].headers["Idempotency-Key"],
    requests[1].headers["Idempotency-Key"],
  );
});

for (const [status, name] of [
  [429, "rate_limit_exceeded"],
  [503, "service_unavailable"],
  [409, "concurrent_idempotent_requests"],
]) {
  test(`transient ${status} ${name} retries safely`, async () => {
    let calls = 0;
    const delays = [];
    await sendResendRequest(message, {
      wait: async (ms) => delays.push(ms),
      fetch: async () =>
        ++calls === 1
          ? Response.json({ name }, { status, headers: { "retry-after": "2" } })
          : success(),
    });
    assert.equal(calls, 2);
    assert.deepEqual(delays, [2000]);
  });
}

for (const [status, name] of [
  [429, "daily_quota_exceeded"],
  [409, "invalid_idempotent_request"],
  [401, "invalid_api_key"],
]) {
  test(`permanent ${status} ${name} is surfaced without repeated sends`, async () => {
    let calls = 0;
    await assert.rejects(
      sendResendRequest(message, {
        wait,
        fetch: async () => {
          calls++;
          return Response.json({ name }, { status });
        },
      }),
      new RegExp(name),
    );
    assert.equal(calls, 1);
  });
}

test("network retries are bounded", async () => {
  let calls = 0;
  await assert.rejects(
    sendResendRequest(message, {
      wait,
      fetch: async () => {
        calls++;
        throw new Error("offline");
      },
    }),
    /offline/,
  );
  assert.equal(calls, 4);
});

test("GraphQL HTTP 200 errors cannot silently become missing recipients", async () => {
  await assert.rejects(
    readNotificationQuery(
      Response.json({
        data: { customer: null },
        errors: [{ message: "Throttled" }],
      }),
    ),
    /Throttled/,
  );
  assert.deepEqual(
    await readNotificationQuery(Response.json({ data: { customer: null } })),
    { data: { customer: null } },
  );
});

for (const thrown of [true, false]) {
  test(`stale Shopify client is reloaded once (${thrown ? "SDK error" : "HTTP 401"})`, async () => {
    let reloads = 0;
    let freshCalls = 0;
    const client = refreshingNotificationAdmin(
      {
        graphql: async () => {
          if (thrown)
            throw Object.assign(new Error("Unauthorized"), {
              response: { code: 401 },
            });
          return new Response("", { status: 401 });
        },
      },
      async () => {
        reloads++;
        return {
          graphql: async () => {
            freshCalls++;
            return Response.json({
              data: { customer: { email: "one@example.com" } },
            });
          },
        };
      },
    );
    await readNotificationQuery(await client.graphql("query customer"));
    await readNotificationQuery(await client.graphql("query customer"));
    assert.equal(reloads, 1);
    assert.equal(freshCalls, 2);
  });
}

test("a still-unauthorized fresh client fails instead of looping", async () => {
  let reloads = 0;
  const bad = { graphql: async () => new Response("{}", { status: 401 }) };
  const client = refreshingNotificationAdmin(bad, async () => {
    reloads++;
    return bad;
  });
  await assert.rejects(
    readNotificationQuery(await client.graphql("query customer")),
    /401/,
  );
  assert.equal(reloads, 1);
});

function loadModule(file, mocks) {
  const source = readFileSync(
    new URL(`../app/${file}`, import.meta.url),
    "utf8",
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const module = { exports: {} };
  vm.runInNewContext(outputText, {
    module,
    exports: module.exports,
    require: (name) => {
      assert.ok(name in mocks, `Unexpected dependency: ${name}`);
      return mocks[name];
    },
    Response,
    Request,
    URL,
    Date,
    setTimeout,
    console: { info() {}, log() {}, error() {}, warn() {} },
  });
  return module.exports;
}

test("partial delivery retry sends only the failed recipient with the same key", async () => {
  const reserved = new Set();
  const attempts = [];
  const mocks = {
    "./notification-query.server": {
      readNotificationQuery,
      refreshingNotificationAdmin,
    },
    "./resend-delivery.server": { notificationEmailKey },
    "./follow.server": {
      normalizeInfluencerHandle: (value) => value,
      getFollowersForInfluencerAliases: async () =>
        ["1", "2"].map((customerId) => ({
          customerId,
          customerEmail: `${customerId}@example.com`,
          customerFirstName: "A",
        })),
      wasNotificationSent: async (p) => reserved.has(p.customerId),
      reserveNotificationSend: async (p) => {
        reserved.add(p.customerId);
        return { reserved: true, customerId: p.customerId };
      },
      releaseNotificationSendReservation: async (p) =>
        reserved.delete(p.customerId),
      cacheFollowerContact: async () => {},
    },
    "./email.server": {
      getEmailDeliveryRuntimeStatus: () => ({
        provider: "resend",
        mode: "live",
      }),
      sendNewDealEmail: async (p) => {
        attempts.push(p);
        if (
          p.to === "2@example.com" &&
          attempts.filter((a) => a.to === p.to).length === 1
        )
          throw new Error("temporary failure");
        return { mode: "resend", isTestOverride: false };
      },
    },
    "./collector-aliases.server": {
      expandInfluencerAliasesWithCollectorProfiles: async () => ["host"],
      expandKnownInfluencerAliasesWithCollectorProfiles: async () => [],
    },
    "./product-collector.server": {
      collectProductInfluencerAliases: () => ["host"],
    },
    "./open-at-label.server": { formatOpenAtLabel: () => "" },
    "./product-status.server": {
      hasOnlineStoreUrl: Boolean,
      isActiveProductStatus: (status) => status === "ACTIVE",
    },
    "./follow-email-template.server": {
      loadFollowEmailTemplateConfigSafe: async () => ({
        shopName: "Shop",
        settings: {},
      }),
    },
  };
  const { processDealNotification } = loadModule(
    "services/deal-notification.server.ts",
    mocks,
  );
  const params = {
    shop: identity.shop,
    productId: "2",
    admin: {
      graphql: async () =>
        Response.json({
          data: {
            product: {
              id: "2",
              title: "Deal",
              status: "ACTIVE",
              onlineStoreUrl: "https://example.com/deal",
              collectorTag: { value: "host" },
            },
          },
        }),
    },
  };
  const first = await processDealNotification(params);
  assert.equal(first.sentCount, 1);
  assert.equal(first.failedCount, 1);
  const second = await processDealNotification(params);
  assert.equal(second.sentCount, 1);
  assert.equal(second.failedCount, 0);
  assert.equal(second.skippedCount, 1);
  assert.equal(attempts.filter((a) => a.to === "1@example.com").length, 1);
  assert.equal(attempts[1].idempotencyKey, attempts[2].idempotencyKey);
});

test("following saves the subscription without replaying historical product emails", async () => {
  let saved = 0;
  let replayed = 0;
  const route = loadModule("routes/apps.townwine-follow.follow.ts", {
    "react-router": {
      redirect: (url) =>
        new Response(null, { status: 302, headers: { location: url } }),
    },
    "../services/follow-request.server": {
      readFollowMutationRequest: async () => ({
        requestParams: new URLSearchParams({
          shop: identity.shop,
          logged_in_customer_id: "1",
        }),
        influencerHandle: "host",
        customerEmail: "one@example.com",
      }),
    },
    "../services/follow.server": {
      normalizeInfluencerHandle: (value) => value,
      followInfluencer: async () => {
        saved++;
        return { id: "subscription-1" };
      },
    },
    "../services/storefront-admin.server": {
      resolveStorefrontAdmin: async () => ({
        resolvedShop: identity.shop,
        admin: {},
      }),
    },
    "../services/deal-notification.server": {
      processFollowNotificationCatchup: async () => {
        replayed++;
      },
    },
  });
  const response = await route.action({
    request: new Request("https://example.com/follow", { method: "POST" }),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).following, true);
  assert.equal(saved, 1);
  assert.equal(replayed, 0);
});

for (const [file, topic] of [
  ["routes/webhooks.products.create.ts", "PRODUCTS_CREATE"],
  ["routes/webhooks.products.update.ts", "PRODUCTS_UPDATE"],
  ["services/metafield-webhook.server.ts", "METAFIELDS_UPDATE"],
]) {
  test(`${topic} requests redelivery on partial failure and acknowledges success`, async () => {
    let failedCount = 1;
    const process = {
      processProductWebhookEvent: async () => ({
        notification: { failedCount },
      }),
    };
    const observability = { recordWebhookEvent() {} };
    const module = loadModule(file, {
      "../shopify.server": {
        authenticate: {
          webhook: async () => ({
            admin: {},
            topic,
            shop: identity.shop,
            payload: {
              id: "2",
              owner_id: "2",
              owner_resource: "product",
              namespace: "custom",
              key: "collector_tag",
            },
          }),
        },
      },
      "../services/latest-deals.server": { invalidateLatestDealsCache() {} },
      "../services/product-webhook-processing.server": process,
      "./product-webhook-processing.server": process,
      "../services/webhook-observability.server": observability,
      "./webhook-observability.server": observability,
    });
    const action =
      module.action ||
      ((args) => module.handleMetafieldWebhookAction(args, topic));
    const args = {
      request: new Request("https://example.com/webhook", { method: "POST" }),
    };
    assert.equal((await action(args)).status, 503);
    failedCount = 0;
    assert.equal((await action(args)).status, 200);
  });
}
