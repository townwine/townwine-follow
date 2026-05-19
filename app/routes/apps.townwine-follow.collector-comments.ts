import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  createCollectorComment,
  listCollectorComments,
} from "../services/collector-comments.server";
import { readCollectorCommentsRequest } from "../services/follow-request.server";

function normalizeShop(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function getFriendlyMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (
    message === "SHOP_REQUIRED" ||
    message === "COLLECTOR_HANDLE_REQUIRED" ||
    message === "COMMENT_BODY_REQUIRED" ||
    message === "COMMENT_BODY_TOO_LONG" ||
    message === "LOGIN_REQUIRED"
  ) {
    return message;
  }

  return "COLLECTOR_COMMENT_REQUEST_FAILED";
}

async function handleCollectorCommentsRequest(request: Request) {
  const url = new URL(request.url);

  try {
    const appProxyContext = await authenticate.public.appProxy(request);
    const payload = await readCollectorCommentsRequest(request);
    const shop = normalizeShop(
      appProxyContext.session?.shop ||
        payload.requestParams.get("shop") ||
        url.searchParams.get("shop"),
    );
    const customerId = String(
      payload.requestParams.get("logged_in_customer_id") || "",
    ).trim();
    const loggedIn = Boolean(customerId);

    if (!shop) {
      return Response.json(
        { ok: false, message: "SHOP_REQUIRED" },
        { status: 422 },
      );
    }

    if (!payload.collectorHandle) {
      return Response.json(
        { ok: false, message: "COLLECTOR_HANDLE_REQUIRED" },
        { status: 422 },
      );
    }

    if (request.method.toUpperCase() === "GET") {
      const comments = await listCollectorComments({
        shop,
        collectorHandle: payload.collectorHandle,
        limit: payload.limit,
      });

      return Response.json({
        ok: true,
        loggedIn,
        comments,
      });
    }

    if (!loggedIn) {
      return Response.json(
        { ok: false, message: "LOGIN_REQUIRED" },
        { status: 401 },
      );
    }

    if (!payload.body) {
      return Response.json(
        { ok: false, message: "COMMENT_BODY_REQUIRED" },
        { status: 422 },
      );
    }

    const comment = await createCollectorComment({
      shop,
      collectorHandle: payload.collectorHandle,
      customerId,
      customerDisplayName:
        payload.customerDisplayName || payload.customerFirstName,
      body: payload.body,
    });

    return Response.json({
      ok: true,
      loggedIn: true,
      comment,
    });
  } catch (error) {
    const message = getFriendlyMessage(error);
    const status =
      message === "LOGIN_REQUIRED"
        ? 401
        : message === "SHOP_REQUIRED" ||
            message === "COLLECTOR_HANDLE_REQUIRED" ||
            message === "COMMENT_BODY_REQUIRED" ||
            message === "COMMENT_BODY_TOO_LONG"
          ? 422
          : 500;

    console.error("[collector-comments] request failed", {
      method: request.method,
      url: request.url,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return Response.json({ ok: false, message }, { status });
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  return handleCollectorCommentsRequest(request);
}

export async function action({ request }: ActionFunctionArgs) {
  return handleCollectorCommentsRequest(request);
}
