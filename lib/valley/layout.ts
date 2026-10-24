import { farmField } from "./hexgrid";
export { FARM_SPACING, farmOrigin } from "./farms";
import { farmOrigin } from "./farms";

// Crops grow on the dirt hex tiles of the owner's field (see hexgrid.farmField).
export function slotPosition(farm: number, slot: number): [number, number, number] {
  const f = farmField(farm);
  const t = f[slot % Math.max(1, f.length)] ?? farmOrigin(farm);
  return [t.x, 0, t.z];
}

export const ELDER_POS: [number, number, number] = [0, 0, 2];

export function mailboxPosition(farm: number): [number, number, number] {
  const o = farmOrigin(farm);
  return [o.x + 6.5, 0, o.z - 6];
}

// Each crop is a paper plant; the band is the colored header printed on its pages.
export const CROP_LOOK: Record<string, { name: string; band: string }> = {
  deductible: { name: "Claim Fern", band: "#D2413A" },
  dental: { name: "Molar Lily", band: "#3E8ED0" },
  dining: { name: "Meal-Plan Maize", band: "#E0A526" },
  fsa: { name: "Pretax Pumpkin", band: "#3FA66B" },
  card_credit: { name: "Mileage Marigold", band: "#8E5BD0" },
  tax_window: { name: "Enrollment Calendar", band: "#D2413A" },
};

export const usd = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
