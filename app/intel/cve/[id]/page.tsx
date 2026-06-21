import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { TopBar } from "@/components/top-bar";
import { IconArrowUpRight } from "@/components/ui-icons";
import { prisma } from "@/lib/prisma";
import { formatScanDateTime } from "@/lib/scan-format";
import {
  severityBadgeClass,
  parseAffectedConfigs,
  normalizeProductToken,
} from "@/lib/cve-format";
import { CveDescription } from "@/components/intel/cve-description";

export const dynamic = "force-dynamic";

export default async function CveDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cveId = decodeURIComponent(id);

  const cve = await prisma.cve.findUnique({ where: { id: cveId } });
  if (!cve) notFound();

  // Affected hosts: subdomain technologies matched to this CVE.
  const matches = await prisma.subdomainTechnologyCve.findMany({
    where: { cveId },
    select: {
      matchedVersion: true,
      subdomainTechnology: {
        select: {
          name: true,
          version: true,
          cpe: true,
          subdomain: {
            select: { hostnameNormalized: true, targetDomainId: true },
          },
        },
      },
    },
    take: 500,
  });

  // Parse the NVD CPE configuration into readable "affected product" rows.
  const affectedConfigs = parseAffectedConfigs(cve.cpeConfigs);

  // Resolve each affected host to the config entry it matched, so we can show
  // the exact version range (straight from NVD) that triggered the match.
  const hostRows = matches.map((m) => {
    const tech = m.subdomainTechnology;
    const techToken = normalizeProductToken(tech.name);
    const cpeProduct = tech.cpe ? tech.cpe.split(":")[4] ?? "" : "";
    const matchedConfig =
      affectedConfigs.find(
        (c) => normalizeProductToken(c.product) === normalizeProductToken(cpeProduct),
      ) ??
      affectedConfigs.find(
        (c) =>
          normalizeProductToken(c.product) === techToken ||
          techToken.includes(normalizeProductToken(c.product)) ||
          normalizeProductToken(c.product).includes(techToken),
      ) ??
      null;
    return {
      host: tech.subdomain?.hostnameNormalized ?? "—",
      techName: tech.name,
      version: m.matchedVersion ?? tech.version ?? "—",
      product: matchedConfig?.label ?? cpeProduct ?? "—",
      versionRule: matchedConfig?.versionLabel ?? "—",
    };
  });

  return (
    <>
      <TopBar breadcrumb={`/ intel / cve / ${cveId}`} />
      <main className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <Link
          href="/intel/cve"
          className="text-[12px] text-muted transition-colors hover:text-cream"
        >
          ← Back to CVE database
        </Link>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <PageHeader eyebrow="Intel · CVE" title={cve.id} />
          {cve.cvssSeverity ? (
            <span
              className={`mt-6 inline-block rounded-md px-2.5 py-1 text-[11px] font-semibold ${severityBadgeClass(
                cve.cvssSeverity,
              )}`}
            >
              {cve.cvssSeverity}
              {cve.cvssScore != null ? ` · ${cve.cvssScore.toFixed(1)}` : ""}
            </span>
          ) : null}
        </div>

        {/* Metadata */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Published", formatScanDateTime(cve.published)],
            ["Last modified", formatScanDateTime(cve.lastModified)],
            ["CVSS score", cve.cvssScore != null ? cve.cvssScore.toFixed(1) : "—"],
            ["Affected hosts", matches.length.toLocaleString()],
          ].map(([label, val]) => (
            <div key={label} className="rounded-xl border border-line bg-black/10 px-3 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                {label}
              </div>
              <div className="mt-1 font-mono text-[11px] text-cream">{val}</div>
            </div>
          ))}
        </div>

        {/* Description */}
        <div className="mt-6 glass-panel rounded-2xl p-6">
          <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-accent">
            Description
          </div>
          <CveDescription
            text={cve.description}
            className="mt-3 text-[13px] leading-relaxed text-cream/90"
          />

          {cve.cvssVector ? (
            <div className="mt-4">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                CVSS vector
              </div>
              <div className="mt-1 font-mono text-[11px] text-cream">{cve.cvssVector}</div>
            </div>
          ) : null}

        </div>

        {/* Affected products / configurations (parsed from NVD cpeConfigs) */}
        {affectedConfigs.length > 0 ? (
          <div className="mt-6 glass-panel overflow-hidden rounded-2xl">
            <div className="border-b border-line bg-[var(--table-header-bg)] px-5 py-4">
              <div className="text-[13px] font-semibold text-cream">
                Affected configurations
              </div>
              <div className="mt-1 text-[12px] text-muted">
                Vulnerable products and version ranges as declared in the NVD CPE
                configuration for this CVE.
              </div>
            </div>
            <div className="hidden border-b border-line bg-[var(--table-header-bg)] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted sm:grid sm:grid-cols-12 sm:gap-3">
              <div className="col-span-7">Product</div>
              <div className="col-span-5">Affected versions</div>
            </div>
            <div className="divide-y divide-line">
              {affectedConfigs.map((c) => (
                <div
                  key={c.label + c.versionLabel}
                  className="flex flex-col gap-1 px-5 py-3 sm:grid sm:grid-cols-12 sm:items-center sm:gap-3"
                >
                  <div className="col-span-7 min-w-0 truncate font-mono text-[12px] text-cream">
                    {c.label}
                  </div>
                  <div className="col-span-5 font-mono text-[11px] text-muted tabular-nums">
                    {c.versionLabel}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* References */}
        {cve.references.length > 0 ? (
          <div className="mt-6 glass-panel rounded-2xl p-6">
            <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-accent">
              References
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {cve.references.map((url) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 truncate font-mono text-[11px] text-accent hover:text-accent-dim"
                >
                  <IconArrowUpRight className="size-3 shrink-0" />
                  <span className="truncate">{url}</span>
                </a>
              ))}
            </div>
          </div>
        ) : null}

        {/* Affected hosts */}
        <div className="mt-6 glass-panel overflow-hidden rounded-2xl">
          <div className="border-b border-line bg-[var(--table-header-bg)] px-5 py-4">
            <div className="text-[13px] font-semibold text-cream">Affected hosts</div>
            <div className="mt-1 text-[12px] text-muted">
              Subdomains where a fingerprinted technology&apos;s version falls inside
              an affected range above.
            </div>
          </div>

          <div className="hidden border-b border-line bg-[var(--table-header-bg)] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted sm:grid sm:grid-cols-12 sm:gap-3">
            <div className="col-span-4">Host</div>
            <div className="col-span-3">Technology</div>
            <div className="col-span-2">Version</div>
            <div className="col-span-3">Why matched</div>
          </div>

          <div className="divide-y divide-line">
            {hostRows.length === 0 ? (
              <div className="px-5 py-8 text-center text-[13px] text-muted">
                No hosts currently match this CVE.
              </div>
            ) : (
              hostRows.map((r, i) => (
                <div
                  key={`${r.host}-${r.techName}-${i}`}
                  className="flex flex-col gap-1.5 px-5 py-3 sm:grid sm:grid-cols-12 sm:items-center sm:gap-3"
                >
                  <div className="col-span-4 min-w-0 truncate font-mono text-[12px] text-cream">
                    {r.host}
                  </div>
                  <div className="col-span-3 min-w-0 truncate font-mono text-[11px] text-muted">
                    {r.techName}
                  </div>
                  <div className="col-span-2 font-mono text-[11px] text-cream tabular-nums">
                    {r.version}
                  </div>
                  <div className="col-span-3 min-w-0 truncate font-mono text-[10px] text-muted">
                    <span className="text-cream/70">{r.product}</span>{" "}
                    <span className="text-muted">{r.versionRule}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </>
  );
}
