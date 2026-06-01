import {
  IconCloud,
  IconCreditCard,
  IconDatabase,
  IconFileText,
  IconFolder,
  IconGithub,
  IconGlobe,
  IconHash,
  IconKey,
  IconLock,
  IconMail,
  IconSettings,
  IconShield,
  IconTerminal,
  IconUser,
  IconArrowDown,
  IconArrowUp,
  IconMinus,
} from "@/components/ui-icons";
import type { SummaryRankIconKind } from "@/lib/summary-rank-style";
import type { SummaryRankRow } from "@/lib/scan-summary";

const rankRowGridClass =
  "grid grid-cols-[minmax(0,1fr)_2.75rem_minmax(0,1fr)] items-center gap-x-2";

/** Change column body: delta value, trend arrow, relative bar. */
const changeRowGridClass =
  "grid grid-cols-[2.75rem_0.75rem_minmax(1.25rem,1fr)] items-center gap-x-1.5";

const changeAreaPad = "pl-2.5 sm:pl-3";

function RankTypeIcon({
  kind,
  className,
}: {
  kind: SummaryRankIconKind;
  className: string;
}) {
  switch (kind) {
    case "mail":
      return <IconMail className={className} />;
    case "key":
      return <IconKey className={className} />;
    case "terminal":
      return <IconTerminal className={className} />;
    case "cloud":
      return <IconCloud className={className} />;
    case "lock":
      return <IconLock className={className} />;
    case "github":
      return <IconGithub className={className} />;
    case "hash":
      return <IconHash className={className} />;
    case "shield":
      return <IconShield className={className} />;
    case "card":
      return <IconCreditCard className={className} />;
    case "file":
      return <IconFileText className={className} />;
    case "folder":
      return <IconFolder className={className} />;
    case "database":
      return <IconDatabase className={className} />;
    case "settings":
      return <IconSettings className={className} />;
    case "globe":
      return <IconGlobe className={className} />;
    default:
      return <IconUser className={className} />;
  }
}

export function SummaryRankRow({
  row,
  showIcon = true,
}: {
  row: SummaryRankRow;
  showIcon?: boolean;
}) {
  return (
    <div
      className={`${rankRowGridClass} border-b border-line/40 py-1.5 text-[12px] last:border-0`}
    >
      <div className="flex min-w-0 items-center">
        {showIcon ? (
          <span
            className="mr-3 inline-flex shrink-0"
            style={row.iconStroke ? { color: row.iconStroke } : undefined}
          >
            <RankTypeIcon kind={row.icon} className={`size-4 ${row.iconColor}`} />
          </span>
        ) : null}
        <span className="truncate font-medium text-cream">{row.label}</span>
      </div>
      <div className="text-left font-normal text-cream tabular-nums">
        {row.count.toLocaleString()}
      </div>
      <div className={`${changeRowGridClass} ${changeAreaPad}`}>
        <span
          className={[
            "text-left font-normal tabular-nums",
            row.trend === "up"
              ? "text-green-600"
              : row.trend === "down"
                ? "text-red-600"
                : "text-muted",
          ].join(" ")}
        >
          {row.change}
        </span>
        <span className="flex size-3 shrink-0 items-center justify-center justify-self-center">
          {row.trend === "up" ? (
            <IconArrowUp className="size-3 text-green-600" aria-hidden />
          ) : row.trend === "down" ? (
            <IconArrowDown className="size-3 text-red-600" aria-hidden />
          ) : (
            <IconMinus className="size-3 text-muted" aria-hidden />
          )}
        </span>
        <div
          className="h-1.5 min-w-[1.25rem] rounded-full bg-line/30"
          role="presentation"
          aria-hidden
        >
          <div
            className={[
              "h-full rounded-full transition-[width]",
              row.barBackground ? "" : row.barFill ? "" : row.barColor,
            ].join(" ")}
            style={{
              width: `${row.barWidthPercent}%`,
              ...(row.barBackground
                ? { background: row.barBackground, boxShadow: row.barShadow }
                : row.barFill
                  ? { backgroundColor: row.barFill }
                  : {}),
            }}
          />
        </div>
      </div>
    </div>
  );
}

export function SummaryRankTableHeader({
  labelCol,
  countLabel,
}: {
  labelCol: string;
  countLabel: string;
}) {
  return (
    <div
      className={`${rankRowGridClass} mb-1.5 border-b border-line pb-1.5 text-[10px] font-bold text-muted`}
    >
      <span>{labelCol}</span>
      <span className="text-left">{countLabel}</span>
      <div className={`${changeRowGridClass} ${changeAreaPad}`}>
        <span className="col-span-3 whitespace-nowrap">Change (vs last scan)</span>
      </div>
    </div>
  );
}
