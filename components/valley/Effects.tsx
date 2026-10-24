"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { gameHour, nightAmount } from "@/lib/valley/clock";

const SKY = [
  { h: 0, c: "#1B2442" }, { h: 5, c: "#1B2442" }, { h: 6.2, c: "#F2B48C" }, { h: 7.5, c: "#BFE3F5" },
  { h: 16.5, c: "#BFE3F5" }, { h: 18, c: "#F59E78" }, { h: 19.3, c: "#3B3566" }, { h: 20.5, c: "#1B2442" }, { h: 24, c: "#1B2442" },
];
const SUN = [
  { h: 0, c: "#7C8BD6" }, { h: 6, c: "#FFB27A" }, { h: 8, c: "#FFF4E0" }, { h: 16.5, c: "#FFF4E0" }, { h: 18.2, c: "#FF9A6A" }, { h: 20, c: "#7C8BD6" }, { h: 24, c: "#7C8BD6" },
];

function sample(keys: { h: number; c: string }[], h: number, out: THREE.Color) {
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (h >= a.h && h <= b.h) return out.set(a.c).lerp(new THREE.Color(b.c), (h - a.h) / (b.h - a.h || 1));
  }
  return out.set(keys[0].c);
}

// Sky, fog, sun and ambient light all follow the game clock.
export function DayNight() {
  const { scene } = useThree();
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const sky = useMemo(() => new THREE.Color(), []);
  useFrame(() => {
    const h = gameHour();
    const night = nightAmount(h);
    sample(SKY, h, sky);
    scene.background = sky;
    if (scene.fog) (scene.fog as THREE.Fog).color.copy(sky);
    if (sun.current) {
      // Sun arcs east to west through the day; the moon light comes from the same rig at night.
      const a = ((h - 6) / 12) * Math.PI;
      sun.current.position.set(Math.cos(a) * 45, 20 + Math.max(0, Math.sin(a)) * 30, 18);
      sample(SUN, h, sun.current.color);
      sun.current.intensity = 0.35 + (1 - night) * 1.3;
    }
    if (hemi.current) hemi.current.intensity = 0.35 + (1 - night) * 0.6;
  });
  return (
    <>
      <fog attach="fog" args={["#BFE3F5", 60, 140]} />
      <hemisphereLight ref={hemi} args={["#FFF7E8", "#6C8F4E", 0.9]} />
      <directionalLight ref={sun} position={[30, 40, 15]} intensity={1.6} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-60} shadow-camera-right={60} shadow-camera-top={60} shadow-camera-bottom={-60} />
    </>
  );
}

// A window pane that glows warm after dusk.
export function GlowWindow(props: { position: [number, number, number]; size: [number, number] }) {
  const mat = useRef<THREE.MeshLambertMaterial>(null);
  useFrame(() => {
    const n = nightAmount();
    if (!mat.current) return;
    mat.current.emissiveIntensity = n * 1.4;
    mat.current.color.set(n > 0.3 ? "#F7D58A" : "#A7D8F0");
  });
  return (
    <mesh position={props.position}>
      <boxGeometry args={[props.size[0], props.size[1], 0.05]} />
      <meshLambertMaterial ref={mat} color="#A7D8F0" emissive="#FFC86B" emissiveIntensity={0} />
    </mesh>
  );
}

// Street lamp on the square: switches on at dusk.
export function Lamp({ position }: { position: [number, number, number] }) {
  const light = useRef<THREE.PointLight>(null);
  const bulb = useRef<THREE.MeshLambertMaterial>(null);
  useFrame(({ clock }) => {
    const n = nightAmount();
    if (light.current) light.current.intensity = n * (18 + Math.sin(clock.getElapsedTime() * 7) * 0.8);
    if (bulb.current) bulb.current.emissiveIntensity = n * 2;
  });
  return (
    <group position={position}>
      <mesh position={[0, 1.4, 0]} castShadow><cylinderGeometry args={[0.07, 0.09, 2.8, 6]} /><meshLambertMaterial color="#3E3A36" /></mesh>
      <mesh position={[0, 2.95, 0]}><boxGeometry args={[0.42, 0.45, 0.42]} /><meshLambertMaterial ref={bulb} color="#FFE7A8" emissive="#FFC86B" emissiveIntensity={0} /></mesh>
      <pointLight ref={light} position={[0, 2.9, 0]} distance={12} decay={1.6} color="#FFC86B" intensity={0} />
    </group>
  );
}

export type Burst = { id: number; at: [number, number, number]; amount: number; born: number };

const COINS = 14;

// Coins pop out of a harvested crop, spin, fall and fade. The rising "+$" tag is a screen label.
export function CoinBurst({ burst, onDone }: { burst: Burst; onDone: (id: number) => void }) {
  const group = useRef<THREE.Group>(null);
  const seeds = useMemo(
    () => Array.from({ length: COINS }, (_, i) => {
      const a = (i / COINS) * Math.PI * 2 + Math.random() * 0.4;
      const s = 1.6 + Math.random() * 1.8;
      return { vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: 5 + Math.random() * 3, spin: 6 + Math.random() * 8 };
    }),
    [],
  );
  const done = useRef(false);
  useFrame(() => {
    const t = (performance.now() - burst.born) / 1000;
    const g = group.current;
    if (g) {
      g.children.forEach((c, i) => {
        const s = seeds[i];
        const y = Math.max(0.1, 1 + s.vy * t - 9.8 * t * t * 0.9);
        c.position.set(s.vx * t, y, s.vz * t);
        c.rotation.set(t * s.spin, t * s.spin * 0.5, 0);
        const m = (c as THREE.Mesh).material as THREE.MeshLambertMaterial;
        m.opacity = Math.max(0, 1 - Math.max(0, t - 1.1) / 0.5);
      });
    }
    if (t > 1.9 && !done.current) { done.current = true; onDone(burst.id); }
  });
  return (
    <group position={burst.at}>
      <group ref={group}>
        {seeds.map((_, i) => (
          <mesh key={i} castShadow>
            <cylinderGeometry args={[0.18, 0.18, 0.05, 12]} />
            <meshLambertMaterial color="#F2B33D" emissive="#7A4E00" emissiveIntensity={0.25} transparent />
          </mesh>
        ))}
      </group>
    </group>
  );
}
