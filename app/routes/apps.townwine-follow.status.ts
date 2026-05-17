import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { readFollowStatusRequest } from "../services/follow-request.server";
import {
  getFollowingHandles,
  normalizeInfluencerHandle,
} from "../services/follow.server";
import { ensureProductMetafieldDefinitions } from "../services/product-metafield-definitions.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);

  try {
    const { admin } = await authenticate.public.appProxy(request);
    const shouldEnsureMetafields = url.searchParams.get("ensureMetafields") === "1";
    let bootstrap:
      | {
          ok: true;
          createdKeys: string[];
          updatedKeys: string[];
          totalDefinitions: number;
        }
      | undefined;

    if (admin && shouldEnsureMetafields) {
      const ensured = await ensureProductMetafieldDefinitions(admin);

      bootstrap = {
        ok: true,
        createdKeys: ensured.createdKeys,
        updatedKeys: ensured.updatedKeys,
        totalDefinitions: ensured.totalDefinitions,
      };
    }

    const shop = url.searchParams.get("shop");
    const customerId = url.searchParams.get("logged_in_customer_id");
    const payload = await readFollowStatusRequest(request);
    const handles = payload.handles;

    if (!shop || !handles.length) {
      return Response.json({ following: [], loggedIn: Boolean(customerId), bootstrap });
    }

    if (!customerId) {
      console.info("[follow] status request missing logged_in_customer_id", {
        shop,
        handles,
        query: url.search,
      });

      return Response.json({ following: [], loggedIn: false, bootstrap });
    }

    const following = await getFollowingHandles({
      shop,
      customerId,
      handles,
    });

    console.info("[follow] fetched follow status", {
      shop,
      customerId,
      handles,
      normalizedHandles: handles.map((handle) => normalizeInfluencerHandle(handle)),
      following,
    });

    return Response.json({ following, loggedIn: true, bootstrap });
  } catch (error) {
    console.error("[follow] status request failed", {
      method: request.method,
      url: request.url,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return Response.json({ following: [], loggedIn: false }, { status: 500 });
  }
}
