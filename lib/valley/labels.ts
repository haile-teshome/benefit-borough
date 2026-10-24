import * as THREE from "three";

// Screen-space labels without drei <Html>: the DOM elements live in the main React tree and a
// projector inside the Canvas moves them every frame. Mounting a separate React root per label
// (what <Html> does) crashes React 19 when labels unmount mid-render.
export const anchors = new Map<string, THREE.Vector3>();
export const labelEls = new Map<string, HTMLElement>();

export function setAnchor(id: string, x: number, y: number, z: number) {
  const v = anchors.get(id);
  if (v) v.set(x, y, z);
  else anchors.set(id, new THREE.Vector3(x, y, z));
}

export function registerLabel(id: string) {
  return (el: HTMLElement | null) => {
    if (el) labelEls.set(id, el);
    else labelEls.delete(id);
  };
}
