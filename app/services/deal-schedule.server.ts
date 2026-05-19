type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type ProductScheduleQueryResponse = {
  product: {
    id: string;
    title: string;
    openMonth: { value: string | null } | null;
    openDay: { value: string | null } | null;
    openHour: { value: string | null } | null;
    openMinute: { value: string | null } | null;
    openAtKst: { value: string | null } | null;
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

type MetafieldsDeleteResponse = {
  metafieldsDelete: {
    userErrors: Array<{
      field?: string[];
      message?: string;
    }>;
  };
};

const METAFIELD_NAMESPACE = "custom";
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const SCHEDULE_KEYS = {
  openAtKst: "deal_open_at_kst",
} as const;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function parseInteger(value: string | null | undefined) {
  if (value == null || value === "") return null;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function getCurrentKstDateParts() {
  const nowInKst = new Date(Date.now() + KST_OFFSET_MS);

  return {
    year: nowInKst.getUTCFullYear(),
    month: nowInKst.getUTCMonth() + 1,
    day: nowInKst.getUTCDate(),
  };
}

function createUtcDateFromKstParts(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
) {
  const utcDate = new Date(Date.UTC(year, month - 1, day, hour - 9, minute, 0, 0));
  const kstDate = new Date(utcDate.getTime() + KST_OFFSET_MS);

  if (
    kstDate.getUTCFullYear() !== year ||
    kstDate.getUTCMonth() + 1 !== month ||
    kstDate.getUTCDate() !== day ||
    kstDate.getUTCHours() !== hour ||
    kstDate.getUTCMinutes() !== minute
  ) {
    return null;
  }

  return utcDate;
}

function toKstIsoString(date: Date) {
  const kstDate = new Date(date.getTime() + KST_OFFSET_MS);

  return [
    `${kstDate.getUTCFullYear()}-${pad(kstDate.getUTCMonth() + 1)}-${pad(kstDate.getUTCDate())}`,
    "T",
    `${pad(kstDate.getUTCHours())}:${pad(kstDate.getUTCMinutes())}:00+09:00`,
  ].join("");
}

function resolveOpenAtKst(
  month: number,
  day: number,
  hour: number,
  minute: number,
) {
  const currentKstDate = getCurrentKstDateParts();
  let resolvedYear = currentKstDate.year;

  if (
    currentKstDate.month > month ||
    (currentKstDate.month === month && currentKstDate.day > day)
  ) {
    resolvedYear = currentKstDate.year + 1;
  }

  const scheduledAt = createUtcDateFromKstParts(
    resolvedYear,
    month,
    day,
    hour,
    minute,
  );

  return scheduledAt ? toKstIsoString(scheduledAt) : null;
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

function createUserErrorMessage(
  errors: Array<{
    field?: string[];
    message?: string;
  }>,
) {
  return errors
    .map((error) => {
      const fieldPath = error.field?.length ? `${error.field.join(".")}: ` : "";
      return `${fieldPath}${error.message || "Unknown error"}`;
    })
    .join(", ");
}

async function getProductSchedule(
  admin: AdminGraphqlClient,
  productId: string,
) {
  const data = await runAdminQuery<ProductScheduleQueryResponse>(
    admin,
    `#graphql
      query ProductDealSchedule($id: ID!) {
        product(id: $id) {
          id
          title
          openMonth: metafield(namespace: "custom", key: "deal_open_month") {
            value
          }
          openDay: metafield(namespace: "custom", key: "deal_open_day") {
            value
          }
          openHour: metafield(namespace: "custom", key: "deal_open_hour") {
            value
          }
          openMinute: metafield(namespace: "custom", key: "deal_open_minute") {
            value
          }
          openAtKst: metafield(namespace: "custom", key: "deal_open_at_kst") {
            value
          }
        }
      }
    `,
    { id: productId },
  );

  return data.product;
}

async function setComputedOpenAtKst(
  admin: AdminGraphqlClient,
  productId: string,
  value: string,
) {
  const data = await runAdminQuery<MetafieldsSetResponse>(
    admin,
    `#graphql
      mutation SetComputedDealOpenAt($metafields: [MetafieldsSetInput!]!) {
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
          ownerId: productId,
          namespace: METAFIELD_NAMESPACE,
          key: SCHEDULE_KEYS.openAtKst,
          type: "single_line_text_field",
          value,
        },
      ],
    },
  );

  if (data.metafieldsSet.userErrors.length) {
    throw new Error(createUserErrorMessage(data.metafieldsSet.userErrors));
  }
}

async function clearComputedOpenAtKst(
  admin: AdminGraphqlClient,
  productId: string,
) {
  const data = await runAdminQuery<MetafieldsDeleteResponse>(
    admin,
    `#graphql
      mutation DeleteComputedDealOpenAt($metafields: [MetafieldIdentifierInput!]!) {
        metafieldsDelete(metafields: $metafields) {
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
          ownerId: productId,
          namespace: METAFIELD_NAMESPACE,
          key: SCHEDULE_KEYS.openAtKst,
        },
      ],
    },
  );

  if (data.metafieldsDelete.userErrors.length) {
    throw new Error(createUserErrorMessage(data.metafieldsDelete.userErrors));
  }
}

export async function syncProductDealSchedule(
  admin: AdminGraphqlClient,
  productId: string,
) {
  const product = await getProductSchedule(admin, productId);

  if (!product) {
    return { ok: true, skipped: "PRODUCT_NOT_FOUND" as const };
  }

  const month = parseInteger(product.openMonth?.value);
  const day = parseInteger(product.openDay?.value);
  const hour = parseInteger(product.openHour?.value);
  const minute = parseInteger(product.openMinute?.value);
  const currentOpenAtKst = product.openAtKst?.value?.trim() || "";

  const hasCompleteSchedule =
    month != null && day != null && hour != null && minute != null;

  if (!hasCompleteSchedule) {
    if (currentOpenAtKst) {
      await clearComputedOpenAtKst(admin, product.id);
      return { ok: true, status: "cleared" as const };
    }

    return { ok: true, skipped: "SCHEDULE_INCOMPLETE" as const };
  }

  const scheduleMonth = month;
  const scheduleDay = day;
  const scheduleHour = hour;
  const scheduleMinute = minute;

  if (
    scheduleMonth < 1 ||
    scheduleMonth > 12 ||
    scheduleDay < 1 ||
    scheduleDay > 31 ||
    scheduleHour < 0 ||
    scheduleHour > 23 ||
    scheduleMinute < 0 ||
    scheduleMinute > 59
  ) {
    if (currentOpenAtKst) {
      await clearComputedOpenAtKst(admin, product.id);
      return { ok: true, status: "cleared" as const, skipped: "INVALID_SCHEDULE" as const };
    }

    return { ok: true, skipped: "INVALID_SCHEDULE" as const };
  }

  const computedOpenAtKst = resolveOpenAtKst(
    scheduleMonth,
    scheduleDay,
    scheduleHour,
    scheduleMinute,
  );
  if (!computedOpenAtKst) {
    if (currentOpenAtKst) {
      await clearComputedOpenAtKst(admin, product.id);
      return { ok: true, status: "cleared" as const, skipped: "INVALID_SCHEDULE" as const };
    }

    return { ok: true, skipped: "INVALID_SCHEDULE" as const };
  }

  if (computedOpenAtKst === currentOpenAtKst) {
    return {
      ok: true,
      status: "unchanged" as const,
      openAtKst: computedOpenAtKst,
    };
  }

  await setComputedOpenAtKst(admin, product.id, computedOpenAtKst);

  return {
    ok: true,
    status: "updated" as const,
    openAtKst: computedOpenAtKst,
  };
}
