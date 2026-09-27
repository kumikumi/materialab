import { defineGenerator, type ParamValues } from '../engine/types';

const n = (p: ParamValues, k: string) => Number(p[k]);

/**
 * Boards (planks or herringbone) cut from virtual logs; see glsl/wood.glsl
 * for the anatomy model. Species are presets of this generator.
 */
export const woodGenerator = defineGenerator({
  id: 'wood',
  params: {
    // ---- layout
    pattern: { type: 'enum', group: 'Layout', label: 'Pattern', default: 0, options: ['Planks', 'Herringbone'] },
    boardWidth: { type: 'float', group: 'Layout', label: 'Board width', default: 0.15, min: 0.04, max: 0.4, step: 0.005, unit: 'm' },
    rows: { type: 'int', group: 'Layout', label: 'Rows per tile', default: 8, min: 1, max: 24, help: 'Planks: tile height = rows × board width' },
    tileLength: { type: 'float', group: 'Layout', label: 'Tile length', default: 2.4, min: 0.3, max: 6, step: 0.05, unit: 'm', help: 'Planks: tile width' },
    minPerRow: { type: 'int', group: 'Layout', label: 'Min planks/row', default: 1, min: 1, max: 8 },
    maxPerRow: { type: 'int', group: 'Layout', label: 'Max planks/row', default: 2, min: 1, max: 8 },
    herringboneRatio: { type: 'int', group: 'Layout', label: 'Herringbone L/W', default: 5, min: 2, max: 8 },
    herringboneRepeats: { type: 'int', group: 'Layout', label: 'Herringbone reps', default: 1, min: 1, max: 4 },
    gap: { type: 'float', group: 'Layout', label: 'Joint gap', default: 0.4, min: 0, max: 12, step: 0.05, unit: 'mm' },
    gapDepth: { type: 'float', group: 'Layout', label: 'Joint depth', default: 3, min: 0, max: 20, step: 0.1, unit: 'mm' },
    gapColor: { type: 'color', group: 'Layout', label: 'Joint color', default: '#1c140d' },
    gapRoughness: { type: 'float', group: 'Layout', label: 'Joint roughness', default: 0.9, min: 0, max: 1, step: 0.01 },
    bevel: { type: 'float', group: 'Layout', label: 'Edge bevel', default: 1.0, min: 0, max: 6, step: 0.05, unit: 'mm' },
    heightVar: { type: 'float', group: 'Layout', label: 'Board height var', default: 0.15, min: 0, max: 2, step: 0.01, unit: 'mm' },
    cupping: { type: 'float', group: 'Layout', label: 'Cupping', default: 0.1, min: -1, max: 1, step: 0.01, unit: 'mm' },
    // ---- cut
    quarterSawn: { type: 'float', group: 'Cut', label: 'Quarter-sawn', default: 0.1, min: 0, max: 1, step: 0.01, help: 'Fraction of quarter-sawn boards' },
    riftSawn: { type: 'float', group: 'Cut', label: 'Rift-sawn', default: 0.2, min: 0, max: 1, step: 0.01, help: 'Fraction of rift-sawn boards' },
    pithMin: { type: 'float', group: 'Cut', label: 'Pith distance min', default: 0.08, min: 0.02, max: 0.6, step: 0.005, unit: 'm' },
    pithMax: { type: 'float', group: 'Cut', label: 'Pith distance max', default: 0.3, min: 0.02, max: 0.8, step: 0.005, unit: 'm' },
    cathedral: { type: 'float', group: 'Cut', label: 'Cathedral', default: 1, min: 0, max: 3, step: 0.01, help: 'How much the log axis tilts through the board (arches in flat-sawn boards)' },
    // ---- rings
    ringWidth: { type: 'float', group: 'Rings', label: 'Ring width', default: 3, min: 0.5, max: 12, step: 0.05, unit: 'mm', log: true },
    ringVar: { type: 'float', group: 'Rings', label: 'Ring variation', default: 0.4, min: 0, max: 0.8, step: 0.01 },
    lateMin: { type: 'float', group: 'Rings', label: 'Latewood min', default: 0.25, min: 0.02, max: 0.9, step: 0.01 },
    lateMax: { type: 'float', group: 'Rings', label: 'Latewood max', default: 0.5, min: 0.02, max: 0.95, step: 0.01 },
    lateSharp: { type: 'float', group: 'Rings', label: 'Transition sharp', default: 0.4, min: 0, max: 1, step: 0.01, help: '0 = gradual (maple, walnut), 1 = abrupt (pine, fir)' },
    ringWave: { type: 'float', group: 'Rings', label: 'Ring waviness', default: 0.8, min: 0, max: 12, step: 0.05, unit: 'mm' },
    // ---- pores
    poreType: { type: 'enum', group: 'Pores', label: 'Pore type', default: 1, options: ['None (softwood)', 'Ring-porous', 'Diffuse-porous'] },
    poreSize: { type: 'float', group: 'Pores', label: 'Pore radius', default: 0.12, min: 0.02, max: 0.5, step: 0.005, unit: 'mm' },
    poreDensity: { type: 'float', group: 'Pores', label: 'Pore density', default: 0.5, min: 0, max: 1, step: 0.01 },
    poreDepth: { type: 'float', group: 'Pores', label: 'Pore depth', default: 0.06, min: 0, max: 0.5, step: 0.005, unit: 'mm' },
    poreDarkness: { type: 'float', group: 'Pores', label: 'Pore darkness', default: 0.35, min: 0, max: 1, step: 0.01 },
    // ---- rays
    rays: { type: 'float', group: 'Rays', label: 'Ray density', default: 0.5, min: 0, max: 1, step: 0.01 },
    raySize: { type: 'float', group: 'Rays', label: 'Ray height', default: 12, min: 1, max: 60, step: 0.5, unit: 'mm', help: 'Along the grain' },
    rayLength: { type: 'float', group: 'Rays', label: 'Ray length', default: 15, min: 1, max: 80, step: 0.5, unit: 'mm', help: 'Radial extent: across the grain on quarter-sawn faces' },
    rayWidth: { type: 'float', group: 'Rays', label: 'Ray width', default: 0.25, min: 0.02, max: 1.5, step: 0.01, unit: 'mm' },
    rayTone: { type: 'float', group: 'Rays', label: 'Ray tone', default: 0.12, min: -0.6, max: 0.6, step: 0.01, help: '+ lighter, − darker than surrounding wood' },
    rayGloss: { type: 'float', group: 'Rays', label: 'Ray gloss', default: 0.08, min: 0, max: 0.4, step: 0.01, help: 'Roughness reduction on rays' },
    // ---- fibers
    fiberScale: { type: 'float', group: 'Fibers', label: 'Fiber size', default: 0.5, min: 0.1, max: 3, step: 0.01, unit: 'mm' },
    fiberContrast: { type: 'float', group: 'Fibers', label: 'Fiber contrast', default: 0.04, min: 0, max: 0.4, step: 0.005 },
    fiberRelief: { type: 'float', group: 'Fibers', label: 'Fiber relief', default: 0.004, min: 0, max: 0.2, step: 0.001, unit: 'mm' },
    latewoodRelief: { type: 'float', group: 'Fibers', label: 'Latewood relief', default: 0.01, min: 0, max: 1.5, step: 0.005, unit: 'mm', help: 'Latewood stands proud (worn / weathered / brushed wood)' },
    // ---- knots
    knotDensity: { type: 'float', group: 'Knots', label: 'Knots per m²', default: 0.3, min: 0, max: 20, step: 0.1 },
    knotSize: { type: 'float', group: 'Knots', label: 'Knot radius', default: 10, min: 1, max: 40, step: 0.5, unit: 'mm' },
    deadKnots: { type: 'float', group: 'Knots', label: 'Dead knots', default: 0.3, min: 0, max: 1, step: 0.01 },
    // ---- figure
    curl: { type: 'float', group: 'Figure', label: 'Curl', default: 0, min: 0, max: 1, step: 0.01, help: 'Curly / tiger-stripe figure' },
    curlSpacing: { type: 'float', group: 'Figure', label: 'Curl spacing', default: 9, min: 2, max: 40, step: 0.5, unit: 'mm' },
    curlDepth: { type: 'float', group: 'Figure', label: 'Curl relief', default: 0.02, min: 0, max: 0.3, step: 0.002, unit: 'mm', help: 'Fake relief that makes the stripes flip with the light' },
    curlTone: { type: 'float', group: 'Figure', label: 'Curl tone', default: 0.08, min: 0, max: 0.4, step: 0.005 },
    // ---- color
    earlyColor: { type: 'color', group: 'Color', label: 'Earlywood', default: '#c9a47a' },
    lateColor: { type: 'color', group: 'Color', label: 'Latewood', default: '#9c7249' },
    sapColor: { type: 'color', group: 'Color', label: 'Sapwood', default: '#dcc6a0' },
    knotColor: { type: 'color', group: 'Color', label: 'Knot', default: '#6e4526' },
    sapwood: { type: 'float', group: 'Color', label: 'Sapwood boards', default: 0.1, min: 0, max: 1, step: 0.01 },
    boardVariation: { type: 'float', group: 'Color', label: 'Board variation', default: 1, min: 0, max: 3, step: 0.01 },
    blotch: { type: 'float', group: 'Color', label: 'Blotchiness', default: 0.12, min: 0, max: 0.5, step: 0.005 },
    streaks: { type: 'float', group: 'Color', label: 'Mineral streaks', default: 0.2, min: 0, max: 1, step: 0.01 },
    // ---- finish
    roughness: { type: 'float', group: 'Finish', label: 'Roughness', default: 0.42, min: 0.02, max: 1, step: 0.005 },
    poreRoughness: { type: 'float', group: 'Finish', label: 'Pore roughness', default: 0.2, min: 0, max: 0.6, step: 0.01 },
    latewoodGloss: { type: 'float', group: 'Finish', label: 'Latewood gloss', default: 0.04, min: -0.2, max: 0.3, step: 0.005 },
    wear: { type: 'float', group: 'Finish', label: 'Wear', default: 0.3, min: 0, max: 1, step: 0.01, help: 'Traffic wear: patchy roughness and fine scratches' },
    clearcoat: { type: 'float', group: 'Finish', label: 'Clear coat', default: 0, min: 0, max: 1, step: 0.01, help: 'Separate glossy layer (exported as clearcoat)' },
    clearcoatRoughness: { type: 'float', group: 'Finish', label: 'Coat roughness', default: 0.08, min: 0, max: 1, step: 0.005 },
    // ---- weathering
    weathering: { type: 'float', group: 'Weathering', label: 'Weathering', default: 0, min: 0, max: 1, step: 0.01, help: 'Silvering, eroded earlywood, raised grain' },
    greyColor: { type: 'color', group: 'Weathering', label: 'Weathered color', default: '#8c867c' },
    erosion: { type: 'float', group: 'Weathering', label: 'Erosion depth', default: 0.8, min: 0, max: 3, step: 0.01, unit: 'mm' },
    checks: { type: 'float', group: 'Weathering', label: 'Checks (cracks)', default: 0, min: 0, max: 1, step: 0.01 },
    nails: { type: 'bool', group: 'Weathering', label: 'Nail holes', default: false },
    sawMarks: { type: 'float', group: 'Weathering', label: 'Saw marks', default: 0, min: 0, max: 1, step: 0.01 },
  },
  tileSize: (p) => {
    const w = n(p, 'boardWidth');
    if (n(p, 'pattern') === 1) {
      const t = n(p, 'herringboneRepeats') * n(p, 'herringboneRatio') * Math.SQRT2 * w;
      return [t, t];
    }
    return [n(p, 'tileLength'), n(p, 'rows') * w];
  },
  extras: (p) => ({
    clearcoat: n(p, 'clearcoat') || undefined,
    clearcoatRoughness: n(p, 'clearcoatRoughness'),
    parallax: n(p, 'gapDepth') > 1 && n(p, 'gap') > 1,
  }),
  glsl: /* glsl */ `
void surface(vec2 uv, inout Surface s) {
  Cell c;
  if (pattern == 1) c = herringboneLayout(uv, boardWidth, float(herringboneRatio), 1.0);
  else c = plankLayout(uv, rows, minPerRow, max(maxPerRow, minPerRow), 1.0);

  float halfGap = gap * 0.0005;
  float inside = c.edge - halfGap;                         // m from the visible board edge
  vec2 bp = vec2(c.local.x, c.local.y - 0.5 * c.size.y);   // along grain, across (centered)

  WoodSpecies sp;
  sp.ringWidth = ringWidth * 0.001;
  sp.ringVar = ringVar;
  sp.lateMin = lateMin;
  sp.lateMax = max(lateMax, lateMin);
  sp.lateSharp = lateSharp;
  sp.ringWave = ringWave * 0.001;
  sp.poreType = float(poreType);
  sp.poreSize = poreSize * 0.001;
  sp.poreDensity = poreDensity;
  sp.rays = rays;
  sp.raySize = raySize * 0.001;
  sp.rayLength = rayLength * 0.001;
  sp.rayWidth = rayWidth * 0.001;
  sp.fiberScale = fiberScale * 0.001;
  sp.knotDensity = knotDensity;
  sp.knotSize = knotSize * 0.001;
  sp.deadKnots = deadKnots;
  sp.curl = curl;
  sp.curlSpacing = curlSpacing * 0.001;

  WoodLog lg = makeLog(c.rnd, c.rnd2, c.size.y, quarterSawn, riftSawn, pithMin, max(pithMax, pithMin), cathedral, sapwood, 0.0);

  // weathered wood: soft earlywood erodes, so we look slightly deeper into the board there
  WoodSample w = woodSample(bp, 0.0, c.size, lg, sp);

  // ---------------- color
  vec3 col = woodColor(w, earlyColor, lateColor, sapColor, knotColor, fiberContrast, poreDarkness, rayTone);
  col *= 1.0 + w.blotch * (blotch / 0.12 - 1.0) * 0.12;
  col = mix(col, col * vec3(0.55, 0.56, 0.54), w.streak * streaks);
  col *= 1.0 + w.curl * curlTone;
  col = varyColor(col, vec3(0.005, 0.08, 0.1) * boardVariation, c.rnd2.xyz);

  // ---------------- height (mm)
  float h = 0.0;
  h += (c.rnd.w - 0.5) * 2.0 * heightVar;
  float across = bp.y / max(0.5 * c.size.y, 1e-4);
  h -= cupping * across * across;
  h += latewoodRelief * (w.late - 0.5);
  h += fiberRelief * w.fiber;
  h -= poreDepth * w.pore;
  h += w.curl * curlDepth;
  h -= w.knotCrack * 0.25;
  h -= w.knotRim * 0.05;

  // ---------------- roughness
  float rough = roughness;
  rough += poreRoughness * w.pore;
  rough -= latewoodGloss * w.late;
  rough -= rayGloss * w.ray;
  rough += 0.03 * w.fiber;
  rough += 0.06 * w.knotCrack;

  // ---------------- wear: patchy traffic + fine scratches
  if (wear > 0.0) {
    float traffic = sat(0.5 + 0.9 * pfbm(uv, F(0.35), 4, 0.5, 11.0));
    float sc = pscratches(uv, F(0.06), 0.55, 0.9, 0.012, 0.0, TAU, 12.0) * 0.6
             + pscratches(uv, F(0.02), 0.35, 0.8, 0.02, 0.0, TAU, 13.0) * 0.4;
    rough += wear * (0.12 * traffic + 0.18 * sc);
    h -= wear * 0.01 * sc;
    col = mix(col, col * 1.05 + 0.015, wear * sc * 0.5);
  }

  // ---------------- weathering
  if (weathering > 0.0) {
    float wb = weathering * (0.75 + 0.5 * c.rnd.z);
    float grey = sat(wb * (0.85 + 0.3 * pfbm(uv, F(0.12), 4, 0.5, 21.0)));
    vec3 g = greyColor * (0.8 + 0.4 * w.late) * (1.0 + 0.15 * w.fiber);
    g = varyColor(g, vec3(0.01, 0.2, 0.12), c.rnd.xyz);
    col = mix(col, g, grey);
    h += wb * erosion * (w.late - 0.5 + 0.35 * w.fiber);
    rough = mix(rough, 0.85 + 0.1 * (1.0 - w.late), wb);
  }
  if (checks > 0.0) {
    // drying checks: long thin cracks along the grain
    float ln = noise3(vec3(bp.y / 0.004, bp.x / 0.18, lg.seed), lg.seed + 200.0);
    float gate = smoothstep(0.35, 0.7, noise3(vec3(bp.y / 0.03, bp.x / 0.35, lg.seed), lg.seed + 201.0));
    float ck = (1.0 - smoothstep(0.015, 0.06, abs(ln))) * gate * step(1.0 - checks, fract(lg.seed * 0.137) + 0.2);
    h -= ck * 1.2;
    col *= 1.0 - 0.6 * ck;
    rough += 0.1 * ck;
  }
  if (sawMarks > 0.0) {
    // band-saw marks: slightly curved kerf lines across the board with irregular spacing and depth
    float xw = bp.x + 0.004 * noise1(bp.x / 0.06, lg.seed + 211.0);
    float kerf = xw / 0.009 + bp.y * bp.y * 6.0;
    float kk = floor(kerf);
    float f = kerf - kk;
    float m = smoothstep(0.0, 0.2, f) * (1.0 - smoothstep(0.3, 1.0, f));
    m *= 0.25 + 0.75 * hash1(int(kk) + int(lg.seed) * 64, 212.0);
    m *= sat(0.55 + 0.6 * noise1(bp.y / 0.035 + kk * 0.37, lg.seed + 213.0));
    h += sawMarks * 0.3 * m;
    col *= 1.0 - 0.06 * sawMarks * m;
  }
  if (nails) {
    // two nails near each board end
    float nd = 1e3;
    for (int e = 0; e < 2; e++) {
      float xe = e == 0 ? 0.035 : c.size.x - 0.035;
      for (int k = -1; k <= 1; k += 2) {
        vec2 np = vec2(xe, float(k) * 0.26 * c.size.y) + (c.rnd.xy - 0.5) * 0.006;
        nd = min(nd, length(bp - np));
      }
    }
    float head = 1.0 - smoothstep(0.0028, 0.0034, nd);
    float stain = (1.0 - smoothstep(0.003, 0.018, nd)) * (0.6 + 0.4 * noise2(bp / 0.004, lg.seed + 220.0));
    col = mix(col, col * vec3(0.55, 0.42, 0.32), sat(stain) * 0.8);
    col = mix(col, vec3(0.12, 0.1, 0.09), head);
    h = mix(h, h - 0.6, head);
    rough = mix(rough, 0.6, head);
  }

  // ---------------- board edges and joints
  float bev = max(bevel * 0.001, 1e-5);
  float e = clamp(inside / bev, 0.0, 1.0);
  h -= bevel * (1.0 - e) * (1.0 - e);
  // soften the arris even without a bevel
  h -= 0.08 * (1.0 - smoothstep(0.0, 0.0006, inside));
  float joint = 1.0 - smoothstep(-0.0001, 0.00005, inside);
  vec3 jointCol = gapColor * (0.85 + 0.3 * pvalue(uv, F(0.01), 30.0));
  col = mix(col, jointCol, joint);
  h = mix(h, -gapDepth, joint);
  rough = mix(rough, gapRoughness, joint);

  s.albedo = col;
  s.height = h;
  s.roughness = clamp(rough, 0.02, 1.0);
  s.metallic = 0.0;
  s.ao = 1.0 - 0.35 * w.pore * poreDarkness - 0.3 * joint;
}
`,
});
