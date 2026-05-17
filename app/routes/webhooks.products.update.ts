import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { syncProductDealSchedule } from "../services/deal-schedule.server";
import { syncProductCollectorIdentity } from "../services/product-collector-sync.server";
import { processDealNotification } from "../services/deal-notification.server";
import { processDueOpenAlerts } from "../services/open-alert.server";

export async function action({ request }: ActionFunctionArgs) {
  const { admin, topic, shop } = await authenticate.webhook(request);

  if (topic !== "PRODUCTS_UPDATE") {
    return Response.json({ ok: true });
  }

  if (!admin) {
    return Response.json({ ok: true, skipped: "NO_ADMIN_CLIENT" });
  }

  const payload = await request.json();
  const productId = `gid://shopify/Product/${payload.id}`;
  const schedule = await syncProductDealSchedule(admin, productId);
  const collectorIdentity = await syncProductCollectorIdentity(admin, productId);
  const notification = await processDealNotification({
    admin,
    shop,
    productId,
    resolvedInfluencerHandle:
      "influencerHandle" in collectorIdentity ? collectorIdentity.influencerHandle : "",
    resolvedInfluencerName:
      "hostName" in collectorIdentity ? collectorIdentity.hostName : "",
  });
  const openAlertDelivery = await processDueOpenAlerts({
    admin,
    shop,
    productIds: [productId],
  });

  return Response.json({ schedule, collectorIdentity, notification, openAlertDelivery });
}
