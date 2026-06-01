const SELLABLE_PRODUCT_STATUSES = new Set(["ACTIVE", "UNLISTED"]);

function normalizeProductStatus(status: string | null | undefined) {
  return String(status || "").trim().toUpperCase();
}

export function isSellableProductStatus(status: string | null | undefined) {
  return SELLABLE_PRODUCT_STATUSES.has(normalizeProductStatus(status));
}

export function isActiveProductStatus(status: string | null | undefined) {
  return normalizeProductStatus(status) === "ACTIVE";
}

export function hasOnlineStoreUrl(value: string | null | undefined) {
  return Boolean(String(value || "").trim());
}
