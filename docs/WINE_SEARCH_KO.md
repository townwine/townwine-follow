# 해외 와인 상품명 검색 — 공개 페이지 크롤링

## 구현

`/apps/townwine-follow/wine-search`에서 상품명·빈티지·판매 국가를 입력한다. 기본 모드는 Wine-Searcher 공개 검색 페이지 HTML 크롤링이다. API 키 없이 동작을 시도한다. 기존 API 방식은 `WINE_SEARCHER_MODE=api`일 때만 사용한다.

실제 공개 DOM에서 확인한 `.js-offer-card`의 판매처명, 외부 상품 URL, 기본 표시 가격, 통화 선택값, 빈티지, 병/박스 단위, 세금 표기를 읽는다. 평균 가격이나 750ml 환산 가격을 구매 가격으로 사용하지 않는다. 경매·입고 예정·가격 문의 등 별도 판매 유형 배지가 있는 항목은 제외한다. 결과 상품명을 별도로 표시하고 공개 페이지 일부 결과임을 밝힌다. 재고나 한국 배송 가능 여부를 확정하지 않는다. 유료 회원 전용 결과와 추가 페이지는 수집하지 않는다.

## 2026-10-09 실제 확인

사용자가 사람 확인을 완료한 Chrome에서 미국 판매처 목록을 열었다.
원문: https://www.wine-searcher.com/find/margaux+medoc+bordeaux+france/2018/usa

확인한 일반 판매 항목 예시:

- European Wine Resource: 2018, Bottle (750ml), KRW 882,726, 세금 제외. https://europeanwineresource.com/products/2018-chateau-margaux
- Benchmark Wine & Spirits: 2018, Bottle (750ml), KRW 928,205, 세금 제외. https://www.benchmarkwineandspirits.com/products/29969
- Woodland Hills Wine Co.: 2018, Bottle (750ml), KRW 929,466, 세금 제외. 화면에서 상품 링크 확인.

위 금액은 조회 당시 Wine-Searcher 표시값이며 현재 가격이나 최종 결제 금액을 보장하지 않는다. 실제 HTML 구조를 축약한 회귀 테스트 자료는 `tests/fixtures/wine-search-public.html`에 있다. 테스트 자료는 운영 상품 데이터로 사용하지 않는다.

**브라우저 수집은 확인했지만 서버 자동 수집은 차단 응답을 받았다.** 브라우저에서의 사람 확인은 서버 요청의 인증을 해제하지 않는다. 운영 서버에 배포하거나 무인 자동 수집이 작동한다고 검증한 상태가 아니다.

## 실패 및 부하 제어

- 12초 제한, 최대 3MB HTML, 최대 3회 같은 출처 `/find/` 리다이렉트만 허용.
- 401/403/429 또는 사람 확인 페이지 감지 시 자동 재시도하지 않는다. 15분 동안 추가 크롤링을 중단한다.
- 성공한 동일 검색은 15분간 메모리에 보관(최대 100건). 차단 중에도 유효한 캐시를 우선 사용한다.
- 프로세스당 분당 20회, 동시 4회 제한과 진행 중 동일 요청 병합.
- 자동 수집 실패를 ‘판매처 없음’으로 숨기지 않는다. 검색 조건을 보존한 Wine-Searcher 원문 링크로 안내한다.
- 브라우저 쿠키/인증 토큰을 서버로 복사하지 않으며 인증 우회 기능이 없다.

## 남은 작업

호스팅 서버에서 허용된 자동 접근 경로를 확보하고 실제 HTML 수집→검색 결과 표시를 확인해야 무인 서비스로 운영할 수 있다. 국가별 URL과 NV 등 추가 조건도 실제 페이지를 더 검증해야 한다. 현재 실페이지 검증은 미국/2018 빈티지 기준이다. 서버 차단 상태에서는 원문 검색 이동만 사용 가능하다.

## 검증

`npm run test:wine-search` — DOM 파싱, 가격 단위, 잘못된 링크·통화·빈티지, 오류·차단, 리다이렉트, 기존 API/화면/프록시 인증 테스트.
`npm run typecheck`
`npm run build`

## 2026-10-09 판매처 직접 검색 전환

기본 검색은 Wine-Searcher에 실시간 요청하지 않고 확인된 판매처의 공개 검색/상품 페이지를 조회한다. `WINE_SEARCHER_MODE=api`는 기존 API 방식, `crawl`은 기존 Wine-Searcher HTML 방식이다. 미설정 시 직접 검색한다.

`app/data/wine-merchants.json`에는 사바르 L'Ouverture 공개 미국 결과 및 전 세계 결과 1페이지에서 확인한 중복 제거 판매처 49곳과 출처를 저장했다. 전체 Wine-Searcher 판매처 목록이 아니다. 전 세계 결과 2페이지는 사람 확인에 막혀 미수집이다. 13곳에 Shopify HTML 검색 어댑터를 연결했고, 나머지는 `needs-review`로 구분한다. 미국/프랑스/영국 실제 상품 응답을 검증했다.

등록 판매처가 없거나 검색 연동이 없는 국가, 판매처 오류, 재고 상품 미발견을 UI에서 구별한다. 각 상점의 상품명 토큰·빈티지·가격 통화·InStock 상태를 검증한다. 가격은 상품/묶음 단위이며 통화별 정렬한다. 용량이 확인되지 않으면 추정하지 않는다. 원문 상품 링크와 조회 시각을 표시한다. 등록된 origin 외부 리디렉션과 상품 링크는 허용하지 않는다.

조회당 상점별 11초 제한 및 상품 최대 4개, 요청당 본문 3MB 제한, 동일 검색 합치기, 15분 캐시(100개), 분당 검색 6회 및 동시 검색 2개 제한을 적용한다. 목록에 표시되는 '직접 검색 연동'은 각 요청의 성공을 보장하지 않으며 결과의 완료/일부 실패 건수를 별도로 표시한다.

훗타운 `https://www.hoottown.com/deliveryAgency`에서 2026-10-09 확인한 해외센터 국가(미국 OR/DE/NJ/CA, 독일, 프랑스, 일본, 중국, 홍콩, 대만, 태국)를 국가 선택에서 구분한다. 센터 존재는 주류 취급이나 판매처의 해당 센터 배송을 보증하지 않으므로 확정 배송 가능 표시를 하지 않는다. 한국센터는 해외 구매 국가에서 제외했다.

검증: `npm run test:wine-search`, `npm run typecheck`, `npm run build`. 개발환경 Node 22. 선택적 실제 판매처 확인은 `LIVE_MERCHANT_CHECK=1 LIVE_COUNTRY=USA node --experimental-strip-types --test tests/wine-merchants.test.mjs` (France/UK 가능).
