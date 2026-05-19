import { prisma } from "../db.server";
import { authenticate, unauthenticated } from "../shopify.server";

type StorefrontAdmin = Awaited<ReturnType<typeof unauthenticated.admin>>["admin"];

type ResolveStorefrontAdminParams = {
  request: Request;
  shop?: string;
  required?: boolean;
  logPrefix?: string;
};

type ResolveStorefrontAdminResult = {
  admin: StorefrontAdmin | null;
  requestedShop: string;
  resolvedShop: string;
  source: "app_proxy" | "offline" | "offline_fallback" | null;
  error: Error | null;
};

function normalizeShop(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function toError(value: unknown) {
  if (value instanceof Error) {
    return value;
  }

  return new Error(String(value));
}

async function listOfflineSessionShops() {
  const sessions = await prisma.session.findMany({
    where: {
      isOnline: false,
    },
    select: {
      shop: true,
    },
  });

  return Array.from(
    new Set(
      sessions
        .map((session) => normalizeShop(session.shop))
        .filter(Boolean),
    ),
  );
}

export async function resolveStorefrontAdmin(
  params: ResolveStorefrontAdminParams,
): Promise<ResolveStorefrontAdminResult> {
  const requestedShop = normalizeShop(params.shop);
  let appProxyError: Error | null = null;

  try {
    const context = await authenticate.public.appProxy(params.request);
    const resolvedAppProxyShop = normalizeShop(
      context.session?.shop || requestedShop,
    );

    if (context.admin) {
      return {
        admin: context.admin,
        requestedShop,
        resolvedShop: resolvedAppProxyShop,
        source: "app_proxy",
        error: null,
      };
    }
  } catch (error) {
    appProxyError = toError(error);

    if (params.logPrefix) {
      console.warn(`${params.logPrefix} app proxy auth failed, falling back to offline admin`, {
        requestedShop,
        message: appProxyError.message,
      });
    }
  }

  const fallbackShops = await listOfflineSessionShops();
  const candidateShops = Array.from(
    new Set([requestedShop, ...fallbackShops].filter(Boolean)),
  );

  let lastError = appProxyError;

  for (const candidateShop of candidateShops) {
    try {
      const offlineContext = await unauthenticated.admin(candidateShop);
      const source =
        requestedShop && candidateShop === requestedShop
          ? "offline"
          : "offline_fallback";

      if (source === "offline_fallback" && params.logPrefix) {
        console.info(`${params.logPrefix} resolved offline admin with fallback shop`, {
          requestedShop,
          resolvedShop: candidateShop,
        });
      }

      return {
        admin: offlineContext.admin,
        requestedShop,
        resolvedShop: candidateShop,
        source,
        error: lastError,
      };
    } catch (error) {
      lastError = toError(error);
    }
  }

  if (params.required && lastError) {
    throw lastError;
  }

  return {
    admin: null,
    requestedShop,
    resolvedShop: requestedShop,
    source: null,
    error: lastError,
  };
}
