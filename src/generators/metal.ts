import { defineGenerator, type ParamValues } from '../engine/types';

const n = (p: ParamValues, k: string) => Number(p[k]);

/**
 * Bare metal sheet: brushed, polished, hammered or hot-dip galvanized, with
 * scratches, smudges and tarnish. Brushing runs along the texture's u axis
 * (and the exported anisotropy follows the tangent).
 */
export const metalGenerator = defineGenerator({
  id: 'metal',
  params: {
    tile: { type: 'float', group: 'Base', label: 'Tile size', default: 0.5, min: 0.05, max: 3, step: 0.01, unit: 'm' },
    metalColor: { type: 'color', group: 'Base', label: 'Color (F0)', default: '#d6d8da', help: 'sRGB reflectance, e.g. aluminium #f0f1f1, steel #c4c7c9, copper #f9cfbd, gold #ffdf9a' },
    roughness: { type: 'float', group: 'Base', label: 'Roughness', default: 0.3, min: 0, max: 1, step: 0.005 },
    toneVar: { type: 'float', group: 'Base', label: 'Tone variation', default: 0.04, min: 0, max: 0.3, step: 0.005 },
    anisotropy: { type: 'float', group: 'Base', label: 'Anisotropy', default: 0.6, min: 0, max: 1, step: 0.01, help: 'Exported as anisotropy (along u)' },
    // ---- brushing
    brush: { type: 'float', group: 'Brushing', label: 'Brush amount', default: 1, min: 0, max: 1, step: 0.01 },
    brushLength: { type: 'float', group: 'Brushing', label: 'Streak length', default: 0.12, min: 0.005, max: 1, step: 0.005, unit: 'm' },
    brushWidth: { type: 'float', group: 'Brushing', label: 'Streak width', default: 0.25, min: 0.05, max: 3, step: 0.01, unit: 'mm' },
    brushRough: { type: 'float', group: 'Brushing', label: 'Roughness mod', default: 0.12, min: 0, max: 0.5, step: 0.005 },
    brushDepth: { type: 'float', group: 'Brushing', label: 'Groove depth', default: 0.01, min: 0, max: 0.05, step: 0.0005, unit: 'mm' },
    brushWave: { type: 'float', group: 'Brushing', label: 'Waviness', default: 0.3, min: 0, max: 2, step: 0.01, help: 'Hand-brushed streaks wander' },
    // ---- hammered
    hammer: { type: 'float', group: 'Hammered', label: 'Hammer marks', default: 0, min: 0, max: 1, step: 0.01 },
    hammerSize: { type: 'float', group: 'Hammered', label: 'Dent size', default: 14, min: 2, max: 60, step: 0.5, unit: 'mm' },
    hammerDepth: { type: 'float', group: 'Hammered', label: 'Dent depth', default: 0.35, min: 0, max: 3, step: 0.01, unit: 'mm' },
    // ---- galvanized
    spangle: { type: 'float', group: 'Galvanized', label: 'Spangle', default: 0, min: 0, max: 1, step: 0.01, help: 'Zinc crystal pattern of hot-dip galvanizing' },
    spangleSize: { type: 'float', group: 'Galvanized', label: 'Crystal size', default: 18, min: 2, max: 60, step: 0.5, unit: 'mm' },
    whiteRust: { type: 'float', group: 'Galvanized', label: 'White rust', default: 0, min: 0, max: 1, step: 0.01 },
    // ---- wear
    scratches: { type: 'float', group: 'Wear', label: 'Scratches', default: 0.35, min: 0, max: 1, step: 0.01 },
    scratchDir: { type: 'float', group: 'Wear', label: 'Scratch spread', default: 1, min: 0, max: 1, step: 0.01, help: '0 = along the brushing, 1 = any direction' },
    smudges: { type: 'float', group: 'Wear', label: 'Smudges', default: 0.25, min: 0, max: 1, step: 0.01, help: 'Fingerprints and grease' },
    dents: { type: 'float', group: 'Wear', label: 'Dings', default: 0.1, min: 0, max: 1, step: 0.01 },
    // ---- tarnish
    tarnish: { type: 'float', group: 'Tarnish', label: 'Tarnish', default: 0, min: 0, max: 1, step: 0.01 },
    tarnishColor: { type: 'color', group: 'Tarnish', label: 'Tarnish color', default: '#6b4a3a' },
    patina: { type: 'float', group: 'Tarnish', label: 'Patina', default: 0, min: 0, max: 1, step: 0.01, help: 'Verdigris in the recesses (dielectric)' },
    patinaColor: { type: 'color', group: 'Tarnish', label: 'Patina color', default: '#5f9c86' },
  },
  tileSize: (p) => [n(p, 'tile'), n(p, 'tile')],
  extras: (p) => ({ anisotropy: n(p, 'anisotropy') * n(p, 'brush') || undefined, parallax: false }),
  glsl: /* glsl */ `
void surface(vec2 uv, inout Surface s) {
  vec3 col = metalColor;
  float rough = roughness;
  float h = 0.0;
  float metal = 1.0;
  float cavity = 0.0;

  // broad tone variation of the sheet
  float tone = pfbm(uv, F(0.15), 4, 0.5, 1.0);
  col *= 1.0 + toneVar * tone;

  // ---------------- brushing: long thin streaks along u
  if (brush > 0.0) {
    vec2 buv = uv;
    buv.y += brushWave * 0.002 / u_tileSize.y * pnoise(uv, F(vec2(0.15, 0.05)), 2.0);
    vec2 fq = F(vec2(brushLength, brushWidth * 0.001));
    float b1 = pnoise(buv, fq, 3.0);
    float b2 = pnoise(buv, max(vec2(1.0), floor(fq * vec2(2.0, 0.5))), 4.0);
    float b3 = pnoise(buv, max(vec2(1.0), floor(fq * vec2(0.5, 3.0))), 5.0);
    float streak = 0.5 * b1 + 0.3 * b2 + 0.2 * b3;
    // occasional deeper, longer brush lines
    float deep = pow(sat(pnoise(buv, F(vec2(brushLength * 3.0, brushWidth * 0.0025)), 6.0) * 1.4), 6.0);
    h += brush * brushDepth * (streak + 1.5 * deep);
    rough += brush * brushRough * (0.6 * streak + 0.6 * deep);
    col *= 1.0 + brush * 0.035 * streak;
  }

  // ---------------- hammered dents: overlapping spherical bowls
  if (hammer > 0.0) {
    Voronoi v = pvoronoi(uv, F(hammerSize * 0.001), 0.95, 7.0);
    float R = 0.62 + 0.25 * v.rnd.w;
    float bowl = (min(v.f1 * v.f1, R * R) / (R * R) - 1.0) * (0.7 + 0.6 * v.rnd.z);
    h += hammer * hammerDepth * bowl;
    // edges between dents get work-hardened and a little brighter
    float ridge = 1.0 - smoothstep(0.0, 0.08, v.edge);
    rough -= hammer * 0.06 * ridge;
    col *= 1.0 + hammer * (0.04 * ridge - 0.03 * (v.rnd.x - 0.5));
    cavity = max(cavity, hammer * sat(-bowl) * 0.6);
  }

  // ---------------- galvanized spangle: each zinc crystal reflects differently
  if (spangle > 0.0) {
    vec2 wuv = uv + 0.2 * pfbm2(uv, F(spangleSize * 0.002), 3, 0.5, 8.0) / F(spangleSize * 0.001);
    Voronoi v = pvoronoi(wuv, F(spangleSize * 0.001), 1.0, 9.0);
    // dendritic feathering inside the crystal
    float a = v.rnd.x * PI;
    vec2 lp = rot2(a) * ((uv - v.center) * u_tileSize) / (spangleSize * 0.001);
    float fern = noise2(vec2(lp.x * 4.0, lp.y * 40.0), 10.0) * 0.5 + noise2(vec2(lp.x * 9.0, lp.y * 90.0), 11.0) * 0.5;
    float crystal = mix(-0.5, 0.5, v.rnd.y);
    // crystals differ mostly in how they scatter light, only slightly in tone
    rough += spangle * (0.12 * crystal + 0.04 * fern);
    col *= 1.0 + spangle * (0.035 * crystal + 0.02 * fern);
    float border = 1.0 - smoothstep(0.0, 0.015, v.edge);
    h += spangle * (0.006 * fern - 0.004 * border);
    col *= 1.0 - spangle * 0.04 * border;
    if (whiteRust > 0.0) {
      float wr = smoothstep(0.55, 0.85, 0.5 + 0.7 * pfbm(uv, F(0.12), 5, 0.55, 12.0)) * whiteRust;
      col = mix(col, vec3(0.82, 0.83, 0.82), wr * 0.8);
      rough = mix(rough, 0.85, wr);
      metal = mix(metal, 0.0, wr * 0.9);
    }
  }

  // ---------------- scratches: fine long ones along the brushing + random ones
  if (scratches > 0.0) {
    float spread = mix(0.08, TAU, scratchDir);
    float sc = pscratches(uv, F(0.05), 0.6 * scratches, 0.95, 0.006, 0.0, spread, 20.0) * 0.8
             + pscratches(uv, F(0.02), 0.5 * scratches, 0.9, 0.012, 0.0, spread, 21.0) * 0.5
             + pscratches(uv, F(0.15), 0.3 * scratches, 1.0, 0.002, 0.0, 0.2, 22.0);
    sc = sat(sc);
    h -= 0.02 * sc;
    rough += 0.3 * sc * (1.0 - roughness);
    col *= 1.0 + 0.05 * sc;
  }

  // ---------------- smudges: greasy wipes and handling marks change the gloss
  if (smudges > 0.0) {
    vec2 su = uv + 0.015 * pfbm2(uv, F(0.08), 3, 0.5, 29.0);
    float sm = smoothstep(0.45, 0.8, 0.5 + 0.8 * pfbm(su, F(vec2(0.12, 0.06)), 5, 0.6, 30.0));
    sm *= smoothstep(0.35, 0.7, pvalue(uv, F(0.2), 31.0)) * smudges;
    rough = mix(rough, mix(0.14, 0.5, step(0.3, roughness)), sm * 0.5);
    col *= 1.0 - 0.04 * sm;
  }

  // ---------------- dings
  if (dents > 0.0) {
    float dd = pspeckle(uv, F(0.04), 0.25 * dents, 0.18, 1.0, 40.0);
    h -= dd * dd * 0.12;
  }

  // ---------------- tarnish and patina
  if (tarnish > 0.0) {
    float t = sat(0.5 + 0.9 * pfbm(uv, F(0.1), 5, 0.55, 50.0) + 0.4 * cavity) * tarnish;
    col = mix(col, tarnishColor, t * 0.75);
    rough = mix(rough, rough + 0.2, t);
  }
  if (patina > 0.0) {
    float pt = smoothstep(0.35, 0.75, cavity + 0.45 * pfbm(uv, F(0.03), 5, 0.6, 51.0) + 0.3 * pfbm(uv, F(0.2), 3, 0.5, 52.0)) * patina;
    col = mix(col, patinaColor * (0.8 + 0.4 * sat(0.5 + pfbm(uv, F(0.004), 3, 0.5, 53.0))), pt);
    rough = mix(rough, 0.9, pt);
    metal = mix(metal, 0.0, pt);
    h += pt * 0.03;
  }

  s.albedo = clamp(col, 0.0, 1.0);
  s.height = h;
  s.roughness = clamp(rough, 0.02, 1.0);
  s.metallic = metal;
  s.ao = 1.0 - 0.3 * cavity;
}
`,
});
