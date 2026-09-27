import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Sky } from 'three/addons/objects/Sky.js';

/** Image-based lighting setups, all procedural (no HDRI downloads needed). */
export interface Environments {
  studio: THREE.Texture;
  sky: THREE.Texture;      // midday sky, sun disc removed (a DirectionalLight provides the sun)
  skyLow: THREE.Texture;   // low sun
  overcast: THREE.Texture;
  softbox: THREE.Texture;  // black room with strip lights, for reading glossiness
  night: THREE.Texture;
}

export const SUN_MIDDAY = { elevation: 38, azimuth: 40 };
export const SUN_LOW = { elevation: 9, azimuth: 188 };

export function sunDirection(elevationDeg: number, azimuthDeg: number): THREE.Vector3 {
  const phi = THREE.MathUtils.degToRad(90 - elevationDeg);
  const theta = THREE.MathUtils.degToRad(azimuthDeg);
  return new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
}

export function makeSky(sun: { elevation: number; azimuth: number }, turbidity = 3, disc = true): Sky {
  const sky = new Sky();
  sky.scale.setScalar(900);
  sky.frustumCulled = false;
  const u = sky.material.uniforms;
  u.turbidity.value = turbidity;
  u.rayleigh.value = 1.4;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.8;
  u.sunPosition.value.copy(sunDirection(sun.elevation, sun.azimuth));
  u.showSunDisc.value = disc ? 1 : 0;
  if (u.cloudCoverage) u.cloudCoverage.value = 0;
  return sky;
}

function gradientDome(top: THREE.Color, horizon: THREE.Color, ground: THREE.Color): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { top: { value: top }, horizon: { value: horizon }, ground: { value: ground } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top, horizon, ground;
      varying vec3 vDir;
      void main() {
        float y = normalize(vDir).y;
        vec3 c = y > 0.0 ? mix(horizon, top, pow(y, 0.6)) : mix(horizon, ground, pow(-y, 0.35));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(50, 64, 32), mat);
}

function softboxScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.add(gradientDome(new THREE.Color(0.012, 0.012, 0.014), new THREE.Color(0.02, 0.02, 0.022), new THREE.Color(0.006, 0.006, 0.006)));
  const panel = (w: number, h: number, intensity: number, pos: THREE.Vector3, tint = new THREE.Color(1, 1, 1)) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: tint.clone().multiplyScalar(intensity), side: THREE.DoubleSide }),
    );
    m.position.copy(pos);
    m.lookAt(0, 0, 0);
    scene.add(m);
  };
  // Main strip behind/above the preview plane (mirror direction of the softbox view camera)
  panel(9, 1.3, 9, new THREE.Vector3(0, 12, -13));
  // Narrow vertical strip to one side and a small square key
  panel(0.8, 9, 8, new THREE.Vector3(-13, 8, -8));
  panel(2.2, 2.2, 12, new THREE.Vector3(10, 11, -9), new THREE.Color(1.0, 0.96, 0.9));
  // Faint wide fill from the front so the plane isn't black away from the reflections
  panel(30, 8, 0.08, new THREE.Vector3(0, 10, 18));
  return scene;
}

export function buildEnvironments(renderer: THREE.WebGLRenderer): Environments {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const room = new RoomEnvironment();
  const studio = pmrem.fromScene(room, 0.04).texture;

  const skyScene = (sun: { elevation: number; azimuth: number }, turbidity: number, ground: THREE.Color) => {
    const s = new THREE.Scene();
    const sky = makeSky(sun, turbidity, false);
    sky.scale.setScalar(20);
    s.add(sky);
    // the Preetham sky has no ground; add one so the lower hemisphere isn't bright haze
    const g = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshBasicMaterial({ color: ground, side: THREE.DoubleSide }));
    g.rotation.x = -Math.PI / 2;
    g.position.y = -1.5;
    s.add(g);
    return s;
  };
  const sky = pmrem.fromScene(skyScene(SUN_MIDDAY, 3, new THREE.Color(0.2, 0.19, 0.17)), 0, 0.1, 100).texture;
  const skyLow = pmrem.fromScene(skyScene(SUN_LOW, 4, new THREE.Color(0.1, 0.09, 0.08)), 0, 0.1, 100).texture;

  const oc = new THREE.Scene();
  oc.add(gradientDome(new THREE.Color(1.0, 1.0, 1.02), new THREE.Color(0.85, 0.86, 0.88), new THREE.Color(0.28, 0.27, 0.26)));
  const overcast = pmrem.fromScene(oc, 0.02).texture;

  const softbox = pmrem.fromScene(softboxScene(), 0).texture;

  const ns = new THREE.Scene();
  ns.add(gradientDome(new THREE.Color(0.006, 0.009, 0.02), new THREE.Color(0.004, 0.005, 0.009), new THREE.Color(0.001, 0.001, 0.001)));
  const night = pmrem.fromScene(ns, 0.02).texture;

  pmrem.dispose();
  return { studio, sky, skyLow, overcast, softbox, night };
}
