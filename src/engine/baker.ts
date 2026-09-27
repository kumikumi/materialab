import * as THREE from 'three';
import type { MaterialDef, ParamValues } from './types';
import { allParams } from './types';
import { assembleGenerator, checkParamNames, describeErrors, uniformValue, type AssembledShader } from './shader';
import { ALBEDO_FS, FULLSCREEN_VS, HEIGHT_FS, MINMAX_FS, NORMAL_FS, ORM_FS } from './passes';

export interface BakeSettings {
  /** Texels along the longer side of the tile. */
  resolution: number;
  /** n x n samples per texel. */
  supersample: number;
}

/** GPU textures of a baked material. */
export class MaterialMaps {
  width: number;
  height: number;
  gen: THREE.WebGLRenderTarget;     // [0] albedo+height (float), [1] rough/metal/ao (float)
  albedo: THREE.WebGLRenderTarget;  // sRGB8, mipmapped
  orm: THREE.WebGLRenderTarget;     // AO/rough/metal, mipmapped
  normal: THREE.WebGLRenderTarget;  // tangent space, OpenGL convention, mipmapped
  heightTex: THREE.WebGLRenderTarget; // half float, mm
  minmax: THREE.WebGLRenderTarget;
  heightRange: [number, number] = [0, 0];
  tileSize: [number, number] = [1, 1];

  constructor(w: number, h: number, anisotropy: number) {
    this.width = w;
    this.height = h;
    const data = {
      type: THREE.FloatType,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
    };
    const map = {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: true,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
      anisotropy,
    };
    this.gen = new THREE.WebGLRenderTarget(w, h, { ...data, count: 2 });
    this.albedo = new THREE.WebGLRenderTarget(w, h, { ...map, colorSpace: THREE.SRGBColorSpace });
    this.orm = new THREE.WebGLRenderTarget(w, h, map);
    // half float: glossy surfaces need finer slopes than 8 bits give
    this.normal = new THREE.WebGLRenderTarget(w, h, { ...map, type: THREE.HalfFloatType });
    this.heightTex = new THREE.WebGLRenderTarget(w, h, {
      ...map,
      type: THREE.HalfFloatType,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
    });
    this.minmax = new THREE.WebGLRenderTarget(64, 64, { ...data });
  }

  dispose() {
    for (const rt of [this.gen, this.albedo, this.orm, this.normal, this.heightTex, this.minmax]) rt.dispose();
  }
}

export function textureDims(tile: [number, number], res: number): [number, number] {
  const [w, h] = tile;
  const k = Math.round(Math.log2(w / h));
  if (k === 0) return [res, res];
  return k > 0 ? [res, Math.max(64, res >> k)] : [Math.max(64, res >> -k), res];
}

let _halfLut: Float32Array | null = null;
/** Half-float bit pattern -> float lookup table (much faster than decoding per value). */
function halfLut(): Float32Array {
  if (!_halfLut) {
    _halfLut = new Float32Array(65536);
    for (let i = 0; i < 65536; i++) _halfLut[i] = THREE.DataUtils.fromHalfFloat(i);
  }
  return _halfLut;
}

export interface CompileResult {
  ok: boolean;
  error?: string;
}

/** Yield to the browser for a frame; resolves immediately in hidden tabs (no rAF there). */
export const nextFrame = () =>
  document.hidden ? Promise.resolve(0) : new Promise<number>((r) => requestAnimationFrame(r));

export class Baker {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private quad: THREE.Mesh;
  private genMat: THREE.RawShaderMaterial | null = null;
  private genDef: MaterialDef | null = null;
  private genShader: AssembledShader | null = null;
  private passes: Record<'normal' | 'orm' | 'albedo' | 'height' | 'minmax', THREE.RawShaderMaterial>;
  private bakeToken = 0;
  /** Sample-texels rendered per frame when baking progressively (adapts to frame time). */
  private budget = 1 << 20;
  readonly maxAnisotropy: number;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.quad = new THREE.Mesh(geo);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    const pass = (fs: string, extra: Record<string, THREE.IUniform> = {}) =>
      new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: FULLSCREEN_VS,
        fragmentShader: fs,
        uniforms: {
          u_gen0: { value: null },
          u_gen1: { value: null },
          u_res: { value: new THREE.Vector2() },
          u_tileSize: { value: new THREE.Vector2() },
          ...extra,
        },
        depthTest: false,
        depthWrite: false,
      });
    this.passes = {
      normal: pass(NORMAL_FS, { u_strength: { value: 1 } }),
      orm: pass(ORM_FS, { u_aoStrength: { value: 1 }, u_aoRadius: { value: 0.02 } }),
      albedo: pass(ALBEDO_FS),
      height: pass(HEIGHT_FS),
      minmax: pass(MINMAX_FS, { u_block: { value: new THREE.Vector2() } }),
    };
  }

  /** Compile the generator of a material. Errors are mapped back to the GLSL files. */
  compile(def: MaterialDef): CompileResult {
    const clash = checkParamNames(Object.keys(allParams(def)));
    if (clash) return { ok: false, error: clash };
    const sh = assembleGenerator(def);
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const s = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(s, '#version 300 es\n' + sh.source);
    gl.compileShader(s);
    const ok = gl.getShaderParameter(s, gl.COMPILE_STATUS);
    const log = gl.getShaderInfoLog(s) ?? '';
    gl.deleteShader(s);
    if (!ok) return { ok: false, error: describeErrors(log, sh) };

    const uniforms: Record<string, THREE.IUniform> = {
      u_res: { value: new THREE.Vector2() },
      u_tileSize: { value: new THREE.Vector2() },
      u_texel: { value: new THREE.Vector2() },
      u_seed: { value: 0 },
      u_ss: { value: 1 },
    };
    for (const [k, p] of Object.entries(allParams(def))) uniforms[k] = { value: uniformValue(p, p.default) };
    this.genMat?.dispose();
    this.genMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: FULLSCREEN_VS,
      fragmentShader: sh.source,
      uniforms,
      depthTest: false,
      depthWrite: false,
    });
    this.genDef = def;
    this.genShader = sh;
    return { ok: true };
  }

  get compiledDef() {
    return this.genDef;
  }

  get shaderSource() {
    return this.genShader?.source ?? '';
  }

  cancel() {
    this.bakeToken++;
  }

  /**
   * Bake `values` into `maps` (allocating if the size changed). With
   * `progressive`, the generator pass is spread over several frames and the
   * previous contents of the final maps stay visible until the end.
   */
  async bake(
    values: ParamValues,
    seed: number,
    settings: BakeSettings,
    maps: MaterialMaps | null,
    progressive: boolean,
  ): Promise<{ maps: MaterialMaps; ms: number } | null> {
    const def = this.genDef;
    const mat = this.genMat;
    if (!def || !mat) throw new Error('bake() before compile()');
    const token = ++this.bakeToken;
    const t0 = performance.now();
    const tile = def.generator.tileSize(values);
    const [w, h] = textureDims(tile, settings.resolution);
    if (!maps || maps.width !== w || maps.height !== h) {
      maps = new MaterialMaps(w, h, this.maxAnisotropy);
    }
    maps.tileSize = tile;

    const params = allParams(def);
    const u = mat.uniforms;
    for (const [k, p] of Object.entries(params)) {
      if (u[k]) u[k].value = uniformValue(p, values[k] ?? p.default);
    }
    u.u_res.value.set(w, h);
    u.u_tileSize.value.set(tile[0], tile[1]);
    u.u_texel.value.set(tile[0] / w, tile[1] / h);
    u.u_seed.value = seed >>> 0;
    u.u_ss.value = Math.max(1, Math.min(4, settings.supersample | 0));

    const r = this.renderer;
    const prevAutoClear = r.autoClear;
    const prevTarget = r.getRenderTarget();
    r.autoClear = false;

    // ---- generator, in tiles so no single draw call runs for too long ----
    const chunk = 256;
    const ss2 = u.u_ss.value * u.u_ss.value;
    let frameStart = performance.now();
    let doneThisFrame = 0;
    this.quad.material = mat;
    try {
      for (let y = 0; y < h; y += chunk) {
        for (let x = 0; x < w; x += chunk) {
          const cw = Math.min(chunk, w - x), ch = Math.min(chunk, h - y);
          maps.gen.scissor.set(x, y, cw, ch);
          maps.gen.scissorTest = true;
          r.setRenderTarget(maps.gen);
          r.render(this.scene, this.camera);
          doneThisFrame += cw * ch * ss2;
          if (progressive && doneThisFrame >= this.budget) {
            r.getContext().flush();
            r.autoClear = prevAutoClear;
            r.setRenderTarget(prevTarget);
            await nextFrame();
            const dt = performance.now() - frameStart;
            this.budget = dt > 40 ? Math.max(1 << 16, this.budget >> 1) : dt < 20 ? Math.min(1 << 24, this.budget * 2) : this.budget;
            frameStart = performance.now();
            doneThisFrame = 0;
            if (token !== this.bakeToken) return null;
            r.autoClear = false;
          }
        }
      }
      maps.gen.scissorTest = false;
      maps.gen.scissor.set(0, 0, w, h);

      // ---- post passes ----
      const run = (m: THREE.RawShaderMaterial, target: THREE.WebGLRenderTarget) => {
        m.uniforms.u_gen0.value = maps!.gen.textures[0];
        m.uniforms.u_gen1.value = maps!.gen.textures[1];
        m.uniforms.u_res.value.set(w, h);
        m.uniforms.u_tileSize.value.set(tile[0], tile[1]);
        this.quad.material = m;
        r.setRenderTarget(target);
        r.render(this.scene, this.camera);
      };
      this.passes.normal.uniforms.u_strength.value = Number(values.normalStrength ?? 1);
      this.passes.orm.uniforms.u_aoStrength.value = Number(values.aoStrength ?? 1);
      this.passes.orm.uniforms.u_aoRadius.value = Number(values.aoRadius ?? 20) * 0.001;
      run(this.passes.normal, maps.normal);
      run(this.passes.orm, maps.orm);
      run(this.passes.albedo, maps.albedo);
      run(this.passes.height, maps.heightTex);
      this.passes.minmax.uniforms.u_block.value.set(Math.ceil(w / 64), Math.ceil(h / 64));
      run(this.passes.minmax, maps.minmax);
    } finally {
      r.autoClear = prevAutoClear;
      r.setRenderTarget(prevTarget);
    }

    const mm = new Float32Array(64 * 64 * 4);
    await r.readRenderTargetPixelsAsync(maps.minmax, 0, 0, 64, 64, mm);
    if (token !== this.bakeToken) return null;
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < mm.length; i += 4) {
      mn = Math.min(mn, mm[i]);
      mx = Math.max(mx, mm[i + 1]);
    }
    maps.heightRange = [mn, mx];
    return { maps, ms: performance.now() - t0 };
  }

  /**
   * Synchronous full-resolution readback of a target, rows bottom-up as GL
   * returns them. 'f16' targets come back decoded to Float32.
   */
  read(rt: THREE.WebGLRenderTarget, index = 0, kind: 'u8' | 'f32' | 'f16' = 'u8'): Float32Array | Uint8Array {
    const w = rt.width, h = rt.height;
    const rows = 256;
    if (kind === 'u8') {
      const out = new Uint8Array(w * h * 4);
      for (let y = 0; y < h; y += rows) {
        const n = Math.min(rows, h - y);
        this.renderer.readRenderTargetPixels(rt, 0, y, w, n, new Uint8Array(out.buffer, y * w * 4, n * w * 4), undefined, index);
      }
      return out;
    }
    const out = new Float32Array(w * h * 4);
    if (kind === 'f32') {
      for (let y = 0; y < h; y += rows) {
        const n = Math.min(rows, h - y);
        this.renderer.readRenderTargetPixels(rt, 0, y, w, n, new Float32Array(out.buffer, y * w * 16, n * w * 4), undefined, index);
      }
      return out;
    }
    const lut = halfLut();
    const tmp = new Uint16Array(w * rows * 4);
    for (let y = 0; y < h; y += rows) {
      const n = Math.min(rows, h - y);
      const view = new Uint16Array(tmp.buffer, 0, n * w * 4);
      this.renderer.readRenderTargetPixels(rt, 0, y, w, n, view, undefined, index);
      const base = y * w * 4;
      for (let i = 0; i < view.length; i++) out[base + i] = lut[view[i]];
    }
    return out;
  }
}
