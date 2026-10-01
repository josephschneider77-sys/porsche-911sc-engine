/**
 * 1978 CIS induction and fuel circuit (930/03).
 * Plenum, runners, sleeves, mixture-control unit and every fuel-line end.
 * Dimensions: K = published, E = estimated from the JE / FVD photos (see docs/engine-spec.md §16).
 */
import * as THREE from 'three';
import {
  Part, V3, lathe, boxMM, cyl, cylBetween, extrude, roundRect, circlePath, hexNut, tube, torus, mesh, cutGroup, csgSub,
} from './util';
import { CYL_Z, INTAKE_PORT, INJ, bankOf } from '../data/layout';

const CYLS = [1, 2, 3, 4, 5, 6] as const;

/** Air-distributor box. Width 155 and length 190 are the brief's photo estimates; port ID 38 is published. */
export const BOX = {
  /** Half-width: stub face at |x| (E, reassembly-19 scaled off the 47 mm sleeves). */
  faceX: 77.5,
  y0: 174,
  y1: 252,
  z0: -95,
  z1: 95,
  /** Stub axis, in the lower chamber (E). */
  stubY: 206,
  /** Three stubs per side, 50 mm pitch (E, reassembly-19: adjacent, nearly touching). */
  stubZ: [-50, 0, 50] as const,
  /** Port ID 38 mm (K: Jim Williams, Pelican 8327087; JE alu-airbox: 1978–79 US). */
  portId: 38,
  /** Port OD (E). */
  portOd: 44,
  /** Metal stub past the face (E). */
  stubLen: 28,
};
/** Top face of the distributor lid. The 1.2 mm extrude bevel sits outside the profile (y1). */
export const LID_Y = BOX.y1 + 1.2;
/** Rubber sleeve 928 110 158 01. OD and length E from FVD 911 110 885 02 and reassembly-19. */
export const SLEEVE = {
  od: 47,
  len: 50,
  /** ID equals the 44 mm stub and the runner spigot. The rubber is stretched on; the walls coincide. */
  id: 44,
  /** Metal-to-metal gap inside the sleeve (E). Each end is covered by 21 mm of rubber. */
  gap: 8,
};
export const STUB_TIP_X = BOX.faceX + BOX.stubLen; // 105.5
export const RUNNER_TIP_X = STUB_TIP_X + SLEEVE.gap; // 113.5
export const SLEEVE_IN_X = STUB_TIP_X - (SLEEVE.len - SLEEVE.gap) / 2; // 84.5
/** Air-flow-meter opening on the box top (the venturi sits here). */
export const AFM_PORT = { x: -14, z: -64, r: 22 };
/**
 * Outlet neck from the box top into the air-cleaner floor (aux.ts AIRBOX.floorY).
 * The floor hole is larger (r 22) so the tube (r 16) passes with radial air; the flange seats on the floor.
 */
export const AIR_NECK = { x: 36, z: -8, r: 16, hole: 22, flange: 30 };
/** Throttle housing, rear face of the box (+Z, pulley end). */
export const THROTTLE = { y: 222, zFace: 128, bore: 26 };
/**
 * Auxiliary-air takeoff on the air-flow meter (metered air, after the sensor plate).
 * The barb points +X, toward the auxiliary air valve on the flywheel face.
 */
export const AFM_AUX = { tip: [28, 280, -64] as V3, axis: [1, 0, 0] as V3 };
/** Discharge spigot on the plenum flywheel face. The auxiliary-air valve's lower port feeds it. */
export const PLENUM_AUX = { tip: [32, 180, -134] as V3, axis: [0, 0, -1] as V3 };
/** Manifold-vacuum nipple on the plenum lid, downstream of the throttle. */
export const MANIFOLD_VAC = { tip: [-30, 268, 40] as V3, axis: [0, 1, 0] as V3 };
/** Distributor vacuum-advance nipple, outboard end of the can (aux.ts distributor). */
export const DIST_VAC = { tip: [-168, 150, 146] as V3, axis: [-1, 0, 0] as V3 };
/** Auxiliary air valve mount. Prototype +Y is world −Z; the two barbs are prototype ±X. */
export const AAV_MOUNT = { origin: [52, 200, -95.6] as V3, normal: [0, 0, -1] as V3 };
/** Vacuum T-piece and limiter origins (world mm). smallParts poses the fittings here. */
export const VAC_T = { origin: [6, 260, 62] as V3 };
export const VAC_LIMIT = { origin: [70, 252.6, -72] as V3 };

const LINE_R = 2.15;

export interface FuelEnd {
  /** Part that owns the fitting face the line seats on. */
  part: string;
  /** Seat-face / stub-tip centre, world mm. */
  point: V3;
  /** Unit axis pointing out of the fitting, along the line as it leaves. */
  axis: V3;
}
export interface FuelLineDef {
  id: string;
  /** Mesh lives in this part. */
  part: string;
  a: FuelEnd;
  b: FuelEnd;
}
export interface BanjoDef {
  id: string;
  part: string;
  /** Port face centre. Bolt axis points out of the port. */
  face: V3;
  axis: V3;
  /** World centres of the two copper washers (mid-thickness, on the bolt axis). */
  washers: [V3, V3];
}

const add = (a: V3, b: V3, s = 1): V3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const norm = (a: V3): V3 => {
  const L = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / L, a[1] / L, a[2] / L];
};
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** +Y of the banjo prototype is the bolt; local +Z is the side stub. */
export const BANJO = {
  washerT: 1.2,
  washerRi: 3.3,
  washerRo: 6.6,
  eyeRo: 7.3,
  eye0: 1.2,
  eye1: 9.2,
  stubR: 2.05,
  stubTip: 17,
  eyeY: 5.2,
};
const WASHER_Y = [BANJO.washerT / 2, BANJO.eye1 + BANJO.washerT / 2] as const;

export function banjoProto() {
  const p = new Part();
  const { washerT: t, washerRi: ri, washerRo: ro, eyeRo, eye0, eye1, stubR, stubTip, eyeY } = BANJO;
  p.add(lathe([[ri, 0], [ro, 0], [ro, t], [ri, t]], 16), 'copper');
  p.add(lathe([[3.05, eye0], [eyeRo, eye0], [eyeRo, eye1], [3.05, eye1]], 18), 'brass');
  p.add(cylBetween([0, eyeY, eyeRo - 0.2], [0, eyeY, stubTip], stubR, 10), 'brass');
  p.add(lathe([[ri, eye1], [ro, eye1], [ro, eye1 + t], [ri, eye1 + t]], 16), 'copper');
  p.add(hexNut(12, 4.6).translate(0, eye1 + t + 2.3, 0), 'zincPlate');
  return p;
}

function banjoFrame(face: V3, axis: V3, stubDir: V3) {
  const Y = v(...axis).normalize();
  const Z = v(...stubDir).normalize();
  const X = new THREE.Vector3().crossVectors(Y, Z).normalize();
  // makeBasis(X, Y, Z) with Z = X×Y. Rebuild Z from X so the stub direction is exact.
  const Z2 = new THREE.Vector3().crossVectors(X, Y).normalize();
  const m = new THREE.Matrix4().makeBasis(X, Y, Z2).setPosition(v(...face));
  const tip = v(0, BANJO.eyeY, BANJO.stubTip).applyMatrix4(m);
  const washers = WASHER_Y.map((y) => v(0, y, 0).applyMatrix4(m).toArray() as V3) as [V3, V3];
  const stub = Z2.toArray() as V3;
  return { matrix: m, face, axis: Y.toArray() as V3, stub, tip: tip.toArray() as V3, washers };
}

/** Right-bank injector axis. The runner mesh is shared; bank rotation maps it onto the left bank. */
export function injectorPose(c: number) {
  const s = bankOf(c);
  const pos = v((INTAKE_PORT.x + INJ.dx) * s, INTAKE_PORT.y + INJ.dy, CYL_Z[c]);
  // Right bank leans outboard (+X); left bank is the mirror, outboard (−X).
  const euler = new THREE.Euler(0, 0, (s === 1 ? -57 : 57) * Math.PI / 180);
  const axis = v(0, 1, 0).applyEuler(euler).normalize();
  return { pos, axis };
}
/** Flat nipple face the steel line seats on (injector-local y). */
export const INJ_FACE = 44;
export function injectorFace(c: number): V3 {
  const { pos, axis } = injectorPose(c);
  return pos.clone().addScaledVector(axis, INJ_FACE).toArray() as V3;
}
export function injectorAxis(c: number): V3 {
  return injectorPose(c).axis.toArray() as V3;
}

/**
 * Which stub a cylinder's runner runs to. Order follows the crank: the pulley-end
 * cylinder of each bank (1 and 4) takes the pulley-end stub, so the pipes converge
 * without crossing. Head pitch is 118 mm, stub pitch is 50 mm.
 */
export function stubZOf(c: number): number {
  return [50, 0, -50][(c - 1) % 3];
}

const smooth01 = (t: number) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };

/** World centreline of runner c. Same XY schedule on every cylinder, so neighbours stay ≥ 50 mm apart. */
export function runnerWorldPoints(c: number): V3[] {
  const s = bankOf(c) as 1 | -1;
  const z0 = CYL_Z[c], z1 = stubZOf(c);
  const x0 = INTAKE_PORT.x * s, x1 = RUNNER_TIP_X * s;
  const y0 = INTAKE_PORT.y + 20, y1 = BOX.stubY;
  const xA = x1 + s * 46;
  const pts: V3[] = [[x0, y0, z0], [x0, y0 + 28, z0]];
  for (let i = 1; i <= 7; i++) {
    const u = smooth01(i / 7);
    pts.push([x0 + (xA - x0) * u, y0 + 28 + (y1 - y0 - 28) * u, z0 + (z1 - z0) * u]);
  }
  pts.push([x1, y1, z1]);
  return pts;
}
/** Fat tubes the shroud subtracts so each runner crosses the wing with air around it. */
export function runnerTunnelCutters(s: 1 | -1): THREE.BufferGeometry[] {
  const cyls = s > 0 ? [1, 2, 3] : [4, 5, 6];
  return cyls.map((c) => tube(runnerWorldPoints(c), 26, 10, 40));
}

// ---------------------------------------------------------------- fuel-distributor ports (world mm)
// The body sits above the strut feet (y 258) and below the air-cleaner drum (bottom ~323 at this z).
// Outlet pitch is 17 mm. The eyes are Ø14.6; the old 12 mm pitch overlapped neighbours by 2.6 mm.
const FD = { x0: -100, x1: -60, y0: 274, y1: 314, z0: -128, z1: -20 };
const FDX = -80;
const FDZ = [-116, -99, -82, -65, -48, -31];
/** Port i feeds this cylinder. */
const PORT_CYL = [6, 5, 3, 4, 2, 1];

function injBanjo(i: number) {
  const face: V3 = [FDX, FD.y1, FDZ[i]];
  // Stubs leave outboard (−X) and fan a few degrees so the lines gather without crossing.
  // Round eyes only clear each other by the 17 mm pitch; the yaw is the line direction.
  const a = (i - 2.5) * 6 * Math.PI / 180;
  return banjoFrame(face, [0, 1, 0], [-Math.cos(a), 0, Math.sin(a)]);
}
const INJ_BANJOS = FDZ.map((_, i) => injBanjo(i));

// Faces stand off the distributor walls so the Ø14.6 eye clears the body.
const FEED_BANJO = banjoFrame([-114, 292, -80], [-1, 0, 0], [0, 0, -1]);
const CSV_FD_BANJO = banjoFrame([-46, 292, -80], [1, 0, 0], [0, 0, -1]);
const WUR_FD = [
  banjoFrame([-80, 286, -132], [0, 0, -1], [-1, 0, 0]),
  banjoFrame([-80, 304, -132], [0, 0, -1], [-1, 0, 0]),
];
/** WUR port faces, outboard (−X) of the regulator body. 14 mm apart in Y so the +Z stubs clear the neighbouring eye. */
export const WUR_FACES: V3[] = [[-84, 124, -174], [-84, 138, -156]];
const WUR_BANJO = WUR_FACES.map((face) => banjoFrame(face, [-1, 0, 0], [0, 0, 1]));

/** Cold-start valve: origin centred on the plenum boss (stubY), +Y of the prototype points out (−Z). */
export const CSV_POSE = { origin: [0, BOX.stubY, -106] as V3, normal: [0, 0, -1] as V3, xHint: [1, 0, 0] as V3 };
/** Fuel-port face in the cold-start-valve prototype (+Y out, +Z up). */
export const CSV_PORT_LOCAL = { y: 26, faceZ: 11 };
export function csvPoseMatrix() {
  const Y = v(...CSV_POSE.normal).normalize();
  const X = v(...CSV_POSE.xHint).normalize();
  const Z = new THREE.Vector3().crossVectors(X, Y).normalize();
  return new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(v(...CSV_POSE.origin));
}
const CSV_BANJO = (() => {
  const M = csvPoseMatrix();
  const face = v(0, CSV_PORT_LOCAL.y, CSV_PORT_LOCAL.faceZ).applyMatrix4(M).toArray() as V3;
  const axis = v(0, 0, 1).transformDirection(M).toArray() as V3;
  const stub = v(1, 0, 0).transformDirection(M).toArray() as V3;
  return banjoFrame(face, axis, stub);
})();

/** Pulley end of the distributor. The hex sits against that face; the sealing ring is on the outer face. */
const RETURN_FACE: V3 = [-80, 292, -10];
const RETURN_AXIS: V3 = [0, 0, 1];
/**
 * Filter-side union (930 110 513). The filter is off the engine; this fitting is the end of the
 * line. Axis points back along the line (+Z) so the tube runs away from the distributor and stops
 * on the hex instead of hooking past it.
 */
const FEED_BLOCK: V3 = [-142, 238, -176];
const FEED_BLOCK_AXIS: V3 = [0, 0, 1];
/**
 * Tank-side union on the return. The copper sealing ring (orange) is on the distributor port;
 * this hex is the lower end of that short line. Axis −Z: the tube arrives from the distributor.
 */
const RETURN_BLOCK: V3 = [-82, 268, 40];
const RETURN_BLOCK_AXIS: V3 = [0, 0, -1];

function endOf(part: string, point: V3, axis: V3): FuelEnd {
  return { part, point, axis: norm(axis) };
}

export const FUEL_LINES: FuelLineDef[] = [
  ...PORT_CYL.map((c, i): FuelLineDef => ({
    id: `inj-${c}`,
    part: 'fuel-lines',
    a: endOf('injection-banjos', INJ_BANJOS[i].tip, INJ_BANJOS[i].stub),
    b: endOf(`injector-${c}`, injectorFace(c), injectorAxis(c)),
  })),
  {
    id: 'feed',
    part: 'fuel-lines',
    a: endOf('mixture-control-unit', FEED_BANJO.tip, FEED_BANJO.stub),
    b: endOf('fuel-lines', FEED_BLOCK, FEED_BLOCK_AXIS),
  },
  {
    id: 'return',
    part: 'fuel-lines',
    a: endOf('mixture-control-unit', RETURN_FACE, RETURN_AXIS),
    b: endOf('fuel-lines', RETURN_BLOCK, RETURN_BLOCK_AXIS),
  },
  {
    id: 'csv',
    part: 'fuel-lines',
    a: endOf('mixture-control-unit', CSV_FD_BANJO.tip, CSV_FD_BANJO.stub),
    b: endOf('cold-start-valve', CSV_BANJO.tip, CSV_BANJO.stub),
  },
  ...([0, 1] as const).map((i): FuelLineDef => ({
    id: `wur-${i}`,
    part: 'wur-lines',
    a: endOf('wur-lines', WUR_FD[i].tip, WUR_FD[i].stub),
    b: endOf('wur-lines', WUR_BANJO[i].tip, WUR_BANJO[i].stub),
  })),
];

export const FUEL_BANJOS: BanjoDef[] = [
  ...PORT_CYL.map((c, i): BanjoDef => ({
    id: `inj-${c}`, part: 'injection-banjos', face: INJ_BANJOS[i].face, axis: INJ_BANJOS[i].axis, washers: INJ_BANJOS[i].washers,
  })),
  { id: 'feed', part: 'mixture-control-unit', face: FEED_BANJO.face, axis: FEED_BANJO.axis, washers: FEED_BANJO.washers },
  { id: 'csv-fd', part: 'mixture-control-unit', face: CSV_FD_BANJO.face, axis: CSV_FD_BANJO.axis, washers: CSV_FD_BANJO.washers },
  { id: 'csv', part: 'cold-start-valve', face: CSV_BANJO.face, axis: CSV_BANJO.axis, washers: CSV_BANJO.washers },
  ...([0, 1] as const).flatMap((i) => ([
    { id: `wur-fd-${i}`, part: 'wur-lines', face: WUR_FD[i].face, axis: WUR_FD[i].axis, washers: WUR_FD[i].washers },
    { id: `wur-${i}`, part: 'wur-lines', face: WUR_BANJO[i].face, axis: WUR_BANJO[i].axis, washers: WUR_BANJO[i].washers },
  ] satisfies BanjoDef[])),
];

/** Six distributor banjos (107-10 #25), one per injector line. */
export function injectorBanjoMatrices() {
  return INJ_BANJOS.map((b) => b.matrix);
}

/** Sealing rings (107-10 #24): six at the injector nipples, one at the return union, one at the feed block. */
export function sealRingFrames(): { p: V3; n: V3 }[] {
  const rings: { p: V3; n: V3 }[] = PORT_CYL.map((c) => {
    const n = injectorAxis(c);
    return { p: add(injectorFace(c), n, 0.2), n };
  });
  rings.push({ p: add(RETURN_FACE, RETURN_AXIS, 0.2), n: RETURN_AXIS });
  rings.push({ p: add(FEED_BLOCK, FEED_BLOCK_AXIS, 0.2), n: FEED_BLOCK_AXIS });
  return rings;
}

export function bootFrames() {
  return CYLS.map((c) => {
    const s = bankOf(c) as 1 | -1;
    const z = stubZOf(c);
    return { c, origin: [s * SLEEVE_IN_X, BOX.stubY, z] as V3, axis: [s, 0, 0] as V3 };
  });
}
/** Two worm-drive clamps per sleeve. Screw housing points up (+Y), as in reassembly-19. */
export function clampFrames() {
  return bootFrames().flatMap(({ origin, axis }) => [12, 38].map((t) => ({
    origin: add(origin, axis, t),
    axis,
    up: [0, 1, 0] as V3,
  })));
}

// ---------------------------------------------------------------- geometry

function filleted(corners: V3[], radius = 12): V3[] {
  const P = corners.map((q) => v(...q));
  const out: V3[] = [];
  const push = (pt: THREE.Vector3) => {
    const last = out.length ? v(...out[out.length - 1]) : null;
    if (!last || last.distanceTo(pt) > 0.8) out.push([pt.x, pt.y, pt.z]);
  };
  push(P[0]);
  for (let i = 1; i < P.length - 1; i++) {
    const prev = P[i - 1], c = P[i], next = P[i + 1];
    const d0 = c.clone().sub(prev), d1 = next.clone().sub(c);
    const l0 = d0.length(), l1 = d1.length();
    if (l0 < 1e-3 || l1 < 1e-3) { push(c); continue; }
    d0.multiplyScalar(1 / l0); d1.multiplyScalar(1 / l1);
    const beta = Math.acos(Math.min(1, Math.max(-1, d0.dot(d1))));
    if (beta < 0.15 || beta > 2.9) { push(c); continue; }
    const trim = Math.min(radius * Math.tan(beta / 2), l0 * 0.45, l1 * 0.45);
    const rEff = trim / Math.tan(beta / 2);
    const bin = new THREE.Vector3().crossVectors(d0, d1);
    if (bin.lengthSq() < 1e-10) { push(c); continue; }
    bin.normalize();
    const n0 = new THREE.Vector3().crossVectors(bin, d0).normalize();
    const a = c.clone().addScaledVector(d0, -trim);
    const b = c.clone().addScaledVector(d1, trim);
    const center = a.clone().addScaledVector(n0, rEff);
    const va = a.clone().sub(center);
    const ang = va.angleTo(b.clone().sub(center));
    const steps = Math.max(2, Math.ceil(ang / (12 * Math.PI / 180)));
    const axis = new THREE.Vector3().crossVectors(va, b.clone().sub(center)).normalize();
    for (let k = 0; k <= steps; k++) push(center.clone().add(va.clone().applyAxisAngle(axis, ang * (k / steps))));
  }
  push(P[P.length - 1]);
  return out;
}

function addNamed(p: Part, id: string, g: THREE.BufferGeometry, mat: 'steel' | 'rubber' = 'steel') {
  const me = mesh(g, mat);
  me.name = `line:${id}`;
  p.g.add(me);
}

/**
 * Straight run out of each fitting, then a curve that does not hook back into the fitting.
 * `leadB` / `aheadB` shorten the far end: an injector tube nut is 8 mm, not the 30 mm distributor lead.
 */
function addLine(
  p: Part, id: string, tipA: V3, dirA: V3, tipB: V3, dirB: V3, mids: V3[], r = LINE_R,
  fit?: { leadB?: number; aheadB?: number; fillet?: number },
) {
  const A = norm(dirA), B = norm(dirB);
  const leadA = 16, leadB = fit?.leadB ?? 16;
  const aheadA = 30, aheadB = fit?.aheadB ?? 30;
  const fillet = fit?.fillet ?? 16;
  const start = add(tipA, A, 0.4);
  const end = add(tipB, B, 0.4);
  const a1 = add(tipA, A, leadA);
  const b1 = add(tipB, B, leadB);
  addNamed(p, id, cylBetween(start, a1, r, 10));
  addNamed(p, id, cylBetween(end, b1, r, 10));
  const pts = filleted([a1, add(tipA, A, aheadA), ...mids, add(tipB, B, aheadB), b1], fillet);
  addNamed(p, id, tube(pts, r, 7, Math.max(24, pts.length * 3)));
}

function placeBanjo(p: Part, frame: ReturnType<typeof banjoFrame>, id: string) {
  const g = banjoProto().g;
  g.updateMatrixWorld(true);
  // One fitting: the eye, stub, washers and nut share a group so they are one sub-solid.
  const group = new THREE.Group();
  group.name = `banjo:${id}`;
  g.traverse((o) => {
    const me = o as THREE.Mesh;
    if (!me.isMesh) return;
    const geo = me.geometry.clone().applyMatrix4(frame.matrix.clone().multiply(me.matrixWorld));
    group.add(new THREE.Mesh(geo, me.material));
  });
  p.g.add(group);
}

function unionFace(p: Part, face: V3, axis: V3, r = 7, af = 19, id?: string) {
  const Y = v(...axis).normalize();
  const ref = Math.abs(Y.y) < 0.9 ? v(0, 1, 0) : v(1, 0, 0);
  const Xx = new THREE.Vector3().crossVectors(Y, ref).normalize();
  const Z = new THREE.Vector3().crossVectors(Xx, Y).normalize();
  const m = new THREE.Matrix4().makeBasis(Xx, Y, Z).setPosition(v(...face));
  const hex = hexNut(af, 8);
  hex.applyMatrix4(new THREE.Matrix4().makeTranslation(0, -6, 0).premultiply(m));
  const nose = cyl(r, 6, 16);
  nose.applyMatrix4(new THREE.Matrix4().makeTranslation(0, -3, 0).premultiply(m));
  // Hex and nose are one union. A named group keeps them a single sub-solid.
  const group = new THREE.Group();
  if (id) group.name = `fitting:${id}`;
  group.add(mesh(hex, 'zincPlate'));
  group.add(mesh(nose, 'machinedAlu'));
  p.g.add(group);
}

/** Cast air distributor: compact box, six horizontal stubs, throttle at the rear, CSV boss on the flywheel end. */
export function buildPlenumBox() {
  const p = new Part();
  const { faceX, y0, y1, z0, z1, stubY, portId, portOd, stubLen } = BOX;
  const sec = roundRect(faceX * 2, y1 - y0, 8, 0, (y0 + y1) / 2);
  const body = extrude(sec, z1 - z0, 1.2);
  body.translate(0, 0, z0);
  p.add(body, 'castAlu');
  const stubR = portOd / 2;
  for (const z of BOX.stubZ) for (const s of [1, -1] as const) {
    // 4 mm buried in the wall so the stub reads as machined out of the casting
    p.add(cylBetween([s * (faceX - 4), stubY, z], [s * (faceX + stubLen), stubY, z], stubR, 24), 'machinedAlu');
  }
  // throttle housing
  p.add(cylBetween([0, THROTTLE.y, z1 - 4], [0, THROTTLE.y, THROTTLE.zFace], 30, 28), 'castAlu');
  p.add(cylBetween([-34, THROTTLE.y, 112], [36, THROTTLE.y, 112], 3.6, 10), 'darkSteel');
  // Lever pad stops at y 236 so the linkage plate can sit on it.
  p.add(boxMM([32, THROTTLE.y - 2, 108], [44, THROTTLE.y + 14, 118]), 'castAlu');
  p.add(boxMM([38, THROTTLE.y + 8, 104], [46, THROTTLE.y + 14, 124]), 'darkSteel');
  // cold-start boss on the flywheel end, spraying into the lower chamber (no 1980 spider)
  p.add(boxMM([-24, stubY - 16, -106], [24, stubY + 16, z0]), 'castAlu');
  // Auxiliary-air discharge spigot, flywheel face, clear of the cold-start boss (x ±24).
  p.add(cylBetween([PLENUM_AUX.tip[0], PLENUM_AUX.tip[1], -94], PLENUM_AUX.tip, 4.6, 12), 'brass');
  // Manifold-vacuum nipple on the lid, downstream of the throttle.
  p.add(cylBetween([MANIFOLD_VAC.tip[0], y1 - 0.8, MANIFOLD_VAC.tip[2]], MANIFOLD_VAC.tip, 3.4, 10), 'brass');
  const cuts = [
    ...BOX.stubZ.flatMap((z) => [1, -1].map((s) => cylBetween([s * (faceX - 16), stubY, z], [s * (faceX + stubLen + 2), stubY, z], portId / 2, 20))),
    cylBetween([0, THROTTLE.y, z1 - 12], [0, THROTTLE.y, THROTTLE.zFace + 2], THROTTLE.bore, 24),
    cylBetween([0, stubY, z0 + 8], [0, stubY, -112], 7, 16),
    cylBetween([AFM_PORT.x, y0 + 20, AFM_PORT.z], [AFM_PORT.x, y1 + 8, AFM_PORT.z], AFM_PORT.r, 24),
    // Cold-start screw holes. Shank Ø4.8, hole Ø5.0 so the thread has air and the head sits on the flange.
    ...[-16, 16].map((x) => cylBetween([x, stubY, -112], [x, stubY, -97], 2.5, 12)),
  ];
  return cutGroup(p.g, ...cuts);
}

function worldToRunner(c: number, p: V3): V3 {
  const s = bankOf(c) as 1 | -1;
  const dx = p[0] - INTAKE_PORT.x * s, dy = p[1] - INTAKE_PORT.y, dz = p[2] - CYL_Z[c];
  return s === 1 ? [dx, dy, dz] : [-dx, dy, -dz];
}

export function intakeRunner(c: number) {
  const p = new Part();
  const s = bankOf(c) as 1 | -1;
  const local = runnerWorldPoints(c).map((q) => worldToRunner(c, q));
  p.add(tube(local, 14, 14, 64), 'castAlu');
  const tip = local[local.length - 1], approach = local[local.length - 2];
  p.add(cylBetween(approach, tip, BOX.portOd / 2, 24), 'machinedAlu');
  // Flange top stays at local y 8 (nut face). The 0.5 mm paper gasket occupies y 0..0.5; the flange sits on it.
  const fl = roundRect(46, 76, 12);
  fl.holes.push(circlePath(18) as THREE.Path);
  for (const sz of [28, -28]) fl.holes.push(circlePath(5, 0, sz) as THREE.Path);
  const fg = new THREE.ExtrudeGeometry(fl, { depth: 7.5, bevelEnabled: false, curveSegments: 8 });
  fg.rotateX(Math.PI / 2);
  fg.translate(0, 8, 0);
  p.add(fg, 'castAlu');
  // port liner inside the flange hole, starting where the gasket ends
  p.add(cylBetween([0, 0.5, 0], [0, 36, 0], 13, 20), 'castAlu');
  // injector holder in this runner's local frame (left-bank parts are rotated 180° about Y)
  const { pos, axis } = injectorPose(c);
  const origin = v(...worldToRunner(c, pos.toArray() as V3));
  const ax = axis.clone();
  if (s < 0) ax.set(-ax.x, ax.y, -ax.z);
  const bossA = origin.clone().addScaledVector(ax, 4);
  const bossB = origin.clone().addScaledVector(ax, 32);
  p.add(cylBetween(bossA.toArray() as V3, bossB.toArray() as V3, 15, 16), 'castAlu');
  const boreA = origin.clone().addScaledVector(ax, -2);
  const boreB = origin.clone().addScaledVector(ax, 120);
  return cutGroup(p.g, cylBetween(boreA.toArray() as V3, boreB.toArray() as V3, 12, 16));
}

export function injector() {
  const p = new Part();
  // body Ø12. The sealing rings (torus R 7.4, minor 1.4) sit on that diameter.
  p.add(lathe([
    [0.1, 0], [3.2, 0], [4.8, 5], [6.0, 7], [6.0, 33],
    [3.4, 35], [3.4, INJ_FACE], [0.1, INJ_FACE],
  ], 20), 'steel');
  p.add(hexNut(13, 5).translate(0, 38.5, 0), 'brass');
  // Tube nut bears on the copper ring (ring ends 1.2 mm along the nipple) and stops at 8 mm.
  // Bore r 2.2 on the r 2.15 line (0.05 mm radial air). The cutter stays inside the AF 14 flats (7 mm).
  const nutH = 6.8;
  const nutY = INJ_FACE + 1.2 + nutH / 2;
  const nut = csgSub(hexNut(14, nutH).translate(0, nutY, 0), cyl(2.2, nutH + 1.6, 12).translate(0, nutY, 0));
  p.add(nut, 'zincPlate');
  return p.g;
}

function blockAt(p: Part, face: V3, axis: V3, id: string) {
  unionFace(p, face, axis, 6.5, 18, id);
}

export function fuelLines() {
  const p = new Part();
  // supply and return junctions (the body-side ends of 930 110 513 / 514). The filter and tank are off the engine.
  blockAt(p, FEED_BLOCK, FEED_BLOCK_AXIS, 'feed-block');
  blockAt(p, RETURN_BLOCK, RETURN_BLOCK_AXIS, 'return-block');
  for (const line of FUEL_LINES.filter((l) => l.part === 'fuel-lines')) {
    const mids = routeMids(line.id);
    const fit = line.id.startsWith('inj-') ? { leadB: 8, aheadB: 8, fillet: 6 } : undefined;
    addLine(p, line.id, line.a.point, line.a.axis, line.b.point, line.b.axis, mids, LINE_R, fit);
  }
  return p.g;
}

/**
 * Injector lines leave the distributor as one vertical ribbon just outboard of the body,
 * each on its own height (8 mm) so the Ø4.3 tubes never share a point. They follow the
 * runner (clear of the Ø44 spigot), then a 6 mm bend into an 8 mm tube nut.
 */
function bundle(i: number, z: number): V3 {
  return [-134, 274 + i * 8, z];
}

/** Point on the runner centreline, u = 0 at the head and 1 at the plenum spigot. */
function runnerAt(c: number, u: number): { p: THREE.Vector3; tan: THREE.Vector3 } {
  const pts = runnerWorldPoints(c).map((q) => v(...q));
  const n = pts.length - 1;
  const f = Math.min(0.999, Math.max(0, u)) * n;
  const i = Math.min(n - 1, Math.floor(f));
  const t = f - i;
  const p = pts[i].clone().lerp(pts[i + 1], t);
  const tan = pts[Math.min(n, i + 1)].clone().sub(pts[Math.max(0, i)]).normalize();
  return { p, tan };
}

/** Cast pipe is r 14. The machined spigot (Ø44) occupies the last horizontal run, so the line clears that. */
function pipeR(u: number): number {
  if (u <= 0.72) return 14;
  if (u >= 0.9) return 22;
  return 14 + 8 * ((u - 0.72) / 0.18);
}

/**
 * Air between the line wall and the pipe wall. The sleeve clamps stand on top of the spigot
 * (screw housing up to about y 238), so the line hops over that run.
 */
function lineGap(u: number): number {
  if (u >= 0.8) return 14;
  if (u >= 0.66) return 8;
  return 4;
}

/** Line centre above the runner, or outboard where the pipe is vertical. */
function besideRunner(c: number, u: number): V3 {
  const { p, tan } = runnerAt(c, u);
  const s = bankOf(c) as 1 | -1;
  let n = Math.abs(tan.y) > 0.75 ? v(s, 0.35, 0) : v(0, 1, 0);
  n.addScaledVector(tan, -n.dot(tan));
  if (n.lengthSq() < 1e-8) n = v(s, 0, 0);
  n.normalize();
  const off = pipeR(u) + LINE_R + lineGap(u);
  return [p.x + n.x * off, p.y + n.y * off, p.z + n.z * off];
}

/** Inboard and up, perpendicular to the injector axis. The bend leaves the nut on this side. */
function injectorOut(c: number): THREE.Vector3 {
  const s = bankOf(c) as 1 | -1;
  const ax = v(...injectorAxis(c));
  const raw = v(-s, 0.7, 0);
  const u = raw.clone().addScaledVector(ax, -raw.dot(ax));
  if (u.lengthSq() < 1e-6) return v(0, 0, 1);
  return u.normalize();
}

/**
 * Centreline of the bend that enters the tube nut. Radius 6 mm, beginning at the nut face
 * (8 mm past the nipple) and turning inboard. Ordered from the loom toward the nut.
 * The arc stays at or beyond the nut face (R > line radius), so it does not re-enter the hex.
 * addLine places the last, on-axis point.
 */
function injectorBend(c: number): V3[] {
  const face = v(...injectorFace(c));
  const ax = v(...injectorAxis(c));
  const u = injectorOut(c);
  const B = face.clone().addScaledVector(ax, 8);
  const R = 6;
  const pts: V3[] = [];
  for (let deg = 150; deg >= 8; deg -= 8) {
    const phi = (deg * Math.PI) / 180;
    const p = B.clone().addScaledVector(ax, R * Math.sin(phi)).addScaledVector(u, R * (1 - Math.cos(phi)));
    pts.push([p.x, p.y, p.z]);
  }
  return pts;
}

function routeMids(id: string): V3[] {
  if (id.startsWith('inj-')) {
    const c = Number(id.slice(4));
    const i = PORT_CYL.indexOf(c);
    const s = bankOf(c) as 1 | -1;
    const zC = CYL_Z[c];
    const mids: V3[] = [bundle(i, FDZ[i]), bundle(i, zC)];
    if (s > 0) {
      // Under the distributor, just above the plenum lid. Cylinder 3 crosses behind the banjo nuts.
      const zCross = zC > -125 && zC < -35 ? -136 : zC;
      mids.push([-90, 262, zCross], [70, 260, zCross]);
      if (zCross !== zC) mids.push([96, 248, zC]);
    } else mids.push([-120, 258, zC]);
    for (let u = 0.97; u >= 0.32; u -= 0.03) mids.push(besideRunner(c, u));
    // The drop from the runner to the bend stays off the injector boss (r 15) and the nut.
    const bend = injectorBend(c);
    const tail = v(...mids[mids.length - 1]);
    const head = v(...bend[0]);
    const ax = v(...injectorAxis(c));
    const face = v(...injectorFace(c));
    const outward = injectorOut(c);
    for (let k = 1; k <= 5; k++) {
      const p = tail.clone().lerp(head, k / 6);
      const along = p.clone().sub(face).dot(ax);
      const radial = p.clone().sub(face).addScaledVector(ax, -along);
      const rd = radial.length();
      if (along < 16 && rd < 22) {
        const fixed = face.clone().addScaledVector(ax, along).addScaledVector(outward, 22);
        mids.push([fixed.x, fixed.y, fixed.z]);
      } else mids.push([p.x, p.y, p.z]);
    }
    mids.push(...bend);
    return mids;
  }
  // Feed drops below the warm-up stubs (y 286 / 304 at z −139) and stops on the filter union.
  // Return is the short line off the copper-ring union, straight onto the tank-side hex.
  // CSV drops from the distributor's inboard side port onto the valve banjo.
  if (id === 'feed') return [[-128, 256, -132]];
  if (id === 'return') return [[-81, 278, 6]];
  if (id === 'csv') return [[-20, 270, -108], [30, 236, -132]];
  return [];
}

export function wurLinesPart() {
  const p = new Part();
  // two lines, banjo + two washers at each end (1978 distributor with the push valve)
  for (const i of [0, 1] as const) {
    placeBanjo(p, WUR_FD[i], `wur-fd-${i}`);
    placeBanjo(p, WUR_BANJO[i], `wur-${i}`);
    const line = FUEL_LINES.find((l) => l.id === `wur-${i}`)!;
    // Cyl-6 window is open for x ≤ −174, y 64–188, z −220…−75. The wing rib is at z −185
    // and the hot-air socket screws sit on the end plate (z ≈ −205). Each line keeps its own
    // lane (the upper port stays above and toward the pulley) and arrives along its +Z stub.
    const stub = line.b.axis;
    const tip = line.b.point;
    const approach: V3 = [tip[0] + stub[0] * 24, tip[1] + stub[1] * 24, tip[2] + stub[2] * 24];
    const x = -208 - i * 14;
    const zLane = -166 + i * 18;
    const yTop = 300 + i * 14;
    addLine(p, line.id, line.a.point, line.a.axis, line.b.point, line.b.axis, [
      [-158, yTop, zLane],
      [x, 214, zLane],
      [x, approach[1], zLane],
      approach,
    ], LINE_R, { leadB: 12, aheadB: 24, fillet: 10 });
  }
  // Catalogue leftovers, parked above the drop and clear of both lines.
  p.add(lathe([[4, 0], [7, 0], [7, 8], [4, 8]], 14).translate(-168, 268, -96), 'brass');
  p.add(hexNut(14, 6).translate(-168, 278, -96), 'zincPlate');
  p.add(lathe([[5, 0], [8, 0], [8, 1.4], [5, 1.4]], 14).translate(-168, 266.6, -96), 'copper');
  p.add(lathe([[4.2, 0], [7.5, 0], [7.5, 1.3], [4.2, 1.3]], 14).translate(-158, 268, -108), 'copper');
  return p.g;
}

/** Cold-start fuel port (banjo + two washers) added to the valve prototype, in valve-local coordinates. */
export function csvPortLocalGeometry(p: Part) {
  const face: V3 = [0, CSV_PORT_LOCAL.y, CSV_PORT_LOCAL.faceZ];
  const frame = banjoFrame(face, [0, 0, 1], [1, 0, 0]);
  placeBanjo(p, frame, 'csv');
  // short brass boss under the banjo so the port is part of the valve
  p.add(cylBetween([0, CSV_PORT_LOCAL.y, 6], face, 5, 12), 'brass');
}

export function mixtureControlUnit() {
  const p = new Part();
  const { x, z, r } = AFM_PORT;
  // Venturi base and the distributor bracket sit on the lid face (the bevel, not the profile).
  const base = LID_Y;
  p.add(lathe([
    [r + 2, 0], [r + 6, 0], [r + 4, 6], [r - 2, 14], [r + 8, 36], [r + 10, 44], [r + 4, 44], [r - 4, 20], [r - 6, 8],
  ], 36).translate(x, base, z), 'blackPaint');
  p.add(lathe([[0.2, 0], [r - 4, 0], [r - 4, 1.4], [0.2, 1.4]], 28).translate(x, base + 16, z), 'brass');
  p.add(cyl(3.2, 5, 10).translate(x, base + 18, z), 'steel');
  // fuel distributor, zinc, on a bracket seated on the lid face
  p.add(boxMM([FD.x0, FD.y0, FD.z0], [FD.x1, FD.y1, FD.z1]), 'zincPlate');
  const bracket = boxMM([FD.x1, base, z - 8], [x - r - 4, base + 8, z + 8]);
  const flat = bracket.index ? bracket.toNonIndexed() : bracket;
  flat.deleteAttribute('normal');
  flat.computeVertexNormals();
  p.add(flat, 'zincPlate');
  placeBanjo(p, FEED_BANJO, 'feed');
  placeBanjo(p, CSV_FD_BANJO, 'csv-fd');
  // Boss ends on the banjo face. The copper washer is on the far side of that face.
  p.add(cylBetween([FD.x0, FEED_BANJO.face[1], FEED_BANJO.face[2]], FEED_BANJO.face, 6.2, 14), 'zincPlate');
  p.add(cylBetween([FD.x1, CSV_FD_BANJO.face[1], CSV_FD_BANJO.face[2]], CSV_FD_BANJO.face, 6.2, 14), 'zincPlate');
  for (const b of WUR_FD) p.add(cylBetween([b.face[0], b.face[1], FD.z0], b.face, 6.2, 14), 'zincPlate');
  // M14×1.5 return union (Bosch K-Jet test-point / return note). Copper ring sits on this face.
  unionFace(p, RETURN_FACE, RETURN_AXIS, 7, 21, 'return');
  // Metered-air barb for the auxiliary air valve. The hose itself is aux-air-plumbing.
  p.add(cylBetween([11, AFM_AUX.tip[1], AFM_AUX.tip[2]], AFM_AUX.tip, 5.2, 12), 'brass');
  return p.g;
}

/** World pose of the auxiliary air valve (prototype +Y → world −Z, +X hint world +Y). */
export function aavMatrix() {
  const Y = v(...AAV_MOUNT.normal).normalize();
  const X = v(0, 1, 0).addScaledVector(Y, -v(0, 1, 0).dot(Y)).normalize();
  const Z = new THREE.Vector3().crossVectors(X, Y).normalize();
  return new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(v(...AAV_MOUNT.origin));
}
/** The two barbs. `up` points world +Y, `down` world −Y. Tips are the hose seats. */
export function aavPorts() {
  const M = aavMatrix();
  const one = (lx: number) => {
    const tip = v(lx, 16, 0).applyMatrix4(M).toArray() as V3;
    const axis = v(Math.sign(lx) || 1, 0, 0).transformDirection(M).toArray() as V3;
    return { tip, axis };
  };
  return { up: one(26), down: one(-26) };
}

/**
 * Rubber / vacuum hose. `ahead` is the collinear run past the straight lead; keep it short
 * where a long lead would enter the shroud (the auxiliary-air valve's lower barb).
 */
function hoseCentre(a: FuelEnd, b: FuelEnd, mids: V3[], ahead = 10): V3[] {
  const A = norm(a.axis), B = norm(b.axis);
  const lead = 8;
  const a1 = add(a.point, A, lead);
  const b1 = add(b.point, B, lead);
  return filleted([a1, add(a.point, A, lead + ahead), ...mids, add(b.point, B, lead + ahead), b1], 10);
}

function addHose(p: Part, id: string, a: FuelEnd, b: FuelEnd, mids: V3[], r = 5, ahead = 10) {
  const A = norm(a.axis), B = norm(b.axis);
  const lead = 8;
  const start = add(a.point, A, 0.35);
  const end = add(b.point, B, 0.35);
  const a1 = add(a.point, A, lead);
  const b1 = add(b.point, B, lead);
  addNamed(p, id, cylBetween(start, a1, r, 8), 'rubber');
  addNamed(p, id, cylBetween(end, b1, r, 8), 'rubber');
  const pts = hoseCentre(a, b, mids, ahead);
  addNamed(p, id, tube(pts, r, 7, Math.max(16, pts.length * 3)), 'rubber');
  return pts;
}

/** Band around a hose. Major radius leaves 0.2 mm of air on the tube, so the wire does not cut it. */
function hoseClampAt(p: Part, pts: V3[], u: number, hoseR: number) {
  const n = pts.length - 1;
  const f = Math.min(0.98, Math.max(0.02, u)) * n;
  const i = Math.min(n - 1, Math.floor(f));
  const t = f - i;
  const p0 = v(...pts[i]), p1 = v(...pts[Math.min(n, i + 1)]);
  const c = p0.clone().lerp(p1, t);
  const tan = p1.clone().sub(p0);
  if (tan.lengthSq() < 1e-8) return;
  tan.normalize();
  const g = torus(hoseR + 0.9, 0.7, 6, 16);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan));
  g.translate(c.x, c.y, c.z);
  p.add(g, 'zincPlate');
}

function vacTPorts() {
  const [ox, oy, oz] = VAC_T.origin;
  return {
    minusX: { tip: [ox - 14, oy, oz] as V3, axis: [-1, 0, 0] as V3 },
    plusX: { tip: [ox + 14, oy, oz] as V3, axis: [1, 0, 0] as V3 },
    plusZ: { tip: [ox, oy, oz + 28] as V3, axis: [0, 0, 1] as V3 },
  };
}
function vacLimitPort() {
  const [ox, oy, oz] = VAC_LIMIT.origin;
  return { tip: [ox + 22, oy + 10, oz] as V3, axis: [1, 0, 0] as V3 };
}

/** Every air and vacuum hose. Fuel lines stay in FUEL_LINES. Both ends are real fittings. */
export function serviceHoses(): FuelLineDef[] {
  const aav = aavPorts();
  const t = vacTPorts();
  const lim = vacLimitPort();
  return [
    { id: 'aux-meter', part: 'aux-air-plumbing', a: endOf('mixture-control-unit', AFM_AUX.tip, AFM_AUX.axis), b: endOf('aux-air-valve', aav.up.tip, aav.up.axis) },
    { id: 'aux-manifold', part: 'aux-air-plumbing', a: endOf('aux-air-valve', aav.down.tip, aav.down.axis), b: endOf('plenum', PLENUM_AUX.tip, PLENUM_AUX.axis) },
    { id: 'vac-manifold', part: 'vacuum-fittings', a: endOf('plenum', MANIFOLD_VAC.tip, MANIFOLD_VAC.axis), b: endOf('vacuum-fittings', t.minusX.tip, t.minusX.axis) },
    { id: 'vac-limiter', part: 'vacuum-fittings', a: endOf('vacuum-fittings', t.plusX.tip, t.plusX.axis), b: endOf('vacuum-limiter', lim.tip, lim.axis) },
    { id: 'vac-distributor', part: 'vacuum-fittings', a: endOf('vacuum-fittings', t.plusZ.tip, t.plusZ.axis), b: endOf('distributor', DIST_VAC.tip, DIST_VAC.axis) },
  ];
}

export function auxAirPlumbingPart() {
  const p = new Part();
  const lines = serviceHoses().filter((h) => h.part === 'aux-air-plumbing');
  const meter = lines[0], mani = lines[1];
  const meterPts = addHose(p, meter.id, meter.a, meter.b, [[50, 274, -86]]);
  // Lower barb points down at the shroud roof (y 153.5). Stay under the valve body (r 20
  // about y 200) and above the roof, then come up onto the plenum pipe past the body.
  const maniPts = addHose(p, mani.id, mani.a, mani.b, [[48, 164, -128], [32, 168, -148]], 5, 2);
  for (const u of [0.25, 0.62]) hoseClampAt(p, meterPts, u, 5);
  for (const u of [0.3, 0.7]) hoseClampAt(p, maniPts, u, 5);
  return p;
}

export function vacuumHosesPart() {
  const p = new Part();
  const lines = serviceHoses().filter((h) => h.part === 'vacuum-fittings');
  const [mani, lim, dist] = lines;
  addHose(p, mani.id, mani.a, mani.b, [[-22, 274, 52]], 3.2);
  // Limiter barb points +X, so the hose runs past it and turns back into the tip.
  addHose(p, lim.id, lim.a, lim.b, [[70, 268, 40], [108, 270, -20], [108, 268, -72]], 3.2);
  // Left of the cap (cap reaches about x −135) and above the lead that drops at y 188.
  addHose(p, dist.id, dist.a, dist.b, [[-40, 278, 110], [-190, 240, 130], [-186, 200, 146]], 3.2);
  return p;
}

/**
 * Vertical clip just outboard of the injector ribbon (ribbon x −134, heights 274…314).
 * The plate stays 12 mm clear of the tubes; the fingers stop short of them.
 */
export const LINE_CLIP = { x: -148, y0: 266, y1: 326, z: -80, depth: 20 };
