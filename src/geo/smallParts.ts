/**
 * Small parts (keys, pins, washers, shims, gaskets, O-rings, circlips, plugs, senders, clamps, fittings) as instanced
 * hardware sets. Prototypes are built with +Y as the "out of the seat" axis and the origin on the seat; `items`
 * gives one world matrix per piece. Counts/steps/claims live in data/smallSpec.ts; tests/smallParts check both agree.
 */
import * as THREE from 'three';
import { Part, lathe, cyl, torus, box, boxMM, hexNut, tube, extrudeC, roundRect, circlePath, woodruffGeom, spring, yToZ, cylBetween, csgSub, type V3 } from './util';
import { frame } from './instancing';
import { fastenerSets } from './fasteners';
import { partPose, seat, probe } from './probe';
import { VC_EXT, chainCoverBolts, CAM_NOSE, CAM_WEB, CHAIN_Z, CRANK_NOSE, HOUSING_Z0, HOUSING_Z1, CHAIN_LID, chainOutline, coverMatrix, tensionerLayout, railBolts, CH_Z0, CH_Z1 } from './core';
import { CAM_X, CYL_Z, DECK_X, CYL_TOP_X, HEAD_OUT_X, INT_SHAFT_Y, INTAKE_PORT, INJ, CASE_Z, MAIN_Z, bankOf } from '../data/layout';
import { LIP_Z } from './stations';
import { FLY_Z, EXH_PORT, THERMO, DIST, WUR, PLENUM, AIRBOX, SUMP, OIL_PUMP, FAN, SHROUD, INTAKE_LIFT } from './aux';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);
const BANKS = [1, -1] as const;
const bn = (s: number) => (s > 0 ? 'right' : 'left');
const CYLS = [1, 2, 3, 4, 5, 6];
type Mats = THREE.Matrix4[];
export interface SmallGeom { proto: () => Part; items: () => Mats }

// ---------- prototype helpers (+Y out of the seat) ----------
const washer = (ri: number, ro: number, t: number, m = 'steel' as any) => new Part().add(lathe([[ri, 0], [ro, 0], [ro, t], [ri, t]], 28), m);
const oring = (R: number, r: number, m = 'rubber' as any) => new Part().add(torus(R, r, 8, 40).rotateX(Math.PI / 2).translate(0, r, 0), m);
const pin = (r: number, L: number, m = 'steel' as any) => new Part().add(cyl(r, L, 14).translate(0, L / 2, 0), m);
const clip = (ri: number, ro: number, t: number) => { const p = new Part(); p.add(lathe([[ri, 0], [ro, 0], [ro, t], [ri, t]], 28, 0.35, Math.PI * 2 - 0.7), 'darkSteel'); return p; };
const plug = (af: number, h: number, r: number, ring = true) => { const p = new Part(); if (ring) p.add(lathe([[r + 0.2, 0], [r + 3, 0], [r + 3, 1.5], [r + 0.2, 1.5]], 24), 'brass'); p.add(hexNut(af, h).translate(0, (ring ? 1.5 : 0) + h / 2, 0), 'zincPlate'); p.add(cyl(r, 10, 16).translate(0, -5, 0), 'zincPlate'); return p; };
/** Flat gasket following an outline (pts in the local XZ plane), thickness t along +Y. */
const gasketRing = (pts: [number, number][], w: number, t = 0.5) => {
  const sh = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b)));
  const inner = new THREE.Path(insetPoly(pts, w).map(([a, b]) => new THREE.Vector2(a, b)));
  sh.holes.push(inner);
  const g = extrudeC(sh, t); g.rotateX(-Math.PI / 2); g.translate(0, t / 2, 0);
  // extrudeC is centred; rotateX(-90) maps +Z to +Y and shape y to -Z
  g.scale(1, 1, -1);
  return new Part().add(g, 'gasket');
};
function insetPoly(pts: [number, number][], w: number): [number, number][] {
  const n = pts.length; let area = 0; for (let i = 0; i < n; i++) { const [a, b] = pts[i], [c, d] = pts[(i + 1) % n]; area += a * d - c * b; }
  const sgn = area > 0 ? 1 : -1;
  return pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n], c = pts[(i + 1) % n];
    const e1 = new THREE.Vector2(p[0] - a[0], p[1] - a[1]).normalize(), e2 = new THREE.Vector2(c[0] - p[0], c[1] - p[1]).normalize();
    const n1 = new THREE.Vector2(-e1.y, e1.x).multiplyScalar(sgn), n2 = new THREE.Vector2(-e2.y, e2.x).multiplyScalar(sgn);
    const m = n1.clone().add(n2).normalize(); const k = w / Math.max(0.3, m.dot(n1));
    return [p[0] + m.x * k, p[1] + m.y * k] as [number, number];
  });
}
const circ = (r: number, n = 40): [number, number][] => Array.from({ length: n }, (_, i) => [r * Math.cos((i / n) * Math.PI * 2), r * Math.sin((i / n) * Math.PI * 2)]);
const M = (p: THREE.Vector3, n: THREE.Vector3, x?: THREE.Vector3) => frame(p, n, x);
const posed = (id: string, p: V3, n: V3, x?: V3) => { const P = partPose(id); const q = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromRotationMatrix(P)); return M(V(...p).applyMatrix4(P), V(...n).applyMatrix4(q), x ? V(...x).applyMatrix4(q) : undefined); };
const onSurf = (id: string, o: THREE.Vector3, d: THREE.Vector3, x?: THREE.Vector3) => { const h = probe(id, o, d, 600); if (!h) throw new Error(`small parts: no ${id} surface from ${o.toArray()}`); return M(h.point, d.clone().negate(), x); };

// ---------- composites ----------
function sender(bodyR: number, bodyH: number, hex: number, m = 'brass' as any) { const p = new Part(); p.add(lathe([[7.2, 0], [11, 0], [11, 1.5], [7.2, 1.5]], 24), 'copper'); p.add(hexNut(hex, 8).translate(0, 5.5, 0), 'zincPlate'); p.add(lathe([[0.1, 9.5], [bodyR, 9.5], [bodyR, 9.5 + bodyH], [bodyR - 3, 12 + bodyH], [0.1, 12 + bodyH]], 24), m); p.add(cyl(2.5, 6, 10).translate(0, 15 + bodyH, 0), 'brass'); return p; }
function banjo() { const p = new Part(); p.add(lathe([[5, 0], [8, 0], [8, 1.5], [5, 1.5]], 20), 'brass'); p.add(lathe([[0.1, 1.5], [9, 1.5], [9, 13.5], [0.1, 13.5]], 20), 'brass'); p.add(cylBetween([0, 7.5, 0], [22, 7.5, 0], 3.5, 10), 'zincPlate'); p.add(lathe([[5, 13.5], [8, 13.5], [8, 15], [5, 15]], 20), 'brass'); p.add(hexNut(14, 8).translate(0, 19, 0), 'zincPlate'); return p; }
function hoseClamp(R: number, w = 9) { const p = new Part(); p.add(lathe([[R, -w / 2], [R + 0.8, -w / 2], [R + 0.8, w / 2], [R, w / 2]], 32), 'zincPlate'); p.add(box(8, w, 10).translate(R + 4, 0, 0), 'zincPlate'); return p; }

const CAM_ZC = (s: 1 | -1) => CHAIN_Z[s];
/** Chain-adjuster cover (103-10/15 #29-#31) on the lid outside face: gasket, round seal, cover (engine frame). */
export function adjusterCoverPart(s: 1 | -1) {
  const c = adjusterCover(s); const p = new Part();
  p.add(yToZ(lathe([[0.1, 0], [29, 0], [29, 0.5], [0.1, 0.5]], 40)), 'gasket', [c.x, c.y, CHAIN_LID.top]);
  p.add(torus(16.5, 1.5, 8, 40), 'rubber', [c.x, c.y, CHAIN_LID.top + 1.8]);
  p.add(yToZ(lathe([[0.1, 0.5], [30, 0.5], [30, 3.5], [19, 3.5], [15, 9], [0.1, 9]], 40)), 'castAlu', [c.x, c.y, CHAIN_LID.top]);
  return p.g;
}
export const SMALL_GEOM: Record<string, SmallGeom> = {};
const def = (id: string, proto: () => Part, items: () => Mats) => { SMALL_GEOM[id] = { proto, items }; };

// ===== cam nose (per bank) =====
for (const s of BANKS) {
  const b = bn(s), Xc = CAM_X * s, zc = CAM_ZC(s), N = CAM_NOSE;
  def(`cam-key-${b}`, () => new Part().add(woodruffGeom(N.key.D, N.key.h, N.key.b), 'darkSteel'), () => [M(V(Xc, N.r + N.key.proud, zc + N.key.dz), Y, Z)]);
  // Ø6 × 14 pin: tail in the flange hole, tip `proud` mm past the sprocket-web bevel lip (the visible cam-nose end).
  def(`cam-pin-${b}`, () => pin(N.pin.r - 0.05, N.pin.len), () => {
    const lip = CAM_WEB.depth / 2 + CAM_WEB.bevel;
    const tail = lip + N.pin.proud - N.pin.len;
    return [M(V(Xc + N.pin.rad * Math.cos(N.pin.a) * s, N.pin.rad * Math.sin(N.pin.a), zc + tail), Z)];
  });
  def(`cam-shim-${b}`, () => { const sh = new THREE.Shape(); sh.absarc(0, 0, N.r + 8, 0, Math.PI * 2, false);
    const kb = N.key.b / 2 + 0.05, a = Math.asin(kb / (N.r + 0.05)); const bore = new THREE.Path();
    bore.absarc(0, 0, N.r + 0.05, Math.PI / 2 + a, Math.PI / 2 - a + 2 * Math.PI, false); bore.lineTo(kb, N.r + N.key.proud + 0.4); bore.lineTo(-kb, N.r + N.key.proud + 0.4); bore.closePath(); sh.holes.push(bore);
    const g = extrudeC(sh, N.shim); g.translate(0, 0, N.shim / 2); return new Part().add(g, 'steel'); }, () => [new THREE.Matrix4().makeTranslation(Xc, 0, zc + N.flange[1])]);
  def(`cam-thrust-washer-${b}`, () => washer(N.r + 0.2, 22, 2.5, 'bronze'), () => [M(V(Xc, 0, zc + N.flange[0] - 2.5), Z)]);
  // chain drive extras
  const T = tensionerLayout(s), z = CHAIN_Z[s];
  def(`idler-circlip-${b}`, () => clip(7, 9.5, 1), () => [M(V(T.pivot.x, T.pivot.y, z - 19.9), Z)]);
  def(`idler-sleeve-${b}`, () => pin(1.5, 20, 'darkSteel'), () => [M(V(T.pivot.x, T.pivot.y - 10, z - 13), Y)]);
  // chain housing: case-side gasket (#5), lid gasket (#8 L / #9 R), lid screw plug + ring, expansion plug (#10)
  const out = chainOutline(s, 0) as [number, number][];
  def(`chain-housing-gasket-${b}`, () => gasketRing(out.map(([x, y]) => [x, y]), 8), () => [M(V(0, 0, HOUSING_Z0), Z, X)]);
  def(`chain-lid-gasket-${b}`, () => gasketRing(out.map(([x, y]) => [x, y]), 9), () => [M(V(0, 0, HOUSING_Z1 + 0.3), Z, X)]);
  def(`chain-lid-plug-${b}`, () => plug(17, 6, 8), () => [onSurf(`chain-housing-lid-${b}`, V(s * 232, -22, 400), V(0, 0, -1))]);
  def(`chain-lid-plug2-${b}`, () => plug(14, 5, 7, false), () => [onSurf(`chain-housing-lid-${b}`, V(s * 250, 30, 400), V(0, 0, -1))]);
  def(`cam-housing-plug-${b}`, () => plug(14, 6, 7), () => [onSurf(`cam-housing-${b}`, V(s * 450, 0, -110), V(-s, 0, 0))]);
  def(`chain-case-plug-${b}`, () => { const p = new Part(); p.add(lathe([[0.1, 0], [7.5, 0], [7.5, 0.6], [6, 1.6], [0.1, 1.6]], 24), 'steel'); return p; }, () => [onSurf(`chain-housing-${b}`, V(s * 230, 120, HOUSING_Z0 + 30), V(0, -1, 0))]);
  // cam housing: valve-cover gaskets (#18 upper, #20 lower), end lid (#16), splash tube, stoppers, banjo feed, temp switch
  for (const up of [true, false]) {
    const L = CH_Z1 - CH_Z0 - 8, w = 58;
    def(`valve-cover-gasket-${up ? 'upper' : 'lower'}-${b}`, () => {
      const e = VC_EXT(s);
      const sh = roundRect(w, L + e, 7);
      sh.holes.push(new THREE.Path(roundRect(52, L - 14 + e, 4).getPoints(6)));
      let g: THREE.BufferGeometry = extrudeC(sh, 0.8);
      g.translate(0, -e / 2, -0.4);
      // Left bank only: cylinder 6's rocker shafts sit so close to the flywheel end that the
      // screw shank and the intake nut land on the end rail. Open the middle of that rail
      // (the hardware is already inside the cavity in x) and leave the two corner seals.
      if (s < 0) {
        const yOut = -(L + e) / 2 - 1 - e / 2;
        const yIn = -(L - 14 + e) / 2 + 2 - e / 2;
        g = csgSub(g, boxMM([-27, yOut, -2], [27, yIn, 2]));
      }
      return new Part().add(g, 'gasket');
    }, () => [coverMatrix(s, up).clone()]);
  }
  def(`cam-end-cover-${b}`, () => { const p = new Part(); p.add(lathe([[0.1, 0], [27, 0], [27, 1], [25, 3], [0.1, 3]], 36), 'castAlu'); return p; }, () => [onSurf(`cam-housing-${b}`, V(Xc, 0, CH_Z0 - 60), Z)]);
  // Clear of the Ø46.7 journals (centre distance 30 mm). The old offset of 24 mm ran through the journals.
  def(`cam-splash-tube-${b}`, () => new Part().add(cyl(3.5, CH_Z1 - CH_Z0 - 40, 14).translate(0, (CH_Z1 - CH_Z0 - 40) / 2, 0), 'steel'), () => [M(V((CAM_X + 18) * s, 24, CH_Z0 + 20), Z)]);
  def(`cam-housing-stoppers-${b}`, () => { const p = new Part(); p.add(lathe([[0.1, -4], [5, -4], [5, 0], [5.5, 0], [5.5, 1.2], [0.1, 1.2]], 18), 'steel'); return p; }, () => [-1, 1].map((k) => onSurf(`cam-housing-${b}`, V(Xc - 24 * s, 24 * k, CH_Z0 - 60), Z)));
  def(`cam-oil-banjo-${b}`, () => { const p = banjo(); p.add(lathe([[5, 21], [8, 21], [8, 22.5], [5, 22.5]], 20), 'brass'); p.add(lathe([[5, 22.5], [8, 22.5], [8, 24], [5, 24]], 20), 'brass'); p.add(lathe([[0.1, 24], [6, 24], [6, 32], [0.1, 32]], 16), 'zincPlate'); return p; }, () => [onSurf(`cam-housing-${b}`, V(Xc - 14 * s, -36, CH_Z0 - 80), Z, V(s, 0, 0))]);
}
/** Adjuster cover centre: first point along the adjuster axis where an r 30 disc lies on the lid, clear of the cover nuts (build time). */
export function adjusterCover(s: 1 | -1) {
  const T = tensionerLayout(s); const b = bn(s);
  for (let d = 0; d <= 90; d += 2) for (const side of [0, 6, -6, 12, -12]) {
    const c = T.adjBase.clone().add(T.axis.clone().multiplyScalar(d)).add(new THREE.Vector2(-T.axis.y, T.axis.x).multiplyScalar(side));
    if (chainCoverBolts(s).some((q) => Math.hypot(q.x - c.x, q.y - c.y) < 30 + 12)) continue;
    let ok = true; for (let i = 0; i < 12 && ok; i++) { const a = (i / 12) * Math.PI * 2; const h = probe(`chain-housing-lid-${b}`, V(c.x + 30 * Math.cos(a), c.y + 30 * Math.sin(a), 400), V(0, 0, -1)); if (!h || Math.abs(h.point.z - CHAIN_LID.top) > 0.3) ok = false; }
    if (ok) return c;
  }
  throw new Error('adjusterCover: no spot');
}
def('cam-temp-switch', () => sender(9, 10, 19), () => [onSurf('cam-housing-left', V(-CAM_X + 14, 36, CH_Z0 - 80), Z)]);

// ===== crank nose / flywheel =====
const CN = CRANK_NOSE;
def('crank-key', () => new Part().add(woodruffGeom(CN.key.D, CN.key.h, CN.key.b), 'darkSteel'), () => [M(V(0, CN.seatR + CN.key.proud, CN.key.z), Y, Z)]);
def('crank-gear-ring', () => washer(CN.seatR + 0.05, 33, CN.ring[1] - CN.ring[0]), () => [M(V(0, 0, CN.ring[0]), Z)]);
def('crank-circlip', () => clip(CN.seatR - 1.2 + 0.05, 33, 1.6), () => [M(V(0, 0, CN.groove[0] + 0.05), Z)]);
def('pulley-pin', () => pin(2.5, 10), () => [M(V(0, CN.pinR, 313), Z)]);
def('crank-pilot-bush', () => washer(7.5, 9.95, 11.5, 'bronze'), () => [M(V(0, 0, FLY_Z + 0.2), Z)]);
def('flywheel-seal', () => { const p = new Part(); p.add(lathe([[15, 0], [25, 0], [25, 10], [15, 10]], 32), 'rubber'); p.add(lathe([[22, 0.2], [25.05, 0.2], [25.05, 9.8], [22, 9.8]], 32), 'steel'); return p; }, () => [M(V(0, 0, FLY_Z - 12), Z)]);
def('flywheel-oring', () => oring(25.5, 2.1), () => [M(V(0, 0, FLY_Z - 4.2), Z)]);
def('crank-seal-rear', () => { const p = new Part(); p.add(lathe([[SPECR() + 0.1, 0], [44, 0], [44, 10], [SPECR() + 0.1, 10]], 40), 'rubber'); return p; }, () => [M(V(0, 0, CASE_Z.flywheel), Z)]);
function SPECR() { return 28.5; }

// ===== crankcase =====
const throughZ = MAIN_Z.slice(1, 6);
def('case-dowels', () => pin(6, 16, 'steel'), () => [V(0, 100, -150), V(0, 100, -60), V(0, 100, 60), V(0, 100, 150)].map((p) => M(p.clone().setX(-8), X)));
// ===== intermediate shaft (103-15 #44-#49)
const ISZ = { j0: -60, j1: 150, jw: 16 };
def('ishaft-bearings', () => new Part().add(yToZ(lathe([[13.05, -ISZ.jw / 2], [15.6, -ISZ.jw / 2], [15.6, ISZ.jw / 2], [13.05, ISZ.jw / 2]], 28)), 'bronze'), () => [ISZ.j0, ISZ.j1].map((z) => M(V(0, INT_SHAFT_Y, z), Y)));
def('ishaft-thrust', () => new Part().add(lathe([[9.1, -1], [19, -1], [19, 1], [9.1, 1]], 28), 'bronze'), () => [ISZ.j1 - ISZ.jw / 2 - 1.05, ISZ.j1 + ISZ.jw / 2 + 1.05].map((z) => M(V(0, INT_SHAFT_Y, z), Z)));
def('ishaft-circlips', () => new Part().add(lathe([[9.05, -0.6], [11.5, -0.6], [11.5, 0.6], [9.05, 0.6]], 20), 'darkSteel'), () => [ISZ.j0 - ISZ.jw / 2 - 0.7, ISZ.j0 + ISZ.jw / 2 + 0.7, ISZ.j1 - ISZ.jw / 2 - 2.8, ISZ.j1 + ISZ.jw / 2 + 2.8].map((z) => M(V(0, INT_SHAFT_Y, z), Z)));
def('ishaft-stopper', () => new Part().add(cyl(3, 10, 12).translate(0, 5, 0), 'steel'), () => [M(V(0, INT_SHAFT_Y + 19.1, ISZ.j1 + ISZ.jw / 2 + 6), Y)]);
def('case-roll-pin', () => pin(4, 16, 'darkSteel'), () => [M(V(-8, INT_SHAFT_Y - 40, -190), X)]);
def('spray-jets', () => { const p = new Part(); p.add(hexNut(10, 5).translate(0, 2.5, 0), 'brass'); p.add(cylBetween([0, 5, 0], [0, 12, 0], 2, 8), 'brass'); p.add(cylBetween([0, 12, 0], [8, 18, 0], 1.6, 8), 'brass'); return p; },
  () => CYLS.map((c) => { const s = bankOf(c); return M(V(s * 70, -60, CYL_Z[c] + 15 * s), V(s, 0.6, 0).normalize(), V(0, 0, 1)); }));
def('relief-plugs', () => {
  const p = new Part();
  p.add(lathe([[8.2, 0], [13.5, 0], [13.5, 1.6], [8.2, 1.6]], 28), 'copper');
  p.add(lathe([[6.4, 1.6], [11.2, 1.6], [11.2, 3.2], [6.4, 3.2]], 24), 'zincPlate');
  p.add(hexNut(19, 8).translate(0, 3.2 + 4, 0), 'zincPlate');
  p.add(cyl(7.2, 12, 16).translate(0, -6, 0), 'zincPlate');
  return p;
}, () => [V(-45, 0, -160), V(45, 0, 165)].map((p) => onSurf(p.x < 0 ? 'crankcase-left' : 'crankcase-right', V(p.x, -300, p.z), Y)));
def('relief-pistons', () => {
  const p = new Part();
  // hollow cup, open toward +Y (into the bore after the placement flip), spring inside the cup
  p.add(lathe([[3.2, 0], [7.4, 0], [7.6, 2], [7.6, 16], [6.2, 17], [3.2, 17]], 20), 'steel');
  p.add(lathe([[0.1, 1], [3.2, 1], [3.2, 16], [0.1, 16]], 16), 'bore');
  p.add(spring(4.2, 1.15, 2, 15, 6), 'darkSteel');
  return p;
}, () => [V(-45, 0, -160), V(45, 0, 165)].map((q) => { const m = onSurf(q.x < 0 ? 'crankcase-left' : 'crankcase-right', V(q.x, -300, q.z), Y); return m.multiply(new THREE.Matrix4().makeTranslation(0, 14, 0).premultiply(new THREE.Matrix4().makeRotationX(Math.PI))); }));
def('case-oil-fittings', () => { const p = new Part(); p.add(lathe([[0.1, 0], [12, 0], [12, 3], [0.1, 3]], 24), 'copper'); p.add(hexNut(27, 12).translate(0, 9, 0), 'zincPlate'); p.add(lathe([[7, 15], [10, 15], [9, 19], [7, 19]], 20), 'brass'); p.add(hexNut(22, 14).translate(0, 22, 0), 'zincPlate'); p.add(cyl(7.5, 30, 14).translate(0, 44, 0), 'steel'); return p; },
  () => [onSurf('crankcase-left', V(-62, -300, -110), Y), onSurf('crankcase-right', V(34, -300, -165), Y)]);
def('case-connection-left', () => sender(10, 6, 22, 'zincPlate'), () => [onSurf('crankcase-left', V(-62, -300, 160), Y)]);
def('oil-temp-sensor', () => sender(8, 18, 22), () => [onSurf('crankcase-right', V(33, -300, -120), Y)]);
def('oil-pressure-sender', () => { const p = sender(15, 3, 22, 'satinBlack'); p.add(lathe([[7.2, -1.5], [11, -1.5], [11, 0], [7.2, 0]], 24), 'copper'); return p; }, () => [onSurf('crankcase-right', V(40, 300, 150), V(0, -1, 0))]);
def('oil-pressure-switch', () => sender(12, 3, 24, 'satinBlack'), () => [onSurf('crankcase-right', V(64, 300, 120), V(0, -1, 0))]);
def('oil-pressure-fitting', () => { const p = banjo(); p.add(lathe([[0.1, 23], [6, 23], [6, 26], [0.1, 26]], 16), 'brass'); return p; }, () => [onSurf('crankcase-right', V(64, 300, 160), V(0, -1, 0))]);
def('thermostat-oring', () => oring(19, 1.8), () => [M(V(THERMO.x, THERMO.seatY - THERMO.grip - 4.8, THERMO.z), Y)]);
def('sump-drain-ring', () => washer(7, 11, 1.5, 'copper'), () => [M(V(0, SUMP.seatY - 9, SUMP.zc), V(0, -1, 0))]);
def('case-through-orings', () => oring(7.2, 1.2), () => fastenerSets().filter((f) => f.id.startsWith('case-through')).flatMap((f) => f.items.map((it) => M(it.p.clone().addScaledVector(it.n, -0.1), it.n.clone().negate()))));
def('oil-return-tubes', () => { const p = new Part(); const L = 150; p.add(cyl(7, L, 16).translate(0, L / 2, 0), 'steel'); p.add(torus(7.2, 1.6, 6, 24).rotateX(Math.PI / 2).translate(0, 6, 0), 'rubber'); p.add(torus(7.2, 1.6, 6, 24).rotateX(Math.PI / 2).translate(0, L - 6, 0), 'rubber'); return p; },
  () => [1, -1].flatMap((s) => [s > 0 ? [CYL_Z[1], CYL_Z[2]] : [CYL_Z[4], CYL_Z[5]], s > 0 ? [CYL_Z[2], CYL_Z[3]] : [CYL_Z[5], CYL_Z[6]]].map(([a, b2]) => M(V(s * (DECK_X + 6), -78, (a + b2) / 2), V(s, 0, 0)))));
def('oil-pump-seals', () => oring(9, 1.5), () => OIL_PUMP.seals.map(([x, y, z], i) => M(V(x, y, z), i < 2 ? Y : Z)));

def('oil-cooler-seals', () => oring(5, 1), () => [[-84, 49], [-84, 75]].map(([x, z]) => M(V(x, 101.05, z), Y)));

// ===== cylinders / heads =====
def('cyl-base-gaskets', () => washer(48.6, 52, 0.25, 'gasket'), () => CYLS.map((c) => posed(`cylinder-${c}`, [0.05, 0, 0], [1, 0, 0])));
def('head-seals', () => washer(48, 50.5, 1.2, 'copper'), () => CYLS.map((c) => posed(`cylinder-${c}`, [CYL_TOP_X - DECK_X - 1.3, 0, 0], [1, 0, 0])));
def('head-dowels', () => pin(4, 12), () => CYLS.flatMap((c) => [-40, 40].map((z) => posed(`head-${c}`, [HEAD_OUT_X - CYL_TOP_X - 6, 0, z], [1, 0, 0]))));
def('exhaust-gaskets', () => gasketRing(circ(22), 5, 0.8), () => CYLS.map((c) => posed(`head-${c}`, [EXH_PORT.x - CYL_TOP_X, EXH_PORT.y - 0.8, 0], [0, -1, 0])));
def('intake-gaskets', () => { const sh = roundRect(46, 76, 12); sh.holes.push(circlePath(19) as THREE.Path); const g = extrudeC(sh, 0.5); g.rotateX(Math.PI / 2); g.translate(0, 0.25, 0); return new Part().add(g, 'gasket'); }, () => CYLS.map((c) => posed(`intake-runner-${c}`, [0, -0.5, 0], [0, 1, 0])));
def('intake-boots', () => { const p = new Part(); p.add(lathe([[24.2, 0], [28, 0], [28, 36], [24.2, 36]], 32), 'rubber'); return p; }, () => CYLS.map((c) => posed(`intake-runner-${c}`, [-(INTAKE_PORT.x - PLENUM.x - 34), 150 + INTAKE_LIFT, 0], [0, 1, 0])));
def('intake-boot-clamps', () => hoseClamp(28.1, 8), () => CYLS.flatMap((c) => [158 + INTAKE_LIFT, 178 + INTAKE_LIFT].map((y) => posed(`intake-runner-${c}`, [-(INTAKE_PORT.x - PLENUM.x - 34), y, 0], [0, 1, 0]))));
// injector O-rings: 106-00 #29 (insert), #30 (injector body), 107-10 #22 (insulator)
for (const [id, y, R] of [['injector-orings-a', 8, 7.6], ['injector-orings-b', 13, 7.6], ['injector-orings-c', 30, 7.6]] as const)
  def(id, () => oring(R, 1.4), () => CYLS.map((c) => posed(`injector-${c}`, [0, y, 0], [0, 1, 0])));

// ===== ignition / cooling =====
def('distributor-oring', () => oring(21.5, 1.8), () => [M(V(DIST.x, DIST.clampTop + 0.2, DIST.z), Y)]);
def('ignition-lead-holders', () => { const p = new Part(); p.add(box(14, 10, 20).translate(0, 5, 0), 'blackPlastic'); return p; }, () => [-1, 1].flatMap((s) => [-60, 60].map((z) => onSurf('upper-air-guide', V(s * 160, 400, z), V(0, -1, 0)))));
def('shroud-speed-nuts', () => { const p = new Part(); p.add(box(18, 1, 22).translate(0, 0.5, 0), 'darkSteel'); return p; }, () => LIP_Z.right.map((z) => M(V(SHROUD.bx - SHROUD.lipW / 2, SHROUD.skirtY, z), V(0, -1, 0))));
def('shroud-cover-plate', () => { const p = new Part(); const g = extrudeC(roundRect(60, 40, 5), 1.5); g.rotateX(Math.PI / 2); g.translate(0, 0.75, 0); p.add(g, 'satinBlack'); return p; }, () => [onSurf('upper-air-guide', V(50, 400, -120), V(0, -1, 0))]);
def('shroud-stopper', () => { const p = new Part(); p.add(lathe([[0.1, -3], [9, -3], [9, 0], [11, 0], [11, 2], [0.1, 2]], 18), 'rubber'); return p; }, () => [onSurf('upper-air-guide', V(-50, 400, -125), V(0, -1, 0))]);
def('alternator-strap', () => {
  const p = new Part();
  // From the bottom slip-ring stud, under the plenum, onto the housing barrel. Identity pose: points are world mm.
  const y = FAN.y;
  // Leave the right-hand slip-ring stud, stay above the shroud roof, then drop into the housing wall.
  p.add(tube([[52, y - 18, 180], [70, y - 16, 200], [76, y - 28, 218], [92, y - 98, 228]], 2.2, 8, 18), 'copper');
  return p;
}, () => [M(V(0, 0, 0), Y, X)]);

// ===== induction / exhaust composites =====
const plenTop = (x: number, z: number) => onSurf('plenum', V(x, 600, z), V(0, -1, 0));
def('cold-start-valve', () => { const p = new Part(); p.add(lathe([[0.1, 0], [16, 0], [16, 1.6], [0.1, 1.6]], 24), 'gasket'); p.add(lathe([[0.1, 1.6], [13, 1.6], [13, 8], [0.1, 8]], 24), 'castAlu'); p.add(torus(11, 1.3, 6, 24).rotateX(Math.PI / 2).translate(0, 8.5, 0), 'rubber'); p.add(lathe([[0.1, 9], [12, 9], [12, 42], [8, 46], [0.1, 46]], 24), 'zincPlate'); p.add(box(14, 10, 12).translate(0, 50, 0), 'blackPlastic'); for (const k of [-1, 1]) { p.add(hexNut(8, 3).translate(k * 19, 10, 0), 'zincPlate'); p.add(lathe([[2.7, 8], [5, 8], [5, 8.6], [2.7, 8.6]], 12).translate(k * 19, 0, 0), 'darkSteel'); } return p; }, () => [plenTop(-60, -140)]);
def('aux-air-valve', () => { const p = new Part(); p.add(lathe([[0.1, 0], [22, 0], [22, 32], [0.1, 32]], 28), 'castAlu'); p.add(cylBetween([0, 16, 0], [36, 16, 0], 6, 12), 'castAlu'); p.add(cylBetween([0, 16, 0], [-36, 16, 0], 6, 12), 'castAlu'); for (const k of [-1, 1]) { p.add(hexNut(10, 4).translate(k * 28, 2, 0), 'zincPlate'); p.add(lathe([[3.2, 0], [6, 0], [6, 0.9], [3.2, 0.9]], 12).translate(k * 28, -0.9 + 0.9, 0), 'darkSteel'); p.add(lathe([[3.2, -4.4], [6, -4.4], [6, -3.5], [3.2, -3.5]], 12).translate(k * 28, 0, 6), 'darkSteel'); } p.add(box(70, 3, 18).translate(0, -1.5, 0), 'zincPlate'); return p; }, () => [M(V(0, 266.2 + INTAKE_LIFT, -150), Y, Z)]);
def('aux-air-plumbing', () => { const p = new Part(); p.add(tube([[0, 0, 0], [0, 8, 0], [0, 8, 60]], 8, 10, 24), 'rubber'); p.add(cylBetween([0, 8, 60], [0, 8, 120], 6, 12), 'steel'); p.add(cylBetween([0, 8, 120], [0, 8, 140], 8, 12), 'rubber');
  for (const z of [6, 52, 66, 114, 126, 136]) p.add(torus(8.8, 0.9, 6, 20).translate(0, 8, z), 'zincPlate'); p.add(torus(8.8, 0.9, 6, 20).rotateX(Math.PI / 2).translate(0, 3, 0), 'zincPlate'); return p; }, () => [M(V(70, 266.2 + INTAKE_LIFT, -66), Y, Z)]);
def('vacuum-limiter', () => { const p = new Part(); p.add(lathe([[0.1, 0], [18, 0], [18, 22], [0.1, 22]], 24), 'satinBlack'); p.add(cylBetween([0, 11, 0], [26, 11, 0], 4, 10), 'blackPlastic'); p.add(cyl(5, 12, 12).translate(0, -6, 0), 'zincPlate'); p.add(hexNut(10, 6).translate(0, 25, 0), 'zincPlate'); p.add(lathe([[4.2, 22], [7, 22], [7, 23.4], [4.2, 23.4]], 12), 'darkSteel'); return p; }, () => [plenTop(-60, -105)]);
def('vacuum-fittings', () => { const p = new Part(); p.add(cylBetween([-20, 0, 0], [20, 0, 0], 4, 10), 'blackPlastic'); p.add(cylBetween([0, 0, 0], [0, 0, 20], 4, 10), 'blackPlastic'); p.add(cylBetween([0, 0, 20], [0, 0, 34], 3, 10), 'brass'); for (const [x, z] of [[-16, 0], [16, 0], [0, 12], [-8, 0], [8, 0]]) p.add(yToZ(torus(4.6, 0.8, 6, 16)).rotateY(z ? 0 : Math.PI / 2).translate(x, 0, z), 'zincPlate'); return p; }, () => [M(V(-15, 271 + INTAKE_LIFT, -112), Y)]);
def('airbox-clamps', () => { const p = new Part(); p.add(box(30, 1.5, 14).translate(0, 0.75, 0), 'zincPlate'); p.add(box(4, 8, 14).translate(14, 4, 0), 'zincPlate'); p.add(torus(4, 0.9, 6, 12).translate(-10, 3, 0), 'zincPlate'); return p; }, () => [-1, 1].map((k) => M(V(k * (AIRBOX.r + 0.1), AIRBOX.y + INTAKE_LIFT, AIRBOX.z - AIRBOX.len / 2 + 60), V(k, 0, 0), Z)));
def('injection-banjos', () => banjo(), () => [0, 1, 2, 3, 4, 5].map((i) => { const a = (i / 6) * Math.PI * 2; return M(V(-120 + 40 * Math.cos(a), AIRBOX.y + 40 + INTAKE_LIFT, AIRBOX.z - 150 + 40 * Math.sin(a)), Y); }));
def('injection-line-rings', () => washer(4.1, 6, 1, 'copper'), () => CYLS.map((c) => posed(`injector-${c}`, [0, 40.05, 0], [0, 1, 0])).concat([M(V(-60, WUR.flangeTop + 40, -150), Y), M(V(-60, WUR.flangeTop + 40, -180), Y)]));
def('injection-line-bracket', () => { const p = new Part(); p.add(box(40, 2, 20).translate(0, 1, 0), 'zincPlate'); p.add(box(4, 20, 20).translate(-18, 10, 0), 'zincPlate'); p.add(yToZ(torus(6, 1, 6, 16)).translate(-18, 22, 0), 'zincPlate'); p.add(hexNut(13, 6.5).translate(10, 5, 0), 'zincPlate'); p.add(lathe([[4.1, 2], [7, 2], [7, 3.6], [4.1, 3.6]], 16), 'zincPlate'); return p; }, () => [plenTop(60, -140)]);
def('wur-lines', () => { const p = new Part();
  for (let i = 0; i < 3; i++) { const x = i * 11 - 11; p.add(lathe([[0.1, 0], [6, 0], [6, 10], [0.1, 10]], 16).translate(x, 0, 0), 'brass'); p.add(hexNut(12, 5).translate(x, 12.5, 0), 'zincPlate');
    for (const y of [-1.2, 10]) p.add(lathe([[4.1, 0], [7, 0], [7, 1.2], [4.1, 1.2]], 16).translate(x, y, 0), 'copper');
    p.add(tube([[x, 5, 0], [x, 5, 14 + i * 3], [x - 20 - i * 4, 8, 60], [x - 20 - i * 4, 8, 120]], 3, 8, 32), 'steel'); }
  p.add(hexNut(19, 8).translate(-30, 4, 0), 'zincPlate'); p.add(lathe([[5, 0], [9, 0], [9, 1.5], [5, 1.5]], 16).translate(-30, -1.5, 0), 'copper');
  p.add(tube([[-30, 6, 0], [-30, 6, 30], [-50, 10, 90]], 3, 8, 24), 'steel'); p.add(hexNut(17, 8).translate(-50, 14, 90), 'brass'); p.add(lathe([[5, 0], [9, 0], [9, 1.5], [5, 1.5]], 16).translate(-50, 9, 90), 'copper');
  return p; }, () => [M(V(-60, WUR.flangeTop + 6, -170), Y)]);
def('throttle-linkage', () => { const p = new Part(); p.add(box(60, 3, 30).translate(0, 1.5, 0), 'zincPlate'); for (const k of [-1, 1]) p.add(lathe([[4, 3], [7, 3], [7, 15], [4, 15]], 16).translate(k * 20, 0, 0), 'bronze'); p.add(box(50, 4, 8).translate(0, 18, 0).rotateY(0.4), 'zincPlate'); p.add(lathe([[4, 15], [9, 15], [9, 16.5], [4, 16.5]], 16), 'zincPlate'); p.add(box(40, 4, 8).translate(10, 24, 10), 'zincPlate'); for (const k of [-1, 1]) for (const j of [0, 1]) { p.add(lathe([[4, 0], [6.5, 0], [6.5, 1.5], [4, 1.5]], 12).translate(k * 24, 26 + j * 5, j * 8), 'darkSteel'); p.add(hexNut(13, 6).translate(k * 24, 30 + j * 5, j * 8), 'zincPlate'); } p.add(cylBetween([20, 24, 10], [120, 24, 60], 2.5, 8), 'zincPlate'); p.add(spring(3, 0.8, 0, 40, 12).rotateZ(Math.PI / 2).translate(-30, 30, 0), 'darkSteel'); return p; }, () => [plenTop(45, -105)]);
def('airbox-straps', () => { const p = new Part(); p.add(box(14, 60, 1.5).translate(0, 30, 0), 'zincPlate'); p.add(box(20, 3, 20).translate(0, 1.5, 0), 'zincPlate'); p.add(hexNut(8, 4).translate(0, 5, 0), 'zincPlate'); return p; }, () => [-1, 1].map((k) => M(V(k * (AIRBOX.r + 2), AIRBOX.y - 30 + INTAKE_LIFT, AIRBOX.z), Y)));
def('airbox-fittings', () => { const p = new Part(); p.add(lathe([[0.1, 0], [30, 0], [30, 0.6], [0.1, 0.6]], 32), 'gasket'); p.add(hexNut(14, 6).translate(40, 4, 0), 'zincPlate'); p.add(lathe([[5, 0], [8, 0], [8, 1.5], [5, 1.5]], 16).translate(40, 0, 0), 'copper'); p.add(cylBetween([-40, 0, 0], [-40, 20, 0], 6, 12), 'blackPlastic'); p.add(cylBetween([-40, 20, 0], [-60, 34, 0], 5, 12), 'blackPlastic'); for (const y of [8, 26]) p.add(torus(7, 0.8, 6, 16).rotateX(Math.PI / 2).translate(-40, y, 0), 'zincPlate'); p.add(cyl(6, 10, 12).translate(20, 5, 20), 'rubber'); p.add(lathe([[4, 0], [7, 0], [7, 1.2], [4, 1.2]], 12).translate(-20, 0, 20), 'darkSteel'); for (const x of [-12, -4]) p.add(lathe([[4.2, 0], [8, 0], [8, 1.2], [4.2, 1.2]], 12).translate(x, 0, -20), 'zincPlate'); p.add(lathe([[4.2, 0], [7, 0], [7, 1.4], [4.2, 1.4]], 12).translate(6, 0, -20), 'darkSteel'); return p; }, () => [M(V(-62, 310 + INTAKE_LIFT, -100), V(0, -1, 0))]);
def('muffler-hardware', () => { const p = new Part(); p.add(lathe([[30, 0], [44, 0], [44, 1.2], [30, 1.2]], 32), 'gasket'); p.add(lathe([[30, -40], [36, -40], [36, -39], [30, -39]], 32), 'gasket'); for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; p.add(hexNut(13, 6.5).translate(38 * Math.cos(a), 4.5, 38 * Math.sin(a)), 'zincPlate'); p.add(cyl(4, 20, 8).translate(38 * Math.cos(a), 0, 38 * Math.sin(a)), 'zincPlate'); } for (const k of [-1, 1]) p.add(torus(30, 2.5, 6, 32).rotateX(Math.PI / 2).translate(k * 120, -30, 0), 'zincPlate'); return p; }, () => [M(V(0, -250, -330), V(0, 0, 1))]);
def('heater-adapters', () => { const p = new Part(); p.add(lathe([[38, 0], [41, 0], [41, 30], [38, 30]], 32), 'aluminized'); p.add(torus(41.5, 2, 6, 32).rotateX(Math.PI / 2).translate(0, 15, 0), 'zincPlate'); p.add(cylBetween([41, 15, 0], [52, 15, 0], 3, 8), 'zincPlate'); return p; }, () => [-1, 1].map((s) => M(V(s * 180, -150, -250), V(0, 0, -1))));
def('heater-hose', () => { const p = new Part(); p.add(tube([[0, 0, 0], [0, -20, -40], [0, -20, -160]], 30, 16, 32), 'aluminized'); for (const z of [-30, -150]) p.add(torus(31, 1.5, 6, 32).translate(0, -20, z), 'zincPlate'); return p; }, () => [M(V(-180, -150, -282), Y, X)]);
def('muffler-bracket', () => { const p = new Part(); p.add(box(120, 4, 30).translate(0, 2, 0), 'zincPlate'); for (const k of [-1, 1]) { p.add(hexNut(13, 6.5).translate(k * 50, 7.5, 0), 'zincPlate'); p.add(lathe([[4.2, 4], [7.5, 4], [7.5, 5.2], [4.2, 5.2]], 12).translate(k * 50, 0, 0), 'darkSteel'); p.add(lathe([[4.2, -1.6], [8, -1.6], [8, 0], [4.2, 0]], 12).translate(k * 50, 0, 0), 'zincPlate'); p.add(cyl(4, 30, 8).translate(k * 50, -10, 0), 'zincPlate'); p.add(hexNut(13, 5.5).translate(k * 50, -25, 0), 'zincPlate'); } return p; }, () => [M(V(0, -300, -260), V(0, -1, 0))]);
def('pre-muffler', () => { const p = new Part(); p.add(boxMM([-110, -24, -40], [110, 24, 40]), 'aluminized'); for (const k of [-1, 1]) p.add(cylBetween([k * 110, 0, 0], [k * 170, 30, 40], 20, 16), 'aluminized'); p.add(cylBetween([0, 0, -40], [0, -10, -90], 22, 16), 'aluminized'); p.add(lathe([[20, 0], [24, 0], [24, 30], [20, 30]], 24).rotateX(-Math.PI / 2).translate(0, -10, -90), 'heatSteel'); for (const k of [-1, 1]) p.add(torus(22, 2, 6, 24).rotateY(Math.PI / 2).translate(k * 130, 10, 14), 'zincPlate'); p.add(lathe([[20, 0], [32, 0], [32, 1], [20, 1]], 24).rotateX(-Math.PI / 2).translate(0, -10, -120), 'gasket'); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; p.add(cylBetween([26 * Math.cos(a), -10 + 26 * Math.sin(a), -124], [26 * Math.cos(a), -10 + 26 * Math.sin(a), -116], 3, 8), 'zincPlate'); p.add(yToZ(hexNut(10, 5)), 'zincPlate', [26 * Math.cos(a), -10 + 26 * Math.sin(a), -126.5]); } for (const k of [-1, 1]) { p.add(cylBetween([k * 130, 36, 6], [k * 130, 36, 22], 3, 8), 'zincPlate'); p.add(yToZ(hexNut(10, 5)), 'zincPlate', [k * 130, 36, 24.5]); } for (const k of [-1, 1]) { p.add(lathe([[20, 0], [32, 0], [32, 1], [20, 1]], 24).rotateZ(Math.PI / 2).translate(k * 172, 30, 40), 'gasket'); } p.add(lathe([[4, 0], [12, 0], [12, 2], [4, 2]], 16).translate(0, 24, 0), 'zincPlate'); return p; }, () => [M(V(0, -250, -330), Y, X)]);
void [box, HOUSING_Z1, INJ, seat, Y, Z, X];
