const SELLABLE_PRODUCT_STATUSES = new Set(["ACTIVE", "UNLISTED"]);

export function isSellableProductStatus(status: string | null | undefined) {
  return SELLABLE_PRODUCT_STATUSES.has(String(status || "").trim().toUpperCase());
}
