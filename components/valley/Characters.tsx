"use client";

import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { toonify } from "@/lib/valley/toon";

// Quaternius Ultimate Animated Animal Pack (CC0). Farmers are little animals; Ruth is an alpaca.
const ANIMAL = (n: string) => `/models/quaternius/animals/${n}.glb`;
const FARMER_ANIMALS = ["ShibaInu", "Fox", "Husky", "Deer", "Cow"] as const;

// Avatars farmers can pick (Ruth keeps the alpaca to herself).
export const AVATARS: { id: (typeof FARMER_ANIMALS)[number]; label: string; icon: string }[] = [
  { id: "ShibaInu", label: "Shiba", icon: "🐕" },
  { id: "Fox", label: "Fox", icon: "🦊" },
  { id: "Husky", label: "Husky", icon: "🐺" },
  { id: "Deer", label: "Deer", icon: "🦌" },
  { id: "Cow", label: "Cow", icon: "🐄" },
];
const HEIGHT: Record<string, number> = { ShibaInu: 1.8, Fox: 1.8, Husky: 1.9, Deer: 2.4, Cow: 2.1 };
const CLIP = (n: string) => `AnimalArmature|${n}`;

export type Emote = { clip: "Cheer" | "Interact"; at: number } | null;
export type Mood = { kind: "approve" | "reject" | "thinking"; at: number } | null;

// Clone the rigged model and scale it so it stands `height` units tall.
function useAnimal(name: string, height: number, headScale = 2.4) {
  const { scene, animations } = useGLTF(ANIMAL(name));
  const obj = useMemo(() => {
    const c = cloneSkinned(scene);
    // Chibi proportions: a big head on a rounder body. The clips only rotate the Head bone,
    // so a scale set here survives every animation.
    c.getObjectByName("Head")?.scale.setScalar(headScale);
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; }
    });
    toonify(c);
    // The rig has an internal 100× scale node: update world matrices before measuring.
    c.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(c, true);
    const h = Math.max(0.001, box.max.y - box.min.y);
    c.scale.multiplyScalar(height / h);
    c.scale.x *= 1.18;
    c.scale.z *= 1.1;
    c.position.y -= box.min.y * (height / h);
    return c;
  }, [scene, height, headScale]);
  const rig = useRef<THREE.Group>(null);
  const { actions } = useAnimations(animations, rig);
  return { obj, rig, actions };
}

function usePlay(actions: Record<string, THREE.AnimationAction | null>, clip: string, once = false) {
  const current = useRef("");
  useEffect(() => {
    const next = actions[CLIP(clip)] ?? actions[clip];
    if (!next || current.current === clip) return;
    const prev = current.current ? actions[CLIP(current.current)] : null;
    next.reset().setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.setEffectiveWeight(1).fadeIn(0.18).play();
    prev?.fadeOut(0.18);
    current.current = clip;
  }, [actions, clip, once]);
}

// Squash-and-stretch on every step, a breathing wobble at rest, a springy hop on cheer.
function useBounce(walking: boolean, hopAt: number) {
  const body = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const b = body.current;
    if (!b) return;
    const t = clock.getElapsedTime();
    const since = (performance.now() - hopAt) / 1000;
    let y = 0, sy = 1;
    if (since < 0.9) {
      // Two little hops with a squash before each.
      const k = since / 0.9;
      y = Math.abs(Math.sin(k * Math.PI * 2)) * 0.9 * (1 - k * 0.4);
      sy = 1 + Math.sin(k * Math.PI * 4) * 0.12;
      b.rotation.y = k * Math.PI * 2;
    } else if (walking) {
      const s = Math.sin(t * 13);
      y = Math.abs(s) * 0.16;
      sy = 1 + s * 0.07;
      b.rotation.y = 0;
    } else {
      sy = 1 + Math.sin(t * 2.4) * 0.025;
      b.rotation.y = 0;
    }
    b.position.y = y;
    b.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
  });
  return body;
}

export function FarmerModel({ farm, avatar, facing, facingRef, walking, emote }: { farm: number; avatar?: string; facing: number; facingRef?: { current: number }; walking: boolean; emote?: Emote }) {
  const animal = FARMER_ANIMALS.find((a) => a === avatar) ?? FARMER_ANIMALS[farm % FARMER_ANIMALS.length];
  const { obj, rig, actions } = useAnimal(animal, HEIGHT[animal] ?? 1.8);
  const emoting = emote && performance.now() - emote.at < 1800;
  const clip = emoting ? (emote!.clip === "Cheer" ? "Gallop_Jump" : "Eating") : walking ? "Walk" : "Idle";
  usePlay(actions, clip);
  const body = useBounce(walking, emote?.clip === "Cheer" ? emote.at : 0);
  const turn = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const g = turn.current;
    if (!g) return;
    let d = (facingRef?.current ?? facing) - g.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    g.rotation.y += d * Math.min(1, dt * 10);
  });
  return (
    <group ref={turn}>
      <group ref={body}>
        <group ref={rig}>
          <primitive object={obj} />
        </group>
      </group>
      <Dust active={walking} />
      {emote?.clip === "Cheer" && <Hearts key={emote.at} />}
    </group>
  );
}

// Ruth, the Reviewer: an alpaca auditor at her little desk with a rubber stamp.
export function RuthModel({ position, mood }: { position: [number, number, number]; mood: Mood }) {
  const { obj, rig, actions } = useAnimal("Alpaca", 3.6, 2);
  const fresh = mood && performance.now() - mood.at < 2200;
  const clip = fresh ? (mood!.kind === "reject" ? "Attack_Headbutt" : mood!.kind === "approve" ? "Gallop_Jump" : "Idle_Headlow") : "Idle";
  usePlay(actions, clip);
  const body = useBounce(false, fresh && mood!.kind === "approve" ? mood!.at : 0);
  const head = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (head.current) head.current.rotation.y = Math.sin(clock.getElapsedTime() * 0.5) * 0.4;
  });
  return (
    <group position={position}>
      <group ref={head} rotation-y={0.3}>
        <group ref={body}>
          <group ref={rig}>
            <primitive object={obj} />
          </group>
        </group>
      </group>
      <AuditDesk />
    </group>
  );
}

function AuditDesk() {
  const stamp = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() % 3;
    if (stamp.current) stamp.current.position.y = 1.15 + (t > 2.6 ? Math.sin((t - 2.6) / 0.4 * Math.PI) * -0.12 : 0.12);
  });
  return (
    <group position={[1.6, 0, 0.6]} rotation-y={-0.5}>
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow><boxGeometry args={[1.4, 1, 0.8]} /><meshStandardMaterial color="#B98552" roughness={0.9} /></mesh>
      <mesh position={[0, 1.02, 0]} receiveShadow><boxGeometry args={[1.5, 0.06, 0.9]} /><meshStandardMaterial color="#8E5F36" roughness={0.8} /></mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[-0.3 + i * 0.03, 1.07 + i * 0.012, 0.02 * i]} rotation-y={i * 0.08}>
          <boxGeometry args={[0.5, 0.01, 0.65]} />
          <meshStandardMaterial color="#FFFDF6" roughness={1} />
        </mesh>
      ))}
      <group ref={stamp} position={[0.35, 1.25, 0]}>
        <mesh castShadow><cylinderGeometry args={[0.12, 0.14, 0.1, 16]} /><meshStandardMaterial color="#D2413A" roughness={0.6} /></mesh>
        <mesh position={[0, 0.16, 0]} castShadow><sphereGeometry args={[0.09, 12, 10]} /><meshStandardMaterial color="#5A3B22" roughness={0.6} /></mesh>
      </group>
    </group>
  );
}

// Little puffs kicked up behind trotting feet.
function Dust({ active }: { active: boolean }) {
  const group = useRef<THREE.Group>(null);
  const last = useRef(0);
  const puffs = useRef(Array.from({ length: 8 }, () => ({ born: -10, x: 0, z: 0 })));
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (active && t - last.current > 0.16) {
      last.current = t;
      const p = puffs.current.reduce((a, b) => (a.born < b.born ? a : b));
      p.born = t; p.x = (Math.random() - 0.5) * 0.5; p.z = -0.4 + (Math.random() - 0.5) * 0.3;
    }
    group.current?.children.forEach((c, i) => {
      const p = puffs.current[i];
      const k = (t - p.born) / 0.7;
      c.visible = k < 1;
      if (k < 1) {
        c.position.set(p.x, 0.15 + k * 0.35, p.z - k * 0.3);
        c.scale.setScalar(0.12 + k * 0.28);
        ((c as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity = (1 - k) * 0.6;
      }
    });
  });
  return (
    <group ref={group}>
      {puffs.current.map((_, i) => (
        <mesh key={i} visible={false}>
          <icosahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color="#F3EBDD" roughness={1} transparent depthWrite={false} flatShading />
        </mesh>
      ))}
    </group>
  );
}

// Pink hearts float up when a farmer harvests.
const heartGeo = (() => {
  const s = new THREE.Shape();
  s.moveTo(0, -0.35);
  s.bezierCurveTo(-0.55, 0.05, -0.3, 0.45, 0, 0.18);
  s.bezierCurveTo(0.3, 0.45, 0.55, 0.05, 0, -0.35);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 });
  g.center();
  return g;
})();

function Hearts() {
  const group = useRef<THREE.Group>(null);
  const born = useRef(performance.now());
  const seeds = useMemo(() => Array.from({ length: 6 }, (_, i) => ({ x: (i - 2.5) * 0.35, d: i * 0.12, s: 0.5 + Math.random() * 0.4 })), []);
  useFrame(() => {
    const t = (performance.now() - born.current) / 1000;
    group.current?.children.forEach((c, i) => {
      const s = seeds[i];
      const k = Math.max(0, t - s.d) / 1.6;
      c.visible = k > 0 && k < 1;
      c.position.set(s.x + Math.sin(k * 8 + i) * 0.15, 2 + k * 2.2, 0);
      c.rotation.y = Math.sin(k * 6) * 0.6;
      c.scale.setScalar(s.s * (k < 0.15 ? k / 0.15 : 1));
      ((c as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity = 1 - Math.max(0, k - 0.6) / 0.4;
    });
  });
  return (
    <group ref={group}>
      {seeds.map((_, i) => (
        <mesh key={i} geometry={heartGeo} visible={false}>
          <meshStandardMaterial color={i % 2 ? "#FF7AA8" : "#FF4F8B"} emissive="#FF2F6F" emissiveIntensity={0.4} roughness={0.4} transparent />
        </mesh>
      ))}
    </group>
  );
}

FARMER_ANIMALS.forEach((m) => useGLTF.preload(ANIMAL(m)));
useGLTF.preload(ANIMAL("Alpaca"));
