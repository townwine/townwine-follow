(function () {
  'use strict';
  var labels = ['결제 완료', '배송 준비', '출고 완료', '배송 중', '배송 완료'];
  function text(tag, value, className) {
    var el = document.createElement(tag); el.textContent = value || '';
    if (className) el.className = className;
    return el;
  }
  function steps(card, stage) {
    var list = card.querySelector('[data-shipping-steps]');
    if (!list) return;
    list.replaceChildren(); list.hidden = stage < 0;
    if (stage < 0) return;
    labels.forEach(function (label, index) {
      var item = text('li', label);
      if (index < stage) item.className = 'is-complete';
      if (index === stage) { item.className = 'is-current'; item.setAttribute('aria-current', 'step'); }
      list.appendChild(item);
    });
  }
  function safeUrl(value) {
    try { var url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch (_) { return ''; }
  }
  function render(card, status) {
    card.dataset.orderStatus = status.bucket;
    card.dataset.shippingStage = String(status.stage);
    ['[data-order-status-title]', '[data-order-status-badge]'].forEach(function (selector) {
      var el = card.querySelector(selector); if (el) el.textContent = status.label;
    });
    var badge = card.querySelector('[data-order-status-badge]');
    if (badge) { badge.classList.remove('st--confirm', 'st--ship', 'st--done'); badge.classList.add(status.bucket === 'delivered' || status.bucket === 'other' ? 'st--done' : status.bucket === 'shipping' ? 'st--ship' : 'st--confirm'); }
    var desc = card.querySelector('[data-order-status-description]'); if (desc) desc.textContent = status.description;
    steps(card, status.stage);
    var packages = card.querySelector('[data-shipping-packages]');
    if (!packages) return;
    packages.replaceChildren();
    (status.shipments || []).forEach(function (shipment, index) {
      var box = text('div', '', 'tw-shipping__package');
      box.appendChild(text('strong', '배송 ' + (index + 1) + ' · ' + shipment.label));
      (shipment.tracking || []).forEach(function (tracking) {
        var line = text('p', [tracking.company, tracking.number].filter(Boolean).join(' · '), 'tw-shipping__tracking');
        var href = safeUrl(tracking.url);
        if (href) { var link = text('a', '배송 조회'); link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer'; line.appendChild(link); }
        box.appendChild(line);
      });
      var date = shipment.deliveredAt || shipment.estimatedDeliveryAt;
      if (date && !Number.isNaN(Date.parse(date))) box.appendChild(text('p', (shipment.deliveredAt ? '배송 완료: ' : '배송 예정: ') + new Date(date).toLocaleDateString('ko-KR')));
      packages.appendChild(box);
    });
  }
  function boot(root) {
    if (root.dataset.shippingReady) return;
    root.dataset.shippingReady = 'true';
    var cards = Array.from(root.querySelectorAll('[data-order-card]'));
    cards.forEach(function (card) { steps(card, Number(card.dataset.shippingStage)); });
    var pending = false;
    async function refresh() {
      if (pending || document.hidden || !root.isConnected) return;
      pending = true;
      try {
        for (var offset = 0; offset < cards.length; offset += 20) {
          var batch = cards.slice(offset, offset + 20);
          try {
            var url = new URL((root.dataset.proxyBase || '/apps/townwine-follow').replace(/\/$/, '') + '/order-status', location.origin);
            url.searchParams.set('orderIds', batch.map(function (card) { return card.dataset.orderId; }).join(','));
            var response = await fetch(url, {credentials: 'same-origin', cache: 'no-store', headers: {Accept: 'application/json'}, signal: AbortSignal.timeout(20000)});
            if (!response.ok) throw new Error('Shipping lookup failed');
            var payload = await response.json();
            if (!payload.loggedIn) throw new Error('Login required');
            batch.forEach(function (card) {
              var status = payload.statuses && payload.statuses[card.dataset.orderId];
              var note = card.querySelector('[data-shipping-sync]');
              if (status) { render(card, status); if (note) note.textContent = '배송 정보 업데이트 ' + new Date().toLocaleTimeString('ko-KR', {hour: '2-digit', minute: '2-digit'}); }
              else if (note) note.textContent = '상세 배송 정보는 주문 상세 또는 배송사 조회에서 확인해 주세요.';
            });
          } catch (_) {
            batch.forEach(function (card) { var note = card.querySelector('[data-shipping-sync]'); if (note) note.textContent = '배송 정보 갱신이 지연되고 있습니다. 주문 상세에서 확인해 주세요.'; });
          }
        }
        root.dispatchEvent(new CustomEvent('townwine:shipping-updated'));
      } finally { pending = false; }
    }
    refresh();
    var timer = setInterval(function () { if (!root.isConnected) clearInterval(timer); else refresh(); }, 60000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('pageshow', refresh);
  }
  function start() { document.querySelectorAll('[data-order-management][data-live-shipping]').forEach(boot); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  document.addEventListener('shopify:section:load', start);
})();
