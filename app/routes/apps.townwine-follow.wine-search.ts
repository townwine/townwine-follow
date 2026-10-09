import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  parseWineQuery,
  searchWine,
  wineSearchAvailable,
  WineSearchError,
} from "../services/wine-search.server";
import type { WineQuery, WineResult } from "../services/wine-search.server";
import { renderWineSearchPage } from "../services/wine-search-page.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.public.appProxy(request);
  const params = new URL(request.url).searchParams;
  const available = wineSearchAvailable();
  let query: WineQuery | undefined,
    result: WineResult | undefined,
    error: string | undefined;
  let status = 200;
  if (params.has("q")) {
    try {
      query = parseWineQuery(params);
      result = await searchWine(query);
    } catch (caught) {
      if (!(caught instanceof WineSearchError)) throw caught;
      error = caught.message;
      status =
        caught.kind === "input" ? 400 : caught.kind === "busy" ? 429 : 200;
    }
  }
  return new Response(
    renderWineSearchPage({ query, result, error, available }),
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        ...(status === 429 ? { "Retry-After": "60" } : {}),
      },
    },
  );
}
