import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ObservedAvailabilityState = "ready" | "legacy_unavailable";

export type ObservedAvailability = {
  findings: ObservedAvailabilityState;
  subdomains: ObservedAvailabilityState;
  urls: ObservedAvailabilityState;
  ips: ObservedAvailabilityState;
};

export type ObservedScanSummary = Prisma.ScanJobGetPayload<{
  include: {
    targetDomain: {
      select: {
        id: true;
        domainNormalized: true;
        cachedSubdomainCount: true;
      };
    };
  };
}>;

export type ScanSummaryContext = Pick<ObservedScanSummary, "observedVersion">;

export function normalizeTake(raw: string | null, fallback = 50, max = 200) {
  const n = Number(raw ?? "");
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(n)));
}

export function normalizeSkip(raw: string | null, fallback = 0) {
  const n = Number(raw ?? "");
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

export async function getObservedScanSummary(scanId: string) {
  return prisma.scanJob.findUnique({
    where: { id: scanId },
    include: {
      targetDomain: {
        select: {
          id: true,
          domainNormalized: true,
          cachedSubdomainCount: true,
        },
      },
    },
  });
}

export function getObservedAvailability(
  scan: Pick<ObservedScanSummary, "observedVersion">,
): ObservedAvailability {
  const hasSnapshot = (scan.observedVersion ?? 0) >= 1;

  return {
    findings: "ready",
    subdomains: hasSnapshot ? "ready" : "legacy_unavailable",
    urls: hasSnapshot ? "ready" : "legacy_unavailable",
    ips: hasSnapshot ? "ready" : "legacy_unavailable",
  };
}
