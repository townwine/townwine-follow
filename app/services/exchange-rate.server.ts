type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type ShopExchangeRateQueryResponse = {
  shop: {
    id: string;
    rate: { value: string | null } | null;
    updatedAt: { value: string | null } | null;
    source: { value: string | null } | null;
    referenceDate: { value: string | null } | null;
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

type StoredExchangeRateState = {
  shopId: string;
  rate: number | null;
  updatedAt: string | null;
  source: string | null;
  referenceDate: string | null;
};

export type ShopExchangeRateSnapshot = {
  rate: number;
  updatedAt: string | null;
  source: string;
  referenceDate: string | null;
  refreshIntervalDays: number;
  refreshed: boolean;
  usedFallback: boolean;
};

const DEFAULT_HKD_TO_KRW_RATE = 180;
const REFRESH_INTERVAL_DAYS = 7;
const REFRESH_INTERVAL_MS = REFRESH_INTERVAL_DAYS * 24 * 60 * 60 * 1000;
const ECB_DAILY_RATES_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
const METAFIELD_NAMESPACE = "townwine";
const RATE_METAFIELD_KEY = "hkd_to_krw_rate";
const UPDATED_AT_METAFIELD_KEY = "hkd_to_krw_rate_updated_at";
const SOURCE_METAFIELD_KEY = "hkd_to_krw_rate_source";
const REFERENCE_DATE_METAFIELD_KEY = "hkd_to_krw_rate_reference_date";

function normalizeText(value: string | null | undefined) {
  return String(value || "").trim();
}

function toPositiveNumber(value: string | number | null | undefined) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null;
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

async function getStoredShopExchangeRate(
  admin: AdminGraphqlClient,
): Promise<StoredExchangeRateState | null> {
  const data = await runAdminQuery<ShopExchangeRateQueryResponse>(
    admin,
    `#graphql
      query ShopExchangeRateState {
        shop {
          id
          rate: metafield(namespace: "townwine", key: "hkd_to_krw_rate") {
            value
          }
          updatedAt: metafield(namespace: "townwine", key: "hkd_to_krw_rate_updated_at") {
            value
          }
          source: metafield(namespace: "townwine", key: "hkd_to_krw_rate_source") {
            value
          }
          referenceDate: metafield(namespace: "townwine", key: "hkd_to_krw_rate_reference_date") {
            value
          }
        }
      }
    `,
  );

  if (!data.shop) {
    return null;
  }

  return {
    shopId: data.shop.id,
    rate: toPositiveNumber(data.shop.rate?.value),
    updatedAt: normalizeText(data.shop.updatedAt?.value) || null,
    source: normalizeText(data.shop.source?.value) || null,
    referenceDate: normalizeText(data.shop.referenceDate?.value) || null,
  };
}

function isStoredRateFresh(storedRate: StoredExchangeRateState | null) {
  if (!storedRate?.rate || !storedRate.updatedAt) {
    return false;
  }

  const updatedTimestamp = new Date(storedRate.updatedAt).getTime();

  if (!Number.isFinite(updatedTimestamp)) {
    return false;
  }

  return Date.now() - updatedTimestamp < REFRESH_INTERVAL_MS;
}

function extractCubeRate(xml: string, currency: string) {
  const pattern = new RegExp(`<Cube currency='${currency}' rate='([^']+)'\\s*/>`, "i");
  const match = xml.match(pattern);
  return match?.[1] ? Number(match[1]) : null;
}

async function fetchEcbHkdToKrwRate() {
  const response = await fetch(ECB_DAILY_RATES_URL, {
    headers: {
      Accept: "application/xml,text/xml;q=0.9,*/*;q=0.8",
      "User-Agent": "townwine-follow/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`ECB exchange rate request failed with status ${response.status}`);
  }

  const xml = await response.text();
  const referenceDateMatch = xml.match(/<Cube time='([^']+)'/i);
  const hkdPerEur = extractCubeRate(xml, "HKD");
  const krwPerEur = extractCubeRate(xml, "KRW");

  if (!hkdPerEur || !krwPerEur) {
    throw new Error("ECB exchange rate response missing HKD or KRW rate");
  }

  return {
    rate: krwPerEur / hkdPerEur,
    referenceDate: referenceDateMatch?.[1] || null,
    source: "ECB",
    updatedAt: new Date().toISOString(),
  };
}

async function saveShopExchangeRate(
  admin: AdminGraphqlClient,
  shopId: string,
  payload: {
    rate: number;
    updatedAt: string;
    source: string;
    referenceDate: string | null;
  },
) {
  const data = await runAdminQuery<MetafieldsSetResponse>(
    admin,
    `#graphql
      mutation SaveShopExchangeRate($metafields: [MetafieldsSetInput!]!) {
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
          ownerId: shopId,
          namespace: METAFIELD_NAMESPACE,
          key: RATE_METAFIELD_KEY,
          type: "number_decimal",
          value: payload.rate.toFixed(6),
        },
        {
          ownerId: shopId,
          namespace: METAFIELD_NAMESPACE,
          key: UPDATED_AT_METAFIELD_KEY,
          type: "date_time",
          value: payload.updatedAt,
        },
        {
          ownerId: shopId,
          namespace: METAFIELD_NAMESPACE,
          key: SOURCE_METAFIELD_KEY,
          type: "single_line_text_field",
          value: payload.source,
        },
        {
          ownerId: shopId,
          namespace: METAFIELD_NAMESPACE,
          key: REFERENCE_DATE_METAFIELD_KEY,
          type: "single_line_text_field",
          value: payload.referenceDate || "",
        },
      ],
    },
  );

  if (data.metafieldsSet.userErrors.length) {
    throw new Error(createUserErrorMessage(data.metafieldsSet.userErrors));
  }
}

function createSnapshot(params: {
  rate?: number | null;
  updatedAt?: string | null;
  source?: string | null;
  referenceDate?: string | null;
  refreshed?: boolean;
  usedFallback?: boolean;
}): ShopExchangeRateSnapshot {
  return {
    rate: params.rate && params.rate > 0 ? params.rate : DEFAULT_HKD_TO_KRW_RATE,
    updatedAt: params.updatedAt || null,
    source: params.source || "fallback",
    referenceDate: params.referenceDate || null,
    refreshIntervalDays: REFRESH_INTERVAL_DAYS,
    refreshed: Boolean(params.refreshed),
    usedFallback: Boolean(params.usedFallback),
  };
}

export async function getShopHkdToKrwRate(
  admin: AdminGraphqlClient | null,
): Promise<ShopExchangeRateSnapshot> {
  if (!admin) {
    try {
      const freshRate = await fetchEcbHkdToKrwRate();
      return createSnapshot({
        rate: freshRate.rate,
        updatedAt: freshRate.updatedAt,
        source: freshRate.source,
        referenceDate: freshRate.referenceDate,
        refreshed: true,
      });
    } catch (error) {
      console.error("[exchange-rate] failed to fetch ECB rate without admin", {
        message: error instanceof Error ? error.message : String(error),
      });

      return createSnapshot({
        source: "fallback",
        usedFallback: true,
      });
    }
  }

  const storedRate = await getStoredShopExchangeRate(admin);

  if (isStoredRateFresh(storedRate)) {
    return createSnapshot({
      rate: storedRate?.rate,
      updatedAt: storedRate?.updatedAt,
      source: storedRate?.source || "shop_metafield",
      referenceDate: storedRate?.referenceDate,
    });
  }

  try {
    const freshRate = await fetchEcbHkdToKrwRate();

    if (storedRate?.shopId) {
      await saveShopExchangeRate(admin, storedRate.shopId, freshRate);
    }

    return createSnapshot({
      rate: freshRate.rate,
      updatedAt: freshRate.updatedAt,
      source: freshRate.source,
      referenceDate: freshRate.referenceDate,
      refreshed: true,
    });
  } catch (error) {
    console.error("[exchange-rate] failed to refresh shop exchange rate", {
      message: error instanceof Error ? error.message : String(error),
      shopId: storedRate?.shopId || null,
    });

    if (storedRate?.rate) {
      return createSnapshot({
        rate: storedRate.rate,
        updatedAt: storedRate.updatedAt,
        source: storedRate.source || "shop_metafield",
        referenceDate: storedRate.referenceDate,
      });
    }

    return createSnapshot({
      source: "fallback",
      usedFallback: true,
    });
  }
}
