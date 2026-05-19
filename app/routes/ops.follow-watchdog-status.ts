import type { LoaderFunctionArgs } from "react-router";
import {
  getFollowNotificationWatchdogStatus,
  startFollowNotificationWatchdog,
} from "../services/follow-notification-watchdog.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  startFollowNotificationWatchdog();

  const url = new URL(request.url);

  return Response.json({
    ok: true,
    timestamp: new Date().toISOString(),
    host: url.host,
    pathname: url.pathname,
    watchdog: getFollowNotificationWatchdogStatus(),
  });
};
