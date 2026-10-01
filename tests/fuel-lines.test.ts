import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { ASSET_BUILDERS } from '../src/geo/assets';
import { PART_BY_ID } from '../src/data/parts';
import { BOX, SLEEVE, FUEL_LINES, FUEL_BANJOS, BANJO, serviceHoses, bootFrames, SLEEVE_IN_X, STUB_TIP_X, RUNNER_TIP_X, injectorFace, injectorAxis } from '../src/geo/induction';
import { AIRBOX } from '../src/geo/aux';
import { HEATER_HOSE_ENDS } from '../src/geo/smallParts';

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
    expect(AIRBOX.len).toBe(402);
    expect(AIRBOX.wid).toBe(181);
    expect(AIRBOX.h).toBe(41.4);
  });

  it('every line end is on its fitting, and every banjo has two washers', () => {
    const bvh = new Map<string, MeshBVH>();
    const fitting = (id: string) => {
      const key = id;
      if (!bvh.has(key)) bvh.set(key, partBVH(id, true));
      return bvh.get(key)!;
    };
    const bad: string[] = [];
    const hoses = [...FUEL_LINES, ...serviceHoses(), {
      id: 'heater',
      part: 'heater-hose',
      a: { part: 'heater-adapters', point: HEATER_HOSE_ENDS.adapter.tip, axis: HEATER_HOSE_ENDS.adapter.axis },
      b: { part: 'heater-hose', point: HEATER_HOSE_ENDS.ferrule.tip, axis: HEATER_HOSE_ENDS.ferrule.axis },
    }];
    const named = new Set(hoses.map((h) => `${h.part}:${h.id}`));
    for (const partId of [...new Set(hoses.map((h) => h.part))]) {
      const root = ASSET_BUILDERS[PART_BY_ID[partId].asset]();
      root.traverse((o: any) => {
        if (o.isMesh && typeof o.name === 'string' && o.name.startsWith('line:') && !o.name.endsWith(':cap')) {
          const id = o.name.slice(5);
          if (!named.has(`${partId}:${id}`)) bad.push(`${partId} line:${id} has no fitting record`);
        }
      });
    }
    for (const line of hoses) {
      const verts = lineVertices(line.part, line.id);
      if (!verts.length) bad.push(`${line.id}: no line mesh in ${line.part}`);
      for (const end of [line.a, line.b]) {
        const p = new THREE.Vector3(...end.point);
        const axis = new THREE.Vector3(...end.axis).normalize();
        if (verts.length) {
          const d = Math.min(...verts.map((q) => q.distanceTo(p)));
          if (d > 0.5) bad.push(`${line.id} @ ${end.part}: nearest line vertex ${d.toFixed(2)} mm from the fitting (free air)`);
        }
        // Off the centreline: a nipple is an annulus, a heater mouth is a large tube. Try a few radii.
        const side0 = new THREE.Vector3(0, 1, 0).cross(axis);
        if (side0.lengthSq() < 1e-6) side0.set(1, 0, 0);
        side0.normalize();
        const face = [1.2, 8, 39].some((rad) => {
          const origin = p.clone().addScaledVector(axis, 2).addScaledVector(side0, rad);
          const hit = fitting(end.part).raycastFirst(new THREE.Ray(origin, axis.clone().negate()), THREE.DoubleSide) as any;
          return hit && Math.abs(hit.distance - 2) <= 0.5;
        });
        if (!face) bad.push(`${line.id} @ ${end.part}: fitting face is not at the seat`);
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

  it('injector lines stop at the tube nut instead of flaring out along the injector axis', () => {
    const bad: string[] = [];
    for (const c of [1, 2, 3, 4, 5, 6]) {
      const face = new THREE.Vector3(...injectorFace(c));
      const axis = new THREE.Vector3(...injectorAxis(c)).normalize();
      const verts = lineVertices('fuel-lines', `inj-${c}`);
      if (!verts.length) { bad.push(`inj-${c}: no mesh`); continue; }
      let past = 0;
      for (const q of verts) past = Math.max(past, q.clone().sub(face).dot(axis));
      // 8 mm nut, then a 10 mm bend. The old 30 mm lead put steel out near x ±297.
      if (past > 23) bad.push(`inj-${c}: steel ${past.toFixed(1)} mm past the nipple`);
    }
    expect(bad).toEqual([]);
  });

  it('intake sleeves sit on the stub and the runner, not in free air', () => {
    for (const b of bootFrames()) {
      const s = b.axis[0];
      const x0 = b.origin[0];
      const x1 = x0 + s * SLEEVE.len;
      const onStub = s > 0 ? x0 > SLEEVE_IN_X - 0.1 && x0 < STUB_TIP_X : x0 < -SLEEVE_IN_X + 0.1 && x0 > -STUB_TIP_X;
      const onRunner = s > 0 ? x1 > RUNNER_TIP_X && x1 < RUNNER_TIP_X + 30 : x1 < -RUNNER_TIP_X && x1 > -RUNNER_TIP_X - 30;
      expect(onStub, `boot ${b.c} plenum end`).toBe(true);
      expect(onRunner, `boot ${b.c} runner end`).toBe(true);
    }
  });
});
