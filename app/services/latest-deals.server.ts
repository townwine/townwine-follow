import {
  listCollectorProfiles,
  type CollectorProfileRecord,
} from "./collector-profiles.server";
import { normalizeInfluencerHandle } from "./follow.server";
import { resolveProductInfluencerHandle } from "./product-collector.server";
import {
  hasOnlineStoreUrl,
  isActiveProductStatus,
} from "./product-status.server";

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type ProductMetafieldValue = {
  value: string | null;
} | null;

type ProductImageNode = {
  url: string | null;
  altText: string | null;
} | null;

type ProductVariantNode = {
  id: string;
  availableForSale: boolean | null;
  price: string | null;
  compareAtPrice: string | null;
  inventoryQuantity: number | null;
  inventoryPolicy: string | null;
  inventoryItem: {
    tracked: boolean | null;
  } | null;
} | null;

type LatestDealProductNode = {
  id: string;
  title: string;
  handle: string;
  status: string | null;
  createdAt: string;
  publishedAt: string | null;
  onlineStoreUrl: string | null;
  vendor: string | null;
  productType: string | null;
  tags: string[];
  featuredImage: ProductImageNode;
  variants: {
    nodes: ProductVariantNode[];
  } | null;
  collectorTag: ProductMetafieldValue;
  hostName: ProductMetafieldValue;
  hostHandle: ProductMetafieldValue;
  influencerHandle: ProductMetafieldValue;
  dealOpenAtKst: ProductMetafieldValue;
  dealOpenMonth: ProductMetafieldValue;
  dealOpenDay: ProductMetafieldValue;
  dealOpenHour: ProductMetafieldValue;
  dealOpenMinute: ProductMetafieldValue;
} | null;

type LatestDealsQueryResponse = {
  products: {
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
    nodes: LatestDealProductNode[];
  };
};

type LatestDealsCacheEntry = {
  value: LatestDealsPagePayload | null;
  expiresAt: number;
  promise: Promise<LatestDealsPagePayload> | null;
};

type LatestDealsFullPayload = {
  fetchedAt: string;
  products: LatestDealProductPayload[];
  collectorDetails: Record<string, LatestDealCollectorDetails>;
};

type LatestDealsFullCacheEntry = {
  value: LatestDealsFullPayload | null;
  expiresAt: number;
  promise: Promise<LatestDealsFullPayload> | null;
};

type CollectorIndexValue = {
  displayName: string;
  publicHandle: string;
  storefrontPath: string;
};

type CollectorIndexCacheEntry = {
  value: Map<string, CollectorIndexValue> | null;
  expiresAt: number;
  promise: Promise<Map<string, CollectorIndexValue>> | null;
};

type LatestDealCollectorDetails = {
  followHandle: string;
  followName: string;
  displayName: string;
  handleLabel: string;
  collectorUrl: string;
};

type LatestDealVariantPayload = {
  id: string;
  available: boolean;
  price: string;
  compare_at_price: string;
  inventory_quantity: number;
  inventory_management: string;
};

export type LatestDealProductPayload = {
  id: string;
  title: string;
  handle: string;
  created_at: string;
  vendor: string;
  product_type: string;
  tags: string[];
  available: boolean;
  images: Array<{
    src: string;
    alt: string;
  }>;
  variants: LatestDealVariantPayload[];
};

export type LatestDealsPagePayload = {
  page: number;
  pageSize: number;
  hasNextPage: boolean;
  fetchedAt: string;
  products: LatestDealProductPayload[];
  collectorDetails: Record<string, LatestDealCollectorDetails>;
};

const ADMIN_QUERY_MAX_ATTEMPTS = 3;
const ADMIN_QUERY_RETRY_BASE_MS = 300;
const LATEST_DEALS_CACHE_TTL_MS = 30_000;
const LATEST_DEALS_FULL_CACHE_TTL_MS = 30_000;
const COLLECTOR_INDEX_CACHE_TTL_MS = 300_000;
const PRODUCTS_PAGE_SIZE = 250;

const latestDealsPageCache = new Map<string, LatestDealsCacheEntry>();
const latestDealsFullCache = new Map<string, LatestDealsFullCacheEntry>();
const collectorIndexCache = new Map<string, CollectorIndexCacheEntry>();

function normalizeShop(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function normalizeText(value: string | null | undefined) {
  return String(value || "").trim();
}

function parseInteger(value: string | null | undefined) {
  if (value == null || value === "") {
    return null;
  }

  const parsedValue = Number.parseInt(String(value).trim(), 10);

  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function parseTimestamp(value: string | null | undefined) {
  const timestamp = Date.parse(String(value || "").trim());

  return Number.isFinite(timestamp) ? timestamp : null;
}

function createUtcTimestampFromKstParts(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
) {
  const timestamp = Date.UTC(year, month - 1, day, hour - 9, minute, 0, 0);
  const kstDate = new Date(timestamp + 9 * 60 * 60 * 1000);

  if (
    kstDate.getUTCFullYear() !== year ||
    kstDate.getUTCMonth() + 1 !== month ||
    kstDate.getUTCDate() !== day ||
    kstDate.getUTCHours() !== hour ||
    kstDate.getUTCMinutes() !== minute
  ) {
    return null;
  }

  return timestamp;
}

function resolveDealOpenTimestamp(node: Exclude<LatestDealProductNode, null>) {
  const explicitTimestamp = parseTimestamp(node.dealOpenAtKst?.value);

  if (explicitTimestamp != null) {
    return explicitTimestamp;
  }

  const month = parseInteger(node.dealOpenMonth?.value);
  const day = parseInteger(node.dealOpenDay?.value);
  const hour = parseInteger(node.dealOpenHour?.value);
  const minute = parseInteger(node.dealOpenMinute?.value);
  const hasCompleteSchedule =
    month != null && day != null && hour != null && minute != null;

  if (!hasCompleteSchedule) {
    return null;
  }

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  const referenceTimestamp =
    parseTimestamp(node.publishedAt) ?? parseTimestamp(node.createdAt) ?? Date.now();
  const referenceYear = new Date(referenceTimestamp).getUTCFullYear();
  const candidateTimestamp = createUtcTimestampFromKstParts(
    referenceYear,
    month,
    day,
    hour,
    minute,
  );

  return candidateTimestamp;
}

function isDealOpenForOngoingList(
  node: Exclude<LatestDealProductNode, null>,
  now = Date.now(),
) {
  const openTimestamp = resolveDealOpenTimestamp(node);

  return openTimestamp == null || openTimestamp <= now;
}

function clampPage(value: number) {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.max(1, Math.trunc(value));
}

function clampPageSize(value: number) {
  const normalizedValue = Math.trunc(value);

  if (normalizedValue === 100 || normalizedValue === 200) {
    return normalizedValue;
  }

  return 50;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runAdminQuery<TData>(
  admin: AdminGraphqlClient,
  query: string,
  variables?: Record<string, unknown>,
) {
  let attempt = 0;

  while (attempt < ADMIN_QUERY_MAX_ATTEMPTS) {
    attempt += 1;
    const response = await admin.graphql(
      query,
      variables ? { variables } : undefined,
    );
    const result = (await response.json()) as {
      data?: TData;
      errors?: Array<{ message?: string }>;
    };
    const messages = result.errors
      ?.map((error) => String(error?.message || "").trim())
      .filter(Boolean);

    if (response.ok && result.data && !messages?.length) {
      return result.data;
    }

    const errorMessage =
      messages?.join(", ") ||
      `Admin query failed with status ${response.status}`;
    const isRetryable =
      /throttled|timeout|temporar/i.test(errorMessage) &&
      attempt < ADMIN_QUERY_MAX_ATTEMPTS;

    if (!isRetryable) {
      throw new Error(errorMessage);
    }

    await sleep(ADMIN_QUERY_RETRY_BASE_MS * attempt);
  }

  throw new Error("LATEST_DEALS_ADMIN_QUERY_FAILED");
}

function createLatestDealsCacheKey(shop: string, page: number, pageSize: number) {
  return `${normalizeShop(shop)}:${page}:${pageSize}`;
}

function createLatestDealsFullCacheKey(shop: string) {
  return normalizeShop(shop);
}

function collectCollectorAliases(profile: CollectorProfileRecord) {
  return [
    profile.handle,
    profile.fields.publicHandle,
    profile.fields.displayName,
    profile.fields.customerName,
  ]
    .map((value) => normalizeInfluencerHandle(String(value || "")))
    .filter(Boolean);
}

async function buildCollectorIndex(admin: AdminGraphqlClient) {
  const profiles = await listCollectorProfiles(admin);
  const index = new Map<string, CollectorIndexValue>();

  profiles.forEach((profile) => {
    const collectorValue: CollectorIndexValue = {
      displayName:
        normalizeText(profile.fields.displayName) ||
        normalizeText(profile.fields.customerName) ||
        normalizeText(profile.handle),
      publicHandle: normalizeText(profile.fields.publicHandle),
      storefrontPath: normalizeText(profile.storefrontPath),
    };

    collectCollectorAliases(profile).forEach((alias) => {
      if (!index.has(alias)) {
        index.set(alias, collectorValue);
      }
    });
  });

  return index;
}

async function getCollectorIndex(params: {
  admin: AdminGraphqlClient;
  shop: string;
}) {
  const cacheKey = normalizeShop(params.shop);
  const now = Date.now();
  const cachedEntry = collectorIndexCache.get(cacheKey);

  if (cachedEntry?.value && cachedEntry.expiresAt > now) {
    return cachedEntry.value;
  }

  if (cachedEntry?.promise) {
    return cachedEntry.promise;
  }

  const refreshPromise = buildCollectorIndex(params.admin).then((index) => {
    collectorIndexCache.set(cacheKey, {
      value: index,
      expiresAt: Date.now() + COLLECTOR_INDEX_CACHE_TTL_MS,
      promise: null,
    });

    return index;
  });

  collectorIndexCache.set(cacheKey, {
    value: cachedEntry?.value ?? null,
    expiresAt: cachedEntry?.expiresAt ?? 0,
    promise: refreshPromise,
  });

  try {
    return await refreshPromise;
  } catch (error) {
    if (cachedEntry?.value) {
      collectorIndexCache.set(cacheKey, {
        value: cachedEntry.value,
        expiresAt: Date.now() + 30_000,
        promise: null,
      });

      return cachedEntry.value;
    }

    collectorIndexCache.delete(cacheKey);
    throw error;
  }
}

function normalizeVariantPayload(
  variant: ProductVariantNode,
): LatestDealVariantPayload | null {
  if (!variant?.id) {
    return null;
  }

  return {
    id: variant.id,
    available: Boolean(variant.availableForSale),
    price: normalizeText(variant.price) || "0",
    compare_at_price: normalizeText(variant.compareAtPrice) || "0",
    inventory_quantity:
      typeof variant.inventoryQuantity === "number" &&
      Number.isFinite(variant.inventoryQuantity)
        ? Math.max(0, Math.trunc(variant.inventoryQuantity))
        : 0,
    inventory_management: variant.inventoryItem?.tracked ? "shopify" : "",
  };
}

function resolveCollectorDetails(params: {
  node: Exclude<LatestDealProductNode, null>;
  collectorIndex: Map<string, CollectorIndexValue>;
}) {
  const collectorTag = normalizeText(params.node.collectorTag?.value);
  const hostName = normalizeText(params.node.hostName?.value);
  const hostHandle = normalizeText(params.node.hostHandle?.value);
  const vendor = normalizeText(params.node.vendor);
  const resolvedInfluencerHandle = resolveProductInfluencerHandle(
    {
      collectorTag,
      influencerHandle: normalizeText(params.node.influencerHandle?.value),
      hostHandle,
      hostName,
      vendor,
      tags: params.node.tags || [],
    },
    { includeNameFallback: true },
  );

  const aliases = [
    resolvedInfluencerHandle,
    hostHandle,
    hostName,
    collectorTag,
  ]
    .map((value) => normalizeInfluencerHandle(String(value || "")))
    .filter(Boolean);

  const collectorProfile = aliases
    .map((alias) => params.collectorIndex.get(alias) || null)
    .find(Boolean);

  const normalizedHandle =
    aliases[0] ||
    normalizeInfluencerHandle(
      collectorProfile?.publicHandle || resolvedInfluencerHandle || hostHandle,
    );
  const hasCollectorIdentity = Boolean(
    normalizedHandle || hostName || collectorTag || collectorProfile,
  );

  if (!hasCollectorIdentity) {
    return {
      followHandle: "",
      followName: "",
      displayName: "",
      handleLabel: "",
      collectorUrl: "",
    };
  }

  const displayName =
    normalizeText(collectorProfile?.displayName) ||
    collectorTag ||
    hostName ||
    normalizedHandle;
  const handleLabelRaw =
    normalizeText(collectorProfile?.publicHandle) ||
    hostHandle ||
    (normalizedHandle ? `@${normalizedHandle}` : "");

  return {
    followHandle: normalizedHandle,
    followName: displayName,
    displayName,
    handleLabel: handleLabelRaw,
    collectorUrl:
      normalizeText(collectorProfile?.storefrontPath) ||
      (normalizedHandle ? `/pages/collector/${normalizedHandle}` : ""),
  };
}

function mapLatestDealProduct(params: {
  node: Exclude<LatestDealProductNode, null>;
  collectorIndex: Map<string, CollectorIndexValue>;
}) {
  const variants = (params.node.variants?.nodes || [])
    .map((variant) => normalizeVariantPayload(variant))
    .filter(Boolean) as LatestDealVariantPayload[];

  const product: LatestDealProductPayload = {
    id: params.node.id,
    title: normalizeText(params.node.title),
    handle: normalizeText(params.node.handle),
    created_at: normalizeText(params.node.createdAt),
    vendor: normalizeText(params.node.vendor),
    product_type: normalizeText(params.node.productType),
    tags: Array.isArray(params.node.tags) ? params.node.tags : [],
    available: variants.some((variant) => variant.available),
    images:
      params.node.featuredImage?.url
        ? [
            {
              src: normalizeText(params.node.featuredImage.url),
              alt:
                normalizeText(params.node.featuredImage.altText) ||
                normalizeText(params.node.title),
            },
          ]
        : [],
    variants,
  };

  return {
    product,
    collectorDetails: resolveCollectorDetails({
      node: params.node,
      collectorIndex: params.collectorIndex,
    }),
  };
}

async function fetchLatestDealProducts(params: {
  admin: AdminGraphqlClient;
  collectorIndex: Map<string, CollectorIndexValue>;
  page: number;
  pageSize: number;
}) {
  const offsetStart = (params.page - 1) * params.pageSize;
  const offsetEnd = offsetStart + params.pageSize;
  const matchedProducts: Array<Exclude<LatestDealProductNode, null>> = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage && matchedProducts.length < offsetEnd) {
    const data: LatestDealsQueryResponse =
      await runAdminQuery<LatestDealsQueryResponse>(
      params.admin,
      `#graphql
        query LatestDealProducts($first: Int!, $cursor: String) {
          products(
            first: $first
            after: $cursor
            sortKey: CREATED_AT
            reverse: true
          ) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              title
              handle
              status
              createdAt
              publishedAt
              onlineStoreUrl
              vendor
              productType
              tags
              featuredImage {
                url
                altText
              }
              variants(first: 50) {
                nodes {
                  id
                  availableForSale
                  price
                  compareAtPrice
                  inventoryQuantity
                  inventoryPolicy
                  inventoryItem {
                    tracked
                  }
                }
              }
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
              dealOpenAtKst: metafield(namespace: "custom", key: "deal_open_at_kst") {
                value
              }
              dealOpenMonth: metafield(namespace: "custom", key: "deal_open_month") {
                value
              }
              dealOpenDay: metafield(namespace: "custom", key: "deal_open_day") {
                value
              }
              dealOpenHour: metafield(namespace: "custom", key: "deal_open_hour") {
                value
              }
              dealOpenMinute: metafield(namespace: "custom", key: "deal_open_minute") {
                value
              }
            }
          }
        }
      `,
      {
        first: PRODUCTS_PAGE_SIZE,
        cursor,
      },
    );

    const connection: LatestDealsQueryResponse["products"] = data.products;
    const pageNodes = (connection.nodes || []).filter(
      (
        node: LatestDealProductNode,
      ): node is Exclude<LatestDealProductNode, null> =>
        Boolean(
          node?.id &&
            node.handle &&
            node.createdAt &&
            node.publishedAt &&
            isActiveProductStatus(node.status) &&
            hasOnlineStoreUrl(node.onlineStoreUrl) &&
            isDealOpenForOngoingList(node),
        ),
    );

    matchedProducts.push(...pageNodes);
    hasNextPage = Boolean(connection.pageInfo?.hasNextPage);
    cursor = connection.pageInfo?.endCursor || null;

    if (!connection.nodes?.length) {
      break;
    }
  }

  const pageNodes = matchedProducts.slice(offsetStart, offsetEnd);
  const products: LatestDealProductPayload[] = [];
  const collectorDetails: Record<string, LatestDealCollectorDetails> = {};

  pageNodes.forEach((node) => {
    const mapped = mapLatestDealProduct({
      node,
      collectorIndex: params.collectorIndex,
    });

    if (mapped.product.handle) {
      products.push(mapped.product);
      collectorDetails[mapped.product.handle] = mapped.collectorDetails;
    }
  });

  return {
    page: params.page,
    pageSize: params.pageSize,
    hasNextPage: matchedProducts.length > offsetEnd || hasNextPage,
    fetchedAt: new Date().toISOString(),
    products,
    collectorDetails,
  };
}

function buildLatestDealsPageFromFullPayload(params: {
  payload: LatestDealsFullPayload;
  page: number;
  pageSize: number;
}): LatestDealsPagePayload {
  const offsetStart = (params.page - 1) * params.pageSize;
  const offsetEnd = offsetStart + params.pageSize;
  const products = params.payload.products.slice(offsetStart, offsetEnd);
  const collectorDetails: Record<string, LatestDealCollectorDetails> = {};

  products.forEach((product) => {
    if (product.handle && params.payload.collectorDetails[product.handle]) {
      collectorDetails[product.handle] = params.payload.collectorDetails[product.handle];
    }
  });

  return {
    page: params.page,
    pageSize: params.pageSize,
    hasNextPage: offsetEnd < params.payload.products.length,
    fetchedAt: params.payload.fetchedAt,
    products,
    collectorDetails,
  };
}

async function getAllLatestDealsPayload(params: {
  admin: AdminGraphqlClient;
  shop: string;
}) {
  const cacheKey = createLatestDealsFullCacheKey(params.shop);
  const now = Date.now();
  const cachedEntry = latestDealsFullCache.get(cacheKey);

  if (cachedEntry?.value && cachedEntry.expiresAt > now) {
    return cachedEntry.value;
  }

  if (cachedEntry?.promise) {
    return cachedEntry.promise;
  }

  const refreshPromise = (async () => {
    const collectorIndex = await getCollectorIndex({
      admin: params.admin,
      shop: params.shop,
    });

    const payload = await fetchLatestDealProducts({
      admin: params.admin,
      collectorIndex,
      page: 1,
      pageSize: Number.MAX_SAFE_INTEGER,
    });
    const fullPayload: LatestDealsFullPayload = {
      fetchedAt: payload.fetchedAt,
      products: payload.products,
      collectorDetails: payload.collectorDetails,
    };

    latestDealsFullCache.set(cacheKey, {
      value: fullPayload,
      expiresAt: Date.now() + LATEST_DEALS_FULL_CACHE_TTL_MS,
      promise: null,
    });

    return fullPayload;
  })();

  latestDealsFullCache.set(cacheKey, {
    value: cachedEntry?.value ?? null,
    expiresAt: cachedEntry?.expiresAt ?? 0,
    promise: refreshPromise,
  });

  try {
    return await refreshPromise;
  } catch (error) {
    if (cachedEntry?.value) {
      latestDealsFullCache.set(cacheKey, {
        value: cachedEntry.value,
        expiresAt: Date.now() + 10_000,
        promise: null,
      });

      return cachedEntry.value;
    }

    latestDealsFullCache.delete(cacheKey);
    throw error;
  }
}

export function invalidateLatestDealsCache(shop?: string | null) {
  const normalizedShop = normalizeShop(shop);

  if (!normalizedShop) {
    latestDealsPageCache.clear();
    latestDealsFullCache.clear();
    return;
  }

  Array.from(latestDealsPageCache.keys()).forEach((cacheKey) => {
    if (cacheKey.startsWith(`${normalizedShop}:`)) {
      latestDealsPageCache.delete(cacheKey);
    }
  });

  latestDealsFullCache.delete(normalizedShop);
}

export async function getLatestDealsPage(params: {
  admin: AdminGraphqlClient;
  shop: string;
  page: number;
  pageSize: number;
  all?: boolean;
}) {
  const page = clampPage(params.page);
  const pageSize = clampPageSize(params.pageSize);
  const fullCacheKey = createLatestDealsFullCacheKey(params.shop);
  const now = Date.now();

  if (params.all) {
    const fullPayload = await getAllLatestDealsPayload({
      admin: params.admin,
      shop: params.shop,
    });

    return {
      page: 1,
      pageSize: fullPayload.products.length,
      hasNextPage: false,
      fetchedAt: fullPayload.fetchedAt,
      products: fullPayload.products,
      collectorDetails: fullPayload.collectorDetails,
    };
  }

  const fullCachedEntry = latestDealsFullCache.get(fullCacheKey);

  if (fullCachedEntry?.value && fullCachedEntry.expiresAt > now) {
    return buildLatestDealsPageFromFullPayload({
      payload: fullCachedEntry.value,
      page,
      pageSize,
    });
  }

  const cacheKey = createLatestDealsCacheKey(params.shop, page, pageSize);
  const cachedEntry = latestDealsPageCache.get(cacheKey);

  if (cachedEntry?.value && cachedEntry.expiresAt > now) {
    return cachedEntry.value;
  }

  if (cachedEntry?.promise) {
    return cachedEntry.promise;
  }

  const refreshPromise = (async () => {
    const collectorIndex = await getCollectorIndex({
      admin: params.admin,
      shop: params.shop,
    });

    const payload = await fetchLatestDealProducts({
      admin: params.admin,
      collectorIndex,
      page,
      pageSize,
    });

    latestDealsPageCache.set(cacheKey, {
      value: payload,
      expiresAt: Date.now() + LATEST_DEALS_CACHE_TTL_MS,
      promise: null,
    });

    return payload;
  })();

  latestDealsPageCache.set(cacheKey, {
    value: cachedEntry?.value ?? null,
    expiresAt: cachedEntry?.expiresAt ?? 0,
    promise: refreshPromise,
  });

  try {
    return await refreshPromise;
  } catch (error) {
    if (cachedEntry?.value) {
      latestDealsPageCache.set(cacheKey, {
        value: cachedEntry.value,
        expiresAt: Date.now() + 10_000,
        promise: null,
      });

      return cachedEntry.value;
    }

    latestDealsPageCache.delete(cacheKey);
    throw error;
  }
}
