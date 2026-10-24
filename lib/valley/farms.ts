// Mirrors the module's farm grid (valley-server/src/index.ts). No imports: everything else builds on it.
export const FARM_SPACING = 22;

// Farms line both sides of the main road running south from the village square.
export function farmOrigin(farm: number) {
  const side = farm % 2 === 0 ? -1 : 1;
  const row = Math.floor(farm / 2);
  return { x: side * 20, z: 22 + row * FARM_SPACING };
}
