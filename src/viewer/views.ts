import * as THREE from 'three';
import type { Environments } from './environments';
import { makeSky, SUN_LOW, SUN_MIDDAY, sunDirection } from './environments';
import { metricPlane, metricSphere, roundedBox } from './geometry';
import type { MaterialMaps } from '../engine/baker';

export interface ViewContext {
  material: THREE.MeshPhysicalMaterial;
  envs: Environments;
  /** Neutral surface for floors/backdrops that are not the material itself. */
  neutral: THREE.MeshStandardMaterial;
  neutralDark: THREE.MeshStandardMaterial;
}

export interface BuildInfo {
  /** Size multiplier for object views (MaterialDef.previewScale). */
  scale: number;
  tileSize: [number, number];
  /** Dense meshes so displacement works. */
  dense: boolean;
}

export abstract class View {
  abstract readonly id: string;
  abstract readonly label: string;
  sub = '';
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = new THREE.PerspectiveCamera(35, 1, 0.01, 2000);
  /** Default camera pose, restored by reset(). */
  home = { position: new THREE.Vector3(), target: new THREE.Vector3() };
  exposure = 1;
  el!: HTMLElement;
  protected ctx: ViewContext;
  /** When false the view doesn't need re-rendering unless something changed. */
  animated = false;
  built = false;

  constructor(ctx: ViewContext) {
    this.ctx = ctx;
  }

  /** (Re)build the scene for a material. Called on material switch / scale change. */
  abstract build(info: BuildInfo): void;
  /** Per-frame update; t in seconds (0 when animation is off). */
  update(_t: number, _maps: MaterialMaps | null) {}

  protected clear() {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry) m.geometry.dispose();
    });
    this.scene.clear();
  }

  protected look(pos: THREE.Vector3, target: THREE.Vector3) {
    this.home.position.copy(pos);
    this.home.target.copy(target);
    this.camera.position.copy(pos);
    this.camera.lookAt(target);
  }

  setAspect(aspect: number) {
    const c = this.camera;
    if ((c as THREE.PerspectiveCamera).isPerspectiveCamera) {
      const p = c as THREE.PerspectiveCamera;
      if (p.aspect !== aspect) {
        // cameras are framed for ~4:3; in narrower cells widen the vertical FOV
        // so the horizontal framing stays the same
        const base = (p.userData.baseFov ??= p.fov) as number;
        const ref = 1.25;
        p.fov = aspect >= ref ? base : THREE.MathUtils.radToDeg(2 * Math.atan((Math.tan(THREE.MathUtils.degToRad(base) / 2) * ref) / aspect));
        p.aspect = aspect;
        p.updateProjectionMatrix();
      }
    }
  }
}

function shadowLight(color: number, intensity: number, pos: THREE.Vector3, target: THREE.Vector3, extent: number, mapSize = 2048): THREE.DirectionalLight {
  const l = new THREE.DirectionalLight(color, intensity);
  l.position.copy(pos);
  l.target.position.copy(target);
  l.castShadow = true;
  l.shadow.mapSize.set(mapSize, mapSize);
  const cam = l.shadow.camera;
  cam.left = -extent; cam.right = extent; cam.top = extent; cam.bottom = -extent;
  cam.near = 0.01; cam.far = pos.distanceTo(target) * 2 + extent;
  l.shadow.bias = -0.0002;
  l.shadow.normalBias = 0.004 * extent;
  return l;
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material, cast = true, receive = true): THREE.Mesh {
  const o = new THREE.Mesh(g, m);
  o.castShadow = cast;
  o.receiveShadow = receive;
  return o;
}

// ---------------------------------------------------------------------------

/** Rounded cube in a studio: edges, three face orientations, soft key light. */
export class StudioView extends View {
  id = 'studio';
  label = 'Studio';
  sub = 'rounded cube, softbox key';
  build({ scale: s, dense }: BuildInfo) {
    this.clear();
    const { material, envs, neutral } = this.ctx;
    this.scene.environment = envs.studio;
    this.scene.environmentIntensity = 0.75;
    this.scene.background = new THREE.Color(0x202226);
    const cube = mesh(roundedBox(s, 0.05 * s, dense ? 160 : 48, dense ? 16 : 8), material);
    cube.position.y = 0.5 * s;
    cube.rotation.y = THREE.MathUtils.degToRad(-32);
    this.scene.add(cube);
    const floor = mesh(metricPlane(40 * s, 40 * s, 1, 1), neutral, false, true);
    this.scene.add(floor);
    this.scene.add(shadowLight(0xfff4e8, 2.4, new THREE.Vector3(-2.2, 3.6, 2.2).multiplyScalar(s), new THREE.Vector3(0, 0.4 * s, 0), 1.3 * s));
    const cam = new THREE.PerspectiveCamera(30, 1, 0.01 * s, 200 * s);
    this.camera = cam;
    this.look(new THREE.Vector3(1.85, 1.55, 2.75).multiplyScalar(s), new THREE.Vector3(0, 0.46 * s, 0));
    this.exposure = 1.0;
  }
}

/** Sphere in midday sun: every normal orientation, hard light and sky reflections. */
export class SunView extends View {
  id = 'sun';
  label = 'Sunlight';
  sub = `sphere, sun ${SUN_MIDDAY.elevation}°`;
  build({ scale: s, dense }: BuildInfo) {
    this.clear();
    const { material, envs, neutral } = this.ctx;
    this.scene.environment = envs.sky;
    this.scene.environmentIntensity = 0.35;
    this.scene.background = null;
    this.scene.add(makeSky(SUN_MIDDAY, 3, true));
    const ball = mesh(metricSphere(0.5 * s, dense ? 384 : 192, dense ? 192 : 96), material);
    ball.position.y = 0.5 * s;
    this.scene.add(ball);
    this.scene.add(mesh(metricPlane(60 * s, 60 * s, 1, 1), neutral, false, true));
    const dir = sunDirection(SUN_MIDDAY.elevation, SUN_MIDDAY.azimuth);
    this.scene.add(shadowLight(0xfff1dc, 3.2, dir.clone().multiplyScalar(6 * s).add(new THREE.Vector3(0, 0.5 * s, 0)), new THREE.Vector3(0, 0.5 * s, 0), 1.4 * s));
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.01 * s, 2000);
    this.look(new THREE.Vector3(0.35, 0.95, 2.7).multiplyScalar(s), new THREE.Vector3(0, 0.5 * s, 0));
    this.exposure = 1.0;
  }
}

/** Straight-on orthographic view of 2x2 tiles under flat light: pattern, color, seams. */
export class TilingView extends View {
  id = 'tiling';
  label = 'Tiling · flat light';
  private tile: [number, number] = [1, 1];
  private borders: THREE.LineSegments | null = null;
  showBorders = false;
  build({ tileSize }: BuildInfo) {
    this.clear();
    const { material, envs } = this.ctx;
    this.tile = tileSize;
    const [tw, th] = tileSize;
    this.sub = `2×2 tiles, ${fmtLen(tw)} × ${fmtLen(th)} each`;
    this.scene.environment = envs.overcast;
    this.scene.environmentIntensity = 1.0;
    this.scene.background = new THREE.Color(0x111214);
    this.scene.add(mesh(metricPlane(tw * 6, th * 6, 1, 1), material, false, false));
    const pts: number[] = [];
    for (let i = -3; i <= 3; i++) {
      pts.push(i * tw, 0.0005, -3 * th, i * tw, 0.0005, 3 * th);
      pts.push(-3 * tw, 0.0005, i * th, 3 * tw, 0.0005, i * th);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.borders = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xff3366, transparent: true, opacity: 0.55, toneMapped: false }));
    this.borders.visible = this.showBorders;
    this.scene.add(this.borders);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
    this.camera = cam;
    // look straight down; screen-up = world -z so that texture v points up on screen
    cam.up.set(0, 0, -1);
    this.look(new THREE.Vector3(0, 10, 0), new THREE.Vector3(0, 0, 0));
    this.exposure = 1.0;
  }
  setBorders(on: boolean) {
    this.showBorders = on;
    if (this.borders) this.borders.visible = on;
  }
  setAspect(aspect: number) {
    const cam = this.camera as THREE.OrthographicCamera;
    const [tw, th] = this.tile;
    // fit 2x2 tiles into the view
    let hh = th, hw = th * aspect;
    if (hw < tw) { hw = tw; hh = tw / aspect; }
    if (cam.top !== hh || cam.right !== hw) {
      cam.left = -hw; cam.right = hw; cam.top = hh; cam.bottom = -hh;
      cam.updateProjectionMatrix();
    }
  }
}

/** Close-up at an oblique angle with a grazing light: reveals the relief. */
export class RakingView extends View {
  id = 'raking';
  label = 'Close-up · raking light';
  sub = '30 cm away, light 8° above the surface';
  private light!: THREE.DirectionalLight;
  animated = true;
  build({ dense }: BuildInfo) {
    this.clear();
    const { material, envs } = this.ctx;
    this.scene.environment = envs.studio;
    this.scene.environmentIntensity = 0.1;
    this.scene.background = new THREE.Color(0x0b0b0d);
    this.scene.add(mesh(metricPlane(1.4, 1.4, dense ? 900 : 1, dense ? 900 : 1, 'up', new THREE.Vector2(0.137, 0.211)), material, dense, dense));
    this.light = shadowLight(0xfff0dd, 3.4, new THREE.Vector3(-2, 0.3, 0.2), new THREE.Vector3(0, 0, 0), 0.5, 4096);
    this.light.shadow.normalBias = 0.0005;
    this.scene.add(this.light, this.light.target);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.005, 50);
    this.look(new THREE.Vector3(0.0, 0.19, 0.24), new THREE.Vector3(0, 0, -0.02));
    this.exposure = 1.0;
  }
  update(t: number) {
    const az = THREE.MathUtils.degToRad(160 + 35 * Math.sin(t * 0.35));
    const el = THREE.MathUtils.degToRad(8);
    this.light.position.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).multiplyScalar(2);
  }
}

/** Standing on a big floor of the material, looking toward a low sun. */
export class HorizonView extends View {
  id = 'horizon';
  label = 'Grazing · to the horizon';
  sub = 'eye height 1.6 m, low sun ahead';
  build() {
    this.clear();
    const { material, envs } = this.ctx;
    this.scene.environment = envs.skyLow;
    this.scene.environmentIntensity = 0.3;
    this.scene.background = null;
    this.scene.add(makeSky(SUN_LOW, 4, true));
    this.scene.add(mesh(metricPlane(400, 400, 1, 1), material, false, false));
    const sun = new THREE.DirectionalLight(0xffe2bf, 2.6);
    sun.position.copy(sunDirection(SUN_LOW.elevation, SUN_LOW.azimuth)).multiplyScalar(10);
    this.scene.add(sun);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 3000);
    this.look(new THREE.Vector3(0, 1.6, 0), new THREE.Vector3(0.9, 0.2, -12));
    this.exposure = 1.25;
  }
}

/** Flat panel reflecting strip lights: shows glossiness and roughness variation. */
export class SoftboxView extends View {
  id = 'softbox';
  label = 'Softbox reflections';
  sub = 'strip lights mirrored in the surface';
  private panel!: THREE.Mesh;
  animated = true;
  build({ scale: s, dense }: BuildInfo) {
    this.clear();
    const { material, envs } = this.ctx;
    this.scene.environment = envs.softbox;
    this.scene.environmentIntensity = 1.0;
    this.scene.background = new THREE.Color(0x060607);
    this.panel = mesh(metricPlane(4 * s, 4 * s, dense ? 800 : 1, dense ? 800 : 1), material, false, false);
    this.scene.add(this.panel);
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.01 * s, 100 * s);
    this.look(new THREE.Vector3(0, 0.95, 1.05).multiplyScalar(s), new THREE.Vector3(0, 0, -0.1 * s));
    this.exposure = 1.0;
  }
  update(t: number) {
    this.panel.rotation.x = THREE.MathUtils.degToRad(5 * Math.sin(t * 0.5));
    this.panel.rotation.z = THREE.MathUtils.degToRad(4 * Math.sin(t * 0.31));
  }
}

/** A wall at night lit by a close, warm point light. */
export class NightView extends View {
  id = 'night';
  label = 'Lamp at night';
  sub = 'wall, warm point light 35 cm away';
  private lamp!: THREE.PointLight;
  private bulb!: THREE.Mesh;
  private s = 1;
  animated = true;
  build({ scale: s, dense }: BuildInfo) {
    this.clear();
    this.s = s;
    const { material, envs, neutralDark } = this.ctx;
    this.scene.environment = envs.night;
    this.scene.environmentIntensity = 1.0;
    this.scene.background = new THREE.Color(0x030305);
    const wall = mesh(metricPlane(5 * s, 2.4 * s, dense ? 1000 : 1, dense ? 480 : 1, 'front', new THREE.Vector2(0, 1.2 * s)), material, dense, dense);
    wall.position.set(0, 1.2 * s, 0);
    this.scene.add(wall);
    this.scene.add(mesh(metricPlane(20 * s, 20 * s, 1, 1), neutralDark, false, true));
    this.lamp = new THREE.PointLight(0xffb36b, 1.6 * s * s, 0, 2);
    this.lamp.castShadow = true;
    this.lamp.shadow.mapSize.set(1024, 1024);
    this.lamp.shadow.bias = -0.0005;
    this.lamp.shadow.camera.near = 0.01 * s;
    this.scene.add(this.lamp);
    this.bulb = new THREE.Mesh(new THREE.SphereGeometry(0.018 * s, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc890).multiplyScalar(4) }));
    this.scene.add(this.bulb);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.01 * s, 100 * s);
    this.look(new THREE.Vector3(1.55, 1.3, 1.6).multiplyScalar(s), new THREE.Vector3(-0.05 * s, 1.15 * s, 0));
    this.update(0);
    this.exposure = 1.0;
  }
  update(t: number) {
    const s = this.s;
    this.lamp.position.set((0.15 + 0.35 * Math.sin(t * 0.4)) * s, 1.25 * s, 0.35 * s);
    this.bulb.position.copy(this.lamp.position);
  }
}

/** Straight-on macro of a 10 cm patch: texel density check. */
export class MacroView extends View {
  id = 'macro';
  label = 'Macro';
  sub = '10 cm wide, straight on';
  build() {
    this.clear();
    const { material, envs } = this.ctx;
    this.scene.environment = envs.studio;
    this.scene.environmentIntensity = 0.55;
    this.scene.background = new THREE.Color(0x111214);
    this.scene.add(mesh(metricPlane(0.6, 0.6, 1, 1, 'up', new THREE.Vector2(0.05, 0.05)), material, false, false));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(-1, 1.3, -0.6);
    this.scene.add(key);
    const cam = new THREE.OrthographicCamera(-0.05, 0.05, 0.05, -0.05, 0.01, 10);
    cam.up.set(0, 0, -1);
    this.camera = cam;
    this.look(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0));
    this.exposure = 1.0;
  }
  setAspect(aspect: number) {
    const cam = this.camera as THREE.OrthographicCamera;
    const hw = 0.05, hh = 0.05 / aspect;
    if (cam.top !== hh) {
      cam.left = -hw; cam.right = hw; cam.top = hh; cam.bottom = -hh;
      cam.updateProjectionMatrix();
    }
  }
}

/** Raw texture channels. */
export class MapsView extends View {
  id = 'maps';
  label = 'Maps';
  sub = '';
  static readonly CHANNELS = ['Albedo', 'Normal', 'Roughness', 'Metallic', 'AO', 'Height'];
  private quads: THREE.Mesh[] = [];
  private mats: THREE.ShaderMaterial[] = [];
  private aspect = 1;
  cols = 3;
  rows = 2;
  build({ tileSize }: BuildInfo) {
    this.clear();
    this.scene.background = new THREE.Color(0x0f1012);
    this.aspect = tileSize[0] / tileSize[1];
    const cam = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
    this.camera = cam;
    this.quads = [];
    this.mats = MapsView.CHANNELS.map((_, i) =>
      new THREE.ShaderMaterial({
        uniforms: { tex: { value: null }, mode: { value: i }, range: { value: new THREE.Vector2(0, 1) } },
        toneMapped: false,
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform sampler2D tex; uniform int mode; uniform vec2 range;
          varying vec2 vUv;
          vec3 toLin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
          void main() {
            vec4 t = texture2D(tex, vUv);
            vec3 c;
            if (mode == 0) c = t.rgb;                       // sRGB texture, already linear after sampling
            else if (mode == 1) c = toLin(t.rgb);
            else if (mode == 2) c = toLin(vec3(t.g));
            else if (mode == 3) c = toLin(vec3(t.b));
            else if (mode == 4) c = toLin(vec3(t.r));
            else c = toLin(vec3(clamp((t.r - range.x) / max(range.y - range.x, 1e-6), 0.0, 1.0)));
            gl_FragColor = vec4(c, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    );
    for (const m of this.mats) {
      const q = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
      this.quads.push(q);
      this.scene.add(q);
    }
  }
  /** Grid layout shared with the HTML labels: returns [cols, rows, labelFraction]. */
  layout(viewAspect: number): [number, number, number] {
    const cols = viewAspect > 1.2 ? 3 : 2;
    return [cols, Math.ceil(MapsView.CHANNELS.length / cols), 0.16];
  }
  setAspect(viewAspect: number) {
    const [cols, rows, labelF] = this.layout(viewAspect);
    this.cols = cols;
    this.rows = rows;
    const cw = 1 / cols, ch = 1 / rows;
    const labelH = ch * labelF;
    this.quads.forEach((q, i) => {
      const cx = i % cols, cy = Math.floor(i / cols);
      // a quad of (w, h) view units is (w * aspect : h) on screen
      let w = cw * 0.92, h = (ch - labelH) * 0.94;
      if ((w * viewAspect) / h > this.aspect) w = (h * this.aspect) / viewAspect;
      else h = (w * viewAspect) / this.aspect;
      q.scale.set(w, h, 1);
      q.position.set(cx * cw + cw / 2, 1 - cy * ch - labelH - (ch - labelH) / 2, 0);
    });
  }
  update(_t: number, maps: MaterialMaps | null) {
    if (!maps) return;
    const tex = [maps.albedo.texture, maps.normal.texture, maps.orm.texture, maps.orm.texture, maps.orm.texture, maps.heightTex.texture];
    this.mats.forEach((m, i) => {
      m.uniforms.tex.value = tex[i];
      m.uniforms.range.value.set(maps.heightRange[0], maps.heightRange[1]);
    });
  }
}

export function fmtLen(m: number): string {
  if (m >= 1) return `${+m.toFixed(2)} m`;
  if (m >= 0.01) return `${+(m * 100).toFixed(1)} cm`;
  return `${+(m * 1000).toFixed(1)} mm`;
}

export function createViews(ctx: ViewContext): View[] {
  return [
    new StudioView(ctx),
    new SunView(ctx),
    new TilingView(ctx),
    new RakingView(ctx),
    new HorizonView(ctx),
    new SoftboxView(ctx),
    new NightView(ctx),
    new MacroView(ctx),
    new MapsView(ctx),
  ];
}
