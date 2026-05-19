type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type MetaobjectFieldDefinition = {
  key: string;
  name: string;
  description?: string;
  type: string;
};

type CustomerSummary = {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: string;
};

type CollectionSummary = {
  id: string;
  title: string;
  handle: string;
  updatedAt: string;
};

type CollectorProfileFields = {
  customerId: string;
  customerEmail: string;
  customerName: string;
  displayName: string;
  publicHandle: string;
  roleLabel: string;
  bio: string;
  introduction: string;
  quote: string;
  featuredCollectionHandle: string;
  specialties: string;
  preferredRegions: string;
  preferredStyles: string;
  preferredGrapes: string;
  priceBand: string;
  tasteBody: number;
  tasteTannin: number;
  tasteAcidity: number;
  tasteSweetness: number;
  tasteAlcohol: number;
  sortOrder: number;
};

export type CollectorProfileRecord = {
  id: string;
  handle: string;
  updatedAt: string;
  status: "ACTIVE" | "DRAFT";
  storefrontPath: string;
  fields: CollectorProfileFields;
};

type CollectorDefinitionNode = {
  id: string;
  displayNameKey: string | null;
  access: {
    admin: string;
    storefront: string;
  };
  capabilities: {
    onlineStore: {
      enabled: boolean;
    };
    publishable: {
      enabled: boolean;
    };
    renderable: {
      enabled: boolean;
    };
  };
  fieldDefinitions: Array<{
    key: string;
    name: string;
    type: {
      name: string;
    };
  }>;
} | null;

type MetaobjectFieldNode = {
  key: string;
  value: string | null;
} | null;

type CollectorProfileNode = {
  id: string;
  handle: string;
  updatedAt: string;
  fields: MetaobjectFieldNode[];
  capabilities: {
    publishable: {
      status: "ACTIVE" | "DRAFT";
    } | null;
  } | null;
} | null;

type CollectorCustomerNode = {
  id: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  createdAt: string;
} | null;

type MetaobjectMutationResponse = {
  metaobject: {
    id: string;
    handle: string;
  } | null;
  userErrors: Array<{
    field?: string[];
    message?: string;
    code?: string;
  }>;
};

type DefinitionMutationResponse = {
  metaobjectDefinition: {
    id: string;
  } | null;
  userErrors: Array<{
    field?: string[];
    message?: string;
    code?: string;
  }>;
};

export type UpsertCollectorProfileInput = {
  customerId: string;
  handle: string;
  displayName: string;
  publicHandle: string;
  roleLabel: string;
  bio: string;
  introduction: string;
  quote: string;
  featuredCollectionHandle: string;
  specialties: string;
  preferredRegions: string;
  preferredStyles: string;
  preferredGrapes: string;
  priceBand: string;
  tasteBody: number;
  tasteTannin: number;
  tasteAcidity: number;
  tasteSweetness: number;
  tasteAlcohol: number;
  sortOrder: number;
  status: "ACTIVE" | "DRAFT";
};

export const COLLECTOR_METAOBJECT_TYPE = "collector_profile";
const COLLECTOR_METAOBJECT_URL_HANDLE = "collector";
const DISPLAY_NAME_KEY = "display_name";

const COLLECTOR_FIELD_DEFINITIONS: MetaobjectFieldDefinition[] = [
  {
    key: "customer_id",
    name: "고객 GID",
    description: "컬렉터로 연결된 Shopify 고객의 GID입니다.",
    type: "single_line_text_field",
  },
  {
    key: "customer_email",
    name: "고객 이메일",
    description: "컬렉터로 연결된 Shopify 고객 이메일입니다.",
    type: "single_line_text_field",
  },
  {
    key: "customer_name",
    name: "고객 이름",
    description: "가입 고객의 표시 이름입니다.",
    type: "single_line_text_field",
  },
  {
    key: "display_name",
    name: "컬렉터 이름",
    description: "스토어프론트에 노출할 컬렉터 이름입니다.",
    type: "single_line_text_field",
  },
  {
    key: "public_handle",
    name: "공개 핸들",
    description: "스토어프론트에 노출할 공개 핸들입니다. 예: @yunji.wine",
    type: "single_line_text_field",
  },
  {
    key: "role_label",
    name: "역할 라벨",
    description: "예: 소믈리에, 와인 큐레이터",
    type: "single_line_text_field",
  },
  {
    key: "bio",
    name: "한 줄 소개",
    description: "컬렉터 상세 히어로 영역 소개문입니다.",
    type: "multi_line_text_field",
  },
  {
    key: "introduction",
    name: "큐레이션 소개",
    description: "컬렉터 하단 상세 소개문입니다.",
    type: "multi_line_text_field",
  },
  {
    key: "quote",
    name: "대표 코멘트",
    description: "취향 프로필 카드에 노출할 대표 코멘트입니다.",
    type: "multi_line_text_field",
  },
  {
    key: "featured_collection_handle",
    name: "대표 컬렉션 핸들",
    description: "컬렉터 대표 공구 컬렉션의 handle 값입니다.",
    type: "single_line_text_field",
  },
  {
    key: "specialties",
    name: "주요 태그",
    description: "콤마로 구분한 주요 태그 목록입니다.",
    type: "single_line_text_field",
  },
  {
    key: "preferred_regions",
    name: "선호 산지",
    description: "콤마로 구분한 선호 산지 목록입니다.",
    type: "single_line_text_field",
  },
  {
    key: "preferred_styles",
    name: "선호 스타일",
    description: "콤마로 구분한 선호 스타일 목록입니다.",
    type: "single_line_text_field",
  },
  {
    key: "preferred_grapes",
    name: "선호 품종",
    description: "콤마로 구분한 선호 품종 목록입니다.",
    type: "single_line_text_field",
  },
  {
    key: "price_band",
    name: "선호 가격대",
    description: "예: ₩30,000 - ₩60,000",
    type: "single_line_text_field",
  },
  {
    key: "taste_body",
    name: "바디 점수",
    description: "0부터 10까지 정수 값입니다.",
    type: "number_integer",
  },
  {
    key: "taste_tannin",
    name: "탄닌 점수",
    description: "0부터 10까지 정수 값입니다.",
    type: "number_integer",
  },
  {
    key: "taste_acidity",
    name: "산도 점수",
    description: "0부터 10까지 정수 값입니다.",
    type: "number_integer",
  },
  {
    key: "taste_sweetness",
    name: "당도 점수",
    description: "0부터 10까지 정수 값입니다.",
    type: "number_integer",
  },
  {
    key: "taste_alcohol",
    name: "알코올 점수",
    description: "0부터 10까지 정수 값입니다.",
    type: "number_integer",
  },
  {
    key: "sort_order",
    name: "정렬 순서",
    description: "작을수록 목록 상단에 노출됩니다.",
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
  context: string,
  errors: Array<{ field?: string[]; message?: string; code?: string }>,
) {
  return errors
    .map((error) => {
      const fieldPath = error.field?.length ? `${error.field.join(".")}: ` : "";
      return `${context}: ${fieldPath}${error.message || error.code || "Unknown error"}`;
    })
    .join(", ");
}

function normalizeText(value: string | null | undefined) {
  return String(value || "").trim();
}

function buildCustomerSearchQuery(query?: string) {
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) {
    return null;
  }

  // Shopify customer search matches free-text names well,
  // but email lookups are much more reliable with the explicit prefix.
  if (normalizedQuery.includes("@") && !normalizedQuery.includes(":")) {
    return `email:${normalizedQuery}`;
  }

  return normalizedQuery;
}

function normalizeHandle(value: string | null | undefined) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/['"`]/g, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizePublicHandle(value: string | null | undefined) {
  const trimmedValue = normalizeText(value);

  if (!trimmedValue) {
    return "";
  }

  return trimmedValue.startsWith("@") ? trimmedValue : `@${trimmedValue}`;
}

export function toCustomerGid(customerId: string | null | undefined) {
  const normalizedCustomerId = normalizeText(customerId);

  if (!normalizedCustomerId) {
    return "";
  }

  return normalizedCustomerId.startsWith("gid://shopify/Customer/")
    ? normalizedCustomerId
    : `gid://shopify/Customer/${normalizedCustomerId}`;
}

function toLegacyResourceId(value: string | null | undefined) {
  const normalizedValue = normalizeText(value);
  const match = normalizedValue.match(/\/(\d+)(?:\?.*)?$/);

  if (match?.[1]) {
    return match[1];
  }

  return normalizedValue.replace(/\D+/g, "");
}

function resolveCollectorHandle(
  baseHandle: string,
  customerId: string,
  profiles: CollectorProfileRecord[],
) {
  const normalizedCustomerId = toCustomerGid(customerId);
  const legacyCustomerId = toLegacyResourceId(customerId);
  const handleSuffix = legacyCustomerId ? legacyCustomerId.slice(-6) : "collector";
  const normalizedBaseHandle =
    normalizeHandle(baseHandle) || `collector-${handleSuffix}`;
  const maxCollisionAttempts = Math.max(2, profiles.length + 2);

  for (let collisionIndex = 0; collisionIndex < maxCollisionAttempts; collisionIndex += 1) {
    const candidateHandle =
      collisionIndex === 0
        ? normalizedBaseHandle
        : collisionIndex === 1
          ? `${normalizedBaseHandle}-${handleSuffix}`
          : `${normalizedBaseHandle}-${handleSuffix}-${collisionIndex}`;
    const matchedProfile = profiles.find((profile) => profile.handle === candidateHandle);

    if (!matchedProfile || matchedProfile.fields.customerId === normalizedCustomerId) {
      return candidateHandle;
    }
  }

  throw new Error("컬렉터 프로필 handle 값을 고유하게 생성하지 못했습니다.");
}

function toInteger(value: string | null | undefined, fallback = 0) {
  const parsedValue = Number(normalizeText(value));

  if (!Number.isFinite(parsedValue)) {
    return fallback;
  }

  return Math.max(0, Math.trunc(parsedValue));
}

function clampTasteValue(value: number) {
  return Math.max(0, Math.min(10, Math.trunc(value)));
}

function toStorefrontPath(handle: string) {
  return `/pages/${COLLECTOR_METAOBJECT_URL_HANDLE}/${handle}`;
}

function mapCustomer(node: CollectorCustomerNode): CustomerSummary | null {
  if (!node?.id) {
    return null;
  }

  return {
    id: node.id,
    displayName: normalizeText(node.displayName),
    firstName: normalizeText(node.firstName),
    lastName: normalizeText(node.lastName),
    email: normalizeText(node.email),
    createdAt: node.createdAt,
  };
}

function toFieldMap(fields: MetaobjectFieldNode[]) {
  return fields.reduce<Record<string, string>>((result, field) => {
    if (!field?.key) {
      return result;
    }

    result[field.key] = normalizeText(field.value);
    return result;
  }, {});
}

function mapCollectorProfile(node: CollectorProfileNode): CollectorProfileRecord | null {
  if (!node?.id || !node.handle) {
    return null;
  }

  const fieldMap = toFieldMap(node.fields || []);

  return {
    id: node.id,
    handle: node.handle,
    updatedAt: node.updatedAt,
    status: node.capabilities?.publishable?.status || "DRAFT",
    storefrontPath: toStorefrontPath(node.handle),
    fields: {
      customerId: fieldMap.customer_id || "",
      customerEmail: fieldMap.customer_email || "",
      customerName: fieldMap.customer_name || "",
      displayName: fieldMap.display_name || fieldMap.customer_name || node.handle,
      publicHandle: fieldMap.public_handle || "",
      roleLabel: fieldMap.role_label || "",
      bio: fieldMap.bio || "",
      introduction: fieldMap.introduction || "",
      quote: fieldMap.quote || "",
      featuredCollectionHandle: fieldMap.featured_collection_handle || "",
      specialties: fieldMap.specialties || "",
      preferredRegions: fieldMap.preferred_regions || "",
      preferredStyles: fieldMap.preferred_styles || "",
      preferredGrapes: fieldMap.preferred_grapes || "",
      priceBand: fieldMap.price_band || "",
      tasteBody: clampTasteValue(toInteger(fieldMap.taste_body)),
      tasteTannin: clampTasteValue(toInteger(fieldMap.taste_tannin)),
      tasteAcidity: clampTasteValue(toInteger(fieldMap.taste_acidity)),
      tasteSweetness: clampTasteValue(toInteger(fieldMap.taste_sweetness)),
      tasteAlcohol: clampTasteValue(toInteger(fieldMap.taste_alcohol)),
      sortOrder: toInteger(fieldMap.sort_order, 999),
    },
  };
}

async function getCollectorDefinition(admin: AdminGraphqlClient) {
  const data = await runAdminQuery<{
    metaobjectDefinitionByType: CollectorDefinitionNode;
  }>(
    admin,
    `#graphql
      query CollectorDefinitionByType($type: String!) {
        metaobjectDefinitionByType(type: $type) {
          id
          displayNameKey
          access {
            admin
            storefront
          }
          capabilities {
            onlineStore {
              enabled
            }
            publishable {
              enabled
            }
            renderable {
              enabled
            }
          }
          fieldDefinitions {
            key
            name
            type {
              name
            }
          }
        }
      }
    `,
    { type: COLLECTOR_METAOBJECT_TYPE },
  );

  return data.metaobjectDefinitionByType;
}

async function createCollectorDefinition(admin: AdminGraphqlClient) {
  const data = await runAdminQuery<{
    metaobjectDefinitionCreate: DefinitionMutationResponse;
  }>(
    admin,
    `#graphql
      mutation CreateCollectorDefinition($definition: MetaobjectDefinitionCreateInput!) {
        metaobjectDefinitionCreate(definition: $definition) {
          metaobjectDefinition {
            id
          }
          userErrors {
            field
            message
            code
          }
        }
      }
    `,
    {
      definition: {
        type: COLLECTOR_METAOBJECT_TYPE,
        name: "Collector Profile",
        description: "TownWine 컬렉터 공개 프로필",
        displayNameKey: DISPLAY_NAME_KEY,
        access: {
          storefront: "PUBLIC_READ",
        },
        capabilities: {
          publishable: {
            enabled: true,
          },
          renderable: {
            enabled: true,
            data: {
              metaTitleKey: DISPLAY_NAME_KEY,
              metaDescriptionKey: "bio",
            },
          },
          onlineStore: {
            enabled: true,
            data: {
              urlHandle: COLLECTOR_METAOBJECT_URL_HANDLE,
            },
          },
        },
        fieldDefinitions: COLLECTOR_FIELD_DEFINITIONS,
      },
    },
  );

  const mutationResult = data.metaobjectDefinitionCreate;
  if (mutationResult.userErrors.length) {
    throw new Error(
      createUserErrorMessage("collector_profile definition", mutationResult.userErrors),
    );
  }

  return mutationResult.metaobjectDefinition;
}

async function updateCollectorDefinition(
  admin: AdminGraphqlClient,
  definition: NonNullable<CollectorDefinitionNode>,
) {
  const existingKeys = new Set(definition.fieldDefinitions.map((fieldDefinition) => fieldDefinition.key));
  const missingFieldDefinitions = COLLECTOR_FIELD_DEFINITIONS.filter(
    (fieldDefinition) => !existingKeys.has(fieldDefinition.key),
  ).map((fieldDefinition) => ({
    create: fieldDefinition,
  }));

  const shouldUpdate =
    definition.displayNameKey !== DISPLAY_NAME_KEY ||
    definition.access.storefront !== "PUBLIC_READ" ||
    !definition.capabilities.publishable.enabled ||
    !definition.capabilities.renderable.enabled ||
    !definition.capabilities.onlineStore.enabled ||
    missingFieldDefinitions.length > 0;

  if (!shouldUpdate) {
    return definition;
  }

  const data = await runAdminQuery<{
    metaobjectDefinitionUpdate: DefinitionMutationResponse;
  }>(
    admin,
    `#graphql
      mutation UpdateCollectorDefinition($id: ID!, $definition: MetaobjectDefinitionUpdateInput!) {
        metaobjectDefinitionUpdate(id: $id, definition: $definition) {
          metaobjectDefinition {
            id
          }
          userErrors {
            field
            message
            code
          }
        }
      }
    `,
    {
      id: definition.id,
      definition: {
        displayNameKey: DISPLAY_NAME_KEY,
        access: {
          storefront: "PUBLIC_READ",
        },
        capabilities: {
          publishable: {
            enabled: true,
          },
          renderable: {
            enabled: true,
            data: {
              metaTitleKey: DISPLAY_NAME_KEY,
              metaDescriptionKey: "bio",
            },
          },
          onlineStore: {
            enabled: true,
            data: {
              urlHandle: COLLECTOR_METAOBJECT_URL_HANDLE,
            },
          },
        },
        fieldDefinitions: missingFieldDefinitions,
      },
    },
  );

  const mutationResult = data.metaobjectDefinitionUpdate;
  if (mutationResult.userErrors.length) {
    throw new Error(
      createUserErrorMessage("collector_profile definition", mutationResult.userErrors),
    );
  }

  return mutationResult.metaobjectDefinition;
}

export async function ensureCollectorMetaobjectDefinition(admin: AdminGraphqlClient) {
  const existingDefinition = await getCollectorDefinition(admin);

  if (!existingDefinition) {
    await createCollectorDefinition(admin);
    return {
      created: true,
      updated: false,
    };
  }

  await updateCollectorDefinition(admin, existingDefinition);

  return {
    created: false,
    updated: true,
  };
}

export async function listCollectorProfiles(admin: AdminGraphqlClient) {
  const data = await runAdminQuery<{
    metaobjects: {
      nodes: CollectorProfileNode[];
    };
  }>(
    admin,
    `#graphql
      query CollectorProfiles($type: String!) {
        metaobjects(type: $type, first: 100) {
          nodes {
            id
            handle
            updatedAt
            capabilities {
              publishable {
                status
              }
            }
            fields {
              key
              value
            }
          }
        }
      }
    `,
    {
      type: COLLECTOR_METAOBJECT_TYPE,
    },
  );

  return data.metaobjects.nodes
    .map((node) => mapCollectorProfile(node))
    .filter(Boolean)
    .sort((left, right) => {
      const sortDelta = left!.fields.sortOrder - right!.fields.sortOrder;

      if (sortDelta !== 0) {
        return sortDelta;
      }

      return left!.fields.displayName.localeCompare(right!.fields.displayName, "ko");
    }) as CollectorProfileRecord[];
}

export async function findCollectorProfileByCustomerId(
  admin: AdminGraphqlClient,
  customerId: string,
) {
  const normalizedCustomerId = toCustomerGid(customerId);

  if (!normalizedCustomerId) {
    return null;
  }

  const profiles = await listCollectorProfiles(admin);

  return (
    profiles.find((profile) => profile.fields.customerId === normalizedCustomerId) || null
  );
}

export async function listCustomers(
  admin: AdminGraphqlClient,
  query?: string,
) {
  const normalizedQuery = buildCustomerSearchQuery(query);

  const data = await runAdminQuery<{
    customers: {
      nodes: CollectorCustomerNode[];
    };
  }>(
    admin,
    `#graphql
      query CollectorCustomers($query: String) {
        customers(first: 50, query: $query, reverse: true) {
          nodes {
            id
            displayName
            firstName
            lastName
            email
            createdAt
          }
        }
      }
    `,
    {
      query: normalizedQuery,
    },
  );

  return data.customers.nodes
    .map((node) => mapCustomer(node))
    .filter(Boolean) as CustomerSummary[];
}

export async function getCustomerById(
  admin: AdminGraphqlClient,
  id: string,
) {
  const normalizedId = normalizeText(id);

  if (!normalizedId) {
    return null;
  }

  const data = await runAdminQuery<{
    customer: CollectorCustomerNode;
  }>(
    admin,
    `#graphql
      query CollectorCustomer($id: ID!) {
        customer(id: $id) {
          id
          displayName
          firstName
          lastName
          email
          createdAt
        }
      }
    `,
    { id: normalizedId },
  );

  return mapCustomer(data.customer);
}

export async function listCollections(admin: AdminGraphqlClient) {
  const data = await runAdminQuery<{
    collections: {
      nodes: Array<{
        id: string;
        title: string | null;
        handle: string | null;
        updatedAt: string;
      } | null>;
    };
  }>(
    admin,
    `#graphql
      query CollectorCollections {
        collections(first: 100, reverse: true) {
          nodes {
            id
            title
            handle
            updatedAt
          }
        }
      }
    `,
  );

  return data.collections.nodes
    .map((node) => {
      if (!node?.id || !node.handle) {
        return null;
      }

      return {
        id: node.id,
        title: normalizeText(node.title),
        handle: normalizeText(node.handle),
        updatedAt: node.updatedAt,
      };
    })
    .filter(Boolean) as CollectionSummary[];
}

function buildCollectorFieldInputs(
  customer: CustomerSummary,
  input: UpsertCollectorProfileInput,
) {
  return [
    {
      key: "customer_id",
      value: customer.id,
    },
    {
      key: "customer_email",
      value: customer.email,
    },
    {
      key: "customer_name",
      value: customer.displayName,
    },
    {
      key: "display_name",
      value: input.displayName,
    },
    {
      key: "public_handle",
      value: input.publicHandle,
    },
    {
      key: "role_label",
      value: input.roleLabel,
    },
    {
      key: "bio",
      value: input.bio,
    },
    {
      key: "introduction",
      value: input.introduction,
    },
    {
      key: "quote",
      value: input.quote,
    },
    {
      key: "featured_collection_handle",
      value: input.featuredCollectionHandle,
    },
    {
      key: "specialties",
      value: input.specialties,
    },
    {
      key: "preferred_regions",
      value: input.preferredRegions,
    },
    {
      key: "preferred_styles",
      value: input.preferredStyles,
    },
    {
      key: "preferred_grapes",
      value: input.preferredGrapes,
    },
    {
      key: "price_band",
      value: input.priceBand,
    },
    {
      key: "taste_body",
      value: String(clampTasteValue(input.tasteBody)),
    },
    {
      key: "taste_tannin",
      value: String(clampTasteValue(input.tasteTannin)),
    },
    {
      key: "taste_acidity",
      value: String(clampTasteValue(input.tasteAcidity)),
    },
    {
      key: "taste_sweetness",
      value: String(clampTasteValue(input.tasteSweetness)),
    },
    {
      key: "taste_alcohol",
      value: String(clampTasteValue(input.tasteAlcohol)),
    },
    {
      key: "sort_order",
      value: String(Math.max(0, Math.trunc(input.sortOrder))),
    },
  ];
}

export function normalizeCollectorFormInput(
  input: Record<string, FormDataEntryValue | null>,
): UpsertCollectorProfileInput {
  const rawDisplayName = normalizeText(input.display_name?.toString());
  const rawHandle = normalizeHandle(input.handle?.toString());
  const rawCustomerId = normalizeText(input.customer_id?.toString());
  const rawStatus = normalizeText(input.status?.toString()).toUpperCase();

  return {
    customerId: rawCustomerId,
    handle: rawHandle,
    displayName: rawDisplayName,
    publicHandle: normalizeText(input.public_handle?.toString()),
    roleLabel: normalizeText(input.role_label?.toString()),
    bio: normalizeText(input.bio?.toString()),
    introduction: normalizeText(input.introduction?.toString()),
    quote: normalizeText(input.quote?.toString()),
    featuredCollectionHandle: normalizeHandle(
      input.featured_collection_handle?.toString(),
    ),
    specialties: normalizeText(input.specialties?.toString()),
    preferredRegions: normalizeText(input.preferred_regions?.toString()),
    preferredStyles: normalizeText(input.preferred_styles?.toString()),
    preferredGrapes: normalizeText(input.preferred_grapes?.toString()),
    priceBand: normalizeText(input.price_band?.toString()),
    tasteBody: clampTasteValue(toInteger(input.taste_body?.toString())),
    tasteTannin: clampTasteValue(toInteger(input.taste_tannin?.toString())),
    tasteAcidity: clampTasteValue(toInteger(input.taste_acidity?.toString())),
    tasteSweetness: clampTasteValue(toInteger(input.taste_sweetness?.toString())),
    tasteAlcohol: clampTasteValue(toInteger(input.taste_alcohol?.toString())),
    sortOrder: toInteger(input.sort_order?.toString(), 999),
    status: rawStatus === "ACTIVE" ? "ACTIVE" : "DRAFT",
  };
}

export async function upsertCollectorProfile(
  admin: AdminGraphqlClient,
  input: UpsertCollectorProfileInput,
) {
  await ensureCollectorMetaobjectDefinition(admin);

  const customerId = toCustomerGid(input.customerId);
  const customer = await getCustomerById(admin, customerId);
  if (!customer) {
    throw new Error("선택한 고객을 Shopify 고객 목록에서 찾지 못했습니다.");
  }

  const existingProfiles = await listCollectorProfiles(admin);
  const existingProfile =
    existingProfiles.find((profile) => profile.fields.customerId === customer.id) || null;
  const requestedHandle = normalizeHandle(
    input.handle || existingProfile?.handle || input.displayName || customer.displayName || customer.email,
  );
  const collectorHandle = resolveCollectorHandle(
    requestedHandle,
    customer.id,
    existingProfiles,
  );
  if (!collectorHandle) {
    throw new Error("컬렉터 프로필 handle 값을 생성할 수 없습니다.");
  }

  const displayName = input.displayName || customer.displayName || customer.email || collectorHandle;
  const publicHandle = normalizePublicHandle(input.publicHandle);

  const data = await runAdminQuery<{
    metaobjectUpsert: MetaobjectMutationResponse;
  }>(
    admin,
    `#graphql
      mutation UpsertCollectorProfile(
        $handle: MetaobjectHandleInput!
        $metaobject: MetaobjectUpsertInput!
      ) {
        metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
          metaobject {
            id
            handle
          }
          userErrors {
            field
            message
            code
          }
        }
      }
    `,
    {
      handle: {
        type: COLLECTOR_METAOBJECT_TYPE,
        handle: collectorHandle,
      },
      metaobject: {
        fields: buildCollectorFieldInputs(customer, {
          ...input,
          handle: collectorHandle,
          displayName,
          publicHandle,
        }),
        capabilities: {
          publishable: {
            status: input.status,
          },
        },
      },
    },
  );

  const mutationResult = data.metaobjectUpsert;
  if (mutationResult.userErrors.length) {
    throw new Error(
      createUserErrorMessage("collector_profile upsert", mutationResult.userErrors),
    );
  }

  return {
    handle: mutationResult.metaobject?.handle || collectorHandle,
    displayName,
    storefrontPath: toStorefrontPath(mutationResult.metaobject?.handle || collectorHandle),
  };
}
