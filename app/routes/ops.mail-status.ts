import type { LoaderFunctionArgs } from "react-router";
import { getEmailDeliveryRuntimeStatus } from "../services/email.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const runtimeStatus = getEmailDeliveryRuntimeStatus();

  return Response.json({
    ok: true,
    timestamp: new Date().toISOString(),
    host: url.host,
    pathname: url.pathname,
    runtimeStatus: {
      mode: runtimeStatus.mode,
      provider: runtimeStatus.provider,
      nodeEnv: runtimeStatus.nodeEnv,
      hasResendApiKey: runtimeStatus.hasResendApiKey,
      hasSmtpHost: runtimeStatus.hasSmtpHost,
      hasSmtpAuth: runtimeStatus.hasSmtpAuth,
      smtpHost: runtimeStatus.smtpHost || "",
      smtpPort: runtimeStatus.smtpPort || "",
      hasEmailFrom: runtimeStatus.hasEmailFrom,
      hasReplyTo: Boolean(runtimeStatus.replyTo),
      hasOverrideEmail: Boolean(runtimeStatus.overrideEmail),
      canUseOverride: runtimeStatus.canUseOverride,
      from: runtimeStatus.from || "",
      replyTo: runtimeStatus.replyTo || "",
      overrideEmail: runtimeStatus.overrideEmail || "",
    },
  });
};
