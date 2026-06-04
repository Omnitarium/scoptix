"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Delete Target button with confirmation.
 * Calls DELETE /api/targets/[id] which will:
 * 1. Cancel all active scans for this target
 * 2. Delete the target and all cascading data (subdomains, URLs, findings)
 */
const DEFAULT_CLASS =
  "rounded-xl border border-warn/40 bg-warn/10 px-4 py-2.5 text-[12px] font-semibold text-warn transition-colors hover:bg-warn/20 disabled:opacity-60";

export function DeleteTargetButton({
  targetId,
  targetName,
  className,
}: {
  targetId: string;
  targetName: string;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    const confirmed = confirm(
      `Are you sure you want to delete "${targetName}" and ALL its data?\n\n` +
      `This will permanently remove:\n` +
      `• All subdomains\n` +
      `• All discovered URLs\n` +
      `• All analysis findings\n` +
      `• All scan jobs\n\n` +
      `Active scans will be stopped automatically.\n\n` +
      `This action cannot be undone.`
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      const r = await fetch(`/api/targets/${targetId}`, { method: "DELETE" });
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        throw new Error(j?.error ?? `HTTP ${r.status}`);
      }
      router.push("/targets");
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={busy}
      className={className ?? DEFAULT_CLASS}
    >
      {busy ? "Deleting…" : "Delete Target"}
    </button>
  );
}
