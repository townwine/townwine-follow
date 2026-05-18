import {
  getFollowersForInfluencerAliases,
  normalizeInfluencerHandle,
} from "./follow.server";
import {
  collectProductInfluencerAliases,
  productMatchesInfluencerHandle,
  resolveProductInfluencerHandle,
} from "./product-collector.server";

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type ProductMetafieldValue = {
  value: string | null;
} | null;

type ProductNode = {
  id: string;
  vendor: string | null;
  tags: string[];
  collectorTag: ProductMetafieldValue;
  hostName: ProductMetafieldValue;
  hostHandle: ProductMetafieldValue;
  influencerHandle: ProductMetafieldValue;
  followersAdjustment?: ProductMetafieldValue;
  dealsAdjustment?: ProductMetafieldValue;
} | null;

type ProductContext = {
  id: string;
  legacyId: string;
  vendor: string;
  tags: string[];
  collectorTag: string;
  hostName: string;
  hostHandle: string;
  influencerHandle: string;
  followersAdjustment: number;
  dealsAdjustment: number;
};

type CollectorStatsSnapshot = {
  productId: string;
  legacyProductId: string;
  handleKey: string;
  followerCount: number;
  actualFollowerCount: number;
  followerAdjustment: number;
  followersLabel: string;
  dealCount: number;
  actualDealCount: number;
  dealAdjustment: number;
  dealsLabel: string;
  influencerHandle: string;
};

type CollectorStatsProductsQueryResponse = {
  products: {
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
    nodes: ProductNode[];
  };
};

type CollectorCatalogCacheEntry = {
  value: ProductContext[];
  expiresAt: number;
  promise: Promise<ProductContext[]> | null;
};

const COLLECTOR_CATALOG_CACHE_TTL_MS = 30_000;
const COLLECTOR_CATALOG_STALE_TTL_MS = 5_000;
const collectorCatalogCache = new Map<string, CollectorCatalogCacheEntry>();

function toProductGid(value: string) {
  const trimmedValue = String(value || "").trim();

  if (!trimmedValue) {
    return "";
  }

  if (trimmedValue.startsWith("gid://shopify/Product/")) {
    return trimmedValue;
  }

  if (/^\d+$/.test(trimmedValue)) {
    return `gid://shopify/Product/${trimmedValue}`;
  }

  return "";
}

function toLegacyProductId(gid: string) {
  const match = String(gid || "").match(/\/(\d+)(?:\?.*)?$/);
  return match?.[1] || String(gid || "").trim();
}

function normalizeCollectorName(value: string) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

function toInteger(value: string | null | undefined) {
  if (value == null || value === "") {
    return 0;
  }

  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    return 0;
  }

  return Math.trunc(parsedValue);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ko-KR").format(Math.max(0, Math.trunc(value)));
}

function formatFollowerCount(value: number) {
  const safeValue = Math.max(0, Math.trunc(value));

  if (safeValue >= 1000) {
    const compactValue = (safeValue / 1000).toFixed(1).replace(/\.0$/, "");
    return `${compactValue}k 팔로워`;
  }

  return `${formatNumber(safeValue)} 팔로워`;
}

async function runAdminQuery<TData>(
  admin: AdminGraphqlClient,
  query: string,
  variables?: Record<string, unknown>,
) {
  const response = await admin.graphql(query, variables ? { variables } : undefined);
  const result = (await response.json()) as {
    data?: TData;
    errors?: Array<{ message?: string }>;
  };

  if (!response.ok || result.errors?.length || !result.data) {
    const messages = result.errors?.map((error) => error.message).filter(Boolean);
    throw new Error(
      messages?.length
        ? messages.join(", ")
        : `Admin query failed with status ${response.status}`,
    );
  }

  return result.data;
}

function mapProductContext(node: ProductNode): ProductContext | null {
  if (!node?.id) {
    return null;
  }

  return {
    id: node.id,
    legacyId: toLegacyProductId(node.id),
    vendor: String(node.vendor || "").trim(),
    tags: Array.isArray(node.tags) ? node.tags : [],
    collectorTag: String(node.collectorTag?.value || "").trim(),
    hostName: String(node.hostName?.value || "").trim(),
    hostHandle: String(node.hostHandle?.value || "").trim(),
    influencerHandle: String(node.influencerHandle?.value || "").trim(),
    followersAdjustment: toInteger(node.followersAdjustment?.value),
    dealsAdjustment: toInteger(node.dealsAdjustment?.value),
  };
}

async function fetchCollectorTargets(
  admin: AdminGraphqlClient,
  productIds: string[],
) {
  const ids = Array.from(
    new Set(
      productIds
        .map((productId) => toProductGid(productId))
        .filter(Boolean),
    ),
  );

  if (!ids.length) {
    return [];
  }

  const data = await runAdminQuery<{ nodes: ProductNode[] }>(
    admin,
    `#graphql
      query CollectorStatsTargets($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product {
            id
            vendor
            tags
            collectorTag: metafield(namespace: "custom", key: "collector_tag") {
              value
            }
            hostName: metafield(namespace: "custom", key: "host_name") {
              value
            }
            hostHandle: metafield(namespace: "custom", key: "host_handle") {
              value
            }
            influencerHandle: metafield(namespace: "custom", key: "influencer_handle") {
              value
            }
            followersAdjustment: metafield(namespace: "custom", key: "collector_followers_adjustment") {
              value
            }
            dealsAdjustment: metafield(namespace: "custom", key: "collector_deals_adjustment") {
              value
            }
          }
        }
      }
    `,
    { ids },
  );

  return data.nodes.map(mapProductContext).filter(Boolean) as ProductContext[];
}

async function fetchAllCollectorProducts(admin: AdminGraphqlClient) {
  const products: ProductContext[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const responseData: CollectorStatsProductsQueryResponse = await runAdminQuery<CollectorStatsProductsQueryResponse>(
      admin,
      `#graphql
        query CollectorStatsProducts($cursor: String) {
          products(first: 250, after: $cursor) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              vendor
              tags
              collectorTag: metafield(namespace: "custom", key: "collector_tag") {
                value
              }
              hostName: metafield(namespace: "custom", key: "host_name") {
                value
              }
              hostHandle: metafield(namespace: "custom", key: "host_handle") {
                value
              }
              influencerHandle: metafield(namespace: "custom", key: "influencer_handle") {
                value
              }
              followersAdjustment: metafield(namespace: "custom", key: "collector_followers_adjustment") {
                value
              }
              dealsAdjustment: metafield(namespace: "custom", key: "collector_deals_adjustment") {
                value
              }
            }
          }
        }
      `,
      { cursor },
    );

    products.push(
      ...(responseData.products.nodes
        .map((node: ProductNode) => mapProductContext(node))
        .filter(Boolean) as ProductContext[]),
    );

    hasNextPage = responseData.products.pageInfo.hasNextPage;
    cursor = responseData.products.pageInfo.endCursor;
  }

  return products;
}

function getCollectorCatalogCacheKey(shop: string) {
  return String(shop || "").trim().toLowerCase();
}

async function fetchCachedCollectorProducts(
  admin: AdminGraphqlClient,
  shop: string,
) {
  const cacheKey = getCollectorCatalogCacheKey(shop);
  const now = Date.now();
  const cachedEntry = collectorCatalogCache.get(cacheKey);

  if (cachedEntry?.value.length && cachedEntry.expiresAt > now) {
    return cachedEntry.value;
  }

  if (cachedEntry?.promise) {
    return cachedEntry.promise;
  }

  const refreshPromise = fetchAllCollectorProducts(admin);

  collectorCatalogCache.set(cacheKey, {
    value: cachedEntry?.value ?? [],
    expiresAt: cachedEntry?.expiresAt ?? 0,
    promise: refreshPromise,
  });

  try {
    const products = await refreshPromise;

    collectorCatalogCache.set(cacheKey, {
      value: products,
      expiresAt: Date.now() + COLLECTOR_CATALOG_CACHE_TTL_MS,
      promise: null,
    });

    return products;
  } catch (error) {
    if (cachedEntry?.value.length) {
      collectorCatalogCache.set(cacheKey, {
        value: cachedEntry.value,
        expiresAt: Date.now() + COLLECTOR_CATALOG_STALE_TTL_MS,
        promise: null,
      });

      return cachedEntry.value;
    }

    collectorCatalogCache.delete(cacheKey);
    throw error;
  }
}

function getPrimaryInfluencerHandle(product: ProductContext) {
  return resolveProductInfluencerHandle(product, { includeNameFallback: true });
}

function getCollectorAliasKeys(product: ProductContext) {
  return collectProductInfluencerAliases(product, { includeNameFallback: true });
}

function getMatchingProducts(
  target: { handle?: string; name?: string },
  catalog: ProductContext[],
) {
  const handleKeys = new Set(
    [target.handle]
      .map((value) => normalizeInfluencerHandle(String(value || "")))
      .filter(Boolean),
  );
  const nameKeys = new Set(
    [target.name]
      .map((value) => normalizeCollectorName(String(value || "")))
      .filter(Boolean),
  );

  if (!handleKeys.size && !nameKeys.size) {
    return [];
  }

  return catalog.filter((product) => {
    const productNames = [
      normalizeCollectorName(product.hostName),
      normalizeCollectorName(product.vendor),
    ].filter(Boolean);

    const hasHandleMatch = Array.from(handleKeys).some((value) =>
      productMatchesInfluencerHandle(product, value),
    );
    const hasNameMatch = productNames.some((value) => nameKeys.has(value));

    return hasHandleMatch || hasNameMatch;
  });
}

function getMatchingDealCount(
  target: ProductContext,
  catalog: ProductContext[],
) {
  return getMatchingProducts(
    {
      handle: target.influencerHandle || target.hostHandle || target.collectorTag,
      name: target.collectorTag || target.hostName || target.vendor,
    },
    catalog,
  ).length;
}

function getFollowerAliasKeys(
  primaryAlias: string,
  matchedProducts: ProductContext[],
) {
  return Array.from(
    new Set(
      [primaryAlias]
        .concat(
          matchedProducts.flatMap((product) => getCollectorAliasKeys(product)),
        )
        .map((value) => normalizeInfluencerHandle(value))
        .filter(Boolean),
    ),
  );
}

function pickAdjustment(
  products: ProductContext[],
  key: "followersAdjustment" | "dealsAdjustment",
) {
  const preferredProduct = products.find((product) => product[key] !== 0);
  return preferredProduct?.[key] ?? products[0]?.[key] ?? 0;
}

export async function getCollectorStatsSnapshots(params: {
  admin: AdminGraphqlClient;
  shop: string;
  productIds: string[];
  handles?: string[];
}) {
  const requestedHandles = Array.from(
    new Set(
      (params.handles || [])
        .map((handle) => normalizeInfluencerHandle(handle))
        .filter(Boolean),
    ),
  );

  if (!params.productIds.length && !requestedHandles.length) {
    return [];
  }

  const targets = params.productIds.length
    ? await fetchCollectorTargets(params.admin, params.productIds)
    : [];
  const catalog = await fetchCachedCollectorProducts(params.admin, params.shop);
  const snapshots: CollectorStatsSnapshot[] = [];

  const targetSnapshots = await Promise.all(
    targets.map(async (target): Promise<CollectorStatsSnapshot> => {
      const influencerHandle = getPrimaryInfluencerHandle(target);
      const actualDealCount = getMatchingDealCount(target, catalog);
      const matchedProducts = getMatchingProducts(
        {
          handle:
            influencerHandle ||
            target.influencerHandle ||
            target.hostHandle ||
            target.collectorTag,
          name: target.collectorTag || target.hostName || target.vendor,
        },
        catalog,
      );
      const actualFollowerCount = influencerHandle
        ? (
            await getFollowersForInfluencerAliases({
              shop: params.shop,
              aliases: getFollowerAliasKeys(influencerHandle, matchedProducts),
            })
          ).length
        : 0;
      const followerCount = Math.max(
        0,
        actualFollowerCount + target.followersAdjustment,
      );
      const dealCount = Math.max(0, actualDealCount + target.dealsAdjustment);

      return {
        productId: target.id,
        legacyProductId: target.legacyId,
        handleKey: influencerHandle,
        followerCount,
        actualFollowerCount,
        followerAdjustment: target.followersAdjustment,
        followersLabel: formatFollowerCount(followerCount),
        dealCount,
        actualDealCount,
        dealAdjustment: target.dealsAdjustment,
        dealsLabel: `누적 공구 ${formatNumber(dealCount)}회`,
        influencerHandle,
      };
    }),
  );

  snapshots.push(...targetSnapshots);

  const handleSnapshots = await Promise.all(
    requestedHandles.map(async (handleKey): Promise<CollectorStatsSnapshot> => {
      const matchedProducts = getMatchingProducts({ handle: handleKey }, catalog);
      const actualFollowerCount = (
        await getFollowersForInfluencerAliases({
          shop: params.shop,
          aliases: getFollowerAliasKeys(handleKey, matchedProducts),
        })
      ).length;
      const actualDealCount = matchedProducts.length;
      const followerAdjustment = pickAdjustment(
        matchedProducts,
        "followersAdjustment",
      );
      const dealAdjustment = pickAdjustment(matchedProducts, "dealsAdjustment");
      const followerCount = Math.max(
        0,
        actualFollowerCount + followerAdjustment,
      );
      const dealCount = Math.max(0, actualDealCount + dealAdjustment);

      return {
        productId: "",
        legacyProductId: "",
        handleKey,
        followerCount,
        actualFollowerCount,
        followerAdjustment,
        followersLabel: formatFollowerCount(followerCount),
        dealCount,
        actualDealCount,
        dealAdjustment,
        dealsLabel: `누적 공구 ${formatNumber(dealCount)}회`,
        influencerHandle: handleKey,
      };
    }),
  );

  snapshots.push(...handleSnapshots);

  return snapshots;
}
