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

export const CROP_LOOK: Record<string, { name: string; fruit: string; leaf: string }> = {
  deductible: { name: "Clinic Berry", fruit: "#D94141", leaf: "#3C8D40" },
  dental: { name: "Tooth Lily", fruit: "#F7F3E8", leaf: "#4B9A52" },
  dining: { name: "Cafeteria Corn", fruit: "#F2C14E", leaf: "#5BA34B" },
  fsa: { name: "Piggy Pumpkin", fruit: "#F29BB2", leaf: "#4E9A4A" },
  card_credit: { name: "Travel Sunflower", fruit: "#8E6BD9", leaf: "#4E9A4A" },
  tax_window: { name: "Enrollment Signpost", fruit: "#C8A06A", leaf: "#7A5A36" },
};

export const usd = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
