"use client";

import Link from "next/link";
import {
  IconArrowDown,
  IconArrowUp,
  IconArrowUpDown,
  IconChevronRight,
} from "@/components/ui-icons";
import {
  buildIpSortHref,
  IP_SORT_FIELD_LABELS,
  IP_SORTABLE_FIELDS,
  nextIpSort,
  type IpSortField,
  type IpTableSort,
} from "@/lib/ip-table-sort";
import {
  formatHostnameCountLabel,
  formatIpTableDateTime,
} from "@/lib/scan-format";

export type IpDirectoryRowData = {
  id: string;
  ipAddress: string;
  hostnameCount: number;
  lastResolvedAt: Date;
  lastSeenBy: string;
};

function SortHeaderButton({
  field,
  sort,
  basePath,
  fixedParams,
}: {
  field: IpSortField;
  sort: IpTableSort;
  basePath: string;
  fixedParams: Record<string, string>;
}) {
  const active = sort.field === field;
  const href = buildIpSortHref(basePath, fixedParams, nextIpSort(field, sort));
  const SortIcon = active ? (sort.dir === "asc" ? IconArrowUp : IconArrowDown) : IconArrowUpDown;

  return (
    <Link
      href={href}
      className={[
        "inline-flex min-w-0 items-center gap-1 transition-colors hover:text-cream",
        active ? "text-cream" : "text-muted",
      ].join(" ")}
      aria-label={`Sort by ${IP_SORT_FIELD_LABELS[field]}${active ? `, ${sort.dir === "asc" ? "ascending" : "descending"}` : ""}`}
    >
      <span>{IP_SORT_FIELD_LABELS[field]}</span>
      <SortIcon className={["size-3 shrink-0", active ? "text-accent" : "opacity-45"].join(" ")} />
    </Link>
  );
}

export function IpDirectoryTableHeader({
  sort,
  basePath,
  fixedParams,
}: {
  sort: IpTableSort;
  basePath: string;
  fixedParams: Record<string, string>;
}) {
  return (
    <>
      <div className="hidden border-b border-line bg-[var(--table-header-bg)] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider md:grid md:grid-cols-[3fr_2fr_3fr_3fr_1.75rem] md:items-center md:gap-3">
        <SortHeaderButton field="ip" sort={sort} basePath={basePath} fixedParams={fixedParams} />
        <SortHeaderButton field="hostnames" sort={sort} basePath={basePath} fixedParams={fixedParams} />
        <SortHeaderButton field="lastResolved" sort={sort} basePath={basePath} fixedParams={fixedParams} />
        <SortHeaderButton field="lastSeen" sort={sort} basePath={basePath} fixedParams={fixedParams} />
        <div className="sr-only">Open</div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-[var(--table-header-bg)] px-5 py-2.5 md:hidden">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Sort</span>
        {IP_SORTABLE_FIELDS.map((field) => (
          <Link
            key={field}
            href={buildIpSortHref(basePath, fixedParams, nextIpSort(field, sort))}
            className={[
              "rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors",
              sort.field === field
                ? "border-accent/35 bg-accent/10 text-cream"
                : "border-line text-muted hover:border-line hover:bg-[var(--nav-hover-bg)] hover:text-cream",
            ].join(" ")}
          >
            {IP_SORT_FIELD_LABELS[field]}
            {sort.field === field ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
          </Link>
        ))}
      </div>
    </>
  );
}

export function IpDirectoryTableRow({
  row,
  onSelect,
}: {
  row: IpDirectoryRowData;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full flex-col gap-3 px-5 py-3 text-left transition-colors hover:bg-white/5 focus:outline-none focus-visible:bg-white/5 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/35 md:grid md:grid-cols-[3fr_2fr_3fr_3fr_1.75rem] md:items-center md:gap-3 md:gap-y-0"
    >
      <div className="min-w-0">
        <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wider text-muted md:hidden">
          IP Address
        </span>
        <div className="truncate font-mono text-[12px] text-cream">{row.ipAddress}</div>
      </div>

      <div className="min-w-0">
        <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wider text-muted md:hidden">
          Historical Hostname
        </span>
        <div className="text-[12px] text-muted">{formatHostnameCountLabel(row.hostnameCount)}</div>
      </div>

      <div className="min-w-0">
        <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wider text-muted md:hidden">
          Last Resolved
        </span>
        <div className="font-mono text-[11px] text-muted tabular-nums">
          {formatIpTableDateTime(row.lastResolvedAt)}
        </div>
      </div>

      <div className="min-w-0">
        <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wider text-muted md:hidden">
          Last Seen By
        </span>
        <div className="truncate font-mono text-[11px] text-cream" title={row.lastSeenBy}>
          {row.lastSeenBy || "—"}
        </div>
      </div>

      <div className="flex items-center justify-end text-muted md:justify-center">
        <IconChevronRight className="size-4 shrink-0 opacity-60" aria-hidden />
      </div>
    </button>
  );
}
