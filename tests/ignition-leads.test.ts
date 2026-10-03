import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { findCollisions } from './collide';
import { PLUG_CONNECTOR_TERMINAL } from '../src/geo/assets';
import { ignitionLeadRuns, ignitionLeads, LEAD_R, LEAD_MIN_BEND, LEAD_TOWER, DIST, DIST_AXIS, distW } from '../src/geo/aux';
import { activeFilter } from '../src/data/teardown';

const INSERT = 6;
const axis = new THREE.Vector3(...DIST_AXIS);

function circumR(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) {
  const ab = a.distanceTo(b), bc = b.distanceTo(c), ca = c.distanceTo(a);
  const cross = b.clone().sub(a).cross(c.clone().sub(a)).length();
  if (cross < 1e-4 || ab < 0.4 || bc < 0.4) return Infinity;
  return (ab * bc * ca) / (2 * cross);
}
function minBend(pts: THREE.Vector3[]) {
  let m = Infinity;
  for (let i = 1; i < pts.length - 1; i++) m = Math.min(m, circumR(pts[i - 1], pts[i], pts[i + 1]));
  return m;
}
function segDist(a0: THREE.Vector3, a1: THREE.Vector3, b0: THREE.Vector3, b1: THREE.Vector3) {
  const u = a1.clone().sub(a0), v = b1.clone().sub(b0), w = a0.clone().sub(b0);
  const a = u.dot(u), b = u.dot(v), c = v.dot(v), d = u.dot(w), e = v.dot(w);
  const D = a * c - b * b;
  let sN: number, sD = D, tN: number, tD = D;
  if (D < 1e-8) { sN = 0; sD = 1; tN = e; tD = c; }
  else {
    sN = b * e - c * d; tN = a * e - b * d;
    if (sN < 0) { sN = 0; tN = e; tD = c; }
    else if (sN > sD) { sN = sD; tN = e + b; tD = c; }
  }
  if (tN < 0) { tN = 0; if (-d < 0) sN = 0; else if (-d > a) sN = sD; else { sN = -d; sD = a; } }
  else if (tN > tD) { tN = tD; if (-d + b < 0) sN = 0; else if (-d + b > a) sN = sD; else { sN = -d + b; sD = a; } }
  const sc = Math.abs(sN) < 1e-8 ? 0 : sN / sD;
  const tc = Math.abs(tN) < 1e-8 ? 0 : tN / tD;
  return a0.clone().addScaledVector(u, sc).distanceTo(b0.clone().addScaledVector(v, tc));
}
function minSep(a: THREE.Vector3[], b: THREE.Vector3[]) {
  let m = Infinity;
  for (let i = 1; i < a.length; i++) for (let j = 1; j < b.length; j++) m = Math.min(m, segDist(a[i - 1], a[i], b[j - 1], b[j]));
  return m;
}
function towerMouth(i: number) {
  const a = (i / 6) * Math.PI * 2;
  return new THREE.Vector3(...distW(DIST.towerR * Math.cos(a), DIST.towerY + 33, DIST.towerR * Math.sin(a)));
}
/** Radial offset from `dir` through `origin`, and the signed distance along `dir`. */
function axisPlace(p: THREE.Vector3, origin: THREE.Vector3, dir: THREE.Vector3) {
  const d = p.clone().sub(origin);
  const along = d.dot(dir);
  return { along, radial: d.addScaledVector(dir, -along).length() };
}
function lengthOf(pts: THREE.Vector3[]) {
  let n = 0;
  for (let i = 1; i < pts.length; i++) n += pts[i].distanceTo(pts[i - 1]);
  return n;
}

describe.each([false, true])('ignition leads (emissions %s)', (emissions) => {
  const runs = ignitionLeadRuns();
  const plugs = runs.filter((r) => r.cyl != null);

  it('each plug lead seats on its connector and its firing-order tower', () => {
    for (const run of plugs) {
      const cyl = run.cyl!;
      const term = PLUG_CONNECTOR_TERMINAL(cyl);
      const start = run.points[0];
      const startDir = run.points[1].clone().sub(start).normalize();
      const atPlug = axisPlace(start, term.point, term.direction);
      expect(atPlug.radial, `cyl ${cyl} plug radial`).toBeLessThan(0.3);
      expect(atPlug.along, `cyl ${cyl} plug insert`).toBeCloseTo(-INSERT, 1);
      expect(startDir.dot(term.direction), `cyl ${cyl} leaves along the connector`).toBeGreaterThan(0.98);

      const tower = LEAD_TOWER[cyl];
      expect(run.tower, `cyl ${cyl} tower`).toBe(tower);
      const mouth = towerMouth(tower);
      const end = run.points[run.points.length - 1];
      const endDir = end.clone().sub(run.points[run.points.length - 2]).normalize();
      const atCap = axisPlace(end, mouth, axis);
      expect(atCap.radial, `cyl ${cyl} tower radial`).toBeLessThan(0.3);
      expect(atCap.along, `cyl ${cyl} tower insert`).toBeCloseTo(-INSERT, 1);
      expect(endDir.dot(axis.clone().negate()), `cyl ${cyl} enters the tower`).toBeGreaterThan(0.98);
    }
    // 1-6-2-4-3-5 around the cap, CCW looking down (decreasing tower index).
    expect([1, 6, 2, 4, 3, 5].map((c) => LEAD_TOWER[c])).toEqual([0, 5, 4, 3, 2, 1]);
  });

  it('coil seats on the centre tower and every lead keeps a 21 mm bend', () => {
    const coil = runs.find((r) => r.name === 'lead:coil')!;
    const centre = new THREE.Vector3(...distW(0, DIST.towerY + 30, 0));
    const end = coil.points[coil.points.length - 1];
    const endDir = end.clone().sub(coil.points[coil.points.length - 2]).normalize();
    const at = axisPlace(end, centre, axis);
    expect(at.radial).toBeLessThan(0.3);
    expect(at.along).toBeCloseTo(-INSERT, 1);
    expect(endDir.dot(axis.clone().negate())).toBeGreaterThan(0.98);
    for (const run of runs) expect(minBend(run.points), run.name).toBeGreaterThanOrEqual(LEAD_MIN_BEND);
  });

  it('plug and coil wire is 7 mm and centre lines stay 8 mm apart', () => {
    const group = ignitionLeads();
    for (const run of runs) {
      const me = group.getObjectByName(run.name) as THREE.Mesh;
      expect(me, run.name).toBeTruthy();
      const pos = me.geometry.attributes.position;
      let worst = 0;
      const tmp = new THREE.Vector3();
      const ab = new THREE.Vector3();
      const hit = new THREE.Vector3();
      for (let v = 0; v < pos.count; v += 8) {
        tmp.fromBufferAttribute(pos, v);
        let best = Infinity;
        for (let i = 1; i < run.points.length; i++) {
          const a = run.points[i - 1], b = run.points[i];
          ab.subVectors(b, a);
          const L2 = ab.lengthSq() || 1;
          const t = Math.max(0, Math.min(1, tmp.clone().sub(a).dot(ab) / L2));
          best = Math.min(best, hit.copy(a).addScaledVector(ab, t).distanceTo(tmp));
        }
        worst = Math.max(worst, Math.abs(best - run.radius));
      }
      expect(worst, `${run.name} OD`).toBeLessThan(0.25);
      if (run.name !== 'lead:primary') expect(run.radius).toBe(LEAD_R);
    }
    for (let i = 0; i < plugs.length; i++) for (let j = i + 1; j < plugs.length; j++) {
      expect(minSep(plugs[i].points, plugs[j].points), `${plugs[i].name}/${plugs[j].name}`).toBeGreaterThanOrEqual(8);
    }
    const coil = runs.find((r) => r.name === 'lead:coil')!;
    for (const run of plugs) expect(minSep(coil.points, run.points), `coil/${run.name}`).toBeGreaterThanOrEqual(8);
    const lines = runs.map((r) => `${r.name} ${r.tower != null ? `tower ${r.tower}` : r.name === 'lead:coil' ? 'centre tower' : 'ring'} ${lengthOf(r.points).toFixed(0)} mm`);
    console.log(lines.join('\n'));
  });

  it('no buried lead overlap at 2 and 3.5 mm erosion', () => {
    const only = activeFilter(emissions);
    const seat = /^(ignition-lead-holders|distributor|spark-plug-connector-[1-6])$/;
    for (const tol of [2, 3.5]) {
      const hits = findCollisions(tol, only).filter((h) => {
        const other = h.a === 'ignition-leads' ? h.b : h.b === 'ignition-leads' ? h.a : '';
        return other !== '' && seat.test(other);
      });
      expect(hits.map((h) => `${h.a} x ${h.b} @ ${tol}`)).toEqual([]);
    }
  }, 300000);
});
