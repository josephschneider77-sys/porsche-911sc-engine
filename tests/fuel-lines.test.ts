import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { ASSET_BUILDERS } from '../src/geo/assets';
import { PART_BY_ID } from '../src/data/parts';
import { BOX, SLEEVE, FUEL_LINES, FUEL_BANJOS, BANJO, serviceHoses, bootFrames, SLEEVE_IN_X, STUB_TIP_X, RUNNER_TIP_X, injectorFace, injectorAxis, FD_CX, FD_CZ, FD_RING_R, FD_HUB, distributorFuelSeats, TEE_AIR_INJ } from '../src/geo/induction';
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

function qMaxAbsX(verts: THREE.Vector3[]) {
  let m = 0;
  for (const q of verts) m = Math.max(m, Math.abs(q.x));
  return m;
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
    expect(SLEEVE.len).toBe(32);
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
      const host = b.washerPart ?? b.part;
      b.washers.forEach((w, i) => {
        const origin = new THREE.Vector3(...w);
        // The washer profile has no inner wall, so a radial ray hits the outer rim (ro). Try four directions: a neighbour banjo can sit closer than that rim.
        const hit = [u, v, u.clone().negate(), v.clone().negate()].some((d) => {
          const h = fitting(host).raycastFirst(new THREE.Ray(origin, d), THREE.DoubleSide) as any;
          return h && Math.abs(h.distance - BANJO.washerRo) < 0.45;
        });
        if (!hit) bad.push(`${b.id} washer ${i}: no copper ring of Ø${BANJO.washerRo * 2} around the bolt`);
      });
    }
    expect(bad).toEqual([]);
  });

  it('the air-injection handoff barb has no hose of its own', () => {
    const tip = new THREE.Vector3(...TEE_AIR_INJ.point);
    const ends = serviceHoses().flatMap((h) => [h.a, h.b]);
    const seated = ends.filter((e) => new THREE.Vector3(...e.point).distanceTo(tip) <= 0.5);
    expect(seated, 'TEE_AIR_INJ is a handoff to Bottom End, not an end of a hose drawn here').toEqual([]);
    const root = ASSET_BUILDERS[PART_BY_ID['vacuum-fittings'].asset]();
    let fitting = false;
    let line = false;
    root.traverse((o: any) => {
      if (o.name === 'fitting:vac-airinj') fitting = true;
      if (typeof o.name === 'string' && o.name.startsWith('line:vac-airinj')) line = true;
    });
    expect(fitting).toBe(true);
    expect(line).toBe(false);
  });

  it('every banjo or union on the distributor has exactly one fuel line', () => {
    const seats = distributorFuelSeats();
    const ends = FUEL_LINES.flatMap((l) => [
      { line: l.id, point: l.a.point, part: l.a.part },
      { line: l.id, point: l.b.point, part: l.b.part },
    ]);
    const bad: string[] = [];
    const used = new Set<string>();
    for (const s of seats) {
      const sp = new THREE.Vector3(...s.point);
      const hits = ends.filter((e) => new THREE.Vector3(...e.point).distanceTo(sp) <= 0.5);
      if (hits.length !== 1) bad.push(`${s.id}: ${hits.length} line ends (${hits.map((h) => h.line).join(', ')})`);
      else if (used.has(hits[0].line + hits[0].part)) bad.push(`${s.id}: line ${hits[0].line} already ends on another distributor fitting`);
      else used.add(hits[0].line + hits[0].part);
    }
    // A fitting drawn on the distributor (named banjo/union, or an injector-banjo instance)
    // has to be one of those seats. Anonymous metal in the centre column, outside the hub,
    // is the orphan banjo this test exists to catch.
    const onDistributor = (p: THREE.Vector3) =>
      p.x >= -175 && p.x <= -45 && p.y >= 250 && p.y <= 370 && p.z >= -165 && p.z <= 5;
    const fittingVerts = (o: THREE.Object3D, pose: THREE.Matrix4) => {
      const pts: THREE.Vector3[] = [];
      const v = new THREE.Vector3();
      o.traverse((child: any) => {
        if (!child.isMesh) return;
        const P = child.geometry.attributes.position as THREE.BufferAttribute;
        const w = pose.clone().multiply(child.matrixWorld);
        for (let i = 0; i < P.count; i++) pts.push(v.fromBufferAttribute(P, i).applyMatrix4(w).clone());
      });
      return pts;
    };
    for (const partId of ['mixture-control-unit', 'wur-lines', 'fuel-lines', 'injection-banjos']) {
      const root = ASSET_BUILDERS[PART_BY_ID[partId].asset]();
      root.updateMatrixWorld(true);
      const pose = poseOf(partId);
      root.traverse((o: any) => {
        const named = typeof o.name === 'string' && (o.name.startsWith('banjo:') || o.name.startsWith('fitting:'));
        if (named) {
          const box = new THREE.Box3().setFromObject(o);
          const c = box.getCenter(new THREE.Vector3()).applyMatrix4(pose);
          if (!onDistributor(c)) return;
          const verts = fittingVerts(o, pose);
          const hits = seats.filter((s) => {
            const sp = new THREE.Vector3(...s.point);
            return verts.some((q) => q.distanceTo(sp) <= 6);
          });
          if (hits.length !== 1) bad.push(`${partId} ${o.name} is on the distributor with ${hits.length} fuel lines`);
          return;
        }
        if (partId !== 'mixture-control-unit' || !o.isMesh) return;
        let parent = o.parent;
        while (parent) {
          if (typeof parent.name === 'string' && (parent.name.startsWith('fitting:') || parent.name.startsWith('banjo:'))) return;
          parent = parent.parent;
        }
        const g = o.geometry as THREE.BufferGeometry;
        const P = g.attributes.position;
        const v = new THREE.Vector3();
        const w = pose.clone().multiply(o.matrixWorld);
        let outsideHub = false;
        for (let i = 0; i < P.count; i++) {
          v.fromBufferAttribute(P, i).applyMatrix4(w);
          const radial = Math.hypot(v.x - FD_CX, v.z - FD_CZ);
          if (radial < 16 && v.y > FD_HUB.y0 + 0.2 && (radial > FD_HUB.r + 0.3 || v.y > FD_HUB.y1 + 0.3)) outsideHub = true;
        }
        if (outsideHub) bad.push('mixture-control-unit has metal in the centre column that is not the hub or screw socket #49');
      });
      if (partId === 'injection-banjos') {
        root.traverse((o: any) => {
          if (!o.isInstancedMesh) return;
          const m = new THREE.Matrix4();
          const tip = new THREE.Vector3(0, BANJO.eyeY, BANJO.stubTip);
          for (let i = 0; i < o.count; i++) {
            o.getMatrixAt(i, m);
            const world = tip.clone().applyMatrix4(m).applyMatrix4(pose);
            const hits = seats.filter((s) => new THREE.Vector3(...s.point).distanceTo(world) <= 0.5);
            if (hits.length !== 1) bad.push(`injection-banjos instance ${i}: ${hits.length} seats`);
          }
        });
      }
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
      // Only the steel at this injector. The distributor end is a tall hex tower; its
      // height is not a flare along the injector axis.
      for (const q of verts) {
        if (q.distanceTo(face) > 40) continue;
        past = Math.max(past, q.clone().sub(face).dot(axis));
      }
      // 8 mm nut, then a 6 mm bend. A 10 mm bend reached about x ±289; a 30 mm lead reached x ±297.
      if (past > 18) bad.push(`inj-${c}: steel ${past.toFixed(1)} mm past the nipple`);
      const reach = qMaxAbsX(verts);
      if (reach > 286) bad.push(`inj-${c}: steel reaches |x| ${reach.toFixed(1)}`);
    }
    expect(bad).toEqual([]);
  });

  it('distributor outlet eyes sit on a ring and the stubs leave radially', () => {
    const faces = FUEL_BANJOS.filter((b) => b.id.startsWith('inj-')).map((b) => b.face);
    const radii = faces.map((f) => Math.hypot(f[0] - FD_CX, f[2] - FD_CZ));
    for (const r of radii) expect(r).toBeCloseTo(FD_RING_R, 5);
    const stubs = FUEL_LINES.filter((l) => l.id.startsWith('inj-')).map((l) => l.a);
    for (const s of stubs) {
      const radial = [s.point[0] - FD_CX, s.point[2] - FD_CZ];
      const L = Math.hypot(radial[0], radial[1]) || 1;
      const dot = (s.axis[0] * radial[0] + s.axis[2] * radial[1]) / L;
      expect(dot).toBeGreaterThan(0.9);
    }
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
