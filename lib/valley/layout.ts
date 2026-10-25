export { FARM_SPACING, farmOrigin } from "./farms";
import { ELDER, farmLayout } from "./world";

export function slotPosition(farm: number, slot: number): [number, number, number] {
  const s = farmLayout(farm).slots[slot % 20];
  return [s.x, 0, s.z];
}

export const ELDER_POS = ELDER;

export function mailboxPosition(farm: number): [number, number, number] {
  const m = farmLayout(farm).mailbox;
  return [m.x, 0, m.z];
}

export const CROP_LOOK: Record<string, { name: string; band: string }> = {
  deductible: { name: "Claim Fern", band: "#D2413A" },
  dental: { name: "Molar Lily", band: "#3E8ED0" },
  dining: { name: "Meal-Plan Maize", band: "#E0A526" },
  fsa: { name: "Pretax Pumpkin", band: "#3FA66B" },
  card_credit: { name: "Mileage Marigold", band: "#8E5BD0" },
  tax_window: { name: "Enrollment Calendar", band: "#D2413A" },
  bank_bonus: { name: "Bonus Beanstalk", band: "#E9BC3C" },
  bank_fee: { name: "Overdraft Onion", band: "#C8A8F0" },
  idle_cash: { name: "Interest Iris", band: "#7C8CE0" },
  annual_fee: { name: "Fee Thistle", band: "#B48CF0" },
  credit_move: { name: "Perk Pea", band: "#7CC46B" },
  dispute: { name: "Double Daisy", band: "#3E8ED0" },
  rotating: { name: "Cashback Clover", band: "#3FA66B" },
  price_adjust: { name: "Markdown Mint", band: "#3FA6A0" },
  fsa_claim: { name: "Receipt Rhubarb", band: "#E04870" },
  promo_apr: { name: "Interest Ivy", band: "#D2413A" },
  subscription: { name: "Renewal Radish", band: "#E04848" },
  points: { name: "Mileage Poppy", band: "#F06C3B" },
  insurance: { name: "Premium Peony", band: "#F49AC8" },
  vision: { name: "Spectacle Sunflower", band: "#3E8ED0" },
  hsa: { name: "Nest-Egg Gourd", band: "#3FA6A0" },
  retirement: { name: "Match Melon", band: "#2F6E46" },
  pto: { name: "Holiday Hollyhock", band: "#E0A526" },
  stipend: { name: "Perk Pumpkin", band: "#E07BB0" },
  dcfsa: { name: "Daycare Daisy", band: "#4E8FCB" },
  espp: { name: "Stock Sprout", band: "#5E3A99" },
  fitness: { name: "Treadmill Tulip", band: "#E2574C" },
};

export const usd = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
