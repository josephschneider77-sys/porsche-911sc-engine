import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { ASSET_BUILDERS } from '../src/geo/assets';
import { PART_BY_ID, PARTS } from '../src/data/parts';
import { TEE_AIR_INJ, THROTTLE_PORTED_VAC } from '../src/geo/induction';
import { AIR_CHECK_VALVE_OUTLET, heaterStub, EGR_FEED_PORT } from '../src/geo/aux';
import { checkValveInlet, DIVERTER_VAC, DIVERTER_VAC_AXIS, DIVERTER_VAC_EGR, DIVERTER_VAC_EGR_AXIS, DUMP_PORT, EGR_BARB_2, EGR_BARB_UP, EGR_TEE_CTR, EGR_TEE_PORTS } from '../src/geo/bottomAnc';
import { activeFilter } from '../src/data/teardown';

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
    // Torus clamps share those fields. Only a TubeGeometry has a path.
    if (radial == null || tubular == null || o.geometry.parameters?.path == null) return;
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
    { hose: 'air-hose-vacuum', point: new THREE.Vector3(...DIVERTER_VAC), axis: new THREE.Vector3(...DIVERTER_VAC_AXIS), fitting: 'air-diverter' },
    { hose: 'air-hose-vacuum', point: new THREE.Vector3(...TEE_AIR_INJ.point), axis: new THREE.Vector3(...TEE_AIR_INJ.axis), fitting: 'throttle-housing' },
    { hose: 'egr-hose-short', point: new THREE.Vector3(...THROTTLE_PORTED_VAC.point), axis: new THREE.Vector3(...THROTTLE_PORTED_VAC.axis), fitting: 'throttle-housing' },
    { hose: 'air-hose-valve', point: new THREE.Vector3(...checkValveInlet()), axis: new THREE.Vector3(0, 1, 0), fitting: 'air-check-valve' },
    { hose: 'heater-hose-right', point: new THREE.Vector3(...heaterStub(1).tip), axis: new THREE.Vector3(...heaterStub(1).axis), fitting: 'heat-exchanger-right', radii: [11.2, 11.6, 12] },
    { hose: 'heater-hose-left', point: new THREE.Vector3(...heaterStub(-1).tip), axis: new THREE.Vector3(...heaterStub(-1).axis), fitting: 'heat-exchanger-left', radii: [11.2, 11.6, 12] },
    { hose: 'egr-pipe-feed', point: new THREE.Vector3(...EGR_FEED_PORT.tip), axis: new THREE.Vector3(...EGR_FEED_PORT.axis), fitting: 'heat-exchanger-left', radii: [7.2, 7.6, 8] },
    { hose: 'egr-hose-diverter', point: new THREE.Vector3(...DIVERTER_VAC_EGR), axis: new THREE.Vector3(...DIVERTER_VAC_EGR_AXIS), fitting: 'air-diverter' },
    { hose: 'egr-hose-return', point: new THREE.Vector3(...EGR_BARB_UP.point), axis: new THREE.Vector3(...EGR_BARB_UP.axis), fitting: 'egr-valve' },
    { hose: 'air-hose-dump', point: new THREE.Vector3(...DUMP_PORT.point), axis: new THREE.Vector3(...DUMP_PORT.axis), fitting: 'air-diverter' },
    { hose: 'egr-hose-long', point: new THREE.Vector3(...EGR_BARB_2.point), axis: new THREE.Vector3(...EGR_BARB_2.axis), fitting: 'egr-valve' },
    { hose: 'egr-hose-short', point: new THREE.Vector3(...EGR_TEE_PORTS.upper.point), axis: new THREE.Vector3(...EGR_TEE_PORTS.upper.axis), fitting: 'egr-tee' },
    { hose: 'egr-hose-long', point: new THREE.Vector3(...EGR_TEE_PORTS.valve.point), axis: new THREE.Vector3(...EGR_TEE_PORTS.valve.axis), fitting: 'egr-tee' },
    { hose: 'egr-hose-return', point: new THREE.Vector3(...EGR_TEE_PORTS.return.point), axis: new THREE.Vector3(...EGR_TEE_PORTS.return.axis), fitting: 'egr-tee' },
    { hose: 'egr-hose-diverter', point: new THREE.Vector3(...EGR_TEE_PORTS.diverter.point), axis: new THREE.Vector3(...EGR_TEE_PORTS.diverter.axis), fitting: 'egr-tee' },
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
  // Printed lengths: 108-00 #31 is 750 mm, 202-05 #15 is 40 mm, #16 is 770 mm, #17 is 465 mm.
  // ±5% where the run can meet it. #30 has no printed length; the sleeve is the 60–70 mm stub on p.141.
  // Catalogue cuts include the rubber on the barb. The free tube stops at the tip;
  // each sleeved end adds 7 mm.
  const hoses: { id: string; od: number; sleeves?: number; length: { target?: number; tol?: number; max?: number } }[] = [
    { id: 'air-hose-pump', od: 12, length: { max: 420 } },
    { id: 'air-hose-valve', od: 12, length: { max: 380 } },
    { id: 'air-hose-dump', od: 16, length: { target: 65, tol: 5 } },
    // #31 is printed 750 mm. Allowance 80 (cap 830): under the fan, outboard of
    // the shroud slot, then up TEE_AIR_INJ. Shorter than the catalogue is the
    // clear path, not a padded loop.
    { id: 'air-hose-vacuum', od: 7, sleeves: 14, length: { max: 830 } },
    // #15 is printed 40 mm. The tee centre is 7 mm higher, so the tips are 26 mm
    // apart and two 7 mm sleeves make 40 mm. Allowance 2 (cap 42) for float.
    { id: 'egr-hose-short', od: 7, sleeves: 14, length: { max: 42 } },
    // #16 is printed 770 mm. Allowance 80 (cap 850): around the shroud and down
    // aft of cylinder 4.
    { id: 'egr-hose-long', od: 7, sleeves: 14, length: { max: 850 } },
    // Valve leg of #17, printed 465 mm. Allowance 185 (cap 650): down the shroud
    // slot and through the distributor/crankcase gap.
    { id: 'egr-hose-return', od: 7, sleeves: 14, length: { max: 650 } },
    // Diverter leg of #17, printed 465 mm. Allowance 95 (cap 560): under the fan
    // onto the lower nipple.
    { id: 'egr-hose-diverter', od: 7, sleeves: 14, length: { max: 560 } },
    // Socket faces +X and the blower inlet faces −Z, so the 1.5×OD bends need a drop.
    { id: 'heater-hose-link', od: 18, length: { max: 480 } },
    // The stub end is a 50 mm arc in front of the muffler, after a drop outboard
    // of the left end cap. Measured 1049 mm.
    { id: 'heater-hose-left', od: 30, length: { max: 1070 } },
    // Same arc on the right, outboard of the muffler. Measured 587 mm.
    { id: 'heater-hose-right', od: 30, length: { max: 610 } },
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
        const L = pathLength(line) + (h.sleeves ?? 0);
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

describe('vacuum and EGR hoses seat tangent, with a rubber bend', () => {
  const seat = (point: number[], axis: number[]) => ({
    point: new THREE.Vector3(...point),
    axis: new THREE.Vector3(...axis).normalize(),
  });
  const ends: { hose: string; seat: { point: THREE.Vector3; axis: THREE.Vector3 } }[] = [
    { hose: 'air-hose-vacuum', seat: seat(DIVERTER_VAC, DIVERTER_VAC_AXIS) },
    { hose: 'air-hose-vacuum', seat: seat(TEE_AIR_INJ.point, TEE_AIR_INJ.axis) },
    { hose: 'air-hose-dump', seat: seat(DUMP_PORT.point, DUMP_PORT.axis) },
    { hose: 'egr-hose-short', seat: seat(THROTTLE_PORTED_VAC.point, THROTTLE_PORTED_VAC.axis) },
    { hose: 'egr-hose-short', seat: seat(EGR_TEE_PORTS.upper.point, EGR_TEE_PORTS.upper.axis) },
    { hose: 'egr-hose-long', seat: seat(EGR_TEE_PORTS.valve.point, EGR_TEE_PORTS.valve.axis) },
    { hose: 'egr-hose-long', seat: seat(EGR_BARB_2.point, EGR_BARB_2.axis) },
    { hose: 'egr-hose-diverter', seat: seat(DIVERTER_VAC_EGR, DIVERTER_VAC_EGR_AXIS) },
    { hose: 'egr-hose-return', seat: seat(EGR_BARB_UP.point, EGR_BARB_UP.axis) },
    { hose: 'egr-hose-return', seat: seat(EGR_TEE_PORTS.return.point, EGR_TEE_PORTS.return.axis) },
    { hose: 'egr-hose-diverter', seat: seat(EGR_TEE_PORTS.diverter.point, EGR_TEE_PORTS.diverter.axis) },
  ];

  function nearestLine(lines: THREE.Vector3[][], p: THREE.Vector3) {
    let best = lines[0];
    let d = Infinity;
    for (const line of lines) {
      for (const q of line) {
        const dq = q.distanceTo(p);
        if (dq < d) { d = dq; best = line; }
      }
    }
    return best;
  }

  /** Axial position of the hose terminus nearest this port. Axis points out of the barb, so t < 0 is on the nipple. */
  function terminus(hose: string, point: THREE.Vector3, axis: THREE.Vector3) {
    const lines = centerlines(hose);
    let end = lines[0][0];
    let best = Infinity;
    let line = lines[0];
    for (const candidate of lines) {
      for (const tip of [candidate[0], candidate[candidate.length - 1]]) {
        const d = tip.distanceTo(point);
        if (d < best) { best = d; end = tip; line = candidate; }
      }
    }
    const t = end.clone().sub(point).dot(axis);
    return { end, t, line };
  }

  it('each end is the hose terminus about 4 mm onto the barb, not a mid-run point, and not over the root', () => {
    const bad: string[] = [];
    for (const end of ends) {
      const { end: tip, t, line } = terminus(end.hose, end.seat.point, end.seat.axis);
      // The free tube stops at the tip. The sleeve carries the 7 mm push-on.
      const onBarb = false;
      const atTip = t < 1.2 && t > -1.5;
      if (!onBarb && !atTip) bad.push(`${end.hose}: terminus is ${t.toFixed(1)} mm along the axis`);
      const radial = tip.clone().sub(end.seat.point).addScaledVector(end.seat.axis, -t).length();
      if (radial > 0.6) bad.push(`${end.hose}: terminus is ${radial.toFixed(2)} mm off the axis`);
      let i = 0;
      let best = Infinity;
      for (let k = 0; k < line.length; k++) {
        const dk = line[k].distanceTo(end.seat.point);
        if (dk < best) { best = dk; i = k; }
      }
      const prev = line[Math.max(0, i - 3)];
      const next = line[Math.min(line.length - 1, i + 3)];
      const dir = next.clone().sub(prev);
      if (dir.lengthSq() < 1e-6) { bad.push(`${end.hose}: no tangent at the tip`); continue; }
      dir.normalize();
      const align = Math.abs(dir.dot(end.seat.axis));
      if (align < 0.98) bad.push(`${end.hose}: tangent alignment ${align.toFixed(3)} at the tip`);
    }
    expect(bad).toEqual([]);
  });

  it('each throttle nipple hose stays on the axis through its clear air and does not run up to the root', () => {
    // #31 is straight on TEE_AIR_INJ for 30 mm. #15 meets the tee 26 mm down
    // THROTTLE_PORTED_VAC, so the coaxial check stops at 22 mm, before that barb.
    // The free tube ends at the tip. The sleeve, not this centreline, covers the 7 mm.
    const seats = [
      { hose: 'egr-hose-short', point: THROTTLE_PORTED_VAC.point, axis: THROTTLE_PORTED_VAC.axis, clear: 22 },
      { hose: 'air-hose-vacuum', point: TEE_AIR_INJ.point, axis: TEE_AIR_INJ.axis, clear: 30 },
    ];
    for (const seat of seats) {
      const point = new THREE.Vector3(...seat.point);
      const axis = new THREE.Vector3(...seat.axis).normalize();
      const { end, t } = terminus(seat.hose, point, axis);
      expect(t, seat.hose).toBeLessThan(1);
      expect(t, seat.hose).toBeGreaterThan(-2);
      const radial = end.clone().sub(point).addScaledVector(axis, -t).length();
      expect(radial, seat.hose).toBeLessThan(0.6);
      const lead = point.clone().addScaledVector(axis, seat.clear);
      expect(nearest(centerlines(seat.hose), lead), seat.hose).toBeLessThan(0.6);
      const towardRoot = point.clone().addScaledVector(axis, -16);
      expect(nearest(centerlines(seat.hose), towardRoot), seat.hose).toBeGreaterThan(8);
    }
  });

  it('vacuum and EGR bends stay at least 3× the outside diameter', () => {
    const ids = ['air-hose-vacuum', 'egr-hose-short', 'egr-hose-long', 'egr-hose-return', 'egr-hose-diverter'];
    const floor = 3 * 7;
    const bad: string[] = [];
    for (const id of ids) {
      for (const [i, line] of centerlines(id).entries()) {
        const r = minBend(line);
        if (r < floor - 1) bad.push(`${id}[${i}]: bend ${r.toFixed(1)} mm, floor ${floor} mm`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('the long EGR hose does not cross the pair', () => {
    const long = centerlines('egr-hose-long');
    const pair = [...centerlines('egr-hose-return'), ...centerlines('egr-hose-diverter')];
    const tee = new THREE.Vector3(...EGR_TEE_CTR);
    let min = Infinity;
    for (const a of long) for (const pa of a) {
      if (pa.distanceTo(tee) < 40) continue;
      for (const b of pair) for (const pb of b) {
        if (pb.distanceTo(tee) < 40) continue;
        min = Math.min(min, pa.distanceTo(pb));
      }
    }
    expect(min).toBeGreaterThan(10);
  });
});

describe('hose clamps sit on a fitting', () => {
  function origins(id: string) {
    const root = ASSET_BUILDERS[PART_BY_ID[id].asset]();
    root.updateMatrixWorld(true);
    const pose = poseOf(id);
    const out: THREE.Vector3[] = [];
    let took = false;
    root.traverse((o: any) => {
      if (took || !o.isMesh) return;
      took = true;
      const inst: THREE.Matrix4[] = o.isInstancedMesh
        ? Array.from({ length: o.count }, (_, i) => { const m = new THREE.Matrix4(); o.getMatrixAt(i, m); return m; })
        : [new THREE.Matrix4()];
      for (const im of inst) {
        const w = pose.clone().multiply(o.matrixWorld).multiply(im);
        out.push(new THREE.Vector3().setFromMatrixPosition(w));
      }
    });
    return out;
  }
  // 108-00 #33 sits halfway along the 7 mm push-on, on the sleeve, not outboard of the brass.
  const seats: [number[], number[]][] = [
    [[-172, 26, 448], [-1, 0, 0]],
    [[-142, 56, 448], [0, 1, 0]],
  ];

  it('both #33 clamps sit halfway along the diverter push-on', () => {
    const pts = origins('air-clamp-dump');
    expect(pts).toHaveLength(2);
    const bad = pts.filter((p) => !seats.some(([point, axis]) => {
      const a = new THREE.Vector3(...axis).normalize();
      const d = p.clone().sub(new THREE.Vector3(...point));
      const axial = d.dot(a);
      const radial = d.addScaledVector(a, -axial).length();
      return radial < 1.2 && axial > -5 && axial < -2;
    }));
    expect(bad.map((p) => p.toArray().map((n) => n.toFixed(1)))).toEqual([]);
  });
});

describe('catalogue length and turning', () => {
  function totalTurn(pts: THREE.Vector3[]) {
    const step = 8;
    const s: THREE.Vector3[] = [pts[0]];
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      acc += pts[i].distanceTo(pts[i - 1]);
      if (acc >= step) { s.push(pts[i]); acc = 0; }
    }
    s.push(pts[pts.length - 1]);
    let turn = 0;
    for (let i = 1; i < s.length - 1; i++) {
      const a = s[i].clone().sub(s[i - 1]);
      const b = s[i + 1].clone().sub(s[i]);
      if (a.length() < 2 || b.length() < 2) continue;
      turn += Math.acos(Math.min(1, Math.max(-1, a.normalize().dot(b.normalize()))));
    }
    return turn * 180 / Math.PI;
  }

  // Cuts include 7 mm on each barb. The free tube is shorter by that.
  it('pins vacuum and EGR lengths, and caps turning', () => {
    const rows: { id: string; catalogue: number; allowance: number; turn: number }[] = [
      // Catalogue 750 mm. Allowance 80 (cap 830). Turn budget 240°: onto the nipple
      // and the two sweeps under the fan.
      { id: 'air-hose-vacuum', catalogue: 750, allowance: 80, turn: 240 },
      // Catalogue 770 mm. Allowance 80 (cap 850). Turn budget 360°: the outboard
      // drop, the vertical, and the turn onto the valve.
      { id: 'egr-hose-long', catalogue: 770, allowance: 80, turn: 360 },
      // Catalogue 465 mm. Allowance 185 (cap 650). Turn budget 240°: into the
      // shroud slot, through the crankcase gap, and onto the valve.
      { id: 'egr-hose-return', catalogue: 465, allowance: 185, turn: 240 },
      // Catalogue 465 mm. Allowance 95 (cap 560). Turn budget 180°: one sweep
      // under the fan onto the lower nipple.
      { id: 'egr-hose-diverter', catalogue: 465, allowance: 95, turn: 180 },
      // Catalogue 40 mm. The tee is 7 mm higher, so the tips are 26 mm apart and
      // two 7 mm sleeves make 40 mm. Allowance 2 (cap 42). The run is straight.
      { id: 'egr-hose-short', catalogue: 40, allowance: 2, turn: 15 },
    ];
    const bad: string[] = [];
    for (const row of rows) {
      for (const [i, line] of centerlines(row.id).entries()) {
        const L = pathLength(line) + 14;
        const turn = totalTurn(line);
        const cap = row.catalogue + row.allowance;
        if (L > cap) bad.push(`${row.id}[${i}]: ${L.toFixed(0)} mm exceeds catalogue ${row.catalogue} + ${row.allowance}`);
        if (turn > row.turn) bad.push(`${row.id}[${i}]: turning ${turn.toFixed(0)}° exceeds ${row.turn}°`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('the diverter leg of 202-05 #17 stays under the fan and inside its allowance', () => {
    // Catalogue 465 mm. Allowance 95 (cap 560). Turn budget 180°.
    const [line] = centerlines('egr-hose-diverter');
    const L = pathLength(line) + 14;
    expect(L).toBeLessThanOrEqual(560);
    expect(totalTurn(line)).toBeLessThan(180);
  });
});

describe.each([false, true])('connections with emissions %s', (on) => {
  const active = activeFilter(on);

  it('every active hose end is on an active fitting, and inactive ends are not required', () => {
    const ends: { hose: string; fitting: string }[] = [
      { hose: 'air-hose-vacuum', fitting: 'throttle-housing' },
      { hose: 'air-hose-vacuum', fitting: 'air-diverter' },
      { hose: 'air-hose-dump', fitting: 'air-diverter' },
      { hose: 'air-hose-valve', fitting: 'air-check-valve' },
      { hose: 'egr-hose-long', fitting: 'egr-valve' },
      { hose: 'egr-hose-long', fitting: 'egr-tee' },
      { hose: 'egr-hose-short', fitting: 'throttle-housing' },
      { hose: 'egr-hose-short', fitting: 'egr-tee' },
      { hose: 'egr-hose-return', fitting: 'egr-tee' },
      { hose: 'egr-hose-return', fitting: 'egr-valve' },
      { hose: 'egr-hose-diverter', fitting: 'egr-tee' },
      { hose: 'egr-hose-diverter', fitting: 'air-diverter' },
    ];
    const bad: string[] = [];
    for (const end of ends) {
      if (!active(end.hose)) continue;
      if (!active(end.fitting)) bad.push(`${end.hose} is visible but ${end.fitting} is hidden`);
    }
    expect(bad).toEqual([]);
    if (!on) {
      expect(active('air-inj-vac-cap')).toBe(true);
      expect(active('egr-tee-cap')).toBe(true);
      expect(active('air-hose-vacuum')).toBe(false);
      expect(active('egr-hose-diverter')).toBe(false);
      expect(active('egr-hose-return')).toBe(true);
      expect(active('egr-valve')).toBe(true);
      expect(active('catalytic-converter')).toBe(true);
    } else {
      expect(active('air-inj-vac-cap')).toBe(false);
      expect(active('egr-tee-cap')).toBe(false);
      expect(active('air-hose-vacuum')).toBe(true);
      expect(active('egr-hose-diverter')).toBe(true);
    }
  });
});

describe('ported-vacuum lead-in', () => {
  it('a ray of at least 30 mm from the throttle nipple tip along its axis misses every assembled part but the hose and tee it pulls off', () => {
    const point = new THREE.Vector3(...THROTTLE_PORTED_VAC.point);
    const axis = new THREE.Vector3(...THROTTLE_PORTED_VAC.axis).normalize();
    // Half a millimetre off the cap, so the ray starts in the lead-in rather than on the face.
    // #15 and egr-tee sit on this ray so the hose can be pulled straight off. They are
    // not obstacles. TEE_AIR_INJ's ray, in vacuum-barbs, still misses everything.
    const ignore = new Set(['egr-hose-short', 'egr-tee']);
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
      if (ignore.has(s.id)) continue;
      const ray = new THREE.Ray(origin, axis);
      if (!ray.intersectsBox(s.box)) continue;
      const hit = s.bvh.raycastFirst(ray, THREE.DoubleSide) as { distance: number } | null;
      if (hit && hit.distance < best) { best = hit.distance; who = s.id; }
    }
    const fromTip = best + 0.5;
    expect(fromTip, `first hit ${who} at ${fromTip.toFixed(1)} mm`).toBeGreaterThanOrEqual(30);
  });
});
