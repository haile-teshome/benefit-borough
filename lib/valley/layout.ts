export { FARM_SPACING, farmOrigin } from "./farms";
import { ELDER, farmLayout } from "./world";

export function slotPosition(farm: number, slot: number): [number, number, number] {
  const s = farmLayout(farm).slots[slot % 8];
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
};

export const usd = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
