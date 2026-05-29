import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { invalidateLatestDealsCache } from "../services/latest-deals.server";
import { processProductWebhookEvent } from "../services/product-webhook-processing.server";
import { recordWebhookEvent } from "../services/webhook-observability.server";

export async function action({ request }: ActionFunctionArgs) {
  const { admin, topic, shop, payload } = await authenticate.webhook(request);

  if (topic !== "PRODUCTS_UPDATE") {
    return Response.json({ ok: true });
  }

  const productId =
    typeof payload?.admin_graphql_api_id === "string" &&
    payload.admin_graphql_api_id.trim()
      ? payload.admin_graphql_api_id.trim()
      : payload?.id
        ? `gid://shopify/Product/${payload.id}`
        : "";

  recordWebhookEvent({
    timestamp: new Date().toISOString(),
    topic,
    shop,
    productId,
    adminAvailable: Boolean(admin),
    skipped: !admin ? "NO_ADMIN_CLIENT" : !productId ? "MISSING_PRODUCT_ID" : "",
  });

  if (!admin) {
    return Response.json({ ok: true, skipped: "NO_ADMIN_CLIENT" });
  }

  if (!productId) {
    console.warn("[webhooks] products/update missing product id", {
      shop,
      topic,
      payload,
    });
    return Response.json({ ok: true, skipped: "MISSING_PRODUCT_ID" });
  }

  console.info("[webhooks] processing products/update", {
    shop,
    productId,
  });

  invalidateLatestDealsCache(shop);

  const result = await processProductWebhookEvent({
    admin,
    shop,
    productId,
  });

  return Response.json(result);
}
