"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { IconPencil, IconTrash } from "@/components/nav-icons";
import { PER_KEY_MONTHLY, PER_KEY_PER_DAY } from "@/lib/quota-constants";

type KeyRow = {
  id: string;
  label: string;
  provider: string;
  proxyUrl: string | null;
  usageCount: number;
  usageCountWeekly: number;
  usageCountMonthly: number;
  isDisabled: boolean;
  lastUsedAt: string | null;
};

type CatRow = {
  id: number;
  slug: string;
  displayName: string;
  suffixRules: { id: number; suffix: string }[];
};

type SettingsTab = "keys" | "extensions";

const SCAN_ENGINE_OPTIONS = [
  {
    id: "VIRUSTOTAL",
    label: "VirusTotal",
    description: "URL intelligence and passive DNS via your API keys below.",
  },
  {
    id: "WAYBACK_MACHINE",
    label: "Wayback Machine",
    description: "Historical URLs from Internet Archive crawls during scans.",
  },
] as const;

const settingsPrimaryButtonClass =
  "shadow-clay mt-4 w-full rounded-xl bg-gradient-to-r from-accent to-accent-dim px-4 py-3 text-[13px] font-semibold text-void disabled:opacity-60";

/** Valid `tab` query values for `/settings`. */
export const SETTINGS_TAB_QUERY = {
  network: "network",
  extensions: "extensions",
  /** @deprecated Use `network`; kept so old links still open API & network. */
  engines: "engines",
} as const;

export function SettingsClient() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: SettingsTab =
    tabParam === SETTINGS_TAB_QUERY.extensions ? "extensions" : "keys";
  const [proxyUrl, setProxyUrl] = useState("");
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [cats, setCats] = useState<CatRow[]>([]);
  const [activeEngines, setActiveEngines] = useState<string[]>([]);
  const [draftEngines, setDraftEngines] = useState<string[]>([]);
  const [enginesErr, setEnginesErr] = useState<string | null>(null);
  const [label, setLabel] = useState("VT key");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [keysErr, setKeysErr] = useState<string | null>(null);
  const [extErr, setExtErr] = useState<string | null>(null);
  const [newCatDisplay, setNewCatDisplay] = useState("");
  const [newCatSlug, setNewCatSlug] = useState("");
  const [suffixInputs, setSuffixInputs] = useState<Record<number, string>>({});
  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [editCatDisplay, setEditCatDisplay] = useState("");
  const [editCatSlug, setEditCatSlug] = useState("");

  async function refresh() {
    setKeysErr(null);
    setExtErr(null);
    const [p, k, e, ae] = await Promise.all([
      fetch("/api/settings/proxy", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/settings/api-keys", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/settings/extensions", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/settings/engines", { cache: "no-store" }).then((r) => r.json()),
    ]);
    setProxyUrl((p.globalProxyUrl as string | null) ?? "");
    setKeys(k.keys as KeyRow[]);
    setCats(e.categories as CatRow[]);
    const engines = ae.activeEngines as string[];
    setActiveEngines(engines);
    setDraftEngines(engines);
    setEnginesErr(null);
  }

  useEffect(() => {
    void refresh();
  }, []);

  const canAdd = useMemo(() => label.trim().length > 0 && secret.trim().length >= 16 && !busy, [label, secret, busy]);

  async function saveProxy() {
    setBusy(true);
    setKeysErr(null);
    try {
      const r = await fetch("/api/settings/proxy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: proxyUrl.trim() ? proxyUrl.trim() : null }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      await refresh();
    } catch (e) {
      setKeysErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function addKey() {
    setBusy(true);
    setKeysErr(null);
    try {
      const r = await fetch("/api/settings/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label, secret }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      setSecret("");
      await refresh();
    } catch (e) {
      setKeysErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggleDisabled(id: string, isDisabled: boolean) {
    setBusy(true);
    setKeysErr(null);
    try {
      const r = await fetch(`/api/settings/api-keys/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isDisabled: !isDisabled }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      void j;
      await refresh();
    } catch (e) {
      setKeysErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteKey(id: string) {
    if (!confirm("Delete API key?")) return;
    setBusy(true);
    setKeysErr(null);
    try {
      const r = await fetch(`/api/settings/api-keys/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await refresh();
    } catch (e) {
      setKeysErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const enginesDirty = useMemo(() => {
    if (draftEngines.length !== activeEngines.length) return true;
    const saved = [...activeEngines].sort();
    const draft = [...draftEngines].sort();
    return draft.some((engine, index) => engine !== saved[index]);
  }, [activeEngines, draftEngines]);

  const canSaveEngines = useMemo(
    () => enginesDirty && draftEngines.length > 0 && !busy,
    [enginesDirty, draftEngines.length, busy],
  );

  function toggleEngineDraft(engine: string) {
    setEnginesErr(null);
    setDraftEngines((prev) => {
      if (prev.includes(engine)) {
        const next = prev.filter((e) => e !== engine);
        if (next.length === 0) {
          setEnginesErr("At least one engine must stay enabled.");
          return prev;
        }
        return next;
      }
      return [...prev, engine];
    });
  }

  async function saveEngines() {
    if (draftEngines.length === 0) {
      setEnginesErr("At least one engine must stay enabled.");
      return;
    }

    setBusy(true);
    setEnginesErr(null);
    try {
      const r = await fetch("/api/settings/engines", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activeEngines: draftEngines }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) {
        throw new Error(
          typeof j?.error === "string" ? j.error : "Failed to save engines",
        );
      }
      await refresh();
    } catch (e) {
      setEnginesErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const canAddCategory = useMemo(
    () => newCatDisplay.trim().length > 0 && newCatSlug.trim().length > 0 && !busy,
    [newCatDisplay, newCatSlug, busy],
  );

  async function addCategory() {
    setBusy(true);
    setExtErr(null);
    try {
      const r = await fetch("/api/settings/extensions/categories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: newCatDisplay.trim(),
          slug: newCatSlug.trim().toLowerCase(),
        }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      setNewCatDisplay("");
      setNewCatSlug("");
      await refresh();
    } catch (e) {
      setExtErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function addSuffix(categoryId: number) {
    const raw = (suffixInputs[categoryId] ?? "").trim();
    if (!raw) return;
    setBusy(true);
    setExtErr(null);
    try {
      const r = await fetch("/api/settings/extensions/suffixes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ categoryId, suffix: raw }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      setSuffixInputs((m) => ({ ...m, [categoryId]: "" }));
      await refresh();
    } catch (e) {
      setExtErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  function startEditCategory(c: CatRow) {
    setEditingCatId(c.id);
    setEditCatDisplay(c.displayName);
    setEditCatSlug(c.slug);
    setExtErr(null);
  }

  function cancelEditCategory() {
    setEditingCatId(null);
    setEditCatDisplay("");
    setEditCatSlug("");
  }

  async function saveEditCategory(id: number) {
    const displayName = editCatDisplay.trim();
    const slug = editCatSlug.trim().toLowerCase();
    if (!displayName) {
      setExtErr("Display name is required");
      return;
    }
    if (!slug) {
      setExtErr("Slug is required");
      return;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      setExtErr("Slug: lowercase letters, numbers, hyphens only");
      return;
    }

    setBusy(true);
    setExtErr(null);
    try {
      const r = await fetch(`/api/settings/extensions/categories/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName, slug }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      void j;
      cancelEditCategory();
      await refresh();
    } catch (e) {
      setExtErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteCategory(id: number, displayName: string) {
    if (
      !confirm(
        `Delete category "${displayName}"? Its suffix rules will be removed. URLs already tagged will become uncategorized.`,
      )
    )
      return;
    setBusy(true);
    setExtErr(null);
    try {
      const r = await fetch(`/api/settings/extensions/categories/${id}`, { method: "DELETE" });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      void j;
      if (editingCatId === id) cancelEditCategory();
      await refresh();
    } catch (e) {
      setExtErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSuffixRule(ruleId: number) {
    if (!confirm("Remove this extension mapping?")) return;
    setBusy(true);
    setExtErr(null);
    try {
      const r = await fetch(`/api/settings/extensions/suffixes/${ruleId}`, { method: "DELETE" });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      void j;
      await refresh();
    } catch (e) {
      setExtErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div
        className="settings-tablist mb-8 flex flex-wrap gap-2 rounded-2xl border border-line p-1.5"
        role="tablist"
        aria-label="Settings sections"
      >
        <Link
          href={`/settings?tab=${SETTINGS_TAB_QUERY.network}`}
          scroll={false}
          role="tab"
          aria-selected={tab === "keys"}
          id="settings-tab-keys"
          aria-controls="settings-panel-keys"
          className={[
            "rounded-xl px-4 py-2.5 text-left text-[13px] font-medium transition-colors",
            tab === "keys"
              ? "bg-accent/15 text-cream shadow-glass ring-1 ring-accent/25"
              : "text-muted hover:bg-[var(--nav-hover-bg)] hover:text-cream",
          ].join(" ")}
        >
          API &amp; Network
        </Link>
        <Link
          href={`/settings?tab=${SETTINGS_TAB_QUERY.extensions}`}
          scroll={false}
          role="tab"
          aria-selected={tab === "extensions"}
          id="settings-tab-extensions"
          aria-controls="settings-panel-extensions"
          className={[
            "rounded-xl px-4 py-2.5 text-left text-[13px] font-medium transition-colors",
            tab === "extensions"
              ? "bg-accent/15 text-cream shadow-glass ring-1 ring-accent/25"
              : "text-muted hover:bg-[var(--nav-hover-bg)] hover:text-cream",
          ].join(" ")}
        >
          Extension Categories
        </Link>
      </div>

      {tab === "keys" ? (
        <div
          id="settings-panel-keys"
          role="tabpanel"
          aria-labelledby="settings-tab-keys"
          className="grid grid-cols-1 gap-6 lg:grid-cols-12"
        >
          <div className="glass-panel rounded-2xl p-6 lg:col-span-12">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-xl">
                <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-accent">
                  Scan engines
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-muted">
                  Choose which data sources run for new scans. Enabled engines execute in sequence
                  for each target.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void saveEngines()}
                disabled={!canSaveEngines}
                className="shrink-0 rounded-xl border border-line px-5 py-2.5 text-[13px] font-medium text-cream transition-colors hover:bg-[var(--nav-hover-bg)] disabled:cursor-not-allowed disabled:opacity-50 lg:mt-1"
              >
                Save engines
              </button>
            </div>

            {enginesErr ? (
              <div className="mt-4 rounded-xl border border-warn/30 bg-warn/5 px-4 py-3 text-[12px] text-warn">
                {enginesErr}
              </div>
            ) : null}

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {SCAN_ENGINE_OPTIONS.map((engine) => {
                const selected = draftEngines.includes(engine.id);

                return (
                  <button
                    key={engine.id}
                    type="button"
                    onClick={() => toggleEngineDraft(engine.id)}
                    disabled={busy}
                    aria-pressed={selected}
                    className={[
                      "group rounded-xl border p-4 text-left transition-colors disabled:opacity-60",
                      selected
                        ? "border-accent/40 bg-accent/10 ring-1 ring-accent/25"
                        : "border-line bg-[var(--tab-bg)] hover:border-line/80 hover:bg-[var(--nav-hover-bg)]",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-cream">
                          {engine.label}
                        </div>
                        <p className="mt-1.5 text-[12px] leading-snug text-muted">
                          {engine.description}
                        </p>
                      </div>
                      <span
                        className={[
                          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border text-[10px] font-bold transition-colors",
                          selected
                            ? "border-accent/50 bg-accent/20 text-accent"
                            : "border-line bg-[var(--tab-bg)] text-transparent group-hover:border-muted/40",
                        ].join(" ")}
                        aria-hidden
                      >
                        ✓
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {enginesDirty ? (
              <p className="mt-4 text-[11px] text-muted">
                Unsaved changes — click Save engines to apply.
              </p>
            ) : null}
          </div>

          <div className="glass-panel rounded-2xl p-6 lg:col-span-5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-accent">Global proxy</div>
            <div className="mt-2 text-[13px] text-muted">Example: `socks5://127.0.0.1:9050`</div>
            <div className="mt-4">
              <input
                value={proxyUrl}
                onChange={(e) => setProxyUrl(e.target.value)}
                placeholder="socks5://tor:9050"
                className="settings-input-field w-full rounded-xl border border-line px-4 py-3 font-mono text-[13px] text-cream placeholder:text-muted outline-none focus:ring-2 focus:ring-accent/30"
              />
            </div>
            <button
              type="button"
              onClick={() => void saveProxy()}
              disabled={busy}
              className={settingsPrimaryButtonClass}
            >
              Save proxy
            </button>
          </div>


          <div className="glass-panel rounded-2xl p-6 lg:col-span-7">
            <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-accent">VirusTotal API keys</div>
            <div className="mt-2 text-[13px] text-muted">
              Secrets are stored encrypted (`APP_ENCRYPTION_KEY`). The rotator supports up to ~15 keys.
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wider text-muted">Label</div>
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="settings-input-field mt-2 w-full rounded-xl border border-line px-4 py-3 text-[13px] text-cream outline-none focus:ring-2 focus:ring-accent/30"
                />
              </div>
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wider text-muted">Secret</div>
                <input
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  type="password"
                  className="settings-input-field mt-2 w-full rounded-xl border border-line px-4 py-3 font-mono text-[12px] text-cream outline-none focus:ring-2 focus:ring-accent/30"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (!canAdd) return;
                void addKey();
              }}
              disabled={busy}
              aria-disabled={!canAdd}
              className={[
                settingsPrimaryButtonClass,
                !canAdd && !busy ? "cursor-not-allowed" : "",
              ].join(" ")}
            >
              Add key
            </button>

            {keysErr ? <div className="mt-4 text-[12px] text-warn">{keysErr}</div> : null}
          </div>

          <div className="glass-panel overflow-hidden rounded-2xl lg:col-span-12">
            <div className="border-b border-line bg-[var(--table-header-bg)] px-5 py-4">
              <div className="text-[13px] font-semibold text-cream">Keys</div>
              <div className="mt-1 text-[12px] text-muted">
                Usage counters persist in the database (UTC day, ISO week, calendar month). Daily cap
                enforcement runs in the worker plus Redis rate gates.
              </div>
            </div>

            <div className="divide-y divide-line">
              {keys.length === 0 ? (
                <div className="px-5 py-6 text-[13px] text-muted">No keys yet.</div>
              ) : (
                keys.map((k) => (
                  <div key={k.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                    <div className="min-w-0">
                      <div className="font-mono text-[12px] text-cream">{k.label}</div>
                      <div className="mt-1 text-[11px] text-muted">
                        {k.provider} · {k.isDisabled ? "disabled" : "active"}
                        {k.lastUsedAt ? ` · last used ${new Date(k.lastUsedAt).toLocaleString()}` : ""}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="api-key-usage-pill">
                          today {k.usageCount.toLocaleString()}/{PER_KEY_PER_DAY.toLocaleString()}
                        </span>
                        <span className="api-key-usage-pill">
                          week {k.usageCountWeekly.toLocaleString()}
                        </span>
                        <span className="api-key-usage-pill">
                          month {k.usageCountMonthly.toLocaleString()}/
                          {PER_KEY_MONTHLY.toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void toggleDisabled(k.id, k.isDisabled)}
                        disabled={busy}
                        className={[
                          "rounded-xl border px-3 py-2 text-[12px] font-medium transition-colors disabled:opacity-60",
                          k.isDisabled
                            ? "border-accent/35 bg-accent/10 text-accent hover:bg-accent/18"
                            : "border-warn/35 bg-warn/8 text-warn hover:bg-warn/14",
                        ].join(" ")}
                      >
                        {k.isDisabled ? "Enable" : "Disable"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteKey(k.id)}
                        className="rounded-xl border border-line px-3 py-2 text-[12px] text-muted hover:bg-[var(--nav-hover-bg)] hover:text-cream"
                        disabled={busy}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        <div
          id="settings-panel-extensions"
          role="tabpanel"
          aria-labelledby="settings-tab-extensions"
          className="glass-panel rounded-2xl p-6"
        >
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">Extension mapping</div>
          <div className="mt-2 max-w-3xl text-[13px] text-muted">
            New URLs from scans are tagged by pathname extension using these rules. Slug must be lowercase (e.g.{" "}
            <span className="font-mono text-cream/80">archive</span>). Categories are listed A–Z by display name.
          </div>

          {extErr ? <div className="mt-4 text-[12px] text-warn">{extErr}</div> : null}

          <div className="extension-add-category-panel mt-6">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Add category</div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Display name</div>
                <input
                  value={newCatDisplay}
                  onChange={(e) => setNewCatDisplay(e.target.value)}
                  placeholder="Archives"
                  className="extension-input-field mt-2 w-full rounded-xl px-4 py-3 text-[13px]"
                />
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Slug</div>
                <input
                  value={newCatSlug}
                  onChange={(e) => setNewCatSlug(e.target.value)}
                  placeholder="archive"
                  className="extension-input-field mt-2 w-full rounded-xl px-4 py-3 font-mono text-[12px]"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => void addCategory()}
              disabled={!canAddCategory}
              className="shadow-clay mt-4 rounded-xl bg-gradient-to-r from-accent to-accent-dim px-6 py-3 text-[13px] font-semibold text-void disabled:opacity-60"
            >
              Add category
            </button>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
            {cats.map((c) => (
              <div key={c.id} className="extension-category-card group relative flex flex-col">
                <div className="flex items-start justify-between gap-3">
                  {editingCatId === c.id ? (
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Display name</div>
                          <input
                            value={editCatDisplay}
                            onChange={(e) => setEditCatDisplay(e.target.value)}
                            className="extension-input-field mt-2 w-full rounded-xl px-3 py-2.5 text-[13px]"
                            disabled={busy}
                          />
                        </div>
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Slug</div>
                          <input
                            value={editCatSlug}
                            onChange={(e) => setEditCatSlug(e.target.value)}
                            className="extension-input-field mt-2 w-full rounded-xl px-3 py-2.5 font-mono text-[12px]"
                            disabled={busy}
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void saveEditCategory(c.id)}
                          disabled={busy}
                          className="rounded-xl border border-line bg-white/[0.06] px-4 py-2 text-[12px] font-semibold text-cream hover:bg-[var(--nav-hover-bg)] disabled:opacity-60"
                        >
                          Save changes
                        </button>
                        <button
                          type="button"
                          onClick={() => cancelEditCategory()}
                          disabled={busy}
                          className="rounded-xl border border-line px-4 py-2 text-[12px] font-medium text-muted hover:bg-[var(--nav-hover-bg)] hover:text-cream disabled:opacity-60"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold tracking-tight text-cream">{c.displayName}</h3>
                          <span className="shrink-0 rounded-md bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-accent">
                            {c.slug}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-0.5">
                        <button
                          type="button"
                          onClick={() => startEditCategory(c)}
                          disabled={busy}
                          aria-label="Edit category"
                          title="Edit category"
                          className="rounded-lg border border-line p-1.5 text-muted hover:bg-[var(--nav-hover-bg)] hover:text-cream disabled:opacity-50"
                        >
                          <IconPencil className="size-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteCategory(c.id, c.displayName)}
                          disabled={busy}
                          aria-label="Delete category"
                          title="Delete category"
                          className="rounded-lg border border-line p-1.5 text-muted hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                        >
                          <IconTrash className="size-3" />
                        </button>
                      </div>
                    </>
                  )}
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  {c.suffixRules.map((s) => (
                    <span key={s.id} className="extension-suffix-pill">
                      <span className="font-mono tabular-nums">{s.suffix}</span>
                      <button
                        type="button"
                        title="Remove mapping"
                        onClick={() => void deleteSuffixRule(s.id)}
                        disabled={busy}
                        className="extension-suffix-pill-remove disabled:opacity-50"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-2">
                  <input
                    value={suffixInputs[c.id] ?? ""}
                    onChange={(e) => setSuffixInputs((m) => ({ ...m, [c.id]: e.target.value }))}
                    placeholder=".zip or zip"
                    className="extension-input-field min-w-[140px] flex-1 rounded-xl px-3 py-2 font-mono text-[12px]"
                    disabled={busy}
                  />
                  <button
                    type="button"
                    onClick={() => void addSuffix(c.id)}
                    disabled={busy || !(suffixInputs[c.id] ?? "").trim()}
                    className="extension-suffix-add-btn disabled:opacity-60"
                  >
                    Add suffix
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
