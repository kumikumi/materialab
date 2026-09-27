import { defineGenerator, type ParamValues } from '../engine/types';

const n = (p: ParamValues, k: string) => Number(p[k]);

/** Polished marble tiles: veined stone, each tile cut from a different part of the slab. */
export const marbleGenerator = defineGenerator({
  id: 'marble',
  params: {
    // ---- layout
    tileSize: { type: 'float', group: 'Layout', label: 'Tile size', default: 0.6, min: 0.1, max: 1.5, step: 0.01, unit: 'm' },
    tilesPerSide: { type: 'int', group: 'Layout', label: 'Tiles per side', default: 2, min: 1, max: 8 },
    grout: { type: 'float', group: 'Layout', label: 'Grout width', default: 2, min: 0, max: 10, step: 0.1, unit: 'mm' },
    groutColor: { type: 'color', group: 'Layout', label: 'Grout color', default: '#b9b5ad' },
    lippage: { type: 'float', group: 'Layout', label: 'Lippage', default: 0.15, min: 0, max: 1.5, step: 0.01, unit: 'mm', help: 'Height offset between neighbouring tiles' },
    bookmatch: { type: 'bool', group: 'Layout', label: 'Bookmatched', default: false, help: 'Mirror neighbouring tiles so veins continue' },
    // ---- stone
    baseColor: { type: 'color', group: 'Stone', label: 'Base', default: '#e6e4df' },
    cloudColor: { type: 'color', group: 'Stone', label: 'Clouds', default: '#c8c7c4' },
    veinColor: { type: 'color', group: 'Stone', label: 'Veins', default: '#77797c' },
    accentColor: { type: 'color', group: 'Stone', label: 'Accent veins', default: '#a08a66' },
    veinScale: { type: 'float', group: 'Stone', label: 'Vein scale', default: 0.35, min: 0.05, max: 2, step: 0.01, unit: 'm' },
    veinDirection: { type: 'float', group: 'Stone', label: 'Vein direction', default: 35, min: -90, max: 90, step: 1, unit: '°' },
    veinStretch: { type: 'float', group: 'Stone', label: 'Vein stretch', default: 2.8, min: 1, max: 6, step: 0.05 },
    veinWidth: { type: 'float', group: 'Stone', label: 'Vein width', default: 0.018, min: 0.002, max: 0.15, step: 0.001 },
    veinAmount: { type: 'float', group: 'Stone', label: 'Vein amount', default: 0.7, min: 0, max: 1, step: 0.01 },
    warp: { type: 'float', group: 'Stone', label: 'Turbulence', default: 0.45, min: 0, max: 3, step: 0.01 },
    clouds: { type: 'float', group: 'Stone', label: 'Clouds', default: 0.5, min: 0, max: 1, step: 0.01 },
    accent: { type: 'float', group: 'Stone', label: 'Accent amount', default: 0.15, min: 0, max: 1, step: 0.01 },
    sparkle: { type: 'float', group: 'Stone', label: 'Crystals', default: 0.3, min: 0, max: 1, step: 0.01, help: 'Fine calcite crystal texture' },
    // ---- finish
    roughness: { type: 'float', group: 'Finish', label: 'Roughness', default: 0.07, min: 0, max: 1, step: 0.005 },
    etching: { type: 'float', group: 'Finish', label: 'Etching / wear', default: 0.2, min: 0, max: 1, step: 0.01, help: 'Dull patches from use and cleaning' },
    scratches: { type: 'float', group: 'Finish', label: 'Scratches', default: 0.25, min: 0, max: 1, step: 0.01 },
  },
  tileSize: (p) => {
    const t = n(p, 'tileSize') * n(p, 'tilesPerSide');
    return [t, t];
  },
  extras: () => ({ parallax: false }),
  glsl: /* glsl */ `
// veins: zero-crossings of domain-warped, stretched noise fields. Two families
// at different angles cross each other like the fracture network in real marble.
float marbleVeins(vec2 p, float width, float seed, out float cloud, out float accentMask) {
  vec2 w = vec2(fbm2(p * 0.8, 5, 0.5, seed + 1.0), fbm2(p * 0.8 + 7.3, 5, 0.5, seed + 2.0));
  vec2 pw = p + warp * w;
  // primary veins: long, flowing along the vein direction
  float f = fbm2(pw * vec2(1.0, veinStretch), 6, 0.52, seed + 5.0);
  // secondary veins: a second fracture set at ~60°, finer
  vec2 p2 = rot2(1.05) * pw;
  float f2 = fbm2(p2 * vec2(1.6, 1.6 * veinStretch) + 11.0, 5, 0.5, seed + 6.0);
  // fine hairline veins
  float f3 = fbm2(pw * vec2(3.5, 3.5 * veinStretch * 0.7) + 23.0, 4, 0.5, seed + 10.0);
  float mv = 1.0 - smoothstep(0.0, width, abs(f));
  float halo = 1.0 - smoothstep(0.0, width * 5.0, abs(f));
  float sv = 1.0 - smoothstep(0.0, width * 0.55, abs(f2));
  float hv = 1.0 - smoothstep(0.0, width * 0.25, abs(f3));
  // veins fade in and out along their length
  float strength = smoothstep(-0.25, 0.3, fbm2(pw * 0.6 + 5.0, 3, 0.5, seed + 7.0));
  float strength2 = smoothstep(0.0, 0.4, fbm2(p2 * 0.9 + 9.0, 3, 0.5, seed + 11.0));
  cloud = fbm2(pw * 1.3 + 2.0, 5, 0.6, seed + 8.0) + 0.25 * halo;
  accentMask = (1.0 - smoothstep(0.0, width * 2.0, abs(f + 0.1))) * smoothstep(0.1, 0.5, fbm2(pw * 0.5, 3, 0.5, seed + 9.0));
  return sat(mv * (0.35 + 0.65 * strength) + 0.25 * halo * strength + sv * 0.6 * strength2 + hv * 0.3 * strength);
}

void surface(vec2 uv, inout Surface s) {
  Cell c = gridLayout(uv, tilesPerSide, tilesPerSide, 0.0, 1.0);
  vec2 lp = c.local;
  if (bookmatch) {
    // mirror every other tile: veins meet at the joints
    ivec2 idx = ivec2(floor(uv * float(tilesPerSide)));
    if ((idx.x & 1) == 1) lp.x = c.size.x - lp.x;
    if ((idx.y & 1) == 1) lp.y = c.size.y - lp.y;
  }
  // every tile comes from a different part of a big virtual slab
  vec2 slabPos = bookmatch ? lp : lp + c.rnd.xy * 40.0;
  vec2 p = rot2(radians(veinDirection)) * slabPos / veinScale;

  float cloud, accentMask;
  float vein = marbleVeins(p, veinWidth, bookmatch ? 3.0 : floor(c.rnd.z * 50.0), cloud, accentMask) * veinAmount;

  vec3 col = baseColor;
  col = mix(col, cloudColor, clouds * smoothstep(-0.3, 0.5, cloud));
  col = mix(col, accentColor, accentMask * accent);
  col = mix(col, veinColor, vein);
  // fine crystalline texture
  float cr = noise2(slabPos / 0.0012, 20.0) * 0.5 + noise2(slabPos / 0.0005, 21.0) * 0.5;
  col *= 1.0 + sparkle * 0.035 * cr;
  col = varyColor(col, vec3(0.004, 0.05, 0.02), c.rnd2.xyz);

  // ---------------- finish
  float rough = roughness + 0.02 * vein;
  float et = smoothstep(0.4, 0.85, 0.5 + 0.7 * pfbm(uv, F(0.2), 5, 0.55, 30.0)) * etching;
  rough += 0.2 * et;
  float sc = pscratches(uv, F(0.04), 0.5, 0.95, 0.008, 0.0, TAU, 31.0) * scratches;
  rough += 0.3 * sc;

  // ---------------- tile edges and grout
  float g = grout * 0.0005;
  float inside = c.edge - g;
  float h = (c.rnd.w - 0.5) * 2.0 * lippage + lippage * 0.6 * ((c.rnd2.w - 0.5) * (lp.x / c.size.x - 0.5));
  h -= 0.15 * (1.0 - smoothstep(0.0, 0.0012, inside));  // eased arris
  h -= sc * 0.004;
  float gm = 1.0 - smoothstep(-0.0001, 0.0001, inside);
  vec3 gc = groutColor * (0.9 + 0.2 * pnoise(uv, F(0.002), 40.0));
  col = mix(col, gc, gm);
  h = mix(h, -0.6, gm);
  rough = mix(rough, 0.85, gm);

  s.albedo = col;
  s.height = h;
  s.roughness = clamp(rough, 0.02, 1.0);
  s.metallic = 0.0;
  s.ao = 1.0 - 0.2 * gm;
}
`,
});
