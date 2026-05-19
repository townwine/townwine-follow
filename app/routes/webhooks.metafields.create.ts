import type { ActionFunctionArgs } from "react-router";
import { handleMetafieldWebhookAction } from "../services/metafield-webhook.server";

export async function action(args: ActionFunctionArgs) {
  return handleMetafieldWebhookAction(args, "METAFIELDS_CREATE");
}
