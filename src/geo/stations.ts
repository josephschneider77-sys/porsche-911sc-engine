/**
 * Hardware stations found by search against the modelled geometry (build time): positions inside the chain boxes
 * that are clear of the chain, sprockets and tensioner, and shroud screw stations on the air-guide lips.
 */
import * as THREE from 'three';
import { probe } from './probe';
import { chainCoverBolts, END_PAD, END_STUDS, chainPins, tensionerLayout, CHAIN_Z, HOUSING_Z0, HOUSING_Z1, CHAIN_LID, CAM_NOSE } from './core';
import { CAM_X, CYL_Z, INT_SHAFT_Y, INTAKE_PORT, INJ } from '../data/layout';
import { SHROUD, SHROUD_TAB, FAN } from './aux';
import type { FItem, Kind } from './fasteners';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const bname = (s: number) => (s > 0 ? 'right' : 'left');
/** Lower valve-cover ear stations (outboard edge) that take the special stud-nuts. */
export const VC_SPECIAL = [0, 2, 4];

function clearOfDrive(s: 1 | -1, x: number, y: number, pinClear: number, camClear = 52) {
  const { pins } = chainPins(s); const T = tensionerLayout(s);
  if (Math.hypot(x - CAM_X * s, y) < camClear) return false;
  if (Math.hypot(x, y - INT_SHAFT_Y) < 40) return false;
  if (Math.hypot(x - T.idler.x, y - T.idler.y) < T.idlerR + 16) return false;
  for (const q of pins) if (Math.hypot(x - q.x, y - q.y) < pinClear) return false;
  return true;
}
function pickApart(c: THREE.Vector3[], n: number) {
  if (c.length < n) throw new Error(`stations: only ${c.length} candidates`);
  const out = [c[0]];
  while (out.length < n) { let best = c[0], bd = -1; for (const q of c) { const d = Math.min(...out.map((o) => o.distanceTo(q))); if (d > bd) { bd = d; best = q; } } out.push(best); }
  return out;
}
const memo = new Map<string, any>();
/** Cam-housing end studs (2 per bank): the chain box is open over the cam-housing end and the sprocket fills it, so
 * the studs sit just outside the box wall, above and below, on ears cast onto the chain housing (END_PAD) lying on the
 * cam-housing end face; the nut seats on the ear top (z = END_PAD.z1). Found by probing (E). */
/** Stations as found by searchChainEndStations() (frozen in core END_STUDS so the chain housing can carry the ears). */
export function chainEndStations(s: 1 | -1): THREE.Vector3[] { return END_STUDS[s].map(([x, y]) => V(x, y, END_PAD.z1)); }
export function searchChainEndStations(s: 1 | -1): THREE.Vector3[] {
  const k = `end${s}`; if (memo.has(k)) return memo.get(k);
  const b = bname(s); const c: THREE.Vector3[] = [];
  for (let x = 264; x <= 316; x += 2) for (let y = -96; y <= 90; y += 2) {
    if (y > -50 && y < 46) continue;
    const X = x * s; let ok = true;
    for (const [dx, dy] of [[0, 0], [4, 0], [-4, 0], [0, 4], [0, -4]]) {
      const h = probe(`cam-housing-${b}`, V(X + dx, y + dy, END_PAD.z0 + 3), V(0, 0, -1), 10); if (!h || h.point.z > END_PAD.z0 - 0.05) { ok = false; break; }
      const w = probe(`chain-housing-${b}`, V(X + dx, y + dy, 400), V(0, 0, -1)); if (w && w.point.z > END_PAD.z0 - 0.5) { ok = false; break; }
    }
    if (!ok) continue;
    const toward = V(CAM_X * s - X, -y, 0).normalize().multiplyScalar(15);
    const w = probe(`chain-housing-${b}`, V(X + toward.x, y + toward.y, 400), V(0, 0, -1)); if (!w || w.point.z < 230) continue;
    c.push(V(X, y, END_PAD.z1));
  }
  if (c.length < 2) throw new Error(`chainEndStations(${s}): ${c.length} candidates`);
  // two stations as far apart as possible (in practice both above the box: there is no cam-housing face below it)
  let best: [THREE.Vector3, THREE.Vector3] = [c[0], c[1]], bd = -1;
  for (const p of c) for (const q of c) { const dd = Math.hypot(p.x - q.x, p.y - q.y); const d = (dd >= 17 ? 100 : dd) - 0.05 * (Math.abs(p.y) + Math.abs(q.y)) - 0.02 * Math.abs(p.x + q.x - 2 * 274 * s); if (d > bd) { bd = d; best = [p, q]; } }
  const r = best.sort((p, q) => p.x - q.x); memo.set(k, r); return r;
}
/** Lid centre studs (L 1, R 2): through the box between the chain runs, clear of the tensioner, into the back wall. */
export function chainLidStations(s: 1 | -1): { x: number; y: number }[] {
  const k = `lid${s}`; if (memo.has(k)) return memo.get(k);
  const c: THREE.Vector3[] = [];
  for (let x = 130; x <= 320; x += 5) for (let y = -140; y <= 50; y += 5) {
    const X = x * s; if (!clearOfDrive(s, X, y, 13)) continue;
    const b = bname(s);
    if (chainCoverBolts(s).some((q: any) => Math.hypot(q.x - X, q.y - y) < 22)) continue;
    let onLid = true;
    for (const [dx, dy] of [[0, 0], [9, 0], [-9, 0], [0, 9], [0, -9]]) { const h = probe(`chain-housing-lid-${b}`, V(X + dx, y + dy, CHAIN_LID.top + 5), V(0, 0, -1), 6); if (!h || Math.abs(h.point.z - CHAIN_LID.top) > 0.3) onLid = false; }
    if (!onLid) continue;
    const down = V(0, 0, -1), o = V(X, y, HOUSING_Z1 - 0.5);
    const wall = probe(`chain-housing-${b}`, o, down, 80); if (!wall) continue;
    let blocked = false;
    for (const id of [`chain-tensioner-${b}`, `timing-chain-${b}`, `cam-sprocket-${b}`]) {
      for (const [dx, dy] of [[0, 0], [7, 0], [-7, 0], [0, 7], [0, -7]]) { const h = probe(id, V(X + dx, y + dy, HOUSING_Z1 - 0.5), down, 80); if (h && h.distance < wall.distance) blocked = true; }
    }
    if (!blocked) c.push(V(X, y, 0));
  }
  const r = pickApart(c, s > 0 ? 2 : 1).map((q) => ({ x: q.x, y: q.y })); memo.set(k, r); return r;
}
/** Lip screw z stations, between the intake runners of each bank (E). */
export const LIP_Z = { right: [-185, -130, -30, 60, 110], left: [-185, -88, 30, 140, 160] };
/** Shroud screw groups (105-05): skirt-lip screws, end-plate screws, hot-air socket tapping screws, fan-housing foot bolts, clamp nuts. */
export function shroudScrews(): { id: string; kind: Kind; M: number; washer: number; len: number; items: FItem[] }[] {
  const { zA, zB, bx, skirtY, t, lipW } = SHROUD;
  const lip: FItem[] = [];
  for (const s of [1, -1]) for (const z of LIP_Z[s > 0 ? 'right' : 'left']) {
    // The z −185 right screw sits in the cooler opening; its seat is the cap lip.
    const onCap = s > 0 && z === -185;
    const seat = onCap ? 'oil-cooler-cap' : 'upper-air-guide';
    lip.push({ p: V(s * (bx - lipW / 2), skirtY + t, z), n: V(0, 1, 0), seat, into: seat });
  }
  const end: FItem[] = [-244, -118, -60, 60, 118, 170, 210, 244].map((x) => {
    // Right flywheel-end screws (x ≥ 118) lost the end plate when the pocket was opened.
    const onCap = x >= 118;
    const seat = onCap ? 'oil-cooler-cap' : 'upper-air-guide';
    return { p: V(x, Math.abs(x) > 100 ? 116 : 140, zA - t), n: V(0, 0, -1), seat, into: seat };
  });
  const sock: FItem[] = [0, 1, 2, 3].map((i) => { const a = Math.PI / 4 + (i * Math.PI) / 2; return { p: V(-170 + 39 * Math.cos(a), 118 + 39 * Math.sin(a), zA - t - 2), n: V(0, 0, -1), seat: 'upper-air-guide', into: 'upper-air-guide' }; });
  const collar = (a: number): FItem => ({ p: V(132 * Math.cos(a), FAN.y + 132 * Math.sin(a), SHROUD_TAB.z0), n: V(0, 0, -1), seat: 'upper-air-guide', into: 'fan-housing' });
  return [
    // 3.3 mm: the sheet is 3.5 mm. A 10 mm shank buried 6 mm past it. The cooler-cap
    // screws pass through clearance holes and stop inside the hole, short of the speed nut.
    { id: 'shroud-screws', kind: 'combi', M: 6, washer: 5.5, len: 3.3, items: lip },
    { id: 'shroud-end-screws', kind: 'combi', M: 6, washer: 6.25, len: 3.3, items: end },
    { id: 'shroud-socket-screws', kind: 'pan', M: 6, washer: 7, len: 12, items: sock },
    { id: 'shroud-collar-bolts-a', kind: 'bolt', M: 6, washer: 6.25, len: 16, items: SHROUD_TAB.a.slice(0, 2).map(collar) },
    { id: 'shroud-collar-bolts-b', kind: 'bolt', M: 6, washer: 6.25, len: 16, items: SHROUD_TAB.a.slice(2).map(collar) },
  ];
}
void FAN; void CYL_Z; void INTAKE_PORT; void INJ; void CHAIN_Z; void CAM_NOSE;
