import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  findCollectorProfileByCustomerId,
  normalizeCollectorFormInput,
  toCustomerGid,
  upsertCollectorProfile,
} from "../services/collector-profiles.server";

function readTextValue(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function readManyValues(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

async function handleCollectorProfileSave(request: Request) {
  const url = new URL(request.url);

  try {
    const { admin } = await authenticate.public.appProxy(request);
    const shop = url.searchParams.get("shop");
    const customerId = url.searchParams.get("logged_in_customer_id");

    if (!admin || !shop || !customerId) {
      return Response.json({ ok: false, message: "LOGIN_REQUIRED" }, { status: 401 });
    }

    const customerGid = toCustomerGid(customerId);
    const existingProfile = await findCollectorProfileByCustomerId(admin, customerGid);
    const formData = await request.formData();

    const input = normalizeCollectorFormInput({
      customer_id: customerGid,
      handle: existingProfile?.handle || "",
      display_name: readTextValue(formData, "display_name"),
      public_handle: readTextValue(formData, "public_handle"),
      role_label: readTextValue(formData, "role_label"),
      bio: readTextValue(formData, "bio"),
      introduction: readTextValue(formData, "introduction"),
      quote: "",
      featured_collection_handle:
        existingProfile?.fields.featuredCollectionHandle || "",
      specialties: readTextValue(formData, "specialties"),
      preferred_regions: readManyValues(formData, "preferred_regions").join(", "),
      preferred_styles: readManyValues(formData, "preferred_styles").join(", "),
      preferred_grapes: readTextValue(formData, "preferred_grapes"),
      price_band: readTextValue(formData, "price_band"),
      taste_body: readTextValue(formData, "taste_body"),
      taste_tannin: readTextValue(formData, "taste_tannin"),
      taste_acidity: readTextValue(formData, "taste_acidity"),
      taste_sweetness: readTextValue(formData, "taste_sweetness"),
      taste_alcohol: readTextValue(formData, "taste_alcohol"),
      sort_order: String(existingProfile?.fields.sortOrder ?? 999),
      status: "ACTIVE",
    });

    const result = await upsertCollectorProfile(admin, input);

    return Response.json({
      ok: true,
      handle: result.handle,
      storefrontPath: result.storefrontPath,
    });
  } catch (error) {
    console.error("[collector-profile] save request failed", {
      method: request.method,
      url: request.url,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return Response.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "COLLECTOR_PROFILE_SAVE_FAILED",
      },
      { status: 500 },
    );
  }
}

export async function action({ request }: ActionFunctionArgs) {
  return handleCollectorProfileSave(request);
}

export async function loader({ request }: LoaderFunctionArgs) {
  return Response.json(
    { ok: false, message: "METHOD_NOT_ALLOWED", url: request.url },
    { status: 405 },
  );
}
