/** Post passes that turn the raw generator output into engine-ready maps. */

const COMMON = /* glsl */ `
precision highp float;
precision highp int;
uniform highp sampler2D u_gen0;   // rgb = albedo (sRGB), a = height (mm)
uniform highp sampler2D u_gen1;   // r = roughness, g = metallic, b = material AO
uniform vec2 u_res;
uniform vec2 u_tileSize;
out vec4 o;

ivec2 wrapPx(ivec2 p) {
  ivec2 r = ivec2(u_res);
  return p - r * ivec2(floor(vec2(p) / vec2(r)));
}
/** Height in meters, wrapping around the tile. */
float H(ivec2 p) { return texelFetch(u_gen0, wrapPx(p), 0).a * 0.001; }
`;

export const FULLSCREEN_VS = /* glsl */ `
in vec3 position;
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/** Tangent-space normal map (OpenGL / +Y convention) from the height field. */
export const NORMAL_FS = COMMON + /* glsl */ `
uniform float u_strength;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec2 texel = u_tileSize / u_res;
  float l = H(p + ivec2(-1, 0)), r = H(p + ivec2(1, 0));
  float b = H(p + ivec2(0, -1)), t = H(p + ivec2(0, 1));
  float tl = H(p + ivec2(-1, 1)), tr = H(p + ivec2(1, 1));
  float bl = H(p + ivec2(-1, -1)), br = H(p + ivec2(1, -1));
  float dx = ((tr + 4.0 * r + br) - (tl + 4.0 * l + bl)) / (12.0 * texel.x);
  float dy = ((tl + 4.0 * t + tr) - (bl + 4.0 * b + br)) / (12.0 * texel.y);
  vec3 n = normalize(vec3(-dx * u_strength, -dy * u_strength, 1.0));
  o = vec4(n * 0.5 + 0.5, 1.0);
}
`;

/**
 * ORM (R = ambient occlusion, G = roughness, B = metallic), the channel
 * layout shared by glTF, Godot's ORMMaterial3D and Unreal.
 * AO is a cosine-weighted horizon search over the height field.
 */
export const ORM_FS = COMMON + /* glsl */ `
uniform float u_aoStrength;
uniform float u_aoRadius;   // meters
float hashPx(ivec2 p) {
  uvec2 q = uvec2(p) * uvec2(1597334677u, 3812015801u);
  uint n = (q.x ^ q.y) * 1597334677u;
  return float(n) * (1.0 / 4294967296.0);
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec2 texel = u_tileSize / u_res;
  float h0 = H(p);
  const int DIRS = 12;
  const int STEPS = 12;
  float jitter = hashPx(p);
  float occ = 0.0;
  for (int d = 0; d < DIRS; d++) {
    float a = (float(d) + jitter) * 6.28318530718 / float(DIRS);
    vec2 dir = vec2(cos(a), sin(a));
    float maxSlope = 0.0;
    for (int s = 1; s <= STEPS; s++) {
      float f = float(s) / float(STEPS);
      vec2 off = dir * (u_aoRadius * f * f) / texel;
      ivec2 io = ivec2(round(off));
      if (io == ivec2(0)) continue;
      float dist = length(vec2(io) * texel);
      maxSlope = max(maxSlope, (H(p + io) - h0) / dist);
    }
    float sinH = maxSlope / sqrt(1.0 + maxSlope * maxSlope);
    occ += sinH * sinH;
  }
  float ao = pow(max(1.0 - occ / float(DIRS), 0.0), u_aoStrength);
  vec4 g1 = texelFetch(u_gen1, p, 0);
  o = vec4(ao * g1.b, g1.r, g1.g, 1.0);
}
`;

/** Albedo to an sRGB render target (hardware encodes, so we output linear). */
export const ALBEDO_FS = COMMON + /* glsl */ `
vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}
void main() {
  vec3 c = texelFetch(u_gen0, ivec2(gl_FragCoord.xy), 0).rgb;
  o = vec4(srgbToLinear(c), 1.0);
}
`;

/** Height in millimeters as a filterable half-float texture (for displacement). */
export const HEIGHT_FS = COMMON + /* glsl */ `
void main() {
  o = vec4(texelFetch(u_gen0, ivec2(gl_FragCoord.xy), 0).a, 0.0, 0.0, 1.0);
}
`;

/** Block min/max reduction of the height (into a small target). */
export const MINMAX_FS = COMMON + /* glsl */ `
uniform vec2 u_block;
void main() {
  ivec2 b = ivec2(gl_FragCoord.xy) * ivec2(u_block);
  float mn = 1e30, mx = -1e30;
  for (int y = 0; y < 256; y++) {
    if (y >= int(u_block.y)) break;
    for (int x = 0; x < 256; x++) {
      if (x >= int(u_block.x)) break;
      float h = texelFetch(u_gen0, b + ivec2(x, y), 0).a;
      mn = min(mn, h);
      mx = max(mx, h);
    }
  }
  o = vec4(mn, mx, 0.0, 1.0);
}
`;
