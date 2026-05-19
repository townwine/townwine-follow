import { ApiVersion } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { processProductWebhookEvent } from "./product-webhook-processing.server";
import { isSellableProductStatus } from "./product-status.server";
import { getRecentWebhookEvents } from "./webhook-observability.server";

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
  status: string;
  updatedAt: string;
};

type WatchdogStatusSnapshot = {
  enabled: boolean;
  started: boolean;
  intervalMs: number;
  lookbackMinutes: number;
  maxProductsPerShop: number;
  maxPagesPerShop: number;
  running: boolean;
  startedAt: string | null;
  lastRunAt: string | null;
  lastCompletedAt: string | null;
  lastShopCount: number;
  lastFetchedProductCount: number;
  lastProductCount: number;
  lastSentCount: number;
  lastFailedCount: number;
  lastError: string;
  lastMostRecentProductUpdatedAt: string;
  recentResults: Array<{
    productId: string;
    collectorSkipped: string;
    notificationSkipped: string;
    followerCount: number;
    sentCount: number;
    failedCount: number;
  }>;
  recentWebhookEvents: Array<{
    timestamp: string;
    topic: string;
    shop: string;
    productId: string;
    adminAvailable: boolean;
    namespace?: string;
    key?: string;
    skipped?: string;
  }>;
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
        lastFetchedProductCount: number;
        lastProductCount: number;
        lastSentCount: number;
        lastFailedCount: number;
        lastError: string;
        lastMostRecentProductUpdatedAt: string;
        recentResults: Array<{
          productId: string;
          collectorSkipped: string;
          notificationSkipped: string;
          followerCount: number;
          sentCount: number;
          failedCount: number;
        }>;
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
  50,
  Number(process.env.FOLLOW_NOTIFICATION_WATCHDOG_MAX_PRODUCTS_PER_SHOP || 250),
);
const WATCHDOG_MAX_PAGES_PER_SHOP = Math.max(
  1,
  Number(process.env.FOLLOW_NOTIFICATION_WATCHDOG_MAX_PAGES_PER_SHOP || 8),
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
      lastFetchedProductCount: 0,
      lastProductCount: 0,
      lastSentCount: 0,
      lastFailedCount: 0,
      lastError: "",
      lastMostRecentProductUpdatedAt: "",
      recentResults: [],
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
  const cutoffMs = Date.now() - WATCHDOG_LOOKBACK_MINUTES * 60_000;
  const products: WatchdogProductNode[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;
  let pageCount = 0;

  while (hasNextPage && pageCount < WATCHDOG_MAX_PAGES_PER_SHOP) {
    const response = await admin.graphql(
      `#graphql
        query FollowNotificationWatchdogProducts($first: Int!, $cursor: String) {
          products(
            first: $first
            after: $cursor
            sortKey: UPDATED_AT
            reverse: true
          ) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              status
              updatedAt
            }
          }
        }
      `,
      {
        variables: {
          first: WATCHDOG_MAX_PRODUCTS_PER_SHOP,
          cursor,
        },
      },
    );

    const result = (await response.json()) as {
      data?: {
        products?: {
          pageInfo?: {
            hasNextPage?: boolean;
            endCursor?: string | null;
          };
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

    const pageNodes = result.data?.products?.nodes || [];
    products.push(...pageNodes);
    pageCount += 1;

    const pageInfo = result.data?.products?.pageInfo;
    hasNextPage = Boolean(pageInfo?.hasNextPage);
    cursor = pageInfo?.endCursor || null;

    const oldestUpdatedAt = pageNodes[pageNodes.length - 1]?.updatedAt;
    const oldestUpdatedAtMs = Date.parse(String(oldestUpdatedAt || ""));

    if (!pageNodes.length) {
      break;
    }

    if (Number.isFinite(oldestUpdatedAtMs) && oldestUpdatedAtMs < cutoffMs) {
      break;
    }
  }

  return products;
}

function isWithinLookback(updatedAt: string) {
  const updatedAtMs = Date.parse(updatedAt);

  if (!Number.isFinite(updatedAtMs)) {
    return false;
  }

  return updatedAtMs >= Date.now() - WATCHDOG_LOOKBACK_MINUTES * 60_000;
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
  let lastFetchedProductCount = 0;
  let lastProductCount = 0;
  let lastSentCount = 0;
  let lastFailedCount = 0;
  let lastMostRecentProductUpdatedAt = "";
  const recentResults: Array<{
    productId: string;
    collectorSkipped: string;
    notificationSkipped: string;
    followerCount: number;
    sentCount: number;
    failedCount: number;
  }> = [];

  try {
    const sessions = await listOfflineSessions();
    lastShopCount = sessions.length;

    for (const session of sessions) {
      const admin = createOfflineAdminClient(session);
      const products = await fetchRecentActiveProducts(admin);
      lastFetchedProductCount += products.length;

      if (!lastMostRecentProductUpdatedAt && products[0]?.updatedAt) {
        lastMostRecentProductUpdatedAt = products[0].updatedAt;
      }

      const candidateProducts = products.filter(
        (product) =>
          isSellableProductStatus(product.status) && isWithinLookback(product.updatedAt),
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

        if (recentResults.length < 5) {
          recentResults.push({
            productId: product.id,
            collectorSkipped: String(result.collectorIdentity?.skipped || ""),
            notificationSkipped: String(result.notification?.skipped || ""),
            followerCount: Number(result.notification?.followerCount || 0),
            sentCount: Number(result.notification?.sentCount || 0),
            failedCount: Number(result.notification?.failedCount || 0),
          });
        }
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
    state.lastFetchedProductCount = lastFetchedProductCount;
    state.lastProductCount = lastProductCount;
    state.lastSentCount = lastSentCount;
    state.lastFailedCount = lastFailedCount;
    state.lastMostRecentProductUpdatedAt = lastMostRecentProductUpdatedAt;
    state.recentResults = recentResults;

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
    maxPagesPerShop: WATCHDOG_MAX_PAGES_PER_SHOP,
    running: state.running,
    startedAt: state.startedAt,
    lastRunAt: state.lastRunAt,
    lastCompletedAt: state.lastCompletedAt,
    lastShopCount: state.lastShopCount,
    lastFetchedProductCount: state.lastFetchedProductCount,
    lastProductCount: state.lastProductCount,
    lastSentCount: state.lastSentCount,
    lastFailedCount: state.lastFailedCount,
    lastError: state.lastError,
    lastMostRecentProductUpdatedAt: state.lastMostRecentProductUpdatedAt,
    recentResults: state.recentResults,
    recentWebhookEvents: getRecentWebhookEvents(),
  };
}
