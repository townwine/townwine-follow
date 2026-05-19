import {
  listCollectorProfiles,
  type CollectorProfileRecord,
} from "./collector-profiles.server";
import { normalizeInfluencerHandle } from "./follow.server";

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type CollectorAliasDirectory = {
  aliasesByHandle: Map<string, string[]>;
  handleByAlias: Map<string, string>;
};

type CollectorAliasDirectoryCacheEntry = {
  value: CollectorAliasDirectory | null;
  expiresAt: number;
  promise: Promise<CollectorAliasDirectory> | null;
};

const COLLECTOR_ALIAS_CACHE_TTL_MS = 30_000;
const COLLECTOR_ALIAS_CACHE_STALE_TTL_MS = 5_000;
const collectorAliasDirectoryCache = new Map<
  string,
  CollectorAliasDirectoryCacheEntry
>();

function normalizeShop(value: string) {
  return String(value || "").trim().toLowerCase();
}

function collectUniqueNormalizedHandles(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeInfluencerHandle(String(value || "")))
        .filter(Boolean),
    ),
  );
}

function buildCollectorAliasDirectory(
  profiles: CollectorProfileRecord[],
): CollectorAliasDirectory {
  const aliasesByHandle = new Map<string, string[]>();
  const handleByAlias = new Map<string, string>();

  for (const profile of profiles) {
    const canonicalHandle = normalizeInfluencerHandle(profile.handle);

    if (!canonicalHandle) {
      continue;
    }

    const aliases = collectUniqueNormalizedHandles([
      profile.handle,
      profile.fields.publicHandle,
      profile.fields.displayName,
      profile.fields.customerName,
    ]);

    aliasesByHandle.set(canonicalHandle, aliases);

    for (const alias of aliases) {
      if (!handleByAlias.has(alias)) {
        handleByAlias.set(alias, canonicalHandle);
      }
    }
  }

  return {
    aliasesByHandle,
    handleByAlias,
  };
}

async function fetchCollectorAliasDirectory(
  admin: AdminGraphqlClient,
  shop: string,
) {
  const cacheKey = normalizeShop(shop);
  const now = Date.now();
  const cachedEntry = collectorAliasDirectoryCache.get(cacheKey);

  if (cachedEntry?.value && cachedEntry.expiresAt > now) {
    return cachedEntry.value;
  }

  if (cachedEntry?.promise) {
    return cachedEntry.promise;
  }

  const refreshPromise = listCollectorProfiles(admin).then((profiles) => {
    return buildCollectorAliasDirectory(profiles);
  });

  collectorAliasDirectoryCache.set(cacheKey, {
    value: cachedEntry?.value ?? null,
    expiresAt: cachedEntry?.expiresAt ?? 0,
    promise: refreshPromise,
  });

  try {
    const directory = await refreshPromise;

    collectorAliasDirectoryCache.set(cacheKey, {
      value: directory,
      expiresAt: Date.now() + COLLECTOR_ALIAS_CACHE_TTL_MS,
      promise: null,
    });

    return directory;
  } catch (error) {
    if (cachedEntry?.value) {
      collectorAliasDirectoryCache.set(cacheKey, {
        value: cachedEntry.value,
        expiresAt: Date.now() + COLLECTOR_ALIAS_CACHE_STALE_TTL_MS,
        promise: null,
      });

      return cachedEntry.value;
    }

    collectorAliasDirectoryCache.delete(cacheKey);
    throw error;
  }
}

function resolveCollectorHandle(
  directory: CollectorAliasDirectory,
  value: string,
) {
  const normalizedAlias = normalizeInfluencerHandle(value);

  if (!normalizedAlias) {
    return "";
  }

  return directory.handleByAlias.get(normalizedAlias) || normalizedAlias;
}

function getCollectorHandleAliases(
  directory: CollectorAliasDirectory,
  value: string,
) {
  const canonicalHandle = resolveCollectorHandle(directory, value);

  if (!canonicalHandle) {
    return [];
  }

  return directory.aliasesByHandle.get(canonicalHandle) || [canonicalHandle];
}

export async function expandInfluencerAliasesWithCollectorProfiles(params: {
  admin: AdminGraphqlClient;
  shop: string;
  aliases: string[];
}) {
  const normalizedAliases = Array.from(
    new Set(
      params.aliases
        .map((alias) => normalizeInfluencerHandle(alias))
        .filter(Boolean),
    ),
  );

  if (!normalizedAliases.length) {
    return [];
  }

  let directory: CollectorAliasDirectory;

  try {
    directory = await fetchCollectorAliasDirectory(params.admin, params.shop);
  } catch (error) {
    console.warn("[collector-aliases] failed to expand aliases from collector profiles", {
      shop: params.shop,
      aliases: normalizedAliases,
      message: error instanceof Error ? error.message : String(error),
    });
    return normalizedAliases;
  }

  return Array.from(
    new Set(
      normalizedAliases.flatMap((alias) => {
        return [alias, ...getCollectorHandleAliases(directory, alias)];
      }),
    ),
  );
}

export async function expandKnownInfluencerAliasesWithCollectorProfiles(params: {
  admin: AdminGraphqlClient;
  shop: string;
  aliases: string[];
}) {
  const normalizedAliases = Array.from(
    new Set(
      params.aliases
        .map((alias) => normalizeInfluencerHandle(alias))
        .filter(Boolean),
    ),
  );

  if (!normalizedAliases.length) {
    return [];
  }

  let directory: CollectorAliasDirectory;

  try {
    directory = await fetchCollectorAliasDirectory(params.admin, params.shop);
  } catch (error) {
    console.warn("[collector-aliases] failed to resolve known collector aliases", {
      shop: params.shop,
      aliases: normalizedAliases,
      message: error instanceof Error ? error.message : String(error),
    });
    return [];
  }

  return Array.from(
    new Set(
      normalizedAliases.flatMap((alias) => {
        if (!directory.handleByAlias.has(alias)) {
          return [];
        }

        return [alias, ...getCollectorHandleAliases(directory, alias)];
      }),
    ),
  );
}
