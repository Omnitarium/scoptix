"use client";

import { useIpSightingPanel } from "@/components/ip-sighting-panel-provider";
import {
  IpDirectoryTableHeader,
  IpDirectoryTableRow,
  type IpDirectoryRowData,
} from "@/components/ips/ip-directory-row";
import { TablePagination } from "@/components/table-pagination";
import { ipSortSearchParams, type IpTableSort } from "@/lib/ip-table-sort";

export type ScanIpRow = IpDirectoryRowData & {
  ipResolutionId: string | null;
};

export function ScanIpsTab({
  ips,
  scanJobId,
  totalItems,
  currentPage,
  totalPages,
  perPage,
  basePath,
  isCompleted,
  sort,
}: {
  ips: ScanIpRow[];
  scanJobId: string;
  totalItems: number;
  currentPage: number;
  totalPages: number;
  perPage: number;
  basePath: string;
  isCompleted: boolean;
  sort: IpTableSort;
}) {
  const { openIpPanel } = useIpSightingPanel();
  const tableFixedParams = { tab: "ips", ...ipSortSearchParams(sort) };

  return (
    <div className="space-y-4">
      <div className="glass-panel overflow-hidden rounded-2xl">
        <div className="border-b border-line bg-[var(--table-header-bg)] px-5 py-4">
          <div className="text-[13px] font-semibold text-cream">
            IP Resolutions observed in this scan
          </div>
          <div className="mt-1 text-[12px] text-muted">
            {isCompleted
              ? "Historical IPs scoped to this scan only."
              : "Current observed IPs for this in-progress or partial scan."}
          </div>
        </div>

        <IpDirectoryTableHeader sort={sort} basePath={basePath} fixedParams={tableFixedParams} />

        <div className="divide-y divide-line">
          {ips.length === 0 ? (
            <div className="px-5 py-8 text-center text-[13px] text-muted">
              No IPs match this filter.
            </div>
          ) : (
            ips.map((ip) => (
              <IpDirectoryTableRow
                key={ip.id}
                row={ip}
                onSelect={() =>
                  ip.ipResolutionId && openIpPanel(ip.ipResolutionId, { scanJobId })
                }
              />
            ))
          )}
        </div>

        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          perPage={perPage}
          basePath={basePath}
          fixedParams={tableFixedParams}
        />
      </div>
    </div>
  );
}
