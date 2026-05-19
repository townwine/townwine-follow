import type { LoaderFunctionArgs } from "react-router";
import { ApiVersion } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { expandInfluencerAliasesWithCollectorProfiles } from "../services/collector-aliases.server";
import { getFollowersForInfluencerAliases } from "../services/follow.server";
import { collectProductInfluencerAliases } from "../services/product-collector.server";
import { getRecentWebhookEvents } from "../services/webhook-observability.server";

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type OfflineSessionRecord = {
  shop: string;
  accessToken: string;
};

type DiagnosticProductResponse = {
  product: {
    id: string;
    title: string;
    status: string;
    updatedAt: string;
    handle: string | null;
    vendor: string | null;
    tags: string[];
    onlineStoreUrl: string | null;
    collectorTag: { value: string | null } | null;
    influencerHandle: { value: string | null } | null;
    hostHandle: { value: string | null } | null;
    hostName: { value: string | null } | null;
    openAtKst: { value: string | null } | null;
  } | null;
};

function normalizeShop(value: string) {
  return String(value || "").trim().toLowerCase();
}

function normalizeProductId(value: string) {
  const normalizedValue = String(value || "").trim();

  if (!normalizedValue) {
    return "";
  }

  if (normalizedValue.startsWith("gid://")) {
    return normalizedValue;
  }

  return `gid://shopify/Product/${normalizedValue}`;
}

function createOfflineAdminClient(session: OfflineSessionRecord): AdminGraphqlClient {
  return {
    graphql: async (query, options) => {
      return fetch(`https://${session.shop}/admin/api/${ApiVersion.October25}/graphql.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": session.accessToken,
        },
        body: JSON.stringify({
          query,
          variables: options?.variables || {},
        }),
      });
    },
  };
}

async function listOfflineSessions(): Promise<OfflineSessionRecord[]> {
  const sessions = await db.session.findMany({
    where: {
      isOnline: false,
      accessToken: {
        not: "",
      },
    },
    orderBy: {
      shop: "asc",
    },
    select: {
      shop: true,
      accessToken: true,
    },
  });

  const byShop = new Map<string, OfflineSessionRecord>();

  for (const session of sessions) {
    const shop = normalizeShop(session.shop);

    if (!shop || byShop.has(shop)) {
      continue;
    }

    byShop.set(shop, {
      shop,
      accessToken: session.accessToken,
    });
  }

  return Array.from(byShop.values());
}

async function loadProduct(admin: AdminGraphqlClient, productId: string) {
  const response = await admin.graphql(
    `#graphql
      query ProductFollowDiagnostic($id: ID!) {
        product(id: $id) {
          id
          title
          status
          updatedAt
          handle
          vendor
          tags
          onlineStoreUrl
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
          openAtKst: metafield(namespace: "custom", key: "deal_open_at_kst") {
            value
          }
        }
      }
    `,
    { variables: { id: productId } },
  );

  const result = (await response.json()) as {
    data?: DiagnosticProductResponse;
    errors?: Array<{ message?: string }>;
  };

  return {
    ok: response.ok && !result.errors?.length,
    status: response.status,
    errors: result.errors?.map((error) => error.message).filter(Boolean) || [],
    product: result.data?.product || null,
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const productId = normalizeProductId(url.searchParams.get("productId") || "");

  if (!productId) {
    return Response.json(
      {
        ok: false,
        message: "productId query parameter is required",
      },
      { status: 422 },
    );
  }

  const sessions = await listOfflineSessions();
  const results = [];

  for (const session of sessions) {
    const admin = createOfflineAdminClient(session);
    const productResult = await loadProduct(admin, productId);

    if (!productResult.ok) {
      results.push({
        shop: session.shop,
        ok: false,
        status: productResult.status,
        errors: productResult.errors,
      });
      continue;
    }

    const product = productResult.product;

    if (!product) {
      results.push({
        shop: session.shop,
        ok: true,
        found: false,
      });
      continue;
    }

    const aliases = collectProductInfluencerAliases(
      {
        collectorTag: product.collectorTag?.value,
        influencerHandle: product.influencerHandle?.value,
        hostHandle: product.hostHandle?.value,
        hostName: product.hostName?.value,
        vendor: product.vendor,
        tags: Array.isArray(product.tags) ? product.tags : [],
      },
      { includeNameFallback: true },
    );
    const expandedAliases = await expandInfluencerAliasesWithCollectorProfiles({
      admin,
      shop: session.shop,
      aliases,
    });
    const followerMatches = await getFollowersForInfluencerAliases({
      shop: session.shop,
      aliases: expandedAliases.length ? expandedAliases : aliases,
    });

    results.push({
      shop: session.shop,
      ok: true,
      found: true,
      product: {
        id: product.id,
        title: product.title,
        status: product.status,
        updatedAt: product.updatedAt,
        handle: product.handle,
        vendor: product.vendor,
        tags: Array.isArray(product.tags) ? product.tags : [],
        onlineStoreUrl: product.onlineStoreUrl,
        collectorTag: product.collectorTag?.value || "",
        influencerHandle: product.influencerHandle?.value || "",
        hostHandle: product.hostHandle?.value || "",
        hostName: product.hostName?.value || "",
        openAtKst: product.openAtKst?.value || "",
      },
      aliases,
      expandedAliases,
      followerCount: followerMatches.length,
      matchingCustomerIds: followerMatches.map((record) => record.customerId),
      recentWebhookEvents: getRecentWebhookEvents().filter((event) => {
        return event.productId === product.id || event.productId === productId;
      }),
    });
  }

  return Response.json({
    ok: true,
    requestedProductId: productId,
    sessionCount: sessions.length,
    results,
  });
};
