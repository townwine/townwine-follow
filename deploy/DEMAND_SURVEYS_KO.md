# 수요조사 → 공구 등록

기존 `/apps/townwine-follow/group-buy-registration` 진입 시 수요조사 탭을 먼저 표시합니다. 공구 등록 탭은 `?step=register`이며, 수요조사에서 넘어갈 때는 `?demandId=<id>`로 본인 조사 정보를 불러옵니다.

## 화면
- 수요조사 목록: `/apps/townwine-follow/demand-surveys`
- 등록: `?view=new` — 로그인한 컬렉터가 실제 상품 URL·와인명·썸네일 파일·마감일을 입력합니다. 예상 가격과 목표 수량은 선택입니다.
- 참여: `?id=<id>` — 고객은 희망 수량을 등록·수정·취소합니다. 로그인 고객 ID는 검증된 Shopify App Proxy 요청만 신뢰합니다.
- 결과·관리: 같은 상세 주소에서 소유자에게 참여자 목록·집계·종료·공구 전환 기능을 표시합니다. 소유자는 `&view=participant`로 참여자 화면을 볼 수 있습니다.

## 저장과 전환
새 Prisma 마이그레이션은 DemandSurvey, DemandEntry 테이블만 추가합니다. JPEG/PNG/WebP 파일은 최대 5MB이며 기존 영구 SQLite DB에 BLOB으로 저장합니다. 서버에서 파일 시그니처를 검사하고 인증된 앱 프록시의 이미지 응답으로 제공합니다. 예시 데이터나 시드 작업은 포함하지 않습니다.

공구 등록은 기존 견적 계산·서명 검증·라벨 편집·운영자 승인 절차를 유지합니다. 조사별로 고정된 등록 키를 사용하여 동일 조사에서 공구 초안을 중복 생성하지 않으며, 생성된 Shopify 상품 ID를 연결합니다. 조사만 종료해도 이후 공구로 전환할 수 있습니다. 참여는 주문·결제가 아니며 자동 구매 신청은 하지 않습니다.

Render 기존 시작 명령 `npm run setup && npm run start`가 마이그레이션을 적용합니다. Shopify 테마 변경이나 추가 API 권한 없이 기존 App Proxy를 이용합니다. 참여자 알림 자동 발송은 이 변경에 포함하지 않습니다.

## 확인
`npm run typecheck`, `npm run build`, `node --experimental-strip-types --test tests/*.test.mjs`.
실제 고객 계정으로 등록/참여/전환을 검증할 때에는 실제 조사만 생성하고, 운영 상품 생성과 기존 운영자 알림이 발생하는 최종 승인 요청은 의도한 데이터로만 실행합니다.
