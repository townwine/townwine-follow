import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { readFollowStatusRequest } from "../services/follow-request.server";
import {
  getAllFollowingHandles,
  getFollowingHandles,
  normalizeInfluencerHandle,
  syncFollowSubscriptionContact,
} from "../services/follow.server";
import { ensureProductMetafieldDefinitions } from "../services/product-metafield-definitions.server";
import { processFollowNotificationCatchup } from "../services/deal-notification.server";

async function handleStatusRequest(request: Request) {
  const url = new URL(request.url);
  const payload = await readFollowStatusRequest(request);
  const shop = payload.requestParams.get("shop") || "";
  const customerId = payload.requestParams.get("logged_in_customer_id") || "";

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

    const handles = payload.handles;

    if (!shop) {
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

    await syncFollowSubscriptionContact({
      shop,
      customerId,
      customerEmail: payload.customerEmail,
      customerFirstName: payload.customerFirstName,
    });

    if (admin && payload.handles.length) {
      try {
        await processFollowNotificationCatchup({
          admin,
          shop,
          handles: payload.handles,
        });
      } catch (error) {
        console.error("[follow] failed to run notification catchup on status", {
          shop,
          customerId,
          handles: payload.handles,
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }

    if (!handles.length) {
      const following = await getAllFollowingHandles({
        shop,
        customerId,
      });

      return Response.json({ following, loggedIn: true, bootstrap });
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

export async function loader({ request }: LoaderFunctionArgs) {
  return handleStatusRequest(request);
}

export async function action({ request }: ActionFunctionArgs) {
  return handleStatusRequest(request);
}
