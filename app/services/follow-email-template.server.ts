import {
  DEFAULT_FOLLOW_EMAIL_TEMPLATE_SETTINGS,
  type FollowEmailTemplateFormValues,
  type FollowEmailTemplateSettings,
  mergeFollowEmailTemplateSettings,
} from "./follow-email-template.shared";

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type TemplateConfigQuery = {
  shop: {
    name: string;
  } | null;
  currentAppInstallation: {
    id: string;
    metafield: {
      value: string;
    } | null;
  } | null;
};

type MetafieldsSetResponse = {
  metafieldsSet: {
    userErrors: Array<{
      field?: string[];
      message?: string;
    }>;
  };
};

const APP_DATA_NAMESPACE = "townwine_follow";
const APP_DATA_KEY = "follow_email_template";

function createUserErrorMessage(
  errors: MetafieldsSetResponse["metafieldsSet"]["userErrors"],
) {
  return errors
    .map((error) => {
      const fieldPath = error.field?.length ? `${error.field.join(".")}: ` : "";
      return `${fieldPath}${error.message || "Unknown error"}`;
    })
    .join(", ");
}

async function runAdminQuery<TData>(
  admin: AdminGraphqlClient,
  query: string,
  variables?: Record<string, unknown>,
) {
  const response = await admin.graphql(query, variables ? { variables } : undefined);
  const result = (await response.json()) as {
    data?: TData;
    errors?: Array<{ message?: string }>;
  };

  if (!response.ok || result.errors?.length || !result.data) {
    const messages = result.errors?.map((error) => error.message).filter(Boolean);
    throw new Error(
      messages?.length
        ? messages.join(", ")
        : `Admin query failed with status ${response.status}`,
    );
  }

  return result.data;
}

async function fetchTemplateConfig(admin: AdminGraphqlClient) {
  const data = await runAdminQuery<TemplateConfigQuery>(
    admin,
    `#graphql
      query FollowEmailTemplateConfig {
        shop {
          name
        }
        currentAppInstallation {
          id
          metafield(namespace: "townwine_follow", key: "follow_email_template") {
            value
          }
        }
      }
    `,
  );

  if (!data.currentAppInstallation?.id) {
    throw new Error("앱 설치 정보를 불러오지 못했습니다.");
  }

  let parsedValue: unknown = null;

  if (data.currentAppInstallation.metafield?.value) {
    try {
      parsedValue = JSON.parse(data.currentAppInstallation.metafield.value);
    } catch (error) {
      console.error("[follow-email-template] failed to parse app data metafield", {
        message: error instanceof Error ? error.message : String(error),
        rawValue: data.currentAppInstallation.metafield.value,
      });
    }
  }

  return {
    appInstallationId: data.currentAppInstallation.id,
    shopName: String(data.shop?.name || "TownWine").trim() || "TownWine",
    settings: mergeFollowEmailTemplateSettings(parsedValue),
  };
}

export async function loadFollowEmailTemplateConfig(admin: AdminGraphqlClient) {
  return fetchTemplateConfig(admin);
}

export async function saveFollowEmailTemplateSettings(
  admin: AdminGraphqlClient,
  settings: FollowEmailTemplateSettings,
) {
  const { appInstallationId } = await fetchTemplateConfig(admin);
  const data = await runAdminQuery<MetafieldsSetResponse>(
    admin,
    `#graphql
      mutation SaveFollowEmailTemplate($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      metafields: [
        {
          ownerId: appInstallationId,
          namespace: APP_DATA_NAMESPACE,
          key: APP_DATA_KEY,
          type: "json",
          value: JSON.stringify(settings),
        },
      ],
    },
  );

  if (data.metafieldsSet.userErrors.length) {
    throw new Error(createUserErrorMessage(data.metafieldsSet.userErrors));
  }

  return settings;
}

function readFormValue(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

export function readFollowEmailTemplateFormValues(
  formData: FormData,
): FollowEmailTemplateFormValues {
  return {
    brandLabel: readFormValue(formData, "brandLabel"),
    footerText: readFormValue(formData, "footerText"),
    followDealSubjectLive: readFormValue(formData, "followDealSubjectLive"),
    followDealSubjectUpcoming: readFormValue(
      formData,
      "followDealSubjectUpcoming",
    ),
    followDealHeading: readFormValue(formData, "followDealHeading"),
    followDealBodyLive: readFormValue(formData, "followDealBodyLive"),
    followDealBodyUpcoming: readFormValue(formData, "followDealBodyUpcoming"),
    followDealButtonLabel: readFormValue(formData, "followDealButtonLabel"),
    openAlertSubject: readFormValue(formData, "openAlertSubject"),
    openAlertHeading: readFormValue(formData, "openAlertHeading"),
    openAlertBody: readFormValue(formData, "openAlertBody"),
    openAlertButtonLabel: readFormValue(formData, "openAlertButtonLabel"),
  };
}

export function validateFollowEmailTemplateFormValues(
  values: FollowEmailTemplateFormValues,
) {
  const requiredEntries: Array<[string, string]> = [
    ["브랜드 라벨", values.brandLabel],
    ["팔로우 메일 제목 (즉시 오픈)", values.followDealSubjectLive],
    ["팔로우 메일 제목 (오픈 예정)", values.followDealSubjectUpcoming],
    ["팔로우 메일 헤드라인", values.followDealHeading],
    ["팔로우 메일 본문 (즉시 오픈)", values.followDealBodyLive],
    ["팔로우 메일 본문 (오픈 예정)", values.followDealBodyUpcoming],
    ["팔로우 메일 버튼 문구", values.followDealButtonLabel],
    ["오픈 알림 메일 제목", values.openAlertSubject],
    ["오픈 알림 메일 헤드라인", values.openAlertHeading],
    ["오픈 알림 메일 본문", values.openAlertBody],
    ["오픈 알림 메일 버튼 문구", values.openAlertButtonLabel],
  ];

  const missingLabel = requiredEntries.find(([, value]) => !value)?.[0];

  if (missingLabel) {
    return `${missingLabel}을(를) 비워둘 수 없습니다.`;
  }

  return null;
}

export function resetFollowEmailTemplateSettings() {
  return DEFAULT_FOLLOW_EMAIL_TEMPLATE_SETTINGS;
}
