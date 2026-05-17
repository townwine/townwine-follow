import {
  listCollectorProfiles,
  type CollectorProfileRecord,
} from "./collector-profiles.server";

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type ProductCollectorSyncQueryResponse = {
  product: {
    id: string;
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

type ProductCollectorIdentity = {
  collectorTag: string;
  influencerHandle: string;
  hostHandle: string;
  hostName: string;
};

function normalizeText(value: string | null | undefined) {
  return String(value || "").trim();
}

function normalizeAlias(value: string | null | undefined) {
  let normalizedValue = normalizeText(value);

  if (!normalizedValue) {
    return "";
  }

  if (/^https?:\/\//i.test(normalizedValue)) {
    try {
      const url = new URL(normalizedValue);
      const segments = url.pathname
        .split("/")
        .map((segment) => segment.trim())
        .filter(Boolean);

      if (segments.length) {
        normalizedValue = segments[segments.length - 1] || normalizedValue;
      }
    } catch {
      // Use the raw value when URL parsing fails.
    }
  }

  try {
    normalizedValue = decodeURIComponent(normalizedValue);
  } catch {
    // Use the raw value when decoding fails.
  }

  return normalizedValue
    .split(/[?#]/, 1)[0]!
    .replace(/^@+/, "")
    .replace(/\/+$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
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

async function getProductCollectorIdentity(
  admin: AdminGraphqlClient,
  productId: string,
) {
  const data = await runAdminQuery<ProductCollectorSyncQueryResponse>(
    admin,
    `#graphql
      query ProductCollectorIdentity($id: ID!) {
        product(id: $id) {
          id
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

  return data.product;
}

function toProductCollectorIdentity(
  product: NonNullable<ProductCollectorSyncQueryResponse["product"]>,
): ProductCollectorIdentity {
  return {
    collectorTag: normalizeText(product.collectorTag?.value),
    influencerHandle: normalizeText(product.influencerHandle?.value),
    hostHandle: normalizeText(product.hostHandle?.value),
    hostName: normalizeText(product.hostName?.value),
  };
}

function findExactCollectorProfile(
  profiles: CollectorProfileRecord[],
  alias: string,
  candidates: Array<(profile: CollectorProfileRecord) => string>,
) {
  const matchedProfiles = profiles.filter((profile) => {
    return candidates.some((candidate) => normalizeAlias(candidate(profile)) === alias);
  });

  if (matchedProfiles.length === 1) {
    return matchedProfiles[0];
  }

  const activeMatchedProfiles = matchedProfiles.filter(
    (profile) => profile.status === "ACTIVE",
  );

  if (activeMatchedProfiles.length === 1) {
    return activeMatchedProfiles[0];
  }

  return null;
}

async function findCollectorProfileByAlias(
  admin: AdminGraphqlClient,
  alias: string,
) {
  const normalizedAlias = normalizeAlias(alias);

  if (!normalizedAlias) {
    return null;
  }

  const profiles = await listCollectorProfiles(admin);

  const handleMatch = findExactCollectorProfile(profiles, normalizedAlias, [
    (profile) => profile.handle,
  ]);

  if (handleMatch) {
    return handleMatch;
  }

  const publicHandleMatch = findExactCollectorProfile(profiles, normalizedAlias, [
    (profile) => profile.fields.publicHandle,
  ]);

  if (publicHandleMatch) {
    return publicHandleMatch;
  }

  const displayNameMatch = findExactCollectorProfile(profiles, normalizedAlias, [
    (profile) => profile.fields.displayName,
  ]);

  if (displayNameMatch) {
    return displayNameMatch;
  }

  return findExactCollectorProfile(profiles, normalizedAlias, [
    (profile) => profile.fields.customerName,
  ]);
}

async function setCollectorIdentityMetafields(
  admin: AdminGraphqlClient,
  productId: string,
  nextIdentity: {
    influencerHandle: string;
    hostHandle: string;
    hostName: string;
  },
) {
  const data = await runAdminQuery<MetafieldsSetResponse>(
    admin,
    `#graphql
      mutation SetCollectorIdentityMetafields($metafields: [MetafieldsSetInput!]!) {
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
          key: "influencer_handle",
          type: "single_line_text_field",
          value: nextIdentity.influencerHandle,
        },
        {
          ownerId: productId,
          namespace: "custom",
          key: "host_handle",
          type: "single_line_text_field",
          value: nextIdentity.hostHandle,
        },
        {
          ownerId: productId,
          namespace: "custom",
          key: "host_name",
          type: "single_line_text_field",
          value: nextIdentity.hostName,
        },
      ],
    },
  );

  if (data.metafieldsSet.userErrors.length) {
    throw new Error(createUserErrorMessage(data.metafieldsSet.userErrors));
  }
}

export async function syncProductCollectorIdentity(
  admin: AdminGraphqlClient,
  productId: string,
) {
  const product = await getProductCollectorIdentity(admin, productId);

  if (!product) {
    return { ok: true, skipped: "PRODUCT_NOT_FOUND" as const };
  }

  const currentIdentity = toProductCollectorIdentity(product);
  const sourceAlias =
    currentIdentity.collectorTag ||
    currentIdentity.influencerHandle ||
    currentIdentity.hostHandle ||
    currentIdentity.hostName;

  if (!sourceAlias) {
    return {
      ok: true,
      skipped: "NO_COLLECTOR_ALIAS" as const,
      influencerHandle: currentIdentity.influencerHandle,
      hostHandle: currentIdentity.hostHandle,
      hostName: currentIdentity.hostName,
    };
  }

  const collectorProfile = await findCollectorProfileByAlias(admin, sourceAlias);

  if (!collectorProfile) {
    return {
      ok: true,
      skipped: "COLLECTOR_NOT_FOUND" as const,
      collectorTag: currentIdentity.collectorTag,
      influencerHandle: currentIdentity.influencerHandle,
      hostHandle: currentIdentity.hostHandle,
      hostName: currentIdentity.hostName,
    };
  }

  const nextIdentity = {
    influencerHandle: collectorProfile.handle,
    hostHandle:
      normalizeText(collectorProfile.fields.publicHandle) ||
      `@${collectorProfile.handle}`,
    hostName:
      normalizeText(collectorProfile.fields.displayName) ||
      normalizeText(collectorProfile.fields.customerName) ||
      collectorProfile.handle,
  };

  const hasChanges =
    currentIdentity.influencerHandle !== nextIdentity.influencerHandle ||
    currentIdentity.hostHandle !== nextIdentity.hostHandle ||
    currentIdentity.hostName !== nextIdentity.hostName;

  if (hasChanges) {
    await setCollectorIdentityMetafields(admin, productId, nextIdentity);
  }

  return {
    ok: true,
    updated: hasChanges,
    collectorTag: currentIdentity.collectorTag,
    influencerHandle: nextIdentity.influencerHandle,
    hostHandle: nextIdentity.hostHandle,
    hostName: nextIdentity.hostName,
  };
}
