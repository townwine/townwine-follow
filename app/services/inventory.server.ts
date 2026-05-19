type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type SoldCountCacheEntry = {
  value: Map<string, number> | null;
  expiresAt: number;
  promise: Promise<Map<string, number>> | null;
};

type InventoryVariantNode = {
  id: string;
  legacyResourceId: string | number;
  inventoryPolicy: string;
  inventoryQuantity: number | null;
  availableForSale: boolean;
  inventoryItem: {
    tracked: boolean;
  } | null;
  product: {
    id: string;
    handle: string;
    title: string;
  } | null;
} | null;

type OrdersQueryResponse = {
  orders: {
    nodes: Array<{
      lineItems: {
        nodes: Array<{
          currentQuantity: number;
          variant: {
            id: string;
          } | null;
        }>;
      };
    }>;
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
  };
};

type VariantsQueryResponse = {
  nodes: InventoryVariantNode[];
};

export type InventorySnapshot = {
  variantId: string;
  legacyVariantId: string;
  productId: string;
  productHandle: string;
  productTitle: string;
  inventoryTracked: boolean;
  inventoryPolicy: string;
  availableForSale: boolean;
  soldCount: number;
  totalInventory: number;
  remainingInventory: number;
  progressPercent: number;
};

const ORDERS_PAGE_SIZE = 50;
const ORDER_LINE_ITEMS_PAGE_SIZE = 50;
const ADMIN_QUERY_MAX_ATTEMPTS = 4;
const ADMIN_QUERY_RETRY_BASE_MS = 400;
const SOLD_COUNT_CACHE_TTL_MS = 120_000;
const SOLD_COUNT_CACHE_STALE_TTL_MS = 20_000;
const VARIANT_CHUNK_SIZE = 100;
const soldCountCache = new Map<string, SoldCountCacheEntry>();

function clampQuantity(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, value);
}

function normalizeShop(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function isThrottleMessage(value: unknown) {
  return /throttled/i.test(String(value || ""));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryDelayMs(attempt: number) {
  return ADMIN_QUERY_RETRY_BASE_MS * attempt;
}

function chunkArray<TItem>(items: TItem[], size: number) {
  const chunks: TItem[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function normalizeVariantId(value: string) {
  const trimmedValue = String(value || "").trim();

  if (!trimmedValue) {
    return "";
  }

  if (trimmedValue.startsWith("gid://shopify/ProductVariant/")) {
    return trimmedValue;
  }

  const numericMatch = trimmedValue.match(/\d+/g);
  const numericId = numericMatch?.[numericMatch.length - 1];

  if (!numericId) {
    return "";
  }

  return `gid://shopify/ProductVariant/${numericId}`;
}

function toLegacyVariantId(variantId: string | number) {
  const rawValue = String(variantId || "").trim();

  if (!rawValue) {
    return "";
  }

  if (!rawValue.startsWith("gid://")) {
    return rawValue;
  }

  const parts = rawValue.split("/");
  return parts[parts.length - 1] || "";
}

async function runAdminQuery<TData>(
  admin: AdminGraphqlClient,
  query: string,
  variables?: Record<string, unknown>,
) {
  for (let attempt = 1; attempt <= ADMIN_QUERY_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await admin.graphql(query, variables ? { variables } : undefined);
      const result = (await response.json()) as {
        data?: TData;
        errors?: Array<{ message?: string }>;
      };
      const messages = result.errors?.map((error) => error.message).filter(Boolean) || [];

      if (
        (isThrottleMessage(messages.join(" ")) || (!response.ok && response.status === 429)) &&
        attempt < ADMIN_QUERY_MAX_ATTEMPTS
      ) {
        await sleep(getRetryDelayMs(attempt));
        continue;
      }

      if (!response.ok || result.errors?.length || !result.data) {
        throw new Error(
          messages.length
            ? messages.join(", ")
            : `Admin query failed with status ${response.status}`,
        );
      }

      return result.data;
    } catch (error) {
      if (isThrottleMessage(error) && attempt < ADMIN_QUERY_MAX_ATTEMPTS) {
        await sleep(getRetryDelayMs(attempt));
        continue;
      }

      throw error;
    }
  }

  throw new Error("Admin query failed after retries");
}

async function fetchVariants(
  admin: AdminGraphqlClient,
  variantIds: string[],
) {
  const chunks = chunkArray(variantIds, VARIANT_CHUNK_SIZE);
  const nodes: InventoryVariantNode[] = [];

  for (const chunk of chunks) {
    const data = await runAdminQuery<VariantsQueryResponse>(
      admin,
      `#graphql
        query InventoryVariants($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on ProductVariant {
              id
              legacyResourceId
              inventoryPolicy
              inventoryQuantity
              availableForSale
              inventoryItem {
                tracked
              }
              product {
                id
                handle
                title
              }
            }
          }
        }
      `,
      { ids: chunk },
    );

    nodes.push(...data.nodes);
  }

  return nodes.filter((node): node is Exclude<InventoryVariantNode, null> => {
    return Boolean(node?.id && node.product?.id);
  });
}

async function fetchSoldCounts(
  admin: AdminGraphqlClient,
) {
  const soldCounts = new Map<string, number>();
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const data: OrdersQueryResponse = await runAdminQuery<OrdersQueryResponse>(
      admin,
      `#graphql
        query InventoryOrders($after: String) {
          orders(
            first: ${ORDERS_PAGE_SIZE}
            after: $after
            sortKey: CREATED_AT
            reverse: true
            query: "status:any"
          ) {
            nodes {
              lineItems(first: ${ORDER_LINE_ITEMS_PAGE_SIZE}) {
                nodes {
                  currentQuantity
                  variant {
                    ... on ProductVariant {
                      id
                    }
                  }
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `,
      { after: cursor },
    );

    for (const order of data.orders.nodes) {
      for (const lineItem of order.lineItems.nodes) {
        const variantId = lineItem.variant?.id;

        if (!variantId) {
          continue;
        }

        const currentSoldCount = soldCounts.get(variantId) || 0;
        soldCounts.set(
          variantId,
          currentSoldCount + clampQuantity(lineItem.currentQuantity),
        );
      }
    }

    hasNextPage = data.orders.pageInfo.hasNextPage;
    cursor = data.orders.pageInfo.endCursor;
  }

  return soldCounts;
}

async function getCachedSoldCounts(params: {
  admin: AdminGraphqlClient;
  shop: string;
}) {
  const cacheKey = normalizeShop(params.shop);

  if (!cacheKey) {
    return fetchSoldCounts(params.admin);
  }

  const now = Date.now();
  const cachedEntry = soldCountCache.get(cacheKey);

  if (cachedEntry?.value && cachedEntry.expiresAt > now) {
    return cachedEntry.value;
  }

  if (cachedEntry?.promise) {
    return cachedEntry.promise;
  }

  const refreshPromise = fetchSoldCounts(params.admin);

  soldCountCache.set(cacheKey, {
    value: cachedEntry?.value ?? null,
    expiresAt: cachedEntry?.expiresAt ?? 0,
    promise: refreshPromise,
  });

  try {
    const soldCounts = await refreshPromise;

    soldCountCache.set(cacheKey, {
      value: soldCounts,
      expiresAt: Date.now() + SOLD_COUNT_CACHE_TTL_MS,
      promise: null,
    });

    return soldCounts;
  } catch (error) {
    if (cachedEntry?.value) {
      soldCountCache.set(cacheKey, {
        value: cachedEntry.value,
        expiresAt: Date.now() + SOLD_COUNT_CACHE_STALE_TTL_MS,
        promise: null,
      });

      return cachedEntry.value;
    }

    soldCountCache.delete(cacheKey);
    throw error;
  }
}

export async function getInventorySnapshots(params: {
  admin: AdminGraphqlClient;
  shop?: string;
  variantIds: string[];
}) {
  const normalizedVariantIds = Array.from(
    new Set(params.variantIds.map(normalizeVariantId).filter(Boolean)),
  );

  if (!normalizedVariantIds.length) {
    return [];
  }

  const variants = await fetchVariants(params.admin, normalizedVariantIds);
  let soldCounts = new Map<string, number>();

  try {
    soldCounts = await getCachedSoldCounts({
      admin: params.admin,
      shop: params.shop || "",
    });
  } catch (error) {
    console.error("[inventory] failed to refresh sold counts, falling back to inventory-only snapshots", {
      shop: params.shop || "",
      variantCount: normalizedVariantIds.length,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }

  return variants.map<InventorySnapshot>((variant) => {
    const remainingInventory = clampQuantity(variant.inventoryQuantity);
    const soldCount = clampQuantity(soldCounts.get(variant.id));
    const totalInventory = remainingInventory + soldCount;
    const progressPercent =
      totalInventory > 0
        ? Math.min(
            100,
            Math.round((soldCount / totalInventory) * 100),
          )
        : 0;

    return {
      variantId: variant.id,
      legacyVariantId: toLegacyVariantId(variant.legacyResourceId),
      productId: variant.product?.id || "",
      productHandle: variant.product?.handle || "",
      productTitle: variant.product?.title || "",
      inventoryTracked: Boolean(variant.inventoryItem?.tracked),
      inventoryPolicy: variant.inventoryPolicy,
      availableForSale: Boolean(variant.availableForSale),
      soldCount,
      totalInventory,
      remainingInventory,
      progressPercent,
    };
  });
}
