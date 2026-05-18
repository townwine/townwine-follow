import type { LoaderFunctionArgs } from "react-router";
import { readOpenAlertStatusRequest } from "../services/follow-request.server";
import {
  getSubscribedUpcomingProductIds,
  processDueOpenAlerts,
} from "../services/open-alert.server";
import { resolveStorefrontAdmin } from "../services/storefront-admin.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);

  try {
    const requestedShop = url.searchParams.get("shop") || "";
    const customerId = url.searchParams.get("logged_in_customer_id");
    const payload = await readOpenAlertStatusRequest(request);
    const adminContext = await resolveStorefrontAdmin({
      request,
      shop: requestedShop,
      required: false,
      logPrefix: "[open-alert]",
    });
    const shop = adminContext.resolvedShop || adminContext.requestedShop;

    if (adminContext.admin && shop) {
      await processDueOpenAlerts({
        admin: adminContext.admin,
        shop,
      });
    }

    if (!shop || !payload.productIds.length) {
      return Response.json({
        subscribedProductIds: [],
        loggedIn: Boolean(customerId),
      });
    }

    if (!customerId) {
      return Response.json({
        subscribedProductIds: [],
        loggedIn: false,
      });
    }

    const subscribedProductIds = await getSubscribedUpcomingProductIds({
      shop,
      customerId,
      productIds: payload.productIds,
    });

    return Response.json({
      subscribedProductIds,
      loggedIn: true,
    });
  } catch (error) {
    console.error("[open-alert] status request failed", {
      method: request.method,
      url: request.url,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return Response.json(
      {
        subscribedProductIds: [],
        loggedIn: false,
      },
      { status: 500 },
    );
  }
}
