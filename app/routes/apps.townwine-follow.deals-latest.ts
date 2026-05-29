import type { LoaderFunctionArgs } from "react-router";
import { getLatestDealsPage } from "../services/latest-deals.server";
import { resolveStorefrontAdmin } from "../services/storefront-admin.server";

function toPositiveInteger(value: string | null, fallback: number) {
  const parsedValue = Number.parseInt(String(value || "").trim(), 10);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return fallback;
  }

  return parsedValue;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const requestedShop = url.searchParams.get("shop") || "";
  const page = toPositiveInteger(url.searchParams.get("page"), 1);
  const pageSize = toPositiveInteger(
    url.searchParams.get("page_size") || url.searchParams.get("pageSize"),
    50,
  );

  try {
    const adminContext = await resolveStorefrontAdmin({
      request,
      shop: requestedShop,
      required: false,
      logPrefix: "[deals-latest]",
    });

    if (!adminContext.admin) {
      return Response.json(
        {
          page,
          pageSize,
          hasNextPage: false,
          fetchedAt: new Date().toISOString(),
          products: [],
          collectorDetails: {},
        },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const payload = await getLatestDealsPage({
      admin: adminContext.admin,
      shop: adminContext.resolvedShop || requestedShop,
      page,
      pageSize,
    });

    return Response.json(payload, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[deals-latest] request failed", {
      method: request.method,
      url: request.url,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return Response.json(
      {
        page,
        pageSize,
        hasNextPage: false,
        fetchedAt: new Date().toISOString(),
        products: [],
        collectorDetails: {},
        error: "LATEST_DEALS_REQUEST_FAILED",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
