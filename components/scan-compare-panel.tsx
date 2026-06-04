import Link from "next/link";

type CompareOption = {
  id: string;
  createdAt: Date;
  completedAt: Date | null;
  observedVersion: number | null;
};

type FindingDiffItem = {
  id: string;
  findingType: string;
  source: string;
  snippet: string | null;
  discoveredUrl: {
    urlText: string;
  };
};

type SubdomainDiffItem = {
  id: string;
  hostnameNormalized: string;
};

type UrlDiffItem = {
  id: string;
  hostnameNormalized: string;
  urlText: string;
  extensionCategory: {
    slug: string;
  } | null;
};

type IpDiffItem = {
  id: string;
  ipAddress: string;
  lastResolvedAt: Date;
  reportedByHostname: string;
};

type CompareDiffData =
  | {
      comparable: false;
      reason: "legacy_unavailable";
    }
  | {
      comparable: true;
      summary: {
        added: number;
        removed: number;
        unchanged: number;
      };
      added: Array<FindingDiffItem | SubdomainDiffItem | UrlDiffItem | IpDiffItem>;
      removed: Array<FindingDiffItem | SubdomainDiffItem | UrlDiffItem | IpDiffItem>;
    };

function formatDateTime(value: Date | null) {
  if (!value) return "—";
  return value.toISOString().slice(0, 16).replace("T", " ");
}

function renderDiffItem(
  tab: "findings" | "subdomains" | "urls" | "ips",
  item: FindingDiffItem | SubdomainDiffItem | UrlDiffItem | IpDiffItem,
) {
  if (tab === "findings") {
    const finding = item as FindingDiffItem;
    return (
      <div className="space-y-1">
        <div className="text-[10px] font-bold uppercase tracking-wider text-accent">
          {finding.findingType}
        </div>
        <div className="break-all font-mono text-[11px] text-cream/90">
          {finding.discoveredUrl.urlText}
        </div>
        <div className="text-[10px] text-muted">
          {finding.source === "URL_STRING" ? "URL" : "Body"}
          {finding.snippet ? ` · ${finding.snippet}` : ""}
        </div>
      </div>
    );
  }

  if (tab === "subdomains") {
    const subdomain = item as SubdomainDiffItem;
    return (
      <div className="font-mono text-[12px] text-cream">
        {subdomain.hostnameNormalized}
      </div>
    );
  }

  if (tab === "ips") {
    const ip = item as IpDiffItem;
    return (
      <div className="space-y-1">
        <div className="font-mono text-[12px] font-medium text-cream">
          {ip.ipAddress}
        </div>
        <div className="text-[10px] text-muted">
          Reported by: <span className="text-cream/90">{ip.reportedByHostname}</span>
        </div>
      </div>
    );
  }

  const url = item as UrlDiffItem;
  return (
    <div className="space-y-1">
      <div className="break-all font-mono text-[11px] text-cream/90">
        {url.urlText}
      </div>
      <div className="text-[10px] text-muted">
        {url.hostnameNormalized}
        {url.extensionCategory?.slug ? ` · ${url.extensionCategory.slug}` : ""}
      </div>
    </div>
  );
}

export function ScanComparePanel({
  currentScanId,
  compareOptions,
  selectedCompareId,
  selectedCompareScan,
  targetLabel,
  tab,
  perPage,
  compareDiff,
  basePath,
  tabParamKey = "tab",
  mainTabParamKey,
  mainTabValue,
}: {
  currentScanId: string;
  compareOptions: CompareOption[];
  selectedCompareId?: string;
  selectedCompareScan?: CompareOption | null;
  targetLabel: string;
  tab: "findings" | "subdomains" | "urls" | "ips";
  perPage: number;
  compareDiff: CompareDiffData | null;
  basePath?: string;
  tabParamKey?: string;
  mainTabParamKey?: string;
  mainTabValue?: string;
}) {
  const formAction = basePath ?? `/scans/${currentScanId}/compare`;
  const resetParams = new URLSearchParams();
  if (mainTabParamKey && mainTabValue) resetParams.set(mainTabParamKey, mainTabValue);
  resetParams.set(tabParamKey, tab);
  resetParams.set("perPage", String(perPage));
  const compareHref = `${formAction}?${resetParams.toString()}`;

  return (
    <div className="glass-panel rounded-2xl p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-[13px] font-semibold text-cream">
            Choose A Baseline Scan
          </div>
          <div className="mt-1 text-[12px] text-muted">
            Only completed scans for{" "}
            <span className="font-mono text-cream">{targetLabel}</span> are
            listed here, so the comparison stays strictly like-for-like.
          </div>
        </div>

        {compareOptions.length > 0 ? (
          <form method="get" action={formAction} className="flex flex-wrap items-center gap-2">
            {mainTabParamKey && mainTabValue ? (
              <input type="hidden" name={mainTabParamKey} value={mainTabValue} />
            ) : null}
            <input type="hidden" name={tabParamKey} value={tab} />
            <input type="hidden" name="perPage" value={String(perPage)} />
            <select
              name="compare"
              defaultValue={selectedCompareId ?? ""}
              className="ui-input-field min-w-[280px] rounded-xl border border-line px-3 py-3 text-[12px] text-cream outline-none focus:ring-1 focus:ring-accent/30"
            >
              <option value="">Select a scan…</option>
              {compareOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {formatDateTime(option.createdAt)}
                  {option.completedAt ? ` · finished ${formatDateTime(option.completedAt)}` : ""}
                  {option.observedVersion == null ? " · legacy snapshot limits" : ""}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-xl bg-accent/15 px-4 py-3 text-[12px] font-semibold text-cream ring-1 ring-accent/25 transition-colors hover:bg-accent/25"
            >
              Load Comparison
            </button>
            {selectedCompareId && (
              <Link
                href={compareHref}
                className="rounded-xl border border-line px-4 py-3 text-[12px] text-muted transition-colors hover:bg-[var(--nav-hover-bg)] hover:text-cream"
              >
                Reset
              </Link>
            )}
          </form>
        ) : (
          <div className="text-[12px] text-muted">
            No other completed scans exist yet for this exact target.
          </div>
        )}
      </div>

      {!selectedCompareScan && compareOptions.length > 0 && (
        <div className="mt-5 rounded-2xl border border-line bg-black/10 px-5 py-5">
          <div className="text-[12px] font-semibold text-cream">
            Pick a scan to start comparing
          </div>
          <div className="mt-1 text-[12px] text-muted">
            Select one earlier scan above to see what was added, removed, or
            unchanged in the current scan for this tab.
          </div>
        </div>
      )}

      {selectedCompareScan && compareDiff && (
        <div className="mt-5 space-y-4 border-t border-line/60 pt-5">
          <div className="text-[12px] text-muted">
            Baseline scan:{" "}
            <span className="font-mono text-cream">
              {formatDateTime(selectedCompareScan.createdAt)}
            </span>
          </div>

          {!compareDiff.comparable ? (
            <div className="rounded-xl border border-warn/30 bg-warn/5 px-4 py-4 text-[13px] text-cream">
              This comparison is unavailable for the current tab because one of the scans predates observed snapshot tracking.
            </div>
          ) : (
            <>
              {(compareDiff.summary.added > compareDiff.added.length ||
                compareDiff.summary.removed > compareDiff.removed.length) && (
                <div className="rounded-xl border border-line bg-black/10 px-4 py-3 text-[12px] text-muted">
                  Showing up to{" "}
                  <span className="font-mono text-cream">
                    {perPage.toLocaleString()}
                  </span>{" "}
                  items per side. Narrow the tab if you need to inspect a
                  smaller diff more closely.
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  ["Added in current scan", compareDiff.summary.added],
                  ["Removed from current scan", compareDiff.summary.removed],
                  ["Unchanged", compareDiff.summary.unchanged],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-xl border border-line bg-black/10 px-4 py-3"
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                      {label}
                    </div>
                    <div className="mt-1 font-mono text-[18px] text-cream">
                      {value.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="rounded-xl border border-line overflow-hidden">
                  <div className="border-b border-line bg-[var(--table-header-bg)] px-4 py-3 text-[12px] font-semibold text-cream">
                    Added in current scan
                  </div>
                  <div className="divide-y divide-line">
                    {compareDiff.added.length === 0 ? (
                      <div className="px-4 py-5 text-[12px] text-muted">
                        No added items for this tab.
                      </div>
                    ) : (
                      compareDiff.added.map((item) => (
                        <div key={item.id} className="px-4 py-3">
                          {renderDiffItem(tab, item)}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-line overflow-hidden">
                  <div className="border-b border-line bg-[var(--table-header-bg)] px-4 py-3 text-[12px] font-semibold text-cream">
                    Missing from current scan
                  </div>
                  <div className="divide-y divide-line">
                    {compareDiff.removed.length === 0 ? (
                      <div className="px-4 py-5 text-[12px] text-muted">
                        No removed items for this tab.
                      </div>
                    ) : (
                      compareDiff.removed.map((item) => (
                        <div key={item.id} className="px-4 py-3">
                          {renderDiffItem(tab, item)}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
