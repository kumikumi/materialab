/** Parameter definitions drive both the GLSL uniforms and the UI. */
interface ParamBase {
  label?: string;
  group?: string;
  /** Short help text shown as a tooltip. */
  help?: string;
}
export interface FloatParam extends ParamBase {
  type: 'float';
  default: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  /** Logarithmic slider (min must be > 0). */
  log?: boolean;
}
export interface IntParam extends ParamBase { type: 'int'; default: number; min: number; max: number; unit?: string }
export interface BoolParam extends ParamBase { type: 'bool'; default: boolean }
/** sRGB color, '#rrggbb'. Arrives in GLSL as vec3 in sRGB (0..1). */
export interface ColorParam extends ParamBase { type: 'color'; default: string }
/** Arrives in GLSL as int (index into options). */
export interface EnumParam extends ParamBase { type: 'enum'; default: number; options: string[] }

export type ParamDef = FloatParam | IntParam | BoolParam | ColorParam | EnumParam;
export type ParamValue = number | boolean | string;
export type ParamValues = Record<string, ParamValue>;

/** Material-level settings that are not texture data (they end up in .tres / glTF). */
export interface SurfaceExtras {
  /**
   * Anisotropic specular for surfaces brushed along the texture's u axis, 0..1.
   * The grooves run along u, so highlights stretch across them (along v):
   * exported as glTF anisotropyRotation = 90° and a negative Godot anisotropy.
   */
  anisotropy?: number;
  /** Clear coat layer strength 0..1 and its roughness. */
  clearcoat?: number;
  clearcoatRoughness?: number;
  /** Enable parallax (Godot heightmap) in the exported material by default. */
  parallax?: boolean;
}

export interface Generator {
  id: string;
  /**
   * GLSL that defines `void surface(vec2 uv, inout Surface s)`.
   * uv is tile space [0,1); params are available as uniforms with the same names.
   */
  glsl: string;
  params: Record<string, ParamDef>;
  /** Physical size of one texture tile in meters (may depend on params). */
  tileSize: (p: ParamValues) => [number, number];
  extras?: (p: ParamValues) => SurfaceExtras;
}

export type Category = 'Wood' | 'Masonry' | 'Concrete' | 'Stone' | 'Metal';

export interface MaterialDef {
  id: string;
  name: string;
  category: Category;
  description?: string;
  generator: Generator;
  /** Preset values overriding the generator defaults. */
  params?: ParamValues;
  seed?: number;
  /** Size multiplier for the preview objects (small for fine metals). */
  previewScale?: number;
}

/** Parameters every material gets, appended to the generator's own. */
export const COMMON_PARAMS: Record<string, ParamDef> = {
  normalStrength: { type: 'float', group: 'Output', label: 'Normal strength', default: 1, min: 0, max: 4, step: 0.01, help: 'Multiplier on the height-derived normal map' },
  aoStrength: { type: 'float', group: 'Output', label: 'AO strength', default: 1, min: 0, max: 3, step: 0.01 },
  aoRadius: { type: 'float', group: 'Output', label: 'AO radius', default: 20, min: 1, max: 120, step: 1, unit: 'mm', help: 'Search radius of the height-based ambient occlusion' },
};

export function allParams(def: MaterialDef): Record<string, ParamDef> {
  return { ...def.generator.params, ...COMMON_PARAMS };
}

export function defaultValues(def: MaterialDef): ParamValues {
  const out: ParamValues = {};
  for (const [k, p] of Object.entries(allParams(def))) out[k] = p.default;
  return { ...out, ...(def.params ?? {}) };
}

export function defineGenerator(g: Generator): Generator {
  return g;
}

export function defineMaterial(m: MaterialDef): MaterialDef {
  return m;
}
