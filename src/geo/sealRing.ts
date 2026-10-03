/**
 * Continuous valve-cover seal. The lip is a closed band at least 6 mm wide.
 * Where a stem or a stud crosses the rail the band jogs out past it, and the
 * cover and the cam housing both grow a face there so the gasket stays clamped.
 */
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { CH_Z0, CH_Z1, coverMatrix, vcStuds } from './core';
import { rockers, valveSet } from './valvetrain';
import { PARTS } from '../data/parts';
import { cutClosed } from './manifoldCut';

const STEP = 1;
const X0 = -50;
const Y0 = -188;
const X1 = 50;
const Y1 = 188;
const HALF = 3.05;
/** Hardware stays this far from the band edge. Erosion is 1 mm on each mesh. */
const CLEAR = 2.6;

interface Loop {
  pts: [number, number][];
  on: Uint8Array;
  nx: number;
  ny: number;
}

const loopCache = new Map<string, Loop>();
const hwCache = new Map<string, MeshBVH>();

function poseOf(id: string) {
  const def = PARTS.find((p) => p.id === id);
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...(def?.position ?? [0, 0, 0])),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...(def?.rotation ?? [0, 0, 0]))),
    new THREE.Vector3(1, 1, 1),
  );
}
function appendMesh(pos: number[], root: THREE.Object3D, pose: THREE.Matrix4) {
  root.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
    const P = g.attributes.position;
    const world = pose.clone().multiply(m.matrixWorld);
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(world);
      pos.push(v.x, v.y, v.z);
    }
  });
}
function hardware(s: 1 | -1) {
  const key = `${s}`;
  const hit = hwCache.get(key);
  if (hit) return hit;
  const pos: number[] = [];
  appendMesh(pos, rockers(s), new THREE.Matrix4());
  for (const c of s > 0 ? [1, 2, 3] : [4, 5, 6]) appendMesh(pos, valveSet(c), poseOf(`valves-${c}`));
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const bvh = new MeshBVH(geom);
  hwCache.set(key, bvh);
  return bvh;
}

function gridSize() {
  return { nx: Math.round((X1 - X0) / STEP), ny: Math.round((Y1 - Y0) / STEP) };
}
function cellCenter(ix: number, iy: number): [number, number] {
  return [X0 + (ix + 0.5) * STEP, Y0 + (iy + 0.5) * STEP];
}

/** Cells the band may not enter: stud holes, the sprocket notch, and hardware. */
function blockedCells(s: 1 | -1, upper: boolean) {
  const { nx, ny } = gridSize();
  const blocked = new Uint8Array(nx * ny);
  const studs = vcStuds(upper, s);
  const bvh = hardware(s);
  const frame = coverMatrix(s, upper);
  const world = new THREE.Vector3();
  const info = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 };
  const halfL = (CH_Z1 - CH_Z0 - 8) / 2;
  for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
    const [x, y] = cellCenter(ix, iy);
    if (studs.some((st) => (x - st.x) ** 2 + (y - st.y) ** 2 < 8.2 ** 2)) { blocked[iy * nx + ix] = 1; continue; }
    // Sprocket-end notch. The stud there comes through the end wall.
    if (upper && y > halfL - 20 && Math.abs(x) < 26) { blocked[iy * nx + ix] = 1; continue; }
    let near = false;
    for (const z of [-1.6, -0.8, -0.3, 0.45]) {
      world.set(x, y, z).applyMatrix4(frame);
      const h = bvh.closestPointToPoint(world, info, 0, CLEAR);
      if (h && h.distance <= CLEAR) { near = true; break; }
    }
    if (near) blocked[iy * nx + ix] = 1;
  }
  // A centre is walkable when the whole 6 mm band around it is clear.
  const walk = new Uint8Array(nx * ny);
  const rad = Math.ceil(HALF);
  for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
    let ok = true;
    for (let dy = -rad; dy <= rad && ok; dy++) for (let dx = -rad; dx <= rad; dx++) {
      if (dx * dx + dy * dy > HALF * HALF) continue;
      const jx = ix + dx, jy = iy + dy;
      if (jx < 0 || jy < 0 || jx >= nx || jy >= ny || blocked[jy * nx + jx]) { ok = false; break; }
    }
    if (ok) walk[iy * nx + ix] = 1;
  }
  return { walk, nx, ny };
}

function nearest(walk: Uint8Array, nx: number, ny: number, x: number, y: number): [number, number] | null {
  const ix0 = Math.round((x - X0) / STEP - 0.5);
  const iy0 = Math.round((y - Y0) / STEP - 0.5);
  for (let r = 0; r <= 36; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const ix = ix0 + dx, iy = iy0 + dy;
      if (ix < 0 || iy < 0 || ix >= nx || iy >= ny) continue;
      if (walk[iy * nx + ix]) return [ix, iy];
    }
  }
  return null;
}

function route(
  walk: Uint8Array, nx: number, ny: number,
  start: [number, number], goal: [number, number],
  bias: (x: number, y: number) => number,
): [number, number][] {
  const N = nx * ny;
  const sx = start[0], sy = start[1], gx = goal[0], gy = goal[1];
  const h = (ix: number, iy: number) => Math.abs(ix - gx) + Math.abs(iy - gy);
  const gScore = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const si = sy * nx + sx;
  const gi = gy * nx + gx;
  gScore[si] = 0;
  const heapF: number[] = [];
  const heapI: number[] = [];
  const push = (f: number, i: number) => {
    heapF.push(f); heapI.push(i);
    let n = heapF.length - 1;
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (heapF[p] <= heapF[n]) break;
      [heapF[p], heapF[n]] = [heapF[n], heapF[p]];
      [heapI[p], heapI[n]] = [heapI[n], heapI[p]];
      n = p;
    }
  };
  const pop = () => {
    const f = heapF[0], i = heapI[0];
    const lf = heapF.pop()!, li = heapI.pop()!;
    if (heapF.length) {
      heapF[0] = lf; heapI[0] = li;
      let n = 0;
      for (;;) {
        const l = n * 2 + 1, r = l + 1;
        let m = n;
        if (l < heapF.length && heapF[l] < heapF[m]) m = l;
        if (r < heapF.length && heapF[r] < heapF[m]) m = r;
        if (m === n) break;
        [heapF[n], heapF[m]] = [heapF[m], heapF[n]];
        [heapI[n], heapI[m]] = [heapI[m], heapI[n]];
        n = m;
      }
    }
    return { f, i };
  };
  push(h(sx, sy), si);
  const seen = new Uint8Array(N);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
  while (heapF.length) {
    const cur = pop();
    if (seen[cur.i]) continue;
    seen[cur.i] = 1;
    if (cur.i === gi) break;
    const ix = cur.i % nx, iy = (cur.i - ix) / nx;
    for (const [dx, dy] of dirs) {
      const jx = ix + dx, jy = iy + dy;
      if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) continue;
      const j = jy * nx + jx;
      if (!walk[j] || seen[j]) continue;
      const [x, y] = cellCenter(jx, jy);
      const ng = gScore[cur.i] + 1 + bias(x, y);
      if (ng < gScore[j]) { gScore[j] = ng; prev[j] = cur.i; push(ng + h(jx, jy), j); }
    }
  }
  if (prev[gi] < 0 && gi !== si) return [];
  const out: [number, number][] = [];
  let c = gi;
  for (;;) {
    const ix = c % nx, iy = (c - ix) / nx;
    out.push(cellCenter(ix, iy));
    if (c === si) break;
    c = prev[c];
    if (c < 0) return [];
  }
  out.reverse();
  return out;
}

function sealLoop(s: 1 | -1, upper: boolean): Loop {
  const key = `${s}:${upper ? 1 : 0}`;
  const hit = loopCache.get(key);
  if (hit) return hit;
  const { walk, nx, ny } = blockedCells(s, upper);
  // Windows occupy the middle of the sheet. The leg has to stay outboard of
  // them or the opening cuts the ring.
  const rail = upper ? 40 : 42;
  const keep = upper ? 34 : 36;
  const side = (sign: 1 | -1, y0: number, y1: number) => {
    const a = nearest(walk, nx, ny, sign * rail, y0);
    const b = nearest(walk, nx, ny, sign * rail, y1);
    if (!a || !b) return [];
    return route(walk, nx, ny, a, b, (x, y) => {
      let c = Math.abs(x - sign * rail) * 0.3;
      if (sign < 0 && x > -keep) c += 40;
      if (sign > 0 && x < keep) c += 40;
      if (Math.abs(y) > 184) c += 8;
      return c;
    });
  };
  const left = side(-1, -181, 181);
  const right = side(1, -181, 181);
  if (left.length < 20 || right.length < 20) throw new Error(`seal ring ${key} side path missing`);
  const end = (p: [number, number], q: [number, number], ySign: 1 | -1) => {
    const a = nearest(walk, nx, ny, p[0], p[1]);
    const b = nearest(walk, nx, ny, q[0], q[1]);
    if (!a || !b) return [];
    return route(walk, nx, ny, a, b, (x, y) => Math.abs(y - ySign * 181) * 0.35 + (Math.abs(x) > 46 ? 6 : 0));
  };
  const fly = end(left[0], right[0], -1);
  const pulley = end(left[left.length - 1], right[right.length - 1], 1);
  if (fly.length < 2 || pulley.length < 2) throw new Error(`seal ring ${key} end path missing`);
  const pts = [...left, ...pulley, ...right.slice().reverse(), ...fly.slice().reverse()];
  const on = new Uint8Array(nx * ny);
  const r2 = HALF * HALF;
  for (const [px, py] of pts) {
    const ix0 = Math.round((px - X0) / STEP - 0.5);
    const iy0 = Math.round((py - Y0) / STEP - 0.5);
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const ix = ix0 + dx, iy = iy0 + dy;
      if (ix < 0 || iy < 0 || ix >= nx || iy >= ny) continue;
      on[iy * nx + ix] = 1;
    }
  }
  const loop = { pts, on, nx, ny };
  loopCache.set(key, loop);
  return loop;
}

/** True when the band is one closed loop that keeps the origin inside. */
export function sealRingClosed(s: 1 | -1, upper: boolean) {
  const { on, nx, ny } = sealLoop(s, upper);
  const seen = new Uint8Array(on.length);
  const stack = [0];
  seen[0] = 1;
  while (stack.length) {
    const k = stack.pop()!;
    const ix = k % nx, iy = (k - ix) / nx;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const jx = ix + dx, jy = iy + dy;
      if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) continue;
      const j = jy * nx + jx;
      if (on[j] || seen[j]) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  const [cx, cy] = [Math.round((0 - X0) / STEP - 0.5), Math.round((0 - Y0) / STEP - 0.5)];
  const centre = cy * nx + cx;
  let cells = 0;
  for (const v of on) cells += v;
  return { closed: seen[centre] === 0, cells };
}

/** Paint the closed band onto a gasket mask. Cells are 1 where the ring runs. */
export function paintSealRing(
  s: 1 | -1, upper: boolean,
  mask: Uint8Array, nx: number, ny: number, x0: number, y0: number, step: number,
) {
  const { pts } = sealLoop(s, upper);
  const r2 = HALF * HALF;
  const reach = Math.ceil(HALF / step) + 1;
  for (const [px, py] of pts) {
    const ix0 = Math.round((px - x0) / step - 0.5);
    const iy0 = Math.round((py - y0) / step - 0.5);
    for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
      const ix = ix0 + dx, iy = iy0 + dy;
      if (ix < 0 || iy < 0 || ix >= nx || iy >= ny) continue;
      const x = x0 + (ix + 0.5) * step, y = y0 + (iy + 0.5) * step;
      if ((x - px) ** 2 + (y - py) ** 2 <= r2) mask[iy * nx + ix] = 1;
    }
  }
}

function bake(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const pos: number[] = [];
  const v = new THREE.Vector3();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld);
      pos.push(v.x, v.y, v.z);
    }
  });
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return new MeshBVH(geom);
}

/** 0.5 mm cells of the seal band, on the gasket flange grid. */
function bandMask(s: 1 | -1, upper: boolean) {
  const { pts } = sealLoop(s, upper);
  const step = 0.5;
  const x0 = -52.25, y0 = -190.25;
  const nx = Math.round(104.5 / step), ny = Math.round(380.5 / step);
  const on = new Uint8Array(nx * ny);
  const r2 = HALF * HALF;
  const reach = Math.ceil(HALF / step) + 1;
  for (const [px, py] of pts) {
    const ix0 = Math.round((px - x0) / step - 0.5);
    const iy0 = Math.round((py - y0) / step - 0.5);
    for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
      const ix = ix0 + dx, iy = iy0 + dy;
      if (ix < 0 || iy < 0 || ix >= nx || iy >= ny) continue;
      const x = x0 + (ix + 0.5) * step, y = y0 + (iy + 0.5) * step;
      if ((x - px) ** 2 + (y - py) ** 2 <= r2) on[iy * nx + ix] = 1;
    }
  }
  return { on, nx, ny, x0, y0, step };
}

/**
 * The housing face under the band has to be the first thing a clamp ray sees,
 * and not so close that the ray discards it. A skin on the gasket plane is
 * shaved off; where that leaves nothing in range, the land at local z −0.55
 * is added. The cut stays in the band so the bay walls under the sheet remain.
 */
export function sealHousingPatch(
  root: THREE.Object3D, frame: THREE.Matrix4, s: 1 | -1, upper: boolean,
): THREE.BufferGeometry | null {
  const { on, nx, ny, x0, y0, step } = bandMask(s, upper);
  const dir = new THREE.Vector3().setFromMatrixColumn(frame, 2).normalize().negate();
  const world = new THREE.Vector3();
  const classify = (bvh: MeshBVH) => {
    const close = new Uint8Array(on.length);
    const missing = new Uint8Array(on.length);
    for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
      if (!on[iy * nx + ix]) continue;
      const x = x0 + (ix + 0.5) * step, y = y0 + (iy + 0.5) * step;
      world.set(x, y, -0.25).applyMatrix4(frame);
      const hit = bvh.raycastFirst(new THREE.Ray(world.clone(), dir.clone()), THREE.DoubleSide) as { distance: number } | null;
      if (hit && hit.distance < 0.12) close[iy * nx + ix] = 1;
      else if (!hit || hit.distance > 40) missing[iy * nx + ix] = 1;
    }
    return { close, missing };
  };
  let found = classify(bake(root));
  let nClose = 0;
  for (let i = 0; i < found.close.length; i++) nClose += found.close[i];
  if (nClose >= 4) {
    const cutter = voxelSheet(found.close, nx, ny, x0, y0, step, -0.5, 0.2);
    cutter.applyMatrix4(frame);
    cutClosed(root, cutter);
    found = classify(bake(root));
  }
  const need = found.missing.slice();
  for (let i = 0; i < found.close.length; i++) if (found.close[i]) need[i] = 1;
  let nNeed = 0;
  for (let i = 0; i < need.length; i++) nNeed += need[i];
  if (nNeed < 4) return null;
  const grown = need.slice();
  for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
    if (!need[iy * nx + ix]) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const jx = ix + dx, jy = iy + dy;
      if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) continue;
      if (on[jy * nx + jx]) grown[jy * nx + jx] = 1;
    }
  }
  return voxelSheet(grown, nx, ny, x0, y0, step, -1.85, -0.55);
}

/**
 * Cover-local solid for the part of the seal band that does not already have
 * a face. `coverSide` builds the lip (z 0..0.7); the housing land is the
 * matching face just under the gasket.
 */
export function sealPatchGeometry(
  root: THREE.Object3D, frame: THREE.Matrix4,
  s: 1 | -1, upper: boolean, coverSide: boolean,
): THREE.BufferGeometry | null {
  const { pts } = sealLoop(s, upper);
  // Same 0.5 mm cells the gasket paints, so the new face covers the whole band.
  const step = 0.5;
  const x0 = -52.25, y0 = -190.25;
  const nx = Math.round(104.5 / step), ny = Math.round(380.5 / step);
  const on = new Uint8Array(nx * ny);
  const r2 = HALF * HALF;
  const reach = Math.ceil(HALF / step) + 1;
  for (const [px, py] of pts) {
    const ix0 = Math.round((px - x0) / step - 0.5);
    const iy0 = Math.round((py - y0) / step - 0.5);
    for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
      const ix = ix0 + dx, iy = iy0 + dy;
      if (ix < 0 || iy < 0 || ix >= nx || iy >= ny) continue;
      const x = x0 + (ix + 0.5) * step, y = y0 + (iy + 0.5) * step;
      if ((x - px) ** 2 + (y - py) ** 2 <= r2) on[iy * nx + ix] = 1;
    }
  }
  // Lower window frames sit outboard of the lip. Give them a cover face too,
  // or the frame metal is not clamped and the openings run together.
  if (coverSide && !upper) {
    const wins = s > 0 ? [[-8, -154], [-8, -76], [-8, 42]] : [[-6, -148], [-8, -30], [-2, 88]];
    const mark = (xa: number, ya: number, xb: number, yb: number) => {
      const ix0 = Math.max(0, Math.floor((Math.min(xa, xb) - x0) / step));
      const ix1 = Math.min(nx, Math.ceil((Math.max(xa, xb) - x0) / step));
      const iy0 = Math.max(0, Math.floor((Math.min(ya, yb) - y0) / step));
      const iy1 = Math.min(ny, Math.ceil((Math.max(ya, yb) - y0) / step));
      for (let iy = iy0; iy < iy1; iy++) for (let ix = ix0; ix < ix1; ix++) {
        // The head-side wall occupies x −36..−30 and rises through the cover.
        // Keep the bar outboard of that wall. A face on the cam-side bar lands
        // inside the housing wall that is already there.
        const x = x0 + (ix + 0.5) * step;
        if (x < -36) on[iy * nx + ix] = 1;
      }
    };
    for (const [cx, cy] of wins) {
      const x0w = cx - 30, x1w = cx + 30, y0w = cy - 14, y1w = cy + 14;
      const ix0w = cx - 27, ix1w = cx + 27, iy0w = cy - 11, iy1w = cy + 11;
      mark(x0w, y0w, x1w, iy0w);
      mark(x0w, iy1w, x1w, y1w);
      mark(x0w, iy0w, ix0w, iy1w);
      mark(ix1w, iy0w, x1w, iy1w);
    }
  }
  const bvh = bake(root);
  const normal = new THREE.Vector3().setFromMatrixColumn(frame, 2).normalize();
  const dir = coverSide ? normal : normal.clone().negate();
  const limit = coverSide ? 1.2 : 2.2;
  const add = new Uint8Array(on.length);
  const world = new THREE.Vector3();
  for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
    if (!on[iy * nx + ix]) continue;
    const x = x0 + (ix + 0.5) * step, y = y0 + (iy + 0.5) * step;
    world.set(x, y, -0.25).applyMatrix4(frame);
    const hit = bvh.raycastFirst(new THREE.Ray(world, dir), THREE.DoubleSide) as { distance: number } | null;
    if (!(hit && hit.distance > 0.05 && hit.distance <= limit)) add[iy * nx + ix] = 1;
  }
  // Weld one cell into the face that is already there, so the lip stays one piece.
  const grown = add.slice();
  for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
    if (!add[iy * nx + ix]) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const jx = ix + dx, jy = iy + dy;
      if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) continue;
      if (on[jy * nx + jx]) grown[jy * nx + jx] = 1;
    }
  }
  let n = 0;
  for (let i = 0; i < grown.length; i++) if (grown[i]) n++;
  if (n < 4) return null;
  const z0 = coverSide ? 0 : -1.85;
  const z1 = coverSide ? 0.7 : -0.55;
  return voxelSheet(grown, nx, ny, x0, y0, step, z0, z1);
}

function voxelSheet(on: Uint8Array, nx: number, ny: number, x0: number, y0: number, step: number, z0: number, z1: number) {
  const live = (ix: number, iy: number) => ix >= 0 && iy >= 0 && ix < nx && iy < ny && on[iy * nx + ix] === 1;
  const verts = new Map<string, number>();
  const pos: number[] = [];
  const idx: number[] = [];
  const vid = (ix: number, iy: number, z: number) => {
    const k = `${ix},${iy},${z}`;
    let id = verts.get(k);
    if (id === undefined) {
      id = pos.length / 3;
      pos.push(x0 + ix * step, y0 + iy * step, z ? z1 : z0);
      verts.set(k, id);
    }
    return id;
  };
  const quad = (a: number, b: number, c: number, d: number) => { idx.push(a, b, c, a, c, d); };
  for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
    if (!live(ix, iy)) continue;
    quad(vid(ix, iy, 1), vid(ix + 1, iy, 1), vid(ix + 1, iy + 1, 1), vid(ix, iy + 1, 1));
    quad(vid(ix, iy, 0), vid(ix, iy + 1, 0), vid(ix + 1, iy + 1, 0), vid(ix + 1, iy, 0));
    if (!live(ix + 1, iy)) quad(vid(ix + 1, iy, 1), vid(ix + 1, iy, 0), vid(ix + 1, iy + 1, 0), vid(ix + 1, iy + 1, 1));
    if (!live(ix - 1, iy)) quad(vid(ix, iy, 1), vid(ix, iy + 1, 1), vid(ix, iy + 1, 0), vid(ix, iy, 0));
    if (!live(ix, iy + 1)) quad(vid(ix, iy + 1, 1), vid(ix + 1, iy + 1, 1), vid(ix + 1, iy + 1, 0), vid(ix, iy + 1, 0));
    if (!live(ix, iy - 1)) quad(vid(ix, iy, 1), vid(ix, iy, 0), vid(ix + 1, iy, 0), vid(ix + 1, iy, 1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
