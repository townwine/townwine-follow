import type { ActionFunctionArgs } from "react-router";
import { handleMetafieldWebhookAction } from "./webhooks.metafields.shared";

export async function action(args: ActionFunctionArgs) {
  return handleMetafieldWebhookAction(args, "METAFIELDS_CREATE");
}
