import { defineGenerator, type ParamValues } from '../engine/types';

const n = (p: ParamValues, k: string) => Number(p[k]);

/** Granite setts laid in courses: domed, worn stones with sandy joints. */
export const cobblestoneGenerator = defineGenerator({
  id: 'cobblestone',
  params: {
    // ---- layout
    settWidth: { type: 'float', group: 'Layout', label: 'Course width', default: 0.1, min: 0.05, max: 0.3, step: 0.005, unit: 'm' },
    courses: { type: 'int', group: 'Layout', label: 'Courses', default: 12, min: 2, max: 32 },
    minPerRow: { type: 'int', group: 'Layout', label: 'Min per course', default: 7, min: 1, max: 24 },
    maxPerRow: { type: 'int', group: 'Layout', label: 'Max per course', default: 10, min: 1, max: 24 },
    joint: { type: 'float', group: 'Layout', label: 'Joint width', default: 12, min: 2, max: 40, step: 0.5, unit: 'mm' },
    // ---- shape
    irregularity: { type: 'float', group: 'Shape', label: 'Irregularity', default: 6, min: 0, max: 20, step: 0.1, unit: 'mm' },
    cornerRadius: { type: 'float', group: 'Shape', label: 'Corner radius', default: 14, min: 0, max: 50, step: 0.5, unit: 'mm' },
    dome: { type: 'float', group: 'Shape', label: 'Dome height', default: 4, min: 0, max: 20, step: 0.1, unit: 'mm' },
    edgeDrop: { type: 'float', group: 'Shape', label: 'Edge rounding', default: 9, min: 0, max: 30, step: 0.1, unit: 'mm' },
    tilt: { type: 'float', group: 'Shape', label: 'Laying error', default: 3, min: 0, max: 12, step: 0.1, unit: 'mm' },
    faceRelief: { type: 'float', group: 'Shape', label: 'Split-face relief', default: 1.5, min: 0, max: 6, step: 0.05, unit: 'mm' },
    wear: { type: 'float', group: 'Shape', label: 'Traffic polish', default: 0.6, min: 0, max: 1, step: 0.01, help: 'Smooths and polishes the tops' },
    // ---- stone
    stoneA: { type: 'color', group: 'Stone', label: 'Grey granite', default: '#8a8886' },
    stoneB: { type: 'color', group: 'Stone', label: 'Warm granite', default: '#9a8a82' },
    stoneC: { type: 'color', group: 'Stone', label: 'Dark granite', default: '#66656a' },
    stoneVar: { type: 'float', group: 'Stone', label: 'Variation', default: 1, min: 0, max: 3, step: 0.01 },
    grainSize: { type: 'float', group: 'Stone', label: 'Grain size', default: 2.2, min: 0.5, max: 8, step: 0.1, unit: 'mm' },
    grainContrast: { type: 'float', group: 'Stone', label: 'Grain contrast', default: 0.6, min: 0, max: 1.5, step: 0.01 },
    roughness: { type: 'float', group: 'Stone', label: 'Roughness', default: 0.78, min: 0, max: 1, step: 0.005 },
    // ---- joints
    jointColor: { type: 'color', group: 'Joints', label: 'Sand / soil', default: '#6f6254' },
    jointDepth: { type: 'float', group: 'Joints', label: 'Fill depth', default: 14, min: 0, max: 40, step: 0.5, unit: 'mm' },
    pebbles: { type: 'float', group: 'Joints', label: 'Pebbles', default: 0.5, min: 0, max: 1, step: 0.01 },
    moss: { type: 'float', group: 'Joints', label: 'Moss', default: 0.25, min: 0, max: 1, step: 0.01 },
    mossColor: { type: 'color', group: 'Joints', label: 'Moss color', default: '#4f5a2c' },
    dirt: { type: 'float', group: 'Joints', label: 'Grime', default: 0.4, min: 0, max: 1, step: 0.01 },
  },
  tileSize: (p) => {
    const h = n(p, 'courses') * n(p, 'settWidth');
    return [h, h];
  },
  extras: () => ({ parallax: true }),
  glsl: /* glsl */ `
void surface(vec2 uv, inout Surface s) {
  Cell c = plankLayout(uv, courses, minPerRow, max(maxPerRow, minPerRow), 1.0);
  vec4 r = c.rnd, r2 = c.rnd2;
  float jw = joint * 0.001;
  vec2 q = c.local - 0.5 * c.size;
  vec2 he = 0.5 * c.size - 0.5 * jw;
  vec2 qn = q / max(he, vec2(1e-4));
  vec2 bs = q + r.xy * 13.1;

  // ---------------- stone outline
  float irr = irregularity * 0.001;
  float wob = fbm2(bs / 0.03, 4, 0.5, 5.0);
  float d = sdRoundBox(q, he, min(cornerRadius * 0.001, min(he.x, he.y) * 0.95)) + irr * (0.5 + 0.9 * wob);
  float inside = -d;

  // ---------------- stone height (mm)
  float rad = sat(1.0 - 0.5 * (qn.x * qn.x + qn.y * qn.y));
  float h = dome * (0.6 + 0.8 * r.z) * rad;
  h += tilt * ((r2.x - 0.5) + (r2.y - 0.5) * qn.x + (r2.z - 0.5) * qn.y);
  float split = fbm2(bs / 0.025, 5, 0.55, 6.0);
  float worn = wear * smoothstep(0.1, 0.8, rad + 0.3 * split);
  h += faceRelief * mix(split, split * 0.25, worn);
  float drop = edgeDrop * 0.001;
  float e = clamp(inside / max(drop, 1e-5), 0.0, 1.0);
  h -= edgeDrop * pow(1.0 - e, 2.2);
  h -= max(-inside, 0.0) * 3000.0;

  // ---------------- granite grains
  Voronoi g1 = pvoronoi(uv, F(grainSize * 0.001), 1.0, 7.0);
  Voronoi g2 = pvoronoi(uv, F(grainSize * 0.00045), 1.0, 8.0);
  float t = mix(g1.rnd.x, g2.rnd.x, 0.35);
  vec3 base = ramp3(stoneA, stoneB, stoneC, r.w);
  base = varyColor(base, vec3(0.01, 0.12, 0.1) * stoneVar, r2.xyz);
  vec3 mineral;
  float micaMask = 0.0;
  if (t < 0.16) { mineral = vec3(0.1, 0.1, 0.11); micaMask = 1.0; }          // biotite / hornblende
  else if (t < 0.52) mineral = base * 1.22 + 0.03;                             // feldspar (light)
  else if (t < 0.64) mineral = base * vec3(1.25, 1.08, 1.0);                   // pink feldspar
  else mineral = base * 0.88;                                                   // quartz
  vec3 col = mix(base, mineral, grainContrast);
  col *= 0.94 + 0.12 * g1.rnd.y;
  // worn tops are lighter and smoother; the rest collects grime
  col = mix(col, col * 1.08 + 0.02, worn * 0.6);
  float rough = mix(roughness, 0.42, worn * wear) - 0.25 * micaMask * worn;

  // ---------------- joints
  float jointN = pfbm(uv, F(0.004), 4, 0.6, 9.0);
  float hj = -jointDepth + 1.5 * jointN;
  float peb = 0.0;
  if (pebbles > 0.0) {
    Voronoi pv = pvoronoi(uv, F(0.006), 0.9, 10.0);
    peb = step(pv.rnd.z, pebbles * 0.6) * (1.0 - smoothstep(0.28, 0.42, pv.f1));
    hj += peb * (3.0 + 3.0 * pv.rnd.w) * sqrt(sat(1.0 - pv.f1 / 0.42));
  }
  float stone = smoothstep(hj - 0.2, hj + 0.8, h);
  h = max(h, hj);
  vec3 jc = jointColor * (0.8 + 0.4 * sat(0.5 + jointN));
  jc = mix(jc, jointColor * vec3(1.25, 1.2, 1.1), peb);
  float mossN = smoothstep(0.45, 0.75, 0.5 + 0.7 * pfbm(uv, F(0.15), 4, 0.5, 11.0)) * moss;
  jc = mix(jc, mossColor * (0.7 + 0.6 * sat(0.5 + pfbm(uv, F(0.003), 3, 0.5, 12.0))), mossN * (1.0 - peb));
  // moss creeps a little onto the stone edges
  float creep = mossN * (1.0 - smoothstep(0.0, 0.01, inside)) * smoothstep(0.5, 0.8, pnoise(uv, F(0.01), 13.0) + 0.5);
  col = mix(col, mossColor, creep * 0.6);

  vec3 albedo = mix(jc, col, stone);
  rough = mix(0.95, rough, stone);
  float grime = pdirt(uv, (1.0 - e) * 0.7, dirt, 14.0);
  albedo *= 1.0 - grime * 0.35 * stone;

  s.albedo = albedo;
  s.height = h;
  s.roughness = clamp(rough, 0.05, 1.0);
  s.metallic = 0.0;
  s.ao = 1.0 - 0.25 * (1.0 - stone);
}
`,
});
