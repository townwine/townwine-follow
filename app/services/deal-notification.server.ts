import {
  getFollowersForInfluencerAliases,
  normalizeInfluencerHandle,
  releaseNotificationSendReservation,
  reserveNotificationSend,
} from "./follow.server";
import {
  getEmailDeliveryRuntimeStatus,
  sendNewDealEmail,
} from "./email.server";
import {
  expandInfluencerAliasesWithCollectorProfiles,
  expandKnownInfluencerAliasesWithCollectorProfiles,
} from "./collector-aliases.server";
import { collectProductInfluencerAliases } from "./product-collector.server";
import { formatOpenAtLabel } from "./open-at-label.server";
import {
  hasOnlineStoreUrl,
  isActiveProductStatus,
} from "./product-status.server";
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

function hasCollectorTag(value: string | null | undefined) {
  return Boolean(String(value || "").trim());
}

function collectNotificationInfluencerAliases(source: {
  collectorTag?: string | null;
  influencerHandle?: string | null;
  hostHandle?: string | null;
  tags?: string[] | null;
}) {
  const collectorTagAlias = normalizeInfluencerHandle(
    String(source.collectorTag || ""),
  );
  const explicitAliases = collectProductInfluencerAliases(
    {
      collectorTag: source.collectorTag,
      influencerHandle: source.influencerHandle,
      hostHandle: source.hostHandle,
      tags: source.tags,
    },
    { includeNameFallback: false },
  );

  return Array.from(
    new Set([collectorTagAlias, ...explicitAliases].filter(Boolean)),
  );
}

export async function processDealNotification(params: {
  admin: { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response> };
  shop: string;
  productId: string;
  resolvedInfluencerHandle?: string;
  resolvedInfluencerName?: string;
}) {
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

  if (!product || !isActiveProductStatus(product.status)) {
    return { ok: true, skipped: "PRODUCT_NOT_ACTIVE" };
  }

  if (!hasOnlineStoreUrl(product.onlineStoreUrl)) {
    return { ok: true, skipped: "PRODUCT_NOT_PUBLISHED" };
  }

  if (!hasCollectorTag(product.collectorTag?.value)) {
    return { ok: true, skipped: "NO_COLLECTOR_TAG" };
  }

  const scheduledOpenAt = product.openAtKst?.value ? Date.parse(product.openAtKst.value) : NaN;
  const influencerAliases = collectNotificationInfluencerAliases(
    {
      collectorTag: product.collectorTag?.value,
      influencerHandle:
        String(params.resolvedInfluencerHandle || "").trim() || product.metafield?.value,
      hostHandle: product.hostHandle?.value,
      tags: Array.isArray(product.tags) ? product.tags : [],
    },
  );
  const effectiveInfluencerAliases = await buildEffectiveInfluencerAliases({
    admin: params.admin,
    shop: params.shop,
    aliases: influencerAliases,
    tags: Array.isArray(product.tags) ? product.tags : [],
  });
  const explicitInfluencerHandle = normalizeInfluencerHandle(
    String(params.resolvedInfluencerHandle || "").trim() || product.metafield?.value || "",
  );
  const influencerHandle =
    explicitInfluencerHandle ||
    effectiveInfluencerAliases[0] ||
    influencerAliases[0];
  if (!influencerHandle) {
    return { ok: true, skipped: "NO_INFLUENCER_HANDLE" };
  }

  const productUrl = String(product.onlineStoreUrl || "").trim();
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
  const emailDeliveryRuntime = getEmailDeliveryRuntimeStatus();
  const shouldReserveLiveDelivery =
    emailDeliveryRuntime.provider !== "none" && emailDeliveryRuntime.mode === "live";

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

      // Per-product rule: once a customer receives this deal email, later
      // product edits or follow refreshes must not reopen delivery.
      const notificationReservation = shouldReserveLiveDelivery
        ? await reserveNotificationSend({
            shop: params.shop,
            customerId: follower.customerId,
            influencerHandle,
            productId: params.productId,
            notificationType: "FOLLOW_NEW_DEAL",
          })
        : null;

      if (notificationReservation && !notificationReservation.reserved) {
        skippedCount += 1;
        logSkippedFollowerEmail({
          shop: params.shop,
          productId: params.productId,
          followerCustomerId: follower.customerId,
          influencerHandle,
          reason: notificationReservation.reason,
          email: customerEmail,
        });
        continue;
      }

      try {
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
          sentCount += 1;
        } else {
          if (notificationReservation?.reserved) {
            await releaseNotificationSendReservation(notificationReservation);
          }
          logOnlyCount += 1;
        }
      } catch (error) {
        if (notificationReservation?.reserved) {
          await releaseNotificationSendReservation(notificationReservation);
        }
        throw error;
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
  onlineStoreUrl: string | null;
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
              onlineStoreUrl
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
          Boolean(
            node?.id &&
              hasCollectorTag(node.collectorTag?.value) &&
              isActiveProductStatus(node.status) &&
              hasOnlineStoreUrl(node.onlineStoreUrl),
          ),
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
    const aliases = collectNotificationInfluencerAliases(
      {
        collectorTag: product.collectorTag?.value,
        influencerHandle: product.influencerHandle?.value,
        hostHandle: product.hostHandle?.value,
        tags: Array.isArray(product.tags) ? product.tags : [],
      },
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
