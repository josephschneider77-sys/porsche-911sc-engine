import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CAM_X, INT_SHAFT_Y } from '../src/data/layout';
import {
  basePath, chainPath, chainPins, tensionerLayout, ADJ, CAM_NOSE, CAM_SPROCKET_R, INT_SPROCKET_R,
  SPROCKET_HOLES, FLANGE_NOTCHES, VERNIER, CHAIN_Z, guideRails, railInner, chainTensioner,
  CRANK_GEAR_T, INT_GEAR, INT_T, CAM_T, IDLER_T, crankGears, intermediateShaft, MESH_DZ,
} from '../src/geo/core';
import { caseLugY } from '../src/geo/hwLayout';
import { clearance } from './collide';
import { rayHit } from './hw';

describe('cam drive ratio', () => {
  it('is exactly 2:1 from crank to cam, on the existing 84 mm gear centres', () => {
    expect((CRANK_GEAR_T / INT_GEAR.teeth) * (INT_T / CAM_T)).toBeCloseTo(0.5, 8);
    expect(((CRANK_GEAR_T + INT_GEAR.teeth) * INT_GEAR.module) / 2).toBeCloseTo(84, 6);
    expect(CAM_T).toBe(28);
    expect(INT_T).toBe(24);
    expect(IDLER_T).toBe(19);
    expect(CRANK_GEAR_T).toBe(35);
    expect(INT_GEAR.teeth).toBe(60);
  });
  it('keeps all 60 intermediate teeth clear of the lowered z 190 stud', () => {
    const root = intermediateShaft();
    root.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    const mod = INT_GEAR.module;
    const pr = (INT_GEAR.teeth * mod) / 2;
    const rTip = pr + 1.6 * (mod / 2);
    const ySeat = caseLugY(190, false);
    expect(rTip).toBeCloseTo(54.467, 3);
    // 14 face bands across z 192–204.7. Unwind the helix at each slice so a tooth
    // stays in one bin. Tip vertices sit at fraction 0.35 of the pitch.
    const nBands = 14;
    const toothZ0 = 192, toothZ1 = 204.7;
    const bandDz = (toothZ1 - toothZ0) / nBands;
    const pitch = (2 * Math.PI) / INT_GEAR.teeth;
    const rate = -Math.tan((30 * Math.PI) / 180) / pr;
    const meshPhase = Math.PI / INT_GEAR.teeth - 0.055;
    const zRef = 192 + 12.7 / 2;
    const maxR = Array.from({ length: nBands }, () => new Float64Array(INT_GEAR.teeth));
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const P = mesh.geometry.getAttribute('position');
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(mesh.matrixWorld);
        const rad = Math.hypot(v.x, v.y - INT_SHAFT_Y);
        const offStud = Math.hypot(v.y - ySeat, v.z - 190);
        // Stud r 3.84 through the lug, and the lock-nut washer (r 8) on the left seat.
        if (v.x > -40 && v.x < 40) expect(offStud, 'stud').toBeGreaterThan(3.84 + 1);
        if (v.x < -16 && v.x > -32) expect(offStud, 'lock-nut washer').toBeGreaterThan(8 + 1);
        if (rad >= rTip - 0.55) {
          expect(v.z).toBeGreaterThan(191.4);
          if (v.z > 204.95) {
            const inCrankBore = Math.hypot(v.x, v.y) < 37.6;
            const inShaftBore = Math.hypot(v.x, v.y - INT_SHAFT_Y) < 17.6;
            expect(inCrankBore || inShaftBore, `tip in the bulkhead wall z ${v.z.toFixed(2)}`).toBe(true);
          }
        }
        if (v.z < toothZ0 - 1e-3 || v.z > toothZ1 + 1e-3) continue;
        let band = Math.floor((v.z - toothZ0) / bandDz);
        if (band < 0) band = 0;
        if (band >= nBands) band = nBands - 1;
        let slice = Math.floor((v.z - toothZ0) / MESH_DZ);
        if (slice < 0) slice = 0;
        if (slice > 63) slice = 63;
        const sz0 = toothZ0 + slice * MESH_DZ;
        const sz1 = Math.min(toothZ1, sz0 + MESH_DZ);
        const ang = meshPhase + rate * ((sz0 + sz1) / 2 - zRef);
        let u = Math.atan2(v.y - INT_SHAFT_Y, v.x) - ang;
        u = u / pitch - 0.35;
        let tooth = Math.round(u);
        tooth = ((tooth % 60) + 60) % 60;
        if (rad > maxR[band][tooth]) maxR[band][tooth] = rad;
      }
    });
    const short = new Set<number>();
    for (let b = 0; b < nBands; b++) {
      for (let t = 0; t < INT_GEAR.teeth; t++) {
        if (maxR[b][t] < rTip - 0.3) short.add(t);
      }
    }
    expect(short.size, 'bottom teeth whole').toBe(0);
  });
  it('clears the perimeter lock nuts by more than 1 mm', () => {
    expect(clearance('case-perimeter-nuts', 'intermediate-shaft')).toBeGreaterThan(1);
  });
  it('crank and intermediate gear sections do not overlap across the face', () => {
    const crank = crankGears();
    const mid = intermediateShaft();
    const segsAt = (root: THREE.Object3D, z: number) => {
      root.updateMatrixWorld(true);
      const segs: Array<[[number, number], [number, number]]> = [];
      const v = new THREE.Vector3();
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const g = mesh.geometry;
        const P = g.getAttribute('position');
        const idx = g.index;
        const at = (i: number) => v.clone().fromBufferAttribute(P, i).applyMatrix4(mesh.matrixWorld);
        const nTri = idx ? idx.count / 3 : P.count / 3;
        for (let t = 0; t < nTri; t++) {
          const tri = [0, 1, 2].map((k) => at(idx ? idx.getX(t * 3 + k) : t * 3 + k));
          const hits: [number, number][] = [];
          for (let k = 0; k < 3; k++) {
            const A = tri[k], B = tri[(k + 1) % 3];
            const sa = A.z - z, sb = B.z - z;
            if (sa === 0 && sb === 0) continue;
            if (Math.abs(sa) <= 1e-8) hits.push([A.x, A.y]);
            else if (sa * sb < 0) {
              const u = sa / (sa - sb);
              hits.push([A.x + (B.x - A.x) * u, A.y + (B.y - A.y) * u]);
            }
          }
          if (hits.length >= 2 && Math.hypot(hits[0][0] - hits[1][0], hits[0][1] - hits[1][1]) > 1e-4) segs.push([hits[0], hits[1]]);
        }
      });
      return segs;
    };
    const crossings = (segs: Array<[[number, number], [number, number]]>, y: number) => {
      const xs: { x: number; dir: number }[] = [];
      for (const [a, b] of segs) {
        if ((a[1] > y) === (b[1] > y)) continue;
        const u = (y - a[1]) / (b[1] - a[1]);
        xs.push({ x: a[0] + (b[0] - a[0]) * u, dir: b[1] > a[1] ? 1 : -1 });
      }
      xs.sort((p, q) => p.x - q.x);
      return xs;
    };
    // Winding, not paired crossings: a duplicated edge stays inside instead of flipping the parity.
    const spansOf = (xs: { x: number; dir: number }[]) => {
      let w = 0, open = 0;
      const spans: [number, number][] = [];
      for (const c of xs) {
        const prev = w;
        w += c.dir;
        if (prev === 0 && w !== 0) open = c.x;
        if (prev !== 0 && w === 0) spans.push([open, c.x]);
      }
      return { spans, open: w !== 0 };
    };
    const overlapLen = (a: [number, number][], b: [number, number][]) => {
      let s = 0;
      for (const [a0, a1] of a) for (const [b0, b1] of b) {
        const lo = Math.max(a0, b0), hi = Math.min(a1, b1);
        if (hi > lo) s += hi - lo;
      }
      return s;
    };
    // Whole tooth face, including the slice seams. 0.04 mm in z and in y; x is the exact crossing.
    let worst = 0, worstAt = '', samples = 0, crankLen = 0, intLen = 0, odds = 0, lines = 0;
    const oddNote: string[] = [];
    for (let z = 192.02; z < 204.68; z += 0.04) {
      const q = Math.abs(z - (192 + Math.round((z - 192) / MESH_DZ) * MESH_DZ)) < 1e-4 ? z + 0.01 : z;
      const a = segsAt(crank, q), b = segsAt(mid, q);
      samples++;
      for (let y = -40; y <= -22; y += 0.04) {
        const yy = y + 1e-6;
        const ca = spansOf(crossings(a, yy)), cb = spansOf(crossings(b, yy));
        lines++;
        if (ca.open || cb.open) {
          odds++;
          if (oddNote.length < 8) oddNote.push(`z ${q.toFixed(3)} y ${yy.toFixed(3)}`);
          continue;
        }
        for (const [x0, x1] of ca.spans) crankLen += x1 - x0;
        for (const [x0, x1] of cb.spans) intLen += x1 - x0;
        const len = overlapLen(ca.spans, cb.spans);
        if (len > worst) { worst = len; worstAt = `z ${q.toFixed(3)} y ${y.toFixed(2)}`; }
      }
    }
    expect(samples).toBeGreaterThan(200);
    expect(odds, `odd crossings on ${odds}/${lines} scanlines: ${oddNote.join('; ')}`).toBe(0);
    expect(crankLen, 'crank section').toBeGreaterThan(1000);
    expect(intLen, 'intermediate section').toBeGreaterThan(1000);
    expect(worst, `flank overlap ${worstAt}`).toBeLessThan(1e-4);
  }, 120000);
});

describe.each([[1, 'right'], [-1, 'left']] as Array<[1 | -1, string]>)('chain tensioner, %s bank', (s, b) => {
  const B = basePath(s), P = chainPath(s), T = tensionerLayout(s), { pins } = chainPins(s);
  const inward = B.nLo.clone().negate();
  const dLine = (q: { x: number; y: number }) => new THREE.Vector2(q.x - B.lo1.x, q.y - B.lo1.y).dot(inward); // >0 = pushed into the loop
  it('idler sits under the slack (lower) run and is wrapped from outside the loop', () => {
    expect(P.idlerArc.circ.sg).toBe(-1); // chain passes over it (clockwise arc in a CCW loop)
    // its pitch circle reaches past the straight run into the loop: it pushes the chain, not just touches it
    expect(dLine(T.idler) + T.idlerR).toBeGreaterThan(10);
    // centre below the deflected chain
    expect(dLine(T.idler)).toBeLessThan(Math.max(...P.pts.filter((q) => Math.abs(q.x - T.idler.x) < T.idlerR && dLine(q) < 60).map(dLine)) - T.idlerR + 0.5);
    // and on the slack run, not the tight (upper) one
    const dUp = new THREE.Vector2(T.idler.x - B.up1.x, T.idler.y - B.up1.y).dot(B.nUp);
    expect(dUp).toBeLessThan(-40);
  });
  it('idler deflects the slack run >= 10 mm and the chain wraps it >= 25 deg', () => {
    // pitch line around the idler station vs the straight two-sprocket run
    const near = P.pts.filter((q) => Math.abs(q.x - T.idler.x) < T.idlerR && dLine(q) < 60);
    const defl = Math.max(...near.map(dLine));
    expect(defl).toBeGreaterThanOrEqual(10);
    expect((P.idlerWrap * 180) / Math.PI).toBeGreaterThanOrEqual(25);
  });
  it('chain rollers sit on the idler pitch circle (real engagement, not floating)', () => {
    const on = pins.filter((q) => Math.abs(Math.hypot(q.x - T.idler.x, q.y - T.idler.y) - T.idlerR) < 0.3);
    expect(on.length).toBeGreaterThanOrEqual(2);
    // and no roller cuts into the idler
    for (const q of pins) expect(Math.hypot(q.x - T.idler.x, q.y - T.idler.y)).toBeGreaterThan(T.idlerR - 0.3);
  });
  it('plunger dome bears on the arm tail pad (contact <= 0.5 mm), plunger extended', () => {
    expect(Math.abs(T.contact.distanceTo(T.tail) - ADJ.pad)).toBeLessThanOrEqual(0.5);
    expect(T.adjBase.distanceTo(T.contact)).toBeCloseTo(T.reach, 6);
    expect(T.plunger).toBeGreaterThan(2);
  });
  it('chain rollers sit on the cam and intermediate pitch circles', () => {
    const onCam = pins.filter((q) => Math.abs(Math.hypot(q.x - CAM_X * s, q.y) - CAM_SPROCKET_R) < 0.35);
    const onInt = pins.filter((q) => Math.abs(Math.hypot(q.x, q.y - INT_SHAFT_Y) - INT_SPROCKET_R) < 0.35);
    expect(onCam.length).toBeGreaterThanOrEqual(4);
    expect(onInt.length).toBeGreaterThanOrEqual(3);
    for (const q of pins) {
      expect(Math.hypot(q.x - CAM_X * s, q.y)).toBeGreaterThan(CAM_SPROCKET_R - 0.35);
      expect(Math.hypot(q.x, q.y - INT_SHAFT_Y)).toBeGreaterThan(INT_SPROCKET_R - 0.35);
    }
  });
  it('cam sprocket has 17 open vernier holes and a land between them', () => {
    const X = CAM_X * s, z = CHAIN_Z[s] + 30;
    const at = (a: number, rad: number) => new THREE.Vector3(X + rad * Math.cos(a) * s, rad * Math.sin(a), z);
    const down = new THREE.Vector3(0, 0, -1);
    for (let i = 0; i < SPROCKET_HOLES; i++) {
      const a = CAM_NOSE.pin.a + (i * 2 * Math.PI) / SPROCKET_HOLES;
      expect(rayHit(`cam-sprocket-${b}`, at(a, CAM_NOSE.pin.rad), down, 60), `hole ${i}`).toBeNull();
    }
    const mid = CAM_NOSE.pin.a + Math.PI / SPROCKET_HOLES;
    expect(rayHit(`cam-sprocket-${b}`, at(mid, CAM_NOSE.pin.rad), down, 60)).not.toBeNull();
  });
  it('flange rim is scalloped: open at the dowel, solid halfway to the next notch', () => {
    const X = CAM_X * s, z = CHAIN_Z[s] + 30;
    const down = new THREE.Vector3(0, 0, -1);
    const notchR = CAM_NOSE.pin.rad - VERNIER.notchR * 0.45;
    const open = new THREE.Vector3(X + notchR * Math.cos(CAM_NOSE.pin.a) * s, notchR * Math.sin(CAM_NOSE.pin.a), z);
    expect(rayHit(`cam-flange-${b}`, open, down, 60)).toBeNull();
    const landA = CAM_NOSE.pin.a + Math.PI / FLANGE_NOTCHES;
    const land = new THREE.Vector3(X + (CAM_NOSE.pin.rad - 0.6) * Math.cos(landA) * s, (CAM_NOSE.pin.rad - 0.6) * Math.sin(landA), z);
    expect(rayHit(`cam-flange-${b}`, land, down, 60)).not.toBeNull();
  });
  it('flange bore is open along the cam axis', () => {
    const X = CAM_X * s, z = CHAIN_Z[s] + 30;
    const down = new THREE.Vector3(0, 0, -1);
    for (const r of [3, 8]) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const o = new THREE.Vector3(X + r * Math.cos(a), r * Math.sin(a), z);
        expect(rayHit(`cam-flange-${b}`, o, down, 60), `r ${r} a ${i}`).toBeNull();
      }
    }
  });
  it('flange lands are wider than the scallops', () => {
    const X = CAM_X * s, z = CHAIN_Z[s] + 30;
    const down = new THREE.Vector3(0, 0, -1);
    let solid = 0;
    const rad = 23.4;
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const o = new THREE.Vector3(X + rad * Math.cos(a), rad * Math.sin(a), z);
      if (rayHit(`cam-flange-${b}`, o, down, 60)) solid++;
    }
    expect(solid).toBeGreaterThan(18);
  });
  it('tensioner meshes stay by the chain housing and each is one piece', () => {
    const root = chainTensioner(s);
    root.updateMatrixWorld(true);
    const x0 = s > 0 ? -40 : -340, x1 = s > 0 ? 340 : 40;
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.computeBoundingBox();
      const b = mesh.geometry.boundingBox!;
      const v = new THREE.Vector3();
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
        v.set(x, y, z).applyMatrix4(mesh.matrixWorld);
        expect(v.x, `x ${v.x.toFixed(0)}`).toBeGreaterThan(x0);
        expect(v.x, `x ${v.x.toFixed(0)}`).toBeLessThan(x1);
        expect(v.y, `y ${v.y.toFixed(0)}`).toBeGreaterThan(-180);
        expect(v.y, `y ${v.y.toFixed(0)}`).toBeLessThan(90);
        expect(v.z, `z ${v.z.toFixed(0)}`).toBeGreaterThan(200);
        expect(v.z, `z ${v.z.toFixed(0)}`).toBeLessThan(290);
      }
      const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
      const P = g.getAttribute('position');
      const n = P.count;
      if (n < 3) return;
      const parent = new Int32Array(n);
      for (let i = 0; i < n; i++) parent[i] = i;
      const find = (a: number): number => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
      const uni = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
      const q = 0.05, map = new Map<string, number>();
      for (let i = 0; i < n; i++) {
        const k = `${Math.round(P.getX(i) / q)},${Math.round(P.getY(i) / q)},${Math.round(P.getZ(i) / q)}`;
        const prev = map.get(k);
        if (prev !== undefined) uni(prev, i); else map.set(k, i);
      }
      for (let i = 0; i + 2 < n; i += 3) { uni(i, i + 1); uni(i + 1, i + 2); }
      const roots = new Set<number>();
      for (let i = 0; i < n; i++) roots.add(find(i));
      expect(roots.size, `components ${roots.size}`).toBe(1);
    });
  });
  it('guide-rail shoes sit against the chain run', () => {
    for (const r of guideRails(s)) {
      const f = (r.f0 + r.f1) / 2;
      const q = r.a.clone().lerp(r.b, f);
      const hit = rayHit(`chain-tensioner-${b}`, new THREE.Vector3(q.x, q.y, CHAIN_Z[s]), new THREE.Vector3(r.n.x, r.n.y, 0), 20);
      expect(hit, `rail at x ${q.x.toFixed(0)}`).toBeTruthy();
      expect(Math.abs(hit!.distance - railInner(0.5))).toBeLessThan(0.6);
    }
  });
});
