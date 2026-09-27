import noise from '../glsl/noise.glsl?raw';
import util from '../glsl/util.glsl?raw';
import layout from '../glsl/layout.glsl?raw';
import wood from '../glsl/wood.glsl?raw';
import surface from '../glsl/surface.glsl?raw';
import concrete from '../glsl/concrete.glsl?raw';
import type { MaterialDef, ParamDef, ParamValue } from './types';
import { allParams } from './types';

const LIBS: [string, string][] = [
  ['util.glsl', util],
  ['noise.glsl', noise],
  ['layout.glsl', layout],
  ['surface.glsl', surface],
  ['wood.glsl', wood],
  ['concrete.glsl', concrete],
];

// Hot reload: editing a .glsl library re-executes this module; publish the new
// sources globally so already-imported code picks them up, then notify the app.
const g = globalThis as unknown as { __materialabLibs?: [string, string][] };
g.__materialabLibs = LIBS;
if (import.meta.hot) {
  import.meta.hot.accept();
  window.dispatchEvent(new CustomEvent('materialab:glsl-updated'));
}
export function libs(): [string, string][] {
  return g.__materialabLibs ?? LIBS;
}

const HEADER = /* glsl */ `
precision highp float;
precision highp int;

uniform vec2 u_res;       // bake resolution in texels
uniform vec2 u_tileSize;  // meters covered by the tile
uniform vec2 u_texel;     // meters per texel
uniform uint u_seed;
uniform int u_ss;         // supersampling grid (n x n samples per texel)

struct Surface {
  vec3 albedo;     // sRGB 0..1
  float height;    // millimeters, any offset (range is normalized on export)
  float roughness; // perceptual roughness 0..1
  float metallic;  // 0..1
  float ao;        // material-level cavity/occlusion, multiplied with height-based AO
};
`;

const MAIN = /* glsl */ `
layout(location = 0) out vec4 o_albedoHeight;
layout(location = 1) out vec4 o_rma;

void main() {
  vec2 px = floor(gl_FragCoord.xy);
  vec3 albedo = vec3(0.0);
  vec4 rest = vec4(0.0);
  int n = max(u_ss, 1);
  for (int j = 0; j < 4; j++) {
    if (j >= n) break;
    for (int i = 0; i < 4; i++) {
      if (i >= n) break;
      vec2 o = (vec2(float(i), float(j)) + 0.5) / float(n);
      vec2 uv = (px + o) / u_res;
      Surface s = Surface(vec3(0.5), 0.0, 0.5, 0.0, 1.0);
      surface(uv, s);
      albedo += s.albedo;
      rest += vec4(s.height, s.roughness, s.metallic, s.ao);
    }
  }
  float inv = 1.0 / float(n * n);
  albedo *= inv;
  rest *= inv;
  o_albedoHeight = vec4(clamp(albedo, 0.0, 1.0), rest.x);
  o_rma = vec4(clamp(rest.yzw, 0.0, 1.0), 1.0);
}
`;

export const MATERIAL_BEGIN = '// @material-begin';

function uniformDecl(name: string, p: ParamDef): string {
  switch (p.type) {
    case 'float': return `uniform float ${name};`;
    case 'int': return `uniform int ${name};`;
    case 'enum': return `uniform int ${name};`;
    case 'bool': return `uniform bool ${name};`;
    case 'color': return `uniform vec3 ${name};`;
  }
}

export interface AssembledShader {
  source: string;
  /** 1-based line where the generator's GLSL begins. */
  materialLine: number;
  /** [name, firstLine, lastLine] of each section, for error mapping. */
  sections: [string, number, number][];
  lines: string[];
}

const RESERVED = new Set(
  ('attribute const uniform varying layout centroid flat smooth break continue do for while switch case default if else in out inout ' +
    'float int void bool true false invariant discard return mat2 mat3 mat4 vec2 vec3 vec4 ivec2 ivec3 ivec4 bvec2 bvec3 bvec4 uint uvec2 uvec3 uvec4 ' +
    'lowp mediump highp precision sampler2D sampler3D samplerCube struct coherent volatile restrict readonly writeonly resource atomic_uint ' +
    'noperspective patch sample subroutine common partition active asm class union enum typedef template this goto inline noinline public ' +
    'static extern external interface long short double half fixed unsigned superp input output filter sizeof cast namespace using'
  ).split(' '),
);

/** Names that would collide with GLSL keywords or library functions. */
export function checkParamNames(names: string[]): string | null {
  const fns = new Set<string>();
  for (const [, src] of libs()) for (const m of src.matchAll(/^\s*[\w]+\s+(\w+)\s*\(/gm)) fns.add(m[1]);
  const bad = names.filter((n) => RESERVED.has(n) || fns.has(n) || n.startsWith('u_') || n.includes('__'));
  return bad.length ? `Parameter names clash with GLSL keywords or library functions: ${bad.join(', ')}` : null;
}

export function assembleGenerator(def: MaterialDef): AssembledShader {
  const params = allParams(def);
  const uniforms = Object.entries(params).map(([k, p]) => uniformDecl(k, p)).join('\n');
  const parts: [string, string][] = [
    ['header', HEADER + '\n// params\n' + uniforms + '\n'],
    ...libs(),
    [`generator '${def.generator.id}'`, MATERIAL_BEGIN + '\n' + def.generator.glsl + '\n'],
    ['main', MAIN],
  ];
  let line = 2; // "#version 300 es" occupies line 1
  const sections: [string, number, number][] = [];
  let materialLine = 0;
  const chunks: string[] = [];
  for (const [name, src] of parts) {
    const text = src.endsWith('\n') ? src : src + '\n';
    const count = text.split('\n').length - 1;
    sections.push([name, line, line + count - 1]);
    if (text.startsWith(MATERIAL_BEGIN)) materialLine = line + 1;
    chunks.push(text);
    line += count;
  }
  const source = chunks.join('');
  return { source, materialLine, sections, lines: ['#version 300 es', ...source.split('\n')] };
}

/** Convert a UI value to what the uniform expects. */
export function uniformValue(p: ParamDef, v: ParamValue): unknown {
  switch (p.type) {
    case 'color': {
      const hex = String(v).replace('#', '');
      const n = parseInt(hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex, 16);
      return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    }
    case 'bool': return !!v;
    case 'int':
    case 'enum': return Math.round(Number(v));
    default: return Number(v);
  }
}

/** Map "ERROR: 0:123: ..." lines back to the section they came from. */
export function describeErrors(log: string, sh: AssembledShader): string {
  return log
    .replace(/\0/g, '')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => {
      const m = /(?:ERROR|WARNING): \d+:(\d+):(.*)/.exec(l);
      if (!m) return l;
      const ln = Number(m[1]);
      const sec = sh.sections.find(([, a, b]) => ln >= a && ln <= b);
      if (!sec) return l;
      // the generator section starts with the marker comment, which is not part of its source
      const local = sec[1] === sh.materialLine - 1 ? ln - sec[1] : ln - sec[1] + 1;
      const code = (sh.lines[ln - 1] ?? '').trim();
      return `${sec[0]}, line ${local}: ${m[2].trim()}\n    ${code}`;
    })
    .join('\n');
}
