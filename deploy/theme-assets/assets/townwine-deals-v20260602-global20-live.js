(function () {
  var ROOT_SELECTOR = "[data-townwine-deals]",
    BASE_PAGE_SIZE = 20,
    PAGE_SIZE_OPTIONS = [20, 50, 100],
    ALL_LATEST_PREFETCH_PAGE_SIZE = 100,
    DEFAULT_PROXY_BASE = "/apps/townwine-follow",
    LATEST_PRODUCTS_ENDPOINT_PATH = "/deals-latest",
    FOLLOW_LABEL = "\uD314\uB85C\uC6B0",
    FOLLOWING_LABEL = "\uD314\uB85C\uC789",
    DEFAULT_KRW_RATE = 180,
    SEARCH_DEBOUNCE_MS = 120,
    DEFAULT_PRICE_FILTER_CONFIG = {
      options: [
        { value: "price_1", label: "10\uB9CC\uC6D0 \uC774\uD558" },
        { value: "price_2", label: "20\uB9CC\uC6D0 \uC774\uD558" },
        { value: "price_3", label: "30\uB9CC\uC6D0 \uC774\uD558" },
        { value: "price_4", label: "30\uB9CC\uC6D0 \uCD08\uACFC" },
      ],
      limits: [1e5, 2e5, 3e5],
    },
    LEGACY_PRICE_FILTER_ALIASES = {
      under100k: "price_1",
      under200k: "price_2",
      under300k: "price_3",
      over300k: "price_4",
    };
  function toArray(value) {
    return Array.prototype.slice.call(value || []);
  }
  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }
  function normalizeHandle(value) {
    return String(value || "")
      .trim()
      .replace(/^@+/, "")
      .replace(/\/+$/, "")
      .toLowerCase();
  }
  function toInteger(value, fallback) {
    var parsedValue = Number(String(value || "").trim());
    return Number.isFinite(parsedValue) ? Math.trunc(parsedValue) : fallback;
  }
  function debounce(callback, delay) {
    var timer = 0,
      debounced = function () {
        var context = this,
          args = arguments;
        (window.clearTimeout(timer),
          (timer = window.setTimeout(function () {
            callback.apply(context, args);
          }, delay)));
      };
    return (
      (debounced.cancel = function () {
        window.clearTimeout(timer);
      }),
      debounced
    );
  }
  function getDefaultPriceFilterConfig() {
    return {
      options: DEFAULT_PRICE_FILTER_CONFIG.options.map(function (option) {
        return { value: option.value, label: option.label };
      }),
      limits: DEFAULT_PRICE_FILTER_CONFIG.limits.slice(),
    };
  }
  function getPriceFilterConfig(root) {
    if (root instanceof HTMLElement && root.__townwinePriceFilterConfig)
      return root.__townwinePriceFilterConfig;
    var config = getDefaultPriceFilterConfig();
    if (root instanceof HTMLElement) {
      var labelKeys = [
          "priceLabel1",
          "priceLabel2",
          "priceLabel3",
          "priceLabel4",
        ],
        limitKeys = ["priceLimit1", "priceLimit2", "priceLimit3"];
      ((config.options = config.options.map(function (option, index) {
        var labelValue = String(root.dataset[labelKeys[index]] || "").trim();
        return { value: option.value, label: labelValue || option.label };
      })),
        (config.limits = config.limits.map(function (fallbackValue, index) {
          var nextValue = toInteger(
            root.dataset[limitKeys[index]],
            fallbackValue,
          );
          return nextValue > 0 ? nextValue : fallbackValue;
        })));
    }
    return (
      config.limits[1] < config.limits[0] &&
        (config.limits[1] = config.limits[0]),
      config.limits[2] < config.limits[1] &&
        (config.limits[2] = config.limits[1]),
      root instanceof HTMLElement &&
        (root.__townwinePriceFilterConfig = config),
      config
    );
  }
  function parsePageSize(value) {
    var pageSize = toInteger(value, BASE_PAGE_SIZE);
    return PAGE_SIZE_OPTIONS.indexOf(pageSize) === -1
      ? BASE_PAGE_SIZE
      : pageSize;
  }
  function getBasePagesPerView(pageSize) {
    return Math.max(1, Math.round(parsePageSize(pageSize) / BASE_PAGE_SIZE));
  }
  function getBasePageForLogicalPage(logicalPage, pageSize) {
    return (Math.max(1, logicalPage) - 1) * getBasePagesPerView(pageSize) + 1;
  }
  function getLogicalPageFromBasePage(basePage, pageSize) {
    return (
      Math.floor((Math.max(1, basePage) - 1) / getBasePagesPerView(pageSize)) +
      1
    );
  }
  function formatMoney(value) {
    var amount = Number(value || 0);
    return (
      "HKD " +
      amount.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  }
  function normalizeRate(value) {
    var parsedValue = Number(value || 0);
    return Number.isFinite(parsedValue) && parsedValue > 0
      ? parsedValue
      : DEFAULT_KRW_RATE;
  }
  function getKstDateString() {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
    } catch {
      return "";
    }
  }
  function formatKrwFromHkdCents(priceCents, rate) {
    var amount = (Number(priceCents || 0) / 100) * normalizeRate(rate);
    return "KRW \u20A9" + Math.round(amount).toLocaleString("ko-KR");
  }
  function applyExchangeRateToDom(rate) {
    toArray(
      document.querySelectorAll(
        "[data-krw-price-target][data-hkd-price-cents]",
      ),
    ).forEach(function (node) {
      node.textContent = formatKrwFromHkdCents(
        node.dataset.hkdPriceCents,
        rate,
      );
    });
  }
  function setGlobalExchangeRate(snapshot) {
    return (
      (window.TownWineExchangeRate = Object.assign(
        {},
        window.TownWineExchangeRate || {},
        snapshot || {},
      )),
      (window.TownWineExchangeRate.rate = normalizeRate(
        window.TownWineExchangeRate.rate,
      )),
      window.TownWineExchangeRate
    );
  }
  function getManualExchangeRateConfig() {
    return Object.assign(
      {
        rate: DEFAULT_KRW_RATE,
        source: "google_finance_hkd_krw",
        referenceDate: getKstDateString(),
        referenceUrl: "https://www.google.com/finance/beta/quote/HKD-KRW?hl=ko",
      },
      window.TownWineExchangeRateConfig || {},
    );
  }
  function ensureExchangeRateLoaded(proxyBase) {
    var config = getManualExchangeRateConfig(),
      nextSnapshot = setGlobalExchangeRate({
        rate: config.rate,
        updatedAt: "",
        source: config.source,
        referenceDate: config.referenceDate,
        referenceUrl: config.referenceUrl,
      });
    return (
      applyExchangeRateToDom(nextSnapshot.rate),
      window.TownWineExchangeRatePromise ||
        ((window.TownWineExchangeRatePromise = Promise.resolve(nextSnapshot)),
        window.dispatchEvent(
          new CustomEvent("townwine:exchange-rate-updated", {
            detail: nextSnapshot,
          }),
        )),
      window.TownWineExchangeRatePromise
    );
  }
  function getKrwRate() {
    var globalRate =
      window.TownWineExchangeRate &&
      Number(window.TownWineExchangeRate.rate || 0);
    return normalizeRate(globalRate || getManualExchangeRateConfig().rate);
  }
  function formatKrwMoney(value) {
    var amount = Number(value || 0) * getKrwRate();
    return "KRW \u20A9" + Math.round(amount).toLocaleString("ko-KR");
  }
  function getStateFromUrl(root) {
    var params = new URLSearchParams(window.location.search),
      fallbackBasePage =
        root instanceof HTMLElement ? toInteger(root.dataset.basePage, 1) : 1,
      priceFilterConfig = getPriceFilterConfig(root);
    return {
      query: String(params.get("q") || ""),
      tag: String(params.get("tag") || "").trim(),
      price: normalizePriceFilterValue(params.get("price"), priceFilterConfig),
      stock: String(params.get("stock") || "").trim(),
      sort: params.get("sort") === "closing" ? "closing" : "latest",
      basePage: Math.max(1, toInteger(params.get("page"), fallbackBasePage)),
      pageSize: parsePageSize(params.get("page_size")),
    };
  }
  function buildDealsUrl(root, state, overrides) {
    var params = new URLSearchParams(),
      nextState = Object.assign({}, state, overrides || {}),
      normalizedQuery = normalizeText(nextState.query),
      currentView = new URLSearchParams(window.location.search).get("view");
    (currentView && params.set("view", currentView),
      normalizedQuery && params.set("q", normalizedQuery),
      nextState.tag && params.set("tag", nextState.tag),
      nextState.price && params.set("price", nextState.price),
      nextState.stock && params.set("stock", nextState.stock),
      nextState.sort &&
        nextState.sort !== "latest" &&
        params.set("sort", nextState.sort),
      nextState.pageSize !== BASE_PAGE_SIZE &&
        params.set("page_size", String(nextState.pageSize)),
      nextState.basePage > 1 && params.set("page", String(nextState.basePage)));
    var baseUrl =
      root instanceof HTMLElement && root.dataset.pageUrl
        ? root.dataset.pageUrl
        : window.location.pathname;
    return baseUrl + (params.toString() ? "?" + params.toString() : "");
  }
  function updateUrl(root, state) {
    window.history.replaceState({}, "", buildDealsUrl(root, state));
  }
  function buildLatestLoadingMarkup() {
    return (
      '<div class="tdl-loading-grid" data-deals-latest-loading aria-hidden="true">' +
      Array.from({ length: 6 }, function () {
        return '<article class="tdl-loading-card"><div class="tdl-loading-card__media"></div><div class="tdl-loading-card__body"><div class="tdl-loading-card__line tdl-loading-card__line--sm"></div><div class="tdl-loading-card__line tdl-loading-card__line--md"></div><div class="tdl-loading-card__line"></div><div class="tdl-loading-card__line tdl-loading-card__line--lg"></div><div class="tdl-loading-card__cta"></div></div></article>';
      }).join("") +
      "</div>"
    );
  }
  function ensureLatestLoadingSkeleton(root) {
    var grid = root.querySelector("[data-deals-grid]");
    !(grid instanceof HTMLElement) ||
      root.querySelector("[data-deals-latest-loading]") ||
      grid.insertAdjacentHTML("beforebegin", buildLatestLoadingMarkup());
  }
  function setLatestPendingState(isPending) {
    if (document.documentElement instanceof HTMLElement) {
      if (isPending) {
        document.documentElement.setAttribute(
          "data-townwine-deals-latest-pending",
          "true",
        );
        return;
      }
      document.documentElement.removeAttribute(
        "data-townwine-deals-latest-pending",
      );
    }
  }
  function setLatestHydratedState(root, isHydrated) {
    root instanceof HTMLElement &&
      root.setAttribute("data-latest-hydrated", isHydrated ? "true" : "false");
  }
  async function fetchJson(url) {
    for (var lastError, attempt = 0; attempt < 3; attempt += 1)
      try {
        var requestUrl = new URL(url, window.location.origin);
        requestUrl.searchParams.set("_tw", String(Date.now()) + "-" + attempt);
        var response = await fetch(requestUrl.pathname + requestUrl.search, {
          credentials: "same-origin",
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error("PRODUCTS_REQUEST_FAILED");
        var payload = await response.json();
        if (!payload || payload.error)
          throw new Error("INVALID_PRODUCTS_RESPONSE");
        return payload;
      } catch (error) {
        lastError = error;
      }
    throw lastError;
  }
  function fetchText(url) {
    return fetch(url, {
      credentials: "same-origin",
      headers: { Accept: "text/html" },
    }).then(function (response) {
      if (!response.ok) throw new Error("DEALS_PRODUCT_HTML_REQUEST_FAILED");
      return response.text();
    });
  }
  function getText(node) {
    return node && typeof node.textContent == "string"
      ? node.textContent.trim()
      : "";
  }
  function getFirstAvailableVariant(product) {
    var variants = Array.isArray(product && product.variants)
      ? product.variants
      : [];
    return (
      variants.find(function (variant) {
        return !!(variant && variant.available);
      }) ||
      variants[0] ||
      null
    );
  }
  function hasAvailableVariant(product) {
    var variants = Array.isArray(product && product.variants)
      ? product.variants
      : [];
    return variants.some(function (variant) {
      return !!(variant && variant.available);
    });
  }
  function getVariantIds(product) {
    var variants = Array.isArray(product && product.variants)
      ? product.variants
      : [];
    return variants
      .map(function (variant) {
        return variant && variant.id != null ? String(variant.id).trim() : "";
      })
      .filter(Boolean)
      .join(",");
  }
  function getPrimaryPrice(product) {
    var variant = getFirstAvailableVariant(product);
    return variant && variant.price != null ? Number(variant.price || 0) : 0;
  }
  function getPriceValueKrw(product) {
    return Math.round(getPrimaryPrice(product) * getKrwRate());
  }
  function getPriceBandFromKrw(priceValueKrw, priceFilterConfig) {
    var config = priceFilterConfig || getDefaultPriceFilterConfig(),
      firstLimit = config.limits[0],
      secondLimit = config.limits[1],
      thirdLimit = config.limits[2];
    return priceValueKrw <= firstLimit
      ? config.options[0].value
      : priceValueKrw <= secondLimit
        ? config.options[1].value
        : priceValueKrw <= thirdLimit
          ? config.options[2].value
          : config.options[3].value;
  }
  function getPriceBand(product, priceFilterConfig) {
    return getPriceBandFromKrw(getPriceValueKrw(product), priceFilterConfig);
  }
  function normalizePriceFilterValue(value, priceFilterConfig) {
    var normalizedValue = String(value || "").trim(),
      config = priceFilterConfig || getDefaultPriceFilterConfig();
    return (
      Object.prototype.hasOwnProperty.call(
        LEGACY_PRICE_FILTER_ALIASES,
        normalizedValue,
      ) && (normalizedValue = LEGACY_PRICE_FILTER_ALIASES[normalizedValue]),
      config.options.some(function (option) {
        return option.value === normalizedValue;
      })
        ? normalizedValue
        : ""
    );
  }
  function getNormalizedCardPriceBand(card, priceFilterConfig) {
    if (!(card instanceof HTMLElement)) return "";
    var priceHkdCents = Number(card.dataset.priceHkdCents || 0);
    if (Number.isFinite(priceHkdCents) && priceHkdCents > 0) {
      var derivedBand = getPriceBandFromKrw(
        Math.round((priceHkdCents / 100) * getKrwRate()),
        priceFilterConfig,
      );
      return ((card.dataset.priceBand = derivedBand), derivedBand);
    }
    var normalizedValue = normalizePriceFilterValue(
      card.dataset.priceBand,
      priceFilterConfig,
    );
    return normalizedValue
      ? ((card.dataset.priceBand = normalizedValue), normalizedValue)
      : String(card.dataset.priceBand || "").trim();
  }
  function buildPriceFilterButtonsMarkup(priceFilterConfig) {
    return priceFilterConfig.options
      .map(function (option) {
        return (
          '<button class="chip" type="button" data-deals-price="' +
          escapeHtml(option.value) +
          '" aria-pressed="false">' +
          escapeHtml(option.label) +
          "</button>"
        );
      })
      .join("");
  }
  function ensurePriceFilterButtons(root) {
    var row = root.querySelector(".tdl-chip-row--price"),
      priceFilterConfig = getPriceFilterConfig(root);
    row instanceof HTMLElement &&
      (row.innerHTML = buildPriceFilterButtonsMarkup(priceFilterConfig));
  }
  function stripFilterCountUi(root) {
    root instanceof HTMLElement &&
      (toArray(
        root.querySelectorAll(
          ".tdl-chip-row--primary .chip__c, .tdl-chip-row--price .chip__c, .tdl-result-head__meta",
        ),
      ).forEach(function (node) {
        node instanceof HTMLElement && node.remove();
      }),
      (root.__townwineDealsHasFilterChipCounters =
        !!root.querySelector(".chip__c")));
  }
  function hasFilterChipCounters(root) {
    return !!(
      root instanceof HTMLElement && root.__townwineDealsHasFilterChipCounters
    );
  }
  function createPriceBandCounts(priceFilterConfig) {
    return priceFilterConfig.options.reduce(function (result, option) {
      return ((result[option.value] = 0), result);
    }, {});
  }
  function incrementPriceBandCount(counts, priceBand) {
    Object.prototype.hasOwnProperty.call(counts, priceBand) &&
      (counts[priceBand] += 1);
  }
  function syncPriceBandChipCounts(root, counts, priceFilterConfig) {
    priceFilterConfig.options.forEach(function (option) {
      setChipCount(
        root,
        '[data-deals-price="' + option.value + '"]',
        counts[option.value] || 0,
      );
    });
  }
  function getKnownTags(product) {
    var productTags = Array.isArray(product && product.tags)
      ? product.tags
      : [];
    return productTags.filter(function (tag) {
      return (
        [
          "\uB808\uB4DC",
          "\uD654\uC774\uD2B8",
          "\uC2A4\uD30C\uD074\uB9C1",
          "\uB0B4\uCD94\uB7F4",
          "\uBC14\uB85C\uBC30\uC1A1",
        ].indexOf(tag) !== -1
      );
    });
  }
  function parseCollectorNameFromTitle(title) {
    var value = String(title || "").trim(),
      match = value.match(/^\d{4}\.\d{2}\.\d{2}\s+(.+?)\s+pick\b/i);
    return match ? match[1].trim() : "";
  }
  function isAutoCollectorHandleLabel(value) {
    var normalized = String(value || "")
      .trim()
      .replace(/^@/, "")
      .toLowerCase();
    return /^collector-\d+$/.test(normalized);
  }
  function parseCollectorData(html, product) {
    var doc = new DOMParser().parseFromString(String(html || ""), "text/html"),
      followButton = doc.querySelector(
        ".js-follow-btn[data-influencer-handle]",
      ),
      nameNode = doc.querySelector(".imini__nm a, .imini__nm"),
      linkNode = doc.querySelector(".imini__nm a"),
      metaSpans = toArray(doc.querySelectorAll(".imini__h span")),
      handleLabel = "";
    metaSpans.some(function (node) {
      var value = getText(node);
      return value.indexOf("@") === 0 && !isAutoCollectorHandleLabel(value)
        ? ((handleLabel = value), !0)
        : !1;
    });
    var followHandle = normalizeHandle(
        (followButton instanceof HTMLElement &&
          followButton.dataset.influencerHandle) ||
          "",
      ),
      displayName = getText(nameNode),
      collectorUrl =
        (linkNode instanceof HTMLAnchorElement &&
          linkNode.getAttribute("href")) ||
        "",
      fallbackName = parseCollectorNameFromTitle(product && product.title);
    return {
      followHandle,
      followName:
        (followButton instanceof HTMLElement &&
          followButton.dataset.influencerName) ||
        displayName ||
        fallbackName,
      displayName: displayName || fallbackName,
      handleLabel,
      collectorUrl,
    };
  }
  async function fetchCollectorDetails(products) {
    var details = new Map(),
      targets = products.slice(),
      concurrency = Math.min(12, targets.length),
      cursor = 0;
    async function worker() {
      for (; cursor < targets.length; ) {
        var product = targets[cursor];
        cursor += 1;
        try {
          var html = await fetchText(
            "/products/" + product.handle + "?view=default",
          );
          details.set(product.handle, parseCollectorData(html, product));
        } catch {
          details.set(product.handle, {
            followHandle: "",
            followName: parseCollectorNameFromTitle(product.title),
            displayName: parseCollectorNameFromTitle(product.title),
            handleLabel: "",
            collectorUrl: "",
          });
        }
      }
    }
    return (
      await Promise.all(
        Array.from({ length: concurrency }, function () {
          return worker();
        }),
      ),
      details
    );
  }
  function createImageMarkup(product) {
    var image =
      Array.isArray(product && product.images) && product.images.length
        ? product.images[0]
        : null;
    return !image || !image.src
      ? '<div class="tw-card-fallback" aria-hidden="true"></div>'
      : '<img src="' +
          escapeHtml(image.src) +
          '" class="tw-card-image" alt="' +
          escapeHtml(product.title) +
          '" loading="lazy">';
  }
  function buildFollowButton(collector, proxyBase) {
    return collector.followHandle
      ? `<button class="follow js-follow-btn" type="button" onclick="if (event) { event.__townwineFollowHandled = true; } if (window.TownWineFollow && typeof window.TownWineFollow.handleButtonClick === 'function') { window.TownWineFollow.handleButtonClick(this, event); }" data-influencer-handle="` +
          escapeHtml(collector.followHandle) +
          '" data-influencer-name="' +
          escapeHtml(collector.followName || collector.displayName || "") +
          '" data-proxy-base="' +
          escapeHtml(proxyBase) +
          '" data-follow-label="' +
          escapeHtml(FOLLOW_LABEL) +
          '" data-following-label="' +
          escapeHtml(FOLLOWING_LABEL) +
          '" data-return-to="' +
          escapeHtml(
            window.location.pathname +
              window.location.search +
              window.location.hash,
          ) +
          '" aria-pressed="false">' +
          escapeHtml(FOLLOW_LABEL) +
          "</button>"
      : "";
  }
  function buildCardMarkup(
    product,
    collector,
    proxyBase,
    index,
    priceFilterConfig,
  ) {
    var variant = getFirstAvailableVariant(product);
    if (!variant) return "";
    var available = hasAvailableVariant(product),
      inventoryPreview = getInventoryPreview(product),
      createdTimestamp = new Date(product.created_at || 0).getTime() || 0,
      priceValue = Number(variant.price || 0),
      comparePrice = Number(variant.compare_at_price || 0),
      discountPercent =
        comparePrice > priceValue
          ? Math.round(((comparePrice - priceValue) * 100) / comparePrice)
          : 0,
      tagKeys = getKnownTags(product),
      priceBand = getPriceBand(product, priceFilterConfig),
      hasCollector = !!(
        collector &&
        (collector.followHandle || collector.displayName)
      ),
      collectorName = hasCollector
        ? collector.displayName || collector.followName
        : "\uCEEC\uB809\uD130 \uBBF8\uC9C0\uC815",
      collectorMeta = hasCollector
        ? [product.vendor, collector.handleLabel].filter(Boolean).join(" \xB7 ")
        : product.vendor || "",
      collectorLink =
        hasCollector && collector.collectorUrl ? collector.collectorUrl : "",
      initial = (collectorName || product.vendor || "\uCEEC").slice(0, 1),
      subtitle = [product.product_type || "Curated wine", product.vendor || ""]
        .filter(Boolean)
        .join(" \xB7 "),
      searchIndex = normalizeText(
        [
          product.title,
          product.vendor,
          collectorName,
          collectorMeta,
          subtitle,
          tagKeys.join(" "),
        ].join(" "),
      ),
      infoOpen = collectorLink
        ? '<a class="dc__ii" href="' + escapeHtml(collectorLink) + '">'
        : '<div class="dc__ii">',
      infoClose = collectorLink ? "</a>" : "</div>",
      badgeHtml = available
        ? ""
        : '<div class="dc__b"><span class="bd bd--soft">\uACF5\uAD6C \uC885\uB8CC</span></div>',
      compareHtml =
        comparePrice > priceValue
          ? '<span class="strk">' +
            escapeHtml(formatMoney(comparePrice)) +
            "</span>"
          : "",
      discountHtml =
        discountPercent > 0
          ? '<span class="pct">-' + escapeHtml(discountPercent) + "%</span>"
          : "",
      variantIds = getVariantIds(product),
      sortClosing = 999999,
      inventorySummary = "\uC7AC\uACE0 \uC815\uBCF4 \uD655\uC778 \uC911",
      inventoryCaption = "\uC7AC\uACE0 \uC815\uBCF4 \uD655\uC778 \uC911",
      inventoryClassName = "pg";
    return (
      inventoryPreview.inventoryTracked &&
        ((sortClosing = inventoryPreview.remainingInventory),
        (inventorySummary =
          inventoryPreview.totalInventory > 0
            ? formatBottleCount(inventoryPreview.soldCount) +
              " / " +
              formatBottleCount(inventoryPreview.totalInventory) +
              "\uBCD1 \uD310\uB9E4"
            : "\uD310\uB9E4 \uC218\uB7C9 \uD655\uC778 \uC911"),
        (inventoryCaption =
          "\uC7AC\uACE0 " +
          formatBottleCount(inventoryPreview.remainingInventory) +
          "\uBCD1 \uB0A8\uC74C")),
      available ||
        ((sortClosing += 1e6),
        (inventorySummary = "\uACF5\uAD6C \uC885\uB8CC"),
        (inventoryCaption = "\uC7AC\uACE0 \uC5C6\uC74C")),
      inventoryPreview.progressPercent >= 100
        ? (inventoryClassName += " pg--ok")
        : inventoryPreview.progressPercent >= 75 &&
          (inventoryClassName += " pg--ur"),
      '<div class="tdl-card-item" data-deal-card data-search-index="' +
        escapeHtml(searchIndex) +
        '" data-tags="' +
        escapeHtml(tagKeys.join("|")) +
        '" data-price-hkd-cents="' +
        escapeHtml(Math.round(priceValue * 100)) +
        '" data-price-band="' +
        escapeHtml(priceBand) +
        '" data-stock-state="' +
        (available ? "available" : "soldout") +
        '" data-sort-popularity="' +
        escapeHtml(index) +
        '" data-sort-closing="' +
        escapeHtml(sortClosing) +
        '" data-sort-latest="' +
        escapeHtml(Math.trunc(createdTimestamp / 1e3)) +
        '"><article class="dc" data-townwine-product-card-url="/products/' +
        escapeHtml(product.handle) +
        '"><a class="dc__m dc__m-link" href="/products/' +
        escapeHtml(product.handle) +
        '" aria-label="' +
        escapeHtml(product.title) +
        '">' +
        badgeHtml +
        createImageMarkup(product) +
        '</a><div class="dc__bd"><div class="dc__inf">' +
        infoOpen +
        '<span class="mini">' +
        escapeHtml(initial) +
        '</span><div class="dc__nm">' +
        escapeHtml(collectorName) +
        (collectorMeta
          ? "<span>" + escapeHtml(collectorMeta) + "</span>"
          : "") +
        "</div>" +
        infoClose +
        buildFollowButton(collector || {}, proxyBase) +
        '</div><div><h3 class="dc__t"><a href="/products/' +
        escapeHtml(product.handle) +
        '">' +
        escapeHtml(product.title) +
        "</a><em>" +
        escapeHtml(subtitle) +
        '</em></h3></div><div class="' +
        inventoryClassName +
        '" data-townwine-inventory-card data-variant-id="' +
        escapeHtml(variant.id) +
        '" data-variant-ids="' +
        escapeHtml(variantIds) +
        '" data-proxy-base="' +
        escapeHtml(proxyBase) +
        '"><div class="pg__bar"><div class="pg__fl" style="width:' +
        escapeHtml(inventoryPreview.progressPercent) +
        '%" data-inventory-progress-bar></div></div><div class="pg__mt"><span data-inventory-summary>' +
        escapeHtml(inventorySummary) +
        "</span><span data-inventory-caption>" +
        escapeHtml(inventoryCaption) +
        '</span></div></div><div class="pr"><div class="pr__main">' +
        compareHtml +
        '<span class="now">' +
        escapeHtml(formatMoney(priceValue)) +
        "</span>" +
        discountHtml +
        '</div><div class="pr__sub" data-krw-price-target data-hkd-price-cents="' +
        escapeHtml(Math.round(priceValue * 100)) +
        '">' +
        escapeHtml(formatKrwMoney(priceValue)) +
        '</div></div><a class="btn ' +
        (available ? "btn--dark" : "btn--ivory") +
        ' btn--block dc__cta" href="/products/' +
        escapeHtml(product.handle) +
        '">' +
        (available
          ? "\uB51C \uC790\uC138\uD788 \uBCF4\uAE30"
          : "\uC885\uB8CC \uB51C \uBCF4\uAE30") +
        "</a></div></article></div>"
    );
  }
  function getCards(root) {
    return toArray(root.querySelectorAll("[data-deal-card]"));
  }
  function syncSearchInput(root, state) {
    var input = root.querySelector("[data-deals-search]");
    input instanceof HTMLInputElement && (input.value = state.query);
  }
  function syncChipState(root, state) {
    (toArray(root.querySelectorAll("[data-deals-tag]")).forEach(
      function (button) {
        var isActive = (button.dataset.dealsTag || "") === state.tag;
        (button.classList.toggle("is-on", isActive),
          button.setAttribute("aria-pressed", isActive ? "true" : "false"));
      },
    ),
      toArray(root.querySelectorAll("[data-deals-price]")).forEach(
        function (button) {
          var isActive = (button.dataset.dealsPrice || "") === state.price;
          (button.classList.toggle("is-on", isActive),
            button.setAttribute("aria-pressed", isActive ? "true" : "false"));
        },
      ),
      toArray(root.querySelectorAll("[data-deals-stock]")).forEach(
        function (button) {
          var isActive = (button.dataset.dealsStock || "") === state.stock;
          (button.classList.toggle("is-on", isActive),
            button.setAttribute("aria-pressed", isActive ? "true" : "false"));
        },
      ),
      toArray(root.querySelectorAll("[data-deals-sort]")).forEach(
        function (button) {
          var isActive =
            !state.stock &&
            (button.dataset.dealsSort || "latest") === state.sort;
          (button.classList.toggle("is-on", isActive),
            button.setAttribute("aria-selected", isActive ? "true" : "false"));
        },
      ));
  }
  function syncViewStateUi(root, state) {
    (syncSearchInput(root, state),
      syncChipState(root, state),
      syncPageSizeControls(root, state),
      updateUrl(root, state));
  }
  function syncResultSummary(root, visibleCount, totalCount) {
    var countNode = root.querySelector("[data-deals-visible-count]"),
      totalNode = root.querySelector("[data-deals-total-count]"),
      emptyNode = root.querySelector("[data-deals-empty]");
    (countNode instanceof HTMLElement &&
      (countNode.textContent = String(Math.max(0, toInteger(visibleCount, 0)))),
      totalNode instanceof HTMLElement &&
        (totalNode.textContent = String(Math.max(0, toInteger(totalCount, 0)))),
      emptyNode instanceof HTMLElement &&
        (emptyNode.hidden = Math.max(0, toInteger(visibleCount, 0)) !== 0));
  }
  function setGridBusyState(root, isBusy) {
    var grid = root.querySelector("[data-deals-grid]");
    if (grid instanceof HTMLElement) {
      if (isBusy) {
        grid.setAttribute("aria-busy", "true");
        return;
      }
      grid.removeAttribute("aria-busy");
    }
  }
  function getResolvedAllLatestDealsPayload(root) {
    return (
      (root instanceof HTMLElement && root.__townwineDealsAllLatestPayload) ||
      window.__townwineDealsAllLatestPayload ||
      null
    );
  }
  function shouldWaitForDealsHydration(root, state) {
    var hasCachedAllPayload = !!getResolvedAllLatestDealsPayload(root);
    return hasGlobalFilterState(state)
      ? !hasCachedAllPayload && root.dataset.dealsGlobalFilter !== "true"
      : root.dataset.dealsGlobalFilter === "true";
  }
  function applyStateChange(root, state) {
    syncViewStateUi(root, state);
    var waitingForHydration = shouldWaitForDealsHydration(root, state);
    (waitingForHydration
      ? (setGridBusyState(root, !0), setLatestPendingState(!0))
      : hasGlobalFilterState(state) && setLatestPendingState(!1),
      updateDealsView(root, state));
  }
  function getPaginationSummary(totalPages, currentPage) {
    if (totalPages <= 7)
      return Array.from({ length: totalPages }, function (_, index) {
        return index + 1;
      });
    var pages = [1],
      windowStart = Math.max(2, currentPage - 1),
      windowEnd = Math.min(totalPages - 1, currentPage + 1);
    windowStart > 2 && pages.push("gap");
    for (var pageNumber = windowStart; pageNumber <= windowEnd; pageNumber += 1)
      pages.push(pageNumber);
    return (
      windowEnd < totalPages - 1 && pages.push("gap"),
      pages.push(totalPages),
      pages
    );
  }
  function getTotalItems(root) {
    return root instanceof HTMLElement
      ? Math.max(0, toInteger(root.dataset.totalItems, getCards(root).length))
      : 0;
  }
  function ensureDealsScaffold(root) {
    var resultHead = root.querySelector(".tdl-result-head"),
      countNode = root.querySelector("[data-deals-visible-count]"),
      grid = root.querySelector("[data-deals-grid]"),
      emptyNode = root.querySelector("[data-deals-empty]");
    if (countNode instanceof HTMLElement) {
      var countWrap = countNode.parentElement;
      countWrap instanceof HTMLElement &&
        (countWrap.classList.add("tdl-result-head__count"),
        (countWrap.innerHTML =
          "\uD604\uC7AC \uD654\uBA74 " + countNode.outerHTML + "\uAC1C"));
    }
    if (
      (resultHead instanceof HTMLElement &&
        !resultHead.querySelector("[data-deals-page-size-wrap]") &&
        resultHead.insertAdjacentHTML(
          "beforeend",
          '<div class="tdl-result-head__actions" data-deals-page-size-wrap><span class="tdl-result-head__label">\uD398\uC774\uC9C0\uB2F9</span><div class="tdl-page-size" role="group" aria-label="\uD398\uC774\uC9C0\uB2F9 \uACF5\uAD6C \uC218"><button class="chip chip--sm is-on" type="button" data-deals-page-size="20" aria-pressed="true">20</button><button class="chip chip--sm" type="button" data-deals-page-size="50" aria-pressed="false">50</button><button class="chip chip--sm" type="button" data-deals-page-size="100" aria-pressed="false">100</button></div></div>',
        ),
      grid instanceof HTMLElement &&
        !root.querySelector("[data-deals-pagination-wrap]"))
    ) {
      var paginationMarkup =
        '<div class="tdl-pagination-wrap" data-deals-pagination-wrap hidden><nav class="tdl-pagination" aria-label="\uCD94\uCC9C \uACF5\uAD6C \uD398\uC774\uC9C0 \uC774\uB3D9" data-deals-pagination></nav></div>';
      emptyNode instanceof HTMLElement
        ? emptyNode.insertAdjacentHTML("afterend", paginationMarkup)
        : grid.insertAdjacentHTML("afterend", paginationMarkup);
    }
  }
  async function hydratePaginationDataset(root, state) {
    root instanceof HTMLElement &&
      (root.dataset.pageUrl ||
        (root.dataset.pageUrl = window.location.pathname),
      root.dataset.basePage || (root.dataset.basePage = String(state.basePage)),
      root.dataset.basePageSize ||
        (root.dataset.basePageSize = String(BASE_PAGE_SIZE)),
      !(root.dataset.totalItems && root.dataset.baseTotalPages) &&
        root.dataset.paginationHydrated !== "true" &&
        ((root.dataset.paginationHydrated = "true"),
        syncTotalItemsDataset(root, getCards(root).length)));
  }
  function syncPageSizeControls(root, state) {
    var wrap = root.querySelector("[data-deals-page-size-wrap]"),
      totalItems = getTotalItems(root);
    (wrap instanceof HTMLElement &&
      (wrap.hidden = totalItems <= PAGE_SIZE_OPTIONS[0]),
      toArray(root.querySelectorAll("[data-deals-page-size]")).forEach(
        function (button) {
          var isActive =
            parsePageSize(button.dataset.dealsPageSize) === state.pageSize;
          (button.classList.toggle("is-on", isActive),
            button.setAttribute("aria-pressed", isActive ? "true" : "false"));
        },
      ));
  }
  function getPageSizeUrl(root, state, nextPageSize) {
    var currentOffset = (Math.max(1, state.basePage) - 1) * BASE_PAGE_SIZE,
      logicalPage = Math.floor(currentOffset / parsePageSize(nextPageSize)) + 1;
    return buildDealsUrl(root, state, {
      pageSize: parsePageSize(nextPageSize),
      basePage: getBasePageForLogicalPage(logicalPage, nextPageSize),
    });
  }
  function renderPagination(root, state, totalCount) {
    var nav = root.querySelector("[data-deals-pagination]"),
      wrap = root.querySelector("[data-deals-pagination-wrap]");
    if (!(!(nav instanceof HTMLElement) || !(wrap instanceof HTMLElement))) {
      var totalPages = Math.ceil(totalCount / state.pageSize);
      if (totalPages <= 1) {
        ((wrap.hidden = !0), (nav.innerHTML = ""));
        return;
      }
      var currentPage = Math.min(
          Math.max(
            getLogicalPageFromBasePage(state.basePage, state.pageSize),
            1,
          ),
          totalPages,
        ),
        parts = getPaginationSummary(totalPages, currentPage),
        markup = "";
      (currentPage === 1
        ? (markup +=
            '<span class="tdl-pagination__arrow is-disabled" aria-hidden="true">\u2039</span>')
        : (markup +=
            '<a class="tdl-pagination__arrow" href="' +
            escapeHtml(
              buildDealsUrl(root, state, {
                basePage: getBasePageForLogicalPage(
                  currentPage - 1,
                  state.pageSize,
                ),
              }),
            ) +
            '" aria-label="\uC774\uC804 \uD398\uC774\uC9C0">\u2039</a>'),
        parts.forEach(function (part) {
          if (part === "gap") {
            markup +=
              '<span class="tdl-pagination__gap" aria-hidden="true">\u2026</span>';
            return;
          }
          var isCurrent = part === currentPage;
          markup +=
            '<a class="tdl-pagination__page' +
            (isCurrent ? " is-current" : "") +
            '" href="' +
            escapeHtml(
              buildDealsUrl(root, state, {
                basePage: getBasePageForLogicalPage(part, state.pageSize),
              }),
            ) +
            '"' +
            (isCurrent ? ' aria-current="page"' : "") +
            ">" +
            String(part) +
            "</a>";
        }),
        currentPage === totalPages
          ? (markup +=
              '<span class="tdl-pagination__arrow is-disabled" aria-hidden="true">\u203A</span>')
          : (markup +=
              '<a class="tdl-pagination__arrow" href="' +
              escapeHtml(
                buildDealsUrl(root, state, {
                  basePage: getBasePageForLogicalPage(
                    currentPage + 1,
                    state.pageSize,
                  ),
                }),
              ) +
              '" aria-label="\uB2E4\uC74C \uD398\uC774\uC9C0">\u203A</a>'),
        (nav.innerHTML = markup),
        (wrap.hidden = !1));
    }
  }
  function setChipCount(root, selector, value) {
    var button = root.querySelector(selector),
      counter = button ? button.querySelector(".chip__c") : null;
    counter instanceof HTMLElement && (counter.textContent = String(value));
  }
  function syncTotalItemsDataset(root, totalItems) {
    if (root instanceof HTMLElement) {
      var normalizedTotalItems = Math.max(
        0,
        toInteger(totalItems, getCards(root).length),
      );
      ((root.dataset.totalItems = String(normalizedTotalItems)),
        (root.dataset.baseTotalPages = String(
          Math.max(
            1,
            Math.ceil(Math.max(normalizedTotalItems, 1) / BASE_PAGE_SIZE),
          ),
        )));
    }
  }
  function setAggregateCountsPending(root, isPending) {
    if (
      root instanceof HTMLElement &&
      ((root.dataset.aggregateCountsPending = isPending ? "true" : "false"),
      !(!isPending || !hasFilterChipCounters(root)))
    ) {
      ([
        '[data-deals-tag=""]',
        '[data-deals-tag="\uB808\uB4DC"]',
        '[data-deals-tag="\uD654\uC774\uD2B8"]',
        '[data-deals-tag="\uC2A4\uD30C\uD074\uB9C1"]',
        '[data-deals-tag="\uB0B4\uCD94\uB7F4"]',
        '[data-deals-tag="\uBC14\uB85C\uBC30\uC1A1"]',
      ].forEach(function (selector) {
        setChipCount(root, selector, "...");
      }),
        getPriceFilterConfig(root).options.forEach(function (option) {
          setChipCount(
            root,
            '[data-deals-price="' + option.value + '"]',
            "...",
          );
        }));
      var totalNode = root.querySelector("[data-deals-total-count]");
      totalNode instanceof HTMLElement && (totalNode.textContent = "...");
    }
  }
  function syncAggregateCountsFromPayload(root, state, payload) {
    if (
      !(
        !(root instanceof HTMLElement) ||
        root.dataset.dealsGlobalFilter === "true"
      )
    ) {
      var products = Array.isArray(payload && payload.products)
          ? payload.products
          : [],
        totalNode = root.querySelector("[data-deals-total-count]");
      products.length &&
        (setAggregateCountsPending(root, !1),
        syncTotalItemsDataset(root, products.length),
        updateCounts(root, products),
        syncPageSizeControls(root, state),
        totalNode instanceof HTMLElement &&
          (totalNode.textContent = String(getTotalItems(root))),
        hasGlobalFilterState(state) ||
          renderPagination(root, state, getTotalItems(root)));
    }
  }
  function formatBottleCount(value) {
    return Math.max(0, Number(value || 0)).toLocaleString("ko-KR");
  }
  function getInventoryPreview(product) {
    var variants = Array.isArray(product && product.variants)
        ? product.variants
        : [],
      inventoryTracked = !1,
      remainingInventory = 0,
      soldCount = 0;
    variants.forEach(function (variant) {
      String((variant && variant.inventory_management) || "").trim() ===
        "shopify" &&
        ((inventoryTracked = !0),
        (remainingInventory += Math.max(
          0,
          toInteger(variant.inventory_quantity, 0),
        )));
    });
    var totalInventory = remainingInventory + soldCount,
      progressPercent =
        totalInventory > 0 ? Math.round((soldCount * 100) / totalInventory) : 0;
    return (
      progressPercent > 100 && (progressPercent = 100),
      {
        inventoryTracked,
        progressPercent,
        remainingInventory,
        soldCount,
        totalInventory,
      }
    );
  }
  function updateCounts(root, products) {
    if (hasFilterChipCounters(root)) {
      var priceFilterConfig = getPriceFilterConfig(root),
        total = products.length,
        redCount = 0,
        whiteCount = 0,
        sparklingCount = 0,
        naturalCount = 0,
        readyCount = 0,
        priceBandCounts = createPriceBandCounts(priceFilterConfig),
        availableCount = 0;
      (products.forEach(function (product) {
        var tags = getKnownTags(product),
          priceBand = getPriceBand(product, priceFilterConfig),
          available = hasAvailableVariant(product);
        (tags.indexOf("\uB808\uB4DC") !== -1 && (redCount += 1),
          tags.indexOf("\uD654\uC774\uD2B8") !== -1 && (whiteCount += 1),
          tags.indexOf("\uC2A4\uD30C\uD074\uB9C1") !== -1 &&
            (sparklingCount += 1),
          tags.indexOf("\uB0B4\uCD94\uB7F4") !== -1 && (naturalCount += 1),
          tags.indexOf("\uBC14\uB85C\uBC30\uC1A1") !== -1 && (readyCount += 1),
          available && (availableCount += 1),
          incrementPriceBandCount(priceBandCounts, priceBand));
      }),
        setChipCount(root, '[data-deals-tag=""]', total),
        setChipCount(root, '[data-deals-tag="\uB808\uB4DC"]', redCount),
        setChipCount(root, '[data-deals-tag="\uD654\uC774\uD2B8"]', whiteCount),
        setChipCount(
          root,
          '[data-deals-tag="\uC2A4\uD30C\uD074\uB9C1"]',
          sparklingCount,
        ),
        setChipCount(
          root,
          '[data-deals-tag="\uB0B4\uCD94\uB7F4"]',
          naturalCount,
        ),
        setChipCount(
          root,
          '[data-deals-tag="\uBC14\uB85C\uBC30\uC1A1"]',
          readyCount,
        ),
        syncPriceBandChipCounts(root, priceBandCounts, priceFilterConfig),
        setChipCount(root, '[data-deals-stock="available"]', availableCount));
    }
  }
  function updateCountsFromCards(root) {
    if (hasFilterChipCounters(root)) {
      var priceFilterConfig = getPriceFilterConfig(root),
        total = 0,
        redCount = 0,
        whiteCount = 0,
        sparklingCount = 0,
        naturalCount = 0,
        readyCount = 0,
        priceBandCounts = createPriceBandCounts(priceFilterConfig),
        availableCount = 0;
      (getCards(root).forEach(function (card) {
        var tags = String(card.dataset.tags || "")
            .split("|")
            .map(function (tag) {
              return tag.trim();
            })
            .filter(Boolean),
          priceBand = getNormalizedCardPriceBand(card, priceFilterConfig),
          stockState = String(card.dataset.stockState || "").trim();
        ((total += 1),
          tags.indexOf("\uB808\uB4DC") !== -1 && (redCount += 1),
          tags.indexOf("\uD654\uC774\uD2B8") !== -1 && (whiteCount += 1),
          tags.indexOf("\uC2A4\uD30C\uD074\uB9C1") !== -1 &&
            (sparklingCount += 1),
          tags.indexOf("\uB0B4\uCD94\uB7F4") !== -1 && (naturalCount += 1),
          tags.indexOf("\uBC14\uB85C\uBC30\uC1A1") !== -1 && (readyCount += 1),
          stockState === "available" && (availableCount += 1),
          incrementPriceBandCount(priceBandCounts, priceBand));
      }),
        setChipCount(root, '[data-deals-tag=""]', total),
        setChipCount(root, '[data-deals-tag="\uB808\uB4DC"]', redCount),
        setChipCount(root, '[data-deals-tag="\uD654\uC774\uD2B8"]', whiteCount),
        setChipCount(
          root,
          '[data-deals-tag="\uC2A4\uD30C\uD074\uB9C1"]',
          sparklingCount,
        ),
        setChipCount(
          root,
          '[data-deals-tag="\uB0B4\uCD94\uB7F4"]',
          naturalCount,
        ),
        setChipCount(
          root,
          '[data-deals-tag="\uBC14\uB85C\uBC30\uC1A1"]',
          readyCount,
        ),
        syncPriceBandChipCounts(root, priceBandCounts, priceFilterConfig),
        setChipCount(root, '[data-deals-stock="available"]', availableCount));
    }
  }
  function sortCards(root, state) {
    var grid = root.querySelector("[data-deals-grid]"),
      cards = getCards(root);
    !(grid instanceof HTMLElement) ||
      !cards.length ||
      cards
        .sort(function (left, right) {
          if (state.sort === "closing") {
            var closingDelta =
              toInteger(left.dataset.sortClosing, 999999999) -
              toInteger(right.dataset.sortClosing, 999999999);
            if (closingDelta !== 0) return closingDelta;
          } else if (state.sort === "latest") {
            var latestDelta =
              toInteger(right.dataset.sortLatest, 0) -
              toInteger(left.dataset.sortLatest, 0);
            if (latestDelta !== 0) return latestDelta;
          }
          return (
            toInteger(left.dataset.sortPopularity, 999999) -
            toInteger(right.dataset.sortPopularity, 999999)
          );
        })
        .forEach(function (card) {
          grid.appendChild(card);
        });
  }
  function applyFilters(root, state) {
    var matchedCards = [],
      normalizedQuery = normalizeText(state.query),
      priceFilterConfig = getPriceFilterConfig(root);
    getCards(root).forEach(function (card) {
      var searchIndex = normalizeText(card.dataset.searchIndex || ""),
        tags = String(card.dataset.tags || "")
          .split("|")
          .map(function (tag) {
            return tag.trim();
          })
          .filter(Boolean),
        priceBand = getNormalizedCardPriceBand(card, priceFilterConfig),
        stockState = String(card.dataset.stockState || "").trim(),
        matchesQuery =
          !normalizedQuery || searchIndex.indexOf(normalizedQuery) !== -1,
        matchesTag = !state.tag || tags.indexOf(state.tag) !== -1,
        matchesPrice = !state.price || priceBand === state.price,
        matchesStock = !state.stock || stockState === state.stock,
        isVisible = matchesQuery && matchesTag && matchesPrice && matchesStock;
      ((card.hidden = !isVisible), isVisible && matchedCards.push(card));
    });
    var totalMatches = matchedCards.length,
      totalCount = getTotalItems(root);
    (syncResultSummary(root, totalMatches, totalCount),
      renderPagination(root, state, totalCount));
  }
  function render(root, state) {
    (syncViewStateUi(root, state),
      sortCards(root, state),
      applyFilters(root, state));
  }
  function isLatestOnlyState(state) {
    return !!(
      state &&
      state.sort === "latest" &&
      !state.query &&
      !state.tag &&
      !state.price &&
      !state.stock
    );
  }
  function sortProductsForState(products, state) {
    return products.slice().sort(function (left, right) {
      if (state.sort === "closing") {
        var leftInventory = getProductSortClosingValue(left),
          rightInventory = getProductSortClosingValue(right);
        if (leftInventory !== rightInventory)
          return leftInventory - rightInventory;
      }
      return state.sort === "latest"
        ? getProductSortLatestValue(right) - getProductSortLatestValue(left)
        : 0;
    });
  }
  function getCollectorDisplayMeta(product, collector) {
    var hasCollector = !!(
        collector &&
        (collector.followHandle || collector.displayName)
      ),
      collectorName = hasCollector
        ? collector.displayName || collector.followName
        : "\uCEEC\uB809\uD130 \uBBF8\uC9C0\uC815",
      collectorMeta = hasCollector
        ? [product.vendor, collector.handleLabel].filter(Boolean).join(" \xB7 ")
        : product.vendor || "",
      subtitle = [product.product_type || "Curated wine", product.vendor || ""]
        .filter(Boolean)
        .join(" \xB7 ");
    return { collectorName, collectorMeta, subtitle };
  }
  function getCachedKnownTags(product) {
    if (product && Array.isArray(product.__townwineDealsKnownTags))
      return product.__townwineDealsKnownTags;
    var tags = getKnownTags(product);
    return (product && (product.__townwineDealsKnownTags = tags), tags);
  }
  function getProductSearchIndex(product, collector) {
    if (product && typeof product.__townwineDealsSearchIndex == "string")
      return product.__townwineDealsSearchIndex;
    var displayMeta = getCollectorDisplayMeta(product, collector),
      searchIndex = normalizeText(
        [
          product.title,
          product.vendor,
          displayMeta.collectorName,
          displayMeta.collectorMeta,
          displayMeta.subtitle,
          getCachedKnownTags(product).join(" "),
        ].join(" "),
      );
    return (
      product && (product.__townwineDealsSearchIndex = searchIndex),
      searchIndex
    );
  }
  function getProductStockState(product) {
    return hasAvailableVariant(product) ? "available" : "soldout";
  }
  function getProductSortClosingValue(product) {
    if (product && typeof product.__townwineDealsSortClosing == "number")
      return product.__townwineDealsSortClosing;
    var available = hasAvailableVariant(product),
      inventoryPreview = getInventoryPreview(product),
      sortClosing = 999999;
    return (
      inventoryPreview.inventoryTracked &&
        (sortClosing = inventoryPreview.remainingInventory),
      available || (sortClosing += 1e6),
      product && (product.__townwineDealsSortClosing = sortClosing),
      sortClosing
    );
  }
  function getProductSortLatestValue(product) {
    if (product && typeof product.__townwineDealsSortLatest == "number")
      return product.__townwineDealsSortLatest;
    var latestValue =
      new Date((product && product.created_at) || 0).getTime() || 0;
    return (
      product && (product.__townwineDealsSortLatest = latestValue),
      latestValue
    );
  }
  function matchesProductForState(
    product,
    collector,
    state,
    priceFilterConfig,
    normalizedQuery,
  ) {
    var tags = getCachedKnownTags(product),
      priceBand = getPriceBand(product, priceFilterConfig),
      stockState = getProductStockState(product),
      searchIndex = getProductSearchIndex(product, collector);
    return (
      (!normalizedQuery || searchIndex.indexOf(normalizedQuery) !== -1) &&
      (!state.tag || tags.indexOf(state.tag) !== -1) &&
      (!state.price || priceBand === state.price) &&
      (!state.stock || stockState === state.stock)
    );
  }
  function filterProductsForState(
    products,
    collectorDetails,
    state,
    priceFilterConfig,
  ) {
    var normalizedQuery = normalizeText(state.query);
    return products.filter(function (product) {
      return matchesProductForState(
        product,
        collectorDetails[product.handle] || {},
        state,
        priceFilterConfig,
        normalizedQuery,
      );
    });
  }
  function buildLatestProductsRequestUrl(root, state) {
    var currentPage = getLogicalPageFromBasePage(
      state.basePage,
      state.pageSize,
    );
    return buildLatestProductsPageRequestUrl(root, currentPage, state.pageSize);
  }
  function buildAllLatestProductsRequestUrl(root) {
    var proxyBase =
        root instanceof HTMLElement && root.dataset.proxyBase
          ? String(root.dataset.proxyBase).trim()
          : DEFAULT_PROXY_BASE,
      params = new URLSearchParams();
    return (
      params.set("all", "1"),
      proxyBase + LATEST_PRODUCTS_ENDPOINT_PATH + "?" + params.toString()
    );
  }
  function buildLatestProductsPageRequestUrl(root, page, pageSize) {
    var proxyBase =
        root instanceof HTMLElement && root.dataset.proxyBase
          ? String(root.dataset.proxyBase).trim()
          : DEFAULT_PROXY_BASE,
      params = new URLSearchParams();
    return (
      params.set("page", String(Math.max(1, toInteger(page, 1)))),
      params.set("page_size", String(parsePageSize(pageSize))),
      proxyBase + LATEST_PRODUCTS_ENDPOINT_PATH + "?" + params.toString()
    );
  }
  function hasGlobalFilterState(state) {
    return !!(
      state &&
      (state.query || state.tag || state.price || state.stock)
    );
  }
  function buildFallbackCollectorDetails(product) {
    var fallbackName = parseCollectorNameFromTitle(product && product.title);
    return fallbackName
      ? {
          followHandle: "",
          followName: fallbackName,
          displayName: fallbackName,
          handleLabel: "",
          collectorUrl: "",
        }
      : {};
  }
  function appendLatestProductsPayload(target, payload) {
    var pageProducts = Array.isArray(payload && payload.products)
        ? payload.products
        : [],
      pageCollectorDetails =
        payload &&
        payload.collectorDetails &&
        typeof payload.collectorDetails == "object"
          ? payload.collectorDetails
          : {};
    return (
      pageProducts.forEach(function (product) {
        var handle = String((product && product.handle) || "").trim();
        !handle ||
          target.seenHandles.has(handle) ||
          (target.seenHandles.add(handle),
          target.products.push(product),
          target.collectorDetails[handle] ||
            (target.collectorDetails[handle] =
              buildFallbackCollectorDetails(product)));
      }),
      Object.keys(pageCollectorDetails).forEach(function (handle) {
        target.collectorDetails[handle] = pageCollectorDetails[handle];
      }),
      pageProducts.length
    );
  }
  async function fetchAllLatestDealsPayloadPaginated(root) {
    for (
      var page = 1,
        pageSize = ALL_LATEST_PREFETCH_PAGE_SIZE,
        hasNextPage = !0,
        accumulator = {
          products: [],
          collectorDetails: {},
          seenHandles: new Set(),
        };
      hasNextPage;
    ) {
      var payload = await fetchJson(
          buildLatestProductsPageRequestUrl(root, page, pageSize),
        ),
        previousCount = accumulator.products.length,
        pageProductCount = appendLatestProductsPayload(accumulator, payload);
      if (payload.hasNextPage && accumulator.products.length === previousCount)
        throw new Error("PAGINATION_STALLED");
      if (
        ((hasNextPage = !!(payload && payload.hasNextPage)),
        (page += 1),
        !pageProductCount)
      )
        break;
    }
    return {
      page: 1,
      pageSize: accumulator.products.length,
      hasNextPage: !1,
      products: accumulator.products,
      collectorDetails: accumulator.collectorDetails,
    };
  }
  async function fetchAllLatestDealsPayload(root) {
    if (window.__townwineDealsAllLatestPayloadPromise)
      return window.__townwineDealsAllLatestPayloadPromise;
    var request = window.TownWineCatalog.load()
      .then(function (payload) {
        return ((window.__townwineDealsAllLatestPayload = payload), payload);
      })
      .catch(function (error) {
        throw ((window.__townwineDealsAllLatestPayloadPromise = null), error);
      });
    return ((window.__townwineDealsAllLatestPayloadPromise = request), request);
  }
  function showDealsLoadError(root, state) {
    var grid = root.querySelector("[data-deals-grid]");
    return (
      setLatestPendingState(!1),
      grid &&
        (grid.removeAttribute("aria-busy"),
        (grid.innerHTML =
          '<div role="status">\uC0C1\uD488\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. <button type="button" class="btn btn--ivory" data-deals-retry>\uB2E4\uC2DC \uC2DC\uB3C4</button></div>'),
        grid
          .querySelector("[data-deals-retry]")
          .addEventListener("click", function () {
            hasGlobalFilterState(state)
              ? hydrateAllFilteredProducts(root, state)
              : hydrateLatestProductsPage(root, state);
          })),
      !1
    );
  }
  function warmAllLatestDealsPayload(root, state) {
    if (
      !(!(root instanceof HTMLElement) || root.__townwineDealsPrefetchScheduled)
    ) {
      root.__townwineDealsPrefetchScheduled = !0;
      var run = function () {
        fetchAllLatestDealsPayload(root)
          .then(function (payload) {
            ((root.__townwineDealsAllLatestPayload = payload),
              syncAggregateCountsFromPayload(root, state, payload));
          })
          .catch(function (error) {
            (setAggregateCountsPending(root, !1), updateCountsFromCards(root));
            var totalNode = root.querySelector("[data-deals-total-count]");
            (totalNode instanceof HTMLElement &&
              (totalNode.textContent = String(getCards(root).length)),
              console.warn(
                "[townwine-deals] all-products prefetch failed",
                error,
              ));
          });
      };
      window.setTimeout(run, 0);
    }
  }
  function renderLatestProductsPayload(root, state, payload) {
    var grid = root.querySelector("[data-deals-grid]"),
      proxyBase = root.dataset.proxyBase || DEFAULT_PROXY_BASE,
      priceFilterConfig = getPriceFilterConfig(root),
      products = sortProductsForState(
        Array.isArray(payload && payload.products) ? payload.products : [],
        state,
      ),
      collectorDetails =
        payload &&
        payload.collectorDetails &&
        typeof payload.collectorDetails == "object"
          ? payload.collectorDetails
          : {},
      currentPage = getLogicalPageFromBasePage(state.basePage, state.pageSize),
      startIndex = (currentPage - 1) * state.pageSize;
    return grid instanceof HTMLElement
      ? ((root.dataset.dealsGlobalFilter = "false"),
        syncTotalItemsDataset(root, products.length),
        (grid.innerHTML = products
          .map(function (product, index) {
            return buildCardMarkup(
              product,
              collectorDetails[product.handle] || {},
              proxyBase,
              startIndex + index,
              priceFilterConfig,
            );
          })
          .join("")),
        setLatestHydratedState(root, !0),
        updateCounts(root, products),
        grid.removeAttribute("aria-busy"),
        initializeInteractiveCards(root),
        render(root, state),
        setLatestPendingState(!1),
        !hasGlobalFilterState(state) &&
          window.__townwineDealsAllLatestPayloadPromise &&
          window.__townwineDealsAllLatestPayloadPromise
            .then(function (allPayload) {
              root.dataset.dealsGlobalFilter === "false" &&
                !hasGlobalFilterState(state) &&
                syncAggregateCountsFromPayload(root, state, allPayload);
            })
            .catch(function () {}),
        !0)
      : !1;
  }
  function renderAllLatestProductsPayload(root, state, payload) {
    var grid = root.querySelector("[data-deals-grid]"),
      proxyBase = root.dataset.proxyBase || DEFAULT_PROXY_BASE,
      priceFilterConfig = getPriceFilterConfig(root),
      allProducts = Array.isArray(payload && payload.products)
        ? payload.products
        : [],
      collectorDetails =
        payload &&
        payload.collectorDetails &&
        typeof payload.collectorDetails == "object"
          ? payload.collectorDetails
          : {},
      products = sortProductsForState(
        filterProductsForState(
          allProducts,
          collectorDetails,
          state,
          priceFilterConfig,
        ),
        state,
      ),
      currentPage = Math.max(
        1,
        getLogicalPageFromBasePage(state.basePage, state.pageSize),
      ),
      totalPages = Math.max(
        1,
        Math.ceil(Math.max(products.length, 1) / state.pageSize),
      ),
      safePage = Math.min(currentPage, totalPages),
      startIndex = (safePage - 1) * state.pageSize,
      pageProducts = products.slice(startIndex, startIndex + state.pageSize);
    return grid instanceof HTMLElement
      ? ((root.__townwineDealsAllLatestPayload = payload),
        (root.dataset.dealsGlobalFilter = "true"),
        setAggregateCountsPending(root, !1),
        (state.basePage = getBasePageForLogicalPage(safePage, state.pageSize)),
        syncTotalItemsDataset(root, products.length),
        (grid.innerHTML = pageProducts
          .map(function (product, index) {
            return buildCardMarkup(
              product,
              collectorDetails[product.handle] || {},
              proxyBase,
              startIndex + index,
              priceFilterConfig,
            );
          })
          .join("")),
        setLatestHydratedState(root, !0),
        updateCounts(root, allProducts),
        setGridBusyState(root, !1),
        initializeInteractiveCards(root),
        syncViewStateUi(root, state),
        syncResultSummary(root, pageProducts.length, products.length),
        renderPagination(root, state, products.length),
        setLatestPendingState(!1),
        !0)
      : !1;
  }
  async function hydrateAllFilteredProducts(root, state) {
    var grid = root.querySelector("[data-deals-grid]");
    if (!(grid instanceof HTMLElement)) return !1;
    var cachedPayload = getResolvedAllLatestDealsPayload(root);
    if (cachedPayload)
      return renderAllLatestProductsPayload(root, state, cachedPayload);
    if (root.dataset.dealsGlobalFilter === "true")
      return (syncViewStateUi(root, state), setLatestPendingState(!1), !0);
    var requestId = (root.__townwineDealsRequestId || 0) + 1;
    ((root.__townwineDealsRequestId = requestId),
      setGridBusyState(root, !0),
      setLatestPendingState(!0));
    try {
      var payload = await fetchAllLatestDealsPayload(root);
      return root.__townwineDealsRequestId !== requestId
        ? !0
        : ((root.__townwineDealsAllLatestPayload = payload),
          renderAllLatestProductsPayload(root, state, payload));
    } catch (error) {
      return (
        setLatestPendingState(!1),
        console.warn(
          "[townwine-deals] all-products filter fetch failed",
          error,
        ),
        showDealsLoadError(root, state)
      );
    }
  }
  async function hydrateLatestProductsPage(root, state, options) {
    var grid = root.querySelector("[data-deals-grid]");
    if (!(grid instanceof HTMLElement)) return !1;
    var requestId = (root.__townwineDealsRequestId || 0) + 1,
      silent = !!(options && options.silent);
    ((root.__townwineDealsRequestId = requestId),
      silent ||
        (grid.setAttribute("aria-busy", "true"), setLatestPendingState(!0)));
    try {
      var allPayload = await fetchAllLatestDealsPayload(root),
        currentPage = getLogicalPageFromBasePage(
          state.basePage,
          state.pageSize,
        ),
        latestPayload = Object.assign({}, allPayload, {
          products: allPayload.products.slice(
            (currentPage - 1) * state.pageSize,
            currentPage * state.pageSize,
          ),
        });
      return root.__townwineDealsRequestId !== requestId
        ? !0
        : renderLatestProductsPayload(root, state, latestPayload);
    } catch (proxyError) {
      return (
        silent || setLatestPendingState(!1),
        console.warn(
          "[townwine-deals] latest proxy fetch failed, keeping server-rendered grid",
          proxyError,
        ),
        showDealsLoadError(root, state)
      );
    }
  }
  async function initializeLatestDefaultView(root, state) {
    var initialized = await hydrateLatestProductsPage(root, state, {
      skipExtraPages: !0,
    });
    return initialized;
  }
  async function updateDealsView(root, state) {
    return hasGlobalFilterState(state)
      ? hydrateAllFilteredProducts(root, state)
      : root.dataset.dealsGlobalFilter === "true"
        ? hydrateLatestProductsPage(root, state)
        : (render(root, state), !0);
  }
  function handleExchangeRateUpdated(root, state) {
    if (shouldWaitForDealsHydration(root, state)) {
      (setGridBusyState(root, !0), setLatestPendingState(!0));
      return;
    }
    if (hasGlobalFilterState(state)) {
      hydrateAllFilteredProducts(root, state).catch(function (error) {
        console.warn(
          "[townwine-deals] exchange rate filtered refresh failed",
          error,
        );
      });
      return;
    }
    (updateCountsFromCards(root), render(root, state));
  }
  function buildPageRequestUrl(root, basePage) {
    var params = new URLSearchParams();
    basePage > 1 && params.set("page", String(basePage));
    var baseUrl =
      root instanceof HTMLElement && root.dataset.pageUrl
        ? root.dataset.pageUrl
        : window.location.pathname;
    return baseUrl + (params.toString() ? "?" + params.toString() : "");
  }
  async function appendExtraServerPages(root, state) {
    var grid = root.querySelector("[data-deals-grid]"),
      totalBasePages = Math.max(1, toInteger(root.dataset.baseTotalPages, 1)),
      targetBasePages = getBasePagesPerView(state.pageSize),
      loadKey = String(state.basePage) + ":" + String(state.pageSize);
    if (
      !(
        !(grid instanceof HTMLElement) ||
        !grid.querySelector("[data-deal-card]") ||
        targetBasePages <= 1 ||
        grid.dataset.dealsLoadKey === loadKey
      )
    ) {
      grid.dataset.dealsLoadKey = loadKey;
      for (
        var requests = [], offset = 1;
        offset < targetBasePages;
        offset += 1
      ) {
        var nextBasePage = state.basePage + offset;
        if (nextBasePage > totalBasePages) break;
        requests.push(
          fetchText(buildPageRequestUrl(root, nextBasePage)).then(
            function (html) {
              var doc = new DOMParser().parseFromString(
                String(html || ""),
                "text/html",
              );
              return toArray(
                doc.querySelectorAll(
                  "[data-townwine-deals] [data-deals-grid] [data-deal-card]",
                ),
              )
                .map(function (card) {
                  return card.outerHTML;
                })
                .join("");
            },
          ),
        );
      }
      var markupChunks = await Promise.all(requests);
      markupChunks.forEach(function (markup) {
        markup && grid.insertAdjacentHTML("beforeend", markup);
      });
    }
  }
  function initializeInteractiveCards(root) {
    (window.TownWineFollow &&
      typeof window.TownWineFollow.init == "function" &&
      window.TownWineFollow.init(root),
      window.TownWineCollectorStats &&
        typeof window.TownWineCollectorStats.init == "function" &&
        window.TownWineCollectorStats.init(root));
  }
  async function initializeServerRenderedGrid(root, state, options) {
    var grid = root.querySelector("[data-deals-grid]"),
      skipExtraPages = !!(options && options.skipExtraPages);
    return !(grid instanceof HTMLElement) ||
      !grid.querySelector("[data-deal-card]")
      ? !1
      : (skipExtraPages || (await appendExtraServerPages(root, state)),
        syncTotalItemsDataset(root, getCards(root).length),
        updateCountsFromCards(root),
        initializeInteractiveCards(root),
        render(root, state),
        setLatestHydratedState(root, !0),
        !0);
  }
  function initialize(root) {
    if (!(root instanceof HTMLElement) || root.dataset.dealsReady === "true")
      return;
    root.dataset.dealsReady = "true";
    var state = getStateFromUrl(root);
    (root.setAttribute("data-default-latest-view", "true"),
      setLatestHydratedState(root, !isLatestOnlyState(state)),
      ensureLatestLoadingSkeleton(root),
      stripFilterCountUi(root),
      ensurePriceFilterButtons(root),
      ensureExchangeRateLoaded(root.dataset.proxyBase || DEFAULT_PROXY_BASE),
      setLatestPendingState(isLatestOnlyState(state)),
      ensureDealsScaffold(root));
    var searchInput = root.querySelector("[data-deals-search]"),
      applySearchInputValue = function () {
        searchInput instanceof HTMLInputElement &&
          ((state.query = searchInput.value),
          (state.basePage = 1),
          applyStateChange(root, state));
      },
      scheduleSearchUpdate = debounce(
        applySearchInputValue,
        SEARCH_DEBOUNCE_MS,
      ),
      searchFrameId = 0;
    function handleSearchInput() {
      if (searchInput instanceof HTMLInputElement) {
        if (getResolvedAllLatestDealsPayload(root)) {
          (typeof scheduleSearchUpdate.cancel == "function" &&
            scheduleSearchUpdate.cancel(),
            searchFrameId &&
              typeof window.cancelAnimationFrame == "function" &&
              window.cancelAnimationFrame(searchFrameId));
          var runSearchUpdate = function () {
            ((searchFrameId = 0), applySearchInputValue());
          };
          typeof window.requestAnimationFrame == "function"
            ? (searchFrameId = window.requestAnimationFrame(runSearchUpdate))
            : runSearchUpdate();
          return;
        }
        scheduleSearchUpdate();
      }
    }
    searchInput instanceof HTMLInputElement &&
      searchInput.addEventListener("input", handleSearchInput);
    var searchTrigger = root.querySelector("[data-deals-search-trigger]");
    (searchTrigger instanceof HTMLButtonElement &&
      searchInput instanceof HTMLInputElement &&
      searchTrigger.addEventListener("click", function () {
        (typeof scheduleSearchUpdate.cancel == "function" &&
          scheduleSearchUpdate.cancel(),
          (state.query = searchInput.value),
          (state.basePage = 1),
          applyStateChange(root, state),
          searchInput.focus());
      }),
      toArray(root.querySelectorAll("[data-deals-tag]")).forEach(
        function (button) {
          button.addEventListener("click", function () {
            ((state.tag = String(button.dataset.dealsTag || "").trim()),
              (state.basePage = 1),
              applyStateChange(root, state));
          });
        },
      ),
      toArray(root.querySelectorAll("[data-deals-price]")).forEach(
        function (button) {
          button.addEventListener("click", function () {
            var nextValue = normalizePriceFilterValue(
              button.dataset.dealsPrice,
              getPriceFilterConfig(root),
            );
            ((state.price = state.price === nextValue ? "" : nextValue),
              (state.basePage = 1),
              applyStateChange(root, state));
          });
        },
      ),
      toArray(root.querySelectorAll("[data-deals-stock]")).forEach(
        function (button) {
          button.addEventListener("click", function () {
            var nextValue = String(button.dataset.dealsStock || "").trim();
            ((state.stock = state.stock === nextValue ? "" : nextValue),
              (state.sort = "latest"),
              (state.basePage = 1),
              applyStateChange(root, state));
          });
        },
      ),
      toArray(root.querySelectorAll("[data-deals-sort]")).forEach(
        function (button) {
          button.addEventListener("click", function () {
            ((state.sort =
              String(button.dataset.dealsSort || "latest").trim() || "latest"),
              (state.stock = ""),
              (state.basePage = 1),
              applyStateChange(root, state));
          });
        },
      ),
      toArray(root.querySelectorAll("[data-deals-page-size]")).forEach(
        function (button) {
          button.addEventListener("click", function () {
            var nextPageSize = parsePageSize(button.dataset.dealsPageSize);
            nextPageSize !== state.pageSize &&
              window.location.assign(getPageSizeUrl(root, state, nextPageSize));
          });
        },
      ),
      window.addEventListener("townwine:exchange-rate-updated", function () {
        handleExchangeRateUpdated(root, state);
      }),
      hydratePaginationDataset(root, state)
        .then(function () {
          return (
            ensureDealsScaffold(root),
            hasGlobalFilterState(state)
              ? hydrateAllFilteredProducts(root, state)
              : isLatestOnlyState(state)
                ? initializeLatestDefaultView(root, state)
                : initializeServerRenderedGrid(root, state)
          );
        })
        .then(function (initialized) {
          if (!initialized)
            return hasGlobalFilterState(state)
              ? hydrateAllFilteredProducts(root, state)
              : isLatestOnlyState(state)
                ? initializeLatestDefaultView(root, state)
                : initializeServerRenderedGrid(root, state);
        })
        .catch(function (error) {
          (console.error("[townwine-deals] failed to hydrate products", error),
            render(root, state),
            setLatestPendingState(!1));
          var grid = root.querySelector("[data-deals-grid]");
          grid instanceof HTMLElement && grid.removeAttribute("aria-busy");
        }));
  }
  function boot(root) {
    toArray((root || document).querySelectorAll(ROOT_SELECTOR)).forEach(
      function (element) {
        initialize(element);
      },
    );
  }
  (document.addEventListener("shopify:section:load", function (event) {
    boot(event.target);
  }),
    document.readyState === "loading"
      ? document.addEventListener("DOMContentLoaded", function () {
          boot(document);
        })
      : boot(document));
})();
//# sourceMappingURL=/cdn/shop/t/21/assets/townwine-deals-v20260602-global20-live.js.map?cb=20260602-searchspeed-latest&v=148964795402949070991789708429
