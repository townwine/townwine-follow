function appendValue(
  searchParams: URLSearchParams,
  key: string,
  value: unknown,
) {
  if (value == null) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      appendValue(searchParams, key, item);
    }
    return;
  }

  searchParams.append(key, String(value));
}

function appendRecord(
  searchParams: URLSearchParams,
  value: Record<string, unknown>,
) {
  for (const [key, item] of Object.entries(value)) {
    appendValue(searchParams, key, item);
  }
}

async function readRequestParams(request: Request) {
  const url = new URL(request.url);
  const searchParams = new URLSearchParams(url.search);
  const method = request.method.toUpperCase();

  if (method === "GET" || method === "HEAD") {
    return searchParams;
  }

  const contentType = request.headers.get("content-type") || "";

  try {
    if (contentType.includes("application/json")) {
      const body = await request.json();
      if (body && typeof body === "object") {
        appendRecord(searchParams, body as Record<string, unknown>);
      }
      return searchParams;
    }

    if (
      contentType.includes("application/x-www-form-urlencoded") ||
      contentType.includes("multipart/form-data")
    ) {
      const formData = await request.formData();
      for (const [key, value] of formData.entries()) {
        searchParams.append(key, String(value));
      }
      return searchParams;
    }

    const rawBody = (await request.text()).trim();
    if (!rawBody) {
      return searchParams;
    }

    if (rawBody.startsWith("{")) {
      const parsed = JSON.parse(rawBody);
      if (parsed && typeof parsed === "object") {
        appendRecord(searchParams, parsed as Record<string, unknown>);
      }
      return searchParams;
    }

    const bodyParams = new URLSearchParams(rawBody);
    for (const [key, value] of bodyParams.entries()) {
      searchParams.append(key, value);
    }
  } catch (error) {
    console.error("[follow] failed to parse proxy request body", {
      method,
      contentType,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return searchParams;
}

function readFirst(params: URLSearchParams, keys: string[]) {
  for (const key of keys) {
    const value = params.get(key);
    if (value != null && value !== "") {
      return value;
    }
  }

  return "";
}

function readMany(params: URLSearchParams, keys: string[]) {
  const values: string[] = [];

  for (const key of keys) {
    const allValues = params.getAll(key);
    for (const value of allValues) {
      values.push(
        ...String(value)
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      );
    }
  }

  return values;
}

export async function readFollowMutationRequest(request: Request) {
  const params = await readRequestParams(request);

  return {
    influencerHandle: readFirst(params, [
      "influencerHandle",
      "handle",
      "influencer_handle",
      "influencer",
    ]),
    influencerName: readFirst(params, [
      "influencerName",
      "name",
      "influencer_name",
    ]),
    customerEmail: readFirst(params, [
      "customerEmail",
      "customer_email",
      "email",
    ]),
    customerFirstName: readFirst(params, [
      "customerFirstName",
      "customer_first_name",
      "firstName",
      "first_name",
    ]),
    requestParams: params,
  };
}

export async function readFollowStatusRequest(request: Request) {
  const params = await readRequestParams(request);

  return {
    handles: readMany(params, ["handles", "handle", "influencerHandle"]),
    customerEmail: readFirst(params, [
      "customerEmail",
      "customer_email",
      "email",
    ]),
    customerFirstName: readFirst(params, [
      "customerFirstName",
      "customer_first_name",
      "firstName",
      "first_name",
    ]),
    requestParams: params,
  };
}

export async function readInventoryRequest(request: Request) {
  const params = await readRequestParams(request);

  return {
    variantIds: readMany(params, ["variantIds", "variantId", "id"]),
    requestParams: params,
  };
}

export async function readOrderStatusRequest(request: Request) {
  const params = await readRequestParams(request);

  return {
    orderIds: readMany(params, ["orderIds", "orderId", "id"]),
    requestParams: params,
  };
}

export async function readCollectorStatsRequest(request: Request) {
  const params = await readRequestParams(request);

  return {
    productIds: readMany(params, ["productIds", "productId", "id"]),
    handles: readMany(params, ["handles", "handle", "influencerHandle"]),
    requestParams: params,
  };
}

export async function readOpenAlertMutationRequest(request: Request) {
  const params = await readRequestParams(request);

  return {
    productIds: readMany(params, ["productIds", "productId", "id"]),
    requestParams: params,
  };
}

export async function readOpenAlertStatusRequest(request: Request) {
  const params = await readRequestParams(request);

  return {
    productIds: readMany(params, ["productIds", "productId", "id"]),
    requestParams: params,
  };
}

export async function readCollectorCommentsRequest(request: Request) {
  const params = await readRequestParams(request);
  const limitRaw = readFirst(params, ["limit"]);
  const parsedLimit = Number.parseInt(limitRaw, 10);

  return {
    collectorHandle: readFirst(params, [
      "collectorHandle",
      "handle",
      "influencerHandle",
      "influencer_handle",
    ]),
    body: readFirst(params, ["body", "comment", "message"]),
    customerDisplayName: readFirst(params, [
      "customerDisplayName",
      "displayName",
      "customerName",
      "customer_name",
      "name",
    ]),
    customerFirstName: readFirst(params, [
      "customerFirstName",
      "customer_first_name",
      "firstName",
      "first_name",
    ]),
    limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined,
    requestParams: params,
  };
}
