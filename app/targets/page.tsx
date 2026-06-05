import Link from "next/link";
import { NewScanDialog } from "@/components/new-scan-dialog";
import { TargetsListHeader } from "@/components/targets/targets-list-header";
import { formatScanDateTime } from "@/lib/scan-format";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Domain column fixed — do not change. Other columns sized for headers + large counts. */
const TARGETS_TABLE_GRID_CLASS =
  "lg:grid-cols-[minmax(14rem,17rem)_minmax(9rem,10rem)_minmax(6.25rem,7.25rem)_minmax(6.25rem,7.25rem)_minmax(6.75rem,7.75rem)_minmax(6.25rem,7.25rem)_minmax(11.5rem,13.5rem)_minmax(12rem,1fr)]";

/** Extra space before Last updated (overrides subgrid row pr-4 on this cell). */
const TARGETS_FIRST_SCAN_CELL_CLASS = "!pr-8";

const TARGETS_DOMAIN_CELL_CLASS = "min-w-0";

/** Spacing between columns without grid gap (gap would show through header bg). */
const TARGETS_SUBGRID_ROW_CLASS = "grid grid-cols-subgrid [&>*]:pr-4 [&>*:last-child]:pr-0";

type TargetInventoryRow = {
  id: string;
  domainNormalized: string;
  cachedSubdomainCount: number;
  cachedUrlCount: number;
  cachedIpCount: number;
  cachedFindingCount: number;
  updatedAt: Date;
  firstScanAt: Date | null;
  _count: { scanJobs: number };
};

function formatTargetTableDateTime(value: Date | null) {
  if (!value) return "—";
  return formatScanDateTime(value);
}

function TargetsTableHeader() {
  return (
    <div
      className={[
        "col-span-full -mx-5 border-b border-line bg-[var(--table-header-bg)] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted",
        TARGETS_SUBGRID_ROW_CLASS,
      ].join(" ")}
    >
      <div className={[TARGETS_DOMAIN_CELL_CLASS, "truncate"].join(" ")}>Domain</div>
      <div className="tabular-nums">Subdomains</div>
      <div className="tabular-nums">URLs</div>
      <div className="tabular-nums">IPs</div>
      <div className="tabular-nums">Findings</div>
      <div className="tabular-nums">Scans</div>
      <div className={["tabular-nums", TARGETS_FIRST_SCAN_CELL_CLASS].join(" ")}>First scan</div>
      <div className="tabular-nums">Last updated</div>
    </div>
  );
}

function TargetsTableRow({ target }: { target: TargetInventoryRow }) {
  return (
    <Link
      href={`/targets/${target.id}`}
      className={[
        "group col-span-full items-center border-b border-line py-3 transition-colors last:border-b-0 hover:bg-white/[0.03]",
        TARGETS_SUBGRID_ROW_CLASS,
      ].join(" ")}
    >
      <div className={TARGETS_DOMAIN_CELL_CLASS}>
        <div className="truncate font-mono text-[12px] text-cream transition-colors group-hover:text-accent">
          {target.domainNormalized}
        </div>
      </div>
      <div className="font-mono text-[11px] tabular-nums text-muted">
        {target.cachedSubdomainCount.toLocaleString()}
      </div>
      <div className="font-mono text-[11px] tabular-nums text-muted">
        {target.cachedUrlCount.toLocaleString()}
      </div>
      <div className="font-mono text-[11px] tabular-nums text-muted">
        {target.cachedIpCount.toLocaleString()}
      </div>
      <div className="font-mono text-[11px] tabular-nums text-muted">
        {target.cachedFindingCount.toLocaleString()}
      </div>
      <div className="font-mono text-[11px] tabular-nums text-muted">
        {target._count.scanJobs.toLocaleString()}
      </div>
      <div
        className={[
          "font-mono text-[11px] tabular-nums text-muted",
          TARGETS_FIRST_SCAN_CELL_CLASS,
        ].join(" ")}
      >
        {formatTargetTableDateTime(target.firstScanAt)}
      </div>
      <div className="font-mono text-[11px] tabular-nums text-muted">
        {formatTargetTableDateTime(target.updatedAt)}
      </div>
    </Link>
  );
}

function TargetsTableRowMobile({ target }: { target: TargetInventoryRow }) {
  const metrics: Array<{ label: string; value: string }> = [
    { label: "Subdomains", value: target.cachedSubdomainCount.toLocaleString() },
    { label: "URLs", value: target.cachedUrlCount.toLocaleString() },
    { label: "IPs", value: target.cachedIpCount.toLocaleString() },
    { label: "Findings", value: target.cachedFindingCount.toLocaleString() },
    { label: "Scans", value: target._count.scanJobs.toLocaleString() },
    { label: "First scan", value: formatTargetTableDateTime(target.firstScanAt) },
    { label: "Last updated", value: formatTargetTableDateTime(target.updatedAt) },
  ];

  return (
    <Link
      href={`/targets/${target.id}`}
      className="group flex flex-col gap-2.5 px-5 py-3 transition-colors hover:bg-white/[0.03]"
    >
      <div className="truncate font-mono text-[12px] text-cream transition-colors group-hover:text-accent">
        {target.domainNormalized}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {metrics.map((m) => (
          <div key={m.label}>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">{m.label}</div>
            <div className="mt-0.5 font-mono text-[11px] tabular-nums text-muted">{m.value}</div>
          </div>
        ))}
      </div>
    </Link>
  );
}

export default async function TargetsPage() {
  const targetsRaw = await prisma.targetDomain.findMany({
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: { _count: { select: { scanJobs: true } } },
  });

  const targetIds = targetsRaw.map((t) => t.id);
  const firstScanGroups =
    targetIds.length > 0
      ? await prisma.scanJob.groupBy({
          by: ["targetDomainId"],
          where: { targetDomainId: { in: targetIds } },
          _min: { createdAt: true },
        })
      : [];

  const firstScanAtByTargetId = new Map(
    firstScanGroups.map((row) => [row.targetDomainId, row._min.createdAt]),
  );

  const targets: TargetInventoryRow[] = targetsRaw.map((t) => ({
    ...t,
    firstScanAt: firstScanAtByTargetId.get(t.id) ?? null,
  }));

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <TargetsListHeader targetCount={targets.length} />

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div>
          <div className="glass-panel overflow-hidden rounded-2xl">
            <div className="border-b border-line bg-[var(--table-header-bg)] px-5 py-4">
              <div className="text-[13px] font-semibold text-cream">Target inventory</div>
              <div className="mt-1 text-[12px] text-muted">
                Review domains with subdomains, URLs, findings, and IPs aggregated across all scans.
              </div>
            </div>

            {targets.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <div className="text-[13px] text-muted">No targets yet.</div>
                <div className="mt-2 text-[12px] text-muted">
                  Start a new scan to add a target and begin collecting data.
                </div>
                <div className="mt-5 flex justify-center">
                  <NewScanDialog
                    buttonClassName="shadow-clay inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-accent to-accent-dim px-4 py-3 text-[13px] font-semibold text-void transition-transform hover:scale-[1.02]"
                  />
                </div>
              </div>
            ) : (
              <>
                <div className={`hidden lg:grid ${TARGETS_TABLE_GRID_CLASS} lg:px-5`}>
                  <TargetsTableHeader />
                  {targets.map((t) => (
                    <TargetsTableRow key={t.id} target={t} />
                  ))}
                </div>
                <div className="divide-y divide-line lg:hidden">
                  {targets.map((t) => (
                    <TargetsTableRowMobile key={t.id} target={t} />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
