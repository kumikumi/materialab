import { defineGenerator, type ParamValues } from '../engine/types';

const n = (p: ParamValues, k: string) => Number(p[k]);

/** Concrete slab with a glossy paint / epoxy coating that is chipped, scuffed and scratched. */
export const paintedConcreteGenerator = defineGenerator({
  id: 'painted-concrete',
  params: {
    // ---- substrate
    tile: { type: 'float', group: 'Substrate', label: 'Tile size', default: 2.4, min: 0.5, max: 6, step: 0.1, unit: 'm', help: 'Saw-cut joints run along the tile border' },
    concreteColor: { type: 'color', group: 'Substrate', label: 'Concrete', default: '#9a9791' },
    relief: { type: 'float', group: 'Substrate', label: 'Relief', default: 0.35, min: 0, max: 3, step: 0.01, unit: 'mm' },
    waviness: { type: 'float', group: 'Substrate', label: 'Waviness', default: 0.8, min: 0, max: 5, step: 0.05, unit: 'mm' },
    bugholes: { type: 'float', group: 'Substrate', label: 'Pores / dm²', default: 0.6, min: 0, max: 6, step: 0.05 },
    sawCuts: { type: 'bool', group: 'Substrate', label: 'Saw-cut joints', default: true },
    cutWidth: { type: 'float', group: 'Substrate', label: 'Cut width', default: 4, min: 1, max: 12, step: 0.1, unit: 'mm' },
    // ---- paint
    paintColor: { type: 'color', group: 'Paint', label: 'Color', default: '#4f6f7c' },
    paintTone: { type: 'float', group: 'Paint', label: 'Tone variation', default: 0.05, min: 0, max: 0.3, step: 0.005 },
    paintRoughness: { type: 'float', group: 'Paint', label: 'Roughness', default: 0.1, min: 0, max: 1, step: 0.005 },
    thickness: { type: 'float', group: 'Paint', label: 'Thickness', default: 0.35, min: 0.02, max: 3, step: 0.01, unit: 'mm' },
    leveling: { type: 'float', group: 'Paint', label: 'Leveling', default: 0.75, min: 0, max: 1, step: 0.01, help: 'How much the coat smooths out the concrete relief' },
    orangePeel: { type: 'float', group: 'Paint', label: 'Orange peel', default: 0.012, min: 0, max: 0.1, step: 0.001, unit: 'mm' },
    peelSize: { type: 'float', group: 'Paint', label: 'Peel size', default: 3, min: 0.5, max: 12, step: 0.1, unit: 'mm' },
    primerColor: { type: 'color', group: 'Paint', label: 'Primer', default: '#a9a69e' },
    // ---- wear
    chips: { type: 'float', group: 'Wear', label: 'Chipped area', default: 0.35, min: 0, max: 1, step: 0.01 },
    chipScale: { type: 'float', group: 'Wear', label: 'Chip scale', default: 0.06, min: 0.005, max: 0.4, step: 0.005, unit: 'm' },
    traffic: { type: 'float', group: 'Wear', label: 'Traffic wear', default: 0.5, min: 0, max: 1, step: 0.01, help: 'Dulls the gloss in patches' },
    scratches: { type: 'float', group: 'Wear', label: 'Scratches', default: 0.5, min: 0, max: 1, step: 0.01 },
    scuffs: { type: 'float', group: 'Wear', label: 'Scuff marks', default: 0.35, min: 0, max: 1, step: 0.01 },
    dirt: { type: 'float', group: 'Wear', label: 'Dirt', default: 0.3, min: 0, max: 1, step: 0.01 },
    cracks: { type: 'float', group: 'Wear', label: 'Cracks', default: 0.25, min: 0, max: 1, step: 0.01 },
  },
  tileSize: (p) => [n(p, 'tile'), n(p, 'tile')],
  extras: () => ({ parallax: false }),
  glsl: /* glsl */ `
void surface(vec2 uv, inout Surface s) {
  ConcreteParams cp;
  cp.color = concreteColor;
  cp.mottle = 0.5; cp.mottleScale = 0.06; cp.sand = 0.6;
  cp.aggregate = 0.15; cp.aggregateSize = 0.008;
  cp.aggColorA = concreteColor * 0.85; cp.aggColorB = concreteColor * 0.7;
  cp.bugholes = bugholes; cp.bugholeSize = 0.003;
  cp.relief = relief; cp.waviness = waviness; cp.octaveScale = 1.0;
  ConcreteSample raw = concreteSurface(uv, cp, 1.0);
  // the coat bridges the fine texture: only the coarse relief shows through
  cp.octaveScale = 0.0;
  cp.relief = relief * (1.0 - leveling);
  cp.bugholes = 0.0;
  ConcreteSample under = concreteSurface(uv, cp, 1.0);
  float hPaint = mix(raw.height, under.height, leveling) + thickness;
  hPaint += orangePeel * (0.7 * pfbm(uv, F(peelSize * 0.001), 3, 0.5, 5.0) + 0.3 * pnoise(uv, F(peelSize * 0.0025), 6.0));
  // paint sags into pores
  hPaint -= raw.cavity * (1.0 - leveling) * 0.6;

  // ---------------- chips: clustered in worn zones, with ragged edges
  float zone = sat(0.5 + 0.9 * pfbm(uv, F(chipScale * 8.0), 4, 0.5, 10.0));
  float cn = pfbm(uv, F(chipScale), 5, 0.55, 11.0) + 0.35 * pfbm(uv, F(chipScale * 0.2), 3, 0.5, 12.0);
  float thr = 0.62 - 0.5 * chips * zone;
  float chipped = smoothstep(thr, thr + 0.015, cn) * step(0.001, chips);
  float primer = smoothstep(thr - 0.05, thr - 0.01, cn) * (1.0 - chipped);

  // ---------------- cracks through slab and paint
  vec2 cr = pcracks(uv, F(0.6), 0.002, 1.0, 0.15 + 0.5 * cracks, 20.0);
  float crack = cr.x * step(0.001, cracks);
  // paint flakes off along the crack edges
  float crackChip = (1.0 - smoothstep(0.0, 0.025, cr.y)) * smoothstep(0.55, 0.75, pnoise(uv, F(0.02), 22.0) + 0.5) * step(0.001, cracks);

  // ---------------- compose
  vec3 paint = paintColor * (1.0 + paintTone * (pfbm(uv, F(0.3), 4, 0.5, 30.0) + 0.5 * pfbm(uv, F(0.05), 3, 0.5, 31.0)));
  vec3 col = paint;
  float rough = paintRoughness;
  float h = hPaint;
  col = mix(col, primerColor * (0.9 + 0.2 * raw.color.r), primer * 0.7);
  h -= primer * thickness * 0.4;
  float bare = max(chipped, crackChip * 0.8);
  col = mix(col, raw.color * 0.95, bare);
  rough = mix(rough, 0.88 + raw.rough, bare);
  h = mix(h, raw.height, bare);

  // traffic dulls the gloss in broad patches and lanes
  float lanes = sat(0.5 + 0.8 * pfbm(uv, F(vec2(0.5, 1.2)), 4, 0.5, 40.0));
  rough += traffic * 0.22 * smoothstep(0.35, 0.9, lanes) * (1.0 - bare);
  col = mix(col, col * 1.04 + 0.01, traffic * 0.4 * smoothstep(0.5, 1.0, lanes) * (1.0 - bare));

  // fine scratches in the coat: lighter and rougher
  float sc = pscratches(uv, F(0.05), 0.6, 0.9, 0.01, 0.4, 1.4, 50.0) * 0.7
           + pscratches(uv, F(0.12), 0.35, 0.9, 0.006, -0.3, 1.2, 51.0) * 0.5;
  sc *= scratches * (1.0 - bare);
  rough += 0.35 * sc;
  col = mix(col, col * 1.12 + 0.03, sc * 0.6);
  h -= sc * 0.02;

  // rubber scuffs: short dark smudges, mostly along one direction
  float scN = pfbm(uv + 0.02 * pfbm2(uv, F(0.1), 3, 0.5, 60.0), F(vec2(0.18, 0.05)), 4, 0.5, 61.0);
  float scuff = pow(smoothstep(0.35, 0.8, scN), 2.0) * smoothstep(0.55, 0.8, pvalue(uv, F(0.35), 62.0)) * scuffs;
  col = mix(col, vec3(0.08, 0.08, 0.08), scuff * 0.45);
  rough = mix(rough, 0.5, scuff * 0.5);

  // saw-cut control joints on the tile border
  float cutMask = 0.0;
  if (sawCuts) {
    vec2 p = uv * u_tileSize;
    vec2 dd = min(p, u_tileSize - p);
    float dist = min(dd.x, dd.y);
    float hw = cutWidth * 0.0005;
    cutMask = 1.0 - smoothstep(hw - 0.0003, hw, dist);
    float lip = (1.0 - smoothstep(hw, hw + 0.004, dist)) * (1.0 - cutMask);
    col = mix(col, raw.color * 0.9, lip * 0.6 * sat(0.5 + pnoise(uv, F(0.01), 70.0)));
    rough = mix(rough, 0.9, lip * 0.5);
    col = mix(col, vec3(0.08, 0.08, 0.08), cutMask);
    h = mix(h, -12.0, cutMask);
    rough = mix(rough, 0.95, cutMask);
  }

  // dirt settles into low spots, chips, cracks and joints
  float low = sat(bare * 0.6 + crack + raw.cavity * 0.5);
  float dm = pdirt(uv, low, dirt, 80.0);
  col = mix(col, col * vec3(0.55, 0.52, 0.48), dm * 0.7);
  rough = mix(rough, 0.95, dm * 0.6);

  col = mix(col, vec3(0.06), crack * 0.9);
  h -= crack * 1.2;

  s.albedo = col;
  s.height = h;
  s.roughness = clamp(rough, 0.02, 1.0);
  s.metallic = 0.0;
  s.ao = 1.0 - 0.5 * crack - 0.3 * raw.cavity * bare;
}
`,
});
