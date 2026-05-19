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

function normalizeCommentId(value: string) {
  return String(value || "").trim();
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
  customerId: string;
  customerDisplayName: string | null;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}, viewerCustomerId?: string) {
  const normalizedViewerCustomerId = normalizeCustomerId(viewerCustomerId || "");

  return {
    id: record.id,
    collectorHandle: record.collectorHandle,
    customerDisplayName:
      normalizeCustomerDisplayName(record.customerDisplayName || ""),
    body: record.body,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    isEdited: record.updatedAt.getTime() > record.createdAt.getTime(),
    isOwner:
      Boolean(normalizedViewerCustomerId) &&
      normalizeCustomerId(record.customerId) === normalizedViewerCustomerId,
  };
}

async function readOwnedComment(params: {
  commentId: string;
  shop: string;
  collectorHandle: string;
  customerId: string;
}) {
  const commentId = normalizeCommentId(params.commentId);
  const shop = normalizeShop(params.shop);
  const collectorHandle = normalizeCollectorHandle(params.collectorHandle);
  const customerId = normalizeCustomerId(params.customerId);

  if (!shop) {
    throw new Error("SHOP_REQUIRED");
  }

  if (!collectorHandle) {
    throw new Error("COLLECTOR_HANDLE_REQUIRED");
  }

  if (!customerId) {
    throw new Error("LOGIN_REQUIRED");
  }

  if (!commentId) {
    throw new Error("COMMENT_ID_REQUIRED");
  }

  const record = await prisma.collectorComment.findUnique({
    where: {
      id: commentId,
    },
  });

  if (!record || normalizeShop(record.shop) !== shop || normalizeCollectorHandle(record.collectorHandle) !== collectorHandle) {
    throw new Error("COMMENT_NOT_FOUND");
  }

  if (normalizeCustomerId(record.customerId) !== customerId) {
    throw new Error("COMMENT_FORBIDDEN");
  }

  return record;
}

export async function listCollectorComments(params: {
  shop: string;
  collectorHandle: string;
  limit?: number;
  viewerCustomerId?: string;
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

  return records.map((record) =>
    serializeCollectorComment(record, params.viewerCustomerId),
  );
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

  return serializeCollectorComment(record, customerId);
}

export async function updateCollectorComment(params: {
  commentId: string;
  shop: string;
  collectorHandle: string;
  customerId: string;
  body: string;
}) {
  const record = await readOwnedComment(params);
  const body = normalizeCommentBody(params.body);

  const updated = await prisma.collectorComment.update({
    where: {
      id: record.id,
    },
    data: {
      body,
    },
  });

  return serializeCollectorComment(updated, params.customerId);
}

export async function deleteCollectorComment(params: {
  commentId: string;
  shop: string;
  collectorHandle: string;
  customerId: string;
}) {
  const record = await readOwnedComment(params);

  await prisma.collectorComment.delete({
    where: {
      id: record.id,
    },
  });

  return {
    id: record.id,
  };
}

export async function syncCollectorCommentDisplayName(params: {
  shop: string;
  customerId: string;
  customerDisplayName?: string;
}) {
  const shop = normalizeShop(params.shop);
  const customerId = normalizeCustomerId(params.customerId);

  if (!customerId) {
    return { count: 0, fallback: false };
  }

  const customerDisplayName = normalizeCustomerDisplayName(
    params.customerDisplayName || "",
  );

  const scopedResult = await prisma.collectorComment.updateMany({
    where: {
      shop,
      customerId,
    },
    data: {
      customerDisplayName,
    },
  });

  if (scopedResult.count > 0 || !shop) {
    return { count: scopedResult.count, fallback: false };
  }

  const fallbackResult = await prisma.collectorComment.updateMany({
    where: {
      customerId,
    },
    data: {
      customerDisplayName,
    },
  });

  return { count: fallbackResult.count, fallback: fallbackResult.count > 0 };
}
