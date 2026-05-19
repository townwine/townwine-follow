import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate, registerWebhooks } from "../shopify.server";
import { ensureProductMetafieldDefinitions } from "../services/product-metafield-definitions.server";
import {
  getProductCollectorAdminState,
  saveProductCollectorAdminState,
} from "../services/product-collector-admin.server";

function jsonError(message: string, status: number) {
  return Response.json({ ok: false, message }, { status });
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, cors, session } = await authenticate.admin(request);

  try {
    try {
      await registerWebhooks({ session });
    } catch (error) {
      console.error("[webhooks] failed to refresh webhooks during collector-tag load", {
        shop: session.shop,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    const url = new URL(request.url);
    const productId = String(url.searchParams.get("productId") || "").trim();

    if (!productId) {
      return cors(jsonError("PRODUCT_ID_REQUIRED", 422));
    }

    await ensureProductMetafieldDefinitions(admin);

    const state = await getProductCollectorAdminState(admin, productId);

    if (!state) {
      return cors(jsonError("PRODUCT_NOT_FOUND", 404));
    }

    return cors(
      Response.json({
        ok: true,
        state,
        sync: { ok: true, skipped: "NOT_REQUESTED" as const },
        notification: { ok: true, skipped: "NOT_REQUESTED" as const },
      }),
    );
  } catch (error) {
    return cors(
      Response.json(
        {
          ok: false,
          message: error instanceof Error ? error.message : "COLLECTOR_TAG_LOAD_FAILED",
        },
        { status: 500 },
      ),
    );
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin, cors, session } = await authenticate.admin(request);

  try {
    try {
      await registerWebhooks({ session });
    } catch (error) {
      console.error("[webhooks] failed to refresh webhooks during collector-tag save", {
        shop: session.shop,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    const payload = (await request.json()) as {
      productId?: string;
      collectorTag?: string;
    };

    const productId = String(payload.productId || "").trim();

    if (!productId) {
      return cors(jsonError("PRODUCT_ID_REQUIRED", 422));
    }

    await ensureProductMetafieldDefinitions(admin);

    const result = await saveProductCollectorAdminState({
      admin,
      shop: session.shop,
      productId,
      collectorTag: String(payload.collectorTag || ""),
    });

    return cors(Response.json(result));
  } catch (error) {
    return cors(
      Response.json(
        {
          ok: false,
          message: error instanceof Error ? error.message : "COLLECTOR_TAG_SAVE_FAILED",
        },
        { status: 500 },
      ),
    );
  }
}
