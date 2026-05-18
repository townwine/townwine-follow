import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { processProductWebhookEvent } from "../services/product-webhook-processing.server";

export async function action({ request }: ActionFunctionArgs) {
  const { admin, topic, shop } = await authenticate.webhook(request);

  if (topic !== "PRODUCTS_CREATE") {
    return Response.json({ ok: true });
  }

  if (!admin) {
    return Response.json({ ok: true, skipped: "NO_ADMIN_CLIENT" });
  }

  const payload = await request.json();
  const productId = `gid://shopify/Product/${payload.id}`;
  const result = await processProductWebhookEvent({
    admin,
    shop,
    productId,
  });

  return Response.json(result);
}
