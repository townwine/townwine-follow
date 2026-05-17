# TownWine Follow Render 배포 가이드

기준: `townwine-follow` 앱을 `Render Web Service`에 올리고 `town-wine.myshopify.com`에 고정 URL로 연결

## 1. 먼저 준비할 것

- GitHub에 `townwine-follow` 코드가 올라가 있어야 합니다.
- Render 계정이 있어야 합니다.
- Shopify Dev Dashboard에서 만든 앱의 아래 값이 있어야 합니다.
  - `SHOPIFY_API_KEY`
  - `SHOPIFY_API_SECRET`

## 2. 왜 Render가 필요한가

- 지금처럼 `localhost.run` 같은 임시 터널은 주소가 자주 바뀝니다.
- Shopify 앱 URL, redirect URL, app proxy URL은 가능한 한 고정 주소를 써야 합니다.
- Render는 고정 `onrender.com` URL을 제공합니다.

## 3. 현재 코드 기준 중요한 점

이 앱은 Prisma + SQLite를 사용합니다.

- 로컬 개발용 예시:
  - `DATABASE_URL=file:./prisma/dev.sqlite`
- Render 운영용 권장값:
  - `DATABASE_URL=file:/var/data/townwine-follow/dev.sqlite`

Render는 기본 파일시스템이 휘발성이므로, SQLite를 유지하려면 **Persistent Disk**를 붙여야 합니다.

## 4. Render 서비스 만들기

Render Dashboard에서:

1. `New +`
2. `Web Service`
3. GitHub 저장소 연결
4. 이 프로젝트가 모노레포면 `Root Directory`를 `townwine-follow`로 지정
5. 런타임은 `Node`

### 권장 입력값

- Name: `townwine-follow`
- Root Directory: `townwine-follow`
- Build Command:

```bash
npm ci && npx prisma generate && npm run build
```

- Start Command:

```bash
npm run setup && npm run start
```

설명:

- `npm run setup`은 `prisma generate && prisma migrate deploy`
- SQLite 파일은 런타임에 Persistent Disk 경로를 사용
- Render 디스크는 build 단계에서는 접근할 수 없으므로, migration은 start 시점에 적용

## 5. Persistent Disk 붙이기

Render 서비스 생성 화면의 `Advanced` 또는 생성 후 `Disks`에서:

- Add Disk
- Mount Path:

```text
/var/data/townwine-follow
```

- Size:
  - 최소 크기로 시작해도 됩니다. 예: `1 GB`

## 6. Environment Variables 넣기

Render `Environment` 화면에 아래를 넣습니다.

### 필수

```env
DATABASE_URL=file:/var/data/townwine-follow/dev.sqlite
SHOPIFY_APP_URL=https://<your-service>.onrender.com
SHOPIFY_API_KEY=<your shopify app client id>
SHOPIFY_API_SECRET=<your shopify app secret>
SCOPES=read_content,read_customers,read_metaobject_definitions,read_metaobjects,read_orders,read_products,write_app_proxy,write_content,write_metaobject_definitions,write_metaobjects,write_products
```

### 선택

```env
RESEND_API_KEY=<your resend api key>
EMAIL_FROM=TownWine <no-reply@your-domain.com>
EMAIL_REPLY_TO=
EMAIL_TO_OVERRIDE=
```

### 참고

- Render는 `NODE_ENV=production`을 기본 제공
- Render는 `PORT`도 자동 제공하므로 직접 지정하지 않아도 됩니다

## 7. Render 배포 완료 후 확인

배포가 끝나면 Render가 아래 형태의 고정 URL을 줍니다.

```text
https://townwine-follow.onrender.com
```

또는

```text
https://<your-service-name>.onrender.com
```

브라우저에서 열었을 때 앱 홈이 보여야 합니다.

## 8. Shopify 앱 설정도 Render URL로 바꾸기

`town-wine`용 Shopify 앱에서 아래 3개 URL을 모두 Render 주소로 바꿉니다.

- App URL
- Redirect URL
- App Proxy URL

예:

- App URL:

```text
https://townwine-follow.onrender.com
```

- Redirect URL:

```text
https://townwine-follow.onrender.com/auth/callback
```

- App Proxy URL:

```text
https://townwine-follow.onrender.com/apps/townwine-follow
```

앱 버전 새로 만들기 또는 설정 수정 후 `Release`

## 9. 배포 후 테스트

다음 주소가 JSON을 반환해야 합니다.

```text
https://town-wine.myshopify.com/apps/townwine-follow/status?handles=yunji
```

정상 예시:

```json
{"following":[],"loggedIn":false}
```

그다음:

1. `Collectors`에서 고객 검색
2. 컬렉터 등록
3. 스토어프론트에서 팔로우 클릭
4. 상품에 `custom.influencer_handle=yunji` 또는 `collector:yunji` 태그 부여
5. 메일 발송 흐름 테스트

## 10. 가장 쉬운 운영 방식

실무적으로는 아래 순서가 가장 안정적입니다.

1. Render 고정 URL 먼저 확보
2. Shopify 앱 URL / Redirect / Proxy를 Render 주소로 교체
3. 앱 재설치 또는 새 버전 릴리스
4. Collectors / Follow / Mail 순서로 테스트
