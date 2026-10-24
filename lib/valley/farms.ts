// Mirrors the module's farm grid (valley-server/src/index.ts). No imports: everything else builds on it.
// World units are tiles (16px). x runs east, z runs south.
export const FARM_SPACING = 13;

// Farms line both sides of the main road running south from the village square.
export function farmOrigin(farm: number) {
  const side = farm % 2 === 0 ? -1 : 1;
  const row = Math.floor(farm / 2);
  return { x: side * 13, z: 16 + row * FARM_SPACING };
}
