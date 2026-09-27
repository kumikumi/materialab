import type { SurfaceExtras } from '../engine/types';

export interface ExportInfo {
  id: string;
  name: string;
  tileSize: [number, number];
  /** Height range in meters covered by the 16-bit height map (black..white). */
  heightRange: number;
  extras: SurfaceExtras;
  files: {
    albedo: string;
    normal: string;
    roughness: string;
    metallic: string;
    ao: string;
    height: string;
    orm: string;
  };
}

/** Godot's parallax: UV offset = view.xy * heightmap_scale * 0.01 at full depth. */
export function godotHeightScale(info: ExportInfo): number {
  const tile = Math.min(info.tileSize[0], info.tileSize[1]);
  return +((100 * info.heightRange) / tile).toFixed(4);
}

const f = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(+n.toFixed(6)));

/**
 * Godot 4 StandardMaterial3D with separate maps. Paths are relative to the
 * .tres, which Godot resolves against the file's own folder.
 */
export function godotStandardMaterial(info: ExportInfo): string {
  const ids = ['albedo', 'metallic', 'roughness', 'normal', 'ao', 'height'] as const;
  const ext = ids.map((k, i) => `[ext_resource type="Texture2D" path="${info.files[k]}" id="${i + 1}_${k}"]`).join('\n');
  const x = info.extras;
  const lines = [
    `resource_name = "${info.name}"`,
    `texture_filter = 5`,
    `albedo_texture = ExtResource("1_albedo")`,
    `metallic = 1.0`,
    `metallic_texture = ExtResource("2_metallic")`,
    `metallic_texture_channel = 0`,
    `roughness = 1.0`,
    `roughness_texture = ExtResource("3_roughness")`,
    `roughness_texture_channel = 0`,
    `normal_enabled = true`,
    `normal_scale = 1.0`,
    `normal_texture = ExtResource("4_normal")`,
    `ao_enabled = true`,
    `ao_texture = ExtResource("5_ao")`,
    `ao_texture_channel = 0`,
    `heightmap_enabled = ${x.parallax ? 'true' : 'false'}`,
    `heightmap_scale = ${f(godotHeightScale(info))}`,
    `heightmap_deep_parallax = true`,
    `heightmap_min_layers = 8`,
    `heightmap_max_layers = 32`,
    `heightmap_texture = ExtResource("6_height")`,
  ];
  // Godot stretches highlights along the tangent (u) for positive values; grooves along u need the binormal
  if (x.anisotropy) lines.push(`anisotropy_enabled = true`, `anisotropy = ${f(-x.anisotropy)}`);
  if (x.clearcoat) lines.push(`clearcoat_enabled = true`, `clearcoat = ${f(x.clearcoat)}`, `clearcoat_roughness = ${f(x.clearcoatRoughness ?? 0.1)}`);
  return `[gd_resource type="StandardMaterial3D" load_steps=${ids.length + 1} format=3]\n\n${ext}\n\n[resource]\n${lines.join('\n')}\n`;
}

/** Godot 4 ORMMaterial3D (AO / roughness / metallic packed in one texture). */
export function godotOrmMaterial(info: ExportInfo): string {
  const ids = ['albedo', 'orm', 'normal', 'height'] as const;
  const ext = ids.map((k, i) => `[ext_resource type="Texture2D" path="${info.files[k]}" id="${i + 1}_${k}"]`).join('\n');
  const x = info.extras;
  const lines = [
    `resource_name = "${info.name}"`,
    `texture_filter = 5`,
    `albedo_texture = ExtResource("1_albedo")`,
    `orm_texture = ExtResource("2_orm")`,
    `metallic = 1.0`,
    `roughness = 1.0`,
    `normal_enabled = true`,
    `normal_scale = 1.0`,
    `normal_texture = ExtResource("3_normal")`,
    `ao_enabled = true`,
    `heightmap_enabled = ${x.parallax ? 'true' : 'false'}`,
    `heightmap_scale = ${f(godotHeightScale(info))}`,
    `heightmap_deep_parallax = true`,
    `heightmap_min_layers = 8`,
    `heightmap_max_layers = 32`,
    `heightmap_texture = ExtResource("4_height")`,
  ];
  if (x.anisotropy) lines.push(`anisotropy_enabled = true`, `anisotropy = ${f(-x.anisotropy)}`);
  if (x.clearcoat) lines.push(`clearcoat_enabled = true`, `clearcoat = ${f(x.clearcoat)}`, `clearcoat_roughness = ${f(x.clearcoatRoughness ?? 0.1)}`);
  return `[gd_resource type="ORMMaterial3D" load_steps=${ids.length + 1} format=3]\n\n${ext}\n\n[resource]\n${lines.join('\n')}\n`;
}

function b64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * glTF 2.0 with the material applied to one tile-sized quad (Y up).
 * Loads in Blender, Godot, Unity (glTFast), Unreal, three.js, etc.
 */
export function gltfMaterial(info: ExportInfo): string {
  const [w, h] = info.tileSize;
  // glTF UV origin is the image's top-left
  const pos = new Float32Array([-w / 2, 0, h / 2, w / 2, 0, h / 2, w / 2, 0, -h / 2, -w / 2, 0, -h / 2]);
  const nrm = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);
  const tan = new Float32Array([1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1]);
  const uv = new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]);
  const idx = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const chunks = [pos, nrm, tan, uv, idx];
  const views: object[] = [];
  let off = 0;
  const parts: Uint8Array[] = [];
  for (const c of chunks) {
    const bytes = new Uint8Array(c.buffer.slice(0));
    views.push({ buffer: 0, byteOffset: off, byteLength: bytes.length, target: c === idx ? 34963 : 34962 });
    parts.push(bytes);
    off += bytes.length;
    while (off % 4) {
      parts.push(new Uint8Array(1));
      off++;
    }
  }
  const buf = new Uint8Array(off);
  let o = 0;
  for (const p of parts) {
    buf.set(p, o);
    o += p.length;
  }
  const extensions: Record<string, object> = {};
  if (info.extras.anisotropy) extensions.KHR_materials_anisotropy = { anisotropyStrength: info.extras.anisotropy, anisotropyRotation: Math.PI / 2 };
  if (info.extras.clearcoat)
    extensions.KHR_materials_clearcoat = { clearcoatFactor: info.extras.clearcoat, clearcoatRoughnessFactor: info.extras.clearcoatRoughness ?? 0.1 };
  const gltf = {
    asset: { version: '2.0', generator: 'materialab' },
    extensionsUsed: Object.keys(extensions).length ? Object.keys(extensions) : undefined,
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: `${info.id}_tile` }],
    meshes: [{ name: `${info.id}_tile`, primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TANGENT: 2, TEXCOORD_0: 3 }, indices: 4, material: 0 }] }],
    materials: [
      {
        name: info.name,
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0 },
          metallicRoughnessTexture: { index: 1 },
          metallicFactor: 1,
          roughnessFactor: 1,
        },
        normalTexture: { index: 2, scale: 1 },
        occlusionTexture: { index: 1, strength: 1 },
        extensions: Object.keys(extensions).length ? extensions : undefined,
      },
    ],
    textures: [{ source: 0, sampler: 0 }, { source: 1, sampler: 0 }, { source: 2, sampler: 0 }],
    images: [{ uri: info.files.albedo }, { uri: info.files.orm }, { uri: info.files.normal }],
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
    buffers: [{ byteLength: buf.length, uri: `data:application/octet-stream;base64,${b64(buf)}` }],
    bufferViews: views,
    accessors: [
      { bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', min: [-w / 2, 0, -h / 2], max: [w / 2, 0, h / 2] },
      { bufferView: 1, componentType: 5126, count: 4, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: 4, type: 'VEC4' },
      { bufferView: 3, componentType: 5126, count: 4, type: 'VEC2' },
      { bufferView: 4, componentType: 5123, count: 6, type: 'SCALAR' },
    ],
  };
  return JSON.stringify(gltf, null, 1);
}
