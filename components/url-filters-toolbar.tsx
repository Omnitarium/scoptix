"use client";

import { useMemo, useRef } from "react";
import { UrlExcludeBar, type SubdomainOption, type UrlExcludeBarHandle } from "@/components/url-exclude-bar";
import { UrlSearchBar, type UrlSearchBarHandle } from "@/components/url-search-bar";
import { isUrlSearchQueryActive, parseUrlSearchGroups } from "@/lib/url-search-query";
import type { UrlTabHrefContext, UrlTabPreserve } from "@/lib/url-tab-params";

function SummaryChip({
  label,
  tone = "neutral",
  onClick,
  title,
}: {
  label: string;
  tone?: "neutral" | "search" | "hide";
  onClick: () => void;
  title?: string;
}) {
  const toneClass =
    tone === "search"
      ? "border-accent/30 bg-accent/10 text-accent hover:bg-accent/15"
      : tone === "hide"
        ? "border-warn/30 bg-warn/10 text-warn hover:bg-warn/15"
        : "border-line bg-lift text-cream hover:bg-[var(--nav-hover-bg)]";

  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? label}
      className={[
        "max-w-[180px] truncate rounded-full border px-2.5 py-1 text-left text-[10px] transition-colors",
        tone === "neutral" ? "font-mono" : "font-semibold",
        toneClass,
      ].join(" ")}
    >
      {label}
    </button>
  );
}

export function UrlFiltersToolbar({
  hrefContext,
  preserve,
  initialQuery,
  initialHideSubIds,
  initialHideKw,
  subdomainOptions,
  resolvedHiddenSubdomains,
  totalUrls,
  currentPage,
  totalPages,
}: {
  hrefContext: UrlTabHrefContext;
  preserve: UrlTabPreserve;
  initialQuery: string;
  initialHideSubIds: string[];
  initialHideKw: string[];
  subdomainOptions: SubdomainOption[];
  resolvedHiddenSubdomains: SubdomainOption[];
  totalUrls: number;
  currentPage: number;
  totalPages: number;
}) {
  const searchRef = useRef<UrlSearchBarHandle>(null);
  const hideRef = useRef<UrlExcludeBarHandle>(null);

  const activeSearchTerms = useMemo(
    () =>
      isUrlSearchQueryActive(initialQuery)
        ? parseUrlSearchGroups(initialQuery)
            .flat()
            .filter((term) => term.length > 0)
        : [],
    [initialQuery],
  );
  const searchPreviewTerms = activeSearchTerms.slice(0, 2);
  const hiddenPatternPreview = initialHideKw.slice(0, 2);
  const hasActiveUrlFilters =
    activeSearchTerms.length > 0 || initialHideSubIds.length > 0 || initialHideKw.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="text-[12px] text-muted">
          Total: <span className="font-mono text-cream">{totalUrls.toLocaleString()}</span> · Page{" "}
          <span className="font-mono text-cream">{currentPage.toLocaleString()}</span>/
          <span className="font-mono text-cream">{totalPages.toLocaleString()}</span>
        </div>
        <div className="flex flex-wrap items-start gap-2 lg:justify-end">
          <UrlSearchBar
            ref={searchRef}
            hrefContext={hrefContext}
            preserve={preserve}
            initialQuery={initialQuery}
          />
          <UrlExcludeBar
            ref={hideRef}
            hrefContext={hrefContext}
            preserve={preserve}
            initialHideSubIds={initialHideSubIds}
            initialHideKw={initialHideKw}
            subdomainOptions={subdomainOptions}
            resolvedHiddenSubdomains={resolvedHiddenSubdomains}
          />
        </div>
      </div>

      {hasActiveUrlFilters && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line/60 pt-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
            Active filters
          </span>

          {activeSearchTerms.length > 0 && (
            <>
              <SummaryChip
                label={`Search · ${activeSearchTerms.length} term${activeSearchTerms.length === 1 ? "" : "s"}`}
                tone="search"
                onClick={() => searchRef.current?.openBuilder()}
                title="Open advanced search builder"
              />
              {searchPreviewTerms.map((term, idx) => (
                <SummaryChip
                  key={`search-term-${idx}-${term}`}
                  label={term}
                  onClick={() => searchRef.current?.openBuilder()}
                  title={term}
                />
              ))}
              {activeSearchTerms.length > searchPreviewTerms.length && (
                <SummaryChip
                  label={`+${activeSearchTerms.length - searchPreviewTerms.length} more`}
                  onClick={() => searchRef.current?.openBuilder()}
                  title="View all search terms"
                />
              )}
            </>
          )}

          {initialHideSubIds.length > 0 && (
            <SummaryChip
              label={`Hidden hosts · ${initialHideSubIds.length}`}
              tone="hide"
              onClick={() => hideRef.current?.openModal()}
              title="Open hide URLs builder"
            />
          )}

          {initialHideKw.length > 0 && (
            <>
              <SummaryChip
                label={`Hidden patterns · ${initialHideKw.length}`}
                tone="hide"
                onClick={() => hideRef.current?.openModal()}
                title="Open hide URLs builder"
              />
              {hiddenPatternPreview.map((term, idx) => (
                <SummaryChip
                  key={`hidden-pattern-${idx}-${term}`}
                  label={term}
                  onClick={() => hideRef.current?.openModal()}
                  title={term}
                />
              ))}
              {initialHideKw.length > hiddenPatternPreview.length && (
                <SummaryChip
                  label={`+${initialHideKw.length - hiddenPatternPreview.length} more`}
                  onClick={() => hideRef.current?.openModal()}
                  title="View all hidden patterns"
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
