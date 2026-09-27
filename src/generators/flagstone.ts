import { defineGenerator, type ParamValues } from '../engine/types';

const n = (p: ParamValues, k: string) => Number(p[k]);

/** Irregular (crazy) paving of cleft slate slabs in mortar. */
export const flagstoneGenerator = defineGenerator({
  id: 'flagstone',
  params: {
    // ---- layout
    tile: { type: 'float', group: 'Layout', label: 'Tile size', default: 2, min: 0.5, max: 6, step: 0.1, unit: 'm' },
    stoneSize: { type: 'float', group: 'Layout', label: 'Stone size', default: 0.38, min: 0.08, max: 1.5, step: 0.01, unit: 'm' },
    irregular: { type: 'float', group: 'Layout', label: 'Irregularity', default: 0.25, min: 0, max: 0.6, step: 0.01, help: 'Bends the straight Voronoi edges' },
    joint: { type: 'float', group: 'Layout', label: 'Joint width', default: 16, min: 2, max: 60, step: 0.5, unit: 'mm' },
    jointVar: { type: 'float', group: 'Layout', label: 'Joint variation', default: 0.5, min: 0, max: 1, step: 0.01 },
    // ---- slab shape
    tilt: { type: 'float', group: 'Slabs', label: 'Height variation', default: 2.5, min: 0, max: 10, step: 0.1, unit: 'mm' },
    cleft: { type: 'float', group: 'Slabs', label: 'Cleft relief', default: 1.6, min: 0, max: 6, step: 0.05, unit: 'mm' },
    layers: { type: 'float', group: 'Slabs', label: 'Cleavage steps', default: 5, min: 0, max: 12, step: 0.1, help: 'Number of terrace levels in the cleft face' },
    edgeChip: { type: 'float', group: 'Slabs', label: 'Edge chipping', default: 0.5, min: 0, max: 1, step: 0.01 },
    // ---- color
    colorA: { type: 'color', group: 'Color', label: 'Blue-grey', default: '#5d646b' },
    colorB: { type: 'color', group: 'Color', label: 'Green-grey', default: '#626859' },
    colorC: { type: 'color', group: 'Color', label: 'Rust', default: '#7a6553' },
    rustiness: { type: 'float', group: 'Color', label: 'Iron staining', default: 0.35, min: 0, max: 1, step: 0.01 },
    banding: { type: 'float', group: 'Color', label: 'Banding', default: 0.3, min: 0, max: 1, step: 0.01 },
    roughness: { type: 'float', group: 'Color', label: 'Roughness', default: 0.66, min: 0, max: 1, step: 0.005 },
    // ---- mortar
    mortarColor: { type: 'color', group: 'Mortar', label: 'Color', default: '#8f877b' },
    mortarDepth: { type: 'float', group: 'Mortar', label: 'Recess', default: 5, min: 0, max: 20, step: 0.1, unit: 'mm' },
    dirt: { type: 'float', group: 'Mortar', label: 'Grime', default: 0.35, min: 0, max: 1, step: 0.01 },
  },
  tileSize: (p) => [n(p, 'tile'), n(p, 'tile')],
  extras: () => ({ parallax: true }),
  glsl: /* glsl */ `
void surface(vec2 uv, inout Surface s) {
  vec2 fq = F(stoneSize);
  vec2 cellM = u_tileSize / fq;
  // bend the edges: domain warp before the Voronoi
  vec2 wuv = uv + irregular * pfbm2(uv, fq * 1.5, 4, 0.5, 1.0) / fq;
  Voronoi v = pvoronoi(wuv, fq, 0.85, 2.0);
  vec4 r = v.rnd;
  float edgeM = v.edge * min(cellM.x, cellM.y);
  // joints vary in width along their length
  float jw = joint * 0.0005 * (1.0 + jointVar * pfbm(uv, fq * 3.0, 3, 0.5, 3.0));
  float inside = edgeM - jw;
  vec2 lp = (uv - v.center) * u_tileSize;       // stone-local, meters
  vec2 bs = lp + r.xy * 23.0;

  // chipped, irregular edge
  float chipN = fbm2(bs / 0.02, 4, 0.55, 4.0);
  inside -= edgeChip * 0.006 * smoothstep(0.1, 0.6, chipN);

  // ---------------- slab height: tilt + cleft terraces
  float h = tilt * ((r.z - 0.5) * 2.0 + (r.w - 0.5) * lp.x / stoneSize + (fract(r.x * 7.3) - 0.5) * lp.y / stoneSize);
  float cn = fbm2(bs / (stoneSize * 0.5), 5, 0.55, 5.0) * 0.5 + 0.5;
  float terr = cn;
  if (layers > 0.5) {
    float x = cn * layers;
    float fl = floor(x);
    // mostly flat cleavage planes with short risers
    terr = (fl + smoothstep(0.7, 1.0, fract(x))) / layers;
  }
  float riser = layers > 0.5 ? smoothstep(0.7, 0.85, fract(cn * layers)) * (1.0 - smoothstep(0.9, 1.0, fract(cn * layers))) : 0.0;
  h += cleft * (terr - 0.5) * 2.0;
  h += 0.15 * fbm2(bs / 0.004, 3, 0.5, 6.0);
  float e = clamp(inside / 0.006, 0.0, 1.0);
  h -= 2.5 * (1.0 - e) * (1.0 - e);
  h -= max(-inside, 0.0) * 2500.0;

  // ---------------- slab color
  vec3 base = r.y < 0.45 ? colorA : (r.y < 0.8 ? colorB : colorC);
  base = varyColor(base, vec3(0.01, 0.25, 0.14), vec3(r.zw, fract(r.x * 5.1)));
  // sedimentary banding across the slab
  float bandN = sin((dot(lp, vec2(cos(r.x * 6.28), sin(r.x * 6.28))) / 0.03) + 3.0 * fbm2(bs / 0.1, 3, 0.5, 7.0));
  vec3 col = base * (1.0 + banding * 0.08 * bandN);
  // each cleavage level is a slightly different shade
  col *= 0.94 + 0.12 * fract(floor(cn * max(layers, 1.0)) * 0.618 + r.x);
  float rust = smoothstep(0.55, 0.9, 0.5 + 0.8 * fbm2(bs / 0.08, 4, 0.55, 8.0)) * rustiness;
  col = mix(col, col * vec3(1.25, 1.02, 0.8), rust * 0.6);
  col = mix(col, col * 1.12, riser * 0.5);
  float rough = roughness - 0.08 * (1.0 - riser) * smoothstep(0.2, 0.8, cn) + 0.12 * riser;

  // ---------------- mortar
  float hm = -mortarDepth + 1.0 * pfbm(uv, F(0.003), 4, 0.6, 9.0);
  float stone = smoothstep(hm - 0.2, hm + 0.6, h);
  h = max(h, hm);
  vec3 mc = mortarColor * (0.88 + 0.24 * sat(0.5 + pfbm(uv, F(0.002), 3, 0.5, 10.0)));
  float sandG = pspeckle(uv, F(0.0016), 0.5, 0.35, 0.4, 11.0);
  mc = mix(mc, mc * 0.8, sandG * 0.5);
  vec3 albedo = mix(mc, col, stone);
  rough = mix(0.93, rough, stone);
  float grime = pdirt(uv, (1.0 - e) * 0.8 + (1.0 - stone) * 0.5, dirt, 12.0);
  albedo *= 1.0 - 0.4 * grime;

  s.albedo = albedo;
  s.height = h;
  s.roughness = clamp(rough, 0.05, 1.0);
  s.metallic = 0.0;
  s.ao = 1.0 - 0.2 * (1.0 - stone);
}
`,
});
