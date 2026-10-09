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
        var link = text('a', 'tw-history-row', '');
        link.href = '/products/' + encodeURIComponent(product.handle);
        link.appendChild(text('span', 'tw-history-title', product.title));
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
        var dateLabel = titleDate ? titleDate.slice(1).join('.') : Number.isNaN(date.getTime()) ? '날짜 미확인' : date.toLocaleDateString('ko-KR', {timeZone:'Asia/Seoul'});
        link.appendChild(text('span', 'tw-history-date', dateLabel));
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
