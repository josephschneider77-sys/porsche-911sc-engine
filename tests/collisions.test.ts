import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { findCollisions, findIntraPartHits, erodedSolidsClash, allowedClash, clearance, geometriesClash, MATING, TOP_END_WHY } from './collide';
import { rayHit } from './hw';
import { OIL_COOLER, DIST, DIST_AXIS, distW } from '../src/geo/aux';

const CAM_DRIVE = /^(chain-housing|chain-housing-lid|chain-tensioner|timing-chain|cam-sprocket)-(left|right)$/;
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
  it('chain tensioners and cam-flange covers do not interpenetrate themselves', () => {
    const hits = findIntraPartHits([
      'chain-tensioner-left', 'chain-tensioner-right',
      'cam-flange-cover-left', 'cam-flange-cover-right',
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
    const bad = hits.filter((h) => !allowedClash(h)).map((h) => `${h.a} x ${h.b} (${h.tris} tri pairs)`);
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
    for (const part of ['chain-housing', 'chain-housing-lid', 'chain-tensioner'])
      it(`${part}-${sd} keeps >= 10 mm air gap to heat-exchanger-${sd}`, () => {
        expect(clearance(`${part}-${sd}`, `heat-exchanger-${sd}`)).toBeGreaterThanOrEqual(10);
      });

  const coolerPair = (id: string) => hits.some((h) => (h.a === 'oil-cooler' && h.b === id) || (h.b === 'oil-cooler' && h.a === id));
  it('oil-cooler flange meets the right-case cheek and does not interpenetrate', () => {
    expect(OIL_COOLER.ports).toHaveLength(3);
    const big = OIL_COOLER.ports.filter((q) => q[2] === 1);
    expect(big).toHaveLength(1);
    expect(big[0][0]).toBe(Math.min(...OIL_COOLER.ports.map((q) => q[0])));
    expect(coolerPair('crankcase-left')).toBe(false);
    expect(coolerPair('crankcase-right')).toBe(false);
    const faceX = OIL_COOLER.faceX;
    for (const [y, z] of OIL_COOLER.studs) {
      const hit = rayHit('crankcase-right', new THREE.Vector3(faceX + 2, y, z), new THREE.Vector3(-1, 0, 0), 8);
      expect(hit, `cooler stud (${y}, ${z})`).toBeTruthy();
      expect(hit!.distance, `seat at (${y}, ${z})`).toBeCloseTo(2, 1);
      expect(hit!.normal.x, `seat normal (${y}, ${z})`).toBeGreaterThan(0.99);
    }
    expect(clearance('oil-cooler', 'crankcase-right')).toBeLessThan(0.6);
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
