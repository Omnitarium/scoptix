import { EngineProvider, ScanJobStatus } from "@prisma/client";
import {
  enginesObservedInScan,
  formatEngineLabel,
  parseScanEnginesEnabled,
} from "@/lib/scan-engines";
import {
  loadFindingsCompareDiff,
  loadIpResolutionsCompareDiff,
  loadSubdomainsCompareDiff,
  loadUrlsCompareDiff,
} from "@/lib/scan-compare-diff";
import type { ObservedAvailability } from "@/lib/scan-observed";
import { prisma } from "@/lib/prisma";
import {
  countDiscoveredUrlsByCategory,
  countObservedUrlsByCategory,
  type UrlCategoryCounts,
} from "@/lib/extension-category";
import { getObservedAvailability } from "@/lib/scan-observed";
import {
  resolveCategoryRankVisual,
  resolveFindingRankVisual,
  type RankVisual,
  type SummaryRankIconKind,
} from "@/lib/summary-rank-style";

function buildUrlCategoryRankItems(
  counts: UrlCategoryCounts | null,
  categories: { id: number; displayName: string }[],
) {
  if (!counts) return [];

  const items: { label: string; count: number }[] = [];
  if (counts.uncategorizedCount > 0) {
    items.push({ label: "Uncategorized", count: counts.uncategorizedCount });
  }
  for (const cat of categories) {
    const count = counts.countByCategoryId.get(cat.id) ?? 0;
    if (count > 0) {
      items.push({ label: cat.displayName, count });
    }
  }
  return items.sort((a, b) => b.count - a.count).slice(0, 10);
}

function countUrlCategoryBuckets(counts: UrlCategoryCounts | null): number {
  if (!counts) return 0;
  let total = 0;
  if (counts.uncategorizedCount > 0) total += 1;
  for (const n of counts.countByCategoryId.values()) {
    if (n > 0) total += 1;
  }
  return total;
}

function buildUrlCategoryLabelCountMap(
  counts: UrlCategoryCounts | null,
  categories: { id: number; displayName: string }[],
) {
  const map = new Map<string, number>();
  if (!counts) return map;

  if (counts.uncategorizedCount > 0) {
    map.set("Uncategorized", counts.uncategorizedCount);
  }
  for (const cat of categories) {
    const count = counts.countByCategoryId.get(cat.id) ?? 0;
    if (count > 0) {
      map.set(cat.displayName, count);
    }
  }
  return map;
}

export type SummaryRankRow = {
  label: string;
  count: number;
  change: string;
  trend: "up" | "down" | "neutral";
  barColor: string;
  barWidthPercent: number;
  iconBg: string;
  iconColor: string;
  iconStroke?: string;
  barFill?: string;
  barBackground?: string;
  barShadow?: string;
  icon: SummaryRankIconKind;
};

export type SummaryChangeLine = {
  label: string;
  value: string;
  tone: "positive" | "negative" | "neutral";
  icon: "globe" | "link" | "link-removed" | "finding" | "server";
  dividerBefore?: boolean;
};

export type SummaryLatestFinding = {
  id: string;
  findingType: string;
  url: string;
  description: string;
};

export type SummarySourceSlice = {
  label: string;
  count: number;
  percent: number;
  color: string;
};

export type SummaryDiscoveryPoint = {
  label: string;
  scanId: string;
  urlCount: number;
  findingCount: number;
  isCurrent: boolean;
  completedAt: string | null;
};

export type ScanSummaryData = {
  findingsTop10: SummaryRankRow[];
  findingsTypeTotal: number;
  urlCategoriesTop10: SummaryRankRow[];
  urlCategoryTotal: number;
  changes: {
    baselineScanId: string | null;
    baselineLabel: string | null;
    lines: SummaryChangeLine[];
  };
  latestFindings: SummaryLatestFinding[];
  sources: SummarySourceSlice[];
  urlTotalForSources: number;
  discoveryTimeline: SummaryDiscoveryPoint[];
};

function formatDelta(current: number, previous: number | undefined) {
  if (previous === undefined) return { change: "0", trend: "neutral" as const };
  const delta = current - previous;
  if (delta === 0) return { change: "0", trend: "neutral" as const };
  if (delta > 0) return { change: `+${delta.toLocaleString()}`, trend: "up" as const };
  return { change: delta.toLocaleString(), trend: "down" as const };
}

/** Bar length vs highest count in the same top-10 list (rank #1 = 100%). */
function barWidth(count: number, max: number) {
  if (max <= 0 || count <= 0) return 0;
  return Math.round((count / max) * 100);
}

function buildRankRows(
  items: { label: string; count: number }[],
  previousByLabel: Map<string, number>,
  visualFor: (label: string, index: number) => RankVisual,
): SummaryRankRow[] {
  const max = items[0]?.count ?? 0;
  return items.map((item, index) => {
    const { change, trend } = formatDelta(item.count, previousByLabel.get(item.label));
    const visual = visualFor(item.label, index);
    return {
      label: item.label,
      count: item.count,
      change,
      trend,
      barColor: visual.barColor,
      barFill: visual.barFill,
      barBackground: visual.barBackground,
      barShadow: visual.barShadow,
      barWidthPercent: barWidth(item.count, max),
      iconBg: visual.iconBg,
      iconColor: visual.iconColor,
      iconStroke: visual.iconStroke,
      icon: visual.icon,
    };
  });
}

function formatFindingFoundAt(value: Date) {
  return value.toISOString().slice(0, 16).replace("T", " ");
}

/** Donut segment colors aligned with sampleimg.png (green Wayback, purple VT). */
const SOURCE_COLORS = ["#22c55e", "#9333ea", "#3b82f6", "#f59e0b"];

const DISCOVERY_MAX_SCANS = 5;

function formatDiscoveryDate(d: Date) {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function formatDiscoveryTime(d: Date) {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Build labels, appending time when two scans share the same date string. */
function buildDiscoveryLabels(
  scans: { completedAt: Date | null; createdAt: Date }[],
): string[] {
  const dates = scans.map((s) => s.completedAt ?? s.createdAt);
  const dateLabels = dates.map(formatDiscoveryDate);

  // Count occurrences of each date label
  const freq = new Map<string, number>();
  for (const dl of dateLabels) freq.set(dl, (freq.get(dl) ?? 0) + 1);

  // Append time only for duplicated dates
  return dateLabels.map((dl, i) =>
    (freq.get(dl) ?? 0) > 1 ? `${dl} ${formatDiscoveryTime(dates[i])}` : dl,
  );
}

async function loadDiscoveryTimeline(
  targetDomainId: string,
  currentScanId: string,
): Promise<SummaryDiscoveryPoint[]> {
  const completedScans = await prisma.scanJob.findMany({
    where: {
      targetDomainId,
      status: ScanJobStatus.COMPLETED,
    },
    orderBy: [{ completedAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      completedAt: true,
      createdAt: true,
      observedUrlCount: true,
      observedFindingCount: true,
    },
  });

  const timelineScans = completedScans.slice(-DISCOVERY_MAX_SCANS);
  if (timelineScans.length === 0) return [];

  const missingCounts = timelineScans.filter(
    (scan) => scan.observedUrlCount == null || scan.observedFindingCount == null,
  );

  const countByScanId = new Map<string, { urls: number; findings: number }>();

  if (missingCounts.length > 0) {
    const counts = await Promise.all(
      missingCounts.map(async (scan) => {
        const [urls, findings] = await Promise.all([
          scan.observedUrlCount ??
            (
              prisma as typeof prisma & {
                scanObservedUrl: { count: (args: Record<string, unknown>) => Promise<number> };
              }
            ).scanObservedUrl.count({ where: { scanJobId: scan.id } }),
          scan.observedFindingCount ??
            prisma.analysisFinding.count({ where: { scanJobId: scan.id } }),
        ]);
        return { id: scan.id, urls, findings };
      }),
    );
    for (const row of counts) {
      countByScanId.set(row.id, { urls: row.urls, findings: row.findings });
    }
  }

  const labels = buildDiscoveryLabels(timelineScans);

  return timelineScans.map((scan, i) => {
    const fallback = countByScanId.get(scan.id);
    return {
      label: labels[i],
      scanId: scan.id,
      urlCount: scan.observedUrlCount ?? fallback?.urls ?? 0,
      findingCount: scan.observedFindingCount ?? fallback?.findings ?? 0,
      isCurrent: scan.id === currentScanId,
      completedAt: scan.completedAt?.toISOString() ?? null,
    };
  });
}

async function buildChangesSincePreviousScan(
  previousScan: { id: string; completedAt: Date | null; createdAt: Date },
  currentScanId: string,
  availability: ObservedAvailability,
): Promise<ScanSummaryData["changes"]> {
  const changes: ScanSummaryData["changes"] = {
    baselineScanId: previousScan.id,
    baselineLabel: (previousScan.completedAt ?? previousScan.createdAt)
      .toISOString()
      .slice(0, 10),
    lines: [],
  };

  const baselineAvailability = {
    findings: "ready" as const,
    subdomains: availability.subdomains,
    urls: availability.urls,
    ips: availability.ips,
  };

  const [findingsDiff, subdomainsDiff, urlsDiff, ipsDiff] = await Promise.all([
    loadFindingsCompareDiff(previousScan.id, currentScanId, 500),
    loadSubdomainsCompareDiff(
      previousScan.id,
      currentScanId,
      500,
      availability,
      baselineAvailability,
    ),
    loadUrlsCompareDiff(previousScan.id, currentScanId, 500, availability, baselineAvailability),
    loadIpResolutionsCompareDiff(
      previousScan.id,
      currentScanId,
      500,
      availability,
      baselineAvailability,
    ),
  ]);

  const pushLine = (line: SummaryChangeLine) => changes.lines.push(line);

  if (subdomainsDiff.comparable) {
    pushLine({
      label: "New Subdomains",
      value: `+${subdomainsDiff.summary.added.toLocaleString()}`,
      tone: "positive",
      icon: "globe",
    });
  }

  if (urlsDiff.comparable) {
    pushLine({
      label: "New URLs",
      value: `+${urlsDiff.summary.added.toLocaleString()}`,
      tone: "positive",
      icon: "link",
    });
  }

  const dividerBeforeRemoved = changes.lines.length > 0;

  if (subdomainsDiff.comparable) {
    pushLine({
      label: "Removed Subdomains",
      value:
        subdomainsDiff.summary.removed > 0
          ? `-${subdomainsDiff.summary.removed.toLocaleString()}`
          : "0",
      tone: "negative",
      icon: "globe",
      dividerBefore: dividerBeforeRemoved,
    });
  }

  if (urlsDiff.comparable) {
    pushLine({
      label: "Removed URLs",
      value:
        urlsDiff.summary.removed > 0
          ? `-${urlsDiff.summary.removed.toLocaleString()}`
          : "0",
      tone: "negative",
      icon: "link-removed",
      dividerBefore: dividerBeforeRemoved && !subdomainsDiff.comparable,
    });
  }

  if (ipsDiff.comparable) {
    const added = ipsDiff.summary.added;
    const removed = ipsDiff.summary.removed;
    if (added > 0) {
      pushLine({
        label: "New IPs",
        value: `+${added.toLocaleString()}`,
        tone: "positive",
        icon: "server",
        dividerBefore: false,
      });
    }
    if (removed > 0) {
      pushLine({
        label: "Removed IPs",
        value: `-${removed.toLocaleString()}`,
        tone: "negative",
        icon: "server",
        dividerBefore: false,
      });
    }
  }

  if (findingsDiff.comparable) {
    pushLine({
      label: "New Findings",
      value: `+${findingsDiff.summary.added.toLocaleString()}`,
      tone: "positive",
      icon: "finding",
      dividerBefore: changes.lines.length > 0,
    });
  }

  return changes;
}

async function loadTargetUrlSources(targetDomainId: string) {
  const rows = await prisma.discoveredUrl.findMany({
    where: { targetDomainId },
    select: { engines: true },
    take: 50_000,
  });

  const engineCounts = new Map<string, number>();
  for (const row of rows) {
    const engines = row.engines ?? [];
    if (engines.length === 0) {
      engineCounts.set("Unknown", (engineCounts.get("Unknown") ?? 0) + 1);
    } else {
      for (const engine of engines) {
        const label = formatEngineLabel(engine);
        engineCounts.set(label, (engineCounts.get(label) ?? 0) + 1);
      }
    }
  }

  const sourceEntries = [...engineCounts.entries()].sort((a, b) => b[1] - a[1]);
  const urlTotalForSources = sourceEntries.reduce((s, [, n]) => s + n, 0);
  const sources: SummarySourceSlice[] = sourceEntries.slice(0, 4).map(([label, count], i) => ({
    label,
    count,
    percent: urlTotalForSources ? Math.round((count / urlTotalForSources) * 1000) / 10 : 0,
    color: SOURCE_COLORS[i % SOURCE_COLORS.length],
  }));

  return { sources, urlTotalForSources };
}

/** Global target summary — same shape as scan summary, aggregated across all scans. */
export async function loadTargetSummary(targetDomainId: string): Promise<ScanSummaryData> {
  const [findingGroups, urlCategoryCounts, categories, latestFindingRows, latestScan] =
    await Promise.all([
      prisma.analysisFinding.groupBy({
        by: ["findingType"],
        where: { targetDomainId },
        _count: { _all: true },
        orderBy: { _count: { findingType: "desc" } },
      }),
      countDiscoveredUrlsByCategory(prisma, targetDomainId),
      prisma.extensionCategory.findMany({
        select: { id: true, slug: true, displayName: true },
      }),
      prisma.analysisFinding.findMany({
        where: { targetDomainId },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          discoveredUrl: { select: { urlText: true } },
        },
      }),
      prisma.scanJob.findFirst({
        where: { targetDomainId, status: ScanJobStatus.COMPLETED },
        orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          completedAt: true,
          createdAt: true,
          observedVersion: true,
        },
      }),
    ]);

  const previousScan = latestScan
    ? await prisma.scanJob.findFirst({
        where: {
          targetDomainId,
          status: ScanJobStatus.COMPLETED,
          id: { not: latestScan.id },
          ...(latestScan.completedAt ? { completedAt: { lt: latestScan.completedAt } } : {}),
        },
        orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
        select: { id: true, completedAt: true, createdAt: true, observedVersion: true },
      })
    : null;

  const emptyPrevious = new Map<string, number>();

  const findingsItems = findingGroups.slice(0, 10).map((g) => ({
    label: g.findingType,
    count: g._count._all,
  }));
  const findingsTop10 = buildRankRows(findingsItems, emptyPrevious, resolveFindingRankVisual);
  const findingsTypeTotal = findingGroups.length;

  const urlCategoryItems = buildUrlCategoryRankItems(urlCategoryCounts, categories);
  const urlCategoriesTop10 = buildRankRows(
    urlCategoryItems.map(({ label, count }) => ({ label, count })),
    emptyPrevious,
    resolveCategoryRankVisual,
  );
  const urlCategoryTotal = countUrlCategoryBuckets(urlCategoryCounts);

  let changes: ScanSummaryData["changes"] = {
    baselineScanId: null,
    baselineLabel: null,
    lines: [],
  };

  if (latestScan && previousScan) {
    const availability = getObservedAvailability(latestScan);
    changes = await buildChangesSincePreviousScan(previousScan, latestScan.id, availability);
  }

  const latestFindings = latestFindingRows.map((f) => ({
    id: f.id,
    findingType: f.findingType,
    url: f.discoveredUrl.urlText,
    description: f.snippet
      ? f.snippet.length > 80
        ? `${f.snippet.slice(0, 80)}…`
        : f.snippet
      : `Found ${formatFindingFoundAt(f.createdAt)}`,
  }));

  const { sources, urlTotalForSources } = await loadTargetUrlSources(targetDomainId);

  const discoveryTimeline = await loadDiscoveryTimeline(
    targetDomainId,
    latestScan?.id ?? "",
  );

  return {
    findingsTop10,
    findingsTypeTotal,
    urlCategoriesTop10,
    urlCategoryTotal,
    changes,
    latestFindings,
    sources,
    urlTotalForSources,
    discoveryTimeline,
  };
}

function buildSourcesFromObservedUrls(
  urlRows: {
    engines: EngineProvider[];
    discoveredUrl: { engines: EngineProvider[] } | null;
  }[],
  enabledEngines: EngineProvider[],
): { sources: SummarySourceSlice[]; urlTotalForSources: number } {
  const engineCounts = new Map<string, number>();

  for (const row of urlRows) {
    const engines = enginesObservedInScan(
      row.engines,
      row.discoveredUrl?.engines,
      enabledEngines,
    );
    if (engines.length === 0) {
      engineCounts.set("Unknown", (engineCounts.get("Unknown") ?? 0) + 1);
      continue;
    }
    for (const engine of engines) {
      const label = formatEngineLabel(engine);
      engineCounts.set(label, (engineCounts.get(label) ?? 0) + 1);
    }
  }

  const sourceEntries = [...engineCounts.entries()].sort((a, b) => b[1] - a[1]);
  const urlTotalForSources = sourceEntries.reduce((s, [, n]) => s + n, 0);
  const sources: SummarySourceSlice[] = sourceEntries.slice(0, 4).map(([label, count], i) => ({
    label,
    count,
    percent: urlTotalForSources ? Math.round((count / urlTotalForSources) * 1000) / 10 : 0,
    color: SOURCE_COLORS[i % SOURCE_COLORS.length],
  }));

  return { sources, urlTotalForSources };
}

export async function loadScanSummary(
  scanId: string,
  targetDomainId: string,
  availability: ObservedAvailability,
  scanCompletedAt: Date | null,
): Promise<ScanSummaryData> {
  const previousScan = await prisma.scanJob.findFirst({
    where: {
      targetDomainId,
      status: ScanJobStatus.COMPLETED,
      id: { not: scanId },
      ...(scanCompletedAt ? { completedAt: { lt: scanCompletedAt } } : {}),
    },
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true, completedAt: true, createdAt: true },
  });

  const [scanJob, findingGroups, urlCategoryCounts, categories, latestFindingRows] =
    await Promise.all([
      prisma.scanJob.findUnique({
        where: { id: scanId },
        select: { config: true },
      }),
      prisma.analysisFinding.groupBy({
        by: ["findingType"],
        where: { scanJobId: scanId },
        _count: { _all: true },
        orderBy: { _count: { findingType: "desc" } },
      }),
      availability.urls === "ready"
        ? countObservedUrlsByCategory(prisma, scanId)
        : Promise.resolve(null),
      prisma.extensionCategory.findMany({
        select: { id: true, slug: true, displayName: true },
      }),
      prisma.analysisFinding.findMany({
        where: { scanJobId: scanId },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          discoveredUrl: { select: { urlText: true } },
        },
      }),
    ]);

  const previousFindingGroups = previousScan
    ? await prisma.analysisFinding.groupBy({
        by: ["findingType"],
        where: { scanJobId: previousScan.id },
        _count: { _all: true },
      })
    : [];

  const previousUrlCategoryCounts =
    previousScan && availability.urls === "ready"
      ? await countObservedUrlsByCategory(prisma, previousScan.id)
      : null;

  const previousFindingsByType = new Map(
    previousFindingGroups.map((g) => [g.findingType, g._count._all]),
  );

  const findingsItems = findingGroups.slice(0, 10).map((g) => ({
    label: g.findingType,
    count: g._count._all,
  }));
  const findingsTop10 = buildRankRows(
    findingsItems,
    previousFindingsByType,
    resolveFindingRankVisual,
  );
  const findingsTypeTotal = findingGroups.length;

  const urlCategoryItems = buildUrlCategoryRankItems(
    urlCategoryCounts,
    categories,
  );

  const previousUrlByLabel = buildUrlCategoryLabelCountMap(
    previousUrlCategoryCounts,
    categories,
  );

  const urlCategoriesTop10 = buildRankRows(
    urlCategoryItems.map(({ label, count }) => ({ label, count })),
    previousUrlByLabel,
    resolveCategoryRankVisual,
  );
  const urlCategoryTotal = countUrlCategoryBuckets(urlCategoryCounts);

  const changes: ScanSummaryData["changes"] = previousScan
    ? await buildChangesSincePreviousScan(previousScan, scanId, availability)
    : {
        baselineScanId: null,
        baselineLabel: null,
        lines: [],
      };

  const latestFindings = latestFindingRows.map((f) => ({
    id: f.id,
    findingType: f.findingType,
    url: f.discoveredUrl.urlText,
    description: f.snippet
      ? f.snippet.length > 80
        ? `${f.snippet.slice(0, 80)}…`
        : f.snippet
      : `Found ${formatFindingFoundAt(f.createdAt)}`,
  }));

  const enabledEngines = parseScanEnginesEnabled(scanJob?.config);
  const { sources, urlTotalForSources } =
    availability.urls === "ready"
      ? buildSourcesFromObservedUrls(
          await prisma.scanObservedUrl.findMany({
            where: { scanJobId: scanId },
            select: {
              engines: true,
              discoveredUrl: { select: { engines: true } },
            },
            take: 50_000,
          }),
          enabledEngines,
        )
      : { sources: [], urlTotalForSources: 0 };

  const discoveryTimeline = await loadDiscoveryTimeline(targetDomainId, scanId);

  return {
    findingsTop10,
    findingsTypeTotal,
    urlCategoriesTop10,
    urlCategoryTotal,
    changes,
    latestFindings,
    sources,
    urlTotalForSources,
    discoveryTimeline,
  };
}
