import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { getShopHkdToKrwRate } from "../services/exchange-rate.server";
import { resolveStorefrontAdmin } from "../services/storefront-admin.server";

async function handleExchangeRateRequest(request: Request) {
  const url = new URL(request.url);
  const adminContext = await resolveStorefrontAdmin({
    request,
    shop: url.searchParams.get("shop") || "",
    required: false,
    logPrefix: "[exchange-rate]",
  });

  const snapshot = await getShopHkdToKrwRate(adminContext.admin);

  return Response.json(snapshot, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

export async function loader({ request }: LoaderFunctionArgs) {
  return handleExchangeRateRequest(request);
}

export async function action({ request }: ActionFunctionArgs) {
  return handleExchangeRateRequest(request);
}

