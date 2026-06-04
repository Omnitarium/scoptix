import { createHash } from "node:crypto";
import {
  DeepScanState,
  EngineProvider,
  FindingSource,
  ScanJobStatus,
  ScanPhase,
  type PrismaClient,
} from "@prisma/client";
import { Prisma } from "@prisma/client";
import type Redis from "ioredis";
import {
  discoverSubdomainsFromReport,
  domainSiblingsFromReport,
  fetchVtDomainReportV2,
  harvestUndetectedUrlsWithDate,
  harvestResolutions,
  subdomainsFromReport,
  subdomainsFromUndetectedUrls,
  type VtDomainReportV2,
} from "@/engines/virustotal";
import { pathnameExtensionFromUrl } from "@/lib/categorization";
import {
  categoryIdForPathnameExtension,
  loadExtensionSuffixRules,
  type SuffixRule,
} from "@/lib/extension-category";
import { deepFetchText } from "@/lib/deep-fetch";
import { extractHostIfUnderTarget } from "@/lib/extract-hosts";
import { acquireVtKey, recordBackoff } from "@/lib/rotator";
import { runSensitiveRegexScan } from "@/lib/regex-analysis";

type ScanConfig = {
  deepScan?: boolean;
  deepScanCategorySlugs?: string[];
  expandSubdomains?: boolean;
  maxSubdomains?: number;
  enginesEnabled?: EngineProvider[];
  inputType?: string;
  inputHostname?: string;
};

type UrlInput = { url: string; date: Date | null };

/* ── Helpers (unchanged business logic) ── */

async function getGlobalProxy(prisma: PrismaClient): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: "global_proxy_url" } });
  if (!row?.value) return null;
  const v = row.value as { url?: string | null };
  return v.url ?? null;
}

function sha256Hex(s: string) {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Throttle progress updates to reduce DB writes. */
function shouldUpdateProgress(current: number, total: number, interval = 50): boolean {
  return current === 1 || current % interval === 0 || current === total;
}

/**
 * Dedup URLs within one engine batch using the same date merge rules as legacy `addUrl`
 * (prefer keeping an existing date; upgrade null → non-null when a duplicate provides a date).
 */
function mergeUrlInputsForBatch(entries: UrlInput[], targetNorm: string): UrlInput[] {
  const m = new Map<string, Date | null>();
  for (const { url, date } of entries) {
    if (!extractHostIfUnderTarget(url, targetNorm)) continue;
    const ex = m.get(url);
    if (ex === undefined) {
      m.set(url, date);
    } else if (!ex && date) {
      m.set(url, date);
    }
  }
  return Array.from(m.entries()).map(([url, d]) => ({ url, date: d }));
}

async function fetchReportWithRotator(
  prisma: PrismaClient,
  redis: Redis,
  domain: string,
  globalProxy: string | null,
  scanJobId?: string,
): Promise<VtDomainReportV2> {
  for (;;) {
    const k = await acquireVtKey(prisma, redis);
    const proxy = k.proxyUrl || globalProxy;

    // Max 5 retries per key acquisition — prevents locking for 12+ minutes on one subdomain.
    // After 5 failures the outer loop re-acquires (possibly a different key).
    for (let a = 1; a <= 5; a++) {
      // Allow Stop Scan to interrupt even during retry waits
      if (scanJobId) await checkCancelled(prisma, scanJobId);

      const res = await fetchVtDomainReportV2({ apiKey: k.plainSecret, domain, proxyUrl: proxy });

      if (res.status === 200 || res.status === 204) return res.data;

      if (res.status === 403 || res.status === 429) {
        await recordBackoff(redis, k.id, 15_000);
        await sleep(15_000);
        continue;
      }

      if (res.status === 598 || res.status === 599) {
        await recordBackoff(redis, k.id, 15_000);
        await sleep(15_000);
        continue;
      }

      if (res.status >= 500) {
        await recordBackoff(redis, k.id, 15_000);
        await sleep(15_000);
        continue;
      }

      return res.data;
    }
    // 5 retries exhausted — re-acquire key (round-robin to next available)
  }
}

async function ensureSubdomain(
  prisma: PrismaClient,
  targetDomainId: string,
  hostname: string,
  flags: Record<string, boolean>,
) {
  const hn = hostname.toLowerCase();
  const existing = await prisma.subdomain.findUnique({
    where: {
      targetDomainId_hostnameNormalized: { targetDomainId, hostnameNormalized: hn },
    },
  });
  if (!existing) {
    await prisma.subdomain.create({
      data: {
        targetDomainId,
        hostname: hn,
        hostnameNormalized: hn,
        sourceFlags: flags,
      },
    });
    return;
  }
  const prev = (existing.sourceFlags as Record<string, boolean>) ?? {};
  await prisma.subdomain.update({
    where: { id: existing.id },
    data: {
      lastSeenAt: new Date(),
      sourceFlags: { ...prev, ...flags },
    },
  });
}

/* ── Batch URL upsert via raw SQL (B2) ── */

type PreparedUrlRow = {
  hostnameNormalized: string;
  urlText: string;
  urlSha256: string;
  subdomainId: string | null;
  extensionCategoryId: number | null;
  pathnameExtension: string | null;
  deepScanState: string;
  externalSeenAt: Date | null;
  engines: EngineProvider[];
};

async function persistObservedSubdomains(
  prisma: PrismaClient,
  scanJobId: string,
  targetDomainId: string,
  targetNorm: string,
  preparedRows: PreparedUrlRow[],
): Promise<void> {
  const uniqueHosts = new Map<
    string,
    { subdomainId: string | null; hostnameNormalized: string }
  >();

  for (const row of preparedRows) {
    if (row.hostnameNormalized === targetNorm && !row.subdomainId) continue;
    if (uniqueHosts.has(row.hostnameNormalized)) continue;

    uniqueHosts.set(row.hostnameNormalized, {
      subdomainId: row.subdomainId,
      hostnameNormalized: row.hostnameNormalized,
    });
  }

  const records = Array.from(uniqueHosts.values()).map((row) => ({
    scanJobId,
    targetDomainId,
    subdomainId: row.subdomainId,
    hostnameNormalized: row.hostnameNormalized,
  }));

  if (records.length === 0) return;

  const BATCH_SIZE = 1000;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    await prisma.$transaction(async (tx) => {
      const result = await tx.scanObservedSubdomain.createMany({
        data: batch,
        skipDuplicates: true,
      });
      if (result.count > 0) {
        await tx.scanJob.update({
          where: { id: scanJobId },
          data: { observedSubdomainCount: { increment: result.count } },
        });
      }
    });
  }
}

async function persistObservedUrls(
  prisma: PrismaClient,
  scanJobId: string,
  targetDomainId: string,
  preparedRows: PreparedUrlRow[],
  urlIdMap: Map<string, { id: string; urlSha256: string; extensionCategoryId: number | null }>,
): Promise<void> {
  const records = preparedRows.map((row) => {
    const discovered = urlIdMap.get(row.urlSha256);
    return {
      scanJobId,
      targetDomainId,
      discoveredUrlId: discovered?.id ?? null,
      subdomainId: row.subdomainId,
      hostnameNormalized: row.hostnameNormalized,
      urlText: row.urlText,
      urlSha256: row.urlSha256,
      pathnameExtension: row.pathnameExtension,
      extensionCategoryId: discovered?.extensionCategoryId ?? row.extensionCategoryId,
    };
  });

  if (records.length === 0) return;

  const BATCH_SIZE = 1000;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    await prisma.$transaction(async (tx) => {
      const result = await tx.scanObservedUrl.createMany({
        data: batch,
        skipDuplicates: true,
      });
      if (result.count > 0) {
        await tx.scanJob.update({
          where: { id: scanJobId },
          data: { observedUrlCount: { increment: result.count } },
        });
      }
    });
  }
}

/**
 * Batch insert/upsert URLs using raw SQL INSERT ... ON CONFLICT DO UPDATE.
 * This replaces the per-URL Prisma upsert loop, reducing round-trips from N to ceil(N/BATCH_SIZE).
 */
async function batchUpsertUrls(
  prisma: PrismaClient,
  targetDomainId: string,
  scanJobId: string,
  preparedRows: PreparedUrlRow[],
  batchSize = 500,
): Promise<void> {
  for (let i = 0; i < preparedRows.length; i += batchSize) {
    const batch = preparedRows.slice(i, i + batchSize);

    // Build parameterized VALUES list
    const valueFragments: Prisma.Sql[] = [];
    for (const row of batch) {
      const engineSqls = row.engines.map((e) => Prisma.sql`${e}::"EngineProvider"`);
      const enginesArray = Prisma.sql`ARRAY[${Prisma.join(engineSqls, ", ")}]::"EngineProvider"[]`;

      valueFragments.push(
        Prisma.sql`(gen_random_uuid(), ${targetDomainId}, ${row.subdomainId}, ${scanJobId}, ${row.urlText}, ${row.urlSha256}, ${enginesArray}, ${row.extensionCategoryId}::int, ${row.pathnameExtension}, ${row.deepScanState}::"DeepScanState", ${row.externalSeenAt}, now())`,
      );
    }

    await prisma.$executeRaw`
      INSERT INTO discovered_url (id, target_domain_id, subdomain_id, scan_job_id, url_text, url_sha256, engines, extension_category_id, pathname_extension, deep_scan_state, external_seen_at, created_at)
      VALUES ${Prisma.join(valueFragments)}
      ON CONFLICT (target_domain_id, url_sha256)
      DO UPDATE SET
        scan_job_id = EXCLUDED.scan_job_id,
        pathname_extension = EXCLUDED.pathname_extension,
        extension_category_id = COALESCE(EXCLUDED.extension_category_id, discovered_url.extension_category_id),
        external_seen_at = COALESCE(discovered_url.external_seen_at, EXCLUDED.external_seen_at),
        engines = ARRAY(SELECT DISTINCT unnest(discovered_url.engines || EXCLUDED.engines))
    `;
  }
}

/* ── Cancellation checkpoint ── */

class ScanCancelled extends Error {
  constructor() {
    super("Scan cancelled by user");
    this.name = "ScanCancelled";
  }
}

async function checkCancelled(prisma: PrismaClient, scanJobId: string): Promise<void> {
  const row = await prisma.scanJob.findUnique({ where: { id: scanJobId }, select: { status: true } });
  if (!row || row.status === ScanJobStatus.CANCELLED) {
    throw new ScanCancelled();
  }
}

/**
 * Option A: persist one engine batch to DB, run the same regex/deep analysis as legacy T6,
 * refresh cached counts. Engine merge across batches is handled by `batchUpsertUrls` ON CONFLICT.
 */
async function processAndWriteUrls(
  prisma: PrismaClient,
  scanJobId: string,
  targetDomainId: string,
  targetNorm: string,
  suffixRules: SuffixRule[],
  categoryMap: Map<number, { id: number; slug: string | null }>,
  cfg: ScanConfig,
  globalProxy: string | null,
  urls: UrlInput[],
  engine: EngineProvider,
): Promise<void> {
  const merged = mergeUrlInputsForBatch(urls, targetNorm);
  if (merged.length === 0) return;

  await checkCancelled(prisma, scanJobId);

  const allSubdomains = await prisma.subdomain.findMany({
    where: { targetDomainId },
    select: { id: true, hostnameNormalized: true },
  });
  const subMap = new Map(allSubdomains.map((s) => [s.hostnameNormalized, s.id]));

  const preparedRows: PreparedUrlRow[] = [];
  for (const { url, date } of merged) {
    const host = extractHostIfUnderTarget(url, targetNorm);
    if (!host) continue;
    const hostnameNormalized = host.toLowerCase();

    const ext = pathnameExtensionFromUrl(url);
    const categoryId = categoryIdForPathnameExtension(suffixRules, ext);
    const urlSha = sha256Hex(url);
    const subId = subMap.get(hostnameNormalized) ?? null;

    preparedRows.push({
      hostnameNormalized,
      urlText: url,
      urlSha256: urlSha,
      subdomainId: subId,
      extensionCategoryId: categoryId,
      pathnameExtension: ext,
      deepScanState: cfg.deepScan ? DeepScanState.PENDING : DeepScanState.SKIPPED,
      externalSeenAt: date,
      engines: [engine],
    });
  }

  if (preparedRows.length === 0) return;

  await persistObservedSubdomains(
    prisma,
    scanJobId,
    targetDomainId,
    targetNorm,
    preparedRows,
  );

  /** Wayback batches must not re-run regex/deep on URLs already on target (e.g. from VT), matching legacy single-pass T6 per unique URL. */
  const preExistingWaybackSkip = new Set<string>();
  if (engine === EngineProvider.WAYBACK_MACHINE) {
    const uniqueHashes = [...new Set(preparedRows.map((r) => r.urlSha256))];
    const HASH_LOOKUP_BATCH = 5000;
    for (let i = 0; i < uniqueHashes.length; i += HASH_LOOKUP_BATCH) {
      const slice = uniqueHashes.slice(i, i + HASH_LOOKUP_BATCH);
      const existing = await prisma.discoveredUrl.findMany({
        where: { targetDomainId, urlSha256: { in: slice } },
        select: { urlSha256: true },
      });
      for (const e of existing) preExistingWaybackSkip.add(e.urlSha256);
    }
  }

  await prisma.scanJob.update({
    where: { id: scanJobId },
    data: { phase: ScanPhase.T6_ANALYSIS, progressCurrent: 0, progressTotal: preparedRows.length },
  });

  const URL_BATCH = 500;
  for (let i = 0; i < preparedRows.length; i += URL_BATCH) {
    const batch = preparedRows.slice(i, i + URL_BATCH);
    await batchUpsertUrls(prisma, targetDomainId, scanJobId, batch, URL_BATCH);
    const progress = Math.min(i + URL_BATCH, preparedRows.length);
    if (shouldUpdateProgress(progress, preparedRows.length, URL_BATCH)) {
      await prisma.scanJob.update({
        where: { id: scanJobId },
        data: { progressCurrent: progress, progressTotal: preparedRows.length },
      });
    }
  }

  await checkCancelled(prisma, scanJobId);

  const deepSlugs = new Set((cfg.deepScanCategorySlugs ?? []).map((s) => s.toLowerCase()));
  const deepEnabled = Boolean(cfg.deepScan);

  const URL_ID_BATCH = 5000;
  const allUrlHashes = preparedRows.map((r) => r.urlSha256);
  const insertedUrls: { id: string; urlSha256: string; extensionCategoryId: number | null }[] = [];
  for (let i = 0; i < allUrlHashes.length; i += URL_ID_BATCH) {
    const hashBatch = allUrlHashes.slice(i, i + URL_ID_BATCH);
    const batch = await prisma.discoveredUrl.findMany({
      where: { targetDomainId, urlSha256: { in: hashBatch } },
      select: { id: true, urlSha256: true, extensionCategoryId: true },
    });
    insertedUrls.push(...batch);
  }
  const urlIdMap = new Map(insertedUrls.map((u) => [u.urlSha256, u]));

  await persistObservedUrls(
    prisma,
    scanJobId,
    targetDomainId,
    preparedRows,
    urlIdMap,
  );

  const urlStringFindings: {
    discoveredUrlId: string;
    targetDomainId: string;
    scanJobId: string;
    source: FindingSource;
    findingType: string;
    snippet: string;
  }[] = [];

  let a = 0;
  for (const row of preparedRows) {
    a += 1;

    if (shouldUpdateProgress(a, preparedRows.length)) {
      await prisma.scanJob.update({
        where: { id: scanJobId },
        data: { progressCurrent: a, progressTotal: preparedRows.length },
      });
    }

    const du = urlIdMap.get(row.urlSha256);
    if (!du) continue;

    if (engine === EngineProvider.WAYBACK_MACHINE && preExistingWaybackSkip.has(row.urlSha256)) continue;

    for (const hit of runSensitiveRegexScan(row.urlText)) {
      urlStringFindings.push({
        discoveredUrlId: du.id,
        targetDomainId,
        scanJobId,
        source: FindingSource.URL_STRING,
        findingType: hit.type,
        snippet: hit.snippet,
      });
    }

    if (!deepEnabled) continue;

    const cat = du.extensionCategoryId ? (categoryMap.get(du.extensionCategoryId) ?? null) : null;
    const slug = cat?.slug?.toLowerCase() ?? "other";
    if (deepSlugs.size > 0 && !deepSlugs.has(slug)) continue;

    await checkCancelled(prisma, scanJobId);

    await prisma.discoveredUrl.update({
      where: { id: du.id },
      data: { deepScanState: DeepScanState.IN_PROGRESS },
    });

    try {
      const { text } = await deepFetchText({ url: row.urlText, proxyUrl: globalProxy });

      for (const hit of runSensitiveRegexScan(text)) {
        urlStringFindings.push({
          discoveredUrlId: du.id,
          targetDomainId,
          scanJobId,
          source: FindingSource.RESPONSE_BODY,
          findingType: hit.type,
          snippet: hit.snippet,
        });
      }
      await prisma.discoveredUrl.update({
        where: { id: du.id },
        data: {
          deepScanState: DeepScanState.DONE,
          fetchedAt: new Date(),
          contentLength: BigInt(Buffer.byteLength(text, "utf8")),
        },
      });
    } catch {
      await prisma.discoveredUrl.update({
        where: { id: du.id },
        data: { deepScanState: DeepScanState.FAILED },
      });
    }
  }

  if (urlStringFindings.length > 0) {
    const FINDING_BATCH = 1000;
    for (let i = 0; i < urlStringFindings.length; i += FINDING_BATCH) {
      const batch = urlStringFindings.slice(i, i + FINDING_BATCH);
      await prisma.$transaction(async (tx) => {
        const result = await tx.analysisFinding.createMany({ data: batch });
        if (result.count > 0) {
          await tx.scanJob.update({
            where: { id: scanJobId },
            data: { observedFindingCount: { increment: result.count } },
          });
        }
      });
    }
  }

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

/* ── Main scan job ── */

export async function runScanJob(prisma: PrismaClient, redis: Redis, scanJobId: string) {
  const job = await prisma.scanJob.findUnique({ where: { id: scanJobId }, include: { targetDomain: true } });
  if (!job) throw new Error("Scan job not found");

  const cfg = job.config as ScanConfig;
  const engines = cfg.enginesEnabled ?? [EngineProvider.VIRUSTOTAL];

  if (engines.length === 0) {
    throw new Error("No engines enabled for this scan");
  }

  const globalProxy = await getGlobalProxy(prisma);
  const target = job.targetDomain;
  const targetNorm = target.domainNormalized;
  const suffixRules = await loadExtensionSuffixRules(prisma);
  const isSubdomainScan = cfg.inputType === "subdomain";

  /* ── B3: Pre-load extension categories (1 query instead of N) ── */
  const allCategories = await prisma.extensionCategory.findMany();
  const categoryMap = new Map(allCategories.map((c) => [c.id, c]));

  /* ── Mark job as RUNNING ── */
  await prisma.scanJob.update({
    where: { id: scanJobId },
    data: {
      status: ScanJobStatus.RUNNING,
      startedAt: new Date(),
      progressCurrent: 0,
      progressTotal: 1,
      observedSubdomainCount: 0,
      observedUrlCount: 0,
      observedFindingCount: 0,
      observedIpCount: 0,
      observedVersion: 1,
    },
  });

  /* ════════════════════════════════════════════
   * Phase T1 & T2: VirusTotal
   * ════════════════════════════════════════════ */
  const vtEnabled = engines.includes(EngineProvider.VIRUSTOTAL);
  let vtSubdomains: string[] = [];

  const vtUrlMap = new Map<string, { date: Date | null; engines: Set<EngineProvider> }>();
  const vtIpMap = new Map<string, Map<string, Date>>();

  function addVtUrl(url: string, date: Date | null) {
    if (!extractHostIfUnderTarget(url, targetNorm)) return;
    const existing = vtUrlMap.get(url);
    if (existing) {
      if (!existing.date && date) existing.date = date;
      existing.engines.add(EngineProvider.VIRUSTOTAL);
    } else {
      vtUrlMap.set(url, { date, engines: new Set([EngineProvider.VIRUSTOTAL]) });
    }
  }

  function addVtIp(ipAddress: string, hostname: string, lastResolved: Date) {
    let hostMap = vtIpMap.get(ipAddress);
    if (!hostMap) {
      hostMap = new Map();
      vtIpMap.set(ipAddress, hostMap);
    }
    const existing = hostMap.get(hostname);
    if (!existing || lastResolved > existing) {
      hostMap.set(hostname, lastResolved);
    }
  }

  if (vtEnabled) {
    await prisma.scanJob.update({
      where: { id: scanJobId },
      data: { status: ScanJobStatus.RUNNING, startedAt: new Date(), phase: ScanPhase.T1_APEX, progressCurrent: 0, progressTotal: 1 },
    });

    await checkCancelled(prisma, scanJobId);

    const apexReport = await fetchReportWithRotator(prisma, redis, targetNorm, globalProxy, scanJobId);

    for (const u of harvestUndetectedUrlsWithDate(apexReport)) {
      addVtUrl(u.url, u.date);
    }
    for (const r of harvestResolutions(apexReport)) {
      addVtIp(r.ipAddress, targetNorm, r.lastResolved);
    }

    if (isSubdomainScan) {
      await ensureSubdomain(prisma, target.id, targetNorm, { userInput: true });
    } else {
      const listSubdomains = new Set(subdomainsFromReport(apexReport));
      const siblingSubdomains = new Set(domainSiblingsFromReport(apexReport));
      const urlHostSubdomains = new Set(subdomainsFromUndetectedUrls(apexReport, targetNorm));
      const layer1 = discoverSubdomainsFromReport(apexReport, targetNorm);

      for (const h of layer1) {
        await ensureSubdomain(prisma, target.id, h, {
          vtSubdomainList: listSubdomains.has(h),
          vtDomainSiblings: siblingSubdomains.has(h),
          vtUndetectedUrlHost: urlHostSubdomains.has(h),
        });
      }

      const maxSubdomains = Math.max(1, Math.min(50_000, Number(cfg.maxSubdomains ?? 2000)));
      const seen = new Set<string>(layer1);
      const queue: string[] = [...layer1];

      await prisma.scanJob.update({
        where: { id: scanJobId },
        data: { phase: ScanPhase.T2_SUBDOMAINS, progressCurrent: 0, progressTotal: queue.length },
      });

      let idx = 0;
      for (let qi = 0; qi < queue.length; qi++) {
        const host = queue[qi]!;
        idx += 1;

        await checkCancelled(prisma, scanJobId);

        const rep = await fetchReportWithRotator(prisma, redis, host, globalProxy, scanJobId);

        for (const u of harvestUndetectedUrlsWithDate(rep)) {
          if (extractHostIfUnderTarget(u.url, targetNorm)) {
            const existingDate = vtUrlMap.get(u.url);
            if (!existingDate) addVtUrl(u.url, u.date);
          }
        }
        for (const r of harvestResolutions(rep)) {
          addVtIp(r.ipAddress, host, r.lastResolved);
        }

        const repList = new Set(subdomainsFromReport(rep));
        const repSiblings = new Set(domainSiblingsFromReport(rep));
        const repUrlHosts = new Set(subdomainsFromUndetectedUrls(rep, targetNorm));
        const discovered = discoverSubdomainsFromReport(rep, targetNorm);

        for (const h of discovered) {
          if (seen.has(h)) continue;
          if (seen.size >= maxSubdomains) break;
          seen.add(h);
          queue.push(h);
          await ensureSubdomain(prisma, target.id, h, {
            vtExpandedDiscovery: true,
            vtSubdomainList: repList.has(h),
            vtDomainSiblings: repSiblings.has(h),
            vtUndetectedUrlHost: repUrlHosts.has(h),
          });
        }

        if (shouldUpdateProgress(idx, queue.length, 2)) {
          await prisma.scanJob.update({
            where: { id: scanJobId },
            data: { progressCurrent: idx, progressTotal: queue.length },
          });
        }

        if (seen.size >= maxSubdomains) break;
      }
      vtSubdomains = Array.from(seen);
    }

    await persistIpResolutions(prisma, scanJobId, target.id, vtIpMap);

    const vtUrlList: UrlInput[] = Array.from(vtUrlMap.entries()).map(([url, v]) => ({ url, date: v.date }));
    await processAndWriteUrls(
      prisma,
      scanJobId,
      target.id,
      targetNorm,
      suffixRules,
      categoryMap,
      cfg,
      globalProxy,
      vtUrlList,
      EngineProvider.VIRUSTOTAL,
    );
  }

  /* ════════════════════════════════════════════
   * Phase T3 & T4: Wayback Machine
   * ════════════════════════════════════════════ */
  const waybackEnabled = engines.includes(EngineProvider.WAYBACK_MACHINE);
  const { fetchWaybackUrls } = await import("@/engines/wayback");

  if (waybackEnabled) {
    await prisma.scanJob.update({
      where: { id: scanJobId },
      data: { status: ScanJobStatus.RUNNING, phase: ScanPhase.T3_WAYBACK_APEX, progressCurrent: 0, progressTotal: 1 },
    });

    await checkCancelled(prisma, scanJobId);

    const apexUrls = await fetchWaybackUrls(targetNorm);
    const apexInputs: UrlInput[] = apexUrls.map((url) => ({ url, date: null }));
    await processAndWriteUrls(
      prisma,
      scanJobId,
      target.id,
      targetNorm,
      suffixRules,
      categoryMap,
      cfg,
      globalProxy,
      apexInputs,
      EngineProvider.WAYBACK_MACHINE,
    );

    if (!isSubdomainScan && vtEnabled && vtSubdomains.length > 0) {
      await prisma.scanJob.update({
        where: { id: scanJobId },
        data: { phase: ScanPhase.T4_WAYBACK_SUBDOMAINS, progressCurrent: 0, progressTotal: vtSubdomains.length },
      });

      let wIdx = 0;
      let lastRequestStart = 0;
      const MIN_INTERVAL_MS = 6000;
      for (const sub of vtSubdomains) {
        wIdx += 1;
        await checkCancelled(prisma, scanJobId);

        const elapsed = Date.now() - lastRequestStart;
        if (lastRequestStart > 0 && elapsed < MIN_INTERVAL_MS) {
          await sleep(MIN_INTERVAL_MS - elapsed);
        }

        lastRequestStart = Date.now();
        const subUrls = await fetchWaybackUrls(sub);
        const subInputs: UrlInput[] = subUrls.map((url) => ({ url, date: null }));
        await processAndWriteUrls(
          prisma,
          scanJobId,
          target.id,
          targetNorm,
          suffixRules,
          categoryMap,
          cfg,
          globalProxy,
          subInputs,
          EngineProvider.WAYBACK_MACHINE,
        );

        if (shouldUpdateProgress(wIdx, vtSubdomains.length, 2)) {
          await prisma.scanJob.update({
            where: { id: scanJobId },
            data: { progressCurrent: wIdx, progressTotal: vtSubdomains.length },
          });
        }
      }
    }
  }

  await checkCancelled(prisma, scanJobId);

  const finalUrlCount = await prisma.discoveredUrl.count({ where: { targetDomainId: target.id } });

  const finalCheck = await prisma.scanJob.findUnique({ where: { id: scanJobId }, select: { status: true } });
  if (finalCheck?.status !== ScanJobStatus.CANCELLED) {
    await prisma.scanJob.update({
      where: { id: scanJobId },
      data: {
        status: ScanJobStatus.COMPLETED,
        completedAt: new Date(),
        progressCurrent: finalUrlCount,
        progressTotal: Math.max(1, finalUrlCount),
      },
    });
  }
}

async function persistIpResolutions(
  prisma: PrismaClient,
  scanJobId: string,
  targetDomainId: string,
  ipMap: Map<string, Map<string, Date>>,
) {
  if (ipMap.size === 0) return;

  await prisma.$transaction(async (tx) => {
    let observedCount = 0;
    
    for (const [ipAddress, hostMap] of ipMap) {
      let latestResolvedAt = new Date(0);
      let latestSeenBy = "";
      for (const [hostname, lastResolved] of hostMap) {
        if (lastResolved > latestResolvedAt) {
          latestResolvedAt = lastResolved;
          latestSeenBy = hostname;
        }
      }

      const existing = await tx.ipResolution.findUnique({
        where: { targetDomainId_ipAddress: { targetDomainId, ipAddress } },
        select: { id: true, latestResolvedAt: true }
      });

      let globalIpId;
      if (existing) {
        globalIpId = existing.id;
        const newDate = latestResolvedAt > existing.latestResolvedAt ? latestResolvedAt : existing.latestResolvedAt;
        const newHost = latestResolvedAt > existing.latestResolvedAt ? latestSeenBy : undefined;
        
        await tx.ipResolution.update({
          where: { id: existing.id },
          data: {
            latestResolvedAt: newDate,
            ...(newHost ? { latestSeenBy: newHost } : {}),
          }
        });
      } else {
        const created = await tx.ipResolution.create({
          data: {
            targetDomainId,
            ipAddress,
            latestResolvedAt,
            latestSeenBy,
            hostnameCount: hostMap.size,
          }
        });
        globalIpId = created.id;
      }

      for (const [hostname, lastResolved] of hostMap) {
        await tx.ipResolutionSighting.upsert({
          where: {
            ipResolutionId_hostnameNormalized: {
              ipResolutionId: globalIpId,
              hostnameNormalized: hostname,
            }
          },
          create: {
            ipResolutionId: globalIpId,
            scanJobId,
            hostnameNormalized: hostname,
            lastResolvedAt: lastResolved,
          },
          update: {
            lastResolvedAt: lastResolved,
            scanJobId,
          }
        });
      }

      await tx.scanObservedIpResolution.upsert({
        where: {
          scanJobId_ipAddress: {
            scanJobId,
            ipAddress,
          }
        },
        create: {
          scanJobId,
          targetDomainId,
          ipResolutionId: globalIpId,
          ipAddress,
          lastResolvedAt: latestResolvedAt,
          reportedByHostname: latestSeenBy,
        },
        update: {}
      });
      
      observedCount++;
    }

    await tx.$executeRaw`
      UPDATE "ip_resolution" ir
      SET "hostname_count" = (
        SELECT COUNT(*) FROM "ip_resolution_sighting"
        WHERE "ip_resolution_id" = ir.id
      )
      WHERE "target_domain_id" = ${targetDomainId}
    `;

    await tx.$executeRaw`
      UPDATE "target_domain" td
      SET "cached_ip_count" = (
        SELECT COUNT(*) FROM "ip_resolution"
        WHERE "target_domain_id" = td.id
      )
      WHERE id = ${targetDomainId}
    `;
    
    await tx.scanJob.update({
      where: { id: scanJobId },
      data: { observedIpCount: observedCount }
    });
  }, { timeout: 30000 });
}
