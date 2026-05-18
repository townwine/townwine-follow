import type { LoaderFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";
import { getCollectorStatsSnapshots } from "../services/collector-stats.server";
import { readCollectorStatsRequest } from "../services/follow-request.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const payload = await readCollectorStatsRequest(request);
  const shop =
    payload.requestParams.get("shop") ||
    url.searchParams.get("shop") ||
    "";

  try {
    if (!shop || (!payload.productIds.length && !payload.handles.length)) {
      return Response.json({ snapshots: {} });
    }

    let admin:
      | Awaited<ReturnType<typeof unauthenticated.admin>>["admin"]
      | null = null;

    try {
      const authenticatedContext = await authenticate.public.appProxy(request);
      admin = authenticatedContext.admin ?? null;
    } catch (error) {
      console.warn("[collector-stats] app proxy auth failed, using offline admin", {
        shop,
        method: request.method,
        url: request.url,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    if (!admin) {
      const offlineContext = await unauthenticated.admin(shop);
      admin = offlineContext.admin;
    }

    const snapshots = await getCollectorStatsSnapshots({
      admin,
      shop,
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
