import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildEnvironments } from './environments';
import { createViews, MapsView, TilingView, type View, type ViewContext } from './views';
import type { MaterialMaps } from '../engine/baker';
import type { SurfaceExtras } from '../engine/types';

export type ToneMap = 'neutral' | 'agx' | 'aces' | 'linear';

/**
 * Renders the same material into many views at once: one WebGL canvas behind
 * a CSS grid; each grid cell is a viewport.
 */
export class Viewer {
  readonly renderer: THREE.WebGLRenderer;
  readonly views: View[];
  readonly material: THREE.MeshPhysicalMaterial;
  private ctx: ViewContext;
  private grid: HTMLElement;
  private maps: MaterialMaps | null = null;
  private controls = new Map<View, OrbitControls>();
  private dirty = true;
  private timer = new THREE.Timer();
  private time = 0;
  animate = true;
  displacement = false;
  exposure = 1;
  private scale = 1;
  private tileSize: [number, number] = [1, 1];
  focused: View | null = null;
  onFrame: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement, grid: HTMLElement) {
    this.grid = grid;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.debug.checkShaderErrors = true;
    const gl = this.renderer.getContext();
    if (!gl.getExtension('EXT_color_buffer_float')) {
      throw new Error('This browser does not support rendering to float textures (EXT_color_buffer_float).');
    }
    gl.getExtension('OES_texture_float_linear');

    this.material = new THREE.MeshPhysicalMaterial({ roughness: 1, metalness: 1, color: 0xffffff });
    this.material.name = 'preview';
    const neutral = new THREE.MeshStandardMaterial({ color: 0x77787a, roughness: 0.85 });
    const neutralDark = new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.9 });
    this.ctx = { material: this.material, envs: buildEnvironments(this.renderer), neutral, neutralDark };
    this.views = createViews(this.ctx);
    this.buildDom();
    window.addEventListener('resize', () => (this.dirty = true));
    grid.addEventListener('scroll', () => (this.dirty = true), { passive: true });
    new ResizeObserver(() => (this.dirty = true)).observe(grid);
  }

  private buildDom() {
    this.grid.innerHTML = '';
    for (const v of this.views) {
      const el = document.createElement('div');
      el.className = 'view';
      el.dataset.view = v.id;
      el.innerHTML = `<div class="view-label"><b>${v.label}</b><span class="view-sub"></span></div>`;
      if (v instanceof MapsView) {
        const labels = document.createElement('div');
        labels.className = 'maps-labels';
        labels.innerHTML = MapsView.CHANNELS.map((c) => `<div><span>${c}</span></div>`).join('');
        el.appendChild(labels);
      }
      el.addEventListener('dblclick', () => this.toggleFocus(v));
      this.grid.appendChild(el);
      v.el = el;
    }
  }

  private attachControls() {
    for (const c of this.controls.values()) c.dispose();
    this.controls.clear();
    for (const v of this.views) {
      if (v instanceof MapsView) continue;
      const c = new OrbitControls(v.camera, v.el);
      c.target.copy(v.home.target);
      c.update();
      c.enableDamping = false;
      c.zoomSpeed = 0.6;
      c.rotateSpeed = 0.6;
      if ((v.camera as THREE.OrthographicCamera).isOrthographicCamera) c.enableRotate = false;
      c.addEventListener('change', () => (this.dirty = true));
      this.controls.set(v, c);
    }
  }

  toggleFocus(v: View) {
    this.focused = this.focused === v ? null : v;
    this.grid.classList.toggle('focused', !!this.focused);
    for (const view of this.views) view.el.classList.toggle('focus', view === this.focused);
    this.dirty = true;
  }

  resetCameras() {
    for (const v of this.views) {
      v.camera.position.copy(v.home.position);
      v.camera.zoom = 1;
      v.camera.updateProjectionMatrix();
      v.camera.lookAt(v.home.target);
      const c = this.controls.get(v);
      if (c) {
        c.target.copy(v.home.target);
        c.update();
      }
    }
    this.dirty = true;
  }

  /** Rebuild all scenes (scale / tile size / displacement density changed). */
  rebuild(scale: number, tileSize: [number, number]) {
    this.scale = scale;
    this.tileSize = tileSize;
    for (const v of this.views) {
      v.build({ scale, tileSize, dense: this.displacement });
      v.built = true;
      v.el.querySelector('.view-sub')!.textContent = v.sub;
    }
    this.attachControls();
    this.dirty = true;
  }

  setDisplacement(on: boolean) {
    this.displacement = on;
    this.applyMaps();
    this.rebuild(this.scale, this.tileSize);
  }

  setTileBorders(on: boolean) {
    for (const v of this.views) if (v instanceof TilingView) v.setBorders(on);
    this.dirty = true;
  }

  setToneMapping(t: ToneMap) {
    this.renderer.toneMapping = { neutral: THREE.NeutralToneMapping, agx: THREE.AgXToneMapping, aces: THREE.ACESFilmicToneMapping, linear: THREE.LinearToneMapping }[t];
    this.material.needsUpdate = true;
    this.ctx.neutral.needsUpdate = true;
    this.ctx.neutralDark.needsUpdate = true;
    for (const v of this.views) v.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
    this.dirty = true;
  }

  /** Point the preview material at freshly baked maps. */
  setMaps(maps: MaterialMaps, extras: SurfaceExtras) {
    const tileChanged = maps.tileSize[0] !== this.tileSize[0] || maps.tileSize[1] !== this.tileSize[1];
    this.maps = maps;
    const m = this.material;
    m.anisotropy = extras.anisotropy ?? 0;
    // brushed along u: microfacets spread across the grooves, i.e. along v
    m.anisotropyRotation = Math.PI / 2;
    m.clearcoat = extras.clearcoat ?? 0;
    m.clearcoatRoughness = extras.clearcoatRoughness ?? 0.1;
    this.applyMaps();
    if (tileChanged) this.rebuild(this.scale, maps.tileSize);
    this.dirty = true;
  }

  private applyMaps() {
    const maps = this.maps;
    if (!maps) return;
    const m = this.material;
    const rep = new THREE.Vector2(1 / maps.tileSize[0], 1 / maps.tileSize[1]);
    const textures = [maps.albedo.texture, maps.orm.texture, maps.normal.texture, maps.heightTex.texture];
    for (const t of textures) {
      t.repeat.copy(rep);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
    }
    const needs = !m.map;
    m.map = maps.albedo.texture;
    m.normalMap = maps.normal.texture;
    m.roughnessMap = maps.orm.texture;
    m.metalnessMap = maps.orm.texture;
    m.aoMap = maps.orm.texture;
    m.displacementMap = maps.heightTex.texture;
    const hi = maps.heightRange[1];
    m.displacementScale = this.displacement ? 0.001 : 0;
    m.displacementBias = this.displacement ? -0.001 * hi : 0;
    if (needs) m.needsUpdate = true;
  }

  get currentMaps() {
    return this.maps;
  }

  invalidate() {
    this.dirty = true;
  }

  start() {
    const loop = () => {
      requestAnimationFrame(loop);
      this.timer.update();
      const dt = Math.min(this.timer.getDelta(), 0.1);
      if (this.animate) {
        this.time += dt;
        this.dirty = true;
      }
      if (this.dirty) {
        this.dirty = false;
        this.render();
      }
      this.onFrame?.();
    };
    loop();
  }

  render() {
    const r = this.renderer;
    const canvas = r.domElement;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const pr = r.getPixelRatio();
    if (canvas.width !== Math.floor(w * pr) || canvas.height !== Math.floor(h * pr)) r.setSize(w, h, false);
    r.setScissorTest(false);
    r.setClearColor(0x0b0c0e, 1);
    r.clear();
    r.setScissorTest(true);
    const canvasRect = canvas.getBoundingClientRect();
    for (const v of this.views) {
      const rect = v.el.getBoundingClientRect();
      if (!v.built || rect.width < 2 || rect.height < 2 || rect.bottom < 0 || rect.top > h) continue;
      const x = rect.left - canvasRect.left;
      const y = canvasRect.bottom - rect.bottom;
      r.setViewport(x, y, rect.width, rect.height);
      r.setScissor(x, y, rect.width, rect.height);
      const aspect = rect.width / rect.height;
      v.setAspect(aspect);
      if (v instanceof MapsView) this.layoutMapLabels(v, aspect);
      v.update(this.animate ? this.time : 0, this.maps);
      r.toneMappingExposure = v.exposure * this.exposure;
      r.render(v.scene, v.camera);
    }
  }

  private layoutMapLabels(v: MapsView, aspect: number) {
    const [cols, rows, labelF] = v.layout(aspect);
    const el = v.el.querySelector('.maps-labels') as HTMLElement;
    const key = `${cols}x${rows}`;
    if (el.dataset.key === key) return;
    el.dataset.key = key;
    el.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    el.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    el.style.setProperty('--label-h', `${labelF * 100}%`);
  }
}
