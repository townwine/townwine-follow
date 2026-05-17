import { processDealNotification } from "./deal-notification.server";
import { syncProductCollectorIdentity } from "./product-collector-sync.server";

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type ProductCollectorAdminQueryResponse = {
  product: {
    id: string;
    title: string;
    status: string;
    collectorTag: { value: string | null } | null;
    influencerHandle: { value: string | null } | null;
    hostHandle: { value: string | null } | null;
    hostName: { value: string | null } | null;
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

function normalizeText(value: string | null | undefined) {
  return String(value || "").trim();
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

export async function getProductCollectorAdminState(
  admin: AdminGraphqlClient,
  productId: string,
) {
  const data = await runAdminQuery<ProductCollectorAdminQueryResponse>(
    admin,
    `#graphql
      query ProductCollectorAdminState($id: ID!) {
        product(id: $id) {
          id
          title
          status
          collectorTag: metafield(namespace: "custom", key: "collector_tag") {
            value
          }
          influencerHandle: metafield(namespace: "custom", key: "influencer_handle") {
            value
          }
          hostHandle: metafield(namespace: "custom", key: "host_handle") {
            value
          }
          hostName: metafield(namespace: "custom", key: "host_name") {
            value
          }
        }
      }
    `,
    { id: productId },
  );

  const product = data.product;

  if (!product) {
    return null;
  }

  return {
    productId: product.id,
    productTitle: product.title,
    productStatus: product.status,
    collectorTag: normalizeText(product.collectorTag?.value),
    influencerHandle: normalizeText(product.influencerHandle?.value),
    hostHandle: normalizeText(product.hostHandle?.value),
    hostName: normalizeText(product.hostName?.value),
  };
}

async function setProductCollectorMetafields(
  admin: AdminGraphqlClient,
  productId: string,
  values: {
    collectorTag: string;
    influencerHandle: string;
    hostHandle: string;
    hostName: string;
  },
) {
  const data = await runAdminQuery<MetafieldsSetResponse>(
    admin,
    `#graphql
      mutation SetProductCollectorAdminMetafields($metafields: [MetafieldsSetInput!]!) {
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
          namespace: "custom",
          key: "collector_tag",
          type: "single_line_text_field",
          value: values.collectorTag,
        },
        {
          ownerId: productId,
          namespace: "custom",
          key: "influencer_handle",
          type: "single_line_text_field",
          value: values.influencerHandle,
        },
        {
          ownerId: productId,
          namespace: "custom",
          key: "host_handle",
          type: "single_line_text_field",
          value: values.hostHandle,
        },
        {
          ownerId: productId,
          namespace: "custom",
          key: "host_name",
          type: "single_line_text_field",
          value: values.hostName,
        },
      ],
    },
  );

  if (data.metafieldsSet.userErrors.length) {
    throw new Error(createUserErrorMessage(data.metafieldsSet.userErrors));
  }
}

export async function saveProductCollectorAdminState(params: {
  admin: AdminGraphqlClient;
  shop: string;
  productId: string;
  collectorTag: string;
}) {
  const nextCollectorTag = normalizeText(params.collectorTag);

  // Clear derived fields first so outdated collector identities don't linger.
  await setProductCollectorMetafields(params.admin, params.productId, {
    collectorTag: nextCollectorTag,
    influencerHandle: "",
    hostHandle: "",
    hostName: "",
  });

  const syncResult = nextCollectorTag
    ? await syncProductCollectorIdentity(params.admin, params.productId)
    : { ok: true, skipped: "CLEARED" as const };

  const state = await getProductCollectorAdminState(params.admin, params.productId);

  if (!state) {
    return {
      ok: true,
      sync: syncResult,
      notification: { ok: true, skipped: "PRODUCT_NOT_FOUND" as const },
      state: null,
    };
  }

  const notification =
    state.influencerHandle && state.hostName
      ? await processDealNotification({
          admin: params.admin,
          shop: params.shop,
          productId: params.productId,
          resolvedInfluencerHandle: state.influencerHandle,
          resolvedInfluencerName: state.hostName,
        })
      : { ok: true, skipped: "NO_INFLUENCER_HANDLE" as const };

  return {
    ok: true,
    sync: syncResult,
    notification,
    state,
  };
}
