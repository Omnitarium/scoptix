"use client";

import { useState } from "react";
import { IpSightingPanel } from "@/components/ip-sighting-panel";
import {
  IpDirectoryTableHeader,
  IpDirectoryTableRow,
  type IpDirectoryRowData,
} from "@/components/ips/ip-directory-row";
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
  const [selectedIpId, setSelectedIpId] = useState<string | null>(null);
  const tableFixedParams = { tab: "ips", ...ipSortSearchParams(sort) };

  return (
    <div className="space-y-4">
      <div className="glass-panel overflow-hidden rounded-2xl">
        <div className="border-b border-line bg-[var(--table-header-bg)] px-5 py-4">
          <div className="text-[13px] font-semibold text-cream">
            Global IP Directory
          </div>
          <div className="mt-1 text-[12px] text-muted">
            All IP addresses ever resolved for this target across all scans.
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
                onSelect={() => setSelectedIpId(ip.id)}
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

      <IpSightingPanel
        ipResolutionId={selectedIpId}
        onClose={() => setSelectedIpId(null)}
      />
    </div>
  );
}
