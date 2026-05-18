import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { readFollowMutationRequest } from "../services/follow-request.server";
import {
  normalizeInfluencerHandle,
  unfollowInfluencer,
} from "../services/follow.server";

function getSafeReturnTo(value: string) {
  const returnTo = value.trim();

  if (!returnTo.startsWith("/") || returnTo.startsWith("//")) {
    return "/";
  }

  return returnTo;
}

function shouldNavigateWithRedirect(request: Request) {
  const accept = request.headers.get("accept") || "";

  return accept.includes("text/html") && !accept.includes("application/json");
}

async function handleUnfollowRequest(request: Request) {
  const url = new URL(request.url);

  try {
    await authenticate.public.appProxy(request);
    const payload = await readFollowMutationRequest(request);
    const shop = payload.requestParams.get("shop") || "";
    const customerId = payload.requestParams.get("logged_in_customer_id") || "";

    if (!shop || !customerId) {
      console.info("[follow] unfollow request missing logged_in_customer_id", {
        shop,
        query: url.search,
      });
      return Response.json({ ok: false, message: "LOGIN_REQUIRED" }, { status: 401 });
    }

    const rawInfluencerHandle = String(payload.influencerHandle || "").trim();
    const influencerHandle = normalizeInfluencerHandle(rawInfluencerHandle);
    const returnTo = getSafeReturnTo(
      String(payload.requestParams.get("returnTo") || "/"),
    );

    console.info("[follow] received unfollow request", {
      method: request.method,
      shop,
      customerId,
      query: url.search,
      rawInfluencerHandle,
    });

    if (!influencerHandle) {
      return Response.json({ ok: false, message: "INFLUENCER_HANDLE_REQUIRED" }, { status: 422 });
    }

    const result = await unfollowInfluencer({
      shop,
      customerId,
      influencerHandle,
    });

    console.info("[follow] removed follow subscription", {
      shop,
      customerId,
      rawInfluencerHandle,
      influencerHandle,
      deletedCount: result.count,
    });

    if (shouldNavigateWithRedirect(request)) {
      return redirect(returnTo);
    }

    return Response.json({
      ok: true,
      following: false,
      influencerHandle,
    });
  } catch (error) {
    console.error("[follow] unfollow request failed", {
      method: request.method,
      url: request.url,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return Response.json({ ok: false, message: "UNFOLLOW_REQUEST_FAILED" }, { status: 500 });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  return handleUnfollowRequest(request);
}

export async function loader({ request }: LoaderFunctionArgs) {
  return handleUnfollowRequest(request);
}
