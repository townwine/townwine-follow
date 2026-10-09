type NotificationAdmin = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

function isUnauthorized(error: unknown) {
  if (error instanceof Response) return error.status === 401;
  const value = error as {
    response?: { code?: number; status?: number };
    status?: number;
    message?: string;
  } | null;
  return (
    value?.response?.code === 401 ||
    value?.response?.status === 401 ||
    value?.status === 401 ||
    /401 Unauthorized|GraphQL Client: Unauthorized/.test(value?.message || "")
  );
}

export function refreshingNotificationAdmin(
  initialAdmin: NotificationAdmin,
  loadFreshAdmin: () => Promise<NotificationAdmin>,
): NotificationAdmin {
  let currentAdmin = initialAdmin;
  return {
    async graphql(query, options) {
      try {
        const response = await currentAdmin.graphql(query, options);
        if (response.status !== 401) return response;
      } catch (error) {
        if (!isUnauthorized(error)) throw error;
      }
      // Long-running jobs may retain a client whose offline token was rotated
      // by another request. Reload through Shopify's expiry/refresh machinery.
      currentAdmin = await loadFreshAdmin();
      return currentAdmin.graphql(query, options);
    },
  };
}

// GraphQL commonly reports failures with HTTP 200. Do not turn those failures
// into "customer has no email" or "product not active" and acknowledge the job.
export async function readNotificationQuery(response: Response) {
  const result = await response.json();
  if (!response.ok || result.errors?.length || !result.data) {
    const detail = result.errors
      ?.map((error: { message?: string }) => error.message)
      .filter(Boolean)
      .join("; ");
    throw new Error(
      `Notification Shopify lookup failed (${response.status}): ${detail || "missing data"}`,
    );
  }
  return result;
}
