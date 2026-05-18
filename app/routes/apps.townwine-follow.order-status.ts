import type { LoaderFunctionArgs } from "react-router";
import { readOrderStatusRequest } from "../services/follow-request.server";
import { getOrderStatusSnapshots } from "../services/order-status.server";
import { resolveStorefrontAdmin } from "../services/storefront-admin.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);

  try {
    const requestedShop = url.searchParams.get("shop") || "";
    const customerId = url.searchParams.get("logged_in_customer_id") || "";
    const payload = await readOrderStatusRequest(request);

    if (!payload.orderIds.length) {
      return Response.json({
        statuses: {},
        loggedIn: Boolean(customerId),
      });
    }

    const adminContext = await resolveStorefrontAdmin({
      request,
      shop: requestedShop,
      required: false,
      logPrefix: "[order-status]",
    });

    if (!adminContext.admin) {
      return Response.json({
        statuses: {},
        loggedIn: Boolean(customerId),
      });
    }

    if (!customerId) {
      return Response.json({
        statuses: {},
        loggedIn: false,
      });
    }

    const snapshots = await getOrderStatusSnapshots({
      admin: adminContext.admin,
      orderIds: payload.orderIds,
      customerId,
    });

    const statusMap = snapshots.reduce<Record<string, typeof snapshots[number]>>(
      (result, snapshot) => {
        result[snapshot.orderId] = snapshot;
        return result;
      },
      {},
    );

    return Response.json({
      statuses: statusMap,
      loggedIn: true,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[order-status] request failed", {
      method: request.method,
      url: request.url,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return Response.json(
      {
        statuses: {},
        loggedIn: false,
        error: "ORDER_STATUS_FAILED",
      },
      { status: 500 },
    );
  }
}
