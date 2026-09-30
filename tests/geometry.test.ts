import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ASSET_BUILDERS } from '../src/geo/assets';

describe('procedural part geometry', () => {
  for (const [id, build] of Object.entries(ASSET_BUILDERS)) {
    it(`${id} builds real geometry at mm scale`, () => {
      const obj = build();
      let tris = 0;
      obj.traverse((o: any) => { if (o.isMesh) tris += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3; });
      expect(tris).toBeGreaterThan(40);
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      expect(Math.max(size.x, size.y, size.z)).toBeGreaterThan(8);
      expect(Math.max(Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.y), Math.abs(box.max.y), Math.abs(box.min.z), Math.abs(box.max.z))).toBeLessThan(900);
    });
  }
});
