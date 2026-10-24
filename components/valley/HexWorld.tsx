"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { farmField, groundAt, snapToTile, TILE, tiles } from "@/lib/valley/hexgrid";
import { farmOrigin, mailboxPosition } from "@/lib/valley/layout";
import { Lamp } from "./Effects";

// KayKit Medieval Hexagon Pack (CC0, Kay Lousberg). Fetched by scripts/fetch-assets.sh.
const HEX = "/models/kaykit/hex/";
const url = (name: string) => `${HEX}${name}.gltf`;

type Placement = { p: [number, number, number]; r?: number; s?: number };

// Every mesh inside a model, with its transform relative to the model root.
function useParts(name: string) {
  const { scene } = useGLTF(url(name));
  return useMemo(() => {
    scene.updateMatrixWorld(true);
    const parts: { geometry: THREE.BufferGeometry; material: THREE.Material; matrix: THREE.Matrix4 }[] = [];
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) parts.push({ geometry: m.geometry, material: m.material as THREE.Material, matrix: m.matrixWorld.clone() });
    });
    return parts;
  }, [scene]);
}

// Draws many copies of one model as instanced meshes (one draw call per sub-mesh).
function Instanced({ name, items, shadows = true, tint }: { name: string; items: Placement[]; shadows?: boolean; tint?: string }) {
  const parts = useParts(name);
  const meshes = useMemo(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    return parts.map((part) => {
      // A tint needs its own material: the pack's models share one texture-atlas material.
      const material = tint ? (part.material as THREE.MeshStandardMaterial).clone() : part.material;
      if (tint) (material as THREE.MeshStandardMaterial).color.set(tint);
      const im = new THREE.InstancedMesh(part.geometry, material, Math.max(1, items.length));
      im.count = items.length;
      items.forEach((it, i) => {
        q.setFromAxisAngle(up, it.r ?? 0);
        const k = (it.s ?? 1) * TILE;
        m.compose(p.set(...it.p), q, s.set(k, k, k)).multiply(part.matrix);
        im.setMatrixAt(i, m);
      });
      im.castShadow = shadows;
      im.receiveShadow = true;
      im.frustumCulled = false;
      return im;
    });
  }, [parts, items, shadows, tint]);
  return <>{meshes.map((im, i) => <primitive key={i} object={im} />)}</>;
}

// A single placed model (buildings, props). shadowOnly models cast shadows but are never drawn.
function Model({ name, p, r = 0, s = 1, shadowOnly = false }: { name: string; p: [number, number, number]; r?: number; s?: number; shadowOnly?: boolean }) {
  const { scene } = useGLTF(url(name));
  const obj = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = !shadowOnly;
      if (shadowOnly) {
        const mat = (m.material as THREE.Material).clone();
        mat.colorWrite = false;
        mat.depthWrite = false;
        m.material = mat;
      }
    });
    return c;
  }, [scene, shadowOnly]);
  return <primitive object={obj} position={p} rotation-y={r} scale={s * TILE} />;
}

// Ground tiles, water, forests, hills and mountains, generated deterministically.
export function HexTerrain({ onPoint, farms }: { onPoint: (p: THREE.Vector3) => void; farms: number[] }) {
  const groups = useMemo(() => {
    const by: Record<string, Placement[]> = { grass: [], water: [], dirt: [] };
    const fieldKeys = new Set<string>();
    // Only claimed farms are tilled; empty land stays grass until a farmer joins.
    for (const f of farms) for (const t of farmField(f)) fieldKeys.add(`${t.x.toFixed(2)},${t.z.toFixed(2)}`);
    for (const t of tiles().values()) {
      const isField = fieldKeys.has(`${t.x.toFixed(2)},${t.z.toFixed(2)}`);
      (by[isField ? "dirt" : t.kind] ??= []).push({ p: [t.x, t.y, t.z], r: isField ? 0 : t.rot });
      if (t.deco && !isField) (by[t.deco] ??= []).push({ p: [t.x, t.y, t.z], r: t.rot });
    }
    return by;
  }, [farms]);
  // An invisible plane catches clicks for click-to-walk; the tiles themselves don't need raycasts.
  return (
    <group>
      <Instanced name="hex_grass" items={groups.grass} shadows={false} tint="#C6E3A0" />
      <Instanced name="hex_water" items={groups.water} shadows={false} />
      <Instanced name="building_dirt" items={groups.dirt} shadows={false} />
      <Instanced name="hex_grass" items={groups.dirt.map((d) => ({ ...d, p: [d.p[0], d.p[1] - 0.02, d.p[2]] as [number, number, number] }))} shadows={false} tint="#C6E3A0" />
      {Object.entries(groups)
        .filter(([k]) => !["grass", "water", "dirt"].includes(k))
        .map(([name, items]) => <Instanced key={name} name={name} items={items} />)}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]} visible={false} onPointerDown={(e) => { e.stopPropagation(); onPoint(e.point); }}>
        <planeGeometry args={[220, 220]} />
        <meshBasicMaterial />
      </mesh>
      <Paths />
    </group>
  );
}

// Worn dirt paths: the main road south and the cross road, as soft flat strips.
function Paths() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 44]} receiveShadow>
        <planeGeometry args={[3.2, 78]} />
        <meshStandardMaterial color="#D9C08E" roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.031, 9]} receiveShadow>
        <planeGeometry args={[66, 2.8]} />
        <meshStandardMaterial color="#D9C08E" roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.032, 0]} receiveShadow>
        <circleGeometry args={[8.5, 40]} />
        <meshStandardMaterial color="#CFC4AE" roughness={1} />
      </mesh>
    </group>
  );
}

// The village square: market, well, tavern, church and a windmill on the hill, plus lamps.
export function Village() {
  const at = (x: number, z: number): [number, number, number] => { const c = snapToTile(x, z); return [c.x, groundAt(c.x, c.z), c.z]; };
  return (
    <group>
      <Model name="building_well_green" p={[-4.5, 0, -1]} s={0.9} />
      <Model name="building_market_green" p={[6, 0, -6]} r={-0.5} s={1.1} />
      <Model name="building_tavern_green" p={[-9, 0, -11]} r={0.3} s={1.4} />
      <Model name="building_church_green" p={[11, 0, -18]} r={-0.4} s={1.4} />
      <Model name="building_windmill_green" p={at(-20, -12)} r={0.6} s={1.5} />
      <Model name="building_watermill_green" p={[25.5, 0, -6]} r={-1.2} s={1.2} />
      <Model name="tent" p={[-6.5, 0, 6]} r={0.6} s={0.8} />
      <Model name="barrel" p={[-3.3, 0, 4.2]} s={0.7} />
      <Model name="crate_A_small" p={[-2.5, 0, 5]} r={0.4} s={0.7} />
      <Model name="sack" p={[5.4, 0, -2.6]} s={0.7} />
      <Lamp position={[5.2, 0, 3.6]} />
      <Lamp position={[-5.6, 0, 3.2]} />
      <Lamp position={[3.2, 0, 9.6]} />
    </group>
  );
}

const HOME_COLOR: Record<string, string> = {
  "#E2574C": "red", "#3E8ED0": "blue", "#F2B33D": "yellow", "#8E5BD0": "blue", "#3FA66B": "green", "#E07BB0": "red", "#2BB3B1": "green", "#C77B3A": "yellow",
};

// A farmer's homestead: a house in their color, a flag, farm props and a letterbox.
export function Farmstead({ farm, color, hasGift }: { farm: number; color: string; hasGift: boolean }) {
  const o = farmOrigin(farm);
  const team = HOME_COLOR[color.toUpperCase()] ?? "red";
  const mb = mailboxPosition(farm);
  return (
    <group>
      <Model name={`building_home_${farm % 2 ? "B" : "A"}_${team}`} p={[o.x, 0, o.z - 8]} r={Math.PI} s={1.6} />
      <Model name={`flag_${team}`} p={[o.x + 5, 0, o.z - 9]} s={1} />
      <Model name="wheelbarrow" p={[o.x - 6, 0, o.z - 6.5]} r={0.8} s={0.8} />
      <Model name="barrel" p={[o.x - 3.6, 0, o.z - 6.2]} s={0.6} />
      <Model name="sack" p={[o.x + 3.4, 0, o.z - 6.4]} r={0.5} s={0.6} />
      <group position={mb}>
        <mesh position={[0, 0.6, 0]} castShadow><boxGeometry args={[0.15, 1.2, 0.15]} /><meshStandardMaterial color="#6E4B2E" roughness={1} /></mesh>
        <mesh position={[0, 1.3, 0]} castShadow><boxGeometry args={[0.7, 0.45, 0.45]} /><meshStandardMaterial color={color} roughness={0.8} /></mesh>
        {hasGift && <Envelope />}
      </group>
    </group>
  );
}

function Envelope() {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (g.current) { const t = clock.getElapsedTime(); g.current.position.y = 1.95 + Math.sin(t * 3) * 0.08; g.current.rotation.y = Math.sin(t * 1.2) * 0.4; }
  });
  return (
    <group ref={g} position={[0, 1.95, 0]}>
      <mesh castShadow><boxGeometry args={[0.7, 0.46, 0.04]} /><meshStandardMaterial color="#FFFDF6" roughness={0.9} /></mesh>
      <mesh position={[0, 0.06, 0.025]} rotation-z={Math.PI / 4}><boxGeometry args={[0.36, 0.36, 0.01]} /><meshStandardMaterial color="#F1E8D2" /></mesh>
      <mesh position={[0, -0.02, 0.04]} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.08, 0.08, 0.03, 12]} /><meshStandardMaterial color="#B3261E" /></mesh>
    </group>
  );
}

// KayKit clouds drifting overhead. They'd sit at camera height and block the view, so only
// their shadows are drawn: soft patches sweeping across the valley.
export function Clouds() {
  const group = useRef<THREE.Group>(null);
  const clouds = useMemo(
    () => Array.from({ length: 6 }, (_, i) => ({ x: -100 + i * 36 + (i % 3) * 7, z: -40 + ((i * 37) % 120), y: 24 + (i % 4) * 2.5, s: 0.9 + (i % 3) * 0.3, big: i % 2 === 0, speed: 0.8 + (i % 4) * 0.3 })),
    [],
  );
  useFrame((_, dt) => {
    group.current?.children.forEach((c, i) => {
      c.position.x += clouds[i].speed * dt;
      if (c.position.x > 115) c.position.x = -115;
    });
  });
  return (
    <group ref={group}>
      {clouds.map((c, i) => (
        <group key={i} position={[c.x, c.y, c.z]}>
          <Model name={c.big ? "cloud_big" : "cloud_small"} p={[0, 0, 0]} s={c.s} shadowOnly />
        </group>
      ))}
    </group>
  );
}

const PRELOAD = [
  "hex_grass", "hex_water", "building_dirt", "building_well_green", "building_market_green", "building_tavern_green", "building_church_green",
  "building_windmill_green", "building_watermill_green", "tent", "barrel", "crate_A_small", "sack", "wheelbarrow", "cloud_big", "cloud_small",
];
PRELOAD.forEach((n) => useGLTF.preload(url(n)));
