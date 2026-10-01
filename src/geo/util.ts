import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mat, MatKey } from './materials';

export type V3 = [number, number, number];
export const DEG = Math.PI / 180;

/** Axis helpers: lathe/cylinder primitives are built around +Y; reorient them. */
export function yToZ(g: THREE.BufferGeometry) { return g.rotateX(Math.PI / 2); }
export function yToX(g: THREE.BufferGeometry) { return g.rotateZ(-Math.PI / 2); }

export function mesh(g: THREE.BufferGeometry, m: MatKey, pos?: V3, rot?: V3): THREE.Mesh {
  const me = new THREE.Mesh(g, mat(m));
  if (rot) me.rotation.set(rot[0], rot[1], rot[2]);
  if (pos) me.position.set(pos[0], pos[1], pos[2]);
  return me;
}

/** Lathe from [radius, axial] pairs, around Y. */
export function lathe(pts: [number, number][], segs = 48, phiStart = 0, phiLen = Math.PI * 2) {
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.001), y)), segs, phiStart, phiLen);
}

export function box(w: number, h: number, d: number) { return new THREE.BoxGeometry(w, h, d); }
/** Box spanning explicit min/max corners. */
export function boxMM(min: V3, max: V3) {
  const g = new THREE.BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  g.translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  return g;
}
export function cyl(r: number, h: number, segs = 32, r2?: number) { return new THREE.CylinderGeometry(r2 ?? r, r, h, segs); }
/** Cylinder between two points. */
export function cylBetween(a: V3, b: V3, r: number, segs = 16) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const g = new THREE.CylinderGeometry(r, r, len, segs);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  g.applyQuaternion(q);
  const mid = va.add(vb).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

export function roundRect(w: number, h: number, r: number, cx = 0, cy = 0) {
  const s = new THREE.Shape();
  const x = cx - w / 2, y = cy - h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
export function circlePath(r: number, cx = 0, cy = 0, hole = true) {
  const p = hole ? new THREE.Path() : new THREE.Shape();
  p.absarc(cx, cy, r, 0, Math.PI * 2, hole);
  return p;
}
export function circleShape(r: number, cx = 0, cy = 0) {
  const s = new THREE.Shape(); s.absarc(cx, cy, r, 0, Math.PI * 2, false); return s;
}
export function ringShape(ro: number, ri: number) {
  const s = circleShape(ro); s.holes.push(circlePath(ri) as THREE.Path); return s;
}
export function polyShape(pts: [number, number][]) {
  const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath(); return s;
}
/** Convex hull (monotone chain) of 2D points. */
export function hull(points: [number, number][]): [number, number][] {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: [number, number][] = [], up: [number, number][] = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  up.pop(); lo.pop(); return lo.concat(up);
}
export function circlePts(cx: number, cy: number, r: number, n = 24): [number, number][] {
  return Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * Math.PI * 2), cy + r * Math.sin((i / n) * Math.PI * 2)] as [number, number]);
}
/**
 * Toothed annulus as one outline (outer teeth, then the bore reversed). ExtrudeGeometry's hole
 * triangulator bridges a duplex sprocket's bore, so the bore is part of the contour instead.
 * The root flat is centred at 0.875 of the tooth pitch, which is where `toothPhase` seats a roller.
 */
export function sprocketRingShape(teeth: number, rRoot: number, rTip: number, rHole: number) {
  const step = (Math.PI * 2) / teeth;
  const outer: [number, number][] = [];
  for (let i = 0; i < teeth; i++) {
    const a0 = i * step;
    for (const [r, f] of [[rRoot, 0.02], [rTip, 0.14], [rTip, 0.30], [rRoot, 0.50], [rRoot, 0.78], [rRoot, 0.97]] as [number, number][]) {
      const a = a0 + step * f;
      outer.push([r * Math.cos(a), r * Math.sin(a)]);
    }
  }
  const aJoin = Math.atan2(outer[0][1], outer[0][0]);
  const pts = outer.slice();
  const innerN = Math.max(48, teeth * 2);
  for (let i = 0; i <= innerN; i++) {
    const a = aJoin - (i / innerN) * Math.PI * 2;
    pts.push([rHole * Math.cos(a), rHole * Math.sin(a)]);
  }
  return polyShape(pts);
}
/** Spur gear / sprocket outline. */
export function gearShape(teeth: number, rRoot: number, rTip: number, holeR = 0, sprocket = false) {
  const s = new THREE.Shape();
  const n = teeth;
  const step = (Math.PI * 2) / n;
  for (let i = 0; i < n; i++) {
    const a0 = i * step;
    // Sprocket gullet: root flat centred at 0.875 of the tooth pitch (toothPhase seats a roller there).
    // Spur flanks taper and stay under half a pitch so a meshing pair has backlash.
    // The tip arc is about a third of the circular pitch. Tooth centre stays at 0.35 of the pitch.
    const c = 0.35;
    const rLo = rRoot + (rTip - rRoot) * 0.35;
    const rHi = rRoot + (rTip - rRoot) * 0.7;
    const pts: [number, number][] = sprocket
      ? [[rRoot, a0 + step * 0.02], [rTip, a0 + step * 0.14], [rTip, a0 + step * 0.30], [rRoot, a0 + step * 0.50], [rRoot, a0 + step * 0.78], [rRoot, a0 + step * 0.97]]
      : [
          [rRoot, a0 + step * (c - 0.20)],
          [rLo, a0 + step * (c - 0.185)],
          [rHi, a0 + step * (c - 0.175)],
          [rTip, a0 + step * (c - 0.16)],
          [rTip, a0 + step * (c + 0.16)],
          [rHi, a0 + step * (c + 0.175)],
          [rLo, a0 + step * (c + 0.185)],
          [rRoot, a0 + step * (c + 0.20)],
        ];
    pts.forEach(([r, a], k) => { const x = r * Math.cos(a), y = r * Math.sin(a); if (i === 0 && k === 0) s.moveTo(x, y); else s.lineTo(x, y); });
  }
  s.closePath();
  if (holeR > 0) s.holes.push(circlePath(holeR) as THREE.Path);
  return s;
}
/** Extrude shape along +Z from z=0 to depth. */
export function extrude(shape: THREE.Shape | THREE.Shape[], depth: number, bevel = 0, curveSegments = 12) {
  return new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments,
  });
}
/** Extrude centered on z=0. */
export function extrudeC(shape: THREE.Shape | THREE.Shape[], depth: number, bevel = 0, curveSegments = 12) {
  const g = extrude(shape, depth, bevel, curveSegments); g.translate(0, 0, -depth / 2); return g;
}
export function hexNut(af: number, h: number) { return new THREE.CylinderGeometry(af / Math.sqrt(3), af / Math.sqrt(3), h, 6); }
export function tube(pts: V3[], r: number, radial = 12, tubular = 64, closed = false) {
  const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), closed, 'centripetal');
  return new THREE.TubeGeometry(c, tubular, r, radial, closed);
}
export function torus(R: number, r: number, rs = 8, ts = 48) { return new THREE.TorusGeometry(R, r, rs, ts); }
/** Helix spring along +Y from y0 to y1. */
export function spring(R: number, wire: number, y0: number, y1: number, turns: number) {
  const pts: V3[] = [];
  const n = Math.ceil(turns * 16);
  for (let i = 0; i <= n; i++) { const t = i / n, a = t * turns * Math.PI * 2; pts.push([R * Math.cos(a), y0 + (y1 - y0) * t, R * Math.sin(a)]); }
  return tube(pts, wire, 6, n * 2);
}

/** Group builder that tracks meshes. */
export class Part {
  g = new THREE.Group();
  add(geo: THREE.BufferGeometry, m: MatKey, pos?: V3, rot?: V3) { this.g.add(mesh(geo, m, pos, rot)); return this; }
  addObj(o: THREE.Object3D) { this.g.add(o); return this; }
}

/** Cut every (non-instanced) mesh of a group whose bounds meet a cutter: transforms are baked first. */
export function cutGroup(root: THREE.Object3D, ...cutters: THREE.BufferGeometry[]) {
  root.updateMatrixWorld(true);
  const boxes = cutters.map((c) => { c.computeBoundingBox(); return c.boundingBox!.clone(); });
  root.traverse((o: any) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    const g: THREE.BufferGeometry = o.geometry.clone().applyMatrix4(o.matrixWorld); g.computeBoundingBox();
    const hit = cutters.filter((_, i) => boxes[i].intersectsBox(g.boundingBox!));
    if (!hit.length) return;
    o.geometry = csgSub(g, ...hit); o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); o.updateMatrix();
  });
  return root;
}
/** Merge all meshes of a group per material into a compact object (no uvs). */
export function consolidate(root: THREE.Object3D, name: string): THREE.Group {
  root.updateMatrixWorld(true);
  const byMat = new Map<string, { m: THREE.Material; geos: THREE.BufferGeometry[] }>();
  const inst: THREE.InstancedMesh[] = [];
  root.traverse((o) => {
    const me = o as THREE.Mesh;
    if (!me.isMesh) return;
    if ((o as THREE.InstancedMesh).isInstancedMesh) {
      // keep instancing (EXT_mesh_gpu_instancing): bake the parent transform into the instance matrices
      const im = o as THREE.InstancedMesh; const c = new THREE.InstancedMesh(im.geometry, im.material, im.count);
      const m = new THREE.Matrix4();
      for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, m); c.setMatrixAt(i, m.premultiply(im.matrixWorld)); }
      c.name = `${name}:inst${inst.length}`; inst.push(c); return;
    }
    let g = me.geometry.clone();
    g.applyMatrix4(me.matrixWorld);
    if (g.index) g = g.toNonIndexed();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    const mm = me.material as THREE.Material;
    const e = byMat.get(mm.name) ?? { m: mm, geos: [] };
    e.geos.push(g); byMat.set(mm.name, e);
  });
  const out = new THREE.Group(); out.name = name;
  for (const [k, e] of byMat) {
    let g = mergeGeometries(e.geos, false)!;
    g = mergeVertices(g, 1e-3);
    g.computeBoundingBox(); g.computeBoundingSphere();
    const me = new THREE.Mesh(g, e.m); me.name = `${name}:${k}`; out.add(me);
  }
  for (const c of inst) { c.computeBoundingBox(); c.computeBoundingSphere(); out.add(c); }
  return out;
}

/** Parametric surface from f(u,v) -> [x,y,z], u,v in [0,1]; optional wrap in u. */
export function paramSurface(f: (u: number, v: number) => V3, nu: number, nv: number, wrapU = false) {
  const pos: number[] = [], idx: number[] = [];
  const cu = wrapU ? nu : nu + 1;
  for (let j = 0; j <= nv; j++) for (let i = 0; i < cu; i++) pos.push(...f(i / nu, j / nv));
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const i1 = wrapU ? (i + 1) % nu : i + 1;
    const a = j * cu + i, b = j * cu + i1, c = (j + 1) * cu + i, d = (j + 1) * cu + i1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/** Rounded-rectangle plate with optional circular holes, extruded along +Z, centred. */
export function plate(w: number, h: number, r: number, t: number, holes: [number, number, number][] = [], bevel = 0) {
  const s = roundRect(w, h, r);
  for (const [x, y, rr] of holes) s.holes.push(circlePath(rr, x, y) as THREE.Path);
  return extrudeC(s, t, bevel, 6);
}
/** Triangular gusset plate in the XY plane (points a,b,c), thickness t along Z centred on z. */
export function gusset(a: [number, number], b: [number, number], c: [number, number], t: number, z: number) {
  const g = extrudeC(polyShape([a, b, c]), t); g.translate(0, 0, z); return g;
}

// ---------------------------------------------------------------- CSG (asset-build time only)
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
const csgEval = new Evaluator(); csgEval.attributes = ['position', 'normal'];
/** base minus cutters (geometries already in the same frame). Returns position/normal geometry. */
export function csgSub(base: THREE.BufferGeometry, ...cutters: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const clean = (g: THREE.BufferGeometry) => { let q = g.index ? g.toNonIndexed() : g.clone(); for (const k of Object.keys(q.attributes)) if (k !== 'position' && k !== 'normal') q.deleteAttribute(k); if (!q.attributes.normal) q.computeVertexNormals(); return q; };
  let b = new Brush(clean(base)); b.updateMatrixWorld();
  for (const c of cutters) { const cb = new Brush(clean(c)); cb.updateMatrixWorld(); b = csgEval.evaluate(b, cb, SUBTRACTION) as Brush; }
  return b.geometry;
}
/** Woodruff key outline (half-moon): chord of length 2*sqrt(h(D-h)) on y = 0, arc down to y = -h; extruded `b` thick (centred on z). */
export function woodruffGeom(D: number, h: number, b: number) {
  const R = D / 2, cy = R - h; // circle centre (y): chord at y = 0
  const half = Math.sqrt(R * R - cy * cy);
  const s = new THREE.Shape(); s.moveTo(-half, 0); s.lineTo(half, 0);
  const a0 = Math.atan2(-cy, half), a1 = Math.atan2(-cy, -half);
  s.absarc(0, cy, R, a0, a1 + (a1 > a0 ? -2 * Math.PI : 0), true);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: b, bevelEnabled: false, curveSegments: 24 }).translate(0, 0, -b / 2);
}
