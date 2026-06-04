"use client";

import { useIpSightingPanel } from "@/components/ip-sighting-panel-provider";
import {
  IpDirectoryTableHeader,
  IpDirectoryTableRow,
  type IpDirectoryRowData,
} from "@/components/ips/ip-directory-row";
import { ScanPanelHeading } from "@/components/scans/scan-panel-heading";
import { TablePagination } from "@/components/table-pagination";
import { ipSortSearchParams, type IpTableSort } from "@/lib/ip-table-sort";

export type TargetIpRow = IpDirectoryRowData;

export function TargetIpsTab({
  ips,
  totalItems,
  currentPage,
  totalPages,
  perPage,
  basePath,
  sort,
}: {
  ips: TargetIpRow[];
  totalItems: number;
  currentPage: number;
  totalPages: number;
  perPage: number;
  basePath: string;
  sort: IpTableSort;
}) {
  const { openIpPanel } = useIpSightingPanel();
  const tableFixedParams = { tab: "ips", ...ipSortSearchParams(sort) };

  return (
    <div className="space-y-4">
      <div className="glass-panel overflow-hidden rounded-2xl">
        <div className="border-b border-line bg-[var(--table-header-bg)] px-5 py-4">
          <ScanPanelHeading
            title="Global IP directory"
            description="All IP addresses ever resolved for this target across all scans."
          />
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
                onSelect={() => openIpPanel(ip.id)}
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
