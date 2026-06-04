import type { Prisma } from "@prisma/client";

export type IpSortField = "ip" | "hostnames" | "lastResolved" | "lastSeen";
export type IpSortDir = "asc" | "desc";
export type IpTableSort = { field: IpSortField; dir: IpSortDir };
export type IpTableSortContext = "scan" | "target";

export const IP_SORTABLE_FIELDS: readonly IpSortField[] = [
  "ip",
  "hostnames",
  "lastResolved",
  "lastSeen",
];

const DEFAULT_SORT: Record<IpTableSortContext, IpTableSort> = {
  scan: { field: "ip", dir: "asc" },
  target: { field: "lastResolved", dir: "desc" },
};

const FIRST_CLICK_DIR: Record<IpSortField, IpSortDir> = {
  ip: "asc",
  hostnames: "desc",
  lastResolved: "desc",
  lastSeen: "asc",
};

function isIpSortField(value: string | undefined): value is IpSortField {
  return IP_SORTABLE_FIELDS.includes(value as IpSortField);
}

export function parseIpTableSort(
  sortRaw: string | undefined,
  dirRaw: string | undefined,
  context: IpTableSortContext,
): IpTableSort {
  const fallback = DEFAULT_SORT[context];
  const field: IpSortField = isIpSortField(sortRaw) ? sortRaw : fallback.field;
  if (dirRaw === "asc" || dirRaw === "desc") {
    return { field, dir: dirRaw };
  }
  if (isIpSortField(sortRaw)) {
    return { field: sortRaw, dir: FIRST_CLICK_DIR[sortRaw] };
  }
  return fallback;
}

export function nextIpSort(clicked: IpSortField, current: IpTableSort): IpTableSort {
  if (current.field === clicked) {
    return { field: clicked, dir: current.dir === "asc" ? "desc" : "asc" };
  }
  return { field: clicked, dir: FIRST_CLICK_DIR[clicked] };
}

export function ipSortSearchParams(sort: IpTableSort): Record<string, string> {
  return { ipSort: sort.field, ipDir: sort.dir };
}

export function buildIpSortHref(
  basePath: string,
  fixedParams: Record<string, string>,
  next: IpTableSort,
): string {
  const p = new URLSearchParams({ ...fixedParams, ...ipSortSearchParams(next) });
  return `${basePath}?${p.toString()}`;
}

export function scanObservedIpOrderBy(
  sort: IpTableSort,
): Prisma.ScanObservedIpResolutionOrderByWithRelationInput[] {
  switch (sort.field) {
    case "lastResolved":
      return [{ lastResolvedAt: sort.dir }];
    case "hostnames":
      return [{ ipResolution: { hostnameCount: sort.dir } }];
    case "lastSeen":
      return [{ reportedByHostname: sort.dir }];
    default:
      return [{ ipAddress: sort.dir }];
  }
}

export function targetIpOrderBy(sort: IpTableSort): Prisma.IpResolutionOrderByWithRelationInput[] {
  switch (sort.field) {
    case "lastResolved":
      return [{ latestResolvedAt: sort.dir }];
    case "hostnames":
      return [{ hostnameCount: sort.dir }];
    case "lastSeen":
      return [{ latestSeenBy: sort.dir }];
    default:
      return [{ ipAddress: sort.dir }];
  }
}

export const IP_SORT_FIELD_LABELS: Record<IpSortField, string> = {
  ip: "IP Address",
  hostnames: "Historical Hostname",
  lastResolved: "Last Resolved",
  lastSeen: "Last Seen By",
};
