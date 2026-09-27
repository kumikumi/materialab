// =====================================================================
//  Small math / color helpers
// =====================================================================

#define PI  3.14159265359
#define TAU 6.28318530718

float sat(float x) { return clamp(x, 0.0, 1.0); }
vec3 sat(vec3 x) { return clamp(x, 0.0, 1.0); }
float linstep(float a, float b, float x) { return clamp((x - a) / (b - a), 0.0, 1.0); }
float remap(float x, float a, float b, float c, float d) { return c + (d - c) * clamp((x - a) / (b - a), 0.0, 1.0); }
float bias(float x, float b) { return x / ((1.0 / b - 2.0) * (1.0 - x) + 1.0); }
float gain(float x, float g) { return x < 0.5 ? bias(2.0 * x, g) * 0.5 : 1.0 - bias(2.0 - 2.0 * x, g) * 0.5; }

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
float smax(float a, float b, float k) { return -smin(-a, -b, k); }

mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}
float sdRoundBox(vec2 p, vec2 b, float r) { return sdBox(p, b - r) - r; }
float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

// ---- color (materials author albedo in sRGB, like a texture artist would) ----
vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}
vec3 linearToSrgb(vec3 c) {
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

/**
 * Random color variation in HSV. `amount` = (hue shift, saturation scale,
 * value scale) maximums; `r` = random numbers in [0,1).
 */
vec3 varyColor(vec3 srgb, vec3 amount, vec3 r) {
  vec3 hsv = rgb2hsv(srgb);
  hsv.x = fract(hsv.x + (r.x - 0.5) * 2.0 * amount.x);
  hsv.y = clamp(hsv.y * (1.0 + (r.y - 0.5) * 2.0 * amount.y), 0.0, 1.0);
  hsv.z = clamp(hsv.z * (1.0 + (r.z - 0.5) * 2.0 * amount.z), 0.0, 1.0);
  return hsv2rgb(hsv);
}

/** Multiply brightness while keeping hue; >1 brightens. */
vec3 shade(vec3 srgb, float k) { return clamp(srgb * k, 0.0, 1.0); }

/** Mix in linear light — use when blending physically distinct materials. */
vec3 mixLinear(vec3 a, vec3 b, float t) {
  return linearToSrgb(mix(srgbToLinear(a), srgbToLinear(b), t));
}

/** Three-stop gradient. */
vec3 ramp3(vec3 a, vec3 b, vec3 c, float t) {
  t = clamp(t, 0.0, 1.0);
  return t < 0.5 ? mix(a, b, t * 2.0) : mix(b, c, t * 2.0 - 1.0);
}
