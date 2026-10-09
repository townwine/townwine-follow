import type { WineOffer, WineQuery, WineResult } from "./wine-search.server";
import { wineSearchUrl } from "./wine-crawl.server";
import {
  LOCATIONS,
  COUNTRY_LABELS,
  FORWARDING_CENTERS,
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
  function offerCard(offer: WineOffer) {
    const price = new Intl.NumberFormat("ko-KR", {
      style: "currency",
      currency: offer.currency,
      currencyDisplay: "code",
    }).format(offer.price);
    return `<article class="offer"><div><p class="eyebrow">${e(COUNTRY_LABELS[offer.country] || offer.country || "국가 정보 없음")}${FORWARDING_CENTERS[offer.country] ? " · 훗타운 센터 운영 국가" : ""}</p><h3>${e(offer.merchant)}</h3>${offer.title ? `<p>${e(offer.title)}</p>` : ""}${offer.availability ? `<p class="detail">${e(offer.availability)}</p>` : ""}<p class="detail">빈티지 ${e(offer.vintage || "정보 없음")} · ${e(offer.bottleSize || "용량 정보 없음")}</p><p class="detail">${e(offer.tax || "세금 포함 여부는 판매처에서 확인")}</p></div><div class="offer-action"><strong>${e(price)}</strong><a class="button" href="${e(offer.url)}" target="_blank" rel="noopener noreferrer">판매처 보기 ↗<span class="sr-only"> (새 창)</span></a></div></article>`;
  }
  return `{% layout none %}<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>국가별 와인 찾기 | TOWN WINE</title>{{ 'townwine.css' | asset_url | stylesheet_tag }}<style>
  .tw-wine-page *{box-sizing:border-box}body{margin:0;background:#f6f1e7;color:#2f2c28;font-family:Pretendard,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;line-height:1.6}.tw-wine-page a{color:inherit}.tw-wine-page{max-width:960px;margin:auto;padding:64px 24px 100px}.tw-wine-page .eyebrow{font-size:12px;letter-spacing:.1em;color:#716656;margin:0 0 8px}.tw-wine-page h1{font-size:clamp(30px,5vw,46px);line-height:1.25;letter-spacing:-.04em;margin:0 0 18px}.tw-wine-page h2{font-size:22px;margin:0}.tw-wine-page h3{font-size:19px;margin:0}.tw-wine-page .intro{color:#6d655b;max-width:630px;margin-bottom:30px}.tw-wine-page .search{background:#fffdf8;border:1px solid #d8d0c2;padding:26px;border-radius:6px}.tw-wine-page .fields{display:grid;grid-template-columns:1fr 140px 150px;gap:16px}.tw-wine-page label{display:block;font-size:13px;font-weight:700;margin-bottom:7px}.tw-wine-page input,.tw-wine-page select{width:100%;min-height:48px;border:1px solid #c8bead;background:#fff;border-radius:3px;padding:12px;font:inherit;color:inherit}.tw-wine-page input:focus,.tw-wine-page select:focus,.tw-wine-page a:focus-visible,.tw-wine-page button:focus-visible{outline:3px solid #96703a;outline-offset:3px}.tw-wine-page .hint{font-size:13px;color:#786d5f;margin:12px 0 20px}.tw-wine-page .button{display:inline-flex;align-items:center;justify-content:center;min-height:46px;border:0;border-radius:3px;background:#332c24;color:white;padding:10px 20px;font:inherit;font-weight:700;text-decoration:none;cursor:pointer}.tw-wine-page button:disabled{background:#d6cdbd;color:#686054;cursor:not-allowed}.tw-wine-page .notice{margin-top:22px;padding:20px;border:1px solid #d8d0c2;background:#ede6d8;border-radius:4px}.tw-wine-page .notice p{margin:0}.tw-wine-page .results{margin-top:42px}.tw-wine-page .result-head{display:flex;justify-content:space-between;align-items:baseline;gap:16px;margin-bottom:16px}.tw-wine-page .detail,.tw-wine-page .stamp{font-size:13px;color:#786d5f;margin:6px 0}.tw-wine-page .offer{background:#fffdf8;border:1px solid #d8d0c2;padding:24px;display:flex;justify-content:space-between;gap:24px;margin:12px 0;border-radius:4px}.tw-wine-page .offer-action{display:flex;flex-direction:column;gap:12px;align-items:flex-end;min-width:160px}.tw-wine-page .offer-action strong{font-size:22px}.tw-wine-page .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}@media(max-width:640px){.tw-wine-page{padding:36px 18px 64px}.tw-wine-page .search{padding:20px}.tw-wine-page .fields{grid-template-columns:1fr 1fr}.tw-wine-page .name-field{grid-column:1/-1}.tw-wine-page .offer{padding:20px;flex-direction:column;gap:12px}.tw-wine-page .offer-action{flex-direction:row;align-items:center;justify-content:space-between}.tw-wine-page .result-head{display:block}.tw-wine-page .search button{width:100%}}
  </style></head><body class="townwine-surface">{% render 'townwine-header', current: 'wine-search' %}<main class="tw-wine-page" id="MainContent"><p class="eyebrow">FIND YOUR NEXT BOTTLE</p><h1>국가별 와인 찾기</h1><p class="intro">상품명과 빈티지로 해외 판매처를 찾아보세요. 판매 가격과 용량을 비교하고 판매처에서 구매 조건을 확인할 수 있습니다.</p><form class="search" method="get" action="/apps/townwine-follow/wine-search"><div class="fields"><div class="name-field"><label for="wine-name">상품명</label><input id="wine-name" name="q" value="${e(query?.name || "")}" placeholder="예: Chateau Margaux" minlength="2" maxlength="160" required aria-describedby="search-hint"></div><div><label for="vintage">빈티지</label><input id="vintage" name="vintage" value="${e(query?.vintage === "2" ? "" : query?.vintage || "")}" placeholder="전체 / 2018 / NV" maxlength="4"></div><div><label for="location">판매 국가</label><select id="location" name="location">${[
    true,
    false,
  ]
    .map(
      (forwarding) =>
        `<optgroup label="${forwarding ? "훗타운 센터 운영 국가" : "기타 판매 국가"}">${LOCATIONS.filter(
          (location) => Boolean(FORWARDING_CENTERS[location]) === forwarding,
        )
          .map(
            (location) =>
              `<option value="${e(location)}" ${location === (query?.location || "USA") ? "selected" : ""}>${e(COUNTRY_LABELS[location])}</option>`,
          )
          .join("")}</optgroup>`,
    )
    .join(
      "",
    )}</select></div></div><p id="search-hint" class="hint">라벨의 영문 상품명을 권장합니다. 빈티지를 비워두면 모든 연도를 검색합니다. 훗타운 센터 운영 국가를 구분했으며, 주류 접수와 판매처의 센터 배송 가능 여부는 별도 확인이 필요합니다.</p><button class="button" type="submit" ${available ? "" : "disabled"}>해외 판매처 검색</button></form>
  ${!available ? '<aside class="notice"><p>해외 판매처 검색을 준비 중입니다. 데이터 연결이 완료되면 검색할 수 있습니다.</p></aside>' : ""}
  ${error ? `<div class="notice" role="alert">${e(error)}</div>` : ""}
  ${query && result?.source !== "merchants" ? `<p><a class="button" href="${e(result?.sourceUrl || wineSearchUrl(query))}" target="_blank" rel="noopener noreferrer">Wine-Searcher에서 직접 검색 ↗</a></p>` : ""}
  ${result ? `<section class="results" aria-label="검색 결과"><div class="result-head"><h2>${e(result.matchedName || query?.name || "")} 검색 결과</h2><span class="detail">${result.offers.length}개 판매 정보 · 통화별 가격 낮은 순</span></div>${result.source === "merchants" ? `<p class="detail">등록 판매처 ${result.coverage?.registered || 0}곳 중 ${result.coverage?.succeeded || 0}곳 조회 완료. 판매처가 직접 표시한 가격과 재고이며, 전체 해외 판매처를 포함하지 않습니다.${result.coverage?.incomplete ? ` ${result.coverage.incomplete}곳은 일부 정보를 확인하지 못했습니다.` : ""}</p>` : result.partial ? `<p class="detail">공개 검색 페이지에 표시된 일반 판매 정보입니다. 경매·입고 예정·가격 문의 상품은 제외하며 전체 판매처 목록과 다를 수 있습니다.</p>` : ""}${result.state === "ambiguous" ? '<div class="notice">여러 상품이 일치합니다. 생산자명·와인명·빈티지를 더 구체적으로 입력해 주세요.</div>' : result.state === "empty" ? `<div class="notice">${result.source === "merchants" && !result.coverage?.searched ? "이 국가의 직접 검색 판매처는 아직 연결되지 않았습니다." : result.source === "merchants" && !result.coverage?.succeeded ? "판매처 응답을 확인하지 못했습니다. 잠시 후 다시 검색해 주세요." : "조회한 판매처에서 조건에 맞는 재고 상품을 확인하지 못했습니다. 상품명 철자를 확인하거나 빈티지를 바꿔보세요."}</div>` : result.offers.map(offerCard).join("")}<p class="stamp">조회 시각: ${e(new Date(result.fetchedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }))} (한국 시간)</p></section>` : ""}
  <details class="results"><summary>확인한 판매처 ${MERCHANT_DIRECTORY.filter((m) => !query || m.country === query.location).length}곳 보기</summary><p class="detail">Wine-Searcher 공개 결과에서 확인한 목록입니다. 직접 검색 연동 여부를 구분합니다.</p>${MERCHANT_DIRECTORY.filter(
    (m) => !query || m.country === query.location,
  )
    .map(
      (m) =>
        `<p class="detail"><a href="${e(m.origin || m.sourceUrl)}" target="_blank" rel="noopener noreferrer">${e(m.name)} ↗</a> · ${e(COUNTRY_LABELS[m.country] || m.country)} · ${m.status === "enabled" ? "직접 검색 연동" : "판매처 확인 · 검색 연동 준비"}</p>`,
    )
    .join("")}</details></main></body></html>`;
}
