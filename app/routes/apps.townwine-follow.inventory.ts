import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { readInventoryRequest } from "../services/follow-request.server";
import { getInventorySnapshots } from "../services/inventory.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);

  try {
    const { admin } = await authenticate.public.appProxy(request);
    const shop = url.searchParams.get("shop");
    const payload = await readInventoryRequest(request);

    if (!admin || !shop || !payload.variantIds.length) {
      return Response.json({ snapshots: {} });
    }

    const snapshots = await getInventorySnapshots({
      admin,
      variantIds: payload.variantIds,
    });

    const snapshotMap = snapshots.reduce<Record<string, typeof snapshots[number]>>(
      (result, snapshot) => {
        result[snapshot.variantId] = snapshot;

        if (snapshot.legacyVariantId) {
          result[snapshot.legacyVariantId] = snapshot;
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
    console.error("[inventory] snapshot request failed", {
      method: request.method,
      url: request.url,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return Response.json(
      {
        snapshots: {},
        error: "INVENTORY_SNAPSHOT_FAILED",
      },
      { status: 500 },
    );
  }
}
