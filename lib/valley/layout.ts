// Mirrors the module's farm grid (valley-server/src/index.ts) so crops land where the world expects.
export const FARM_SPACING = 22;

export function farmOrigin(farm: number) {
  const side = farm % 2 === 0 ? -1 : 1;
  const row = Math.floor(farm / 2);
  return { x: side * 20, z: 22 + row * FARM_SPACING };
}

// Crops sit in a 4-wide field in front of the farmhouse.
export function slotPosition(farm: number, slot: number): [number, number, number] {
  const o = farmOrigin(farm);
  const col = slot % 4;
  const row = Math.floor(slot / 4);
  return [o.x - 4.5 + col * 3, 0, o.z - 1 + row * 3];
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
