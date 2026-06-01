import type { UpcomingDealAlertSubscription } from "@prisma/client";
import { prisma } from "../db.server";
import {
  releaseNotificationSendReservation,
  reserveNotificationSend,
} from "./follow.server";
import {
  getEmailDeliveryRuntimeStatus,
  sendUpcomingOpenAlertEmail,
} from "./email.server";
import { loadFollowEmailTemplateConfigSafe } from "./follow-email-template.server";
import { formatOpenAtLabel } from "./open-at-label.server";
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

type ProductOpenAlertNode = {
  id: string;
  title: string;
  status: string;
  tags: string[];
  onlineStoreUrl: string | null;
  openAtKst: { value: string | null } | null;
  hostName: { value: string | null } | null;
  hostHandle: { value: string | null } | null;
  influencerHandle: { value: string | null } | null;
} | null;

type CustomerNode = {
  id: string;
  firstName: string | null;
  email: string | null;
} | null;

type UpcomingDealAdminSnapshot = {
  productId: string;
  legacyProductId: string;
  title: string;
  status: string;
  openAtKst: string;
  hostName: string;
  subscriberCount: number;
};

const PRODUCT_BATCH_SIZE = 50;

function normalizeShop(shop: string) {
  return String(shop || "").trim().toLowerCase();
}

function normalizeCustomerId(customerId: string) {
  return String(customerId || "").trim();
}

export function normalizeProductId(productId: string) {
  const trimmedValue = String(productId || "").trim();

  if (!trimmedValue) {
    return "";
  }

  if (trimmedValue.startsWith("gid://shopify/Product/")) {
    return trimmedValue;
  }

  if (/^\d+$/.test(trimmedValue)) {
    return `gid://shopify/Product/${trimmedValue}`;
  }

  const match = trimmedValue.match(/(\d+)/g);
  const numericId = match?.[match.length - 1];

  return numericId ? `gid://shopify/Product/${numericId}` : "";
}

function toLegacyProductId(productId: string) {
  const rawValue = String(productId || "").trim();

  if (!rawValue) {
    return "";
  }

  if (!rawValue.startsWith("gid://")) {
    return rawValue;
  }

  const parts = rawValue.split("/");
  return parts[parts.length - 1] || "";
}

function chunkItems<TValue>(items: TValue[], size: number) {
  const chunks: TValue[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function getHostName(node: ProductOpenAlertNode) {
  return String(node?.hostName?.value || "").trim() || "TownWine";
}

function getInfluencerHandle(node: ProductOpenAlertNode) {
  return (
    resolveProductInfluencerHandle({
      influencerHandle: node?.influencerHandle?.value,
      hostHandle: node?.hostHandle?.value,
      hostName: node?.hostName?.value,
      tags: node?.tags || [],
    }) || "scheduled-open"
  );
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

async function fetchProductsByIds(
  admin: AdminGraphqlClient,
  productIds: string[],
) {
  const normalizedProductIds = Array.from(
    new Set(productIds.map(normalizeProductId).filter(Boolean)),
  );

  if (!normalizedProductIds.length) {
    return [];
  }

  const results: Exclude<ProductOpenAlertNode, null>[] = [];

  for (const chunk of chunkItems(normalizedProductIds, PRODUCT_BATCH_SIZE)) {
    const data = await runAdminQuery<{ nodes: ProductOpenAlertNode[] }>(
      admin,
      `#graphql
        query OpenAlertProducts($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Product {
              id
              title
              status
              tags
              onlineStoreUrl
              openAtKst: metafield(namespace: "custom", key: "deal_open_at_kst") {
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
            }
          }
        }
      `,
      { ids: chunk },
    );

    results.push(
      ...data.nodes.filter((node): node is Exclude<ProductOpenAlertNode, null> => {
        return Boolean(node?.id);
      }),
    );
  }

  return results;
}

async function fetchCustomer(
  admin: AdminGraphqlClient,
  customerId: string,
) {
  const customerGid = customerId.startsWith("gid://")
    ? customerId
    : `gid://shopify/Customer/${customerId}`;

  const data = await runAdminQuery<{ customer: CustomerNode }>(
    admin,
    `#graphql
      query OpenAlertCustomer($id: ID!) {
        customer(id: $id) {
          id
          firstName
          email
        }
      }
    `,
    { id: customerGid },
  );

  return data.customer;
}

async function fetchAllScheduledProducts(admin: AdminGraphqlClient) {
  const products: Exclude<ProductOpenAlertNode, null>[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const data: {
      products: {
        pageInfo: {
          hasNextPage: boolean;
          endCursor: string | null;
        };
        nodes: ProductOpenAlertNode[];
      };
    } = await runAdminQuery<{
      products: {
        pageInfo: {
          hasNextPage: boolean;
          endCursor: string | null;
        };
        nodes: ProductOpenAlertNode[];
      };
    }>(
      admin,
      `#graphql
        query ScheduledProducts($cursor: String) {
          products(first: 250, after: $cursor) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              title
              status
              tags
              onlineStoreUrl
              openAtKst: metafield(namespace: "custom", key: "deal_open_at_kst") {
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
            }
          }
        }
      `,
      { cursor },
    );

    products.push(
      ...data.products.nodes.filter((node): node is Exclude<ProductOpenAlertNode, null> => {
        return Boolean(node?.id && node.openAtKst?.value);
      }),
    );

    hasNextPage = data.products.pageInfo.hasNextPage;
    cursor = data.products.pageInfo.endCursor;
  }

  return products;
}

export async function subscribeToUpcomingDealAlerts(params: {
  shop: string;
  customerId: string;
  productIds: string[];
}) {
  const shop = normalizeShop(params.shop);
  const customerId = normalizeCustomerId(params.customerId);
  const normalizedProductIds = Array.from(
    new Set(params.productIds.map(normalizeProductId).filter(Boolean)),
  );

  if (!shop || !customerId || !normalizedProductIds.length) {
    return [];
  }

  const existingRecords = await prisma.upcomingDealAlertSubscription.findMany({
    where: {
      shop,
      customerId,
      productId: {
        in: normalizedProductIds,
      },
    },
    select: { productId: true },
  });

  const existingSet = new Set(existingRecords.map((record) => record.productId));
  const createData = normalizedProductIds
    .filter((productId) => !existingSet.has(productId))
    .map((productId) => ({
      shop,
      customerId,
      productId,
    }));

  if (createData.length) {
    await prisma.upcomingDealAlertSubscription.createMany({
      data: createData,
    });
  }

  return normalizedProductIds;
}

export async function unsubscribeFromUpcomingDealAlerts(params: {
  shop: string;
  customerId: string;
  productIds: string[];
}) {
  const shop = normalizeShop(params.shop);
  const customerId = normalizeCustomerId(params.customerId);
  const normalizedProductIds = Array.from(
    new Set(params.productIds.map(normalizeProductId).filter(Boolean)),
  );

  if (!shop || !customerId || !normalizedProductIds.length) {
    return { count: 0 };
  }

  return prisma.upcomingDealAlertSubscription.deleteMany({
    where: {
      shop,
      customerId,
      productId: {
        in: normalizedProductIds,
      },
    },
  });
}

export async function getSubscribedUpcomingProductIds(params: {
  shop: string;
  customerId: string;
  productIds: string[];
}) {
  const shop = normalizeShop(params.shop);
  const customerId = normalizeCustomerId(params.customerId);
  const requestedProductIds = params.productIds
    .map((productId) => String(productId || "").trim())
    .filter(Boolean);

  if (!shop || !customerId || !requestedProductIds.length) {
    return [];
  }

  const normalizedRequestedProductIds = requestedProductIds
    .map((productId) => normalizeProductId(productId))
    .filter(Boolean);

  if (!normalizedRequestedProductIds.length) {
    return [];
  }

  const records = await prisma.upcomingDealAlertSubscription.findMany({
    where: {
      shop,
      customerId,
      productId: {
        in: normalizedRequestedProductIds,
      },
    },
    select: { productId: true },
  });

  const subscribedSet = new Set(records.map((record) => record.productId));

  return requestedProductIds.filter((productId, index, items) => {
    const normalizedProductId = normalizeProductId(productId);

    if (!normalizedProductId || !subscribedSet.has(normalizedProductId)) {
      return false;
    }

    return (
      items.findIndex((item) => normalizeProductId(item) === normalizedProductId) === index
    );
  });
}

export async function getUpcomingDealAdminSnapshots(params: {
  admin: AdminGraphqlClient;
  shop: string;
  limit?: number;
}) {
  const shop = normalizeShop(params.shop);
  const scheduledProducts = await fetchAllScheduledProducts(params.admin);
  const currentTimestamp = Date.now();

  const upcomingProducts = scheduledProducts
    .filter((product) => {
      const openAtKst = product.openAtKst?.value || "";
      const parsedTimestamp = Date.parse(openAtKst);

      return Number.isFinite(parsedTimestamp) && parsedTimestamp > currentTimestamp;
    })
    .sort((left, right) => {
      const leftTimestamp = Date.parse(left.openAtKst?.value || "");
      const rightTimestamp = Date.parse(right.openAtKst?.value || "");
      return leftTimestamp - rightTimestamp;
    });

  const limitedProducts = upcomingProducts.slice(0, params.limit || 10);
  const normalizedProductIds = limitedProducts.map((product) => product.id);

  if (!normalizedProductIds.length) {
    return [];
  }

  const subscriberCounts = await prisma.upcomingDealAlertSubscription.groupBy({
    by: ["productId"],
    where: {
      shop,
      productId: {
        in: normalizedProductIds,
      },
    },
    _count: {
      _all: true,
    },
  });

  const subscriberCountMap = new Map<string, number>(
    subscriberCounts.map((record): [string, number] => [
      record.productId,
      record._count._all,
    ]),
  );

  return limitedProducts.map<UpcomingDealAdminSnapshot>((product) => {
    const openAtKst = String(product.openAtKst?.value || "").trim();

    return {
      productId: product.id,
      legacyProductId: toLegacyProductId(product.id),
      title: product.title,
      status: product.status,
      openAtKst,
      hostName: getHostName(product),
      subscriberCount: subscriberCountMap.get(product.id) || 0,
    };
  });
}

export async function processDueOpenAlerts(params: {
  admin: AdminGraphqlClient;
  shop: string;
  productIds?: string[];
}) {
  const shop = normalizeShop(params.shop);
  const scopedProductIds = (params.productIds || [])
    .map((productId) => normalizeProductId(productId))
    .filter(Boolean);

  const subscriptions = await prisma.upcomingDealAlertSubscription.findMany({
    where: scopedProductIds.length
      ? {
          shop,
          productId: {
            in: scopedProductIds,
          },
        }
      : {
          shop,
        },
  });

  if (!subscriptions.length) {
    return {
      ok: true,
      processedProductCount: 0,
      sentCount: 0,
      cleanedCount: 0,
    };
  }

  const templateConfig = await loadFollowEmailTemplateConfigSafe(
    params.admin,
    shop,
  );
  const emailDeliveryRuntime = getEmailDeliveryRuntimeStatus();
  const shouldReserveLiveDelivery =
    emailDeliveryRuntime.provider !== "none" && emailDeliveryRuntime.mode === "live";

  const products = await fetchProductsByIds(
    params.admin,
    subscriptions.map((subscription) => subscription.productId),
  );
  const productMap = new Map(products.map((product) => [product.id, product]));
  const subscriptionsByProductId = new Map<string, UpcomingDealAlertSubscription[]>();

  subscriptions.forEach((subscription) => {
    const productSubscriptions =
      subscriptionsByProductId.get(subscription.productId) || [];
    productSubscriptions.push(subscription);
    subscriptionsByProductId.set(subscription.productId, productSubscriptions);
  });

  const customerCache = new Map<string, CustomerNode>();
  const currentTimestamp = Date.now();
  const cleanupIds = new Set<string>();
  let sentCount = 0;

  for (const [productId, productSubscriptions] of subscriptionsByProductId.entries()) {
    const product = productMap.get(productId);
    const openAtKst = String(product?.openAtKst?.value || "").trim();
    const openTimestamp = Date.parse(openAtKst);

    if (
      !product ||
      !openAtKst ||
      !Number.isFinite(openTimestamp) ||
      openTimestamp > currentTimestamp ||
      !isActiveProductStatus(product.status) ||
      !hasOnlineStoreUrl(product.onlineStoreUrl)
    ) {
      continue;
    }

    const productUrl = String(product.onlineStoreUrl || "").trim();

    for (const subscription of productSubscriptions) {
      try {
        let customer = customerCache.get(subscription.customerId) || null;
        if (!customerCache.has(subscription.customerId)) {
          customer = await fetchCustomer(params.admin, subscription.customerId);
          customerCache.set(subscription.customerId, customer);
        }

        if (!customer?.email) {
          continue;
        }

        // Keep open alerts idempotent per product/customer even if the product
        // record or subscription is touched again later.
        const notificationReservation = shouldReserveLiveDelivery
          ? await reserveNotificationSend({
              shop,
              customerId: subscription.customerId,
              influencerHandle: getInfluencerHandle(product),
              productId: product.id,
              notificationType: "UPCOMING_OPEN_ALERT",
            })
          : null;

        if (notificationReservation && !notificationReservation.reserved) {
          cleanupIds.add(subscription.id);
          continue;
        }

        try {
          const emailResult = await sendUpcomingOpenAlertEmail({
            to: customer.email,
            customerFirstName: customer.firstName || "",
            productTitle: product.title,
            productUrl,
            openAtLabel: formatOpenAtLabel(openAtKst),
            hostName: getHostName(product),
            shopName: templateConfig.shopName,
            templateSettings: templateConfig.settings,
          });

          if (emailResult.mode !== "log-only" && !emailResult.isTestOverride) {
            cleanupIds.add(subscription.id);
            sentCount += 1;
          } else {
            if (notificationReservation?.reserved) {
              await releaseNotificationSendReservation(notificationReservation);
            }
          }
        } catch (error) {
          if (notificationReservation?.reserved) {
            await releaseNotificationSendReservation(notificationReservation);
          }
          throw error;
        }
      } catch (error) {
        console.error("[open-alert] failed to deliver upcoming open alert email", {
          shop,
          productId: product.id,
          customerId: subscription.customerId,
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }
  }

  if (cleanupIds.size) {
    await prisma.upcomingDealAlertSubscription.deleteMany({
      where: {
        id: {
          in: Array.from(cleanupIds),
        },
      },
    });
  }

  return {
    ok: true,
    processedProductCount: subscriptionsByProductId.size,
    sentCount,
    cleanedCount: cleanupIds.size,
  };
}
