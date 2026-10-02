/**
 * Top end batch 1: cam housings, camshafts, rockers and shafts, valves, springs, retainers, keepers.
 * Dimensions and which of them are verified against Dempsey are recorded in docs/engine-spec.md §11.
 * Photos are reference only and are not shipped.
 *
 * Closed-valve lash: the slipper rests on the lobe base circle (no gap) and the adjuster ball
 * is 0.10 mm clear of the stem tip. Turning the cam onto the nose rotates the rocker about its
 * shaft; the ball moves inward and the valve leaves the seat once that lash is taken up.
 */
import * as THREE from 'three';
import {
  Part, V3, DEG, lathe, closedLathe, boxMM, cyl, cylBetween, yToZ, yToX, circlePath, polyShape,
  extrude, extrudeC, hexNut, tube, csgSub, csgUnion, woodruffGeom, roundRect,
} from './util';
import { cutClosed, manifoldAdd, manifoldSub } from './manifoldCut';
import { CAM_X, CAM_HOUSING_OUT_X, CYL_Z, CYL_TOP_X, HEAD_OUT_X, SPARK_HOLE_R, SPARK_BEND_R, SPARK_FLANGE_T, SPARK_MOUTH, SPARK_TUBE_R, plugTipEngine, plugAxisEngine, sparkRoll } from '../data/layout';
import { HEAD_HW } from './hwLayout';
import { CH_Z0, CH_Z1, vcStuds, CAM_NOSE, CHAIN_Z, bankZ, coverMatrix, CAM_COVER, camCoverAngles, camCoverBolt, camNoseStack } from './core';
import {
  VALVE_LEN, valveLen, STEM_R, GUIDE_Y0, GUIDE_Y1,
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
  baseR: 14.7, // Ø29.4 heel. FVD 930 105 147 17 / Cat Cams
  lift: { in: 7.75, ex: 6.90 }, // lobe lift; peaks 22.45 / 21.60, both under the 22.85 slide-in limit
  noseR: 13.2, // circular nose; its centre is offset from the shaft
  nose: 0.72, // rad: nose arc hands off to the flank
  flank: 1.85, // rad: long flank so overlap lift rises slowly off the base circle
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
 * Half-length 17 mm, the catalogue shaft. Stations sit in the gaps between the cover studs.
 */
export const SHAFT = { r: 9, boreR: 4.15, half: 17, bossR: 12.6, bossHalf: 11 };
export const LASH = 0.10;
/** Ø6.4 adjuster ball. The face sits on the stem; the centre is one radius outboard. */
const BALL_R = 3.2;
/**
 * Curved slipper, Kat 502 103-10 #48. Contact is the lobe tangent to the pad face.
 * One forging shape could not put both balls on the stem at the two lifts, so the
 * sides share the construction and keep their own shaft, radius and contact angle.
 * `px`/`py` is the right-bank shaft. `angU` is the closed contact direction from the
 * cam centre. The slipper radius `Rs` is the face curvature.
 */
const SLIPPER = {
  in: { px: 314, py: 35, angU: 20 * DEG, Rs: 36 },
  ex: { px: 308, py: -38, angU: -25 * DEG, Rs: 30 },
} as const;
const INSTALLED = 34.5; // spring seat to retainer, closed
const TIP_STICK = 3.4; // stem tip proud of the keeper

/** Firing TDC on the 720° cycle (opposite cylinders are 360° apart). */
export const FIRE_CRANK: Record<number, number> = { 1: 0, 6: 120, 2: 240, 4: 360, 3: 480, 5: 600 };
/** Crank degrees after firing TDC at which the lobe nose meets the slipper. Tuned so overlap TDC lift is ~1.15 / 1.35. */
export const PEAK_CRANK = { in: 495, ex: 230 };

function camLift(side: 1 | -1): number { return side > 0 ? CAM.lift.in : CAM.lift.ex; }

/** Radius of the offset circular nose. Angle is measured from the nose, in radians. */
function noseCircleRadius(a: number, lift: number): number {
  const rn = CAM.noseR;
  const d = CAM.baseR + lift - rn;
  const c = Math.cos(a);
  const q = Math.sqrt(Math.max(0, d * d * (c * c - 1) + rn * rn));
  return d * c + q;
}
function noseCircleSlope(a: number, lift: number): number {
  const rn = CAM.noseR;
  const d = CAM.baseR + lift - rn;
  const c = Math.cos(a), s = Math.sin(a);
  const q = Math.sqrt(Math.max(1e-8, d * d * (c * c - 1) + rn * rn));
  return -d * s - (d * d * c * s) / q;
}
/** dr/dθ of the polar profile. θ is the signed angle from the nose, same sign as `angFromNose`. */
function lobeSlope(angFromNose: number, side: 1 | -1): number {
  const lift = camLift(side);
  const TWO = Math.PI * 2;
  let a = angFromNose % TWO;
  if (a > Math.PI) a -= TWO;
  if (a < -Math.PI) a += TWO;
  const abs = Math.abs(a);
  const sgn = a < 0 ? -1 : 1;
  if (abs < 1e-6 || abs >= CAM.flank) return 0;
  if (abs <= CAM.nose) return noseCircleSlope(abs, lift) * sgn;
  const rN = noseCircleRadius(CAM.nose, lift);
  const sN = noseCircleSlope(CAM.nose, lift);
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
export function lobeRadius(angFromNose: number, side: 1 | -1): number {
  const lift = camLift(side);
  let a = Math.abs(angFromNose) % (Math.PI * 2);
  if (a > Math.PI) a = Math.PI * 2 - a;
  if (a >= CAM.flank) return CAM.baseR;
  if (a <= CAM.nose) return noseCircleRadius(a, lift);
  const rN = noseCircleRadius(CAM.nose, lift);
  const sN = noseCircleSlope(CAM.nose, lift);
  const span = CAM.flank - CAM.nose;
  const t = (a - CAM.nose) / span;
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * rN + (t3 - 2 * t2 + t) * (sN * span) + (-2 * t3 + 3 * t2) * CAM.baseR;
}
/** Intake peak. It is the larger of the two and still clears the journal. */
export const PEAK_R = lobeRadius(0, 1);

export function camWebZ(s: 1 | -1): number[] {
  const zs = bankZ(s).slice().sort((a, b) => a - b);
  // The banks are staggered, and the exhaust lobe sits outboard of the cylinder
  // centre. A journal at CH_Z0+18 clears the right bank and lands on the left
  // bank's cylinder-6 shoe. Park it just outboard of that shoe.
  const rearmost = Math.min(...rockerStations(s).map((st) => st.z));
  let fly = Math.min(CH_Z0 + CAM.webZ0, rearmost - PAD_W / 2 - CAM.journalW / 2 - 1.5);
  if (s < 0) {
    // Cylinder-6 exhaust nut: flange ends 5.5 mm outboard of the shaft. The
    // right-bank formula lands this journal on that nut. Keep a 2 mm gap and
    // stop 1 mm short of the flywheel cap (cap1 = CH_Z0 − 28).
    const nutTip = rearmost - SHAFT.half - 5.5;
    const cap1 = CH_Z0 - 28;
    fly = Math.min(fly, nutTip - 2 - CAM.journalW / 2);
    fly = Math.max(fly, cap1 + 1 + CAM.journalW / 2);
  }
  return [fly, (zs[0] + zs[1]) / 2, (zs[1] + zs[2]) / 2, CH_Z1 - 16];
}

const sideOf = (which: 'in' | 'ex'): 1 | -1 => (which === 'in' ? 1 : -1);
function whichOf(side: 1 | -1): 'in' | 'ex' { return side > 0 ? 'in' : 'ex'; }

function bankSign(cyl: number): 1 | -1 { return cyl <= 3 ? 1 : -1; }
export function valveTipEngine(cyl: number, side: 1 | -1, lift = 0): THREE.Vector3 {
  return headToEngine(cyl, stemPointLocal(side, valveLen(side)).addScaledVector(stemDirLocal(side), -lift));
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
  C: THREE.Vector2; P: THREE.Vector2; K: THREE.Vector2; S: THREE.Vector2;
  tip: THREE.Vector2; ball: THREE.Vector2;
  z: number; stem: THREE.Vector2; Rs: number;
  /** Rotation that carries the local forging (pad contact at +X) onto this closed pose. */
  ang: number;
  /** Eye-arm bend in the local forging. Positive bends the eye toward local −Y. */
  gamma: number;
}
function slipperSpec(side: 1 | -1) { return side > 0 ? SLIPPER.in : SLIPPER.ex; }
/**
 * Closed-valve layout. The slipper centre sits so the face is tangent to the base
 * circle (zero gap). The ball face is LASH mm outboard of the stem tip; lash is
 * taken up at the valve, not at the cam. Left-bank shafts mirror in x.
 */
export function rockerLayout(cyl: number, side: 1 | -1): RockerLayout {
  const s = bankSign(cyl);
  const spec = slipperSpec(side);
  const tipE = valveTipEngine(cyl, side, 0);
  const C = new THREE.Vector2(s * CAM_X, 0);
  const P = new THREE.Vector2(s * spec.px, spec.py);
  const angU = s > 0 ? spec.angU : Math.PI - spec.angU;
  const u = new THREE.Vector2(Math.cos(angU), Math.sin(angU));
  const Rs = spec.Rs;
  const S = C.clone().addScaledVector(u, CAM.baseR + Rs);
  const K = C.clone().addScaledVector(u, CAM.baseR);
  const tip = new THREE.Vector2(tipE.x, tipE.y);
  const stem = stemDirEngine(cyl, side);
  const stem2 = new THREE.Vector2(stem.x, stem.y).normalize();
  const ball = tip.clone().addScaledVector(stem2, LASH);
  const ang = Math.atan2(K.y - P.y, K.x - P.x);
  const ballL = rot2(ball.clone().sub(P), -ang);
  const gamma = Math.atan2(ballL.y, ballL.x) - Math.PI;
  return { cyl, side, s, C, P, K, S, tip, ball, z: tipE.z, stem: stem2, Rs, ang, gamma };
}
function centerAt(lay: RockerLayout, beta: number): THREE.Vector2 {
  return lay.P.clone().add(rot2(lay.S.clone().sub(lay.P), beta));
}
/** Cam radius the slipper is tangent to, for a circular cam. External contact: |S−C| − Rs. */
function camRadiusAt(lay: RockerLayout, beta: number): number {
  return centerAt(lay, beta).distanceTo(lay.C) - lay.Rs;
}
function ballAt(lay: RockerLayout, beta: number): THREE.Vector2 {
  return lay.P.clone().add(rot2(lay.ball.clone().sub(lay.P), beta));
}
function ballAlongOf(lay: RockerLayout, beta: number): number {
  const b = ballAt(lay, beta);
  return (b.x - lay.tip.x) * lay.stem.x + (b.y - lay.tip.y) * lay.stem.y;
}
/** World angle of the slipper normal, measured from the cam centre. The lobe nose is aimed from here. */
export function contactAngle(lay: RockerLayout, beta: number): number {
  const S = centerAt(lay, beta);
  return Math.atan2(S.y - lay.C.y, S.x - lay.C.x);
}
/** Rotation that grows the tangent cam radius. The same swing drives the ball inward, onto the stem. */
function openSign(lay: RockerLayout): 1 | -1 {
  return camRadiusAt(lay, 0.02) >= camRadiusAt(lay, -0.02) ? 1 : -1;
}
/**
 * Rocker rotation that puts the slipper tangent to a lobe of radius `lobeR`.
 * On the base circle the rotation is zero and the gap at the pad is zero.
 */
export function rockerBeta(lay: RockerLayout, lobeR: number): number {
  if (lobeR <= CAM.baseR + 1e-4) return 0;
  const sign = openSign(lay);
  let lo = 0, hi = 0.9;
  if (camRadiusAt(lay, sign * hi) < lobeR) hi = 1.3;
  for (let k = 0; k < 32; k++) {
    const mid = (lo + hi) / 2;
    if (camRadiusAt(lay, sign * mid) < lobeR) lo = mid;
    else hi = mid;
  }
  return sign * (lo + hi) / 2;
}

export interface TrainPose { lobeR: number; beta: number; lift: number; gap: number; lay: RockerLayout }
/** Valvetrain pose at a crank angle. `gap` is ball-to-tip clearance along the stem; `lift` is valve lift. */
export function trainPose(cyl: number, side: 1 | -1, crank: number): TrainPose {
  const lay = rockerLayout(cyl, side);
  const which = whichOf(side);
  const fromPeak = ((crank - (FIRE_CRANK[cyl] + PEAK_CRANK[which])) / 2) * DEG;
  const lobeR = lobeRadius(fromPeak, side);
  const beta = rockerBeta(lay, lobeR);
  const along = ballAlongOf(lay, beta);
  // Closed ball sits at +LASH (outboard of the tip). Inward motion takes up lash, then opens the valve.
  const lift = Math.max(0, -along);
  const gap = Math.max(0, along);
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
  const len = exhaust ? VALVE_LEN.ex : VALVE_LEN.in;
  const headR = dia / 2;
  const g0 = len - TIP_STICK - 5.6;
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
    [STEM_R, len - TIP_STICK],
    [STEM_R - 0.15, len - 0.4],
    [STEM_R * 0.35, len],
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
    // Opening moves the valve toward the piston. `along` is the closed station.
    const moving = (g: THREE.BufferGeometry, along: number, m: MatKey) => p.add(place(g, along - pose.lift), m);
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
    const seatY = valveLen(side) - TIP_STICK - 7.2 - INSTALLED;
    // Diameters are held in so the stack clears the cam-housing stud nuts (those stations are fixed).
    fixed(lathe([[STEM_R + 0.8, 0], [10.2, 0], [10.2, 0.6], [STEM_R + 0.8, 0.6]], 24), seatY - 0.7, 'polishedSteel');
    fixed(lathe([[STEM_R + 0.7, 0], [9.6, 0], [9.6, 1.3], [STEM_R + 0.7, 1.3]], 24), seatY - 0.15, 'steel');
    const yRet = seatY + INSTALLED;
    const ySpring0 = seatY + 1.15;
    // Outer is the heavy dark helix with damper coils at the head end. Inner is a lighter,
    // brighter helix on a smaller radius so the two wires don't merge into one coil.
    // Outer centre Ø20 (wire to Ø11.6) stays inside the cam-housing stud-nut clearance.
    // The free retainer station is yRet; lift compresses the spring down onto the moving valve.
    fixed(springVar(8.2, 1.45, ySpring0, yRet - pose.lift, 5.2, 0.24, 0.4), 0, 'darkSteel');
    fixed(springVar(6.05, 0.92, ySpring0 + 0.5, yRet - pose.lift - 0.45, 8.0, 0, 1.7), 0, 'steel');
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
/** Slipper face in the closed shaft frame. The contact vertex is exactly on the base circle. */
function slipperFace(lay: RockerLayout): { face: THREE.Vector2[]; away: THREE.Vector2 } {
  const toL = (v: THREE.Vector2) => rot2(v.clone().sub(lay.P), -lay.ang);
  const S = toL(lay.S);
  const K = toL(lay.K);
  const dir = K.clone().sub(S);
  const a0 = Math.atan2(dir.y, dir.x);
  const sign = openSign(lay);
  const opened = sign * 0.12;
  const S2 = centerAt(lay, opened);
  const u2 = S2.clone().sub(lay.C);
  u2.normalize();
  const K2 = lay.C.clone().addScaledVector(u2, camRadiusAt(lay, opened));
  const dir2 = rot2(K2.clone().sub(S2).normalize(), -(lay.ang + opened));
  const sweep = Math.atan2(dir.x * dir2.y - dir.y * dir2.x, dir.x * dir2.x + dir.y * dir2.y);
  const toeSign = sweep >= 0 ? 1 : -1;
  // 8 mm of heel and 14 mm of toe: the face is past 16 mm, with 6 mm beyond the closed contact.
  const heel = 8 / lay.Rs;
  const toe = 14 / lay.Rs;
  const n = 16;
  const face: THREE.Vector2[] = [];
  let bestI = 0, best = Infinity;
  for (let i = 0; i <= n; i++) {
    const a = a0 - toeSign * heel + toeSign * (heel + toe) * (i / n);
    const p = v2(S.x + Math.cos(a) * lay.Rs, S.y + Math.sin(a) * lay.Rs);
    face.push(p);
    const d = p.distanceToSquared(K);
    if (d < best) { best = d; bestI = i; }
  }
  face[bestI] = K.clone();
  const away = S.clone().sub(K);
  if (away.lengthSq() < 1e-8) away.set(1, 0);
  return { face, away };
}
/**
 * Adjuster boss in the closed shaft frame. It sits on the shaft side of the stem,
 * just outboard of the ball, so the screw can reach the ball without entering the valve.
 */
function adjusterBoss(lay: RockerLayout): THREE.Vector2 {
  const stemL = rot2(lay.stem, -lay.ang);
  const ballL = rot2(lay.ball.clone().sub(lay.P), -lay.ang);
  const centerL = ballL.clone().addScaledVector(stemL, BALL_R);
  const perp = v2(-stemL.y, stemL.x);
  const sgn = centerL.dot(perp) <= 0 ? 1 : -1;
  return centerL.clone().addScaledVector(perp, sgn * (STEM_R + 8)).addScaledVector(stemL, 1.5);
}
/** Ball centre at this rocker angle: the kinematic face, one radius out along the real stem. */
function ballCenterWorld(lay: RockerLayout, beta: number): THREE.Vector2 {
  return ballAt(lay, beta).addScaledVector(lay.stem, BALL_R);
}
/**
 * Side profile in the shaft frame. The slipper arc is the cam face. The eye ends
 * at the adjuster boss, beside the stem, so the forging does not swallow the valve.
 * Star-convex, one solid.
 */
function rockerOutline(lay: RockerLayout): [number, number][] {
  const BOSS = 11.6;
  const { face } = slipperFace(lay);
  const gamma = lay.gamma;
  const lowerC = face[0], upperC = face[face.length - 1];
  const bow = gamma >= 0 ? 1 : -1;
  const padHi = 0.55, padLo = -0.55;
  const upperBoss = circ(BOSS, padHi);
  const lowerBoss = circ(BOSS, padLo < 0 ? padLo + Math.PI * 2 : padLo);
  const ctrl = (ang: number, rad: number, yb: number) => circ(rad, ang).add(v2(0, yb));
  const upperEdge = bezOpen(upperC, ctrl(0.15, 24, bow * 3.4), upperBoss, 8);
  const lowerEdge = bezOpen(lowerBoss, ctrl(-0.15, 24, bow * 2.6), lowerC, 8);
  const boss = adjusterBoss(lay);
  const eyeAng = Math.atan2(boss.y, boss.x);
  const radial = boss.clone().normalize();
  const side = v2(-radial.y, radial.x);
  const neck = radial.clone().multiplyScalar(Math.min(16, boss.length() * 0.42));
  const eyeA = eyeAng - 0.55;
  const eyeB = eyeAng + 0.55;
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
    neck.clone().addScaledVector(side, -3.4),
  ];
  const bossR = 6.2;
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    pts.push(v2(boss.x + Math.cos(a) * bossR, boss.y + Math.sin(a) * bossR));
  }
  pts.push(
    neck.clone().addScaledVector(side, 3.4),
    circ(BOSS, aEyeB),
    ...bossArc(aEyeB, aPadLo, BOSS, 7),
    circ(BOSS, aPadLo),
    ...lowerEdge,
  );
  return pts.map((q) => [q.x, q.y]);
}
/** Farthest point in each direction about the shaft, so a crossing outline still extrudes as one solid. */
function starOutline(pts: [number, number][], bins = 128): [number, number][] {
  const best: ({ r: number; p: [number, number] } | undefined)[] = [];
  for (const p of pts) {
    let a = Math.atan2(p[1], p[0]);
    if (a < 0) a += Math.PI * 2;
    const i = Math.min(bins - 1, Math.floor((a / (Math.PI * 2)) * bins));
    const r = Math.hypot(p[0], p[1]);
    if (!best[i] || r > best[i]!.r) best[i] = { r, p };
  }
  return best.filter((b): b is { r: number; p: [number, number] } => !!b).map((b) => b.p);
}
/**
 * Two channels on an arm, wide in the middle and narrow at each end, with a rib left between them.
 * The web (the uncut strip, and the arm height the channels occupy) tapers toward the pad and the eye.
 */
function pocketShapes(gamma: number, which: 'pad' | 'eye'): [number, number][][] {
  const rib = 0.72;
  if (which === 'pad') {
    const bow = gamma >= 0 ? 1 : -1;
    const rs = [16.2, 20.4, 24.2, 27.4];
    const cy = (r: number) => {
      const t = (r - 16.2) / (27.4 - 16.2);
      return bow * Math.sin(Math.max(0, Math.min(1, t)) * Math.PI) * 1.4;
    };
    const half = (r: number) => {
      const t = (r - 16.2) / (27.4 - 16.2);
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
  const L = SHAFT.half - 4.0;
  const R = SHAFT.r;
  const g0 = L - 1.0, g1 = L - 2.3, g2 = L - 4.6;
  const ri = SHAFT.boreR;
  const outer = yToZ(lathe([
    [R, -L], [R, -g0], [R - 1.15, -g1], [R - 1.15, -g2], [R, -(g2 + 1.1)],
    [R, g2 + 1.1], [R - 1.15, g2], [R - 1.15, g1], [R, g0], [R, L],
    [ri, L], [ri, -L], [R, -L],
  ], 28));
  const slots: THREE.BufferGeometry[] = [];
  for (const end of [-1, 1]) for (const ang of [0.35, Math.PI + 0.35]) {
    const slot = boxMM([-0.75, -R - 0.5, -3.2], [0.75, R + 0.5, 3.2]);
    slot.rotateZ(ang);
    slot.translate(0, 0, end * (L - 3.4));
    slots.push(slot);
  }
  const shell = manifoldSub(outer, ...slots);
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
/** Hardened chilled foot: the slipper arc and a back on the rocker side of the face. */
function padShoe(face: THREE.Vector2[], away: THREE.Vector2): [number, number][] {
  const o = away.clone().normalize();
  const back = face.slice().reverse().map((q) => [q.x + o.x * 5, q.y + o.y * 5] as [number, number]);
  return [...face.map((q) => [q.x, q.y] as [number, number]), ...back];
}
export function rockers(s: 1 | -1) {
  const p = new Part();
  for (const st of rockerStations(s)) {
    const pose = trainPose(st.cyl, st.side, ASSEMBLED_CRANK);
    const lay = pose.lay;
    const { P, C, z, ang, gamma } = lay;
    const beta = pose.beta;
    const fromPeak = ((ASSEMBLED_CRANK - (FIRE_CRANK[st.cyl] + PEAK_CRANK[whichOf(st.side)])) / 2) * DEG;
    const { face, away } = slipperFace(lay);
    const outline = rockerOutline(lay);
    const arm = extrudeC(polyShape(starOutline(outline)), ARM_T, 0, 3);
    // Cut in from each flat face. The channels stay inside the outline so the
    // neck between the boss and the eye is not severed.
    const depth = 3.05;
    const cut = (which: 'pad' | 'eye', side: 1 | -1) => {
      const L = depth + 0.3;
      return pocketShapes(gamma, which).map((pts) => {
        const g = extrude(polyShape(pts), L, 0, 2);
        g.translate(0, 0, side > 0 ? ARM_T / 2 - depth : -(ARM_T / 2 + 0.3));
        return g;
      });
    };
    const carvedRaw = manifoldSub(arm, ...cut('pad', 1), ...cut('pad', -1), ...cut('eye', 1), ...cut('eye', -1));
    carvedRaw.computeBoundingBox();
    const bb = carvedRaw.boundingBox!;
    const sz = bb.getSize(new THREE.Vector3());
    const mid = bb.getCenter(new THREE.Vector3());
    // A reversed left-bank outline makes the boolean emit a mesh centred near the
    // origin. That reads as a floating fragment once the bank is placed. Keep the uncut arm.
    const carved = sz.x < 120 && sz.y < 120 && sz.z < 40 && mid.length() < 70 && Number.isFinite(sz.x) ? carvedRaw : arm;
    const lobeCut = lobeGeom(st.side);
    // True lobe. A 1.012 scale left the shoe 0.18 mm off the base circle.
    lobeCut.rotateZ(contactAngle(lay, beta) - fromPeak);
    lobeCut.translate(C.x, C.y, z);
    // The shoe is the contact. Pull the forging cutter 0.4 mm inside the lobe
    // so the crown stays and a deep bite cannot sever the pad arm.
    const armCut = lobeCut.clone();
    const ap = armCut.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < ap.count; i++) {
      const dx = ap.getX(i) - C.x, dy = ap.getY(i) - C.y;
      const len = Math.hypot(dx, dy);
      if (len < 0.5) continue;
      const k = (len - 0.4) / len;
      ap.setXY(i, C.x + dx * k, C.y + dy * k);
    }
    const armWorld = placeRocker(carved, ang, beta, P, z);
    let forged = armWorld;
    try {
      const shaved = manifoldSub(armWorld, armCut);
      shaved.computeBoundingBox();
      if (shaved.boundingBox!.getSize(new THREE.Vector3()).length() > 20) forged = shaved;
    } catch { /* keep the uncut arm if the inset lobe is not a solid cutter */ }
    // The eye approaches the stem from the side. Take the forging off the valve,
    // including the head of the moving stem, and leave the adjuster boss.
    const tip3 = valveTipEngine(st.cyl, st.side, pose.lift);
    const stem3 = stemDirEngine(st.cyl, st.side);
    const stemCut = cylBetween(
      [tip3.x - stem3.x * 32, tip3.y - stem3.y * 32, tip3.z - stem3.z * 32],
      [tip3.x + stem3.x * 0.3, tip3.y + stem3.y * 0.3, tip3.z + stem3.z * 0.3],
      STEM_R + 0.7, 18,
    );
    try {
      const cleared = manifoldSub(forged, stemCut);
      cleared.computeBoundingBox();
      if (cleared.boundingBox!.getSize(new THREE.Vector3()).length() > 20) forged = cleared;
    } catch { /* the boss stays on the uncut forging */ }
    p.add(forged, 'forgedSteel');
    // 19 mm shoe, 12.4 mm lobe, next lobe 14 mm away. The wings cross that
    // nose and the cast shank. Keep the face over this lobe; cut the wings
    // back to just outside the peak radius. The crown vertex is the contact.
    const shoe = placeRocker(extrudeC(polyShape(padShoe(face, away)), PAD_W, 0, 3), ang, beta, P, z);
    // The 19 mm shoe reaches the next lobe (centres 14 mm apart). Clip only that
    // overlap. A cylinder through the cam also ate the crown.
    const wing = (z0: number, z1: number) => boxMM([C.x - 40, -40, z0], [C.x + 40, 40, z1]);
    p.add(manifoldSub(shoe, wing(z + 7.6, z + 16), wing(z - 16, z - 7.6)), 'polishedSteel');
    const bh = SHAFT.bossHalf;
    const bush = yToZ(lathe([
      [SHAFT.r + 0.12, -(bh - 2.4)], [SHAFT.r + 1.85, -(bh - 2.4)],
      [SHAFT.r + 1.85, bh - 2.4], [SHAFT.r + 0.12, bh - 2.4],
      [SHAFT.r + 0.12, -(bh - 2.4)],
    ], 20));
    bush.translate(P.x, P.y, z);
    const camClear = yToZ(cyl(17, 36, 16));
    camClear.translate(C.x, C.y, z);
    p.add(manifoldSub(bush, lobeCut, camClear), 'bronze');
    // Round hub, no larger than the outline's boss, so the arms read longer than the disc.
    const boss = yToZ(lathe([
      [SHAFT.r + 1.7, -bh], [11.4, -bh], [12.4, -(bh - 1.6)],
      [12.4, bh - 1.6], [11.4, bh], [SHAFT.r + 1.7, bh],
      [SHAFT.r + 1.7, -bh],
    ], 22));
    boss.translate(P.x, P.y, z);
    p.add(manifoldSub(boss, lobeCut, camClear), 'forgedSteel');
    // Oil drilling stays inside the hub. One placement — it is not orbited a second time.
    const oilA = Math.PI / 2 * (gamma >= 0 ? 1 : -1);
    const oil = cylBetween(
      [Math.cos(oilA) * 6.5, Math.sin(oilA) * 6.5, 0],
      [Math.cos(oilA) * 12.1, Math.sin(oilA) * 12.1, 0],
      0.85, 8,
    );
    p.add(placeRocker(oil, ang, beta, P, z), 'bore');
    // Screw from the adjuster boss to the ball centre. The centre is one radius
    // out along the real stem, so the ball face meets the tip and the shank
    // stays on the shaft side of the valve. The locknut sits on the boss.
    const bossL = adjusterBoss(lay);
    const centerW = ballCenterWorld(lay, beta);
    const centerL = rot2(centerW.clone().sub(P), -(ang + beta));
    const screw = cylBetween(
      [bossL.x, bossL.y, 0],
      [centerL.x, centerL.y, 0],
      2.6, 12,
    );
    const ballGeo = new THREE.SphereGeometry(BALL_R, 16, 12);
    ballGeo.translate(centerL.x, centerL.y, 0);
    // Across-flats 10 (was 11). The corner was meeting the head-side wall of the
    // lower cover; a flat-to-flat of 10 pulls that corner inside the shell.
    const nut = hexNut(10, 3.2);
    const nutC = bossL.clone().lerp(centerL, 0.22);
    const ax = new THREE.Vector3(centerL.x - bossL.x, centerL.y - bossL.y, 0).normalize();
    nut.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), ax));
    nut.translate(nutC.x, nutC.y, 0);
    p.add(placeRocker(manifoldAdd(screw, ballGeo, nut), ang, beta, P, z), 'steel');
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
function lobeGeom(side: 1 | -1) {
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
      const r = lobeRadius(a, side) - inset;
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
  // Closed bar: the profile returns along the axis so the shaft relief is a solid cut.
  return yToZ(lathe([
    [r0, 0], [Math.max(r0, mid - 1.5), Math.min(2.2, len * 0.2)],
    [mid, a], [mid, b],
    [Math.max(r1, mid - 1.5), Math.max(len - 2.2, b)], [r1, len],
    [0.2, len], [0.2, 0], [r0, 0],
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
      const beta = rockerBeta(lay, lobeRadius(fromPeak, side));
      let g = lobeGeom(side);
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
  // thrust shoulder ends on the inboard face of the thrust washer (the shim now sits outboard of that washer)
  const thrust0 = zc + N.flange[0] - N.shim - N.thrust;
  p.add(yToZ(cyl(16, 5, 24)), 'polishedSteel', [X, 0, thrust0 - 2.5]);
  const nose = yToZ(cyl(N.r, zt - (CH_Z1 - 4), 24)).translate(X, 0, (CH_Z1 - 4 + zt) / 2);
  const k = N.key, kTop = N.r + k.proud;
  const pocket = woodruffGeom(k.D + 0.1, k.h + 0.05, k.b + 0.1).rotateY(-Math.PI / 2).translate(X, kTop, zc + k.dz);
  p.add(csgSub(nose, pocket), 'darkSteel');
  p.add(yToZ(cyl(N.r - 0.4, zN - zt, 20)), 'darkSteel', [X, 0, (zt + zN) / 2]);
  for (let z = zt + 1; z < zN - 0.5; z += 1.5) p.add(yToZ(lathe([[N.r - 0.4, -0.35], [N.r, 0], [N.r - 0.4, 0.35]], 20)), 'darkSteel', [X, 0, z]);
  // nose end face: centre bore (the M22 is external, matching the CoS nut) plus the three flange-pin witnesses as shallow holes
  p.add(yToZ(cyl(3.2, 8, 12)).translate(X, 0, zN - 3), 'bore');
  // The compact 28° pivot sits close to the cam. Clear a column around each
  // shaft, wider than the hub, so the journal, shank and lobe flank miss the
  // boss. The pad contact is a pad-length away and stays on the nose.
  const shaftRelief: THREE.BufferGeometry[] = [];
  for (const c of (s > 0 ? [1, 2, 3] : [4, 5, 6])) for (const side of [1, -1] as const) {
    const st = rockerLayout(c, side);
    const g = yToZ(cyl(SHAFT.bossR + 2.8, SHAFT.half * 2 + 8, 24));
    g.translate(st.P.x, st.P.y, st.z);
    shaftRelief.push(g);
  }
  cutClosed(p.g, ...shaftRelief);
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
  const xPierce0 = X(HEAD_OUT_X + 3.5), xPierce1 = X(HEAD_OUT_X + 12);
  const lobeCut = (z: number, y: number, rz: number, ry: number, amp: number) =>
    extrudeX(shapeZYPts(lobedOutline(z, y, rz, ry, amp)) as THREE.Shape, xPierce0, xPierce1, 0, 6);
  for (const ySign of [1, -1] as const) {
    const y0 = ySign * 14, y1 = ySign * 68;
    const floor = shapeZY([[zLo + 8, y0], [zHi - 8, y0], [zHi - 8, y1], [zLo + 8, y1]]);
    const cuts: THREE.BufferGeometry[] = [];
    for (const c of cyls) {
      const w = wellOf(c, ySign);
      cuts.push(lobeCut(w.z, w.y, WELL_RZ, WELL_RY, 0.17));
    }
    // Round oil and drain holes in the field between the lobed wells. Kept off the openings.
    const zs = cyls.map((c) => CYL_Z[c]).sort((a, b) => a - b);
    for (let i = 0; i < zs.length - 1; i++) {
      const zm = (zs[i] + zs[i + 1]) / 2;
      for (const [dz, yy, rr] of [[0, ySign * 34, 3.1], [16, ySign * 52, 2.3], [-18, ySign * 22, 2.0]] as const) {
        cuts.push(cylBetween([xPierce0, yy, zm + dz], [xPierce1, yy, zm + dz], rr, 12));
      }
    }
    for (const c of cyls) {
      cuts.push(cylBetween([xPierce0, ySign * 18, CYL_Z[c] + s * 24], [xPierce1, ySign * 18, CYL_Z[c] + s * 24], 1.9, 10));
    }
    // Pocket floor, set back from the head. The centreline is left open so the bore stays clear.
    const slab = extrudeX(floor, X(HEAD_OUT_X + 5.4), X(HEAD_OUT_X + 9.2), 0, 4);
    p.add(manifoldSub(slab, ...cuts), 'castAlu');
  }
  for (const c of cyls) for (const side of [1, -1] as const) {
    const w = wellOf(c, side);
    // Raised lobed land. Machined gasket face toward the head, cast body behind it.
    // A holed outline does not extrude as a manifold; subtract the opening instead.
    const land = (x0: number, x1: number) => manifoldSub(
      extrudeX(shapeZYPts(lobedOutline(w.z, w.y, WELL_RZ + WELL_BAND, WELL_RY + WELL_BAND, 0.10)) as THREE.Shape, X(x0), X(x1), 0, 6),
      lobeCut(w.z, w.y, WELL_RZ, WELL_RY, 0.17),
    );
    p.add(land(HEAD_OUT_X + 1.15, HEAD_OUT_X + 6.6), 'castAlu');
    p.add(land(HEAD_OUT_X + 0.15, HEAD_OUT_X + 1.45), 'machinedAlu');
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
      const face = HEAD_OUT_X + 0.4;
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
        p.add(yToX(cyl(2.8, h, 12)).translate(s * (HEAD_OUT_X + 0.4 + h / 2), yy, zz), 'castAlu');
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
    // Boss stays outboard of the head face. The old centre buried about 11 mm of
    // the casting in head-local x 58–72.
    const faceX = HEAD_OUT_X + 0.5;
    const x0 = s * faceX, x1 = s * nutX;
    p.add(yToX(cyl(8.2, Math.abs(x1 - x0), 16)).translate((x0 + x1) / 2, y, z), 'castAlu');
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
    p.add(yToZ(lathe([[CAM.boreR, -7.6], [CAM.boreR + 1.2, -7.6], [CAM.boreR + 1.2, 7.6], [CAM.boreR, 7.6], [CAM.boreR, -7.6]], 28)).translate(cx, 0, zw), 'machinedAlu');
  }
  // transverse bay walls and rocker-shaft bosses with spot faces
  for (const st of rockerStations(s)) {
    for (const end of [-1, 1] as const) {
      const zf = st.z + end * st.half;
      const h = 1.6;
      // annular spot face: the shaft bore comes through, the screw head / conical nut bears on the ring
      // Screw head (r 5) and nut flange (r 7.2) bear on this ring. The hole clears the M6 shank;
      // the Ø18 shaft ends just inboard of the ring, inside the boss.
      const face = yToZ(lathe([[3.5, -h / 2], [11, -h / 2], [11, h / 2], [3.5, h / 2], [3.5, -h / 2]], 22));
      face.translate(st.x, st.y, zf - end * (h / 2));
      p.add(face, 'machinedAlu');
    }
    // Two cast towers, one each side of the arm, drafted wider at the root. The bay between them
    // is the arm's width plus a small running clearance; the shaft ends inside the towers.
    for (const end of [-1, 1] as const) {
      const zRoot = st.z + end * (SHAFT.bossHalf + 3.8);
      const zTip = st.z + end * (st.half - 1.5);
      const z0 = Math.min(zRoot, zTip), z1 = Math.max(zRoot, zTip);
      const rAt = (z: number) => (Math.abs(z - zRoot) < Math.abs(z - zTip) ? SHAFT.bossR + 3.1 : SHAFT.bossR + 0.35);
      const tower = yToZ(lathe([
        [SHAFT.r + 0.2, z0], [rAt(z0), z0], [rAt(z1), z1], [SHAFT.r + 0.2, z1], [SHAFT.r + 0.2, z0],
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
  // Where the stem actually crosses the head-side rail, not a single station along it.
  const stemBand = (side: 1 | -1): [number, number][] => cyls.flatMap((c) => {
    const zs: number[] = [];
    const x0 = HEAD_OUT_X + 20, x1 = HEAD_OUT_X + 38;
    for (let a = 50; a <= valveLen(side); a += 2) {
      const e = headToEngine(c, stemPointLocal(side, a));
      if (e.x * s >= x0 && e.x * s <= x1) zs.push(e.z);
    }
    if (!zs.length) return [];
    return [[Math.min(...zs) - 14, Math.max(...zs) + 14]];
  });
  const stemGaps = stemBand(-1);
  const avoid = (z0: number, z1: number, _half: number, holes: [number, number][] = stemGaps): [number, number][] => {
    holes = holes.slice().sort((a, b) => a[0] - b[0]);
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
    // Open intake stems rise into the upper rail. Same treatment as the exhaust side.
    const intakeHoles = stemBand(1);
    const railSpans = sg > 0 ? avoid(CH_Z0, CH_Z1, 12, intakeHoles) : avoid(CH_Z0, CH_Z1, 18, stemGaps);
    for (const [a, b] of railSpans) {
      p.add(boxMM([X(HEAD_OUT_X + 23), yIn0, a], [X(HEAD_OUT_X + 35), yIn1, b]), 'castAlu');
    }
    p.add(boxMM([X(CAM_HOUSING_OUT_X - 16), sg > 0 ? 28 : -36, CH_Z0], [X(CAM_HOUSING_OUT_X - 4), sg > 0 ? 36 : -28, CH_Z1]), 'castAlu');
    // machined cover land on the rail top
    const landSpans = sg > 0 ? avoid(CH_Z0 + 2, CH_Z1 - 2, 12, intakeHoles) : avoid(CH_Z0 + 2, CH_Z1 - 2, 18);
    for (const [a, b] of landSpans) {
      p.add(boxMM([X(HEAD_OUT_X + 25), sg > 0 ? 70 : -74, a], [X(HEAD_OUT_X + 33), sg > 0 ? 75 : -69, b]), 'machinedAlu');
    }
  }
  for (const upper of [true, false]) for (const st of vcStuds(upper, s)) {
    const z = zc + st.y;
    const headSide = st.x < 0;
    p.add(yToX(cyl(6.5, 12, 14)), 'castAlu', [X(headSide ? HEAD_OUT_X + 29 : CAM_HOUSING_OUT_X - 10), upper ? (headSide ? 69 : 32) : (headSide ? -69 : -32), z]);
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
  p.add(yToZ(lathe([[CAM.boreR, -2], [30, -2], [30, 3], [CAM.boreR, 3], [CAM.boreR, -2]], 28)).translate(cx, 0, (cap0 + cap1) / 2), 'machinedAlu');
  // pulley-end pad for the chain-housing end studs (y ≈ 62). Kept above the cam bore so the shaft can enter from this end.
  // The round cam-end cover reaches y ≈ 47. The pad still runs out to the shifted housing face and is recessed there.
  {
    let pad: THREE.BufferGeometry = boxMM([X(HEAD_OUT_X + 0.8), 40, CH_Z1 - 16], [X(CAM_HOUSING_OUT_X + 10), 78, CH_Z1]);
    // Clear the cover rim and the screw lugs, plus the 1 mm erosion on each mesh.
    // A tighter recess leaves a corner whose normal walks into the left cover.
    pad = manifoldSub(pad, yToZ(cyl(CAM_COVER.rimR + 8, 14, 48)).translate(cx, 0, CH_Z1 - 5));
    p.add(pad, 'castAlu');
  }
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
  cutClosed(p.g, ...camSpringCutters(s), ...shaftClear, ...rockerPocketCutters(s), lineBore);
  // The cover seat is a tilted plane. Axis-aligned rails, the pulley-end pad and the
  // flywheel cap cross it and land inside the cover. Cut them back to just under the
  // gasket. The cam tunnel is ~39 mm below this plane, so the bore stays.
  clipHousingUnderCovers(p.g, s);
  // After the cover clip. The three-screw seat for 930 105 196 00 sits on the chain end,
  // outboard of that cut, with the thrust shoulder already on the camshaft.
  camChainSeat(p, s);
  addCoverLands(p, s);
  addShaftTowers(p, s);
  // The ear pad the cover stud threads into. A short
  // pad on the housing side of the gasket (local z −10.8..−7.6, clear of the cover)
  // is what the thread ray finds. r 4.2 covers the probe at r 3.6.
  for (const upper of [true, false]) {
    const frame = coverMatrix(s, upper);
    for (const st of vcStuds(upper, s)) {
      // Below the cover underside (trimmed to local z −0.15) by more than the 1 mm erosion.
      const g = yToZ(cyl(4.2, 3.2, 12));
      g.translate(st.x, st.y, -9.2);
      g.applyMatrix4(frame);
      p.add(g, 'castAlu');
    }
  }
  // After every later solid (lands, towers, stud pads). The outline cutter leaves one
  // side of the arm coplanar with the forging; these cylinders open that face.
  p.g.updateMatrixWorld(true);
  cutClosed(p.g, ...armClearance(s));
  // After every cut. The tower bore is open past the shaft, so the seat probe
  // (r 4.2 on the screw, r 5.2 on the nut) was looking down the hole.
  addRockerSpotFaces(p, s);
  // One bore per plug, from the head face to the cover. A stack of short
  // cutters left a jagged tunnel and thousands of open edges.
  const plugAir: THREE.BufferGeometry[] = [];
  for (const c of s > 0 ? [1, 2, 3] : [4, 5, 6]) {
    const tip = plugTipEngine(c);
    const axis = plugAxisEngine(c);
    const at = (t: number): [number, number, number] => [
      tip[0] + axis[0] * t, tip[1] + axis[1] * t, tip[2] + axis[2] * t,
    ];
    const tEnd = Math.max(c === 6 ? 176 : 148, SPARK_FLANGE_T + 14);
    const tHi = Math.max(tEnd, 162);
    // The plug axis passes 36.3 mm from the cam at t ≈ 84. A single r 16.2 bore
    // opens the cam tunnel. Stay outside the journal (r 23.35) and still clear
    // the cup (r 12.4 through t 75), the neck, and the flange (r 13.1 at t 144).
    const camX = (c <= 3 ? 1 : -1) * CAM_X;
    const room = (t: number) => {
      const p = at(t);
      return Math.hypot(p[0] - camX, p[1]) - 23.9;
    };
    // Outer radius of the connector along the axis. The cup (r 12.4) ends at
    // t 75 and the neck is down to the tube by t 82. The flange is a short
    // collar at t 144. Stay 1.1 mm outside that, and outside the cam journal.
    const connR = (t: number) => {
      if (t <= 75) return 12.4;
      if (t <= 82) return 12.4 + (SPARK_TUBE_R - 12.4) * ((t - 75) / 7);
      if (Math.abs(t - SPARK_FLANGE_T) <= 1.5) return SPARK_HOLE_R + 0.2;
      return SPARK_TUBE_R;
    };
    // Radius follows the core span. The cylinder runs 1.5 mm past each end so the
    // cap lies inside the next segment; a cap that only touches walls the bore off.
    for (let t = 56; t < tHi - 0.4; t += 4) {
      const t1 = Math.min(tHi, t + 4);
      let need = SPARK_TUBE_R + 1.6;
      let cap = Infinity;
      for (let u = t; u <= t1 + 1e-6; u += 1) {
        need = Math.max(need, connR(u) + 1.1);
        cap = Math.min(cap, room(u));
      }
      const r = Math.min(need, Math.max(cap, SPARK_TUBE_R + 1.2));
      const a = Math.max(52, t - 1.5);
      const b = t1 >= tHi - 0.4 ? tHi : t1 + 1.5;
      plugAir.push(cylBetween(at(a), at(b), r, 24));
    }
    // The elbow leaves the axis. Follow its centreline so the tube is not buried
    // in the casting. Radius is the tube plus the same running clearance.
    const sBank = c <= 3 ? 1 : -1;
    const axisV = new THREE.Vector3(...plugAxisEngine(c));
    const qPlug = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), axisV);
    qPlug.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), sparkRoll(sBank)));
    const frame = new THREE.Matrix4().compose(new THREE.Vector3(...plugTipEngine(c)), qPlug, new THREE.Vector3(1, 1, 1));
    const yJoin = -(SPARK_FLANGE_T + 12);
    const elbow: THREE.Vector3[] = [];
    const R = SPARK_BEND_R;
    for (let i = 0; i <= 8; i++) {
      const ang = Math.PI + (i / 8) * (Math.PI / 2);
      elbow.push(new THREE.Vector3(R + R * Math.cos(ang), yJoin + R * Math.sin(ang), 0).applyMatrix4(frame));
    }
    elbow.push(new THREE.Vector3(...SPARK_MOUTH).applyMatrix4(frame));
    const airR = SPARK_TUBE_R + 4.2;
    for (let i = 0; i < elbow.length - 1; i++) {
      const a = elbow[i], b = elbow[i + 1];
      const d = Math.hypot((a.x + b.x) / 2 - camX, (a.y + b.y) / 2);
      const r = Math.min(airR, d - 24);
      plugAir.push(cylBetween([a.x, a.y, a.z], [b.x, b.y, b.z], Math.max(r, SPARK_TUBE_R + 0.8), 12));
    }
  }
  cutClosed(p.g, ...plugAir, ...exhaustStemCuts(s));
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
    // r 6 clears the nut probe (r 5.2) and stays off the cam shank. r 11.2 reached it.
    p.add(annulusZ(Math.min(zBear, zBack), Math.max(zBear, zBack), hole, 6.0).translate(st.x, st.y, 0), 'machinedAlu');
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
  cutClosed(root, ...cuts);
}
/**
 * The clip takes the cast towers with the rails. Put a short tower back on each
 * side of the arm, from below the gasket up around the shaft, and bore it so the
 * shaft has 0.22 mm radial clearance. The cover pocket is sized outside this box.
 */
/** Gasket land just under the cover lip. Top face at local z −0.55, clear of the cover. */
/** Point the land's top face up. A boolean leaves some of those normals reversed, and erosion then walks them into the gasket. */
function pointLandUp(g: THREE.BufferGeometry, frame: THREE.Matrix4) {
  const inv = frame.clone().invert();
  const axis = new THREE.Vector3().setFromMatrixColumn(frame, 2);
  if (!g.attributes.normal) g.computeVertexNormals();
  const P = g.attributes.position, N = g.attributes.normal;
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i).applyMatrix4(inv);
    if (v.z < -1.8) continue;
    n.fromBufferAttribute(N, i);
    if (n.dot(axis) < 0) N.setXYZ(i, -n.x, -n.y, -n.z);
  }
  N.needsUpdate = true;
}
/**
 * The land sheet has to face outward. An inverted extrusion (and the left bank's
 * stem boolean) leaves the top pointing into the metal, so a ray that starts in
 * the sheet escapes. Flip the winding when the top faces disagree with the cover
 * normal, then recompute normals and correct any top vertex that still points down.
 */
function orientLandOutward(g: THREE.BufferGeometry, frame: THREE.Matrix4) {
  const idx = g.index;
  if (!idx) {
    g.computeVertexNormals();
    pointLandUp(g, frame);
    return;
  }
  const axis = new THREE.Vector3().setFromMatrixColumn(frame, 2);
  const inv = frame.clone().invert();
  const P = g.attributes.position;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const n = new THREE.Vector3(), mid = new THREE.Vector3();
  let vote = 0;
  for (let t = 0; t < idx.count; t += 3) {
    a.fromBufferAttribute(P, idx.getX(t));
    b.fromBufferAttribute(P, idx.getX(t + 1));
    c.fromBufferAttribute(P, idx.getX(t + 2));
    mid.copy(a).add(b).add(c).multiplyScalar(1 / 3).applyMatrix4(inv);
    if (mid.z < -1.3) continue;
    n.copy(b).sub(a).cross(c.clone().sub(a));
    if (n.lengthSq() < 1e-8) continue;
    vote += n.dot(axis) >= 0 ? 1 : -1;
  }
  if (vote < 0) {
    for (let t = 0; t < idx.count; t += 3) {
      const i0 = idx.getX(t);
      idx.setX(t, idx.getX(t + 2));
      idx.setX(t + 2, i0);
    }
  }
  g.computeVertexNormals();
  pointLandUp(g, frame);
}
function addCoverLands(p: Part, s: 1 | -1) {
  const L = CH_Z1 - CH_Z0 - 8;
  const cyls = s > 0 ? [1, 2, 3] : [4, 5, 6];
  for (const upper of [true, false]) {
    // Inset 4 mm from the cover lip so the two outer walls are not the same
    // face. A shared wall overlaps once each mesh erodes 1 mm.
    // Top face at local z −0.55, under the gasket.
    const sh = roundRect(50, L, 6);
    sh.holes.push(new THREE.Path(roundRect(42, L - 14, 4).getPoints(6).reverse()));
    let g: THREE.BufferGeometry = extrudeC(sh, 2.3);
    g.translate(0, 0, -1.7);
    const frame = coverMatrix(s, upper);
    g.applyMatrix4(frame);
    if (upper) {
      // The intake stem's retainer reaches ~8 mm off the axis and the rail is
      // only 8.6 mm wide there, so a clearance tube breaks the ring. Weld a
      // bridge outside the rail first, then cut 2.9 mm past that retainer.
      const inv = frame.clone().invert();
      const bridges: THREE.BufferGeometry[] = [];
      for (const c of cyls) {
        let best: THREE.Vector3 | null = null;
        let bestDz = 99;
        for (let a = 70; a <= valveLen(1); a += 2) {
          const loc = headToEngine(c, stemPointLocal(1, a)).applyMatrix4(inv);
          const dz = Math.abs(loc.z + 1.6);
          if (dz < bestDz) { bestDz = dz; best = loc; }
        }
        if (!best || bestDz > 4) continue;
        const sgn = Math.sign(best.x) || 1;
        const xOut = sgn * (Math.abs(best.x) + STEM_R + 6.5 + 8);
        const box = boxMM(
          [Math.min(best.x, xOut), best.y - 18, -2.95],
          [Math.max(best.x, xOut), best.y + 18, -0.9],
        );
        box.applyMatrix4(frame);
        bridges.push(box);
      }
      if (bridges.length) g = manifoldAdd(g, ...bridges);
      const cuts = cyls.map((c) => {
        const a = headToEngine(c, stemPointLocal(1, 50));
        const b = headToEngine(c, stemPointLocal(1, valveLen(1)));
        return cylBetween([a.x, a.y, a.z], [b.x, b.y, b.z], STEM_R + 6.5, 16);
      });
      g = manifoldSub(g, ...cuts);
    }
    orientLandOutward(g, frame);
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
  cutClosed(host.g, ...bores);
  p.g.add(host.g);
}
/**
 * Housing clearance for the rocker arm, shoe and hub. The shaft itself is kept:
 * a cylinder at the shaft radius is subtracted from each cutter so the tower bore
 * still closes around the shaft.
 */
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
    // Eye side. The pad blobs miss the adjuster arm, which clips the bay wall.
    for (let i = 1; i <= 4; i++) {
      const t = i / 5;
      const blob = yToZ(cyl(14, 28, 12));
      blob.translate(lay.P.x + (lay.ball.x - lay.P.x) * t, lay.P.y + (lay.ball.y - lay.P.y) * t, lay.z);
      cuts.push(blob);
    }
    // Adjuster screw and locknut. The pad-line blobs miss the boss, which sits beside the stem.
    const pose = trainPose(st.cyl, st.side, ASSEMBLED_CRANK);
    const rootW = rot2(adjusterBoss(lay), lay.ang + pose.beta).add(lay.P);
    const centerW = ballCenterWorld(lay, pose.beta);
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const blob = yToZ(cyl(8, 18, 10));
      blob.translate(rootW.x + (centerW.x - rootW.x) * t, rootW.y + (centerW.y - rootW.y) * t, lay.z);
      cuts.push(blob);
    }
    // Shoe back at the nose sits outside the line bore. Open that band only, not the journals.
    // The watertight ray starts 28 mm outboard of the cam (z = ±40). Keep the
    // outboard side of that point, past the cutter, so the wall stays one piece.
    // A full disk there also fills the shoe.
    let lobeRoom = yToZ(cyl(PEAK_R + 12, PAD_W + 8, 16));
    lobeRoom.translate(lay.C.x, lay.C.y, lay.z);
    const sampleZ = lay.s * 40;
    if (Math.abs(lay.z - sampleZ) < (PAD_W + 8) / 2 + 2) {
      const sampleX = lay.C.x + lay.s * 28;
      const xIn = sampleX - lay.s * 1.2;
      const xOut = sampleX + lay.s * 12;
      const keep = boxMM(
        [Math.min(xIn, xOut), -5, sampleZ - 8],
        [Math.max(xIn, xOut), 5, sampleZ + 8],
      );
      lobeRoom = manifoldSub(lobeRoom, keep);
    }
    cuts.push(lobeRoom);
    // Shaft body, stopped short of the spot faces. The bore was 0.25 mm over
    // the shaft, which the 1 mm erosion closes.
    const body = yToZ(cyl(SHAFT.r + 2.6, (SHAFT.half - 4 + 1.6) * 2, 20));
    body.translate(lay.P.x, lay.P.y, lay.z);
    cuts.push(body);
    // Hub. The boolean pocket is unreliable on the mirrored bank, so the boss
    // bay is opened here. Stop short of the cast towers (they start 0.5 mm
    // past the boss) so this cut does not take the shaft bore with it.
    // Hub disc is r 12.4 out to ±bossHalf. The cam-side rail is 7 mm from the
    // shaft, so the disc ends in that rail. Keep the cutter cap 2.7 mm past
    // the face (erosion is 1 mm a side) and stop short of the tower at +3.8.
    const hub = yToZ(cyl(SHAFT.bossR + 3.6, SHAFT.bossHalf * 2 + 5.4, 16));
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
    const { P, z, ang } = lay;
    const beta = pose.beta;
    const outline = rockerOutline(lay);
    const keep = () => yToZ(cyl(SHAFT.r + 0.4, 90, 16));
    const arm = manifoldSub(extrudeC(polyShape(starOutline(grow(outline, 7.0))), PAD_W + 8, 0, 2), keep());
    cuts.push(placeRocker(arm, ang, beta, P, z));
    const hub = manifoldSub(
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
 * ribs stay closed. The upper lid then gets the three plug openings.
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
/**
 * Exhaust stems cross the head-side rail of the lower cover and the cam-housing
 * land. A clearance cylinder along that stretch; the intake stem stays in the bay.
 */
function exhaustStemCuts(s: 1 | -1): THREE.BufferGeometry[] {
  const cyls = s > 0 ? [1, 2, 3] : [4, 5, 6];
  return cyls.map((c) => {
    const a = headToEngine(c, stemPointLocal(-1, 48));
    const b = headToEngine(c, stemPointLocal(-1, valveLen(-1)));
    return cylBetween([a.x, a.y, a.z], [b.x, b.y, b.z], 13, 16);
  });
}
/**
 * Interior pocket for the exhaust adjuster through the whole cam cycle.
 * Each cutter is a sphere around the ball, the locknut or the screw at one
 * rocker angle. It is shifted back along the cover normal if it would break
 * the outer skin (local z ≈ 22) or the ribs (z ≈ 24).
 */
function adjusterSweepCuts(s: 1 | -1): THREE.BufferGeometry[] {
  const frame = coverMatrix(s, false);
  const inv = frame.clone().invert();
  const axis = new THREE.Vector3().setFromMatrixColumn(frame, 2);
  const cyls = s > 0 ? [1, 2, 3] : [4, 5, 6];
  const cuts: THREE.BufferGeometry[] = [];
  /** Outer skin is local z ≈ 22. Stay under it so the pan outline does not change. */
  const SKIN = 21.0;
  // 1 mm past the hex corner. Eight samples left a gap between stations; the
  // corner swings farther from the shaft than the ball, so the steps are fine.
  const PAD = 1.2;
  const keep = (g: THREE.BufferGeometry) => {
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    const centre = bb.getCenter(new THREE.Vector3());
    const reach = bb.getSize(new THREE.Vector3()).length() * 0.5;
    const lz = centre.clone().applyMatrix4(inv).z;
    if (lz - reach >= SKIN) return;
    if (lz + reach > SKIN) {
      const shift = lz + reach - SKIN;
      g.translate(-axis.x * shift, -axis.y * shift, -axis.z * shift);
    }
    cuts.push(g);
  };
  for (const c of cyls) {
    const lay = rockerLayout(c, -1);
    let bMin = 0, bMax = 0;
    for (let crank = 0; crank < 720; crank += 3) {
      const b = trainPose(c, -1, crank).beta;
      if (b < bMin) bMin = b;
      if (b > bMax) bMax = b;
    }
    const steps = 24;
    for (let i = 0; i <= steps; i++) {
      const beta = bMin + (bMax - bMin) * (i / steps);
      const bossL = adjusterBoss(lay);
      const centerL = rot2(ballCenterWorld(lay, beta).sub(lay.P), -(lay.ang + beta));
      const nutC = bossL.clone().lerp(centerL, 0.22);
      const ball = new THREE.SphereGeometry(BALL_R + PAD, 12, 8);
      ball.translate(centerL.x, centerL.y, 0);
      const nut = new THREE.SphereGeometry(10 / Math.sqrt(3) + PAD, 10, 8);
      nut.translate(nutC.x, nutC.y, 0);
      const mid = bossL.clone().lerp(centerL, 0.55);
      const screw = new THREE.SphereGeometry(2.6 + PAD, 8, 6);
      screw.translate(mid.x, mid.y, 0);
      for (const g of [ball, nut, screw]) keep(placeRocker(g, lay.ang, beta, lay.P, lay.z));
    }
  }
  return cuts;
}
export function pocketValveCover(root: THREE.Object3D, s: 1 | -1, upper: boolean) {
  flattenWorld(root);
  // Main's pan. No rocker-clearance box on the roof.
  const frame = coverMatrix(s, upper);
  // The stud bore is already in the cover (valveCover). Cutting it again leaves
  // a zero-area sliver on the ear top, and the nut probe reads that as the seat.
  // Boolean scraps from the lip hang below the seat and into the housing.
  // Drop everything under the gasket. The lip itself stays at z ≥ 0.
  // The gasket occupies cover-local z −0.45..−0.05. Keep the cover above it.
  const under = boxMM([-140, -260, -90], [140, 260, -0.02]);
  under.applyMatrix4(frame);
  const cuts: THREE.BufferGeometry[] = [under];
  // The chain-end stud (engine z ≈ 220, axis +Z) embeds back through the pulley
  // end of the upper cover. Open that end around the stud. The side rails are
  // untouched: the cut is only the existing sprocket-end notch, widened in x.
  if (upper) {
    const end = boxMM([-24, 168, -4], [24, 220, 12]);
    end.applyMatrix4(frame);
    cuts.push(end);
  }
  if (!upper) {
    // The Ø6.4 ball sits on the exhaust tip, in the corner where the head-side
    // wall meets the roof. The wall there is about 4 mm thick.
    const cyls = s > 0 ? [1, 2, 3] : [4, 5, 6];
    // The rounded stem tip meets a thin spot in the head-side wall. Bore 0.8 mm
    // past the stem radius and 1.6 mm past the tip. The wall stays closed.
    for (const c of cyls) {
      const tip = headToEngine(c, stemPointLocal(-1, valveLen(-1)));
      const stem = stemDirEngine(c, -1);
      const end = tip.clone().addScaledVector(stem, 1.6);
      cuts.push(cylBetween(
        [tip.x - stem.x * 2, tip.y - stem.y * 2, tip.z - stem.z * 2],
        [end.x, end.y, end.z],
        STEM_R + 0.8, 16,
      ));
    }
    // Screw, ball and locknut sweep an arc as the rocker opens. A pocket only at
    // the assembled angle and at peak lift leaves the stack kissing the shell
    // in between. Cut 0.7 mm past each of them along that arc, and stop the
    // cutter under the outer skin so the ribs and the pan outline stay.
    cuts.push(...adjusterSweepCuts(s));
  }
  if (!upper && s < 0) {
    cuts.push(...exhaustStemCuts(s));
    // Cylinder 6's exhaust rocker crosses the seal lip (local z 0..0.4, y about −181).
    // Hollow that lip from the inside. Stop short of the outer end face (local y −186)
    // and under the outer skin so the flywheel end matches the right cover and the pan
    // stays one shell.
    const endPocket = boxMM([-20, -184.2, -1], [24, -148, 21]);
    endPocket.applyMatrix4(frame);
    cuts.push(endPocket);
  } else if (!upper) cuts.push(...exhaustStemCuts(s));
  if (cuts.length) cutClosed(root, ...cuts);
  if (upper) addPlugOpenings(root, s);
  // The underside cap from the seat trim sometimes points up. Erosion then
  // walks that face down into the gasket. Point it out of the metal.
  fixUndersideNormals(root, s, upper);
  return root;
}
function fixUndersideNormals(root: THREE.Object3D, s: 1 | -1, upper: boolean) {
  const frame = coverMatrix(s, upper);
  const inv = frame.clone().invert();
  const axis = new THREE.Vector3().setFromMatrixColumn(frame, 2);
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry.attributes.normal) return;
    const P = mesh.geometry.attributes.position;
    const N = mesh.geometry.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(inv);
      if (v.z > 2) continue;
      n.fromBufferAttribute(N, i);
      if (n.dot(axis) > 0.2) N.setXYZ(i, -n.x, -n.y, -n.z);
    }
  });
}
/**
 * Cover-local point where the plug axis crosses the cover plane at local z.
 * The cover normal has no Z component, so every cylinder on a bank meets a
 * given z at the same distance along the bore. Cylinder 6's crossing is past
 * the flywheel end of the rail.
 */
export function plugCoverLocal(cyl: number, z: number): THREE.Vector3 {
  const s: 1 | -1 = cyl <= 3 ? 1 : -1;
  const tip = new THREE.Vector3(...plugTipEngine(cyl));
  const axis = new THREE.Vector3(...plugAxisEngine(cyl));
  const frame = coverMatrix(s, true);
  const origin = new THREE.Vector3().setFromMatrixPosition(frame);
  const n = new THREE.Vector3().setFromMatrixColumn(frame, 2);
  const t = (z - tip.clone().sub(origin).dot(n)) / axis.dot(n);
  return tip.clone().addScaledVector(axis, t).applyMatrix4(frame.clone().invert());
}
/**
 * Three plug openings in the upper lid. Two are round holes one cylinder pitch
 * apart, each with a cast collar. The third is a half-round scallop in the end
 * wall (pulley end on the right, flywheel end on the left), not a ring on a lug.
 * The bore cut stays on the plug axis. The lower lid is not cut.
 */
function addPlugOpenings(root: THREE.Object3D, s: 1 | -1) {
  const cyls = s > 0 ? [1, 2, 3] : [4, 5, 6];
  const collarR = 18;
  const extra = new Part();
  const cuts: THREE.BufferGeometry[] = [];
  const frame = coverMatrix(s, true);
  const halfL = (CH_Z1 - CH_Z0 - 8) / 2;
  for (const c of cyls) {
    const tip = new THREE.Vector3(...plugTipEngine(c));
    const axis = new THREE.Vector3(...plugAxisEngine(c));
    const at = (z: number) => plugCoverLocal(c, z).applyMatrix4(frame);
    const loc = plugCoverLocal(c, 8);
    const atEnd = Math.abs(loc.y) + SPARK_HOLE_R > halfL - 6;
    const cutA = at(-2);
    const cutB = at(36);
    cuts.push(cylBetween([cutA.x, cutA.y, cutA.z], [cutB.x, cutB.y, cutB.z], SPARK_HOLE_R, 48));
    if (atEnd) {
      // Half-round scallop in the end wall. A full collar here is a ring on a lug.
      const endY = Math.sign(loc.y) * halfL;
      const scallop = yToZ(cyl(SPARK_HOLE_R, 48, 48));
      scallop.translate(loc.x, endY, 12);
      scallop.applyMatrix4(frame);
      cuts.push(scallop);
    } else {
      const a = at(2.2);
      const b = at(24);
      extra.add(cylBetween([a.x, a.y, a.z], [b.x, b.y, b.z], collarR, 36), 'castAlu');
    }
  }
  root.add(extra.g);
  cutClosed(root, ...cuts);
  // The collar reaches the cam-side studs. Keep the nut face (local z 7) clear
  // out to the washer probe, or those nuts sit in the collar.
  const nutClear: THREE.BufferGeometry[] = [];
  for (const st of vcStuds(true, s)) {
    const g = yToZ(cyl(7.6, 28, 20));
    g.translate(st.x, st.y, 7.3 + 14);
    g.applyMatrix4(frame);
    nutClear.push(g);
  }
  cutClosed(root, ...nutClear);
  flipCoverHoleNormals(root, s);
}
/** Hole-wall normals must point into the bore so erosion moves the seat off the seal flange. */
function flipCoverHoleNormals(root: THREE.Object3D, s: 1 | -1) {
  const cyls = s > 0 ? [1, 2, 3] : [4, 5, 6];
  const bores = cyls.map((c) => ({
    tip: new THREE.Vector3(...plugTipEngine(c)),
    axis: new THREE.Vector3(...plugAxisEngine(c)),
  }));
  const v = new THREE.Vector3(), radial = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (!mesh.geometry.attributes.normal) mesh.geometry.computeVertexNormals();
    const P = mesh.geometry.attributes.position, N = mesh.geometry.attributes.normal;
    const nm = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    const inv = nm.clone().invert();
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(mesh.matrixWorld);
      for (const b of bores) {
        const rel = v.clone().sub(b.tip);
        const t = rel.dot(b.axis);
        radial.copy(rel).addScaledVector(b.axis, -t);
        const r = radial.length();
        // Wall of the machined hole. Force the normal at the axis so erosion
        // walks the seat off the seal flange, whatever the boolean winding did.
        if (t > 100 && t < 175 && Math.abs(r - SPARK_HOLE_R) < 2.2) {
          radial.negate().normalize().applyMatrix3(inv);
          N.setXYZ(i, radial.x, radial.y, radial.z);
          break;
        }
      }
    }
  });
}
/** Valve head in engine space at `crank`, for the piston-clearance sweep. */
export function valveHeadEngine(cyl: number, side: 1 | -1, crank: number): THREE.BufferGeometry {
  const pose = trainPose(cyl, side, crank);
  const dir = stemDirLocal(side);
  const face = stemPointLocal(side, 0).addScaledVector(dir, -pose.lift);
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
/**
 * Chain-end seat the cover gasket closes. The face is the gasket plane (z ≥ 212 on the left,
 * the housing end). No lip enters the cover. Bosses take the M6×25 screws.
 */
function camChainSeat(p: Part, s: 1 | -1) {
  const stack = camNoseStack(s);
  const cx = CAM_X * s;
  const face = stack.gasket0;
  const C = CAM_COVER;
  if (s > 0) {
    const z0 = 210.8;
    const h = Math.max(1, face - 2.6 - z0);
    p.add(yToZ(closedLathe([[19, 0], [26, 0], [26, h], [19, h]], 28)).translate(cx, 0, z0), 'castAlu');
  }
  p.add(yToZ(closedLathe([
    [C.boreR + 1, 0], [C.seatFaceR, 0], [C.seatFaceR, 2.6], [C.boreR + 1, 2.6],
  ], 40)).translate(cx, 0, face - 2.6), 'machinedAlu');
  const zBoss = Math.min(stack.cover1 - 26, face - 6);
  for (const deg of camCoverAngles(s)) {
    const b = camCoverBolt(s, deg);
    const h = face - zBoss;
    p.add(yToZ(cyl(5.2, h, 14)).translate(b.x, b.y, zBoss + h / 2), 'castAlu');
  }
}