import type { WineOffer, WineQuery, WineResult } from "./wine-search.server";
import {
  LOCATIONS,
  COUNTRY_LABELS,
  MERCHANT_DIRECTORY,
} from "./wine-search.server";
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
  function offerCard(offer: WineOffer) {
    const price = new Intl.NumberFormat("ko-KR", {
      style: "currency",
      currency: offer.currency,
      currencyDisplay: "code",
    }).format(offer.price);
    return `<article class="tw-ws-offer"><div><p class="tw-ws-eyebrow">${e(COUNTRY_LABELS[offer.country] || offer.country || "국가 정보 없음")}</p><h3>${e(offer.merchant)}</h3>${offer.title ? `<p>${e(offer.title)}</p>` : ""}${offer.availability ? `<p class="tw-ws-detail">${e(offer.availability)}</p>` : ""}<p class="tw-ws-detail">빈티지 ${e(offer.vintage || "정보 없음")} · ${e(offer.bottleSize || "용량 정보 없음")}</p><p class="tw-ws-detail">${e(offer.tax || "세금 포함 여부는 판매처에서 확인")}</p></div><div class="tw-ws-offer-action">${offer.priceKrw ? `<strong>약 ${Math.round(offer.priceKrw).toLocaleString("ko-KR")}원</strong><span class="tw-ws-detail">${e(price)}</span>` : `<strong>${e(price)}</strong>`}<a class="tw-ws-button" href="${e(offer.url)}" target="_blank" rel="noopener noreferrer">판매처 보기 ↗<span class="tw-ws-sr-only"> (새 창)</span></a></div></article>`;
  }
  return `{% layout none %}<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>국가별 와인 찾기 | TOWN WINE</title>{{ 'townwine.css' | asset_url | stylesheet_tag }}<style>
  .tw-wine-page *{box-sizing:border-box}body{margin:0;background:#f6f1e7;color:#2f2c28;font-family:Pretendard,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;line-height:1.6}.tw-wine-page a{color:inherit}.tw-wine-page{max-width:960px;margin:auto;padding:64px 24px 100px}.tw-wine-page .tw-ws-eyebrow{font-size:12px;letter-spacing:.1em;color:#716656;margin:0 0 8px}.tw-wine-page h1{font-size:clamp(30px,5vw,46px);line-height:1.25;letter-spacing:-.04em;margin:0 0 18px}.tw-wine-page h2{font-size:22px;margin:0}.tw-wine-page h3{font-size:19px;margin:0}.tw-wine-page .tw-ws-intro{color:#6d655b;max-width:630px;margin-bottom:30px}.tw-wine-page .tw-ws-search{background:#fffdf8;border:1px solid #d8d0c2;padding:26px;border-radius:6px}.tw-wine-page .tw-ws-fields{display:grid;grid-template-columns:1fr 160px;gap:16px}.tw-wine-page label{display:block;font-size:13px;font-weight:700;margin-bottom:7px}.tw-wine-page input,.tw-wine-page select{width:100%;min-height:48px;border:1px solid #c8bead;background:#fff;border-radius:3px;padding:12px;font:inherit;color:inherit}.tw-wine-page input:focus,.tw-wine-page select:focus,.tw-wine-page a:focus-visible,.tw-wine-page button:focus-visible{outline:3px solid #96703a;outline-offset:3px}.tw-wine-page .tw-ws-hint{font-size:13px;color:#786d5f;margin:12px 0 20px}.tw-wine-page .tw-ws-button{display:inline-flex;align-items:center;justify-content:center;min-height:46px;border:0;border-radius:3px;background:#332c24;color:white;padding:10px 20px;font:inherit;font-weight:700;text-decoration:none;cursor:pointer}.tw-wine-page button:disabled{background:#d6cdbd;color:#686054;cursor:not-allowed}.tw-wine-page .tw-ws-notice{margin-top:22px;padding:20px;border:1px solid #d8d0c2;background:#ede6d8;border-radius:4px}.tw-wine-page .tw-ws-notice p{margin:0}.tw-wine-page .tw-ws-filter{max-width:220px;margin:16px 0}.tw-wine-page .tw-ws-results{margin-top:42px}.tw-wine-page .tw-ws-result-head{display:flex;justify-content:space-between;align-items:baseline;gap:16px;margin-bottom:16px}.tw-wine-page .tw-ws-detail,.tw-wine-page .tw-ws-stamp{font-size:13px;color:#786d5f;margin:6px 0}.tw-wine-page .tw-ws-offer{background:#fffdf8;border:1px solid #d8d0c2;padding:24px;display:flex;justify-content:space-between;gap:24px;margin:12px 0;border-radius:4px}.tw-wine-page .tw-ws-offer-action{display:flex;flex-direction:column;gap:12px;align-items:flex-end;min-width:160px}.tw-wine-page .tw-ws-offer-action strong{font-size:22px}.tw-wine-page .tw-ws-sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}@media(max-width:640px){.tw-wine-page{padding:36px 18px 64px}.tw-wine-page .tw-ws-search{padding:20px}.tw-wine-page .tw-ws-fields{grid-template-columns:1fr 1fr}.tw-wine-page .tw-ws-name-field{grid-column:1/-1}.tw-wine-page .tw-ws-offer{padding:20px;flex-direction:column;gap:12px}.tw-wine-page .tw-ws-offer-action{flex-direction:row;align-items:center;justify-content:space-between}.tw-wine-page .tw-ws-result-head{display:block}.tw-wine-page .tw-ws-search button{width:100%}}
  </style></head><body class="townwine-surface">{% render 'townwine-header', current: 'wine-search' %}<main class="tw-wine-page" id="MainContent"><p class="tw-ws-eyebrow">FIND YOUR NEXT BOTTLE</p><h1>국가별 와인 찾기</h1><p class="tw-ws-intro">상품명으로 해외 판매처의 가격을 한 번에 비교하세요. 검색 후 원하는 국가만 골라볼 수 있습니다.</p><form class="tw-ws-search" method="get" action="/apps/townwine-follow/wine-search"><div class="tw-ws-fields"><div class="tw-ws-name-field"><label for="wine-name">상품명</label><input id="wine-name" name="q" value="${e(query?.name || "")}" placeholder="예: Chateau Margaux" minlength="2" maxlength="160" required aria-describedby="search-hint"></div><div><label for="vintage">빈티지</label><input id="vintage" name="vintage" value="${e(query?.vintage === "2" ? "" : query?.vintage || "")}" placeholder="전체 / 2018 / NV" maxlength="4"></div></div><p id="search-hint" class="tw-ws-hint">라벨의 영문 상품명을 권장합니다. 빈티지를 비워두면 모든 연도를 검색합니다.</p><button class="tw-ws-button" type="submit" ${available ? "" : "disabled"}>해외 판매처 검색</button></form>
  ${!available ? '<aside class="tw-ws-notice"><p>해외 판매처 검색을 준비 중입니다. 데이터 연결이 완료되면 검색할 수 있습니다.</p></aside>' : ""}
  ${error ? `<div class="tw-ws-notice" role="alert">${e(/Wine-Searcher|와인서쳐|원문 검색/i.test(error) ? "판매처 정보를 불러오지 못했습니다. 잠시 후 다시 검색해 주세요." : error)}</div>` : ""}
  ${result ? `<section class="tw-ws-results" aria-label="검색 결과"><div class="tw-ws-result-head"><h2>${e(result.matchedName || query?.name || "")} 검색 결과</h2><span class="tw-ws-detail">${visibleOffers.length}개 판매 정보 · ${result.fxDate ? "원화 환산 낮은 순" : "통화별 가격 낮은 순"}</span></div><form class="tw-ws-filter" method="get" action="/apps/townwine-follow/wine-search"><input type="hidden" name="q" value="${e(query?.name || "")}"><input type="hidden" name="vintage" value="${e(query?.vintage === "2" ? "" : query?.vintage || "")}"><label for="result-country">판매 국가</label><select id="result-country" name="location" onchange="this.form.requestSubmit()"><option value="ALL">전체 국가</option>${LOCATIONS.map((location) => `<option value="${e(location)}" ${location === query?.location ? "selected" : ""}>${e(COUNTRY_LABELS[location])}</option>`).join("")}</select><noscript><button type="submit">국가 적용</button></noscript></form>${result.fxDate ? `<p class="tw-ws-detail">환율 기준 ${e(result.fxDate)} · 상품 표시가격 기준이며, 배송비·추가 세금과 용량·묶음 수량에 따라 최종 비용은 달라집니다.</p>` : ""}${result.source === "merchants" ? `<p class="tw-ws-detail">등록 판매처 ${result.coverage?.registered || 0}곳 중 ${result.coverage?.succeeded || 0}곳 조회 완료. 판매처가 직접 표시한 가격과 재고이며, 전체 해외 판매처를 포함하지 않습니다.${result.coverage?.incomplete ? ` ${result.coverage.incomplete}곳은 일부 정보를 확인하지 못했습니다.` : ""}</p>` : result.partial ? `<p class="tw-ws-detail">확인 가능한 판매 정보만 표시합니다. 경매·입고 예정·가격 문의 상품은 제외합니다.</p>` : ""}${result.state === "ambiguous" ? '<div class="tw-ws-notice">여러 상품이 일치합니다. 생산자명·와인명·빈티지를 더 구체적으로 입력해 주세요.</div>' : result.state === "empty" || !visibleOffers.length ? `<div class="tw-ws-notice">${result.source === "merchants" && !result.coverage?.searched ? "이 국가의 직접 검색 판매처는 아직 연결되지 않았습니다." : result.source === "merchants" && !result.coverage?.succeeded ? "판매처 응답을 확인하지 못했습니다. 잠시 후 다시 검색해 주세요." : "조회한 판매처에서 조건에 맞는 재고 상품을 확인하지 못했습니다. 상품명 철자를 확인하거나 빈티지를 바꿔보세요."}</div>` : visibleOffers.map(offerCard).join("")}<p class="tw-ws-stamp">조회 시각: ${e(new Date(result.fetchedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }))} (한국 시간)</p></section>` : ""}
  <details class="tw-ws-results"><summary>판매처 ${MERCHANT_DIRECTORY.filter((m) => m.origin && (!query || query.location === "ALL" || m.country === query.location)).length}곳 보기</summary><p class="tw-ws-detail">국가별 판매처를 확인하세요.</p>${MERCHANT_DIRECTORY.filter(
    (m) =>
      m.origin &&
      (!query || query.location === "ALL" || m.country === query.location),
  )
    .map(
      (m) =>
        `<p class="tw-ws-detail"><a href="${e(m.origin || "")}" target="_blank" rel="noopener noreferrer">${e(m.name)} ↗</a> · ${e(COUNTRY_LABELS[m.country] || m.country)} · ${m.status === "enabled" ? "상품 검색 지원" : "판매처 방문"}</p>`,
    )
    .join("")}</details></main></body></html>`;
}
