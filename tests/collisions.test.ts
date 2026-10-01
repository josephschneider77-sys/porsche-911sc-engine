import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { findCollisions, isMating, clearance } from './collide';
import { rayHit } from './hw';
import { OIL_COOLER } from '../src/geo/aux';

const CAM_DRIVE = /^(chain-housing|chain-housing-lid|chain-tensioner|timing-chain|cam-sprocket)-(left|right)$/;
const EXHAUST = /^(heat-exchanger-(left|right)|muffler)$/;

describe('assembled-pose interference', () => {
  const hits = findCollisions(1); // 1 mm erosion per part => >2 mm interpenetration counts
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
    for (const part of ['chain-housing', 'chain-housing-lid', 'chain-tensioner'])
      it(`${part}-${sd} keeps >= 10 mm air gap to heat-exchanger-${sd}`, () => {
        expect(clearance(`${part}-${sd}`, `heat-exchanger-${sd}`)).toBeGreaterThanOrEqual(10);
      });

  const coolerPair = (id: string) => hits.some((h) => (h.a === 'oil-cooler' && h.b === id) || (h.b === 'oil-cooler' && h.a === id));
  it('oil-cooler mounting feet meet the left-case bosses flush and do not interpenetrate', () => {
    expect(coolerPair('crankcase-left')).toBe(false);
    expect(coolerPair('crankcase-right')).toBe(false);
    const seatY = OIL_COOLER.footTop - OIL_COOLER.foot;
    for (const [x, z] of OIL_COOLER.studs) {
      const hit = rayHit('crankcase-left', new THREE.Vector3(x, seatY + 2, z), new THREE.Vector3(0, -1, 0), 8);
      expect(hit, `cooler stud (${x}, ${z})`).toBeTruthy();
      expect(hit!.distance, `seat under (${x}, ${z})`).toBeCloseTo(2, 1);
      expect(hit!.normal.y, `seat normal (${x}, ${z})`).toBeGreaterThan(0.99);
    }
    expect(clearance('oil-cooler', 'crankcase-left')).toBeLessThan(0.6);
  });
});
