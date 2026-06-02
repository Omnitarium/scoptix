export type SummaryRankIconKind =
  | "mail"
  | "key"
  | "terminal"
  | "cloud"
  | "lock"
  | "github"
  | "hash"
  | "shield"
  | "card"
  | "file"
  | "folder"
  | "database"
  | "settings"
  | "globe"
  | "user";

export type RankVisual = {
  barColor: string;
  iconBg: string;
  iconColor: string;
  /** Findings top-10: inline stroke when Tailwind classes from lib/ are not emitted. */
  iconStroke?: string;
  /** Inline bar fill when Tailwind barColor from lib/ is not emitted. */
  barFill?: string;
  /** Flat 135° fill (URL categories — same as Sources donut). */
  barBackground?: string;
  barShadow?: string;
  icon: SummaryRankIconKind;
};

function normalizeLabel(label: string) {
  return label.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

type IconRule = {
  test: (normalized: string) => boolean;
  icon: SummaryRankIconKind;
};

type FindingRankPaletteEntry = Pick<
  RankVisual,
  "iconColor" | "iconStroke" | "barColor" | "barBackground" | "barShadow"
>;

function findingRankBar(from: string, to: string, shadow: string): Pick<RankVisual, "barBackground" | "barShadow"> {
  return {
    barBackground: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
    barShadow: `0 2px 8px ${shadow}`,
  };
}

/**
 * Top-10 findings: warna ikon + bar hanya dari peringkat (index 0 = #1), bukan dari jenis finding.
 * Bar: gradient 135° datar + soft shadow (sama teknik URL categories / Sources donut).
 */
const FINDING_RANK_PALETTE: FindingRankPaletteEntry[] = [
  {
    iconColor: "text-red-600",
    iconStroke: "#dc2626",
    barColor: "bg-red-500",
    ...findingRankBar("#dc2626", "#ef4444", "rgba(239, 68, 68, 0.2)"),
  },
  {
    iconColor: "text-orange-600",
    iconStroke: "#ea580c",
    barColor: "bg-orange-500",
    ...findingRankBar("#ea580c", "#f97316", "rgba(249, 115, 22, 0.2)"),
  },
  {
    iconColor: "text-green-800",
    iconStroke: "#166534",
    barColor: "bg-green-700",
    ...findingRankBar("#15803d", "#22c55e", "rgba(34, 197, 94, 0.2)"),
  },
  {
    iconColor: "text-purple-600",
    iconStroke: "#9333ea",
    barColor: "bg-purple-500",
    ...findingRankBar("#7c3aed", "#a855f7", "rgba(168, 85, 247, 0.2)"),
  },
  {
    iconColor: "text-blue-600",
    iconStroke: "#2563eb",
    barColor: "bg-blue-500",
    ...findingRankBar("#2563eb", "#3b82f6", "rgba(59, 130, 246, 0.2)"),
  },
  {
    iconColor: "text-teal-600",
    iconStroke: "#0d9488",
    barColor: "bg-teal-500",
    ...findingRankBar("#0d9488", "#14b8a6", "rgba(20, 184, 166, 0.2)"),
  },
  {
    iconColor: "text-amber-600",
    iconStroke: "#d97706",
    barColor: "bg-amber-500",
    ...findingRankBar("#d97706", "#f59e0b", "rgba(245, 158, 11, 0.2)"),
  },
  {
    iconColor: "text-rose-600",
    iconStroke: "#e11d48",
    barColor: "bg-rose-500",
    ...findingRankBar("#e11d48", "#f43f5e", "rgba(244, 63, 94, 0.2)"),
  },
  {
    iconColor: "text-indigo-600",
    iconStroke: "#4f46e5",
    barColor: "bg-indigo-500",
    ...findingRankBar("#4f46e5", "#6366f1", "rgba(99, 102, 241, 0.2)"),
  },
  {
    iconColor: "text-cyan-600",
    iconStroke: "#0891b2",
    barColor: "bg-cyan-500",
    ...findingRankBar("#0891b2", "#06b6d4", "rgba(8, 145, 178, 0.2)"),
  },
];

const FINDING_ICON_RULES: IconRule[] = [
  { test: (n) => n.includes("email"), icon: "mail" },
  {
    test: (n) =>
      n.includes("credential") || n.includes("combo-list") || n.includes("basic-auth"),
    icon: "key",
  },
  { test: (n) => n.includes("jwt") || n.includes("bearer"), icon: "terminal" },
  {
    test: (n) =>
      n.includes("aws") ||
      n.includes("azure") ||
      n.includes("gcp") ||
      n.includes("google-api"),
    icon: "cloud",
  },
  { test: (n) => n.includes("github") || n.includes("gitlab"), icon: "github" },
  { test: (n) => n.includes("private-key") || n.includes("ssh"), icon: "key" },
  {
    test: (n) =>
      n.includes("api") ||
      n.includes("openai") ||
      n.includes("stripe") ||
      n.includes("twilio") ||
      n.includes("sendgrid") ||
      n.includes("hex-secret"),
    icon: "lock",
  },
  { test: (n) => n.includes("slack"), icon: "terminal" },
  { test: (n) => n.includes("credit-card"), icon: "card" },
  { test: (n) => n.includes("db-connection") || n.includes("database"), icon: "database" },
];

const FINDING_ICON_FALLBACKS: SummaryRankIconKind[] = [
  "key",
  "mail",
  "lock",
  "terminal",
  "cloud",
  "shield",
  "hash",
  "file",
  "user",
  "database",
];

function matchFindingIcon(normalized: string): SummaryRankIconKind | null {
  for (const rule of FINDING_ICON_RULES) {
    if (rule.test(normalized)) return rule.icon;
  }
  return null;
}

export function resolveFindingRankVisual(label: string, index: number): RankVisual {
  const normalized = normalizeLabel(label);
  const rank = Math.max(0, Math.min(index, FINDING_RANK_PALETTE.length - 1));
  const colors = FINDING_RANK_PALETTE[rank]!;
  const icon =
    matchFindingIcon(normalized) ??
    FINDING_ICON_FALLBACKS[index % FINDING_ICON_FALLBACKS.length]!;
  return {
    icon,
    iconColor: colors.iconColor,
    iconStroke: colors.iconStroke,
    barColor: colors.barColor,
    barBackground: colors.barBackground,
    barShadow: colors.barShadow,
    iconBg: "",
  };
}

/** URL categories bar — selaras Sources donut (135° + soft shadow). */
export const CATEGORY_BAR_GRADIENT = "linear-gradient(135deg, #15803d 0%, #22c55e 100%)";
export const CATEGORY_BAR_SHADOW = "0 2px 8px rgba(34, 197, 94, 0.2)";

const CATEGORY_RANK_BAR: Pick<RankVisual, "barColor" | "barBackground" | "barShadow"> = {
  barColor: "bg-green-500",
  barBackground: CATEGORY_BAR_GRADIENT,
  barShadow: CATEGORY_BAR_SHADOW,
};

export function resolveCategoryRankVisual(): RankVisual {
  return {
    icon: "folder",
    iconBg: "",
    iconColor: "text-green-600",
    ...CATEGORY_RANK_BAR,
  };
}
