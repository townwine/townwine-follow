# TownWine Follow 설정 가이드

기준 날짜: 2026-05-16
대상 스토어: `town-wine.myshopify.com`

## 현재 확인된 문제

- `https://town-wine.myshopify.com/apps/townwine-follow/status` 요청이 `HTTP 404`를 반환합니다.
- 이 상태는 테마 버튼 문제가 아니라, **`town-wine` 스토어에 `townwine-follow` 앱 프록시가 아직 연결되지 않았음**을 의미합니다.

## 이번 수정으로 반영된 내용

- 팔로우 알림과 오픈 알림이 서로 같은 발송 로그를 공유하지 않도록 분리했습니다.
- 상품이 `custom.influencer_handle` 메타필드가 없어도, 아래 태그로 컬렉터 핸들을 인식하도록 확장했습니다.

지원 태그 예시:

- `collector:yunji`
- `influencer:yunji`
- `member:yunji`
- `host:yunji`
- `collector=yunji`
- `collector/yunji`

권장 방식:

- 가장 안정적인 연결값은 상품 메타필드 `custom.influencer_handle`
- 화면 표시용 값은 `custom.host_name`, `custom.host_handle`

## 배포 순서

1. 안정적인 외부 호스팅 URL을 준비합니다.

- 예: Render, Fly.io, Cloud Run 등
- `SHOPIFY_APP_URL`에 실제 서비스 URL이 들어가야 합니다.
- 로컬 `shopify app dev` 터널 URL만으로는 운영 스토어에 안정적으로 붙일 수 없습니다.

2. 환경 변수를 설정합니다.

필수:

- `NODE_ENV=production`
- `PORT=3000`
- `SHOPIFY_APP_URL=https://<your-app-host>`
- `SHOPIFY_API_KEY=<shopify app client id>`
- `SHOPIFY_API_SECRET=<shopify app secret>`
- `SCOPES=read_content,read_customers,read_metaobject_definitions,read_metaobjects,read_orders,read_products,write_app_proxy,write_content,write_metaobject_definitions,write_metaobjects,write_products`

메일 발송용:

- `RESEND_API_KEY=<resend key>`
- `EMAIL_FROM=TownWine <no-reply@your-domain.com>`
- `EMAIL_REPLY_TO=<optional>`
- `EMAIL_TO_OVERRIDE=<optional test email>`

3. 앱 서버를 배포합니다.

앱 폴더:

- `/Users/nelee/Documents/New project/townwine-follow`

실행 순서:

```bash
cd "/Users/nelee/Documents/New project/townwine-follow"
npm ci
npm run setup
npm run build
```

`npm run setup`은 Prisma migration 적용과 client 생성을 포함합니다.

4. Shopify 앱 설정을 실제 운영 URL 기준으로 배포합니다.

예시 설정 파일:

- `/Users/nelee/Documents/New project/townwine-follow/deploy/shopify.app.production.example.toml`

실제 운영용으로 복사해 값 교체 후:

```bash
cd "/Users/nelee/Documents/New project/townwine-follow"
shopify app deploy --config <your-production-config> --allow-updates
```

중요:

- `shopify app deploy`는 Shopify 앱 설정과 웹훅/프록시를 배포합니다.
- 앱 서버 자체는 별도 호스팅에 이미 올라가 있어야 합니다.

5. `town-wine.myshopify.com`에 앱을 설치합니다.

- Shopify Admin에서 해당 앱을 설치
- 설치 후 앱 Admin을 한 번 열어 메타오브젝트/메타필드 정의를 생성

6. 앱 프록시 연결을 확인합니다.

브라우저에서 아래 URL이 `404`가 아니라 JSON을 반환해야 합니다.

```text
https://town-wine.myshopify.com/apps/townwine-follow/status?handles=yunji
```

정상 예시:

```json
{"following":[],"loggedIn":false}
```

## 운영 테스트 순서

1. `town-wine` 스토어 고객 계정으로 로그인
2. 컬렉터 카드에서 팔로우 버튼 클릭
3. 앱 DB에 `FollowSubscription` 생성 확인
4. Shopify Admin에서 상품 생성 또는 수정
5. 아래 둘 중 하나로 컬렉터 연결

- 메타필드 `custom.influencer_handle = yunji`
- 또는 태그 `collector:yunji`

6. 상품이 `ACTIVE` 상태인지 확인
7. 팔로우한 고객에게 메일 발송 확인

## 메일 발송 동작

- 새 공동구매 등록 알림: `FOLLOW_NEW_DEAL`
- 예정 공구 오픈 알림: `UPCOMING_OPEN_ALERT`

이제 두 알림은 별도 로그를 사용하므로 같은 상품에 대해 서로를 막지 않습니다.
