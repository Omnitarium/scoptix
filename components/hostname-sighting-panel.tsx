"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { apiUrl } from "@/lib/api-url";
import { TechIcon } from "@/components/scans/tech-icon";
import { severityBadgeClass } from "@/lib/cve-format";
import { IconArrowUpRight, IconChevronDown, IconCopy, IconInfo, IconX } from "@/components/ui-icons";
import {
  formatPassiveDnsPanelDateTime,
  formatVtPassiveDnsDateTime,
} from "@/lib/scan-format";

const PANEL_SIGHTINGS_PER_PAGE = 7;

export type HostnameSightingPanelProps = {
  targetDomainId: string;
  hostnameNormalized: string;
  /** Limits sightings to this scan when set (observed scan context). */
  scanJobId?: string | null;
  onClose: () => void;
};

type SightingData = {
  ipAddress: string;
  lastResolvedAt: string;
};

type PanelData = {
  scope?: "scan" | "target";
  scanJobId?: string | null;
  targetDomainId: string;
  hostnameNormalized: string;
  summary: {
    firstResolvedAt: string | null;
    lastResolvedAt: string;
    observedIpCount: number;
  };
  sightings: SightingData[];
};

type TechnologyItem = {
  name: string;
  version: string | null;
  categories: string[];
  confidence: number;
  iconName: string | null;
  website: string | null;
  cpe: string | null;
  lastSeenAt: string;
  cves?: Array<{ cveId: string; severity: string | null; score: number | null }>;
};

type TechnologiesData = {
  technologies: TechnologyItem[];
  summary: { technologyCount: number };
};

type TimelineItem = {
  ipAddress: string;
  dateLabel: string;
  year: string;
  isLatest: boolean;
};

function hostnameVisitHref(hostname: string) {
  const h = hostname.trim();
  if (!h) return "#";
  if (/^https?:\/\//i.test(h)) return h;
  return `https://${h}`;
}

function buildTimelineItems(
  sightings: SightingData[],
  latestSighting: SightingData | undefined,
): TimelineItem[] {
  let lastYear = "";
  return sightings.map((s) => {
    const d = new Date(s.lastResolvedAt);
    const year = Number.isNaN(d.getTime()) ? "" : String(d.getUTCFullYear());
    const showYear = year !== "" && year !== lastYear;
    if (showYear) lastYear = year;
    const isLatest =
      latestSighting != null &&
      s.ipAddress === latestSighting.ipAddress &&
      s.lastResolvedAt === latestSighting.lastResolvedAt;
    return {
      ipAddress: s.ipAddress,
      dateLabel: formatPassiveDnsPanelDateTime(s.lastResolvedAt),
      year: showYear ? year : "",
      isLatest,
    };
  });
}

function HostnamePanelSimplePagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between border-t border-line px-2 py-1 text-[10px] text-muted">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className="rounded px-1.5 py-0.5 font-medium transition-colors hover:text-cream disabled:opacity-30"
      >
        Prev
      </button>
      <span className="font-mono tabular-nums">
        {page} / {totalPages}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        className="rounded px-1.5 py-0.5 font-medium transition-colors hover:text-cream disabled:opacity-30"
      >
        Next
      </button>
    </div>
  );
}

function HostnameSightingIpsTable({
  sightings,
  emptyLabel = "No observations found.",
}: {
  sightings: SightingData[];
  emptyLabel?: string;
}) {
  if (sightings.length === 0) {
    return <p className="py-3 text-left text-[12px] text-muted">{emptyLabel}</p>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-line text-left">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-2 border-b border-line bg-[var(--table-header-bg)] px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted">
        <div>IP Address</div>
        <div>Last Resolved</div>
      </div>

      <div className="divide-y divide-line">
        {sightings.map((s) => (
          <div
            key={`${s.ipAddress}-${s.lastResolvedAt}`}
            className="group grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-2 px-2 py-1 text-left"
          >
            <div
              className="min-w-0 truncate font-mono text-[10px] text-cream"
              title={s.ipAddress}
            >
              {s.ipAddress}
            </div>
            <div className="min-w-0 truncate text-[10px] text-muted tabular-nums">
              {formatPassiveDnsPanelDateTime(s.lastResolvedAt)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HostnameSightingAssociationTimeline({
  sightings,
  hostnameNormalized,
  latestSighting,
}: {
  sightings: SightingData[];
  hostnameNormalized: string;
  latestSighting: SightingData | undefined;
}) {
  const items = useMemo(
    () => buildTimelineItems(sightings, latestSighting),
    [sightings, latestSighting],
  );

  if (items.length === 0) return null;

  return (
    <div className="mt-6 text-left">
      <h3 className="text-[13px] font-semibold text-cream">
        Association Timeline for {hostnameNormalized}
      </h3>
      <p className="mt-1 text-[12px] leading-relaxed text-muted">
        When this hostname was observed resolving to different IPs.
      </p>

      <div className="relative mt-4">
        {/* Garis tegak — tengah kolom dot (sama dengan justify-center pada dot) */}
        <div
          className="pointer-events-none absolute inset-y-0 left-[calc(2.5rem+0.75rem)] w-5"
          aria-hidden
        >
          <div className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-line" />
        </div>
        <div className="space-y-2.5">
          {items.map((item) => (
            <div
              key={`${item.ipAddress}-${item.dateLabel}`}
              className="flex items-center gap-3"
            >
              <div className="w-10 shrink-0 text-right text-[10px] font-semibold leading-none text-cream">
                {item.year || "\u00a0"}
              </div>
              <div className="relative flex w-5 shrink-0 justify-center">
                <div
                  className={[
                    "relative z-10 size-2.5 shrink-0 rounded-full ring-4 ring-[var(--glass-panel-bg)]",
                    item.isLatest ? "bg-accent" : "bg-muted",
                  ].join(" ")}
                  aria-hidden
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0">
                <span className="shrink-0 text-[10px] text-muted">{item.dateLabel}</span>
                <span
                  className="min-w-0 font-mono text-[10px] font-normal text-cream"
                  title={item.ipAddress}
                >
                  {item.ipAddress}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function technologiesFetchUrl(targetDomainId: string, hostnameNormalized: string) {
  return apiUrl(
    `/api/targets/${targetDomainId}/subdomains/${encodeURIComponent(hostnameNormalized)}/technologies`,
  );
}

function SubdomainTechnologiesSection({
  targetDomainId,
  hostnameNormalized,
}: {
  targetDomainId: string;
  hostnameNormalized: string;
}) {
  const [data, setData] = useState<TechnologiesData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Collapsed view shows roughly two rows of chips.
  const COLLAPSED_MAX_PX = 76;

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setExpanded(false);
    fetch(technologiesFetchUrl(targetDomainId, hostnameNormalized))
      .then((res) => (res.ok ? res.json() : { technologies: [], summary: { technologyCount: 0 } }))
      .then((json: TechnologiesData) => {
        if (!ignore) {
          setData(json);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!ignore) {
          setData({ technologies: [], summary: { technologyCount: 0 } });
          setLoading(false);
        }
      });
    return () => {
      ignore = true;
    };
  }, [targetDomainId, hostnameNormalized]);

  const techs = useMemo(() => data?.technologies ?? [], [data]);

  // Detect whether the chip list exceeds the collapsed height — only then
  // do we show the expand/collapse toggle. Re-measure when data changes.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const check = () => setOverflowing(el.scrollHeight > COLLAPSED_MAX_PX + 4);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [techs]);

  const showToggle = overflowing;
  const collapsed = showToggle && !expanded;

  return (
    <div className="mb-6 text-left">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-cream">Technologies</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            Software fingerprinted on this subdomain (Wappalyzer).
          </p>
        </div>
        {techs.length > 0 ? (
          <span className="shrink-0 rounded-md border border-line bg-white/[0.03] px-2 py-0.5 font-mono text-[10px] text-muted">
            {techs.length}
          </span>
        ) : null}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-r-transparent" />
        </div>
      ) : techs.length === 0 ? (
        <div className="rounded-lg border border-line bg-white/[0.02] px-4 py-3 text-[11px] text-muted">
          No technologies detected. Run a scan with the Wappalyzer engine enabled.
        </div>
      ) : (
        <div className="relative">
          <div
            ref={listRef}
            className="flex flex-wrap gap-2 overflow-hidden transition-[max-height] duration-300 ease-out"
            style={{ maxHeight: collapsed ? COLLAPSED_MAX_PX : listRef.current?.scrollHeight ?? "none" }}
          >
          {techs.map((t) => {
            const label = t.version ? `${t.name} ${t.version}` : t.name;
            const cats = t.categories.join(", ");
            const chip = (
              <span
                className="inline-flex items-center gap-1.5 rounded-md border border-line bg-white/[0.03] px-2.5 py-1.5 font-mono text-[11px] text-cream transition-colors hover:border-accent/40 hover:text-accent"
                title={cats ? `${label} — ${cats}` : label}
              >
                <TechIcon name={t.name} iconName={t.iconName} size={14} />
                <span className="truncate">{label}</span>
                {t.cves && t.cves.length > 0 ? (
                  <span className="shrink-0 rounded bg-warn/20 px-1 text-[9px] font-bold text-warn">
                    {t.cves.length} CVE
                  </span>
                ) : cats ? (
                  <span className="max-w-[120px] truncate text-[9px] font-medium uppercase tracking-wide text-muted">
                    {t.categories[0]}
                  </span>
                ) : null}
              </span>
            );
            return t.website ? (
              <a
                key={t.name}
                href={t.website}
                target="_blank"
                rel="noopener noreferrer"
                className="focus:outline-none"
              >
                {chip}
              </a>
            ) : (
              <div key={t.name}>{chip}</div>
            );
          })}
          </div>
          {showToggle ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-accent transition-colors hover:text-accent-dim focus:outline-none"
            >
              {expanded ? "Show less" : `Show all ${techs.length}`}
              <IconChevronDown
                className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
              />
            </button>
          ) : null}
        </div>
      )}

      <SubdomainCvesList techs={techs} />
    </div>
  );
}

function SubdomainCvesList({ techs }: { techs: TechnologyItem[] }) {
  // Aggregate unique CVEs across this host's technologies.
  const map = new Map<string, { cveId: string; severity: string | null; score: number | null }>();
  for (const t of techs) {
    for (const c of t.cves ?? []) {
      if (!map.has(c.cveId)) map.set(c.cveId, c);
    }
  }
  const cves = Array.from(map.values()).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  if (cves.length === 0) return null;

  return (
    <div className="mt-6 text-left">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-cream">Matched CVEs</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            Vulnerabilities matching this host&rsquo;s detected technologies.
          </p>
        </div>
        <span className="shrink-0 rounded-md bg-warn/20 px-2 py-0.5 font-mono text-[10px] font-bold text-warn">
          {cves.length}
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-line text-left">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 border-b border-line bg-[var(--table-header-bg)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
          <div>CVE</div>
          <div>Severity</div>
          <div>Score</div>
        </div>
        <div className="divide-y divide-line">
          {cves.slice(0, 50).map((c) => (
            <Link
              key={c.cveId}
              href={`/intel/cve/${encodeURIComponent(c.cveId)}`}
              className="group grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 px-2 py-1 transition-colors hover:bg-white/5"
            >
              <div className="min-w-0 truncate font-mono text-[10px] text-cream group-hover:text-accent">
                {c.cveId}
              </div>
              <div
                className={`justify-self-start rounded px-1.5 py-0.5 text-[9px] font-semibold ${severityBadgeClass(c.severity)}`}
              >
                {c.severity ?? "—"}
              </div>
              <div className="justify-self-end font-mono text-[10px] text-cream tabular-nums">
                {c.score != null ? c.score.toFixed(1) : "—"}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function sightingsFetchUrl(targetDomainId: string, hostnameNormalized: string, scanJobId: string | null | undefined) {
  const base = apiUrl(`/api/targets/${targetDomainId}/subdomains/${encodeURIComponent(hostnameNormalized)}/ip-sightings`);
  if (!scanJobId) return base;
  return `${base}?scanJobId=${encodeURIComponent(scanJobId)}`;
}

export function HostnameSightingPanel({ targetDomainId, hostnameNormalized, scanJobId, onClose }: HostnameSightingPanelProps) {
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<PanelData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setPage(1);
  }, [targetDomainId, hostnameNormalized, scanJobId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError(null);

    fetch(sightingsFetchUrl(targetDomainId, hostnameNormalized, scanJobId))
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch sightings");
        return res.json();
      })
      .then((json: PanelData) => {
        if (!ignore) {
          setData(json);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [targetDomainId, hostnameNormalized, scanJobId]);

  const sightings = data?.sightings ?? [];
  const totalPages = Math.max(1, Math.ceil(sightings.length / PANEL_SIGHTINGS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pagedSightings = sightings.slice(
    (safePage - 1) * PANEL_SIGHTINGS_PER_PAGE,
    safePage * PANEL_SIGHTINGS_PER_PAGE,
  );

  const ipCount = data?.summary.observedIpCount ?? 0;
  const displayHostname = data?.hostnameNormalized ?? hostnameNormalized;

  async function copyHostname() {
    if (!displayHostname) return;
    try {
      await navigator.clipboard.writeText(displayHostname);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  if (!mounted) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[90] bg-void/50" aria-hidden onClick={onClose} />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="hostname-panel-title"
        className="glass-panel fixed inset-y-0 right-0 z-[100] flex w-full max-w-[560px] flex-col rounded-none border-l border-line shadow-lift"
      >
        <div className="shrink-0 border-b border-line px-5 pb-4 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="hostname-panel-title" className="text-[12px] font-medium text-muted">
                Subdomain
              </h2>
              <div className="mt-1.5 flex min-w-0 items-center gap-2">
                <p className="min-w-0 truncate font-mono text-[18px] font-bold leading-tight tracking-tight text-cream">
                  {loading && !data ? "…" : displayHostname}
                </p>
                <button
                  type="button"
                  onClick={() => void copyHostname()}
                  disabled={loading || !displayHostname}
                  aria-label={copied ? "Hostname copied" : "Copy hostname"}
                  title={copied ? "Copied" : "Copy hostname"}
                  className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-[var(--nav-hover-bg)] hover:text-cream disabled:pointer-events-none disabled:opacity-30"
                >
                  <IconCopy className="size-3.5" />
                </button>
                <a
                  href={hostnameVisitHref(displayHostname)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Visit ${displayHostname}`}
                  title={`Visit ${displayHostname}`}
                  className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-[var(--nav-hover-bg)] hover:text-cream"
                >
                  <IconArrowUpRight className="size-4" />
                </a>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close panel"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-[var(--nav-hover-bg)] hover:text-cream"
            >
              <IconX className="size-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-r-transparent" />
            </div>
          ) : error ? (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-[12px] text-red-400">
              {error}
            </div>
          ) : data ? (
            <>
              {data.scope === "scan" ? (
                <p className="mb-4 text-[11px] leading-relaxed text-muted">
                  The IPs and timeline shown below reflect only the current scan.{" "}
                  {data.targetDomainId ? (
                    <>
                      <Link
                        href={`/targets/${data.targetDomainId}?tab=subdomains`}
                        className="font-medium text-accent hover:text-accent-dim"
                      >
                        Open the target subdomain directory
                      </Link>{" "}
                      to access the full history across all scans.
                    </>
                  ) : (
                    "Open the target subdomain directory to access the full history across all scans."
                  )}
                </p>
              ) : null}

              <div className="mb-6 flex items-start gap-3 rounded-lg border border-blue-500/25 bg-blue-500/10 px-4 py-3 text-[12px] leading-relaxed text-cream">
                <IconInfo className="mt-0.5 size-4 shrink-0 text-blue-500" />
                <p>
                  This panel displays the historical IP resolutions observed for <strong>{displayHostname}</strong>.
                  Multiple IPs may indicate load balancing, CDN usage, or historical infrastructure changes.
                </p>
              </div>

              <div className="mb-6">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">Summary</h3>
                <div className="mt-3 grid grid-cols-3">
                  <div className="min-w-0 pr-3 text-left">
                    <div className="text-[10px] font-medium text-muted">First Resolved</div>
                    <div className="mt-1 text-[11px] font-medium leading-snug text-cream">
                      {formatVtPassiveDnsDateTime(data.summary.firstResolvedAt)}
                    </div>
                  </div>
                  <div className="min-w-0 border-l border-line px-3 text-left">
                    <div className="text-[10px] font-medium text-muted">Last Resolved</div>
                    <div className="mt-1 text-[11px] font-medium leading-snug text-cream">
                      {formatVtPassiveDnsDateTime(data.summary.lastResolvedAt)}
                    </div>
                  </div>
                  <div className="min-w-0 border-l border-line pl-3 text-left">
                    <div className="text-[10px] font-medium text-muted">Observed IPs</div>
                    <div className="mt-1 text-[11px] font-medium leading-snug text-cream">
                      {ipCount.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mb-6 border-t border-line" aria-hidden />

              <SubdomainTechnologiesSection
                targetDomainId={targetDomainId}
                hostnameNormalized={displayHostname}
              />

              <div className="mb-6 border-t border-line" aria-hidden />

              <div className="mb-3 text-left">
                <h3 className="text-[13px] font-semibold text-cream">Historical IP Addresses</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">
                  IP addresses that this hostname has been observed resolving to.
                </p>
              </div>

              <HostnameSightingIpsTable
                sightings={pagedSightings}
                emptyLabel={
                  sightings.length === 0
                    ? "No observations found."
                    : "No observations on this page."
                }
              />
              <HostnamePanelSimplePagination
                page={safePage}
                totalPages={totalPages}
                onPageChange={setPage}
              />

              <HostnameSightingAssociationTimeline
                sightings={sightings}
                hostnameNormalized={data.hostnameNormalized}
                latestSighting={sightings[0]}
              />
            </>
          ) : null}
        </div>
      </aside>
    </>,
    document.body,
  );
}
