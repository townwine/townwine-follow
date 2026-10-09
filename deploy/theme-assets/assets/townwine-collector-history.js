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
    var products = [], total = 0, page = 1, pageSize = 10, requestVersion = 0, controller;
    var filters = root.querySelector('[data-history-filters]');
    var empty = root.querySelector('[data-history-empty]');
    function renderPage(moveFocus) {
      var totalPages = Math.max(1, Math.ceil(total / pageSize));
      page = Math.max(1, Math.min(page, totalPages));
      var offset = (page - 1) * pageSize;
      list.replaceChildren();
      products.forEach(function (product) {
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
      status.textContent = total ? '검색 결과 ' + total + '개 · ' + (offset + 1) + '–' + Math.min(offset + pageSize, total) + '개 표시' : '검색 결과 0개';
      empty.hidden = total > 0;
      pagination.replaceChildren();
      pagination.hidden = totalPages <= 1;
      function button(label, target, disabled, current) {
        var node = text('button', 'tw-history-page', label);
        node.type = 'button'; node.disabled = disabled;
        node.setAttribute('aria-label', label === '이전' || label === '다음' ? label + ' 페이지' : label + '페이지');
        if (current) node.setAttribute('aria-current', 'page');
        node.addEventListener('click', function () { page = target; load(true); });
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
      pageSize = Number(pageSizeSelect.value); page = 1; load(false);
    });
    filters.addEventListener('submit', function (event) {
      event.preventDefault();
      var from = filters.elements.from.value, to = filters.elements.to.value;
      if (from && to && from > to) { status.textContent = '시작일은 종료일보다 늦을 수 없어요.'; return; }
      page = 1; load(false);
    });
    filters.addEventListener('reset', function () {setTimeout(function () {page = 1;load(false);},0);});
    async function load(moveFocus) {
      var version = ++requestVersion;
      if (controller) controller.abort();
      controller = new AbortController();
      var signal = controller.signal;
      var timer = setTimeout(function () {if (version === requestVersion) controller.abort();}, 90000);
      root.setAttribute('aria-busy','true');
      status.textContent = '공구 내역을 불러오는 중입니다.';
      pagination.querySelectorAll('button').forEach(function (button) {button.disabled=true;});
      var params = new URLSearchParams({collector:root.dataset.collectorHandle,page:String(page),pageSize:String(pageSize),q:filters.elements.q.value.trim(),status:filters.elements.status.value,from:filters.elements.from.value,to:filters.elements.to.value});
      try {
        var payload;
        for (var attempt=0;attempt<30;attempt++) {
          var response = await fetch('/apps/townwine-follow/collector-history?' + params.toString(), {signal:signal,headers:{Accept:'application/json'}});
          if (!response.ok) throw new Error('REQUEST_FAILED');
          payload = await response.json();
          if (!payload.pending) break;
          if (signal.aborted) throw new Error('ABORTED');
          await new Promise(function (resolve) {setTimeout(resolve,2000);});
        }
        if (version !== requestVersion) return;
        if (!payload || payload.pending) throw new Error('INDEX_PENDING');
        products = payload.products; total = payload.total; page = payload.page;
        renderPage(moveFocus);
      } catch (error) {
        if (version !== requestVersion) return;
        list.replaceChildren(); pagination.hidden = true; empty.hidden = true;
        status.textContent = '공구 내역을 불러오지 못했습니다. ';
        var retry = text('button', 'btn btn--gh', '다시 불러오기');
        retry.type = 'button'; retry.addEventListener('click', function () {load(false);}, {once:true}); status.appendChild(retry);
      } finally {
        clearTimeout(timer);
        if (version === requestVersion) root.removeAttribute('aria-busy');
      }
    }
    load(false);
  });
})();
