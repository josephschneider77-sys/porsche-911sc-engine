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
  extrude, extrudeC, hexNut, tube, csgSub, woodruffGeom,
} from './util';
import { CAM_X, CAM_HOUSING_OUT_X, CYL_Z, CYL_TOP_X, HEAD_OUT_X } from '../data/layout';
import { HEAD_HW } from './hwLayout';
import { CH_Z0, CH_Z1, VC_EARS, CAM_NOSE, CHAIN_Z, bankZ } from './core';
import type { MatKey } from './materials';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Assembled crank angle the static meshes are built at (cylinder 1 at firing TDC). */
export const ASSEMBLED_CRANK = 0;

/**
 * Cam profile. Peak radius is held under the journal radius so the shaft can slide in through the
 * line-bored housing. Numbers not taken from Dempsey are marked in the spec.
 */
export const CAM = {
  journalR: 23.35, // Ø46.7
  boreR: 23.55, // Ø47.1 housing bore
  baseR: 15.2, // heel, clearly under the nose
  lift: 7.0, // peak = 22.2 < journalR
  noseArc: 0.34, // rad (~19°) of the peaked nose
  noseDrop: 3.2, // mm the radius falls across that nose, before the flank
  flank: 1.08, // rad of ramp from the nose shoulder down to the base circle
  journalW: 16,
  lobeW: 10.5,
  shankR: 18.6, // Ø37.2 cast shank, about 0.80 × the journal — stout, still under the bore
  grooveR: 15.0, // ground relief between an intake/exhaust pair
  webZ0: 18,
};
/** Rocker shaft 901.105.342.04 and the screw/nut seats. Spot faces sit just outside the arm boss. */
export const SHAFT = { r: 9, boreR: 4.15, half: 17, bossR: 12.6, bossHalf: 11 };
export const LASH = 0.10;
export const PAD_ARM_R = 45; // pivot distance from the cam axis — longer pad arm, shorter adjuster arm
const LOBE_DZ = 7; // intake / exhaust offset along the cam, matching the valve spacing
const VALVE_LEN = 112;
const STEM_R = 4.5;
const ANGLE = { in: 28 * DEG, ex: 32 * DEG };
const INSTALLED = 34.5; // spring seat to retainer, closed
const TIP_STICK = 3.4; // stem tip proud of the keeper
const GUIDE_Y0 = 22;
const GUIDE_Y1 = 64; // along the stem from the valve face

/** Firing TDC on the 720° cycle (opposite cylinders are 360° apart). */
export const FIRE_CRANK: Record<number, number> = { 1: 0, 6: 120, 2: 240, 4: 360, 3: 480, 5: 600 };
/** Crank degrees after firing TDC at which the lobe nose points at the rocker pad. */
const PEAK_CRANK = { in: 450, ex: 270 };

/**
 * Radial cam: base circle, a short flank, and a circular nose.
 * The nose is a circle of radius `noseR` whose tip is at base+lift, so the silhouette
 * is a round heel with a distinct peak rather than a near-concentric egg.
 */
export function lobeRadius(angFromNose: number): number {
  let a = Math.abs(angFromNose) % (Math.PI * 2);
  if (a > Math.PI) a = Math.PI * 2 - a;
  const Rp = CAM.baseR + CAM.lift;
  const aNose = CAM.noseArc;
  const aEnd = aNose + CAM.flank;
  if (a >= aEnd) return CAM.baseR;
  if (a <= aNose) {
    // Peaked nose: most of the lift is still on at the tip and has fallen off by the shoulder.
    const t = a / aNose;
    return Rp - CAM.noseDrop * Math.sin((t * Math.PI) / 2);
  }
  const t = (a - aNose) / CAM.flank;
  const s = t * t * (3 - 2 * t);
  const shoulder = Rp - CAM.noseDrop;
  return shoulder + (CAM.baseR - shoulder) * s;
}
export const PEAK_R = lobeRadius(0);

export function camWebZ(s: 1 | -1): number[] {
  const zs = bankZ(s).slice().sort((a, b) => a - b);
  return [CH_Z0 + CAM.webZ0, (zs[0] + zs[1]) / 2, (zs[1] + zs[2]) / 2, CH_Z1 - 16];
}

const sideOf = (which: 'in' | 'ex'): 1 | -1 => (which === 'in' ? 1 : -1);
function whichOf(side: 1 | -1): 'in' | 'ex' { return side > 0 ? 'in' : 'ex'; }

/** Stem unit vector in the head frame, pointing from the seat toward the tip. */
function stemDirLocal(side: 1 | -1): THREE.Vector3 {
  const a = side > 0 ? ANGLE.in : ANGLE.ex;
  return V(Math.cos(a), side * Math.sin(a), 0);
}
/** Head-local point on the seated valve, `y` mm from the face along the stem. */
function stemPointLocal(side: 1 | -1, y: number): THREE.Vector3 {
  const localZ = side > 0 ? -LOBE_DZ : LOBE_DZ;
  const well = V(56, side * 38, localZ);
  const atGuide = 58;
  return stemDirLocal(side).multiplyScalar(y - atGuide).add(well);
}
function bankSign(cyl: number): 1 | -1 { return cyl <= 3 ? 1 : -1; }
/** Head-local point → engine frame (left heads are turned 180° about Y). */
export function headToEngine(cyl: number, p: THREE.Vector3): THREE.Vector3 {
  const s = bankSign(cyl);
  return V(s * CYL_TOP_X + s * p.x, p.y, CYL_Z[cyl] + s * p.z);
}
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
  z: number; stem: THREE.Vector2; padAng: number;
}
/** Closed-valve layout: pad on the base circle, ball LASH mm short of the stem tip, pivot PAD_ARM_R from the cam. */
export function rockerLayout(cyl: number, side: 1 | -1): RockerLayout {
  const s = bankSign(cyl);
  const tipE = valveTipEngine(cyl, side, 0);
  const C = new THREE.Vector2(s * CAM_X, 0);
  const tip = new THREE.Vector2(tipE.x, tipE.y);
  const u = tip.clone().sub(C);
  if (u.lengthSq() < 1) u.set(s, 0);
  u.normalize();
  const P = C.clone().addScaledVector(u, PAD_ARM_R);
  const K = C.clone().addScaledVector(u, CAM.baseR);
  const stem = stemDirEngine(cyl, side);
  const stem2 = new THREE.Vector2(stem.x, stem.y).normalize();
  const ball = tip.clone().addScaledVector(stem2, -LASH);
  return { cyl, side, s, C, P, K, tip, ball, z: tipE.z, stem: stem2, padAng: Math.atan2(u.y, u.x) };
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
    fixed(lathe([[STEM_R + 0.8, 0], [12.2, 0], [12.2, 0.6], [STEM_R + 0.8, 0.6]], 24), seatY - 0.7, 'polishedSteel');
    fixed(lathe([[STEM_R + 0.7, 0], [11.6, 0], [11.6, 1.3], [STEM_R + 0.7, 1.3]], 24), seatY - 0.15, 'steel');
    const yRet = seatY + INSTALLED - pose.lift;
    const ySpring0 = seatY + 1.15;
    // Outer is the heavy dark helix with damper coils at the head end. Inner is a lighter,
    // brighter helix on a smaller radius so the two wires don't merge into one coil.
    // Outer centre Ø20 (wire to Ø11.6) stays inside the cam-housing stud-nut clearance.
    fixed(springVar(10.0, 1.55, ySpring0, yRet, 5.2, 0.24, 0.4), 0, 'darkSteel');
    fixed(springVar(6.05, 0.92, ySpring0 + 0.5, yRet - 0.45, 8.0, 0, 1.7), 0, 'steel');
    // stepped retainer (#14)
    moving(lathe([
      [4.6, 0.4], [11.4, 0.4], [11.4, 1.8], [9.4, 1.8], [9.4, 3.0], [7.6, 3.0],
      [7.6, 4.0], [6.2, 5.2], [5.2, 6.6], [4.4, 6.6], [4.4, 1.1], [4.6, 0.4],
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
function aboutPivot(g: THREE.BufferGeometry, P: THREE.Vector2, z: number, beta: number) {
  g.translate(-P.x, -P.y, z);
  g.rotateZ(beta);
  g.translate(P.x, P.y, 0);
  return g;
}
/** Centreline ribbon: outer points, left side then right side reversed. */
function ribbon(center: THREE.Vector2[], halfW: number[]): [number, number][] {
  const L: THREE.Vector2[] = [], R: THREE.Vector2[] = [];
  for (let i = 0; i < center.length; i++) {
    const prev = center[Math.max(0, i - 1)], next = center[Math.min(center.length - 1, i + 1)];
    const t = next.clone().sub(prev);
    const len = t.length() || 1;
    const n = new THREE.Vector2(-t.y / len, t.x / len);
    L.push(center[i].clone().addScaledVector(n, halfW[i]));
    R.push(center[i].clone().addScaledVector(n, -halfW[i]));
  }
  return [...L, ...R.reverse()].map((q) => [q.x, q.y]);
}
function bezier(a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2, n = 14) {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push(a.clone().multiplyScalar(u * u).add(c.clone().multiplyScalar(2 * u * t)).add(b.clone().multiplyScalar(t * t)));
  }
  return pts;
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
  const shell = csgSub(outer, bore, ...slots);
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
/** Slightly crowned follower pad. The crown sits on the base circle at K; the face curves away from the cam. */
function padGeom(C: THREE.Vector2, K: THREE.Vector2, radial: THREE.Vector2) {
  const Rf = 26;
  const faceC = K.clone().addScaledVector(radial, Rf);
  const span = 0.46;
  const baseAng = Math.atan2(K.y - faceC.y, K.x - faceC.x);
  const thick = 6.6;
  const steps = 8;
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = baseAng - span / 2 + (span * i) / steps;
    pts.push([faceC.x + Math.cos(a) * Rf, faceC.y + Math.sin(a) * Rf]);
  }
  for (let i = steps; i >= 0; i--) {
    const a = baseAng - span / 2 + (span * i) / steps;
    pts.push([faceC.x + Math.cos(a) * (Rf + thick), faceC.y + Math.sin(a) * (Rf + thick)]);
  }
  return extrudeC(polyShape(pts), 14.5, 0.4, 3);
}
export function rockers(s: 1 | -1) {
  const p = new Part();
  const ballR = 3.2;
  const eyeLen = 8.2;
  for (const st of rockerStations(s)) {
    const pose = trainPose(st.cyl, st.side, ASSEMBLED_CRANK);
    const { P, K, C, ball, z, stem } = pose.lay;
    const beta = pose.beta;
    const radial = K.clone().sub(C);
    if (radial.lengthSq() < 1) radial.set(1, 0);
    radial.normalize();
    // Ball surface is LASH mm off the stem tip. The centre sits one radius back along the stem.
    const ballCenter = ball.clone().addScaledVector(stem, -ballR);
    const eyeCenter = ballCenter.clone().addScaledVector(stem, -(ballR * 0.15 + 1.4 + eyeLen / 2));
    const padBack = K.clone().addScaledVector(radial, 6.2);
    const chord = eyeCenter.clone().sub(padBack);
    const sideN = new THREE.Vector2(-chord.y, chord.x);
    if (sideN.lengthSq() > 1e-6) sideN.normalize();
    const mid = padBack.clone().add(eyeCenter).multiplyScalar(0.5);
    if (sideN.dot(mid.clone().sub(C)) < 0) sideN.negate();
    const ctrl = mid.clone().addScaledVector(sideN, 7.2);
    const center = bezier(padBack, eyeCenter, ctrl, 16);
    const hw = center.map((_, i) => 3.15 + 2.55 * Math.sin((i / (center.length - 1)) * Math.PI));
    const outerPts = ribbon(center, hw);
    const innerPts = ribbon(center, hw.map((w) => Math.max(1.15, w - 1.6)));
    const flangeShape = polyShape(outerPts);
    const hole = new THREE.Path();
    hole.moveTo(innerPts[0][0], innerPts[0][1]);
    for (let i = 1; i < innerPts.length; i++) hole.lineTo(innerPts[i][0], innerPts[i][1]);
    hole.closePath();
    flangeShape.holes.push(hole);
    // I-beam: full-thickness flange around a thinner web.
    p.add(aboutPivot(extrudeC(flangeShape, 7.6, 0.28, 2), P, z, beta), 'forgedSteel');
    p.add(aboutPivot(extrudeC(polyShape(innerPts), 3.15, 0, 2), P, z, beta), 'forgedSteel');
    p.add(aboutPivot(padGeom(C, K, radial), P, z, beta), 'polishedSteel');
    const bh = SHAFT.bossHalf;
    const bush = yToZ(lathe([
      [SHAFT.r + 0.12, -(bh - 2.4)], [SHAFT.r + 1.85, -(bh - 2.4)],
      [SHAFT.r + 1.85, bh - 2.4], [SHAFT.r + 0.12, bh - 2.4],
    ], 20));
    bush.translate(P.x, P.y, z);
    p.add(bush, 'bronze');
    const boss = yToZ(lathe([
      [SHAFT.r + 1.7, -bh], [12.4, -bh], [13.6, -(bh - 2.2)],
      [13.6, bh - 2.2], [12.4, bh], [SHAFT.r + 1.7, bh],
    ], 22));
    boss.translate(P.x, P.y, z);
    p.add(boss, 'forgedSteel');
    // oil hole on the boss flank
    const oilDir = new THREE.Vector2(-radial.y, radial.x);
    const oil = cylBetween(
      [P.x + oilDir.x * 8, P.y + oilDir.y * 8, z],
      [P.x + oilDir.x * 14.2, P.y + oilDir.y * 14.2, z],
      1.15, 8,
    );
    p.add(aboutPivot(oil, P, z, beta), 'bore');
    // threaded eye, screw, ball and M8 locknut. The nut bears on the eye face opposite the ball.
    const eyeBack = eyeCenter.clone().addScaledVector(stem, -eyeLen / 2);
    const eyeFront = eyeCenter.clone().addScaledVector(stem, eyeLen / 2 - 0.4);
    const eye = cylBetween([eyeBack.x, eyeBack.y, z], [eyeFront.x, eyeFront.y, z], 6.1, 14);
    p.add(aboutPivot(eye, P, 0, beta), 'forgedSteel');
    const screwTail = eyeBack.clone().addScaledVector(stem, -1.2);
    const screw = cylBetween([screwTail.x, screwTail.y, z], [ballCenter.x, ballCenter.y, z], 4.0, 12);
    p.add(aboutPivot(screw, P, 0, beta), 'steel');
    const ballGeo = new THREE.SphereGeometry(ballR, 14, 10);
    ballGeo.translate(ballCenter.x, ballCenter.y, z);
    p.add(aboutPivot(ballGeo, P, 0, beta), 'polishedSteel');
    const nut = hexNut(13, 5);
    const ax = new THREE.Vector3(stem.x, stem.y, 0).normalize();
    nut.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), ax));
    const nutC = eyeBack.clone().addScaledVector(stem, -2.6);
    nut.translate(nutC.x, nutC.y, z);
    p.add(aboutPivot(nut, P, 0, beta), 'darkSteel');
    addShaft(p, P.x, P.y, z);
  }
  return p.g;
}

// ---------------------------------------------------------------- camshaft
function lobeGeom() {
  const n = 72;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = lobeRadius(a);
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return extrudeC(polyShape(pts), CAM.lobeW, 0.15, 4);
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
    p.add(yToZ(cyl(CAM.grooveR, 2.6, 16)), 'polishedSteel', [X, 0, zg]);
    blocks.push({ z0: zg - 1.3, z1: zg + 1.3 });
    for (const side of [1, -1] as const) lobeZs.push(rockerLayout(c, side).z);
  }
  for (const zl of lobeZs) blocks.push({ z0: zl - CAM.lobeW / 2 - 0.3, z1: zl + CAM.lobeW / 2 + 0.3 });
  // nose stack starts at the thrust shoulder; keep the cast shank inboard of it
  const noseZ = CHAIN_Z[s] + CAM_NOSE.flange[0] - 6;
  blocks.push({ z0: noseZ, z1: noseZ + 80 });
  blocks.sort((a, b) => a.z0 - b.z0);
  let cursor = z0;
  const castSpans: [number, number][] = [];
  for (const b of blocks) {
    if (b.z0 > cursor + 1.5) castSpans.push([cursor, b.z0]);
    cursor = Math.max(cursor, b.z1);
  }
  for (const [a, b] of castSpans) p.add(yToZ(cyl(CAM.shankR, b - a, 20)), 'forgedDark', [X, 0, (a + b) / 2]);
  // part-number pad on the longest cast span
  const padSpan = castSpans.slice().sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0];
  if (padSpan && padSpan[1] - padSpan[0] > 16) {
    const zc = (padSpan[0] + padSpan[1]) / 2;
    p.add(boxMM([X + s * (CAM.shankR - 0.5), -3.6, zc - 9], [X + s * (CAM.shankR + 1.2), 3.6, zc + 8]), 'forgedDark');
  }
  for (const c of (s > 0 ? [1, 2, 3] : [4, 5, 6])) {
    for (const side of [1, -1] as const) {
      const lay = rockerLayout(c, side);
      const fromPeak = ((ASSEMBLED_CRANK - (FIRE_CRANK[c] + PEAK_CRANK[whichOf(side)])) / 2) * DEG;
      const beta = rockerBeta(lay, lobeRadius(fromPeak));
      const g = lobeGeom();
      // nose at +X in lobeGeom; rotate so the profile angle under the pad contact is fromPeak
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
function extrudeX(shape: THREE.Shape, x0: number, x1: number, bevel = 0) {
  const depth = Math.abs(x1 - x0);
  const g = extrude(shape, depth, bevel, 6);
  g.rotateY(Math.PI / 2); // (x,y,z) -> (z, y, -x); shape x was -engineZ
  g.translate(Math.min(x0, x1), 0, 0);
  return g;
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
  // Recessed head field. The mating plane is the oval bosses, not this slab, so the face isn't one flat plate.
  const field = shapeZY([[zLo + 3, -72], [zHi - 3, -72], [zHi - 3, 72], [zLo + 3, 72]]);
  for (const c of cyls) {
    const h = new THREE.Path();
    h.absellipse(-CYL_Z[c], 0, 24, 48, 0, Math.PI * 2, true);
    field.holes.push(h);
  }
  p.add(extrudeX(field, X(HEAD_OUT_X + 3.5), X(HEAD_OUT_X + 8.5), 1.4), 'castAlu');
  // One raised boss per cylinder: machined oval land around the spring-well opening.
  for (const c of cyls) {
    const ring = (rz: number, ry: number) => {
      const sh = new THREE.Shape();
      sh.absellipse(-CYL_Z[c], 0, rz + 8, ry + 9, 0, Math.PI * 2, false);
      const h = new THREE.Path();
      h.absellipse(-CYL_Z[c], 0, rz, ry, 0, Math.PI * 2, true);
      sh.holes.push(h);
      return sh;
    };
    p.add(extrudeX(ring(20, 42), X(HEAD_OUT_X), X(HEAD_OUT_X + 2.4), 0), 'machinedAlu');
    p.add(extrudeX(ring(21.5, 44), X(HEAD_OUT_X + 1.6), X(HEAD_OUT_X + 10), 1.1), 'castAlu');
  }
  // Cam-tunnel spine on the head side, running through the middle of the openings. Stays outside the bore.
  {
    const x0 = X(HEAD_OUT_X + 1.2), x1 = X(CAM_X - CAM.boreR - 2.4);
    p.add(boxMM([Math.min(x0, x1), -5.2, zLo + 2], [Math.max(x0, x1), 5.2, zHi - 2]), 'castAlu');
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
  // Outer cam tunnel: thick cast arch, open toward the rockers, with a fillet bevel and external ribs.
  const tunnel = new THREE.Shape();
  const a0 = s > 0 ? -1.35 : Math.PI - 1.35, a1 = s > 0 ? 1.35 : Math.PI + 1.35;
  tunnel.absarc(cx, 0, 36, a0, a1, false);
  tunnel.absarc(cx, 0, 27.2, a1, a0, true);
  p.add(extrude(tunnel, zHi - zLo - 6, 1.5, 18).translate(0, 0, zLo + 3), 'castAlu');
  const ribBase = s > 0 ? 0 : Math.PI;
  for (const ang of [-1.05, -0.55, 0, 0.55, 1.05]) {
    const rib = boxMM([0, -1.7, zLo + 14], [5.2, 1.7, zHi - 14]);
    rib.translate(33.4, 0, 0);
    rib.rotateZ(ribBase + ang);
    rib.translate(cx, 0, 0);
    p.add(rib, 'castAlu');
  }
  // four bearing webs, bore Ø47.1 straight through
  for (const zw of camWebZ(s)) {
    // Bore circle must lie inside the web or the extrude fills the hole. The inboard edge only
    // steps out around the bore — a full-height step hits the case and the head nuts.
    const inn = HEAD_OUT_X + 8, pocket = HEAD_OUT_X + 2, out = CAM_HOUSING_OUT_X - 2;
    const pts: [number, number][] = s > 0
      ? [[inn, -46], [out, -32], [out, 32], [inn, 46], [inn, 30], [pocket, 30], [pocket, -30], [inn, -30]]
      : [[-inn, 46], [-out, 32], [-out, -32], [-inn, -46], [-inn, -30], [-pocket, -30], [-pocket, 30], [-inn, 30]];
    const sh = polyShape(pts);
    sh.holes.push(circlePath(CAM.boreR, cx, 0) as THREE.Path);
    // no bevel: a bevelled hole leaves a skin on the bore and the cam cannot pass
    p.add(extrudeC(sh, 14, 0, 8).translate(0, 0, zw), 'castAlu');
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
      const inn = HEAD_OUT_X + 12, out = CAM_HOUSING_OUT_X - 8;
      for (const ySign of [1, -1]) {
        const yIn = ySign * (CAM.boreR + 4), yOut = ySign * 52;
        const x0 = X(inn), x1 = X(out);
        p.add(boxMM(
          [Math.min(x0, x1), Math.min(yIn, yOut), zc - 3.2],
          [Math.max(x0, x1), Math.max(yIn, yOut), zc + 3.2],
        ), 'castAlu');
      }
    }
  }
  // cover-seat rails and stud bosses — same stations as the valve covers (do not move)
  const zc = (CH_Z0 + CH_Z1) / 2;
  for (const sg of [1, -1]) {
    p.add(boxMM([X(HEAD_OUT_X + 6), sg > 0 ? 62 : -76, CH_Z0], [X(HEAD_OUT_X + 18), sg > 0 ? 76 : -62, CH_Z1]), 'castAlu');
    p.add(boxMM([X(CAM_HOUSING_OUT_X - 16), sg > 0 ? 28 : -36, CH_Z0], [X(CAM_HOUSING_OUT_X - 4), sg > 0 ? 36 : -28, CH_Z1]), 'castAlu');
    // machined cover land on the rail top
    p.add(boxMM([X(HEAD_OUT_X + 8), sg > 0 ? 70 : -74, CH_Z0 + 2], [X(HEAD_OUT_X + 16), sg > 0 ? 75 : -69, CH_Z1 - 2]), 'machinedAlu');
  }
  for (const upper of [true, false]) for (const f of VC_EARS(upper)) {
    const z = zc + f;
    p.add(yToX(cyl(6.5, 12, 14)), 'castAlu', [X(HEAD_OUT_X + 12), upper ? 69 : -69, z]);
    p.add(yToX(cyl(6, 10, 14)), 'castAlu', [X(CAM_HOUSING_OUT_X - 10), upper ? 32 : -32, z]);
  }
  // end faces: flywheel end (cover, stoppers, banjo and temp-switch probes) and pulley end (chain-housing studs)
  // Flywheel-end cap, outboard of the rearmost rocker-shaft nut so that nut stays reachable.
  const cap1 = CH_Z0 - (s < 0 ? 28 : 6);
  const cap0 = cap1 - 8;
  p.add(boxMM([X(HEAD_OUT_X), -72, cap0], [X(CAM_HOUSING_OUT_X - 2), 74, cap1]), 'castAlu');
  p.add(yToZ(lathe([[CAM.boreR, -2], [30, -2], [30, 3], [CAM.boreR, 3]], 28)).translate(cx, 0, (cap0 + cap1) / 2), 'machinedAlu');
  // pulley-end pad for the chain-housing end studs (y ≈ 62). Kept above the cam bore so the shaft can enter from this end.
  p.add(boxMM([X(250), 40, CH_Z1 - 16], [X(330), 78, CH_Z1]), 'castAlu');
  // no full-length external oil line — the photos don't show one; the splash tube and banjo are CoS parts
  return p.g;
}
