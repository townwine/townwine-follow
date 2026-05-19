import { Prisma } from "@prisma/client";
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

function getFollowSubscriptionAliases(record: {
  influencerHandle: string;
  influencerName: string | null;
}) {
  return Array.from(
    new Set(
      [
        normalizeInfluencerHandle(record.influencerHandle),
        normalizeInfluencerHandle(record.influencerName || ""),
      ].filter(Boolean),
    ),
  );
}

async function getSubscriptionsForCustomer(params: {
  shop: string;
  customerId: string;
}) {
  const shop = normalizeShop(params.shop);
  const customerId = normalizeCustomerId(params.customerId);

  if (!customerId) {
    return [];
  }

  const scopedRecords = await prisma.followSubscription.findMany({
    where: {
      shop,
      customerId,
    },
  });

  if (scopedRecords.length > 0 || !shop) {
    return scopedRecords;
  }

  const fallbackRecords = await prisma.followSubscription.findMany({
    where: {
      customerId,
    },
  });

  if (!fallbackRecords.length) {
    return fallbackRecords;
  }

  let backfilledCount = 0;

  for (const record of fallbackRecords) {
    const influencerHandle = normalizeInfluencerHandle(record.influencerHandle);

    if (!influencerHandle) {
      continue;
    }

    await prisma.followSubscription.upsert({
      where: {
        shop_customerId_influencerHandle: {
          shop,
          customerId,
          influencerHandle,
        },
      },
      update: {
        customerEmail: record.customerEmail,
        customerFirstName: record.customerFirstName,
        influencerName: record.influencerName,
      },
      create: {
        shop,
        customerId,
        customerEmail: record.customerEmail,
        customerFirstName: record.customerFirstName,
        influencerHandle,
        influencerName: record.influencerName,
      },
    });

    backfilledCount += 1;
  }

  if (backfilledCount > 0) {
    console.info("[follow] backfilled customer subscriptions to requested shop", {
      requestedShop: shop,
      customerId,
      fallbackCount: fallbackRecords.length,
      backfilledCount,
      sourceShops: Array.from(
        new Set(
          fallbackRecords
            .map((record) => normalizeShop(record.shop))
            .filter(Boolean),
        ),
      ),
    });
  }

  return prisma.followSubscription.findMany({
    where: {
      shop,
      customerId,
    },
  });
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
    return getFollowSubscriptionAliases(record).includes(influencerHandle);
  });
}

export async function followInfluencer(params: {
  shop: string;
  customerId: string;
  customerEmail?: string;
  customerFirstName?: string;
  influencerHandle: string;
  influencerName?: string;
}) {
  const shop = normalizeShop(params.shop);
  const customerId = normalizeCustomerId(params.customerId);
  const customerEmail = params.customerEmail?.trim() || undefined;
  const customerFirstName = params.customerFirstName?.trim() || undefined;
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
        customerEmail,
        customerFirstName,
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
      customerEmail,
      customerFirstName,
      influencerHandle,
      influencerName,
    },
  });
}

export async function syncFollowSubscriptionContact(params: {
  shop: string;
  customerId: string;
  customerEmail?: string;
  customerFirstName?: string;
}) {
  const shop = normalizeShop(params.shop);
  const customerId = normalizeCustomerId(params.customerId);
  const customerEmail = params.customerEmail?.trim() || "";
  const customerFirstName = params.customerFirstName?.trim() || "";

  if (!customerId || (!customerEmail && !customerFirstName)) {
    return { count: 0, fallback: false };
  }

  const data: {
    customerEmail?: string;
    customerFirstName?: string;
  } = {};

  if (customerEmail) {
    data.customerEmail = customerEmail;
  }

  if (customerFirstName) {
    data.customerFirstName = customerFirstName;
  }

  const needsContactSync = (record: {
    customerEmail: string | null;
    customerFirstName: string | null;
  }) => {
    if (customerEmail && String(record.customerEmail || "").trim() !== customerEmail) {
      return true;
    }

    if (
      customerFirstName &&
      String(record.customerFirstName || "").trim() !== customerFirstName
    ) {
      return true;
    }

    return false;
  };

  const scopedRecords = await prisma.followSubscription.findMany({
    where: {
      shop,
      customerId,
    },
    select: {
      id: true,
      customerEmail: true,
      customerFirstName: true,
    },
  });

  const scopedRecordIds = scopedRecords
    .filter(needsContactSync)
    .map((record) => record.id);

  const scopedResult = scopedRecordIds.length
    ? await prisma.followSubscription.updateMany({
        where: {
          id: {
            in: scopedRecordIds,
          },
        },
        data,
      })
    : { count: 0 };

  if (scopedResult.count > 0 || !shop) {
    return { count: scopedResult.count, fallback: false };
  }

  const fallbackRecords = await prisma.followSubscription.findMany({
    where: {
      customerId,
    },
  });

  const fallbackRecordIds = fallbackRecords
    .filter(needsContactSync)
    .map((record) => record.id);

  const fallbackResult = fallbackRecordIds.length
    ? await prisma.followSubscription.updateMany({
        where: {
          id: {
            in: fallbackRecordIds,
          },
        },
        data,
      })
    : { count: 0 };

  return { count: fallbackResult.count, fallback: fallbackResult.count > 0 };
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
  const requestedHandles = params.handles
    .map((handle) => handle.trim())
    .filter(Boolean);

  if (!requestedHandles.length) {
    return [];
  }

  const records = await getSubscriptionsForCustomer(params);

  const followingSet = new Set(
    records.flatMap((record) => getFollowSubscriptionAliases(record)),
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

export async function getAllFollowingHandles(params: {
  shop: string;
  customerId: string;
}) {
  const records = await getSubscriptionsForCustomer(params);

  return Array.from(
    new Set(
      records
        .flatMap((record) => getFollowSubscriptionAliases(record))
        .filter(Boolean),
    ),
  );
}

export async function getFollowersForInfluencer(params: {
  shop: string;
  influencerHandle: string;
}) {
  const shop = normalizeShop(params.shop);
  const influencerHandle = normalizeInfluencerHandle(params.influencerHandle);
  const scopedRecords = await prisma.followSubscription.findMany({
    where: { shop },
  });
  const scopedMatches = scopedRecords.filter((record) => {
    return normalizeInfluencerHandle(record.influencerHandle) === influencerHandle;
  });

  if (scopedMatches.length > 0 || !shop) {
    return scopedMatches;
  }

  const fallbackRecords = await prisma.followSubscription.findMany();

  return fallbackRecords.filter((record) => {
    return normalizeInfluencerHandle(record.influencerHandle) === influencerHandle;
  });
}

export async function getFollowersForInfluencerAliases(params: {
  shop: string;
  aliases: string[];
}) {
  const shop = normalizeShop(params.shop);
  const aliases = Array.from(
    new Set(params.aliases.map((alias) => normalizeInfluencerHandle(alias)).filter(Boolean)),
  );

  if (!aliases.length) {
    return [];
  }

  const aliasSet = new Set(aliases);
  const choosePreferredFollowerRecord = <
    TRecord extends {
      customerEmail: string | null;
      updatedAt: Date;
    },
  >(
    current: TRecord | undefined,
    candidate: TRecord,
  ) => {
    if (!current) {
      return candidate;
    }

    const currentHasEmail = Boolean(String(current.customerEmail || "").trim());
    const candidateHasEmail = Boolean(String(candidate.customerEmail || "").trim());

    if (candidateHasEmail && !currentHasEmail) {
      return candidate;
    }

    if (!candidateHasEmail && currentHasEmail) {
      return current;
    }

    return candidate.updatedAt.getTime() >= current.updatedAt.getTime()
      ? candidate
      : current;
  };
  const filterRecords = (records: Array<{
    id: string;
    shop: string;
    customerId: string;
    customerEmail: string | null;
    customerFirstName: string | null;
    influencerHandle: string;
    influencerName: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>) => {
    const matchesByCustomerId = new Map<string, (typeof records)[number]>();

    for (const record of records) {
      const isMatched = getFollowSubscriptionAliases(record).some((alias) => {
        return aliasSet.has(alias);
      });

      if (!isMatched) {
        continue;
      }

      matchesByCustomerId.set(
        record.customerId,
        choosePreferredFollowerRecord(matchesByCustomerId.get(record.customerId), record),
      );
    }

    return Array.from(matchesByCustomerId.values());
  };

  const scopedRecords = await prisma.followSubscription.findMany({
    where: { shop },
  });
  const scopedMatches = filterRecords(scopedRecords);

  if (scopedMatches.length > 0 || !shop) {
    return scopedMatches;
  }

  const fallbackRecords = await prisma.followSubscription.findMany();
  const fallbackMatches = filterRecords(fallbackRecords);

  if (fallbackMatches.length) {
    console.info("[follow] using cross-shop follower fallback", {
      requestedShop: shop,
      aliases,
      matchedCount: fallbackMatches.length,
      matchedShops: Array.from(new Set(fallbackMatches.map((record) => record.shop))),
    });
  }

  return fallbackMatches;
}

export async function markNotificationSent(params: {
  shop: string;
  customerId: string;
  influencerHandle: string;
  productId: string;
  notificationType: NotificationType;
}) {
  try {
    const record = await prisma.notificationLog.create({
      data: {
        shop: params.shop,
        customerId: params.customerId,
        influencerHandle: params.influencerHandle,
        productId: params.productId,
        notificationType: params.notificationType,
      },
    });

    return {
      created: true,
      updated: false,
      record,
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const record = await prisma.notificationLog.update({
        where: {
          shop_customerId_productId_notificationType: {
            shop: params.shop,
            customerId: params.customerId,
            productId: params.productId,
            notificationType: params.notificationType,
          },
        },
        data: {
          influencerHandle: params.influencerHandle,
          sentAt: new Date(),
        },
      });

      return {
        created: false,
        updated: true,
        record,
      };
    }

    throw error;
  }
}

export async function wasNotificationSent(params: {
  shop: string;
  customerId: string;
  productId: string;
  notificationType: NotificationType;
  invalidateBefore?: Date | string | null;
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

  if (!record) {
    return false;
  }

  if (params.invalidateBefore) {
    const invalidateDate =
      params.invalidateBefore instanceof Date
        ? params.invalidateBefore
        : new Date(params.invalidateBefore);

    if (
      !Number.isNaN(invalidateDate.getTime()) &&
      record.sentAt.getTime() < invalidateDate.getTime()
    ) {
      return false;
    }
  }

  return true;
}
