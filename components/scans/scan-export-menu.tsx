"use client";

import { useEffect, useId, useRef, useState } from "react";
import { IconChevronDown, IconDownload } from "@/components/ui-icons";
import type { ObservedAvailability } from "@/lib/scan-observed";
import type { ScanExportType } from "@/lib/scan-export";

type ExportOption = {
  type: ScanExportType;
  label: string;
  description: string;
  disabled?: boolean;
  disabledReason?: string;
};

export function ScanExportMenu({
  scanId,
  availability,
}: {
  scanId: string;
  availability: ObservedAvailability;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const options: ExportOption[] = [
    {
      type: "findings",
      label: "Findings",
      description: "CSV with finding type, source, URL, and snippet",
    },
    {
      type: "subdomains",
      label: "Subdomains",
      description: "CSV with hostnames observed in this scan",
      disabled: availability.subdomains !== "ready",
      disabledReason: "Unavailable for legacy scans",
    },
    {
      type: "urls",
      label: "URLs",
      description: "CSV with URLs observed in this scan",
      disabled: availability.urls !== "ready",
      disabledReason: "Unavailable for legacy scans",
    },
    {
      type: "ips",
      label: "IP Resolutions",
      description: "CSV with IP addresses observed in this scan",
      disabled: availability.ips !== "ready",
      disabledReason: "Unavailable for legacy scans",
    },
    {
      type: "all",
      label: "All (ZIP)",
      description: "ZIP containing every available CSV export",
    },
  ];

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function hrefFor(type: ScanExportType) {
    return `/api/scans/${scanId}/export?type=${type}`;
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-cream transition hover:bg-[var(--nav-hover-bg)]"
      >
        <IconDownload className="mr-1.5 size-3.5" />
        Export
        <IconChevronDown
          className={["ml-1.5 size-3.5 text-muted transition-transform", open ? "rotate-180" : ""].join(" ")}
        />
      </button>

      {open ? (
        <ul
          id={listId}
          role="menu"
          className="dashboard-range-menu absolute right-0 top-full z-20 mt-1.5 min-w-[15rem] overflow-hidden rounded-lg border border-line py-0.5 shadow-lift"
        >
          {options.map((option) => (
            <li key={option.type} role="none">
              {option.disabled ? (
                <div
                  role="menuitem"
                  aria-disabled="true"
                  title={option.disabledReason}
                  className="cursor-not-allowed px-3 py-2 opacity-50"
                >
                  <div className="text-[12px] font-medium text-muted">{option.label}</div>
                  <div className="mt-0.5 text-[11px] text-muted">{option.disabledReason}</div>
                </div>
              ) : (
                <a
                  role="menuitem"
                  href={hrefFor(option.type)}
                  download
                  onClick={() => setOpen(false)}
                  className="block px-3 py-2 transition-colors hover:bg-[var(--nav-hover-bg)]"
                >
                  <div className="text-[12px] font-medium text-cream">{option.label}</div>
                  <div className="mt-0.5 text-[11px] text-muted">{option.description}</div>
                </a>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
