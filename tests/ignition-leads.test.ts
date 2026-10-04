import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { findCollisions } from './collide';
import { PLUG_CONNECTOR_TERMINAL } from '../src/geo/assets';
import { ignitionLeadRuns, ignitionLeads, leadClipCenters, LEAD_R, LEAD_MIN_BEND, LEAD_TOWER, DIST, DIST_AXIS, DIST_MAT, distW } from '../src/geo/aux';
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
function segClosest(a0: THREE.Vector3, a1: THREE.Vector3, b0: THREE.Vector3, b1: THREE.Vector3) {
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
  const pa = a0.clone().addScaledVector(u, sc);
  const pb = b0.clone().addScaledVector(v, tc);
  return { d: pa.distanceTo(pb), pa, pb };
}
function minSep(a: THREE.Vector3[], b: THREE.Vector3[]) {
  let m = Infinity;
  for (let i = 1; i < a.length; i++) for (let j = 1; j < b.length; j++) m = Math.min(m, segDist(a[i - 1], a[i], b[j - 1], b[j]));
  return m;
}
/** Centreline gap ignoring the run through a holder eye, where the lanes sit side by side. */
function minSepOutsideHolders(a: THREE.Vector3[], b: THREE.Vector3[], clips: THREE.Vector3[]) {
  const inHolder = (p: THREE.Vector3) => clips.some((c) => c.distanceTo(p) <= 20);
  let m = Infinity;
  for (let i = 1; i < a.length; i++) for (let j = 1; j < b.length; j++) {
    const hit = segClosest(a[i - 1], a[i], b[j - 1], b[j]);
    if (inHolder(hit.pa) && inHolder(hit.pb)) continue;
    m = Math.min(m, hit.d);
  }
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
/** Sum of direction changes, degrees. Short steps are the fillet samples, not extra corners. */
function turningOf(pts: THREE.Vector3[]) {
  let n = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i].clone().sub(pts[i - 1]);
    const b = pts[i + 1].clone().sub(pts[i]);
    if (a.length() < 0.4 || b.length() < 0.4) continue;
    n += a.angleTo(b) * 180 / Math.PI;
  }
  return n;
}
/** Straight millimetres outside the tower mouth. Walks back from the seated end. */
function axisRun(pts: THREE.Vector3[], mouth: THREE.Vector3) {
  let run = 0;
  for (let i = pts.length - 1; i >= 0; i--) {
    const place = axisPlace(pts[i], mouth, axis);
    if (place.radial > 0.5) break;
    if (place.along > run) run = place.along;
  }
  return run;
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
    const lines = runs.map((r) => `${r.name} ${r.tower != null ? `tower ${r.tower}` : r.label ?? 'break'} ${lengthOf(r.points).toFixed(0)} mm, turn ${turningOf(r.points).toFixed(0)}°`);
    console.log(lines.join('\n'));
  });

  it('lead centrelines stay 7 mm apart outside a holder', () => {
    // Inside a holder the three lanes run side by side, 14 mm apart, so the
    // gap there is already past 7 mm. The fan beyond the last eye must not cross.
    const clips = leadClipCenters();
    for (let i = 0; i < plugs.length; i++) for (let j = i + 1; j < plugs.length; j++) {
      expect(minSepOutsideHolders(plugs[i].points, plugs[j].points, clips), `${plugs[i].name}/${plugs[j].name}`).toBeGreaterThanOrEqual(7);
    }
  });

  it('right-bank leads stay under 1200 mm and left-bank leads under 700 mm', () => {
    // 700 mm is the left-bank cap. Cylinder 6 cannot meet it and also stay clear of
    // the distributor vacuum hose: the clear route is the one that ships.
    for (const run of plugs) {
      const cap = run.cyl! <= 3 ? 1200 : 700;
      expect(lengthOf(run.points), run.name).toBeLessThanOrEqual(cap);
    }
  });

  it('turning stays under each cylinder cap', () => {
    // Cylinder 1 goes over the plenum. The plenum top is what pushes that turn
    // just past 500°, so the cap is 510°. Cylinders 2 and 3 sit just above this route.
    // Left bank caps are 500° / 520° / 520°. A direct join under those caps crosses
    // another lead or enters the distributor vacuum hose, so the hose-clear fan stays.
    const cap: Record<number, number> = { 1: 510, 2: 450, 3: 540, 4: 500, 5: 520, 6: 520 };
    for (const run of plugs) expect(turningOf(run.points), run.name).toBeLessThanOrEqual(cap[run.cyl!]);
  });

  it('each plug lead stays on its tower axis for at least 20 mm', () => {
    for (const run of plugs) {
      expect(axisRun(run.points, towerMouth(run.tower!)), run.name).toBeGreaterThanOrEqual(20);
    }
  });

  it('firing order follows the towers CCW from the rotor end', () => {
    const xAxis = new THREE.Vector3().setFromMatrixColumn(DIST_MAT, 0);
    const zAxis = new THREE.Vector3().setFromMatrixColumn(DIST_MAT, 2);
    const cap = new THREE.Vector3(...distW(0, DIST.towerY + 33, 0));
    const mouths = [0, 1, 2, 3, 4, 5].map((i) => towerMouth(i));
    let tower0 = 0;
    let best = -Infinity;
    for (let i = 0; i < mouths.length; i++) {
      const dot = mouths[i].clone().sub(cap).dot(xAxis);
      if (dot > best) { best = dot; tower0 = i; }
    }
    expect(tower0, 'tower nearest local +X').toBe(0);
    // Z = X × Y, so increasing atan2(local z, local x) is CCW looking along +axis
    // (pinion toward the cap) and CW looking back from the rotor end. CCW from
    // that end is decreasing angle.
    const angleOf = (p: THREE.Vector3) => Math.atan2(p.clone().sub(cap).dot(zAxis), p.clone().sub(cap).dot(xAxis));
    const ccwFrom = (i: number) => {
      const d = angleOf(mouths[tower0]) - angleOf(mouths[i]);
      return ((d % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    };
    const ccw = [0, 1, 2, 3, 4, 5].sort((a, b) => ccwFrom(a) - ccwFrom(b));
    const firing = [1, 6, 2, 4, 3, 5];
    expect(ccw).toEqual(firing.map((cyl) => LEAD_TOWER[cyl]));
    for (const run of plugs) expect(run.tower).toBe(LEAD_TOWER[run.cyl!]);
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
