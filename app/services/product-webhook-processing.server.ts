import { processDealNotification } from "./deal-notification.server";
import { syncProductDealSchedule } from "./deal-schedule.server";
import { processDueOpenAlerts } from "./open-alert.server";
import { syncProductCollectorIdentity } from "./product-collector-sync.server";

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type CollectorIdentityResult = Awaited<
  ReturnType<typeof syncProductCollectorIdentity>
>;

const RETRYABLE_NOTIFICATION_SKIPS = new Set([
  "NO_INFLUENCER_HANDLE",
  "PRODUCT_NOT_ACTIVE",
]);

const RETRYABLE_COLLECTOR_SKIPS = new Set([
  "NO_COLLECTOR_ALIAS",
  "COLLECTOR_NOT_FOUND",
]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(args: {
  collectorIdentity: CollectorIdentityResult;
  notification: Awaited<ReturnType<typeof processDealNotification>>;
}) {
  const collectorSkipped = String(args.collectorIdentity?.skipped || "").trim();
  const notificationSkipped = String(args.notification?.skipped || "").trim();

  return (
    RETRYABLE_COLLECTOR_SKIPS.has(collectorSkipped) ||
    RETRYABLE_NOTIFICATION_SKIPS.has(notificationSkipped)
  );
}

export async function processProductWebhookEvent(params: {
  admin: AdminGraphqlClient;
  shop: string;
  productId: string;
  maxAttempts?: number;
}) {
  const maxAttempts = Math.max(1, params.maxAttempts ?? 4);

  let schedule: Awaited<ReturnType<typeof syncProductDealSchedule>> | null = null;
  let collectorIdentity: CollectorIdentityResult | null = null;
  let notification: Awaited<ReturnType<typeof processDealNotification>> | null = null;
  let openAlertDelivery: Awaited<ReturnType<typeof processDueOpenAlerts>> | null = null;
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts += 1;

    schedule = await syncProductDealSchedule(params.admin, params.productId);
    collectorIdentity = await syncProductCollectorIdentity(params.admin, params.productId);
    notification = await processDealNotification({
      admin: params.admin,
      shop: params.shop,
      productId: params.productId,
      resolvedInfluencerHandle:
        collectorIdentity.influencerHandle || "",
      resolvedInfluencerName:
        collectorIdentity.hostName || "",
    });
    openAlertDelivery = await processDueOpenAlerts({
      admin: params.admin,
      shop: params.shop,
      productIds: [params.productId],
    });

    if (!collectorIdentity || !notification || !shouldRetry({ collectorIdentity, notification })) {
      break;
    }

    if (attempts < maxAttempts) {
      await sleep(attempts * 1200);
    }
  }

  return {
    attempts,
    schedule,
    collectorIdentity,
    notification,
    openAlertDelivery,
  };
}
