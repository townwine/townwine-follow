import { normalizeInfluencerHandle } from "./follow.server";

type ProductCollectorIdentity = {
  collectorTag?: string | null;
  influencerHandle?: string | null;
  hostHandle?: string | null;
  hostName?: string | null;
  vendor?: string | null;
  tags?: string[] | null;
};

const TAG_PREFIXES = new Set([
  "collector",
  "collectorhandle",
  "collectorid",
  "creator",
  "creatorhandle",
  "host",
  "hosthandle",
  "influencer",
  "influencerhandle",
  "member",
  "memberhandle",
]);

const TAG_SEPARATORS = [":", "=", "/", "|"];

function normalizeTagKey(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function getExplicitHandleCandidates(source: ProductCollectorIdentity) {
  return [source.influencerHandle, source.hostHandle]
    .map((value) => normalizeInfluencerHandle(String(value || "")))
    .filter(Boolean);
}

function getNameFallbackCandidates(source: ProductCollectorIdentity) {
  return [source.collectorTag, source.hostName, source.vendor]
    .map((value) => normalizeInfluencerHandle(String(value || "")))
    .filter(Boolean);
}

export function extractTaggedInfluencerHandles(tags: string[] | null | undefined) {
  const results: string[] = [];
  const seen = new Set<string>();

  for (const rawTag of tags || []) {
    const tag = String(rawTag || "").trim();

    if (!tag) {
      continue;
    }

    for (const separator of TAG_SEPARATORS) {
      const separatorIndex = tag.indexOf(separator);

      if (separatorIndex <= 0 || separatorIndex >= tag.length - 1) {
        continue;
      }

      const key = normalizeTagKey(tag.slice(0, separatorIndex));
      if (!TAG_PREFIXES.has(key)) {
        continue;
      }

      const handle = normalizeInfluencerHandle(tag.slice(separatorIndex + 1));
      if (!handle || seen.has(handle)) {
        continue;
      }

      seen.add(handle);
      results.push(handle);
      break;
    }
  }

  return results;
}

export function resolveProductInfluencerHandle(
  source: ProductCollectorIdentity,
  options?: { includeNameFallback?: boolean },
) {
  const explicitCandidates = getExplicitHandleCandidates(source);
  const taggedCandidates = extractTaggedInfluencerHandles(source.tags);
  const fallbackCandidates = options?.includeNameFallback
    ? getNameFallbackCandidates(source)
    : [];
  const handle = [
    ...explicitCandidates,
    ...taggedCandidates,
    ...fallbackCandidates,
  ].find(Boolean);

  if (handle) {
    return handle;
  }

  return "";
}

export function collectProductInfluencerAliases(
  source: ProductCollectorIdentity,
  options?: { includeNameFallback?: boolean },
) {
  const aliases = [
    ...getExplicitHandleCandidates(source),
    ...extractTaggedInfluencerHandles(source.tags),
    ...(options?.includeNameFallback ? getNameFallbackCandidates(source) : []),
  ];

  return aliases.filter((alias, index, values) => {
    return Boolean(alias) && values.indexOf(alias) === index;
  });
}

export function productMatchesInfluencerHandle(
  source: ProductCollectorIdentity,
  targetHandle: string,
) {
  const normalizedTargetHandle = normalizeInfluencerHandle(targetHandle);

  if (!normalizedTargetHandle) {
    return false;
  }

  const productHandles = new Set([
    ...getExplicitHandleCandidates(source),
    ...extractTaggedInfluencerHandles(source.tags),
  ]);

  return productHandles.has(normalizedTargetHandle);
}
