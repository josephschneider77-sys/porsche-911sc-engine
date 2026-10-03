/**
 * One crank angle drives every moving part. Ratios are measured from the builders
 * (tooth counts, sprocket pitch radii, belt-cord and pulley-valley meshes), not copied
 * into a second table. See docs/engine-run.md for sources and the disagreements.
 */
import * as THREE from 'three';
import { SPEC, CYL_Z, CAM_X, INT_SHAFT_Y, pinX } from '../data/layout';
import { PART_BY_ID } from '../data/parts';
import {
  CRANK_GEAR_T, DIST_WHEEL_TEETH, INT_GEAR, INT_T, CAM_T, IDLER_T,
  INT_SPROCKET_R, CAM_SPROCKET_R, IDLER_SPROCKET_R, PITCH, CHAIN_Z,
  chainPins, toothPhase, SPROCKET_GAP, tensionerLayout, CRANK_NOSE, clearChainVertex,
} from '../geo/core';
import { FAN, DIST, DIST_AXIS, DIST_PINION_TEETH, crankPulley, fanPulley, fanBelt } from '../geo/aux';
import { AIR_PUMP, airPumpPulley, airPumpBelt } from '../geo/bottomAnc';
import { trainPose, rockerLayout, ASSEMBLED_CRANK, FIRE_CRANK, PEAK_CRANK, valveStemLocal, valveFaceEngine } from '../geo/valvetrain';

const Z_AXIS = new THREE.Vector3(0, 0, 1);
const DEG = Math.PI / 180;

/** Warm idle, workshop spec 900 ± 50 rpm (911 SC, oil ≈ 90 °C). */
export const IDLE_RPM = 900;
/** 1978–79 US SC fuel-pump cutoff, nominal. Later SC years are 6500 ± 200. */
export const REDLINE_RPM = 6700;
export const TACH_MAX_RPM = 7500;
export const RED_ZONE_RPM = 6700;

/** Factory literature turns this crank clockwise at the pulley. This mesh's throws
 *  produce firing order 1-6-2-4-3-5 only while crank angle increases, which is
 *  counter-clockwise when looking at the pulley (right-hand about +Z). The sim follows
 *  the mesh so pistons stay on the pins. It does not mirror the throws. */
export const MODEL_RUNS_CCW_AT_PULLEY = true;

export interface BeltCords {
  crank: number;
  fan: number;
  /** Outer fan groove, the one the air-pump belt rides. */
  fanOuter: number;
  pump: number;
}

export interface DriveGeom {
  /** dθ/dθcrank, right-hand about +Z unless noted. */
  crank: 1;
  intermediate: number;
  cam: number;
  idler: Record<1 | -1, number>;
  fan: number;
  pump: number;
  /** dψ/dθcrank about DIST_AXIS (pinion toward the cap). Rotor is exactly 1/2. */
  rotor: number;
  /** Pinion tooth ratio, sign from no-slip at the mesh. Not equal to the rotor. */
  pinion: number;
  cords: BeltCords;
  /** Crank-pulley groove valley radius at the belt plane. The belt is not built on this. */
  crankValley: number;
  fanValley: number;
  pumpValley: number;
  /**
   * Chain links per crank radian, along chainPins order.
   * One intermediate-sprocket tooth advances the chain by one link, so a roller that
   * is seated stays seated. Straight-run chords differ from the pitch by a fraction
   * of a millimetre, so a constant arc speed would walk the rollers onto the teeth.
   */
  chainLinksPerCrankRad: Record<1 | -1, number>;
  /** Belt cord arc mm per crank radian. */
  fanBeltPerCrankRad: number;
  pumpBeltPerCrankRad: number;
  disagreements: { id: string; detail: string }[];
}

function meshRadii(root: THREE.Object3D, origin: THREE.Vector3, z0: number, z1: number): number[] {
  const out: number[] = [];
  root.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  root.traverse((o: any) => {
    if (!o.isMesh) return;
    const P = o.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld);
      if (v.z < z0 || v.z > z1) continue;
      out.push(Math.hypot(v.x - origin.x, v.y - origin.y));
    }
  });
  return out;
}

function minRadius(root: THREE.Object3D, origin: THREE.Vector3, z0: number, z1: number, floor = 8): number {
  let m = Infinity;
  for (const r of meshRadii(root, origin, z0, z1)) if (r > floor && r < m) m = r;
  return m;
}

/**
 * Belt cord radius at one pulley. The extruded section is a few millimetres deep, so the
 * surface vertices form a band around the path. Straight-run vertices are spread across
 * many radii; the wrap is a dense band. The cord is the mean of that band.
 */
function beltCordRadius(root: THREE.Object3D, origin: THREE.Vector3, other: THREE.Vector3, z: number): number {
  const radii: number[] = [];
  root.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  root.traverse((o: any) => {
    if (!o.isMesh) return;
    const P = o.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld);
      if (Math.abs(v.z - z) > 6) continue;
      const dHere = Math.hypot(v.x - origin.x, v.y - origin.y);
      const dOther = Math.hypot(v.x - other.x, v.y - other.y);
      if (dHere > dOther) continue;
      if (dHere < 15 || dHere > 140) continue;
      radii.push(dHere);
    }
  });
  if (!radii.length) return NaN;
  radii.sort((a, b) => a - b);
  const lo = radii[Math.floor(radii.length * 0.02)];
  const hi = radii[Math.ceil(radii.length * 0.98) - 1];
  let bestR = radii[radii.length >> 1], best = -1;
  for (let R = lo; R <= hi; R += 0.5) {
    let n = 0;
    for (const r of radii) if (Math.abs(r - R) <= 5.5) n++;
    if (n > best) { best = n; bestR = R; }
  }
  let s = 0, c = 0;
  for (const r of radii) if (Math.abs(r - bestR) <= 5.5) { s += r; c++; }
  return c ? s / c : bestR;
}

function measureCords(): BeltCords & { crankValley: number; fanValley: number; fanOuterValley: number; pumpValley: number } {
  const o = new THREE.Vector3();
  const fanO = new THREE.Vector3(0, FAN.y, 0);
  const pumpO = new THREE.Vector3(AIR_PUMP.x, AIR_PUMP.y, 0);
  const crankValley = minRadius(crankPulley(), o, FAN.zBelt - 4, FAN.zBelt + 4, 20);
  const fanValley = minRadius(fanPulley(), fanO, FAN.zBelt - 2, FAN.zBelt + 2, 20);
  const fanOuterValley = minRadius(fanPulley(), fanO, FAN.zPumpBelt - 2, FAN.zPumpBelt + 2, 20);
  const pumpValley = minRadius(airPumpPulley(), pumpO, FAN.zPumpBelt - 3, FAN.zPumpBelt + 3, 20);
  const fanMesh = fanBelt();
  const pumpMesh = airPumpBelt();
  const finite = (measured: number, fallback: number) => (Number.isFinite(measured) && measured > 5 ? measured : fallback);
  const crank = finite(beltCordRadius(fanMesh, o, fanO, FAN.zBelt), FAN.rCrankPulley - 5);
  const fan = finite(beltCordRadius(fanMesh, fanO, o, FAN.zBelt), FAN.rFanPulley - 5);
  const fanOuter = finite(beltCordRadius(pumpMesh, fanO, pumpO, FAN.zPumpBelt), fanOuterValley);
  const pump = finite(beltCordRadius(pumpMesh, pumpO, fanO, FAN.zPumpBelt), 65);
  return {
    crank, fan, fanOuter, pump,
    crankValley, fanValley, fanOuterValley, pumpValley,
  };
}

/** Sign of pinion spin about DIST_AXIS so the pitch-point velocity matches the crank wheel. */
function pinionSign(): number {
  const axis = new THREE.Vector3(...DIST_AXIS).normalize();
  const pinion = new THREE.Vector3(...DIST.pinion);
  const cd = Math.hypot(pinion.x, pinion.y);
  const rc = cd * DIST_WHEEL_TEETH / (DIST_WHEEL_TEETH + DIST_PINION_TEETH);
  const contact = new THREE.Vector3(pinion.x, pinion.y, 0).multiplyScalar(rc / cd);
  contact.z = (CRANK_NOSE.drive[0] + CRANK_NOSE.drive[1]) / 2;
  const vCrank = new THREE.Vector3(0, 0, 1).cross(contact);
  const vUnit = new THREE.Vector3().crossVectors(axis, contact.clone().sub(pinion));
  return Math.sign(vUnit.dot(vCrank)) || 1;
}

interface Poly {
  x: number[]; y: number[]; s: number[]; len: number;
}

function polyOf(pins: THREE.Vector3[]): Poly {
  const x: number[] = [], y: number[] = [], s: number[] = [0];
  for (const p of pins) { x.push(p.x); y.push(p.y); }
  for (let i = 0; i < x.length; i++) {
    const j = (i + 1) % x.length;
    s.push(s[i] + Math.hypot(x[j] - x[i], y[j] - y[i]));
  }
  return { x, y, s, len: s[s.length - 1] };
}

function frameAt(poly: Poly, dist: number): { x: number; y: number; tx: number; ty: number; nx: number; ny: number } {
  const len = poly.len;
  let d = ((dist % len) + len) % len;
  const n = poly.x.length;
  let lo = 0, hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (poly.s[mid] <= d) lo = mid; else hi = mid - 1;
  }
  const i = lo;
  const j = (i + 1) % n;
  const seg = poly.s[i + 1] - poly.s[i] || 1e-9;
  const t = Math.max(0, Math.min(1, (d - poly.s[i]) / seg));
  const tx = (poly.x[j] - poly.x[i]) / seg, ty = (poly.y[j] - poly.y[i]) / seg;
  return {
    x: poly.x[i] + (poly.x[j] - poly.x[i]) * t,
    y: poly.y[i] + (poly.y[j] - poly.y[i]) * t,
    tx, ty, nx: -ty, ny: tx,
  };
}

/**
 * Pin-index increase per radian of counter-clockwise sprocket rotation.
 * Consecutive seated rollers are one tooth apart, so this is 1 / tooth angle.
 */
function linksPerSprocketRad(pins: THREE.Vector3[], cx: number, cy: number, r: number): number {
  const n = pins.length;
  const seated: number[] = [];
  for (let i = 0; i < n; i++) {
    if (Math.abs(Math.hypot(pins[i].x - cx, pins[i].y - cy) - r) < 0.25) seated.push(i);
  }
  if (seated.length < 2) return 1 / r;
  let i0 = seated[0], i1 = seated[1];
  for (let k = 0; k < seated.length; k++) {
    const a = seated[k], b = seated[(k + 1) % seated.length];
    if ((a + 1) % n === b) { i0 = a; i1 = b; break; }
  }
  const a0 = Math.atan2(pins[i0].y - cy, pins[i0].x - cx);
  const a1 = Math.atan2(pins[i1].y - cy, pins[i1].x - cx);
  let da = a1 - a0;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  return Math.abs(da) < 1e-9 ? 1 / r : 1 / da;
}

/** Links along pin order, per crank radian, that keep a roller in its intermediate-sprocket gap. */
function chainLinkRate(s: 1 | -1, ratioInt: number): number {
  return linksPerSprocketRad(chainPins(s).pins, 0, INT_SHAFT_Y, INT_SPROCKET_R) * ratioInt;
}

function idlerRatioFromChain(s: 1 | -1, linksPerCrank: number): number {
  const T = tensionerLayout(s);
  const perRad = linksPerSprocketRad(chainPins(s).pins, T.idler.x, T.idler.y, T.idlerR);
  return Math.abs(perRad) < 1e-9 ? 0 : linksPerCrank / perRad;
}

let cached: DriveGeom | null = null;

export function measureDrive(): DriveGeom {
  if (cached) return cached;
  const cords = measureCords();
  const intermediate = -CRANK_GEAR_T / INT_GEAR.teeth;
  const cam = intermediate * (INT_T / CAM_T);
  const chainLinksPerCrankRad = { 1: chainLinkRate(1, intermediate), [-1]: chainLinkRate(-1, intermediate) } as Record<1 | -1, number>;
  const idler = {
    1: idlerRatioFromChain(1, chainLinksPerCrankRad[1]),
    [-1]: idlerRatioFromChain(-1, chainLinksPerCrankRad[-1]),
  } as Record<1 | -1, number>;
  const fan = cords.crank / cords.fan;
  const pump = fan * (cords.fanOuter / cords.pump);
  const disagreements: { id: string; detail: string }[] = [];
  if (Math.abs(cam + 0.5) > 1e-9) {
    disagreements.push({ id: 'cam-ratio', detail: `Tooth product (crank ${CRANK_GEAR_T} / intermediate ${INT_GEAR.teeth}) × (intermediate sprocket ${INT_T} / cam ${CAM_T}) is ${cam}, not −1/2.` });
  }
  const valleyNote = (id: string, name: string, valley: number, cord: number) => {
    if (Math.abs(valley - cord) <= 1) return;
    disagreements.push({
      id,
      detail: `${name} groove valley measures r ${valley.toFixed(2)} mm at the belt plane. The belt cord, measured on the belt mesh, is r ${cord.toFixed(2)} mm. Surface speed uses the cord. The valley is not widened to hide the gap.`,
    });
  };
  valleyNote('crank-pulley-valley', 'Crank-pulley', cords.crankValley, cords.crank);
  valleyNote('fan-pulley-valley', 'Fan-pulley inner', cords.fanValley, cords.fan);
  valleyNote('fan-outer-valley', 'Fan-pulley outer', cords.fanOuterValley, cords.fanOuter);
  valleyNote('pump-pulley-valley', 'Air-pump pulley', cords.pumpValley, cords.pump);
  const teethRatio = DIST_WHEEL_TEETH / DIST_PINION_TEETH;
  if (Math.abs(teethRatio - 0.5) > 1e-6) {
    disagreements.push({
      id: 'distributor-teeth',
      detail: `Crank distributor wheel is ${DIST_WHEEL_TEETH} T and the pinion is ${DIST_PINION_TEETH} T (${teethRatio.toFixed(4)} : 1). A rotor at half crank speed wants 2 : 1. The rotor is turned at exactly 1/2. The pinion is turned at the tooth ratio so the two gears stay in mesh. On the car they are one shaft.`,
    });
  }
  if ((CRANK_GEAR_T as number) !== 34) {
    disagreements.push({
      id: 'crank-gear-teeth',
      detail: `This model’s crank timing gear is ${CRANK_GEAR_T} T so (35/60)×(24/28) is exactly 1/2. The 964 technical booklet lists a 34 T crank sprocket on the same 60 T intermediate gear, which is not exactly 1/2. The sim uses the teeth in the mesh.`,
    });
  }
  disagreements.push({
    id: 'crank-direction',
    detail: 'Factory running direction is clockwise at the pulley. These throws step 1-6-2-4-3-5 only as the model crank angle increases, which is counter-clockwise looking at the pulley. The sim follows the mesh.',
  });
  disagreements.push({
    id: 'valve-peaks',
    detail: `Lobe noses are aimed ${PEAK_CRANK.in}° crank (intake) and ${PEAK_CRANK.ex}° crank (exhaust) after firing TDC. That is the model’s lobe phase, not a published 930/04 degree-wheel card.`,
  });
  cached = {
    crank: 1,
    intermediate,
    cam,
    idler,
    fan,
    pump,
    rotor: 0.5,
    pinion: pinionSign() * teethRatio,
    cords: { crank: cords.crank, fan: cords.fan, fanOuter: cords.fanOuter, pump: cords.pump },
    crankValley: cords.crankValley,
    fanValley: cords.fanValley,
    pumpValley: cords.pumpValley,
    chainLinksPerCrankRad,
    fanBeltPerCrankRad: cords.crank,
    pumpBeltPerCrankRad: fan * cords.fanOuter,
    disagreements,
  };
  return cached;
}

export function crankRad(crankDeg: number): number { return crankDeg * DEG; }

const CRANK_SPIN = [
  'crankshaft', 'crank-gears', 'crank-pulley', 'flywheel', 'clutch-disc', 'pressure-plate',
  'flywheel-bolts', 'clutch-bolts', 'pulley-bolt', 'crank-key', 'crank-gear-ring', 'crank-circlip',
  'pulley-pin', 'crank-pilot-bush', 'flywheel-seal', 'flywheel-oring',
];
const INT_SPIN = ['intermediate-shaft', 'ishaft-circlips', 'ishaft-thrust'];
const FAN_SPIN = ['fan-impeller', 'fan-hub', 'fan-pulley', 'fan-pulley-nut', 'fan-nuts'];
const PUMP_SPIN = ['air-pump-pulley', 'air-pulley-screws', 'air-pulley-washers'];

export interface Spin {
  id: string;
  /** Right-hand radians about `axis` through `center`, from the assembled pose. */
  angle: number;
  center: THREE.Vector3;
  axis: THREE.Vector3;
}

export function spinsAt(crankDeg: number): Spin[] {
  const g = measureDrive();
  const th = crankRad(crankDeg);
  const out: Spin[] = [];
  const add = (ids: string[], ratio: number, center: THREE.Vector3, axis = Z_AXIS) => {
    for (const id of ids) if (PART_BY_ID[id]) out.push({ id, angle: ratio * th, center, axis });
  };
  add(CRANK_SPIN, g.crank, new THREE.Vector3());
  add(INT_SPIN, g.intermediate, new THREE.Vector3(0, INT_SHAFT_Y, 0));
  add(FAN_SPIN, g.fan, new THREE.Vector3(0, FAN.y, 0));
  add(PUMP_SPIN, g.pump, new THREE.Vector3(AIR_PUMP.x, AIR_PUMP.y, 0));
  for (const s of [1, -1] as const) {
    const b = s > 0 ? 'right' : 'left';
    const center = new THREE.Vector3(CAM_X * s, 0, 0);
    add([
      `camshaft-${b}`, `cam-sprocket-${b}`, `cam-flange-${b}`, `cam-nut-${b}`,
      `cam-key-${b}`, `cam-pin-${b}`, `cam-shim-${b}`, `cam-thrust-washer-${b}`,
    ], g.cam, center);
  }
  return out;
}

export interface RodPose { cyl: number; pinX: number; throwX: number; throwY: number; rodAngle: number; z: number }

export function rodPoses(crankDeg: number): RodPose[] {
  return [1, 2, 3, 4, 5, 6].map((cyl) => {
    const k = pinX(cyl, crankDeg);
    return { cyl, pinX: k.pinX, throwX: k.throwXY[0], throwY: k.throwXY[1], rodAngle: k.rodAngle, z: CYL_Z[cyl] };
  });
}

export function valveLift(cyl: number, side: 1 | -1, crankDeg: number): { dLift: number; lift: number; stem: THREE.Vector3 } {
  const now = trainPose(cyl, side, crankDeg);
  const base = trainPose(cyl, side, ASSEMBLED_CRANK);
  return { dLift: now.lift - base.lift, lift: now.lift, stem: valveStemLocal(side) };
}

export function rockerDelta(cyl: number, side: 1 | -1, crankDeg: number): { dBeta: number; x: number; y: number } {
  const now = trainPose(cyl, side, crankDeg);
  const base = trainPose(cyl, side, ASSEMBLED_CRANK);
  const lay = rockerLayout(cyl, side);
  return { dBeta: now.beta - base.beta, x: lay.P.x, y: lay.P.y };
}

export function idlerSpin(s: 1 | -1, crankDeg: number): { angle: number; x: number; y: number } {
  const g = measureDrive();
  const T = tensionerLayout(s);
  return { angle: g.idler[s] * crankRad(crankDeg), x: T.idler.x, y: T.idler.y };
}

/** Arc error (mm) from each seated roller to the nearest tooth gap after `crankDeg`. */
export function chainGapError(s: 1 | -1, crankDeg: number): { int: number; cam: number; idler: number } {
  const g = measureDrive();
  const th = crankRad(crankDeg);
  const pins = chainPins(s).pins;
  const shifted = shiftLoop(pins, g.chainLinksPerCrankRad[s] * th);
  const T = tensionerLayout(s);
  const check = (cx: number, cy: number, r: number, teeth: number, rot: number) => {
    const phase = toothPhase(s, cx, cy, r, teeth) + rot;
    const pitch = (Math.PI * 2) / teeth;
    let worst = 0;
    for (const p of shifted) {
      // Straight-run rollers leave the pitch circle. Only rollers still on it are in a tooth.
      if (Math.abs(Math.hypot(p.x - cx, p.y - cy) - r) > 0.45) continue;
      const a = Math.atan2(p.y - cy, p.x - cx);
      let best = Infinity;
      for (let i = 0; i < teeth; i++) {
        const gap = phase + (i + SPROCKET_GAP) * pitch;
        const da = Math.atan2(Math.sin(a - gap), Math.cos(a - gap));
        if (Math.abs(da) < best) best = Math.abs(da);
      }
      worst = Math.max(worst, best * r);
    }
    return worst;
  };
  return {
    int: check(0, INT_SHAFT_Y, INT_SPROCKET_R, INT_T, g.intermediate * th),
    cam: check(CAM_X * s, 0, CAM_SPROCKET_R, CAM_T, g.cam * th),
    idler: check(T.idler.x, T.idler.y, IDLER_SPROCKET_R, IDLER_T, g.idler[s] * th),
  };
}

/** Arc length of a fractional pin index. Pin 0 sits at s = 0; pin n wraps to the start. */
function arcAtPin(poly: Poly, pin: number): number {
  const n = poly.x.length;
  let p = pin % n;
  if (p < 0) p += n;
  const i = Math.min(n - 1, Math.floor(p));
  const t = p - i;
  return poly.s[i] + t * (poly.s[i + 1] - poly.s[i]);
}

function pinAtArc(poly: Poly, dist: number): number {
  const len = poly.len;
  const d = ((dist % len) + len) % len;
  const n = poly.x.length;
  let lo = 0, hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (poly.s[mid] <= d) lo = mid; else hi = mid - 1;
  }
  const seg = poly.s[lo + 1] - poly.s[lo] || 1e-9;
  return lo + Math.max(0, Math.min(1, (d - poly.s[lo]) / seg));
}

function shiftLoop(pins: THREE.Vector3[], links: number): THREE.Vector3[] {
  const poly = polyOf(pins);
  return pins.map((p, i) => {
    const fr = frameAt(poly, arcAtPin(poly, i + links));
    return new THREE.Vector3(fr.x, fr.y, p.z);
  });
}

export interface LoopBind {
  poly: Poly;
  s: Float32Array;
  off: Float32Array;
  dz: Float32Array;
  z0: number;
}

/** Bind a world-space chain or belt mesh to a closed cord. Offsets are the in-plane residual. */
export function bindLoop(positions: THREE.BufferAttribute, poly: Poly, z0: number): LoopBind {
  const n = positions.count;
  const s = new Float32Array(n), off = new Float32Array(n), dz = new Float32Array(n);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(positions, i);
    let best = 0, bd = Infinity;
    const step = Math.max(1, Math.floor(poly.x.length / 64));
    for (let k = 0; k < poly.x.length; k += step) {
      const d = (v.x - poly.x[k]) ** 2 + (v.y - poly.y[k]) ** 2;
      if (d < bd) { bd = d; best = k; }
    }
    // Refine along the arc near that pin.
    let sBest = poly.s[best], dBest = Infinity;
    const guess = poly.s[best];
    for (let u = -8; u <= 8; u++) {
      const fr = frameAt(poly, guess + u * 0.5);
      const d = (v.x - fr.x) ** 2 + (v.y - fr.y) ** 2;
      if (d < dBest) { dBest = d; sBest = guess + u * 0.5; }
    }
    const fr = frameAt(poly, sBest);
    s[i] = sBest;
    off[i] = (v.x - fr.x) * fr.nx + (v.y - fr.y) * fr.ny;
    dz[i] = v.z - z0;
  }
  return { poly, s, off, dz, z0 };
}

export function skinLoop(bind: LoopBind, travel: number, out: THREE.BufferAttribute, clearChain = false, unit: 'mm' | 'link' = 'mm') {
  const v = new THREE.Vector3();
  for (let i = 0; i < bind.s.length; i++) {
    const arc = unit === 'link'
      ? arcAtPin(bind.poly, pinAtArc(bind.poly, bind.s[i]) + travel)
      : bind.s[i] + travel;
    const fr = frameAt(bind.poly, arc);
    v.set(fr.x + fr.nx * bind.off[i], fr.y + fr.ny * bind.off[i], bind.z0 + bind.dz[i]);
    if (clearChain) clearChainVertex(v);
    out.setXYZ(i, v.x, v.y, v.z);
  }
  out.needsUpdate = true;
}

export function chainPoly(s: 1 | -1): { poly: Poly; z: number } {
  return { poly: polyOf(chainPins(s).pins), z: CHAIN_Z[s] };
}

/** Open-belt centerline used by fanBelt / airPumpBelt, sampled at about 2 mm. */
export function beltPoly(kind: 'fan' | 'pump'): { poly: Poly; z: number } {
  const g = measureDrive();
  const z = kind === 'fan' ? FAN.zBelt : FAN.zPumpBelt;
  const c1 = kind === 'fan' ? new THREE.Vector2(0, 0) : new THREE.Vector2(AIR_PUMP.x, AIR_PUMP.y);
  const r1 = kind === 'fan' ? g.cords.crank : g.cords.pump;
  const c2 = new THREE.Vector2(0, FAN.y);
  const r2 = kind === 'fan' ? g.cords.fan : g.cords.fanOuter;
  const d = c2.clone().sub(c1);
  const L = d.length();
  const base = Math.atan2(d.y, d.x);
  const beta = Math.acos(Math.min(1, Math.max(-1, (r1 - r2) / L)));
  const pts: THREE.Vector3[] = [];
  const arc = (c: THREE.Vector2, r: number, a0: number, a1: number, n: number) => {
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push(new THREE.Vector3(c.x + r * Math.cos(a), c.y + r * Math.sin(a), z));
    }
  };
  const span = Math.abs(2 * beta);
  const nSmall = Math.max(8, Math.round((span * Math.min(r1, r2)) / 2));
  const nBig = Math.max(16, Math.round(((Math.PI * 2 - span) * Math.max(r1, r2)) / 2));
  arc(c2, r2, base - beta, base + beta, nSmall);
  arc(c1, r1, base + beta, base + 2 * Math.PI - beta, nBig);
  return { poly: polyOf(pts), z };
}

export function beltTravel(kind: 'fan' | 'pump', crankDeg: number): number {
  const g = measureDrive();
  return (kind === 'fan' ? g.fanBeltPerCrankRad : g.pumpBeltPerCrankRad) * crankRad(crankDeg);
}

/** Link shift along chainPins order. One tooth of the intermediate sprocket is one link. */
export function chainTravel(s: 1 | -1, crankDeg: number): number {
  return measureDrive().chainLinksPerCrankRad[s] * crankRad(crankDeg);
}

/** Firing order by the crank angle at which each piston is nearest its head. */
export function firingOrderAtTdc(): { cyl: number; crank: number }[] {
  const hits: { cyl: number; crank: number }[] = [];
  for (const cyl of [1, 2, 3, 4, 5, 6]) {
    let best = 0, reach = -1;
    for (let d = 0; d < 720; d += 0.5) {
      const ax = Math.abs(pinX(cyl, d).pinX);
      if (ax > reach) { reach = ax; best = d; }
    }
    hits.push({ cyl, crank: best % 360 });
  }
  hits.sort((a, b) => a.crank - b.crank);
  return hits;
}

/** Outboard gap from the piston crown to the valve-face centre, along the bore. Positive is face outside the crown. */
export function crownClearance(cyl: number, side: 1 | -1, crankDeg: number): number {
  const pose = trainPose(cyl, side, crankDeg);
  const face = valveFaceEngine(cyl, side, pose.lift);
  const crown = Math.abs(pinX(cyl, crankDeg).pinX) + SPEC.compressionHeight;
  return Math.abs(face.x) - crown;
}

export { FIRE_CRANK, PEAK_CRANK, PITCH, INT_T, CAM_T, IDLER_T, CRANK_GEAR_T };

/** Rod centre distance stays the builder's rod length. */
export function rodLengthError(crankDeg: number): number {
  let worst = 0;
  for (const p of rodPoses(crankDeg)) {
    const dx = p.pinX - p.throwX, dy = 0 - p.throwY;
    worst = Math.max(worst, Math.abs(Math.hypot(dx, dy) - SPEC.rodLength));
  }
  return worst;
}
