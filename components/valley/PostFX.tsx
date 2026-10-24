"use client";

import { Bloom, ColorDepth, EffectComposer, HueSaturation, N8AO, Vignette } from "@react-three/postprocessing";

// Pixel-art finish: soft contact shadows, a little glow on lamps/coins/fireflies, a slightly
// reduced color depth for that hand-picked-palette feel, warm saturation and a soft vignette.
// No anti-aliasing or blur: the canvas is drawn at 1/3 resolution and upscaled with hard pixels.
export function PostFX() {
  return (
    <EffectComposer multisampling={0}>
      <N8AO aoRadius={2} distanceFalloff={1} intensity={1.8} quality="low" />
      <Bloom luminanceThreshold={0.85} luminanceSmoothing={0.15} intensity={0.5} />
      <HueSaturation saturation={0.22} />
      <ColorDepth bits={18} />
      <Vignette offset={0.3} darkness={0.45} />
    </EffectComposer>
  );
}
