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
  DEFAULT_FOLLOW_EMAIL_TEMPLATE_FORM_VALUES,
  FOLLOW_EMAIL_TEMPLATE_TOKEN_INFOS,
  type FollowEmailTemplateFormValues,
  toFollowEmailTemplateFormValues,
  fromFollowEmailTemplateFormValues,
} from "../services/follow-email-template.shared";
import {
  loadFollowEmailTemplateConfig,
  readFollowEmailTemplateFormValues,
  resetFollowEmailTemplateSettings,
  saveFollowEmailTemplateSettings,
  validateFollowEmailTemplateFormValues,
} from "../services/follow-email-template.server";

type ActionData =
  | {
      ok: false;
      error: string;
      values: FollowEmailTemplateFormValues;
    }
  | undefined;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const config = await loadFollowEmailTemplateConfig(admin);

  return {
    shopName: config.shopName,
    formValues: toFollowEmailTemplateFormValues(config.settings),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "save");

  if (intent === "reset") {
    await saveFollowEmailTemplateSettings(admin, resetFollowEmailTemplateSettings());
    return redirect("/app/email-templates?reset=1");
  }

  const values = readFollowEmailTemplateFormValues(formData);
  const validationError = validateFollowEmailTemplateFormValues(values);

  if (validationError) {
    return {
      ok: false,
      error: validationError,
      values,
    } satisfies ActionData;
  }

  try {
    await saveFollowEmailTemplateSettings(
      admin,
      fromFollowEmailTemplateFormValues(values),
    );
    return redirect("/app/email-templates?saved=1");
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "이메일 템플릿 저장 중 오류가 발생했습니다.",
      values,
    } satisfies ActionData;
  }
};

function Field(props: {
  label: string;
  name: keyof FollowEmailTemplateFormValues;
  values: FollowEmailTemplateFormValues;
  rows?: number;
  helper?: string;
}) {
  const value = props.values[props.name];

  return (
    <label className="email-template-field">
      <span>{props.label}</span>
      {props.rows ? (
        <textarea
          name={props.name}
          defaultValue={value}
          rows={props.rows}
        />
      ) : (
        <input
          name={props.name}
          defaultValue={value}
          type="text"
        />
      )}
      {props.helper ? <small>{props.helper}</small> : null}
    </label>
  );
}

export default function EmailTemplatesRoute() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as ActionData;
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const values = actionData?.values || data.formValues || DEFAULT_FOLLOW_EMAIL_TEMPLATE_FORM_VALUES;
  const isSubmitting = navigation.state === "submitting";
  const saved = searchParams.get("saved") === "1";
  const reset = searchParams.get("reset") === "1";

  return (
    <s-page heading="Email templates">
      <style>{`
        .email-template-layout {
          display: grid;
          gap: 24px;
          grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.8fr);
        }
        @media (max-width: 1100px) {
          .email-template-layout {
            grid-template-columns: 1fr;
          }
        }
        .email-template-panel {
          border: 1px solid #d9d7d2;
          border-radius: 18px;
          background: #fff;
          padding: 22px;
        }
        .email-template-panel h2,
        .email-template-panel h3 {
          margin: 0 0 10px;
          line-height: 1.25;
        }
        .email-template-panel h2 {
          font-size: 22px;
        }
        .email-template-panel h3 {
          font-size: 18px;
        }
        .email-template-muted {
          margin: 0;
          color: #5f5b53;
          line-height: 1.7;
          font-size: 14px;
        }
        .email-template-stack {
          display: grid;
          gap: 18px;
        }
        .email-template-group {
          display: grid;
          gap: 14px;
          padding-top: 18px;
          border-top: 1px solid #ebe8df;
        }
        .email-template-group:first-of-type {
          border-top: 0;
          padding-top: 0;
        }
        .email-template-grid {
          display: grid;
          gap: 14px;
          grid-template-columns: 1fr 1fr;
        }
        @media (max-width: 780px) {
          .email-template-grid {
            grid-template-columns: 1fr;
          }
        }
        .email-template-field {
          display: grid;
          gap: 8px;
          font-size: 14px;
          color: #2f2c28;
        }
        .email-template-field span {
          font-weight: 600;
        }
        .email-template-field input,
        .email-template-field textarea {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid #d9d7d2;
          border-radius: 12px;
          padding: 12px 14px;
          background: #fff;
          font: inherit;
          resize: vertical;
        }
        .email-template-field small {
          color: #726c61;
          line-height: 1.6;
        }
        .email-template-actions {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          margin-top: 8px;
        }
        .email-template-actions button {
          border-radius: 12px;
          padding: 12px 18px;
          font: inherit;
          cursor: pointer;
        }
        .email-template-actions .is-primary {
          border: 1px solid #2f2c28;
          background: #2f2c28;
          color: #f6f1e7;
        }
        .email-template-actions .is-secondary {
          border: 1px solid #d9d7d2;
          background: #fff;
          color: #2f2c28;
        }
        .email-template-banner {
          margin-bottom: 18px;
          padding: 14px 16px;
          border-radius: 14px;
          font-size: 14px;
          line-height: 1.6;
        }
        .email-template-banner.is-success {
          border: 1px solid #bcdcc2;
          background: #edf9ef;
          color: #20472a;
        }
        .email-template-banner.is-error {
          border: 1px solid #ecc7c7;
          background: #fff3f1;
          color: #7a2821;
        }
        .email-template-token-list {
          display: grid;
          gap: 10px;
          margin-top: 16px;
        }
        .email-template-token {
          border: 1px solid #e8e3d8;
          border-radius: 14px;
          background: #faf8f3;
          padding: 14px;
        }
        .email-template-token code {
          font-size: 13px;
        }
        .email-template-token p {
          margin: 8px 0 0;
          font-size: 13px;
          line-height: 1.6;
          color: #5f5b53;
        }
        .email-template-note {
          margin-top: 18px;
          padding-top: 16px;
          border-top: 1px solid #ebe8df;
        }
      `}</style>
      <div className="email-template-layout">
        <div className="email-template-panel">
          {saved ? (
            <div className="email-template-banner is-success">
              템플릿을 저장했습니다. 다음 발송되는 팔로우 메일과 오픈 알림 메일부터 바로 적용됩니다.
            </div>
          ) : null}
          {reset ? (
            <div className="email-template-banner is-success">
              기본 템플릿으로 되돌렸습니다.
            </div>
          ) : null}
          {actionData?.error ? (
            <div className="email-template-banner is-error">{actionData.error}</div>
          ) : null}

          <h2>팔로우 메일 공통 템플릿</h2>
          <p className="email-template-muted">
            Shopify 기본 알림 템플릿은 <code>설정 &gt; 알림</code>에서 관리하지만,
            이 앱이 외부 발송하는 팔로우 / 오픈 알림 메일은 여기서 공통으로 관리합니다.
            저장하면 <strong>{data.shopName}</strong> 스토어의 다음 메일부터 즉시 반영됩니다.
          </p>

          <Form method="post" className="email-template-stack">
            <div className="email-template-group">
              <h3>공통 프레임</h3>
              <Field
                label="상단 브랜드 라벨"
                name="brandLabel"
                values={values}
                helper="메일 상단에 보이는 작은 브랜드 라벨입니다."
              />
              <Field
                label="공통 푸터 문구"
                name="footerText"
                values={values}
                rows={3}
                helper="모든 팔로우 관련 메일 하단에 공통으로 붙는 안내 문구입니다."
              />
            </div>

            <div className="email-template-group">
              <h3>팔로우 신규 공구 메일</h3>
              <div className="email-template-grid">
                <Field
                  label="메일 제목 · 즉시 오픈"
                  name="followDealSubjectLive"
                  values={values}
                />
                <Field
                  label="메일 제목 · 오픈 예정"
                  name="followDealSubjectUpcoming"
                  values={values}
                />
              </div>
              <Field
                label="헤드라인"
                name="followDealHeading"
                values={values}
                rows={2}
              />
              <div className="email-template-grid">
                <Field
                  label="본문 · 즉시 오픈"
                  name="followDealBodyLive"
                  values={values}
                  rows={4}
                />
                <Field
                  label="본문 · 오픈 예정"
                  name="followDealBodyUpcoming"
                  values={values}
                  rows={4}
                />
              </div>
              <Field
                label="버튼 문구"
                name="followDealButtonLabel"
                values={values}
              />
            </div>

            <div className="email-template-group">
              <h3>예약 오픈 알림 메일</h3>
              <Field
                label="메일 제목"
                name="openAlertSubject"
                values={values}
              />
              <Field
                label="헤드라인"
                name="openAlertHeading"
                values={values}
                rows={2}
              />
              <Field
                label="본문"
                name="openAlertBody"
                values={values}
                rows={4}
              />
              <Field
                label="버튼 문구"
                name="openAlertButtonLabel"
                values={values}
              />
            </div>

            <div className="email-template-actions">
              <button
                className="is-primary"
                name="intent"
                type="submit"
                value="save"
                disabled={isSubmitting}
              >
                {isSubmitting ? "저장 중..." : "템플릿 저장"}
              </button>
              <button
                className="is-secondary"
                name="intent"
                type="submit"
                value="reset"
                disabled={isSubmitting}
              >
                기본값으로 되돌리기
              </button>
            </div>
          </Form>
        </div>

        <div className="email-template-stack">
          <div className="email-template-panel">
            <h3>치환 변수</h3>
            <p className="email-template-muted">
              아래 토큰을 제목, 헤드라인, 본문, 푸터에 넣으면 실제 메일 발송 시 자동으로 치환됩니다.
            </p>
            <div className="email-template-token-list">
              {FOLLOW_EMAIL_TEMPLATE_TOKEN_INFOS.map((token) => (
                <div className="email-template-token" key={token.token}>
                  <code>{token.token}</code>
                  <p>
                    {token.description}
                    <br />
                    예시: {token.example}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="email-template-panel">
            <h3>운영 메모</h3>
            <p className="email-template-muted">
              본문 줄바꿈은 이메일에서도 그대로 유지됩니다. HTML 코드를 직접 넣는 방식이 아니라,
              안전한 공통 레이아웃 안에서 문구만 바꿔 쓰는 구조라서 디자인이 깨질 가능성을 줄였습니다.
            </p>
            <div className="email-template-note">
              <p className="email-template-muted">
                바로 영향을 받는 메일:
                <br />
                1. 팔로우한 컬렉터의 신규 공구 알림
                <br />
                2. 신청한 예약 공구 오픈 알림
              </p>
            </div>
          </div>
        </div>
      </div>
    </s-page>
  );
}
