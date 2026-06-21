import Link from "next/link";
import { Prisma } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { TopBar } from "@/components/top-bar";
import { TablePagination, normalizePageSize } from "@/components/table-pagination";
import { CveListFilters } from "@/components/intel/cve-list-filters";
import { IconChevronRight } from "@/components/ui-icons";
import { prisma } from "@/lib/prisma";
import { formatScanDateTime } from "@/lib/scan-format";
import { severityBadgeClass } from "@/lib/cve-format";

export const dynamic = "force-dynamic";

function sp(v: string | string[] | undefined): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0] ?? "";
  return "";
}
function asPosInt(v: string | undefined, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}

const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

/** Fixed columns + one flexible description (minmax(0,1fr) lets cells shrink). */
const CVE_GRID = "150px 96px 56px minmax(0,1fr) 150px 96px";

export default async function CveDbPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const rawSp = (await searchParams) ?? {};
  const q = sp(rawSp.q).trim();
  const severity = sp(rawSp.severity).toUpperCase();
  const validSeverity = (SEVERITIES as readonly string[]).includes(severity) ? severity : "";
  const page = asPosInt(sp(rawSp.page), 1);
  const perPage = normalizePageSize(sp(rawSp.perPage) || null);

  const where: Prisma.CveWhereInput = {
    ...(validSeverity ? { cvssSeverity: validSeverity } : {}),
    ...(q
      ? {
          OR: [
            { id: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, totalStored] = await Promise.all([
    prisma.cve.count({ where }),
    prisma.cve.count(),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(page, totalPages);

  const cves = await prisma.cve.findMany({
    where,
    orderBy: { published: "desc" },
    skip: (safePage - 1) * perPage,
    take: perPage,
    select: {
      id: true,
      published: true,
      cvssScore: true,
      cvssSeverity: true,
      description: true,
      cpeProducts: true,
    },
  });

  const fixedParams: Record<string, string> = {};
  if (q) fixedParams.q = q;
  if (validSeverity) fixedParams.severity = validSeverity;

  return (
    <>
      <TopBar breadcrumb="/ intel / cve" />
      <main className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <PageHeader
          eyebrow="Intel"
          title="CVE database"
          description={`${totalStored.toLocaleString()} CVEs stored locally from the NVD. Sorted by publish date.`}
        />

        <div className="mt-6">
          <CveListFilters
            initialQuery={q}
            severity={validSeverity}
            severities={SEVERITIES as unknown as string[]}
          />
        </div>

        <div className="mt-4 glass-panel overflow-hidden rounded-2xl">
          {/*
            Stable layout: an explicit grid template with fixed-width columns and a
            single flexible (minmax(0,1fr)) description column. minmax(0,*) is what
            actually allows the truncating cells to shrink instead of overflowing.
          */}
          <div
            className="hidden items-center gap-3 border-b border-line bg-[var(--table-header-bg)] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted lg:grid"
            style={{ gridTemplateColumns: CVE_GRID }}
          >
            <div>CVE ID</div>
            <div>Severity</div>
            <div className="text-right">Score</div>
            <div>Description</div>
            <div>Published</div>
            <div className="text-right">Products</div>
          </div>

          <div className="divide-y divide-line">
            {cves.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <div className="text-[13px] text-muted">
                  {totalStored === 0
                    ? "No CVEs stored yet. Fetch CVE data from General Settings."
                    : "No CVEs match these filters."}
                </div>
              </div>
            ) : (
              cves.map((c) => (
                <Link
                  key={c.id}
                  href={`/intel/cve/${encodeURIComponent(c.id)}`}
                  className="group block px-5 py-3 text-left transition-colors hover:bg-white/5 focus:outline-none focus-visible:bg-white/5"
                >
                  {/* Desktop: aligned grid. Mobile: stacked card. */}
                  <div
                    className="hidden items-center gap-3 lg:grid"
                    style={{ gridTemplateColumns: CVE_GRID }}
                  >
                    <div className="min-w-0 truncate font-mono text-[12px] text-cream group-hover:text-accent">
                      {c.id}
                    </div>
                    <div className="min-w-0">
                      {c.cvssSeverity ? (
                        <span
                          className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold ${severityBadgeClass(
                            c.cvssSeverity,
                          )}`}
                        >
                          {c.cvssSeverity}
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted">—</span>
                      )}
                    </div>
                    <div className="text-right font-mono text-[11px] text-cream tabular-nums">
                      {c.cvssScore != null ? c.cvssScore.toFixed(1) : "—"}
                    </div>
                    <div className="min-w-0 truncate text-[11px] text-muted" title={c.description}>
                      {c.description}
                    </div>
                    <div className="whitespace-nowrap font-mono text-[11px] text-muted tabular-nums">
                      {formatScanDateTime(c.published)}
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <span className="font-mono text-[11px] text-cream">
                        {c.cpeProducts.length.toLocaleString()}
                      </span>
                      <IconChevronRight
                        className="size-4 shrink-0 text-muted opacity-60 transition-all group-hover:text-accent group-hover:opacity-100"
                        aria-hidden
                      />
                    </div>
                  </div>

                  {/* Mobile stacked layout */}
                  <div className="flex flex-col gap-1.5 lg:hidden">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-mono text-[12px] text-cream group-hover:text-accent">
                        {c.id}
                      </span>
                      {c.cvssSeverity ? (
                        <span
                          className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold ${severityBadgeClass(
                            c.cvssSeverity,
                          )}`}
                        >
                          {c.cvssSeverity}
                          {c.cvssScore != null ? ` · ${c.cvssScore.toFixed(1)}` : ""}
                        </span>
                      ) : null}
                    </div>
                    <div className="line-clamp-2 text-[11px] text-muted">{c.description}</div>
                    <div className="flex items-center justify-between text-[10px] text-muted">
                      <span className="font-mono tabular-nums">{formatScanDateTime(c.published)}</span>
                      <span className="font-mono">{c.cpeProducts.length.toLocaleString()} products</span>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>

          <TablePagination
            currentPage={safePage}
            totalPages={totalPages}
            totalItems={total}
            perPage={perPage}
            basePath="/intel/cve"
            fixedParams={fixedParams}
          />
        </div>
      </main>
    </>
  );
}
