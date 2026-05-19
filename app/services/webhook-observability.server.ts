type WebhookEventRecord = {
  timestamp: string;
  topic: string;
  shop: string;
  productId: string;
  adminAvailable: boolean;
  namespace?: string;
  key?: string;
  skipped?: string;
};

declare global {
  // eslint-disable-next-line no-var
  var recentWebhookEvents: WebhookEventRecord[] | undefined;
}

const MAX_RECENT_WEBHOOK_EVENTS = 25;

function getRecentWebhookEventsStore() {
  if (!global.recentWebhookEvents) {
    global.recentWebhookEvents = [];
  }

  return global.recentWebhookEvents;
}

export function recordWebhookEvent(event: WebhookEventRecord) {
  const events = getRecentWebhookEventsStore();

  events.unshift({
    ...event,
    timestamp: event.timestamp || new Date().toISOString(),
  });

  if (events.length > MAX_RECENT_WEBHOOK_EVENTS) {
    events.length = MAX_RECENT_WEBHOOK_EVENTS;
  }
}

export function getRecentWebhookEvents() {
  return [...getRecentWebhookEventsStore()];
}
