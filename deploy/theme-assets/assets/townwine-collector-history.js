(function () {
  function text(tag, className, value) {
    var node = document.createElement(tag);
    node.className = className;
    node.textContent = value;
    return node;
  }
  document.querySelectorAll('[data-collector-history]').forEach(function (root) {
    var list = root.querySelector('[data-history-list]');
    var status = root.querySelector('[data-history-status]');
    var more = root.querySelector('[data-history-more]');
    var products = [], shown = 0;
    function renderMore() {
      products.slice(shown, shown + 12).forEach(function (product) {
        var link = text('a', 'lib__r', '');
        link.href = '/products/' + encodeURIComponent(product.handle);
        var media = text('div', 'lib__m', '');
        var source = product.images && product.images[0];
        var url = source && (source.src || source);
        if (typeof url === 'string' && /^(https:\/\/|\/\/)/.test(url)) {
          var image = document.createElement('img');
          image.src = url; image.alt = product.title; image.loading = 'lazy';
          image.style.cssText = 'width:100%;height:100%;object-fit:contain';
          media.appendChild(image);
        }
        var body = text('div', 'lib__bd', '');
        body.appendChild(text('div', 'lib__t', product.title));
        body.appendChild(text('div', 'lib__sub', product.vendor || ''));
        body.appendChild(text('span', 'bd bd--out', product.available ? '진행 중' : '종료'));
        link.append(media, body);
        var date = new Date(product.created_at);
        link.appendChild(text('div', 'lib__date', Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('ko-KR')));
        var prices = (product.variants || []).map(function (variant) {return Number(variant.price);}).filter(Number.isFinite);
        if (prices.length) link.appendChild(text('div', 'lib__pr', new Intl.NumberFormat('ko-KR', {style:'currency',currency:root.dataset.currency || 'HKD'}).format(Math.min.apply(null,prices))));
        list.appendChild(link);
      });
      shown = Math.min(shown + 12, products.length);
      more.hidden = shown >= products.length;
    }
    more.addEventListener('click', renderMore);
    function load() {
      status.textContent = '공구 내역을 불러오는 중입니다.';
      window.TownWineCatalog.load().then(function (payload) {
        products = payload.products.filter(function (product) {
          var detail = payload.collectorDetails[product.handle];
          return detail && detail.followHandle === root.dataset.collectorHandle;
        }).sort(function (a,b) {return Date.parse(b.created_at)-Date.parse(a.created_at);});
        status.textContent = products.length ? '총 ' + products.length + '개의 공구' : '아직 등록된 공구 내역이 없습니다.';
        renderMore();
      }).catch(function () {
        status.textContent = '공구 내역을 불러오지 못했습니다. ';
        var retry = text('button', 'btn btn--gh', '다시 불러오기');
        retry.type = 'button'; retry.addEventListener('click', load, {once:true}); status.appendChild(retry);
      });
    }
    load();
  });
})();
