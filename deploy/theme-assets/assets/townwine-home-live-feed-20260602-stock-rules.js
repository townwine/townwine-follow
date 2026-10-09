(function () {
  var DEFAULT_KRW_RATE = 193.2755;
  var MAX_RECOMMENDATIONS = 12;
  var MAX_COLLECTORS = 6;
  var MAX_UPCOMING = 4;
  var MAX_PRODUCT_FETCH = 24;
  var DEFAULT_PROXY_BASE = '/apps/townwine-follow';
  var LATEST_PRODUCTS_ENDPOINT_PATH = '/deals-latest';
  var FOLLOW_LABEL = '팔로우';
  var FOLLOWING_LABEL = '팔로잉';
  var LIVE_COLLECTOR_EMPTY_MESSAGE = '지금 공구 중인 컬렉터가 없습니다.';

  function normalizeRate(value) {
    var parsedValue = Number(value || 0);
    return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : DEFAULT_KRW_RATE;
  }

  function getKstDateString() {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
    } catch (error) {
      return '';
    }
  }

  function formatKrwFromHkdCents(priceCents, rate) {
    var amount = (Number(priceCents || 0) / 100) * normalizeRate(rate);
    return 'KRW ₩' + Math.round(amount).toLocaleString('ko-KR');
  }

  function applyExchangeRateToDom(rate) {
    Array.prototype.slice.call(
      document.querySelectorAll('[data-krw-price-target][data-hkd-price-cents]'),
    ).forEach(function (node) {
      node.textContent = formatKrwFromHkdCents(node.dataset.hkdPriceCents, rate);
    });
  }

  function setGlobalExchangeRate(snapshot) {
    window.TownWineExchangeRate = Object.assign({}, window.TownWineExchangeRate || {}, snapshot || {});
    window.TownWineExchangeRate.rate = normalizeRate(window.TownWineExchangeRate.rate);
    return window.TownWineExchangeRate;
  }

  function getManualExchangeRateConfig() {
    return Object.assign(
      {
        rate: DEFAULT_KRW_RATE,
        source: 'google_finance_hkd_krw',
        referenceDate: getKstDateString(),
        referenceUrl: 'https://www.google.com/finance/beta/quote/HKD-KRW?hl=ko',
      },
      window.TownWineExchangeRateConfig || {},
    );
  }

  function ensureExchangeRateLoaded(proxyBase) {
    var config = getManualExchangeRateConfig();
    var nextSnapshot = setGlobalExchangeRate({
      rate: config.rate,
      updatedAt: '',
      source: config.source,
      referenceDate: config.referenceDate,
      referenceUrl: config.referenceUrl,
    });

    applyExchangeRateToDom(nextSnapshot.rate);

    if (window.TownWineExchangeRatePromise) {
      return window.TownWineExchangeRatePromise;
    }

    window.TownWineExchangeRatePromise = Promise.resolve(nextSnapshot);
    window.dispatchEvent(
      new CustomEvent('townwine:exchange-rate-updated', {
        detail: nextSnapshot,
      }),
    );

    return window.TownWineExchangeRatePromise;
  }

  function bootInteractiveWidgets(root) {
    if (!(root instanceof HTMLElement)) {
      return;
    }

    if (window.TownWineFollow && typeof window.TownWineFollow.init === 'function') {
      window.TownWineFollow.init(root);
    }

    if (window.TownWineCollectorStats && typeof window.TownWineCollectorStats.init === 'function') {
      window.TownWineCollectorStats.init(root);
    }

    if (window.TownWineOpenAlert && typeof window.TownWineOpenAlert.init === 'function') {
      window.TownWineOpenAlert.init(root);
    }
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeHandle(value) {
    return String(value || '')
      .trim()
      .replace(/^@+/, '')
      .replace(/\/+$/, '')
      .toLowerCase();
  }

  function extractCollectorHandleFromUrl(url) {
    var rawUrl = String(url || '').trim();

    if (!rawUrl) {
      return '';
    }

    try {
      var parsedUrl = new URL(rawUrl, window.location.origin);
      var pathParts = String(parsedUrl.pathname || '')
        .split('/')
        .filter(Boolean);

      if (pathParts.length >= 3 && pathParts[0] === 'pages' && pathParts[1] === 'collector') {
        return normalizeHandle(decodeURIComponent(pathParts[2] || ''));
      }
    } catch (error) {
      // Fall back to a regex parse for relative paths or malformed values.
    }

    var pathMatch = rawUrl.match(/\/pages\/collector\/([^/?#]+)/i);
    return normalizeHandle(pathMatch && pathMatch[1] ? decodeURIComponent(pathMatch[1]) : '');
  }

  function resolveCollectorIdentity(collector) {
    var followHandle = normalizeHandle(collector && collector.followHandle);
    var urlHandle = extractCollectorHandleFromUrl(collector && collector.collectorUrl);
    var handleLabel = normalizeHandle(collector && collector.handleLabel);
    var displayName = String(
      (collector && (collector.displayName || collector.followName)) || '',
    ).trim();
    var displayNameKey = normalizeHandle(displayName);
    var dedupeKey = followHandle || urlHandle || handleLabel || displayNameKey;
    var resolvedHandle = followHandle || urlHandle || handleLabel || '';

    return {
      dedupeKey: dedupeKey,
      followHandle: resolvedHandle,
      followName: String((collector && (collector.followName || displayName)) || '').trim(),
      displayName: displayName || resolvedHandle,
      handleLabel:
        String((collector && collector.handleLabel) || '').trim() ||
        (resolvedHandle ? '@' + resolvedHandle : ''),
      collectorUrl: String((collector && collector.collectorUrl) || '').trim(),
    };
  }

  function formatMoney(value) {
    var amount = Number(value || 0);
    return 'HKD ' + amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function getKrwRate() {
    var globalRate =
      window.TownWineExchangeRate && Number(window.TownWineExchangeRate.rate || 0);

    return normalizeRate(globalRate || getManualExchangeRateConfig().rate);
  }

  function formatKrwMoney(value) {
    var amount = Number(value || 0) * getKrwRate();
    return 'KRW ₩' + Math.round(amount).toLocaleString('ko-KR');
  }

  function isVariantInStock(variant) {
    if (!variant || !variant.available) {
      return false;
    }

    var inventory = Number(variant.inventory_quantity);

    if (Number.isFinite(inventory)) {
      return inventory > 0;
    }

    return true;
  }

  function getFirstAvailableVariant(product) {
    var variants = Array.isArray(product && product.variants) ? product.variants : [];
    return variants.find(isVariantInStock) || null;
  }

  function hasAvailableVariant(product) {
    var variants = Array.isArray(product && product.variants) ? product.variants : [];

    return variants.some(isVariantInStock);
  }

  function getVariantIds(product) {
    var variants = Array.isArray(product && product.variants) ? product.variants : [];

    return variants
      .map(function (variant) {
        return variant && variant.id != null ? String(variant.id).trim() : '';
      })
      .filter(Boolean)
      .join(',');
  }

  async function fetchJson(url) {
    var lastError;
    for (var attempt = 0; attempt < 3; attempt += 1) {
      try {
        var requestUrl = new URL(url, window.location.origin);
        requestUrl.searchParams.set('_tw', String(Date.now()) + '-' + attempt);
        var response = await fetch(requestUrl.pathname + requestUrl.search, {
          credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }
        });
        if (!response.ok) throw new Error('PRODUCTS_REQUEST_FAILED');
        var payload = await response.json();
        if (!payload || payload.error) throw new Error('INVALID_PRODUCTS_RESPONSE');
        return payload;
      } catch (error) { lastError = error; }
    }
    throw lastError;
  }

  function fetchText(url) {
    return fetch(url, {
      credentials: 'same-origin',
      headers: { Accept: 'text/html' },
    }).then(function (response) {
      if (!response.ok) {
        throw new Error('PRODUCT_HTML_REQUEST_FAILED');
      }

      return response.text();
    });
  }

  function getText(node) {
    return node && typeof node.textContent === 'string' ? node.textContent.trim() : '';
  }

  function parseCollectorData(html) {
    var doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    var followButton = doc.querySelector('.js-follow-btn[data-influencer-handle]');
    var nameNode = doc.querySelector('.imini__nm a, .imini__nm');
    var linkNode = doc.querySelector('.imini__nm a');
    var metaSpans = Array.prototype.slice.call(doc.querySelectorAll('.imini__h span'));
    var handleLabel = '';

    metaSpans.some(function (node) {
      var value = getText(node);

      if (value.indexOf('@') === 0) {
        handleLabel = value;
        return true;
      }

      return false;
    });

    var followHandle = normalizeHandle(
      followButton instanceof HTMLElement ? followButton.dataset.influencerHandle || '' : '',
    );
    var displayName = getText(nameNode);
    var supplierMeta = getText(doc.querySelector('.deal-h .imini__h'));

    return {
      followHandle: followHandle,
      followName:
        (followButton instanceof HTMLElement && followButton.dataset.influencerName) ||
        displayName ||
        '',
      displayName: displayName,
      handleLabel: handleLabel,
      collectorUrl:
        linkNode instanceof HTMLAnchorElement ? linkNode.getAttribute('href') || '' : '',
      supplierMeta: supplierMeta,
    };
  }

  function createImageMarkup(product) {
    var image = Array.isArray(product.images) && product.images.length ? product.images[0] : null;

    if (!image || !image.src) {
      return '<div class="tw-card-fallback" aria-hidden="true"></div>';
    }

    return (
      '<img src="' +
      escapeHtml(image.src) +
      '" class="tw-card-image" alt="' +
      escapeHtml(product.title) +
      '" loading="lazy">'
    );
  }

  function resolveHomeFeedLabels(recommendationPanel, collectorGrid) {
    var recommendationData = (recommendationPanel && recommendationPanel.dataset) || {};
    var collectorData = (collectorGrid && collectorGrid.dataset) || {};

    return {
      followLabel: FOLLOW_LABEL,
      followingLabel: FOLLOWING_LABEL,
      unassignedCollectorLabel:
        recommendationData.unassignedCollectorLabel || '컬렉터 미지정',
      inventorySummaryLoadingLabel:
        recommendationData.inventorySummaryLoadingLabel || '판매 수량 확인 중',
      inventoryCaptionLoadingLabel:
        recommendationData.inventoryCaptionLoadingLabel || '재고 정보 확인 중',
      recommendationCtaLabel: recommendationData.ctaLabel || '딜 자세히 보기',
      collectorEmptyLabel: collectorData.emptyLabel || LIVE_COLLECTOR_EMPTY_MESSAGE,
      collectorLiveLabel: collectorData.liveLabel || '진행 중',
      collectorLoadingFollowersLabel:
        collectorData.loadingFollowersLabel || '집계 중',
      collectorLoadingDealsLabel: collectorData.loadingDealsLabel || '집계 중',
      collectorsPageUrl: collectorData.collectorsPageUrl || '/pages/collectors',
    };
  }

  function buildFollowButton(collector, proxyBase, labels) {
    if (!collector.followHandle) {
      return '';
    }

    var followLabel = (labels && labels.followLabel) || FOLLOW_LABEL;
    var followingLabel = (labels && labels.followingLabel) || FOLLOWING_LABEL;

    return (
      '<button class="follow js-follow-btn" type="button" ' +
      'onclick="if (event) { event.__townwineFollowHandled = true; } if (window.TownWineFollow && typeof window.TownWineFollow.handleButtonClick === \'function\') { window.TownWineFollow.handleButtonClick(this, event); }" ' +
      'data-influencer-handle="' +
      escapeHtml(collector.followHandle) +
      '" ' +
      'data-influencer-name="' +
      escapeHtml(collector.followName || collector.displayName || '') +
      '" ' +
      'data-proxy-base="' +
      escapeHtml(proxyBase) +
      '" ' +
      'data-follow-label="' +
      escapeHtml(followLabel) +
      '" ' +
      'data-following-label="' +
      escapeHtml(followingLabel) +
      '" ' +
      'data-return-to="' +
      escapeHtml(window.location.pathname + window.location.search + window.location.hash) +
      '" ' +
      'aria-pressed="false">' +
      escapeHtml(followLabel) +
      '</button>'
    );
  }

  function buildRecommendationCard(product, collector, proxyBase, labels) {
    var available = hasAvailableVariant(product);
    var variant = getFirstAvailableVariant(product) || (product.variants || [])[0];

    if (!variant) {
      return '';
    }

    var hasCollector = Boolean(collector && (collector.followHandle || collector.displayName));
    var mainName = hasCollector
      ? collector.displayName || collector.followName
      : labels.unassignedCollectorLabel;
    var subLine = hasCollector
      ? [product.vendor, collector.handleLabel].filter(Boolean).join(' · ')
      : product.vendor || '';
    var profileUrl = hasCollector && collector.collectorUrl ? collector.collectorUrl : '';
    var initial = (mainName || product.vendor || '?').slice(0, 1);
    var subtitle = [product.product_type || 'Curated wine', product.vendor || '']
      .filter(Boolean)
      .join(' · ');
    var infoOpen = profileUrl ? '<a class="dc__ii" href="' + escapeHtml(profileUrl) + '">' : '<div class="dc__ii">';
    var infoClose = profileUrl ? '</a>' : '</div>';
    var variantIds = getVariantIds(product);

    return (
      '<article class="dc" data-townwine-product-card-url="/products/' +
      escapeHtml(product.handle) +
      '">' +
      '<a class="dc__m dc__m-link" href="/products/' +
      escapeHtml(product.handle) +
      '" aria-label="' +
      escapeHtml(product.title) +
      '">' +
      (available ? '' : '<div class="dc__b"><span class="bd bd--soft">공구 종료</span></div>') +
      createImageMarkup(product) +
      '</a>' +
      '<div class="dc__bd">' +
      '<div class="dc__inf">' +
      infoOpen +
      '<span class="mini">' +
      escapeHtml(initial) +
      '</span>' +
      '<div class="dc__nm">' +
      escapeHtml(mainName) +
      '<span>' +
      escapeHtml(subLine) +
      '</span></div>' +
      infoClose +
      buildFollowButton(collector, proxyBase, labels) +
      '</div>' +
      '<div><h3 class="dc__t"><a href="/products/' +
      escapeHtml(product.handle) +
      '">' +
      escapeHtml(product.title) +
      '</a><em>' +
      escapeHtml(subtitle) +
      '</em></h3></div>' +
      '<div class="pg" data-townwine-inventory-card data-variant-id="' +
      escapeHtml(variant.id) +
      '" data-variant-ids="' +
      escapeHtml(variantIds) +
      '" data-proxy-base="' +
      escapeHtml(proxyBase) +
      '">' +
      '<div class="pg__bar"><div class="pg__fl" style="width:0%" data-inventory-progress-bar></div></div>' +
      '<div class="pg__mt"><span data-inventory-summary>' +
      escapeHtml(available ? labels.inventorySummaryLoadingLabel : '공구 종료') +
      '</span><span data-inventory-caption>' +
      escapeHtml(available ? labels.inventoryCaptionLoadingLabel : '재고 없음') +
      '</span></div>' +
      '</div>' +
      '<div class="pr"><div class="pr__main"><span class="now">' +
      escapeHtml(formatMoney(variant.price)) +
      '</span></div><div class="pr__sub" data-krw-price-target data-hkd-price-cents="' +
      escapeHtml(Math.round(Number(variant.price || 0) * 100)) +
      '">' +
      escapeHtml(formatKrwMoney(variant.price)) +
      '</div></div>' +
      '<a class="btn ' + (available ? 'btn--dark' : 'btn--ivory') + ' btn--block dc__cta" href="/products/' +
      escapeHtml(product.handle) +
      '">' +
      escapeHtml(available ? labels.recommendationCtaLabel : '종료 딜 보기') +
      '</a>' +
      '</div></article>'
    );
  }

  function buildCollectorCard(collector, proxyBase, labels) {
    if (!collector || !collector.followHandle) {
      return '';
    }

    var displayName = collector.displayName || collector.followName || collector.followHandle;
    var profileUrl = collector.collectorUrl ? collector.collectorUrl.split("#")[0] + "#collector-history" : labels.collectorsPageUrl;
    var initial = displayName.slice(0, 1);

    return (
      '<article class="inf-card">' +
      '<a class="inf-card__body" href="' +
      escapeHtml(profileUrl) +
      '">' +
      '<div class="av av--live">' +
      escapeHtml(initial) +
      '</div>' +
      '<div class="inf-card__n">' +
      escapeHtml(displayName) +
      '</div>' +
      '<div class="inf-card__live">' +
      escapeHtml(labels.collectorLiveLabel) +
      '</div>' +
      '<div class="inf-card__f" data-townwine-collector-summary data-influencer-handle="' +
      escapeHtml(collector.followHandle) +
      '" data-proxy-base="' +
      escapeHtml(proxyBase) +
      '" data-loading-followers-label="' +
      escapeHtml(labels.collectorLoadingFollowersLabel) +
      '" data-loading-deals-label="' +
      escapeHtml(labels.collectorLoadingDealsLabel) +
      '">' +
      '<span data-collector-followers>' +
      escapeHtml(labels.collectorLoadingFollowersLabel) +
      '</span><span aria-hidden="true">·</span><span data-collector-deals>' +
      escapeHtml(labels.collectorLoadingDealsLabel) +
      '</span>' +
      '</div>' +
      '</a>' +
      buildFollowButton(
        {
          followHandle: collector.followHandle,
          followName: displayName,
        },
        proxyBase,
        labels,
      ) +
      '</article>'
    );
  }

  function buildLatestProductsUrl(proxyBase, page) {
    var params = new URLSearchParams({ page_size: '100', page: String(page || 1) });
    return (proxyBase || DEFAULT_PROXY_BASE) + LATEST_PRODUCTS_ENDPOINT_PATH + '?' + params;
  }

  async function fetchLatestProducts(proxyBase, onFirstPage) {
    var payload = await window.TownWineCatalog.load({ inStock: true });
    return { products: payload.products, details: new Map(Object.entries(payload.collectorDetails || {})) };
  }

  async function fetchRecentProducts(proxyBase) {
    var payload = await fetchJson('/products.json?limit=250&page=1');
    var products = Array.isArray(payload && payload.products) ? payload.products : [];

    return products
      .filter(function (product) {
        return Boolean(product && product.handle && hasAvailableVariant(product));
      })
      .sort(function (left, right) {
        var rightPublishedAt = new Date(right && right.published_at ? right.published_at : 0).getTime();
        var leftPublishedAt = new Date(left && left.published_at ? left.published_at : 0).getTime();
        var rightCreatedAt = new Date(right && right.created_at ? right.created_at : 0).getTime();
        var leftCreatedAt = new Date(left && left.created_at ? left.created_at : 0).getTime();

        return Math.max(rightPublishedAt, rightCreatedAt) - Math.max(leftPublishedAt, leftCreatedAt);
      });
  }

  function getKstNow() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  }

  function parseUpcomingOpenData(html) {
    var doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    var scheduledRoot = doc.querySelector('.so, .tw-preview');

    if (!scheduledRoot) {
      return null;
    }

    var timeText =
      getText(doc.querySelector('.so__stat__v--time')) ||
      getText(doc.querySelector('.bd--time')) ||
      getText(doc.querySelector('.cell__v'));
    var match = String(timeText || '').match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*(\d{1,2})\s*:\s*(\d{2})/);

    if (!match) {
      return null;
    }

    var nowKst = getKstNow();
    var year = nowKst.getFullYear();
    var month = Number(match[1]);
    var day = Number(match[2]);
    var hour = Number(match[3]);
    var minute = Number(match[4]);
    var openDate = new Date(
      year +
        '-' +
        String(month).padStart(2, '0') +
        '-' +
        String(day).padStart(2, '0') +
        'T' +
        String(hour).padStart(2, '0') +
        ':' +
        String(minute).padStart(2, '0') +
        ':00+09:00',
    );

    if (Number.isNaN(openDate.getTime()) || openDate.getTime() <= Date.now()) {
      return null;
    }

    return {
      timestamp: openDate.getTime(),
      month: month,
      day: day,
      hour: hour,
      minute: minute,
    };
  }

  function getVariantInventory(variant) {
    var inventory = Number(variant && variant.inventory_quantity);

    if (!Number.isFinite(inventory) || inventory < 0) {
      return 0;
    }

    return Math.trunc(inventory);
  }

  function buildUpcomingCard(product, openData, proxyBase, labels) {
    var variant = getFirstAvailableVariant(product);

    if (!variant || !openData) {
      return '';
    }

    var subtitle = [product.vendor || '', product.product_type || '']
      .filter(Boolean)
      .join(' · ');
    var inventory = getVariantInventory(variant);
    var productUrl = '/products/' + encodeURIComponent(product.handle);
    var dayText = String(openData.day).padStart(2, '0');
    var hourText = String(openData.hour).padStart(2, '0');
    var minuteText = String(openData.minute).padStart(2, '0');
    var pricePrefix = (labels && labels.upcomingPricePrefix) || '예상';
    var limitedStockSuffix = (labels && labels.upcomingLimitedStockSuffix) || '병 한정';
    var openSuffix = (labels && labels.upcomingOpenSuffix) || '오픈';

    return (
      '<article class="up__r" data-townwine-dynamic-upcoming="true" data-product-handle="' +
      escapeHtml(product.handle) +
      '">' +
      '<a class="up__main" href="' +
      escapeHtml(productUrl) +
      '">' +
      '<div class="up__d"><span class="up__d__m">' +
      escapeHtml(openData.month) +
      '월</span><span class="up__d__day">' +
      escapeHtml(dayText) +
      '</span></div>' +
      '<div class="up__bd"><div class="up__bd__t">' +
      escapeHtml(product.title) +
      '</div>' +
      (subtitle ? '<div class="up__bd__sub">' + escapeHtml(subtitle) + '</div>' : '') +
      '<div class="up__bd__meta"><span><b>' +
      escapeHtml(pricePrefix) +
      ' ' +
      escapeHtml(formatMoney(variant.price)) +
      '</b></span>' +
      (inventory > 0
        ? '<span>·</span><span>' +
          escapeHtml(inventory) +
          escapeHtml(limitedStockSuffix) +
          '</span>'
        : '') +
      '<span>·</span><span>' +
      escapeHtml(hourText) +
      ':' +
      escapeHtml(minuteText) +
      ' ' +
      escapeHtml(openSuffix) +
      '</span></div></div></a></article>'
    );
  }

  function resolveUpcomingLabels(section) {
    var data = (section && section.dataset) || {};

    return {
      upcomingPricePrefix: data.upcomingPricePrefix || '예상',
      upcomingLimitedStockSuffix: data.upcomingLimitedStockSuffix || '병 한정',
      upcomingOpenSuffix: data.upcomingOpenSuffix || '오픈',
    };
  }

  function replaceUpcomingList(section, products, detailByHandle, proxyBase) {
    if (!(section instanceof HTMLElement)) {
      return;
    }

    var list = section.querySelector('.up');

    if (!(list instanceof HTMLElement)) {
      return;
    }

    var labels = resolveUpcomingLabels(section);
    var upcomingCards = products
      .map(function (product) {
        return {
          product: product,
          openData: detailByHandle.get(product.handle),
        };
      })
      .filter(function (entry) {
        return Boolean(entry.openData);
      })
      .sort(function (left, right) {
        return left.openData.timestamp - right.openData.timestamp;
      })
      .slice(0, MAX_UPCOMING)
      .map(function (entry) {
        return buildUpcomingCard(entry.product, entry.openData, proxyBase, labels);
      })
      .filter(Boolean);

    if (!upcomingCards.length) {
      return;
    }

    list.innerHTML = upcomingCards.join('');
    bootInteractiveWidgets(section);
  }

  async function initHomeUpcomingFeed() {
    var section = document.querySelector('[data-townwine-open-alert-section]');

    if (!(section instanceof HTMLElement)) {
      return;
    }

    var recommendationPanel = document.querySelector('[data-home-live-recommendations]');
    var proxyBase =
      (section.dataset && section.dataset.proxyBase) ||
      (recommendationPanel instanceof HTMLElement && recommendationPanel.dataset.proxyBase) ||
      DEFAULT_PROXY_BASE;

    try {
      var recentProducts = await fetchRecentProducts(proxyBase);
      var fetchedProducts = recentProducts.slice(0, MAX_PRODUCT_FETCH);
      var detailByHandle = new Map();

      await Promise.all(
        fetchedProducts.map(async function (product) {
          try {
            var html = await fetchText('/products/' + encodeURIComponent(product.handle) + '?view=default');
            detailByHandle.set(product.handle, parseUpcomingOpenData(html));
          } catch (error) {
            detailByHandle.set(product.handle, null);
          }
        }),
      );

      replaceUpcomingList(section, recentProducts, detailByHandle, proxyBase);
    } catch (error) {
      console.warn('[townwine-home-live-feed] failed to hydrate upcoming feed', error);
    }
  }

  async function fetchCollectorDetails(products) {
    var details = new Map();

    await Promise.all(
      products.map(async function (product) {
        try {
          var html = await fetchText('/products/' + encodeURIComponent(product.handle) + '?view=default');

          try {
            details.set(product.handle, parseCollectorData(html));
          } catch (error) {
            console.warn(
              '[townwine-home-live-feed] failed to parse collector detail',
              product.handle,
              error,
            );
            details.set(product.handle, {
              followHandle: '',
              followName: '',
              displayName: '',
              handleLabel: '',
              collectorUrl: '',
            });
          }
        } catch (error) {
          console.warn('[townwine-home-live-feed] failed to fetch product detail', product.handle, error);
          details.set(product.handle, {
            followHandle: '',
            followName: '',
            displayName: '',
            handleLabel: '',
            collectorUrl: '',
          });
        }
      }),
    );

    return details;
  }

  function replaceRecommendationPanel(root, products, details, proxyBase, labels) {
    if (!(root instanceof HTMLElement)) {
      return;
    }

    // Each panel owns its visible count, so changing tabs preserves expanded cards.
    var visibleCount = 0;
    var moreButton = document.createElement('button');
    moreButton.type = 'button';
    moreButton.className = 'btn btn--ivory btn--block tw-home-load-more';
    moreButton.textContent = '더보기';
    moreButton.setAttribute('aria-label', '상품 12개 더 보기');
    moreButton.style.cssText = 'grid-column:1 / -1;width:100%;min-height:52px;margin-top:16px;';

    function appendNextPage() {
      var nextProducts = products.slice(visibleCount, visibleCount + MAX_RECOMMENDATIONS);
      var markup = nextProducts.map(function (product) {
        return buildRecommendationCard(product, details.get(product.handle) || {}, proxyBase, labels);
      }).filter(Boolean).join('');
      moreButton.insertAdjacentHTML('beforebegin', markup);
      visibleCount += nextProducts.length;
      root.dataset.visibleCount = String(visibleCount);
      if (visibleCount >= products.length) {
        moreButton.hidden = true;
        moreButton.style.display = 'none';
        // Retain keyboard focus when the final batch removes the active button.
        if (document.activeElement === moreButton) {
          var links = root.querySelectorAll('.dc__t a');
          var firstNewLink = links[Math.max(0, links.length - nextProducts.length)];
          if (firstNewLink) firstNewLink.focus({ preventScroll: true });
        }
      }
      bootInteractiveWidgets(root);
    }

    root.innerHTML = products.length ? '' : '<p class="deal-empty">표시할 상품이 없습니다.</p>';
    if (products.length) {
      root.appendChild(moreButton);
      moreButton.addEventListener('click', appendNextPage);
      appendNextPage();
    } else {
      root.dataset.visibleCount = '0';
    }
    root.style.visibility = '';
    root.dataset.resultCount = String(products.length);
    root.dataset.liveFeedReady = 'true';
    root.removeAttribute('aria-busy');

    bootInteractiveWidgets(root);
  }

  function replaceCollectorGrid(root, products, details, proxyBase, labels) {
    if (!(root instanceof HTMLElement)) {
      return;
    }

    var collectorCards = [];
    var seenCollectorKeys = new Set();

    products.some(function (product) {
      var collector = resolveCollectorIdentity(details.get(product.handle) || {});
      var collectorKey = collector.dedupeKey;

      if (!collectorKey || seenCollectorKeys.has(collectorKey)) {
        return false;
      }

      var collectorCardMarkup = buildCollectorCard(
        {
          followHandle: collector.followHandle,
          followName: collector.followName || collector.displayName,
          displayName: collector.displayName || collector.followName,
          handleLabel: collector.handleLabel,
          collectorUrl: collector.collectorUrl,
        },
        proxyBase,
        labels,
      );

      if (!collectorCardMarkup) {
        return false;
      }

      seenCollectorKeys.add(collectorKey);
      collectorCards.push(collectorCardMarkup);

      return collectorCards.length >= MAX_COLLECTORS;
    });

    if (!collectorCards.length) {
      root.innerHTML =
        '<p class="inf-empty">' +
        escapeHtml(labels.collectorEmptyLabel) +
        '</p>';
      return;
    }

    root.innerHTML = collectorCards.join('');

    bootInteractiveWidgets(root);
  }

  function hydrateCollectorGrid(root, labels) {
    if (!(root instanceof HTMLElement)) {
      return;
    }

    if (!root.textContent.trim()) {
      root.innerHTML =
        '<p class="inf-empty">' +
        escapeHtml(labels.collectorEmptyLabel) +
        '</p>';
    }

    bootInteractiveWidgets(root);
  }

  function hasServerRenderedContent(root, selector) {
    return root instanceof HTMLElement && Boolean(root.querySelector(selector));
  }

  function getServerRenderedRecommendationCards(root) {
    if (!(root instanceof HTMLElement)) {
      return [];
    }

    return Array.prototype.slice.call(root.querySelectorAll('[data-townwine-product-card-url]'));
  }

  function getExpectedServerRenderedRecommendationCount(root) {
    if (!(root instanceof HTMLElement)) {
      return MAX_RECOMMENDATIONS;
    }

    var resultCount = Number(root.dataset.resultCount || 0);

    if (!Number.isFinite(resultCount) || resultCount < 0) {
      return MAX_RECOMMENDATIONS;
    }

    return Math.min(MAX_RECOMMENDATIONS, Math.trunc(resultCount));
  }

  function shouldKeepServerRenderedRecommendations(root) {
    return false;
  }

  function shouldKeepServerRenderedCollectors(root) {
    if (!(root instanceof HTMLElement)) {
      return false;
    }

    return hasServerRenderedContent(
      root,
      '.inf-card, [data-townwine-collector-summary], .inf-empty',
    );
  }

  async function initHomeLiveFeed() {
    var recommendationPanel = document.querySelector('[data-home-live-recommendations]');
    var collectorGrid = document.querySelector('[data-home-live-collectors]');

    if (!(recommendationPanel instanceof HTMLElement)) {
      return;
    }

    recommendationPanel.dataset.liveFeedReady = 'false';
    recommendationPanel.setAttribute('aria-busy', 'true');

    var proxyBase =
      recommendationPanel.dataset.proxyBase ||
      (collectorGrid && collectorGrid.dataset.proxyBase) ||
      DEFAULT_PROXY_BASE;
    var labels = resolveHomeFeedLabels(recommendationPanel, collectorGrid);

    ensureExchangeRateLoaded(proxyBase);

    if (
      shouldKeepServerRenderedRecommendations(recommendationPanel) &&
      shouldKeepServerRenderedCollectors(collectorGrid)
    ) {
      recommendationPanel.style.visibility = '';
      recommendationPanel.dataset.liveFeedReady = 'true';
      recommendationPanel.removeAttribute('aria-busy');
      bootInteractiveWidgets(recommendationPanel);
      bootInteractiveWidgets(collectorGrid);
      return;
    }

    try {
      var panels = document.querySelectorAll('[data-home-results-panel]');
      function renderFeed(feed, loading) {
        var latestProducts = feed.products.filter(hasAvailableVariant).sort(function (a, b) {
          return (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0);
        });
        Array.prototype.forEach.call(panels, function (panel) {
          var tag = panel.dataset.homeResultsPanel || '';
          var products = latestProducts.filter(function (product) {
            var tags = Array.isArray(product.tags) ? product.tags : String(product.tags || '').split(',').map(function (value) { return value.trim(); });
            return !tag || tags.indexOf(tag) !== -1;
          });
          replaceRecommendationPanel(panel, products, feed.details, proxyBase, labels);
          var more = panel.querySelector('.tw-home-load-more');
          if (loading && more) { more.disabled = true; more.textContent = '상품 불러오는 중…'; }
        });
      }
      var feed = await fetchLatestProducts(proxyBase, function (firstPage) { renderFeed(firstPage, true); });
      renderFeed(feed, false);
      var latestProducts = feed.products.filter(hasAvailableVariant);
      var collectorDetails = feed.details;
      replaceCollectorGrid(collectorGrid, latestProducts.filter(hasAvailableVariant), collectorDetails, proxyBase, labels);

    } catch (error) {
      console.error('[townwine-home-live-feed] failed to hydrate home feed', error);
      Array.prototype.forEach.call(document.querySelectorAll('[data-home-results-panel]'), function (panel) {
        panel.innerHTML = '<p role="status">상품을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.</p>';
        panel.style.visibility = '';
      });
      recommendationPanel.style.visibility = '';
      recommendationPanel.dataset.liveFeedReady = 'true';
      recommendationPanel.removeAttribute('aria-busy');
      hydrateCollectorGrid(collectorGrid, labels);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHomeLiveFeed, { once: true });
    document.addEventListener('DOMContentLoaded', initHomeUpcomingFeed, { once: true });
  } else {
    initHomeLiveFeed();
    initHomeUpcomingFeed();
  }
})();
