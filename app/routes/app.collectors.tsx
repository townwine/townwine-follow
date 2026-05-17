import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  Form,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
  useSearchParams,
} from "react-router";
import { authenticate } from "../shopify.server";
import {
  ensureCollectorMetaobjectDefinition,
  getCustomerById,
  listCollections,
  listCollectorProfiles,
  listCustomers,
  normalizeCollectorFormInput,
  upsertCollectorProfile,
} from "../services/collector-profiles.server";

type ActionData =
  | {
      ok: false;
      error: string;
    }
  | undefined;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const customerQuery = url.searchParams.get("q") || "";
  const editingHandle = url.searchParams.get("edit") || "";

  await ensureCollectorMetaobjectDefinition(admin);

  const [profiles, customers, collections] = await Promise.all([
    listCollectorProfiles(admin),
    listCustomers(admin, customerQuery),
    listCollections(admin),
  ]);

  const editingProfile =
    profiles.find((profile) => profile.handle === editingHandle) || null;

  let customerOptions = customers;
  if (
    editingProfile?.fields.customerId &&
    !customerOptions.some(
      (customer) => customer.id === editingProfile.fields.customerId,
    )
  ) {
    const editingCustomer = await getCustomerById(
      admin,
      editingProfile.fields.customerId,
    );

    if (editingCustomer) {
      customerOptions = [editingCustomer, ...customerOptions];
    }
  }

  return {
    customerOptions,
    customerQuery,
    collections,
    editingHandle,
    editingProfile,
    profiles,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "save");

  if (intent !== "save") {
    return {
      ok: false,
      error: "지원하지 않는 요청입니다.",
    } satisfies ActionData;
  }

  try {
    const input = normalizeCollectorFormInput({
      customer_id: formData.get("customer_id"),
      handle: formData.get("handle"),
      display_name: formData.get("display_name"),
      public_handle: formData.get("public_handle"),
      role_label: formData.get("role_label"),
      bio: formData.get("bio"),
      introduction: formData.get("introduction"),
      quote: formData.get("quote"),
      featured_collection_handle: formData.get("featured_collection_handle"),
      specialties: formData.get("specialties"),
      preferred_regions: formData.get("preferred_regions"),
      preferred_styles: formData.get("preferred_styles"),
      preferred_grapes: formData.get("preferred_grapes"),
      price_band: formData.get("price_band"),
      taste_body: formData.get("taste_body"),
      taste_tannin: formData.get("taste_tannin"),
      taste_acidity: formData.get("taste_acidity"),
      taste_sweetness: formData.get("taste_sweetness"),
      taste_alcohol: formData.get("taste_alcohol"),
      sort_order: formData.get("sort_order"),
      status: formData.get("status"),
    });

    if (!input.customerId) {
      return {
        ok: false,
        error: "컬렉터로 연결할 고객을 먼저 선택해 주세요.",
      } satisfies ActionData;
    }

    const result = await upsertCollectorProfile(admin, input);

    return redirect(
      `/app/collectors?edit=${encodeURIComponent(
        result.handle,
      )}&saved=${encodeURIComponent(result.handle)}`,
    );
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "컬렉터 프로필 저장 중 오류가 발생했습니다.",
    } satisfies ActionData;
  }
};

export default function CollectorsRoute() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as ActionData;
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const savedHandle = searchParams.get("saved") || "";
  const isSubmitting = navigation.state === "submitting";
  const editingProfile = data.editingProfile;
  const collectionExamples = data.collections.slice(0, 20);

  const formDefaults = editingProfile?.fields || {
    customerId: "",
    customerEmail: "",
    customerName: "",
    displayName: "",
    publicHandle: "",
    roleLabel: "",
    bio: "",
    introduction: "",
    quote: "",
    featuredCollectionHandle: "",
    specialties: "",
    preferredRegions: "",
    preferredStyles: "",
    preferredGrapes: "",
    priceBand: "",
    tasteBody: 5,
    tasteTannin: 5,
    tasteAcidity: 5,
    tasteSweetness: 2,
    tasteAlcohol: 5,
    sortOrder: 999,
  };

  return (
    <s-page heading="Collectors">
      <style>{`
        .collector-admin-grid {
          display: grid;
          gap: 24px;
          grid-template-columns: 1.35fr 1fr;
        }
        @media (max-width: 1100px) {
          .collector-admin-grid {
            grid-template-columns: 1fr;
          }
        }
        .collector-panel {
          border: 1px solid #d9d7d2;
          border-radius: 18px;
          background: #fff;
          padding: 20px;
        }
        .collector-panel h2 {
          margin: 0 0 8px;
          font-size: 20px;
          line-height: 1.2;
        }
        .collector-muted {
          margin: 0;
          color: #5f5b53;
          font-size: 14px;
          line-height: 1.6;
        }
        .collector-toolbar,
        .collector-inline,
        .collector-status {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          align-items: center;
        }
        .collector-toolbar {
          margin-top: 18px;
          justify-content: space-between;
        }
        .collector-search {
          display: flex;
          gap: 10px;
          width: 100%;
        }
        .collector-search input,
        .collector-field input,
        .collector-field textarea,
        .collector-field select {
          width: 100%;
          border: 1px solid #d9d7d2;
          border-radius: 12px;
          padding: 11px 13px;
          font: inherit;
          box-sizing: border-box;
          background: #fff;
        }
        .collector-search button,
        .collector-actions button,
        .collector-actions a {
          border: 1px solid #2f2c28;
          border-radius: 12px;
          padding: 11px 16px;
          font: inherit;
          text-decoration: none;
          background: #2f2c28;
          color: #f6f1e7;
          cursor: pointer;
        }
        .collector-search a,
        .collector-reset {
          border: 1px solid #d9d7d2;
          border-radius: 12px;
          padding: 11px 16px;
          text-decoration: none;
          color: #2f2c28;
          background: #fff;
        }
        .collector-list {
          display: grid;
          gap: 12px;
          margin-top: 20px;
        }
        .collector-card {
          border: 1px solid #e3e0d8;
          border-radius: 16px;
          padding: 16px;
          display: grid;
          gap: 10px;
          background: #faf8f3;
        }
        .collector-card-top {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
        }
        .collector-card h3 {
          margin: 0;
          font-size: 18px;
          line-height: 1.2;
        }
        .collector-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border-radius: 999px;
          padding: 6px 10px;
          font-size: 12px;
          border: 1px solid #d9d7d2;
          background: #fff;
          color: #5f5b53;
        }
        .collector-chip.is-active {
          border-color: #2f2c28;
          color: #2f2c28;
          font-weight: 600;
        }
        .collector-meta {
          display: flex;
          gap: 10px 14px;
          flex-wrap: wrap;
          color: #5f5b53;
          font-size: 13px;
        }
        .collector-card-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .collector-card-actions a {
          color: #2f2c28;
          text-decoration: none;
        }
        .collector-form {
          display: grid;
          gap: 16px;
          margin-top: 20px;
        }
        .collector-form-grid {
          display: grid;
          gap: 14px;
          grid-template-columns: 1fr 1fr;
        }
        .collector-form-grid.is-three {
          grid-template-columns: repeat(3, 1fr);
        }
        @media (max-width: 800px) {
          .collector-form-grid,
          .collector-form-grid.is-three {
            grid-template-columns: 1fr;
          }
        }
        .collector-field {
          display: grid;
          gap: 8px;
        }
        .collector-field label {
          font-size: 13px;
          color: #2f2c28;
          font-weight: 600;
        }
        .collector-field small {
          color: #5f5b53;
          font-size: 12px;
          line-height: 1.5;
        }
        .collector-status label {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: #2f2c28;
        }
        .collector-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 8px;
        }
        .collector-actions a {
          background: #fff;
          color: #2f2c28;
          border-color: #d9d7d2;
        }
        .collector-note,
        .collector-error,
        .collector-success {
          margin-top: 14px;
          padding: 12px 14px;
          border-radius: 14px;
          font-size: 13px;
          line-height: 1.6;
        }
        .collector-note {
          background: #faf8f3;
          border: 1px solid #e3e0d8;
        }
        .collector-error {
          background: #fff5f5;
          border: 1px solid #f3c9c9;
          color: #8a3131;
        }
        .collector-success {
          background: #f5faf3;
          border: 1px solid #cae2bf;
          color: #375b29;
        }
        .collector-empty {
          padding: 32px 0;
          color: #5f5b53;
          font-size: 14px;
          line-height: 1.7;
        }
      `}</style>

      <s-section heading="운영 구조">
        <s-paragraph>
          실제 Shopify 고객을 컬렉터 프로필로 연결하면 스토어의 컬렉터
          목록 페이지와 상세 페이지가 이 데이터를 바로 읽습니다.
        </s-paragraph>
        <s-paragraph>
          프로필은 Shopify 메타오브젝트 `collector_profile`로 저장되며,
          공개 상태를 `ACTIVE`로 두면 `/pages/collector/[handle]` URL로
          바로 노출됩니다.
        </s-paragraph>
      </s-section>

      <div className="collector-admin-grid">
        <section className="collector-panel">
          <h2>등록된 컬렉터</h2>
          <p className="collector-muted">
            현재 스토어에 등록된 컬렉터 프로필 {data.profiles.length}개
          </p>

          <div className="collector-toolbar">
            <Form className="collector-search" method="get">
              <input
                type="search"
                name="q"
                defaultValue={data.customerQuery}
                placeholder="고객 이름 또는 이메일로 검색"
              />
              <button type="submit">고객 검색</button>
              {data.customerQuery ? (
                <a href="/app/collectors">초기화</a>
              ) : null}
            </Form>
          </div>

          {savedHandle ? (
            <div className="collector-success">
              `{savedHandle}` 프로필 저장이 완료되었습니다. 이제 스토어
              페이지에서 바로 확인할 수 있습니다.
            </div>
          ) : null}

          <div className="collector-list">
            {data.profiles.length ? (
              data.profiles.map((profile) => (
                <article className="collector-card" key={profile.id}>
                  <div className="collector-card-top">
                    <div>
                      <h3>{profile.fields.displayName}</h3>
                      <div className="collector-meta">
                        <span>@{profile.handle}</span>
                        {profile.fields.publicHandle ? (
                          <span>{profile.fields.publicHandle}</span>
                        ) : null}
                        {profile.fields.roleLabel ? (
                          <span>{profile.fields.roleLabel}</span>
                        ) : null}
                      </div>
                    </div>
                    <span
                      className={`collector-chip${
                        profile.status === "ACTIVE" ? " is-active" : ""
                      }`}
                    >
                      {profile.status === "ACTIVE" ? "공개 중" : "초안"}
                    </span>
                  </div>
                  <div className="collector-meta">
                    <span>연결 고객: {profile.fields.customerName || "-"}</span>
                    <span>이메일: {profile.fields.customerEmail || "-"}</span>
                    <span>
                      대표 컬렉션:{" "}
                      {profile.fields.featuredCollectionHandle || "-"}
                    </span>
                  </div>
                  <div className="collector-card-actions">
                    <a href={`/app/collectors?edit=${profile.handle}`}>편집</a>
                    <a href={profile.storefrontPath} target="_blank" rel="noreferrer">
                      스토어 보기
                    </a>
                  </div>
                </article>
              ))
            ) : (
              <div className="collector-empty">
                아직 등록된 컬렉터 프로필이 없습니다. 오른쪽 폼에서 고객을
                선택해 첫 프로필을 만들어 주세요.
              </div>
            )}
          </div>
        </section>

        <section className="collector-panel">
          <h2>{editingProfile ? "컬렉터 수정" : "새 컬렉터 등록"}</h2>
          <p className="collector-muted">
            고객 계정과 연결하고 스토어 공개용 프로필 정보를 입력합니다.
          </p>

          {actionData?.ok === false ? (
            <div className="collector-error">{actionData.error}</div>
          ) : null}

          <Form method="post" className="collector-form">
            <input type="hidden" name="intent" value="save" />

            <div className="collector-field">
              <label htmlFor="customer_id">연결 고객</label>
              <select
                id="customer_id"
                name="customer_id"
                defaultValue={formDefaults.customerId}
                required
              >
                <option value="">고객을 선택해 주세요</option>
                {data.customerOptions.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.displayName || "(이름 없음)"} · {customer.email}
                  </option>
                ))}
              </select>
              <small>
                실제 가입 고객을 선택하면 이름과 이메일이 프로필에 함께
                저장됩니다.
              </small>
            </div>

            <div className="collector-form-grid">
              <div className="collector-field">
                <label htmlFor="handle">프로필 handle</label>
                <input
                  id="handle"
                  name="handle"
                  type="text"
                  required
                  defaultValue={editingProfile?.handle || ""}
                  placeholder="yunji"
                />
                <small>
                  팔로우 기능과 상세 URL에 함께 쓰이는 기준 키입니다.
                </small>
              </div>
              <div className="collector-field">
                <label htmlFor="public_handle">공개 핸들</label>
                <input
                  id="public_handle"
                  name="public_handle"
                  type="text"
                  defaultValue={formDefaults.publicHandle}
                  placeholder="@yunji.wine"
                />
              </div>
            </div>

            <div className="collector-form-grid">
              <div className="collector-field">
                <label htmlFor="display_name">노출 이름</label>
                <input
                  id="display_name"
                  name="display_name"
                  type="text"
                  defaultValue={formDefaults.displayName}
                  placeholder="소믈리에 윤지"
                />
              </div>
              <div className="collector-field">
                <label htmlFor="role_label">역할 라벨</label>
                <input
                  id="role_label"
                  name="role_label"
                  type="text"
                  defaultValue={formDefaults.roleLabel}
                  placeholder="와인 큐레이터 · 소믈리에"
                />
              </div>
            </div>

            <div className="collector-field">
              <label htmlFor="featured_collection_handle">대표 컬렉션 handle</label>
              <input
                id="featured_collection_handle"
                name="featured_collection_handle"
                type="text"
                list="collector-collection-handles"
                defaultValue={formDefaults.featuredCollectionHandle}
                placeholder="yunji-picks"
              />
              <datalist id="collector-collection-handles">
                {collectionExamples.map((collection) => (
                  <option
                    key={collection.id}
                    value={collection.handle}
                  >{`${collection.title} (${collection.handle})`}</option>
                ))}
              </datalist>
              <small>
                이 컬렉션의 상품이 컬렉터 상세 페이지 진행 중/예정/라이브러리
                영역에 노출됩니다.
              </small>
            </div>

            <div className="collector-field">
              <label htmlFor="bio">한 줄 소개</label>
              <textarea
                id="bio"
                name="bio"
                rows={4}
                defaultValue={formDefaults.bio}
              />
            </div>

            <div className="collector-field">
              <label htmlFor="introduction">큐레이션 소개</label>
              <textarea
                id="introduction"
                name="introduction"
                rows={5}
                defaultValue={formDefaults.introduction}
              />
            </div>

            <div className="collector-field">
              <label htmlFor="quote">대표 코멘트</label>
              <textarea
                id="quote"
                name="quote"
                rows={3}
                defaultValue={formDefaults.quote}
              />
            </div>

            <div className="collector-form-grid">
              <div className="collector-field">
                <label htmlFor="specialties">주요 태그</label>
                <input
                  id="specialties"
                  name="specialties"
                  type="text"
                  defaultValue={formDefaults.specialties}
                  placeholder="한식 페어링, 데일리 와인, 미디엄 레드"
                />
              </div>
              <div className="collector-field">
                <label htmlFor="preferred_regions">선호 산지</label>
                <input
                  id="preferred_regions"
                  name="preferred_regions"
                  type="text"
                  defaultValue={formDefaults.preferredRegions}
                  placeholder="루아르, 피에몬테, 보르도 우안"
                />
              </div>
            </div>

            <div className="collector-form-grid">
              <div className="collector-field">
                <label htmlFor="preferred_styles">선호 스타일</label>
                <input
                  id="preferred_styles"
                  name="preferred_styles"
                  type="text"
                  defaultValue={formDefaults.preferredStyles}
                  placeholder="미네랄 화이트, 미디엄 레드"
                />
              </div>
              <div className="collector-field">
                <label htmlFor="preferred_grapes">선호 품종</label>
                <input
                  id="preferred_grapes"
                  name="preferred_grapes"
                  type="text"
                  defaultValue={formDefaults.preferredGrapes}
                  placeholder="메를로, 슈냉 블랑"
                />
              </div>
            </div>

            <div className="collector-form-grid">
              <div className="collector-field">
                <label htmlFor="price_band">선호 가격대</label>
                <input
                  id="price_band"
                  name="price_band"
                  type="text"
                  defaultValue={formDefaults.priceBand}
                  placeholder="₩30,000 - ₩60,000"
                />
              </div>
              <div className="collector-field">
                <label htmlFor="sort_order">정렬 순서</label>
                <input
                  id="sort_order"
                  name="sort_order"
                  type="number"
                  min="0"
                  defaultValue={formDefaults.sortOrder}
                />
              </div>
            </div>

            <div className="collector-form-grid is-three">
              <div className="collector-field">
                <label htmlFor="taste_body">바디</label>
                <input
                  id="taste_body"
                  name="taste_body"
                  type="number"
                  min="0"
                  max="10"
                  defaultValue={formDefaults.tasteBody}
                />
              </div>
              <div className="collector-field">
                <label htmlFor="taste_tannin">탄닌</label>
                <input
                  id="taste_tannin"
                  name="taste_tannin"
                  type="number"
                  min="0"
                  max="10"
                  defaultValue={formDefaults.tasteTannin}
                />
              </div>
              <div className="collector-field">
                <label htmlFor="taste_acidity">산도</label>
                <input
                  id="taste_acidity"
                  name="taste_acidity"
                  type="number"
                  min="0"
                  max="10"
                  defaultValue={formDefaults.tasteAcidity}
                />
              </div>
            </div>

            <div className="collector-form-grid is-three">
              <div className="collector-field">
                <label htmlFor="taste_sweetness">당도</label>
                <input
                  id="taste_sweetness"
                  name="taste_sweetness"
                  type="number"
                  min="0"
                  max="10"
                  defaultValue={formDefaults.tasteSweetness}
                />
              </div>
              <div className="collector-field">
                <label htmlFor="taste_alcohol">알코올</label>
                <input
                  id="taste_alcohol"
                  name="taste_alcohol"
                  type="number"
                  min="0"
                  max="10"
                  defaultValue={formDefaults.tasteAlcohol}
                />
              </div>
              <div className="collector-field">
                <span>공개 상태</span>
                <div className="collector-status">
                  <label>
                    <input
                      type="radio"
                      name="status"
                      value="ACTIVE"
                      defaultChecked={editingProfile?.status === "ACTIVE"}
                    />
                    바로 공개
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="status"
                      value="DRAFT"
                      defaultChecked={!editingProfile || editingProfile.status !== "ACTIVE"}
                    />
                    초안 저장
                  </label>
                </div>
              </div>
            </div>

            <div className="collector-note">
              공개 상태를 `ACTIVE`로 저장하면 컬렉터 상세가 즉시
              `/pages/collector/[handle]` URL로 열리고, 컬렉터 목록 페이지에도
              자동으로 노출됩니다.
            </div>

            <div className="collector-actions">
              <button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "저장 중..." : "컬렉터 저장"}
              </button>
              <a className="collector-reset" href="/app/collectors">
                새로 입력
              </a>
              {editingProfile ? (
                <a href={editingProfile.storefrontPath} target="_blank" rel="noreferrer">
                  스토어 페이지 보기
                </a>
              ) : null}
            </div>
          </Form>
        </section>
      </div>
    </s-page>
  );
}
