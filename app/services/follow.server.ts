import { prisma } from "../db.server";

export type NotificationType = "FOLLOW_NEW_DEAL" | "UPCOMING_OPEN_ALERT";

function normalizeShop(shop: string) {
  return shop.trim().toLowerCase();
}

function normalizeCustomerId(customerId: string) {
  return customerId.trim();
}

export function normalizeInfluencerHandle(value: string) {
  let handle = value.trim();

  if (!handle) {
    return "";
  }

  if (/^https?:\/\//i.test(handle)) {
    try {
      const url = new URL(handle);
      const segments = url.pathname
        .split("/")
        .map((segment) => segment.trim())
        .filter(Boolean);

      if (segments.length) {
        handle = segments[segments.length - 1] ?? handle;
      }
    } catch {
      // Leave the original value in place if it isn't a valid URL.
    }
  }

  handle = handle
    .split(/[?#]/, 1)[0]!
    .replace(/^@+/, "")
    .replace(/\/+$/, "")
    .trim()
    .toLowerCase();

  try {
    handle = decodeURIComponent(handle);
  } catch {
    // Ignore malformed escape sequences and use the raw handle.
  }

  return handle;
}

async function findMatchingSubscriptions(params: {
  shop: string;
  customerId: string;
  influencerHandle: string;
}) {
  const shop = normalizeShop(params.shop);
  const customerId = normalizeCustomerId(params.customerId);
  const influencerHandle = normalizeInfluencerHandle(params.influencerHandle);

  const records = await prisma.followSubscription.findMany({
    where: { shop, customerId },
  });

  return records.filter((record) => {
    return normalizeInfluencerHandle(record.influencerHandle) === influencerHandle;
  });
}

export async function followInfluencer(params: {
  shop: string;
  customerId: string;
  influencerHandle: string;
  influencerName?: string;
}) {
  const shop = normalizeShop(params.shop);
  const customerId = normalizeCustomerId(params.customerId);
  const influencerHandle = normalizeInfluencerHandle(params.influencerHandle);
  const influencerName = params.influencerName?.trim() || undefined;

  const matches = await findMatchingSubscriptions({
    shop,
    customerId,
    influencerHandle,
  });

  if (matches[0]) {
    const updated = await prisma.followSubscription.update({
      where: { id: matches[0].id },
      data: {
        influencerHandle,
        influencerName,
      },
    });

    if (matches.length > 1) {
      await prisma.followSubscription.deleteMany({
        where: {
          id: {
            in: matches.slice(1).map((record) => record.id),
          },
        },
      });
    }

    return updated;
  }

  return prisma.followSubscription.create({
    data: {
      shop,
      customerId,
      influencerHandle,
      influencerName,
    },
  });
}

export async function unfollowInfluencer(params: {
  shop: string;
  customerId: string;
  influencerHandle: string;
}) {
  const matches = await findMatchingSubscriptions(params);

  if (!matches.length) {
    return { count: 0 };
  }

  return prisma.followSubscription.deleteMany({
    where: {
      id: { in: matches.map((record) => record.id) },
    },
  });
}

export async function getFollowingHandles(params: {
  shop: string;
  customerId: string;
  handles: string[];
}) {
  const shop = normalizeShop(params.shop);
  const customerId = normalizeCustomerId(params.customerId);
  const requestedHandles = params.handles
    .map((handle) => handle.trim())
    .filter(Boolean);

  if (!requestedHandles.length) {
    return [];
  }

  const records = await prisma.followSubscription.findMany({
    where: {
      shop,
      customerId,
    },
    select: { influencerHandle: true },
  });

  const followingSet = new Set(
    records.map((record) => normalizeInfluencerHandle(record.influencerHandle)),
  );

  return requestedHandles.filter((handle, index, items) => {
    const normalizedHandle = normalizeInfluencerHandle(handle);

    if (!normalizedHandle || !followingSet.has(normalizedHandle)) {
      return false;
    }

    return (
      items.findIndex((item) => {
        return normalizeInfluencerHandle(item) === normalizedHandle;
      }) === index
    );
  });
}

export async function getFollowersForInfluencer(params: {
  shop: string;
  influencerHandle: string;
}) {
  const shop = normalizeShop(params.shop);
  const influencerHandle = normalizeInfluencerHandle(params.influencerHandle);
  const records = await prisma.followSubscription.findMany({
    where: { shop },
  });

  return records.filter((record) => {
    return normalizeInfluencerHandle(record.influencerHandle) === influencerHandle;
  });
}

export async function markNotificationSent(params: {
  shop: string;
  customerId: string;
  influencerHandle: string;
  productId: string;
  notificationType: NotificationType;
}) {
  return prisma.notificationLog.create({
    data: {
      shop: params.shop,
      customerId: params.customerId,
      influencerHandle: params.influencerHandle,
      productId: params.productId,
      notificationType: params.notificationType,
    },
  });
}

export async function wasNotificationSent(params: {
  shop: string;
  customerId: string;
  productId: string;
  notificationType: NotificationType;
}) {
  const record = await prisma.notificationLog.findUnique({
    where: {
      shop_customerId_productId_notificationType: {
        shop: params.shop,
        customerId: params.customerId,
        productId: params.productId,
        notificationType: params.notificationType,
      },
    },
  });

  return Boolean(record);
}
