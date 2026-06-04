import axios, { type AxiosError } from "axios";
import { SocksProxyAgent } from "socks-proxy-agent";
import { extractHostIfUnderTarget } from "@/lib/extract-hosts";

export const VT_DOMAIN_REPORT_V2 = "https://www.virustotal.com/vtapi/v2/domain/report";

export type VtDomainReportV2 = {
  response_code?: number;
  verbose_msg?: string;
  subdomains?: string[];
  domain_siblings?: string[];
  undetected_urls?: unknown[];
  resolutions?: Array<{ ip_address: string; last_resolved: string }>;
};

export type VtUrlWithDate = { url: string; date: Date | null };

export function harvestUndetectedUrlsWithDate(report: VtDomainReportV2): VtUrlWithDate[] {
  const raw = report.undetected_urls;
  if (!Array.isArray(raw)) return [];
  const out: VtUrlWithDate[] = [];
  for (const row of raw) {
    if (Array.isArray(row) && typeof row[0] === "string") {
      let date: Date | null = null;
      if (typeof row[4] === "string") {
        // e.g. "2026-04-17 02:50:25" -> "2026-04-17T02:50:25Z" (VT dates are UTC)
        const dStr = row[4].trim().replace(" ", "T") + "Z";
        const d = new Date(dStr);
        if (!isNaN(d.getTime())) date = d;
      }
      out.push({ url: row[0], date });
    } else if (typeof row === "string") {
      out.push({ url: row, date: null });
    }
  }
  return out;
}

export type VtResolution = { ipAddress: string; lastResolved: Date };

export function harvestResolutions(report: VtDomainReportV2): VtResolution[] {
  const raw = report.resolutions;
  if (!Array.isArray(raw)) return [];
  const out: VtResolution[] = [];
  for (const entry of raw) {
    if (typeof entry.ip_address !== "string" || typeof entry.last_resolved !== "string") continue;
    const dStr = entry.last_resolved.trim().replace(" ", "T") + "Z";
    const d = new Date(dStr);
    if (!isNaN(d.getTime())) {
      out.push({ ipAddress: entry.ip_address, lastResolved: d });
    }
  }
  return out;
}

export function harvestUndetectedUrlStrings(report: VtDomainReportV2): string[] {
  return harvestUndetectedUrlsWithDate(report).map((u) => u.url);
}

export function subdomainsFromReport(report: VtDomainReportV2): string[] {
  return (report.subdomains ?? []).map((s) => s.toLowerCase().replace(/\.$/, ""));
}

export function domainSiblingsFromReport(report: VtDomainReportV2): string[] {
  return (report.domain_siblings ?? []).map((s) => s.toLowerCase().replace(/\.$/, ""));
}

export function subdomainsFromUndetectedUrls(report: VtDomainReportV2, targetDomainNormalized: string): string[] {
  const fromUrls = new Set<string>();
  for (const u of harvestUndetectedUrlStrings(report)) {
    const h = extractHostIfUnderTarget(u, targetDomainNormalized);
    if (h) fromUrls.add(h);
  }
  return Array.from(fromUrls);
}

export function discoverSubdomainsFromReport(report: VtDomainReportV2, targetDomainNormalized: string): string[] {
  const fromList = subdomainsFromReport(report);
  const fromSiblings = domainSiblingsFromReport(report);
  const fromUrls = subdomainsFromUndetectedUrls(report, targetDomainNormalized);
  return Array.from(new Set([...fromList, ...fromSiblings, ...fromUrls]));
}

export async function fetchVtDomainReportV2(params: {
  apiKey: string;
  domain: string;
  proxyUrl?: string | null;
}): Promise<{ status: number; data: VtDomainReportV2 }> {
  const agent = params.proxyUrl ? new SocksProxyAgent(params.proxyUrl) : undefined;
  try {
    const res = await axios.get<VtDomainReportV2>(VT_DOMAIN_REPORT_V2, {
      params: { apikey: params.apiKey, domain: params.domain },
      timeout: 45_000,
      httpsAgent: agent,
      httpAgent: agent,
      proxy: false,
      validateStatus: () => true,
    });
    return { status: res.status, data: res.data ?? {} };
  } catch (e) {
    const err = e as AxiosError;
    if (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT") {
      return { status: 598, data: {} };
    }
    return { status: 599, data: {} };
  }
}
