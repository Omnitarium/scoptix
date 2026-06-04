import { DeleteTargetButton } from "@/components/delete-target-button";
import { TopBarControls } from "@/components/top-bar-controls";
import { IconArrowUpRight, IconGlobe } from "@/components/ui-icons";

type TargetDetailHeaderProps = {
  domain: string;
  updatedAt: string;
  scanCount: number;
  latestScanDuration: string;
  targetId: string;
};

export function TargetDetailHeader({
  domain,
  updatedAt,
  scanCount,
  latestScanDuration,
  targetId,
}: TargetDetailHeaderProps) {
  return (
    <header className="scx-scan-header shrink-0">
      <div className="flex items-stretch justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 text-[11px] font-bold text-muted">Global Target</div>
          <div className="mb-3 flex items-center gap-3">
            <h1 className="scx-scan-header-title truncate font-bold text-cream">{domain}</h1>
            <a
              href={`https://${domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-accent hover:text-accent-dim"
              aria-label={`Open ${domain}`}
            >
              <IconArrowUpRight className="size-5" />
            </a>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
            <span className="inline-flex items-center rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium uppercase text-accent-dim">
              <IconGlobe className="mr-1 size-3" />
              Global
            </span>
            <span>Updated {updatedAt}</span>
            <span aria-hidden>•</span>
            <span>
              Scans: {scanCount.toLocaleString()}
            </span>
            <span aria-hidden>•</span>
            <span>Latest scan: {latestScanDuration}</span>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end justify-between gap-2">
          <TopBarControls compact />

          <div className="flex flex-wrap items-center justify-end gap-2">
            <DeleteTargetButton
              targetId={targetId}
              targetName={domain}
              className="inline-flex items-center rounded-lg border border-warn/40 bg-warn/10 px-3 py-1.5 text-[12px] font-medium text-warn transition hover:bg-warn/20 disabled:opacity-60"
            />
          </div>
        </div>
      </div>
    </header>
  );
}
