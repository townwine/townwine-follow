import { redirect, type LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.public.appProxy(request);

  return redirect("/?openQuoteDock=1#quote-calculator", {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
