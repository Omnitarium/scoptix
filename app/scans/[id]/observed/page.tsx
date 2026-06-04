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
  IconList,
  IconServer,
} from "@/components/ui-icons";
import { ScanComparePanel } from "@/components/scan-compare-panel";
import { ScanDetailHeader } from "@/components/scans/scan-detail-header";
import { ScanDetailTabs } from "@/components/scans/scan-detail-tabs";
import { ScanMetricCards } from "@/components/scans/scan-metric-cards";
import { ScanSummaryTab } from "@/components/scans/scan-summary-tab";
import { ScanIpsTab } from "@/components/scans/scan-ips-tab";
import { SubdomainSearchBar } from "@/components/subdomain-search-bar";
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
  formatScanDateTime,
  formatScanDuration,
  shortScanId,
} from "@/lib/scan-format";
import {
  getObservedAvailability,
  getObservedScanSummary,
} from "@/lib/scan-observed";
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

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  const iso = typeof value === "string" ? value : value.toISOString();
  return iso.slice(0, 16).replace("T", " ");
}

function countLabel(value: number | null) {
  return value == null ? "—" : value.toLocaleString();
}

function dualCountLabel(numerator: number | null, denominator: number | null) {
  if (numerator == null || denominator == null) return "—";
  return `${numerator.toLocaleString()} / ${denominator.toLocaleString()}`;
}

function formatEngineLabel(engine: string) {
  if (engine === "VIRUSTOTAL") return "VirusTotal";
  if (engine === "WAYBACK_MACHINE") return "Wayback";
  if (engine === "URLSCAN") return "URLScan";
  return engine;
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
    tabRaw === "findings" ||
    tabRaw === "subdomains" ||
    tabRaw === "urls" ||
    tabRaw === "ips" ||
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

  const scan = await getObservedScanSummary(id);
  if (!scan) notFound();

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
  const [observedFindingCount, observedSubdomainCount, observedUrlCount, observedIpCount, urlCategoryCounts] =
    await Promise.all([
      snapshotScan.observedFindingCount ??
        prisma.analysisFinding.count({ where: { scanJobId: id } }),
      availability.subdomains === "ready"
        ? snapshotScan.observedSubdomainCount ??
          observedSubdomainModel.count({ where: { scanJobId: id } })
        : Promise.resolve(null),
      availability.urls === "ready"
        ? snapshotScan.observedUrlCount ??
          observedUrlModel.count({ where: { scanJobId: id } })
        : Promise.resolve(null),
      availability.ips === "ready"
        ? snapshotScan.observedIpCount ??
          prisma.scanObservedIpResolution.count({ where: { scanJobId: id } })
        : Promise.resolve(null),
      availability.urls === "ready"
        ? countObservedUrlsByCategory(prisma, id)
        : Promise.resolve(null),
    ]);

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

  const findingsWhere = {
    scanJobId: id,
    ...(fType ? { findingType: fType } : {}),
    ...(fSource ? { source: fSource } : {}),
  } as const;
  const findingsTotal =
    tab === "findings"
      ? await prisma.analysisFinding.count({ where: findingsWhere })
      : 0;
  const findingsPages = Math.max(1, Math.ceil(findingsTotal / perPage));
  const safeFindingsPage = Math.min(page, findingsPages);
  const findingGroups =
    tab === "findings"
      ? await prisma.analysisFinding.groupBy({
          by: ["findingType"],
          where: { scanJobId: id },
          _count: { _all: true },
          orderBy: { _count: { findingType: "desc" } },
        })
      : [];
  const findings =
    tab === "findings"
      ? await prisma.analysisFinding.findMany({
          where: findingsWhere,
          orderBy: { createdAt: "desc" },
          skip: (safeFindingsPage - 1) * perPage,
          take: perPage,
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
  const subdomains =
    tab === "subdomains" && availability.subdomains === "ready" && !subAll
      ? await observedSubdomainModel.findMany({
          where: subdomainsWhere,
          orderBy: { hostnameNormalized: "asc" },
          skip: (safeSubdomainsPage - 1) * perPage,
          take: perPage,
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

  const allSubdomains =
    tab === "subdomains" && availability.subdomains === "ready" && subAll
      ? await prisma.subdomain.findMany({
          where: {
            targetDomainId: scan.targetDomainId,
            ...(subdomainsSearchFilter ?? {}),
          },
          orderBy: { hostnameNormalized: "asc" },
          skip: (safeSubdomainsPage - 1) * perPage,
          take: perPage,
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
      key: "findings",
      label: "Findings",
      icon: IconAlertTriangle,
      href: tabHref("findings"),
      count: countLabel(observedFindingCount),
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
      icon: IconList,
      iconBg: "scx-metric-icon-badge--success",
      iconColor: "",
      value: scan.targetDomain.cachedSubdomainCount.toLocaleString(),
      label: "Subdomains (total)",
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
              This scan is {scan.status.toLowerCase()}, so observed results may be incomplete.
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
                  <div className="text-[13px] font-semibold text-cream">
                    Findings observed in this scan
                  </div>
                  <div className="mt-1 text-[12px] text-muted">
                    {isCompleted
                      ? "Historical findings scoped to this scan only."
                      : "Current observed findings for this in-progress or partial scan."}
                  </div>
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
                          {finding.discoveredUrl.engines
                            .map((engine) => formatEngineLabel(engine))
                            .join(", ")}
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
                            Found: {formatDateTime(finding.createdAt)}
                          </div>
                          {finding.discoveredUrl.externalSeenAt && (
                            <div
                              title="Date reported in external intel"
                              className="mt-1 text-accent/70"
                            >
                              Intel: {formatDateTime(finding.discoveredUrl.externalSeenAt)}
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
                    <div className="text-[13px] font-semibold text-cream">
                      {subAll ? "All target subdomains" : "Subdomains with URLs in this scan"}
                    </div>
                    <div className="mt-1 text-[12px] text-muted">
                      {subAll
                        ? "Complete subdomain inventory for this target. Badges indicate whether each subdomain has an observed URL in this scan."
                        : "Only subdomains that appear in the observed URL snapshot for this scan."}
                    </div>
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
                  <div className="hidden border-b border-line bg-[var(--table-header-bg)] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted sm:grid sm:grid-cols-12 sm:gap-3">
                    <div className="col-span-6">Hostname</div>
                    <div className="col-span-3">First seen canonically</div>
                    <div className="col-span-3 text-right">Last seen canonically</div>
                  </div>

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
                      subdomains.map((subdomain) => (
                        <div
                          key={subdomain.id}
                          className="flex flex-col gap-1 px-5 py-3 sm:grid sm:grid-cols-12 sm:items-center sm:gap-3"
                        >
                          <div className="col-span-6 truncate font-mono text-[12px] text-cream">
                            {subdomain.hostnameNormalized}
                          </div>
                          <div className="col-span-3 font-mono text-[11px] text-muted">
                            {formatDateTime(subdomain.subdomain?.firstSeenAt)}
                          </div>
                          <div className="col-span-3 text-left font-mono text-[11px] text-muted sm:text-right">
                            {formatDateTime(subdomain.subdomain?.lastSeenAt)}
                          </div>
                        </div>
                      ))
                    ) : (
                      allSubdomains.map((subdomain) => {
                        const hasUrl = subdomain.observedUrls.length > 0;
                        return (
                          <div
                            key={subdomain.id}
                            className="flex flex-col gap-1 px-5 py-3 sm:grid sm:grid-cols-12 sm:items-center sm:gap-3"
                          >
                            <div className="col-span-6 min-w-0">
                              <div className="flex min-w-0 items-center gap-2">
                                <div className="truncate font-mono text-[12px] text-cream">
                                  {subdomain.hostnameNormalized}
                                </div>
                                <span
                                  className={[
                                    "relative -top-px shrink-0 rounded border px-1 py-0 text-[8px] font-semibold uppercase tracking-wide leading-none",
                                    hasUrl
                                      ? "border-accent/40 bg-accent/10 text-accent"
                                      : "border-line bg-black/10 text-muted",
                                  ].join(" ")}
                                >
                                  {hasUrl ? "Has URL" : "No URL"}
                                </span>
                              </div>
                            </div>
                            <div className="col-span-3 font-mono text-[11px] text-muted">
                              {formatDateTime(subdomain.firstSeenAt)}
                            </div>
                            <div className="col-span-3 text-left font-mono text-[11px] text-muted sm:text-right">
                              {formatDateTime(subdomain.lastSeenAt)}
                            </div>
                          </div>
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
                    fixedParams={fixedParams}
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
                    <div>
                      <div className="text-[13px] font-semibold text-cream">
                        URLs observed in this scan
                      </div>
                      <div className="mt-1 text-[12px] text-muted">
                        URL snapshot scoped to this scan, independent from current target totals.
                      </div>
                    </div>
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
                            Observed: {formatDateTime(url.createdAt)}
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
              totalItems={ipsTotal}
              currentPage={safeIpsPage}
              totalPages={ipsPages}
              perPage={perPage}
              basePath={basePath}
              isCompleted={isCompleted}
              sort={ipSort}
            />
          )}
        </div>
      </div>
    </div>
  );
}
