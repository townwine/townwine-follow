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
    var pagination = root.querySelector('[data-history-pagination]');
    var pageSizeSelect = root.querySelector('[data-history-page-size]');
    var products = [], page = 1, pageSize = 10;
    function renderPage(moveFocus) {
      var totalPages = Math.max(1, Math.ceil(products.length / pageSize));
      page = Math.max(1, Math.min(page, totalPages));
      var offset = (page - 1) * pageSize;
      list.replaceChildren();
      products.slice(offset, offset + pageSize).forEach(function (product) {
        var link = text('a', 'tw-history-row', '');
        link.href = '/products/' + encodeURIComponent(product.handle);
        var main = text('span', 'tw-history-main', '');
        var thumb = text('span', 'tw-history-thumb', '');
        var source = product.images && product.images[0];
        var url = source && (source.src || source);
        if (typeof url === 'string' && /^(https:\/\/|\/\/)/.test(url)) {
          var image = document.createElement('img');
          image.src = url; image.alt = ''; image.loading = 'lazy';
          image.width = 64; image.height = 72;
          image.addEventListener('error', function () { thumb.replaceChildren(text('span', 'tw-history-no-image', '사진 없음')); }, {once:true});
          thumb.appendChild(image);
        } else thumb.appendChild(text('span', 'tw-history-no-image', '사진 없음'));
        main.append(thumb, text('span', 'tw-history-title', product.title));
        link.appendChild(main);
        var countries = [
          [/\b(?:HK|Hong Kong)\b|홍콩/i, '🇭🇰 홍콩'], [/France|프랑스/i, '🇫🇷 프랑스'],
          [/\b(?:UK|United Kingdom)\b|영국/i, '🇬🇧 영국'], [/\b(?:US|USA|United States)\b|미국/i, '🇺🇸 미국'],
          [/Germany|독일/i, '🇩🇪 독일'], [/Japan|일본/i, '🇯🇵 일본'], [/Taiwan|대만/i, '🇹🇼 대만'],
          [/China|중국/i, '🇨🇳 중국'], [/Thailand|태국/i, '🇹🇭 태국'], [/Italy|이탈리아/i, '🇮🇹 이탈리아'],
          [/Australia|호주/i, '🇦🇺 호주'], [/Singapore|싱가포르/i, '🇸🇬 싱가포르']
        ];
        var country = countries.find(function (entry) { return entry[0].test(product.vendor || ''); });
        link.appendChild(text('span', 'tw-history-country', country ? country[1] : '국가 미확인'));
        var titleDate = String(product.title).match(/^(20\d{2})[.\-/](\d{2})[.\-/](\d{2})/);
        var date = new Date(product.created_at);
        var dateLabel = titleDate ? titleDate.slice(1).join('.') : Number.isNaN(date.getTime()) ? '날짜 미확인' : new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(date).replace(/-/g, '.');
        link.appendChild(text('span', 'tw-history-date', dateLabel));
        list.appendChild(link);
      });
      status.textContent = products.length ? '총 ' + products.length + '개 · ' + (offset + 1) + '–' + Math.min(offset + pageSize, products.length) + '개 표시' : '아직 등록된 공구 내역이 없습니다.';
      pagination.replaceChildren();
      pagination.hidden = totalPages <= 1;
      function button(label, target, disabled, current) {
        var node = text('button', 'tw-history-page', label);
        node.type = 'button'; node.disabled = disabled;
        node.setAttribute('aria-label', label === '이전' || label === '다음' ? label + ' 페이지' : label + '페이지');
        if (current) node.setAttribute('aria-current', 'page');
        node.addEventListener('click', function () { page = target; renderPage(true); });
        pagination.appendChild(node);
      }
      button('이전', page - 1, page === 1, false);
      var start = Math.max(1, Math.min(page - 1, totalPages - 2));
      var end = Math.min(totalPages, start + 2);
      if (start > 1) {
        button('1', 1, false, false);
        if (start > 2) pagination.appendChild(text('span', 'tw-history-ellipsis', '…'));
      }
      for (var index = start; index <= end; index++) button(String(index), index, false, index === page);
      if (end < totalPages) {
        if (end < totalPages - 1) pagination.appendChild(text('span', 'tw-history-ellipsis', '…'));
        button(String(totalPages), totalPages, false, false);
      }
      button('다음', page + 1, page === totalPages, false);
      if (moveFocus) {
        root.scrollIntoView({block:'start'});
        var heading = root.querySelector('h2');
        heading.setAttribute('tabindex', '-1'); heading.focus({preventScroll:true});
      }
    }
    pageSizeSelect.addEventListener('change', function () {
      pageSize = Number(pageSizeSelect.value); page = 1; renderPage(false);
    });
    function load() {
      status.textContent = '공구 내역을 불러오는 중입니다.';
      window.TownWineCatalog.load().then(function (payload) {
        products = payload.products.filter(function (product) {
          var detail = payload.collectorDetails[product.handle];
          return detail && detail.followHandle === root.dataset.collectorHandle;
        }).sort(function (a,b) {return Date.parse(b.created_at)-Date.parse(a.created_at);});
        status.textContent = products.length ? '총 ' + products.length + '개의 공구' : '아직 등록된 공구 내역이 없습니다.';
        renderPage(false);
      }).catch(function () {
        status.textContent = '공구 내역을 불러오지 못했습니다. ';
        var retry = text('button', 'btn btn--gh', '다시 불러오기');
        retry.type = 'button'; retry.addEventListener('click', load, {once:true}); status.appendChild(retry);
      });
    }
    load();
  });
})();
