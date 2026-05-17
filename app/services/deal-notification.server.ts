import {
  getFollowersForInfluencer,
  markNotificationSent,
  wasNotificationSent,
} from "./follow.server";
import { sendNewDealEmail } from "./email.server";
import { resolveProductInfluencerHandle } from "./product-collector.server";

function toCustomerGid(customerId: string) {
  return customerId.startsWith("gid://")
    ? customerId
    : `gid://shopify/Customer/${customerId}`;
}

export async function processDealNotification(params: {
  admin: { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response> };
  shop: string;
  productId: string;
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
          tags
          onlineStoreUrl
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
  const influencerHandle = resolveProductInfluencerHandle({
    influencerHandle: product.metafield?.value,
    hostHandle: product.hostHandle?.value,
    hostName: product.hostName?.value,
    tags: Array.isArray(product.tags) ? product.tags : [],
  });
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

  const followers = await getFollowersForInfluencer({
    shop: params.shop,
    influencerHandle,
  });

  for (const follower of followers) {
    const alreadySent = await wasNotificationSent({
      shop: params.shop,
      customerId: follower.customerId,
      productId: params.productId,
      notificationType: "FOLLOW_NEW_DEAL",
    });

    if (alreadySent) continue;

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

    if (!customer?.email) continue;

    await sendNewDealEmail({
      to: customer.email,
      customerFirstName: customer.firstName || "",
      influencerName: follower.influencerName || influencerHandle,
      productTitle: product.title,
      productUrl,
      openAtLabel,
      isUpcoming,
    });

    await markNotificationSent({
      shop: params.shop,
      customerId: follower.customerId,
      influencerHandle,
      productId: params.productId,
      notificationType: "FOLLOW_NEW_DEAL",
    });
  }

  return { ok: true };
}
