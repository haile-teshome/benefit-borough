"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { nightAmount } from "@/lib/valley/clock";

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// Fireflies drift around the farms after dusk and glow (bloom picks them up).
export function Fireflies({ count = 140 }: { count?: number }) {
  const points = useRef<THREE.Points>(null);
  const { geo, seeds } = useMemo(() => {
    const r = rng(99);
    const seeds = Array.from({ length: count }, () => ({ x: (r() - 0.5) * 90, z: r() * 80 - 15, y: 0.6 + r() * 2.2, p: r() * 10 }));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    return { geo, seeds };
  }, [count]);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const pos = geo.attributes.position as THREE.BufferAttribute;
    seeds.forEach((s, i) => {
      pos.setXYZ(i, s.x + Math.sin(t * 0.4 + s.p) * 1.5, s.y + Math.sin(t * 1.3 + s.p * 2) * 0.4, s.z + Math.cos(t * 0.35 + s.p) * 1.5);
    });
    pos.needsUpdate = true;
    if (points.current) {
      const m = points.current.material as THREE.PointsMaterial;
      m.opacity = nightAmount() * (0.75 + Math.sin(t * 6) * 0.25);
      points.current.visible = m.opacity > 0.02;
    }
  });
  return (
    <points ref={points} geometry={geo}>
      <pointsMaterial color="#FFE98A" size={0.32} sizeAttenuation transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    </points>
  );
}

