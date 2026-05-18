import {
  getFollowersForInfluencerAliases,
  markNotificationSent,
  wasNotificationSent,
} from "./follow.server";
import { sendNewDealEmail } from "./email.server";
import {
  collectProductInfluencerAliases,
  resolveProductInfluencerHandle,
} from "./product-collector.server";

function toCustomerGid(customerId: string) {
  return customerId.startsWith("gid://")
    ? customerId
    : `gid://shopify/Customer/${customerId}`;
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

  if (!product || product.status !== "ACTIVE") {
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
  const influencerHandle =
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
    aliases: influencerAliases.length ? influencerAliases : [influencerHandle],
  });

  if (!followers.length) {
    return {
      ok: true,
      skipped: "NO_FOLLOWERS",
      influencerHandle,
      influencerAliases,
    };
  }

  let sentCount = 0;
  let logOnlyCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const follower of followers) {
    try {
      const alreadySent = await wasNotificationSent({
        shop: params.shop,
        customerId: follower.customerId,
        productId: params.productId,
        notificationType: "FOLLOW_NEW_DEAL",
      });

      if (alreadySent) {
        skippedCount += 1;
        continue;
      }

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

      if (!customer?.email) {
        skippedCount += 1;
        continue;
      }

      const emailResult = await sendNewDealEmail({
        to: customer.email,
        customerFirstName: customer.firstName || "",
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
      });

      if (emailResult.mode === "resend") {
        await markNotificationSent({
          shop: params.shop,
          customerId: follower.customerId,
          influencerHandle,
          productId: params.productId,
          notificationType: "FOLLOW_NEW_DEAL",
        });
        sentCount += 1;
      } else {
        logOnlyCount += 1;
      }
    } catch (error) {
      failedCount += 1;
      console.error("[follow-notification] failed to deliver new deal email", {
        shop: params.shop,
        productId: params.productId,
        followerCustomerId: follower.customerId,
        influencerHandle,
        influencerAliases,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }

  return {
    ok: true,
    influencerHandle,
    influencerAliases,
    followerCount: followers.length,
    sentCount,
    logOnlyCount,
    skippedCount,
    failedCount,
  };
}
