import { defineGenerator, type ParamValues } from '../engine/types';

const n = (p: ParamValues, k: string) => Number(p[k]);

/** Diamond / tread plate: raised lens-shaped lugs in alternating directions. */
export const treadPlateGenerator = defineGenerator({
  id: 'tread-plate',
  params: {
    pitch: { type: 'float', group: 'Pattern', label: 'Pitch', default: 28, min: 8, max: 80, step: 0.5, unit: 'mm' },
    repeats: { type: 'int', group: 'Pattern', label: 'Cells per tile', default: 18, min: 2, max: 64, help: 'Rounded up to an even number so the pattern tiles' },
    lugLength: { type: 'float', group: 'Pattern', label: 'Lug length', default: 0.95, min: 0.3, max: 1.3, step: 0.01, help: 'Relative to the pitch' },
    lugWidth: { type: 'float', group: 'Pattern', label: 'Lug width', default: 0.2, min: 0.05, max: 0.5, step: 0.005 },
    lugHeight: { type: 'float', group: 'Pattern', label: 'Lug height', default: 1.3, min: 0.1, max: 4, step: 0.05, unit: 'mm' },
    lugRound: { type: 'float', group: 'Pattern', label: 'Lug roundness', default: 0.6, min: 0, max: 1, step: 0.01 },
    metalColor: { type: 'color', group: 'Metal', label: 'Color (F0)', default: '#d9dbdd' },
    roughness: { type: 'float', group: 'Metal', label: 'Roughness', default: 0.42, min: 0, max: 1, step: 0.005 },
    rolling: { type: 'float', group: 'Metal', label: 'Mill finish', default: 0.5, min: 0, max: 1, step: 0.01, help: 'Rolling streaks along u' },
    polish: { type: 'float', group: 'Wear', label: 'Worn lug tops', default: 0.6, min: 0, max: 1, step: 0.01 },
    scratches: { type: 'float', group: 'Wear', label: 'Scratches', default: 0.5, min: 0, max: 1, step: 0.01 },
    dirt: { type: 'float', group: 'Wear', label: 'Dirt', default: 0.4, min: 0, max: 1, step: 0.01 },
    dirtColor: { type: 'color', group: 'Wear', label: 'Dirt color', default: '#4a4540' },
    oxidation: { type: 'float', group: 'Wear', label: 'Oxidation', default: 0.25, min: 0, max: 1, step: 0.01 },
  },
  tileSize: (p) => {
    // even cell count so the alternating pattern wraps
    const t = (n(p, 'pitch') / 1000) * 2 * Math.ceil(n(p, 'repeats') / 2);
    return [t, t];
  },
  extras: () => ({ parallax: true }),
  glsl: /* glsl */ `
void surface(vec2 uv, inout Surface s) {
  float P = pitch * 0.001;
  vec2 g = uv * float(repeats + (repeats & 1));
  vec2 cellI = floor(g);
  vec2 q = (fract(g) - 0.5) * P;             // meters from the cell center
  bool flip = mod(cellI.x + cellI.y, 2.0) > 0.5;
  // lens-shaped lug along a diagonal, alternating direction per cell
  vec2 lq = rot2(flip ? -0.7853982 : 0.7853982) * q;
  float L = lugLength * P * 0.5, W = lugWidth * P * 0.5;
  // vesica: intersection of two circles gives pointed ends
  float rC = (L * L + W * W) / (2.0 * W);
  float dC = rC - W;
  float d1 = length(lq - vec2(0.0, -dC)) - rC;
  float d2 = length(lq - vec2(0.0, dC)) - rC;
  float dv = max(d1, d2);                    // < 0 inside the lug
  float inside = sat(-dv / W);
  float profile = mix(step(0.0001, inside), sqrt(inside) , lugRound);
  profile = smoothstep(0.0, 1.0, profile);
  float lugH = lugHeight * profile;
  // a fillet at the lug base
  lugH += lugHeight * 0.18 * (1.0 - smoothstep(0.0, W * 0.9, max(dv, 0.0))) * step(0.0, dv);

  vec3 col = metalColor;
  float rough = roughness;
  float h = lugH;
  // mill finish: rolling streaks
  float roll = pnoise(uv, F(vec2(0.3, 0.0006)), 1.0) * 0.6 + pnoise(uv, F(vec2(0.08, 0.0015)), 2.0) * 0.4;
  rough += rolling * 0.08 * roll;
  col *= 1.0 + rolling * 0.03 * roll;
  h += rolling * 0.003 * roll;
  // sheet waviness
  h += 0.4 * pfbm(uv, F(0.4), 3, 0.5, 3.0);

  // traffic polishes the tops of the lugs
  float top = smoothstep(0.35, 0.9, profile) * sat(0.4 + 0.8 * pfbm(uv, F(0.25), 4, 0.5, 4.0));
  rough = mix(rough, 0.16, polish * top);
  col = mix(col, col * 1.05, polish * top);

  float sc = pscratches(uv, F(0.04), 0.6 * scratches, 0.95, 0.01, 0.0, TAU, 5.0) + pscratches(uv, F(0.1), 0.4 * scratches, 1.0, 0.004, 0.3, 0.8, 6.0);
  sc = sat(sc) * (1.0 - top * 0.5);
  rough += 0.2 * sc;
  col *= 1.0 + 0.05 * sc;
  h -= 0.005 * sc;

  // dirt collects around the lug bases and in the flat field
  float low = 1.0 - smoothstep(0.0, 0.3, profile);
  float fillet = (1.0 - smoothstep(0.0, W * 1.2, max(dv, 0.0))) * step(0.0, dv);
  float dm = pdirt(uv, fillet * 0.9 + low * 0.25, dirt, 7.0);
  col = mix(col, dirtColor, dm * 0.8);
  rough = mix(rough, 0.85, dm);
  float metal = 1.0 - dm * 0.9;

  float ox = smoothstep(0.5, 0.85, 0.5 + 0.8 * pfbm(uv, F(0.12), 5, 0.55, 8.0)) * oxidation * (1.0 - top);
  col = mix(col, col * vec3(0.78, 0.8, 0.82), ox);
  rough = mix(rough, 0.6, ox);

  s.albedo = clamp(col, 0.0, 1.0);
  s.height = h;
  s.roughness = clamp(rough, 0.02, 1.0);
  s.metallic = metal;
  s.ao = 1.0 - 0.3 * fillet;
}
`,
});
