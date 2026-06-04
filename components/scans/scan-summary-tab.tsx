import Link from "next/link";
import { DiscoveryOverTimeChart } from "@/components/scans/discovery-over-time-chart";
import { SourcesDonutChart } from "@/components/scans/sources-donut-chart";
import { SummaryRankRow, SummaryRankTableHeader } from "@/components/scans/summary-rank-row";
import {
  IconAlertTriangle,
  IconArrowLeftRight,
  IconArrowRight,
  IconArrowUpRight,
  IconGlobe,
  IconLink,
  IconServer,
} from "@/components/ui-icons";
import { scanPanelEyebrowClass } from "@/components/scans/scan-panel-heading";
import type { ScanSummaryData, SummaryChangeLine } from "@/lib/scan-summary";

const summaryFooterLinkClass =
  "inline-flex items-center text-[12px] font-medium text-accent hover:text-accent-dim";

/** Adapts column count via `.scx-summary-layout-grid` container queries on main shell. */
const summaryLayoutGridClass = "scx-summary-layout-grid";

function ChangeIcon({ icon, tone }: { icon: SummaryChangeLine["icon"]; tone: SummaryChangeLine["tone"] }) {
  const cls = "mr-3 size-4 shrink-0";
  if (icon === "finding") {
    return <IconAlertTriangle className={`${cls} text-purple-500`} />;
  }
  if (icon === "server") {
    if (tone === "negative") return <IconServer className={`${cls} text-red-500`} />;
    return <IconServer className={`${cls} text-green-600`} />;
  }
  if (tone === "negative") {
    if (icon === "link-removed") {
      return <IconArrowUpRight className={`${cls} rotate-45 text-red-500`} />;
    }
    return <IconGlobe className={`${cls} text-red-500`} />;
  }
  if (icon === "link") return <IconLink className={`${cls} text-green-600`} />;
  return <IconGlobe className={`${cls} text-green-600`} />;
}

function valueToneClass(tone: SummaryChangeLine["tone"]) {
  if (tone === "positive") return "text-green-600";
  if (tone === "negative") return "text-red-500";
  return "text-muted";
}

/** Legend dot colors aligned with sources donut gradients. */
function sourceSliceColor(label: string, fallback: string) {
  if (label === "Wayback Machine") return "#22c55e";
  if (label === "VirusTotal") return "#9333ea";
  return fallback;
}

export function ScanSummaryTab({
  data,
  basePath,
  compareHref,
  scope = "scan",
}: {
  data: ScanSummaryData;
  basePath: string;
  compareHref: string;
  scope?: "scan" | "target";
}) {
  const isTarget = scope === "target";
  return (
    <div className="space-y-4">
      <div className={summaryLayoutGridClass}>
        <section className="scx-summary-card flex h-full flex-col">
          <h2 className={`mb-2.5 ${scanPanelEyebrowClass}`}>Findings by Type (Top 10)</h2>
          <SummaryRankTableHeader labelCol="Type" countLabel="Count" />
          <div className="flex-1 space-y-0.5">
            {data.findingsTop10.length === 0 ? (
              <p className="py-6 text-center text-[12px] text-muted">
                {isTarget ? "No findings for this target yet." : "No findings in this scan."}
              </p>
            ) : (
              data.findingsTop10.map((row) => <SummaryRankRow key={row.label} row={row} />)
            )}
          </div>
          <div className="scx-summary-card-footer">
            <Link href={`${basePath}?tab=findings`} className={summaryFooterLinkClass}>
              View all {data.findingsTypeTotal} finding types
              <IconArrowRight className="ml-1 size-3.5" />
            </Link>
          </div>
        </section>

        <section className="scx-summary-card flex h-full flex-col">
          <h2 className={`mb-2.5 ${scanPanelEyebrowClass}`}>URL Categories (Top 10)</h2>
          <SummaryRankTableHeader labelCol="Category" countLabel="URLs" />
          <div className="flex-1 space-y-0.5">
            {data.urlCategoriesTop10.length === 0 ? (
              <p className="py-6 text-center text-[12px] text-muted">
                {isTarget
                  ? "No categorized URLs for this target yet."
                  : "No categorized URLs in this snapshot."}
              </p>
            ) : (
              data.urlCategoriesTop10.map((row) => (
                <SummaryRankRow key={row.label} row={row} showIcon={false} />
              ))
            )}
          </div>
          <div className="scx-summary-card-footer">
            <Link href={`${basePath}?tab=urls`} className={summaryFooterLinkClass}>
              View all categories
              <IconArrowRight className="ml-1 size-3.5" />
            </Link>
          </div>
        </section>

        <section className="scx-summary-card flex h-full flex-col">
          <h2 className={`mb-2.5 ${scanPanelEyebrowClass}`}>Changes Since Previous Scan</h2>
          {!data.changes.baselineScanId ? (
            <p className="text-[12px] leading-relaxed text-muted">
              No earlier completed scan for this target yet. Run another scan later to see
              subdomain, URL, and finding deltas here.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                {data.changes.lines.map((line) => (
                  <div key={line.label}>
                    {line.dividerBefore ? (
                      <hr className="mb-2 mt-1 border-line" />
                    ) : null}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center text-[12px] font-medium text-cream">
                        <ChangeIcon icon={line.icon} tone={line.tone} />
                        {line.label}
                      </div>
                      <span className={`shrink-0 font-bold ${valueToneClass(line.tone)}`}>
                        {line.value}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <Link href={compareHref} className="scx-summary-compare-btn">
                <IconArrowLeftRight className="mr-2 size-3.5" />
                View comparison
                <IconArrowRight className="ml-2 size-3.5" />
              </Link>
            </>
          )}
        </section>
      </div>

      <div className={summaryLayoutGridClass}>
        <section className="scx-summary-card flex min-h-[260px] flex-col">
          <DiscoveryOverTimeChart points={data.discoveryTimeline} />
        </section>

        <section className="scx-summary-card flex h-full min-w-0 flex-col overflow-hidden">
          <h2 className={`mb-2.5 ${scanPanelEyebrowClass}`}>Last 5 Findings</h2>
          <div className="min-w-0 flex-1 space-y-1.5 overflow-hidden pb-3">
            {data.latestFindings.length === 0 ? (
              <p className="py-4 text-center text-[12px] text-muted">
                {isTarget ? "No findings for this target yet." : "No findings in this scan yet."}
              </p>
            ) : (
              data.latestFindings.map((item) => (
                <div
                  key={item.id}
                  className="scx-summary-inner-item min-w-0 overflow-hidden !p-2.5"
                >
                  <div className="flex min-w-0 items-start gap-2">
                    <span
                      className="scx-finding-type-badge max-w-[38%] shrink-0 self-center truncate px-1.5 py-px text-[9px]"
                      title={item.findingType}
                    >
                      {item.findingType}
                    </span>
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <div
                        className="truncate text-[11px] font-medium leading-snug text-cream"
                        title={item.url}
                      >
                        {item.url}
                      </div>
                      <div
                        className="mt-px truncate text-[10px] leading-snug text-muted"
                        title={item.description}
                      >
                        {item.description}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="scx-summary-card-footer mt-1 pt-3.5">
            <Link href={`${basePath}?tab=findings`} className={summaryFooterLinkClass}>
              View all findings
              <IconArrowRight className="ml-1 size-3.5" />
            </Link>
          </div>
        </section>

        <section className="scx-summary-card flex min-h-[220px] flex-col">
          <h2 className={`mb-2.5 ${scanPanelEyebrowClass}`}>Sources</h2>
          {data.sources.length === 0 ? (
            <p className="text-[12px] text-muted">
              {isTarget
                ? "Source breakdown unavailable for this target."
                : "Source breakdown unavailable for this snapshot."}
            </p>
          ) : (
            <>
              <div className="flex flex-1 flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-5">
                <SourcesDonutChart
                  sources={data.sources}
                  total={data.urlTotalForSources}
                />
                <div className="w-full shrink-0 space-y-4 sm:w-auto">
                  {data.sources.map((slice) => {
                    const color = sourceSliceColor(slice.label, slice.color);
                    return (
                      <div key={slice.label}>
                        <div className="mb-1 flex items-center text-sm font-bold text-cream">
                          <span
                            className="mr-2 size-3 shrink-0 rounded-full"
                            style={{ backgroundColor: color }}
                          />
                          {slice.label}
                        </div>
                        <div className="ml-5 text-xs text-muted">
                          {slice.count.toLocaleString()} ({slice.percent}%)
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="scx-summary-card-footer">
                <Link href={`${basePath}?tab=urls`} className={summaryFooterLinkClass}>
                  View source breakdown
                  <IconArrowRight className="ml-1 size-3.5" />
                </Link>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
