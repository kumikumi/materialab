// =====================================================================
//  Surface-level detail shared by many materials: scratches, dirt,
//  stains, cracks. All periodic (tile uv in, tileable result out).
// =====================================================================

/**
 * Random straight scratches. freq = cells per tile (keep cells square in
 * meters, e.g. F(0.05)); up to three scratches per cell, `density` = chance
 * for each; `len` = length in cells (<= 1); `width` in cells; `angle`/`spread`
 * in radians (spread = TAU for any direction). Returns coverage 0..1.
 */
float pscratches(vec2 uv, vec2 freq, float density, float len, float width, float angle, float spread, float seed) {
  freq = pfreq(freq);
  ivec2 per = ivec2(freq);
  vec2 p = uv * freq;
  vec2 ip = floor(p), fp = p - ip;
  float m = 0.0;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    ivec2 cc = wrapCell(ivec2(ip) + ivec2(i, j), per);
    for (int k = 0; k < 3; k++) {
      vec4 h = hash4(ivec3(cc, k), seed);
      if (h.w > density) continue;
      vec2 c0 = vec2(float(i), float(j)) + h.xy;
      float a = angle + (h.z - 0.5) * spread;
      float l = len * (0.25 + 0.75 * fract(h.z * 7.13)) * 0.5;
      vec2 d = vec2(cos(a), sin(a)) * l;
      vec2 pa = fp - (c0 - d), ba = 2.0 * d;
      float t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
      float dist = length(pa - ba * t);
      // scratches taper towards their ends
      float wdt = width * (0.35 + 0.65 * fract(h.w * 13.7 + h.x)) * (0.3 + 0.7 * sin(t * PI));
      m = max(m, (1.0 - smoothstep(0.0, wdt, dist)) * (0.5 + 0.5 * fract(h.y * 5.31)));
    }
  }
  return m;
}

/** Grime that collects in low areas: cavity = 0 (exposed) .. 1 (deep crevice). */
float pdirt(vec2 uv, float cavity, float amount, float seed) {
  float n = 0.5 + 0.5 * pfbm(uv, F(0.25), 5, 0.55, seed);
  return sat(cavity * 1.3 * amount + (n - 0.55) * 1.6 * amount) * amount;
}

/**
 * Crack network: a random subset of (domain-warped) Voronoi edges, chosen
 * per edge so cracks branch and dead-end instead of forming closed loops.
 * freq = cells per tile; width in cell units; keep = fraction of edges cracked.
 * Returns x = crack coverage (0..1), y = distance to the crack line (cell units).
 */
vec2 pcracks(vec2 uv, vec2 freq, float width, float jag, float keep, float seed) {
  freq = pfreq(freq);
  ivec2 per = ivec2(freq);
  vec2 warp = (pfbm2(uv, freq * 2.0, 5, 0.55, seed + 3.0) * 0.7 + pfbm2(uv, freq * 9.0, 3, 0.5, seed + 4.0) * 0.12) * jag;
  vec2 p = uv * freq + warp;
  vec2 ip = floor(p), fp = p - ip;
  ivec2 ic = ivec2(ip);
  float f1 = 1e9, f2 = 1e9;
  vec2 r1 = vec2(0.0), r2 = vec2(0.0);
  ivec2 c1 = ivec2(0), c2 = ivec2(0);
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    ivec2 cc = wrapCell(ic + ivec2(i, j), per);
    vec4 h = hash4(cc, seed);
    vec2 r = vec2(float(i), float(j)) + 0.5 + 0.85 * (h.xy - 0.5) - fp;
    float d = dot(r, r);
    if (d < f1) { f2 = f1; r2 = r1; c2 = c1; f1 = d; r1 = r; c1 = cc; }
    else if (d < f2) { f2 = d; r2 = r; c2 = cc; }
  }
  float dist = dot(0.5 * (r1 + r2), normalize(r2 - r1));
  // order-independent id of the edge between the two cells
  int ka = c1.x + c1.y * 4099, kb = c2.x + c2.y * 4099;
  ivec2 e = ka < kb ? ivec2(ka, kb) : ivec2(kb, ka);
  vec4 he = hash4(ivec3(e, 17), seed + 1.0);
  float on = step(he.x, keep);
  // width varies along the crack and thins out towards some ends
  float wv = width * (0.35 + 0.65 * he.y) * (0.6 + 0.4 * pnoise(uv, freq * 6.0, seed + 5.0));
  float c = on * (1.0 - smoothstep(wv * 0.35, wv, dist));
  return vec2(c, on > 0.5 ? dist : 1e3);
}

/** Vertical streaks (rain / water stains): long thin blobs, freq = (across, along). */
float pstreaks(vec2 uv, vec2 freq, float seed) {
  float a = pnoise(uv, freq, seed);
  float b = pnoise(uv, freq * vec2(4.0, 2.0), seed + 1.0);
  float c = pnoise(uv, max(vec2(1.0), floor(freq * vec2(0.5, 0.25))), seed + 2.0);
  return sat(0.5 + 0.8 * a + 0.35 * b) * smoothstep(-0.3, 0.3, c);
}
