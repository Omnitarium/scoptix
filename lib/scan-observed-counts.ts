import type { PrismaClient } from "@prisma/client";

export type ScanObservedCountSource = {
  id: string;
  observedFindingCount?: number | null;
  observedSubdomainCount?: number | null;
  observedUrlCount?: number | null;
  observedIpCount?: number | null;
};

export type ScanObservedCounts = {
  findings: number;
  subdomains: number;
  urls: number;
  ips: number;
};

function observedModels(prisma: PrismaClient) {
  return prisma as PrismaClient & {
    scanObservedSubdomain: { count: (args: { where: { scanJobId: string } }) => Promise<number> };
    scanObservedUrl: { count: (args: { where: { scanJobId: string } }) => Promise<number> };
    scanObservedIpResolution: { count: (args: { where: { scanJobId: string } }) => Promise<number> };
  };
}

/** Live counts from snapshot tables (source of truth for observed UI). */
export async function countScanObservedFromDb(
  prisma: PrismaClient,
  scanJobId: string,
): Promise<ScanObservedCounts> {
  const models = observedModels(prisma);
  const [findings, subdomains, urls, ips] = await Promise.all([
    prisma.analysisFinding.count({ where: { scanJobId } }),
    models.scanObservedSubdomain.count({ where: { scanJobId } }),
    models.scanObservedUrl.count({ where: { scanJobId } }),
    models.scanObservedIpResolution.count({ where: { scanJobId } }),
  ]);
  return { findings, subdomains, urls, ips };
}

/** Refresh cached counters on scan_job from snapshot tables. */
export async function syncScanObservedCounts(
  prisma: PrismaClient,
  scanJobId: string,
  options?: { fixProgress?: boolean },
): Promise<ScanObservedCounts> {
  const counts = await countScanObservedFromDb(prisma, scanJobId);
  const progressTotal = Math.max(1, counts.urls);
  await prisma.scanJob.update({
    where: { id: scanJobId },
    data: {
      observedFindingCount: counts.findings,
      observedSubdomainCount: counts.subdomains,
      observedUrlCount: counts.urls,
      observedIpCount: counts.ips,
      ...(options?.fixProgress
        ? { progressCurrent: counts.urls, progressTotal }
        : {}),
    },
  });
  return counts;
}

export async function resolveScanObservedCounts(
  prisma: PrismaClient,
  scan: ScanObservedCountSource,
): Promise<ScanObservedCounts> {
  return countScanObservedFromDb(prisma, scan.id);
}
