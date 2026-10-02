/**
 * 1978 CIS induction and fuel circuit (US type 930/04, not California).
 * Plenum, runners, sleeves, mixture-control unit and every fuel-line end.
 * Shapes follow Porsche Kat 502 USA 911 '83 (illustrations 106-00, 107-00, 107-10).
 * Dimensions: K = printed, E = scaled from the drawing (see docs/engine-spec.md and docs/photo-refs.md).
 */
import * as THREE from 'three';
import {
  Part, V3, lathe, boxMM, cyl, cylBetween, extrude, roundRect, circlePath, hexNut, tube, torus, mesh, cutGroup, csgSub, spring,
} from './util';
import { CYL_Z, INTAKE_PORT, INJ, bankOf } from '../data/layout';
import { DIST_VAC_NIPPLE } from './aux';

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
/** Rubber sleeve 928 110 158 01. OD E from FVD 911 110 885 02. Length 32 mm is inside the 30–35 mm band (E). */
export const SLEEVE = {
  od: 47,
  len: 32,
  /** ID equals the 44 mm stub and the runner spigot. The rubber is stretched on; the walls coincide. */
  id: 44,
  /** Metal-to-metal gap inside the sleeve (E). Each end is covered by 12 mm of rubber. */
  gap: 8,
};
export const STUB_TIP_X = BOX.faceX + BOX.stubLen; // 105.5
export const RUNNER_TIP_X = STUB_TIP_X + SLEEVE.gap; // 113.5
export const SLEEVE_IN_X = STUB_TIP_X - (SLEEVE.len - SLEEVE.gap) / 2; // 93.5
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
/**
 * Spare branch of the vacuum tee (107-10 #14). Seat for the diverter-valve hose
 * 108-00 #31 (999 239 003 40). That hose is Bottom End's air-hose-vacuum; this
 * model keeps the barb and does not draw a line off it. The tee already reaches
 * MANIFOLD_VAC. Axis points out of the fitting, down, the way that hose leaves.
 */
export const TEE_AIR_INJ = {
  point: [-86, 328, -16] as V3,
  axis: [0, -1, 0] as V3,
};
/**
 * Ported-vacuum nipple on the throttle housing (107-10 #4). Seat for the EGR hose
 * 202-05 #16 (999 239 003 40, 770 mm). That illustration is not in the extract.
 * Point is THROTTLE.y + 8, THROTTLE.zFace + 18. Axis points out toward the pulley.
 */
export const THROTTLE_PORTED_VAC = {
  point: [36, THROTTLE.y + 8, THROTTLE.zFace + 18] as V3,
  axis: [0, 0, 1] as V3,
};
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
  /** Part that owns the copper-ring meshes. Defaults to `part`. */
  washerPart?: string;
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

/**
 * Banjo bolt 911 110 899 00. Sealing ring A 8×11.5 (ID 8, OD 11.5) is K from 107-10 #24/#60.
 * Thickness 1.2 mm is E. The eye bore clears an M8 shank. +Y is the bolt; local +Z is the stub.
 */
export const BANJO = {
  washerT: 1.2,
  washerRi: 4,
  washerRo: 5.75,
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
  const { washerT: t, eyeRo, eye0, eye1, stubR, stubTip, eyeY } = BANJO;
  // Eye starts where the inner A 8×11.5 ring ends. The nut starts where the outer ring ends.
  p.add(lathe([[4.1, eye0], [eyeRo, eye0], [eyeRo, eye1], [4.1, eye1]], 18), 'brass');
  p.add(cylBetween([0, eyeY, eyeRo - 0.2], [0, eyeY, stubTip], stubR, 10), 'brass');
  p.add(hexNut(12, 4.6).translate(0, eye1 + t + 2.3, 0), 'zincPlate');
  return p;
}

/** Copper A 8×11.5 ring in banjo-local coordinates (y = bolt axis, origin on the port face). */
function banjoWasherGeo(y0: number) {
  const { washerT: t, washerRi: ri, washerRo: ro } = BANJO;
  return lathe([[ri, y0], [ro, y0], [ro, y0 + t], [ri, y0 + t]], 16);
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

// ---------------------------------------------------------------- fuel distributor (Kat 502 p106, fig 107-00 #1)
// Footprint E 80 × 40 × 88 mm, unchanged so the fuel lines still land.
// Outlet circle Ø76 (E, scaled from the A 8×11.5 ring on the same page).
// Lower housing is waisted, with vertical ribs. The joint to the upper housing is at mid-height.
// Outlet towers are hex bosses 15 mm proud of the upper housing (E, from the drawing).
const FD = { x0: -150, x1: -70, y0: 266, y1: 306, z0: -120, z1: -32 };
export const FD_CX = (FD.x0 + FD.x1) / 2;
export const FD_CZ = (FD.z0 + FD.z1) / 2;
/** Outlet-circle radius, mm. Ø76 E. */
export const FD_RING_R = 38;
/** Hex tower height above the upper housing, mm. E from fig 107-00. */
const TOWER = 15;

/** Cylinder and plan angle (deg from +X) of each injector outlet. Left bank is the −X half. */
const OUTLETS: { c: number; deg: number }[] = [
  { c: 6, deg: 200 }, { c: 5, deg: 160 }, { c: 4, deg: 120 },
  { c: 3, deg: 60 }, { c: 2, deg: 20 }, { c: 1, deg: -20 },
];
/** Port i feeds this cylinder. */
const PORT_CYL = OUTLETS.map((o) => o.c);
/**
 * Catalogue 107-10 #24 is qty 8. The drawing shows a ring each side of every injector eye (12).
 * These four cylinders carry the eight #24 rings. Cylinders 1 and 4 carry the same rings on the
 * distributor casting so the drawing is complete; the text has no line for those four.
 */
const RING_CYLS = new Set([2, 3, 5, 6]);

function injBanjo(deg: number) {
  const a = deg * Math.PI / 180;
  const face: V3 = [FD_CX + FD_RING_R * Math.cos(a), FD.y1 + TOWER, FD_CZ + FD_RING_R * Math.sin(a)];
  return banjoFrame(face, [0, 1, 0], [Math.cos(a), 0, Math.sin(a)]);
}
const INJ_BANJOS = OUTLETS.map((o) => injBanjo(o.deg));

/** Cold-start banjo on the inboard face (107-10 #59, one of three). Stub runs toward the flywheel. */
const CSV_FD_BANJO = banjoFrame([FD.x1, 288, -100], [1, 0, 0], [0, 0, -1]);
/**
 * Screw socket 107-10 #49 (911 110 160 01) on the raised hub, top centre.
 * Control-pressure line #51 leaves here on a union nut. Not a #59 banjo: those three
 * are the warm-up, cold-start and distributor cold-start bolts. #61 is the return,
 * on the −X M12, not this port.
 */
const FD_HUB_TOP = FD.y1 + 8;
const WUR_SOCKET = { face: [FD_CX, FD_HUB_TOP + 8, FD_CZ] as V3, axis: [0, 1, 0] as V3 };
/** Casting under the #49 socket: a plain hub, not a second fitting. */
export const FD_HUB = { y0: FD.y1, y1: FD_HUB_TOP, r: 11 };
/** M12 connection pieces 107-10 #57. `ret` is the return (#61). `out` is the line that leaves the engine (#62). */
const M12_RET = { face: [FD.x0, 286, -90] as V3, axis: [-1, 0, 0] as V3 };
const M12_OUT = { face: [FD_CX, 290, FD.z1] as V3, axis: [0, 0, 1] as V3 };
/** Far end of 930 110 514 00. The union nut is part of the line; the tank is off the engine. */
const FEED_END = { face: [-128, 304, 36] as V3, axis: [0, 0, -1] as V3 };

/**
 * Warm-up regulator fuel ports on the TOP (Kat 502 p110, fig 107-10 #52 and #59).
 * Connection piece for line #51 sits on the pulley-side pad; the banjo for line #61
 * sits on the flywheel-side pad. Both are clear of the dome at z −170.
 */
export const WUR_CONN = { face: [-62, 142, -140] as V3, axis: [0, 1, 0] as V3 };
const WUR_BANJO = banjoFrame([-86, 134, -183], [0, 1, 0], [-1, 0, 0]);

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
    // 930 110 513 00 (#61): warm-up banjo to the return-side M12.
    id: 'fuelA',
    part: 'fuel-lines',
    a: endOf('wur-lines', WUR_BANJO.tip, WUR_BANJO.stub),
    b: endOf('mixture-control-unit', M12_RET.face, M12_RET.axis),
  },
  {
    // 930 110 514 00 (#62): the other M12, running away from the engine centre.
    id: 'fuelB',
    part: 'fuel-lines',
    a: endOf('mixture-control-unit', M12_OUT.face, M12_OUT.axis),
    b: endOf('fuel-lines', FEED_END.face, FEED_END.axis),
  },
  {
    // 930 110 570 00 (#63): distributor banjo to the cold-start banjo.
    id: 'fuelC',
    part: 'fuel-lines',
    a: endOf('wur-lines', CSV_FD_BANJO.tip, CSV_FD_BANJO.stub),
    b: endOf('wur-lines', CSV_BANJO.tip, CSV_BANJO.stub),
  },
  {
    // 930 110 502 00 (#51): union nuts, from screw socket #49 on the distributor hub to connection piece #52.
    id: 'wur-51',
    part: 'wur-lines',
    a: endOf('mixture-control-unit', WUR_SOCKET.face, WUR_SOCKET.axis),
    b: endOf('warm-up-regulator', WUR_CONN.face, WUR_CONN.axis),
  },
];

/**
 * Every banjo or union on the fuel distributor, and the point its one fuel line ends on.
 * Six injector banjos, the cold-start banjo, two M12 unions (#57) and screw socket #49.
 */
export function distributorFuelSeats(): { id: string; point: V3 }[] {
  return [
    ...PORT_CYL.map((c, i) => ({ id: `inj-${c}`, point: INJ_BANJOS[i].tip })),
    { id: 'csv-fd', point: CSV_FD_BANJO.tip },
    { id: 'm12-ret', point: M12_RET.face },
    { id: 'm12-out', point: M12_OUT.face },
    { id: 'wur-socket', point: WUR_SOCKET.face },
  ];
}

export const FUEL_BANJOS: BanjoDef[] = [
  ...PORT_CYL.map((c, i): BanjoDef => ({
    id: `inj-${c}`,
    part: 'injection-banjos',
    washerPart: RING_CYLS.has(c) ? 'injection-line-rings' : 'mixture-control-unit',
    face: INJ_BANJOS[i].face,
    axis: INJ_BANJOS[i].axis,
    washers: INJ_BANJOS[i].washers,
  })),
  { id: 'csv-fd', part: 'wur-lines', face: CSV_FD_BANJO.face, axis: CSV_FD_BANJO.axis, washers: CSV_FD_BANJO.washers },
  { id: 'csv', part: 'wur-lines', face: CSV_BANJO.face, axis: CSV_BANJO.axis, washers: CSV_BANJO.washers },
  { id: 'wur', part: 'wur-lines', face: WUR_BANJO.face, axis: WUR_BANJO.axis, washers: WUR_BANJO.washers },
];

/** Six distributor banjos (107-10 #25), one per injector line. */
export function injectorBanjoMatrices() {
  return INJ_BANJOS.map((b) => b.matrix);
}

/** Seat (y = 0) of one A 8×11.5 ring. `y0` is along the bolt from the port face. */
function washerSeat(face: V3, axis: V3, y0: number): { p: V3; n: V3 } {
  return { p: add(face, axis, y0), n: axis };
}

/**
 * The eight 107-10 #24 rings: both sides of the eyes for cylinders 2, 3, 5 and 6.
 * `p` is the ring's seat (local y = 0), not its mid-thickness.
 */
export function sealRingFrames(): { p: V3; n: V3 }[] {
  const rings: { p: V3; n: V3 }[] = [];
  PORT_CYL.forEach((c, i) => {
    if (!RING_CYLS.has(c)) return;
    const { face, axis } = INJ_BANJOS[i];
    rings.push(washerSeat(face, axis, 0));
    rings.push(washerSeat(face, axis, BANJO.eye1));
  });
  return rings;
}

export function bootFrames() {
  return CYLS.map((c) => {
    const s = bankOf(c) as 1 | -1;
    const z = stubZOf(c);
    return { c, origin: [s * SLEEVE_IN_X, BOX.stubY, z] as V3, axis: [s, 0, 0] as V3 };
  });
}
/** Two worm-drive clamps per sleeve. Screw housing points up (+Y). Stations sit on the 32 mm sleeve. */
export function clampFrames() {
  return bootFrames().flatMap(({ origin, axis }) => [8, 24].map((t) => ({
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
  fit?: { leadA?: number; aheadA?: number; leadB?: number; aheadB?: number; fillet?: number },
) {
  const A = norm(dirA), B = norm(dirB);
  const leadA = fit?.leadA ?? 16, leadB = fit?.leadB ?? 16;
  const aheadA = fit?.aheadA ?? 30, aheadB = fit?.aheadB ?? 30;
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
  // One fitting: the eye, stub, the two A 8×11.5 rings and the nut are one sub-solid.
  const group = new THREE.Group();
  group.name = `banjo:${id}`;
  g.traverse((o) => {
    const me = o as THREE.Mesh;
    if (!me.isMesh) return;
    const geo = me.geometry.clone().applyMatrix4(frame.matrix.clone().multiply(me.matrixWorld));
    group.add(new THREE.Mesh(geo, me.material));
  });
  for (const y0 of [0, BANJO.eye1]) {
    const w = banjoWasherGeo(y0);
    w.applyMatrix4(frame.matrix);
    group.add(mesh(w, 'copper'));
  }
  p.g.add(group);
}

/** Bored union nut just outside a face. The line passes through the bore. */
function lineNut(p: Part, face: V3, axis: V3, id: string) {
  const Y = v(...axis).normalize();
  const ref = Math.abs(Y.y) < 0.9 ? v(0, 1, 0) : v(1, 0, 0);
  const Xx = new THREE.Vector3().crossVectors(Y, ref).normalize();
  const Z = new THREE.Vector3().crossVectors(Xx, Y).normalize();
  const h = 6;
  const m = new THREE.Matrix4().makeBasis(Xx, Y, Z).setPosition(v(...face).addScaledVector(Y, h / 2 + 1.4));
  const nut = csgSub(hexNut(14, h), cyl(3.2, h + 2, 12));
  nut.applyMatrix4(m);
  const group = new THREE.Group();
  group.name = `fitting:${id}`;
  group.add(mesh(nut, 'zincPlate'));
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
  // Round opening for the separate throttle housing (107-10 #4). Ø67.5 is the O-ring ID (K).
  p.add(cylBetween([0, THROTTLE.y, z1 - 6], [0, THROTTLE.y, z1], 33.75, 28), 'machinedAlu');
  // cold-start boss on the flywheel end, spraying into the lower chamber (no 1980 spider)
  p.add(boxMM([-24, stubY - 16, -106], [24, stubY + 16, z0]), 'castAlu');
  // Auxiliary-air discharge spigot, flywheel face, clear of the cold-start boss (x ±24).
  p.add(cylBetween([PLENUM_AUX.tip[0], PLENUM_AUX.tip[1], -94], PLENUM_AUX.tip, 4.6, 12), 'brass');
  // Manifold-vacuum nipple on the lid, downstream of the throttle.
  p.add(cylBetween([MANIFOLD_VAC.tip[0], y1 - 0.8, MANIFOLD_VAC.tip[2]], MANIFOLD_VAC.tip, 3.4, 10), 'brass');
  // Tray lip on the top edge of the distributor box (housing 911 110 106 13). The pulley edge
  // stays outside the throttle flange (r 42 about y 222). 4 × 6 mm, E.
  const lip = 4;
  const yL0 = y1 - 6;
  p.add(boxMM([-faceX, yL0, z0 - lip], [faceX, y1, z0]), 'castAlu');
  p.add(boxMM([-faceX, yL0, z1], [-44, y1, z1 + lip]), 'castAlu');
  p.add(boxMM([44, yL0, z1], [faceX, y1, z1 + lip]), 'castAlu');
  for (const s of [1, -1] as const) {
    p.add(boxMM([s * faceX, yL0, z0 + 6], [s * (faceX + lip), y1, z1 - 6]), 'castAlu');
  }
  const cuts = [
    ...BOX.stubZ.flatMap((z) => [1, -1].map((s) => cylBetween([s * (faceX - 16), stubY, z], [s * (faceX + stubLen + 2), stubY, z], portId / 2, 20))),
    cylBetween([0, THROTTLE.y, z1 - 16], [0, THROTTLE.y, z1 + 4], 28, 20),
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
  // Rubber seat sleeve in the injector bore (106-00 #29 / #30 sit on the injector; this band is the visible seat).
  {
    const Yax = ax.clone().normalize();
    const ref = Math.abs(Yax.y) < 0.9 ? v(0, 1, 0) : v(1, 0, 0);
    const Xx = new THREE.Vector3().crossVectors(Yax, ref).normalize();
    const Zz = new THREE.Vector3().crossVectors(Xx, Yax).normalize();
    const m = new THREE.Matrix4().makeBasis(Xx, Yax, Zz).setPosition(origin.clone().addScaledVector(Yax, 8));
    const seat = lathe([[8, 0], [11.4, 0], [11.4, 10], [8, 10]], 16);
    seat.applyMatrix4(m);
    p.add(seat, 'rubber');
  }
  // Casting web on the side of the riser. Length changes with the cylinder so the six pipes read as different castings.
  const rib = 8 + (c % 3) * 5;
  const side = c % 2 === 0 ? 1 : -1;
  p.add(boxMM([-3, 26, side * 14], [3, 26 + rib, side * 22]), 'castAlu');
  // Pipe 3 (911 110 480 06) carries two M8×20 studs on the side of the riser. No 3A row in the text extract.
  if (c === 3) {
    for (const yStud of [30, 42]) p.add(cylBetween([0, yStud, 14], [0, yStud, 34], 4, 12), 'darkSteel');
  }
  const boreA = origin.clone().addScaledVector(ax, -2);
  const boreB = origin.clone().addScaledVector(ax, 120);
  return cutGroup(p.g, cylBetween(boreA.toArray() as V3, boreB.toArray() as V3, 12, 16));
}

export function injector() {
  const p = new Part();
  // Male thread on top (107-10 #21). No sealing ring and no tube nut: the line's union nut screws on.
  p.add(lathe([
    [0.1, 0], [3.2, 0], [4.8, 5], [6.0, 7], [6.0, 33],
    [3.4, 35], [3.4, INJ_FACE], [0.1, INJ_FACE],
  ], 20), 'steel');
  p.add(hexNut(13, 5).translate(0, 36, 0), 'brass');
  return p.g;
}

export function fuelLines() {
  const p = new Part();
  // Far union of 930 110 514 00. The nut is the end of the line; the tank fitting is off the engine.
  unionFace(p, FEED_END.face, FEED_END.axis, 6, 17, 'fuelB-end');
  for (const c of PORT_CYL) {
    // Union nut on the injector's male thread. Bore r 3.6 clears the r 3.4 thread.
    const face = injectorFace(c);
    const axis = injectorAxis(c);
    const Y = v(...axis).normalize();
    const ref = Math.abs(Y.y) < 0.9 ? v(0, 1, 0) : v(1, 0, 0);
    const Xx = new THREE.Vector3().crossVectors(Y, ref).normalize();
    const Z = new THREE.Vector3().crossVectors(Xx, Y).normalize();
    const nutH = 7;
    const m = new THREE.Matrix4().makeBasis(Xx, Y, Z).setPosition(v(...face).addScaledVector(Y, nutH / 2 + 0.4));
    const nut = csgSub(hexNut(14, nutH), cyl(3.6, nutH + 1.4, 12));
    nut.applyMatrix4(m);
    const group = new THREE.Group();
    group.name = `fitting:inj-${c}`;
    group.add(mesh(nut, 'zincPlate'));
    p.g.add(group);
  }
  for (const line of FUEL_LINES.filter((l) => l.part === 'fuel-lines')) {
    const mids = routeMids(line.id);
    const fit = line.id.startsWith('inj-')
      ? { leadA: 8, aheadA: 10, leadB: 6, aheadB: 6, fillet: 6 }
      : line.id === 'fuelA'
        ? { leadA: 4, aheadA: 6, leadB: 10, aheadB: 14, fillet: 8 }
        : { leadA: 12, aheadA: 16, leadB: 10, aheadB: 14, fillet: 10 };
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
    const banjo = INJ_BANJOS[i];
    // Same hook on every injector. The straight span is the only piece that changes with the
    // head pitch: one rigid tube cannot sit on the Ø76 ring and also span 118 mm.
    // Each line has its own height on a spine outboard of the distributor, then crosses
    // the flywheel side of the plenum (z −145) so the six tubes never share a point.
    const out = add(banjo.tip, banjo.stub, 10);
    const near = besideRunner(c, 0.97);
    // Left bank drops below the distributor (y 266) while still outboard of it, then
    // reaches the runner. A chord at the stub z and y 300 crosses the block.
    // Right bank crosses on the flywheel side of the plenum (z −148) and rises to the
    // runner offset outboard of the Ø44 spigot. y 224 at the spigot x sits in the pipe.
    const mids: V3[] = [out];
    if (s < 0) {
      const laneY = 300 + i * 6;
      const xOut = -158 - i * 8;
      mids.push(
        [Math.min(out[0], -164), laneY, out[2]],
        [xOut, laneY, out[2]],
        [xOut, 248, out[2]],
        [xOut, 248, near[2]],
      );
    } else {
      const k = i - 3;
      const laneY = 262 + k * 8;
      const xHigh = 168 + k * 10;
      const xFwd = 196 + k * 6;
      // Each line keeps its own height and its own x, so the three never share a segment.
      // The forward run is below the Ø131 bell and inboard of the injector-axis limit.
      mids.push(
        [-28, laneY, -148],
        [xHigh, laneY, -148],
        [xFwd, 224, -148],
        [xFwd, 224, near[2]],
        [xFwd, near[1], near[2]],
      );
    }
    for (let u = 0.97; u >= 0.32; u -= 0.03) mids.push(besideRunner(c, u));
    const bend = injectorBend(c);
    const tail = v(...mids[mids.length - 1]);
    const head = v(...bend[0]);
    const ax = v(...injectorAxis(c));
    const face = v(...injectorFace(c));
    const outward = injectorOut(c);
    for (let k = 1; k <= 5; k++) {
      const pt = tail.clone().lerp(head, k / 6);
      const along = pt.clone().sub(face).dot(ax);
      const radial = pt.clone().sub(face).addScaledVector(ax, -along);
      const rd = radial.length();
      if (along < 16 && rd < 22) {
        const fixed = face.clone().addScaledVector(ax, along).addScaledVector(outward, 22);
        mids.push([fixed.x, fixed.y, fixed.z]);
      } else mids.push([pt.x, pt.y, pt.z]);
    }
    mids.push(...bend);
    return mids;
  }
  // #61 (930 110 513 00) is the warm-up return. Fig 107-10 runs it from banjo #59
  // to the return-side M12 connection piece #57 on the −X face, not the pulley-face outlet (#62).
  // Drop under the shroud slot, step pulley-ward of the plug-lead crossing (z −180, y 168),
  // then climb inside the slot and around the flywheel face of the distributor.
  if (id === 'fuelA') return [[-110, 122, -183], [-110, 122, -158], [-86, 122, -158], [-86, 300, -158], [-176, 300, -162], [-176, 280, -96]];
  // #62 leaves the pulley face and stops on its own union nut, outboard of the strut columns.
  if (id === 'fuelB') return [[-128, 308, 8]];
  // #63 stays flywheel of the plenum (z < −96) so it never crosses the lid.
  if (id === 'fuelC') return [[-40, 248, -152], [8, 236, -152], [20, 226, -145]];
  return [];
}

export function wurLinesPart() {
  const p = new Part();
  // The three 107-10 #59 banjos and their six #60 rings live here, not on the valve or the regulator.
  placeBanjo(p, CSV_FD_BANJO, 'csv-fd');
  placeBanjo(p, CSV_BANJO, 'csv');
  placeBanjo(p, WUR_BANJO, 'wur');
  const line = FUEL_LINES.find((l) => l.id === 'wur-51')!;
  // Union nuts sit on the line side of each face so they do not enter the distributor or the regulator.
  // #51 leaves the top-centre screw socket upward, steps flywheel of the outlet towers, then drops
  // outboard of the #61 return (which runs at y 300, z −158) onto connection piece #52.
  lineNut(p, WUR_SOCKET.face, WUR_SOCKET.axis, 'wur-socket-nut');
  lineNut(p, WUR_CONN.face, WUR_CONN.axis, 'wur-conn-nut');
  addLine(p, line.id, line.a.point, line.a.axis, line.b.point, line.b.axis, [
    [-110, 348, -130],
    [-130, 330, -158],
    [-160, 260, -155],
    [-165, 190, -145],
    [-70, 168, -140],
  ], LINE_R, { leadA: 10, aheadA: 16, leadB: 8, aheadB: 12, fillet: 10 });
  return p.g;
}

/** Brass port boss. The banjo (107-10 #59) is a separate mesh in wur-lines and seats on this face. */
export function csvPortLocalGeometry(p: Part) {
  const face: V3 = [0, CSV_PORT_LOCAL.y, CSV_PORT_LOCAL.faceZ];
  p.add(cylBetween([0, CSV_PORT_LOCAL.y, 6], face, 5.5, 12), 'brass');
}

export function mixtureControlUnit() {
  const p = new Part();
  const { x, z, r } = AFM_PORT;
  // Venturi base and the distributor bracket sit on the lid face (the bevel, not the profile).
  const base = LID_Y;
  p.add(lathe([
    [r + 2, 0], [r + 6, 0], [r + 4, 6], [r - 2, 14], [r + 8, 36], [r + 10, 44], [r + 4, 44], [r - 4, 20], [r - 6, 8],
  ], 36).translate(x, base, z), 'blackPaint');
  // Flange the six spring screws sit on (107-10 #1). Top face is base + 6.
  p.add(lathe([[r + 4, 4.8], [46, 4.8], [46, 6], [r + 4, 6]], 36).translate(x, base, z), 'blackPaint');
  p.add(lathe([[0.2, 0], [r - 4, 0], [r - 4, 1.4], [0.2, 1.4]], 28).translate(x, base + 16, z), 'brass');
  p.add(cyl(3.2, 5, 10).translate(x, base + 18, z), 'steel');
  // Fuel distributor 911 110 967 00 (Kat 502 p106, fig 107-00). Same 80 × 40 × 88 footprint.
  // Waisted lower housing, joint at mid-height, separate upper housing, hex towers, centre hub.
  const yJoint = (FD.y0 + FD.y1) / 2;
  const inset = 4.5;
  p.add(boxMM([FD.x0, FD.y0, FD.z0], [FD.x1, FD.y0 + 5, FD.z1]), 'zincPlate');
  p.add(boxMM([FD.x0 + inset, FD.y0 + 5, FD.z0 + inset], [FD.x1 - inset, yJoint - 5, FD.z1 - inset]), 'zincPlate');
  p.add(boxMM([FD.x0, yJoint - 5, FD.z0], [FD.x1, yJoint, FD.z1]), 'zincPlate');
  // Vertical ribs fill the waist out to the footprint so the lower housing reads as fluted, not a cube.
  const ribW = 3.2;
  for (const xOuter of [FD.x0, FD.x1]) {
    const sign = xOuter < FD_CX ? -1 : 1;
    const xIn = xOuter - sign * inset;
    for (const z of [-112, -100, -78, -56, -44]) {
      if (sign < 0 && Math.abs(z + 90) < 8) continue;
      if (sign > 0 && Math.abs(z - FD_CZ) < 12) continue;
      p.add(boxMM([Math.min(xOuter, xIn), FD.y0, z - ribW / 2], [Math.max(xOuter, xIn), yJoint, z + ribW / 2]), 'zincPlate');
    }
  }
  for (const zOuter of [FD.z0, FD.z1]) {
    const sign = zOuter < FD_CZ ? -1 : 1;
    const zIn = zOuter - sign * inset;
    for (const x of [-140, -124, -96, -80]) {
      p.add(boxMM([x - ribW / 2, FD.y0, Math.min(zOuter, zIn)], [x + ribW / 2, yJoint, Math.max(zOuter, zIn)]), 'zincPlate');
    }
  }
  // Upper housing steps in at the joint so the split reads at mid-height.
  p.add(boxMM([FD.x0 + 1.6, yJoint, FD.z0 + 1.6], [FD.x1 - 1.6, FD.y1, FD.z1 - 1.6]), 'zincPlate');
  // Raised hub. Screw socket #49 stands on it; line #51's union nut is in wur-lines.
  p.add(cyl(FD_HUB.r, FD_HUB.y1 - FD_HUB.y0, 20).translate(FD_CX, (FD_HUB.y0 + FD_HUB.y1) / 2, FD_CZ), 'zincPlate');
  {
    const socket = new THREE.Group();
    socket.name = 'fitting:wur-socket';
    socket.add(mesh(cylBetween([FD_CX, FD_HUB.y1 - 1, FD_CZ], WUR_SOCKET.face, 4, 14), 'brass'));
    const ring = lathe([[4.2, 0], [7.2, 0], [7.2, 1.2], [4.2, 1.2]], 16);
    ring.translate(...WUR_SOCKET.face);
    socket.add(mesh(ring, 'copper'));
    p.g.add(socket);
  }
  for (const b of INJ_BANJOS) {
    const hex = hexNut(16, TOWER);
    hex.translate(b.face[0], FD.y1 + TOWER / 2, b.face[2]);
    p.add(hex, 'zincPlate');
  }
  // Side inlet boss on the +X face. Outer face at x −64, inside the air-flow meter.
  p.add(cylBetween([FD.x1 - 6, 286, FD_CZ], [-64, 286, FD_CZ], 8, 16), 'zincPlate');
  // The four rings the text does not list (cylinders 1 and 4), so every eye matches the drawing.
  for (const c of [1, 4]) {
    const i = PORT_CYL.indexOf(c);
    const { face, axis } = INJ_BANJOS[i];
    for (const y0 of [0, BANJO.eye1]) {
      const w = banjoWasherGeo(y0);
      w.applyMatrix4(INJ_BANJOS[i].matrix);
      // banjoWasherGeo is already in local y; the matrix maps local y onto the bolt.
      // y0 is local, and the matrix origin is the face, so this is correct.
      p.add(w, 'copper');
    }
    void face; void axis;
  }
  p.add(cylBetween([FD.x1 - 8, CSV_FD_BANJO.face[1], CSV_FD_BANJO.face[2]], CSV_FD_BANJO.face, 6.2, 12), 'zincPlate');
  // Two M12 connection pieces #57. Rings #58 sit on the faces. Socket #49 is on the hub, above.
  p.add(cylBetween([FD.x0 + 8, M12_RET.face[1], M12_RET.face[2]], M12_RET.face, 6, 12), 'brass');
  p.add(lathe([[5.2, 0], [8.2, 0], [8.2, 1.2], [5.2, 1.2]], 14).rotateZ(Math.PI / 2).translate(...M12_RET.face), 'copper');
  p.add(cylBetween([M12_OUT.face[0], M12_OUT.face[1], FD.z1 - 8], M12_OUT.face, 6, 12), 'brass');
  p.add(lathe([[5.2, 0], [8.2, 0], [8.2, 1.2], [5.2, 1.2]], 14).rotateX(Math.PI / 2).translate(...M12_OUT.face), 'copper');
  const bracket = boxMM([FD.x1, base, z - 8], [x - r - 4, base + 8, z + 8]);
  const flat = bracket.index ? bracket.toNonIndexed() : bracket;
  flat.deleteAttribute('normal');
  flat.computeVertexNormals();
  p.add(flat, 'zincPlate');
  // Outlet bell Ø131 (E from clamp S 131/9). The bell sits above the boot face, under the shell.
  const mouth = BOOT_METER.tip;
  // The duct stays above the boot face. The bell is the only metal between that face and the duct.
  p.add(tube([
    [x, base + 44, z],
    [20, 316, -72],
    [mouth[0], 320, mouth[2] - 20],
    [mouth[0], 320, mouth[2]],
  ], 12, 10, 24), 'blackPaint');
  p.add(cylBetween([mouth[0], 318, mouth[2]], [mouth[0], mouth[1] + 14, mouth[2]], 12, 16), 'blackPaint');
  // Bell stops 0.4 mm short of the boot face so the two solids meet instead of occupying one disk.
  p.add(cylBetween([mouth[0], mouth[1] + 14, mouth[2]], [mouth[0], mouth[1] + 0.4, mouth[2]], BOOT_METER.r, 28), 'blackPaint');
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
function hoseCentre(a: FuelEnd, b: FuelEnd, mids: V3[], ahead = 10, lead = 8, leadB = lead, fillet = 10): V3[] {
  const A = norm(a.axis), B = norm(b.axis);
  const a1 = add(a.point, A, lead);
  const b1 = add(b.point, B, leadB);
  return filleted([a1, add(a.point, A, lead + ahead), ...mids, add(b.point, B, leadB + ahead), b1], fillet);
}

function addHose(p: Part, id: string, a: FuelEnd, b: FuelEnd, mids: V3[], r = 5, ahead = 10, lead = 8, leadB = lead, fillet = 10) {
  const A = norm(a.axis), B = norm(b.axis);
  const start = add(a.point, A, 0.35);
  const end = add(b.point, B, 0.35);
  const a1 = add(a.point, A, lead);
  const b1 = add(b.point, B, leadB);
  addNamed(p, id, cylBetween(start, a1, r, 8), 'rubber');
  addNamed(p, id, cylBetween(end, b1, r, 8), 'rubber');
  const pts = hoseCentre(a, b, mids, ahead, lead, leadB, fillet);
  addNamed(p, id, tube(pts, r, 7, Math.max(16, pts.length * 3)), 'rubber');
  return pts;
}

/** Band around a hose. Major radius leaves 0.2 mm of air on the tube, so the wire does not cut it. */
function hoseClampAt(p: Part, pts: V3[], u: number, hoseR: number, gap = 1.8) {
  const n = pts.length - 1;
  const f = Math.min(0.98, Math.max(0.02, u)) * n;
  const i = Math.min(n - 1, Math.floor(f));
  const t = f - i;
  const p0 = v(...pts[i]), p1 = v(...pts[Math.min(n, i + 1)]);
  const c = p0.clone().lerp(p1, t);
  const tan = p1.clone().sub(p0);
  if (tan.lengthSq() < 1e-8) return;
  tan.normalize();
  const g = torus(hoseR + gap, 0.7, 6, 16);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan));
  g.translate(c.x, c.y, c.z);
  p.add(g, 'zincPlate');
}

function vacTPorts() {
  const [ox, oy, oz] = VAC_T.origin;
  return {
    minusX: { tip: [ox - 14, oy, oz] as V3, axis: [-1, 0, 0] as V3 },
    plusX: { tip: [ox + 14, oy, oz] as V3, axis: [1, 0, 0] as V3 },
    // Elbow turns the leg up. A straight Ø9 hose will not fit between this tip and the throttle flange (z 96).
    plusZ: { tip: [10, 282, 76] as V3, axis: [0, 1, 0] as V3 },
    // Spare −Z leg of the tee. The diverter hose seats on TEE_AIR_INJ, not on this tip.
    minusZ: { tip: [ox, oy, oz - 14] as V3, axis: [0, 0, -1] as V3 },
  };
}

/**
 * Nine vacuum hoses in three sizes (Kat 502 fig 107-10, bulk hose sold by the metre).
 * Small r 3.2 (3.2×7), medium r 4.5 (Ø9), large r 7 (8×14). Tips are the hose seats.
 * Thermo valve is illustration 17A (no text-extract line). The additional-air vacuum barb is ADD_AIR_VAC.
 */
/**
 * Additional-air vacuum barb. The valve sits flywheel of the right-bank injector ribbon
 * (that ribbon is z −148, y ≤ 278) so the Ø9 hose never crosses it.
 */
export const ADD_AIR_VAC = { tip: [104, 300, -210] as V3, axis: [0, 0, 1] as V3 };
const VAC_THERMO = {
  inn: { tip: [20, 300, -158] as V3, axis: [0, 0, 1] as V3 },
  dist: { tip: [4, 300, -176] as V3, axis: [-1, 0, 0] as V3 },
  sock: { tip: [32, 300, -176] as V3, axis: [1, 0, 0] as V3 },
};
const VAC_SOCK = {
  small: { tip: [46, 300, -176] as V3, axis: [-1, 0, 0] as V3 },
  large: { tip: [70, 300, -176] as V3, axis: [1, 0, 0] as V3 },
};
const VAC_BLOCK = {
  large: { tip: [88, 300, -176] as V3, axis: [-1, 0, 0] as V3 },
  med: { tip: [104, 300, -196] as V3, axis: [0, 0, -1] as V3 },
  u1: { tip: [104, 312, -176] as V3, axis: [0, 1, 0] as V3 },
  u2: { tip: [128, 312, -176] as V3, axis: [0, 1, 0] as V3 },
  j1: { tip: [157, 300, -192] as V3, axis: [0, 0, 1] as V3 },
  j2: { tip: [157, 300, -180] as V3, axis: [0, 0, -1] as V3 },
};

function fittingGroup(name: string, parts: [THREE.BufferGeometry, string][]) {
  const g = new THREE.Group();
  g.name = name;
  for (const [geo, mat] of parts) g.add(mesh(geo, mat as 'blackPlastic'));
  return g;
}

/** Thermo valve 17A, reducing socket #17, and the couplings the nine hoses seat on. */
export function vacuumCluster() {
  const p = new Part();
  // Flywheel of the injector ribbon (z −148) and above it (y ≤ 278), so the bodies miss the lines.
  p.g.add(fittingGroup('fitting:vac-thermo', [
    [boxMM([12, 292, -184], [28, 308, -166]), 'blackPlastic'],
    [cylBetween([20, 300, -166], VAC_THERMO.inn.tip, 3.2, 10), 'brass'],
    [cylBetween([12, 300, -176], VAC_THERMO.dist.tip, 3.2, 10), 'brass'],
    [cylBetween([28, 300, -176], VAC_THERMO.sock.tip, 4.2, 10), 'brass'],
  ]));
  p.g.add(fittingGroup('fitting:vac-socket', [
    [boxMM([52, 292, -184], [66, 308, -166]), 'blackPlastic'],
    [cylBetween([52, 300, -176], VAC_SOCK.small.tip, 4.2, 10), 'brass'],
    [cylBetween([66, 300, -176], VAC_SOCK.large.tip, 6.4, 12), 'brass'],
  ]));
  p.g.add(fittingGroup('fitting:vac-block', [
    [boxMM([96, 292, -184], [112, 308, -168]), 'blackPlastic'],
    [cylBetween([96, 300, -176], VAC_BLOCK.large.tip, 6.4, 12), 'brass'],
    [cylBetween([104, 300, -184], VAC_BLOCK.med.tip, 4.2, 10), 'brass'],
    [cylBetween([104, 308, -176], VAC_BLOCK.u1.tip, 6.4, 12), 'brass'],
    [cylBetween([112, 300, -176], [128, 308, -176], 6.4, 12), 'brass'],
    [cylBetween([128, 308, -176], VAC_BLOCK.u2.tip, 6.4, 10), 'brass'],
  ]));
  p.g.add(fittingGroup('fitting:vac-jumper', [
    [boxMM([150, 292, -210], [164, 308, -196]), 'blackPlastic'],
    [cylBetween([157, 300, -196], VAC_BLOCK.j1.tip, 6.4, 10), 'brass'],
    [boxMM([150, 292, -176], [164, 308, -162]), 'blackPlastic'],
    [cylBetween([157, 300, -176], VAC_BLOCK.j2.tip, 6.4, 10), 'brass'],
  ]));
  return p;
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
  const on = (point: V3, axis: V3, part = 'vacuum-fittings') => endOf(part, point, axis);
  return [
    { id: 'aux-meter', part: 'aux-air-plumbing', a: endOf('mixture-control-unit', AFM_AUX.tip, AFM_AUX.axis), b: endOf('aux-air-valve', aav.up.tip, aav.up.axis) },
    { id: 'aux-manifold', part: 'aux-air-plumbing', a: endOf('aux-air-valve', aav.down.tip, aav.down.axis), b: endOf('plenum', PLENUM_AUX.tip, PLENUM_AUX.axis) },
    // Three small hoses (3.2×7): manifold, limiter, distributor. TEE_AIR_INJ is the
    // handoff for 108-00 #31; no hose leaves that barb in this model.
    { id: 'vac-manifold', part: 'vacuum-fittings', a: endOf('plenum', MANIFOLD_VAC.tip, MANIFOLD_VAC.axis), b: on(t.minusX.tip, t.minusX.axis) },
    { id: 'vac-limiter', part: 'vacuum-fittings', a: on(t.plusX.tip, t.plusX.axis), b: endOf('vacuum-limiter', lim.tip, lim.axis) },
    { id: 'vac-distributor', part: 'vacuum-fittings', a: on(VAC_THERMO.dist.tip, VAC_THERMO.dist.axis), b: endOf('distributor', DIST_VAC_NIPPLE.point, DIST_VAC_NIPPLE.dir) },
    // Three medium hoses (Ø9): T to thermo valve 17A, thermo to the reducing socket, socket cluster to the additional air valve.
    { id: 'vac-thermo', part: 'vacuum-fittings', a: on(t.plusZ.tip, t.plusZ.axis), b: on(VAC_THERMO.inn.tip, VAC_THERMO.inn.axis) },
    { id: 'vac-socket', part: 'vacuum-fittings', a: on(VAC_THERMO.sock.tip, VAC_THERMO.sock.axis), b: on(VAC_SOCK.small.tip, VAC_SOCK.small.axis) },
    { id: 'vac-addair', part: 'vacuum-fittings', a: endOf('additional-air-valve', ADD_AIR_VAC.tip, ADD_AIR_VAC.axis), b: on(VAC_BLOCK.med.tip, VAC_BLOCK.med.axis) },
    // Three large hoses (8×14): socket to the block, the parallel run off the block, and the jumper.
    { id: 'vac-large-a', part: 'vacuum-fittings', a: on(VAC_SOCK.large.tip, VAC_SOCK.large.axis), b: on(VAC_BLOCK.large.tip, VAC_BLOCK.large.axis) },
    { id: 'vac-large-b', part: 'vacuum-fittings', a: on(VAC_BLOCK.u1.tip, VAC_BLOCK.u1.axis), b: on(VAC_BLOCK.u2.tip, VAC_BLOCK.u2.axis) },
    { id: 'vac-large-c', part: 'vacuum-fittings', a: on(VAC_BLOCK.j1.tip, VAC_BLOCK.j1.axis), b: on(VAC_BLOCK.j2.tip, VAC_BLOCK.j2.axis) },
  ];
}

export function auxAirPlumbingPart() {
  const p = new Part();
  const lines = serviceHoses().filter((h) => h.part === 'aux-air-plumbing');
  const meter = lines[0], mani = lines[1];
  // Hose line #43 is about Ø25 (clamps S 25/9). Straight past the meter barb, then down
  // pulley of the injector ribbon (z −148) and left of the vacuum limiter.
  addHose(p, meter.id, meter.a, meter.b, [[40, 280, -120], [48, 248, -124], [52, 238, -116]], 12.5, 4, 8);
  // The lower pipe runs between the regulator and the shroud roof (y 153.5). Ø25 does not fit.
  // This piece is Ø12 (r 6). Clamp S 22/9 is the catalogue's smaller band on the connecting pipe.
  addHose(p, mani.id, mani.a, mani.b, [[52, 164, -124], [36, 170, -146]], 6, 2, 8);
  return p;
}

export function vacuumHosesPart() {
  const p = new Part();
  const byId = Object.fromEntries(serviceHoses().filter((h) => h.part === 'vacuum-fittings').map((h) => [h.id, h]));
  const small = (id: string, mids: V3[], ahead = 8, lead = 6) => {
    const h = byId[id];
    return addHose(p, id, h.a, h.b, mids, 3.2, ahead, lead);
  };
  const med = (id: string, mids: V3[]) => {
    const h = byId[id];
    return addHose(p, id, h.a, h.b, mids, 4.5, 6, 5);
  };
  const large = (id: string, mids: V3[], ahead = 4, lead = 4) => {
    const h = byId[id];
    return addHose(p, id, h.a, h.b, mids, 7, ahead, lead, lead, 6);
  };
  small('vac-manifold', [[-22, 274, 52]]);
  small('vac-limiter', [[70, 268, 40], [108, 270, -20], [108, 268, -72]]);
  // End on DIST_VAC_NIPPLE. The last bend is derived from its point and dir so a can
  // change (930/04 shallow can, nipple on the rim) only needs the waypoints adjusted.
  const nip = DIST_VAC_NIPPLE;
  const approach: V3 = [
    nip.point[0] + nip.dir[0] * 36,
    nip.point[1] + nip.dir[1] * 36 + 28,
    nip.point[2] + nip.dir[2] * 36,
  ];
  const dist = byId['vac-distributor'];
  // Stay flywheel of the ribbon until the pulley side, then the bend that was already clear of the cap.
  // Under the injector ribbon, then above the duct, then the bend that clears the distributor cap.
  addHose(p, dist.id, dist.a, dist.b, [
    [-24, 248, -188],
    [-8, 248, -120],
    [-8, 326, -120],
    [-8, 326, 55],
    [-20, 300, 110],
    [-150, 240, nip.point[2]],
    approach,
  ], 3.2, 1, 3, 8, 6);
  // Up off the T before the throttle flange (z 96), then above the duct and the injector lines.
  const thermo = byId['vac-thermo'];
  addHose(p, thermo.id, thermo.a, thermo.b, [[-32, 312, 70], [-32, 312, -148], [22, 304, -148]], 4.5, 4, 6, 3, 4);
  const sock = byId['vac-socket'];
  addHose(p, sock.id, sock.a, sock.b, [], 4.5, 1, 2);
  const add = byId['vac-addair'];
  addHose(p, add.id, add.a, add.b, [], 4.5, 1, 2, 2, 4);
  large('vac-large-a', [], 1, 3);
  large('vac-large-b', [[104, 320, -176], [128, 320, -176]], 1, 3);
  large('vac-large-c', [], 1, 2);
  return p;
}

/**
 * Angle bracket 107-10 #26 on the plenum lid, under the right-bank lines.
 * Pipe 3's two M8 studs (#3A) are the likely anchor once those pipes exist; until then the foot
 * sits on the lid where the drawing puts the loom.
 */
export const LINE_CLIP = { x: 62, y: LID_Y, z: 18 };

/**
 * Air-guide mouths. Ø131 and Ø85 are E from clamps S 131/9 and S 85/9 (107-10 #19/#20).
 * The meter mouth faces up, in front of the air cleaner, so the Ø131 disc clears the housing.
 */
/** Meter mouth on the pulley side of the lid, axis down. Ø131 E from S 131/9. */
export const BOOT_METER = { tip: [142, 308, 40] as V3, axis: [0, -1, 0] as V3, r: 65.5 };
/** Throttle inlet facing up into the boot. The bell is below this face. Ø85 E from S 85/9. */
export const BOOT_THROTTLE = { tip: [142, 278, 40] as V3, axis: [0, 1, 0] as V3, r: 42.5 };

/** Six spring-loaded M6×25 screws on the air-flow-meter flange (107-10 #1–#3). */
export function afmScrewMatrices() {
  const { x, z } = AFM_PORT;
  const R = 40;
  return [0, 1, 2, 3, 4, 5].map((i) => {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    const Y = v(0, 1, 0);
    const X = v(Math.cos(a), 0, -Math.sin(a));
    const Z = new THREE.Vector3().crossVectors(X, Y);
    return new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(x + R * Math.cos(a), LID_Y + 6, z + R * Math.sin(a));
  });
}

/** Flap housing 930 110 248 02. World geometry, identity pose. Lever pad top is y 236.6. */
export function throttleHousingPart() {
  const p = new Part();
  const y = THROTTLE.y;
  // Profile ends at z 95; the 1.2 mm extrude bevel puts the metal face at 96.2.
  const zF = 96.25;
  const flange = cyl(42, 7, 40).rotateX(Math.PI / 2).translate(0, y, zF + 3.5);
  const groove = torus(35.75, 2.5, 8, 32);
  groove.translate(0, y, zF + 2.1);
  const flangeCut = csgSub(flange, groove, cylBetween([0, y, zF - 1], [0, y, zF + 12], 24, 24));
  p.add(flangeCut.index ? flangeCut.toNonIndexed() : flangeCut, 'castAlu');
  // O-ring 67.5×4 (K). Centreline radius 35.75. The back of the ring meets the plenum face.
  const ring = torus(35.75, 2, 8, 32);
  ring.translate(0, y, zF + 2);
  p.add(ring, 'rubber');
  // Body stops well short of the alternator slip-ring face (z ≈ 159).
  p.add(cylBetween([0, y, zF + 5], [0, y, 114], 28, 28), 'castAlu');
  // Shaft and return spring on the −X side, clear of the linkage plate (x ≥ 34).
  p.add(cylBetween([-34, y, 106], [26, y, 106], 3.2, 10), 'darkSteel');
  p.add(spring(5.5, 0.55, -8, 8, 4).rotateZ(Math.PI / 2).translate(-18, y, 106), 'darkSteel');
  // Lever pad. Top face y 236.6 is the linkage plate's seat. Nothing of the housing is above it there.
  p.add(boxMM([28, 228, 106], [50, 236.6, 120]), 'castAlu');
  // Ported-vacuum nipple. Tip and axis are THROTTLE_PORTED_VAC. The last run is +Z
  // so the seat faces the pulley, where 202-05 #16 arrives. The root cap sits on the lever pad (z 120).
  {
    const pv = THROTTLE_PORTED_VAC.point;
    p.add(cylBetween([pv[0], pv[1], 120], pv, 3.2, 12), 'brass');
    p.add(torus(4.6, 0.7, 6, 14).translate(pv[0], pv[1], pv[2] - 3), 'zincPlate');
  }
  // 4 × M6 heads. Angles keep them off the vacuum hose that climbs past the top of the flange.
  for (const a of [0.75, 2.3, 3.95, 5.35]) {
    p.add(hexNut(10, 4).rotateX(Math.PI / 2).translate(36 * Math.cos(a), y + 36 * Math.sin(a), zF + 8), 'zincPlate');
  }
  // Elbow below the lever, outboard of the plenum, then the Ø85 bell above the boot face.
  const tip = BOOT_THROTTLE.tip;
  // Centre z 112 and r 12 keep the tube past the plenum face (z 96.2).
  // Leave on the pulley side of the plenum (z 118), then outboard, then down to the bell.
  // Rise on the pulley side of the plenum (z 120) and slide past the strut at (62, 72).
  // Stay under the boot (face y 278) the whole way; a chord through y 286 enters the rubber.
  p.add(cylBetween([14, 228, 120], [14, 266, 120], 10, 12), 'castAlu');
  p.add(cylBetween([14, 264, 120], [120, 266, 120], 10, 12), 'castAlu');
  p.add(cylBetween([118, 266, 120], [tip[0], tip[1] - 16, tip[2]], 10, 12), 'castAlu');
  p.add(cylBetween([tip[0], tip[1] - 16, tip[2]], [tip[0], tip[1] - 0.4, tip[2]], BOOT_THROTTLE.r, 24), 'castAlu');
  cutGroup(p.g,
    cylBetween([0, y, zF + 1], [0, y, 118], 22, 20),
    cylBetween([14, 232, 120], [14, 264, 120], 7, 12),
    cylBetween([16, 264, 120], [118, 266, 120], 7, 12),
    cylBetween([118, 264, 120], [tip[0], tip[1] - 8, tip[2]], 7, 12),
  );
  return p;
}

/** Corrugated boot 930 110 358 05. Hangs below both mouths so the Ø131 disk stays under the shell. */
export function airGuidePart() {
  const p = new Part();
  const a = BOOT_METER.tip;
  const b = BOOT_THROTTLE.tip;
  // Every point except the meter mouth is at or below the throttle face, so the boot
  // meets the bell on that face and does not enter it.
  const a0 = add(a, BOOT_METER.axis, 0.4);
  const b0 = add(b, BOOT_THROTTLE.axis, 0.4);
  const pts: V3[] = [
    a0,
    [a0[0], a0[1] - 3.2, a0[2]],
    [a0[0], a0[1] - 16, a0[2]],
    [(a0[0] + b0[0]) / 2, (a0[1] + b0[1]) / 2, (a0[2] + b0[2]) / 2],
    [b0[0], b0[1] + 10, b0[2]],
    b0,
  ];
  // Mouth diameters are the clamp sizes (E). The Ø131 run is only the first 3 mm,
  // so the line-bracket clamps under the mouth (y ≈ 300) stay outside the rubber.
  const radii = [65.5, 26, 24, 24, 42.5];
  for (let i = 0; i < pts.length - 1; i++) {
    p.add(cylBetween(pts[i], pts[i + 1], radii[i], 14), 'rubber');
  }
  return p.g;
}

/** Clamp poses. Proto is the S 85/9 clamp; the meter clamp is scaled to S 131/9. */
export function airGuideClampMatrices() {
  const s = 131 / 85;
  const qMeter = new THREE.Quaternion().setFromUnitVectors(v(0, 1, 0), v(...BOOT_METER.axis));
  const meter = new THREE.Matrix4().compose(
    v(...add(BOOT_METER.tip, BOOT_METER.axis, 1.6)),
    qMeter,
    v(s, s, s),
  );
  const q = new THREE.Quaternion().setFromUnitVectors(v(0, 1, 0), v(...BOOT_THROTTLE.axis));
  const throttle = new THREE.Matrix4().compose(
    v(...add(BOOT_THROTTLE.tip, BOOT_THROTTLE.axis, 8)),
    q,
    v(1, 1, 1),
  );
  return [meter, throttle];
}
