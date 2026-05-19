import { ApiVersion } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { processProductWebhookEvent } from "./product-webhook-processing.server";

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type WatchdogSessionRecord = {
  shop: string;
  accessToken: string;
};

type WatchdogProductNode = {
  id: string;
  updatedAt: string;
  collectorTag: { value: string | null } | null;
  influencerHandle: { value: string | null } | null;
  hostHandle: { value: string | null } | null;
  hostName: { value: string | null } | null;
};

type WatchdogStatusSnapshot = {
  enabled: boolean;
  started: boolean;
  intervalMs: number;
  lookbackMinutes: number;
  maxProductsPerShop: number;
  running: boolean;
  startedAt: string | null;
  lastRunAt: string | null;
  lastCompletedAt: string | null;
  lastShopCount: number;
  lastProductCount: number;
  lastSentCount: number;
  lastFailedCount: number;
  lastError: string;
};

declare global {
  // eslint-disable-next-line no-var
  var followNotificationWatchdog:
    | {
        intervalId: NodeJS.Timeout | null;
        startedAt: string | null;
        running: boolean;
        lastRunAt: string | null;
        lastCompletedAt: string | null;
        lastShopCount: number;
        lastProductCount: number;
        lastSentCount: number;
        lastFailedCount: number;
        lastError: string;
      }
    | undefined;
}

const WATCHDOG_INTERVAL_MS = Math.max(
  15_000,
  Number(process.env.FOLLOW_NOTIFICATION_WATCHDOG_INTERVAL_MS || 60_000),
);
const WATCHDOG_LOOKBACK_MINUTES = Math.max(
  5,
  Number(process.env.FOLLOW_NOTIFICATION_WATCHDOG_LOOKBACK_MINUTES || 180),
);
const WATCHDOG_MAX_PRODUCTS_PER_SHOP = Math.max(
  1,
  Number(process.env.FOLLOW_NOTIFICATION_WATCHDOG_MAX_PRODUCTS_PER_SHOP || 50),
);

function getWatchdogState() {
  if (!global.followNotificationWatchdog) {
    global.followNotificationWatchdog = {
      intervalId: null,
      startedAt: null,
      running: false,
      lastRunAt: null,
      lastCompletedAt: null,
      lastShopCount: 0,
      lastProductCount: 0,
      lastSentCount: 0,
      lastFailedCount: 0,
      lastError: "",
    };
  }

  return global.followNotificationWatchdog;
}

function isWatchdogEnabled() {
  return (
    process.env.NODE_ENV === "production" &&
    process.env.DISABLE_FOLLOW_NOTIFICATION_WATCHDOG !== "1"
  );
}

function normalizeText(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function createOfflineAdminClient(session: WatchdogSessionRecord): AdminGraphqlClient {
  return {
    graphql: async (query, options) => {
      return fetch(`https://${session.shop}/admin/api/${ApiVersion.October25}/graphql.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": session.accessToken,
        },
        body: JSON.stringify({
          query,
          variables: options?.variables || {},
        }),
      });
    },
  };
}

async function listOfflineSessions(): Promise<WatchdogSessionRecord[]> {
  const sessions = await db.session.findMany({
    where: {
      isOnline: false,
      accessToken: {
        not: "",
      },
    },
    orderBy: {
      shop: "asc",
    },
    select: {
      shop: true,
      accessToken: true,
    },
  });

  const byShop = new Map<string, WatchdogSessionRecord>();

  for (const session of sessions) {
    const shop = normalizeText(session.shop);

    if (!shop || byShop.has(shop)) {
      continue;
    }

    byShop.set(shop, {
      shop,
      accessToken: session.accessToken,
    });
  }

  return Array.from(byShop.values());
}

async function fetchRecentActiveProducts(admin: AdminGraphqlClient) {
  const response = await admin.graphql(
    `#graphql
      query FollowNotificationWatchdogProducts($first: Int!) {
        products(
          first: $first
          sortKey: UPDATED_AT
          reverse: true
          query: "status:active"
        ) {
          nodes {
            id
            updatedAt
            collectorTag: metafield(namespace: "custom", key: "collector_tag") {
              value
            }
            influencerHandle: metafield(namespace: "custom", key: "influencer_handle") {
              value
            }
            hostHandle: metafield(namespace: "custom", key: "host_handle") {
              value
            }
            hostName: metafield(namespace: "custom", key: "host_name") {
              value
            }
          }
        }
      }
    `,
    { variables: { first: WATCHDOG_MAX_PRODUCTS_PER_SHOP } },
  );

  const result = (await response.json()) as {
    data?: {
      products?: {
        nodes?: WatchdogProductNode[];
      };
    };
    errors?: Array<{ message?: string }>;
  };

  if (!response.ok || result.errors?.length) {
    const message =
      result.errors?.map((error) => error.message).filter(Boolean).join(", ") ||
      `Failed to load recent products (${response.status})`;
    throw new Error(message);
  }

  return result.data?.products?.nodes || [];
}

function isWithinLookback(updatedAt: string) {
  const updatedAtMs = Date.parse(updatedAt);

  if (!Number.isFinite(updatedAtMs)) {
    return false;
  }

  return updatedAtMs >= Date.now() - WATCHDOG_LOOKBACK_MINUTES * 60_000;
}

function hasCollectorSignal(product: WatchdogProductNode) {
  return Boolean(
    normalizeText(product.collectorTag?.value) ||
      normalizeText(product.influencerHandle?.value) ||
      normalizeText(product.hostHandle?.value) ||
      normalizeText(product.hostName?.value),
  );
}

async function runWatchdogCycle() {
  const state = getWatchdogState();

  if (state.running || !isWatchdogEnabled()) {
    return;
  }

  state.running = true;
  state.lastRunAt = new Date().toISOString();
  state.lastError = "";

  let lastShopCount = 0;
  let lastProductCount = 0;
  let lastSentCount = 0;
  let lastFailedCount = 0;

  try {
    const sessions = await listOfflineSessions();
    lastShopCount = sessions.length;

    for (const session of sessions) {
      const admin = createOfflineAdminClient(session);
      const products = await fetchRecentActiveProducts(admin);
      const candidateProducts = products.filter(
        (product) => hasCollectorSignal(product) && isWithinLookback(product.updatedAt),
      );

      lastProductCount += candidateProducts.length;

      for (const product of candidateProducts) {
        const result = await processProductWebhookEvent({
          admin,
          shop: session.shop,
          productId: product.id,
          maxAttempts: 1,
        });

        lastSentCount += Number(result.notification?.sentCount || 0);
        lastFailedCount += Number(result.notification?.failedCount || 0);
      }
    }
  } catch (error) {
    state.lastError = error instanceof Error ? error.message : String(error);
    console.error("[follow-watchdog] cycle failed", {
      message: state.lastError,
      stack: error instanceof Error ? error.stack : undefined,
    });
  } finally {
    state.running = false;
    state.lastCompletedAt = new Date().toISOString();
    state.lastShopCount = lastShopCount;
    state.lastProductCount = lastProductCount;
    state.lastSentCount = lastSentCount;
    state.lastFailedCount = lastFailedCount;

    console.info("[follow-watchdog] cycle completed", {
      shopCount: lastShopCount,
      productCount: lastProductCount,
      sentCount: lastSentCount,
      failedCount: lastFailedCount,
      lastError: state.lastError || undefined,
    });
  }
}

export function startFollowNotificationWatchdog() {
  const state = getWatchdogState();

  if (!isWatchdogEnabled() || state.intervalId) {
    return;
  }

  state.startedAt = new Date().toISOString();
  state.intervalId = setInterval(() => {
    void runWatchdogCycle();
  }, WATCHDOG_INTERVAL_MS);

  void runWatchdogCycle();
}

export function getFollowNotificationWatchdogStatus(): WatchdogStatusSnapshot {
  const state = getWatchdogState();

  return {
    enabled: isWatchdogEnabled(),
    started: Boolean(state.intervalId),
    intervalMs: WATCHDOG_INTERVAL_MS,
    lookbackMinutes: WATCHDOG_LOOKBACK_MINUTES,
    maxProductsPerShop: WATCHDOG_MAX_PRODUCTS_PER_SHOP,
    running: state.running,
    startedAt: state.startedAt,
    lastRunAt: state.lastRunAt,
    lastCompletedAt: state.lastCompletedAt,
    lastShopCount: state.lastShopCount,
    lastProductCount: state.lastProductCount,
    lastSentCount: state.lastSentCount,
    lastFailedCount: state.lastFailedCount,
    lastError: state.lastError,
  };
}
