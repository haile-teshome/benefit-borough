"use client";

import { Bloom, EffectComposer, HueSaturation, N8AO, TiltShift2, Vignette } from "@react-three/postprocessing";

// Miniature-diorama look: soft contact shadows (AO), glow on lamps/coins/fireflies,
// a tilt-shift band of focus, and a gentle vignette.
export function PostFX() {
  return (
    <EffectComposer multisampling={4}>
      <N8AO aoRadius={2.5} distanceFalloff={1.2} intensity={2.4} quality="medium" halfRes />
      <Bloom luminanceThreshold={0.9} luminanceSmoothing={0.2} mipmapBlur intensity={0.7} />
      <TiltShift2 blur={0.09} taper={0.6} start={[0.5, 0.0]} end={[0.5, 1.0]} />
      <HueSaturation saturation={0.18} />
      <Vignette offset={0.28} darkness={0.5} />
    </EffectComposer>
  );
}
