import { ScanJobStatus } from "@prisma/client";
import { ActiveScansPanel } from "@/components/active-scans-panel";
import { NewScanDialog } from "@/components/new-scan-dialog";
import { PageHeader } from "@/components/page-header";
import { ScanHistoryPanel } from "@/components/scans/scan-history-panel";
import { prisma } from "@/lib/prisma";
import { TopBar } from "@/components/top-bar";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  COMPLETED: "bg-accent/15 text-accent",
  RUNNING: "bg-accent/25 text-cream",
  QUEUED: "bg-muted/15 text-muted",
  FAILED: "bg-warn/15 text-warn",
  CANCELLED: "bg-muted/10 text-muted",
  PAUSED: "bg-warn/10 text-warn",
};

function formatDateTime(value: Date | null) {
  if (!value) return "—";
  return value.toISOString().slice(0, 16).replace("T", " ");
}

export default async function ScansPage() {
  const scans = await prisma.scanJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      targetDomain: true,
      _count: {
        select: {
          analysisFindings: true,
        },
      },
    },
  });
  const activeScans = scans.filter(
    (scan) =>
      scan.status === ScanJobStatus.RUNNING ||
      scan.status === ScanJobStatus.QUEUED,
  );
  const historyScans = scans.filter(
    (scan) =>
      scan.status !== ScanJobStatus.RUNNING &&
      scan.status !== ScanJobStatus.QUEUED,
  );

  const historyRows = historyScans.map((scan) => {
    const isCompleted = scan.status === ScanJobStatus.COMPLETED;
    const findingsCount = scan.observedFindingCount ?? scan._count.analysisFindings;

    return {
      id: scan.id,
      targetDomain: scan.targetDomain.domainNormalized,
      status: scan.status,
      statusClassName: STATUS_STYLE[scan.status] ?? "bg-muted/10 text-muted",
      phase: scan.phase ?? "—",
      progressLabel: `${(scan.progressCurrent ?? 0).toLocaleString()}/${(scan.progressTotal ?? 0).toLocaleString()}`,
      findingsCount: findingsCount.toLocaleString(),
      finishedLabel: formatDateTime(scan.completedAt),
      createdLabel: formatDateTime(scan.createdAt),
      href: isCompleted ? `/scans/${scan.id}/observed` : `/scans/${scan.id}`,
    };
  });

  return (
    <>
      <TopBar breadcrumb="/ scans" />
      <main className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <PageHeader
            eyebrow="Reconnaissance"
            title="Scans"
            description="Track running scans and review previous results."
          />
          <div className="shrink-0">
            <NewScanDialog />
          </div>
        </div>

        <div className="mt-8 space-y-6">
          {activeScans.length > 0 && (
            <ActiveScansPanel
              scans={activeScans.map((scan) => ({
                id: scan.id,
                status: scan.status,
                phase: scan.phase,
                progressCurrent: scan.progressCurrent,
                progressTotal: scan.progressTotal,
                createdAt: scan.createdAt.toISOString(),
                targetDomain: {
                  domainNormalized: scan.targetDomain.domainNormalized,
                },
              }))}
            />
          )}

          <div className="glass-panel overflow-hidden rounded-2xl">
            <div className="border-b border-line bg-[var(--table-header-bg)] px-5 py-4">
              <div className="text-[13px] font-semibold text-cream">Scan history</div>
              <div className="mt-1 text-[12px] text-muted">
                Review completed, failed, cancelled, and paused scans.
              </div>
            </div>

            {historyRows.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <div className="text-[13px] text-muted">
                  {activeScans.length > 0 ? "No previous scans yet." : "No scans yet."}
                </div>
                <div className="mt-2 text-[12px] text-muted">
                  Start a new scan to begin collecting URLs and findings.
                </div>
                <div className="mt-5 flex justify-center">
                  <NewScanDialog
                    buttonClassName="shadow-clay inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-accent to-accent-dim px-4 py-3 text-[13px] font-semibold text-void transition-transform hover:scale-[1.02]"
                  />
                </div>
              </div>
            ) : (
              <ScanHistoryPanel scans={historyRows} />
            )}
          </div>
        </div>
      </main>
    </>
  );
}
