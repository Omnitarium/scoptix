/** ISO-like UTC timestamp for IP directory tables (e.g. 2024-06-16 10:50:21). */
export function formatIpTableDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

export function formatHostnameCountLabel(count: number) {
  const n = Math.max(0, Math.floor(count));
  return n === 1 ? "1 subdomain" : `${n.toLocaleString()} subdomains`;
}

export function formatScanDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatScanDuration(
  startedAt: Date | string | null | undefined,
  completedAt: Date | string | null | undefined,
) {
  if (!startedAt || !completedAt) return "—";
  const start = typeof startedAt === "string" ? new Date(startedAt) : startedAt;
  const end = typeof completedAt === "string" ? new Date(completedAt) : completedAt;
  const ms = end.getTime() - start.getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function shortScanId(id: string, len = 8) {
  return id.length > len ? id.slice(0, len) : id;
}
