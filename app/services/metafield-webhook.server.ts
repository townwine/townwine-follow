import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { processProductWebhookEvent } from "./product-webhook-processing.server";

const RELEVANT_PRODUCT_METAFIELD_KEYS = new Set([
  "collector_tag",
  "influencer_handle",
  "host_handle",
  "host_name",
  "deal_open_at_kst",
]);

type MetafieldWebhookPayload = {
  owner_id?: string | number | null;
  owner_resource?: string | null;
  namespace?: string | null;
  key?: string | null;
};

function toProductGid(value: string | number | null | undefined) {
  const normalizedValue = String(value || "").trim();

  if (!normalizedValue) {
    return "";
  }

  return normalizedValue.startsWith("gid://")
    ? normalizedValue
    : `gid://shopify/Product/${normalizedValue}`;
}

export async function handleMetafieldWebhookAction(
  { request }: ActionFunctionArgs,
  expectedTopic: "METAFIELDS_CREATE" | "METAFIELDS_UPDATE",
) {
  const { admin, topic, shop, payload } = await authenticate.webhook(request);

  if (topic !== expectedTopic) {
    return Response.json({ ok: true });
  }

  if (!admin) {
    return Response.json({ ok: true, skipped: "NO_ADMIN_CLIENT" });
  }

  const metafieldPayload = (payload || {}) as MetafieldWebhookPayload;
  const ownerResource = String(metafieldPayload.owner_resource || "")
    .trim()
    .toLowerCase();
  const namespace = String(metafieldPayload.namespace || "")
    .trim()
    .toLowerCase();
  const key = String(metafieldPayload.key || "")
    .trim()
    .toLowerCase();

  if (ownerResource !== "product") {
    return Response.json({ ok: true, skipped: "NON_PRODUCT_OWNER" });
  }

  if (namespace !== "custom" || !RELEVANT_PRODUCT_METAFIELD_KEYS.has(key)) {
    return Response.json({
      ok: true,
      skipped: "IRRELEVANT_METAFIELD",
      ownerResource,
      namespace,
      key,
    });
  }

  const productId = toProductGid(metafieldPayload.owner_id);

  if (!productId) {
    console.warn("[webhooks] metafield webhook missing product owner id", {
      shop,
      topic,
      payload,
    });
    return Response.json({ ok: true, skipped: "MISSING_PRODUCT_ID" });
  }

  console.info("[webhooks] processing product metafield webhook", {
    shop,
    topic,
    productId,
    namespace,
    key,
  });

  const result = await processProductWebhookEvent({
    admin,
    shop,
    productId,
  });

  return Response.json(result);
}
