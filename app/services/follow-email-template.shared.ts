export type FollowEmailTemplateSettings = {
  brandLabel: string;
  footerText: string;
  followDeal: {
    subjectLive: string;
    subjectUpcoming: string;
    heading: string;
    bodyLive: string;
    bodyUpcoming: string;
    buttonLabel: string;
  };
  openAlert: {
    subject: string;
    heading: string;
    body: string;
    buttonLabel: string;
  };
};

export type FollowEmailTemplateFormValues = {
  brandLabel: string;
  footerText: string;
  followDealSubjectLive: string;
  followDealSubjectUpcoming: string;
  followDealHeading: string;
  followDealBodyLive: string;
  followDealBodyUpcoming: string;
  followDealButtonLabel: string;
  openAlertSubject: string;
  openAlertHeading: string;
  openAlertBody: string;
  openAlertButtonLabel: string;
};

export type FollowEmailTemplateTokenInfo = {
  token: string;
  description: string;
  example: string;
};

export const FOLLOW_EMAIL_TEMPLATE_TOKEN_INFOS: FollowEmailTemplateTokenInfo[] = [
  {
    token: "{{customer_name}}",
    description: "받는 고객 이름",
    example: "yunji님",
  },
  {
    token: "{{influencer_name}}",
    description: "팔로우한 컬렉터 또는 추천자 이름",
    example: "Townie",
  },
  {
    token: "{{host_name}}",
    description: "오픈 알림에 연결된 추천 컬렉터 이름",
    example: "Townie",
  },
  {
    token: "{{product_title}}",
    description: "상품명",
    example: "공구 테스트",
  },
  {
    token: "{{open_at_label}}",
    description: "오픈 예정 또는 오픈 시각",
    example: "05월 19일 14:00",
  },
  {
    token: "{{product_url}}",
    description: "상품 상세 링크",
    example: "https://town-wine.myshopify.com/products/test",
  },
  {
    token: "{{shop_name}}",
    description: "스토어 이름",
    example: "TownWine",
  },
];

export const DEFAULT_FOLLOW_EMAIL_TEMPLATE_SETTINGS: FollowEmailTemplateSettings = {
  brandLabel: "TownWine",
  footerText: "이 메일은 {{shop_name}} 알림 설정에 따라 발송되었습니다.",
  followDeal: {
    subjectLive: "[{{shop_name}}] {{influencer_name}}님의 새 공동구매가 열렸어요",
    subjectUpcoming:
      "[{{shop_name}}] {{influencer_name}}님의 새 공동구매가 등록됐어요",
    heading: "{{customer_name}}, 새 공동구매 소식이 도착했어요.",
    bodyLive: "{{influencer_name}}님이 새 와인 공동구매를 시작했습니다.",
    bodyUpcoming:
      "{{influencer_name}}님이 새 와인 공동구매를 등록했습니다.\n오픈 예정 시각: {{open_at_label}}",
    buttonLabel: "공동구매 보러 가기",
  },
  openAlert: {
    subject: "[{{shop_name}}] 신청하신 와인 오픈 알림이 도착했어요",
    heading: "{{customer_name}}, 기다리던 와인이 열렸어요.",
    body:
      "{{host_name}} 추천 와인이 지금 참여 가능한 상태로 오픈되었습니다.\n오픈 시각: {{open_at_label}}",
    buttonLabel: "오픈된 와인 보러 가기",
  },
};

export const DEFAULT_FOLLOW_EMAIL_TEMPLATE_FORM_VALUES =
  toFollowEmailTemplateFormValues(DEFAULT_FOLLOW_EMAIL_TEMPLATE_SETTINGS);

function readText(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

export function mergeFollowEmailTemplateSettings(
  value: unknown,
): FollowEmailTemplateSettings {
  const root = readObject(value);
  const followDeal = readObject(root?.followDeal);
  const openAlert = readObject(root?.openAlert);

  return {
    brandLabel: readText(
      root?.brandLabel,
      DEFAULT_FOLLOW_EMAIL_TEMPLATE_SETTINGS.brandLabel,
    ),
    footerText: readText(
      root?.footerText,
      DEFAULT_FOLLOW_EMAIL_TEMPLATE_SETTINGS.footerText,
    ),
    followDeal: {
      subjectLive: readText(
        followDeal?.subjectLive,
        DEFAULT_FOLLOW_EMAIL_TEMPLATE_SETTINGS.followDeal.subjectLive,
      ),
      subjectUpcoming: readText(
        followDeal?.subjectUpcoming,
        DEFAULT_FOLLOW_EMAIL_TEMPLATE_SETTINGS.followDeal.subjectUpcoming,
      ),
      heading: readText(
        followDeal?.heading,
        DEFAULT_FOLLOW_EMAIL_TEMPLATE_SETTINGS.followDeal.heading,
      ),
      bodyLive: readText(
        followDeal?.bodyLive,
        DEFAULT_FOLLOW_EMAIL_TEMPLATE_SETTINGS.followDeal.bodyLive,
      ),
      bodyUpcoming: readText(
        followDeal?.bodyUpcoming,
        DEFAULT_FOLLOW_EMAIL_TEMPLATE_SETTINGS.followDeal.bodyUpcoming,
      ),
      buttonLabel: readText(
        followDeal?.buttonLabel,
        DEFAULT_FOLLOW_EMAIL_TEMPLATE_SETTINGS.followDeal.buttonLabel,
      ),
    },
    openAlert: {
      subject: readText(
        openAlert?.subject,
        DEFAULT_FOLLOW_EMAIL_TEMPLATE_SETTINGS.openAlert.subject,
      ),
      heading: readText(
        openAlert?.heading,
        DEFAULT_FOLLOW_EMAIL_TEMPLATE_SETTINGS.openAlert.heading,
      ),
      body: readText(
        openAlert?.body,
        DEFAULT_FOLLOW_EMAIL_TEMPLATE_SETTINGS.openAlert.body,
      ),
      buttonLabel: readText(
        openAlert?.buttonLabel,
        DEFAULT_FOLLOW_EMAIL_TEMPLATE_SETTINGS.openAlert.buttonLabel,
      ),
    },
  };
}

export function toFollowEmailTemplateFormValues(
  settings: FollowEmailTemplateSettings,
): FollowEmailTemplateFormValues {
  return {
    brandLabel: settings.brandLabel,
    footerText: settings.footerText,
    followDealSubjectLive: settings.followDeal.subjectLive,
    followDealSubjectUpcoming: settings.followDeal.subjectUpcoming,
    followDealHeading: settings.followDeal.heading,
    followDealBodyLive: settings.followDeal.bodyLive,
    followDealBodyUpcoming: settings.followDeal.bodyUpcoming,
    followDealButtonLabel: settings.followDeal.buttonLabel,
    openAlertSubject: settings.openAlert.subject,
    openAlertHeading: settings.openAlert.heading,
    openAlertBody: settings.openAlert.body,
    openAlertButtonLabel: settings.openAlert.buttonLabel,
  };
}

export function fromFollowEmailTemplateFormValues(
  values: FollowEmailTemplateFormValues,
): FollowEmailTemplateSettings {
  return {
    brandLabel: values.brandLabel,
    footerText: values.footerText,
    followDeal: {
      subjectLive: values.followDealSubjectLive,
      subjectUpcoming: values.followDealSubjectUpcoming,
      heading: values.followDealHeading,
      bodyLive: values.followDealBodyLive,
      bodyUpcoming: values.followDealBodyUpcoming,
      buttonLabel: values.followDealButtonLabel,
    },
    openAlert: {
      subject: values.openAlertSubject,
      heading: values.openAlertHeading,
      body: values.openAlertBody,
      buttonLabel: values.openAlertButtonLabel,
    },
  };
}

export type FollowEmailTemplateVariableContext = Record<string, string>;

export function applyFollowEmailTemplateVariables(
  template: string,
  context: FollowEmailTemplateVariableContext,
) {
  return template.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, rawKey: string) => {
    const key = rawKey.toLowerCase();
    return context[key] ?? "";
  });
}
