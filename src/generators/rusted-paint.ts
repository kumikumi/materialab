import { defineGenerator, type ParamValues } from '../engine/types';

const n = (p: ParamValues, k: string) => Number(p[k]);

/** Painted steel that is rusting through: blisters, flaking, rust streaks and pitting. */
export const rustedPaintGenerator = defineGenerator({
  id: 'rusted-paint',
  params: {
    tile: { type: 'float', group: 'Base', label: 'Tile size', default: 1, min: 0.1, max: 4, step: 0.05, unit: 'm' },
    steelColor: { type: 'color', group: 'Base', label: 'Bare steel (F0)', default: '#9fa2a4' },
    // ---- paint
    paintColor: { type: 'color', group: 'Paint', label: 'Color', default: '#3e6b5a' },
    paintRoughness: { type: 'float', group: 'Paint', label: 'Roughness', default: 0.42, min: 0, max: 1, step: 0.005 },
    fade: { type: 'float', group: 'Paint', label: 'Sun fading', default: 0.35, min: 0, max: 1, step: 0.01, help: 'Chalky, lighter, rougher paint' },
    thickness: { type: 'float', group: 'Paint', label: 'Thickness', default: 0.25, min: 0.02, max: 2, step: 0.01, unit: 'mm' },
    primerColor: { type: 'color', group: 'Paint', label: 'Primer', default: '#8a4a36' },
    // ---- rust
    rust: { type: 'float', group: 'Rust', label: 'Rust amount', default: 0.45, min: 0, max: 1, step: 0.01 },
    rustScale: { type: 'float', group: 'Rust', label: 'Patch scale', default: 0.18, min: 0.02, max: 1, step: 0.005, unit: 'm' },
    blisters: { type: 'float', group: 'Rust', label: 'Blisters', default: 0.5, min: 0, max: 1, step: 0.01 },
    flaking: { type: 'float', group: 'Rust', label: 'Flaking', default: 0.5, min: 0, max: 1, step: 0.01, help: 'Paint peeled off in larger flakes' },
    rustDark: { type: 'color', group: 'Rust', label: 'Dark rust', default: '#3f2418' },
    rustMid: { type: 'color', group: 'Rust', label: 'Rust', default: '#7a3e1f' },
    rustBright: { type: 'color', group: 'Rust', label: 'Bright rust', default: '#b0652e' },
    scale: { type: 'float', group: 'Rust', label: 'Rust scale relief', default: 0.35, min: 0, max: 2, step: 0.01, unit: 'mm' },
    pitting: { type: 'float', group: 'Rust', label: 'Pitting', default: 0.4, min: 0, max: 1, step: 0.01 },
    streaks: { type: 'float', group: 'Rust', label: 'Rust streaks', default: 0.5, min: 0, max: 1, step: 0.01, help: 'Stains running down (−v)' },
    bareSteel: { type: 'float', group: 'Rust', label: 'Worn bare steel', default: 0.15, min: 0, max: 1, step: 0.01 },
  },
  tileSize: (p) => [n(p, 'tile'), n(p, 'tile')],
  extras: () => ({ parallax: false }),
  glsl: /* glsl */ `
void surface(vec2 uv, inout Surface s) {
  // ---------------- where the corrosion is
  float zone = 0.5 + 0.7 * pfbm(uv, F(rustScale * 3.0), 4, 0.5, 1.0);
  float rn = pfbm(uv, F(rustScale), 6, 0.55, 2.0) + 0.3 * pfbm(uv, F(rustScale * 0.15), 4, 0.5, 3.0);
  float thr = 0.5 - 1.0 * rust * zone;
  float corroded = smoothstep(thr, thr + 0.04, rn);            // paint gone, rust exposed
  float halo = smoothstep(thr - 0.18, thr, rn) * (1.0 - corroded); // stained, blistered paint around
  // larger flakes that peeled off with sharp edges
  float fl = pfbm(uv + 0.05 * pfbm2(uv, F(0.05), 3, 0.5, 4.0), F(rustScale * 0.6), 5, 0.6, 5.0);
  float flake = smoothstep(0.52, 0.535, fl + 0.35 * flaking * zone - 0.35) * step(0.001, flaking);
  flake *= 1.0 - corroded;
  float flakeEdge = smoothstep(0.47, 0.52, fl + 0.35 * flaking * zone - 0.35) * (1.0 - flake) * (1.0 - corroded) * step(0.001, flaking);

  // ---------------- rust surface
  float rt = pfbm(uv, F(0.01), 5, 0.6, 6.0);
  float rt2 = pfbm(uv, F(0.002), 3, 0.5, 7.0);
  vec3 rustCol = mix(rustDark, rustMid, sat(0.5 + 1.2 * rt));
  rustCol = mix(rustCol, rustBright, smoothstep(0.2, 0.6, rt2 + 0.3 * rt) * 0.7);
  float pit = pspeckle(uv, F(0.003), 0.45 * pitting, 0.4, 0.5, 8.0);
  float hRust = scale * (0.6 * rt + 0.4 * rt2) - pit * 0.25;
  rustCol = mix(rustCol, rustDark * 0.6, pit * 0.7);
  // under flakes: thin rust over grey steel, with primer remnants
  vec3 underCol = mix(steelColor * 0.55, rustMid, sat(0.4 + rt));
  underCol = mix(underCol, primerColor, smoothstep(0.1, 0.4, rt2) * 0.6);

  // ---------------- paint
  float peel = pfbm(uv, F(0.003), 3, 0.5, 9.0);
  vec3 paint = paintColor * (1.0 + 0.06 * pfbm(uv, F(0.2), 4, 0.5, 10.0));
  float chalk = fade * sat(0.5 + 0.8 * pfbm(uv, F(0.3), 4, 0.5, 11.0));
  paint = mix(paint, mix(paint, vec3(0.78), 0.35), chalk);
  float hPaint = thickness + 0.01 * peel;
  // blisters: bubbles in the paint near corrosion
  float bl = pspeckle(uv, F(0.008), 0.8 * blisters, 0.45, 1.0, 12.0) * halo;
  hPaint += bl * 0.25;
  // rust bleeds into the paint around the damage
  paint = mix(paint, mix(rustMid, rustBright, 0.3), halo * 0.55 * sat(0.5 + rt));

  // ---------------- rust streaks running down from the damage
  float st = 0.0;
  if (streaks > 0.0) {
    // stretch a copy of the corrosion field upwards: stains appear below rust spots
    float up = pfbm(uv + vec2(0.0, 0.08 / u_tileSize.y), F(vec2(rustScale * 0.4, rustScale * 4.0)), 4, 0.55, 13.0);
    st = smoothstep(0.1, 0.6, up + 0.4 * corroded) * pstreaks(uv, vec2(F(0.02).x, F(0.4).y), 14.0);
    st *= streaks;
  }
  paint = mix(paint, paint * vec3(0.72, 0.55, 0.42) + rustMid * 0.15, st * 0.6);

  // ---------------- compose layers
  vec3 col = paint;
  float rough = mix(paintRoughness, 0.8, chalk * 0.8) + 0.06 * peel;
  float metal = 0.0;
  float h = hPaint;

  col = mix(col, underCol, flake);
  rough = mix(rough, 0.7, flake);
  h = mix(h, 0.02 * rt, flake);
  col = mix(col, col * 0.75, flakeEdge * 0.5);
  h += flakeEdge * 0.05;

  col = mix(col, rustCol, corroded);
  rough = mix(rough, 0.92 - 0.1 * rt2, corroded);
  h = mix(h, hRust, corroded);

  // bare steel worn through where rust scale fell off
  float bare = smoothstep(0.55, 0.75, 0.5 + 0.8 * pfbm(uv, F(0.03), 4, 0.5, 15.0)) * corroded * bareSteel;
  col = mix(col, steelColor * (0.8 + 0.2 * rt2), bare);
  rough = mix(rough, 0.45, bare);
  metal = bare;

  s.albedo = clamp(col, 0.0, 1.0);
  s.height = h;
  s.roughness = clamp(rough, 0.02, 1.0);
  s.metallic = metal;
  s.ao = 1.0 - 0.3 * pit * corroded;
}
`,
});
