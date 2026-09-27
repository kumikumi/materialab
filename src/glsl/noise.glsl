// =====================================================================
//  Hashing and noise.
//
//  Two families of functions:
//   * Periodic ("p" prefix) — take tile uv in [0,1) and an integer
//     frequency (cells per tile). They wrap exactly at the tile border, so
//     anything built from them is seamlessly tileable. Use F(size) to get
//     the frequency for a feature size given in meters.
//   * Non-periodic 3D/1D — for volumetric work inside a cell/board where
//     tiling is handled by the layout (see layout.glsl).
//
//  Every function takes a float `seed`; the material's global seed
//  (u_seed) is mixed in automatically.
// =====================================================================

const float U2F = 1.0 / 4294967296.0;

uvec3 pcg3d(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}

uvec4 pcg4d(uvec4 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.w; v.y += v.z * v.x; v.z += v.x * v.y; v.w += v.y * v.z;
  v ^= v >> 16u;
  v.x += v.y * v.w; v.y += v.z * v.x; v.z += v.x * v.y; v.w += v.y * v.z;
  return v;
}

uint seedBits(float s) {
  return floatBitsToUint(s) * 747796405u ^ (u_seed * 2891336453u + 0x9E3779B9u);
}

vec4 hash4(ivec2 c, float s) { return vec4(pcg4d(uvec4(uvec2(c), seedBits(s), 0x68E31DA4u))) * U2F; }
vec4 hash4(ivec3 c, float s) { return vec4(pcg4d(uvec4(uvec3(c), seedBits(s)))) * U2F; }
vec4 hash4(int i, float s)   { return vec4(pcg4d(uvec4(uint(i), seedBits(s), 0xB5297A4Du, 0x1B56C4E9u))) * U2F; }
float hash1(ivec2 c, float s) { return float(pcg3d(uvec3(uvec2(c), seedBits(s))).x) * U2F; }
float hash1(int i, float s)   { return float(pcg3d(uvec3(uint(i), seedBits(s), 0x27D4EB2Fu)).x) * U2F; }

/** Integer frequency (cells per tile) for features of roughly `size` meters. */
vec2 F(float size) { return max(vec2(1.0), floor(u_tileSize / size + 0.5)); }
vec2 F(vec2 size)  { return max(vec2(1.0), floor(u_tileSize / size + 0.5)); }

ivec2 wrapCell(ivec2 c, ivec2 p) { return c - p * ivec2(floor(vec2(c) / vec2(p))); }

/** Periodic functions snap their frequency to whole cells per tile, so any value stays seamless. */
vec2 pfreq(vec2 f) { return max(floor(f + 0.5), vec2(1.0)); }

// ---------------------------------------------------------------------
//  Periodic 2D gradient noise, range ~[-1, 1]
// ---------------------------------------------------------------------
vec2 pgrad(ivec2 c, ivec2 per, uint s) {
  uvec2 w = uvec2(wrapCell(c, per));
  float a = float(pcg3d(uvec3(w, s)).x) * (6.28318530718 * U2F);
  return vec2(cos(a), sin(a));
}

float pnoise(vec2 uv, vec2 freq, float seed) {
  freq = pfreq(freq);
  uint s = seedBits(seed);
  ivec2 per = ivec2(freq);
  vec2 p = uv * freq;
  vec2 i = floor(p), f = p - i;
  ivec2 c = ivec2(i);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n00 = dot(pgrad(c, per, s), f);
  float n10 = dot(pgrad(c + ivec2(1, 0), per, s), f - vec2(1.0, 0.0));
  float n01 = dot(pgrad(c + ivec2(0, 1), per, s), f - vec2(0.0, 1.0));
  float n11 = dot(pgrad(c + ivec2(1, 1), per, s), f - vec2(1.0, 1.0));
  return 1.41421356 * mix(mix(n00, n10, u.x), mix(n01, n11, u.x), u.y);
}

/** Periodic value noise, range [0, 1]. */
float pvalue(vec2 uv, vec2 freq, float seed) {
  freq = pfreq(freq);
  ivec2 per = ivec2(freq);
  vec2 p = uv * freq;
  vec2 i = floor(p), f = p - i;
  ivec2 c = ivec2(i);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash1(wrapCell(c, per), seed);
  float b = hash1(wrapCell(c + ivec2(1, 0), per), seed);
  float d = hash1(wrapCell(c + ivec2(0, 1), per), seed);
  float e = hash1(wrapCell(c + ivec2(1, 1), per), seed);
  return mix(mix(a, b, u.x), mix(d, e, u.x), u.y);
}

/** Periodic fractal noise. Frequency doubles each octave (stays periodic). Range ~[-1,1]. */
float pfbm(vec2 uv, vec2 freq, int octaves, float gain, float seed) {
  freq = pfreq(freq);
  float sum = 0.0, amp = 1.0, norm = 0.0;
  for (int i = 0; i < 12; i++) {
    if (i >= octaves) break;
    sum += amp * pnoise(uv, freq, seed + float(i) * 17.31);
    norm += amp;
    amp *= gain;
    freq *= 2.0;
  }
  return sum / norm;
}

/** Periodic ridged fractal noise, range [0,1], sharp ridges at 1. */
float pridged(vec2 uv, vec2 freq, int octaves, float gain, float seed) {
  freq = pfreq(freq);
  float sum = 0.0, amp = 1.0, norm = 0.0;
  for (int i = 0; i < 12; i++) {
    if (i >= octaves) break;
    float n = 1.0 - abs(pnoise(uv, freq, seed + float(i) * 17.31));
    sum += amp * n * n;
    norm += amp;
    amp *= gain;
    freq *= 2.0;
  }
  return sum / norm;
}

/** Periodic 2D vector fbm, handy for domain warping. */
vec2 pfbm2(vec2 uv, vec2 freq, int octaves, float gain, float seed) {
  return vec2(pfbm(uv, freq, octaves, gain, seed), pfbm(uv, freq, octaves, gain, seed + 91.7));
}

// ---------------------------------------------------------------------
//  Periodic Voronoi / Worley
// ---------------------------------------------------------------------
struct Voronoi {
  float f1;     // distance to the closest feature point (cell units)
  float f2;     // distance to the second closest
  float edge;   // distance to the closest cell border (cell units)
  vec2 center;  // closest feature point, in tile uv (not wrapped)
  vec2 rel;     // vector from sample to closest feature point (cell units)
  vec4 rnd;     // random values of the closest cell (stable across the tile wrap)
};

Voronoi pvoronoi(vec2 uv, vec2 freq, float jitter, float seed) {
  freq = pfreq(freq);
  ivec2 per = ivec2(freq);
  vec2 p = uv * freq;
  vec2 ip = floor(p), fp = p - ip;
  ivec2 ic = ivec2(ip);
  float f1 = 1e9, f2 = 1e9;
  vec2 mr = vec2(0.0);
  ivec2 mo = ivec2(0);
  vec4 mh = vec4(0.0);
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    ivec2 o = ivec2(i, j);
    vec4 h = hash4(wrapCell(ic + o, per), seed);
    vec2 r = vec2(o) + 0.5 + jitter * (h.xy - 0.5) - fp;
    float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; mr = r; mo = o; mh = h; }
    else if (d < f2) { f2 = d; }
  }
  float md = 1e9;
  for (int j = -2; j <= 2; j++)
  for (int i = -2; i <= 2; i++) {
    ivec2 o = mo + ivec2(i, j);
    vec4 h = hash4(wrapCell(ic + o, per), seed);
    vec2 r = vec2(o) + 0.5 + jitter * (h.xy - 0.5) - fp;
    vec2 dd = r - mr;
    if (dot(dd, dd) > 1e-7) md = min(md, dot(0.5 * (mr + r), normalize(dd)));
  }
  Voronoi v;
  v.f1 = sqrt(f1);
  v.f2 = sqrt(f2);
  v.edge = md;
  v.center = (p + mr) / freq;
  v.rel = mr;
  v.rnd = mh;
  return v;
}

/** Cheaper F1-only Worley noise (cell units). */
float pworley(vec2 uv, vec2 freq, float jitter, float seed) {
  freq = pfreq(freq);
  ivec2 per = ivec2(freq);
  vec2 p = uv * freq;
  vec2 ip = floor(p), fp = p - ip;
  ivec2 ic = ivec2(ip);
  float f1 = 1e9;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    ivec2 o = ivec2(i, j);
    vec4 h = hash4(wrapCell(ic + o, per), seed);
    vec2 r = vec2(o) + 0.5 + jitter * (h.xy - 0.5) - fp;
    f1 = min(f1, dot(r, r));
  }
  return sqrt(f1);
}

/**
 * Periodic "speckles": sparse round dots of random size. Returns coverage
 * in [0,1] (1 inside a dot) with a soft rim; `density` is the fraction of
 * cells that carry a dot, `radius` is relative to the cell (0..0.5).
 */
float pspeckle(vec2 uv, vec2 freq, float density, float radius, float softness, float seed) {
  freq = pfreq(freq);
  ivec2 per = ivec2(freq);
  vec2 p = uv * freq;
  vec2 ip = floor(p), fp = p - ip;
  ivec2 ic = ivec2(ip);
  float m = 0.0;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    ivec2 o = ivec2(i, j);
    vec4 h = hash4(wrapCell(ic + o, per), seed);
    if (h.z > density) continue;
    float r = radius * (0.35 + 0.65 * h.w);
    vec2 c = vec2(o) + 0.5 + (0.5 - r) * (h.xy * 2.0 - 1.0);
    float d = length(fp - c);
    m = max(m, 1.0 - smoothstep(r * (1.0 - softness), r, d));
  }
  return m;
}

// ---------------------------------------------------------------------
//  Non-periodic noise (meters or any unit you like)
// ---------------------------------------------------------------------
vec3 grad3(ivec3 c, uint s) {
  uvec4 h = pcg4d(uvec4(uvec3(c), s));
  return normalize(vec3(h.xyz) * U2F * 2.0 - 1.0 + 1e-5);
}

/** 3D gradient noise, range ~[-1, 1]. */
float noise3(vec3 p, float seed) {
  uint s = seedBits(seed);
  vec3 i = floor(p), f = p - i;
  ivec3 c = ivec3(i);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n000 = dot(grad3(c, s), f);
  float n100 = dot(grad3(c + ivec3(1, 0, 0), s), f - vec3(1, 0, 0));
  float n010 = dot(grad3(c + ivec3(0, 1, 0), s), f - vec3(0, 1, 0));
  float n110 = dot(grad3(c + ivec3(1, 1, 0), s), f - vec3(1, 1, 0));
  float n001 = dot(grad3(c + ivec3(0, 0, 1), s), f - vec3(0, 0, 1));
  float n101 = dot(grad3(c + ivec3(1, 0, 1), s), f - vec3(1, 0, 1));
  float n011 = dot(grad3(c + ivec3(0, 1, 1), s), f - vec3(0, 1, 1));
  float n111 = dot(grad3(c + ivec3(1, 1, 1), s), f - vec3(1, 1, 1));
  return 1.3 * mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
                   mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}

float fbm3(vec3 p, int octaves, float gain, float seed) {
  float sum = 0.0, amp = 1.0, norm = 0.0;
  for (int i = 0; i < 10; i++) {
    if (i >= octaves) break;
    sum += amp * noise3(p, seed + float(i) * 13.7);
    norm += amp;
    amp *= gain;
    p = p * 2.03 + vec3(0.37, 0.71, 0.13);
  }
  return sum / norm;
}

/** 2D gradient noise (non-periodic), range ~[-1,1]. */
float noise2(vec2 p, float seed) {
  return noise3(vec3(p, 0.5), seed);
}

float fbm2(vec2 p, int octaves, float gain, float seed) {
  return fbm3(vec3(p, 0.5), octaves, gain, seed);
}

/** 1D gradient noise, range ~[-1, 1]. */
float noise1(float x, float seed) {
  float i = floor(x), f = x - i;
  float g0 = hash1(int(i), seed) * 2.0 - 1.0;
  float g1 = hash1(int(i) + 1, seed) * 2.0 - 1.0;
  float u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return 2.0 * mix(g0 * f, g1 * (f - 1.0), u);
}

float fbm1(float x, int octaves, float gain, float seed) {
  float sum = 0.0, amp = 1.0, norm = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    sum += amp * noise1(x, seed + float(i) * 7.3);
    norm += amp;
    amp *= gain;
    x = x * 2.1 + 0.37;
  }
  return sum / norm;
}
