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

  useFrame(({ clock }) => {
    if (!group.current) return;
    const t = clock.getElapsedTime();
    group.current.rotation.y = Math.sin(t * 0.7 + position[0]) * 0.15;
    group.current.position.y = highlighted ? 0.1 + Math.sin(t * 4) * 0.05 : 0;
  });

  if (category === "tax_window") {
    // A desk calendar on a stake, with the enrollment deadline circled.
    return (
      <group position={position}>
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
      <group position={position}>
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
    <group position={position}>
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

// Folded paper-boat hat: a triangle extruded front to back.
function useBoatHat() {
  return useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-0.5, 0);
    s.lineTo(0.5, 0);
    s.lineTo(0, 0.5);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.42, bevelEnabled: false });
    g.translate(0, 0, -0.21);
    return g;
  }, []);
}

export function Farmer({ color, facing, walking }: { color: string; facing: number; walking: boolean }) {
  const body = useRef<THREE.Group>(null);
  const hat = useBoatHat();
  useFrame(({ clock }) => {
    if (!body.current) return;
    const t = clock.getElapsedTime();
    body.current.position.y = walking ? Math.abs(Math.sin(t * 10)) * 0.12 : Math.sin(t * 2) * 0.02;
    body.current.rotation.z = walking ? Math.sin(t * 10) * 0.05 : 0;
  });
  return (
    <group rotation-y={facing}>
      <group ref={body}>
        <mesh position={[0, 0.65, 0]} castShadow><capsuleGeometry args={[0.32, 0.55, 4, 10]} /><meshLambertMaterial color={color} /></mesh>
        {/* Satchel for paperwork */}
        <mesh position={[0.34, 0.6, 0.05]} rotation-z={0.15} castShadow><boxGeometry args={[0.14, 0.38, 0.32]} /><meshLambertMaterial color="#C98B4E" /></mesh>
        <mesh position={[0, 1.38, 0]} castShadow><sphereGeometry args={[0.3, 14, 10]} /><meshLambertMaterial color="#E9C4A0" /></mesh>
        <mesh geometry={hat} position={[0, 1.55, 0]} rotation-y={Math.PI / 2} castShadow><meshLambertMaterial color="#FFFDF6" side={THREE.DoubleSide} /></mesh>
        <mesh position={[0.1, 1.42, 0.27]}><sphereGeometry args={[0.04, 6, 4]} /><meshBasicMaterial color="#1F2A44" /></mesh>
        <mesh position={[-0.1, 1.42, 0.27]}><sphereGeometry args={[0.04, 6, 4]} /><meshBasicMaterial color="#1F2A44" /></mesh>
      </group>
    </group>
  );
}

// Ruth, the Reviewer: an auditor with a visor, round glasses and a clipboard. She refuses waste.
export function Elder({ position }: { position: [number, number, number] }) {
  const g = useRef<THREE.Group>(null);
  const board = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (g.current) g.current.rotation.y = Math.sin(t * 0.6) * 0.3;
    if (board.current) board.current.rotation.x = -0.5 + Math.sin(t * 1.5) * 0.08;
  });
  return (
    <group position={position}>
      <group ref={g}>
        <mesh position={[0, 0.8, 0]} castShadow><cylinderGeometry args={[0.34, 0.46, 1.6, 12]} /><meshLambertMaterial color="#2F5D5A" /></mesh>
        <mesh position={[0, 1.75, 0]} castShadow><sphereGeometry args={[0.3, 14, 10]} /><meshLambertMaterial color="#D9A982" /></mesh>
        <mesh position={[0, 2.02, 0]}><sphereGeometry args={[0.31, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshLambertMaterial color="#E8E4DC" /></mesh>
        {/* Green visor */}
        <mesh position={[0, 1.93, 0.22]} rotation-x={0.35}><boxGeometry args={[0.5, 0.03, 0.28]} /><meshLambertMaterial color="#3FA66B" transparent opacity={0.85} /></mesh>
        {/* Round glasses */}
        <mesh position={[0.11, 1.78, 0.27]}><torusGeometry args={[0.075, 0.015, 6, 16]} /><meshBasicMaterial color="#1F2A44" /></mesh>
        <mesh position={[-0.11, 1.78, 0.27]}><torusGeometry args={[0.075, 0.015, 6, 16]} /><meshBasicMaterial color="#1F2A44" /></mesh>
        {/* Clipboard */}
        <group ref={board} position={[0.25, 1.15, 0.38]}>
          <mesh castShadow><boxGeometry args={[0.42, 0.56, 0.03]} /><meshLambertMaterial color="#9C6B3E" /></mesh>
          <mesh position={[0, -0.02, 0.02]}><boxGeometry args={[0.36, 0.46, 0.01]} /><meshLambertMaterial map={pageTexture("#D2413A")} /></mesh>
        </group>
      </group>
    </group>
  );
}
