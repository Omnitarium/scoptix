import { NewScanDialog } from "@/components/new-scan-dialog";
import { TopBarControls } from "@/components/top-bar-controls";
import { IconList } from "@/components/ui-icons";

type ScansListHeaderProps = {
  activeCount: number;
  historyCount: number;
};

export function ScansListHeader({ activeCount, historyCount }: ScansListHeaderProps) {
  return (
    <header className="scx-scan-header shrink-0">
      <div className="flex items-stretch justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 text-[11px] font-bold text-muted">Discovery</div>
          <div className="mb-3 flex items-center gap-3">
            <h1 className="scx-scan-header-title truncate font-bold text-cream">Scans</h1>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
            <span className="inline-flex items-center rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium uppercase text-accent-dim">
              <IconList className="mr-1 size-3" />
              All Scans
            </span>
            <span>Active: {activeCount.toLocaleString()}</span>
            <span aria-hidden>•</span>
            <span>History: {historyCount.toLocaleString()}</span>
            <span aria-hidden>•</span>
            <span>Track running scans and review previous results.</span>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end justify-between gap-2">
          <TopBarControls compact />

          <div className="flex flex-wrap items-center justify-end gap-2">
            <NewScanDialog
              buttonClassName="shadow-clay inline-flex origin-bottom-right items-center justify-center rounded-lg bg-gradient-to-r from-accent to-accent-dim px-4 py-2 text-[12px] font-semibold text-void transition-transform hover:scale-[1.02]"
            />
          </div>
        </div>
      </div>
    </header>
  );
}
