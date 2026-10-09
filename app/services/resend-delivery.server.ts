import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

export function notificationEmailKey(params: {
  shop: string;
  customerId: string;
  productId: string;
  notificationType: string;
}) {
  const identity = [
    params.shop.trim().toLowerCase(),
    params.customerId.trim().replace(/^gid:\/\/shopify\/Customer\//, ""),
    params.productId.trim().replace(/^gid:\/\/shopify\/Product\//, ""),
    params.notificationType,
  ];
  return `notification/${createHash("sha256").update(JSON.stringify(identity)).digest("hex")}`;
}

export async function sendResendRequest(
  params: {
    apiKey: string;
    payload: Record<string, unknown>;
    idempotencyKey?: string;
    timeoutMs: number;
    beforeAttempt?: () => Promise<void>;
  },
  dependencies: {
    fetch?: typeof fetch;
    wait?: (ms: number) => Promise<unknown>;
  } = {},
) {
  const request = dependencies.fetch || fetch;
  const wait = dependencies.wait || delay;
  // Both the key and the serialized body must survive every retry unchanged.
  const key = params.idempotencyKey || `manual/${randomUUID()}`;
  const body = JSON.stringify(params.payload);
  const maxAttempts = 4;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await params.beforeAttempt?.();
    let response: Response;
    let responseText: string;
    try {
      response = await request("https://api.resend.com/emails", {
        method: "POST",
        signal: AbortSignal.timeout(params.timeoutMs),
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": key,
        },
        body,
      });
      responseText = await response.text();
    } catch (error) {
      // A lost response does not mean the provider rejected the email.
      // Reusing the same key lets Resend return the original result safely.
      if (attempt === maxAttempts) throw error;
      await wait(900 * attempt);
      continue;
    }

    if (response.ok) {
      const result = JSON.parse(responseText) as { id?: string };
      if (!result.id)
        throw new Error("Resend response is missing the email ID");
      return result.id;
    }

    const quotaExceeded =
      /daily_quota_exceeded|daily email sending quota|monthly_quota_exceeded/i.test(
        responseText,
      );
    const retryable =
      !quotaExceeded &&
      (response.status === 429 ||
        response.status >= 500 ||
        (response.status === 409 &&
          /concurrent_idempotent_requests/i.test(responseText)));
    if (!retryable || attempt === maxAttempts) {
      throw new Error(`Resend send failed: ${response.status} ${responseText}`);
    }

    const retryAfter = response.headers.get("retry-after");
    const seconds = Number(retryAfter);
    const retryAt = retryAfter ? Date.parse(retryAfter) : NaN;
    const waitMs =
      Number.isFinite(seconds) && seconds > 0
        ? Math.ceil(seconds * 1000)
        : Number.isFinite(retryAt)
          ? Math.max(0, retryAt - Date.now())
          : 900 * attempt;
    await wait(waitMs);
  }

  throw new Error("Resend send attempts exhausted");
}
