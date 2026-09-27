import * as THREE from 'three';

/*
 * Preview geometry with UVs in meters, so one texture repeat is exactly one
 * physical tile everywhere (textures get repeat = 1 / tileSize).
 */

/** Plane in the XZ plane (facing +Y) or XY plane (facing +Z); UV = position in meters + offset. */
export function metricPlane(w: number, h: number, segX: number, segY: number, facing: 'up' | 'front' = 'up', uvOffset = new THREE.Vector2()): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h, segX, segY);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (uv.getX(i) - 0.5) * w + uvOffset.x, (uv.getY(i) - 0.5) * h + uvOffset.y);
  }
  if (facing === 'up') g.rotateX(-Math.PI / 2);
  return g;
}

/**
 * Rounded box with extra subdivisions in the rounded zone. Each face is
 * UV-mapped in meters (0..size).
 */
export function roundedBox(size: number, radius: number, segs: number, roundSegs = 8): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(size, size, size, segs, segs, segs);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const half = size / 2;
  const inner = half - radius;
  const rFrac = radius / size;
  const nr = Math.min(roundSegs, Math.floor(segs / 4));
  const a = nr / segs;
  // piecewise-linear remap of the uniform grid: nr segments per rounded zone
  const map01 = (f: number) => {
    if (f <= a) return (f / a) * rFrac;
    if (f >= 1 - a) return 1 - rFrac + ((f - (1 - a)) / a) * rFrac;
    return rFrac + ((f - a) / (1 - 2 * a)) * (1 - 2 * rFrac);
  };
  const v = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    v.set(-half + map01((v.x + half) / size) * size, -half + map01((v.y + half) / size) * size, -half + map01((v.z + half) / size) * size);
    c.set(THREE.MathUtils.clamp(v.x, -inner, inner), THREE.MathUtils.clamp(v.y, -inner, inner), THREE.MathUtils.clamp(v.z, -inner, inner));
    n.subVectors(v, c);
    if (n.lengthSq() > 1e-12) {
      n.normalize();
      v.copy(c).addScaledVector(n, radius);
      nor.setXYZ(i, n.x, n.y, n.z);
    }
    pos.setXYZ(i, v.x, v.y, v.z);
    uv.setXY(i, map01(uv.getX(i)) * size, map01(uv.getY(i)) * size);
  }
  g.computeBoundingSphere();
  return g;
}

export function metricSphere(radius: number, wSeg = 192, hSeg = 96): THREE.BufferGeometry {
  // start the seam at the back (phiStart) so it faces away from the default cameras
  const g = new THREE.SphereGeometry(radius, wSeg, hSeg, -Math.PI / 2);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2 * Math.PI * radius, uv.getY(i) * Math.PI * radius);
  return g;
}

export function metricCylinder(radius: number, height: number, radial = 160, hSeg = 64): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(radius, radius, height, radial, hSeg, false, Math.PI);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const index = g.index!;
  const isCap = new Uint8Array(uv.count);
  for (const grp of g.groups) {
    if (grp.materialIndex === 0) continue;
    for (let i = grp.start; i < grp.start + grp.count; i++) isCap[index.getX(i)] = 1;
  }
  for (let i = 0; i < uv.count; i++) {
    if (isCap[i]) uv.setXY(i, (uv.getX(i) - 0.5) * 2 * radius, (uv.getY(i) - 0.5) * 2 * radius);
    else uv.setXY(i, uv.getX(i) * 2 * Math.PI * radius, uv.getY(i) * height);
  }
  g.clearGroups();
  return g;
}
