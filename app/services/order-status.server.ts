type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type OrderStatusBucket = "paid" | "shipping" | "delivered";

type OrderStatusNode = {
  id: string;
  legacyResourceId: string | number | null;
  displayFulfillmentStatus: string | null;
  customer: {
    legacyResourceId: string | number | null;
  } | null;
  fulfillments: Array<{
    status: string | null;
    estimatedDeliveryAt: string | null;
    inTransitAt: string | null;
    deliveredAt: string | null;
    trackingInfo: Array<{
      company: string | null;
      number: string | null;
      url: string | null;
    }>;
  }>;
} | null;

type OrderStatusQueryResponse = {
  nodes: OrderStatusNode[];
};

export type OrderStatusSnapshot = {
  orderId: string;
  bucket: OrderStatusBucket;
  label: string;
  description: string;
  trackingNumber: string;
  trackingCompany: string;
  trackingUrl: string;
};

function normalizeOrderId(value: string) {
  const trimmedValue = String(value || "").trim();

  if (!trimmedValue) {
    return "";
  }

  if (trimmedValue.startsWith("gid://shopify/Order/")) {
    return trimmedValue;
  }

  const numericMatch = trimmedValue.match(/\d+/g);
  const numericId = numericMatch?.[numericMatch.length - 1];

  if (!numericId) {
    return "";
  }

  return `gid://shopify/Order/${numericId}`;
}

function toLegacyId(value: string | number | null | undefined) {
  const rawValue = String(value || "").trim();

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

function buildSnapshot(params: {
  orderId: string;
  bucket: OrderStatusBucket;
  trackingNumber?: string;
  trackingCompany?: string;
  trackingUrl?: string;
}) {
  const trackingNumber = params.trackingNumber || "";
  const trackingCompany = params.trackingCompany || "";
  const trackingUrl = params.trackingUrl || "";

  if (params.bucket === "delivered") {
    return {
      orderId: params.orderId,
      bucket: params.bucket,
      label: "완료",
      description: "배송이 완료된 주문입니다. 수령 후 이상이 있으면 주문 상세 페이지에서 확인해 주세요.",
      trackingNumber,
      trackingCompany,
      trackingUrl,
    } satisfies OrderStatusSnapshot;
  }

  if (params.bucket === "shipping") {
    const trackingSummary = [trackingCompany, trackingNumber].filter(Boolean).join(" ");

    return {
      orderId: params.orderId,
      bucket: params.bucket,
      label: "배송 중",
      description: trackingSummary
        ? `운송장 정보가 등록되어 배송이 진행 중입니다. ${trackingSummary}`
        : "운송장 정보가 등록되어 배송이 진행 중입니다.",
      trackingNumber,
      trackingCompany,
      trackingUrl,
    } satisfies OrderStatusSnapshot;
  }

  return {
    orderId: params.orderId,
    bucket: params.bucket,
    label: "결제 완료",
    description: "주문이 처리되었고 배송 준비 중입니다. 운송장이 등록되면 배송 중으로 자동 변경됩니다.",
    trackingNumber,
    trackingCompany,
    trackingUrl,
  } satisfies OrderStatusSnapshot;
}

export async function getOrderStatusSnapshots(params: {
  admin: AdminGraphqlClient;
  orderIds: string[];
  customerId: string;
}) {
  const normalizedOrderIds = Array.from(
    new Set(params.orderIds.map(normalizeOrderId).filter(Boolean)),
  );

  if (!normalizedOrderIds.length || !params.customerId) {
    return [];
  }

  const data = await runAdminQuery<OrderStatusQueryResponse>(
    params.admin,
    `#graphql
      query OrderStatusSnapshots($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Order {
            id
            legacyResourceId
            displayFulfillmentStatus
            customer {
              legacyResourceId
            }
            fulfillments(first: 10) {
              status
              estimatedDeliveryAt
              inTransitAt
              deliveredAt
              trackingInfo(first: 10) {
                company
                number
                url
              }
            }
          }
        }
      }
    `,
    { ids: normalizedOrderIds },
  );

  return data.nodes.flatMap<OrderStatusSnapshot>((node) => {
    if (!node?.id) {
      return [];
    }

    const orderId = toLegacyId(node.legacyResourceId || node.id);
    const customerId = toLegacyId(node.customer?.legacyResourceId);

    if (!orderId || customerId !== params.customerId) {
      return [];
    }

    const trackingEntries = node.fulfillments.flatMap((fulfillment) => fulfillment.trackingInfo || []);
    const firstTracking = trackingEntries.find((entry) => {
      return Boolean(String(entry?.number || "").trim());
    });

    const hasDelivered = node.fulfillments.some((fulfillment) => {
      return Boolean(fulfillment.deliveredAt);
    });

    const hasTracking = Boolean(firstTracking?.number);
    const isInProgress =
      node.displayFulfillmentStatus === "IN_PROGRESS" ||
      node.displayFulfillmentStatus === "PARTIALLY_FULFILLED" ||
      node.fulfillments.some((fulfillment) => Boolean(fulfillment.inTransitAt));

    if (hasDelivered) {
      return [
        buildSnapshot({
          orderId,
          bucket: "delivered",
          trackingNumber: firstTracking?.number || "",
          trackingCompany: firstTracking?.company || "",
          trackingUrl: firstTracking?.url || "",
        }),
      ];
    }

    if (hasTracking || isInProgress) {
      return [
        buildSnapshot({
          orderId,
          bucket: "shipping",
          trackingNumber: firstTracking?.number || "",
          trackingCompany: firstTracking?.company || "",
          trackingUrl: firstTracking?.url || "",
        }),
      ];
    }

    return [
      buildSnapshot({
        orderId,
        bucket: "paid",
      }),
    ];
  });
}
