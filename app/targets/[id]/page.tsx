import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { DeleteTargetButton } from "@/components/delete-target-button";
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
import { TopBar } from "@/components/top-bar";

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

export default async function TargetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const rawSp = (await searchParams) ?? {};
  const tab = (sp(rawSp.tab) || "urls").toLowerCase();
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

  /* C1: Lazy-load — only run queries needed for the active tab */

  /* Category data — only needed for "urls" tab */
  const categories =
    tab === "urls"
      ? await prisma.extensionCategory.findMany({ orderBy: { slug: "asc" } })
      : [];

  const categoryCountsRaw =
    tab === "urls"
      ? await prisma.discoveredUrl.groupBy({
          by: ["extensionCategoryId"],
          where: { targetDomainId: target.id },
          _count: { _all: true },
        })
      : [];
  const countByCategoryId = new Map<number, number>();
  let uncategorizedCount = 0;
  for (const row of categoryCountsRaw) {
    if (row.extensionCategoryId == null) uncategorizedCount += row._count._all;
    else countByCategoryId.set(row.extensionCategoryId, row._count._all);
  }

  const activeCategoryId =
    categorySlug === "all"
      ? null
      : categorySlug === "uncategorized"
        ? -1
        : categories.find((c) => c.slug.toLowerCase() === categorySlug)?.id ?? null;

  const urlSearchFilter = urlTextSearchWhere(q);

  const hideKw = normalizeExcludeKeywords(hideKwRaw);

  /** Subdomains that actually have discovered URLs for this target (hide picker scope). */
  const subdomainWithUrlsWhere = {
    targetDomainId: target.id,
    discoveredUrls: { some: { targetDomainId: target.id } },
  } as const;

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
    ...(activeCategoryId === null
      ? {}
      : activeCategoryId === -1
        ? { extensionCategoryId: null }
        : { extensionCategoryId: activeCategoryId }),
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
          include: { extensionCategory: true },
        })
      : [];

  /* Finding queries — use direct targetDomainId (denormalized, no sub-query) */
  const findingWhere = {
    targetDomainId: target.id,
    ...(fType ? { findingType: fType } : {}),
    ...(fSource ? { source: fSource as "URL_STRING" | "RESPONSE_BODY" } : {}),
  } as const;

  const totalFindings = tab === "findings" ? await prisma.analysisFinding.count({ where: findingWhere }) : 0;
  const totalFindingsPages = Math.max(1, Math.ceil(totalFindings / perPage));
  const safeFindingPage = Math.min(fPage, totalFindingsPages);

  /* Finding groups — only needed for "findings" tab */
  const findingGroups =
    tab === "findings"
      ? await prisma.analysisFinding.groupBy({
          by: ["findingType"],
          where: { targetDomainId: target.id },
          _count: { _all: true },
          orderBy: { _count: { findingType: "desc" } },
        })
      : [];

  const findings =
    tab === "findings"
      ? await prisma.analysisFinding.findMany({
          where: findingWhere,
          orderBy: { createdAt: "desc" },
          skip: (safeFindingPage - 1) * perPage,
          take: perPage,
          include: { discoveredUrl: { select: { urlText: true, id: true, externalSeenAt: true, engines: true } } },
        })
      : [];

  const subdomains =
    tab === "subdomains"
      ? await prisma.subdomain.findMany({
          where: { targetDomainId: target.id },
          orderBy: { hostnameNormalized: "asc" },
          take: 5000,
        })
      : [];

  const scanJobs =
    tab === "scans"
      ? await prisma.scanJob.findMany({
          where: { targetDomainId: target.id },
          orderBy: { createdAt: "desc" },
          take: 100,
        })
      : [];

  const tabs = [
    { key: "urls", label: "URLs", count: target.cachedUrlCount },
    { key: "subdomains", label: "Subdomains", count: target.cachedSubdomainCount },
    { key: "findings", label: "Findings", count: target.cachedFindingCount },
    { key: "scans", label: "Scans", count: undefined },
  ];

  const targetId = target.id;

  function tabHref(t: string) {
    return `/targets/${targetId}?tab=${t}`;
  }

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

  return (
    <>
      <TopBar breadcrumb={`/ targets / ${target.domainNormalized}`} />
      <main className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        {/* ── Breadcrumb + Header ── */}
        <div className="space-y-2">
          <p className="text-[11px] font-mono text-muted">
            <Link href="/targets" className="text-accent/80 hover:underline">Targets</Link>
            <span className="text-line"> / </span>
            <span className="text-cream">{target.domainNormalized}</span>
          </p>
          <div className="flex items-center justify-between gap-4">
            <PageHeader
              eyebrow="Results"
              title={target.domainNormalized}
              titleClassName="font-mono"
              description=""
            />
            <DeleteTargetButton targetId={target.id} targetName={target.domainNormalized} />
          </div>
        </div>

        {/* ── Stats bar ── */}
        <div className="mt-6 grid grid-cols-3 gap-3">
          <div className="glass-panel rounded-xl px-4 py-3 text-center">
            <div className="font-mono text-2xl text-cream">{target.cachedSubdomainCount.toLocaleString()}</div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted">Subdomains</div>
          </div>
          <div className="glass-panel rounded-xl px-4 py-3 text-center">
            <div className="font-mono text-2xl text-cream">{target.cachedUrlCount.toLocaleString()}</div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted">URLs</div>
          </div>
          <div className="glass-panel rounded-xl px-4 py-3 text-center">
            <div className="font-mono text-2xl text-cream">{target.cachedFindingCount.toLocaleString()}</div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted">Findings</div>
          </div>
        </div>

        {/* ── Tab Strip ── */}
        <div className="mt-6 flex flex-wrap gap-2">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={tabHref(t.key)}
              className={[
                "rounded-xl px-4 py-2.5 text-[13px] font-medium transition-colors",
                tab === t.key
                  ? "bg-accent/15 text-cream shadow-glass ring-1 ring-accent/25"
                  : "text-muted hover:bg-[var(--nav-hover-bg)] hover:text-cream",
              ].join(" ")}
            >
              {t.label}
              {t.count != null && (
                <span className="ml-1.5 font-mono text-[11px] text-muted">{t.count.toLocaleString()}</span>
              )}
            </Link>
          ))}
        </div>

        {/* ── Tab Content ── */}
        <div className="mt-6">
          {/* ════════ URLs Tab ════════ */}
          {tab === "urls" && (
            <div className="glass-panel overflow-hidden rounded-2xl">
              {/* Category filters + search */}
              <div className="border-b border-line px-5 py-4 space-y-3">
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
                          {u.extensionCategory?.slug ?? "uncategorized"}
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

          {/* ════════ Findings Tab (TABLE, not cards) ════════ */}
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
                  All ({target.cachedFindingCount.toLocaleString()})
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

              <div className="glass-panel overflow-hidden rounded-2xl">
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
                          {f.discoveredUrl.engines.map((e) =>
                            e === "VIRUSTOTAL" ? "VirusTotal" :
                            e === "WAYBACK_MACHINE" ? "Wayback" :
                            e === "URLSCAN" ? "URLScan" : e
                          ).join(", ")}
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
            </div>
          )}

          {/* ════════ Scans Tab ════════ */}
          {tab === "scans" && (
            <div className="glass-panel overflow-hidden rounded-2xl">
              <div className="hidden border-b border-line bg-[var(--table-header-bg)] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted sm:grid sm:grid-cols-12 sm:gap-3">
                <div className="col-span-3">Status</div>
                <div className="col-span-3">Phase</div>
                <div className="col-span-3">Progress</div>
                <div className="col-span-3 text-right">Created</div>
              </div>
              <div className="divide-y divide-line">
                {scanJobs.length === 0 ? (
                  <div className="px-5 py-8 text-center text-[13px] text-muted">No scans yet.</div>
                ) : (
                  scanJobs.map((s) => {
                    const href =
                      s.status === "COMPLETED"
                        ? `/scans/${s.id}/observed`
                        : `/scans/${s.id}`;

                    return (
                      <Link
                        key={s.id}
                        href={href}
                        className="flex flex-col gap-1 px-5 py-3 transition-colors hover:bg-white/[0.03] sm:grid sm:grid-cols-12 sm:items-center sm:gap-3"
                      >
                        <div className="col-span-3">
                          <span className={[
                            "inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase",
                            s.status === "COMPLETED" ? "bg-accent/15 text-accent" :
                            s.status === "RUNNING" ? "bg-accent/25 text-cream" :
                            s.status === "FAILED" ? "bg-warn/15 text-warn" :
                            "bg-muted/15 text-muted",
                          ].join(" ")}>
                            {s.status}
                          </span>
                        </div>
                        <div className="col-span-3 font-mono text-[11px] text-muted">{s.phase ?? "—"}</div>
                        <div className="col-span-3 font-mono text-[11px] text-muted">
                          {(s.progressCurrent ?? 0).toLocaleString()}/{(s.progressTotal ?? 0).toLocaleString()}
                        </div>
                        <div className="col-span-3 text-right font-mono text-[11px] text-muted">
                          {s.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                        </div>
                      </Link>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
