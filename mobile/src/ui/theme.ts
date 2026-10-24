import type { Category } from "../../../lib/types";

export const c = {
  bg: "#F4F2EE",
  panel: "#FFFFFF",
  ink: "#0E1320",
  ink2: "#3A4152",
  muted: "#7A8091",
  line: "#E6E2DA",
  hero1: "#0B1220",
  hero2: "#123A3A",
  mint: "#34D3B4",
  accent: "#0E8C78",
  accentSoft: "#E3F6F1",
  warn: "#C26A0A",
  warnSoft: "#FFF3E2",
  bad: "#C8322B",
  badSoft: "#FDECEA",
  mark: "#FDE68A",
};

export const radius = { sm: 10, md: 14, lg: 20, xl: 28 };

export const shadow = {
  shadowColor: "#0E1320",
  shadowOpacity: 0.07,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 3,
} as const;

type IconName = "hospital-box-outline" | "tooth-outline" | "silverware-fork-knife" | "credit-card-outline" | "piggy-bank-outline" | "calendar-clock";

export const CAT: Record<Category, { label: string; icon: IconName; color: string; soft: string }> = {
  deductible: { label: "Medical", icon: "hospital-box-outline", color: "#5B5BD6", soft: "#ECECFB" },
  dental: { label: "Dental", icon: "tooth-outline", color: "#0A84C6", soft: "#E3F2FB" },
  dining: { label: "Dining dollars", icon: "silverware-fork-knife", color: "#D97706", soft: "#FDF1DE" },
  card_credit: { label: "Card credit", icon: "credit-card-outline", color: "#7C4DDB", soft: "#F0EAFB" },
  fsa: { label: "FSA", icon: "piggy-bank-outline", color: "#0E8C78", soft: "#E3F6F1" },
  tax_window: { label: "Open enrollment", icon: "calendar-clock", color: "#5B6475", soft: "#ECEEF2" },
};

export const urgency = (days: number) =>
  days <= 30 ? { fg: c.bad, bg: c.badSoft } : days <= 60 ? { fg: c.warn, bg: c.warnSoft } : { fg: c.ink2, bg: "#EEECE7" };

export const type = {
  display: { fontSize: 44, fontWeight: "800" as const, letterSpacing: -1.2, fontVariant: ["tabular-nums" as const] },
  h1: { fontSize: 28, fontWeight: "800" as const, letterSpacing: -0.6 },
  h2: { fontSize: 20, fontWeight: "700" as const, letterSpacing: -0.3 },
  h3: { fontSize: 16, fontWeight: "700" as const },
  body: { fontSize: 15, lineHeight: 21 },
  small: { fontSize: 13, lineHeight: 18 },
  label: { fontSize: 11, fontWeight: "700" as const, letterSpacing: 0.9, textTransform: "uppercase" as const },
};
