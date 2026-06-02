import type { PrismaClient } from "@prisma/client";
import { ScanJobStatus } from "@prisma/client";
import { getScanQueue } from "@/lib/queue";

export class ScanDeleteError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ScanDeleteError";
    this.status = status;
  }
}

async function cancelActiveScanJobs(
  prisma: PrismaClient,
  scans: Array<{ id: string; bullmqJobId: string | null }>,
) {
  if (scans.length === 0) return;

  await prisma.scanJob.updateMany({
    where: { id: { in: scans.map((scan) => scan.id) } },
    data: {
      status: ScanJobStatus.CANCELLED,
      completedAt: new Date(),
    },
  });

  const queue = getScanQueue();
  for (const scan of scans) {
    if (!scan.bullmqJobId) continue;
    try {
      const bullJob = await queue.getJob(scan.bullmqJobId);
      if (bullJob) await bullJob.remove().catch(() => {});
    } catch {
      // Already processed or removed — safe to ignore
    }
  }
}

async function refreshTargetCachedCounts(
  prisma: PrismaClient,
  targetDomainIds: string[],
) {
  for (const targetDomainId of targetDomainIds) {
    const [urlCount, findingCount, subCount] = await Promise.all([
      prisma.discoveredUrl.count({ where: { targetDomainId } }),
      prisma.analysisFinding.count({ where: { targetDomainId } }),
      prisma.subdomain.count({ where: { targetDomainId } }),
    ]);

    await prisma.targetDomain.update({
      where: { id: targetDomainId },
      data: {
        cachedUrlCount: urlCount,
        cachedFindingCount: findingCount,
        cachedSubdomainCount: subCount,
      },
    });
  }
}

/**
 * Permanently delete scan jobs and scan-scoped results:
 * - analysis findings tied to the scan
 * - observed subdomain/url snapshots (via ScanJob cascade)
 *
 * Does not delete target-level canonical subdomains or discovered URLs.
 */
export async function deleteScanJobs(prisma: PrismaClient, scanIds: string[]) {
  const uniqueIds = [...new Set(scanIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) {
    throw new ScanDeleteError("No scan ids provided");
  }

  const scans = await prisma.scanJob.findMany({
    where: { id: { in: uniqueIds } },
    select: {
      id: true,
      status: true,
      bullmqJobId: true,
      targetDomainId: true,
    },
  });

  if (scans.length === 0) {
    throw new ScanDeleteError("No scans found", 404);
  }

  const activeScans = scans.filter(
    (scan) =>
      scan.status === ScanJobStatus.QUEUED || scan.status === ScanJobStatus.RUNNING,
  );
  await cancelActiveScanJobs(prisma, activeScans);

  const deleteIds = scans.map((scan) => scan.id);
  const targetDomainIds = [...new Set(scans.map((scan) => scan.targetDomainId))];

  await prisma.$transaction(async (tx) => {
    await tx.analysisFinding.deleteMany({
      where: { scanJobId: { in: deleteIds } },
    });
    await tx.scanJob.deleteMany({
      where: { id: { in: deleteIds } },
    });
  });

  await refreshTargetCachedCounts(prisma, targetDomainIds);

  const missingIds = uniqueIds.filter(
    (id) => !deleteIds.includes(id),
  );

  return {
    deletedIds: deleteIds,
    missingIds,
  };
}
