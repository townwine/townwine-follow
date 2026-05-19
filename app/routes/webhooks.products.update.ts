import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { processProductWebhookEvent } from "../services/product-webhook-processing.server";

export async function action({ request }: ActionFunctionArgs) {
  const { admin, topic, shop, payload } = await authenticate.webhook(request);

  if (topic !== "PRODUCTS_UPDATE") {
    return Response.json({ ok: true });
  }

  if (!admin) {
    return Response.json({ ok: true, skipped: "NO_ADMIN_CLIENT" });
  }

  const productId =
    typeof payload?.admin_graphql_api_id === "string" &&
    payload.admin_graphql_api_id.trim()
      ? payload.admin_graphql_api_id.trim()
      : payload?.id
        ? `gid://shopify/Product/${payload.id}`
        : "";

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

  const result = await processProductWebhookEvent({
    admin,
    shop,
    productId,
  });

  return Response.json(result);
}
