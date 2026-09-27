import type { Baker } from '../engine/baker';
import type { MaterialDef, ParamValues } from '../engine/types';
import { makeZip } from './png';
import { encodePNGAsync } from './pngPool';
import { godotHeightScale, godotOrmMaterial, godotStandardMaterial, gltfMaterial, type ExportInfo } from './formats';

export interface ExportOptions {
  resolution: number;
  supersample: number;
  /** Also write a DirectX (-Y) normal map for Unreal & co. */
  normalDX?: boolean;
  /** 16-bit normal map (smoother gradients on glossy surfaces). */
  normal16?: boolean;
  /** Unity mask map: R = metallic, G = AO, B = 0, A = smoothness (HDRP mask / URP metallic map). */
  unity?: boolean;
}

export interface ExportFile {
  name: string;
  data: Uint8Array;
}

/**
 * Bake a material at export quality and produce all files:
 * PNG maps, Godot .tres (standard + ORM), glTF and a JSON manifest.
 * The material must be compiled in `baker` already.
 */
export async function buildExport(
  baker: Baker,
  def: MaterialDef,
  values: ParamValues,
  seed: number,
  opts: ExportOptions,
  onStatus: (s: string) => void = () => {},
): Promise<ExportFile[]> {
  const t0 = performance.now();
  const timings: Record<string, number> = {};
  const mark = (k: string) => (timings[k] = Math.round(performance.now() - t0));
  onStatus(`baking ${def.name} at ${opts.resolution}px…`);
  const res = await baker.bake(values, seed, { resolution: opts.resolution, supersample: opts.supersample }, null, false);
  if (!res) throw new Error('bake cancelled');
  const maps = res.maps;
  try {
    mark('bake');
    onStatus(`reading back ${def.name}…`);
    const w = maps.width, h = maps.height;
    const gen0 = baker.read(maps.gen, 0, 'f32') as Float32Array;
    const orm = baker.read(maps.orm) as Uint8Array;
    const nrm = baker.read(maps.normal, 0, 'f16') as Float32Array;
    const nbits = opts.normal16 ? 16 : 8;
    const nmax = nbits === 16 ? 65535 : 255;

    const n = w * h;
    const albedo = new Uint8Array(n * 3);
    const normal = nbits === 16 ? new Uint16Array(n * 3) : new Uint8Array(n * 3);
    const normalDX = opts.normalDX ? (nbits === 16 ? new Uint16Array(n * 3) : new Uint8Array(n * 3)) : null;
    const rough = new Uint8Array(n);
    const metal = new Uint8Array(n);
    const ao = new Uint8Array(n);
    const ormOut = new Uint8Array(n * 3);
    const height = new Uint16Array(n);
    const unityMask = opts.unity ? new Uint8Array(n * 4) : null;
    let hmin = Infinity, hmax = -Infinity;
    for (let i = 0; i < n; i++) {
      const v = gen0[i * 4 + 3];
      if (v < hmin) hmin = v;
      if (v > hmax) hmax = v;
    }
    const hspan = hmax - hmin > 1e-6 ? hmax - hmin : 0;
    const q = (x: number) => Math.max(0, Math.min(255, Math.round(x * 255)));
    // GL rows are bottom-up; images are top-down (v = 1 at the top)
    for (let y = 0; y < h; y++) {
      const src = (h - 1 - y) * w;
      const dst = y * w;
      for (let x = 0; x < w; x++) {
        const s = src + x, d = dst + x;
        albedo[d * 3] = q(gen0[s * 4]);
        albedo[d * 3 + 1] = q(gen0[s * 4 + 1]);
        albedo[d * 3 + 2] = q(gen0[s * 4 + 2]);
        height[d] = hspan ? Math.round(((gen0[s * 4 + 3] - hmin) / hspan) * 65535) : 0;
        const nx = Math.round(Math.min(1, Math.max(0, nrm[s * 4])) * nmax);
        const ny = Math.round(Math.min(1, Math.max(0, nrm[s * 4 + 1])) * nmax);
        const nz = Math.round(Math.min(1, Math.max(0, nrm[s * 4 + 2])) * nmax);
        normal[d * 3] = nx;
        normal[d * 3 + 1] = ny;
        normal[d * 3 + 2] = nz;
        if (normalDX) {
          normalDX[d * 3] = nx;
          normalDX[d * 3 + 1] = nmax - ny;
          normalDX[d * 3 + 2] = nz;
        }
        ao[d] = orm[s * 4];
        rough[d] = orm[s * 4 + 1];
        metal[d] = orm[s * 4 + 2];
        ormOut[d * 3] = orm[s * 4];
        ormOut[d * 3 + 1] = orm[s * 4 + 1];
        ormOut[d * 3 + 2] = orm[s * 4 + 2];
        if (unityMask) {
          unityMask[d * 4] = orm[s * 4 + 2];
          unityMask[d * 4 + 1] = orm[s * 4];
          unityMask[d * 4 + 2] = 0;
          unityMask[d * 4 + 3] = 255 - orm[s * 4 + 1];
        }
      }
    }

    const id = def.id;
    const names = {
      albedo: `${id}_albedo.png`,
      normal: `${id}_normal.png`,
      roughness: `${id}_roughness.png`,
      metallic: `${id}_metallic.png`,
      ao: `${id}_ao.png`,
      height: `${id}_height.png`,
      orm: `${id}_orm.png`,
    };
    mark('readback');
    onStatus(`encoding ${def.name}…`);
    const files: ExportFile[] = [];
    const jobs: [string, 1 | 3 | 4, 8 | 16, Uint8Array | Uint16Array, boolean][] = [
      [names.albedo, 3, 8, albedo, true],
      [names.normal, 3, nbits, normal, false],
      [names.roughness, 1, 8, rough, false],
      [names.metallic, 1, 8, metal, false],
      [names.ao, 1, 8, ao, false],
      [names.height, 1, 16, height, false],
      [names.orm, 3, 8, ormOut, false],
    ];
    if (normalDX) jobs.splice(2, 0, [`${id}_normal_dx.png`, 3, nbits, normalDX, false]);
    if (unityMask) jobs.push([`${id}_unity_mask.png`, 4, 8, unityMask, false]);
    const encoded = await Promise.all(
      jobs.map(([, channels, bitDepth, data, srgb]) => encodePNGAsync({ width: w, height: h, channels, bitDepth, data, srgb })),
    );
    jobs.forEach(([name], i) => files.push({ name, data: encoded[i] }));
    mark('encode');
    console.info(`[export] ${def.id}`, timings);
    const extras = def.generator.extras?.(values) ?? {};
    const info: ExportInfo = { id, name: def.name, tileSize: maps.tileSize, heightRange: hspan * 0.001, extras, files: names };
    const text = (name: string, s: string) => files.push({ name, data: new TextEncoder().encode(s) });
    text(`${id}.tres`, godotStandardMaterial(info));
    text(`${id}_orm.tres`, godotOrmMaterial(info));
    text(`${id}.gltf`, gltfMaterial(info));
    text(
      `${id}.json`,
      JSON.stringify(
        {
          id,
          name: def.name,
          category: def.category,
          description: def.description,
          generator: def.generator.id,
          seed,
          resolution: [w, h],
          supersample: opts.supersample,
          tileSizeMeters: maps.tileSize.map((v) => +v.toFixed(6)),
          texelsPerMeter: +(w / maps.tileSize[0]).toFixed(1),
          height: {
            minMillimeters: +hmin.toFixed(4),
            maxMillimeters: +hmax.toFixed(4),
            rangeMeters: +(hspan * 0.001).toFixed(6),
            godotHeightmapScale: godotHeightScale(info),
            note: 'Height PNG is 16-bit, black = min, white = max.',
          },
          normalMap: 'OpenGL convention (+Y up), tangent space',
          orm: 'R = ambient occlusion, G = roughness, B = metallic (glTF / Godot ORMMaterial3D / Unreal)',
          albedo: 'sRGB',
          extras,
          maps: names,
          params: values,
        },
        null,
        2,
      ),
    );
    return files;
  } finally {
    maps.dispose();
  }
}

/** Write files through the dev server (falls back to a .zip download). */
export async function saveExport(id: string, files: ExportFile[]): Promise<string> {
  try {
    // the endpoints only exist on the dev server; a static build goes straight to the download
    if (!import.meta.env.DEV) throw new Error('static build');
    for (const f of files) {
      const r = await fetch(`/__export/${encodeURIComponent(id)}/${encodeURIComponent(f.name)}`, { method: 'POST', body: f.data as BodyInit });
      if (!r.ok) throw new Error(await r.text());
    }
    const info = await (await fetch('/__export')).json();
    return `${info.dir}/${id}`;
  } catch {
    const zip = makeZip(files.map((f) => ({ name: `${id}/${f.name}`, data: f.data })));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([zip as BlobPart], { type: 'application/zip' }));
    a.download = `${id}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    return `${id}.zip (download)`;
  }
}
