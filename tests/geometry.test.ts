import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ASSET_BUILDERS } from '../src/geo/assets';
import { rayHit } from './hw';
import { CYL_Z, INT_SHAFT_Y } from '../src/data/layout';
import { CASE_LUG } from '../src/geo/hwLayout';

describe('procedural part geometry', () => {
  for (const [id, build] of Object.entries(ASSET_BUILDERS)) {
    it(`${id} builds real geometry at mm scale`, () => {
      const obj = build();
      let tris = 0;
      // instanced hardware counts once per instance
      obj.traverse((o: any) => { if (o.isMesh) tris += ((o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1); });
      expect(tris).toBeGreaterThan(40);
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      expect(Math.max(size.x, size.y, size.z)).toBeGreaterThan(8);
      expect(Math.max(Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.y), Math.abs(box.max.y), Math.abs(box.min.z), Math.abs(box.max.z))).toBeLessThan(900);
    });
  }
});

describe('crankcase cavity and main shells', () => {
  it('the right case is open through a cylinder spigot into the crank bay', () => {
    const z = CYL_Z[2];
    expect(rayHit('crankcase-right', new THREE.Vector3(180, 0, z), new THREE.Vector3(-1, 0, 0), 400)).toBeNull();
  });
  it('each main web carries a saddle bore around the journal', () => {
    const h = rayHit('crankcase-right', new THREE.Vector3(10, 0, 0), new THREE.Vector3(1, 0, 0), 80);
    expect(h).not.toBeNull();
    expect(10 + h!.distance).toBeGreaterThan(30);
    expect(10 + h!.distance).toBeLessThan(40);
  });
  it('main bearings are steel shells, not bronze rings', () => {
    const g = ASSET_BUILDERS['main-bearings']();
    const names = new Set<string>();
    g.traverse((o: any) => { if (o.isMesh) names.add(o.material.name); });
    expect([...names]).not.toContain('bronze');
    expect(names.has('steel')).toBe(true);
  });
});

describe('intermediate gear vs the z 190 perimeter stud', () => {
  // 60 T tip circle Top End is fitting. The stud is not in that mesh yet; this is the clearance it needs.
  const tip = 54.8;
  const y = CASE_LUG.yBelowGear;
  const zTooth0 = 192;
  const zTooth1 = 206;
  function gap(r: number, x: number) {
    let min = Infinity;
    for (let i = 0; i < 360; i++) {
      const a = (i / 360) * Math.PI * 2;
      const py = y + r * Math.cos(a);
      const pz = 190 + r * Math.sin(a);
      if (pz < zTooth0 || pz > zTooth1) continue;
      min = Math.min(min, Math.hypot(x, py - INT_SHAFT_Y) - tip);
    }
    return min;
  }
  it('clears the stud, the lock-nut hex and the lug by more than 1 mm', () => {
    expect(gap(4 * 0.96, 0)).toBeGreaterThan(1); // M8 stud, r = M/2*0.96, through x = 0
    expect(gap(13 / Math.sqrt(3), -CASE_LUG.x)).toBeGreaterThan(1); // hex corner, at the left seat
    expect(gap(8, -CASE_LUG.x)).toBeGreaterThan(1); // washer, the largest nut envelope
    expect(gap(CASE_LUG.r, 0)).toBeGreaterThan(1); // lug boss
  });
});
