type NewDealEmailParams = {
  to: string;
  customerFirstName: string;
  influencerName: string;
  productTitle: string;
  productUrl: string;
  openAtLabel?: string;
  isUpcoming?: boolean;
};

type UpcomingOpenAlertEmailParams = {
  to: string;
  customerFirstName: string;
  productTitle: string;
  productUrl: string;
  openAtLabel: string;
  hostName?: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function sendNewDealEmail(params: NewDealEmailParams) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const replyTo = process.env.EMAIL_REPLY_TO;
  const testOverride = process.env.EMAIL_TO_OVERRIDE;

  const to = testOverride || params.to;
  const customerName = params.customerFirstName
    ? `${escapeHtml(params.customerFirstName)}님`
    : "고객님";
  const influencerName = escapeHtml(params.influencerName);
  const productTitle = escapeHtml(params.productTitle);
  const productUrl = params.productUrl;
  const openAtLabel = params.openAtLabel
    ? escapeHtml(params.openAtLabel)
    : "";
  const isUpcoming = Boolean(params.isUpcoming);

  const subject = isUpcoming
    ? `[TownWine] ${influencerName}님의 새 공동구매가 등록됐어요`
    : `[TownWine] ${influencerName}님의 새 공동구매가 열렸어요`;
  const text = `${customerName}

${params.influencerName}님이 새 공동구매를 ${
  isUpcoming ? "등록했습니다." : "열었습니다."
}

상품명: ${params.productTitle}
${isUpcoming && params.openAtLabel ? `오픈 예정: ${params.openAtLabel}\n` : ""}참여하기: ${productUrl}
`;

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f6f1e7;padding:32px;color:#2e2925">
      <div style="max-width:640px;margin:0 auto;background:#fffdf8;border:1px solid #e6ddcf;padding:32px">
        <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#9b8f7e;margin-bottom:16px">TownWine</div>
        <h1 style="font-size:28px;line-height:1.2;margin:0 0 16px">${customerName}, 새 공동구매 소식이 도착했어요.</h1>
        <p style="font-size:16px;line-height:1.7;margin:0 0 20px"><strong>${influencerName}</strong>님이 새 와인 공동구매를 ${
          isUpcoming ? "등록했습니다." : "시작했습니다."
        }</p>
        <div style="padding:20px;border:1px solid #e6ddcf;background:#faf5ec;margin:0 0 24px">
          <div style="font-size:13px;color:#7a6f61;margin-bottom:8px">상품명</div>
          <div style="font-size:22px;font-weight:700;line-height:1.4">${productTitle}</div>
          ${
            isUpcoming && openAtLabel
              ? `<div style="font-size:14px;color:#7a6f61;margin-top:10px">오픈 예정: ${openAtLabel}</div>`
              : ""
          }
        </div>
        <a href="${productUrl}" style="display:inline-block;background:#2f2925;color:#fffdf8;text-decoration:none;padding:14px 22px;font-weight:700;border-radius:0">공동구매 보러 가기</a>
        <p style="font-size:13px;line-height:1.7;color:#7a6f61;margin:28px 0 0">이 메일은 TownWine에서 팔로우한 인플루언서의 새 공동구매 알림으로 발송되었습니다.</p>
      </div>
    </div>
  `;

  if (!resendApiKey || !from) {
    console.log("Email delivery skipped (missing Resend config)", {
      to,
      customerFirstName: params.customerFirstName,
      influencerName: params.influencerName,
      productTitle: params.productTitle,
      productUrl: params.productUrl,
      openAtLabel: params.openAtLabel,
      isUpcoming,
    });
    return { ok: true, mode: "log-only" as const };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Resend send failed: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  console.log("Resend email sent", result);
  return { ok: true, mode: "resend" as const };
}

export async function sendUpcomingOpenAlertEmail(
  params: UpcomingOpenAlertEmailParams,
) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const replyTo = process.env.EMAIL_REPLY_TO;
  const testOverride = process.env.EMAIL_TO_OVERRIDE;

  const to = testOverride || params.to;
  const customerName = params.customerFirstName
    ? `${escapeHtml(params.customerFirstName)}님`
    : "고객님";
  const productTitle = escapeHtml(params.productTitle);
  const productUrl = params.productUrl;
  const openAtLabel = escapeHtml(params.openAtLabel);
  const hostName = escapeHtml(params.hostName || "TownWine");

  const subject = `[TownWine] 신청하신 와인 오픈 알림이 도착했어요`;
  const text = `${customerName}

신청하신 와인이 오픈되었습니다.

상품명: ${params.productTitle}
오픈 시각: ${params.openAtLabel}
추천 컬렉터: ${params.hostName || "TownWine"}
바로 보기: ${productUrl}
`;

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f6f1e7;padding:32px;color:#2e2925">
      <div style="max-width:640px;margin:0 auto;background:#fffdf8;border:1px solid #e6ddcf;padding:32px">
        <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#9b8f7e;margin-bottom:16px">TownWine</div>
        <h1 style="font-size:28px;line-height:1.2;margin:0 0 16px">${customerName}, 기다리던 와인이 열렸어요.</h1>
        <p style="font-size:16px;line-height:1.7;margin:0 0 20px"><strong>${hostName}</strong> 추천 와인이 지금 참여 가능한 상태로 오픈되었습니다.</p>
        <div style="padding:20px;border:1px solid #e6ddcf;background:#faf5ec;margin:0 0 24px">
          <div style="font-size:13px;color:#7a6f61;margin-bottom:8px">상품명</div>
          <div style="font-size:22px;font-weight:700;line-height:1.4;margin-bottom:10px">${productTitle}</div>
          <div style="font-size:14px;color:#7a6f61">오픈 시각: ${openAtLabel}</div>
        </div>
        <a href="${productUrl}" style="display:inline-block;background:#2f2925;color:#fffdf8;text-decoration:none;padding:14px 22px;font-weight:700;border-radius:0">오픈된 와인 보러 가기</a>
        <p style="font-size:13px;line-height:1.7;color:#7a6f61;margin:28px 0 0">이 메일은 TownWine에서 신청한 예약 와인 오픈 알림으로 발송되었습니다.</p>
      </div>
    </div>
  `;

  if (!resendApiKey || !from) {
    console.log("Upcoming open alert delivery skipped (missing Resend config)", {
      to,
      customerFirstName: params.customerFirstName,
      productTitle: params.productTitle,
      productUrl: params.productUrl,
      openAtLabel: params.openAtLabel,
      hostName: params.hostName,
    });
    return { ok: true, mode: "log-only" as const };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Resend send failed: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  console.log("Resend upcoming open alert sent", result);
  return { ok: true, mode: "resend" as const };
}
