import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

const QUOTE_DOCK_URL = "/?openQuoteDock=1#quote-calculator";

function renderQuoteRedirectPage() {
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="0;url=${QUOTE_DOCK_URL}" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>국가별 와인 견적으로 이동 중</title>
  </head>
  <body>
    <script>
      window.location.replace(${JSON.stringify(QUOTE_DOCK_URL)});
    </script>
    <p>국가별 와인 견적으로 이동 중입니다. 자동으로 이동하지 않으면 <a href="${QUOTE_DOCK_URL}">여기를 눌러주세요</a>.</p>
  </body>
</html>`;
}

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.public.appProxy(request);

  return new Response(renderQuoteRedirectPage(), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
