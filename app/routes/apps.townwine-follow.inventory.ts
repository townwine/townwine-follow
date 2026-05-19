import type { LoaderFunctionArgs } from "react-router";
import { readInventoryRequest } from "../services/follow-request.server";
import { getInventorySnapshots } from "../services/inventory.server";
import { resolveStorefrontAdmin } from "../services/storefront-admin.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);

  try {
    const requestedShop = url.searchParams.get("shop") || "";
    const payload = await readInventoryRequest(request);

    if (!payload.variantIds.length) {
      return Response.json({ snapshots: {} });
    }

    const adminContext = await resolveStorefrontAdmin({
      request,
      shop: requestedShop,
      required: false,
      logPrefix: "[inventory]",
    });

    if (!adminContext.admin) {
      return Response.json({ snapshots: {} });
    }

    const snapshots = await getInventorySnapshots({
      admin: adminContext.admin,
      shop: adminContext.resolvedShop || requestedShop,
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
