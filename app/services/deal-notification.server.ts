import {
  getFollowersForInfluencerAliases,
  markNotificationSent,
  normalizeInfluencerHandle,
  wasNotificationSent,
} from "./follow.server";
import { sendNewDealEmail } from "./email.server";
import {
  expandInfluencerAliasesWithCollectorProfiles,
  expandKnownInfluencerAliasesWithCollectorProfiles,
} from "./collector-aliases.server";
import {
  collectProductInfluencerAliases,
  resolveProductInfluencerHandle,
} from "./product-collector.server";
import { isSellableProductStatus } from "./product-status.server";
import { loadFollowEmailTemplateConfigSafe } from "./follow-email-template.server";

function toCustomerGid(customerId: string) {
  return customerId.startsWith("gid://")
    ? customerId
    : `gid://shopify/Customer/${customerId}`;
}

function maskEmailAddress(value: string) {
  const email = String(value || "").trim();
  const [localPart, domainPart] = email.split("@");

  if (!localPart || !domainPart) {
    return email;
  }

  if (localPart.length <= 2) {
    return `${localPart[0] || "*"}*@${domainPart}`;
  }

  return `${localPart.slice(0, 2)}***@${domainPart}`;
}

function logSkippedFollowerEmail(params: {
  shop: string;
  productId: string;
  followerCustomerId: string;
  influencerHandle: string;
  reason: string;
  email?: string | null;
  detail?: Record<string, unknown>;
}) {
  console.info("[follow-notification] skipped new deal email", {
    shop: params.shop,
    productId: params.productId,
    followerCustomerId: params.followerCustomerId,
    influencerHandle: params.influencerHandle,
    reason: params.reason,
    email: params.email ? maskEmailAddress(params.email) : "",
    ...(params.detail || {}),
  });
}

async function buildEffectiveInfluencerAliases(params: {
  admin: { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response> };
  shop: string;
  aliases: string[];
  tags: string[];
}) {
  const expandedAliases = await expandInfluencerAliasesWithCollectorProfiles({
    admin: params.admin,
    shop: params.shop,
    aliases: params.aliases,
  });
  const knownTagAliases = await expandKnownInfluencerAliasesWithCollectorProfiles({
    admin: params.admin,
    shop: params.shop,
    aliases: params.tags,
  });

  return Array.from(
    new Set(
      [
        ...knownTagAliases,
        ...(expandedAliases.length ? expandedAliases : params.aliases),
      ]
        .map((alias) => normalizeInfluencerHandle(String(alias || "")))
        .filter(Boolean),
    ),
  );
}

export async function processDealNotification(params: {
  admin: { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response> };
  shop: string;
  productId: string;
  resolvedInfluencerHandle?: string;
  resolvedInfluencerName?: string;
}) {
  function formatOpenAtLabel(value: string) {
    const parsedDate = new Date(value);

    if (Number.isNaN(parsedDate.getTime())) {
      return value;
    }

    const month = String(parsedDate.getUTCMonth() + 1).padStart(2, "0");
    const day = String(parsedDate.getUTCDate()).padStart(2, "0");
    const hour = String(parsedDate.getUTCHours()).padStart(2, "0");
    const minute = String(parsedDate.getUTCMinutes()).padStart(2, "0");

    return `${month}월 ${day}일 ${hour}:${minute}`;
  }

  const response = await params.admin.graphql(
    `#graphql
      query FollowNotificationProduct($id: ID!) {
        product(id: $id) {
          id
          handle
          title
          status
          vendor
          tags
          onlineStoreUrl
          collectorTag: metafield(namespace: "custom", key: "collector_tag") {
            value
          }
          metafield(namespace: "custom", key: "influencer_handle") {
            value
          }
          hostHandle: metafield(namespace: "custom", key: "host_handle") {
            value
          }
          hostName: metafield(namespace: "custom", key: "host_name") {
            value
          }
          openAtKst: metafield(namespace: "custom", key: "deal_open_at_kst") {
            value
          }
        }
      }
    `,
    { variables: { id: params.productId } },
  );

  const result = await response.json();
  const product = result.data?.product;

  if (!product || !isSellableProductStatus(product.status)) {
    return { ok: true, skipped: "PRODUCT_NOT_ACTIVE" };
  }

  const scheduledOpenAt = product.openAtKst?.value ? Date.parse(product.openAtKst.value) : NaN;
  const influencerAliases = collectProductInfluencerAliases(
    {
      collectorTag: product.collectorTag?.value,
      influencerHandle:
        String(params.resolvedInfluencerHandle || "").trim() || product.metafield?.value,
      hostHandle: product.hostHandle?.value,
      hostName:
        String(params.resolvedInfluencerName || "").trim() || product.hostName?.value,
      vendor: product.vendor,
      tags: Array.isArray(product.tags) ? product.tags : [],
    },
    { includeNameFallback: true },
  );
  const effectiveInfluencerAliases = await buildEffectiveInfluencerAliases({
    admin: params.admin,
    shop: params.shop,
    aliases: influencerAliases,
    tags: Array.isArray(product.tags) ? product.tags : [],
  });
  const influencerHandle =
    effectiveInfluencerAliases[0] ||
    influencerAliases[0] ||
    resolveProductInfluencerHandle(
      {
        collectorTag: product.collectorTag?.value,
        influencerHandle: product.metafield?.value,
        hostHandle: product.hostHandle?.value,
        hostName: product.hostName?.value,
        vendor: product.vendor,
        tags: Array.isArray(product.tags) ? product.tags : [],
      },
      { includeNameFallback: true },
    );
  if (!influencerHandle) {
    return { ok: true, skipped: "NO_INFLUENCER_HANDLE" };
  }

  const productUrl =
    product.onlineStoreUrl ||
    (product.handle ? `https://${params.shop}/products/${product.handle}` : "");
  const isUpcoming = Number.isFinite(scheduledOpenAt) && scheduledOpenAt > Date.now();
  const openAtLabel =
    isUpcoming && product.openAtKst?.value
      ? formatOpenAtLabel(product.openAtKst.value)
      : "";

  const followers = await getFollowersForInfluencerAliases({
    shop: params.shop,
    aliases: effectiveInfluencerAliases.length
      ? effectiveInfluencerAliases
      : influencerAliases.length
        ? influencerAliases
        : [influencerHandle],
  });

  if (!followers.length) {
    return {
      ok: true,
      skipped: "NO_FOLLOWERS",
      influencerHandle,
      influencerAliases: effectiveInfluencerAliases.length
        ? effectiveInfluencerAliases
        : influencerAliases,
    };
  }

  const templateConfig = await loadFollowEmailTemplateConfigSafe(
    params.admin,
    params.shop,
  );

  let sentCount = 0;
  let logOnlyCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const failedDeliveries: Array<{
    customerId: string;
    email: string;
    message: string;
  }> = [];

  for (const follower of followers) {
    try {
      const alreadySent = await wasNotificationSent({
        shop: params.shop,
        customerId: follower.customerId,
        productId: params.productId,
        notificationType: "FOLLOW_NEW_DEAL",
        invalidateBefore: follower.updatedAt,
      });

      if (alreadySent) {
        skippedCount += 1;
        logSkippedFollowerEmail({
          shop: params.shop,
          productId: params.productId,
          followerCustomerId: follower.customerId,
          influencerHandle,
          reason: "ALREADY_SENT",
          email: follower.customerEmail,
          detail: {
            followerUpdatedAt: follower.updatedAt.toISOString(),
          },
        });
        continue;
      }

      let customerEmail = String(follower.customerEmail || "").trim();
      let customerFirstName = String(follower.customerFirstName || "").trim();

      if (!customerEmail) {
        const customerResponse = await params.admin.graphql(
          `#graphql
            query FollowNotificationCustomer($id: ID!) {
              customer(id: $id) {
                id
                firstName
                email
              }
            }
          `,
          { variables: { id: toCustomerGid(follower.customerId) } },
        );

        const customerResult = await customerResponse.json();
        const customer = customerResult.data?.customer;
        customerEmail = String(customer?.email || "").trim();
        customerFirstName =
          customerFirstName || String(customer?.firstName || "").trim();
      }

      if (!customerEmail) {
        skippedCount += 1;
        logSkippedFollowerEmail({
          shop: params.shop,
          productId: params.productId,
          followerCustomerId: follower.customerId,
          influencerHandle,
          reason: "MISSING_CUSTOMER_EMAIL",
          email: follower.customerEmail,
        });
        continue;
      }

      const emailResult = await sendNewDealEmail({
        to: customerEmail,
        customerFirstName,
        influencerName:
          follower.influencerName ||
          String(params.resolvedInfluencerName || "").trim() ||
          product.hostName?.value ||
          product.collectorTag?.value ||
          influencerHandle,
        productTitle: product.title,
        productUrl,
        openAtLabel,
        isUpcoming,
        shopName: templateConfig.shopName,
        templateSettings: templateConfig.settings,
      });

      if (emailResult.mode !== "log-only" && !emailResult.isTestOverride) {
        const notificationLog = await markNotificationSent({
          shop: params.shop,
          customerId: follower.customerId,
          influencerHandle,
          productId: params.productId,
          notificationType: "FOLLOW_NEW_DEAL",
        });

        if (notificationLog.created || notificationLog.updated) {
          sentCount += 1;
        } else {
          skippedCount += 1;
          logSkippedFollowerEmail({
            shop: params.shop,
            productId: params.productId,
            followerCustomerId: follower.customerId,
            influencerHandle,
            reason: "NOTIFICATION_LOG_ALREADY_EXISTS",
            email: customerEmail,
            detail: {
              notificationType: "FOLLOW_NEW_DEAL",
            },
          });
        }
      } else {
        logOnlyCount += 1;
      }
    } catch (error) {
      failedCount += 1;
      failedDeliveries.push({
        customerId: follower.customerId,
        email: maskEmailAddress(String(follower.customerEmail || "")),
        message: error instanceof Error ? error.message : String(error),
      });
      console.error("[follow-notification] failed to deliver new deal email", {
        shop: params.shop,
        productId: params.productId,
        followerCustomerId: follower.customerId,
        influencerHandle,
        influencerAliases: effectiveInfluencerAliases.length
          ? effectiveInfluencerAliases
          : influencerAliases,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }

  return {
    ok: true,
    influencerHandle,
    influencerAliases: effectiveInfluencerAliases.length
      ? effectiveInfluencerAliases
      : influencerAliases,
    followerCount: followers.length,
    sentCount,
    logOnlyCount,
    skippedCount,
    failedCount,
    failedDeliveries,
  };
}

type ActiveFollowNotificationProductNode = {
  id: string;
  status: string;
  vendor: string | null;
  tags: string[];
  collectorTag: { value: string | null } | null;
  influencerHandle: { value: string | null } | null;
  hostHandle: { value: string | null } | null;
  hostName: { value: string | null } | null;
} | null;

type ActiveFollowNotificationProductsQueryResponse = {
  products: {
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
    nodes: ActiveFollowNotificationProductNode[];
  };
};

async function fetchActiveFollowNotificationProducts(params: {
  admin: { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response> };
}) {
  const products: Array<Exclude<ActiveFollowNotificationProductNode, null>> = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response = await params.admin.graphql(
      `#graphql
        query ActiveFollowNotificationProducts($cursor: String) {
          products(first: 250, after: $cursor) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              status
              vendor
              tags
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
      { variables: { cursor } },
    );

    const result = await response.json();
    const connection = result.data?.products;

    if (!connection) {
      break;
    }

    products.push(
      ...connection.nodes.filter(
        (node: ActiveFollowNotificationProductNode): node is Exclude<ActiveFollowNotificationProductNode, null> =>
          Boolean(node?.id && isSellableProductStatus(node.status)),
      ),
    );

    hasNextPage = Boolean(connection.pageInfo?.hasNextPage);
    cursor = connection.pageInfo?.endCursor || null;
  }

  return products;
}

export async function processFollowNotificationCatchup(params: {
  admin: { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response> };
  shop: string;
  handles: string[];
}) {
  const requestedAliases = Array.from(
    new Set(
      params.handles
        .map((handle) => normalizeInfluencerHandle(String(handle || "")))
        .filter(Boolean),
    ),
  );

  if (!requestedAliases.length) {
    return {
      ok: true,
      processedProductCount: 0,
      matchedProductCount: 0,
      sentCount: 0,
    };
  }

  const expandedRequestedAliases = await expandInfluencerAliasesWithCollectorProfiles({
    admin: params.admin,
    shop: params.shop,
    aliases: requestedAliases,
  });
  const aliasSet = new Set(
    expandedRequestedAliases.length ? expandedRequestedAliases : requestedAliases,
  );
  const products = await fetchActiveFollowNotificationProducts({
    admin: params.admin,
  });
  const matchedProducts = [];

  for (const product of products) {
    const aliases = collectProductInfluencerAliases(
      {
        collectorTag: product.collectorTag?.value,
        influencerHandle: product.influencerHandle?.value,
        hostHandle: product.hostHandle?.value,
        hostName: product.hostName?.value,
        vendor: product.vendor,
        tags: Array.isArray(product.tags) ? product.tags : [],
      },
      { includeNameFallback: true },
    );
    const effectiveAliases = await buildEffectiveInfluencerAliases({
      admin: params.admin,
      shop: params.shop,
      aliases,
      tags: Array.isArray(product.tags) ? product.tags : [],
    });

    if (effectiveAliases.some((alias) => aliasSet.has(alias))) {
      matchedProducts.push(product);
    }
  }

  let sentCount = 0;
  let logOnlyCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let followerCount = 0;

  for (const product of matchedProducts) {
    const notification = await processDealNotification({
      admin: params.admin,
      shop: params.shop,
      productId: product.id,
      resolvedInfluencerHandle: product.influencerHandle?.value || "",
      resolvedInfluencerName: product.hostName?.value || "",
    });

    sentCount += Number(notification && "sentCount" in notification ? notification.sentCount || 0 : 0);
    logOnlyCount += Number(notification && "logOnlyCount" in notification ? notification.logOnlyCount || 0 : 0);
    skippedCount += Number(notification && "skippedCount" in notification ? notification.skippedCount || 0 : 0);
    failedCount += Number(notification && "failedCount" in notification ? notification.failedCount || 0 : 0);
    followerCount += Number(notification && "followerCount" in notification ? notification.followerCount || 0 : 0);
  }

  return {
    ok: true,
    processedProductCount: products.length,
    matchedProductCount: matchedProducts.length,
    followerCount,
    sentCount,
    logOnlyCount,
    skippedCount,
    failedCount,
  };
}
