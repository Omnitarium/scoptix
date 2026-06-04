"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { IconArrowUpRight, IconCopy, IconInfo, IconX } from "@/components/ui-icons";
import {
  formatObservedHostnameCount,
  formatPassiveDnsPanelDateTime,
  formatVtPassiveDnsDateTime,
  vtPassiveDnsIpBanner,
} from "@/lib/scan-format";

const PANEL_SIGHTINGS_PER_PAGE = 7;

export type IpSightingPanelProps = {
  ipResolutionId: string;
  /** Limits sightings to this scan when set (observed scan context). */
  scanJobId?: string | null;
  onClose: () => void;
};

type SightingData = {
  hostnameNormalized: string;
  lastResolvedAt: string;
};

type PanelData = {
  scope?: "scan" | "target";
  targetDomainId?: string;
  ipAddress: string;
  summary: {
    firstResolvedAt: string | null;
    lastResolvedAt: string;
    observedHostnameCount: number;
  };
  sightings: SightingData[];
};

type TimelineItem = {
  hostnameNormalized: string;
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
      s.hostnameNormalized === latestSighting.hostnameNormalized &&
      s.lastResolvedAt === latestSighting.lastResolvedAt;
    return {
      hostnameNormalized: s.hostnameNormalized,
      dateLabel: formatPassiveDnsPanelDateTime(s.lastResolvedAt),
      year: showYear ? year : "",
      isLatest,
    };
  });
}

function IpPanelSimplePagination({
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

function IpSightingHostnamesTable({
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
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_1.5rem] items-center gap-x-2 border-b border-line bg-[var(--table-header-bg)] px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted">
        <div>Hostname</div>
        <div>Last Resolved</div>
        <span className="sr-only">Visit</span>
      </div>

      <div className="divide-y divide-line">
        {sightings.map((s) => (
          <div
            key={`${s.hostnameNormalized}-${s.lastResolvedAt}`}
            className="group grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_1.5rem] items-center gap-x-2 px-2 py-1 text-left"
          >
            <div
              className="min-w-0 truncate font-mono text-[10px] text-cream"
              title={s.hostnameNormalized}
            >
              {s.hostnameNormalized}
            </div>
            <div className="min-w-0 truncate text-[10px] text-muted tabular-nums">
              {formatPassiveDnsPanelDateTime(s.lastResolvedAt)}
            </div>
            <a
              href={hostnameVisitHref(s.hostnameNormalized)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Visit ${s.hostnameNormalized}`}
              title={`Visit ${s.hostnameNormalized}`}
              className="flex size-6 items-center justify-start text-muted transition-colors hover:text-cream"
            >
              <IconArrowUpRight className="size-3.5 opacity-60 group-hover:opacity-100" />
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

function IpSightingAssociationTimeline({
  sightings,
  ipAddress,
  latestSighting,
}: {
  sightings: SightingData[];
  ipAddress: string;
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
        Association Timeline for {ipAddress}
      </h3>
      <p className="mt-1 text-[12px] leading-relaxed text-muted">
        When this IP was observed resolving for different hostnames.
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
              key={`${item.hostnameNormalized}-${item.dateLabel}`}
              className="flex items-center gap-3"
            >
              <div className="w-10 shrink-0 text-right text-[10px] font-semibold leading-none text-cream">
                {item.year || "\u00a0"}
              </div>
              <div className="relative flex w-5 shrink-0 justify-center">
                <div
                  className={[
                    "relative z-10 size-2.5 shrink-0 rounded-full ring-4 ring-lift",
                    item.isLatest ? "bg-accent" : "bg-muted",
                  ].join(" ")}
                  aria-hidden
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0">
                <span className="shrink-0 text-[10px] text-muted">{item.dateLabel}</span>
                <span
                  className="min-w-0 font-mono text-[10px] font-normal text-cream"
                  title={item.hostnameNormalized}
                >
                  {item.hostnameNormalized}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function sightingsFetchUrl(ipResolutionId: string, scanJobId: string | null | undefined) {
  const base = `/api/ip-resolutions/${ipResolutionId}/sightings`;
  if (!scanJobId) return base;
  return `${base}?scanJobId=${encodeURIComponent(scanJobId)}`;
}

export function IpSightingPanel({ ipResolutionId, scanJobId, onClose }: IpSightingPanelProps) {
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
  }, [ipResolutionId, scanJobId]);

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

    fetch(sightingsFetchUrl(ipResolutionId, scanJobId))
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
  }, [ipResolutionId, scanJobId]);

  const sightings = data?.sightings ?? [];
  const totalPages = Math.max(1, Math.ceil(sightings.length / PANEL_SIGHTINGS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pagedSightings = sightings.slice(
    (safePage - 1) * PANEL_SIGHTINGS_PER_PAGE,
    safePage * PANEL_SIGHTINGS_PER_PAGE,
  );

  const hostnameCount = data?.summary.observedHostnameCount ?? 0;
  const displayIp = data?.ipAddress ?? "…";

  async function copyIpAddress() {
    const ip = data?.ipAddress;
    if (!ip) return;
    try {
      await navigator.clipboard.writeText(ip);
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
        aria-labelledby="ip-panel-title"
        className="fixed inset-y-0 right-0 z-[100] flex w-full max-w-[560px] flex-col border-l border-line bg-lift shadow-lift"
      >
        <div className="shrink-0 border-b border-line px-5 pb-4 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="ip-panel-title" className="text-[12px] font-medium text-muted">
                IP Address
              </h2>
              <div className="mt-1.5 flex min-w-0 items-center gap-2">
                <p className="min-w-0 truncate font-mono text-[18px] font-bold leading-tight tracking-tight text-cream">
                  {loading && !data ? "…" : displayIp}
                </p>
                <button
                  type="button"
                  onClick={() => void copyIpAddress()}
                  disabled={loading || !data?.ipAddress}
                  aria-label={copied ? "IP copied" : "Copy IP address"}
                  title={copied ? "Copied" : "Copy IP address"}
                  className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-white/5 hover:text-cream disabled:pointer-events-none disabled:opacity-30"
                >
                  <IconCopy className="size-3.5" />
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close panel"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white/5 hover:text-cream"
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
                  The hostnames and timeline shown below reflect only the current scan.{" "}
                  {data.targetDomainId ? (
                    <>
                      <Link
                        href={`/targets/${data.targetDomainId}?tab=ips`}
                        className="font-medium text-accent hover:text-accent-dim"
                      >
                        Open the target IP directory
                      </Link>{" "}
                      to access the full history across all scans.
                    </>
                  ) : (
                    "Open the target IP directory to access the full history across all scans."
                  )}
                </p>
              ) : null}

              <div className="mb-6 flex items-start gap-3 rounded-lg border border-blue-500/25 bg-blue-500/10 px-4 py-3 text-[12px] leading-relaxed text-cream">
                <IconInfo className="mt-0.5 size-4 shrink-0 text-blue-500" />
                <p>{vtPassiveDnsIpBanner(hostnameCount)}</p>
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
                    <div className="text-[10px] font-medium text-muted">Observed in</div>
                    <div className="mt-1 text-[11px] font-medium leading-snug text-cream">
                      {formatObservedHostnameCount(data.summary.observedHostnameCount)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mb-6 border-t border-line" aria-hidden />

              <div className="mb-3 text-left">
                <h3 className="text-[13px] font-semibold text-cream">Historical Hostnames</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">
                  Domains and subdomains that have been observed resolving to this IP.
                </p>
              </div>

              <IpSightingHostnamesTable
                sightings={pagedSightings}
                emptyLabel={
                  sightings.length === 0
                    ? "No observations found."
                    : "No observations on this page."
                }
              />
              <IpPanelSimplePagination
                page={safePage}
                totalPages={totalPages}
                onPageChange={setPage}
              />

              <IpSightingAssociationTimeline
                sightings={sightings}
                ipAddress={data.ipAddress}
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
