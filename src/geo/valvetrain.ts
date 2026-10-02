/**
 * Top end batch 1: cam housings, camshafts, rockers and shafts, valves, springs, retainers, keepers.
 * Dimensions and which of them are verified against Dempsey are recorded in docs/engine-spec.md §11.
 * Photos are reference only and are not shipped.
 *
 * Closed-valve lash (Dempsey): the pad rests on the lobe base circle and the adjuster ball is 0.10 mm
 * clear of the stem tip. Turning the cam onto the nose rotates the rocker about its shaft and the
 * valve leaves the seat once that lash is taken up.
 */
import * as THREE from 'three';
import {
  Part, V3, DEG, lathe, boxMM, cyl, cylBetween, yToZ, yToX, circlePath, polyShape,
  extrude, extrudeC, hexNut, tube, csgSub, csgUnion, dropDegenerate, woodruffGeom, cutGroup, subtractSolids, roundRect,
} from './util';
import { CAM_X, CAM_HOUSING_OUT_X, CYL_Z, CYL_TOP_X, HEAD_OUT_X, COVER_BOOT_HOLE, SPARK_TIP, SPARK_Z, SPARK_BOOT_Y, sparkDirHead } from '../data/layout';
import { HEAD_HW } from './hwLayout';
import { CH_Z0, CH_Z1, VC_EARS, VC_EDGE, CAM_NOSE, CHAIN_Z, bankZ, coverMatrix } from './core';
import {
  VALVE_LEN, STEM_R, GUIDE_Y0, GUIDE_Y1,
  stemDirLocal, stemPointLocal, headToEngine, camSpringCutters,
} from './valveGeom';
import type { MatKey } from './materials';

export { headToEngine };

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Assembled crank angle the static meshes are built at (cylinder 1 at firing TDC). */
export const ASSEMBLED_CRANK = 0;

/**
 * Cam profile. Peak radius is held under the journal radius so the shaft can slide in through the
 * line-bored housing. Numbers not taken from Dempsey are marked in the spec.
 */
export const CAM = {
  journalR: 23.35, // Ø46.7
  boreR: 23.55, // Ø47.1 housing bore; 0.2 mm radial over the journal
  baseR: 15.2, // heel
  lift: 7.5, // peak = 22.7, just under journalR − 0.5 so the cam still slides in
  noseR: 13.2, // circular nose; its centre is offset from the shaft
  nose: 0.78, // rad: nose arc hands off to the flank
  flank: 1.22, // rad: flank meets the base circle, zero slope
  journalW: 16,
  lobeW: 12.4, // flat face; intake/exhaust centres are 14 mm apart
  shankR: 16.8, // Ø33.6 cast shank in the middle of a span — stout, still under the bore
  cheekR: 14.2, // beside each lobe, just under the heel so the base circle shows without a deep neck
  grooveR: 12.6, // ground relief between an intake/exhaust pair
  grooveW: 1.7,
  webZ0: 18,
};
/**
 * Rocker shaft 901.105.342.04 and the screw/nut seats. Spot faces sit just outside the arm boss.
 * Half-length 13 mm (was 17): the outer stations sit next to a cover stud, and 17 mm
 * runs the shaft end into that stud. 13 mm keeps the boss and clears the stud by about 1 mm.
 */
export const SHAFT = { r: 9, boreR: 4.15, half: 13, bossR: 12.6, bossHalf: 11 };
export const LASH = 0.10;
/**
 * Pad arm 42 mm, eye 34 mm, pad shoe 19 mm wide — the forging proportions.
 * The bend is not the old 28°. With the valves spread to y +22 / y −23, a 28°
 * eye swings mostly across the stem, and the 7.5 mm lobe arrives as about 4.5 mm
 * of valve lift. Intake 71° and exhaust 50° keep those arm lengths and put the
 * eye along the stem, so the same lobe is about 10.5 mm intake and 11.1 mm exhaust.
 * The shaft is still the circle that puts the pad crown on the base circle and
 * the ball 0.10 mm off the stem tip.
 */
export const PAD_LEN = 42;
export const EYE_LEN = 34;
export const ARM_BEND = 28 * DEG;
const ARM_BEND_IN = 71 * DEG;
const ARM_BEND_EX = 50 * DEG;
function eyeLen(_side: 1 | -1) { return EYE_LEN; }
function padLen(_side: 1 | -1) { return PAD_LEN; }
function bendOf(side: 1 | -1) { return side > 0 ? ARM_BEND_IN : ARM_BEND_EX; }
const INSTALLED = 34.5; // spring seat to retainer, closed
const TIP_STICK = 3.4; // stem tip proud of the keeper

/** Firing TDC on the 720° cycle (opposite cylinders are 360° apart). */
export const FIRE_CRANK: Record<number, number> = { 1: 0, 6: 120, 2: 240, 4: 360, 3: 480, 5: 600 };
/** Crank degrees after firing TDC at which the lobe nose points at the rocker pad. */
const PEAK_CRANK = { in: 450, ex: 270 };

/** Radius of the offset circular nose. Angle is measured from the nose, in radians. */
function noseCircleRadius(a: number): number {
  const rn = CAM.noseR;
  const d = CAM.baseR + CAM.lift - rn;
  const c = Math.cos(a);
  const q = Math.sqrt(Math.max(0, d * d * (c * c - 1) + rn * rn));
  return d * c + q;
}
function noseCircleSlope(a: number): number {
  const rn = CAM.noseR;
  const d = CAM.baseR + CAM.lift - rn;
  const c = Math.cos(a), s = Math.sin(a);
  const q = Math.sqrt(Math.max(1e-8, d * d * (c * c - 1) + rn * rn));
  return -d * s - (d * d * c * s) / q;
}
/** dr/dθ of the polar profile. θ is the signed angle from the nose, same sign as `angFromNose`. */
function lobeSlope(angFromNose: number): number {
  const TWO = Math.PI * 2;
  let a = angFromNose % TWO;
  if (a > Math.PI) a -= TWO;
  if (a < -Math.PI) a += TWO;
  const abs = Math.abs(a);
  const sgn = a < 0 ? -1 : 1;
  if (abs < 1e-6 || abs >= CAM.flank) return 0;
  if (abs <= CAM.nose) return noseCircleSlope(abs) * sgn;
  const rN = noseCircleRadius(CAM.nose);
  const sN = noseCircleSlope(CAM.nose);
  const span = CAM.flank - CAM.nose;
  const t = (abs - CAM.nose) / span;
  const t2 = t * t;
  const drdt = (6 * t2 - 6 * t) * rN + (3 * t2 - 4 * t + 1) * (sN * span) + (-6 * t2 + 6 * t) * CAM.baseR;
  return (drdt / span) * sgn;
}
/**
 * Flat-faced cam profile: base circle, a flank, and an offset circular nose.
 * Zero slope at the nose and where the flank meets the base circle.
 * The same radius is used across the full lobe width — the face is not crowned.
 */
export function lobeRadius(angFromNose: number): number {
  let a = Math.abs(angFromNose) % (Math.PI * 2);
  if (a > Math.PI) a = Math.PI * 2 - a;
  if (a >= CAM.flank) return CAM.baseR;
  if (a <= CAM.nose) return noseCircleRadius(a);
  const rN = noseCircleRadius(CAM.nose);
  const sN = noseCircleSlope(CAM.nose);
  const span = CAM.flank - CAM.nose;
  const t = (a - CAM.nose) / span;
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * rN + (t3 - 2 * t2 + t) * (sN * span) + (-2 * t3 + 3 * t2) * CAM.baseR;
}
export const PEAK_R = lobeRadius(0);

export function camWebZ(s: 1 | -1): number[] {
  const zs = bankZ(s).slice().sort((a, b) => a - b);
  // The banks are staggered, and the exhaust lobe sits outboard of the cylinder
  // centre. A journal at CH_Z0+18 clears the right bank and lands on the left
  // bank's cylinder-6 shoe. Park it just outboard of that shoe.
  const rearmost = Math.min(...rockerStations(s).map((st) => st.z));
  const fly = Math.min(CH_Z0 + CAM.webZ0, rearmost - PAD_W / 2 - CAM.journalW / 2 - 1.5);
  return [fly, (zs[0] + zs[1]) / 2, (zs[1] + zs[2]) / 2, CH_Z1 - 16];
}

const sideOf = (which: 'in' | 'ex'): 1 | -1 => (which === 'in' ? 1 : -1);
function whichOf(side: 1 | -1): 'in' | 'ex' { return side > 0 ? 'in' : 'ex'; }

function bankSign(cyl: number): 1 | -1 { return cyl <= 3 ? 1 : -1; }
export function valveTipEngine(cyl: number, side: 1 | -1, lift = 0): THREE.Vector3 {
  return headToEngine(cyl, stemPointLocal(side, VALVE_LEN).addScaledVector(stemDirLocal(side), lift));
}
function stemDirEngine(cyl: number, side: 1 | -1): THREE.Vector3 {
  const d = stemDirLocal(side);
  const s = bankSign(cyl);
  return V(s * d.x, d.y, s * d.z).normalize();
}

function rot2(v: THREE.Vector2, ang: number): THREE.Vector2 {
  const c = Math.cos(ang), si = Math.sin(ang);
  return new THREE.Vector2(v.x * c - v.y * si, v.x * si + v.y * c);
}

export interface RockerLayout {
  cyl: number; side: 1 | -1; s: 1 | -1;
  C: THREE.Vector2; P: THREE.Vector2; K: THREE.Vector2; tip: THREE.Vector2; ball: THREE.Vector2;
  z: number; stem: THREE.Vector2;
  /** Rotation that carries the local forging (pad at +X) onto this closed pose. */
  ang: number;
  /** Eye-arm bend in the local forging. Positive bends the eye toward local −Y. */
  gamma: number;
}
function circleHits(C: THREE.Vector2, r: number, B: THREE.Vector2, d: number): THREE.Vector2[] {
  const v = B.clone().sub(C);
  const dist = v.length();
  if (dist < 1e-6) return [];
  const a = (r * r - d * d + dist * dist) / (2 * dist);
  const h2 = r * r - a * a;
  if (h2 < -1e-4) return [];
  const h = Math.sqrt(Math.max(0, h2));
  const p = C.clone().addScaledVector(v, a / dist);
  const perp = new THREE.Vector2(-v.y, v.x).multiplyScalar(h / dist);
  return [p.clone().add(perp), p.clone().sub(perp)];
}
/** Local bend. Flipped on the left bank so the installed pivots mirror. */
function rockerGamma(side: 1 | -1, s: 1 | -1): number {
  return side * s * bendOf(side);
}
function localPad(side: 1 | -1): THREE.Vector2 { return new THREE.Vector2(padLen(side), 0); }
function localBall(gamma: number, side: 1 | -1): THREE.Vector2 {
  return new THREE.Vector2(Math.cos(Math.PI + gamma) * eyeLen(side), Math.sin(Math.PI + gamma) * eyeLen(side));
}
/**
 * Closed-valve layout. The forging is a fixed side profile (pad arm PAD_LEN, eye arm EYE_LEN).
 * The shaft centre is wherever that profile has to sit for the pad crown to rest on the base
 * circle and the adjuster ball to sit LASH mm short of the stem tip. The contact is the base-circle
 * point far from the stem, so the pad arm sweeps away from the boss instead of folding into it.
 */
export function rockerLayout(cyl: number, side: 1 | -1): RockerLayout {
  const s = bankSign(cyl);
  const tipE = valveTipEngine(cyl, side, 0);
  const C = new THREE.Vector2(s * CAM_X, 0);
  const tip = new THREE.Vector2(tipE.x, tipE.y);
  const stem = stemDirEngine(cyl, side);
  const stem2 = new THREE.Vector2(stem.x, stem.y).normalize();
  const ball = tip.clone().addScaledVector(stem2, -LASH);
  const gamma = rockerGamma(side, s);
  const padL = localPad(side);
  const ballL = localBall(gamma, side);
  const D = padL.distanceTo(ballL);
  const tipAng = Math.atan2(tip.y - C.y, tip.x - C.x);
  let bestK: THREE.Vector2 | null = null;
  let bestScore = Infinity;
  // Two circles. Prefer the one whose full lobe lift arrives near 10.5 mm at the
  // valve. The other, with a 28°-class eye, leaves the lift near 4.5 mm.
  const scoreOf = (P: THREE.Vector2, K: THREE.Vector2) => {
    const lay = { P, K, C, ball, tip, stem: stem2 } as RockerLayout;
    const beta = rockerBeta(lay, PEAK_R);
    const lift = Math.max(0, ballAlongOf(lay, beta));
    const err = Math.abs(radiusAt(lay, beta) - PEAK_R);
    let sep = Math.abs(Math.atan2(K.y - C.y, K.x - C.x) - tipAng);
    if (sep > Math.PI) sep = Math.PI * 2 - sep;
    // Reach the nose, then sit nearest 10.5 mm. A candidate that misses the nose sorts last.
    return (err > 0.08 ? 100 + err : 0) + Math.abs(lift - 10.5) - sep * 0.01;
  };
  for (const K of circleHits(C, CAM.baseR, ball, D)) {
    const ang = Math.atan2(ball.y - K.y, ball.x - K.x) - Math.atan2(ballL.y - padL.y, ballL.x - padL.x);
    const P = K.clone().sub(rot2(padL, ang));
    if (P.distanceTo(C) < CAM.baseR + 10) continue;
    const score = scoreOf(P, K);
    if (score < bestScore) { bestScore = score; bestK = K; }
  }
  if (!bestK) throw new Error(`rocker layout failed for cylinder ${cyl} side ${side}`);
  const ang = Math.atan2(ball.y - bestK.y, ball.x - bestK.x) - Math.atan2(ballL.y - padL.y, ballL.x - padL.x);
  const P = bestK.clone().sub(rot2(padL, ang));
  return { cyl, side, s, C, P, K: bestK, tip, ball, z: tipE.z, stem: stem2, ang, gamma };
}
function radiusAt(lay: RockerLayout, beta: number): number {
  const v = lay.K.clone().sub(lay.P);
  const r = rot2(v, beta);
  return Math.hypot(lay.P.x + r.x - lay.C.x, lay.P.y + r.y - lay.C.y);
}
function ballAt(lay: RockerLayout, beta: number): THREE.Vector2 {
  const v = lay.ball.clone().sub(lay.P);
  const r = rot2(v, beta);
  return new THREE.Vector2(lay.P.x + r.x, lay.P.y + r.y);
}
function ballAlongOf(lay: RockerLayout, beta: number): number {
  const b = ballAt(lay, beta);
  return (b.x - lay.tip.x) * lay.stem.x + (b.y - lay.tip.y) * lay.stem.y;
}
/** World angle of the pad contact, measured from the cam centre. The lobe nose is aimed from here. */
export function contactAngle(lay: RockerLayout, beta: number): number {
  const r = rot2(lay.K.clone().sub(lay.P), beta);
  return Math.atan2(lay.P.y + r.y - lay.C.y, lay.P.x + r.x - lay.C.x);
}
/**
 * Rocker rotation that puts the pad on a lobe of radius `lobeR`.
 * Distance from the cam is even in beta (the closed pad sits on the line of centres, so either
 * swing grows the radius). The sign is the one that drives the ball along the stem and opens the valve.
 */
export function rockerBeta(lay: RockerLayout, lobeR: number): number {
  const sign = ballAlongOf(lay, 0.05) >= ballAlongOf(lay, 0) ? 1 : -1;
  let best = 0, err = Math.abs(radiusAt(lay, 0) - lobeR);
  for (let i = 0; i <= 64; i++) {
    const b = sign * (i / 64) * 0.9;
    const e = Math.abs(radiusAt(lay, b) - lobeR);
    if (e < err) { err = e; best = b; }
  }
  for (let step = 0.015; step > 1e-5; step *= 0.4) {
    for (const db of [-step, step]) {
      const b = best + db;
      if (b * sign < -1e-4) continue;
      const e = Math.abs(radiusAt(lay, b) - lobeR);
      if (e < err) { err = e; best = b; }
    }
  }
  return best;
}

export interface TrainPose { lobeR: number; beta: number; lift: number; gap: number; lay: RockerLayout }
/** Valvetrain pose at a crank angle. `gap` is the adjuster-to-stem clearance along the stem; `lift` is valve lift. */
export function trainPose(cyl: number, side: 1 | -1, crank: number): TrainPose {
  const lay = rockerLayout(cyl, side);
  const which = whichOf(side);
  const fromPeak = ((crank - (FIRE_CRANK[cyl] + PEAK_CRANK[which])) / 2) * DEG;
  const lobeR = lobeRadius(fromPeak);
  const beta = rockerBeta(lay, lobeR);
  const ball = ballAt(lay, beta);
  const ballAlong = (ball.x - lay.tip.x) * lay.stem.x + (ball.y - lay.tip.y) * lay.stem.y;
  // Closed ball sits at -LASH. Outward motion of the ball (ballAlong increasing through 0) opens the valve.
  const lift = Math.max(0, ballAlong);
  const gap = Math.max(0, -ballAlong);
  return { lobeR, beta, lift, gap, lay };
}

/**
 * Where a rocker crosses the cover's side rail, in cover-local mm.
 * `reach` is how far the opening has to run from the cover centre so the
 * arm is outside the rail; the gasket and the housing land jog out with it
 * and stay one closed ring.
 */
export interface RailJog { y0: number; y1: number; sign: 1 | -1; reach: number }
export function railJogs(s: 1 | -1, upper: boolean): RailJog[] {
  const inv = coverMatrix(s, upper).clone().invert();
  const out: RailJog[] = [];
  for (const st of rockerStations(s)) {
    if ((st.side > 0) !== upper) continue;
    const lay = rockerLayout(st.cyl, st.side);
    const line: THREE.Vector3[] = [];
    const at = (x: number, y: number) => line.push(new THREE.Vector3(x, y, lay.z).applyMatrix4(inv));
    at(lay.P.x, lay.P.y);
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      at(lay.P.x + (lay.K.x - lay.P.x) * t, lay.P.y + (lay.K.y - lay.P.y) * t);
    }
    const cross = line.filter((p) => p.z > -6 && p.z < 8 && Math.abs(p.x) > 18);
    if (cross.length) {
      const sign: 1 | -1 = cross.reduce((a, p) => a + p.x, 0) < 0 ? -1 : 1;
      const side = cross.filter((p) => Math.sign(p.x) === sign || Math.abs(p.x) > 22);
      let y0 = Infinity, y1 = -Infinity, reach = 0;
      for (const p of side) {
        y0 = Math.min(y0, p.y);
        y1 = Math.max(y1, p.y);
        reach = Math.max(reach, Math.abs(p.x));
      }
      // Arm section plus 2 mm, so the eroded rocker stays off the rail.
      out.push({ y0: y0 - 9, y1: y1 + 9, sign, reach: reach + 8 });
    }
    // The spring crosses the opposite rail from the arm. One jog on that side,
    // kept inside the lip so the bridge does not pass the ear.
    for (const along of [82, 96]) {
      const e = headToEngine(st.cyl, stemPointLocal(st.side, along)).applyMatrix4(inv);
      if (e.z < -6 || e.z > 6 || Math.abs(e.x) < 16) continue;
      const sign: 1 | -1 = e.x < 0 ? -1 : 1;
      // Bridge sits past the spring wire. A reach of 26 put the left-bank bridge on the wire.
      out.push({ y0: e.y - 10, y1: e.y + 10, sign, reach: Math.min(Math.abs(e.x) + 16, 36) });
    }
  }
  return mergeRailJogs(out);
}
/** One notch per side. Overlapping jogs become a single cut so the bridge weld stays manifold. */
function mergeRailJogs(jogs: RailJog[]): RailJog[] {
  const out: RailJog[] = [];
  for (const sign of [1, -1] as const) {
    const list = jogs.filter((j) => j.sign === sign).sort((a, b) => a.y0 - b.y0);
    for (const j of list) {
      const prev = out[out.length - 1];
      if (prev && prev.sign === sign && j.y0 <= prev.y1 + 2) {
        prev.y0 = Math.min(prev.y0, j.y0);
        prev.y1 = Math.max(prev.y1, j.y1);
        prev.reach = Math.max(prev.reach, j.reach);
      } else out.push({ ...j });
    }
  }
  return out;
}
/**
 * Closed gasket or land. Each jog cuts the rail out of the arm's way and welds
 * a bridge on the outside, overlapping the rail at both ends of the cut, so the
 * seal stays one piece.
 */
export function joggedSheet(outerW: number, outerL: number, holeW: number, holeL: number, jogs: RailJog[], thickness: number): THREE.BufferGeometry {
  const sh = roundRect(outerW, outerL, 7);
  sh.holes.push(new THREE.Path(roundRect(holeW, holeL, 4).getPoints(8)));
  let g: THREE.BufferGeometry = extrudeC(sh, thickness);
  if (!jogs.length) return g;
  const notches: THREE.BufferGeometry[] = [];
  const bridges: THREE.BufferGeometry[] = [];
  for (const j of jogs) {
    const far = j.sign * (j.reach + 2);
    const inner = j.sign * 12;
    notches.push(boxMM(
      [Math.min(inner, far), j.y0, -thickness],
      [Math.max(inner, far), j.y1, thickness],
    ));
    // Bridge stays outside the arm: a strip past `reach`, and two tabs that
    // land on the rail beside the cut.
    const near = j.sign * (j.reach + 0.4);
    const beyond = j.sign * (j.reach + 5);
    const rail = j.sign * (outerW / 2 - 2);
    const z0 = -thickness / 2, z1 = thickness / 2;
    bridges.push(boxMM([Math.min(near, beyond), j.y0 - 6, z0], [Math.max(near, beyond), j.y1 + 6, z1]));
    bridges.push(boxMM([Math.min(rail, beyond), j.y0 - 6, z0], [Math.max(rail, beyond), j.y0 - 0.3, z1]));
    bridges.push(boxMM([Math.min(rail, beyond), j.y1 + 0.3, z0], [Math.max(rail, beyond), j.y1 + 6, z1]));
  }
  g = csgSub(g, ...notches);
  return csgUnion([g, ...bridges]);
}
export function rockerStations(s: 1 | -1) {
  const cyls = s > 0 ? [1, 2, 3] : [4, 5, 6];
  return cyls.flatMap((cyl) => ([1, -1] as const).map((side) => {
    const lay = rockerLayout(cyl, side);
    return { cyl, side, x: lay.P.x, y: lay.P.y, z: lay.z, half: SHAFT.half };
  }));
}

// ---------------------------------------------------------------- valves (103-00 #9-#18), head frame
function springVar(R: number, wire: number, y0: number, y1: number, turns: number, tightShare = 0, phase = 0) {
  const pts: V3[] = [];
  const n = Math.ceil(turns * 16);
  const tightTurns = turns * 0.28;
  const tightLen = (y1 - y0) * tightShare;
  for (let i = 0; i <= n; i++) {
    const turn = (i / n) * turns;
    const y = tightShare > 0 && turn < tightTurns
      ? y0 + (turn / tightTurns) * tightLen
      : y0 + (tightShare > 0 ? tightLen : 0) + ((turn - (tightShare > 0 ? tightTurns : 0)) / (turns - (tightShare > 0 ? tightTurns : 0))) * ((y1 - y0) - (tightShare > 0 ? tightLen : 0));
    const a = turn * Math.PI * 2 + phase;
    pts.push([R * Math.cos(a), y, R * Math.sin(a)]);
  }
  return tube(pts, wire, 6, Math.max(10, n));
}
function valveProfile(dia: number, exhaust: boolean): [number, number][] {
  const headR = dia / 2;
  const g0 = VALVE_LEN - TIP_STICK - 5.6;
  const grooves: [number, number][] = [];
  for (let i = 0; i < 3; i++) {
    const y = g0 + i * 1.55;
    grooves.push([STEM_R, y], [STEM_R - 0.55, y + 0.42], [STEM_R, y + 0.84]);
  }
  const face: [number, number][] = exhaust
    ? [[0.15, 0.85], [1.6, 0.85], [2.4, 0.12], [headR - 1.3, 0.08], [headR - 0.15, 0.9]]
    : [[0.15, 0.12], [headR - 1.4, 0.08], [headR - 0.12, 0.95]];
  return [
    ...face,
    [headR - 0.15 - 1.5, 0.95 + 1.5], // 45° seat
    [STEM_R + (headR - STEM_R) * 0.62, 6.5],
    [STEM_R + 2.2, 16],
    [STEM_R + 0.35, 30],
    [STEM_R, 40],
    [STEM_R, g0],
    ...grooves,
    [STEM_R, VALVE_LEN - TIP_STICK],
    [STEM_R - 0.15, VALVE_LEN - 0.4],
    [STEM_R * 0.35, VALVE_LEN],
  ];
}
/** One cylinder's valves, seats, guides, stem seals, springs, retainers and keepers. `cyl` selects the assembled lift. */
export function valveSet(cyl = 1) {
  const p = new Part();
  const one = (side: 1 | -1, dia: number) => {
    const pose = trainPose(cyl, side, ASSEMBLED_CRANK);
    const dir = stemDirLocal(side);
    const face = stemPointLocal(side, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir);
    const place = (g: THREE.BufferGeometry, along: number) => {
      g.applyQuaternion(q);
      const o = face.clone().addScaledVector(dir, along);
      g.translate(o.x, o.y, o.z);
      return g;
    };
    const fixed = (g: THREE.BufferGeometry, along: number, m: MatKey) => p.add(place(g, along), m);
    const moving = (g: THREE.BufferGeometry, along: number, m: MatKey) => p.add(place(g, along + pose.lift), m);
    // thin seat insert. A fat dark collar read as an oversized ring around the head; this one
    // is a narrow land just outside the 45° face.
    const seatR = dia / 2;
    fixed(lathe([
      [seatR - 1.15, 0.15], [seatR + 0.28, 0.15], [seatR + 0.28, 1.25],
      [seatR - 0.15, 1.25], [seatR - 0.72, 0.55], [seatR - 1.15, 0.15],
    ], 28), 0, 'darkSteel');
    // guide (bronze) and the stem seal on top of it — CoS seal, reshaped to a lip seal
    fixed(lathe([[STEM_R + 0.25, 0], [6.55, 0], [6.55, GUIDE_Y1 - GUIDE_Y0], [STEM_R + 0.25, GUIDE_Y1 - GUIDE_Y0]], 18), GUIDE_Y0, 'bronze');
    fixed(lathe([
      [STEM_R + 0.35, 0], [7.4, 0], [7.4, 1.6], [6.2, 2.4], [5.15, 4.6], [5.15, 6.4],
      [4.85, 6.8], [4.85, 4.8], [6.3, 3.2], [6.3, 1.4], [STEM_R + 0.35, 1.1],
    ], 18), GUIDE_Y1 - 0.4, 'rubber');
    fixed(lathe([[6.1, 0.3], [7.5, 0.3], [7.5, 2.2], [6.1, 2.2]], 16), GUIDE_Y1 + 0.2, 'steel');
    // shim (#11) + spring seat (#12) under the springs
    const seatY = VALVE_LEN - TIP_STICK - 7.2 - INSTALLED;
    // Diameters are held in so the stack clears the cam-housing stud nuts (those stations are fixed).
    fixed(lathe([[STEM_R + 0.8, 0], [10.2, 0], [10.2, 0.6], [STEM_R + 0.8, 0.6]], 24), seatY - 0.7, 'polishedSteel');
    fixed(lathe([[STEM_R + 0.7, 0], [9.6, 0], [9.6, 1.3], [STEM_R + 0.7, 1.3]], 24), seatY - 0.15, 'steel');
    const yRet = seatY + INSTALLED - pose.lift;
    const ySpring0 = seatY + 1.15;
    // Outer is the heavy dark helix with damper coils at the head end. Inner is a lighter,
    // brighter helix on a smaller radius so the two wires don't merge into one coil.
    // Outer centre Ø20 (wire to Ø11.6) stays inside the cam-housing stud-nut clearance.
    fixed(springVar(8.2, 1.45, ySpring0, yRet, 5.2, 0.24, 0.4), 0, 'darkSteel');
    fixed(springVar(6.05, 0.92, ySpring0 + 0.5, yRet - 0.45, 8.0, 0, 1.7), 0, 'steel');
    // stepped retainer (#14)
    moving(lathe([
      [4.6, 0.4], [9.2, 0.4], [9.2, 1.8], [8.0, 1.8], [8.0, 3.0], [6.8, 3.0],
      [6.8, 4.0], [5.8, 5.2], [5.0, 6.6], [4.4, 6.6], [4.4, 1.1], [4.6, 0.4],
    ], 24), yRet, 'satinBlack');
    // two keeper halves (#15), three beads locking into the stem grooves
    const bead = (y: number): [number, number][] => [[4.55, y], [3.85, y + 0.38], [4.55, y + 0.76]];
    const keeperPts: [number, number][] = [[4.5, 0.15], [5.25, 0.7], [5.45, 6.3], [4.75, 6.9], ...bead(4.7), ...bead(3.15), ...bead(1.6), [4.5, 0.15]];
    for (const phi of [0.04, Math.PI + 0.04]) moving(lathe(keeperPts, 12, phi, Math.PI - 0.1), yRet + 0.35, 'darkSteel');
    moving(lathe(valveProfile(dia, side < 0), 28), 0, side > 0 ? 'chrome' : 'heatSteel');
  };
  one(1, 49);
  one(-1, 41.5);
  return p.g;
}

// ---------------------------------------------------------------- rockers + shafts
/** Local forging → engine. One rotation about the shaft, then the shaft centre. */
function placeRocker(g: THREE.BufferGeometry, ang: number, beta: number, P: THREE.Vector2, z: number) {
  g.rotateZ(ang + beta);
  g.translate(P.x, P.y, z);
  return g;
}
function v2(x: number, y: number) { return new THREE.Vector2(x, y); }
function bezOpen(a: THREE.Vector2, ctrl: THREE.Vector2, b: THREE.Vector2, n = 7): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  for (let i = 1; i < n; i++) {
    const t = i / n, u = 1 - t;
    pts.push(a.clone().multiplyScalar(u * u).add(ctrl.clone().multiplyScalar(2 * u * t)).add(b.clone().multiplyScalar(t * t)));
  }
  return pts;
}
function circ(r: number, a: number) { return v2(Math.cos(a) * r, Math.sin(a) * r); }
/** CCW arc on the boss, excluding the endpoints. `a1` may wrap past 2π. */
function bossArc(a0: number, a1: number, r: number, n = 8): THREE.Vector2[] {
  let d = a1 - a0;
  while (d < 0) d += Math.PI * 2;
  while (d > Math.PI * 2) d -= Math.PI * 2;
  const pts: THREE.Vector2[] = [];
  for (let i = 1; i < n; i++) pts.push(circ(r, a0 + d * (i / n)));
  return pts;
}
/**
 * Side profile of the forging, in the shaft frame: pad crown at (PAD_LEN, 0), eye bent by `gamma`,
 * boss circle between them. One simple outline — the pad foot is the end of the arm, not a second block.
 * `localOut` is the cam-to-crown direction in this frame, so the foot is crowned the right way.
 */
function rockerOutline(gamma: number, localOut: THREE.Vector2, eye: number, pad: number, gap = 0.04): [number, number][] {
  const BOSS = 11.6;
  const Rf = 26;
  // Proud of the polar point along the outward normal. The arm extrusion bevels
  // this back in; the shoe is not bevelled, so the two outlines use different gaps.
  const crown = v2(pad, 0).addScaledVector(localOut.clone().normalize(), gap);
  const faceC = crown.clone().addScaledVector(localOut, Rf);
  const aCrown = Math.atan2(crown.y - faceC.y, crown.x - faceC.x);
  const span = 0.68;
  const face: THREE.Vector2[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = aCrown - span / 2 + (span * i) / 10;
    face.push(v2(faceC.x + Math.cos(a) * Rf, faceC.y + Math.sin(a) * Rf));
  }
  const lowerC = face[0], upperC = face[face.length - 1];
  const bow = gamma >= 0 ? 1 : -1;
  const padHi = 0.58, padLo = -0.58;
  const upperBoss = circ(BOSS, padHi);
  const lowerBoss = circ(BOSS, padLo < 0 ? padLo + Math.PI * 2 : padLo);
  const ctrl = (ang: number, rad: number, yb: number) => circ(rad, ang).add(v2(0, yb));
  const upperEdge = bezOpen(upperC, ctrl(0.20, 27, bow * 4.2), upperBoss, 8);
  const lowerEdge = bezOpen(lowerBoss, ctrl(-0.20, 27, bow * 3.2), lowerC, 8);
  // Shorter arm. The eye sits on the ray through the kinematic ball, with a narrow neck.
  const eyeAng = Math.PI + gamma;
  const side = v2(-Math.sin(eyeAng), Math.cos(eyeAng));
  const radial = v2(Math.cos(eyeAng), Math.sin(eyeAng));
  // Stop the forging short of the stem. The ball and the adjuster screw, added
  // separately, are what meet the tip; a wide cap here sat in the retainer.
  const eyeReach = eye - 11;
  const tipC = radial.clone().multiplyScalar(eyeReach);
  const neck = radial.clone().multiplyScalar(eyeReach * 0.64);
  const eyeA = eyeAng - 0.50;
  const eyeB = eyeAng + 0.50;
  let aEyeA = eyeA; while (aEyeA < padHi) aEyeA += Math.PI * 2;
  let aEyeB = eyeB; while (aEyeB < aEyeA) aEyeB += Math.PI * 2;
  let aPadLo = padLo < 0 ? padLo + Math.PI * 2 : padLo;
  while (aPadLo < aEyeB) aPadLo += Math.PI * 2;
  const pts: THREE.Vector2[] = [
    ...face,
    ...upperEdge,
    upperBoss,
    ...bossArc(padHi, aEyeA, BOSS, 9),
    circ(BOSS, aEyeA),
    neck.clone().addScaledVector(side, -2.6),
    tipC.clone().addScaledVector(side, -2.2),
  ];
  pts.push(
    tipC.clone().addScaledVector(side, 2.2),
    neck.clone().addScaledVector(side, 2.6),
    circ(BOSS, aEyeB),
    ...bossArc(aEyeB, aPadLo, BOSS, 7),
    circ(BOSS, aPadLo),
    ...lowerEdge,
  );
  return pts.map((q) => [q.x, q.y]);
}
/**
 * Two channels on an arm, wide in the middle and narrow at each end, with a rib left between them.
 * The web (the uncut strip, and the arm height the channels occupy) tapers toward the pad and the eye.
 */
function pocketShapes(gamma: number, which: 'pad' | 'eye'): [number, number][][] {
  const rib = 0.72;
  if (which === 'pad') {
    const bow = gamma >= 0 ? 1 : -1;
    const rs = [17.2, 23.5, 30, 36.2];
    const cy = (r: number) => {
      const t = (r - 17.2) / (36.2 - 17.2);
      return bow * Math.sin(Math.max(0, Math.min(1, t)) * Math.PI) * 1.6;
    };
    const half = (r: number) => {
      const t = (r - 17.2) / (36.2 - 17.2);
      return 1.25 + Math.sin(Math.max(0, Math.min(1, t)) * Math.PI) * 2.35;
    };
    const channel = (sign: number): [number, number][] => {
      const pts: [number, number][] = [];
      for (const r of rs) pts.push([r, cy(r) + sign * (rib + 0.12)]);
      for (const r of [...rs].reverse()) pts.push([r, cy(r) + sign * half(r)]);
      return pts;
    };
    return [channel(1), channel(-1)];
  }
  const eyeAng = Math.PI + gamma;
  const side = v2(-Math.sin(eyeAng), Math.cos(eyeAng));
  const radial = v2(Math.cos(eyeAng), Math.sin(eyeAng));
  const rs = [14.2, 17.2, 19.4];
  const half = (r: number) => {
    const t = (r - 14.2) / (19.4 - 14.2);
    return 1.05 + Math.sin(Math.max(0, Math.min(1, t)) * Math.PI) * 1.55;
  };
  const at = (r: number, w: number) => radial.clone().multiplyScalar(r).addScaledVector(side, w);
  const channel = (sign: number): [number, number][] => {
    const pts: THREE.Vector2[] = [];
    for (const r of rs) pts.push(at(r, sign * (rib + 0.08)));
    for (const r of [...rs].reverse()) pts.push(at(r, sign * half(r)));
    return pts.map((q) => [q.x, q.y]);
  };
  return [channel(1), channel(-1)];
}
function addShaft(p: Part, x: number, y: number, z: number) {
  // Ends stop just inboard of the housing spot faces so the bore stays open at each face.
  const L = SHAFT.half - 2.0;
  const R = SHAFT.r;
  const g0 = L - 1.0, g1 = L - 2.3, g2 = L - 4.6;
  const outer = yToZ(lathe([
    [R, -L], [R, -g0], [R - 1.15, -g1], [R - 1.15, -g2], [R, -(g2 + 1.1)],
    [R, g2 + 1.1], [R - 1.15, g2], [R - 1.15, g1], [R, g0], [R, L],
  ], 28));
  const bore = yToZ(cyl(SHAFT.boreR, L * 2 + 2, 16));
  const slots: THREE.BufferGeometry[] = [];
  for (const end of [-1, 1]) for (const ang of [0.35, Math.PI + 0.35]) {
    const slot = boxMM([-0.75, -R - 0.5, -3.2], [0.75, R + 0.5, 3.2]);
    slot.rotateZ(ang);
    slot.translate(0, 0, end * (L - 3.4));
    slots.push(slot);
  }
  const shell = dropDegenerate(csgSub(outer, bore, ...slots));
  shell.translate(x, y, z);
  p.add(shell, 'polishedSteel');
  // Cross webs inside the bore, inboard of the slots. The expanding screw and conical nut draw up
  // against them, and the fastener thread-reach ray (r ≈ 2.6) needs material inside the hollow bore.
  for (const end of [-1, 1]) {
    const wz = z + end * (L - 7);
    p.add(boxMM([x - 0.45, y - 3.5, wz - 0.6], [x + 0.45, y + 3.5, wz + 0.6]), 'darkSteel');
    p.add(boxMM([x - 3.5, y - 0.45, wz - 0.6], [x + 3.5, y + 0.45, wz + 0.6]), 'darkSteel');
  }
}
const ARM_T = 9.6;
/** Chilled shoe, wider than the 12.4 mm lobe flat. The cheek beside the lobe is under the base circle. */
export const PAD_W = 19;
/** Hardened chilled foot: the face arc and a curved back, wider than the arm, fused to the outline. */
function padShoe(outline: [number, number][]): [number, number][] {
  const face = outline.slice(0, 11).map(([x, y]) => v2(x, y));
  const n = face.length;
  const back: THREE.Vector2[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const p = face[i];
    const d = p.length() > 1 ? p.clone().normalize() : v2(1, 0);
    const t = i / (n - 1);
    const thick = 4.4 + Math.sin(t * Math.PI) * 3.2;
    back.push(p.clone().addScaledVector(d, -thick));
  }
  return [...face, ...back].map((q) => [q.x, q.y]);
}
export function rockers(s: 1 | -1) {
  const p = new Part();
  const ballR = 3.2;
  for (const st of rockerStations(s)) {
    const pose = trainPose(st.cyl, st.side, ASSEMBLED_CRANK);
    const lay = pose.lay;
    const { P, K, C, z, ang, gamma } = lay;
    const beta = pose.beta;
    // The shoe is tangent to the lobe at the posed crown. A face aimed at the
    // closed radius, then swung by beta, cuts the flank. The polar normal is
    // radial plus the slope term, expressed in the frame placeRocker rotates.
    const fromPeak = ((ASSEMBLED_CRANK - (FIRE_CRANK[st.cyl] + PEAK_CRANK[whichOf(st.side)])) / 2) * DEG;
    const theta = contactAngle(lay, beta);
    const lobeR = radiusAt(lay, beta);
    const slope = lobeSlope(fromPeak);
    const cth = Math.cos(theta), sth = Math.sin(theta);
    const outward = v2(lobeR * cth + slope * sth, lobeR * sth - slope * cth);
    if (outward.lengthSq() < 1e-6) outward.set(1, 0);
    outward.normalize();
    const localOut = rot2(outward, -(ang + beta));
    const armGap = 0.35 + 0.04;
    const outline = rockerOutline(gamma, localOut, eyeLen(lay.side), padLen(lay.side), armGap);
    const shoeOutline = rockerOutline(gamma, localOut, eyeLen(lay.side), padLen(lay.side), 0.04);
    const arm = extrudeC(polyShape(outline), ARM_T, 0.35, 3);
    // Cut in from each flat face. A cutter translated outward of the face only skins the bevel.
    const depth = 3.05;
    const cut = (which: 'pad' | 'eye', side: 1 | -1) => {
      const L = depth + 0.3;
      return pocketShapes(gamma, which).map((pts) => {
        const g = extrude(polyShape(pts), L, 0, 2);
        g.translate(0, 0, side > 0 ? ARM_T / 2 - depth : -(ARM_T / 2 + 0.3));
        return g;
      });
    };
    const carvedRaw = dropDegenerate(csgSub(arm, ...cut('pad', 1), ...cut('pad', -1), ...cut('eye', 1), ...cut('eye', -1)));
    carvedRaw.computeBoundingBox();
    const bb = carvedRaw.boundingBox!;
    const sz = bb.getSize(new THREE.Vector3());
    const mid = bb.getCenter(new THREE.Vector3());
    // A reversed left-bank outline makes the boolean emit a mesh centred near the
    // origin. That reads as a floating fragment once the bank is placed. Keep the uncut arm.
    const carved = sz.x < 120 && sz.y < 120 && sz.z < 40 && mid.length() < 70 && Number.isFinite(sz.x) ? carvedRaw : arm;
    p.add(placeRocker(carved, ang, beta, P, z), 'forgedSteel');
    // 19 mm shoe, 12.4 mm lobe, next lobe 14 mm away. The wings cross that
    // nose and the cast shank. Keep the face over this lobe; cut the wings
    // back to just outside the peak radius.
    const shoe = placeRocker(extrudeC(polyShape(padShoe(shoeOutline)), PAD_W, 0, 3), ang, beta, P, z);
    const keep = boxMM(
      [C.x - 80, -80, z - CAM.lobeW / 2 - 0.15],
      [C.x + 80, 80, z + CAM.lobeW / 2 + 0.15],
    );
    const zone = yToZ(cyl(PEAK_R + 0.8, PAD_W + 6, 28));
    zone.translate(C.x, C.y, z);
    p.add(dropDegenerate(csgSub(shoe, csgSub(zone, keep))), 'polishedSteel');
    const bh = SHAFT.bossHalf;
    const bush = yToZ(lathe([
      [SHAFT.r + 0.12, -(bh - 2.4)], [SHAFT.r + 1.85, -(bh - 2.4)],
      [SHAFT.r + 1.85, bh - 2.4], [SHAFT.r + 0.12, bh - 2.4],
    ], 20));
    bush.translate(P.x, P.y, z);
    p.add(bush, 'bronze');
    // Round hub, no larger than the outline's boss, so the arms read longer than the disc.
    const boss = yToZ(lathe([
      [SHAFT.r + 1.7, -bh], [11.4, -bh], [12.4, -(bh - 1.6)],
      [12.4, bh - 1.6], [11.4, bh], [SHAFT.r + 1.7, bh],
    ], 22));
    boss.translate(P.x, P.y, z);
    p.add(boss, 'forgedSteel');
    // Oil drilling stays inside the hub. One placement — it is not orbited a second time.
    const oilA = Math.PI / 2 * (gamma >= 0 ? 1 : -1);
    const oil = cylBetween(
      [Math.cos(oilA) * 6.5, Math.sin(oilA) * 6.5, 0],
      [Math.cos(oilA) * 12.1, Math.sin(oilA) * 12.1, 0],
      0.85, 8,
    );
    p.add(placeRocker(oil, ang, beta, P, z), 'bore');
    // Ball surface meets the kinematic point. The centre, the screw and the locknut
    // sit outboard of the tip (further along the stem), not back down inside the valve.
    const ballL = localBall(gamma, lay.side);
    const stemL = rot2(lay.stem, -ang);
    const ballCenterL = ballL.clone().addScaledVector(stemL, ballR);
    // Forging stops ~11 mm short of the tip so it stays out of the retainer.
    // A dogleg in the air beside the stem joins that face to the screw.
    const eyeDir = ballL.clone().normalize();
    const tipC = eyeDir.multiplyScalar(eyeLen(lay.side) - 11);
    const side = new THREE.Vector2(-stemL.y, stemL.x);
    const flankSide = side.dot(tipC.clone().sub(ballCenterL)) >= 0 ? side : side.clone().negate();
    const flank = ballCenterL.clone().addScaledVector(flankSide, 6.2);
    const link = cylBetween([tipC.x, tipC.y, 0], [flank.x, flank.y, 0], 3.1, 12);
    p.add(placeRocker(link, ang, beta, P, z), 'forgedSteel');
    const spoke = cylBetween([flank.x, flank.y, 0], [ballCenterL.x, ballCenterL.y, 0], 3.1, 12);
    p.add(placeRocker(spoke, ang, beta, P, z), 'steel');
    const eyeBackL = ballCenterL.clone().addScaledVector(stemL, ballR + 7.5);
    const screw = cylBetween(
      [eyeBackL.x, eyeBackL.y, 0],
      [ballCenterL.x, ballCenterL.y, 0],
      4.0, 12,
    );
    p.add(placeRocker(screw, ang, beta, P, z), 'steel');
    const ballGeo = new THREE.SphereGeometry(ballR, 14, 10);
    ballGeo.translate(ballCenterL.x, ballCenterL.y, 0);
    p.add(placeRocker(ballGeo, ang, beta, P, z), 'polishedSteel');
    const nut = hexNut(13, 5);
    const ax = new THREE.Vector3(stemL.x, stemL.y, 0).normalize();
    nut.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), ax));
    const nutC = eyeBackL.clone().addScaledVector(stemL, 1.6);
    nut.translate(nutC.x, nutC.y, 0);
    p.add(placeRocker(nut, ang, beta, P, z), 'darkSteel');
    addShaft(p, P.x, P.y, z);
  }
  return p.g;
}
// ---------------------------------------------------------------- camshaft
/**
 * Straight extrusion of the cam profile. The face is full width and flat;
 * only the last 0.5 mm of each side is chamfered, so the lobe is not a bead.
 * Nose of the section sits on +X.
 */
function lobeGeom() {
  const nA = 80;
  const half = CAM.lobeW / 2;
  const ch = 0.5;
  const zs = [-half, -half + ch, half - ch, half];
  const pos: number[] = [];
  const idx: number[] = [];
  const at = (i: number, k: number) => k * nA + (i % nA);
  for (let k = 0; k < zs.length; k++) {
    const z = zs[k];
    const inset = Math.abs(Math.abs(z) - half) < 1e-6 ? ch : 0;
    for (let i = 0; i < nA; i++) {
      const a = (i / nA) * Math.PI * 2;
      const r = lobeRadius(a) - inset;
      pos.push(r * Math.cos(a), r * Math.sin(a), z);
    }
  }
  const nZ = zs.length - 1;
  for (let k = 0; k < nZ; k++) for (let i = 0; i < nA; i++) {
    const a = at(i, k), b = at(i + 1, k), c = at(i, k + 1), d = at(i + 1, k + 1);
    idx.push(a, b, c, b, d, c);
  }
  const c0 = pos.length / 3;
  pos.push(0, 0, zs[0]);
  const c1 = pos.length / 3;
  pos.push(0, 0, zs[nZ]);
  for (let i = 0; i < nA; i++) {
    const j = (i + 1) % nA;
    idx.push(c0, at(j, 0), at(i, 0));
    idx.push(c1, at(i, nZ), at(j, nZ));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.normalizeNormals();
  return g;
}
/** Cast span: cheeks at r=cheekR beside a lobe, swelling to shankR in a long middle. */
function castShank(len: number, r0: number, r1: number) {
  if (len < 7) return yToZ(cyl(Math.min(r0, r1), len, 16));
  const mid = CAM.shankR;
  const a = len * 0.28, b = len * 0.72;
  return yToZ(lathe([
    [r0, 0], [Math.max(r0, mid - 1.5), Math.min(2.2, len * 0.2)],
    [mid, a], [mid, b],
    [Math.max(r1, mid - 1.5), Math.max(len - 2.2, b)], [r1, len],
  ], 18));
}
export function camshaft(s: 1 | -1) {
  const p = new Part();
  const X = CAM_X * s;
  const z0 = CH_Z0 + 8;
  // Journals, lobes and the ground groove between each pair. The cast shank fills the gaps
  // so the lobe heel is visible instead of being buried in a full-length rod.
  const blocks: { z0: number; z1: number }[] = [];
  for (const zw of camWebZ(s)) {
    p.add(yToZ(cyl(CAM.journalR, CAM.journalW, 28)), 'polishedSteel', [X, 0, zw]);
    blocks.push({ z0: zw - CAM.journalW / 2, z1: zw + CAM.journalW / 2 });
  }
  const lobeZs: number[] = [];
  for (const c of (s > 0 ? [1, 2, 3] : [4, 5, 6])) {
    const zi = rockerLayout(c, 1).z, ze = rockerLayout(c, -1).z;
    const zg = (zi + ze) / 2;
    p.add(yToZ(cyl(CAM.grooveR, CAM.grooveW, 16)), 'polishedSteel', [X, 0, zg]);
    blocks.push({ z0: zg - CAM.grooveW / 2, z1: zg + CAM.grooveW / 2 });
    for (const side of [1, -1] as const) lobeZs.push(rockerLayout(c, side).z);
  }
  for (const zl of lobeZs) blocks.push({ z0: zl - CAM.lobeW / 2 - 0.04, z1: zl + CAM.lobeW / 2 + 0.04 });
  // nose stack starts at the thrust shoulder; keep the cast shank inboard of it
  const noseZ = CHAIN_Z[s] + CAM_NOSE.flange[0] - 6;
  blocks.push({ z0: noseZ, z1: noseZ + 80 });
  blocks.sort((a, b) => a.z0 - b.z0);
  let cursor = z0;
  const castSpans: { a: number; b: number; r0: number; r1: number }[] = [];
  const besideLobe = (z: number) => lobeZs.some((zl) => Math.abs(z - zl) < CAM.lobeW / 2 + 2.6);
  for (const b of blocks) {
    if (b.z0 > cursor + 1.2) {
      castSpans.push({
        a: cursor, b: b.z0,
        r0: besideLobe(cursor) ? CAM.cheekR : CAM.shankR - 0.6,
        r1: besideLobe(b.z0) ? CAM.cheekR : CAM.shankR - 0.6,
      });
    }
    cursor = Math.max(cursor, b.z1);
  }
  for (const span of castSpans) {
    const g = castShank(span.b - span.a, span.r0, span.r1);
    g.translate(X, 0, span.a);
    p.add(g, 'forgedDark');
  }
  // part-number pad on the longest cast span, kept under the journal radius
  const padSpan = castSpans.slice().sort((a, b) => (b.b - b.a) - (a.b - a.a))[0];
  if (padSpan && padSpan.b - padSpan.a > 16) {
    const zc = (padSpan.a + padSpan.b) / 2;
    p.add(boxMM([X + s * (CAM.shankR - 0.4), -3.4, zc - 9], [X + s * (CAM.shankR + 1.1), 3.4, zc + 8]), 'forgedDark');
  }
  for (const c of (s > 0 ? [1, 2, 3] : [4, 5, 6])) {
    for (const side of [1, -1] as const) {
      const lay = rockerLayout(c, side);
      const fromPeak = ((ASSEMBLED_CRANK - (FIRE_CRANK[c] + PEAK_CRANK[whichOf(side)])) / 2) * DEG;
      const beta = rockerBeta(lay, lobeRadius(fromPeak));
      const g = lobeGeom();
      // Nose at +X. Intake and exhaust use their own contact angle and peak crank,
      // so the two noses of a cylinder are not parallel.
      g.rotateZ(contactAngle(lay, beta) - fromPeak);
      g.translate(X, 0, lay.z);
      p.add(g, 'polishedSteel');
    }
  }
  // keyed nose — same CAM_NOSE stack the CoS key, flange, washer and nut already sit on
  const zc = CHAIN_Z[s], N = CAM_NOSE;
  const zN = zc + N.end;
  const zt = zc + N.hubFace;
  // thrust shoulder just inboard of the thrust washer
  p.add(yToZ(cyl(16, 5, 24)), 'polishedSteel', [X, 0, zc + N.flange[0] - 5]);
  const nose = yToZ(cyl(N.r, zt - (CH_Z1 - 4), 24)).translate(X, 0, (CH_Z1 - 4 + zt) / 2);
  const k = N.key, kTop = N.r + k.proud;
  const pocket = woodruffGeom(k.D + 0.1, k.h + 0.05, k.b + 0.1).rotateY(-Math.PI / 2).translate(X, kTop, zc + k.dz);
  p.add(csgSub(nose, pocket), 'darkSteel');
  p.add(yToZ(cyl(N.r - 0.4, zN - zt, 20)), 'darkSteel', [X, 0, (zt + zN) / 2]);
  for (let z = zt + 1; z < zN - 0.5; z += 1.5) p.add(yToZ(lathe([[N.r - 0.4, -0.35], [N.r, 0], [N.r - 0.4, 0.35]], 20)), 'darkSteel', [X, 0, z]);
  // nose end face: centre bore (the M22 is external, matching the CoS nut) plus the three flange-pin witnesses as shallow holes
  p.add(yToZ(cyl(3.2, 8, 12)).translate(X, 0, zN - 3), 'bore');
  return p.g;
}

// ---------------------------------------------------------------- cam housing
function extrudeX(shape: THREE.Shape, x0: number, x1: number, bevel = 0, segs = 8) {
  const depth = Math.abs(x1 - x0);
  const g = extrude(shape, depth, bevel, segs);
  g.rotateY(Math.PI / 2); // (x,y,z) -> (z, y, -x); shape x was -engineZ
  g.translate(Math.min(x0, x1), 0, 0);
  return g;
}
/** Lobed outline around (z, y). `amp` is the lobe depth — 0 would be an ellipse. */
function lobedOutline(z: number, y: number, rz: number, ry: number, amp: number, n = 56): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const w = 1 + amp * Math.cos(3 * t) + amp * 0.35 * Math.cos(5 * t + 0.7);
    pts.push([z + Math.cos(t) * rz * w, y + Math.sin(t) * ry * w]);
  }
  return pts;
}
function shapeZYPts(pts: [number, number][], hole = false) {
  const s = hole ? new THREE.Path() : new THREE.Shape();
  const q = hole ? pts.slice().reverse() : pts;
  s.moveTo(-q[0][0], q[0][1]);
  for (const [zz, yy] of q.slice(1)) s.lineTo(-zz, yy);
  s.closePath();
  return s;
}
/** Raised gasket land: lobed outer face, lobed opening. Shape x = −engine Z. */
function lobedRing(z: number, y: number, rz: number, ry: number, band: number) {
  const sh = shapeZYPts(lobedOutline(z, y, rz + band, ry + band, 0.10)) as THREE.Shape;
  sh.holes.push(shapeZYPts(lobedOutline(z, y, rz, ry, 0.17), true) as THREE.Path);
  return sh;
}
/**
 * Cast band around the cam tunnel, outer side only. Built so the interior is on the left
 * of the contour (CCW) on both banks. Coordinates are engine X/Y, centred on the cam.
 */
function tunnelBand(s: 1 | -1, swell: number): THREE.Shape {
  const cx = CAM_X * s;
  const n = 20;
  const a0 = -1.06, a1 = 1.06;
  const rOf = (a: number, outer: boolean) => {
    const lip = Math.max(0, Math.cos(a * 0.82));
    return 39.2 + (outer ? Math.max(2.4, swell * lip) : 0);
  };
  const arc = (outer: boolean, from: number, to: number) => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const a = from + (to - from) * (i / n);
      const r = rOf(a, outer);
      const aa = s > 0 ? a : Math.PI - a;
      pts.push([cx + Math.cos(aa) * r, Math.sin(aa) * r]);
    }
    return pts;
  };
  // Right bank: up the outer edge, back down the inner. Left bank flips X, so the walk reverses.
  const pts = s > 0
    ? [...arc(true, a0, a1), ...arc(false, a1, a0)]
    : [...arc(false, a0, a1), ...arc(true, a1, a0)];
  return polyShape(pts);
}
/**
 * Outer cam-tunnel wall. Inner and outer arcs use different centres so the section drafts,
 * and the lips are filleted instead of ending as a square-cut half-pipe.
 */
function draftedTunnel(s: 1 | -1): THREE.Shape {
  const cx = CAM_X * s;
  const n = 24;
  const angOf = (a: number) => (s > 0 ? a : Math.PI - a);
  const innerC = cx - s * 3.2;
  const outerC = cx + s * 7.4;
  const ri = 27.4, ro = 38.6;
  const sample = (c: number, r: number, a0: number, a1: number) => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const a = angOf(a0 + (a1 - a0) * (i / n));
      pts.push([c + Math.cos(a) * r, Math.sin(a) * r]);
    }
    return pts;
  };
  const inner = sample(innerC, ri, -1.08, 1.08);
  const outer = sample(outerC, ro, 1.28, -1.28);
  const fillet = (from: [number, number], to: [number, number], ySign: number) => {
    const mx = (from[0] + to[0]) / 2 + s * 4.4;
    const my = (from[1] + to[1]) / 2 + ySign * 8.8;
    const pts: [number, number][] = [];
    for (let i = 1; i < 7; i++) {
      const t = i / 7, u = 1 - t;
      pts.push([u * u * from[0] + 2 * u * t * mx + t * t * to[0], u * u * from[1] + 2 * u * t * my + t * t * to[1]]);
    }
    return pts;
  };
  return polyShape([
    ...inner,
    ...fillet(inner[inner.length - 1], outer[0], 1),
    ...outer,
    ...fillet(outer[outer.length - 1], inner[0], -1),
  ]);
}
/** Shape in engine (z, y). Extrude geometry maps shape-x = -z. */
function shapeZY(pts: [number, number][]) {
  const s = new THREE.Shape();
  s.moveTo(-pts[0][0], pts[0][1]);
  for (const [z, y] of pts.slice(1)) s.lineTo(-z, y);
  s.closePath();
  return s;
}
export function camHousing(s: 1 | -1) {
  const p = new Part();
  const X = (x: number) => x * s;
  const cyls = s > 0 ? [1, 2, 3] : [4, 5, 6];
  const zLo = CH_Z0 - (s < 0 ? 22 : 4);
  const zHi = CH_Z1;
  const cx = X(CAM_X);
  // Head face, viewed from the head: raised spring-well rims and a cam-tunnel spine stand proud
  // of a recessed pocket floor. Everything on this face stays outside the cam bore and inboard
  // of the nut seats at x = 272.
  const wellOf = (c: number, side: 1 | -1) => {
    const p = headToEngine(c, stemPointLocal(side, 55));
    return { y: p.y, z: p.z };
  };
  const WELL_RZ = 13.6, WELL_RY = 16.4, WELL_BAND = 8.4;
  for (const ySign of [1, -1] as const) {
    const y0 = ySign * 14, y1 = ySign * 68;
    const floor = shapeZY([[zLo + 8, y0], [zHi - 8, y0], [zHi - 8, y1], [zLo + 8, y1]]);
    for (const c of cyls) {
      const w = wellOf(c, ySign);
      floor.holes.push(shapeZYPts(lobedOutline(w.z, w.y, WELL_RZ, WELL_RY, 0.17), true) as THREE.Path);
    }
    // Round oil and drain holes in the field between the lobed wells. Kept off the openings.
    const zs = cyls.map((c) => CYL_Z[c]).sort((a, b) => a - b);
    for (let i = 0; i < zs.length - 1; i++) {
      const zm = (zs[i] + zs[i + 1]) / 2;
      for (const [dz, yy, rr] of [[0, ySign * 34, 3.1], [16, ySign * 52, 2.3], [-18, ySign * 22, 2.0]] as const) {
        const h = new THREE.Path();
        h.absellipse(-(zm + dz), yy, rr, rr, 0, Math.PI * 2, true);
        floor.holes.push(h);
      }
    }
    for (const c of cyls) {
      const h = new THREE.Path();
      h.absellipse(-(CYL_Z[c] + s * 24), ySign * 18, 1.9, 1.9, 0, Math.PI * 2, true);
      floor.holes.push(h);
    }
    // Pocket floor, set back from the head. The centreline is left open so the bore stays clear.
    p.add(extrudeX(floor, X(HEAD_OUT_X + 5.4), X(HEAD_OUT_X + 9.2), 0.45, 16), 'castAlu');
  }
  for (const c of cyls) for (const side of [1, -1] as const) {
    const w = wellOf(c, side);
    // Raised lobed land. Machined gasket face toward the head, cast body behind it.
    const ring = lobedRing(w.z, w.y, WELL_RZ, WELL_RY, WELL_BAND);
    p.add(extrudeX(ring, X(HEAD_OUT_X + 1.15), X(HEAD_OUT_X + 6.6), 0, 8), 'castAlu');
    p.add(extrudeX(ring, X(HEAD_OUT_X + 0.15), X(HEAD_OUT_X + 1.45), 0, 8), 'machinedAlu');
    // Four to six cast nut bosses on the land, around the opening. Real M8 seats stay at x = 272.
    const studs: [number, number][] = [];
    for (const a of [1, -1]) for (const d of [1, -1]) studs.push([a * HEAD_HW.camStud.y, CYL_Z[c] + s * d * HEAD_HW.camStud.z]);
    let bosses = 0;
    for (const ang of [0.2, 1.25, 2.25, 3.35, 4.4, 5.35]) {
      const zz = w.z + Math.cos(ang) * 20.5;
      const yy = w.y + Math.sin(ang) * 21.5;
      if (studs.some(([sy, sz]) => Math.hypot(yy - sy, zz - sz) < 12)) continue;
      const h = 7.4;
      // Stand proud of the gasket land toward the head, and run back into the land so they fuse.
      const face = HEAD_OUT_X - 1.15;
      const boss = yToX(cyl(3.15, h, 14));
      boss.translate(s * (face + h / 2), yy, zz);
      p.add(boss, 'castAlu');
      bosses++;
    }
    if (bosses < 4) {
      // the stud check dropped too many — park two more on the land, clear of the studs
      for (const ang of [0.7, 2.8]) {
        const zz = w.z + Math.cos(ang) * 19.2;
        const yy = w.y + Math.sin(ang) * 19.2;
        const h = 7.2;
        p.add(yToX(cyl(2.8, h, 12)).translate(s * (HEAD_OUT_X - 1.1 + h / 2), yy, zz), 'castAlu');
      }
    }
  }
  // Cam-tunnel spine, proud of the pockets, ending before the bore (x ≤ 268).
  {
    const x0 = X(HEAD_OUT_X + 0.25), x1 = X(HEAD_OUT_X + 6.2);
    p.add(boxMM([Math.min(x0, x1), -8.4, zLo + 12], [Math.max(x0, x1), 8.4, zHi - 12]), 'castAlu');
    const x2 = X(HEAD_OUT_X + 3.2);
    p.add(boxMM([Math.min(x0, x2), -12.5, zLo + 16], [Math.max(x0, x2), 12.5, zHi - 16]), 'castAlu');
    // rounded bead along each edge of the ridge
    for (const y of [6.4, -6.4]) {
      p.add(yToZ(cyl(2.6, zHi - zLo - 36, 14)).translate(X(HEAD_OUT_X + 2.4), y, (zLo + zHi) / 2), 'castAlu');
    }
  }
  // M8 nut spot faces (103-05 #22). Seat plane is exactly the fastener position, normal along the bank axis.
  const nutX = CYL_TOP_X + 71;
  for (const c of cyls) for (const a of [1, -1]) for (const d of [1, -1]) {
    const y = a * HEAD_HW.camStud.y, z = CYL_Z[c] + s * d * HEAD_HW.camStud.z;
    const h = 2.2;
    const disc = yToX(cyl(9.2, h, 20));
    disc.translate(s * nutX - s * (h / 2), y, z);
    p.add(disc, 'machinedAlu');
    const boss = yToX(cyl(8.4, 8, 16));
    boss.translate(s * (nutX - s * s * 6), y, z);
    // boss centre: just inboard of the face. s * nutX is the face; inboard is toward x=0, i.e. -s.
    boss.translate(0, 0, 0);
    p.add(yToX(cyl(8.2, 9, 14)).translate(s * nutX - s * 6.2, y, z), 'castAlu');
  }
  // Outer cam tunnel: drafted section, filleted lips. Not a constant-radius half-pipe.
  p.add(extrude(draftedTunnel(s), zHi - zLo - 6, 1.2, 16).translate(0, 0, zLo + 3), 'castAlu');
  // Bearing-boss bulges at each journal, and a lower transverse rib between them.
  const webs = camWebZ(s);
  for (const zw of webs) {
    p.add(extrude(tunnelBand(s, 11), 24, 0.9, 8).translate(0, 0, zw - 12), 'castAlu');
  }
  for (let i = 0; i < webs.length - 1; i++) {
    const zm = (webs[i] + webs[i + 1]) / 2;
    p.add(extrude(tunnelBand(s, 5.2), 7, 0.55, 6).translate(0, 0, zm - 3.5), 'castAlu');
  }
  // Longitudinal ribs on the outside of the arch: a wide root (the fillet) and a narrower crest.
  for (const ang of [-0.98, -0.62, -0.28, 0.28, 0.62, 0.98]) {
    const a = s > 0 ? ang : Math.PI - ang;
    const place = (innerR: number, len: number, thick: number, zPad: number) => {
      const g = boxMM([0, -thick / 2, zLo + zPad], [len, thick / 2, zHi - zPad]);
      g.translate(innerR, 0, 0);
      g.rotateZ(a);
      g.translate(cx, 0, 0);
      return g;
    };
    p.add(place(37.2, 12.5, 7.4, 18), 'castAlu');
    p.add(place(46.2, 6.4, 3.2, 22), 'castAlu');
  }
  // four bearing webs, bore Ø47.1 straight through. Outer edge follows the tunnel instead of a straight wall.
  for (const zw of camWebZ(s)) {
    // Bore circle must lie inside the web or the extrude fills the hole. The inboard edge only
    // steps out around the bore — a full-height step hits the case and the head nuts.
    const inn = HEAD_OUT_X + 8, pocket = HEAD_OUT_X + 2;
    const arc: [number, number][] = [];
    for (let i = 0; i <= 8; i++) {
      const a = -0.68 + 1.36 * (i / 8);
      arc.push([CAM_X + 16 + 13 * Math.cos(a), 33 * Math.sin(a) / Math.sin(0.68)]);
    }
    let pts: [number, number][] = [
      [inn, -46], arc[0], ...arc.slice(1), [inn, 46], [inn, 30], [pocket, 30], [pocket, -30], [inn, -30],
    ];
    if (s < 0) pts = pts.map(([x, y]) => [-x, y] as [number, number]).reverse();
    const sh = polyShape(pts);
    sh.holes.push(circlePath(CAM.boreR, cx, 0) as THREE.Path);
    // no bevel: a bevelled hole leaves a skin on the bore and the cam cannot pass
    p.add(extrudeC(sh, 14, 0, 48).translate(0, 0, zw), 'castAlu');
    p.add(yToZ(lathe([[CAM.boreR, -7.6], [CAM.boreR + 1.2, -7.6], [CAM.boreR + 1.2, 7.6], [CAM.boreR, 7.6]], 28)).translate(cx, 0, zw), 'machinedAlu');
  }
  // transverse bay walls and rocker-shaft bosses with spot faces
  for (const st of rockerStations(s)) {
    for (const end of [-1, 1] as const) {
      const zf = st.z + end * st.half;
      const h = 1.6;
      // annular spot face: the shaft bore comes through, the screw head / conical nut bears on the ring
      // Screw head (r 5) and nut flange (r 7.2) bear on this ring. The hole clears the M6 shank;
      // the Ø18 shaft ends just inboard of the ring, inside the boss.
      const face = yToZ(lathe([[3.5, -h / 2], [11, -h / 2], [11, h / 2], [3.5, h / 2]], 22));
      face.translate(st.x, st.y, zf - end * (h / 2));
      p.add(face, 'machinedAlu');
    }
    // Two cast towers, one each side of the arm, drafted wider at the root. The bay between them
    // is the arm's width plus a small running clearance; the shaft ends inside the towers.
    for (const end of [-1, 1] as const) {
      const zRoot = st.z + end * (SHAFT.bossHalf + 1.7);
      const zTip = st.z + end * (st.half - 1.5);
      const z0 = Math.min(zRoot, zTip), z1 = Math.max(zRoot, zTip);
      const rAt = (z: number) => (Math.abs(z - zRoot) < Math.abs(z - zTip) ? SHAFT.bossR + 3.1 : SHAFT.bossR + 0.35);
      const tower = yToZ(lathe([
        [SHAFT.r + 0.2, z0], [rAt(z0), z0], [rAt(z1), z1], [SHAFT.r + 0.2, z1],
      ], 16));
      tower.translate(st.x, st.y, 0);
      p.add(tower, 'castAlu');
    }
    // bay rib from the head flange toward the tower, kept off the cam bore
    const y0 = st.y - 7, y1 = st.y + 7;
    const xIn = X(HEAD_OUT_X + 12);
    const xBoss = st.x - s * (SHAFT.bossR + 2);
    p.add(boxMM([Math.min(xIn, xBoss), y0, st.z - 2.4], [Math.max(xIn, xBoss), y1, st.z + 2.4]), 'castAlu');
  }
  // Bay cheeks between the cylinders, above and below the bore. The bearing web already
  // spans the bore; these add the cast wall you see in the cover-side bays without plugging it.
  {
    const zs = cyls.map((c) => CYL_Z[c]).sort((a, b) => a - b);
    for (let i = 0; i < zs.length - 1; i++) {
      const zc = (zs[i] + zs[i + 1]) / 2;
      const inn = HEAD_OUT_X + 11, mid = HEAD_OUT_X + 28, out = CAM_HOUSING_OUT_X - 8;
      for (const ySign of [1, -1]) {
        const yIn = ySign * (CAM.boreR + 4), yMid = ySign * 40, yOut = ySign * 52;
        const x0 = X(inn), x1 = X(mid), x2 = X(out);
        // Thicker at the root, narrower outboard: the bay wall drafts instead of staying a slab.
        p.add(boxMM(
          [Math.min(x0, x1), Math.min(yIn, yMid), zc - 5.6],
          [Math.max(x0, x1), Math.max(yIn, yMid), zc + 5.6],
        ), 'castAlu');
        p.add(boxMM(
          [Math.min(x1, x2), Math.min(yMid, yOut), zc - 3.1],
          [Math.max(x1, x2), Math.max(yMid, yOut), zc + 3.1],
        ), 'castAlu');
      }
    }
  }
  // cover-seat rails and stud bosses — same stations as the valve covers (do not move)
  const zc = (CH_Z0 + CH_Z1) / 2;
  // Exhaust stems pass through the head-side lower rail. Leave a gap there; the
  // jogged cover land is the continuous seal. A full-length bar left a sliver the
  // spring bore did not clear, and another boolean would blow the open-edge budget.
  const stemGaps = cyls.map((c) => headToEngine(c, stemPointLocal(-1, 86)).z);
  const avoid = (z0: number, z1: number, half: number): [number, number][] => {
    const holes = stemGaps.map((z) => [z - half, z + half] as [number, number]).sort((a, b) => a[0] - b[0]);
    const spans: [number, number][] = [];
    let cursor = z0;
    for (const [a, b] of holes) {
      const lo = Math.max(a, z0), hi = Math.min(b, z1);
      if (lo > cursor + 1) spans.push([cursor, lo]);
      cursor = Math.max(cursor, hi);
    }
    if (z1 > cursor + 1) spans.push([cursor, z1]);
    return spans;
  };
  for (const sg of [1, -1]) {
    const yIn0 = sg > 0 ? 62 : -76, yIn1 = sg > 0 ? 76 : -62;
    const railSpans = sg > 0 ? [[CH_Z0, CH_Z1] as [number, number]] : avoid(CH_Z0, CH_Z1, 18);
    for (const [a, b] of railSpans) {
      p.add(boxMM([X(HEAD_OUT_X + 6), yIn0, a], [X(HEAD_OUT_X + 18), yIn1, b]), 'castAlu');
    }
    p.add(boxMM([X(CAM_HOUSING_OUT_X - 16), sg > 0 ? 28 : -36, CH_Z0], [X(CAM_HOUSING_OUT_X - 4), sg > 0 ? 36 : -28, CH_Z1]), 'castAlu');
    // machined cover land on the rail top
    const landSpans = sg > 0 ? [[CH_Z0 + 2, CH_Z1 - 2] as [number, number]] : avoid(CH_Z0 + 2, CH_Z1 - 2, 18);
    for (const [a, b] of landSpans) {
      p.add(boxMM([X(HEAD_OUT_X + 8), sg > 0 ? 70 : -74, a], [X(HEAD_OUT_X + 16), sg > 0 ? 75 : -69, b]), 'machinedAlu');
    }
  }
  for (const upper of [true, false]) for (const f of VC_EARS(upper, s)) {
    const z = zc + f;
    p.add(yToX(cyl(6.5, 12, 14)), 'castAlu', [X(HEAD_OUT_X + 12), upper ? 69 : -69, z]);
    p.add(yToX(cyl(6, 10, 14)), 'castAlu', [X(CAM_HOUSING_OUT_X - 10), upper ? 32 : -32, z]);
  }
  // end faces: flywheel end (cover, stoppers, banjo and temp-switch probes) and pulley end (chain-housing studs)
  // Flywheel-end cap, outboard of the rearmost rocker-shaft nut so that nut stays reachable.
  const cap1 = CH_Z0 - (s < 0 ? 28 : 6);
  const cap0 = cap1 - 8;
  p.add(boxMM([X(HEAD_OUT_X), -72, cap0], [X(CAM_HOUSING_OUT_X - 2), 74, cap1]), 'castAlu');
  // End-cap ribs and corner beads so the flywheel face is not a flat plate.
  for (const y of [-58, -36, 38, 60]) {
    p.add(boxMM([X(HEAD_OUT_X + 14), y - 2.2, cap0 - 3.6], [X(CAM_HOUSING_OUT_X - 16), y + 2.2, cap0 + 1.4]), 'castAlu');
  }
  for (const y of [66, -64]) for (const x of [HEAD_OUT_X + 10, CAM_HOUSING_OUT_X - 14]) {
    p.add(yToZ(cyl(7, 9, 12)).translate(X(x), y, (cap0 + cap1) / 2), 'castAlu');
  }
  p.add(yToZ(lathe([[CAM.boreR, -2], [30, -2], [30, 3], [CAM.boreR, 3]], 28)).translate(cx, 0, (cap0 + cap1) / 2), 'machinedAlu');
  // pulley-end pad for the chain-housing end studs (y ≈ 62). Kept above the cam bore so the shaft can enter from this end.
  p.add(boxMM([X(250), 40, CH_Z1 - 16], [X(330), 78, CH_Z1]), 'castAlu');
  // no full-length external oil line — the photos don't show one; the splash tube and banjo are CoS parts
  // The flywheel journal and the inter-journal ribs land on the end shaft seats.
  // Clear a column just proud of each spot face so the screw head / nut and the
  // seat probe (r ≈ 5.2) see the face, not the casting behind it.
  const shaftClear: THREE.BufferGeometry[] = [];
  for (const st of rockerStations(s)) for (const end of [-1, 1] as const) {
    const zFace = st.z + end * st.half;
    const len = 14;
    const g = yToZ(cyl(8, len, 16));
    g.translate(st.x, st.y, zFace + end * (0.25 + len / 2));
    shaftClear.push(g);
  }
  // Line bore from the chain end up to the inboard face of the flywheel cap.
  // The cap itself stays solid: the end cover seats on its outer face, and a ray
  // down the cam axis has to stop there. Journals sit inboard of cap1 on both banks.
  const boreHi = CH_Z1 + 24;
  const boreLo = cap1 + 0.3;
  const lineBore = yToZ(cyl(CAM.boreR, boreHi - boreLo, 32));
  lineBore.translate(cx, 0, (boreHi + boreLo) / 2);
  cutGroup(p.g, ...camSpringCutters(s), ...shaftClear, ...rockerPocketCutters(s), lineBore);
  // The cover seat is a tilted plane. Axis-aligned rails, the pulley-end pad and the
  // flywheel cap cross it and land inside the cover. Cut them back to just under the
  // gasket. The cam tunnel is ~39 mm below this plane, so the bore stays.
  clipHousingUnderCovers(p.g, s);
  addCoverLands(p, s);
  addShaftTowers(p, s);
  // The ear pad the cover stud threads into. A short
  // pad on the housing side of the gasket (local z −10.8..−7.6, clear of the cover)
  // is what the thread ray finds. r 4.2 covers the probe at r 3.6.
  for (const upper of [true, false]) {
    const frame = coverMatrix(s, upper);
    VC_EARS(upper, s).forEach((yy, i) => {
      for (const xx of [-VC_EDGE, VC_EDGE]) {
        // Lower outboard ears 0, 2 and 4 are the special caps, not these studs.
        if (!upper && xx > 0 && (i === 0 || i === 2 || i === 4)) continue;
        // Below the cover underside (trimmed to local z −0.15) by more than the 1 mm erosion.
        const g = yToZ(cyl(4.2, 3.2, 12));
        g.translate(xx, yy, -9.2);
        g.applyMatrix4(frame);
        p.add(g, 'castAlu');
      }
    });
  }
  // After every later solid (lands, towers, stud pads). The outline cutter leaves one
  // side of the arm coplanar with the forging; these cylinders open that face.
  p.g.updateMatrixWorld(true);
  subtractSolids(p.g, armClearance(s));
  // After every cut. The tower bore is open past the shaft, so the seat probe
  // (r 4.2 on the screw, r 5.2 on the nut) was looking down the hole.
  addRockerSpotFaces(p, s);
  // Last cut. A boolean in the main group left the boot well open on the left
  // bank. The plane clipper caps the hole.
  subtractSolids(p.g, plugBootClearance(s));
  return p.g;
}
/**
 * Annular spot face on each rocker-shaft end. The face at the higher z has normal +Z,
 * which is the screw side; the nut side is the lower-z face. Metal is inboard of the
 * fastener, 0.08 mm clear of it, and stops short of the shaft end (shaft half − 2).
 */
function annulusZ(z0: number, z1: number, rIn: number, rOut: number, segs = 28) {
  const pos: number[] = [], nrm: number[] = [];
  const ring = (z: number, r: number, i: number): [number, number, number] => {
    const a = (i / segs) * Math.PI * 2;
    return [Math.cos(a) * r, Math.sin(a) * r, z];
  };
  const tri = (a: [number, number, number], b: [number, number, number], c: [number, number, number], n: [number, number, number]) => {
    pos.push(...a, ...b, ...c); nrm.push(...n, ...n, ...n);
  };
  for (let i = 0; i < segs; i++) {
    const o0 = ring(z0, rOut, i), o1 = ring(z0, rOut, i + 1);
    const O0 = ring(z1, rOut, i), O1 = ring(z1, rOut, i + 1);
    const i0 = ring(z0, rIn, i), i1 = ring(z0, rIn, i + 1);
    const I0 = ring(z1, rIn, i), I1 = ring(z1, rIn, i + 1);
    const a = ((i + 0.5) / segs) * Math.PI * 2;
    const out: [number, number, number] = [Math.cos(a), Math.sin(a), 0];
    const inn: [number, number, number] = [-out[0], -out[1], 0];
    tri(o0, O0, o1, out); tri(o1, O0, O1, out);
    tri(i0, i1, I0, inn); tri(i1, I1, I0, inn);
    tri(O0, I0, O1, [0, 0, 1]); tri(O1, I0, I1, [0, 0, 1]);
    tri(o0, o1, i0, [0, 0, -1]); tri(o1, i1, i0, [0, 0, -1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return g;
}
function addRockerSpotFaces(p: Part, s: 1 | -1) {
  for (const st of rockerStations(s)) for (const end of [-1, 1] as const) {
    // Screw probe r ≈ 4.2, shank r 3. Nut probe r ≈ 5.2, cone r 4.15.
    const hole = end > 0 ? 3.55 : 4.75;
    const thick = 1.3;
    const zBear = st.z + end * (SHAFT.half - 0.08);
    const zBack = zBear - end * thick;
    p.add(annulusZ(Math.min(zBear, zBack), Math.max(zBear, zBack), hole, 11.2).translate(st.x, st.y, 0), 'machinedAlu');
  }
}

/**
 * Remove housing that rises through the cover seat. The cutter is the cover footprint
 * from just under the gasket (local z −0.55) up through the roof. Ear stud pads sit
 * at local z −9 and are added after this cut.
 */
function clipHousingUnderCovers(root: THREE.Object3D, s: 1 | -1) {
  const cuts: THREE.BufferGeometry[] = [];
  for (const upper of [true, false]) {
    // Wide enough to include the rail bypass, which sits outboard of the cover lip.
    // 2.6 mm under the cover. A closer cap still meets the cover once the collision
    // test erodes both meshes 1 mm, because a few clip faces point back into the cut.
    const box = boxMM([-80, -220, -2.6], [80, 220, 70]);
    box.applyMatrix4(coverMatrix(s, upper));
    cuts.push(box);
  }
  root.updateMatrixWorld(true);
  subtractSolids(root, cuts);
}
/**
 * The clip takes the cast towers with the rails. Put a short tower back on each
 * side of the arm, from below the gasket up around the shaft, and bore it so the
 * shaft has 0.22 mm radial clearance. The cover pocket is sized outside this box.
 */
/** Gasket land just under the cover lip. Top face at local z −0.55, clear of the cover. */
function addCoverLands(p: Part, s: 1 | -1) {
  const L = CH_Z1 - CH_Z0 - 8;
  for (const upper of [true, false]) {
    // Same jog as the gasket, so the arm is in the opening. A plain extrude,
    // top face at local z −0.55, under the cover lip. No boolean, so the
    // seat normals stay pointing up and the 1 mm erosion moves them away
    // from the cover.
    // Inset 4 mm from the cover lip so the two outer walls are not the same
    // face. A shared wall overlaps once each mesh erodes 1 mm.
    const g = joggedSheet(50, L, 42, L - 14, railJogs(s, upper), 2.3);
    g.translate(0, 0, -1.7);
    g.applyMatrix4(coverMatrix(s, upper));
    p.add(g, 'machinedAlu');
  }
}
function addShaftTowers(p: Part, s: 1 | -1) {
  const wall = SHAFT.r + 2.6;
  const host = new Part();
  const bores: THREE.BufferGeometry[] = [];
  for (const upper of [true, false]) {
    const frame = coverMatrix(s, upper);
    const inv = frame.clone().invert();
    for (const st of rockerStations(s)) {
      if ((st.side > 0) !== upper) continue;
      const c = new THREE.Vector3(st.x, st.y, st.z).applyMatrix4(inv);
      for (const end of [-1, 1] as const) {
        const y0 = c.y + end * (SHAFT.bossHalf + 0.9);
        const y1 = c.y + end * (SHAFT.half + 0.3);
        const box = boxMM(
          [c.x - wall, Math.min(y0, y1), -2.8],
          [c.x + wall, Math.max(y0, y1), c.z + wall],
        );
        box.applyMatrix4(frame);
        host.add(box, 'castAlu');
      }
      // Plane-clip the bore. A boolean on the box left the shaft buried.
      const bore = yToZ(cyl(SHAFT.r + 0.25, SHAFT.half * 2 + 10, 20));
      bore.translate(st.x, st.y, st.z);
      bores.push(bore);
    }
  }
  subtractSolids(host.g, bores);
  p.g.add(host.g);
}
/**
 * Housing clearance for the rocker arm, shoe and hub. The shaft itself is kept:
 * a cylinder at the shaft radius is subtracted from each cutter so the tower bore
 * still closes around the shaft.
 */
/**
 * The provisional plug aim puts the terminal boot against the cam-housing wall.
 * Open a short well on that same axis so the boot has air. Radius 10 mm around
 * a 6.4 mm boot leaves enough that 1 mm of erosion on each mesh still misses.
 * The cut moves with SPARK_TIP / SPARK_TILT / SPARK_PITCH.
 */
function plugBootClearance(s: 1 | -1): THREE.BufferGeometry[] {
  const [dx, dy, dz] = sparkDirHead();
  const dir = new THREE.Vector3(s * dx, dy, s * dz);
  const cyls = s > 0 ? [1, 2, 3] as const : [4, 5, 6] as const;
  return cyls.map((c) => {
    const tip = new THREE.Vector3(s * (CYL_TOP_X + SPARK_TIP.x), SPARK_TIP.y, CYL_Z[c] + s * SPARK_Z);
    const a = tip.clone().addScaledVector(dir, 46);
    const b = tip.clone().addScaledVector(dir, 88);
    return cylBetween([a.x, a.y, a.z], [b.x, b.y, b.z], 11, 14);
  });
}
/** Cylinders along the arm, clear of the shaft, so the side face is not left against the forging. */
function armClearance(s: 1 | -1): THREE.BufferGeometry[] {
  const cuts: THREE.BufferGeometry[] = [];
  for (const st of rockerStations(s)) {
    const lay = rockerLayout(st.cyl, st.side);
    for (let i = 2; i <= 5; i++) {
      const t = i / 6;
      const blob = yToZ(cyl(11, 30, 10));
      blob.translate(lay.P.x + (lay.K.x - lay.P.x) * t, lay.P.y + (lay.K.y - lay.P.y) * t, lay.z);
      cuts.push(blob);
    }
    // Hub. The boolean pocket is unreliable on the mirrored bank, so the boss
    // bay is opened here. Stop short of the cast towers (they start 0.5 mm
    // past the boss) so this cut does not take the shaft bore with it.
    const hub = yToZ(cyl(SHAFT.bossR + 2.4, SHAFT.bossHalf * 2 + 0.4, 14));
    hub.translate(lay.P.x, lay.P.y, lay.z);
    cuts.push(hub);
  }
  return cuts;
}
function rockerPocketCutters(s: 1 | -1): THREE.BufferGeometry[] {
  const cuts: THREE.BufferGeometry[] = [];
  const grow = (pts: [number, number][], margin: number): [number, number][] => pts.map(([x, y]) => {
    const r = Math.hypot(x, y) || 1;
    const k = (r + margin) / r;
    return [x * k, y * k];
  });
  for (const st of rockerStations(s)) {
    const pose = trainPose(st.cyl, st.side, ASSEMBLED_CRANK);
    const lay = pose.lay;
    const { P, K, C, z, ang, gamma } = lay;
    const beta = pose.beta;
    const outward = K.clone().sub(C);
    if (outward.lengthSq() < 1e-6) outward.set(1, 0);
    outward.normalize();
    const outline = rockerOutline(gamma, rot2(outward, -ang), eyeLen(lay.side), padLen(lay.side));
    const keep = () => yToZ(cyl(SHAFT.r + 0.4, 90, 16));
    const arm = csgSub(extrudeC(polyShape(grow(outline, 7.0)), ARM_T + 16, 0.15, 2), keep());
    cuts.push(placeRocker(arm, ang, beta, P, z));
    const shoe = csgSub(extrudeC(polyShape(grow(padShoe(outline), 7.0)), PAD_W + 18, 0.15, 2), keep());
    cuts.push(placeRocker(shoe, ang, beta, P, z));
    const hub = csgSub(
      yToZ(cyl(SHAFT.bossR + 1.6, SHAFT.bossHalf * 2 + 2.2, 16)).translate(P.x, P.y, z),
      yToZ(cyl(SHAFT.r + 0.4, 48, 16)).translate(P.x, P.y, z),
    );
    cuts.push(hub);
  }
  return cuts;
}

/**
 * Recessed pockets on the inside of the cover. The cutter is the rocker and valve
 * envelope clipped to the pan interior, so the outer shell, the lettering and the
 * ribs stay closed. `COVER_BOOT_HOLE` adds a round connector hole outside the
 * gasket; it is off until the plug entry is decided.
 */
/**
 * The cover group is already in engine space. cutGroup bakes each mesh's world
 * matrix and leaves the parent matrix in place, which would apply that placement
 * a second time. Flatten first so the pocket subtraction stays on the shell.
 */
function flattenWorld(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry = m.geometry.clone().applyMatrix4(m.matrixWorld);
    m.position.set(0, 0, 0);
    m.rotation.set(0, 0, 0);
    m.scale.set(1, 1, 1);
    m.updateMatrix();
  });
  root.traverse((o) => {
    o.position.set(0, 0, 0);
    o.rotation.set(0, 0, 0);
    o.scale.set(1, 1, 1);
    o.updateMatrix();
  });
  root.updateMatrixWorld(true);
}
export function pocketValveCover(root: THREE.Object3D, s: 1 | -1, upper: boolean) {
  flattenWorld(root);
  // The 10–11 mm layout puts the shaft boss and the adjuster through the pan the
  // main cover was built around. A closed blister covers that metal and a blind
  // pocket stops short of the blister skin. Where the arm crosses the side rail,
  // the rail steps out around the arm so the seal land stays one piece.
  const relief = coverRelief(s, upper);
  // Plane-clip the boxes. A boolean on the full-length lip retessellates the
  // flywheel end and drives it into the housing.
  // The blister can land on an ear. Keep the M8 stud (r 3.84) in a r 6.4 hole,
  // the same clearance the lip already has.
  const frame = coverMatrix(s, upper);
  const studHoles = VC_EARS(upper, s).flatMap((yy) => [-VC_EDGE, VC_EDGE].map((xx) => {
    const g = yToZ(cyl(6.4, 90, 16));
    g.translate(xx, yy, 5);
    g.applyMatrix4(frame);
    return g;
  }));
  // Boolean scraps from the lip hang below the seat and into the housing.
  // Drop everything under the gasket. The lip itself stays at z ≥ 0.
  const under = boxMM([-140, -260, -90], [140, 260, -0.4]);
  under.applyMatrix4(frame);
  const cuts = [...relief.pockets, ...relief.railCuts, ...studHoles, under];
  // The chain-end stud (engine z ≈ 220, axis +Z) embeds back through the pulley
  // end of the upper cover. Open that end around the stud. The side rails are
  // untouched: the cut is only the existing sprocket-end notch, widened in x.
  if (upper) {
    const end = boxMM([-24, 168, -4], [24, 220, 12]);
    end.applyMatrix4(frame);
    cuts.push(end);
  }
  if (COVER_BOOT_HOLE && !upper) cuts.push(...bootHoleCutters(s));
  // Open the pan first. The blister is added after, so this pocket cannot take
  // the skin off the ceiling.
  if (cuts.length) subtractSolids(root, cuts);
  const extra = new Part();
  for (const g of [...relief.caps, ...relief.land]) extra.add(g, 'castAlu');
  root.add(extra.g);
  subtractSolids(extra.g, [...studHoles, under]);
  return root;
}
/**
 * Per rocker: the cover-local box the forging occupies above the housing, plus a
 * rail bypass on the outer side of the arm. Pads stay below the cover and are
 * not part of the blister.
 */
function coverRelief(s: 1 | -1, upper: boolean) {
  const frame = coverMatrix(s, upper);
  const inv = frame.clone().invert();
  const caps: THREE.BufferGeometry[] = [];
  const pockets: THREE.BufferGeometry[] = [];
  const railCuts: THREE.BufferGeometry[] = [];
  const land: THREE.BufferGeometry[] = [];
  const toL = (p: THREE.Vector3) => p.applyMatrix4(inv);
  // Added metal stays inside the cast shell. A pocket may still open the end
  // wall where a shaft runs out; a cut does not grow the bounding box.
  const shellY = (CH_Z1 - CH_Z0 - 8) / 2 - 2;
  const clampSpan = (a: number, b: number): [number, number] | null => {
    const lo = Math.max(-shellY, Math.min(a, b));
    const hi = Math.min(shellY, Math.max(a, b));
    return hi - lo < 0.5 ? null : [lo, hi];
  };
  for (const st of rockerStations(s)) {
    if ((st.side > 0) !== upper) continue;
    const lay = rockerLayout(st.cyl, st.side);
    const pts: THREE.Vector3[] = [];
    // Cover-local Y is the shaft. Don't inflate Y by the radial clearance or the
    // blister reaches the next ear and the housing end cap.
    const box = (c: THREE.Vector3, rx: number, ry: number, rz: number) => {
      for (const d of [
        [rx, 0, 0], [-rx, 0, 0], [0, ry, 0], [0, -ry, 0], [0, 0, rz], [0, 0, -rz],
      ] as const) pts.push(c.clone().add(new THREE.Vector3(...d)));
    };
    const shaft = toL(new THREE.Vector3(lay.P.x, lay.P.y, lay.z));
    // Nut hex ends ~18.5 mm on the −Y side of the shaft; the pan-head screw
    // ends ~17 mm on +Y. Keep both inside the blister, and stop short of the
    // ear faces (r 9.2) so the cover-nut seat is not machined away.
    const ears = VC_EARS(upper, s);
    let yNut = shaft.y - (SHAFT.half + 8);
    let yScr = shaft.y + (SHAFT.half + 4);
    for (const e of ears) {
      if (e < shaft.y) yNut = Math.max(yNut, e + 14);
      if (e > shaft.y) yScr = Math.min(yScr, e - 14);
    }
    box(shaft, 16, 0, 16);
    pts.push(shaft.clone().setY(yNut));
    pts.push(shaft.clone().setY(yScr));
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      box(toL(new THREE.Vector3(
        lay.K.x + (lay.P.x - lay.K.x) * t,
        lay.K.y + (lay.P.y - lay.K.y) * t,
        lay.z,
      )), 11, ARM_T / 2 + 4, 11);
    }
    box(toL(new THREE.Vector3(lay.ball.x, lay.ball.y, lay.z)), 12, 10, 16);
    box(toL(new THREE.Vector3(lay.ball.x + lay.stem.x * 18, lay.ball.y + lay.stem.y * 18, lay.z)), 12, 10, 16);
    for (const along of [78, 90, 104, 112]) box(toL(headToEngine(st.cyl, stemPointLocal(st.side, along))), 12, 12, 12);
    const use = pts.filter((p) => p.z > -6);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z1 = -8;
    for (const p of use) {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
      z1 = Math.max(z1, p.z);
    }
    const wall = 3.4;
    const skin = 3.2;
    const yOuter = clampSpan(y0 - wall, y1 + wall);
    // Hollow blister: the cavity is the rocker envelope, the skin is past it.
    // A solid block would leave the ray origin inside metal, and the only hit
    // would be the far wall past the cover-roof test.
    const ceil = z1 + 1.2;
    if (yOuter && ceil > 2) {
      const outer = boxMM([x0 - wall, yOuter[0], 0.3], [x1 + wall, yOuter[1], ceil + skin]);
      const inner = boxMM([x0 - 0.4, y0 - 0.4, -4], [x1 + 0.4, y1 + 0.4, ceil]);
      const cap = csgSub(outer, inner);
      cap.applyMatrix4(frame);
      caps.push(cap);
    }
    // Open the pan into that cavity. Wider than the blister mouth so the roof
    // hole sits under the blister wall, not beside it. Stop short of the lip
    // ends so the flywheel-end corners, which set the cover length, stay put.
    const yPocket = clampSpan(y0 - 1.2, y1 + 1.2);
    if (yPocket) {
      const pocket = boxMM([x0 - 1.2, yPocket[0], -1.6], [x1 + 1.2, yPocket[1], ceil + 0.6]);
      pocket.applyMatrix4(frame);
      pockets.push(pocket);
    }
    // The arm crosses the side rail. Open that rail under the arm only, and lay
    // a land further out so the seal still runs the length of the cover.
    const crossing = pts.filter((p) => p.z < 6 && (p.x < -16 || p.x > 16));
    if (!crossing.length) continue;
    let cx0 = Infinity, cx1 = -Infinity, cy0 = Infinity, cy1 = -Infinity;
    for (const p of crossing) {
      cx0 = Math.min(cx0, p.x); cx1 = Math.max(cx1, p.x);
      cy0 = Math.min(cy0, p.y); cy1 = Math.max(cy1, p.y);
    }
    const outer = cx0 < 0 ? -1 : 1;
    const armOuter = outer < 0 ? cx0 : cx1;
    const b0 = armOuter + outer * 4;
    const b1 = armOuter + outer * 11;
    const span = 6.5;
    const tie = (y: number) => {
      const spanY = clampSpan(y, y + span);
      if (!spanY) return;
      const box = boxMM(
        [Math.min(b0, outer < 0 ? -26 : 22), spanY[0], 0],
        [Math.max(b1, outer < 0 ? -22 : 26), spanY[1], 1.3],
      );
      box.applyMatrix4(frame);
      land.push(box);
    };
    tie(cy0 - span);
    tie(cy1);
    const bandY = clampSpan(cy0 - 1, cy1 + 1);
    if (bandY) {
      const band = boxMM([Math.min(b0, b1), bandY[0], 0], [Math.max(b0, b1), bandY[1], 1.3]);
      band.applyMatrix4(frame);
      land.push(band);
    }
    const rail0 = outer < 0 ? Math.min(cx0, -34) : 20;
    const rail1 = outer < 0 ? -18 : Math.max(cx1, 34);
    const cut = boxMM([Math.min(rail0, rail1), cy0 + 1.5, -1.2], [Math.max(rail0, rail1), cy1 - 1.5, 5.5]);
    cut.applyMatrix4(frame);
    railCuts.push(cut);
  }
  return { caps, pockets, railCuts, land };
}
/** Round holes on the plug axis, through the lower cover, outside the gasket when the flag is on. */
function bootHoleCutters(s: 1 | -1): THREE.BufferGeometry[] {
  const [dx, dy, dz] = sparkDirHead();
  const dir = new THREE.Vector3(s * dx, dy, s * dz).normalize();
  const cyls = s > 0 ? [1, 2, 3] : [4, 5, 6];
  return cyls.map((c) => {
    const tip = new THREE.Vector3(s * (CYL_TOP_X + SPARK_TIP.x), SPARK_TIP.y, CYL_Z[c] + s * SPARK_Z);
    const a = tip.clone().addScaledVector(dir, -SPARK_BOOT_Y - 10);
    const b = tip.clone().addScaledVector(dir, -SPARK_BOOT_Y + 14);
    return cylBetween([a.x, a.y, a.z], [b.x, b.y, b.z], 9, 16);
  });
}

/** Valve head in engine space at `crank`, for the piston-clearance sweep. */
export function valveHeadEngine(cyl: number, side: 1 | -1, crank: number): THREE.BufferGeometry {
  const pose = trainPose(cyl, side, crank);
  const dir = stemDirLocal(side);
  const face = stemPointLocal(side, 0).addScaledVector(dir, pose.lift);
  const g = lathe(valveProfile(side > 0 ? 49 : 41.5, side < 0), 24);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir));
  g.translate(face.x, face.y, face.z);
  const s = bankSign(cyl);
  g.applyMatrix4(new THREE.Matrix4().compose(
    new THREE.Vector3(s * CYL_TOP_X, 0, CYL_Z[cyl]),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, s === 1 ? 0 : Math.PI, 0)),
    new THREE.Vector3(1, 1, 1),
  ));
  return g;
}
