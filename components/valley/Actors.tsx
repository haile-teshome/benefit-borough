"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type * as THREE from "three";
import { CROP_LOOK, usd } from "@/lib/valley/layout";

// A crop is one expiring balance. It wilts (browns and droops) as its deadline gets close.
export function Crop({ position, category, atStake, daysLeft, harvested, harvestable, highlighted, label, saved }: {
  position: [number, number, number];
  category: string;
  atStake: number;
  daysLeft: number;
  harvested: boolean;
  harvestable: boolean;
  highlighted: boolean;
  label: boolean;
  saved: number;
}) {
  const look = CROP_LOOK[category] ?? CROP_LOOK.fsa;
  const group = useRef<THREE.Group>(null);
  const size = 0.7 + Math.min(1, Math.log10(Math.max(10, atStake)) / 3.3) * 0.8;
  const wilt = Math.max(0, Math.min(1, (60 - daysLeft) / 50)); // 0 fresh .. 1 nearly dead
  const leaf = mix(look.leaf, "#9C7A3C", wilt * 0.8);
  const tilt = wilt * 0.35;

  useFrame(({ clock }) => {
    if (!group.current) return;
    const t = clock.getElapsedTime();
    group.current.rotation.z = Math.sin(t * 1.3 + position[0]) * 0.04 + tilt;
    group.current.position.y = highlighted ? 0.08 + Math.sin(t * 4) * 0.04 : 0;
  });

  if (category === "tax_window") {
    return (
      <group position={position}>
        <mesh position={[0, 0.7, 0]} castShadow><boxGeometry args={[0.14, 1.4, 0.14]} /><meshLambertMaterial color="#7A5A36" /></mesh>
        <mesh position={[0, 1.25, 0.05]} castShadow><boxGeometry args={[1.3, 0.55, 0.08]} /><meshLambertMaterial color={highlighted ? "#E9C98F" : "#C8A06A"} /></mesh>
        {label && <Tag text="Enroll by Nov 21" sub="Open enrollment" y={2.0} />}
      </group>
    );
  }

  if (harvested) {
    return (
      <group position={position}>
        <mesh position={[0, 0.12, 0]}><sphereGeometry args={[0.18, 6, 4]} /><meshLambertMaterial color={look.leaf} /></mesh>
        {label && <Tag text={`+${usd(saved)}`} sub="Rescued" y={1.0} good />}
      </group>
    );
  }

  return (
    <group position={position}>
      <mesh position={[0, 0.06, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.75, 12]} />
        <meshLambertMaterial color={highlighted ? "#B08A5E" : "#6E4F31"} />
      </mesh>
      <group ref={group} scale={size}>
        <mesh position={[0, 0.5, 0]} castShadow><cylinderGeometry args={[0.05, 0.07, 1, 5]} /><meshLambertMaterial color={leaf} /></mesh>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} position={[Math.cos(i * 1.6) * 0.25, 0.3 + i * 0.12, Math.sin(i * 1.6) * 0.25]} rotation={[0.6, i * 1.6, 0.9]} castShadow>
            <coneGeometry args={[0.16, 0.5, 4]} />
            <meshLambertMaterial color={leaf} flatShading />
          </mesh>
        ))}
        {category === "dining" ? (
          <mesh position={[0, 1.05, 0]} castShadow><capsuleGeometry args={[0.16, 0.45, 4, 8]} /><meshLambertMaterial color={look.fruit} flatShading /></mesh>
        ) : category === "fsa" ? (
          <mesh position={[0, 0.45, 0.25]} scale={[1.2, 0.9, 1.2]} castShadow><sphereGeometry args={[0.38, 10, 8]} /><meshLambertMaterial color={look.fruit} flatShading /></mesh>
        ) : category === "card_credit" ? (
          <group position={[0, 1.1, 0]}>
            <mesh castShadow rotation-x={Math.PI / 2}><cylinderGeometry args={[0.36, 0.36, 0.08, 10]} /><meshLambertMaterial color={look.fruit} /></mesh>
            <mesh position={[0, 0.05, 0]} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.16, 0.16, 0.1, 8]} /><meshLambertMaterial color="#5A3E1E" /></mesh>
          </group>
        ) : (
          [0, 1, 2].map((i) => (
            <mesh key={i} position={[Math.cos(i * 2.1) * 0.2, 1.0 + (i % 2) * 0.12, Math.sin(i * 2.1) * 0.2]} castShadow>
              <sphereGeometry args={[category === "dental" ? 0.17 : 0.13, 8, 6]} />
              <meshLambertMaterial color={mix(look.fruit, "#7A5A36", wilt * 0.5)} />
            </mesh>
          ))
        )}
      </group>
      {label && <Tag text={usd(atStake)} sub={`${look.name} · ${daysLeft}d`} y={2.1} warn={daysLeft <= 30} dim={!harvestable} />}
    </group>
  );
}

function Tag({ text, sub, y, good, warn, dim }: { text: string; sub: string; y: number; good?: boolean; warn?: boolean; dim?: boolean }) {
  return (
    <Html position={[0, y, 0]} center distanceFactor={14} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
      <div className={`ev-tag ${good ? "good" : ""} ${warn ? "warn" : ""} ${dim ? "dim" : ""}`}>
        <b>{text}</b>
        <span>{sub}</span>
      </div>
    </Html>
  );
}

// Chunky farmer: body, head, hat, and a name plate; a speech bubble when they chat.
export function Farmer({ color, name, facing, walking, bubble, me }: { color: string; name: string; facing: number; walking: boolean; bubble?: string; me?: boolean }) {
  const body = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!body.current) return;
    const t = clock.getElapsedTime();
    body.current.position.y = walking ? Math.abs(Math.sin(t * 10)) * 0.12 : Math.sin(t * 2) * 0.02;
  });
  return (
    <group rotation-y={facing}>
      <group ref={body}>
        <mesh position={[0, 0.65, 0]} castShadow><capsuleGeometry args={[0.32, 0.55, 4, 10]} /><meshLambertMaterial color={color} /></mesh>
        <mesh position={[0, 1.38, 0]} castShadow><sphereGeometry args={[0.3, 14, 10]} /><meshLambertMaterial color="#F1C9A0" /></mesh>
        <mesh position={[0, 1.6, 0]} castShadow><cylinderGeometry args={[0.5, 0.5, 0.06, 14]} /><meshLambertMaterial color="#E7C46A" /></mesh>
        <mesh position={[0, 1.72, 0]} castShadow><cylinderGeometry args={[0.24, 0.28, 0.24, 12]} /><meshLambertMaterial color="#E7C46A" /></mesh>
        <mesh position={[0.1, 1.42, 0.27]}><sphereGeometry args={[0.04, 6, 4]} /><meshBasicMaterial color="#2A2A2A" /></mesh>
        <mesh position={[-0.1, 1.42, 0.27]}><sphereGeometry args={[0.04, 6, 4]} /><meshBasicMaterial color="#2A2A2A" /></mesh>
      </group>
      <Html position={[0, 2.35, 0]} center distanceFactor={14} zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
        <div className="ev-name-wrap">
          {bubble && <div className="ev-bubble">{bubble}</div>}
          <div className={`ev-name ${me ? "me" : ""}`}>{name}</div>
        </div>
      </Html>
    </group>
  );
}

// The Reviewer, as the valley elder: long beard, cane, refuses to let you waste money.
export function Elder({ position, highlighted }: { position: [number, number, number]; highlighted: boolean }) {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (g.current) g.current.rotation.y = Math.sin(clock.getElapsedTime() * 0.6) * 0.3;
  });
  return (
    <group position={position}>
      <group ref={g}>
        <mesh position={[0, 0.7, 0]} castShadow><coneGeometry args={[0.55, 1.5, 10]} /><meshLambertMaterial color="#5B4B8A" /></mesh>
        <mesh position={[0, 1.6, 0]} castShadow><sphereGeometry args={[0.32, 14, 10]} /><meshLambertMaterial color="#EAC4A0" /></mesh>
        <mesh position={[0, 1.38, 0.2]} castShadow><coneGeometry args={[0.24, 0.6, 8]} /><meshLambertMaterial color="#F2F2F2" /></mesh>
        <mesh position={[0, 2.05, 0]} castShadow><coneGeometry args={[0.36, 0.8, 10]} /><meshLambertMaterial color="#3E3266" /></mesh>
        <mesh position={[0.55, 0.8, 0.1]} rotation-z={-0.08} castShadow><cylinderGeometry args={[0.04, 0.04, 1.7, 6]} /><meshLambertMaterial color="#7A5232" /></mesh>
      </group>
      <Html position={[0, 2.9, 0]} center distanceFactor={14} style={{ pointerEvents: "none" }}>
        <div className="ev-name-wrap">
          <div className={`ev-name elder ${highlighted ? "hl" : ""}`}>Elder Ruth · Reviewer</div>
        </div>
      </Html>
    </group>
  );
}

function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, "0")}`;
}
