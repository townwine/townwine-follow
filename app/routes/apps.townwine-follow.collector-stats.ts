import type { LoaderFunctionArgs } from "react-router";
import { getCollectorStatsSnapshots } from "../services/collector-stats.server";
import { readCollectorStatsRequest } from "../services/follow-request.server";
import { resolveStorefrontAdmin } from "../services/storefront-admin.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const payload = await readCollectorStatsRequest(request);
  const requestedShop =
    payload.requestParams.get("shop") ||
    url.searchParams.get("shop") ||
    "";

  try {
    if (!payload.productIds.length && !payload.handles.length) {
      return Response.json({ snapshots: {} });
    }

    const adminContext = await resolveStorefrontAdmin({
      request,
      shop: requestedShop,
      required: true,
      logPrefix: "[collector-stats]",
    });

    const snapshots = await getCollectorStatsSnapshots({
      admin: adminContext.admin!,
      shop: adminContext.resolvedShop || adminContext.requestedShop,
      productIds: payload.productIds,
      handles: payload.handles,
    });

    const snapshotMap = snapshots.reduce<Record<string, typeof snapshots[number]>>(
      (result, snapshot) => {
        if (snapshot.productId) {
          result[snapshot.productId] = snapshot;
        }

        if (snapshot.legacyProductId) {
          result[snapshot.legacyProductId] = snapshot;
        }

        if (snapshot.handleKey) {
          result[snapshot.handleKey] = snapshot;
        }

        return result;
      },
      {},
    );

    return Response.json({
      snapshots: snapshotMap,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const debug = url.searchParams.get("debug") === "1";
    const message = error instanceof Error ? error.message : String(error);

    console.error("[collector-stats] request failed", {
      method: request.method,
      url: request.url,
      message,
      stack: error instanceof Error ? error.stack : undefined,
    });

    return Response.json(
      {
        snapshots: {},
        error: "COLLECTOR_STATS_FAILED",
        ...(debug ? { details: message } : {}),
      },
      { status: 500 },
    );
  }
}
