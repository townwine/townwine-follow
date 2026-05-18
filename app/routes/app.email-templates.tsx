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
import {
  getEmailDeliveryRuntimeStatus,
  sendNewDealEmail,
} from "../services/email.server";
import { processFollowNotificationCatchup } from "../services/deal-notification.server";
import { getFollowersForInfluencerAliases } from "../services/follow.server";

type ActionData =
  | {
      ok: boolean;
      operation: "save" | "send-test-mail" | "run-follow-catchup";
      error?: string;
      message?: string;
      values?: FollowEmailTemplateFormValues;
      testResult?: {
        deliveredTo: string;
        mode: "smtp" | "resend" | "log-only";
        isTestOverride: boolean;
      };
      catchupResult?: {
        handle: string;
        followerCount: number;
        processedProductCount: number;
        matchedProductCount: number;
        sentCount: number;
        logOnlyCount: number;
        skippedCount: number;
        failedCount: number;
      };
    }
  | undefined;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const config = await loadFollowEmailTemplateConfig(admin);

  return {
    shopName: config.shopName,
    formValues: toFollowEmailTemplateFormValues(config.settings),
    runtimeStatus: getEmailDeliveryRuntimeStatus(),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "save");

  if (intent === "reset") {
    await saveFollowEmailTemplateSettings(admin, resetFollowEmailTemplateSettings());
    return redirect("/app/email-templates?reset=1");
  }

  if (intent === "send-test-mail") {
    const testEmail = String(formData.get("testEmail") || "").trim();
    const testHandle = String(formData.get("testHandle") || "").trim() || "Townie";
    const testProductTitle =
      String(formData.get("testProductTitle") || "").trim() || "운영 확인용 테스트 공구";

    if (!testEmail) {
      return {
        ok: false,
        operation: "send-test-mail",
        error: "테스트 수신 이메일을 입력해 주세요.",
      } satisfies ActionData;
    }

    try {
      const config = await loadFollowEmailTemplateConfig(admin);
      const result = await sendNewDealEmail({
        to: testEmail,
        customerFirstName: "운영",
        influencerName: testHandle,
        productTitle: testProductTitle,
        productUrl: `https://${session.shop}/products`,
        shopName: config.shopName,
        templateSettings: config.settings,
      });

      const providerLabel =
        result.mode === "smtp"
          ? "SMTP"
          : result.mode === "resend"
            ? "Resend"
            : "로그 전용";
      const message =
        result.mode === "log-only"
          ? "현재 운영 환경에 메일 발송 설정이 없어 실제 발송 대신 서버 로그만 남겼습니다."
          : result.isTestOverride
            ? `테스트 메일을 ${result.deliveredTo} 주소로 발송했습니다. 현재 EMAIL_TO_OVERRIDE가 켜져 있어 실제 팔로워 메일 대신 이 주소로만 나갑니다. (${providerLabel})`
            : `테스트 메일을 ${result.deliveredTo} 주소로 발송했습니다. (${providerLabel})`;

      return {
        ok: true,
        operation: "send-test-mail",
        message,
        testResult: {
          deliveredTo: result.deliveredTo,
          mode: result.mode,
          isTestOverride: result.isTestOverride,
        },
      } satisfies ActionData;
    } catch (error) {
      return {
        ok: false,
        operation: "send-test-mail",
        error:
          error instanceof Error
            ? error.message
            : "테스트 메일 발송 중 오류가 발생했습니다.",
      } satisfies ActionData;
    }
  }

  if (intent === "run-follow-catchup") {
    const handle = String(formData.get("testHandle") || "").trim();

    if (!handle) {
      return {
        ok: false,
        operation: "run-follow-catchup",
        error: "재발송할 컬렉터 닉네임을 입력해 주세요.",
      } satisfies ActionData;
    }

    try {
      const followers = await getFollowersForInfluencerAliases({
        shop: session.shop,
        aliases: [handle],
      });
      const result = await processFollowNotificationCatchup({
        admin,
        shop: session.shop,
        handles: [handle],
      });

      const messageParts = [
        `${handle} 팔로워 메일 재점검을 실행했습니다.`,
        `팔로워 ${followers.length}명`,
        `매칭 상품 ${result.matchedProductCount}개`,
        `실제 발송 ${result.sentCount}건`,
      ];

      if (result.logOnlyCount) {
        messageParts.push(`로그 전용 ${result.logOnlyCount}건`);
      }
      if (result.failedCount) {
        messageParts.push(`실패 ${result.failedCount}건`);
      }

      return {
        ok: true,
        operation: "run-follow-catchup",
        message: messageParts.join(" · "),
        catchupResult: {
          handle,
          followerCount: followers.length,
          processedProductCount: result.processedProductCount,
          matchedProductCount: result.matchedProductCount,
          sentCount: result.sentCount,
          logOnlyCount: result.logOnlyCount || 0,
          skippedCount: result.skippedCount || 0,
          failedCount: result.failedCount || 0,
        },
      } satisfies ActionData;
    } catch (error) {
      return {
        ok: false,
        operation: "run-follow-catchup",
        error:
          error instanceof Error
            ? error.message
            : "팔로워 메일 재발송 점검 중 오류가 발생했습니다.",
      } satisfies ActionData;
    }
  }

  const values = readFollowEmailTemplateFormValues(formData);
  const validationError = validateFollowEmailTemplateFormValues(values);

  if (validationError) {
    return {
      ok: false,
      operation: "save",
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
      operation: "save",
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
  const activeIntent = String(navigation.formData?.get("intent") || "");
  const isSaving = navigation.state === "submitting" && activeIntent === "save";
  const isSendingTest = navigation.state === "submitting" && activeIntent === "send-test-mail";
  const isRunningCatchup =
    navigation.state === "submitting" && activeIntent === "run-follow-catchup";
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
        .email-template-runtime-list {
          display: grid;
          gap: 10px;
          margin-top: 16px;
        }
        .email-template-runtime-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 14px;
          border: 1px solid #ebe8df;
          border-radius: 14px;
          background: #faf8f3;
          font-size: 14px;
        }
        .email-template-runtime-item code {
          font-size: 13px;
        }
        .email-template-chip {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 78px;
          padding: 6px 10px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.02em;
        }
        .email-template-chip.is-live {
          background: #edf9ef;
          color: #1f6b34;
        }
        .email-template-chip.is-warning {
          background: #fff5e8;
          color: #935d07;
        }
        .email-template-chip.is-muted {
          background: #f1efea;
          color: #5f5b53;
        }
        .email-template-diagnostics-form {
          display: grid;
          gap: 14px;
          margin-top: 18px;
        }
        .email-template-result {
          margin-top: 14px;
          padding: 14px 16px;
          border-radius: 14px;
          border: 1px solid #ebe8df;
          background: #faf8f3;
          font-size: 14px;
          line-height: 1.7;
          color: #2f2c28;
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
          {actionData?.message ? (
            <div className="email-template-banner is-success">{actionData.message}</div>
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
                disabled={isSaving}
              >
                {isSaving ? "저장 중..." : "템플릿 저장"}
              </button>
              <button
                className="is-secondary"
                name="intent"
                type="submit"
                value="reset"
                disabled={isSaving}
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

          <div className="email-template-panel">
            <h3>운영 발송 점검</h3>
            <p className="email-template-muted">
              현재 운영 서버 기준 메일 발송 모드와 공급자 상태를 확인하고, 템플릿 테스트 메일이나
              특정 컬렉터 닉네임의 팔로워 재발송 점검을 바로 실행할 수 있습니다.
            </p>
            <div className="email-template-runtime-list">
              <div className="email-template-runtime-item">
                <strong>현재 발송 모드</strong>
                <span
                  className={`email-template-chip ${
                    data.runtimeStatus.mode === "live"
                      ? "is-live"
                      : data.runtimeStatus.mode === "test-override"
                        ? "is-warning"
                        : "is-muted"
                  }`}
                >
                  {data.runtimeStatus.mode === "live"
                    ? "실발송"
                    : data.runtimeStatus.mode === "test-override"
                      ? "Override"
                      : "로그 전용"}
                </span>
              </div>
              <div className="email-template-runtime-item">
                <strong>현재 공급자</strong>
                <span>
                  {data.runtimeStatus.provider === "smtp"
                    ? "SMTP"
                    : data.runtimeStatus.provider === "resend"
                      ? "Resend"
                      : "미설정"}
                </span>
              </div>
              <div className="email-template-runtime-item">
                <strong>SMTP_HOST</strong>
                <span>{data.runtimeStatus.smtpHost || "비어 있음"}</span>
              </div>
              <div className="email-template-runtime-item">
                <strong>SMTP_PORT</strong>
                <span>{data.runtimeStatus.smtpPort || "비어 있음"}</span>
              </div>
              <div className="email-template-runtime-item">
                <strong>SMTP 인증</strong>
                <span>{data.runtimeStatus.hasSmtpAuth ? "설정됨" : "없음"}</span>
              </div>
              <div className="email-template-runtime-item">
                <strong>Resend API Key</strong>
                <span>{data.runtimeStatus.hasResendApiKey ? "설정됨" : "없음"}</span>
              </div>
              <div className="email-template-runtime-item">
                <strong>EMAIL_FROM</strong>
                <span>{data.runtimeStatus.from || "비어 있음"}</span>
              </div>
              <div className="email-template-runtime-item">
                <strong>EMAIL_REPLY_TO</strong>
                <span>{data.runtimeStatus.replyTo || "비어 있음"}</span>
              </div>
              <div className="email-template-runtime-item">
                <strong>EMAIL_TO_OVERRIDE</strong>
                <span>{data.runtimeStatus.overrideEmail || "비활성"}</span>
              </div>
              <div className="email-template-runtime-item">
                <strong>Override 적용 여부</strong>
                <span>{data.runtimeStatus.canUseOverride ? "적용됨" : "운영에서는 무시됨"}</span>
              </div>
            </div>

            <Form method="post" className="email-template-diagnostics-form">
              <label className="email-template-field">
                <span>테스트 수신 이메일</span>
                <input
                  name="testEmail"
                  defaultValue={actionData?.testResult?.deliveredTo || ""}
                  type="email"
                />
                <small>현재 템플릿으로 즉시 테스트 메일 1건을 보냅니다.</small>
              </label>
              <label className="email-template-field">
                <span>컬렉터 닉네임</span>
                <input
                  name="testHandle"
                  defaultValue={actionData?.catchupResult?.handle || "Townie"}
                  type="text"
                />
                <small>
                  예: <code>Townie</code>. 이 닉네임을 팔로우한 고객들을 기준으로 재발송 점검을 실행합니다.
                </small>
              </label>
              <label className="email-template-field">
                <span>테스트 상품명</span>
                <input
                  name="testProductTitle"
                  defaultValue="운영 확인용 테스트 공구"
                  type="text"
                />
              </label>
              <div className="email-template-actions">
                <button
                  className="is-primary"
                  name="intent"
                  type="submit"
                  value="send-test-mail"
                  disabled={isSendingTest}
                >
                  {isSendingTest ? "테스트 발송 중..." : "테스트 메일 발송"}
                </button>
                <button
                  className="is-secondary"
                  name="intent"
                  type="submit"
                  value="run-follow-catchup"
                  disabled={isRunningCatchup}
                >
                  {isRunningCatchup ? "재발송 점검 중..." : "팔로워 메일 재점검"}
                </button>
              </div>
            </Form>

            {actionData?.testResult ? (
              <div className="email-template-result">
                최종 테스트 대상: <strong>{actionData.testResult.deliveredTo}</strong>
                <br />
                발송 방식:{" "}
                <strong>
                  {actionData.testResult.mode === "smtp"
                    ? actionData.testResult.isTestOverride
                      ? "SMTP + Override"
                      : "SMTP 실발송"
                    : actionData.testResult.mode === "resend"
                      ? actionData.testResult.isTestOverride
                        ? "Resend + Override"
                        : "Resend 실발송"
                    : "로그 전용"}
                </strong>
              </div>
            ) : null}

            {actionData?.catchupResult ? (
              <div className="email-template-result">
                닉네임 <strong>{actionData.catchupResult.handle}</strong> 기준
                <br />
                팔로워 {actionData.catchupResult.followerCount}명 · 매칭 상품 {actionData.catchupResult.matchedProductCount}개
                <br />
                실제 발송 {actionData.catchupResult.sentCount}건 · 로그 전용 {actionData.catchupResult.logOnlyCount}건
                <br />
                건너뜀 {actionData.catchupResult.skippedCount}건 · 실패 {actionData.catchupResult.failedCount}건
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </s-page>
  );
}
