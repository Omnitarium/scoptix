import { compareByKey } from "@/lib/scan-compare";
import type { ObservedAvailability } from "@/lib/scan-observed";
import { prisma } from "@/lib/prisma";

export type CompareDiffUnavailable = {
  comparable: false;
  reason: "legacy_unavailable";
};

export type CompareDiffReady<T> = {
  comparable: true;
  summary: {
    added: number;
    removed: number;
    unchanged: number;
  };
  added: T[];
  removed: T[];
};

export type CompareDiffResult<T> = CompareDiffUnavailable | CompareDiffReady<T>;

export type FindingCompareItem = {
  id: string;
  findingType: string;
  source: string;
  snippet: string | null;
  discoveredUrl: {
    urlText: string;
    urlSha256: string;
  };
};

export type SubdomainCompareItem = {
  id: string;
  hostnameNormalized: string;
};

export type UrlCompareItem = {
  id: string;
  hostnameNormalized: string;
  urlText: string;
  extensionCategory: {
    slug: string;
  } | null;
};

export function compareDiffChangeCount<T>(
  diff: CompareDiffResult<T> | null,
): number | null {
  if (!diff?.comparable) return null;
  return diff.summary.added + diff.summary.removed;
}

function sliceDiff<T>(compared: ReturnType<typeof compareByKey<T>>, perPage: number) {
  return {
    comparable: true as const,
    summary: {
      added: compared.added.length,
      removed: compared.removed.length,
      unchanged: compared.unchanged.length,
    },
    added: compared.added.slice(0, perPage),
    removed: compared.removed.slice(0, perPage),
  };
}

export async function loadFindingsCompareDiff(
  baselineScanId: string,
  currentScanId: string,
  perPage: number,
): Promise<CompareDiffResult<FindingCompareItem>> {
  const [baselineRows, currentRows] = await Promise.all([
    prisma.analysisFinding.findMany({
      where: { scanJobId: baselineScanId },
      orderBy: { createdAt: "desc" },
      include: {
        discoveredUrl: {
          select: {
            urlText: true,
            urlSha256: true,
          },
        },
      },
    }),
    prisma.analysisFinding.findMany({
      where: { scanJobId: currentScanId },
      orderBy: { createdAt: "desc" },
      include: {
        discoveredUrl: {
          select: {
            urlText: true,
            urlSha256: true,
          },
        },
      },
    }),
  ]);

  const compared = compareByKey(
    baselineRows,
    currentRows,
    (row) =>
      [
        row.findingType,
        row.source,
        row.discoveredUrl.urlSha256,
        row.snippet ?? "",
      ].join("::"),
  );

  return sliceDiff(compared, perPage);
}

export async function loadSubdomainsCompareDiff(
  baselineScanId: string,
  currentScanId: string,
  perPage: number,
  currentAvailability: ObservedAvailability,
  baselineAvailability: ObservedAvailability | null,
): Promise<CompareDiffResult<SubdomainCompareItem>> {
  const comparable =
    currentAvailability.subdomains === "ready" &&
    baselineAvailability?.subdomains === "ready";

  if (!comparable) {
    return { comparable: false, reason: "legacy_unavailable" };
  }

  const [baselineRows, currentRows] = await Promise.all([
    prisma.scanObservedSubdomain.findMany({
      where: { scanJobId: baselineScanId },
      orderBy: { hostnameNormalized: "asc" },
    }),
    prisma.scanObservedSubdomain.findMany({
      where: { scanJobId: currentScanId },
      orderBy: { hostnameNormalized: "asc" },
    }),
  ]);

  const compared = compareByKey(
    baselineRows,
    currentRows,
    (row) => row.hostnameNormalized,
  );

  return sliceDiff(compared, perPage);
}

export async function loadUrlsCompareDiff(
  baselineScanId: string,
  currentScanId: string,
  perPage: number,
  currentAvailability: ObservedAvailability,
  baselineAvailability: ObservedAvailability | null,
): Promise<CompareDiffResult<UrlCompareItem>> {
  const comparable =
    currentAvailability.urls === "ready" &&
    baselineAvailability?.urls === "ready";

  if (!comparable) {
    return { comparable: false, reason: "legacy_unavailable" };
  }

  const urlInclude = {
    extensionCategory: {
      select: { slug: true as const },
    },
  };

  const [baselineRows, currentRows] = await Promise.all([
    prisma.scanObservedUrl.findMany({
      where: { scanJobId: baselineScanId },
      orderBy: { createdAt: "desc" },
      include: urlInclude,
    }),
    prisma.scanObservedUrl.findMany({
      where: { scanJobId: currentScanId },
      orderBy: { createdAt: "desc" },
      include: urlInclude,
    }),
  ]);

  const compared = compareByKey(
    baselineRows,
    currentRows,
    (row) => row.urlSha256,
  );

  return sliceDiff(compared, perPage);
}

export type IpCompareItem = {
  id: string;
  ipAddress: string;
  lastResolvedAt: Date;
  reportedByHostname: string;
};

export async function loadIpResolutionsCompareDiff(
  baselineScanId: string,
  currentScanId: string,
  perPage: number,
  currentAvailability: ObservedAvailability,
  baselineAvailability: ObservedAvailability | null,
): Promise<CompareDiffResult<IpCompareItem>> {
  const comparable =
    currentAvailability.ips === "ready" &&
    baselineAvailability?.ips === "ready";

  if (!comparable) {
    return { comparable: false, reason: "legacy_unavailable" };
  }

  const [baselineRows, currentRows] = await Promise.all([
    prisma.scanObservedIpResolution.findMany({
      where: { scanJobId: baselineScanId },
      orderBy: { ipAddress: "asc" },
    }),
    prisma.scanObservedIpResolution.findMany({
      where: { scanJobId: currentScanId },
      orderBy: { ipAddress: "asc" },
    }),
  ]);

  const compared = compareByKey(
    baselineRows,
    currentRows,
    (row) => row.ipAddress,
  );

  return sliceDiff(compared, perPage);
}
