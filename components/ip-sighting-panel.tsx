"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { IconServer, IconX } from "@/components/ui-icons";

export type IpSightingPanelProps = {
  ipResolutionId: string | null;
  onClose: () => void;
};

type SightingData = {
  hostnameNormalized: string;
  lastResolvedAt: string;
};

export function IpSightingPanel({ ipResolutionId, onClose }: IpSightingPanelProps) {
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<{ ipAddress: string; sightings: SightingData[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!ipResolutionId) {
      setData(null);
      return;
    }
    let ignore = false;
    setLoading(true);
    setError(null);

    fetch(`/api/ip-resolutions/${ipResolutionId}/sightings`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch sightings");
        return res.json();
      })
      .then((json) => {
        if (!ignore) {
          setData(json);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [ipResolutionId]);

  if (!ipResolutionId || !mounted) return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[90] bg-void/60"
        aria-hidden
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 z-[100] flex w-full max-w-sm flex-col border-l border-line bg-lift shadow-lift sm:w-96">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500 ring-1 ring-inset ring-emerald-500/20">
              <IconServer className="size-4" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-[13px] font-semibold text-cream">
                {data?.ipAddress || "Loading IP..."}
              </h2>
              <p className="text-[11px] text-muted">Host Sightings</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex size-7 shrink-0 items-center justify-center rounded hover:bg-white/5 text-muted hover:text-cream transition-colors"
          >
            <IconX className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-r-transparent" />
            </div>
          ) : error ? (
            <div className="rounded border border-red-500/20 bg-red-500/10 p-3 text-[12px] text-red-400">
              {error}
            </div>
          ) : data?.sightings.length === 0 ? (
            <p className="text-[12px] text-muted text-center py-10">No sightings found.</p>
          ) : (
            <div className="space-y-3">
              {data?.sightings.map((s, i) => (
                <div key={i} className="rounded border border-line bg-white/[0.02] p-3">
                  <div className="text-[12px] font-medium text-cream break-all mb-1">
                    {s.hostnameNormalized}
                  </div>
                  <div className="text-[10px] text-muted flex items-center justify-between">
                    <span>Last Resolved</span>
                    <span>{new Date(s.lastResolvedAt).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
