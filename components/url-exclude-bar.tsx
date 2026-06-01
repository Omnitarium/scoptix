"use client";

import { useRouter } from "next/navigation";
import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import {
  isUrlExcludeActive,
  normalizeExcludeKeywords,
} from "@/lib/url-exclude-query";
import { buildUrlsTabHref, type UrlTabHrefContext, type UrlTabPreserve } from "@/lib/url-tab-params";

export type SubdomainOption = {
  id: string;
  hostnameNormalized: string;
};

export type UrlExcludeBarHandle = {
  openModal: () => void;
};

function IconEyeOff({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7Z"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.75" />
      <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconX({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconPlus({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

const SUB_SUGGESTION_LIMIT = 8;

function matchSubdomains(
  options: SubdomainOption[],
  query: string,
  excludeIds: readonly string[],
): SubdomainOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return options
    .filter((s) => !excludeIds.includes(s.id) && s.hostnameNormalized.toLowerCase().includes(q))
    .slice(0, SUB_SUGGESTION_LIMIT);
}

function IconTrash({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 7h14M9 7V5h6v2M8 7l1 12h6l1-12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type UrlExcludeBarProps = {
  hrefContext: UrlTabHrefContext;
  preserve: UrlTabPreserve;
  initialHideSubIds: string[];
  initialHideKw: string[];
  subdomainOptions: SubdomainOption[];
  resolvedHiddenSubdomains: SubdomainOption[];
};

export const UrlExcludeBar = forwardRef<UrlExcludeBarHandle, UrlExcludeBarProps>(function UrlExcludeBar({
  hrefContext,
  preserve,
  initialHideSubIds,
  initialHideKw,
  subdomainOptions,
  resolvedHiddenSubdomains,
}, ref) {
  const router = useRouter();
  const dialogTitleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const [draftSubIds, setDraftSubIds] = useState(initialHideSubIds);
  const [draftKw, setDraftKw] = useState(initialHideKw);
  const [kwDraft, setKwDraft] = useState("");
  const [subQuery, setSubQuery] = useState("");
  const [subPickerOpen, setSubPickerOpen] = useState(false);
  const [subHighlight, setSubHighlight] = useState(0);
  const subInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraftSubIds(initialHideSubIds);
    setDraftKw(initialHideKw);
  }, [initialHideSubIds, initialHideKw]);

  const navigate = useCallback(
    (next: { hideSub: string[]; hideKw: string[] }) => {
      router.push(
        buildUrlsTabHref(hrefContext, {
          ...preserve,
          hideSub: next.hideSub,
          hideKw: next.hideKw,
          page: 1,
        }),
      );
    },
    [router, hrefContext, preserve],
  );

  function openModal() {
    setDraftSubIds(initialHideSubIds);
    setDraftKw(initialHideKw);
    setKwDraft("");
    setSubQuery("");
    setSubPickerOpen(false);
    setSubHighlight(0);
    setModalOpen(true);
    dialogRef.current?.showModal();
  }

  useImperativeHandle(ref, () => ({
    openModal,
  }));

  function closeModal() {
    setModalOpen(false);
    dialogRef.current?.close();
  }

  function handleApply() {
    const hideKw = normalizeExcludeKeywords(draftKw);
    const pickerIds = new Set(subdomainOptions.map((s) => s.id));
    const hideSub = draftSubIds.filter((id) => pickerIds.has(id));
    closeModal();
    navigate({ hideSub, hideKw });
  }

  function handleClearApplied() {
    setDraftSubIds([]);
    setDraftKw([]);
    navigate({ hideSub: [], hideKw: [] });
  }

  function handleResetDraft() {
    setDraftSubIds([]);
    setDraftKw([]);
    setKwDraft("");
    setSubQuery("");
    setSubPickerOpen(false);
    setSubHighlight(0);
  }

  function addSubdomainToDraft(sub: SubdomainOption) {
    if (draftSubIds.includes(sub.id)) return;
    setDraftSubIds([...draftSubIds, sub.id]);
    setSubQuery("");
    setSubPickerOpen(false);
    setSubHighlight(0);
  }

  function addKeywordToDraft(e: React.FormEvent) {
    e.preventDefault();
    const term = kwDraft.trim();
    if (term.length < 2) return;
    const next = normalizeExcludeKeywords([...draftKw, term]);
    if (next.length === draftKw.length) {
      setKwDraft("");
      return;
    }
    setDraftKw(next);
    setKwDraft("");
  }

  const hostById = new Map(subdomainOptions.map((s) => [s.id, s.hostnameNormalized]));
  const draftHiddenSubs = draftSubIds.map((id) => ({
    id,
    hostnameNormalized: hostById.get(id) ?? resolvedHiddenSubdomains.find((s) => s.id === id)?.hostnameNormalized ?? id.slice(0, 8),
  }));
  const subSuggestions = matchSubdomains(subdomainOptions, subQuery, draftSubIds);
  const showSubSuggestions = subPickerOpen && subQuery.trim().length > 0;

  function handleSubQueryChange(value: string) {
    setSubQuery(value);
    setSubPickerOpen(true);
    setSubHighlight(0);
  }

  function handleSubKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showSubSuggestions || subSuggestions.length === 0) {
      if (e.key === "Escape") setSubPickerOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSubHighlight((i) => (i + 1) % subSuggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSubHighlight((i) => (i - 1 + subSuggestions.length) % subSuggestions.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      addSubdomainToDraft(subSuggestions[subHighlight]);
    } else if (e.key === "Escape") {
      setSubPickerOpen(false);
    }
  }

  const excludeActive = isUrlExcludeActive(initialHideSubIds, initialHideKw);
  const kwTooShort = kwDraft.trim().length > 0 && kwDraft.trim().length < 2;

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={openModal}
          title="Hide URLs from results"
          aria-label="Open hide URLs builder"
          aria-expanded={modalOpen}
          className={[
            "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12px] font-medium transition-colors",
            excludeActive
              ? "border-warn/40 bg-warn/10 text-cream hover:bg-warn/15"
              : "border-line text-cream hover:bg-[var(--nav-hover-bg)]",
          ].join(" ")}
        >
          <IconEyeOff className={excludeActive ? "text-warn" : "text-muted"} />
          Hide
        </button>
        {excludeActive && (
          <button
            type="button"
            onClick={handleClearApplied}
            title="Clear all hides"
            aria-label="Clear all hides"
            className="rounded-lg border border-line p-2 text-muted transition-colors hover:border-warn/40 hover:bg-warn/10 hover:text-warn"
          >
            <IconX />
          </button>
        )}
      </div>

      <dialog
        ref={dialogRef}
        onClose={() => setModalOpen(false)}
        className="url-search-dialog w-[min(100%,440px)] max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-[var(--glass-panel-bg)] p-0 text-cream shadow-glass backdrop:bg-void/70"
        aria-labelledby={dialogTitleId}
      >
        <div className="border-b border-line px-5 py-4">
          <h2 id={dialogTitleId} className="flex items-center gap-2 text-[14px] font-semibold text-cream">
            <IconEyeOff className="text-warn/90" />
            Hide URLs from results
          </h2>
          <p className="mt-1 text-[11px] text-muted">
            Hide subdomains that have URLs in this target, or URL path patterns. Search filters are unchanged.
          </p>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="space-y-2">
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted">
              Subdomains
            </label>
            <div className="relative isolate z-20">
              <input
                ref={subInputRef}
                value={subQuery}
                onChange={(e) => handleSubQueryChange(e.target.value)}
                onFocus={() => subQuery.trim() && setSubPickerOpen(true)}
                onBlur={() => {
                  window.setTimeout(() => setSubPickerOpen(false), 120);
                }}
                onKeyDown={handleSubKeyDown}
                placeholder="Type hostname…"
                role="combobox"
                aria-label="Search subdomain to hide"
                aria-autocomplete="list"
                aria-expanded={showSubSuggestions && subSuggestions.length > 0}
                aria-controls="hide-sub-suggestions"
                className="ui-input-field relative z-10 w-full rounded-lg border border-line bg-lift px-3 py-2 text-[12px] text-cream outline-none placeholder:text-muted focus:ring-1 focus:ring-accent/30"
              />
              {showSubSuggestions && subSuggestions.length > 0 && (
                <ul
                  id="hide-sub-suggestions"
                  role="listbox"
                  className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-lg border border-line bg-panel py-1 shadow-lift ring-1 ring-line/60"
                >
                  {subSuggestions.map((s, idx) => (
                    <li key={s.id} role="option" aria-selected={idx === subHighlight}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => addSubdomainToDraft(s)}
                        className={[
                          "block w-full truncate px-3 py-2 text-left font-mono text-[12px] transition-colors",
                          idx === subHighlight
                            ? "bg-warn/20 text-cream"
                            : "text-cream hover:bg-lift",
                        ].join(" ")}
                      >
                        {s.hostnameNormalized}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {showSubSuggestions && subSuggestions.length === 0 && (
                <p className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-line bg-panel px-3 py-2 text-[10px] text-muted shadow-lift ring-1 ring-line/60">
                  No matching subdomains with URLs.
                </p>
              )}
            </div>
            {draftSubIds.length > 0 && (
              <ul className="relative z-0 space-y-1.5 border-t border-line/60 pt-3">
                {draftHiddenSubs.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-line bg-lift px-3 py-2"
                  >
                    <span className="truncate font-mono text-[12px] text-cream">{s.hostnameNormalized}</span>
                    <button
                      type="button"
                      onClick={() => setDraftSubIds(draftSubIds.filter((id) => id !== s.id))}
                      aria-label={`Remove ${s.hostnameNormalized} from hide list`}
                      className="shrink-0 rounded p-1 text-muted transition-colors hover:bg-warn/10 hover:text-warn"
                    >
                      <IconTrash />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form onSubmit={addKeywordToDraft} className="space-y-2">
            <label
              htmlFor="hide-kw-draft"
              className="block text-[10px] font-semibold uppercase tracking-wider text-muted"
            >
              URL contains
            </label>
            <div className="flex items-center gap-2">
              <input
                id="hide-kw-draft"
                value={kwDraft}
                onChange={(e) => setKwDraft(e.target.value)}
                placeholder="e.g. static, .woff2"
                className="ui-input-field min-w-0 flex-1 rounded-lg border border-line px-3 py-2 text-[12px] text-cream outline-none placeholder:text-muted focus:ring-1 focus:ring-accent/30"
              />
              <button
                type="submit"
                disabled={kwDraft.trim().length < 2}
                className="shrink-0 rounded-lg border border-line p-2 text-muted transition-colors hover:bg-[var(--nav-hover-bg)] hover:text-cream disabled:opacity-40"
                aria-label="Add URL pattern to hide list"
              >
                <IconPlus />
              </button>
            </div>
            {kwTooShort && (
              <p className="text-[10px] text-warn">Enter at least 2 characters for a hide pattern.</p>
            )}
            {draftKw.length > 0 && (
              <ul className="space-y-1.5">
                {draftKw.map((term) => (
                  <li
                    key={term}
                    className="flex items-center justify-between gap-2 rounded-lg border border-line bg-lift px-3 py-2"
                  >
                    <span className="truncate font-mono text-[12px] text-cream">{term}</span>
                    <button
                      type="button"
                      onClick={() => setDraftKw(draftKw.filter((k) => k !== term))}
                      aria-label={`Remove hide pattern ${term}`}
                      className="shrink-0 rounded p-1 text-muted transition-colors hover:bg-warn/10 hover:text-warn"
                    >
                      <IconTrash />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </form>
        </div>

        <div className="flex items-center gap-2 border-t border-line px-5 py-4">
          <button
            type="button"
            onClick={handleResetDraft}
            className="mr-auto text-[11px] text-muted transition-colors hover:text-cream"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={closeModal}
            className="rounded-lg border border-line px-3 py-2 text-[12px] text-muted transition-colors hover:bg-[var(--nav-hover-bg)] hover:text-cream"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="rounded-lg bg-warn/15 px-4 py-2 text-[12px] font-semibold text-cream ring-1 ring-warn/25 transition-colors hover:bg-warn/25"
          >
            Apply hides
          </button>
        </div>
      </dialog>
    </div>
  );
});
