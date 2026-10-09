import { ThemeEvents } from "@theme/events";
const CARD_SELECTOR = "[data-townwine-inventory-card]",
  PRODUCT_SELECTOR = "[data-townwine-inventory-product]",
  DEFAULT_PROXY_BASE = "/apps/townwine-follow",
  DEFAULT_MAX_PER_PERSON = 6,
  INVENTORY_RETRY_DELAY_MS = 1500,
  INVENTORY_MAX_RETRY_COUNT = 30,
  inventoryRequests = new Map(),
  inventorySnapshotStore = new Map(),
  inventoryRetryTimers = new Map(),
  inventoryRetryCounts = new Map();
let refreshTimer = 0,
  domObserver;
function normalizeProxyBase(value) {
  const trimmedValue = String(value || "").trim();
  return trimmedValue === ""
    ? DEFAULT_PROXY_BASE
    : trimmedValue.endsWith("/")
      ? trimmedValue.slice(0, -1)
      : trimmedValue;
}
function parseVariantIds(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
function formatCount(value) {
  return new Intl.NumberFormat("ko-KR").format(Number(value) || 0);
}
function getProgressPercent(snapshot) {
  return Math.max(0, Math.min(100, Number(snapshot?.progressPercent) || 0));
}
function hasPendingSoldCount(snapshot) {
  return !!snapshot?.soldCountPending;
}
function getRemainingLabel(snapshot) {
  return snapshot
    ? snapshot.inventoryTracked
      ? snapshot.remainingInventory <= 0
        ? "\uC7AC\uACE0 \uC18C\uC9C4"
        : `\uC7AC\uACE0 ${formatCount(snapshot.remainingInventory)}\uBCD1 \uB0A8\uC74C`
      : snapshot.availableForSale
        ? "\uC7AC\uACE0 \uD655\uC778 \uC911"
        : "\uACF5\uAD6C \uB9C8\uAC10"
    : "\uC7AC\uACE0 \uC815\uBCF4 \uD655\uC778 \uC911";
}
function getCardSummary(snapshot) {
  return !snapshot || hasPendingSoldCount(snapshot)
    ? "\uD310\uB9E4 \uC218\uB7C9 \uD655\uC778 \uC911"
    : snapshot.inventoryTracked
      ? snapshot.totalInventory <= 0 && snapshot.soldCount > 0
        ? `${formatCount(snapshot.soldCount)}\uBCD1 \uD310\uB9E4 \uC644\uB8CC`
        : snapshot.totalInventory <= 0
          ? "\uD310\uB9E4 \uC218\uB7C9 \uD655\uC778 \uC911"
          : `${formatCount(snapshot.soldCount)} / ${formatCount(snapshot.totalInventory)}\uBCD1 \uD310\uB9E4`
      : `${formatCount(snapshot.soldCount)}\uBCD1 \uD310\uB9E4`;
}
function getProductBadge(snapshot) {
  return snapshot?.inventoryTracked
    ? hasPendingSoldCount(snapshot)
      ? snapshot.remainingInventory <= 0
        ? "\uC7AC\uACE0 \uC18C\uC9C4"
        : "\uD310\uB9E4 \uC9D1\uACC4 \uC911"
      : snapshot.totalInventory <= 0 && snapshot.soldCount > 0
        ? "\uC804\uB7C9 \uD310\uB9E4 \uC644\uB8CC"
        : `\uD310\uB9E4 ${formatCount(getProgressPercent(snapshot))}%`
    : "\uC7AC\uACE0 \uC5F0\uB3D9 \uC911";
}
function getProductHelper(snapshot) {
  return snapshot?.inventoryTracked
    ? snapshot.remainingInventory <= 0
      ? "\uC804\uB7C9 \uD310\uB9E4 \uC644\uB8CC"
      : hasPendingSoldCount(snapshot)
        ? "\uD310\uB9E4 \uC218\uB7C9 \uC9D1\uACC4 \uC911"
        : "\uD604\uC7AC \uD310\uB9E4 \uAC00\uB2A5"
    : "\uC7AC\uACE0 \uC5F0\uB3D9 \uC900\uBE44 \uC911";
}
function setText(scope, selector, value) {
  scope.querySelectorAll(selector).forEach((element) => {
    element instanceof HTMLElement && (element.textContent = value);
  });
}
function syncProgressClasses(element, progressPercent) {
  (element.classList.toggle(
    "pg--ur",
    progressPercent >= 75 && progressPercent < 100,
  ),
    element.classList.toggle("pg--ok", progressPercent >= 100));
}
function getSnapshotForVariantId(variantId) {
  return inventorySnapshotStore.get(String(variantId || "").trim()) || null;
}
function getAggregateCardSnapshot(variantIdsValue) {
  const variantIds = parseVariantIds(variantIdsValue);
  if (!variantIds.length) return null;
  const snapshots = variantIds
    .map((variantId) => getSnapshotForVariantId(variantId))
    .filter(Boolean);
  if (!snapshots.length) return null;
  if (snapshots.length === 1) return snapshots[0];
  let inventoryTracked = !1,
    soldCount = 0,
    totalInventory = 0,
    remainingInventory = 0,
    availableForSale = !1,
    inventoryPolicy = "DENY",
    soldCountPending = !1;
  snapshots.forEach((snapshot) => {
    ((soldCount += Number(snapshot?.soldCount) || 0),
      (soldCountPending = soldCountPending || hasPendingSoldCount(snapshot)),
      (availableForSale =
        availableForSale ||
        !!snapshot?.availableForSale ||
        (Number(snapshot?.remainingInventory) || 0) > 0),
      snapshot?.inventoryTracked &&
        ((inventoryTracked = !0),
        (totalInventory += Math.max(0, Number(snapshot.totalInventory) || 0)),
        (remainingInventory += Math.max(
          0,
          Number(snapshot.remainingInventory) || 0,
        )),
        String(snapshot.inventoryPolicy || "").toUpperCase() !== "DENY" &&
          (inventoryPolicy = String(
            snapshot.inventoryPolicy || inventoryPolicy,
          ))));
  });
  const progressPercent =
    !soldCountPending && totalInventory > 0
      ? (soldCount * 100) / totalInventory
      : soldCount > 0 && !availableForSale
        ? 100
        : 0;
  return {
    ...snapshots[0],
    availableForSale,
    inventoryPolicy,
    inventoryTracked,
    legacyVariantId: variantIds[0],
    progressPercent,
    remainingInventory,
    soldCount,
    soldCountPending,
    totalInventory,
  };
}
function updateCardWidget(widget, snapshot) {
  if (!(widget instanceof HTMLElement) || !snapshot) return;
  const progressPercent = getProgressPercent(snapshot),
    progressBar = widget.querySelector("[data-inventory-progress-bar]");
  (progressBar instanceof HTMLElement &&
    (progressBar.style.width = `${progressPercent}%`),
    syncProgressClasses(widget, progressPercent),
    setText(widget, "[data-inventory-summary]", getCardSummary(snapshot)),
    setText(widget, "[data-inventory-caption]", getRemainingLabel(snapshot)));
}
function updatePurchaseLimit(widget, snapshot) {
  const quantityInput = widget.querySelector('input[name="quantity"]'),
    quantityHint = widget.querySelector("[data-inventory-purchase-limit]");
  if (!(quantityInput instanceof HTMLInputElement)) return;
  const perPersonLimit = Number(
    widget.dataset.maxPerPerson || DEFAULT_MAX_PER_PERSON,
  );
  let maxQuantity = perPersonLimit;
  if (snapshot?.inventoryTracked && snapshot.inventoryPolicy === "DENY") {
    const remainingInventory = Number(snapshot.remainingInventory),
      safeRemainingInventory = Number.isFinite(remainingInventory)
        ? remainingInventory
        : perPersonLimit;
    maxQuantity = Math.max(1, Math.min(perPersonLimit, safeRemainingInventory));
  }
  ((quantityInput.max = String(maxQuantity)),
    Number(quantityInput.value || 1) > maxQuantity &&
      (quantityInput.value = String(maxQuantity)),
    quantityHint instanceof HTMLElement &&
      (quantityHint.textContent = `1\uC778 \uCD5C\uB300 ${formatCount(maxQuantity)}\uBCD1 \uAC00\uB2A5`));
}
function updateProductWidget(widget, snapshot) {
  if (!(widget instanceof HTMLElement) || !snapshot) return;
  const progressPercent = getProgressPercent(snapshot),
    progressContainer = widget.querySelector(
      "[data-inventory-progress-container]",
    ),
    progressBar = widget.querySelector("[data-inventory-progress-bar]");
  (progressContainer instanceof HTMLElement &&
    syncProgressClasses(progressContainer, progressPercent),
    progressBar instanceof HTMLElement &&
      (progressBar.style.width = `${progressPercent}%`),
    (widget.dataset.selectedVariantId =
      snapshot.legacyVariantId || widget.dataset.selectedVariantId || ""));
  const soldCountValue = hasPendingSoldCount(snapshot)
      ? "..."
      : formatCount(snapshot.soldCount),
    totalInventoryValue = hasPendingSoldCount(snapshot)
      ? "..."
      : formatCount(snapshot.totalInventory);
  (setText(widget, "[data-inventory-badge]", getProductBadge(snapshot)),
    setText(widget, "[data-inventory-sold]", soldCountValue),
    setText(widget, "[data-inventory-total]", totalInventoryValue),
    setText(
      widget,
      "[data-inventory-remaining]",
      formatCount(snapshot.remainingInventory),
    ),
    setText(widget, "[data-inventory-helper]", getProductHelper(snapshot)),
    updatePurchaseLimit(widget, snapshot));
}
function bindProductWidget(widget) {
  !(widget instanceof HTMLElement) ||
    widget.dataset.inventoryBound === "true" ||
    ((widget.dataset.inventoryBound = "true"),
    widget.addEventListener("change", (event) => {
      const target = event.target;
      !(target instanceof HTMLInputElement) ||
        target.name !== "id" ||
        ((widget.dataset.selectedVariantId = target.value),
        updateProductWidget(widget, getSnapshotForVariantId(target.value)));
    }));
}
function collectInventoryGroups() {
  const groups = new Map();
  return (
    document.querySelectorAll(CARD_SELECTOR).forEach((widget) => {
      if (!(widget instanceof HTMLElement)) return;
      const variantIds = parseVariantIds(
        widget.dataset.variantIds || widget.dataset.variantId,
      );
      if (!variantIds.length) return;
      const proxyBase = normalizeProxyBase(widget.dataset.proxyBase),
        group = groups.get(proxyBase) || {
          cards: [],
          products: [],
          variantIds: new Set(),
        };
      (group.cards.push(widget),
        variantIds.forEach((variantId) => {
          group.variantIds.add(variantId);
        }),
        groups.set(proxyBase, group));
    }),
    document.querySelectorAll(PRODUCT_SELECTOR).forEach((widget) => {
      if (!(widget instanceof HTMLElement)) return;
      bindProductWidget(widget);
      const proxyBase = normalizeProxyBase(widget.dataset.proxyBase),
        group = groups.get(proxyBase) || {
          cards: [],
          products: [],
          variantIds: new Set(),
        };
      (group.products.push(widget),
        parseVariantIds(widget.dataset.variantIds).forEach((variantId) => {
          group.variantIds.add(variantId);
        }),
        groups.set(proxyBase, group));
    }),
    groups
  );
}
async function fetchInventorySnapshots(proxyBase, variantIds) {
  const key = getRetryKey(proxyBase, variantIds);
  if (inventoryRequests.has(key)) return inventoryRequests.get(key);
  const pending = requestInventorySnapshots(proxyBase, variantIds);
  inventoryRequests.set(key, pending);
  try { return await pending; }
  finally { inventoryRequests.delete(key); }
}
async function requestInventorySnapshots(proxyBase, variantIds) {
  const url = new URL(`${proxyBase}/inventory`, window.location.origin);
  variantIds.forEach((variantId) => {
    url.searchParams.append("variantId", variantId);
  });
  const response = await fetch(url.toString(), {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(`Inventory request failed with status ${response.status}`);
  const payload = await response.json(),
    snapshots =
      payload?.snapshots && typeof payload.snapshots == "object"
        ? payload.snapshots
        : {};
  Object.entries(snapshots).forEach(([key, snapshot]) => {
    inventorySnapshotStore.set(key, snapshot);
  });
}
function getRetryKey(proxyBase, variantIds) {
  return `${proxyBase}::${variantIds.slice().sort().join(",")}`;
}
function clearRetryState(retryKey) {
  const existingTimer = inventoryRetryTimers.get(retryKey);
  (existingTimer && window.clearTimeout(existingTimer),
    inventoryRetryTimers.delete(retryKey),
    inventoryRetryCounts.delete(retryKey));
}
function applyInventoryGroup(group) {
  (group.cards.forEach((widget) => {
    updateCardWidget(
      widget,
      getAggregateCardSnapshot(
        widget.dataset.variantIds || widget.dataset.variantId,
      ),
    );
  }),
    group.products.forEach((widget) => {
      const selectedVariantId =
        widget.dataset.selectedVariantId ||
        parseVariantIds(widget.dataset.variantIds)[0] ||
        "";
      updateProductWidget(widget, getSnapshotForVariantId(selectedVariantId));
    }));
}
function groupHasPendingSoldCounts(variantIds) {
  return variantIds.some((variantId) =>
    !getSnapshotForVariantId(variantId) || hasPendingSoldCount(getSnapshotForVariantId(variantId)),
  );
}
function scheduleRetry(proxyBase, variantIds) {
  const retryKey = getRetryKey(proxyBase, variantIds),
    retryCount = inventoryRetryCounts.get(retryKey) || 0;
  if (
    retryCount >= INVENTORY_MAX_RETRY_COUNT ||
    inventoryRetryTimers.has(retryKey)
  )
    return;
  const retryTimer = window.setTimeout(
    () => {
      (inventoryRetryTimers.delete(retryKey),
        inventoryRetryCounts.set(retryKey, retryCount + 1));
      const group = collectInventoryGroups().get(proxyBase);
      if (!group) {
        clearRetryState(retryKey);
        return;
      }
      hydrateInventoryGroup(proxyBase, group, Array.from(group.variantIds));
    },
    Math.min(10000, INVENTORY_RETRY_DELAY_MS * (retryCount + 1)),
  );
  inventoryRetryTimers.set(retryKey, retryTimer);
}
async function hydrateInventoryGroup(proxyBase, group, variantIds) {
  const retryKey = getRetryKey(proxyBase, variantIds);
  if (!variantIds.length) {
    clearRetryState(retryKey);
    return;
  }
  try {
    await fetchInventorySnapshots(proxyBase, variantIds);
  } catch (error) {
    console.error("[townwine-inventory] failed to fetch inventory snapshots", {
      proxyBase,
      variantIds,
      message: error instanceof Error ? error.message : String(error),
    });
    scheduleRetry(proxyBase, variantIds);
    return;
  }
  if ((applyInventoryGroup(group), groupHasPendingSoldCounts(variantIds))) {
    scheduleRetry(proxyBase, variantIds);
    return;
  }
  clearRetryState(retryKey);
}
async function hydrateInventory() {
  const groups = collectInventoryGroups();
  groups.size &&
    (await Promise.all(
      Array.from(groups.entries()).map(([proxyBase, group]) =>
        hydrateInventoryGroup(proxyBase, group, Array.from(group.variantIds)),
      ),
    ));
}
function scheduleHydration() {
  (window.clearTimeout(refreshTimer),
    (refreshTimer = window.setTimeout(() => {
      hydrateInventory();
    }, 80)));
}
function shouldRefreshForMutation(mutationList) {
  return mutationList.some((mutation) =>
    [...mutation.addedNodes, ...mutation.removedNodes].some((node) =>
      node instanceof HTMLElement
        ? node.matches?.(CARD_SELECTOR) ||
          node.matches?.(PRODUCT_SELECTOR) ||
          !!node.querySelector?.(CARD_SELECTOR) ||
          !!node.querySelector?.(PRODUCT_SELECTOR)
        : !1,
    ),
  );
}
function startObserver() {
  !(document.body instanceof HTMLElement) ||
    domObserver ||
    ((domObserver = new MutationObserver((mutationList) => {
      shouldRefreshForMutation(mutationList) && scheduleHydration();
    })),
    domObserver.observe(document.body, { childList: !0, subtree: !0 }));
}
function initTownwineInventory() {
  (scheduleHydration(),
    startObserver(),
    document.addEventListener(ThemeEvents.FilterUpdate, scheduleHydration),
    window.addEventListener("pageshow", scheduleHydration));
}
document.readyState === "loading"
  ? document.addEventListener("DOMContentLoaded", initTownwineInventory, {
      once: !0,
    })
  : initTownwineInventory();
//# sourceMappingURL=/cdn/shop/t/21/assets/townwine-inventory.js.map?v=18929419902101070231780307382
