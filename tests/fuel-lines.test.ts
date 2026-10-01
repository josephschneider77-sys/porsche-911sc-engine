import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { ASSET_BUILDERS } from '../src/geo/assets';
import { PART_BY_ID } from '../src/data/parts';
import { BOX, SLEEVE, FUEL_LINES, FUEL_BANJOS, BANJO } from '../src/geo/induction';

const poseOf = (id: string) => {
  const d = PART_BY_ID[id];
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...(d.position ?? [0, 0, 0])),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...(d.rotation ?? [0, 0, 0]))),
    new THREE.Vector3(1, 1, 1),
  );
};

/** World-space triangles of a part. Line tubes (name line:*) can be left out so a ray hits the fitting, not the tube. */
function partBVH(id: string, skipLines: boolean) {
  const root = ASSET_BUILDERS[PART_BY_ID[id].asset]();
  root.updateMatrixWorld(true);
  const pose = poseOf(id);
  const out: number[] = [];
  const v = new THREE.Vector3();
  root.traverse((o: any) => {
    if (!o.isMesh) return;
    if (skipLines && typeof o.name === 'string' && o.name.startsWith('line:')) return;
    const g: THREE.BufferGeometry = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
    const P = g.attributes.position;
    const inst: THREE.Matrix4[] = o.isInstancedMesh
      ? Array.from({ length: o.count }, (_, i) => { const m = new THREE.Matrix4(); o.getMatrixAt(i, m); return m; })
      : [new THREE.Matrix4()];
    for (const im of inst) {
      const w = pose.clone().multiply(o.matrixWorld).multiply(im);
      for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(w); out.push(v.x, v.y, v.z); }
    }
  });
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  return new MeshBVH(geom);
}

function lineVertices(partId: string, lineId: string) {
  const root = ASSET_BUILDERS[PART_BY_ID[partId].asset]();
  root.updateMatrixWorld(true);
  const pose = poseOf(partId);
  const pts: THREE.Vector3[] = [];
  const v = new THREE.Vector3();
  root.traverse((o: any) => {
    if (!o.isMesh || o.name !== `line:${lineId}` && o.name !== `line:${lineId}:cap`) return;
    const g: THREE.BufferGeometry = o.geometry;
    const P = g.attributes.position;
    const w = pose.clone().multiply(o.matrixWorld);
    for (let i = 0; i < P.count; i++) pts.push(v.fromBufferAttribute(P, i).applyMatrix4(w).clone());
  });
  return pts;
}

describe('1978 CIS fuel lines', () => {
  it('records the plenum and sleeve dimensions', () => {
    expect(BOX.faceX * 2).toBe(155);
    expect(BOX.z1 - BOX.z0).toBe(190);
    expect(BOX.y1 - BOX.y0).toBe(78);
    expect(BOX.stubZ[1] - BOX.stubZ[0]).toBe(50);
    expect(BOX.stubZ[2] - BOX.stubZ[1]).toBe(50);
    expect(BOX.portId).toBe(38);
    expect(SLEEVE.od).toBe(47);
    expect(SLEEVE.len).toBe(50);
  });

  it('every line end is on its fitting, and every banjo has two washers', () => {
    const bvh = new Map<string, MeshBVH>();
    const fitting = (id: string) => {
      const key = id;
      if (!bvh.has(key)) bvh.set(key, partBVH(id, true));
      return bvh.get(key)!;
    };
    const bad: string[] = [];
    for (const line of FUEL_LINES) {
      const verts = lineVertices(line.part, line.id);
      if (!verts.length) bad.push(`${line.id}: no line mesh in ${line.part}`);
      for (const end of [line.a, line.b]) {
        const p = new THREE.Vector3(...end.point);
        const axis = new THREE.Vector3(...end.axis).normalize();
        if (verts.length) {
          const d = Math.min(...verts.map((q) => q.distanceTo(p)));
          if (d > 0.5) bad.push(`${line.id} @ ${end.part}: nearest line vertex ${d.toFixed(2)} mm from the fitting (free air)`);
        }
        // Off the centreline: the injector nipple face is an annulus, so a ray on the axis falls through the hole.
        const side = new THREE.Vector3(0, 1, 0).cross(axis);
        if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
        side.normalize().multiplyScalar(1.2);
        const origin = p.clone().addScaledVector(axis, 2).add(side);
        const hit = fitting(end.part).raycastFirst(new THREE.Ray(origin, axis.clone().negate()), THREE.DoubleSide) as any;
        if (!hit) bad.push(`${line.id} @ ${end.part}: ray missed the fitting`);
        else if (Math.abs(hit.distance - 2) > 0.5) bad.push(`${line.id} @ ${end.part}: fitting face ${(hit.distance - 2).toFixed(2)} mm off the seat`);
      }
    }
    for (const b of FUEL_BANJOS) {
      expect(b.washers.length, b.id).toBe(2);
      const axis = new THREE.Vector3(...b.axis).normalize();
      const ref = Math.abs(axis.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      const u = new THREE.Vector3().crossVectors(axis, ref).normalize();
      const v = new THREE.Vector3().crossVectors(axis, u).normalize();
      b.washers.forEach((w, i) => {
        const origin = new THREE.Vector3(...w);
        // The washer profile has no inner wall, so a radial ray hits the outer rim (ro). Try four directions: a neighbour banjo can sit closer than that rim.
        const hit = [u, v, u.clone().negate(), v.clone().negate()].some((d) => {
          const h = fitting(b.part).raycastFirst(new THREE.Ray(origin, d), THREE.DoubleSide) as any;
          return h && Math.abs(h.distance - BANJO.washerRo) < 0.45;
        });
        if (!hit) bad.push(`${b.id} washer ${i}: no copper ring of Ø${BANJO.washerRo * 2} around the bolt`);
      });
    }
    expect(bad).toEqual([]);
  });
});
