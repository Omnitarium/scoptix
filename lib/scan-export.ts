import { formatEngineLabel, parseScanEnginesEnabled, enginesObservedInScan } from "@/lib/scan-engines";
import { prisma } from "@/lib/prisma";
import {
  categorySlugForPathnameExtension,
  loadExtensionSuffixRules,
} from "@/lib/extension-category";
import { rowsToCsv } from "@/lib/csv";
import {
  getObservedAvailability,
  getObservedScanSummary,
  type ObservedAvailability,
} from "@/lib/scan-observed";

const BATCH_SIZE = 2000;

export type ScanExportType = "findings" | "subdomains" | "urls" | "ips" | "all";

function formatIso(value: Date | null | undefined) {
  return value ? value.toISOString() : "";
}

function sanitizeFilenamePart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "scan";
}

export function buildScanExportFilename(
  domain: string,
  scanId: string,
  type: ScanExportType,
) {
  const domainPart = sanitizeFilenamePart(domain);
  const scanPart = scanId.slice(0, 8);
  if (type === "all") return `${domainPart}-${scanPart}-export.zip`;
  return `${domainPart}-${scanPart}-${type}.csv`;
}

async function fetchAllFindings(scanId: string, enabledEngines: ReturnType<typeof parseScanEnginesEnabled>) {
  const rows: string[][] = [];
  let skip = 0;

  while (true) {
    const batch = await prisma.analysisFinding.findMany({
      where: { scanJobId: scanId },
      take: BATCH_SIZE,
      skip,
      orderBy: { createdAt: "desc" },
      include: {
        discoveredUrl: {
          select: {
            urlText: true,
            externalSeenAt: true,
            engines: true,
          },
        },
      },
    });
    if (batch.length === 0) break;

    for (const finding of batch) {
      rows.push([
        finding.findingType,
        finding.source,
        enginesObservedInScan(undefined, finding.discoveredUrl.engines, enabledEngines)
          .map((e) => formatEngineLabel(e))
          .join("; "),
        finding.discoveredUrl.urlText,
        finding.snippet ?? "",
        formatIso(finding.createdAt),
        formatIso(finding.discoveredUrl.externalSeenAt),
      ]);
    }

    if (batch.length < BATCH_SIZE) break;
    skip += BATCH_SIZE;
  }

  return rowsToCsv(
    [
      "finding_type",
      "source",
      "engines",
      "url",
      "snippet",
      "found_at",
      "intel_seen_at",
    ],
    rows,
  );
}

async function fetchAllSubdomains(scanId: string) {
  const rows: string[][] = [];
  let skip = 0;

  while (true) {
    const batch = await prisma.scanObservedSubdomain.findMany({
      where: { scanJobId: scanId },
      take: BATCH_SIZE,
      skip,
      orderBy: { hostnameNormalized: "asc" },
      include: {
        subdomain: {
          select: {
            firstSeenAt: true,
            lastSeenAt: true,
          },
        },
      },
    });
    if (batch.length === 0) break;

    for (const subdomain of batch) {
      rows.push([
        subdomain.hostnameNormalized,
        formatIso(subdomain.subdomain?.firstSeenAt),
        formatIso(subdomain.subdomain?.lastSeenAt),
      ]);
    }

    if (batch.length < BATCH_SIZE) break;
    skip += BATCH_SIZE;
  }

  return rowsToCsv(
    ["hostname", "first_seen_at", "last_seen_at"],
    rows,
  );
}

async function fetchAllUrls(scanId: string) {
  const rows: string[][] = [];
  let skip = 0;
  const [suffixRules, categories] = await Promise.all([
    loadExtensionSuffixRules(prisma),
    prisma.extensionCategory.findMany({ select: { id: true, slug: true } }),
  ]);
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  while (true) {
    const batch = await prisma.scanObservedUrl.findMany({
      where: { scanJobId: scanId },
      take: BATCH_SIZE,
      skip,
      orderBy: { createdAt: "desc" },
      select: {
        urlText: true,
        hostnameNormalized: true,
        pathnameExtension: true,
        createdAt: true,
      },
    });
    if (batch.length === 0) break;

    for (const url of batch) {
      rows.push([
        url.urlText,
        url.hostnameNormalized,
        categorySlugForPathnameExtension(
          suffixRules,
          url.pathnameExtension,
          categoryById,
        ),
        url.pathnameExtension ?? "",
        formatIso(url.createdAt),
      ]);
    }

    if (batch.length < BATCH_SIZE) break;
    skip += BATCH_SIZE;
  }

  return rowsToCsv(
    ["url", "hostname", "category", "extension", "observed_at"],
    rows,
  );
}

async function fetchAllIps(scanId: string) {
  const rows: string[][] = [];
  let skip = 0;

  while (true) {
    const batch = await prisma.scanObservedIpResolution.findMany({
      where: { scanJobId: scanId },
      take: BATCH_SIZE,
      skip,
      orderBy: { ipAddress: "asc" },
      select: {
        ipAddress: true,
        lastResolvedAt: true,
        reportedByHostname: true,
      },
    });
    if (batch.length === 0) break;

    for (const ip of batch) {
      rows.push([
        ip.ipAddress,
        ip.reportedByHostname,
        formatIso(ip.lastResolvedAt),
      ]);
    }

    if (batch.length < BATCH_SIZE) break;
    skip += BATCH_SIZE;
  }

  return rowsToCsv(
    ["ip_address", "reported_by_hostname", "last_resolved_at"],
    rows,
  );
}

export async function loadScanExportContext(scanId: string) {
  const scan = await getObservedScanSummary(scanId);
  if (!scan) return null;

  const availability = getObservedAvailability(scan);
  return { scan, availability };
}

export async function buildScanExportPayload(
  scanId: string,
  type: ScanExportType,
  availability: ObservedAvailability,
) {
  const scanJob = await prisma.scanJob.findUnique({
    where: { id: scanId },
    select: { config: true },
  });
  const enabledEngines = parseScanEnginesEnabled(scanJob?.config);

  if (type === "findings") {
    return {
      contentType: "text/csv; charset=utf-8",
      body: await fetchAllFindings(scanId, enabledEngines),
    };
  }

  if (type === "subdomains") {
    if (availability.subdomains !== "ready") {
      throw new ExportUnavailableError("subdomains");
    }
    return {
      contentType: "text/csv; charset=utf-8",
      body: await fetchAllSubdomains(scanId),
    };
  }

  if (type === "urls") {
    if (availability.urls !== "ready") {
      throw new ExportUnavailableError("urls");
    }
    return {
      contentType: "text/csv; charset=utf-8",
      body: await fetchAllUrls(scanId),
    };
  }

  if (type === "ips") {
    if (availability.ips !== "ready") {
      throw new ExportUnavailableError("ips");
    }
    return {
      contentType: "text/csv; charset=utf-8",
      body: await fetchAllIps(scanId),
    };
  }

  const { buildStoreZip } = await import("@/lib/zip-store");
  const entries: { name: string; content: string }[] = [
    { name: "findings.csv", content: await fetchAllFindings(scanId, enabledEngines) },
  ];

  if (availability.subdomains === "ready") {
    entries.push({
      name: "subdomains.csv",
      content: await fetchAllSubdomains(scanId),
    });
  }

  if (availability.urls === "ready") {
    entries.push({
      name: "urls.csv",
      content: await fetchAllUrls(scanId),
    });
  }

  if (availability.ips === "ready") {
    entries.push({
      name: "ips.csv",
      content: await fetchAllIps(scanId),
    });
  }

  return {
    contentType: "application/zip",
    body: buildStoreZip(entries),
  };
}

export class ExportUnavailableError extends Error {
  readonly kind: "subdomains" | "urls" | "ips";

  constructor(kind: "subdomains" | "urls" | "ips") {
    super(`Export for ${kind} is unavailable for this scan`);
    this.name = "ExportUnavailableError";
    this.kind = kind;
  }
}

export function parseScanExportType(raw: string | null): ScanExportType | null {
  const value = raw?.trim().toLowerCase();
  if (value === "findings" || value === "subdomains" || value === "urls" || value === "ips" || value === "all") {
    return value as ScanExportType;
  }
  return null;
}
