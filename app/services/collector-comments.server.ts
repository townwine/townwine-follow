import { prisma } from "../db.server";
import { normalizeInfluencerHandle } from "./follow.server";

const MAX_COLLECTOR_COMMENT_LENGTH = 500;
const DEFAULT_COLLECTOR_COMMENT_LIMIT = 20;
const MAX_COLLECTOR_COMMENT_LIMIT = 50;
const DEFAULT_COMMENT_AUTHOR = "와인러버";

function normalizeShop(value: string) {
  return value.trim().toLowerCase();
}

function normalizeCustomerId(value: string) {
  return value.trim();
}

function normalizeCollectorHandle(value: string) {
  return normalizeInfluencerHandle(String(value || ""));
}

function normalizeCustomerDisplayName(value: string) {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);

  return normalized || DEFAULT_COMMENT_AUTHOR;
}

function normalizeCommentBody(value: string) {
  const normalized = String(value || "")
    .replace(/\r\n?/g, "\n")
    .trim();

  if (!normalized) {
    throw new Error("COMMENT_BODY_REQUIRED");
  }

  if (normalized.length > MAX_COLLECTOR_COMMENT_LENGTH) {
    throw new Error("COMMENT_BODY_TOO_LONG");
  }

  return normalized;
}

function normalizeCommentLimit(value?: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_COLLECTOR_COMMENT_LIMIT;
  }

  return Math.max(
    1,
    Math.min(MAX_COLLECTOR_COMMENT_LIMIT, Math.floor(Number(value))),
  );
}

function serializeCollectorComment(record: {
  id: string;
  collectorHandle: string;
  customerDisplayName: string | null;
  body: string;
  createdAt: Date;
}) {
  return {
    id: record.id,
    collectorHandle: record.collectorHandle,
    customerDisplayName:
      normalizeCustomerDisplayName(record.customerDisplayName || ""),
    body: record.body,
    createdAt: record.createdAt.toISOString(),
  };
}

export async function listCollectorComments(params: {
  shop: string;
  collectorHandle: string;
  limit?: number;
}) {
  const shop = normalizeShop(params.shop);
  const collectorHandle = normalizeCollectorHandle(params.collectorHandle);
  const limit = normalizeCommentLimit(params.limit);

  if (!shop) {
    throw new Error("SHOP_REQUIRED");
  }

  if (!collectorHandle) {
    throw new Error("COLLECTOR_HANDLE_REQUIRED");
  }

  const records = await prisma.collectorComment.findMany({
    where: {
      shop,
      collectorHandle,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: limit,
  });

  return records.map(serializeCollectorComment);
}

export async function createCollectorComment(params: {
  shop: string;
  collectorHandle: string;
  customerId: string;
  customerDisplayName?: string;
  body: string;
}) {
  const shop = normalizeShop(params.shop);
  const collectorHandle = normalizeCollectorHandle(params.collectorHandle);
  const customerId = normalizeCustomerId(params.customerId);
  const customerDisplayName = normalizeCustomerDisplayName(
    params.customerDisplayName || "",
  );
  const body = normalizeCommentBody(params.body);

  if (!shop) {
    throw new Error("SHOP_REQUIRED");
  }

  if (!collectorHandle) {
    throw new Error("COLLECTOR_HANDLE_REQUIRED");
  }

  if (!customerId) {
    throw new Error("LOGIN_REQUIRED");
  }

  const record = await prisma.collectorComment.create({
    data: {
      shop,
      collectorHandle,
      customerId,
      customerDisplayName,
      body,
    },
  });

  return serializeCollectorComment(record);
}
