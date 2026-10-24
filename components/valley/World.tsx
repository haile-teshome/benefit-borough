"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { farmOrigin, mailboxPosition } from "@/lib/valley/layout";

// Deterministic scatter so every client sees the same trees and flowers.
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function Ground({ onPoint }: { onPoint: (p: THREE.Vector3) => void }) {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow onPointerDown={(e) => { e.stopPropagation(); onPoint(e.point); }}>
        <planeGeometry args={[220, 220]} />
        <meshLambertMaterial color="#86C35A" />
      </mesh>
      {/* Main road from the square south to the farms, and a cross road. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 40]} receiveShadow>
        <planeGeometry args={[4, 80]} />
        <meshLambertMaterial color="#D9B98A" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.011, 9]} receiveShadow>
        <planeGeometry args={[70, 3.2]} />
        <meshLambertMaterial color="#D9B98A" />
      </mesh>
    </group>
  );
}

export function Village() {
  return (
    <group>
      {/* Stone square where the Elder stands. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]} receiveShadow>
        <circleGeometry args={[7, 28]} />
        <meshLambertMaterial color="#C9C2B4" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 0]}>
        <ringGeometry args={[6.6, 7, 28]} />
        <meshLambertMaterial color="#A89F8E" />
      </mesh>
      {/* Notice board */}
      <group position={[-4.5, 0, -2.5]} rotation-y={0.4}>
        <mesh position={[-0.9, 0.9, 0]} castShadow><boxGeometry args={[0.15, 1.8, 0.15]} /><meshLambertMaterial color="#7A5A36" /></mesh>
        <mesh position={[0.9, 0.9, 0]} castShadow><boxGeometry args={[0.15, 1.8, 0.15]} /><meshLambertMaterial color="#7A5A36" /></mesh>
        <mesh position={[0, 1.5, 0]} castShadow><boxGeometry args={[2.1, 1.0, 0.12]} /><meshLambertMaterial color="#B98A55" /></mesh>
        <mesh position={[-0.4, 1.55, 0.07]}><boxGeometry args={[0.6, 0.5, 0.02]} /><meshLambertMaterial color="#F4EBD0" /></mesh>
        <mesh position={[0.45, 1.45, 0.07]}><boxGeometry args={[0.5, 0.4, 0.02]} /><meshLambertMaterial color="#F4EBD0" /></mesh>
      </group>
      {/* Pond */}
      <mesh rotation-x={-Math.PI / 2} position={[16, 0.02, -8]}>
        <circleGeometry args={[6, 24]} />
        <meshLambertMaterial color="#5FA8D3" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[16, 0.015, -8]}>
        <circleGeometry args={[6.6, 24]} />
        <meshLambertMaterial color="#C9B48A" />
      </mesh>
      <Forest />
      <Flowers />
    </group>
  );
}

function Forest() {
  const trees = useMemo(() => {
    const r = rng(7);
    const out: { x: number; z: number; s: number; tint: number }[] = [];
    while (out.length < 90) {
      const x = (r() - 0.5) * 200;
      const z = (r() - 0.5) * 200;
      // Keep clear of the square, the roads and the farm rows.
      if (Math.abs(x) < 36 && z > -14 && z < 92) continue;
      if (Math.hypot(x - 16, z + 8) < 9) continue;
      out.push({ x, z, s: 0.8 + r() * 0.8, tint: r() });
    }
    return out;
  }, []);
  return (
    <group>
      {trees.map((t, i) => (
        <group key={i} position={[t.x, 0, t.z]} scale={t.s}>
          <mesh position={[0, 0.7, 0]} castShadow><cylinderGeometry args={[0.22, 0.3, 1.4, 6]} /><meshLambertMaterial color="#7A5232" /></mesh>
          <mesh position={[0, 2.2, 0]} castShadow><coneGeometry args={[1.4, 2.4, 7]} /><meshLambertMaterial color={t.tint > 0.5 ? "#2F7D3A" : "#3E8F45"} flatShading /></mesh>
          <mesh position={[0, 3.3, 0]} castShadow><coneGeometry args={[1.0, 1.8, 7]} /><meshLambertMaterial color={t.tint > 0.5 ? "#37884A" : "#4A9E4E"} flatShading /></mesh>
        </group>
      ))}
    </group>
  );
}

function Flowers() {
  const mesh = useMemo(() => {
    const r = rng(42);
    const geo = new THREE.SphereGeometry(0.12, 6, 4);
    const mat = new THREE.MeshLambertMaterial();
    const inst = new THREE.InstancedMesh(geo, mat, 260);
    const m = new THREE.Matrix4();
    const colors = ["#F7E26B", "#F59AB5", "#FFFFFF", "#B79CF2"].map((c) => new THREE.Color(c));
    for (let i = 0; i < 260; i++) {
      const x = (r() - 0.5) * 120;
      const z = (r() - 0.5) * 120 - 10;
      m.setPosition(x, 0.12, z);
      inst.setMatrixAt(i, m);
      inst.setColorAt(i, colors[i % colors.length]);
    }
    return inst;
  }, []);
  return <primitive object={mesh} />;
}

export function Farmstead({ farm, color, name, hasGift }: { farm: number; color: string; name: string; hasGift: boolean }) {
  const o = farmOrigin(farm);
  const mb = mailboxPosition(farm);
  return (
    <group>
      {/* Tilled field */}
      <mesh rotation-x={-Math.PI / 2} position={[o.x, 0.02, o.z + 2]} receiveShadow>
        <planeGeometry args={[13, 9]} />
        <meshLambertMaterial color="#8C6A45" />
      </mesh>
      {/* Farmhouse */}
      <group position={[o.x, 0, o.z - 8]}>
        <mesh position={[0, 1.4, 0]} castShadow receiveShadow><boxGeometry args={[5, 2.8, 3.6]} /><meshLambertMaterial color="#EFE3C8" /></mesh>
        <mesh position={[0, 3.6, 0]} rotation-y={Math.PI / 4} castShadow><coneGeometry args={[4.0, 1.8, 4]} /><meshLambertMaterial color={color} flatShading /></mesh>
        <mesh position={[0, 0.9, 1.81]}><boxGeometry args={[1, 1.8, 0.05]} /><meshLambertMaterial color="#7A5232" /></mesh>
        <mesh position={[-1.6, 1.6, 1.81]}><boxGeometry args={[0.9, 0.8, 0.05]} /><meshLambertMaterial color="#A7D8F0" /></mesh>
        <mesh position={[1.6, 1.6, 1.81]}><boxGeometry args={[0.9, 0.8, 0.05]} /><meshLambertMaterial color="#A7D8F0" /></mesh>
      </group>
      <Fence x={o.x} z={o.z + 2} w={15} d={11} />
      {/* Mailbox; a present sits on it when a gift is waiting. */}
      <group position={mb}>
        <mesh position={[0, 0.6, 0]} castShadow><boxGeometry args={[0.15, 1.2, 0.15]} /><meshLambertMaterial color="#7A5232" /></mesh>
        <mesh position={[0, 1.3, 0]} castShadow><boxGeometry args={[0.7, 0.45, 0.45]} /><meshLambertMaterial color={color} /></mesh>
        {hasGift && (
          <group position={[0, 1.85, 0]}>
            <mesh castShadow><boxGeometry args={[0.5, 0.45, 0.5]} /><meshLambertMaterial color="#E2574C" /></mesh>
            <mesh><boxGeometry args={[0.52, 0.47, 0.12]} /><meshLambertMaterial color="#F7E26B" /></mesh>
            <mesh><boxGeometry args={[0.12, 0.47, 0.52]} /><meshLambertMaterial color="#F7E26B" /></mesh>
          </group>
        )}
      </group>
      <mesh position={[o.x - 6.5, 1.0, o.z - 6]} castShadow>
        <boxGeometry args={[2.2, 0.6, 0.12]} />
        <meshLambertMaterial color="#B98A55" />
      </mesh>
      <mesh position={[o.x - 6.5, 0.4, o.z - 6]}>
        <boxGeometry args={[0.12, 0.8, 0.12]} />
        <meshLambertMaterial color="#7A5232" />
      </mesh>
      <group name={`sign-${name}`} />
    </group>
  );
}

function Fence({ x, z, w, d }: { x: number; z: number; w: number; d: number }) {
  const posts: [number, number][] = [];
  for (let i = 0; i <= w; i += 1.5) { posts.push([x - w / 2 + i, z - d / 2]); posts.push([x - w / 2 + i, z + d / 2]); }
  for (let i = 1.5; i < d; i += 1.5) { posts.push([x - w / 2, z - d / 2 + i]); posts.push([x + w / 2, z - d / 2 + i]); }
  return (
    <group>
      {posts.map(([px, pz], i) => (
        <mesh key={i} position={[px, 0.45, pz]} castShadow><boxGeometry args={[0.16, 0.9, 0.16]} /><meshLambertMaterial color="#C49A6C" /></mesh>
      ))}
      {[[x, z - d / 2, w, 0], [x, z + d / 2, w, 0], [x - w / 2, z, d, 1], [x + w / 2, z, d, 1]].map(([cx, cz, len, rot], i) => (
        <mesh key={`r${i}`} position={[cx, 0.6, cz]} rotation-y={rot ? Math.PI / 2 : 0}><boxGeometry args={[len, 0.1, 0.08]} /><meshLambertMaterial color="#C49A6C" /></mesh>
      ))}
    </group>
  );
}
