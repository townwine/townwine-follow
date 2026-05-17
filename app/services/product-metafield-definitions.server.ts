type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type ProductMetafieldDefinition = {
  key: string;
  name: string;
  description: string;
  type: string;
};

type DefinitionLookupResponse = {
  metafieldDefinition: {
    id: string;
    name: string;
    description: string | null;
    access: {
      storefront: string;
    };
  } | null;
};

type DefinitionMutationResponse = {
  createdDefinition?: {
    id: string;
  } | null;
  updatedDefinition?: {
    id: string;
  } | null;
  userErrors: Array<{
    field?: string[];
    message?: string;
  }>;
};

const PRODUCT_OWNER_TYPE = "PRODUCT";
const METAFIELD_NAMESPACE = "custom";

const PRODUCT_METAFIELD_DEFINITIONS: ProductMetafieldDefinition[] = [
  {
    key: "host_name",
    name: "추천 컬렉터 이름",
    description: "상품에 연결된 추천 컬렉터 이름입니다. 예: 소믈리에 윤지",
    type: "single_line_text_field",
  },
  {
    key: "host_handle",
    name: "추천 컬렉터 공개 핸들",
    description: "상품에 연결된 추천 컬렉터 공개 핸들입니다. 예: @yunji.wine",
    type: "single_line_text_field",
  },
  {
    key: "influencer_handle",
    name: "추천 컬렉터 내부 핸들",
    description:
      "팔로우, 컬렉터 통계, 메일 알림 연동에 사용하는 내부 핸들입니다. 예: yunji 또는 yunji.wine",
    type: "single_line_text_field",
  },
  {
    key: "deal_open_month",
    name: "공구 오픈 월",
    description: "한국 시간 기준 공구 오픈 월입니다. 예: 5",
    type: "number_integer",
  },
  {
    key: "deal_open_day",
    name: "공구 오픈 일",
    description: "한국 시간 기준 공구 오픈 일입니다. 예: 9",
    type: "number_integer",
  },
  {
    key: "deal_open_hour",
    name: "공구 오픈 시",
    description: "한국 시간 기준 공구 오픈 시입니다. 24시간제로 입력합니다. 예: 14",
    type: "number_integer",
  },
  {
    key: "deal_open_minute",
    name: "공구 오픈 분",
    description: "한국 시간 기준 공구 오픈 분입니다. 예: 0, 30",
    type: "number_integer",
  },
  {
    key: "deal_open_at_kst",
    name: "자동 계산 · 실제 오픈 일시",
    description:
      "월/일/시/분 입력 시 앱이 한국 시간 기준 실제 오픈 일시를 자동 계산합니다. 직접 수정하지 마세요.",
    type: "single_line_text_field",
  },
  {
    key: "deal_subtitle",
    name: "서브타이틀",
    description:
      "상품명 아래에 노출할 한 줄 소개입니다. 예: Curated wine · 2026 · Default Title",
    type: "single_line_text_field",
  },
  {
    key: "eta_text",
    name: "예상 수령일",
    description: "상세 페이지 재고 상태 영역에 노출할 예상 수령일 텍스트입니다.",
    type: "single_line_text_field",
  },
  {
    key: "blend_text",
    name: "품종 라벨",
    description: "상품 제목 아래 메타 영역에 노출할 품종 또는 블렌드 텍스트입니다.",
    type: "single_line_text_field",
  },
  {
    key: "abv_text",
    name: "도수 라벨",
    description: "상품 제목 아래 메타 영역에 노출할 도수 텍스트입니다. 예: 14% ABV",
    type: "single_line_text_field",
  },
  {
    key: "policy_groupbuy",
    name: "안내사항 · 공구",
    description: "안내사항 박스의 공구 항목 본문입니다.",
    type: "multi_line_text_field",
  },
  {
    key: "policy_shipping",
    name: "안내사항 · 배송",
    description: "안내사항 박스의 배송 항목 본문입니다.",
    type: "multi_line_text_field",
  },
  {
    key: "policy_refund",
    name: "안내사항 · 환불",
    description: "안내사항 박스의 환불 항목 본문입니다.",
    type: "multi_line_text_field",
  },
  {
    key: "spec_origin",
    name: "와인 스펙 · 국가 / 산지",
    description: "와인 스펙 영역의 국가 / 산지 값입니다.",
    type: "single_line_text_field",
  },
  {
    key: "spec_grape",
    name: "와인 스펙 · 품종",
    description: "와인 스펙 영역의 품종 값입니다.",
    type: "single_line_text_field",
  },
  {
    key: "spec_profile",
    name: "와인 스펙 · 당도 / 산도",
    description: "와인 스펙 영역의 당도 / 산도 값입니다.",
    type: "single_line_text_field",
  },
  {
    key: "spec_serving",
    name: "와인 스펙 · 음용 적기",
    description: "와인 스펙 영역의 음용 적기 값입니다.",
    type: "single_line_text_field",
  },
  {
    key: "max_per_person",
    name: "1인 최대 구매 수량",
    description: "상세 페이지 수량 선택 영역에 노출할 1인 최대 구매 가능 병 수입니다.",
    type: "number_integer",
  },
  {
    key: "curation_note",
    name: "큐레이션 노트",
    description: "상세 페이지 큐레이션 노트 영역에 노출할 본문입니다.",
    type: "multi_line_text_field",
  },
  {
    key: "collector_followers_adjustment",
    name: "컬렉터 팔로워 보정값",
    description:
      "실제 팔로우 집계 수에 더하거나 뺄 보정값입니다. 예: 기존 오프라인 팔로워 수",
    type: "number_integer",
  },
  {
    key: "collector_deals_adjustment",
    name: "컬렉터 누적 공구 보정값",
    description:
      "자동 집계된 누적 공구 수에 더하거나 뺄 보정값입니다. 예: 과거 수기 운영 공구 수",
    type: "number_integer",
  },
];

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

function createUserErrorMessage(
  key: string,
  errors: DefinitionMutationResponse["userErrors"],
) {
  return errors
    .map((error) => {
      const fieldPath = error.field?.length ? `${error.field.join(".")}: ` : "";
      return `${key}: ${fieldPath}${error.message || "Unknown error"}`;
    })
    .join(", ");
}

async function findDefinition(
  admin: AdminGraphqlClient,
  key: string,
) {
  const data = await runAdminQuery<DefinitionLookupResponse>(
    admin,
    `#graphql
      query ProductMetafieldDefinition($identifier: MetafieldDefinitionIdentifierInput) {
        metafieldDefinition(identifier: $identifier) {
          id
          name
          description
          access {
            storefront
          }
        }
      }
    `,
    {
      identifier: {
        ownerType: PRODUCT_OWNER_TYPE,
        namespace: METAFIELD_NAMESPACE,
        key,
      },
    },
  );

  return data.metafieldDefinition;
}

async function createDefinition(
  admin: AdminGraphqlClient,
  definition: ProductMetafieldDefinition,
) {
  const data = await runAdminQuery<{
    metafieldDefinitionCreate: DefinitionMutationResponse;
  }>(
    admin,
    `#graphql
      mutation CreateProductMetafieldDefinition($definition: MetafieldDefinitionInput!) {
        metafieldDefinitionCreate(definition: $definition) {
          createdDefinition {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      definition: {
        ownerType: PRODUCT_OWNER_TYPE,
        namespace: METAFIELD_NAMESPACE,
        key: definition.key,
        name: definition.name,
        description: definition.description,
        type: definition.type,
        access: {
          storefront: "PUBLIC_READ",
        },
      },
    },
  );

  const payload = data.metafieldDefinitionCreate;

  if (payload.userErrors.length) {
    throw new Error(createUserErrorMessage(definition.key, payload.userErrors));
  }

  return payload.createdDefinition?.id || "";
}

async function updateDefinition(
  admin: AdminGraphqlClient,
  definition: ProductMetafieldDefinition,
) {
  const data = await runAdminQuery<{
    metafieldDefinitionUpdate: DefinitionMutationResponse;
  }>(
    admin,
    `#graphql
      mutation UpdateProductMetafieldDefinition($definition: MetafieldDefinitionUpdateInput!) {
        metafieldDefinitionUpdate(definition: $definition) {
          updatedDefinition {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      definition: {
        ownerType: PRODUCT_OWNER_TYPE,
        namespace: METAFIELD_NAMESPACE,
        key: definition.key,
        name: definition.name,
        description: definition.description,
        access: {
          storefront: "PUBLIC_READ",
        },
      },
    },
  );

  const payload = data.metafieldDefinitionUpdate;

  if (payload.userErrors.length) {
    throw new Error(createUserErrorMessage(definition.key, payload.userErrors));
  }

  return payload.updatedDefinition?.id || "";
}

export async function ensureProductMetafieldDefinitions(
  admin: AdminGraphqlClient,
) {
  const createdKeys: string[] = [];
  const updatedKeys: string[] = [];

  for (const definition of PRODUCT_METAFIELD_DEFINITIONS) {
    const existingDefinition = await findDefinition(admin, definition.key);

    if (!existingDefinition) {
      await createDefinition(admin, definition);
      createdKeys.push(definition.key);
      continue;
    }

    const needsUpdate =
      existingDefinition.name !== definition.name ||
      (existingDefinition.description || "") !== definition.description ||
      existingDefinition.access.storefront !== "PUBLIC_READ";

    if (!needsUpdate) {
      continue;
    }

    await updateDefinition(admin, definition);
    updatedKeys.push(definition.key);
  }

  return {
    createdKeys,
    updatedKeys,
    totalDefinitions: PRODUCT_METAFIELD_DEFINITIONS.length,
  };
}
