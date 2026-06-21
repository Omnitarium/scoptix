import Link from "next/link";
import { notFound } from "next/navigation";
import { FindingSource, ScanJobStatus } from "@prisma/client";
import {
  IconAlertTriangle,
  IconArrowUpRight,
  IconClock,
  IconFileText,
  IconFolder,
  IconGlobe,
  IconLink,
  IconServer,
  IconShield,
  IconTerminal,
} from "@/components/ui-icons";
import { ScanComparePanel } from "@/components/scan-compare-panel";
import { ScanDetailHeader } from "@/components/scans/scan-detail-header";
import { ScanPanelHeading } from "@/components/scans/scan-panel-heading";
import { ScanDetailTabs } from "@/components/scans/scan-detail-tabs";
import { ScanMetricCards } from "@/components/scans/scan-metric-cards";
import { ScanSummaryTab } from "@/components/scans/scan-summary-tab";
import { ScanIpsTab } from "@/components/scans/scan-ips-tab";
import { ScanTechTab, type ScanTechRow } from "@/components/scans/scan-tech-tab";
import { ScanCveTab, type ScanCveRow } from "@/components/scans/scan-cve-tab";
import { SubdomainSearchBar } from "@/components/subdomain-search-bar";
import { ObservedSubdomainRow } from "@/components/scans/observed-subdomain-row";
import { UrlFiltersToolbar } from "@/components/url-filters-toolbar";
import { subdomainHostnameSearchWhere } from "@/lib/subdomain-search-query";
import { urlExcludeWhere, normalizeExcludeKeywords } from "@/lib/url-exclude-query";
import { urlTextSearchWhere } from "@/lib/url-search-query";
import {
  buildObservedUrlsTabHref,
  parseCsvParam,
  urlTabPreserveToFixedParams,
  type UrlTabPreserve,
} from "@/lib/url-tab-params";
import { loadScanSummary } from "@/lib/scan-summary";
import {
  TablePagination,
  normalizePageSize,
} from "@/components/table-pagination";
import {
  parseSubdomainTableSort,
  sortSubdomainRows,
} from "@/lib/subdomain-table-sort";
import { SubdomainTableHeader } from "@/components/subdomains/subdomain-table-header";
import {
  compareDiffChangeCount,
  loadFindingsCompareDiff,
  loadSubdomainsCompareDiff,
  loadUrlsCompareDiff,
  loadIpResolutionsCompareDiff,
  type CompareDiffResult,
  type FindingCompareItem,
  type SubdomainCompareItem,
  type UrlCompareItem,
  type IpCompareItem,
} from "@/lib/scan-compare-diff";
import {
  formatFindingEnginesLabel,
  parseScanEnginesEnabled,
} from "@/lib/scan-engines";
import {
  countDedupedScanFindings,
  findDedupedScanFindingIds,
  groupDedupedScanFindingsByType,
} from "@/lib/target-findings-dedup";
import {
  formatScanDateTime,
  formatScanDuration,
  shortScanId,
} from "@/lib/scan-format";
import {
  getObservedAvailability,
  partialObservedPhaseLabel,
  getObservedScanSummary,
} from "@/lib/scan-observed";
import { syncScanObservedCounts } from "@/lib/scan-observed-counts";
import { parseIpTableSort, scanObservedIpOrderBy } from "@/lib/ip-table-sort";
import { prisma } from "@/lib/prisma";
import {
  categorySlugForPathnameExtension,
  countObservedUrlsByCategory,
  loadExtensionSuffixRules,
  urlCategoryPathnameWhere,
} from "@/lib/extension-category";

export const dynamic = "force-dynamic";

function asPosInt(v: string | null | undefined, fallback: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.floor(n));
}

function sp(v: string | string[] | undefined): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0] ?? "";
  return "";
}

function countLabel(value: number | null) {
  return value == null ? "—" : value.toLocaleString();
}

function dualCountLabel(numerator: number | null, denominator: number | null) {
  if (numerator == null || denominator == null) return "—";
  return `${numerator.toLocaleString()} / ${denominator.toLocaleString()}`;
}

type ObservedSubdomainRow = {
  id: string;
  hostnameNormalized: string;
  subdomain?: {
    firstSeenAt: Date | null;
    lastSeenAt: Date | null;
  } | null;
};

type ObservedUrlRow = {
  id: string;
  urlText: string;
  hostnameNormalized: string;
  pathnameExtension: string | null;
  createdAt: Date;
};

export default async function ScanObservedPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const rawSp = (await searchParams) ?? {};
  const tabRaw = (sp(rawSp.tab) || "summary").toLowerCase();
  const compareId = sp(rawSp.compare) || undefined;
  const compareSubTabRaw = sp(rawSp.cmpTab) || "findings";
  const subAll = sp(rawSp.subAll) === "1";
  const tab =
    tabRaw === "summary" ||
    tabRaw === "subdomains" ||
    tabRaw === "urls" ||
    tabRaw === "ips" ||
    tabRaw === "tech" ||
    tabRaw === "cves" ||
    tabRaw === "findings" ||
    tabRaw === "compare"
      ? tabRaw
      : "summary";
  const compareSubTab =
    compareSubTabRaw === "subdomains" || compareSubTabRaw === "urls" || compareSubTabRaw === "ips"
      ? compareSubTabRaw
      : "findings";
  const page = asPosInt(sp(rawSp.page) || null, 1);
  const perPage = normalizePageSize(sp(rawSp.perPage) || null);
  const q = sp(rawSp.q);
  const hideSubRaw = parseCsvParam(rawSp.hideSub);
  const hideKwRaw = parseCsvParam(rawSp.hideKw);
  const categorySlug = (sp(rawSp.cat) || "all").toLowerCase();
  const fType = sp(rawSp.fType) || undefined;
  const fSourceRaw = sp(rawSp.fSource) || undefined;
  const fSource =
    fSourceRaw === FindingSource.URL_STRING
      ? FindingSource.URL_STRING
      : fSourceRaw === FindingSource.RESPONSE_BODY
        ? FindingSource.RESPONSE_BODY
        : undefined;

  const subSort = parseSubdomainTableSort(sp(rawSp.subSort), sp(rawSp.subDir));

  const scan = await getObservedScanSummary(id);
  if (!scan) notFound();

  const scanEnginesEnabled = parseScanEnginesEnabled(scan.config);

  const snapshotScan = scan as typeof scan & {
    observedVersion?: number | null;
    observedFindingCount?: number | null;
    observedSubdomainCount?: number | null;
    observedUrlCount?: number | null;
    observedIpCount?: number | null;
  };
  const observedSubdomainModel = (
    prisma as typeof prisma & {
      scanObservedSubdomain: {
        count: (args: Record<string, unknown>) => Promise<number>;
        findMany: (
          args: Record<string, unknown>,
        ) => Promise<ObservedSubdomainRow[]>;
      };
    }
  ).scanObservedSubdomain;
  const observedUrlModel = (
    prisma as typeof prisma & {
      scanObservedUrl: {
        count: (args: Record<string, unknown>) => Promise<number>;
        findMany: (
          args: Record<string, unknown>,
        ) => Promise<ObservedUrlRow[]>;
      };
    }
  ).scanObservedUrl;

  const availability = getObservedAvailability({
    observedVersion: snapshotScan.observedVersion,
  });

  const observedCounts =
    scan.status === ScanJobStatus.COMPLETED
      ? await syncScanObservedCounts(prisma, id, { fixProgress: true })
      : await (async () => {
          const [findings, subdomains, urls, ips] = await Promise.all([
            countDedupedScanFindings(prisma, id),
            availability.subdomains === "ready"
              ? observedSubdomainModel.count({ where: { scanJobId: id } })
              : Promise.resolve(0),
            availability.urls === "ready"
              ? observedUrlModel.count({ where: { scanJobId: id } })
              : Promise.resolve(0),
            availability.ips === "ready"
              ? prisma.scanObservedIpResolution.count({ where: { scanJobId: id } })
              : Promise.resolve(0),
          ]);
          return { findings, subdomains, urls, ips };
        })();

  const observedFindingCount = observedCounts.findings;
  const observedSubdomainCount =
    availability.subdomains === "ready" ? observedCounts.subdomains : null;
  const observedUrlCount = availability.urls === "ready" ? observedCounts.urls : null;
  const observedIpCount = availability.ips === "ready" ? observedCounts.ips : null;

  // Always compute the technologies count so the tab badge shows before activation.
  const techDistinct = await prisma.subdomainTechnology.findMany({
    where: { scanJobId: id },
    distinct: ["name"],
    select: { name: true },
  });
  const observedTechCount = techDistinct.length;

  // Always compute the matched-CVE count so the tab badge shows before activation.
  const cveDistinct = await prisma.subdomainTechnologyCve.findMany({
    where: { subdomainTechnology: { scanJobId: id } },
    distinct: ["cveId"],
    select: { cveId: true },
  });
  const observedCveCount = cveDistinct.length;

  const urlCategoryCounts =
    availability.urls === "ready"
      ? await countObservedUrlsByCategory(prisma, id)
      : null;

  const categorizedUrlCount = urlCategoryCounts?.categorizedCount ?? 0;
  const summaryData =
    tab === "summary"
      ? await loadScanSummary(
          id,
          scan.targetDomainId,
          availability,
          scan.completedAt,
        )
      : null;

  const compareOptions =
    tab === "compare"
      ? await prisma.scanJob.findMany({
          where: {
            targetDomainId: scan.targetDomainId,
            status: ScanJobStatus.COMPLETED,
            id: { not: id },
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            createdAt: true,
            completedAt: true,
            observedVersion: true,
          },
        })
      : [];

  const selectedCompareScan =
    compareOptions.find((option) => option.id === compareId) ?? null;
  const selectedCompareAvailability = selectedCompareScan
    ? getObservedAvailability(selectedCompareScan)
    : null;

  type CompareDiffItem =
    | FindingCompareItem
    | SubdomainCompareItem
    | UrlCompareItem
    | IpCompareItem;

  let findingsDiff: CompareDiffResult<FindingCompareItem> | null = null;
  let subdomainsDiff: CompareDiffResult<SubdomainCompareItem> | null = null;
  let urlsDiff: CompareDiffResult<UrlCompareItem> | null = null;
  let ipsDiff: CompareDiffResult<IpCompareItem> | null = null;

  if (tab === "compare" && selectedCompareScan) {
    [findingsDiff, subdomainsDiff, urlsDiff, ipsDiff] = await Promise.all([
      loadFindingsCompareDiff(selectedCompareScan.id, id, perPage),
      loadSubdomainsCompareDiff(
        selectedCompareScan.id,
        id,
        perPage,
        availability,
        selectedCompareAvailability,
      ),
      loadUrlsCompareDiff(
        selectedCompareScan.id,
        id,
        perPage,
        availability,
        selectedCompareAvailability,
      ),
      loadIpResolutionsCompareDiff(
        selectedCompareScan.id,
        id,
        perPage,
        availability,
        selectedCompareAvailability,
      ),
    ]);
  }

  const compareDiff: CompareDiffResult<CompareDiffItem> | null =
    tab === "compare"
      ? compareSubTab === "findings"
        ? findingsDiff
        : compareSubTab === "subdomains"
          ? subdomainsDiff
          : compareSubTab === "ips"
            ? ipsDiff
            : urlsDiff
      : null;

  const basePath = `/scans/${id}/observed`;
  const fixedParams: Record<string, string> = { tab };
  if (tab === "subdomains" && subAll) fixedParams.subAll = "1";
  const isCompleted = scan.status === ScanJobStatus.COMPLETED;
  const showPartialNotice = scan.status !== ScanJobStatus.COMPLETED;

  const [categories, suffixRules] =
    tab === "urls" && availability.urls === "ready"
      ? await Promise.all([
          prisma.extensionCategory.findMany({ orderBy: { slug: "asc" } }),
          loadExtensionSuffixRules(prisma),
        ])
      : [[], []];

  const countByCategoryId = urlCategoryCounts?.countByCategoryId ?? new Map<number, number>();
  const uncategorizedCount = urlCategoryCounts?.uncategorizedCount ?? 0;
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const selectedCategory =
    categorySlug === "all" || categorySlug === "uncategorized"
      ? null
      : categories.find((category) => category.slug.toLowerCase() === categorySlug) ?? null;

  const effectiveCategorySlug =
    categorySlug === "uncategorized"
      ? "uncategorized"
      : categorySlug === "all"
        ? "all"
        : selectedCategory?.slug.toLowerCase() ?? "all";

  const activeCategoryId =
    effectiveCategorySlug === "all"
      ? null
      : effectiveCategorySlug === "uncategorized"
        ? -1
        : selectedCategory?.id ?? null;

  if (tab === "urls" && effectiveCategorySlug !== "all") {
    fixedParams.cat = effectiveCategorySlug;
  }

  const findingDedupFilter = {
    ...(fType ? { findingType: fType } : {}),
    ...(fSource ? { source: fSource } : {}),
  };
  const findingsTotal =
    tab === "findings"
      ? await countDedupedScanFindings(prisma, id, findingDedupFilter)
      : 0;
  const findingsPages = Math.max(1, Math.ceil(findingsTotal / perPage));
  const safeFindingsPage = Math.min(page, findingsPages);
  const findingGroupsRaw =
    tab === "findings" ? await groupDedupedScanFindingsByType(prisma, id) : [];
  const findingGroups = findingGroupsRaw.map((g) => ({
    findingType: g.findingType,
    _count: { _all: g.count },
  }));
  const dedupedFindingIds =
    tab === "findings"
      ? await findDedupedScanFindingIds(prisma, id, {
          skip: (safeFindingsPage - 1) * perPage,
          take: perPage,
          filter: findingDedupFilter,
        })
      : [];
  const findingsRows =
    dedupedFindingIds.length > 0
      ? await prisma.analysisFinding.findMany({
          where: { id: { in: dedupedFindingIds } },
          include: {
            discoveredUrl: {
              select: {
                id: true,
                urlText: true,
                externalSeenAt: true,
                engines: true,
              },
            },
          },
        })
      : [];
  const findingsById = new Map(findingsRows.map((f) => [f.id, f]));
  const findings =
    tab === "findings"
      ? dedupedFindingIds.map((fid) => findingsById.get(fid)).filter((f) => f !== undefined)
      : [];

  const subdomainsSearchFilter = tab === "subdomains" ? subdomainHostnameSearchWhere(q) : undefined;
  const subdomainsWhere = {
    scanJobId: id,
    ...(subdomainsSearchFilter ?? {}),
  } as const;
  const subdomainsTotal =
    tab === "subdomains" && availability.subdomains === "ready"
      ? subAll
        ? await prisma.subdomain.count({
            where: {
              targetDomainId: scan.targetDomainId,
              ...(subdomainsSearchFilter ?? {}),
            },
          })
        : await observedSubdomainModel.count({ where: subdomainsWhere })
      : 0;
  const subdomainsPages = Math.max(1, Math.ceil(subdomainsTotal / perPage));
  const safeSubdomainsPage = Math.min(page, subdomainsPages);
  const rawSubdomains =
    tab === "subdomains" && availability.subdomains === "ready" && !subAll
      ? await observedSubdomainModel.findMany({
          where: subdomainsWhere,
          include: {
            subdomain: {
              select: {
                id: true,
                firstSeenAt: true,
                lastSeenAt: true,
              },
            },
          },
        })
      : [];

  const rawAllSubdomains =
    tab === "subdomains" && availability.subdomains === "ready" && subAll
      ? await prisma.subdomain.findMany({
          where: {
            targetDomainId: scan.targetDomainId,
            ...(subdomainsSearchFilter ?? {}),
          },
          select: {
            id: true,
            hostnameNormalized: true,
            firstSeenAt: true,
            lastSeenAt: true,
            observedUrls: {
              where: { scanJobId: id },
              select: { id: true },
              take: 1,
            },
          },
        })
      : [];

  const ipCountsByHostnameRaw =
    tab === "subdomains" && availability.subdomains === "ready"
      ? await prisma.ipResolutionSighting.groupBy({
          by: ["hostnameNormalized"],
          where: {
            scanJobId: id,
            hostnameNormalized: {
              in: subAll
                ? rawAllSubdomains.map((s) => s.hostnameNormalized)
                : rawSubdomains.map((s) => s.hostnameNormalized),
            },
          },
          _count: { ipResolutionId: true },
        })
      : [];
  const ipCountsByHostname = new Map(
    ipCountsByHostnameRaw.map((g) => [g.hostnameNormalized, g._count.ipResolutionId]),
  );

  const latestSightingsRaw =
    tab === "subdomains" && availability.subdomains === "ready"
      ? await prisma.ipResolutionSighting.findMany({
          where: {
            scanJobId: id,
            hostnameNormalized: {
              in: subAll
                ? rawAllSubdomains.map((s) => s.hostnameNormalized)
                : rawSubdomains.map((s) => s.hostnameNormalized),
            },
          },
          orderBy: { lastResolvedAt: "desc" },
          distinct: ["hostnameNormalized"],
          select: {
            hostnameNormalized: true,
            lastResolvedAt: true,
            ipResolution: { select: { ipAddress: true } },
          },
        })
      : [];
  const latestSightingsByHostname = new Map(
    latestSightingsRaw.map((s) => [s.hostnameNormalized, s]),
  );

  const subdomains = (() => {
    if (tab !== "subdomains" || availability.subdomains !== "ready" || subAll) return [];
    const withStats = rawSubdomains.map((subdomain) => {
      const latest = latestSightingsByHostname.get(subdomain.hostnameNormalized);
      return {
        ...subdomain,
        ipCount: ipCountsByHostname.get(subdomain.hostnameNormalized) || 0,
        latestIp: latest?.ipResolution.ipAddress ?? null,
        lastResolvedAt: latest?.lastResolvedAt ?? null,
      };
    });
    return sortSubdomainRows(withStats, subSort).slice(
      (safeSubdomainsPage - 1) * perPage,
      safeSubdomainsPage * perPage,
    );
  })();

  const allSubdomains = (() => {
    if (tab !== "subdomains" || availability.subdomains !== "ready" || !subAll) return [];
    const withStats = rawAllSubdomains.map((subdomain) => {
      const latest = latestSightingsByHostname.get(subdomain.hostnameNormalized);
      return {
        ...subdomain,
        ipCount: ipCountsByHostname.get(subdomain.hostnameNormalized) || 0,
        latestIp: latest?.ipResolution.ipAddress ?? null,
        lastResolvedAt: latest?.lastResolvedAt ?? null,
      };
    });
    return sortSubdomainRows(withStats, subSort).slice(
      (safeSubdomainsPage - 1) * perPage,
      safeSubdomainsPage * perPage,
    );
  })();

  if (tab === "findings" && fType) fixedParams.fType = fType;
  if (tab === "findings" && fSource) fixedParams.fSource = fSource;
  if (tab === "subdomains" && q?.trim()) fixedParams.q = q.trim();

  const urlSearchFilter = urlTextSearchWhere(q);
  const hideKw = normalizeExcludeKeywords(hideKwRaw);
  const validatedHideSubs =
    tab === "urls" && availability.urls === "ready" && hideSubRaw.length > 0
      ? await prisma.subdomain.findMany({
          where: {
            id: { in: hideSubRaw },
            observedUrls: { some: { scanJobId: id } },
          },
          select: { id: true, hostnameNormalized: true },
          orderBy: { hostnameNormalized: "asc" },
        })
      : [];
  const hideSubIds = validatedHideSubs.map((s) => s.id);
  const urlExcludeFilter = urlExcludeWhere(hideSubIds, hideKw);

  const subdomainPickerOptions =
    tab === "urls" && availability.urls === "ready"
      ? (
          await prisma.scanObservedUrl.findMany({
            where: { scanJobId: id, subdomainId: { not: null } },
            distinct: ["subdomainId"],
            select: {
              subdomain: {
                select: { id: true, hostnameNormalized: true },
              },
            },
          })
        )
          .map((row) => row.subdomain)
          .filter((s): s is { id: string; hostnameNormalized: string } => s != null)
          .sort((a, b) => a.hostnameNormalized.localeCompare(b.hostnameNormalized))
      : [];

  const urlTabPreserve: UrlTabPreserve = {
    cat: effectiveCategorySlug,
    perPage,
    q: q || undefined,
    hideSub: hideSubIds.length > 0 ? hideSubIds : undefined,
    hideKw: hideKw.length > 0 ? hideKw : undefined,
  };

  const urlsWhere = {
    scanJobId: id,
    ...(urlSearchFilter ?? {}),
    ...(urlExcludeFilter ?? {}),
    ...urlCategoryPathnameWhere(activeCategoryId, suffixRules),
  } as const;
  const urlsTotal =
    tab === "urls" && availability.urls === "ready"
      ? await observedUrlModel.count({ where: urlsWhere })
      : 0;
  const urlsPages = Math.max(1, Math.ceil(urlsTotal / perPage));
  const safeUrlsPage = Math.min(page, urlsPages);
  const urls =
    tab === "urls" && availability.urls === "ready"
      ? await observedUrlModel.findMany({
          where: urlsWhere,
          orderBy: { createdAt: "desc" },
          skip: (safeUrlsPage - 1) * perPage,
          take: perPage,
        })
      : [];

  const ipSort = parseIpTableSort(sp(rawSp.ipSort), sp(rawSp.ipDir), "scan");

  const ipsTotal =
    tab === "ips" && availability.ips === "ready"
      ? await prisma.scanObservedIpResolution.count({ where: { scanJobId: id } })
      : 0;
  const ipsPages = Math.max(1, Math.ceil(ipsTotal / perPage));
  const safeIpsPage = Math.min(page, ipsPages);
  const ips =
    tab === "ips" && availability.ips === "ready"
      ? await prisma.scanObservedIpResolution.findMany({
          where: { scanJobId: id },
          orderBy: scanObservedIpOrderBy(ipSort),
          skip: (safeIpsPage - 1) * perPage,
          take: perPage,
          select: {
            id: true,
            ipResolutionId: true,
            ipAddress: true,
            lastResolvedAt: true,
            reportedByHostname: true,
            ipResolution: { select: { hostnameCount: true } },
          },
        })
      : [];

  const scanIpRows =
    tab === "ips" && availability.ips === "ready"
      ? ips.map((ip) => ({
          id: ip.id,
          ipResolutionId: ip.ipResolutionId,
          ipAddress: ip.ipAddress,
          lastResolvedAt: ip.lastResolvedAt,
          hostnameCount: ip.ipResolution?.hostnameCount ?? 1,
          lastSeenBy: ip.reportedByHostname,
        }))
      : [];

  /* ── Technologies (Wappalyzer) ── */
  // Group SubdomainTechnology rows detected during this scan by technology name.
  const techRecords =
    tab === "tech"
      ? await prisma.subdomainTechnology.findMany({
          where: { scanJobId: id },
          orderBy: [{ name: "asc" }],
          select: {
            name: true,
            version: true,
            categories: true,
            iconName: true,
            website: true,
            confidence: true,
            subdomain: { select: { hostnameNormalized: true } },
          },
        })
      : [];

  const techGrouped: ScanTechRow[] = (() => {
    if (tab !== "tech") return [];
    const map = new Map<
      string,
      {
        name: string;
        iconName: string | null;
        website: string | null;
        categories: Set<string>;
        versions: Set<string>;
        hosts: Map<string, string | null>;
      }
    >();
    for (const r of techRecords) {
      const host = r.subdomain?.hostnameNormalized;
      if (!host) continue;
      let g = map.get(r.name);
      if (!g) {
        g = {
          name: r.name,
          iconName: r.iconName,
          website: r.website,
          categories: new Set(),
          versions: new Set(),
          hosts: new Map(),
        };
        map.set(r.name, g);
      }
      for (const c of r.categories) g.categories.add(c);
      if (r.version) g.versions.add(r.version);
      // Keep the most specific (non-null) version per host.
      if (!g.hosts.has(host) || (r.version && !g.hosts.get(host))) {
        g.hosts.set(host, r.version);
      }
    }
    return Array.from(map.values())
      .map((g) => ({
        name: g.name,
        iconName: g.iconName,
        website: g.website,
        categories: Array.from(g.categories).sort(),
        versions: Array.from(g.versions).sort(),
        hosts: Array.from(g.hosts.entries())
          .map(([hostnameNormalized, version]) => ({ hostnameNormalized, version }))
          .sort((a, b) => a.hostnameNormalized.localeCompare(b.hostnameNormalized)),
        hostCount: g.hosts.size,
      }))
      .sort((a, b) => b.hostCount - a.hostCount || a.name.localeCompare(b.name));
  })();

  const techTotal = techGrouped.length;
  const techPages = Math.max(1, Math.ceil(techTotal / perPage));
  const safeTechPage = Math.min(page, techPages);
  const techRows = techGrouped.slice(
    (safeTechPage - 1) * perPage,
    safeTechPage * perPage,
  );

  /* ── Matched CVEs ── */
  // Group SubdomainTechnologyCve rows (matched in this scan) by CVE.
  const cveRecords =
    tab === "cves"
      ? await prisma.subdomainTechnologyCve.findMany({
          where: { subdomainTechnology: { scanJobId: id } },
          select: {
            cveId: true,
            matchedVersion: true,
            cve: {
              select: {
                published: true,
                description: true,
                cvssSeverity: true,
                cvssScore: true,
              },
            },
            subdomainTechnology: {
              select: {
                name: true,
                subdomain: { select: { hostnameNormalized: true } },
              },
            },
          },
        })
      : [];

  const cveGrouped: ScanCveRow[] = (() => {
    if (tab !== "cves") return [];
    const map = new Map<
      string,
      {
        cveId: string;
        severity: string | null;
        score: number | null;
        published: string;
        description: string;
        hosts: Map<string, { technology: string; matchedVersion: string | null }>;
      }
    >();
    for (const r of cveRecords) {
      const host = r.subdomainTechnology.subdomain?.hostnameNormalized;
      if (!host) continue;
      let g = map.get(r.cveId);
      if (!g) {
        g = {
          cveId: r.cveId,
          severity: r.cve.cvssSeverity,
          score: r.cve.cvssScore,
          published: r.cve.published.toISOString(),
          description: r.cve.description,
          hosts: new Map(),
        };
        map.set(r.cveId, g);
      }
      // Key by host+technology so a host can appear once per matching tech.
      const key = `${host}::${r.subdomainTechnology.name}`;
      if (!g.hosts.has(key)) {
        g.hosts.set(key, {
          technology: r.subdomainTechnology.name,
          matchedVersion: r.matchedVersion,
        });
      }
    }
    return Array.from(map.values())
      .map((g) => ({
        cveId: g.cveId,
        severity: g.severity,
        score: g.score,
        published: g.published,
        description: g.description,
        hosts: Array.from(g.hosts.entries())
          .map(([key, v]) => ({
            hostnameNormalized: key.split("::")[0],
            technology: v.technology,
            matchedVersion: v.matchedVersion,
          }))
          .sort((a, b) => a.hostnameNormalized.localeCompare(b.hostnameNormalized)),
        hostCount: g.hosts.size,
      }))
      .sort(
        (a, b) =>
          (b.score ?? 0) - (a.score ?? 0) ||
          b.hostCount - a.hostCount ||
          a.cveId.localeCompare(b.cveId),
      );
  })();

  const cveTotal = cveGrouped.length;
  const cvePages = Math.max(1, Math.ceil(cveTotal / perPage));
  const safeCvePage = Math.min(page, cvePages);
  const cveRows = cveGrouped.slice((safeCvePage - 1) * perPage, safeCvePage * perPage);

  function tabHref(nextTab: string) {
    const q = new URLSearchParams();
    q.set("tab", nextTab);
    q.set("perPage", String(perPage));
    if (nextTab === "compare" && selectedCompareScan) {
      q.set("compare", selectedCompareScan.id);
      q.set("cmpTab", compareSubTab);
    }
    return `${basePath}?${q.toString()}`;
  }

  const scanTabs = [
    {
      key: "summary",
      label: "Summary",
      icon: IconFileText,
      href: tabHref("summary"),
      count: null,
    },
    {
      key: "subdomains",
      label: "Subdomains",
      icon: IconGlobe,
      href: tabHref("subdomains"),
      count: dualCountLabel(observedSubdomainCount, scan.targetDomain.cachedSubdomainCount),
    },
    {
      key: "urls",
      label: "URLs",
      icon: IconLink,
      href: tabHref("urls"),
      count: countLabel(observedUrlCount),
    },
    {
      key: "ips",
      label: "IPs",
      icon: IconServer,
      href: tabHref("ips"),
      count: countLabel(observedIpCount),
    },
    {
      key: "tech",
      label: "Technologies",
      icon: IconTerminal,
      href: tabHref("tech"),
      count: countLabel(observedTechCount),
    },
    {
      key: "cves",
      label: "CVEs",
      icon: IconShield,
      href: tabHref("cves"),
      count: countLabel(observedCveCount),
    },
    {
      key: "findings",
      label: "Findings",
      icon: IconAlertTriangle,
      href: tabHref("findings"),
      count: countLabel(observedFindingCount),
    },
    {
      key: "compare",
      label: "Comparison",
      icon: IconArrowUpRight,
      href: tabHref("compare"),
      rotateIcon: true,
      count:
        tab === "compare" && selectedCompareScan
          ? compareDiffChangeCount(compareDiff)?.toLocaleString() ?? "—"
          : "—",
    },
  ];

  const metricCards = [
    {
      icon: IconGlobe,
      iconBg: "scx-metric-icon-badge--success",
      iconColor: "",
      value: countLabel(observedSubdomainCount),
      label: "Subdomains (with URLs)",
    },
    {
      icon: IconServer,
      iconBg: "scx-metric-icon-badge--success",
      iconColor: "",
      value: countLabel(observedIpCount),
      label: "IP Addresses",
    },
    {
      icon: IconLink,
      iconBg: "scx-metric-icon-badge--success",
      iconColor: "",
      value: countLabel(observedUrlCount),
      label: "URLs",
    },
    {
      icon: IconAlertTriangle,
      iconBg: "scx-metric-icon-badge--success",
      iconColor: "",
      value: countLabel(observedFindingCount),
      label: "Findings",
    },
    {
      icon: IconFolder,
      iconBg: "scx-metric-icon-badge--success",
      iconColor: "",
      value: countLabel(categorizedUrlCount),
      label: "Categories",
    },
    {
      icon: IconClock,
      iconBg: "scx-metric-icon-badge--success",
      iconColor: "",
      value: formatScanDuration(scan.startedAt, scan.completedAt),
      label: "Scan duration",
    },
  ];

  function urlFilterHref(nextCategory: string) {
    return buildObservedUrlsTabHref(id, {
      ...urlTabPreserve,
      cat: nextCategory,
      page: undefined,
    });
  }

  const urlFixedParams = urlTabPreserveToFixedParams(urlTabPreserve);

  function findingFilterHref(overrides: {
    type?: string;
    source?: FindingSource;
    page?: string;
  }) {
    const q = new URLSearchParams();
    q.set("tab", "findings");
    q.set("perPage", String(perPage));
    const nextType = "type" in overrides ? overrides.type : fType;
    const nextSource = "source" in overrides ? overrides.source : fSource;
    if (nextType) q.set("fType", nextType);
    if (nextSource) q.set("fSource", nextSource);
    const nextPage = overrides.page ?? "1";
    if (nextPage !== "1") q.set("page", nextPage);
    return `${basePath}?${q.toString()}`;
  }

  function subdomainModeHref(nextAll: boolean) {
    const q = new URLSearchParams();
    q.set("tab", "subdomains");
    q.set("perPage", String(perPage));
    if (nextAll) q.set("subAll", "1");
    return `${basePath}?${q.toString()}`;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ScanDetailHeader
        domain={scan.targetDomain.domainNormalized}
        status={scan.status}
        statusLabel={scan.status === ScanJobStatus.COMPLETED ? "Completed" : scan.status}
        scannedAt={formatScanDateTime(scan.completedAt ?? scan.createdAt)}
        scanIdShort={shortScanId(id)}
        duration={formatScanDuration(scan.startedAt, scan.completedAt)}
        compareHref={tabHref("compare")}
        targetHref={`/targets/${scan.targetDomainId}?tab=summary`}
        scanId={id}
        exportAvailability={availability}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <ScanMetricCards metrics={metricCards} />

        <div className="mt-6">
          <ScanDetailTabs tabs={scanTabs} activeKey={tab} />
        </div>

        {showPartialNotice && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-amber-800">
              Partial observed results
            </div>
            <div className="mt-2 text-sm text-amber-900">
              {partialObservedPhaseLabel(scan.phase) ??
                `This scan is ${scan.status.toLowerCase()}, so observed results may be incomplete.`}{" "}
              Counts refresh as new URLs and findings are written. Wayback URLs will appear when that phase runs.
            </div>
          </div>
        )}

        <div>
          {tab === "summary" && summaryData && (
            <ScanSummaryTab
              data={summaryData}
              basePath={basePath}
              compareHref={tabHref("compare")}
            />
          )}

          {tab === "compare" && (
            <div className="space-y-6">
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { key: "findings", label: "Findings" },
                    { key: "subdomains", label: "Subdomains" },
                    { key: "urls", label: "URLs" },
                    { key: "ips", label: "IPs" },
                  ] as const
                ).map((item) => {
                  const q = new URLSearchParams();
                  q.set("tab", "compare");
                  q.set("cmpTab", item.key);
                  q.set("perPage", String(perPage));
                  if (selectedCompareScan) q.set("compare", selectedCompareScan.id);
                  return (
                    <Link
                      key={item.key}
                      href={`${basePath}?${q.toString()}`}
                      className={[
                        "rounded-lg border px-3 py-1.5 text-[12px] transition-colors",
                        compareSubTab === item.key
                          ? "border-accent bg-accent/20 text-cream shadow-glass ring-1 ring-accent/25"
                          : "border-line text-muted hover:bg-[var(--nav-hover-bg)] hover:text-cream",
                      ].join(" ")}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
              <ScanComparePanel
                currentScanId={id}
                compareOptions={compareOptions}
                selectedCompareId={selectedCompareScan?.id}
                selectedCompareScan={selectedCompareScan}
                targetLabel={scan.targetDomain.domainNormalized}
                tab={compareSubTab}
                perPage={perPage}
                compareDiff={compareDiff}
                basePath={basePath}
                tabParamKey="cmpTab"
                mainTabParamKey="tab"
                mainTabValue="compare"
              />
            </div>
          )}

          {tab === "findings" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={findingFilterHref({ type: undefined })}
                  className={[
                    "rounded-lg border px-3 py-1.5 text-[12px] transition-colors",
                    !fType
                      ? "border-accent/60 bg-accent/10 text-cream"
                      : "border-line text-muted hover:bg-[var(--nav-hover-bg)] hover:text-cream",
                  ].join(" ")}
                >
                  All ({observedFindingCount.toLocaleString()})
                </Link>
                {findingGroups.map((group) => (
                  <Link
                    key={group.findingType}
                    href={findingFilterHref({ type: group.findingType })}
                    className={[
                      "rounded-lg border px-3 py-1.5 text-[12px] transition-colors",
                      fType === group.findingType
                        ? "border-accent/60 bg-accent/10 text-cream"
                        : "border-line text-muted hover:bg-[var(--nav-hover-bg)] hover:text-cream",
                    ].join(" ")}
                  >
                    {group.findingType} ({group._count._all.toLocaleString()})
                  </Link>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                  Source:
                </span>
                {[
                  { label: "All", value: undefined },
                  { label: "URL String", value: FindingSource.URL_STRING },
                  { label: "Response Body", value: FindingSource.RESPONSE_BODY },
                ].map((option) => (
                  <Link
                    key={option.label}
                    href={findingFilterHref({ source: option.value })}
                    className={[
                      "rounded-lg border px-3 py-1.5 text-[11px] transition-colors",
                      fSource === option.value || (!fSource && !option.value)
                        ? "border-accent/40 bg-accent/8 text-cream"
                        : "border-line text-muted hover:bg-[var(--nav-hover-bg)] hover:text-cream",
                    ].join(" ")}
                  >
                    {option.label}
                  </Link>
                ))}
              </div>

              <div className="glass-panel overflow-hidden rounded-2xl">
                <div className="border-b border-line bg-[var(--table-header-bg)] px-5 py-4">
                  <ScanPanelHeading
                    title="Findings observed in this scan"
                    description={
                      isCompleted
                        ? "Historical findings scoped to this scan only."
                        : "Current observed findings for this in-progress or partial scan."
                    }
                  />
                </div>

                <div className="hidden border-b border-line bg-[var(--table-header-bg)] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted lg:grid lg:grid-cols-12 lg:gap-3">
                  <div className="col-span-1">Type</div>
                  <div className="col-span-1">Engine</div>
                  <div className="col-span-6">URL</div>
                  <div className="col-span-2">Snippet</div>
                  <div className="col-span-2 text-right">Date</div>
                </div>

                <div className="divide-y divide-line">
                  {findings.length === 0 ? (
                    <div className="px-5 py-8 text-center text-[13px] text-muted">
                      No findings match this filter.
                    </div>
                  ) : (
                    findings.map((finding) => (
                      <div
                        key={finding.id}
                        className="flex flex-col gap-2 px-5 py-3 lg:grid lg:grid-cols-12 lg:items-start lg:gap-3"
                      >
                        <div className="col-span-1">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-accent">
                            {finding.findingType}
                          </div>
                          <div className="mt-1">
                            <span className="text-[9px] font-medium tracking-wide text-muted">
                              {finding.source === FindingSource.URL_STRING ? "URL" : "Body"}
                            </span>
                          </div>
                        </div>
                        <div className="col-span-1 text-[10px] text-muted">
                          {formatFindingEnginesLabel(
                            finding.engines,
                            finding.discoveredUrl.engines,
                            scanEnginesEnabled,
                          ) || "—"}
                        </div>
                        <div className="col-span-6 min-w-0">
                          <div
                            className="break-all font-mono text-[11px] text-cream/90"
                            title={finding.discoveredUrl.urlText}
                          >
                            {finding.discoveredUrl.urlText}
                          </div>
                        </div>
                        <div className="col-span-2 min-w-0">
                          {finding.snippet ? (
                            <div
                              className="break-all rounded-md border border-line bg-black/15 px-2 py-1.5 font-mono text-[10px] text-cream/80"
                              title={finding.snippet}
                            >
                              {finding.snippet}
                            </div>
                          ) : (
                            <span className="text-[11px] text-muted">—</span>
                          )}
                        </div>
                        <div className="col-span-2 text-left font-mono text-[10px] text-muted lg:text-right">
                          <div title="Date found by this scan">
                            Found: {formatScanDateTime(finding.createdAt)}
                          </div>
                          {finding.discoveredUrl.externalSeenAt && (
                            <div
                              title="Date reported in external intel"
                              className="mt-1 text-accent/70"
                            >
                              Intel: {formatScanDateTime(finding.discoveredUrl.externalSeenAt)}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <TablePagination
                  currentPage={safeFindingsPage}
                  totalPages={findingsPages}
                  totalItems={findingsTotal}
                  perPage={perPage}
                  basePath={basePath}
                  fixedParams={fixedParams}
                />
              </div>
            </div>
          )}

          {tab === "subdomains" && (
            <div className="glass-panel overflow-hidden rounded-2xl">
              <div className="border-b border-line bg-[var(--table-header-bg)] px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <ScanPanelHeading
                      title={subAll ? "All target subdomains" : "Subdomains with URLs in this scan"}
                      description={
                        subAll
                          ? "Complete subdomain inventory for this target. Badges indicate whether each subdomain has an observed URL in this scan."
                          : "Only subdomains that appear in the observed URL snapshot for this scan."
                      }
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Link
                      href={subdomainModeHref(!subAll)}
                      className={[
                        "shrink-0 rounded-lg border px-3 py-1.5 text-[11px] transition-colors",
                        !subAll
                          ? "border-accent/60 bg-accent/10 text-cream"
                          : "border-line text-muted hover:bg-[var(--nav-hover-bg)] hover:text-cream",
                      ].join(" ")}
                    >
                      {subAll ? "Only with URLs" : "Show all subdomains"}
                    </Link>
                    <SubdomainSearchBar
                      basePath={basePath}
                      perPage={perPage}
                      subAll={subAll}
                      initialQuery={q}
                      size="sm"
                    />
                  </div>
                </div>
              </div>

              {availability.subdomains !== "ready" ? (
                <div className="px-5 py-8 text-center text-[13px] text-muted">
                  Observed subdomains are unavailable for legacy scans that predate snapshot tracking.
                </div>
              ) : (
                <>
                  <SubdomainTableHeader
                    sort={subSort}
                    basePath={basePath}
                    fixedParams={{ ...fixedParams, ...(subAll ? { subAll: "1" } : {}) }}
                    observedScanView
                  />

                  <div className="divide-y divide-line">
                    {!subAll && subdomains.length === 0 ? (
                      <div className="px-5 py-8 text-center text-[13px] text-muted">
                        No subdomains observed in this scan.
                      </div>
                    ) : subAll && allSubdomains.length === 0 ? (
                      <div className="px-5 py-8 text-center text-[13px] text-muted">
                        No subdomains yet for this target.
                      </div>
                    ) : !subAll ? (
                      subdomains.map((subdomain) => {
                        const latest = latestSightingsByHostname.get(subdomain.hostnameNormalized);
                        return (
                          <ObservedSubdomainRow
                            key={subdomain.id}
                            scanJobId={id}
                            targetDomainId={scan.targetDomainId}
                            row={{
                              hostnameNormalized: subdomain.hostnameNormalized,
                              ipCount: ipCountsByHostname.get(subdomain.hostnameNormalized) || 0,
                              latestIp: latest?.ipResolution.ipAddress ?? null,
                              lastResolvedAt: latest?.lastResolvedAt ?? null,
                            }}
                          />
                        );
                      })
                    ) : (
                      allSubdomains.map((subdomain) => {
                        const hasUrl = subdomain.observedUrls.length > 0;
                        const badge = (
                          <span
                            className={[
                              "scx-subdomain-url-badge",
                              hasUrl ? "scx-subdomain-url-badge--has" : "scx-subdomain-url-badge--no",
                            ].join(" ")}
                          >
                            {hasUrl ? "Has URL" : "No URL"}
                          </span>
                        );
                        const latest = latestSightingsByHostname.get(subdomain.hostnameNormalized);
                        return (
                          <ObservedSubdomainRow
                            key={subdomain.id}
                            scanJobId={id}
                            targetDomainId={scan.targetDomainId}
                            row={{
                              hostnameNormalized: subdomain.hostnameNormalized,
                              hasUrlBadge: badge,
                              ipCount: ipCountsByHostname.get(subdomain.hostnameNormalized) || 0,
                              latestIp: latest?.ipResolution.ipAddress ?? null,
                              lastResolvedAt: latest?.lastResolvedAt ?? null,
                            }}
                          />
                        );
                      })
                    )}
                  </div>

                  <TablePagination
                    currentPage={safeSubdomainsPage}
                    totalPages={subdomainsPages}
                    totalItems={subdomainsTotal}
                    perPage={perPage}
                    basePath={basePath}
                    fixedParams={{
                      ...fixedParams,
                      ...(subAll ? { subAll: "1" } : {}),
                      subSort: subSort.field,
                      subDir: subSort.dir,
                    }}
                  />
                </>
              )}
            </div>
          )}

          {tab === "urls" && (
            <div className="glass-panel overflow-hidden rounded-2xl">
              {availability.urls !== "ready" ? (
                <div className="px-5 py-8 text-center text-[13px] text-muted">
                  Observed URLs are unavailable for legacy scans that predate snapshot tracking.
                </div>
              ) : (
                <>
                  <div className="border-b border-line px-5 py-4 space-y-3">
                    <ScanPanelHeading
                      title="URLs observed in this scan"
                      description="URL snapshot scoped to this scan, independent from current target totals."
                    />
                    <UrlFiltersToolbar
                      hrefContext={{ scope: "observed", scanId: id }}
                      preserve={urlTabPreserve}
                      initialQuery={q}
                      initialHideSubIds={hideSubIds}
                      initialHideKw={hideKw}
                      subdomainOptions={subdomainPickerOptions}
                      resolvedHiddenSubdomains={validatedHideSubs}
                      totalUrls={urlsTotal}
                      currentPage={safeUrlsPage}
                      totalPages={urlsPages}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={urlFilterHref("all")}
                        className={[
                          "rounded-lg border px-3 py-1.5 text-[11px] transition-colors",
                          effectiveCategorySlug === "all"
                            ? "border-accent/60 bg-accent/10 text-cream"
                            : "border-line text-muted hover:bg-[var(--nav-hover-bg)] hover:text-cream",
                        ].join(" ")}
                      >
                        All ({(observedUrlCount ?? 0).toLocaleString()})
                      </Link>
                      <Link
                        href={urlFilterHref("uncategorized")}
                        className={[
                          "rounded-lg border px-3 py-1.5 text-[11px] transition-colors",
                          effectiveCategorySlug === "uncategorized"
                            ? "border-accent/60 bg-accent/10 text-cream"
                            : "border-line text-muted hover:bg-[var(--nav-hover-bg)] hover:text-cream",
                        ].join(" ")}
                      >
                        uncategorized ({uncategorizedCount.toLocaleString()})
                      </Link>
                      {categories.map((category) => {
                        const count = countByCategoryId.get(category.id) ?? 0;
                        const slug = category.slug.toLowerCase();
                        return (
                          <Link
                            key={category.id}
                            href={urlFilterHref(slug)}
                            className={[
                              "rounded-lg border px-3 py-1.5 text-[11px] transition-colors",
                              effectiveCategorySlug === slug
                                ? "border-accent/60 bg-accent/10 text-cream"
                                : "border-line text-muted hover:bg-[var(--nav-hover-bg)] hover:text-cream",
                            ].join(" ")}
                          >
                            {category.displayName} ({count.toLocaleString()})
                          </Link>
                        );
                      })}
                    </div>
                  </div>

                  <div className="divide-y divide-line">
                    {urls.length === 0 ? (
                      <div className="px-5 py-8 text-center text-[13px] text-muted">
                        No URLs match this filter.
                      </div>
                    ) : (
                      urls.map((url) => (
                        <div key={url.id} className="px-5 py-3">
                          <div className="break-all font-mono text-[12px] leading-relaxed text-cream">
                            {url.urlText}
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-muted">
                            <span className="rounded-md bg-accent/8 px-1.5 py-0.5 font-mono text-accent">
                              {categorySlugForPathnameExtension(
                                suffixRules,
                                url.pathnameExtension,
                                categoryById,
                              )}
                            </span>
                            <span className="font-mono">{url.hostnameNormalized}</span>
                            {url.pathnameExtension && (
                              <span className="font-mono">{url.pathnameExtension}</span>
                            )}
                          </div>
                          <div className="mt-1 font-mono text-[10px] text-muted">
                            Observed: {formatScanDateTime(url.createdAt)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <TablePagination
                    currentPage={safeUrlsPage}
                    totalPages={urlsPages}
                    totalItems={urlsTotal}
                    perPage={perPage}
                    basePath={basePath}
                    fixedParams={urlFixedParams}
                  />
                </>
              )}
            </div>
          )}

          {tab === "ips" && (
            <ScanIpsTab
              ips={scanIpRows}
              scanJobId={id}
              totalItems={ipsTotal}
              currentPage={safeIpsPage}
              totalPages={ipsPages}
              perPage={perPage}
              basePath={basePath}
              isCompleted={isCompleted}
              sort={ipSort}
            />
          )}

          {tab === "tech" && (
            <ScanTechTab
              technologies={techRows}
              totalItems={techTotal}
              currentPage={safeTechPage}
              totalPages={techPages}
              perPage={perPage}
              basePath={basePath}
              isCompleted={isCompleted}
            />
          )}

          {tab === "cves" && (
            <ScanCveTab
              cves={cveRows}
              totalItems={cveTotal}
              currentPage={safeCvePage}
              totalPages={cvePages}
              perPage={perPage}
              basePath={basePath}
              isCompleted={isCompleted}
            />
          )}
        </div>
      </div>
    </div>
  );
}
