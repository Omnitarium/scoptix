import axios from "axios";
import { SocksProxyAgent } from "socks-proxy-agent";

export const NVD_CVE_API = "https://services.nvd.nist.gov/rest/json/cves/2.0";
export const NVD_RESULTS_PER_PAGE = 2000;
/** NVD allows a maximum 120-day window per lastMod query. */
export const NVD_MAX_WINDOW_DAYS = 120;

/**
 * NVD requires ISO-8601 with an explicit UTC offset and rejects (or silently
 * ignores) a bare "Z" suffix from `Date.toISOString()`. When the date filter is
 * ignored, NVD returns the ENTIRE database instead of the requested window, so
 * formatting this correctly is critical. Format: 2026-06-14T13:31:32.338+00:00
 */
export function toNvdDate(d: Date): string {
  return d.toISOString().replace(/Z$/, "+00:00");
}

export type NvdCveParsed = {
  id: string;
  published: Date;
  lastModified: Date;
  cvssScore: number | null;
  cvssSeverity: string | null;
  cvssVector: string | null;
  description: string;
  cpeProducts: string[];
  cpeConfigs: unknown;
  references: string[];
};

export type NvdPageResult = {
  status: number;
  totalResults: number;
  startIndex: number;
  resultsPerPage: number;
  cves: NvdCveParsed[];
};

type NvdRawCve = {
  id: string;
  published: string;
  lastModified: string;
  descriptions?: Array<{ lang: string; value: string }>;
  metrics?: {
    cvssMetricV31?: Array<{ cvssData?: { baseScore?: number; baseSeverity?: string; vectorString?: string }; baseSeverity?: string }>;
    cvssMetricV30?: Array<{ cvssData?: { baseScore?: number; baseSeverity?: string; vectorString?: string }; baseSeverity?: string }>;
    cvssMetricV2?: Array<{ cvssData?: { baseScore?: number; vectorString?: string }; baseSeverity?: string }>;
  };
  configurations?: unknown[];
  references?: Array<{ url: string }>;
};

function pickCvss(metrics: NvdRawCve["metrics"]): {
  score: number | null;
  severity: string | null;
  vector: string | null;
} {
  const v31 = metrics?.cvssMetricV31?.[0];
  if (v31?.cvssData) {
    return {
      score: v31.cvssData.baseScore ?? null,
      severity: (v31.cvssData.baseSeverity ?? v31.baseSeverity ?? null)?.toUpperCase() ?? null,
      vector: v31.cvssData.vectorString ?? null,
    };
  }
  const v30 = metrics?.cvssMetricV30?.[0];
  if (v30?.cvssData) {
    return {
      score: v30.cvssData.baseScore ?? null,
      severity: (v30.cvssData.baseSeverity ?? v30.baseSeverity ?? null)?.toUpperCase() ?? null,
      vector: v30.cvssData.vectorString ?? null,
    };
  }
  const v2 = metrics?.cvssMetricV2?.[0];
  if (v2?.cvssData) {
    return {
      score: v2.cvssData.baseScore ?? null,
      severity: v2.baseSeverity?.toUpperCase() ?? null,
      vector: v2.cvssData.vectorString ?? null,
    };
  }
  return { score: null, severity: null, vector: null };
}

/**
 * Extract product tokens from a CVE's CPE configuration nodes.
 * Stores BOTH the full "vendor:product" and the bare "product" so that techs
 * fingerprinted without a CPE (only a product name, e.g. "nginx") can still be
 * looked up via Postgres array `hasSome`, which matches array elements exactly.
 */
export function extractCpeProducts(configurations: unknown[]): string[] {
  const out = new Set<string>();
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;
    if (Array.isArray(n.nodes)) n.nodes.forEach(walk);
    if (Array.isArray(n.cpeMatch)) {
      for (const m of n.cpeMatch as Array<Record<string, unknown>>) {
        const criteria = typeof m.criteria === "string" ? m.criteria : "";
        // CPE 2.3: cpe:2.3:part:vendor:product:version:...
        const parts = criteria.split(":");
        if (parts.length >= 5) {
          const vendor = parts[3];
          const product = parts[4];
          if (vendor && product && vendor !== "*" && product !== "*") {
            out.add(`${vendor}:${product}`);
            out.add(product);
          }
        }
      }
    }
  };
  for (const c of configurations ?? []) walk(c);
  return Array.from(out);
}

function parseCve(raw: NvdRawCve): NvdCveParsed {
  const cvss = pickCvss(raw.metrics);
  const desc =
    raw.descriptions?.find((d) => d.lang === "en")?.value ??
    raw.descriptions?.[0]?.value ??
    "";
  const configs = raw.configurations ?? [];
  return {
    id: raw.id,
    published: new Date(raw.published),
    lastModified: new Date(raw.lastModified),
    cvssScore: cvss.score,
    cvssSeverity: cvss.severity,
    cvssVector: cvss.vector,
    description: desc,
    cpeProducts: extractCpeProducts(configs),
    cpeConfigs: configs,
    references: (raw.references ?? []).map((r) => r.url).filter(Boolean).slice(0, 50),
  };
}

/**
 * Fetch a single page of CVEs PUBLISHED within [pubStartDate, pubEndDate].
 *
 * We deliberately filter on publication date rather than lastModified: NVD
 * periodically performs bulk re-scoring that bumps `lastModified` on hundreds
 * of thousands of CVEs at once, so a lastMod window can match the entire DB.
 * Publication date is stable (a CVE is published exactly once) and matches the
 * user's mental model of "CVEs from the last N days".
 * Never throws — returns status code; caller decides retry/backoff.
 */
export async function fetchNvdCvePage(params: {
  apiKey?: string | null;
  startIndex: number;
  pubStartDate: Date;
  pubEndDate: Date;
  proxyUrl?: string | null;
}): Promise<NvdPageResult> {
  const agent = params.proxyUrl ? new SocksProxyAgent(params.proxyUrl) : undefined;
  const headers: Record<string, string> = {
    // NVD rejects requests without a browser-like User-Agent (503).
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    Accept: "application/json",
  };
  if (params.apiKey) headers.apiKey = params.apiKey;

  try {
    const res = await axios.get(NVD_CVE_API, {
      params: {
        startIndex: params.startIndex,
        resultsPerPage: NVD_RESULTS_PER_PAGE,
        pubStartDate: toNvdDate(params.pubStartDate),
        pubEndDate: toNvdDate(params.pubEndDate),
      },
      // Do not let axios re-encode the "+" in the offset into a space.
      paramsSerializer: { encode: encodeURIComponent },
      headers,
      timeout: 60_000,
      httpsAgent: agent,
      httpAgent: agent,
      proxy: false,
      validateStatus: () => true,
    });

    if (res.status !== 200 || typeof res.data !== "object" || res.data == null) {
      return { status: res.status, totalResults: 0, startIndex: params.startIndex, resultsPerPage: 0, cves: [] };
    }

    const data = res.data as {
      totalResults?: number;
      startIndex?: number;
      resultsPerPage?: number;
      vulnerabilities?: Array<{ cve: NvdRawCve }>;
    };

    const cves = (data.vulnerabilities ?? [])
      .map((v) => v.cve)
      .filter(Boolean)
      .map(parseCve);

    return {
      status: 200,
      totalResults: data.totalResults ?? 0,
      startIndex: data.startIndex ?? params.startIndex,
      resultsPerPage: data.resultsPerPage ?? cves.length,
      cves,
    };
  } catch {
    return { status: 599, totalResults: 0, startIndex: params.startIndex, resultsPerPage: 0, cves: [] };
  }
}

/** Split [start, end] into <=120-day windows (NVD constraint). */
export function splitDateWindows(start: Date, end: Date): Array<{ start: Date; end: Date }> {
  const windows: Array<{ start: Date; end: Date }> = [];
  const maxMs = NVD_MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  let cursor = start.getTime();
  const endMs = end.getTime();
  while (cursor < endMs) {
    const winEnd = Math.min(cursor + maxMs, endMs);
    windows.push({ start: new Date(cursor), end: new Date(winEnd) });
    cursor = winEnd;
  }
  if (windows.length === 0) windows.push({ start, end });
  return windows;
}
