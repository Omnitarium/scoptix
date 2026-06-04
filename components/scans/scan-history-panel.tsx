"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState } from "react";
import { IconAlertTriangle, IconTrash } from "@/components/ui-icons";

export type ScanHistoryRow = {
  id: string;
  targetDomain: string;
  status: string;
  statusClassName: string;
  phase: string;
  progressLabel: string;
  findingsCount: string;
  finishedLabel: string;
  createdLabel: string;
  href: string;
};

const STATUS_BOX_CLASS =
  "inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-normal";

const SCAN_HISTORY_TABLE_GRID_CLASS =
  "lg:grid-cols-[2.25rem_minmax(0,1.25fr)_minmax(8rem,max-content)_minmax(0,7.75rem)_minmax(7rem,0.85fr)_5rem_minmax(6.5rem,1fr)_minmax(6.5rem,1fr)_2.5rem]";

const STATUS_COL_CLASS = "justify-self-start";

type PendingDelete = {
  ids: string[];
  items: Array<{ id: string; label: string }>;
};

export function ScanHistoryPanel({ scans }: { scans: ScanHistoryRow[] }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected = scans.length > 0 && selectedIds.length === scans.length;

  function toggleOne(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  function toggleAll() {
    setSelectedIds(allSelected ? [] : scans.map((scan) => scan.id));
  }

  function openDeleteDialog(ids: string[]) {
    const items = scans
      .filter((scan) => ids.includes(scan.id))
      .map((scan) => ({ id: scan.id, label: scan.targetDomain }));
    setError(null);
    setPendingDelete({ ids, items });
    dialogRef.current?.showModal();
  }

  function closeDeleteDialog(force = false) {
    if (busy && !force) return;
    setPendingDelete(null);
    setError(null);
    dialogRef.current?.close();
  }

  async function confirmDelete() {
    if (!pendingDelete || pendingDelete.ids.length === 0) return;

    setBusy(true);
    setError(null);
    try {
      const response =
        pendingDelete.ids.length === 1
          ? await fetch(`/api/scans/${pendingDelete.ids[0]}`, { method: "DELETE" })
          : await fetch("/api/scans/delete", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ids: pendingDelete.ids }),
            });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? `HTTP ${response.status}`);
      }

      setSelectedIds((current) =>
        current.filter((id) => !pendingDelete.ids.includes(id)),
      );
      closeDeleteDialog(true);
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  const deleteCount = pendingDelete?.ids.length ?? 0;
  const deleteTitle =
    deleteCount === 1 ? "Delete this scan?" : `Delete ${deleteCount} scans?`;

  return (
    <>
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-[var(--table-header-bg)] px-5 py-3">
          <div className="text-[12px] text-muted">
            {selectedIds.length.toLocaleString()} selected
          </div>
          <button
            type="button"
            onClick={() => openDeleteDialog(selectedIds)}
            className="inline-flex items-center rounded-lg border border-warn/40 bg-warn/10 px-3 py-1.5 text-[12px] font-medium text-warn transition-colors hover:bg-warn/20"
          >
            <IconTrash className="mr-1.5 size-3.5" />
            Delete selected
          </button>
        </div>
      )}

      <div className="divide-y divide-line lg:hidden">
        {scans.map((scan) => {
          const checked = selectedSet.has(scan.id);
          return (
            <div key={scan.id} className="flex gap-3 px-5 py-4">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleOne(scan.id)}
                aria-label={`Select scan for ${scan.targetDomain}`}
                className="mt-1 size-4 shrink-0 accent-accent"
              />
              <div className="min-w-0 flex-1">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <Link
                    href={scan.href}
                    className="min-w-0 flex-1 transition-colors hover:text-accent"
                  >
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
                      Target
                    </div>
                    <div className="truncate font-mono text-[12px] text-cream">
                      {scan.targetDomain}
                    </div>
                  </Link>
                  <button
                    type="button"
                    onClick={() => openDeleteDialog([scan.id])}
                    className="rounded-lg border border-line p-2 text-muted transition-colors hover:border-warn/40 hover:bg-warn/10 hover:text-warn"
                    aria-label={`Delete scan for ${scan.targetDomain}`}
                  >
                    <IconTrash className="size-3.5" />
                  </button>
                </div>
                <Link href={scan.href} className="block space-y-2">
                  <div>
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
                      Status
                    </div>
                    <span
                      className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${scan.statusClassName}`}
                    >
                      {scan.status}
                    </span>
                  </div>
                  <div className="font-mono text-[11px] text-muted">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
                      Phase
                    </div>
                    {scan.phase}
                  </div>
                  <div className="font-mono text-[11px] tabular-nums text-muted">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
                      URLs
                    </div>
                    {scan.progressLabel}
                  </div>
                  <div className="font-mono text-[11px] tabular-nums text-muted">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
                      Findings
                    </div>
                    {scan.findingsCount}
                  </div>
                  <div className="font-mono text-[11px] tabular-nums text-muted">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
                      Finished
                    </div>
                    {scan.finishedLabel}
                  </div>
                  <div className="font-mono text-[11px] tabular-nums text-muted">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
                      Created
                    </div>
                    {scan.createdLabel}
                  </div>
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      <div className={`hidden lg:grid ${SCAN_HISTORY_TABLE_GRID_CLASS} lg:gap-x-3 lg:px-5`}>
        <div className="col-span-full grid grid-cols-subgrid gap-x-3 border-b border-line bg-[var(--table-header-bg)] py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
          <div className="flex items-center">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              aria-label="Select all scans"
              className="size-3.5 accent-accent"
            />
          </div>
          <div className="min-w-0 truncate">Target</div>
          <div className={STATUS_COL_CLASS}>
            <span className={`${STATUS_BOX_CLASS} text-muted`}>Status</span>
          </div>
          <div className="min-w-0 truncate">Phase</div>
          <div className="tabular-nums">URLs</div>
          <div className="tabular-nums">Findings</div>
          <div className="tabular-nums">Finished</div>
          <div className="tabular-nums">Created</div>
          <div aria-hidden />
        </div>

        {scans.map((scan) => {
          const checked = selectedSet.has(scan.id);
          return (
            <div
              key={scan.id}
              className="col-span-full grid grid-cols-subgrid items-center gap-x-3 border-b border-line py-3 last:border-b-0"
            >
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleOne(scan.id)}
                  aria-label={`Select scan for ${scan.targetDomain}`}
                  className="size-3.5 accent-accent"
                />
              </div>
              <Link
                href={scan.href}
                className="min-w-0 truncate font-mono text-[12px] text-cream transition-colors hover:text-accent"
              >
                {scan.targetDomain}
              </Link>
              <div className={STATUS_COL_CLASS}>
                <span className={`${STATUS_BOX_CLASS} ${scan.statusClassName}`}>
                  {scan.status}
                </span>
              </div>
              <Link
                href={scan.href}
                className="min-w-0 truncate font-mono text-[11px] text-muted transition-colors hover:text-cream"
              >
                {scan.phase}
              </Link>
              <Link
                href={scan.href}
                className="font-mono text-[11px] tabular-nums text-muted transition-colors hover:text-cream"
              >
                {scan.progressLabel}
              </Link>
              <Link
                href={scan.href}
                className="font-mono text-[11px] tabular-nums text-muted transition-colors hover:text-cream"
              >
                {scan.findingsCount}
              </Link>
              <Link
                href={scan.href}
                className="font-mono text-[11px] tabular-nums text-muted transition-colors hover:text-cream"
              >
                {scan.finishedLabel}
              </Link>
              <Link
                href={scan.href}
                className="font-mono text-[11px] tabular-nums text-muted transition-colors hover:text-cream"
              >
                {scan.createdLabel}
              </Link>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => openDeleteDialog([scan.id])}
                  className="rounded-lg border border-line p-1.5 text-muted transition-colors hover:border-warn/40 hover:bg-warn/10 hover:text-warn"
                  aria-label={`Delete scan for ${scan.targetDomain}`}
                >
                  <IconTrash className="size-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <dialog
        ref={dialogRef}
        onClose={() => {
          if (!busy) setPendingDelete(null);
        }}
        className="url-search-dialog w-[min(100%,480px)] max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-[var(--glass-panel-bg)] p-0 text-cream shadow-glass backdrop:bg-void/70"
        aria-labelledby={titleId}
      >
        <div className="border-b border-line px-5 py-4">
          <h2 id={titleId} className="flex items-center gap-2 text-[14px] font-semibold text-cream">
            <IconAlertTriangle className="size-4 text-warn" />
            {deleteTitle}
          </h2>
          <p className="mt-2 text-[12px] leading-relaxed text-muted">
            This permanently removes scan snapshots (observed subdomains and URLs) and findings
            recorded during {deleteCount === 1 ? "this scan" : "these scans"}. Target inventory
            (canonical subdomains and discovered URLs) is not deleted.
          </p>
          <p className="mt-2 text-[12px] font-medium text-warn">This action cannot be undone.</p>
        </div>

        {pendingDelete && pendingDelete.items.length > 0 && (
          <div className="max-h-40 overflow-y-auto border-b border-line px-5 py-3">
            <ul className="space-y-1 font-mono text-[11px] text-cream/90">
              {pendingDelete.items.slice(0, 8).map((item) => (
                <li key={item.id} className="truncate">
                  {item.label}
                </li>
              ))}
              {pendingDelete.items.length > 8 && (
                <li className="text-muted">
                  +{(pendingDelete.items.length - 8).toLocaleString()} more
                </li>
              )}
            </ul>
          </div>
        )}

        {error && (
          <div className="border-b border-line px-5 py-3 text-[12px] text-warn">{error}</div>
        )}

        <div className="flex justify-end gap-2 px-5 py-4">
          <button
            type="button"
            onClick={() => closeDeleteDialog()}
            disabled={busy}
            className="rounded-lg border border-line px-3 py-2 text-[12px] text-muted transition-colors hover:bg-[var(--nav-hover-bg)] hover:text-cream disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmDelete}
            disabled={busy}
            className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-[12px] font-semibold text-warn transition-colors hover:bg-warn/20 disabled:opacity-60"
          >
            {busy ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </dialog>
    </>
  );
}
