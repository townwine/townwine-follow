import type { WineOffer, WineQuery, WineResult } from "./wine-search.server";
import {
  LOCATIONS,
  COUNTRY_LABELS,
  MERCHANT_DIRECTORY,
} from "./wine-search.server";
const COUNTRY_FLAGS: Record<string, string> = {
  USA: "🇺🇸", UK: "🇬🇧", France: "🇫🇷", Italy: "🇮🇹", Germany: "🇩🇪",
  "Hong Kong": "🇭🇰", Japan: "🇯🇵", Australia: "🇦🇺", China: "🇨🇳",
  Taiwan: "🇹🇼", Thailand: "🇹🇭", Singapore: "🇸🇬", Switzerland: "🇨🇭",
  Belgium: "🇧🇪", Denmark: "🇩🇰",
};
const countryFlag = (country: string) => COUNTRY_FLAGS[country]
  ? `<span class="tw-ws-flag" aria-hidden="true">${COUNTRY_FLAGS[country]}</span>`
  : "";
const escape = (value: string) =>
  value.replace(
    /[&<>"'{}]/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
        "{": "&#123;",
        "}": "&#125;",
      })[char]!,
  );
export function renderWineSearchPage({
  query,
  result,
  error,
  available,
}: {
  query?: WineQuery;
  result?: WineResult;
  error?: string;
  available: boolean;
}) {
  const e = escape;
  const visibleOffers =
    result?.offers.filter(
      (o) => !query || query.location === "ALL" || o.country === query.location,
    ) || [];
  const directory = MERCHANT_DIRECTORY.filter(
    (m) =>
      m.origin &&
      (!query || query.location === "ALL" || m.country === query.location),
  );
  const merchantLink = (merchant: (typeof MERCHANT_DIRECTORY)[number]) => {
    const template =
      "searchTemplate" in merchant ? merchant.searchTemplate : undefined;
    if (query && template) {
      const term = [query.name, query.vintage === "2" ? "" : query.vintage]
        .filter(Boolean)
        .join(" ");
      try {
        const url = new URL(
          template.replace("{query}", encodeURIComponent(term)),
        );
        if (url.origin === merchant.origin && url.protocol === "https:")
          return url.href;
      } catch {
        /* Fall back to the verified shop homepage. */
      }
    }
    return merchant.origin || "";
  };
  const searchLink = (vintage: string, location: string) =>
    "/apps/townwine-follow/wine-search?" +
    new URLSearchParams({ q: query?.name || "", vintage, location }).toString();
  const icon =
    '<svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>';
  function offerCard(offer: WineOffer) {
    const price = new Intl.NumberFormat("ko-KR", {
      style: "currency",
      currency: offer.currency,
      currencyDisplay: "code",
    }).format(offer.price);
    return `<article class="tw-ws-offer"><div class="tw-ws-product"><div class="tw-ws-badges"><span class="tw-ws-country">${countryFlag(offer.country)}${e(COUNTRY_LABELS[offer.country] || offer.country || "국가 미확인")}</span>${offer.availability ? `<span class="tw-ws-stock">${e(offer.availability)}</span>` : ""}</div><h3>${e(offer.title || offer.merchant)}</h3><p class="tw-ws-merchant">${e(offer.merchant)}</p><p class="tw-ws-spec">${e(offer.vintage || "빈티지 미확인")}<span>·</span>${e(offer.bottleSize || "용량은 판매처에서 확인")}</p></div><div class="tw-ws-offer-action"><div class="tw-ws-price">${offer.priceKrw ? `<strong><small>약</small> ${Math.round(offer.priceKrw).toLocaleString("ko-KR")}<small>원</small></strong><span>${e(price)}</span>` : `<strong>${e(price)}</strong>`}</div><a class="tw-ws-button tw-ws-buy" href="${e(offer.url)}" target="_blank" rel="noopener noreferrer">판매처 보기 <span aria-hidden="true">↗</span><span class="tw-ws-sr-only"> (새 창)</span></a>${offer.tax ? `<span class="tw-ws-tax">${e(offer.tax)}</span>` : ""}</div></article>`;
  }
  const failed =
    result?.source === "merchants" &&
    result.coverage?.searched &&
    !result.coverage.succeeded;
  const filteredEmpty = result?.offers.length && !visibleOffers.length;
  const emptyTitle = failed
    ? "판매처 정보를 잠시 불러올 수 없어요"
    : filteredEmpty
      ? "선택한 국가에는 검색 결과가 없어요"
      : result?.state === "ambiguous"
        ? "와인 이름을 조금 더 알려주세요"
        : "조건에 맞는 와인을 찾지 못했어요";
  const emptyText = failed
    ? "잠시 후 다시 검색해 주세요."
    : filteredEmpty
      ? "전체 국가에서 확인한 판매 정보를 살펴보세요."
      : "생산자와 와인명 위주로 짧게 검색해 보세요. 빈티지를 비우면 더 넓게 찾을 수 있어요.";
  return `{% layout none %}<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>국가별 와인 찾기 | TOWN WINE</title>{{ 'townwine.css' | asset_url | stylesheet_tag }}<style>
body{margin:0;background:#f6f1e7;color:#2f2c28;font-family:Pretendard,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;line-height:1.55}
.tw-wine-page{max-width:1080px;margin:auto;padding:44px 28px 80px}.tw-wine-page *{box-sizing:border-box}.tw-wine-page a{color:inherit}.tw-wine-page p{margin:0}.tw-wine-page h1,.tw-wine-page h2,.tw-wine-page h3{margin:0;letter-spacing:-.035em;word-break:keep-all;overflow-wrap:anywhere}.tw-wine-page h1{font-size:34px;line-height:1.3}.tw-wine-page .tw-ws-intro{color:#756e64;font-size:15px;margin-top:10px}.tw-ws-heading{margin-bottom:25px}
.tw-wine-page .tw-ws-search{background:#fffdf9;border:1px solid #dfd7cb;border-radius:12px;padding:22px 24px;box-shadow:0 3px 15px #392b1704}.tw-ws-fields{display:grid;grid-template-columns:minmax(0,1fr) 142px 114px;gap:12px;align-items:end}.tw-wine-page label{display:block;font-size:13px;font-weight:650;margin-bottom:7px}.tw-wine-page input,.tw-wine-page select{width:100%;min-width:0;height:48px;border:1px solid #d4ccbf;border-radius:6px;background:white;padding:0 13px;font:inherit;font-size:15px;color:#332f28}.tw-wine-page input::placeholder{color:#999083}.tw-wine-page :is(input,select,a,button,summary):focus-visible{outline:3px solid #a8834c;outline-offset:3px}.tw-wine-page .tw-ws-hint{font-size:12px;color:#82786b;margin-top:11px}.tw-wine-page .tw-ws-button{display:inline-flex;align-items:center;justify-content:center;gap:9px;min-height:46px;border:1px solid #332c24;border-radius:6px;background:#332c24;color:#fff;padding:10px 17px;font:inherit;font-size:14px;font-weight:650;text-decoration:none;cursor:pointer;white-space:nowrap}.tw-wine-page .tw-ws-button:hover{background:#514337}.tw-wine-page .tw-ws-button:disabled{opacity:.45;cursor:wait}.tw-ws-submit{height:48px}.tw-wine-page .tw-ws-secondary{background:#fffdf9;border-color:#d9d0c2;color:#433a30}.tw-wine-page .tw-ws-secondary:hover{background:#f1eadd}
.tw-ws-results{margin-top:32px}.tw-ws-toolbar{display:flex;justify-content:space-between;align-items:center;gap:20px;padding-bottom:16px;border-bottom:1px solid #dbd3c7}.tw-wine-page .tw-ws-result-title{display:flex;align-items:center;gap:10px}.tw-wine-page h2{font-size:23px;line-height:1.35}.tw-ws-count{font-size:14px;background:#e9e1d4;color:#75634b;border-radius:20px;min-width:30px;padding:3px 10px;text-align:center}.tw-ws-filter{display:flex;align-items:center;gap:10px;flex-shrink:0}.tw-wine-page .tw-ws-filter label{margin:0;white-space:nowrap;color:#72685b;font-size:12px}.tw-wine-page .tw-ws-filter select{display:block;appearance:none;-webkit-appearance:none;height:42px;width:155px;padding:0 40px 0 14px;line-height:normal;font-size:13px;cursor:pointer;background-color:#fff;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2372685b' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 13px center;background-size:16px 16px}.tw-ws-query{font-size:14px;color:#72685d;overflow-wrap:anywhere;word-break:normal;margin:14px 0 0!important;line-height:1.65}.tw-ws-query-label{color:#9a8f7e;margin-right:8px;font-size:12px}.tw-ws-result-meta{display:flex;justify-content:space-between;gap:15px;font-size:12px;color:#827869;margin:12px 0}.tw-ws-price-note{max-width:620px}.tw-ws-sort{white-space:nowrap;color:#574b3d;font-weight:600}.tw-ws-list{display:grid;gap:10px}
.tw-wine-page .tw-ws-offer{background:#fffdf9;border:1px solid #e0d8cc;border-radius:9px;display:grid;grid-template-columns:minmax(0,1fr) 186px;gap:28px;padding:22px 24px}.tw-ws-badges{display:flex;gap:9px;align-items:center;margin-bottom:10px}.tw-ws-flag{display:inline-block;font-family:"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif;font-size:16px;line-height:1;vertical-align:middle;flex-shrink:0;margin-right:5px}.tw-ws-country{display:inline-flex;align-items:center;font-size:11px;line-height:1.3;border:1px solid #e2d9cb;background:#f5efe5;padding:4px 8px;border-radius:4px;color:#6d5e49}.tw-ws-stock{font-size:11px;color:#54705b}.tw-ws-stock:before{content:"";display:inline-block;width:5px;height:5px;background:#709078;border-radius:50%;margin-right:5px;vertical-align:middle}.tw-wine-page .tw-ws-offer h3{font-size:17px;line-height:1.5;letter-spacing:-.02em}.tw-wine-page .tw-ws-merchant{font-size:13px;color:#706459;margin-top:7px}.tw-wine-page .tw-ws-spec{font-size:12px;color:#8a7d6c;margin-top:5px}.tw-ws-spec span{margin:0 8px;color:#c5b9a8}.tw-ws-offer-action{display:flex;flex-direction:column;align-items:flex-end;justify-content:center;gap:13px}.tw-ws-price{text-align:right}.tw-ws-price strong{font-size:25px;letter-spacing:-.04em;font-variant-numeric:tabular-nums;line-height:1.25}.tw-ws-price small{font-size:14px;font-weight:500;letter-spacing:0}.tw-ws-price>span{display:block;font-size:12px;color:#918572;margin-top:4px}.tw-wine-page .tw-ws-buy{min-height:39px;padding:8px 14px;font-size:12px}.tw-ws-tax{font-size:11px;color:#90816d;text-align:right}
.tw-ws-empty{background:#fffdf9;border:1px solid #dfd7ca;border-radius:10px;padding:44px 24px;text-align:center;margin-top:18px}.tw-ws-empty-icon{display:flex;align-items:center;justify-content:center;background:#f3ede3;color:#958269;border-radius:50%;width:52px;height:52px;margin:0 auto 15px}.tw-wine-page .tw-ws-empty h3{font-size:19px;margin-bottom:8px}.tw-wine-page .tw-ws-empty p{color:#887968;font-size:13px;max-width:430px;margin:auto;line-height:1.8;word-break:keep-all}.tw-ws-request{margin-top:22px}.tw-wine-page .tw-ws-request p{margin:0 auto 13px;max-width:460px}.tw-ws-request .tw-ws-button{white-space:normal}.tw-ws-empty-actions{display:flex;justify-content:center;gap:9px;flex-wrap:wrap;margin-top:22px}.tw-ws-notice{padding:15px 18px;background:#eee7da;border-radius:7px;margin-top:15px;font-size:14px}.tw-ws-footer{margin-top:20px;display:flex;justify-content:space-between;gap:18px;color:#928371;font-size:11px}.tw-ws-info{max-width:660px}.tw-ws-info summary,.tw-ws-directory summary{cursor:pointer;min-height:32px}.tw-wine-page .tw-ws-info p{margin:8px 0;line-height:1.8}.tw-ws-stamp{white-space:nowrap}.tw-ws-directory{margin-top:27px;padding-top:18px;border-top:1px solid #e1d9cd;color:#847663;font-size:13px}.tw-ws-directory-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 25px;padding-top:8px}.tw-wine-page .tw-ws-directory-grid p{padding:9px 0;border-bottom:1px solid #e9e2d7;font-size:12px;display:flex;gap:12px;justify-content:space-between}.tw-ws-directory-grid a{text-decoration:none}.tw-ws-directory-grid span{white-space:nowrap;font-size:11px;color:#9a8d7b}.tw-ws-sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
@media(max-width:640px){.tw-wine-page{padding:28px 18px 50px}.tw-wine-page h1{font-size:28px}.tw-wine-page .tw-ws-intro{font-size:13px;max-width:280px}.tw-ws-heading{margin-bottom:20px}.tw-wine-page .tw-ws-search{padding:17px}.tw-ws-fields{grid-template-columns:minmax(0,1fr) 106px;gap:12px}.tw-ws-name-field{grid-column:1/-1}.tw-ws-submit{width:100%}.tw-wine-page .tw-ws-hint{font-size:11px}.tw-ws-results{margin-top:25px}.tw-ws-toolbar{gap:12px}.tw-wine-page h2{font-size:20px}.tw-ws-filter label{display:none}.tw-wine-page .tw-ws-filter select{width:128px;max-width:36vw}.tw-ws-query{font-size:12px}.tw-ws-result-meta{display:block}.tw-ws-sort{display:block;margin-top:7px;text-align:right;font-size:11px}.tw-ws-price-note{font-size:11px}.tw-wine-page .tw-ws-offer{grid-template-columns:1fr;gap:16px;padding:18px}.tw-wine-page .tw-ws-offer h3{font-size:16px}.tw-ws-offer-action{flex-direction:row;align-items:center;justify-content:space-between;flex-wrap:wrap;padding-top:14px;border-top:1px solid #eee7db}.tw-ws-price{text-align:left}.tw-ws-price strong{font-size:24px}.tw-wine-page .tw-ws-buy{min-height:43px}.tw-ws-tax{width:100%;text-align:left}.tw-ws-empty{padding:30px 17px}.tw-wine-page .tw-ws-empty h3{font-size:17px}.tw-ws-footer{flex-direction:column;gap:4px}.tw-ws-directory-grid{grid-template-columns:1fr}}
</style></head><body class="townwine-surface">{% render 'townwine-header', current: 'wine-search' %}<main class="tw-wine-page" id="MainContent"><header class="tw-ws-heading"><h1>국가별 와인 찾기</h1><p class="tw-ws-intro">찾는 와인, 더 좋은 가격으로.<br>해외 판매처의 가격을 한 번에 비교해 보세요.</p></header>
<form class="tw-ws-search" method="get" action="/apps/townwine-follow/wine-search"><div class="tw-ws-fields"><div class="tw-ws-name-field"><label for="wine-name">와인 이름</label><input id="wine-name" name="q" value="${e(query?.name || "")}" placeholder="생산자 또는 와인명으로 검색" minlength="2" maxlength="160" required aria-describedby="search-hint"></div><div><label for="vintage">빈티지 <span style="font-weight:400;color:#998b78">선택</span></label><input id="vintage" name="vintage" value="${e(query?.vintage === "2" ? "" : query?.vintage || "")}" placeholder="전체 / NV" maxlength="4"></div><button class="tw-ws-button tw-ws-submit" type="submit" ${available ? "" : "disabled"}>${icon} 검색</button></div><p id="search-hint" class="tw-ws-hint">영문 와인명을 입력해 주세요. 빈티지를 비우면 모든 연도를 검색합니다.</p></form>
${!available ? '<aside class="tw-ws-notice">데이터 연결이 완료되면 검색할 수 있습니다.</aside>' : ""}${error ? `<div class="tw-ws-notice" role="alert">${e(/Wine-Searcher|와인서쳐|원문 검색/i.test(error) ? "판매처 정보를 불러오지 못했습니다. 잠시 후 다시 검색해 주세요." : error)}</div>` : ""}
${
  result
    ? `<section class="tw-ws-results" aria-label="검색 결과"><div class="tw-ws-toolbar"><div class="tw-ws-result-title"><h2>검색 결과</h2><span class="tw-ws-count">${visibleOffers.length}</span></div><form class="tw-ws-filter" method="get" action="/apps/townwine-follow/wine-search"><input type="hidden" name="q" value="${e(query?.name || "")}"><input type="hidden" name="vintage" value="${e(query?.vintage === "2" ? "" : query?.vintage || "")}"><label for="result-country">판매 국가</label><select id="result-country" name="location" onchange="this.form.requestSubmit()"><option value="ALL">전체 국가</option>${LOCATIONS.map((location) => `<option value="${e(location)}" ${location === query?.location ? "selected" : ""}>${COUNTRY_FLAGS[location] || ""} ${e(COUNTRY_LABELS[location])}</option>`).join("")}</select><noscript><button type="submit">적용</button></noscript></form></div><p class="tw-ws-query"><span class="tw-ws-query-label">검색어</span>${e(result.matchedName || query?.name || "")}</p>
${visibleOffers.length ? `<div class="tw-ws-result-meta"><span class="tw-ws-price-note">상품 금액 기준 · 배송비·추가 세금 별도 · 용량과 묶음 수량을 확인해 주세요.</span><span class="tw-ws-sort">${result.fxDate ? "원화 환산 낮은 순" : "통화별 가격 낮은 순"}</span></div><div class="tw-ws-list">${visibleOffers.map(offerCard).join("")}</div>` : `<div class="tw-ws-empty"><div class="tw-ws-empty-icon">${icon}</div><h3>${emptyTitle}</h3><p>${emptyText}</p><div class="tw-ws-request"><p>찾는 와인이 없나요? 카페의 ‘구해주세요!’ 게시판에 와인명과 원하시는 빈티지를 남겨주세요.</p><a class="tw-ws-button" href="https://cafe.naver.com/f-e/cafes/31447910/menus/1" target="_blank" rel="noopener noreferrer">구해주세요! 게시판에 글 남기기 <span aria-hidden="true">↗</span><span class="tw-ws-sr-only"> (새 창)</span></a></div><div class="tw-ws-empty-actions">${filteredEmpty ? `<a class="tw-ws-button" href="${e(searchLink(query?.vintage === "2" ? "" : query?.vintage || "", "ALL"))}">전체 국가 보기</a>` : '<button class="tw-ws-button" type="button" onclick="document.getElementById(\'wine-name\').focus();document.getElementById(\'wine-name\').select()">검색어 수정</button>'}${query?.vintage && query.vintage !== "2" ? `<a class="tw-ws-button tw-ws-secondary" href="${e(searchLink("", query.location))}">모든 빈티지로 검색</a>` : ""}</div></div>`}
<div class="tw-ws-footer"><details class="tw-ws-info"><summary>검색·가격 안내</summary><p>연결된 판매처에서 확인한 정보이며 전체 해외 판매처를 포함하지 않습니다.${result.coverage ? ` ${result.coverage.succeeded}곳 조회 완료.${result.coverage.incomplete ? ` ${result.coverage.incomplete}곳은 일부 정보를 확인하지 못했습니다.` : ""}` : ""}</p>${result.fxDate ? `<p>환율 기준 ${e(result.fxDate)}. 원화 금액은 비교를 위한 참고 금액이며 결제 환율에 따라 달라집니다.</p>` : ""}<p>상품 가격은 용량·묶음 단위가 다를 수 있습니다. 배송비와 추가 세금, 최종 재고는 판매처에서 확인해 주세요.</p></details><span class="tw-ws-stamp">${e(new Date(result.fetchedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }))} 확인</span></div></section>`
    : ""
}
<details class="tw-ws-directory"><summary>판매처 둘러보기 <span>(${directory.length})</span></summary><div class="tw-ws-directory-grid">${directory.map((m) => `<p><a href="${e(merchantLink(m))}" target="_blank" rel="noopener noreferrer">${e(m.name)} ↗</a><span>${countryFlag(m.country)}${e(COUNTRY_LABELS[m.country] || m.country)}</span></p>`).join("")}</div></details></main></body></html>`;
}
