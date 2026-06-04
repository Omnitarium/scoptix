import Link from "next/link";
import { notFound } from "next/navigation";
import { ScanJobStatus } from "@prisma/client";

import { TargetDetailHeader } from "@/components/targets/target-detail-header";
import { TablePagination, normalizePageSize } from "@/components/table-pagination";
import { UrlFiltersToolbar } from "@/components/url-filters-toolbar";
import { urlExcludeWhere, normalizeExcludeKeywords } from "@/lib/url-exclude-query";
import { urlTextSearchWhere } from "@/lib/url-search-query";
import {
  buildTargetUrlsTabHref,
  parseCsvParam,
  urlTabPreserveToFixedParams,
  type UrlTabPreserve,
} from "@/lib/url-tab-params";
import { prisma } from "@/lib/prisma";
import {
  categorySlugForPathnameExtension,
  countDiscoveredUrlsByCategory,
  loadExtensionSuffixRules,
  urlCategoryPathnameWhere,
} from "@/lib/extension-category";
import { ScanPanelHeading } from "@/components/scans/scan-panel-heading";
import { ScanDetailTabs } from "@/components/scans/scan-detail-tabs";
import { ScanMetricCards } from "@/components/scans/scan-metric-cards";
import { ScanSummaryTab } from "@/components/scans/scan-summary-tab";
import { loadTargetSummary } from "@/lib/scan-summary";
import { TargetIpsTab } from "@/components/targets/target-ips-tab";
import {
  IconAlertTriangle,
  IconClock,
  IconFileText,
  IconFolder,
  IconGlobe,
  IconLink,
  IconServer,
} from "@/components/ui-icons";
import { formatScanDateTime, formatScanDuration } from "@/lib/scan-format";
import { canViewPartialObservedResults, getObservedAvailability } from "@/lib/scan-observed";
import { parseIpTableSort, targetIpOrderBy } from "@/lib/ip-table-sort";
import {
  countDedupedTargetFindings,
  findDedupedTargetFindingIds,
  groupDedupedTargetFindingsByType,
  syncTargetCachedFindingCount,
} from "@/lib/target-findings-dedup";
import type { FindingSource } from "@prisma/client";
import { formatFindingEnginesLabel } from "@/lib/scan-engines";
import { parseActiveEnginesFromSetting } from "@/lib/active-engines";

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

function targetScanListMetrics(scan: {
  observedVersion: number | null;
  observedUrlCount: number | null;
  observedFindingCount: number | null;
  observedSubdomainCount: number | null;
}) {
  const availability = getObservedAvailability(scan);
  return {
    subdomainsWithUrls:
      availability.subdomains === "ready" ? countLabel(scan.observedSubdomainCount) : "—",
    urls: availability.urls === "ready" ? countLabel(scan.observedUrlCount) : "—",
    findings: countLabel(scan.observedFindingCount),
  };
}

export default async function TargetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const rawSp = (await searchParams) ?? {};
  const tabRaw = (sp(rawSp.tab) || "summary").toLowerCase();
  const tab =
    tabRaw === "summary" ||
    tabRaw === "subdomains" ||
    tabRaw === "urls" ||
    tabRaw === "ips" ||
    tabRaw === "findings" ||
    tabRaw === "scans"
      ? tabRaw
      : "summary";
  const q = sp(rawSp.q);
  const hideSubRaw = parseCsvParam(rawSp.hideSub);
  const hideKwRaw = parseCsvParam(rawSp.hideKw);
  const categorySlug = (sp(rawSp.cat) || "all").toLowerCase();
  const page = asPosInt(sp(rawSp.page) || null, 1);
  const perPage = normalizePageSize(sp(rawSp.perPage) || null);

  const fType = sp(rawSp.fType) || undefined;
  const fSource = sp(rawSp.fSource) || undefined;
  const fPage = asPosInt(sp(rawSp.fPage) || null, 1);

  /* C2: Use cached counts — no expensive _count or cross-table count() */
  const target = await prisma.targetDomain.findUnique({
    where: { id },
  });
  if (!target) notFound();

  const dedupedFindingCount = await countDedupedTargetFindings(prisma, target.id);
  if (target.cachedFindingCount !== dedupedFindingCount) {
    await syncTargetCachedFindingCount(prisma, target.id);
  }

  const activeEnginesSetting = await prisma.appSetting.findUnique({
    where: { key: "active_engines" },
  });
  const enabledEngines = parseActiveEnginesFromSetting(activeEnginesSetting?.value);

  /* C1: Lazy-load — only run queries needed for the active tab */

  /** Subdomains that actually have discovered URLs for this target (hide picker scope). */
  const subdomainWithUrlsWhere = {
    targetDomainId: target.id,
    discoveredUrls: { some: { targetDomainId: target.id } },
  } as const;

  const [subdomainWithUrlCount, urlCategoryCounts, latestCompletedScan, scanCount] =
    await Promise.all([
      prisma.subdomain.count({ where: subdomainWithUrlsWhere }),
      countDiscoveredUrlsByCategory(prisma, target.id),
      prisma.scanJob.findFirst({
        where: { targetDomainId: target.id, status: ScanJobStatus.COMPLETED },
        orderBy: { completedAt: "desc" },
        select: { id: true, startedAt: true, completedAt: true },
      }),
      prisma.scanJob.count({ where: { targetDomainId: target.id } }),
    ]);

  const categorizedUrlCount = urlCategoryCounts.categorizedCount;

  /* Category data — only needed for "urls" tab */
  const categories =
    tab === "urls"
      ? await prisma.extensionCategory.findMany({ orderBy: { slug: "asc" } })
      : [];

  const suffixRules = tab === "urls" ? await loadExtensionSuffixRules(prisma) : [];
  const countByCategoryId = urlCategoryCounts?.countByCategoryId ?? new Map<number, number>();
  const uncategorizedCount = urlCategoryCounts?.uncategorizedCount ?? 0;
  const categoryById = new Map(
    (tab === "urls" ? categories : []).map((c) => [c.id, c]),
  );

  const activeCategoryId =
    categorySlug === "all"
      ? null
      : categorySlug === "uncategorized"
        ? -1
        : categories.find((c) => c.slug.toLowerCase() === categorySlug)?.id ?? null;

  const urlSearchFilter = urlTextSearchWhere(q);

  const hideKw = normalizeExcludeKeywords(hideKwRaw);

  const validatedHideSubs =
    tab === "urls" && hideSubRaw.length > 0
      ? await prisma.subdomain.findMany({
          where: { ...subdomainWithUrlsWhere, id: { in: hideSubRaw } },
          select: { id: true, hostnameNormalized: true },
          orderBy: { hostnameNormalized: "asc" },
        })
      : [];

  const hideSubIds = validatedHideSubs.map((s) => s.id);
  const urlExcludeFilter = urlExcludeWhere(hideSubIds, hideKw);

  const subdomainPickerOptions =
    tab === "urls"
      ? await prisma.subdomain.findMany({
          where: subdomainWithUrlsWhere,
          select: { id: true, hostnameNormalized: true },
          orderBy: { hostnameNormalized: "asc" },
        })
      : [];

  const urlTabPreserve: UrlTabPreserve = {
    cat: categorySlug,
    perPage,
    q: q || undefined,
    hideSub: hideSubIds.length > 0 ? hideSubIds : undefined,
    hideKw: hideKw.length > 0 ? hideKw : undefined,
  };

  // URL query — only compute when tab is "urls"
  const urlWhere = {
    targetDomainId: target.id,
    ...(urlSearchFilter ?? {}),
    ...(urlExcludeFilter ?? {}),
    ...urlCategoryPathnameWhere(activeCategoryId, suffixRules),
  } as const;

  const totalUrls = tab === "urls" ? await prisma.discoveredUrl.count({ where: urlWhere }) : 0;
  const totalPages = Math.max(1, Math.ceil(totalUrls / perPage));
  const safePage = Math.min(page, totalPages);

  const urls =
    tab === "urls"
      ? await prisma.discoveredUrl.findMany({
          where: urlWhere,
          orderBy: { createdAt: "desc" },
          skip: (safePage - 1) * perPage,
          take: perPage,
        })
      : [];

  const findingDedupFilter = {
    ...(fType ? { findingType: fType } : {}),
    ...(fSource ? { source: fSource as FindingSource } : {}),
  };

  const totalFindings =
    tab === "findings"
      ? await countDedupedTargetFindings(prisma, target.id, findingDedupFilter)
      : 0;
  const totalFindingsPages = Math.max(1, Math.ceil(totalFindings / perPage));
  const safeFindingPage = Math.min(fPage, totalFindingsPages);

  const findingGroupsRaw =
    tab === "findings" ? await groupDedupedTargetFindingsByType(prisma, target.id) : [];
  const findingGroups = findingGroupsRaw.map((g) => ({
    findingType: g.findingType,
    _count: { _all: g.count },
  }));

  const dedupedFindingIds =
    tab === "findings"
      ? await findDedupedTargetFindingIds(prisma, target.id, {
          skip: (safeFindingPage - 1) * perPage,
          take: perPage,
          filter: findingDedupFilter,
        })
      : [];

  const findingsRows =
    dedupedFindingIds.length > 0
      ? await prisma.analysisFinding.findMany({
          where: { id: { in: dedupedFindingIds } },
          include: {
            discoveredUrl: { select: { urlText: true, id: true, externalSeenAt: true, engines: true } },
          },
        })
      : [];
  const findingsById = new Map(findingsRows.map((f) => [f.id, f]));
  const findings =
    tab === "findings"
      ? dedupedFindingIds.map((id) => findingsById.get(id)).filter((f) => f !== undefined)
      : [];

  const subdomains =
    tab === "subdomains"
      ? await prisma.subdomain.findMany({
          where: { targetDomainId: target.id },
          orderBy: { hostnameNormalized: "asc" },
          take: 5000,
        })
      : [];

  const ipSort = parseIpTableSort(sp(rawSp.ipSort), sp(rawSp.ipDir), "target");

  const ipsTotal =
    tab === "ips" ? await prisma.ipResolution.count({ where: { targetDomainId: target.id } }) : 0;
  const ipsPages = Math.max(1, Math.ceil(ipsTotal / perPage));
  const safeIpsPage = Math.min(page, ipsPages);

  const ips =
    tab === "ips"
      ? await prisma.ipResolution.findMany({
          where: { targetDomainId: target.id },
          orderBy: targetIpOrderBy(ipSort),
          skip: (safeIpsPage - 1) * perPage,
          take: perPage,
        })
      : [];

  const summaryData =
    tab === "summary" ? await loadTargetSummary(target.id) : null;

  const scanJobs =
    tab === "scans"
      ? await prisma.scanJob.findMany({
          where: { targetDomainId: target.id },
          orderBy: { createdAt: "desc" },
          take: 100,
          select: {
            id: true,
            status: true,
            phase: true,
            progressCurrent: true,
            progressTotal: true,
            createdAt: true,
            observedVersion: true,
            observedUrlCount: true,
            observedFindingCount: true,
            observedSubdomainCount: true,
          },
        })
      : [];

  const targetId = target.id;

  function tabHref(t: string) {
    return `/targets/${targetId}?tab=${t}`;
  }

  function targetTabCount(count: number) {
    return count.toLocaleString();
  }

  const targetDetailTabs = [
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
      count: targetTabCount(target.cachedSubdomainCount),
    },
    {
      key: "urls",
      label: "URLs",
      icon: IconLink,
      href: tabHref("urls"),
      count: targetTabCount(target.cachedUrlCount),
    },
    {
      key: "ips",
      label: "IPs",
      icon: IconServer,
      href: tabHref("ips"),
      count: targetTabCount(target.cachedIpCount),
    },
    {
      key: "findings",
      label: "Findings",
      icon: IconAlertTriangle,
      href: tabHref("findings"),
      count: targetTabCount(dedupedFindingCount),
    },
    {
      key: "scans",
      label: "Scans",
      icon: IconClock,
      href: tabHref("scans"),
      count: null,
    },
  ];

  const compareHref =
    latestCompletedScan && summaryData?.changes.baselineScanId
      ? `/scans/${latestCompletedScan.id}/observed?tab=compare&compare=${summaryData.changes.baselineScanId}`
      : latestCompletedScan
        ? `/scans/${latestCompletedScan.id}/observed?tab=compare`
        : tabHref("scans");

  const targetBasePath = `/targets/${targetId}`;

  const urlFixedParams = urlTabPreserveToFixedParams(urlTabPreserve);

  const findingFixedParams: Record<string, string> = { tab: "findings" };
  if (fType) findingFixedParams.fType = fType;
  if (fSource) findingFixedParams.fSource = fSource;

  function urlFilterHref(overrides: { cat?: string; page?: string; q?: string }) {
    const pg = Number(overrides.page ?? "1");
    return buildTargetUrlsTabHref(targetId, {
      ...urlTabPreserve,
      cat: overrides.cat ?? categorySlug,
      q: "q" in overrides ? overrides.q : urlTabPreserve.q,
      page: Number.isFinite(pg) && pg > 1 ? pg : undefined,
    });
  }

  function findingFilterHref(overrides: { type?: string; source?: string; page?: string }) {
    const p = new URLSearchParams();
    p.set("tab", "findings");
    const t = "type" in overrides ? overrides.type : fType;
    if (t) p.set("fType", t);
    const s = "source" in overrides ? overrides.source : fSource;
    if (s) p.set("fSource", s);
    const pg = overrides.page ?? "1";
    if (pg !== "1") p.set("fPage", pg);
    p.set("perPage", String(perPage));
    return `/targets/${targetId}?${p.toString()}`;
  }

  const targetMetricCards = [
    {
      icon: IconGlobe,
      iconBg: "scx-metric-icon-badge--success",
      iconColor: "",
      value: countLabel(subdomainWithUrlCount),
      label: "Subdomains (with URLs)",
    },
    {
      icon: IconGlobe,
      iconBg: "scx-metric-icon-badge--success",
      iconColor: "",
      value: countLabel(target.cachedSubdomainCount),
      label: "Subdomains (total)",
    },
    {
      icon: IconServer,
      iconBg: "scx-metric-icon-badge--success",
      iconColor: "",
      value: countLabel(target.cachedIpCount),
      label: "IP Addresses",
    },
    {
      icon: IconLink,
      iconBg: "scx-metric-icon-badge--success",
      iconColor: "",
      value: countLabel(target.cachedUrlCount),
      label: "URLs",
    },
    {
      icon: IconAlertTriangle,
      iconBg: "scx-metric-icon-badge--success",
      iconColor: "",
      value: countLabel(dedupedFindingCount),
      label: "Findings",
    },
    {
      icon: IconFolder,
      iconBg: "scx-metric-icon-badge--success",
      iconColor: "",
      value: countLabel(categorizedUrlCount),
      label: "Categories",
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <TargetDetailHeader
        domain={target.domainNormalized}
        updatedAt={formatScanDateTime(target.updatedAt)}
        scanCount={scanCount}
        latestScanDuration={formatScanDuration(
          latestCompletedScan?.startedAt,
          latestCompletedScan?.completedAt,
        )}
        targetId={target.id}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <ScanMetricCards metrics={targetMetricCards} />

        <div className="mt-6">
          <ScanDetailTabs tabs={targetDetailTabs} activeKey={tab} />
        </div>

        <div>
          {tab === "summary" && summaryData && (
            <ScanSummaryTab
              data={summaryData}
              basePath={targetBasePath}
              compareHref={compareHref}
              scope="target"
            />
          )}

          {/* ════════ URLs Tab ════════ */}
          {tab === "urls" && (
            <div className="glass-panel overflow-hidden rounded-2xl">
              {/* Category filters + search */}
              <div className="border-b border-line px-5 py-4 space-y-3">
                <ScanPanelHeading
                  title="Global URL directory"
                  description="All URLs discovered for this target across every scan."
                />
                <UrlFiltersToolbar
                  hrefContext={{ scope: "target", targetId: target.id }}
                  preserve={urlTabPreserve}
                  initialQuery={q}
                  initialHideSubIds={hideSubIds}
                  initialHideKw={hideKw}
                  subdomainOptions={subdomainPickerOptions}
                  resolvedHiddenSubdomains={validatedHideSubs}
                  totalUrls={totalUrls}
                  currentPage={safePage}
                  totalPages={totalPages}
                />

                {/* Category pills */}
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={urlFilterHref({ cat: "all" })}
                    className={[
                      "rounded-lg border px-3 py-1.5 text-[11px] transition-colors",
                      categorySlug === "all"
                        ? "border-accent/60 bg-accent/10 text-cream"
                        : "border-line text-muted hover:bg-[var(--nav-hover-bg)] hover:text-cream",
                    ].join(" ")}
                  >
                    All ({target.cachedUrlCount.toLocaleString()})
                  </Link>
                  <Link
                    href={urlFilterHref({ cat: "uncategorized" })}
                    className={[
                      "rounded-lg border px-3 py-1.5 text-[11px] transition-colors",
                      categorySlug === "uncategorized"
                        ? "border-accent/60 bg-accent/10 text-cream"
                        : "border-line text-muted hover:bg-[var(--nav-hover-bg)] hover:text-cream",
                    ].join(" ")}
                  >
                    uncategorized ({uncategorizedCount.toLocaleString()})
                  </Link>
                  {categories.map((c) => {
                    const cnt = countByCategoryId.get(c.id) ?? 0;
                    return (
                      <Link
                        key={c.id}
                        href={urlFilterHref({ cat: c.slug })}
                        className={[
                          "rounded-lg border px-3 py-1.5 text-[11px] transition-colors",
                          categorySlug === c.slug.toLowerCase()
                            ? "border-accent/60 bg-accent/10 text-cream"
                            : "border-line text-muted hover:bg-[var(--nav-hover-bg)] hover:text-cream",
                        ].join(" ")}
                      >
                        {c.displayName} ({cnt.toLocaleString()})
                      </Link>
                    );
                  })}
                </div>
              </div>

              {/* URL rows */}
              <div className="divide-y divide-line">
                {urls.length === 0 ? (
                  <div className="px-5 py-8 text-center text-[13px] text-muted">No URLs match this filter.</div>
                ) : (
                  urls.map((u) => (
                    <div key={u.id} className="px-5 py-3">
                      <div className="break-all font-mono text-[12px] text-cream leading-relaxed">{u.urlText}</div>
                      <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted">
                        <span className="rounded-md bg-accent/8 px-1.5 py-0.5 font-mono text-accent">
                          {categorySlugForPathnameExtension(
                            suffixRules,
                            u.pathnameExtension,
                            categoryById,
                          )}
                        </span>
                        {u.pathnameExtension && (
                          <span className="font-mono">{u.pathnameExtension}</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <TablePagination
                currentPage={safePage}
                totalPages={totalPages}
                totalItems={totalUrls}
                perPage={perPage}
                basePath={targetBasePath}
                fixedParams={urlFixedParams}
              />
            </div>
          )}

          {/* ════════ Subdomains Tab ════════ */}
          {tab === "subdomains" && (
            <div className="glass-panel overflow-hidden rounded-2xl">
              <div className="border-b border-line bg-[var(--table-header-bg)] px-5 py-4">
                <ScanPanelHeading
                  title="Global subdomain directory"
                  description="All subdomains discovered for this target across every scan."
                />
              </div>
              <div className="hidden border-b border-line bg-[var(--table-header-bg)] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted sm:grid sm:grid-cols-12 sm:gap-3">
                <div className="col-span-7">Hostname</div>
                <div className="col-span-3">First seen</div>
                <div className="col-span-2 text-right">Last seen</div>
              </div>
              <div className="divide-y divide-line">
                {subdomains.length === 0 ? (
                  <div className="px-5 py-8 text-center text-[13px] text-muted">No subdomains yet.</div>
                ) : (
                  subdomains.map((s) => (
                    <div key={s.id} className="flex flex-col gap-1 px-5 py-3 sm:grid sm:grid-cols-12 sm:items-center sm:gap-3">
                      <div className="col-span-7 truncate font-mono text-[12px] text-cream">{s.hostnameNormalized}</div>
                      <div className="col-span-3 font-mono text-[11px] text-muted">
                        {s.firstSeenAt.toISOString().slice(0, 16).replace("T", " ")}
                      </div>
                      <div className="col-span-2 text-right font-mono text-[11px] text-muted">
                        {s.lastSeenAt.toISOString().slice(0, 16).replace("T", " ")}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ════════ Findings Tab ════════ */}
          {tab === "findings" && (
            <div className="glass-panel overflow-hidden rounded-2xl">
              <div className="border-b border-line px-5 py-4 space-y-3">
                <ScanPanelHeading
                  title="Global findings directory"
                  description="Unique findings for this target (exact URL, type, source, and snippet). Repeats across scans are counted once."
                />
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
                    All ({dedupedFindingCount.toLocaleString()})
                  </Link>
                  {findingGroups.map((g) => (
                    <Link
                      key={g.findingType}
                      href={findingFilterHref({ type: g.findingType })}
                      className={[
                        "rounded-lg border px-3 py-1.5 text-[12px] transition-colors",
                        fType === g.findingType
                          ? "border-accent/60 bg-accent/10 text-cream"
                          : "border-line text-muted hover:bg-[var(--nav-hover-bg)] hover:text-cream",
                      ].join(" ")}
                    >
                      {g.findingType} ({g._count._all.toLocaleString()})
                    </Link>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                    Source:
                  </span>
                  {[
                    { label: "All", value: undefined },
                    { label: "URL String", value: "URL_STRING" },
                    { label: "Response Body", value: "RESPONSE_BODY" },
                  ].map((opt) => (
                    <Link
                      key={opt.label}
                      href={findingFilterHref({ source: opt.value })}
                      className={[
                        "rounded-lg border px-3 py-1.5 text-[11px] transition-colors",
                        fSource === opt.value || (!fSource && !opt.value)
                          ? "border-accent/40 bg-accent/8 text-cream"
                          : "border-line text-muted hover:bg-[var(--nav-hover-bg)] hover:text-cream",
                      ].join(" ")}
                    >
                      {opt.label}
                    </Link>
                  ))}
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
                    <div className="px-5 py-8 text-center text-[13px] text-muted">No findings match this filter.</div>
                  ) : (
                    findings.map((f) => (
                      <div key={f.id} className="flex flex-col gap-2 px-5 py-3 lg:grid lg:grid-cols-12 lg:items-start lg:gap-3">
                        <div className="col-span-1">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-accent">
                            {f.findingType}
                          </div>
                          <div className="mt-1">
                            <span className="text-[9px] font-medium tracking-wide text-muted">
                              {f.source === "URL_STRING" ? "URL" : "Body"}
                            </span>
                          </div>
                        </div>
                        <div className="col-span-1 text-[10px] text-muted">
                          {formatFindingEnginesLabel(
                            f.engines,
                            f.discoveredUrl.engines,
                            enabledEngines,
                          ) || "—"}
                        </div>
                        <div className="col-span-6 min-w-0">
                          <div className="break-all font-mono text-[11px] text-cream/90" title={f.discoveredUrl.urlText}>{f.discoveredUrl.urlText}</div>
                        </div>
                        <div className="col-span-2 min-w-0">
                          {f.snippet ? (
                            <div className="break-all rounded-md border border-line bg-black/15 px-2 py-1.5 font-mono text-[10px] text-cream/80" title={f.snippet}>
                              {f.snippet}
                            </div>
                          ) : (
                            <span className="text-[11px] text-muted">—</span>
                          )}
                        </div>
                        <div className="col-span-2 text-right font-mono text-[10px] text-muted">
                          <div title="Date found by our scanner">
                            Found: {f.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                          </div>
                          {f.discoveredUrl.externalSeenAt && (
                            <div title="Date reported in threat intel" className="mt-1 text-accent/70">
                              Intel: {f.discoveredUrl.externalSeenAt.toISOString().slice(0, 16).replace("T", " ")}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
              </div>

              <TablePagination
                currentPage={safeFindingPage}
                totalPages={totalFindingsPages}
                totalItems={totalFindings}
                perPage={perPage}
                basePath={targetBasePath}
                fixedParams={findingFixedParams}
                pageParam="fPage"
              />
            </div>
          )}

          {tab === "ips" && (
            <TargetIpsTab
              ips={ips.map((ip) => ({
                id: ip.id,
                ipAddress: ip.ipAddress,
                hostnameCount: ip.hostnameCount,
                lastResolvedAt: ip.latestResolvedAt,
                lastSeenBy: ip.latestSeenBy,
              }))}
              totalItems={ipsTotal}
              currentPage={safeIpsPage}
              totalPages={ipsPages}
              perPage={perPage}
              basePath={targetBasePath}
              sort={ipSort}
            />
          )}

          {/* ════════ Scans Tab ════════ */}
          {tab === "scans" && (
            <div className="glass-panel overflow-hidden rounded-2xl">
              <div className="border-b border-line px-5 py-4">
                <ScanPanelHeading
                  title="Scans for this target"
                  description="Observed counts per scan: subdomains that have URLs in the snapshot, total URLs, and deduplicated findings."
                />
              </div>
              <div className="min-w-0 overflow-x-auto">
                <div className="min-w-[640px]">
                  <div className="hidden border-b border-line bg-[var(--table-header-bg)] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted sm:grid sm:grid-cols-12 sm:gap-3">
                    <div className="col-span-2">Status</div>
                    <div
                      className="col-span-2"
                      title="Subdomains that have URLs in this scan (observed snapshot)"
                    >
                      Subdomains (URLs)
                    </div>
                    <div className="col-span-2">URLs</div>
                    <div className="col-span-2">Findings</div>
                    <div className="col-span-2">Phase</div>
                    <div className="col-span-2">Created</div>
                  </div>
                  <div className="divide-y divide-line">
                    {scanJobs.length === 0 ? (
                      <div className="px-5 py-8 text-center text-[13px] text-muted">No scans yet.</div>
                    ) : (
                      scanJobs.map((s) => {
                        const href = canViewPartialObservedResults(s)
                          ? `/scans/${s.id}/observed`
                          : `/scans/${s.id}`;
                        const metrics = targetScanListMetrics(s);
                        const createdLabel = s.createdAt
                          .toISOString()
                          .slice(0, 16)
                          .replace("T", " ");

                        return (
                          <Link
                            key={s.id}
                            href={href}
                            className="flex flex-col gap-2 px-5 py-3 transition-colors hover:bg-white/[0.03] sm:grid sm:grid-cols-12 sm:items-center sm:gap-3"
                          >
                            <div className="col-span-2">
                              <span
                                className={[
                                  "inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase",
                                  s.status === "COMPLETED"
                                    ? "bg-accent/15 text-accent"
                                    : s.status === "RUNNING"
                                      ? "bg-accent/25 text-cream"
                                      : s.status === "FAILED"
                                        ? "bg-warn/15 text-warn"
                                        : "bg-muted/15 text-muted",
                                ].join(" ")}
                              >
                                {s.status}
                              </span>
                            </div>
                            <div className="col-span-2 font-mono text-[11px] tabular-nums text-cream sm:text-muted">
                              <span className="mr-2 text-[10px] font-semibold uppercase tracking-wider text-muted sm:hidden">
                                Subdomains (URLs)
                              </span>
                              {metrics.subdomainsWithUrls}
                            </div>
                            <div className="col-span-2 font-mono text-[11px] tabular-nums text-cream sm:text-muted">
                              <span className="mr-2 text-[10px] font-semibold uppercase tracking-wider text-muted sm:hidden">
                                URLs
                              </span>
                              {metrics.urls}
                            </div>
                            <div className="col-span-2 font-mono text-[11px] tabular-nums text-cream sm:text-muted">
                              <span className="mr-2 text-[10px] font-semibold uppercase tracking-wider text-muted sm:hidden">
                                Findings
                              </span>
                              {metrics.findings}
                            </div>
                            <div className="col-span-2 font-mono text-[11px] text-muted">
                              <span className="mr-2 text-[10px] font-semibold uppercase tracking-wider text-muted sm:hidden">
                                Phase
                              </span>
                              {s.phase ?? "—"}
                              {s.status === ScanJobStatus.RUNNING && (
                                <div className="mt-0.5 text-[10px] tabular-nums text-muted/80">
                                  {(s.progressCurrent ?? 0).toLocaleString()}/
                                  {(s.progressTotal ?? 0).toLocaleString()} URLs
                                </div>
                              )}
                            </div>
                            <div className="col-span-2 font-mono text-[11px] text-muted">
                              <span className="mr-2 text-[10px] font-semibold uppercase tracking-wider text-muted sm:hidden">
                                Created
                              </span>
                              {createdLabel}
                            </div>
                          </Link>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
