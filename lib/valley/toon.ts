import * as THREE from "three";

// Pixel-art look: lighting falls in 4 flat bands instead of smooth gradients, and textures
// are sampled with hard nearest-neighbor edges. One shared ramp, one cache of converted materials.
let ramp: THREE.DataTexture | null = null;
function gradient() {
  if (ramp) return ramp;
  const steps = new Uint8Array([115, 170, 220, 255]);
  ramp = new THREE.DataTexture(steps, steps.length, 1, THREE.RedFormat);
  ramp.minFilter = THREE.NearestFilter;
  ramp.magFilter = THREE.NearestFilter;
  ramp.generateMipmaps = false;
  ramp.needsUpdate = true;
  return ramp;
}

const cache = new WeakMap<THREE.Material, THREE.Material>();

export function toon(src: THREE.Material): THREE.Material {
  const hit = cache.get(src);
  if (hit) return hit;
  const s = src as THREE.MeshStandardMaterial;
  if (!("color" in s) || src instanceof THREE.MeshToonMaterial || src instanceof THREE.MeshBasicMaterial || src instanceof THREE.PointsMaterial) {
    cache.set(src, src);
    return src;
  }
  if (s.map) {
    s.map.magFilter = THREE.NearestFilter;
    s.map.needsUpdate = true;
  }
  const out = new THREE.MeshToonMaterial({
    color: s.color.clone(),
    map: s.map ?? null,
    gradientMap: gradient(),
    transparent: s.transparent,
    opacity: s.opacity,
    side: s.side,
    emissive: s.emissive?.clone() ?? new THREE.Color(0),
    emissiveIntensity: s.emissiveIntensity ?? 1,
    alphaTest: s.alphaTest,
  });
  out.colorWrite = s.colorWrite;
  out.depthWrite = s.depthWrite;
  out.name = `${src.name}-toon`;
  cache.set(src, out);
  return out;
}

// Convert every mesh under an object (skinned characters included; toon supports skinning).
export function toonify(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.material = Array.isArray(m.material) ? m.material.map(toon) : toon(m.material);
  });
  return root;
}

// How many screen pixels make one art pixel.
export const PIXEL_SIZE = 3;
