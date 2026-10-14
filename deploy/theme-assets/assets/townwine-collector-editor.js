(function () {
  var ROOT_SELECTOR = "[data-collector-profile-editor]",
    TAB_SELECTOR = "[data-mypage-tabs]",
    FOLLOW_ROOT_SELECTOR = "[data-follow-management]",
    ORDER_ROOT_SELECTOR = "[data-order-management]",
    FLASH_KEY = "townwine:collector-profile-feedback",
    ORDER_FILTER_LABELS = {
      all: "\uC804\uCCB4",
      paid: "\uACB0\uC81C \uC644\uB8CC",
      shipping: "\uBC30\uC1A1 \uC911",
      delivered: "\uC644\uB8CC",
      other: "\uCDE8\uC18C\u00B7\uD658\uBD88\u00B7\uACB0\uC81C \uD655\uC778",
    },
    ORDER_STATUS_CLASS_NAMES = ["st--confirm", "st--ship", "st--done"];
  function toArray(value) {
    return Array.prototype.slice.call(value || []);
  }
  function getForm(root) {
    return root.querySelector("[data-collector-profile-form]");
  }
  function getFeedbackNode(root) {
    return root.querySelector("[data-collector-profile-feedback]");
  }
  function getSubmitButton(form) {
    return form.querySelector('button[type="submit"]');
  }
  function getScoreRows(root) {
    return toArray(root.querySelectorAll(".cpe__score"));
  }
  function getPriceBandRoot(root) {
    return root.querySelector("[data-price-band]");
  }
  function getFollowCards(root) {
    return toArray(root.querySelectorAll("[data-follow-card]"));
  }
  function getFollowFilterButtons(root) {
    return toArray(root.querySelectorAll("[data-follow-filter]"));
  }
  function getOrderCards(root) {
    return toArray(root.querySelectorAll("[data-order-card]"));
  }
  function getOrderFilterButtons(root) {
    return toArray(root.querySelectorAll("[data-order-filter]"));
  }
  function getOrderPageSizeButtons(root) {
    return toArray(root.querySelectorAll("[data-order-page-size]"));
  }
  function getOrderCardId(card) {
    return String(card.dataset.orderId || "").trim();
  }
  function getFollowButton(card) {
    return card.querySelector(".js-follow-btn");
  }
  function normalizeHandle(value) {
    return String(value || "")
      .trim()
      .replace(/^@+/, "")
      .replace(/\/+$/, "")
      .toLowerCase();
  }
  function normalizeProxyBase(value) {
    var trimmedValue = String(value || "").trim();
    return trimmedValue
      ? trimmedValue.endsWith("/")
        ? trimmedValue.slice(0, -1)
        : trimmedValue
      : "/apps/townwine-follow";
  }
  function getFollowRequestContext(node) {
    var source = node instanceof HTMLElement ? node : document.body,
      scope = source.closest("[data-follow-management]") || source,
      shopDomain = String(scope.dataset.shopDomain || "").trim(),
      customerId = String(scope.dataset.customerId || "").trim();
    return { shopDomain, customerId };
  }
  function buildFollowStatusUrl(proxyBase, context) {
    var url = new URL(proxyBase + "/status", window.location.origin);
    return (
      context &&
        context.shopDomain &&
        url.searchParams.set("shop", context.shopDomain),
      context &&
        context.customerId &&
        url.searchParams.set("logged_in_customer_id", context.customerId),
      url.toString()
    );
  }
  function buildFollowStatusPayload(context) {
    var payload = {};
    return (
      context && context.shopDomain && (payload.shop = context.shopDomain),
      context &&
        context.customerId &&
        (payload.logged_in_customer_id = context.customerId),
      payload
    );
  }
  function refreshCollectorStats(scope) {
    window.TownWineCollectorStats &&
      typeof window.TownWineCollectorStats.refresh == "function" &&
      window.TownWineCollectorStats.refresh(scope || document);
  }
  function getOrderState(root) {
    if (!root.__townwineOrderState) {
      var defaultPerPage = parseOrderPerPage(
        root.dataset.orderPageSizeDefault,
        10,
      );
      root.__townwineOrderState = {
        currentFilter: "all",
        currentPage: 1,
        perPage: defaultPerPage,
      };
    }
    return root.__townwineOrderState;
  }
  function getFollowState(root) {
    return (
      root.__townwineFollowState ||
        (root.__townwineFollowState = { currentFilter: "all" }),
      root.__townwineFollowState
    );
  }
  function getOrderStatusBadgeClass(status) {
    return status === "shipping"
      ? "st--ship"
      : status === "delivered"
        ? "st--done"
        : "st--confirm";
  }
  function parseOrderPerPage(value, fallbackValue) {
    var numericValue = parseInt(value, 10);
    return numericValue === 10 || numericValue === 50 || numericValue === 100
      ? numericValue
      : fallbackValue;
  }
  function parseOrderPageNumber(value) {
    var numericValue = parseInt(value, 10);
    return !Number.isFinite(numericValue) || numericValue < 1
      ? 1
      : numericValue;
  }
  function getOrderPageSizeOptions(root) {
    var configuredOptions = String(root.dataset.orderPageSizeOptions || "")
      .split(",")
      .map(function (value) {
        return parseOrderPerPage(value, 0);
      })
      .filter(function (value) {
        return value > 0;
      });
    return configuredOptions.length
      ? configuredOptions.filter(function (value, index, values) {
          return values.indexOf(value) === index;
        })
      : [10, 50, 100];
  }
  function syncOrderUrlState(root, mode) {
    if (
      !(
        !(root instanceof HTMLElement) ||
        !window.history ||
        !window.history.replaceState
      )
    ) {
      var state = getOrderState(root),
        params = new URLSearchParams(window.location.search),
        defaultPerPage = parseOrderPerPage(
          root.dataset.orderPageSizeDefault,
          10,
        ),
        nextHash = window.location.hash || "#orders-management",
        nextUrl;
      if (
        (state.currentFilter && state.currentFilter !== "all"
          ? params.set("order_status", state.currentFilter)
          : params.delete("order_status"),
        state.currentPage > 1
          ? params.set("order_page", String(state.currentPage))
          : params.delete("order_page"),
        state.perPage !== defaultPerPage
          ? params.set("order_page_size", String(state.perPage))
          : params.delete("order_page_size"),
        (nextUrl = window.location.pathname),
        params.toString() && (nextUrl += "?" + params.toString()),
        (nextUrl += nextHash),
        mode === "push" && typeof window.history.pushState == "function")
      ) {
        window.history.pushState({}, "", nextUrl);
        return;
      }
      window.history.replaceState({}, "", nextUrl);
    }
  }
  function restoreOrderStateFromUrl(root) {
    if (root instanceof HTMLElement) {
      var params = new URLSearchParams(window.location.search),
        state = getOrderState(root),
        nextFilter = params.get("order_status") || "all",
        nextPerPage = parseOrderPerPage(
          params.get("order_page_size"),
          parseOrderPerPage(root.dataset.orderPageSizeDefault, 10),
        );
      (ORDER_FILTER_LABELS[nextFilter] || (nextFilter = "all"),
        getOrderPageSizeOptions(root).indexOf(nextPerPage) === -1 &&
          (nextPerPage = parseOrderPerPage(
            root.dataset.orderPageSizeDefault,
            10,
          )),
        (state.currentFilter = nextFilter),
        (state.currentPage = parseOrderPageNumber(params.get("order_page"))),
        (state.perPage = nextPerPage));
    }
  }
  function buildOrderPaginationParts(totalPages, currentPage) {
    var pagesToShow = Object.create(null),
      parts = [],
      pageNumber,
      lastPage = 0;
    if (totalPages <= 7) {
      for (pageNumber = 1; pageNumber <= totalPages; pageNumber += 1)
        parts.push(pageNumber);
      return parts;
    }
    for (
      pagesToShow[1] = !0,
        pagesToShow[totalPages] = !0,
        pageNumber = currentPage - 1;
      pageNumber <= currentPage + 1;
      pageNumber += 1
    )
      pageNumber > 1 &&
        pageNumber < totalPages &&
        (pagesToShow[pageNumber] = !0);
    for (pageNumber = 1; pageNumber <= totalPages; pageNumber += 1)
      pagesToShow[pageNumber] &&
        (lastPage && pageNumber - lastPage > 1 && parts.push("ellipsis"),
        parts.push(pageNumber),
        (lastPage = pageNumber));
    return parts;
  }
  function createOrderPaginationButton(page, label, options) {
    var button = document.createElement("button"),
      settings = options || {};
    return (
      (button.type = "button"),
      (button.className = "op-pager__btn"),
      (button.textContent = label),
      settings.kind && button.classList.add("op-pager__btn--" + settings.kind),
      settings.current &&
        (button.classList.add("is-on"),
        button.setAttribute("aria-current", "page")),
      settings.disabled
        ? ((button.disabled = !0), button.setAttribute("aria-disabled", "true"))
        : (button.dataset.orderPage = String(page)),
      settings.ariaLabel &&
        button.setAttribute("aria-label", settings.ariaLabel),
      button
    );
  }
  function syncOrderPageSizeButtons(root) {
    var state = getOrderState(root);
    getOrderPageSizeButtons(root).forEach(function (button) {
      var buttonPerPage = parseOrderPerPage(button.dataset.orderPageSize, 0),
        isActive = buttonPerPage === state.perPage;
      (button.classList.toggle("is-on", isActive),
        button.setAttribute("aria-pressed", isActive ? "true" : "false"));
    });
  }
  function syncOrderPagination(root, visibleCards) {
    if (root instanceof HTMLElement) {
      var state = getOrderState(root),
        summaryNode = root.querySelector("[data-order-pagination-summary]"),
        nav = root.querySelector("[data-order-pagination-nav]"),
        toolbar = root.querySelector("[data-order-pagination-toolbar]"),
        totalVisibleCount = visibleCards.length,
        startIndex = 0,
        endIndex = 0,
        totalPages =
          totalVisibleCount > 0
            ? Math.ceil(totalVisibleCount / state.perPage)
            : 0,
        parts = [];
      (toolbar instanceof HTMLElement &&
        (toolbar.hidden = totalVisibleCount === 0),
        totalVisibleCount > 0 &&
          ((startIndex = (state.currentPage - 1) * state.perPage + 1),
          (endIndex = Math.min(
            totalVisibleCount,
            state.currentPage * state.perPage,
          ))),
        summaryNode instanceof HTMLElement &&
          (totalVisibleCount > 0
            ? (summaryNode.textContent =
                "\uCD1D " +
                totalVisibleCount +
                "\uAC74 \uC911 " +
                startIndex +
                "-" +
                endIndex +
                "\uBC88\uC9F8 \uC8FC\uBB38\uC744 \uBCF4\uACE0 \uC788\uC5B4\uC694.")
            : (summaryNode.textContent = "")),
        nav instanceof HTMLElement &&
          ((nav.hidden = totalPages <= 1),
          (nav.textContent = ""),
          !(totalPages <= 1) &&
            ((parts = buildOrderPaginationParts(totalPages, state.currentPage)),
            nav.appendChild(
              createOrderPaginationButton(
                state.currentPage - 1,
                "\uC774\uC804",
                {
                  kind: "arrow",
                  disabled: state.currentPage <= 1,
                  ariaLabel: "\uC774\uC804 \uC8FC\uBB38 \uD398\uC774\uC9C0",
                },
              ),
            ),
            parts.forEach(function (part) {
              var node;
              if (part === "ellipsis") {
                ((node = document.createElement("span")),
                  (node.className = "op-pager__gap"),
                  (node.textContent = "\u2026"),
                  node.setAttribute("aria-hidden", "true"),
                  nav.appendChild(node));
                return;
              }
              nav.appendChild(
                createOrderPaginationButton(part, String(part), {
                  current: part === state.currentPage,
                  ariaLabel: "\uC8FC\uBB38 \uD398\uC774\uC9C0 " + part,
                }),
              );
            }),
            nav.appendChild(
              createOrderPaginationButton(
                state.currentPage + 1,
                "\uB2E4\uC74C",
                {
                  kind: "arrow",
                  disabled: state.currentPage >= totalPages,
                  ariaLabel: "\uB2E4\uC74C \uC8FC\uBB38 \uD398\uC774\uC9C0",
                },
              ),
            ))));
    }
  }
  function setOrderCardStatus(card, payload) {
    if (!(!(card instanceof HTMLElement) || !payload || !payload.bucket)) {
      card.dataset.orderStatus = payload.bucket;
      var badge = card.querySelector("[data-order-status-badge]"),
        title = card.querySelector("[data-order-status-title]"),
        description = card.querySelector("[data-order-status-description]"),
        badgeClassName = getOrderStatusBadgeClass(payload.bucket),
        nextLabel = String(
          payload.label || ORDER_FILTER_LABELS[payload.bucket] || "",
        );
      (badge instanceof HTMLElement &&
        (ORDER_STATUS_CLASS_NAMES.forEach(function (className) {
          badge.classList.remove(className);
        }),
        badge.classList.add(badgeClassName),
        (badge.textContent = nextLabel)),
        title instanceof HTMLElement && (title.textContent = nextLabel),
        description instanceof HTMLElement &&
          payload.description &&
          (description.textContent = String(payload.description)));
    }
  }
  function getFollowCardHandle(card) {
    return normalizeHandle(card.dataset.followHandle || "");
  }
  function getFollowCardDefaultHandle(card) {
    return normalizeHandle(
      card.dataset.followDefaultHandle || card.dataset.followHandle || "",
    );
  }
  function getFollowCardMatchHandles(card) {
    return String(card.dataset.followMatchHandles || "")
      .split(",")
      .map(normalizeHandle)
      .filter(Boolean)
      .filter(function (value, index, values) {
        return values.indexOf(value) === index;
      });
  }
  function isFollowCardActive(card) {
    return card.dataset.following === "true";
  }
  function setFollowCardState(card, isFollowing) {
    card.dataset.following = isFollowing ? "true" : "false";
  }
  function setFollowButtonState(button, isFollowing) {
    if (button instanceof HTMLElement) {
      var followLabel = button.dataset.followLabel || "\uD314\uB85C\uC6B0",
        followingLabel = button.dataset.followingLabel || "\uD314\uB85C\uC789";
      (button.setAttribute("aria-pressed", isFollowing ? "true" : "false"),
        (button.textContent = isFollowing ? followingLabel : followLabel));
    }
  }
  function syncFollowCardTarget(card, matchedHandle, isFollowing) {
    var button = getFollowButton(card),
      nextHandle =
        normalizeHandle(matchedHandle || "") ||
        getFollowCardDefaultHandle(card);
    ((card.dataset.followHandle = nextHandle),
      button instanceof HTMLElement &&
        ((button.dataset.influencerHandle = nextHandle),
        (button.disabled = !nextHandle),
        setFollowButtonState(button, isFollowing)));
  }
  function setNodeText(root, selector, value) {
    toArray(root.querySelectorAll(selector)).forEach(function (node) {
      node instanceof HTMLElement && (node.textContent = String(value));
    });
  }
  function syncOrderFilterButtons(root) {
    var state = getOrderState(root);
    getOrderFilterButtons(root).forEach(function (button) {
      var isActive = button.dataset.orderFilter === state.currentFilter;
      (button.classList.toggle("is-on", isActive),
        button.setAttribute("aria-pressed", isActive ? "true" : "false"));
    });
  }
  function toDigits(value) {
    return String(value || "").replace(/\D/g, "");
  }
  function formatGroupedNumber(value) {
    var digits = toDigits(value);
    return digits
      ? ((digits = digits.replace(/^0+(?=\d)/, "")),
        digits ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : "0")
      : "";
  }
  function parsePriceBandValue(value) {
    var matches = String(value || "").match(/\d[\d,]*/g) || [];
    return {
      min: formatGroupedNumber(matches[0] || ""),
      max: formatGroupedNumber(matches[1] || ""),
    };
  }
  function buildPriceBandValue(minValue, maxValue) {
    return minValue && maxValue
      ? "\u20A9" + minValue + " ~ \u20A9" + maxValue
      : minValue
        ? "\u20A9" + minValue + " ~"
        : maxValue
          ? "~ \u20A9" + maxValue
          : "";
  }
  function syncPriceBand(root) {
    var priceBandRoot = getPriceBandRoot(root);
    if (priceBandRoot instanceof HTMLElement) {
      var hiddenInput = priceBandRoot.querySelector("[data-price-band-hidden]"),
        minInput = priceBandRoot.querySelector('[data-price-band-input="min"]'),
        maxInput = priceBandRoot.querySelector('[data-price-band-input="max"]');
      !(hiddenInput instanceof HTMLInputElement) ||
        !(minInput instanceof HTMLInputElement) ||
        !(maxInput instanceof HTMLInputElement) ||
        (hiddenInput.value = buildPriceBandValue(
          minInput.value.trim(),
          maxInput.value.trim(),
        ));
    }
  }
  function bindPriceBand(root) {
    var priceBandRoot = getPriceBandRoot(root);
    if (
      !(
        !(priceBandRoot instanceof HTMLElement) ||
        priceBandRoot.dataset.priceBandReady === "true"
      )
    ) {
      priceBandRoot.dataset.priceBandReady = "true";
      var hiddenInput = priceBandRoot.querySelector("[data-price-band-hidden]"),
        minInput = priceBandRoot.querySelector('[data-price-band-input="min"]'),
        maxInput = priceBandRoot.querySelector('[data-price-band-input="max"]');
      if (
        !(
          !(hiddenInput instanceof HTMLInputElement) ||
          !(minInput instanceof HTMLInputElement) ||
          !(maxInput instanceof HTMLInputElement)
        )
      ) {
        var parsedPriceBand = parsePriceBandValue(hiddenInput.value);
        ((minInput.value = parsedPriceBand.min),
          (maxInput.value = parsedPriceBand.max),
          syncPriceBand(root),
          [minInput, maxInput].forEach(function (input) {
            input.addEventListener("input", function () {
              ((input.value = formatGroupedNumber(input.value)),
                syncPriceBand(root));
            });
          }));
      }
    }
  }
  function resolveTabFromHash() {
    var hash = window.location.hash || "";
    return hash === "#account-management" ||
      hash === "#collector-profile-editor"
      ? "account"
      : hash === "#follows-management" || hash === "#follow-management"
        ? "follows"
        : hash === "#orders-management"
          ? "orders"
          : "";
  }
  function setActiveTab(tabRoot, nextTab, shouldSyncHash) {
    var scope = tabRoot.closest("main") || document,
      buttons = toArray(tabRoot.querySelectorAll("[data-mypage-tab]")),
      panels = toArray(scope.querySelectorAll("[data-mypage-panel]"));
    if (!(!buttons.length || !panels.length)) {
      if (
        (buttons.forEach(function (button) {
          var isActive = button.dataset.mypageTab === nextTab;
          (button.classList.toggle("is-on", isActive),
            button.setAttribute("aria-selected", isActive ? "true" : "false"),
            button.setAttribute("tabindex", isActive ? "0" : "-1"));
        }),
        panels.forEach(function (panel) {
          var isActive = panel.dataset.mypagePanel === nextTab;
          ((panel.hidden = !isActive),
            panel.classList.toggle("is-on", isActive));
        }),
        nextTab === "follows")
      ) {
        var followRoot = scope.querySelector(FOLLOW_ROOT_SELECTOR);
        followRoot instanceof HTMLElement && refreshCollectorStats(followRoot);
      }
      if (shouldSyncHash) {
        var nextHash = "#orders-management";
        (nextTab === "follows"
          ? (nextHash = "#follows-management")
          : nextTab === "account" && (nextHash = "#account-management"),
          window.history && typeof window.history.replaceState == "function"
            ? window.history.replaceState(
                {},
                "",
                window.location.pathname + window.location.search + nextHash,
              )
            : (window.location.hash = nextHash));
      }
    }
  }
  function initializeTabs(scope) {
    toArray((scope || document).querySelectorAll(TAB_SELECTOR)).forEach(
      function (tabRoot) {
        if (
          !(
            !(tabRoot instanceof HTMLElement) ||
            tabRoot.dataset.mypageTabsReady === "true"
          )
        ) {
          tabRoot.dataset.mypageTabsReady = "true";
          var buttons = toArray(tabRoot.querySelectorAll("[data-mypage-tab]"));
          if (buttons.length) {
            var initialTab =
              resolveTabFromHash() || buttons[0].dataset.mypageTab || "orders";
            (setActiveTab(tabRoot, initialTab, !1),
              buttons.forEach(function (button) {
                button instanceof HTMLButtonElement && (button.type = "button");
              }),
              tabRoot.addEventListener(
                "click",
                function (event) {
                  var target = event.target;
                  if (target instanceof Element) {
                    var button = target.closest("[data-mypage-tab]");
                    !(button instanceof HTMLElement) ||
                      !tabRoot.contains(button) ||
                      (event.preventDefault(),
                      setActiveTab(
                        tabRoot,
                        button.dataset.mypageTab || "orders",
                        !0,
                      ));
                  }
                },
                !0,
              ),
              tabRoot.addEventListener("keydown", function (event) {
                var target = event.target;
                if (
                  !(
                    !(target instanceof HTMLElement) ||
                    !tabRoot.contains(target)
                  ) &&
                  !(event.key !== "Enter" && event.key !== " ")
                ) {
                  var button = target.closest("[data-mypage-tab]");
                  button instanceof HTMLElement &&
                    (event.preventDefault(),
                    setActiveTab(
                      tabRoot,
                      button.dataset.mypageTab || "orders",
                      !0,
                    ));
                }
              }),
              window.addEventListener("hashchange", function () {
                var nextTab = resolveTabFromHash();
                nextTab && setActiveTab(tabRoot, nextTab, !1);
              }));
          }
        }
      },
    );
  }
  function syncFollowFilterButtons(root) {
    getFollowFilterButtons(root).forEach(function (button) {
      (button.classList.add("is-on"),
        button.setAttribute("aria-pressed", "true"));
    });
  }
  function renderOrderManagement(root) {
    if (root instanceof HTMLElement) {
      var state = getOrderState(root),
        cards = getOrderCards(root),
        emptyNode = root.querySelector("[data-order-filter-empty]"),
        emptyTitle = root.querySelector("[data-order-filter-empty-title]"),
        emptyBody = root.querySelector("[data-order-filter-empty-body]"),
        matchingCards = [],
        pagedCards = [],
        visibleCount = 0,
        totalPages = 0,
        pageStart = 0;
      if (
        (cards.forEach(function (card) {
          var nextStatus = card.dataset.orderStatus || "paid",
            matchesFilter =
              state.currentFilter === "all"
                ? !0
                : nextStatus === state.currentFilter;
          (matchesFilter && matchingCards.push(card), (card.hidden = !0));
        }),
        (totalPages =
          matchingCards.length > 0
            ? Math.ceil(matchingCards.length / state.perPage)
            : 0),
        totalPages === 0
          ? (state.currentPage = 1)
          : state.currentPage > totalPages && (state.currentPage = totalPages),
        (pageStart = (state.currentPage - 1) * state.perPage),
        (pagedCards = matchingCards.slice(
          pageStart,
          pageStart + state.perPage,
        )),
        pagedCards.forEach(function (card) {
          ((card.hidden = !1), (visibleCount += 1));
        }),
        syncOrderFilterButtons(root),
        syncOrderPageSizeButtons(root),
        syncOrderPagination(root, matchingCards),
        emptyNode instanceof HTMLElement)
      ) {
        var activeFilterLabel =
            ORDER_FILTER_LABELS[state.currentFilter] ||
            "\uC120\uD0DD\uD55C \uC0C1\uD0DC",
          shouldShowEmpty =
            cards.length > 0 &&
            state.currentFilter !== "all" &&
            matchingCards.length === 0;
        ((emptyNode.hidden = !shouldShowEmpty),
          shouldShowEmpty &&
            (emptyTitle instanceof HTMLElement &&
              (emptyTitle.textContent =
                activeFilterLabel +
                " \uC0C1\uD0DC\uC758 \uC8FC\uBB38\uC774 \uC544\uC9C1 \uC5C6\uC5B4\uC694"),
            emptyBody instanceof HTMLElement &&
              (emptyBody.textContent =
                activeFilterLabel +
                " \uC0C1\uD0DC\uB85C \uD45C\uC2DC\uB41C \uC8FC\uBB38\uC774 \uD604\uC7AC \uBAA9\uB85D\uC5D0\uB294 \uC5C6\uC2B5\uB2C8\uB2E4. \uC804\uCCB4 \uD0ED\uC73C\uB85C \uB3CC\uC544\uAC00\uBA74 \uB2E4\uB978 \uC8FC\uBB38\uC744 \uB2E4\uC2DC \uD655\uC778\uD560 \uC218 \uC788\uC5B4\uC694.")));
      }
      syncOrderUrlState(root, "replace");
    }
  }
  function renderFollowManagement(root) {
    if (root instanceof HTMLElement) {
      var cards = getFollowCards(root),
        loadingNode = root.querySelector("[data-follow-loading]"),
        emptyNode = root.querySelector("[data-follow-empty]"),
        followingCount = 0,
        visibleCount = 0;
      if (
        (cards.forEach(function (card) {
          var isFollowing = isFollowCardActive(card),
            shouldShow = isFollowing;
          (isFollowing && (followingCount += 1),
            (card.hidden = !shouldShow),
            shouldShow && (visibleCount += 1));
        }),
        syncFollowFilterButtons(root),
        loadingNode instanceof HTMLElement && (loadingNode.hidden = !0),
        emptyNode instanceof HTMLElement)
      ) {
        var emptyTitle = emptyNode.querySelector("[data-follow-empty-title]"),
          emptyBody = emptyNode.querySelector("[data-follow-empty-body]");
        ((emptyNode.hidden = visibleCount > 0),
          emptyTitle instanceof HTMLElement &&
            emptyBody instanceof HTMLElement &&
            ((emptyTitle.textContent =
              "\uC544\uC9C1 \uD314\uB85C\uC6B0\uD55C \uCEEC\uB809\uD130\uAC00 \uC5C6\uC5B4\uC694."),
            (emptyBody.textContent =
              "\uCEEC\uB809\uD130 \uD398\uC774\uC9C0\uC5D0\uC11C \uCDE8\uD5A5\uC5D0 \uB9DE\uB294 \uCEEC\uB809\uD130\uB97C \uBA3C\uC800 \uCC3E\uC544 \uD314\uB85C\uC6B0\uD574\uBCF4\uC138\uC694.")));
      }
    }
  }
  function fetchFollowStatuses(root) {
    if (!(root instanceof HTMLElement)) return Promise.resolve();
    var proxyBase = normalizeProxyBase(root.dataset.proxyBase),
      requestContext = getFollowRequestContext(root),
      loadingNode = root.querySelector("[data-follow-loading]"),
      cards = getFollowCards(root);
    return (
      loadingNode instanceof HTMLElement && (loadingNode.hidden = !1),
      cards.length
        ? fetch(buildFollowStatusUrl(proxyBase, requestContext), {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify(buildFollowStatusPayload(requestContext)),
          })
            .then(function (response) {
              if (!response.ok) throw new Error("FOLLOW_STATUS_REQUEST_FAILED");
              return response.json();
            })
            .then(function (payload) {
              var followingSet = Object.create(null);
              (((payload && payload.following) || []).forEach(
                function (handle) {
                  followingSet[normalizeHandle(handle)] = !0;
                },
              ),
                cards.forEach(function (card) {
                  var matchedHandle = getFollowCardMatchHandles(card).find(
                      function (handle) {
                        return !!followingSet[handle];
                      },
                    ),
                    isFollowing = !!matchedHandle;
                  (setFollowCardState(card, isFollowing),
                    syncFollowCardTarget(card, matchedHandle, isFollowing));
                }),
                renderFollowManagement(root),
                refreshCollectorStats(root));
            })
            .catch(function (error) {
              (console.warn("[mypage-follow] failed to fetch statuses", error),
                renderFollowManagement(root),
                refreshCollectorStats(root));
            })
        : (renderFollowManagement(root),
          refreshCollectorStats(root),
          Promise.resolve())
    );
  }
  function fetchOrderStatuses(root) {
    if (!(root instanceof HTMLElement)) return Promise.resolve();
    if (root.hasAttribute('data-live-shipping')) return Promise.resolve();
    var proxyBase = normalizeProxyBase(root.dataset.proxyBase),
      cards = getOrderCards(root),
      orderIds = [],
      seenIds = Object.create(null);
    return (
      cards.forEach(function (card) {
        var orderId = getOrderCardId(card);
        !orderId ||
          seenIds[orderId] ||
          ((seenIds[orderId] = !0), orderIds.push(orderId));
      }),
      orderIds.length
        ? fetch(
            proxyBase +
              "/order-status?orderIds=" +
              encodeURIComponent(orderIds.join(",")),
            {
              credentials: "same-origin",
              headers: { Accept: "application/json" },
            },
          )
            .then(function (response) {
              if (!response.ok) throw new Error("ORDER_STATUS_REQUEST_FAILED");
              return response.json();
            })
            .then(function (payload) {
              var statusMap = (payload && payload.statuses) || {};
              (cards.forEach(function (card) {
                var nextStatus = statusMap[getOrderCardId(card)];
                nextStatus && setOrderCardStatus(card, nextStatus);
              }),
                renderOrderManagement(root));
            })
            .catch(function (error) {
              (console.warn("[mypage-order] failed to fetch statuses", error),
                renderOrderManagement(root));
            })
        : (renderOrderManagement(root), Promise.resolve())
    );
  }
  function bindFollowManagement(root) {
    !(root instanceof HTMLElement) ||
      root.dataset.followManagementReady === "true" ||
      ((root.dataset.followManagementReady = "true"),
      getFollowFilterButtons(root).forEach(function (button) {
        button.addEventListener("click", function () {
          ((getFollowState(root).currentFilter = "all"),
            renderFollowManagement(root));
        });
      }),
      document.addEventListener("townwine:follow-change", function (event) {
        var detail = (event && event.detail) || {},
          changedHandle = normalizeHandle(detail.influencerHandle || ""),
          changedProxyBase = normalizeProxyBase(detail.proxyBase),
          rootProxyBase = normalizeProxyBase(root.dataset.proxyBase),
          hasChanged = !1;
        !changedHandle ||
          changedProxyBase !== rootProxyBase ||
          (getFollowCards(root).forEach(function (card) {
            var matchesChangedHandle =
              getFollowCardHandle(card) === changedHandle ||
              getFollowCardMatchHandles(card).indexOf(changedHandle) !== -1;
            matchesChangedHandle &&
              (setFollowCardState(card, !!detail.following),
              syncFollowCardTarget(
                card,
                detail.following ? changedHandle : "",
                !!detail.following,
              ),
              (hasChanged = !0));
          }),
          hasChanged &&
            (renderFollowManagement(root), refreshCollectorStats(root)));
      }),
      fetchFollowStatuses(root));
  }
  function bindOrderManagement(root) {
    !(root instanceof HTMLElement) ||
      root.dataset.orderManagementReady === "true" ||
      ((root.dataset.orderManagementReady = "true"),
      root.addEventListener('townwine:shipping-updated', function () { renderOrderManagement(root); }),
      restoreOrderStateFromUrl(root),
      getOrderFilterButtons(root).forEach(function (button) {
        button.addEventListener("click", function () {
          var state = getOrderState(root);
          ((state.currentFilter = button.dataset.orderFilter || "all"),
            (state.currentPage = 1),
            renderOrderManagement(root));
        });
      }),
      getOrderPageSizeButtons(root).forEach(function (button) {
        button.addEventListener("click", function () {
          var state = getOrderState(root),
            nextPerPage = parseOrderPerPage(
              button.dataset.orderPageSize,
              state.perPage,
            );
          nextPerPage !== state.perPage &&
            ((state.perPage = nextPerPage),
            (state.currentPage = 1),
            renderOrderManagement(root));
        });
      }),
      root.addEventListener("click", function (event) {
        var target = event.target;
        if (target instanceof Element) {
          var resetButton = target.closest("[data-order-filter-reset]");
          if (
            resetButton instanceof HTMLButtonElement &&
            root.contains(resetButton)
          ) {
            (event.preventDefault(),
              (getOrderState(root).currentFilter = "all"),
              (getOrderState(root).currentPage = 1),
              renderOrderManagement(root));
            return;
          }
          var pageButton = target.closest("[data-order-page]");
          if (
            !(
              !(pageButton instanceof HTMLButtonElement) ||
              !root.contains(pageButton)
            )
          ) {
            event.preventDefault();
            var nextPage = parseOrderPageNumber(pageButton.dataset.orderPage),
              state = getOrderState(root);
            nextPage !== state.currentPage &&
              ((state.currentPage = nextPage), renderOrderManagement(root));
          }
        }
      }),
      renderOrderManagement(root),
      fetchOrderStatuses(root));
  }
  function setFeedback(root, type, message, storefrontPath) {
    var feedbackNode = getFeedbackNode(root);
    if (feedbackNode instanceof HTMLElement) {
      ((feedbackNode.hidden = !1),
        feedbackNode.classList.toggle("is-error", type === "error"),
        feedbackNode.classList.toggle("is-success", type === "success"),
        (feedbackNode.textContent = ""));
      var messageNode = document.createElement("span");
      if (
        ((messageNode.textContent = String(message || "")),
        feedbackNode.appendChild(messageNode),
        type === "success" && storefrontPath)
      ) {
        feedbackNode.appendChild(document.createTextNode(" "));
        var link = document.createElement("a");
        ((link.href = storefrontPath),
          (link.target = "_blank"),
          (link.rel = "noreferrer"),
          (link.textContent = "\uACF5\uAC1C \uD398\uC774\uC9C0 \uBCF4\uAE30"),
          feedbackNode.appendChild(link));
      }
    }
  }
  function clearFeedback(root) {
    var feedbackNode = getFeedbackNode(root);
    feedbackNode instanceof HTMLElement &&
      ((feedbackNode.hidden = !0),
      feedbackNode.classList.remove("is-error"),
      feedbackNode.classList.remove("is-success"),
      (feedbackNode.textContent = ""));
  }
  function syncScoreValues(root) {
    getScoreRows(root).forEach(function (row) {
      var input = row.querySelector('input[type="range"]'),
        valueNode = row.querySelector("[data-score-value]");
      !(input instanceof HTMLInputElement) ||
        !(valueNode instanceof HTMLElement) ||
        (valueNode.textContent = input.value);
    });
  }
  function restoreFeedback(root) {
    var storedValue;
    try {
      storedValue = window.sessionStorage.getItem(FLASH_KEY);
    } catch {
      storedValue = null;
    }
    if (storedValue) {
      try {
        var payload = JSON.parse(storedValue);
        payload &&
          payload.message &&
          setFeedback(
            root,
            "success",
            payload.message,
            payload.storefrontPath || "",
          );
      } catch {}
      try {
        window.sessionStorage.removeItem(FLASH_KEY);
      } catch {}
    }
  }
  function saveFeedback(payload) {
    try {
      window.sessionStorage.setItem(FLASH_KEY, JSON.stringify(payload));
    } catch {}
  }
  function setSubmitting(form, isSubmitting) {
    var submitButton = getSubmitButton(form);
    if (submitButton instanceof HTMLButtonElement) {
      var defaultLabel =
        submitButton.getAttribute("data-submit-label") ||
        submitButton.textContent ||
        "\uC800\uC7A5\uD558\uAE30";
      ((submitButton.disabled = isSubmitting),
        (submitButton.textContent = isSubmitting
          ? "\uC800\uC7A5 \uC911..."
          : defaultLabel));
    }
  }
  async function parseResponse(response) {
    var contentType = response.headers.get("content-type") || "";
    if (contentType.indexOf("application/json") === -1) return null;
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  function buildSuccessMessage(data) {
    return data && data.handle
      ? "\uCEEC\uB809\uD130 \uD504\uB85C\uD544\uC744 \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4."
      : "\uBCC0\uACBD \uB0B4\uC6A9\uC744 \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.";
  }
  function bindForm(root) {
    var form = getForm(root);
    form instanceof HTMLFormElement &&
      form.addEventListener("submit", async function (event) {
        (event.preventDefault(),
          clearFeedback(root),
          syncPriceBand(root),
          setSubmitting(form, !0));
        try {
          var response = await fetch(form.action, {
              method: "POST",
              body: new FormData(form),
              credentials: "same-origin",
              headers: { Accept: "application/json" },
            }),
            data = await parseResponse(response);
          if (
            response.status === 401 ||
            (data && data.message === "LOGIN_REQUIRED")
          ) {
            var loginUrl = form.dataset.loginUrl || "/account/login";
            window.location.href = loginUrl;
            return;
          }
          if (!response.ok || !data || !data.ok)
            throw new Error(
              (data && data.message) ||
                "\uC800\uC7A5 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.",
            );
          (saveFeedback({
            message: buildSuccessMessage(data),
            storefrontPath: data.storefrontPath || "",
          }),
            window.location.hash !== "#collector-profile-editor" &&
              (window.location.hash = "collector-profile-editor"),
            window.location.reload());
        } catch (error) {
          setFeedback(
            root,
            "error",
            error instanceof Error
              ? error.message
              : "\uC800\uC7A5 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.",
          );
        } finally {
          setSubmitting(form, !1);
        }
      });
  }
  function initialize(root) {
    !(root instanceof HTMLElement) ||
      root.dataset.collectorProfileEditorReady === "true" ||
      ((root.dataset.collectorProfileEditorReady = "true"),
      restoreFeedback(root),
      syncScoreValues(root),
      bindPriceBand(root),
      bindForm(root),
      getScoreRows(root).forEach(function (row) {
        var input = row.querySelector('input[type="range"]');
        input instanceof HTMLInputElement &&
          input.addEventListener("input", function () {
            syncScoreValues(root);
          });
      }));
  }
  function boot(root) {
    (initializeTabs(root || document),
      toArray((root || document).querySelectorAll(ORDER_ROOT_SELECTOR)).forEach(
        function (orderRoot) {
          bindOrderManagement(orderRoot);
        },
      ),
      toArray(
        (root || document).querySelectorAll(FOLLOW_ROOT_SELECTOR),
      ).forEach(function (followRoot) {
        bindFollowManagement(followRoot);
      }),
      toArray((root || document).querySelectorAll(ROOT_SELECTOR)).forEach(
        function (editorRoot) {
          initialize(editorRoot);
        },
      ));
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
//# sourceMappingURL=/cdn/shop/t/21/assets/townwine-collector-editor.js.map?v=45205866470785185591779459050
