/**
 * Teardown step 14 (chain covers off): the cam nut is still on, the chain is seated on the
 * cam sprocket, the idler bush has its shaft, and the timing-cover gasket fills the flange joint.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { CAM_X } from '../src/data/layout';
import {
  CAM_NOSE, CAM_SPROCKET_R, CAM_T, CHAIN_LID, CHAIN_Z, HOUSING_Z1, PITCH, SPROCKET_GAP,
  camSprocket, chainCoverBolts, chainOutline, chainPath, chainPins, chainTensioner, tensionerLayout, toothPhase,
} from '../src/geo/core';
import { DIM, fastenerGroup, fastenerSets, springT } from '../src/geo/fasteners';
import { frame } from '../src/geo/instancing';
import { LID_STUD_HOLE_R, chainLidGasket } from '../src/geo/smallParts';
import { camshaft } from '../src/geo/valvetrain';
import { removedAfter, stepIndexOf } from '../src/data/teardown';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function bake(root: THREE.Object3D, extra?: THREE.Matrix4): THREE.BufferGeometry {
  root.updateMatrixWorld(true);
  const out: number[] = [];
  const v = new THREE.Vector3();
  root.traverse((o) => {
    const mesh = o as THREE.InstancedMesh;
    if (!mesh.isMesh) return;
    // Indexed meshes share vertices; a BVH needs the expanded triangle soup.
    const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    const P = g.getAttribute('position');
    const mats: THREE.Matrix4[] = mesh.isInstancedMesh
      ? Array.from({ length: mesh.count }, (_, i) => { const m = new THREE.Matrix4(); mesh.getMatrixAt(i, m); return m.premultiply(mesh.matrixWorld); })
      : [mesh.matrixWorld];
    for (const m of mats) {
      const w = extra ? extra.clone().multiply(m) : m;
      for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(w); out.push(v.x, v.y, v.z); }
    }
  });
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  return geom;
}

function bvh(root: THREE.Object3D) {
  return new MeshBVH(bake(root));
}

function inside(pts: [number, number][], x: number, y: number) {
  let w = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if ((a[1] > y) === (b[1] > y)) continue;
    const xh = a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]);
    if (xh >= x) w += b[1] > a[1] ? 1 : -1;
  }
  return w !== 0;
}

function distToPoly(pts: [number, number][], x: number, y: number) {
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
    let t = ((x - a[0]) * dx + (y - a[1]) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(x - (a[0] + dx * t), y - (a[1] + dy * t)));
  }
  return best;
}

describe('step 14, cam nut still seated', () => {
  it('keeps the nut, washer, sprocket and flange on through step 14, nut off first', () => {
    for (const b of ['right', 'left']) {
      for (let n = 0; n <= 14; n++) {
        expect(removedAfter(n).has(`cam-nut-${b}`), `${b} step ${n}`).toBe(false);
        expect(removedAfter(n).has(`cam-sprocket-${b}`)).toBe(false);
        expect(removedAfter(n).has(`cam-flange-${b}`)).toBe(false);
        expect(removedAfter(n).has(`camshaft-${b}`)).toBe(false);
        expect(removedAfter(n).has(`timing-chain-${b}`)).toBe(false);
      }
      expect(stepIndexOf(`cam-nut-${b}`)).toBeLessThan(stepIndexOf(`cam-sprocket-${b}`));
      expect(stepIndexOf(`cam-sprocket-${b}`)).toBeLessThan(stepIndexOf(`cam-flange-${b}`));
    }
  });

  it.each([[1, 'right'], [-1, 'left']] as Array<[1 | -1, string]>)('nut and washer are visible on the sprocket hub, coaxial with the cam, %s', (s, b) => {
    const X = CAM_X * s, zc = CHAIN_Z[s], face = zc + CAM_NOSE.hubFace;
    const nut = fastenerSets().find((f) => f.id === `cam-nut-${b}`)!;
    const nutGeom = bake(fastenerGroup(nut));
    const P = nutGeom.getAttribute('position');
    const sprocket = bvh(camSprocket(s));
    const nose = bvh(camshaft(s));
    const nutB = new MeshBVH(nutGeom);
    const down = V(0, 0, -1);
    const hitZ = (geom: MeshBVH, o: THREE.Vector3) => {
      const h = geom.raycastFirst(new THREE.Ray(o, down), THREE.DoubleSide) as { point: THREE.Vector3; distance: number } | null;
      return h;
    };
    // Hub face is an annulus (r ≈ 11.2–16). Sample off the 32-gon seams, which lie on the axes.
    const seatA = 0.35;
    const seat = hitZ(sprocket, V(X + Math.cos(seatA) * 14, Math.sin(seatA) * 14, face + 8));
    expect(seat, 'hub face').not.toBeNull();
    expect(Math.abs(seat!.point.z - face)).toBeLessThan(0.15);
    let washer = 0, hex = 0;
    const v = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i);
      expect(Math.hypot(v.x - X, v.y), 'coaxial with the cam').toBeLessThan(DIM[22].af / 2 + 4);
      if (Math.abs(v.z - face) < 0.2 && Math.hypot(v.x - X, v.y) > 12) washer++;
      if (v.z > face + springT(nut) + 1) hex++;
    }
    expect(washer, 'spring washer on the hub face').toBeGreaterThan(8);
    expect(hex, 'hex nut above the washer').toBeGreaterThan(8);
    // Washer gap is the lathe split at phi 0. itemMatrix (+Y → +Z about +X) puts that gap on world −Y.
    // A ray just off the hex vertex, still inside the gap, hits the hex top rather than the washer.
    const gap = 0.08, hexR = 14;
    const onHex = hitZ(nutB, V(X + Math.sin(gap) * hexR, -Math.cos(gap) * hexR, zc + 50));
    const behindHex = hitZ(sprocket, V(X + Math.sin(gap) * hexR, -Math.cos(gap) * hexR, zc + 50));
    expect(onHex, 'hex from the cover side').not.toBeNull();
    expect(onHex!.point.z).toBeGreaterThan(face + springT(nut) + 1);
    expect(onHex!.distance).toBeLessThan(behindHex?.distance ?? Infinity);
    // Open bore: the nut is missed and the cam nose shows through.
    const throughBore = hitZ(nutB, V(X, 0, zc + 50));
    const noseHit = hitZ(nose, V(X, 0, zc + 50));
    expect(throughBore).toBeNull();
    expect(noseHit, 'cam nose through the nut').not.toBeNull();
    expect(noseHit!.distance).toBeLessThan(40);
    // Washer rim stands outside the flats (AF/2 = 16, washer r = 19.2), on the outboard side.
    const rim = 17.5;
    const oW = V(X + s * rim, 0.8, zc + 50);
    const washerHit = hitZ(nutB, oW);
    const sprocketPastWasher = hitZ(sprocket, oW);
    expect(washerHit, 'spring washer rim').not.toBeNull();
    expect(washerHit!.point.z).toBeLessThan(face + springT(nut) + 0.3);
    expect(washerHit!.distance).toBeLessThan(sprocketPastWasher?.distance ?? Infinity);
  });
});

describe('cam-sprocket chain wrap', () => {
  it.each([[1, 'right'], [-1, 'left']] as Array<[1 | -1, string]>)('rollers sit on the pitch circle across the wrap, %s', (s) => {
    const { pins } = chainPins(s);
    const path = chainPath(s);
    const cam = path.arcs.find((a) => a.circ.sg > 0 && Math.abs(a.circ.c.x - CAM_X * s) < 1)!;
    const dir = Math.sign(cam.a1 - cam.a0) || 1;
    const span = Math.abs(cam.a1 - cam.a0);
    const wrap = pins.filter((q) => {
      let rel = Math.atan2(q.y - cam.circ.c.y, q.x - cam.circ.c.x) - cam.a0;
      while (rel * dir < -1e-4) rel += dir * Math.PI * 2;
      return rel * dir >= -1e-3 && rel * dir <= span + 1e-3;
    });
    expect(wrap.length).toBeGreaterThan(8);
    for (const q of wrap) expect(Math.abs(Math.hypot(q.x - CAM_X * s, q.y) - CAM_SPROCKET_R)).toBeLessThan(0.3);
    // Chords stay on the pitch. The short idler run is the longest miss, still under half a millimetre.
    let worst = 0;
    for (let i = 0; i < pins.length; i++) {
      const a = pins[i], b = pins[(i + 1) % pins.length];
      worst = Math.max(worst, Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - PITCH));
    }
    expect(worst).toBeLessThan(0.5);
    // Gap centres of sprocketRingShape, using the same phase the sprocket is built with.
    const phase = toothPhase(s, CAM_X * s, 0, CAM_SPROCKET_R, CAM_T);
    const step = (Math.PI * 2) / CAM_T;
    for (const q of wrap) {
      const ang = Math.atan2(q.y, q.x - CAM_X * s);
      let best = Infinity;
      for (let k = 0; k < CAM_T; k++) {
        let d = ang - (phase + (k + SPROCKET_GAP) * step);
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        best = Math.min(best, Math.abs(d));
      }
      expect(best * CAM_SPROCKET_R).toBeLessThan(0.15);
    }
  });
});

describe('idler sprocket shaft', () => {
  it.each([[1, 'right'], [-1, 'left']] as Array<[1 | -1, string]>)('a shaft runs through the bronze bush into the arm, %s', (s) => {
    const T = tensionerLayout(s);
    const root = chainTensioner(s);
    root.updateMatrixWorld(true);
    const bush: number[] = [], axis: number[] = [], head: number[] = [];
    const v = new THREE.Vector3();
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const P = mesh.geometry.getAttribute('position');
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(mesh.matrixWorld);
        const rho = Math.hypot(v.x - T.idler.x, v.y - T.idler.y);
        if (rho > 6.05 && rho < 8.6 && Math.abs(v.z - T.z) < 7) bush.push(v.z);
        if (rho < 0.4) axis.push(v.z);
        if (rho > 6.2 && rho < 8.3 && v.z > T.z + 6.6) head.push(v.z);
      }
    });
    expect(bush.length).toBeGreaterThan(10);
    const b0 = Math.min(...bush), b1 = Math.max(...bush);
    expect(Math.min(...axis)).toBeLessThan(b0 - 2);
    expect(Math.max(...axis)).toBeGreaterThan(b1 - 0.3);
    expect(head.length, 'bolt head on the cover side of the bush').toBeGreaterThan(4);
  });
});

describe('timing cover gasket', () => {
  it.each([[1, 'right'], [-1, 'left']] as Array<[1 | -1, string]>)('sits on the flange, under the cover, holes on the studs, %s', (s) => {
    const m = frame(V(0, 0, HOUSING_Z1), V(0, 0, 1), V(1, 0, 0));
    const geom = bake(chainLidGasket(s).g, m);
    const P = geom.getAttribute('position');
    const outer = chainOutline(s, 3);
    const v = new THREE.Vector3();
    let z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i);
      z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z);
      const ok = inside(outer, v.x, v.y) || distToPoly(outer, v.x, v.y) < 0.25;
      expect(ok, `vertex outside the flange at ${v.x.toFixed(1)},${v.y.toFixed(1)}`).toBe(true);
    }
    expect(Math.abs(z0 - HOUSING_Z1)).toBeLessThan(0.1);
    expect(Math.abs(z1 - CHAIN_LID.z0)).toBeLessThan(0.1);
    // Opening stays open: the cam centre is not filled.
    expect(inside(outer, CAM_X * s, 0)).toBe(true);
    let filled = false;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i);
      if (Math.hypot(v.x - CAM_X * s, v.y) < 20) filled = true;
    }
    expect(filled).toBe(false);
    for (const q of chainCoverBolts(s)) {
      let near = 0, closest = Infinity;
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i);
        const d = Math.hypot(v.x - q.x, v.y - q.y);
        closest = Math.min(closest, d);
        if (Math.abs(d - LID_STUD_HOLE_R) < 0.45) near++;
      }
      expect(closest, `stud hole filled at ${q.x.toFixed(1)},${q.y.toFixed(1)}`).toBeGreaterThan(LID_STUD_HOLE_R - 0.35);
      expect(near, `no hole wall at ${q.x.toFixed(1)},${q.y.toFixed(1)}`).toBeGreaterThan(3);
    }
  });
});
