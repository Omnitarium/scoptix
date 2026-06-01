"use client";

import { useState, useCallback, useRef } from "react";
import type { SummaryDiscoveryPoint } from "@/lib/scan-summary";

/* ── theme-aware palette ──────────────────────────────────────── */
const URL_COLOR = "var(--color-accent)";
const FINDING_COLOR = "var(--chart-finding, #a78bfa)";

/* ── layout constants ─────────────────────────────────────────── */
const W = 440;
const H = 240;
const PAD = { top: 28, right: 52, bottom: 38, left: 52 };
const PLOT_X_INSET = 20;

/* ── helpers ───────────────────────────────────────────────────── */
function niceYMax(maxVal: number) {
  if (maxVal <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(maxVal));
  const normalized = maxVal / magnitude;
  let nice = 10;
  if (normalized <= 1) nice = 1;
  else if (normalized <= 2) nice = 2;
  else if (normalized <= 5) nice = 5;
  return nice * magnitude;
}

function formatTick(value: number) {
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return Number.isInteger(m) ? `${m}M` : `${m.toFixed(1)}M`;
  }
  if (value >= 1000) {
    const k = value / 1000;
    return Number.isInteger(k) ? `${k}k` : `${k.toFixed(1)}k`;
  }
  return value.toLocaleString();
}

type Coord = { x: number; y: number; value: number; point: SummaryDiscoveryPoint };

function seriesX(index: number, count: number, plotWidth: number) {
  if (count <= 1) return plotWidth / 2;
  const innerWidth = plotWidth - PLOT_X_INSET * 2;
  return PLOT_X_INSET + (index / (count - 1)) * innerWidth;
}

function seriesPoints(
  points: SummaryDiscoveryPoint[],
  valueKey: "urlCount" | "findingCount",
  plotWidth: number,
  plotHeight: number,
  yMax: number,
): Coord[] {
  const n = points.length;
  return points.map((point, index) => {
    const x = seriesX(index, n, plotWidth);
    const value = point[valueKey];
    const y = plotHeight - (value / yMax) * plotHeight;
    return { x: PAD.left + x, y: PAD.top + y, value, point };
  });
}

/** Catmull-Rom to cubic Bézier conversion for smooth curves. */
function smoothPath(coords: Coord[], tension = 0.35): string {
  if (coords.length === 0) return "";
  if (coords.length === 1) return `M ${coords[0].x.toFixed(2)} ${coords[0].y.toFixed(2)}`;
  if (coords.length === 2) {
    return `M ${coords[0].x.toFixed(2)} ${coords[0].y.toFixed(2)} L ${coords[1].x.toFixed(2)} ${coords[1].y.toFixed(2)}`;
  }

  let d = `M ${coords[0].x.toFixed(2)} ${coords[0].y.toFixed(2)}`;

  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[Math.max(i - 1, 0)];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[Math.min(i + 2, coords.length - 1)];

    const cp1x = p1.x + ((p2.x - p0.x) * tension) / 3;
    const cp1y = p1.y + ((p2.y - p0.y) * tension) / 3;
    const cp2x = p2.x - ((p3.x - p1.x) * tension) / 3;
    const cp2y = p2.y - ((p3.y - p1.y) * tension) / 3;

    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }

  return d;
}

function smoothAreaPath(coords: Coord[], baselineY: number): string {
  if (coords.length === 0) return "";
  const line = smoothPath(coords);
  const last = coords[coords.length - 1];
  const first = coords[0];
  return `${line} L ${last.x.toFixed(2)} ${baselineY.toFixed(2)} L ${first.x.toFixed(2)} ${baselineY.toFixed(2)} Z`;
}

function yTicks(yMax: number, steps = 4) {
  const step = yMax / steps;
  return Array.from({ length: steps + 1 }, (_, i) => i * step);
}

/* ── sub-components ────────────────────────────────────────────── */
function LegendPill({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line/60 bg-void/50 px-2.5 py-0.5 text-[10px] font-medium text-muted backdrop-blur-sm">
      <span
        className="size-2 shrink-0 rounded-full shadow-sm"
        style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}44` }}
      />
      {label}
    </span>
  );
}

function SingleScanSnapshot({ point }: { point: SummaryDiscoveryPoint }) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-4">
      <p className="text-[12px] leading-relaxed text-muted">
        One completed scan so far. Run another scan on this target to see how URLs and findings
        change over time.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="scx-summary-inner-item group relative overflow-hidden px-3 py-2.5">
          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{ background: `linear-gradient(135deg, ${URL_COLOR}, transparent 70%)` }}
          />
          <div className="relative">
            <div className="text-[10px] font-bold uppercase tracking-wide text-muted">URLs</div>
            <div className="mt-1 text-lg font-bold tabular-nums text-accent">
              {point.urlCount.toLocaleString()}
            </div>
          </div>
        </div>
        <div className="scx-summary-inner-item group relative overflow-hidden px-3 py-2.5">
          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{ background: `linear-gradient(135deg, ${FINDING_COLOR}, transparent 70%)` }}
          />
          <div className="relative">
            <div className="text-[10px] font-bold uppercase tracking-wide text-muted">Findings</div>
            <div className="mt-1 text-lg font-bold tabular-nums" style={{ color: FINDING_COLOR }}>
              {point.findingCount.toLocaleString()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── tooltip ──────────────────────────────────────────────────── */
type TooltipData = {
  x: number;
  y: number;
  label: string;
  urls: number;
  findings: number;
  isCurrent: boolean;
};

function ChartTooltip({ data }: { data: TooltipData }) {
  const left = data.x < W / 2;
  return (
    <g>
      {/* Vertical guide line */}
      <line
        x1={data.x}
        y1={PAD.top}
        x2={data.x}
        y2={PAD.top + H - PAD.top - PAD.bottom}
        stroke="var(--color-line)"
        strokeOpacity={0.5}
        strokeDasharray="2 3"
        strokeWidth={1}
      />
      <foreignObject
        x={left ? data.x + 10 : data.x - 140}
        y={Math.max(PAD.top, data.y - 50)}
        width={130}
        height={78}
        style={{ overflow: "visible" }}
      >
        <div
          className="rounded-lg border border-line/80 p-2 text-[10px] shadow-lg backdrop-blur-md"
          style={{
            background: "var(--glass-panel-bg)",
            boxShadow: "var(--shadow-glass)",
          }}
        >
          <div className="mb-1.5 font-semibold text-cream">
            {data.label}
            {data.isCurrent && (
              <span className="ml-1 text-[9px] font-normal text-accent">(current)</span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="size-1.5 rounded-full"
              style={{ backgroundColor: URL_COLOR }}
            />
            <span className="text-muted">URLs:</span>
            <span className="ml-auto font-semibold tabular-nums text-cream">
              {data.urls.toLocaleString()}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span
              className="size-1.5 rounded-full"
              style={{ backgroundColor: FINDING_COLOR }}
            />
            <span className="text-muted">Findings:</span>
            <span className="ml-auto font-semibold tabular-nums text-cream">
              {data.findings.toLocaleString()}
            </span>
          </div>
        </div>
      </foreignObject>
    </g>
  );
}

/* ── main chart component ─────────────────────────────────────── */
export function DiscoveryOverTimeChart({
  points,
}: {
  points: SummaryDiscoveryPoint[];
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const plotWidth = W - PAD.left - PAD.right;
  const plotHeight = H - PAD.top - PAD.bottom;
  const baselineY = PAD.top + plotHeight;

  const urlMax = niceYMax(Math.max(...points.map((p) => p.urlCount), 1));
  const findingMax = niceYMax(Math.max(...points.map((p) => p.findingCount), 1));

  const urlCoords = seriesPoints(points, "urlCount", plotWidth, plotHeight, urlMax);
  const findingCoords = seriesPoints(points, "findingCount", plotWidth, plotHeight, findingMax);

  const urlLine = smoothPath(urlCoords);
  const findingLine = smoothPath(findingCoords);
  const urlArea = smoothAreaPath(urlCoords, baselineY);
  const findingArea = smoothAreaPath(findingCoords, baselineY);

  const gridTicks = yTicks(urlMax);

  const ariaLabel =
    points.length === 0
      ? "Target History: no completed scans yet"
      : `Target History: ${points
          .map((p) => `${p.label} URLs ${p.urlCount}, findings ${p.findingCount}`)
          .join("; ")}`;

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (points.length < 2 || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * W;
      let closest = 0;
      let minDist = Infinity;
      for (let i = 0; i < urlCoords.length; i++) {
        const dist = Math.abs(urlCoords[i].x - mouseX);
        if (dist < minDist) {
          minDist = dist;
          closest = i;
        }
      }
      setHoveredIndex(minDist < 40 ? closest : null);
    },
    [points.length, urlCoords],
  );

  const handleMouseLeave = useCallback(() => setHoveredIndex(null), []);

  const tooltipData: TooltipData | null =
    hoveredIndex !== null && urlCoords[hoveredIndex]
      ? {
          x: urlCoords[hoveredIndex].x,
          y: Math.min(urlCoords[hoveredIndex].y, findingCoords[hoveredIndex].y),
          label: points[hoveredIndex].label,
          urls: points[hoveredIndex].urlCount,
          findings: points[hoveredIndex].findingCount,
          isCurrent: points[hoveredIndex].isCurrent,
        }
      : null;

  return (
    <div className="flex h-full min-h-[260px] flex-col">
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-cream">Target History</h2>
          <p className="mt-0.5 text-[11px] text-muted">
            {points.length <= 1
              ? "URLs & findings on this target"
              : `Last ${points.length} completed scans · same target`}
          </p>
        </div>
        {points.length >= 2 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <LegendPill color={URL_COLOR} label="URLs" />
            <LegendPill color={FINDING_COLOR} label="Findings" />
          </div>
        ) : null}
      </div>

      {/* Body */}
      {points.length === 0 ? (
        <p className="flex flex-1 items-center text-[12px] text-muted">
          Complete a scan to start tracking URLs and findings for this target.
        </p>
      ) : points.length === 1 ? (
        <SingleScanSnapshot point={points[0]} />
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="h-full w-full select-none"
            role="img"
            aria-label={ariaLabel}
            preserveAspectRatio="xMidYMid meet"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{ minHeight: 200 }}
          >
            <defs>
              {/* URL gradient fill */}
              <linearGradient id="disc-url-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={URL_COLOR} stopOpacity={0.18} />
                <stop offset="60%" stopColor={URL_COLOR} stopOpacity={0.06} />
                <stop offset="100%" stopColor={URL_COLOR} stopOpacity={0.01} />
              </linearGradient>

              {/* Finding gradient fill */}
              <linearGradient id="disc-find-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={FINDING_COLOR} stopOpacity={0.15} />
                <stop offset="60%" stopColor={FINDING_COLOR} stopOpacity={0.04} />
                <stop offset="100%" stopColor={FINDING_COLOR} stopOpacity={0.005} />
              </linearGradient>

              {/* Glow filter for active dots */}
              <filter id="dot-glow-url" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="dot-glow-find" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* ── Grid lines ──────────────────────────── */}
            {gridTicks.map((tick) => {
              const y = PAD.top + plotHeight - (tick / urlMax) * plotHeight;
              const isBaseline = tick === 0;
              return (
                <g key={`grid-${tick}`}>
                  {!isBaseline ? (
                    <line
                      x1={PAD.left}
                      y1={y}
                      x2={PAD.left + plotWidth}
                      y2={y}
                      stroke="var(--color-line)"
                      strokeOpacity={0.5}
                      strokeDasharray="3 3"
                      strokeWidth={1}
                    />
                  ) : null}
                  {/* Left axis — URLs */}
                  <text
                    x={PAD.left - 8}
                    y={y + 3}
                    textAnchor="end"
                    fill="var(--color-muted)"
                    fontSize={8.5}
                    fontWeight={400}
                    opacity={0.75}
                  >
                    {formatTick(tick)}
                  </text>
                  {/* Right axis — Findings */}
                  <text
                    x={PAD.left + plotWidth + 8}
                    y={y + 3}
                    textAnchor="start"
                    fill="var(--color-muted)"
                    fontSize={8.5}
                    fontWeight={400}
                    opacity={0.75}
                  >
                    {formatTick((tick / urlMax) * findingMax)}
                  </text>
                </g>
              );
            })}

            {/* ── Axes (origin at 0) ─────────────────── */}
            <line
              x1={PAD.left}
              y1={baselineY}
              x2={PAD.left + plotWidth}
              y2={baselineY}
              stroke="var(--color-line)"
              strokeOpacity={0.9}
              strokeWidth={1.25}
            />
            <line
              x1={PAD.left}
              y1={baselineY}
              x2={PAD.left}
              y2={PAD.top}
              stroke="var(--color-line)"
              strokeOpacity={0.9}
              strokeWidth={1.25}
            />

            {/* Axis labels */}
            <text
              x={PAD.left - 8}
              y={PAD.top - 12}
              textAnchor="end"
              fontSize={8}
              fontWeight={600}
              fill={URL_COLOR}
              opacity={0.7}
            >
              URLs
            </text>
            <text
              x={PAD.left + plotWidth + 8}
              y={PAD.top - 12}
              textAnchor="start"
              fontSize={8}
              fontWeight={600}
              fill={FINDING_COLOR}
              opacity={0.7}
            >
              Findings
            </text>

            {/* ── Area fills ──────────────────────────── */}
            {findingArea && (
              <path
                d={findingArea}
                fill="url(#disc-find-fill)"
                className="transition-opacity duration-300"
                opacity={hoveredIndex !== null ? 0.7 : 1}
              />
            )}
            {urlArea && (
              <path
                d={urlArea}
                fill="url(#disc-url-fill)"
                className="transition-opacity duration-300"
                opacity={hoveredIndex !== null ? 0.7 : 1}
              />
            )}

            {/* ── Lines ───────────────────────────────── */}
            {findingLine && (
              <path
                d={findingLine}
                fill="none"
                stroke={FINDING_COLOR}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                opacity={0.9}
              />
            )}
            {urlLine && (
              <path
                d={urlLine}
                fill="none"
                stroke={URL_COLOR}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                opacity={0.9}
              />
            )}

            {/* ── Data points — URLs ──────────────────── */}
            {urlCoords.map(({ x, y, value, point }, idx) => {
              const isHovered = hoveredIndex === idx;
              const r = point.isCurrent ? 4 : 3;
              return (
                <g key={`url-${point.scanId}`} className="transition-opacity duration-200">
                  {/* Outer glow ring */}
                  <circle
                    cx={x}
                    cy={y}
                    r={isHovered ? r + 4 : r + 2}
                    fill={URL_COLOR}
                    opacity={isHovered ? 0.2 : point.isCurrent ? 0.12 : 0.06}
                    className="transition-all duration-200"
                  />
                  {/* Dot */}
                  <circle
                    cx={x}
                    cy={y}
                    r={isHovered ? r + 1 : r}
                    fill="var(--color-lift)"
                    stroke={URL_COLOR}
                    strokeWidth={isHovered ? 2.5 : 2}
                    className="transition-all duration-200"
                    filter={isHovered ? "url(#dot-glow-url)" : undefined}
                  />
                  <title>{`${point.label}: ${value.toLocaleString()} URLs${point.isCurrent ? " (current)" : ""}`}</title>
                </g>
              );
            })}

            {/* ── Data points — Findings ──────────────── */}
            {findingCoords.map(({ x, y, value, point }, idx) => {
              const isHovered = hoveredIndex === idx;
              const r = point.isCurrent ? 4 : 3;
              return (
                <g key={`finding-${point.scanId}`} className="transition-opacity duration-200">
                  <circle
                    cx={x}
                    cy={y}
                    r={isHovered ? r + 4 : r + 2}
                    fill={FINDING_COLOR}
                    opacity={isHovered ? 0.2 : point.isCurrent ? 0.12 : 0.06}
                    className="transition-all duration-200"
                  />
                  <circle
                    cx={x}
                    cy={y}
                    r={isHovered ? r + 1 : r}
                    fill="var(--color-lift)"
                    stroke={FINDING_COLOR}
                    strokeWidth={isHovered ? 2.5 : 2}
                    className="transition-all duration-200"
                    filter={isHovered ? "url(#dot-glow-find)" : undefined}
                  />
                  <title>{`${point.label}: ${value.toLocaleString()} findings${point.isCurrent ? " (current)" : ""}`}</title>
                </g>
              );
            })}

            {/* ── X-axis labels ───────────────────────── */}
            {points.map((point, index) => {
              const x = PAD.left + seriesX(index, points.length, plotWidth);
              const isHovered = hoveredIndex === index;
              return (
                <text
                  key={`label-${point.scanId}`}
                  x={x}
                  y={H - 8}
                  textAnchor="middle"
                  fill={
                    isHovered || point.isCurrent
                      ? "var(--color-cream)"
                      : "var(--color-muted)"
                  }
                  fontSize={9}
                  fontWeight={isHovered || point.isCurrent ? 600 : 400}
                  className="transition-all duration-200"
                >
                  {point.label}
                </text>
              );
            })}

            {/* ── Tooltip overlay ──────────────────────── */}
            {tooltipData && <ChartTooltip data={tooltipData} />}
          </svg>
        </div>
      )}
    </div>
  );
}
