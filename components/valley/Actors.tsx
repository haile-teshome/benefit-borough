"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { CROP_LOOK } from "@/lib/valley/layout";

// Pages of a paper plant: ruled lines and a colored header band, like the document it grew from.
const pageTextures = new Map<string, THREE.CanvasTexture>();
function pageTexture(band: string) {
  const hit = pageTextures.get(band);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 96;
  const g = c.getContext("2d")!;
  g.fillStyle = "#FFFDF6";
  g.fillRect(0, 0, 64, 96);
  g.fillStyle = band;
  g.fillRect(0, 0, 64, 14);
  g.strokeStyle = "rgba(60, 80, 130, 0.35)";
  g.lineWidth = 2;
  for (let y = 26; y < 92; y += 9) {
    g.beginPath();
    g.moveTo(8, y);
    g.lineTo(8 + 40 + ((y * 7) % 14), y);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  pageTextures.set(band, tex);
  return tex;
}

// A crop is one expiring balance, grown from paper: pages for leaves, coins for fruit.
// As its deadline nears the pages yellow and droop and the coins tarnish.
export function Crop({ position, category, atStake, daysLeft, harvested, highlighted }: {
  position: [number, number, number];
  category: string;
  atStake: number;
  daysLeft: number;
  harvested: boolean;
  highlighted: boolean;
}) {
  const look = CROP_LOOK[category] ?? CROP_LOOK.fsa;
  const group = useRef<THREE.Group>(null);
  const tex = useMemo(() => pageTexture(look.band), [look.band]);
  const wilt = Math.max(0, Math.min(1, (60 - daysLeft) / 50)); // 0 fresh .. 1 nearly gone
  const paper = useMemo(() => new THREE.Color("#FFFFFF").lerp(new THREE.Color("#D9B56A"), wilt * 0.7), [wilt]);
  const coin = useMemo(() => new THREE.Color("#F2B33D").lerp(new THREE.Color("#8A7A5A"), wilt * 0.6), [wilt]);
  const coins = Math.max(1, Math.min(8, Math.round(atStake / 180)));
  const droop = 0.35 + wilt * 0.75;

  // Idle sway; when you walk up it does a happy jelly wobble.
  const lit = useRef(0);
  useFrame(({ clock }, dt) => {
    if (!group.current) return;
    const t = clock.getElapsedTime();
    lit.current = THREE.MathUtils.lerp(lit.current, highlighted ? 1 : 0, Math.min(1, dt * 6));
    const wob = Math.sin(t * 9) * 0.09 * lit.current;
    group.current.rotation.y = Math.sin(t * 0.7 + position[0]) * 0.15 + lit.current * Math.sin(t * 3) * 0.3;
    group.current.scale.set(1 - wob * 0.5, 1 + wob + lit.current * 0.08, 1 - wob * 0.5);
    group.current.position.y = lit.current * 0.08;
  });

  if (category === "tax_window") {
    // A desk calendar on a stake, with the enrollment deadline circled.
    return (
      <group position={position} scale={1.6}>
        <mesh position={[0, 0.6, 0]} castShadow><cylinderGeometry args={[0.05, 0.05, 1.2, 6]} /><meshLambertMaterial color="#C9B48A" /></mesh>
        <group position={[0, 1.35, 0]} rotation-x={-0.15}>
          <mesh castShadow><boxGeometry args={[1.0, 0.9, 0.04]} /><meshLambertMaterial color={highlighted ? "#FFF6D8" : "#FFFDF6"} /></mesh>
          <mesh position={[0, 0.36, 0.025]}><boxGeometry args={[1.0, 0.18, 0.01]} /><meshLambertMaterial color="#D2413A" /></mesh>
          <mesh position={[0.12, -0.08, 0.03]}><torusGeometry args={[0.16, 0.025, 6, 20]} /><meshBasicMaterial color="#D2413A" /></mesh>
        </group>
      </group>
    );
  }

  if (harvested) {
    return (
      <group position={position} scale={1.6}>
        <mesh position={[0, 0.05, 0]} rotation-x={-Math.PI / 2}><circleGeometry args={[0.6, 14]} /><meshLambertMaterial color="#6E5A44" /></mesh>
        {[0, 1].map((i) => (
          <mesh key={i} position={[0, 0.25, 0]} rotation={[-0.5, i * Math.PI, 0]}>
            <planeGeometry args={[0.22, 0.32]} />
            <meshLambertMaterial map={tex} side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>
    );
  }

  return (
    <group position={position} scale={1.6}>
      <mesh position={[0, 0.05, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.75, 14]} />
        <meshLambertMaterial color={highlighted ? "#9C8466" : "#6E5A44"} />
      </mesh>
      <group ref={group}>
        {/* Rolled-paper stalk */}
        <mesh position={[0, 0.55, 0]} castShadow><cylinderGeometry args={[0.06, 0.08, 1.1, 8]} /><meshLambertMaterial color={paper} /></mesh>
        {/* Pages fanned around the stalk like leaves */}
        {[0, 1, 2, 3, 4].map((i) => {
          const a = (i / 5) * Math.PI * 2;
          const y = 0.35 + (i % 3) * 0.22;
          return (
            <group key={i} position={[0, y, 0]} rotation-y={a}>
              <mesh position={[0, 0.05, 0.28]} rotation-x={droop} castShadow>
                <planeGeometry args={[0.42, 0.6]} />
                <meshLambertMaterial map={tex} color={paper} side={THREE.DoubleSide} />
              </mesh>
            </group>
          );
        })}
        {/* Coin fruit, a stack sized by what's at stake */}
        <group position={[0, 1.15, 0]} rotation-z={wilt * 0.4}>
          {Array.from({ length: coins }, (_, i) => (
            <mesh key={i} position={[Math.sin(i * 1.7) * 0.03, i * 0.07, Math.cos(i * 1.7) * 0.03]} castShadow>
              <cylinderGeometry args={[0.2, 0.2, 0.06, 14]} />
              <meshLambertMaterial color={coin} emissive="#5A3A00" emissiveIntensity={0.15 * (1 - wilt)} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}
