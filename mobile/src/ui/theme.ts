import type { Category } from "../../../lib/types";

// Airbnb-style palette: white canvas, near-black text, hairlines, one red accent used sparingly.
export const c = {
  bg: "#FFFFFF",
  panel: "#FFFFFF",
  soft: "#F7F7F7",
  ink: "#222222",
  ink2: "#484848",
  muted: "#717171",
  line: "#DDDDDD",
  hair: "#EBEBEB",
  rausch: "#FF385C",
  rauschDeep: "#E00B41",
  rauschEnd: "#D70466",
  good: "#008A05",
  goodSoft: "#EAF6EA",
  bad: "#C13515",
  badSoft: "#FFF4F2",
  mark: "#FFF1B8",
  // Aliases kept so shared components read naturally.
  accent: "#222222",
  accentSoft: "#F7F7F7",
  warn: "#C13515",
  warnSoft: "#FFF4F2",
  badBorder: "#C13515",
};

export const radius = { sm: 8, md: 12, lg: 16, xl: 24 };

export const shadow = {
  shadowColor: "#000",
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;

type IconName = "hospital-box-outline" | "tooth-outline" | "silverware-fork-knife" | "credit-card-outline" | "piggy-bank-outline" | "calendar-clock";

export const CAT: Record<Category, { label: string; short: string; icon: IconName }> = {
  deductible: { label: "Medical", short: "Medical", icon: "hospital-box-outline" },
  dental: { label: "Dental", short: "Dental", icon: "tooth-outline" },
  dining: { label: "Dining dollars", short: "Dining", icon: "silverware-fork-knife" },
  card_credit: { label: "Card credit", short: "Cards", icon: "credit-card-outline" },
  fsa: { label: "FSA", short: "FSA", icon: "piggy-bank-outline" },
  tax_window: { label: "Open enrollment", short: "Enrollment", icon: "calendar-clock" },
};

export const type = {
  hero: { fontSize: 32, fontWeight: "600" as const, letterSpacing: -0.6, color: "#222222" },
  title: { fontSize: 26, fontWeight: "600" as const, letterSpacing: -0.4, lineHeight: 32, color: "#222222" },
  h2: { fontSize: 22, fontWeight: "600" as const, letterSpacing: -0.3, color: "#222222" },
  h3: { fontSize: 16, fontWeight: "600" as const, color: "#222222" },
  body: { fontSize: 16, lineHeight: 22, color: "#222222" },
  small: { fontSize: 14, lineHeight: 19, color: "#717171" },
  tiny: { fontSize: 12, lineHeight: 16, color: "#717171" },
  money: { fontVariant: ["tabular-nums" as const] },
};
