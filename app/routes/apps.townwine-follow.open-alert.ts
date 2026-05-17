import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { readOpenAlertMutationRequest } from "../services/follow-request.server";
import {
  processDueOpenAlerts,
  subscribeToUpcomingDealAlerts,
} from "../services/open-alert.server";

async function handleSubscribeRequest(request: Request) {
  const url = new URL(request.url);

  try {
    const { admin } = await authenticate.public.appProxy(request);
    const shop = url.searchParams.get("shop");
    const customerId = url.searchParams.get("logged_in_customer_id");

    if (!shop || !customerId) {
      return Response.json({ ok: false, message: "LOGIN_REQUIRED" }, { status: 401 });
    }

    const payload = await readOpenAlertMutationRequest(request);

    if (!payload.productIds.length) {
      return Response.json({ ok: false, message: "PRODUCT_ID_REQUIRED" }, { status: 422 });
    }

    const subscribedProductIds = await subscribeToUpcomingDealAlerts({
      shop,
      customerId,
      productIds: payload.productIds,
    });

    if (admin) {
      await processDueOpenAlerts({
        admin,
        shop,
        productIds: subscribedProductIds,
      });
    }

    return Response.json({
      ok: true,
      subscribed: true,
      productIds: payload.productIds,
    });
  } catch (error) {
    console.error("[open-alert] subscribe request failed", {
      method: request.method,
      url: request.url,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return Response.json(
      { ok: false, message: "OPEN_ALERT_SUBSCRIBE_FAILED" },
      { status: 500 },
    );
  }
}

export async function action({ request }: ActionFunctionArgs) {
  return handleSubscribeRequest(request);
}

export async function loader({ request }: LoaderFunctionArgs) {
  return handleSubscribeRequest(request);
}
