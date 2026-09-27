// =====================================================================
//  Volumetric wood model.
//
//  Each board is a slice through a (virtual) log. We place the log's pith
//  relative to the board — below it for flat-sawn boards, beside it for
//  quarter-sawn — and let it drift along the board. Every surface point is
//  mapped into the log's cross-section (distance/angle from the pith) and
//  the anatomy is evaluated there in 3D:
//
//    annual rings   earlywood -> latewood ramp, varying width per year
//    vessels        pores running along the grain (ring- or diffuse-porous)
//    rays           thin radial ribbons: short dashes on flat-sawn faces,
//                   broad "flecks" on quarter-sawn faces
//    fibers         fine streaks along the grain
//    knots          branches: own ring system, flow of the grain around them
//    figure         curl (tiger stripes)
//
//  Cathedral figure, straight quarter-sawn lines, ray fleck and so on fall
//  out of the geometry instead of being painted on.
// =====================================================================

struct WoodSpecies {
  float ringWidth;    // m, mean annual ring width
  float ringVar;      // 0..0.8, year-to-year width variation
  float lateMin;      // latewood fraction of a ring, min / max
  float lateMax;
  float lateSharp;    // 0 = gradual transition (maple, walnut) .. 1 = abrupt (pine, fir)
  float ringWave;     // m, waviness of the rings
  float poreType;     // 0 none (softwood), 1 ring-porous (oak, ash), 2 diffuse-porous (walnut, maple)
  float poreSize;     // m, vessel radius
  float poreDensity;  // 0..1
  float rays;         // 0..1, ray density
  float raySize;      // m, axial height of rays (along the grain)
  float rayLength;    // m, radial length of rays (across the grain on quarter-sawn faces)
  float rayWidth;     // m, tangential width of rays
  float fiberScale;   // m, cross-section size of fiber bundles
  float knotDensity;  // knots per square meter of board surface
  float knotSize;     // m, typical knot radius
  float deadKnots;    // 0..1 fraction of dead (dark rimmed, cracked) knots
  float curl;         // 0..1 curly figure strength
  float curlSpacing;  // m
};

struct WoodLog {
  vec2 pith;        // pith in board cross-section coords (y across from board center, z up from face)
  vec2 slope;       // pith drift per meter along the board
  float wander;     // m, amplitude of pith wander
  float refR;       // m, reference radius (distance from pith to the board center)
  float sapR;       // m, radius where sapwood begins (huge = none)
  float quarter;    // 0 flat-sawn .. 1 quarter-sawn
  float seed;
};

struct WoodSample {
  float late;       // 0..1 latewood
  float ringPhase;  // 0..1 position in the annual ring
  float year;       // ring index
  float yearRnd;    // per-ring random
  float pore;       // 0..1 vessel coverage
  float ray;        // 0..1 ray coverage
  float fiber;      // -1..1 fiber noise
  float blotch;     // -1..1 low-frequency color variation along the grain
  float streak;     // 0..1 mineral streak
  float sap;        // 0..1 sapwood
  float knot;       // 0..1 inside a knot
  float knotRing;   // ring pattern inside the knot (0..1, 1 = dark)
  float knotRim;    // dark rim of a dead knot
  float knotCrack;  // radial cracks in a knot
  float knotHalo;   // darkened area around knots
  float curl;       // -1..1 curl figure phase (use for height)
  float r;          // distance from pith (m)
  float radialFace; // 0 = face cuts the rays end-on (flat-sawn) .. 1 = shows their broad side (quarter-sawn)
  float earlyTone;  // per-ring variation of the earlywood
};

/**
 * Choose where the board was cut from the log. `cutRnd` in [0,1):
 * below quarterRatio -> quarter-sawn, then riftRatio -> rift, else flat.
 * `cathedral` scales how much the pith depth drifts along the board.
 */
WoodLog makeLog(vec4 r, vec4 r2, float boardWidth, float quarterRatio, float riftRatio,
                float pithMin, float pithMax, float cathedral, float sapAmount, float sapDepth) {
  WoodLog lg;
  float phi;
  if (r.x < quarterRatio) {
    phi = radians(mix(82.0, 90.0, r.y));
    lg.quarter = 1.0;
  } else if (r.x < quarterRatio + riftRatio) {
    phi = radians(mix(30.0, 60.0, r.y));
    lg.quarter = 0.5;
  } else {
    phi = radians(mix(0.0, 22.0, r.y * r.y));
    lg.quarter = 0.0;
  }
  float R0 = mix(pithMin, pithMax, r.z);
  float side = r.w < 0.5 ? -1.0 : 1.0;
  lg.pith = vec2(side * R0 * sin(phi), -R0 * cos(phi));
  // quarter-sawn boards: pith sits beside the board, keep it outside the board width
  if (lg.quarter > 0.9) lg.pith.x = side * max(abs(lg.pith.x), 0.5 * boardWidth + 0.02 + 0.1 * r2.w);
  lg.slope = vec2((r2.x - 0.5) * 0.012, (r2.y - 0.5) * 0.045 * cathedral);
  lg.wander = 0.004 + 0.004 * r2.z;
  lg.refR = max(length(lg.pith), 0.02);
  // sapwood: put the heartwood boundary somewhere across the board face
  float hw = 0.5 * boardWidth;
  float rMin = length(vec2(clamp(lg.pith.x, -hw, hw) - lg.pith.x, lg.pith.y));
  float rMax = max(length(vec2(-hw, 0.0) - lg.pith), length(vec2(hw, 0.0) - lg.pith));
  lg.sapR = r2.w < sapAmount ? mix(rMin, rMax, 0.3 + 0.6 * fract(r2.w * 13.7)) + sapDepth : 1e3;
  lg.seed = floor(r.x * 977.0 + r.z * 131.0 + r2.x * 57.0);
  return lg;
}

/** Vessels (pores) in the cross-section, running along the grain. */
float woodPores(vec2 d, float x, float ph, float late, WoodSpecies sp, float seed) {
  if (sp.poreType < 0.5 || sp.poreDensity <= 0.0) return 0.0;
  float dens, size;
  if (sp.poreType < 1.5) {
    // ring-porous: a band of large earlywood vessels, tiny ones in latewood
    float early = 1.0 - smoothstep(0.1, 0.32, ph);
    dens = sp.poreDensity * (0.08 + 0.92 * early);
    size = sp.poreSize * mix(0.45, 1.0, early);
  } else {
    // diffuse / semi-ring-porous: evenly spread, slightly smaller in latewood
    dens = sp.poreDensity * mix(1.0, 0.6, late);
    size = sp.poreSize * mix(1.0, 0.75, late);
  }
  float cs = sp.poreSize * 2.6;
  // vessels wander a little along their length
  d += sp.poreSize * 1.2 * vec2(noise1(x / 0.011, seed + 3.0), noise1(x / 0.013, seed + 4.0));
  vec2 g = d / cs;
  vec2 ig = floor(g);
  float m = 0.0;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    ivec2 c = ivec2(ig) + ivec2(i, j);
    vec4 h = hash4(ivec3(c, int(seed)), 5.0);
    float segLen = sp.poreSize * 70.0 * (0.4 + h.w);
    float xs = x / segLen + h.z;
    float seg = floor(xs);
    float fx = xs - seg;
    vec4 h2 = hash4(ivec3(c.x, c.y * 7919 + int(seg), int(seed)), 6.0);
    if (h2.x > dens) continue;
    float rad = size * (0.55 + 0.6 * h2.y);
    rad *= smoothstep(0.0, 0.18, fx) * smoothstep(1.0, 0.82, fx);
    vec2 pc = (vec2(c) + 0.5 + 0.7 * (h.xy - 0.5)) * cs;
    float dist = length(d - pc);
    m = max(m, 1.0 - smoothstep(rad * 0.55, rad, dist));
  }
  return m;
}

/**
 * Rays: ellipsoids that are thin tangentially, long radially and of
 * moderate axial height. s = tangential coordinate, r = radial, x = axial.
 */
float woodRays(float s, float r, float x, WoodSpecies sp, float seed) {
  if (sp.rays <= 0.0) return 0.0;
  // rays are not flat sheets: they undulate tangentially, so a nearly radial
  // face cuts them into irregular flakes rather than neat ellipses
  s += sp.rayWidth * 0.9 * noise3(vec3(r / (sp.rayLength * 1.2), x / (sp.raySize * 1.0), s / (sp.rayWidth * 9.0)), seed + 24.0);
  vec3 cell = vec3(sp.rayWidth * 7.0, sp.rayLength * 1.6, sp.raySize * 1.25);
  vec3 p = vec3(s, r, x);
  vec3 g = p / cell;
  vec3 ig = floor(g), fg = g - ig;
  ivec3 base = ivec3(ig) - ivec3(step(fg, vec3(0.5)));
  float m = 0.0;
  for (int k = 0; k <= 1; k++)
  for (int j = 0; j <= 1; j++)
  for (int i = 0; i <= 1; i++) {
    ivec3 c = base + ivec3(i, j, k);
    vec4 h = hash4(c, seed + 21.0);
    if (h.w > sp.rays) continue;
    // a few large (multiseriate) rays among many small ones
    float big = h.w < sp.rays * 0.3 ? 1.0 : 0.4;
    vec3 ctr = (vec3(c) + 0.5 + (h.xyz - 0.5) * vec3(0.5, 0.4, 0.4)) * cell;
    vec3 ext = vec3(sp.rayWidth * (0.4 + 0.9 * h.x) * mix(0.6, 1.0, big),
                    cell.y * (0.2 + 0.5 * h.y) * big,
                    cell.z * (0.2 + 0.45 * h.z) * big);
    vec3 q = (p - ctr) / ext;
    // ragged outline
    q.yz += 0.3 * vec2(noise3(p * vec3(300.0, 180.0, 180.0), seed + 22.0), noise3(p * vec3(300.0, 170.0, 190.0), seed + 23.0));
    float e = dot(q, q);
    m = max(m, (1.0 - smoothstep(0.5, 1.0, e)) * mix(0.6, 1.0, big));
  }
  return m;
}

/** Knots of one board. The board plane is (x along grain, y across, centered). */
struct KnotInfo {
  vec2 warp;      // deflected (x, y) to evaluate the trunk wood at
  float inside;   // 0..1
  float ring;     // knot's own rings
  float rim;
  float crack;
  float halo;
};

KnotInfo woodKnots(vec2 bp, vec2 boardSize, WoodSpecies sp, float quarter, float seed) {
  KnotInfo k;
  k.warp = bp; k.inside = 0.0; k.ring = 0.0; k.rim = 0.0; k.crack = 0.0; k.halo = 0.0;
  if (sp.knotDensity <= 0.0) return k;
  float expected = sp.knotDensity * boardSize.x * boardSize.y;
  vec4 hn = hash4(int(seed), 31.0);
  int count = min(int(floor(expected + hn.x)), 5);
  vec2 dy = vec2(0.0);
  for (int i = 0; i < 5; i++) {
    if (i >= count) break;
    vec4 h = hash4(int(seed) * 16 + i, 32.0);
    vec4 h2 = hash4(int(seed) * 16 + i, 33.0);
    vec2 kp = vec2((0.06 + 0.88 * h.x) * boardSize.x, (h.y - 0.5) * boardSize.y * 1.05);
    float R = sp.knotSize * (0.35 + 0.9 * h.z);
    float elong = mix(1.0 + 1.2 * h.w * h.w, 3.0 + 4.0 * h.w, quarter);
    vec2 rel = bp - kp;
    vec2 kd = vec2(rel.x / elong, rel.y);
    float rho = length(kd);
    // grain flows around the knot: potential flow around a cylinder,
    // stretched along the grain so the disturbance forms long "eyes"
    float fe = elong * 2.2;
    vec2 fd = vec2(rel.x / fe, rel.y);
    float frho2 = max(dot(fd, fd), R * R);
    float fall = 1.0 - smoothstep(1.5 * R, 7.0 * R, sqrt(frho2));
    dy.y += -rel.y * (R * R / frho2) * fall;
    k.halo = max(k.halo, (1.0 - smoothstep(R, 2.2 * R, rho)) * (0.5 + 0.5 * h2.z));
    if (rho < R * 1.02) {
      float ins = 1.0 - smoothstep(R * 0.97, R * 1.02, rho);
      k.inside = max(k.inside, ins);
      float ang = atan(kd.y, kd.x);
      float kr = rho / (sp.ringWidth * 0.45 + 0.0004) + 1.2 * noise1(ang * 1.5 + h2.x * 10.0, seed + 34.0);
      float kph = fract(kr);
      k.ring = mix(smoothstep(0.55, 0.9, kph), 1.0, 1.0 - smoothstep(0.0, 0.18 * R, rho));
      bool dead = h2.y < sp.deadKnots;
      if (dead) {
        k.rim = smoothstep(0.84, 0.93, rho / R) * (1.0 - smoothstep(0.99, 1.02, rho / R));
        // radial checks
        float c = 0.0;
        for (int j = 0; j < 3; j++) {
          float a = h2.x * TAU + float(j) * 2.1 + h2.w * 1.3;
          float da = abs(mod(ang - a + PI, TAU) - PI);
          float w = 0.02 + 0.03 * fract(h2.w * float(j + 3) * 7.1);
          c = max(c, (1.0 - smoothstep(w * 0.4, w, da)) * smoothstep(0.1, 0.35, rho / R) * (1.0 - smoothstep(0.8, 0.95, rho / R)));
        }
        k.crack = c * (h2.z > 0.35 ? 1.0 : 0.0);
      }
    }
  }
  k.warp = bp + dy;
  return k;
}

/**
 * Evaluate the wood anatomy at a board point.
 *  bp: (x along the board from its start, y across from the board's center line), meters
 *  depth: how far below the board face (m, >= 0) — lets you cut deeper (e.g. worn/eroded)
 */
WoodSample woodSample(vec2 bp, float depth, vec2 boardSize, WoodLog lg, WoodSpecies sp) {
  WoodSample w;
  KnotInfo kn = woodKnots(bp, boardSize, sp, lg.quarter, lg.seed);
  vec2 wp = kn.warp;
  float x = wp.x;
  // the log is not straight: its pith wanders (less in depth, so cathedrals keep one direction)
  vec2 pith = lg.pith + lg.slope * (x - 0.5 * boardSize.x)
            + lg.wander * vec2(noise1(x * 1.3, lg.seed + 1.0), 0.35 * noise1(x * 0.9, lg.seed + 2.0));
  vec2 d = vec2(wp.y, -depth) - pith;         // cross-section vector from the pith
  float r = length(d);
  float theta = atan(d.x, d.y);

  // ring shape: low-order lobes + waviness that drifts slowly along the log
  float lobes = r * (0.035 * sin(2.0 * theta + lg.seed) + 0.02 * sin(3.0 * theta + lg.seed * 1.7));
  vec3 np = vec3(d / 0.035, x / 0.5);
  float wav = sp.ringWave * (fbm3(np, 3, 0.5, lg.seed + 11.0) + 0.15 * noise3(np * vec3(3.0, 3.0, 1.5), lg.seed + 12.0));
  float rr = r + lobes + wav;

  float years = rr / sp.ringWidth;
  // slow trend: decades of good and bad growth
  float t = years + sp.ringVar * 1.6 * fbm1(years * 0.12 + lg.seed, 2, 0.5, lg.seed + 5.0);
  // individual years: boundaries b(k) = k + J (h(k) - 0.5) give independent ring widths in [1-J, 1+J]
  float J = min(0.9, sp.ringVar * 1.15);
  float rs = lg.seed + 6.0;
  float k0 = floor(t);
  float yr = k0;
  float b0 = k0 + J * (hash1(int(k0), rs) - 0.5);
  float b1 = k0 + 1.0 + J * (hash1(int(k0) + 1, rs) - 0.5);
  if (t < b0) { yr = k0 - 1.0; b1 = b0; b0 = k0 - 1.0 + J * (hash1(int(k0) - 1, rs) - 0.5); }
  else if (t >= b1) { yr = k0 + 1.0; b0 = b1; b1 = k0 + 2.0 + J * (hash1(int(k0) + 2, rs) - 0.5); }
  float ringW = b1 - b0;
  float ph = (t - b0) / ringW;
  vec4 hy = hash4(int(yr) + int(lg.seed) * 1024, 17.0);
  // latewood width varies less than earlywood: narrow years are mostly latewood
  float lw = clamp(mix(sp.lateMin, sp.lateMax, hy.x) * mix(1.0, 1.0 / ringW, 0.5), 0.04, 0.95);
  float edge = 1.0 - lw;
  float soft = mix(0.6 * lw + 0.06, 0.035, sp.lateSharp);
  float late = smoothstep(edge - soft, edge + soft * 0.3, ph);
  // latewood is densest at the very end of the ring, then the next year starts
  // (abruptly in softwoods and oak, softly in diffuse-porous woods)
  late *= mix(0.75, 1.0, smoothstep(edge, 1.0, ph));
  float bs = mix(0.22, 0.015, sp.lateSharp);
  late *= 1.0 - smoothstep(1.0 - bs, 1.0, ph) * mix(0.8, 0.5, sp.lateSharp);
  // grain lines fade in and out along their length
  late *= 0.72 + 0.28 * sat(0.5 + 0.8 * noise3(vec3(d / 0.012, x / 0.09), lg.seed + 7.0));

  w.late = late;
  w.earlyTone = hy.z - 0.5;
  w.radialFace = abs(d.x) / max(r, 1e-5);
  w.ringPhase = ph;
  w.year = yr;
  w.yearRnd = hy.y;
  w.r = r;

  w.pore = woodPores(d, x, ph, late, sp, lg.seed + 40.0);
  w.ray = woodRays(theta * lg.refR, rr, x, sp, lg.seed + 50.0);

  // fibers: fine streaks along the grain, plus a coarser layer of longer streaks
  vec3 fp = vec3(d / sp.fiberScale, x / 0.07);
  float fine = 0.65 * noise3(fp, lg.seed + 60.0) + 0.35 * noise3(fp * vec3(2.7, 2.7, 1.9), lg.seed + 61.0);
  float coarse = noise3(vec3(d / (sp.fiberScale * 5.0), x / 0.25), lg.seed + 62.0);
  w.fiber = clamp(1.3 * fine + 0.8 * coarse, -1.5, 1.5);
  w.blotch = fbm3(vec3(d / 0.035, x / 0.45), 3, 0.5, lg.seed + 70.0);
  float st = noise3(vec3(d / 0.004, x / 0.25), lg.seed + 80.0);
  w.streak = smoothstep(0.55, 0.8, st) * smoothstep(0.2, 0.6, noise3(vec3(d / 0.03, x / 0.6), lg.seed + 81.0));

  w.sap = smoothstep(-0.004, 0.006, rr - lg.sapR + 0.006 * noise3(vec3(d / 0.01, x / 0.2), lg.seed + 90.0));

  w.knot = kn.inside;
  w.knotRing = kn.ring;
  w.knotRim = kn.rim;
  w.knotCrack = kn.crack;
  w.knotHalo = kn.halo;

  w.curl = 0.0;
  if (sp.curl > 0.0) {
    // stripes run across the board, gently bending and slanting, irregularly spaced,
    // fading in and out in patches
    float band = 0.5 + 0.5 * noise2(vec2(bp.x / 0.12, bp.y / 0.08), lg.seed + 100.0);
    float phase = bp.x / sp.curlSpacing
                + 0.9 * noise1(bp.y / 0.12 + lg.seed, lg.seed + 101.0)
                + bp.y / sp.curlSpacing * 0.25 * (fract(lg.seed * 0.37) - 0.5)
                + 0.8 * noise1(bp.x / 0.035, lg.seed + 102.0);
    float wave = sin(TAU * phase);
    // fibers roll in and out of the surface: flat tops, steep flanks
    float amp = sat(0.55 + 0.7 * noise1(phase * 0.8 + lg.seed, lg.seed + 103.0));
    w.curl = sign(wave) * pow(abs(wave), 0.5) * amp * smoothstep(0.2, 0.65, band) * sp.curl;
  }
  return w;
}

/** Standard coloring: earlywood/latewood ramp plus the anatomical features. */
vec3 woodColor(WoodSample w, vec3 early, vec3 late, vec3 sap, vec3 knotCol, float fiberContrast, float poreDark, float rayTone) {
  vec3 ew = mix(early, sap, w.sap * 0.85);
  vec3 lt = mix(late, mix(sap, late, 0.35), w.sap * 0.85);
  float yearTone = 1.0 + (w.yearRnd - 0.5) * 0.12;
  vec3 c = mix(ew * (1.0 + 0.14 * w.earlyTone), lt, w.late) * yearTone;
  c *= 1.0 + w.blotch * 0.12;
  c *= 1.0 + w.fiber * fiberContrast;
  c = mix(c, c * vec3(0.55, 0.55, 0.52), w.streak * 0.6);
  // rays seen end-on (flat-sawn) read as dark dashes, their broad side (quarter-sawn) as light flecks
  float rt = mix(-0.7 * abs(rayTone), rayTone, smoothstep(0.35, 0.85, w.radialFace));
  c = mix(c, c * (1.0 + rt), w.ray);
  c = mix(c, c * (1.0 - poreDark), w.pore);
  vec3 halo = c * vec3(0.8, 0.72, 0.64);
  c = mix(c, halo, w.knotHalo * 0.5);
  vec3 kc = mix(knotCol * 1.25, knotCol * 0.6, w.knotRing);
  kc = mix(kc, knotCol * 0.25, w.knotRim);
  kc = mix(kc, knotCol * 0.15, w.knotCrack);
  c = mix(c, kc, w.knot);
  return clamp(c, 0.0, 1.0);
}
