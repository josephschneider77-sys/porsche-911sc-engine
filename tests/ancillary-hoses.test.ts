import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { ASSET_BUILDERS } from '../src/geo/assets';
import { PARTS, PART_BY_ID } from '../src/data/parts';
import { TEE_AIR_INJ, THROTTLE_PORTED_VAC } from '../src/geo/induction';
import { AIR_CHECK_VALVE_OUTLET, heaterStub, EGR_FEED_PORT } from '../src/geo/aux';
import { checkValveInlet, DIVERTER_VAC, DIVERTER_VAC_EGR, EGR_BARB_2 } from '../src/geo/bottomAnc';

const poseOf = (id: string) => {
  const d = PART_BY_ID[id];
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...(d.position ?? [0, 0, 0])),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...(d.rotation ?? [0, 0, 0]))),
    new THREE.Vector3(1, 1, 1),
  );
};

function partBVH(id: string) {
  const root = ASSET_BUILDERS[PART_BY_ID[id].asset]();
  root.updateMatrixWorld(true);
  const pose = poseOf(id);
  const out: number[] = [];
  const v = new THREE.Vector3();
  root.traverse((o: any) => {
    if (!o.isMesh) return;
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

/** Ring centres of every tube in the part. Corrugation is radial, so the centres stay on the path. */
function centerlines(partId: string): THREE.Vector3[][] {
  const root = ASSET_BUILDERS[PART_BY_ID[partId].asset]();
  root.updateMatrixWorld(true);
  const pose = poseOf(partId);
  const lines: THREE.Vector3[][] = [];
  root.traverse((o: any) => {
    if (!o.isMesh) return;
    const radial = o.geometry.parameters?.radialSegments as number | undefined;
    const tubular = o.geometry.parameters?.tubularSegments as number | undefined;
    if (radial == null || tubular == null) return;
    const stride = radial + 1;
    const P = o.geometry.attributes.position;
    const w = pose.clone().multiply(o.matrixWorld);
    const centers: THREE.Vector3[] = [];
    for (let i = 0; i <= tubular; i++) {
      const c = new THREE.Vector3();
      // The seam vertex is stored twice. Averaging it in pulls the centre off the path.
      for (let j = 0; j < radial; j++) c.add(new THREE.Vector3().fromBufferAttribute(P, i * stride + j));
      centers.push(c.multiplyScalar(1 / radial).applyMatrix4(w));
    }
    lines.push(centers);
  });
  return lines;
}

function pathLength(pts: THREE.Vector3[]) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += pts[i].distanceTo(pts[i - 1]);
  return L;
}

/** Smallest centreline bend, sampled on chords of about 8 mm. Straight runs return Infinity. */
function minBend(pts: THREE.Vector3[]) {
  let min = Infinity;
  for (let i = 1; i < pts.length - 1; i++) {
    const b = pts[i];
    let ia = i - 1;
    while (ia > 0 && pts[ia].distanceTo(b) < 8) ia--;
    let ic = i + 1;
    while (ic < pts.length - 1 && pts[ic].distanceTo(b) < 8) ic++;
    const a = pts[ia], c = pts[ic];
    const ab = a.distanceTo(b), bc = b.distanceTo(c), ca = c.distanceTo(a);
    if (ab < 2 || bc < 2) continue;
    const s = (ab + bc + ca) / 2;
    const k = s * (s - ab) * (s - bc) * (s - ca);
    if (k <= 1e-4) continue;
    const R = (ab * bc * ca) / (4 * Math.sqrt(k));
    if (R < min) min = R;
  }
  return min;
}

const nearest = (lines: THREE.Vector3[][], p: THREE.Vector3) => {
  let d = Infinity;
  for (const line of lines) for (const q of line) d = Math.min(d, q.distanceTo(p));
  return d;
};

describe('ancillary hose ends', () => {
  const bvh = new Map<string, MeshBVH>();
  const fitting = (id: string) => {
    if (!bvh.has(id)) bvh.set(id, partBVH(id));
    return bvh.get(id)!;
  };
  const sideOf = (axis: THREE.Vector3) => {
    const side0 = new THREE.Vector3(0, 1, 0).cross(axis);
    if (side0.lengthSq() < 1e-6) side0.set(1, 0, 0);
    return side0.normalize();
  };
  const faceAt = (part: string, point: THREE.Vector3, axis: THREE.Vector3, radii: number[]) => {
    const side0 = sideOf(axis);
    return radii.some((rad) => {
      const origin = point.clone().addScaledVector(axis, 2).addScaledVector(side0, rad);
      const hit = fitting(part).raycastFirst(new THREE.Ray(origin, axis.clone().negate()), THREE.DoubleSide) as any;
      return hit && Math.abs(hit.distance - 2) <= 1.2;
    });
  };
  /** Open spigot: there is no end cap, so the wall is the face. Shoot inward 6 mm onto the nipple. */
  const wallAt = (part: string, point: THREE.Vector3, axis: THREE.Vector3, radii: number[]) => {
    const side0 = sideOf(axis);
    return radii.some((rad) => {
      const origin = point.clone().addScaledVector(axis, -6).addScaledVector(side0, rad + 6);
      const hit = fitting(part).raycastFirst(new THREE.Ray(origin, side0.clone().negate()), THREE.DoubleSide) as any;
      return hit && Math.abs(hit.distance - 6) <= 1.2;
    });
  };

  const solid = [1.2, 4, 8, 14];
  const ends: { hose: string; point: THREE.Vector3; axis: THREE.Vector3; fitting: string; radii?: number[] }[] = [
    { hose: 'air-hose-vacuum', point: new THREE.Vector3(...TEE_AIR_INJ.point), axis: new THREE.Vector3(...TEE_AIR_INJ.axis), fitting: 'vacuum-fittings' },
    { hose: 'air-hose-vacuum', point: new THREE.Vector3(...DIVERTER_VAC), axis: new THREE.Vector3(1, 0, 0), fitting: 'air-diverter' },
    { hose: 'egr-hose-long', point: new THREE.Vector3(...THROTTLE_PORTED_VAC.point), axis: new THREE.Vector3(...THROTTLE_PORTED_VAC.axis), fitting: 'throttle-housing' },
    { hose: 'air-hose-valve', point: new THREE.Vector3(...checkValveInlet()), axis: new THREE.Vector3(0, 1, 0), fitting: 'air-check-valve' },
    { hose: 'heater-hose-right', point: new THREE.Vector3(...heaterStub(1).tip), axis: new THREE.Vector3(...heaterStub(1).axis), fitting: 'heat-exchanger-right', radii: [11.2, 11.6, 12] },
    { hose: 'heater-hose-left', point: new THREE.Vector3(...heaterStub(-1).tip), axis: new THREE.Vector3(...heaterStub(-1).axis), fitting: 'heat-exchanger-left', radii: [11.2, 11.6, 12] },
    { hose: 'egr-pipe-feed', point: new THREE.Vector3(...EGR_FEED_PORT.tip), axis: new THREE.Vector3(...EGR_FEED_PORT.axis), fitting: 'heat-exchanger-left', radii: [7.2, 7.6, 8] },
    { hose: 'egr-hose-pair', point: new THREE.Vector3(...DIVERTER_VAC_EGR), axis: new THREE.Vector3(1, 0, 0), fitting: 'air-diverter' },
    { hose: 'egr-hose-pair', point: new THREE.Vector3(...EGR_BARB_2.point), axis: new THREE.Vector3(...EGR_BARB_2.axis), fitting: 'egr-valve' },
  ];

  it('each listed port has a hose or pipe centreline on it, and the fitting face is there', () => {
    const bad: string[] = [];
    for (const end of ends) {
      const lines = centerlines(end.hose);
      const d = nearest(lines, end.point);
      if (d > 0.5) bad.push(`${end.hose} @ ${end.fitting}: centreline ${d.toFixed(2)} mm from the port`);
      const radii = end.radii ?? solid;
      const face = faceAt(end.fitting, end.point, end.axis, radii) || (end.radii != null && wallAt(end.fitting, end.point, end.axis, radii));
      if (!face) bad.push(`${end.hose} @ ${end.fitting}: fitting face is not at the seat`);
    }
    const outlet = new THREE.Vector3(...AIR_CHECK_VALVE_OUTLET.point);
    const outletAxis = new THREE.Vector3(...AIR_CHECK_VALVE_OUTLET.direction);
    if (!faceAt('air-check-valve', outlet, outletAxis, solid)) bad.push('AIR_CHECK_VALVE_OUTLET: hex face is not at the outlet');
    expect(bad).toEqual([]);
  });
});

describe('ancillary hose bend and length', () => {
  // OD is 2× the tube radius. The bend floor is 1.5× OD.
  // Lengths with a catalogue millimetre note are 202-05 #15 (40) and #16 (770).
  // The others have no printed length; the ceiling is what rejects the old loops.
  const hoses: { id: string; od: number; length: { target?: number; tol?: number; max?: number } }[] = [
    { id: 'air-hose-pump', od: 12, length: { max: 420 } },
    { id: 'air-hose-valve', od: 12, length: { max: 380 } },
    { id: 'air-hose-dump', od: 12, length: { max: 180 } },
    { id: 'air-hose-vacuum', od: 4.4, length: { max: 900 } },
    { id: 'egr-hose-short', od: 4.4, length: { target: 40, tol: 8 } },
    { id: 'egr-hose-long', od: 4.4, length: { target: 770, tol: 40 } },
    { id: 'egr-hose-pair', od: 4.4, length: { max: 700 } },
    { id: 'heater-hose-link', od: 18, length: { max: 280 } },
    { id: 'heater-hose-left', od: 30, length: { max: 900 } },
    { id: 'heater-hose-right', od: 30, length: { max: 550 } },
  ];

  it('every hose bends at least 1.5× its outside diameter', () => {
    const bad: string[] = [];
    for (const h of hoses) {
      const floor = 1.5 * h.od;
      for (const [i, line] of centerlines(h.id).entries()) {
        const r = minBend(line);
        if (r < floor - 0.5) bad.push(`${h.id}[${i}]: bend ${r.toFixed(1)} mm, floor ${floor} mm`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('lengths match the catalogue where it prints one, and stay off the old loops', () => {
    const bad: string[] = [];
    for (const h of hoses) {
      const lines = centerlines(h.id);
      if (!lines.length) bad.push(`${h.id}: no tube`);
      for (const [i, line] of lines.entries()) {
        const L = pathLength(line);
        const spec = h.length;
        if (spec.target != null && Math.abs(L - spec.target) > (spec.tol ?? 0)) {
          bad.push(`${h.id}[${i}]: ${L.toFixed(0)} mm, catalogue ${spec.target} ± ${spec.tol}`);
        }
        if (spec.max != null && L > spec.max) bad.push(`${h.id}[${i}]: ${L.toFixed(0)} mm exceeds ${spec.max}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('ported-vacuum lead-in', () => {
  it('a ray of at least 30 mm from the throttle nipple tip along its axis misses every assembled part', () => {
    const point = new THREE.Vector3(...THROTTLE_PORTED_VAC.point);
    const axis = new THREE.Vector3(...THROTTLE_PORTED_VAC.axis).normalize();
    // Half a millimetre off the cap, so the ray starts in the lead-in rather than on the face.
    const origin = point.clone().addScaledVector(axis, 0.5);
    const solids: { id: string; bvh: MeshBVH; box: THREE.Box3 }[] = [];
    for (const p of PARTS) {
      const root = ASSET_BUILDERS[p.asset]();
      root.updateMatrixWorld(true);
      const pose = new THREE.Matrix4().compose(
        new THREE.Vector3(...(p.position ?? [0, 0, 0])),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rotation ?? [0, 0, 0]))),
        new THREE.Vector3(1, 1, 1),
      );
      const out: number[] = [];
      const v = new THREE.Vector3();
      root.traverse((o: any) => {
        if (!o.isMesh) return;
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
      if (!out.length) continue;
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
      const bvh = new MeshBVH(geom);
      geom.computeBoundingBox();
      solids.push({ id: p.id, bvh, box: geom.boundingBox!.clone() });
    }
    let best = Infinity;
    let who = '';
    for (const s of solids) {
      const ray = new THREE.Ray(origin, axis);
      if (!ray.intersectsBox(s.box)) continue;
      const hit = s.bvh.raycastFirst(ray, THREE.DoubleSide) as { distance: number } | null;
      if (hit && hit.distance < best) { best = hit.distance; who = s.id; }
    }
    const fromTip = best + 0.5;
    expect(fromTip, `first hit ${who} at ${fromTip.toFixed(1)} mm`).toBeGreaterThanOrEqual(30);
  });
});
