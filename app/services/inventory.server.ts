type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type InventoryVariantNode = {
  id: string;
  legacyResourceId: string | number;
  inventoryPolicy: string;
  inventoryQuantity: number | null;
  availableForSale: boolean;
  inventoryItem: {
    tracked: boolean;
  } | null;
  product: {
    id: string;
    handle: string;
    title: string;
  } | null;
} | null;

type OrdersQueryResponse = {
  orders: {
    nodes: Array<{
      lineItems: {
        nodes: Array<{
          currentQuantity: number;
          variant: {
            id: string;
          } | null;
        }>;
      };
    }>;
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
  };
};

type VariantsQueryResponse = {
  nodes: InventoryVariantNode[];
};

export type InventorySnapshot = {
  variantId: string;
  legacyVariantId: string;
  productId: string;
  productHandle: string;
  productTitle: string;
  inventoryTracked: boolean;
  inventoryPolicy: string;
  availableForSale: boolean;
  soldCount: number;
  totalInventory: number;
  remainingInventory: number;
  progressPercent: number;
};

const ORDERS_PAGE_SIZE = 50;
const ORDER_LINE_ITEMS_PAGE_SIZE = 50;

function clampQuantity(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, value);
}

function normalizeVariantId(value: string) {
  const trimmedValue = String(value || "").trim();

  if (!trimmedValue) {
    return "";
  }

  if (trimmedValue.startsWith("gid://shopify/ProductVariant/")) {
    return trimmedValue;
  }

  const numericMatch = trimmedValue.match(/\d+/g);
  const numericId = numericMatch?.[numericMatch.length - 1];

  if (!numericId) {
    return "";
  }

  return `gid://shopify/ProductVariant/${numericId}`;
}

function toLegacyVariantId(variantId: string | number) {
  const rawValue = String(variantId || "").trim();

  if (!rawValue) {
    return "";
  }

  if (!rawValue.startsWith("gid://")) {
    return rawValue;
  }

  const parts = rawValue.split("/");
  return parts[parts.length - 1] || "";
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

async function fetchVariants(
  admin: AdminGraphqlClient,
  variantIds: string[],
) {
  const data = await runAdminQuery<VariantsQueryResponse>(
    admin,
    `#graphql
      query InventoryVariants($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on ProductVariant {
            id
            legacyResourceId
            inventoryPolicy
            inventoryQuantity
            availableForSale
            inventoryItem {
              tracked
            }
            product {
              id
              handle
              title
            }
          }
        }
      }
    `,
    { ids: variantIds },
  );

  return data.nodes.filter((node): node is Exclude<InventoryVariantNode, null> => {
    return Boolean(node?.id && node.product?.id);
  });
}

async function fetchSoldCounts(
  admin: AdminGraphqlClient,
  targetVariantIds: Set<string>,
) {
  const soldCounts = new Map<string, number>();
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const data: OrdersQueryResponse = await runAdminQuery<OrdersQueryResponse>(
      admin,
      `#graphql
        query InventoryOrders($after: String) {
          orders(
            first: ${ORDERS_PAGE_SIZE}
            after: $after
            sortKey: CREATED_AT
            reverse: true
            query: "status:any"
          ) {
            nodes {
              lineItems(first: ${ORDER_LINE_ITEMS_PAGE_SIZE}) {
                nodes {
                  currentQuantity
                  variant {
                    ... on ProductVariant {
                      id
                    }
                  }
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `,
      { after: cursor },
    );

    for (const order of data.orders.nodes) {
      for (const lineItem of order.lineItems.nodes) {
        const variantId = lineItem.variant?.id;

        if (!variantId || !targetVariantIds.has(variantId)) {
          continue;
        }

        const currentSoldCount = soldCounts.get(variantId) || 0;
        soldCounts.set(
          variantId,
          currentSoldCount + clampQuantity(lineItem.currentQuantity),
        );
      }
    }

    hasNextPage = data.orders.pageInfo.hasNextPage;
    cursor = data.orders.pageInfo.endCursor;
  }

  return soldCounts;
}

export async function getInventorySnapshots(params: {
  admin: AdminGraphqlClient;
  variantIds: string[];
}) {
  const normalizedVariantIds = Array.from(
    new Set(params.variantIds.map(normalizeVariantId).filter(Boolean)),
  );

  if (!normalizedVariantIds.length) {
    return [];
  }

  const [variants, soldCounts] = await Promise.all([
    fetchVariants(params.admin, normalizedVariantIds),
    fetchSoldCounts(params.admin, new Set(normalizedVariantIds)),
  ]);

  return variants.map<InventorySnapshot>((variant) => {
    const remainingInventory = clampQuantity(variant.inventoryQuantity);
    const soldCount = clampQuantity(soldCounts.get(variant.id));
    const totalInventory = remainingInventory + soldCount;
    const progressPercent =
      totalInventory > 0
        ? Math.min(
            100,
            Math.round((soldCount / totalInventory) * 100),
          )
        : 0;

    return {
      variantId: variant.id,
      legacyVariantId: toLegacyVariantId(variant.legacyResourceId),
      productId: variant.product?.id || "",
      productHandle: variant.product?.handle || "",
      productTitle: variant.product?.title || "",
      inventoryTracked: Boolean(variant.inventoryItem?.tracked),
      inventoryPolicy: variant.inventoryPolicy,
      availableForSale: Boolean(variant.availableForSale),
      soldCount,
      totalInventory,
      remainingInventory,
      progressPercent,
    };
  });
}
