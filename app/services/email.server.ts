import {
  DEFAULT_FOLLOW_EMAIL_TEMPLATE_SETTINGS,
  applyFollowEmailTemplateVariables,
  type FollowEmailTemplateSettings,
} from "./follow-email-template.shared";
import nodemailer from "nodemailer";

type NewDealEmailParams = {
  to: string;
  customerFirstName: string;
  influencerName: string;
  productTitle: string;
  productUrl: string;
  openAtLabel?: string;
  isUpcoming?: boolean;
  shopName?: string;
  templateSettings?: FollowEmailTemplateSettings;
};

type UpcomingOpenAlertEmailParams = {
  to: string;
  customerFirstName: string;
  productTitle: string;
  productUrl: string;
  openAtLabel: string;
  hostName?: string;
  shopName?: string;
  templateSettings?: FollowEmailTemplateSettings;
};

export type EmailDeliveryRuntimeStatus = {
  mode: "live" | "test-override" | "log-only";
  provider: "smtp" | "resend" | "none";
  hasResendApiKey: boolean;
  hasSmtpHost: boolean;
  hasSmtpAuth: boolean;
  smtpHost: string;
  smtpPort: string;
  hasEmailFrom: boolean;
  from: string;
  replyTo: string;
  overrideEmail: string;
  canUseOverride: boolean;
  nodeEnv: string;
};

type EmailSendResult = {
  ok: true;
  mode: "smtp" | "resend" | "log-only";
  isTestOverride: boolean;
  deliveredTo: string;
};

type DeliverEmailMessageParams = {
  to: string;
  subject: string;
  html: string;
  text: string;
  logLabel: string;
  logContext: Record<string, unknown>;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeTemplateSettings(settings?: FollowEmailTemplateSettings) {
  return settings || DEFAULT_FOLLOW_EMAIL_TEMPLATE_SETTINGS;
}

function textToHtml(value: string) {
  return escapeHtml(value).replaceAll("\n", "<br />");
}

function buildTemplateContext(params: {
  customerFirstName: string;
  influencerName?: string;
  hostName?: string;
  productTitle: string;
  productUrl: string;
  openAtLabel?: string;
  shopName?: string;
}) {
  const customerName = params.customerFirstName.trim()
    ? `${params.customerFirstName.trim()}님`
    : "고객님";
  const influencerName = params.influencerName?.trim() || "";
  const hostName = params.hostName?.trim() || influencerName;

  return {
    customer_name: customerName,
    influencer_name: influencerName,
    host_name: hostName,
    product_title: params.productTitle,
    product_url: params.productUrl,
    open_at_label: params.openAtLabel?.trim() || "",
    shop_name: params.shopName?.trim() || "TownWine",
  };
}

function applyTemplate(template: string, context: Record<string, string>) {
  return applyFollowEmailTemplateVariables(template, context).trim();
}

function buildEmailShell(params: {
  brandLabel: string;
  heading: string;
  body: string;
  productTitle: string;
  productUrl: string;
  buttonLabel: string;
  footerText: string;
  detailLines?: string[];
}) {
  const detailLines = (params.detailLines || []).filter(Boolean);
  const detailHtml = detailLines.length
    ? `<div style="font-size:14px;color:#7a6f61;margin-top:10px">${detailLines
        .map((line) => textToHtml(line))
        .join("<br />")}</div>`
    : "";

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f6f1e7;padding:32px;color:#2e2925">
      <div style="max-width:640px;margin:0 auto;background:#fffdf8;border:1px solid #e6ddcf;padding:32px">
        <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#9b8f7e;margin-bottom:16px">${escapeHtml(params.brandLabel)}</div>
        <h1 style="font-size:28px;line-height:1.2;margin:0 0 16px">${textToHtml(params.heading)}</h1>
        <p style="font-size:16px;line-height:1.7;margin:0 0 20px">${textToHtml(params.body)}</p>
        <div style="padding:20px;border:1px solid #e6ddcf;background:#faf5ec;margin:0 0 24px">
          <div style="font-size:13px;color:#7a6f61;margin-bottom:8px">상품명</div>
          <div style="font-size:22px;font-weight:700;line-height:1.4">${escapeHtml(params.productTitle)}</div>
          ${detailHtml}
        </div>
        <a href="${params.productUrl}" style="display:inline-block;background:#2f2925;color:#fffdf8;text-decoration:none;padding:14px 22px;font-weight:700;border-radius:0">${escapeHtml(params.buttonLabel)}</a>
        ${
          params.footerText
            ? `<p style="font-size:13px;line-height:1.7;color:#7a6f61;margin:28px 0 0">${textToHtml(params.footerText)}</p>`
            : ""
        }
      </div>
    </div>
  `;
}

export function getEmailDeliveryRuntimeStatus(): EmailDeliveryRuntimeStatus {
  const resendApiKey = String(process.env.RESEND_API_KEY || "").trim();
  const smtpHost = String(process.env.SMTP_HOST || "").trim();
  const smtpPort = String(process.env.SMTP_PORT || "").trim();
  const smtpUser = String(process.env.SMTP_USER || "").trim();
  const smtpPass = String(process.env.SMTP_PASS || "").trim();
  const from = String(process.env.EMAIL_FROM || "").trim();
  const replyTo = String(process.env.EMAIL_REPLY_TO || "").trim();
  const overrideEmail = String(process.env.EMAIL_TO_OVERRIDE || "").trim();
  const nodeEnv = String(process.env.NODE_ENV || "").trim() || "development";
  const canUseOverride =
    nodeEnv !== "production" ||
    String(process.env.ALLOW_EMAIL_OVERRIDE_IN_PRODUCTION || "").trim() === "1";
  const hasResendApiKey = Boolean(resendApiKey);
  const hasSmtpHost = Boolean(smtpHost);
  const hasSmtpAuth = Boolean(smtpUser && smtpPass);
  const hasEmailFrom = Boolean(from);
  const provider =
    hasSmtpHost && hasEmailFrom
      ? ("smtp" as const)
      : hasResendApiKey && hasEmailFrom
        ? ("resend" as const)
        : ("none" as const);

  return {
    mode:
      provider !== "none"
        ? overrideEmail && canUseOverride
          ? "test-override"
          : "live"
        : "log-only",
    provider,
    hasResendApiKey,
    hasSmtpHost,
    hasSmtpAuth,
    smtpHost,
    smtpPort,
    hasEmailFrom,
    from,
    replyTo,
    overrideEmail,
    canUseOverride,
    nodeEnv,
  };
}

function resolveEmailDeliveryTarget(to: string) {
  const runtimeStatus = getEmailDeliveryRuntimeStatus();

  return {
    to:
      runtimeStatus.overrideEmail && runtimeStatus.canUseOverride
        ? runtimeStatus.overrideEmail
        : to,
    runtimeStatus,
  };
}

function parseBooleanEnv(value: string | undefined, fallback: boolean) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

async function sendViaSmtp(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
  from: string;
  replyTo?: string;
}) {
  const smtpHost = String(process.env.SMTP_HOST || "").trim();
  const smtpPort = Number(String(process.env.SMTP_PORT || "").trim() || "587");
  const smtpUser = String(process.env.SMTP_USER || "").trim();
  const smtpPass = String(process.env.SMTP_PASS || "").trim();
  const smtpSecure = parseBooleanEnv(
    process.env.SMTP_SECURE,
    smtpPort === 465,
  );
  const smtpRequireTls = parseBooleanEnv(
    process.env.SMTP_REQUIRE_TLS,
    !smtpSecure,
  );

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    requireTLS: smtpRequireTls,
    auth: smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined,
  });

  const info = await transporter.sendMail({
    from: params.from,
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
    ...(params.replyTo ? { replyTo: params.replyTo } : {}),
  });

  console.log("SMTP email sent", {
    to: params.to,
    messageId: info.messageId,
    accepted: info.accepted,
    rejected: info.rejected,
    response: info.response,
  });
}

async function sendViaResend(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
  from: string;
  replyTo?: string;
}) {
  const resendApiKey = String(process.env.RESEND_API_KEY || "").trim();
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
      ...(params.replyTo ? { reply_to: params.replyTo } : {}),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Resend send failed: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  console.log("Resend email sent", result);
}

async function deliverEmailMessage(
  params: DeliverEmailMessageParams,
): Promise<EmailSendResult> {
  const from = String(process.env.EMAIL_FROM || "").trim();
  const replyTo = String(process.env.EMAIL_REPLY_TO || "").trim();
  const { to, runtimeStatus } = resolveEmailDeliveryTarget(params.to);

  if (runtimeStatus.provider === "none" || !from) {
    console.log(`${params.logLabel} delivery skipped (missing email config)`, {
      provider: runtimeStatus.provider,
      to,
      ...params.logContext,
    });
    return {
      ok: true,
      mode: "log-only",
      isTestOverride: runtimeStatus.mode === "test-override",
      deliveredTo: to,
    };
  }

  if (runtimeStatus.provider === "smtp") {
    await sendViaSmtp({
      to,
      subject: params.subject,
      html: params.html,
      text: params.text,
      from,
      replyTo,
    });
    return {
      ok: true,
      mode: "smtp",
      isTestOverride: runtimeStatus.mode === "test-override",
      deliveredTo: to,
    };
  }

  await sendViaResend({
    to,
    subject: params.subject,
    html: params.html,
    text: params.text,
    from,
    replyTo,
  });
  return {
    ok: true,
    mode: "resend",
    isTestOverride: runtimeStatus.mode === "test-override",
    deliveredTo: to,
  };
}

export async function sendNewDealEmail(params: NewDealEmailParams) {
  const isUpcoming = Boolean(params.isUpcoming);
  const templateSettings = normalizeTemplateSettings(params.templateSettings);
  const context = buildTemplateContext({
    customerFirstName: params.customerFirstName,
    influencerName: params.influencerName,
    productTitle: params.productTitle,
    productUrl: params.productUrl,
    openAtLabel: params.openAtLabel,
    shopName: params.shopName,
  });
  const subject = applyTemplate(
    isUpcoming
      ? templateSettings.followDeal.subjectUpcoming
      : templateSettings.followDeal.subjectLive,
    context,
  );
  const heading = applyTemplate(templateSettings.followDeal.heading, context);
  const body = applyTemplate(
    isUpcoming
      ? templateSettings.followDeal.bodyUpcoming
      : templateSettings.followDeal.bodyLive,
    context,
  );
  const buttonLabel = applyTemplate(
    templateSettings.followDeal.buttonLabel,
    context,
  );
  const footerText = applyTemplate(templateSettings.footerText, context);
  const detailLines =
    isUpcoming && context.open_at_label
      ? [`오픈 예정: ${context.open_at_label}`]
      : [];
  const text = `${heading}

${body}

상품명: ${params.productTitle}
${detailLines.length ? `${detailLines.join("\n")}\n` : ""}참여하기: ${params.productUrl}
${footerText ? `\n${footerText}` : ""}`.trim();

  const html = buildEmailShell({
    brandLabel: applyTemplate(templateSettings.brandLabel, context),
    heading,
    body,
    productTitle: params.productTitle,
    productUrl: params.productUrl,
    buttonLabel,
    footerText,
    detailLines,
  });
  return deliverEmailMessage({
    to: params.to,
    subject,
    html,
    text,
    logLabel: "New deal email",
    logContext: {
      customerFirstName: params.customerFirstName,
      influencerName: params.influencerName,
      productTitle: params.productTitle,
      productUrl: params.productUrl,
      openAtLabel: params.openAtLabel,
      isUpcoming,
    },
  });
}

export async function sendUpcomingOpenAlertEmail(
  params: UpcomingOpenAlertEmailParams,
) {
  const templateSettings = normalizeTemplateSettings(params.templateSettings);
  const context = buildTemplateContext({
    customerFirstName: params.customerFirstName,
    influencerName: params.hostName,
    hostName: params.hostName,
    productTitle: params.productTitle,
    productUrl: params.productUrl,
    openAtLabel: params.openAtLabel,
    shopName: params.shopName,
  });
  const subject = applyTemplate(templateSettings.openAlert.subject, context);
  const heading = applyTemplate(templateSettings.openAlert.heading, context);
  const body = applyTemplate(templateSettings.openAlert.body, context);
  const buttonLabel = applyTemplate(
    templateSettings.openAlert.buttonLabel,
    context,
  );
  const footerText = applyTemplate(templateSettings.footerText, context);
  const detailLines = [`오픈 시각: ${context.open_at_label}`];
  const text = `${heading}

${body}

상품명: ${params.productTitle}
${detailLines.join("\n")}
바로 보기: ${params.productUrl}
${footerText ? `\n${footerText}` : ""}`.trim();

  const html = buildEmailShell({
    brandLabel: applyTemplate(templateSettings.brandLabel, context),
    heading,
    body,
    productTitle: params.productTitle,
    productUrl: params.productUrl,
    buttonLabel,
    footerText,
    detailLines,
  });
  return deliverEmailMessage({
    to: params.to,
    subject,
    html,
    text,
    logLabel: "Upcoming open alert email",
    logContext: {
      customerFirstName: params.customerFirstName,
      productTitle: params.productTitle,
      productUrl: params.productUrl,
      openAtLabel: params.openAtLabel,
      hostName: params.hostName,
    },
  });
}
