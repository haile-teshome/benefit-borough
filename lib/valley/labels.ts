// Screen-space DOM labels: the elements live in the React tree and the 2D renderer moves them
// to their anchors every frame. y is height above the ground, in tiles.
export type Anchor = { x: number; y: number; z: number };
export const anchors = new Map<string, Anchor>();
export const labelEls = new Map<string, HTMLElement>();
// Where the local farmer is standing (crop tags shrink when you're far away).
export const focus = { x: 0, z: 0 };

export function setAnchor(id: string, x: number, y: number, z: number) {
  const v = anchors.get(id);
  if (v) { v.x = x; v.y = y; v.z = z; } else anchors.set(id, { x, y, z });
}

export function registerLabel(id: string) {
  return (el: HTMLElement | null) => {
    if (el) labelEls.set(id, el);
    else labelEls.delete(id);
  };
}
