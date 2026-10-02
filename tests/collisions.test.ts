import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { findCollisions, findIntraPartHits, erodedSolidsClash, isMating, clearance, geometriesClash, MATING, TOP_END_WHY } from './collide';
import { rayHit } from './hw';
import { OIL_COOLER, oilCooler, DIST, DIST_AXIS, distW } from '../src/geo/aux';
import { SMALL_GEOM } from '../src/geo/smallParts';

const CAM_DRIVE = /^(chain-housing|chain-housing-lid|chain-tensioner|guide-rails|timing-chain|cam-sprocket)-(left|right)$/;
const EXHAUST = /^(heat-exchanger-(left|right)|muffler)$/;

describe('seated face contact', () => {
  const slab = (x0: number, x1: number) => {
    const g = new THREE.BoxGeometry(x1 - x0, 20, 20);
    g.translate((x0 + x1) / 2, 10, 0);
    return g;
  };
  it('two blocks that share a face are seated, not clashing', () => {
    expect(geometriesClash(slab(0, 10), slab(10, 20))).toBe(false);
  });
  it('a real 1 mm overlap still fails', () => {
    expect(geometriesClash(slab(0, 10), slab(9, 19))).toBe(true);
  });
  it('two triangles that only share an edge are seated', () => {
    const tri = (pts: number[]) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      return g;
    };
    const upper = tri([0, 0, 0, 20, 0, 0, 10, 8, 3]);
    const lower = tri([0, 0, 0, 20, 0, 0, 10, -8, 3]);
    expect(geometriesClash(upper, lower)).toBe(false);
  });
});

describe('intra-part fuel and induction solids', () => {
  const eye = (z: number) => {
    const g = new THREE.CylinderGeometry(7.3, 7.3, 8, 24);
    g.translate(0, 0, z);
    return g;
  };
  it('catches neighbouring Ø14.6 eyes 12 mm apart, and lets a touching pair pass', () => {
    // The old distributor pitch. 2.6 mm of overlap remains 0.6 mm after 1 mm of erosion each side.
    expect(erodedSolidsClash(eye(0), eye(12), 1)).toBe(true);
    expect(erodedSolidsClash(eye(0), eye(14.6), 1)).toBe(false);
  });
  it('lines, banjos, hoses and clamps do not interpenetrate themselves', () => {
    const hits = findIntraPartHits([
      'fuel-lines', 'wur-lines', 'injection-banjos', 'aux-air-plumbing', 'vacuum-fittings',
      'intake-boot-clamps', 'airbox-clamps', 'injection-line-rings', 'injection-line-bracket',
    ], 1);
    expect(hits.map((h) => `${h.part}: ${h.a} x ${h.b} (${h.tris})`)).toEqual([]);
  });
});

describe('assembled-pose interference', () => {
  const hits = findCollisions(1); // 1 mm erosion per part => >2 mm interpenetration counts
  it('bottom-end and ancillary allowlist entries name a threaded, pressed or seated joint', () => {
    const bare = MATING.filter(([, , why]) => !TOP_END_WHY.has(why) && !/\b(threaded|pressed|seated|PENDING-INTAKE)\b/i.test(why));
    expect(bare.map(([, , why]) => why)).toEqual([]);
  });
  it('no part pair intersects unless it is a listed mating / known-simplified pair', () => {
    const bad = hits.filter((h) => !isMating(h.a, h.b)).map((h) => `${h.a} x ${h.b} (${h.tris} tri pairs)`);
    expect(bad).toEqual([]);
  });
  it('cam drive (chain boxes, covers, tensioners, chains, sprockets) never touches the exhaust', () => {
    const bad = hits.filter((h) => (CAM_DRIVE.test(h.a) && EXHAUST.test(h.b)) || (CAM_DRIVE.test(h.b) && EXHAUST.test(h.a)));
    expect(bad.map((h) => `${h.a} x ${h.b}`)).toEqual([]);
  });
  it('left/right cam drives do not touch each other', () => {
    const bad = hits.filter((h) => CAM_DRIVE.test(h.a) && CAM_DRIVE.test(h.b) && h.a.split('-').pop() !== h.b.split('-').pop());
    expect(bad.map((h) => `${h.a} x ${h.b}`)).toEqual([]);
  });
  for (const sd of ['right', 'left'])
    for (const part of ['chain-housing', 'chain-housing-lid', 'chain-tensioner', 'guide-rails'])
      it(`${part}-${sd} keeps >= 10 mm air gap to heat-exchanger-${sd}`, () => {
        expect(clearance(`${part}-${sd}`, `heat-exchanger-${sd}`)).toBeGreaterThanOrEqual(10);
      });

  it('oil cooler mounts on the right-case deck pad', () => {
    expect(OIL_COOLER.faceX).toBe(103);
    expect(OIL_COOLER.ports).toHaveLength(3);
    const big = OIL_COOLER.ports.filter((q) => q[2] === 1);
    const upper = OIL_COOLER.ports.filter((q) => q[2] === 0);
    expect(big).toHaveLength(1);
    expect(upper).toHaveLength(2);
    expect(big[0][0]).toBeLessThan(Math.min(...upper.map((q) => q[0])));
    expect(Math.abs(upper[0][0] - upper[1][0])).toBeLessThan(1);
    const alongX = new THREE.Vector3(1, 0, 0);
    const face = rayHit('oil-cooler', new THREE.Vector3(90, 8, -180), alongX, 30);
    expect(face, 'flange inboard face').toBeTruthy();
    expect(Math.abs(90 + face!.distance - 103)).toBeLessThan(0.2);
    expect(Math.abs(face!.normal.x)).toBeGreaterThan(0.99);
    const pad = rayHit('crankcase-right', new THREE.Vector3(120, 8, -180), new THREE.Vector3(-1, 0, 0), 40);
    expect(pad, 'case deck pad').toBeTruthy();
    expect(Math.abs(120 - pad!.distance - 103)).toBeLessThan(0.2);
    expect(pad!.normal.x).toBeGreaterThan(0.99);
    for (const [y, z] of OIL_COOLER.studs) {
      const blocked = rayHit('oil-cooler', new THREE.Vector3(102, y, z), alongX, 10);
      expect(blocked, `stud hole (${y}, ${z})`).toBeNull();
      // Beside the tap the pad face is still x = 103. On the stud axis the ray enters the hole.
      const seat = rayHit('crankcase-right', new THREE.Vector3(120, y + 6, z), new THREE.Vector3(-1, 0, 0), 40);
      expect(seat, `stud pad (${y}, ${z})`).toBeTruthy();
      expect(Math.abs(120 - seat!.distance - 103)).toBeLessThan(0.2);
      expect(seat!.normal.x).toBeGreaterThan(0.99);
      const bore = rayHit('crankcase-right', new THREE.Vector3(120, y, z), new THREE.Vector3(-1, 0, 0), 40);
      expect(bore, `stud tap (${y}, ${z})`).toBeTruthy();
      const boreX = 120 - bore!.distance;
      expect(boreX, `tap bottom (${y}, ${z})`).toBeGreaterThan(88);
      expect(boreX, `tap is open at the face (${y}, ${z})`).toBeLessThan(96);
    }
    for (const [y, z, isBig] of OIL_COOLER.ports) {
      const id = isBig ? 'oil-cooler-seal-riser' : 'oil-cooler-seals';
      const placed = SMALL_GEOM[id].items().map((m) => ({
        p: new THREE.Vector3().setFromMatrixPosition(m),
        n: new THREE.Vector3().setFromMatrixColumn(m, 1).normalize(),
      }));
      const seal = placed.find((s) => Math.abs(s.p.y - y) < 0.5 && Math.abs(s.p.z - z) < 0.5);
      expect(seal, `seal at (${y}, ${z})`).toBeTruthy();
      expect(seal!.p.x).toBeLessThan(103);
      expect(seal!.p.x).toBeGreaterThan(99);
      expect(seal!.n.x).toBeGreaterThan(0.99);
    }
    const g = oilCooler();
    const box = new THREE.Box3().setFromObject(g);
    expect(box.min.z).toBeGreaterThanOrEqual(-213);
    expect(box.max.z).toBeLessThanOrEqual(-146);
    const corePts: THREE.Vector3[] = [];
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const arr = mesh.geometry.getAttribute('position');
      mesh.updateWorldMatrix(true, false);
      for (let i = 0; i < arr.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(arr, i).applyMatrix4(mesh.matrixWorld);
        if (v.y < -62 || v.y > 80) continue;
        corePts.push(v);
      }
    });
    const core = new THREE.Box3().setFromPoints(corePts);
    const near = (xTarget: number) => {
      const acc = new THREE.Vector3();
      const hit = corePts.filter((v) => Math.abs(v.x - xTarget) < 1.5);
      for (const v of hit) acc.add(v);
      return hit.length ? acc.multiplyScalar(1 / hit.length) : null;
    };
    const a = near(core.min.x), b = near(core.max.x);
    expect(a && b, 'core end centroids').toBeTruthy();
    const axis = b!.clone().sub(a!).normalize();
    const ang = Math.acos(Math.min(1, Math.abs(axis.dot(alongX)))) * 180 / Math.PI;
    expect(ang).toBeLessThan(5);
    // Model-fit length is 137 mm against a 140 mm height, so X is not the longest box edge.
    expect(box.max.x - box.min.x).toBeGreaterThan(box.max.z - box.min.z);
  });

  const COOLER_TOUCHED = ['oil-cooler', 'oil-cooler-nuts', 'oil-cooler-seals', 'oil-cooler-seal-riser', 'oil-cooler-cap', 'crankcase-right', 'upper-air-guide', 'ignition-leads', 'shroud-screws', 'shroud-end-screws', 'shroud-speed-nuts'];
  for (const tol of [0, 0.5]) it(`cooler parts the mount touches are clear at ${tol} mm`, () => {
    const touched = new Set(COOLER_TOUCHED);
    const bad = findCollisions(tol).filter((h) => (touched.has(h.a) || touched.has(h.b)) && !isMating(h.a, h.b));
    expect(bad.map((h) => `${h.a} x ${h.b} (${h.tris})`)).toEqual([]);
  });

  it('distributor lug seats on the left-case pad and the body does not enter the case', () => {
    const pair = (list: { a: string; b: string }[]) => list.filter((h) =>
      (h.a === 'distributor' && h.b === 'crankcase-left') || (h.b === 'distributor' && h.a === 'crankcase-left'));
    expect(pair(hits)).toEqual([]);
    expect(pair(findCollisions(0.5))).toEqual([]);
    expect(pair(findCollisions(0))).toEqual([]);
    const seat = distW(DIST.stud[0], 97.5, DIST.stud[1]);
    const axis = new THREE.Vector3(...DIST_AXIS);
    const origin = new THREE.Vector3(...seat).addScaledVector(axis, 6);
    const hit = rayHit('crankcase-left', origin, axis.clone().negate(), 14);
    expect(hit, 'stud pad at local t 97.5').toBeTruthy();
    expect(hit!.distance).toBeCloseTo(6, 0);
    expect(hit!.normal.dot(axis)).toBeGreaterThan(0.9);
  });
});
