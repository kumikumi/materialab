import { defineGenerator, type ParamValues } from '../engine/types';

const n = (p: ParamValues, k: string) => Number(p[k]);

/** Brick bonds with per-brick color, worn/chipped edges, sanded faces and mortar. */
export const brickGenerator = defineGenerator({
  id: 'brick',
  params: {
    // ---- layout
    bond: { type: 'enum', group: 'Layout', label: 'Bond', default: 0, options: ['Running bond', 'Stack bond', 'Flemish bond', 'Herringbone paving'] },
    brickLength: { type: 'float', group: 'Layout', label: 'Brick length', default: 215, min: 100, max: 400, step: 1, unit: 'mm' },
    brickHeight: { type: 'float', group: 'Layout', label: 'Brick height', default: 65, min: 30, max: 200, step: 1, unit: 'mm' },
    mortar: { type: 'float', group: 'Layout', label: 'Joint width', default: 10, min: 0, max: 30, step: 0.5, unit: 'mm' },
    bricksPerRow: { type: 'int', group: 'Layout', label: 'Bricks per row', default: 4, min: 1, max: 16, help: 'Flemish: stretcher+header pairs per row' },
    courses: { type: 'int', group: 'Layout', label: 'Courses', default: 12, min: 2, max: 48, help: 'Rows per tile (keep even for offset bonds)' },
    rowOffset: { type: 'float', group: 'Layout', label: 'Row offset', default: 0.5, min: 0, max: 1, step: 0.25, help: 'Running bond shift per course (x courses must be whole)' },
    // ---- shape
    cornerRadius: { type: 'float', group: 'Shape', label: 'Corner radius', default: 3, min: 0, max: 20, step: 0.1, unit: 'mm' },
    edgeRound: { type: 'float', group: 'Shape', label: 'Edge rounding', default: 4, min: 0, max: 20, step: 0.1, unit: 'mm' },
    edgeWear: { type: 'float', group: 'Shape', label: 'Outline wear', default: 2.5, min: 0, max: 12, step: 0.1, unit: 'mm', help: 'Irregularity of the brick outline' },
    chips: { type: 'float', group: 'Shape', label: 'Chips', default: 0.35, min: 0, max: 1, step: 0.01 },
    chipDepth: { type: 'float', group: 'Shape', label: 'Chip depth', default: 4, min: 0, max: 15, step: 0.1, unit: 'mm' },
    bulge: { type: 'float', group: 'Shape', label: 'Face bulge', default: 0.8, min: -2, max: 4, step: 0.05, unit: 'mm' },
    tilt: { type: 'float', group: 'Shape', label: 'Laying error', default: 0.8, min: 0, max: 4, step: 0.05, unit: 'mm', help: 'Per-brick height/tilt variation' },
    sandRelief: { type: 'float', group: 'Shape', label: 'Sand relief', default: 0.35, min: 0, max: 2, step: 0.01, unit: 'mm' },
    pits: { type: 'float', group: 'Shape', label: 'Pits', default: 0.35, min: 0, max: 1, step: 0.01 },
    dragLines: { type: 'float', group: 'Shape', label: 'Wire-cut drag', default: 0, min: 0, max: 1, step: 0.01, help: 'Horizontal tearing of wire-cut bricks' },
    // ---- brick color
    colorA: { type: 'color', group: 'Brick color', label: 'Color A', default: '#8e4a38' },
    colorB: { type: 'color', group: 'Brick color', label: 'Color B', default: '#a05a42' },
    colorC: { type: 'color', group: 'Brick color', label: 'Color C', default: '#763e31' },
    colorVar: { type: 'float', group: 'Brick color', label: 'Variation', default: 1, min: 0, max: 3, step: 0.01 },
    darkBricks: { type: 'float', group: 'Brick color', label: 'Dark bricks', default: 0.08, min: 0, max: 1, step: 0.01 },
    darkColor: { type: 'color', group: 'Brick color', label: 'Dark color', default: '#4a2a22' },
    headerDark: { type: 'float', group: 'Brick color', label: 'Dark headers', default: 0, min: 0, max: 1, step: 0.01, help: 'Flemish bond: darker (burnt) header ends' },
    flashing: { type: 'float', group: 'Brick color', label: 'Flashing', default: 0.4, min: 0, max: 1, step: 0.01, help: 'Kiln darkening towards one end' },
    mottle: { type: 'float', group: 'Brick color', label: 'Mottling', default: 0.12, min: 0, max: 0.5, step: 0.005 },
    speckle: { type: 'float', group: 'Brick color', label: 'Speckles', default: 0.35, min: 0, max: 1, step: 0.01 },
    sandColor: { type: 'color', group: 'Brick color', label: 'Sand facing', default: '#c9a17a' },
    sandFacing: { type: 'float', group: 'Brick color', label: 'Sand amount', default: 0.3, min: 0, max: 1, step: 0.01 },
    brickRoughness: { type: 'float', group: 'Brick color', label: 'Roughness', default: 0.86, min: 0, max: 1, step: 0.005 },
    // ---- mortar
    mortarColor: { type: 'color', group: 'Mortar', label: 'Color', default: '#a8a197' },
    mortarDepth: { type: 'float', group: 'Mortar', label: 'Recess', default: 6, min: -1, max: 20, step: 0.1, unit: 'mm' },
    mortarProfile: { type: 'enum', group: 'Mortar', label: 'Profile', default: 1, options: ['Flat recessed', 'Concave tooled', 'Weathered (eroded)'] },
    mortarGrain: { type: 'float', group: 'Mortar', label: 'Grain', default: 0.6, min: 0, max: 1, step: 0.01 },
    mortarRoughness: { type: 'float', group: 'Mortar', label: 'Roughness', default: 0.95, min: 0, max: 1, step: 0.005 },
    // ---- weathering
    soot: { type: 'float', group: 'Weathering', label: 'Soot / grime', default: 0.15, min: 0, max: 1, step: 0.01 },
    efflorescence: { type: 'float', group: 'Weathering', label: 'Efflorescence', default: 0.1, min: 0, max: 1, step: 0.01 },
    streaks: { type: 'float', group: 'Weathering', label: 'Rain streaks', default: 0.1, min: 0, max: 1, step: 0.01 },
  },
  tileSize: (p) => {
    const L = n(p, 'brickLength') / 1000, H = n(p, 'brickHeight') / 1000, m = n(p, 'mortar') / 1000;
    const bond = n(p, 'bond');
    if (bond === 3) {
      const W = (L + m) / 2;
      const t = 2 * 2 * Math.SQRT2 * W * Math.max(1, Math.round(n(p, 'bricksPerRow') / 2));
      return [t, t];
    }
    const rows = n(p, 'courses') * (H + m);
    if (bond === 2) {
      const hd = (L - m) / 2;
      return [n(p, 'bricksPerRow') * (L + hd + 2 * m), rows];
    }
    return [n(p, 'bricksPerRow') * (L + m), rows];
  },
  extras: () => ({ parallax: true }),
  glsl: /* glsl */ `
void surface(vec2 uv, inout Surface s) {
  float m = mortar * 0.001;
  float L = brickLength * 0.001, H = brickHeight * 0.001;
  Cell c;
  if (bond == 0) c = gridLayout(uv, bricksPerRow, courses, rowOffset, 1.0);
  else if (bond == 1) c = gridLayout(uv, bricksPerRow, courses, 0.0, 1.0);
  else if (bond == 2) c = flemishLayout(uv, L + m, (L - m) * 0.5 + m, courses, 1.0);
  else c = herringboneLayout(uv, (L + m) * 0.5, 2.0, 1.0);
  vec4 r = c.rnd, r2 = c.rnd2;

  vec2 q = c.local - 0.5 * c.size;          // brick-local, centered (m)
  vec2 he = 0.5 * c.size - 0.5 * m;         // half extents of the brick
  vec2 qn = q / max(he, vec2(1e-4));        // -1..1 across the brick
  vec2 bs = q + r.xy * 7.3;                 // per-brick noise domain

  // ---------------- outline: rounded box with worn, irregular edges
  float wearN = fbm2(bs / 0.012, 4, 0.55, 10.0);
  float d = sdRoundBox(q, he, cornerRadius * 0.001) + edgeWear * 0.001 * (0.35 + 0.8 * wearN);
  float inside = -d;

  // chips: missing chunks near edges and corners
  float chipN = fbm2(bs / 0.018, 4, 0.5, 11.0);
  float nearEdge = 1.0 - smoothstep(0.0, 0.022, inside);
  float corner = smoothstep(0.55, 0.95, max(abs(qn.x) * (he.x / max(he.x, he.y)), abs(qn.y) * (he.y / max(he.x, he.y))));
  float chip = smoothstep(0.62 - 0.35 * chips, 0.78 - 0.35 * chips, chipN + 0.25 * corner) * nearEdge * step(0.001, chips);

  // ---------------- brick height (mm)
  float face = bulge * (1.0 - 0.5 * (qn.x * qn.x + qn.y * qn.y));
  face += tilt * ((r2.x - 0.5) + (r2.y - 0.5) * qn.x * 0.6 + (r2.z - 0.5) * qn.y * 0.6);
  float sand = fbm2(bs / 0.0016, 3, 0.55, 12.0);
  face += sandRelief * (0.6 * sand + 0.4 * fbm2(bs / 0.006, 3, 0.5, 13.0));
  if (dragLines > 0.0) {
    float dl = noise2(vec2(bs.x / 0.05, bs.y / 0.0012), 14.0);
    face -= dragLines * 0.6 * smoothstep(0.35, 0.8, dl) * smoothstep(0.2, 0.7, noise2(bs / 0.03, 15.0) + 0.3);
  }
  // pits: small irregular cavities (burnt-out inclusions, air pockets)
  float pitN = noise2(bs / 0.0022, 16.0) + 0.35 * noise2(bs / 0.0008, 16.5);
  float pit = smoothstep(0.78 - 0.18 * pits, 0.9 - 0.18 * pits, pitN) * step(0.001, pits) * step(0.0, inside);
  face -= pit * 0.7;
  float rw = edgeRound * 0.001;
  float e = clamp(inside / max(rw, 1e-5), 0.0, 1.0);
  float hb = face - edgeRound * 0.5 * (1.0 - e) * (1.0 - e) - max(-inside, 0.0) * 2000.0;
  hb -= chip * chipDepth * (0.5 + 0.5 * smoothstep(0.0, 0.3, chipN + 0.25 * corner - 0.5));

  // ---------------- mortar height (mm)
  float jointDist = max(-d, 0.0);
  float grain = pfbm(uv, F(0.0012), 3, 0.6, 20.0);
  float hm = -mortarDepth + mortarGrain * 0.35 * grain;
  if (mortarProfile == 1) {
    // concave tooling: deepest in the middle of the joint
    float t = clamp(-d / max(m * 0.5, 1e-4), 0.0, 1.0);
    hm -= 1.5 * sin(t * 1.5708);
  } else if (mortarProfile == 2) {
    hm -= 1.6 * pfbm(uv, F(0.02), 4, 0.55, 21.0) + 1.2;
  }
  float h = max(hb, hm);
  float isBrick = smoothstep(hm - 0.05, hm + 0.25, hb);

  // ---------------- brick color
  vec3 base = ramp3(colorA, colorB, colorC, r.z);
  base = varyColor(base, vec3(0.008, 0.07, 0.11) * colorVar, r2.xyz);
  if (r.w < darkBricks) base = mix(base, varyColor(darkColor, vec3(0.02, 0.15, 0.2), r.xyz), 0.85);
  if (c.kind == 1 && bond == 2) base = mix(base, darkColor, headerDark * (0.7 + 0.3 * r.x));
  // kiln flashing towards one end / corner
  float fl = smoothstep(0.1, 1.0, (r2.w < 0.5 ? qn.x : -qn.x) * 0.8 + qn.y * (r.x - 0.5) + 0.35 * noise2(bs / 0.03, 17.0));
  base = mix(base, base * vec3(0.62, 0.55, 0.52), fl * flashing * (0.4 + 0.6 * r.y));
  float mot = fbm2(bs / 0.025, 4, 0.55, 18.0);
  vec3 col = base * (1.0 + mot * mottle * 2.0);
  // iron speckles and light grains
  float sp1 = pspeckle(uv, F(0.004), 0.3 * speckle, 0.28, 0.6, 19.0);
  float sp2 = pspeckle(uv, F(0.0022), 0.5 * speckle, 0.25, 0.5, 22.0);
  col = mix(col, col * 0.45, sp1 * 0.8);
  col = mix(col, mix(col, sandColor, 0.7), sp2 * 0.6);
  col = mix(col, sandColor, sandFacing * smoothstep(-0.2, 0.6, sand) * 0.35);
  // chipped: fresh, brighter clay
  col = mix(col, base * vec3(1.18, 1.1, 1.05), chip * 0.7);
  col = mix(col, col * 0.6, pit * 0.6);

  // ---------------- mortar color
  vec3 mc = mortarColor * (0.92 + 0.16 * grain);
  float sandGrains = pspeckle(uv, F(0.0015), 0.6, 0.35, 0.4, 23.0);
  mc = mix(mc, mc * vec3(0.8, 0.78, 0.74), sandGrains * 0.5 * mortarGrain);
  mc *= 0.88 + 0.12 * smoothstep(0.0, m * 0.5, jointDist);

  vec3 albedo = mix(mc, col, isBrick);
  float rough = mix(mortarRoughness, brickRoughness + 0.06 * sand - 0.08 * chip, isBrick);

  // ---------------- weathering (tile-periodic so it wraps)
  float grime = sat(0.5 + 0.8 * pfbm(uv, F(0.4), 5, 0.55, 30.0));
  float cav = 1.0 - isBrick;
  albedo *= 1.0 - soot * (0.35 * grime + 0.3 * cav * grime);
  float ef = smoothstep(0.55, 0.8, 0.5 + 0.6 * pfbm(uv, F(0.3), 5, 0.6, 31.0)) * efflorescence;
  ef *= 0.6 + 0.4 * cav;
  albedo = mix(albedo, vec3(0.86, 0.85, 0.82), ef * (0.5 + 0.5 * sat(0.5 + pfbm(uv, F(0.01), 3, 0.5, 32.0))));
  rough = mix(rough, 1.0, ef);
  if (streaks > 0.0) {
    float st = pstreaks(uv, vec2(F(0.12).x, F(0.6).y), 33.0);
    albedo *= 1.0 - streaks * 0.25 * smoothstep(0.55, 1.0, st);
  }

  s.albedo = albedo;
  s.height = h;
  s.roughness = clamp(rough, 0.0, 1.0);
  s.metallic = 0.0;
  s.ao = 1.0 - 0.25 * pit - 0.15 * cav;
}
`,
});
