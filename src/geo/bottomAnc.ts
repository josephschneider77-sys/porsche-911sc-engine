/**
 * Bottom-end ancillaries traced from Kat 502: air injection (108-00), heater blower (108-10),
 * EGR (202-05), cylinder baffles (105-10) and the 930/04 catalytic converter (202-00 #6).
 * Drawings decide shape and placement. Coordinates are millimetres in the engine frame.
 */
import * as THREE from 'three';
import { VARIANT } from '../data/variant';
import { CYL_Z } from '../data/layout';
import { FAN, AIR_CHECK_VALVE_OUTLET, CHECK_HEX_H, heaterStub, EGR_FEED_PORT } from './aux';
import { TEE_AIR_INJ, THROTTLE_PORTED_VAC } from './induction';
import { frame } from './instancing';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Part, cyl, cylBetween, lathe, box, boxMM, hexNut, tube, torus, yToZ, yToX, extrude, polyShape, circlePath, csgSub, type V3 } from './util';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const Y = V(0, 1, 0);
const X = V(1, 0, 0);
/** Same solid as a box, split so a bracket or plate is more than a 12-triangle shell. */
const slab = (min: V3, max: V3) => {
  const g = new THREE.BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2], 2, 2, 2);
  g.translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  return g;
};
const plate = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d, 2, 2, 2);
const vsub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vadd = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vmul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const vlen = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const vnorm = (a: V3): V3 => { const L = vlen(a) || 1; return vmul(a, 1 / L); };
const vdot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vcross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * Centreline with circular fillets. `radius` is the bend radius the caller wants.
 * A short leg shrinks it; callers keep each leg long enough that the result stays
 * at least 1.5× the hose outside diameter.
 */
function filletPath(pts: V3[], radius: number): V3[] {
  const pushLine = (out: V3[], a: V3, b: V3) => {
    const d = vsub(b, a), L = vlen(d);
    const n = Math.max(2, Math.ceil(L / 4));
    for (let i = 1; i <= n; i++) out.push(vadd(a, vmul(d, i / n)));
  };
  if (pts.length < 3) {
    const out: V3[] = [pts[0]];
    for (let i = 1; i < pts.length; i++) pushLine(out, pts[i - 1], pts[i]);
    return out;
  }
  const out: V3[] = [pts[0]];
  let cursor = pts[0];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const d0 = vnorm(vsub(b, a)), d1 = vnorm(vsub(c, b));
    const cos = Math.min(1, Math.max(-1, vdot(d0, d1)));
    const phi = Math.acos(cos);
    if (phi < 0.12 || phi > 2.8) { pushLine(out, cursor, b); cursor = b; continue; }
    let t = radius * Math.tan(phi / 2);
    const maxT = 0.46 * Math.min(vlen(vsub(b, a)), vlen(vsub(c, b)));
    if (t > maxT) t = maxT;
    const r = t / Math.tan(phi / 2);
    const t0 = vadd(b, vmul(d0, -t));
    const t1 = vadd(b, vmul(d1, t));
    const axis = vnorm(vcross(d0, d1));
    const inward = vnorm(vcross(axis, d0));
    const center = vadd(t0, vmul(inward, r));
    pushLine(out, cursor, t0);
    const u0 = vnorm(vsub(t0, center)), u1 = vnorm(vsub(t1, center));
    const om = Math.acos(Math.min(1, Math.max(-1, vdot(u0, u1))));
    const steps = Math.max(8, Math.ceil(om / 0.05));
    for (let s = 1; s <= steps; s++) {
      const k = s / steps;
      let dir: V3;
      if (om < 1e-3) dir = u0;
      else {
        const s0 = Math.sin((1 - k) * om) / Math.sin(om);
        const s1 = Math.sin(k * om) / Math.sin(om);
        dir = vnorm(vadd(vmul(u0, s0), vmul(u1, s1)));
      }
      out.push(vadd(center, vmul(dir, r)));
    }
    cursor = t1;
  }
  pushLine(out, cursor, pts[pts.length - 1]);
  return out;
}

/** Pump axis. Pitch radius 65 against the fan's 36 makes the 9.5×950 belt at about 315 mm centres. */
export const AIR_PUMP = { x: -270, y: 50, z: 336, r: 58, half: 29 };
const P = AIR_PUMP;
/** Cast housing, aft of the pulley. The pulley valley stays at z 314 so the belt is unchanged. */
const BODY_Z0 = 328, BODY_Z1 = 386, BODY_ZC = (BODY_Z0 + BODY_Z1) / 2;
/** Four-hole bolt circle on the pressed pulley (108-00 #9/#10). */
const PULLEY_BOLT_R = 36, PULLEY_BOLT_A0 = 0.4;
/** Outlet boss on top of the housing. The hose runs from `neck` (on the casting) through `tip`. */
export const PUMP_OUT = {
  neck: [P.x - 6, P.y + P.r - 10, BODY_ZC] as V3,
  tip: [P.x - 34, P.y + P.r + 18, BODY_ZC + 8] as V3,
};
/**
 * Lower bracket plane. The check-valve hex stands at z 378, so the ear and the
 * bracket sit forward of it. The pump axis, pulley valley and belt plane stay put.
 */
const BR_Z = 336;
/** Inboard ears the bracket and the strap land on. */
const PUMP_EAR_LO: V3 = [-198, -4, BR_Z];
const PUMP_EAR_HI: V3 = [-262, 124, BODY_ZC];
/**
 * The feed arm is Ø22, so it bulges 11 mm past the ear centre. The ear is that
 * thick, and its aft face (z 347) is the flat the bracket eye sits on.
 */
const EAR_HALF_Z = 11, EYE_HALF_Z = 7;
/**
 * Pump eye on the lower ear's axis, stacked on the ear's aft face (z 347).
 * The old eye sat 13 mm beside the ear at the same Z.
 */
const BR_PUMP: V3 = [PUMP_EAR_LO[0], PUMP_EAR_LO[1], BR_Z + EAR_HALF_Z + EYE_HALF_Z + 0.4];
const BR_PIVOT: V3 = [-148, -38, BR_Z];
const BR_CASE: V3 = [-140, 82, BR_Z];

export function airPump() {
  const p = new Part();
  // Finned vane housing (108-00): a cylindrical body, flat end covers and a stack of
  // cooling fins. Not a solid of revolution. Axis, pulley and belt are unchanged.
  // Fin diameter is inside the pulley (valley 65). The check-valve hose runs just inboard of the housing.
  const finR = 50;
  p.add(yToZ(cyl(42, BODY_Z1 - BODY_Z0 - 10, 32)), 'castAlu', [P.x, P.y, BODY_ZC]);
  const fins = 8;
  for (let i = 0; i < fins; i++) {
    const z = BODY_Z0 + 8 + (i * (BODY_Z1 - BODY_Z0 - 16)) / (fins - 1);
    p.add(yToZ(cyl(finR, 2.4, 28)), 'castAlu', [P.x, P.y, z]);
  }
  p.add(yToZ(cyl(finR - 2, 7, 28)), 'castAlu', [P.x, P.y, BODY_Z0 + 2]);
  p.add(yToZ(cyl(finR - 6, 6, 28)), 'castAlu', [P.x, P.y, BODY_Z1 - 3]);
  p.add(yToZ(hexNut(19, 8)), 'yellowZinc', [P.x, P.y, BODY_Z0 - 8]);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    p.add(yToZ(cyl(2.2, 6, 8)), 'darkSteel', [P.x + 32 * Math.cos(a), P.y + 32 * Math.sin(a), BODY_Z0 - 1]);
  }
  // Top and bottom cast ears. The lower one meets the bracket, forward of the check valve.
  p.add(cylBetween([P.x + 20, P.y - 36, BR_Z], PUMP_EAR_LO, 11, 14), 'castAlu');
  p.add(cyl(13, EAR_HALF_Z * 2, 14).rotateX(Math.PI / 2), 'castAlu', PUMP_EAR_LO);
  p.add(cylBetween([P.x + 8, P.y + P.r - 8, BODY_ZC], PUMP_EAR_HI, 9, 12), 'castAlu');
  p.add(cyl(11, 8, 12).rotateX(Math.PI / 2), 'castAlu', PUMP_EAR_HI);
  // Angled outlet boss and hose spigot on top.
  p.add(cylBetween(PUMP_OUT.neck, PUMP_OUT.tip, 11, 14), 'castAlu');
  p.add(cylBetween(vadd(PUMP_OUT.tip, vmul(vnorm(vsub(PUMP_OUT.neck, PUMP_OUT.tip)), 16)), PUMP_OUT.tip, 6.2, 12), 'castAlu');
  // Inlet neck, outboard, for the mushroom cleaner.
  p.add(yToX(cyl(8, 22, 12)), 'castAlu', [P.x - P.r - 8, P.y + 14, BODY_ZC - 6]);
  return p.g;
}
export function airPumpPulley() {
  const p = new Part();
  const z = FAN.zPumpBelt;
  // Pressed-steel sheave, about the housing diameter. Valley radius 65 is the belt pitch.
  const prof: [number, number][] = [
    [12, z - 8], [50, z - 8], [72, z - 4], [65, z], [72, z + 4], [50, z + 8], [12, z + 8], [12, z - 8],
  ];
  const disc = yToZ(lathe(prof, 48)).translate(P.x, P.y, 0);
  const cutters = [0, 1, 2, 3].map((i) => {
    const a = PULLEY_BOLT_A0 + (i / 4) * Math.PI * 2;
    return yToZ(cyl(3.3, 28, 10)).translate(P.x + PULLEY_BOLT_R * Math.cos(a), P.y + PULLEY_BOLT_R * Math.sin(a), z);
  });
  p.add(csgSub(disc, ...cutters), 'yellowZinc');
  return p.g;
}
export function airPumpBelt() {
  const p = new Part();
  const c1 = new THREE.Vector2(P.x, P.y), r1 = 65;
  const c2 = new THREE.Vector2(0, FAN.y), r2 = FAN.rFanPulley - 5;
  const d = c2.clone().sub(c1), L = d.length(), base = Math.atan2(d.y, d.x);
  const beta = Math.acos((r1 - r2) / L);
  const pts: V3[] = [];
  const arc = (c: THREE.Vector2, r: number, a0: number, a1: number, n: number) => {
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push([c.x + r * Math.cos(a), c.y + r * Math.sin(a), FAN.zPumpBelt]);
    }
  };
  arc(c2, r2, base - beta, base + beta, 28);
  arc(c1, r1, base + beta, base + 2 * Math.PI - beta, 36);
  const curve = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q)), true);
  const sh = new THREE.Shape();
  sh.moveTo(-5, -4.2); sh.lineTo(5, -4.2); sh.lineTo(3, 4.2); sh.lineTo(-3, 4.2); sh.closePath();
  p.add(new THREE.ExtrudeGeometry(sh, { steps: 160, extrudePath: curve, bevelEnabled: false }), 'rubber');
  return p.g;
}
/** Rubber-mount centres (108-00 #2). Pivot eye and case eye, bolt axis +Z. */
export const AIR_MOUNTS: V3[] = [BR_PIVOT, BR_CASE];

export function airPumpBracket() {
  const p = new Part();
  // Plate in the pivot/case plane. It stops at x −176, inboard of the ear
  // (the ear reaches x −185), so the only meeting is the eye on the ear face.
  // Corners bulge past the pivot and case eyes so the bolt holes sit in metal, not on the edge.
  const shape = polyShape([
    [-176, BR_PUMP[1]],
    [BR_PIVOT[0] - 10, BR_PIVOT[1]],
    [BR_PIVOT[0], BR_PIVOT[1] - 10],
    [BR_PIVOT[0] + 14, BR_PIVOT[1]],
    [BR_CASE[0] + 10, BR_CASE[1] - 8],
    [BR_CASE[0] + 10, BR_CASE[1] + 10],
    [BR_CASE[0] - 10, BR_CASE[1] + 10],
  ]);
  const holeAt = (x: number, y: number, r: number) => { shape.holes.push(circlePath(r, x, y) as THREE.Path); };
  holeAt(-168, -6, 6);
  holeAt(-156, 28, 7);
  holeAt(BR_PIVOT[0], BR_PIVOT[1], 4.2);
  holeAt(BR_CASE[0], BR_CASE[1], 4.2);
  p.add(extrude(shape, 7).translate(0, 0, BR_Z - 3.5), 'castAlu');
  const eye = (at: V3, r = 12) => p.add(yToZ(lathe([[5.5, -7], [r, -7], [r, 7], [5.5, 7]], 18)), 'castAlu', at);
  eye(BR_PUMP, 13);
  eye(BR_PIVOT, 12);
  eye(BR_CASE, 13);
  // Neck to the eye. The riser stays inboard of the ear (ear reaches x −185).
  // The cross run is above the ear face (z 347); a Ø12 tube centred here bottoms clear of that face.
  const zRun = BR_PUMP[2] + 2;
  p.add(cylBetween([-176, BR_PUMP[1], BR_Z], [-176, BR_PUMP[1], zRun], 6, 12), 'castAlu');
  p.add(cylBetween([-176, BR_PUMP[1], zRun], [BR_PUMP[0], BR_PUMP[1], zRun], 6, 12), 'castAlu');
  return p.g;
}
export function airPumpStrap() {
  const p = new Part();
  // Flat bar with a long slot, from the upper ear inboard, and a bent end tab.
  const x0 = -268, x1 = -196, y = 128, w = 14;
  const shape = polyShape([[x0, y - w / 2], [x1, y - w / 2], [x1, y + w / 2], [x0, y + w / 2]]);
  const slot = new THREE.Path();
  slot.moveTo(x0 + 14, y - 1.8); slot.lineTo(x1 - 16, y - 1.8); slot.lineTo(x1 - 16, y + 1.8); slot.lineTo(x0 + 14, y + 1.8); slot.closePath();
  shape.holes.push(slot);
  p.add(extrude(shape, 3).translate(0, 0, BODY_ZC + 6), 'zincPlate');
  // Bent tab at the inboard end, down toward the clip.
  p.add(box(14, 3, 22), 'zincPlate', [-190, 118, BODY_ZC - 2], [0.9, 0, 0]);
  return p.g;
}
export function airRetainer() {
  const p = new Part();
  // Small bent clip (108-00 #12), not a tall plate. Aft of the fan drum.
  p.add(slab([-196, 108, 346], [-182, 122, 349]), 'zincPlate');
  p.add(slab([-185, 108, 346], [-182, 111, 364]), 'zincPlate');
  p.add(slab([-196, 108, 361], [-182, 122, 364]), 'zincPlate');
  return p.g;
}
export function airCheckValve() {
  const p = new Part();
  const [x, y, z] = AIR_CHECK_VALVE_OUTLET.point;
  const h = CHECK_HEX_H;
  // `point` is the bottom face. The hex cylinder is centred, so its centre is h/2 above that face.
  // Outlet points down (AIR_CHECK_VALVE_OUTLET.direction). Inlet nipple points up.
  p.add(hexNut(27, h), 'yellowZinc', [x, y + h / 2, z]);
  p.add(cyl(12, 22, 20), 'castAlu', [x, y + h + 11, z]);
  p.add(cyl(7, 16, 12), 'castAlu', [x, y + h + 30, z]);
  return p.g;
}
/** Top of the check-valve inlet nipple. The hose from the diverter ends here. */
export function checkValveInlet(): V3 {
  const [x, y, z] = AIR_CHECK_VALVE_OUTLET.point;
  return [x, y + CHECK_HEX_H + 30 + 8, z];
}
export function airDiverter() {
  const p = new Part();
  // Round diaphragm cover facing aft, cast body under it. Nipple tips stay where the hoses already seat.
  p.add(yToZ(lathe([
    [6, 440], [16, 442], [18, 446], [18, 458], [14, 462], [8, 462], [6, 456], [6, 440],
  ], 32)), 'castAlu', [-142, 36, 0]);
  p.add(lathe([
    [10, 8], [16, 10], [16, 28], [12, 34], [10, 34],
  ], 24), 'castAlu', [-142, 8, 448]);
  // Inlet on the outboard face, outlet on top, dump aft. Each nipple stands proud of the body.
  p.add(yToX(cyl(7, 16, 12)), 'castAlu', [-164, 26, 448]);
  p.add(cyl(7, 16, 12), 'castAlu', [-142, 48, 448]);
  p.add(yToZ(cyl(7, 20, 12)), 'castAlu', [-142, 26, 472]);
  // Two vacuum nipples on the inboard face, clear of the support ear (ear starts z 440).
  // Upper: air-injection hose 108-00 #31. Lower: one EGR hose 202-05 #17.
  // Radius 2.2 (OD 4.4) so the 3.2×7 hose (OD 7) pushes over the barb.
  p.add(yToX(cyl(2.2, 14, 10)), 'castAlu', [-116, 22, 432]);
  p.add(yToX(cyl(2.2, 14, 10)), 'castAlu', [-116, 12, 432]);
  return p.g;
}
/**
 * Free end of the diverter dump nipple (axis +Z). `air-hose-dump` slides on along −Z.
 * The nipple is yToZ(cyl(7, 20)) centred at z 472, so the tip is z 482.
 */
export const DUMP_PORT = { point: [-142, 26, 482] as V3, axis: [0, 0, 1] as V3 };
/** Free end of the diverter vacuum nipple (axis +X). The air-injection hose slides on along −X. */
export const DIVERTER_VAC: V3 = [-109, 22, 432];
/** Lower nipple, same axis. One EGR vacuum hose (202-05 #17) seats here. */
export const DIVERTER_VAC_EGR: V3 = [-109, 12, 432];

export function airDiverterSupport() {
  const p = new Part();
  // Flat mounting plate under the diaphragm, with an ear clear of the inlet nipple.
  const shape = polyShape([[-156, 434], [-128, 434], [-128, 462], [-156, 462]]);
  shape.holes.push(circlePath(3.2, -146, 444) as THREE.Path);
  shape.holes.push(circlePath(3.2, -136, 454) as THREE.Path);
  const g = extrude(shape, 3);
  g.rotateX(Math.PI / 2);
  g.translate(0, 8, 0);
  p.add(g, 'zincPlate');
  p.add(slab([-124, 8, 440], [-116, 28, 452]), 'zincPlate');
  return p.g;
}
export function airPumpCleaner() {
  const p = new Part();
  // Mushroom filter: dome, clamp neck, and a short snout onto the pump inlet.
  // Outboard of the pulley lip (x −342) and aft of the belt plane.
  p.add(lathe([
    [6, 0], [14, 0], [18, 4], [20, 14], [16, 26], [8, 32], [2, 34],
  ], 28), 'blackPlastic', [-378, P.y + 8, BODY_ZC - 6]);
  p.add(yToX(cyl(7, 28, 12)), 'blackPlastic', [-348, P.y + 14, BODY_ZC - 6]);
  p.add(torus(8, 1.4, 6, 16).rotateY(Math.PI / 2), 'zincPlate', [-360, P.y + 14, BODY_ZC - 6]);
  return p.g;
}

/** Heater blower on the right of the fan housing (108-10). */
export const HEATER_BLOWER = { x: 340, y: 140, z: 410 };
/** Two bolts through the lapped arm and foot. Clear of the foot edges and the scroll tangent. */
const HEATER_BOLT_HOLE = 2.6;
const HEATER_BOLTS: [number, number][] = [
  [HEATER_BLOWER.x - 57, HEATER_BLOWER.y - 6],
  [HEATER_BLOWER.x - 57, HEATER_BLOWER.y + 4],
];
export function heaterBlower() {
  const p = new Part();
  const b = HEATER_BLOWER;
  // Scroll housing. The round inlet faces the fan (−Z); the motor can sticks out the back.
  p.add(yToZ(lathe([
    [16, -26], [34, -26], [46, -18], [48, 16], [40, 24], [24, 28], [18, 22], [16, -26],
  ], 36)), 'blackPlastic', [b.x, b.y, b.z]);
  p.add(yToZ(cyl(22, 46, 24)), 'blackPlastic', [b.x, b.y, b.z + 48]);
  p.add(yToZ(cyl(16, 8, 16)), 'blackPlastic', [b.x, b.y, b.z + 74]);
  p.add(yToZ(cyl(6, 8, 10)), 'darkSteel', [b.x, b.y, b.z + 80]);
  // Outlet nipple down, same place as before so the distributing piece still seats.
  p.add(cyl(14, 20, 16), 'blackPlastic', [b.x, b.y - 44, b.z]);
  // Mounting foot on the scroll's inboard tangent (x 292). Its aft face is the lap
  // the support arm sits on; the two bolt holes go through that lap.
  const face = b.x - 48;
  const z1 = b.z - 3;
  const foot = polyShape([[face - 18, b.y - 18], [face, b.y - 18], [face, b.y + 12], [face - 18, b.y + 12]]);
  for (const [x, y] of HEATER_BOLTS) foot.holes.push(circlePath(HEATER_BOLT_HOLE, x, y) as THREE.Path);
  p.add(extrude(foot, z1 - (b.z - 16)).translate(0, 0, b.z - 16), 'blackPlastic');
  p.add(boxMM([face - 8, b.y - 22, b.z - 8], [face, b.y - 16, z1]), 'blackPlastic');
  return p.g;
}
export function heaterBlowerSupport() {
  const p = new Part();
  const b = HEATER_BLOWER;
  // Arm laps 10 mm onto the foot (x 280–290) and shares the foot's aft face.
  // It used to stop at x 280, end-on, with the bolts 6 mm short of that lap.
  const face = b.x - 48;
  const x0 = b.x - 96, x1 = face - 2, y0 = b.y - 20, y1 = b.y + 18;
  const shape = polyShape([[x0, y0 + 6], [x1, y0], [x1, y1], [x0 + 18, y1], [x0, (y0 + y1) / 2 + 8]]);
  shape.holes.push(circlePath(7, (x0 + x1) / 2 - 4, b.y) as THREE.Path);
  for (const [x, y] of HEATER_BOLTS) shape.holes.push(circlePath(HEATER_BOLT_HOLE, x, y) as THREE.Path);
  p.add(extrude(shape, 6).translate(0, 0, b.z - 3), 'zincPlate');
  p.add(boxMM([x0 - 2, y0 - 2, b.z - 10], [x0 + 18, y0 + 3, b.z + 10]), 'zincPlate');
  return p.g;
}

export const EGR = { x: -70, y: -300, z: 20 };
/** Top face of the upright vacuum barb (axis +Y). The valve leg of #17 slides on from above. */
export const EGR_BARB_UP = {
  point: [EGR.x + 18, EGR.y + 43, EGR.z] as V3,
  axis: [0, 1, 0] as V3,
};
/**
 * Free end of the second barb (axis −Z). `egr-hose-return` slides on along +Z.
 * The tip stands 6 mm further out than the old face, so a 7 mm push-on ends
 * where the old 1 mm seat was. Deeper than that the sleeve meets the diaphragm.
 */
export const EGR_BARB_2 = {
  point: [EGR.x + 18, EGR.y + 40, EGR.z - 29] as V3,
  axis: [0, 0, -1] as V3,
};
/**
 * EGR vacuum tee (202-05 #18), just below the ported-vacuum nipple.
 * #15 is the straight 33 mm between those two tips. The other three ports leave
 * into clear air: #16 and one #17 outboard, the diverter #17 toward the pulley.
 * None of them points down through the shroud or back into the plenum.
 */
export const EGR_TEE_CTR: V3 = [-46, 186, 118];
/**
 * Diverter port. Aimed up and out so the lead clears the vacuum hose, which
 * crosses under the tee on its way to TEE_AIR_INJ. The cap closes this port.
 */
const EGR_TEE_AFT_AXIS = vnorm([-94, 84, 42]);
export const EGR_TEE_PORTS = {
  upper: { point: [EGR_TEE_CTR[0], EGR_TEE_CTR[1] + 18, EGR_TEE_CTR[2]] as V3, axis: [0, 1, 0] as V3 },
  // #17 return. 14 mm above the #16 port so the two outboard leads stay apart.
  lower: { point: [EGR_TEE_CTR[0] - 22, EGR_TEE_CTR[1] + 18, EGR_TEE_CTR[2]] as V3, axis: [-1, 0, 0] as V3 },
  // #16. Level with the tee, straight outboard.
  outboard: { point: [EGR_TEE_CTR[0] - 22, EGR_TEE_CTR[1] + 4, EGR_TEE_CTR[2]] as V3, axis: [-1, 0, 0] as V3 },
  // 36 mm, not 20: the cap's cup has to clear the return barb beside it.
  aft: { point: vadd(EGR_TEE_CTR, vmul(EGR_TEE_AFT_AXIS, 36)), axis: EGR_TEE_AFT_AXIS },
};
/** 999 239 003 40 is 3.2×7: outside diameter 7 mm, larger than the 4.4 mm barbs. */
export const VAC_HOSE_R = 3.5;
export function egrValve() {
  const p = new Part();
  const e = EGR;
  // Diaphragm chamber with a crimped lip, cast body under it. The neck above y 14
  // pulls inboard of the upright barb so the hose clamp is not buried in the can.
  p.add(lathe([
    [8, 0], [20, 0], [26, 3], [28, 8], [28, 14], [12, 16.5], [10, 20], [8, 18], [8, 12],
  ], 32), 'castAlu', [e.x, e.y + 22, e.z]);
  p.add(lathe([
    [12, 0], [18, 2], [20, 8], [16, 18], [14, 24], [12, 26],
  ], 28), 'castAlu', [e.x, e.y - 6, e.z]);
  // Upright barb OD 4.4, under the 3.2×7 hose (OD 7). Tip stays EGR_BARB_UP.
  p.add(cyl(2.2, 14, 10), 'castAlu', [e.x + 18, e.y + 36, e.z]);
  // Second vacuum barb, offset in Z, for one of the 202-05 #17 hoses.
  // 20 mm, rooted where the old 14 mm barb ended, so the extra length is all free tip.
  p.add(yToZ(cyl(2.2, 20, 8)), 'castAlu', [EGR_BARB_2.point[0], EGR_BARB_2.point[1], EGR_BARB_2.point[2] + 10]);
  // Side port for the sealing rubber, proud of the body.
  p.add(yToZ(cyl(6, 16, 12)), 'castAlu', [e.x, e.y + 10, e.z + 26]);
  // Inlet and outlet nipples the two pipelines seat on.
  p.add(yToX(cyl(8, 22, 12)), 'castAlu', [e.x - 26, e.y + 4, e.z]);
  p.add(yToX(cyl(8, 22, 12)), 'castAlu', [e.x + 26, e.y + 4, e.z]);
  return p.g;
}
export function egrPipeFeed() {
  const p = new Part();
  const e = EGR;
  const f = EGR_FEED_PORT;
  // From the valve inlet nipple, across, then up the takeoff axis. The pipe ends on the nipple tip.
  const belowTip: V3 = [f.tip[0], f.tip[1] - 28, f.tip[2]];
  p.add(tube([[e.x - 34, e.y + 4, e.z], [e.x - 90, e.y - 8, e.z - 16], belowTip, f.tip], 8, 12, 28), 'aluminized');
  return p.g;
}
export function egrPipeReturn() {
  const p = new Part();
  const e = EGR;
  const t = EGR_RETURN_PORT.tip;
  // From the valve outlet nipple to the converter boss, last run on the boss axis (+Z).
  p.add(tube([[e.x + 34, e.y + 4, e.z], [e.x + 80, e.y - 16, e.z - 40], [t[0], t[1], t[2] + 36], t, [t[0], t[1], t[2] - 14]], 8, 12, 28), 'aluminized');
  return p.g;
}
export function egrBracket() {
  const p = new Part();
  const e = EGR;
  // Formed strap under the valve, with a turned-down foot and a lightening hole.
  const shape = polyShape([[e.x - 28, e.z - 10], [e.x + 28, e.z - 10], [e.x + 22, e.z + 12], [e.x - 22, e.z + 12]]);
  shape.holes.push(circlePath(4, e.x, e.z) as THREE.Path);
  const g = extrude(shape, 3);
  g.rotateX(Math.PI / 2);
  g.translate(0, e.y - 25, 0);
  p.add(g, 'zincPlate');
  p.add(boxMM([e.x - 28, e.y - 36, e.z - 10], [e.x - 22, e.y - 26, e.z - 4]), 'zincPlate');
  return p.g;
}

/** World origin of the catalytic converter (smallParts matrix). */
const CAT_AT: V3 = [0, -250, -330];
/** Shield arch in the shield's own frame. Outer crown is a quadratic; the sheet is 2 mm thick. */
function catArchOuter(x: number) {
  const t = (x / 46 + 1) / 2;
  return 24 * t * (1 - t);
}
/** Can crown in that same frame. Shield origin is 30 mm above the can centre; bolts sit at z ±12. */
function catCanTop(z: number) {
  return -30 + Math.sqrt(28 * 28 - z * z);
}
/**
 * EGR return fitting on the converter (202-05 #11). Local boss centre (0, 8, 26), length 24 along Z,
 * so the engine-side face is local z 38. `axis` points out of that face (+Z). The pipe slides on along −Z.
 */
export const EGR_RETURN_PORT = {
  tip: [CAT_AT[0], CAT_AT[1] + 8, CAT_AT[2] + 38] as V3,
  axis: [0, 0, 1] as V3,
};

/** Shape in XY, extruded along +Z, placed so local X → world Z, local Y → world Y, local Z → world ±X. */
function flangePlate(shape: THREE.Shape, depth: number, x0: number, sign: number) {
  const g = extrude(shape, depth, 0, 8);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(sign, 0, 0),
  ).setPosition(x0, 0, 0));
  return g;
}

/** Catalytic converter 930 113 228 01. Local frame, placed by the small-part matrix at (0, -250, -330). */
export function catalyticConverterPart() {
  const p = new Part();
  const R = 28, L = 168;
  // Cylindrical can, about 3:1 here so it stays in the old pre-silencer pocket; conical ends.
  p.add(yToX(cyl(R, L, 36)), 'aluminized', [0, 0, 0]);
  p.add(yToX(cyl(R, 18, 28, 16)), 'aluminized', [L / 2 + 6, 0, 0]);
  p.add(yToX(cyl(16, 18, 28, R)), 'aluminized', [-(L / 2 + 6), 0, 0]);
  // Short necks out to the triangular flanges, clear of the test-port cap at x 96.
  p.add(yToX(cyl(16, 14, 12)), 'aluminized', [106, 0, 0]);
  p.add(yToX(cyl(16, 14, 12)), 'aluminized', [-106, 0, 0]);
  // 202-00 triangular 3-bolt flanges. Bosses match the gasket holes (shape X → world Z).
  const bosses: [number, number][] = [0, 1, 2].map((i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
    return [18 * Math.cos(a), 18 * Math.sin(a)];
  });
  const tri = (scale: number) => {
    const s = polyShape([[0, -26 * scale], [24 * scale, 16 * scale], [-24 * scale, 16 * scale]]);
    for (const [bx, by] of bosses) s.holes.push(circlePath(3.6, bx, by) as THREE.Path);
    return s;
  };
  for (const sign of [1, -1] as const) {
    const face = sign * 116;
    const x0 = sign > 0 ? face - 5 : face + 5;
    p.add(flangePlate(tri(1), 5, x0, sign), 'aluminized');
    for (const [bz, by] of bosses) {
      p.add(yToX(cyl(8, 6, 10)), 'aluminized', [x0 + sign * 2.5, by, bz]);
    }
    // Gasket #13, one on each flange face.
    p.add(flangePlate(tri(0.96), 1.2, face, sign), 'gasket');
    for (const [bz, by] of bosses) {
      p.add(yToX(cyl(3.1, 12, 8)), 'zincPlate', [face - sign * 2, by, bz]);
      p.add(yToX(hexNut(10, 5)), 'zincPlate', [face + sign * 5, by, bz]);
    }
  }
  // Gasket #14, the single extra flange gasket, stacked on the inlet face.
  p.add(flangePlate(tri(0.9), 1.2, 117.2, 1), 'gasket');
  // Centre seam band so the can reads as a welded shell, not a plain cylinder.
  p.add(yToX(lathe([[R - 0.4, -3], [R + 1.6, -3], [R + 1.6, 3], [R - 0.4, 3]], 28)), 'aluminized');
  // Test-port boss on the inlet cone (cap is its own part).
  p.add(cyl(6, 8, 12), 'aluminized', [L / 2 + 8, 14, 0]);
  // EGR return boss (202-05 #11) on the engine side of the can. Axis +Z; the pipe slides on from +Z.
  p.add(yToZ(cyl(8, 24, 14)), 'aluminized', [0, 8, 26]);
  p.add(yToZ(lathe([[8, 0], [14, 0], [14, 3], [8, 3]], 16)), 'aluminized', [0, 8, 14]);
  // Exhaust pipe (#17) and compensating socket (#18) past the inlet gasket, with the two clamps (#19).
  p.add(yToX(cyl(12, 22, 14)), 'aluminized', [132, 0, 0]);
  p.add(yToX(lathe([[12, -4], [16, -4], [16, 4], [12, 4]], 16)), 'heatSteel', [136, 0, 0]);
  for (const x of [126, 140]) {
    p.add(torus(14.2, 1.8, 8, 20).rotateY(Math.PI / 2), 'zincPlate', [x, 0, 0]);
    p.add(cyl(2.2, 8, 8), 'zincPlate', [x, 16, 0]);
    p.add(hexNut(8, 4), 'zincPlate', [x, 20, 0]);
  }
  p.add(torus(8, 1.2, 6, 14).rotateY(Math.PI / 2), 'zincPlate', [136, 0, 0]);
  return p;
}

const nutAt = (p: Part, x: number, y: number, z: number, af = 13, h = 6) => {
  p.add(hexNut(af, h), 'zincPlate', [x, y + h / 2, z]);
};
/** Smooth hose. The fillet is 1.5× the outside diameter unless `bend` says otherwise. */
const hoseSpan = (pts: V3[]) => pts.reduce((s, p, i) => i ? s + vlen(vsub(p, pts[i - 1])) : 0, 0);
const hose = (pts: V3[], r: number, bend?: number) => {
  const dense = filletPath(pts, bend ?? 3 * r);
  return tube(dense, r, 10, Math.max(64, Math.ceil(hoseSpan(dense) / 0.8)));
};
/** Polyline curve. The fillet samples are already on the arc, so a second spline is not applied. */
class PolylineCurve extends THREE.Curve<THREE.Vector3> {
  pts: THREE.Vector3[];
  constructor(pts: V3[]) {
    super();
    this.pts = pts.map((p) => new THREE.Vector3(...p));
  }
  getPoint(t: number, target = new THREE.Vector3()) {
    const n = this.pts.length - 1;
    if (n <= 0) return target.copy(this.pts[0] ?? new THREE.Vector3());
    const f = Math.min(0.999999, Math.max(0, t)) * n;
    const i = Math.min(n - 1, Math.floor(f));
    return target.copy(this.pts[i]).lerp(this.pts[i + 1], f - i);
  }
}
function dedupe(pts: V3[]): V3[] {
  const out: V3[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) if (vlen(vsub(pts[i], out[out.length - 1])) > 0.4) out.push(pts[i]);
  return out;
}
/**
 * Rubber hose. `bend` is the fillet radius. Vacuum and EGR use at least 3× the
 * outside diameter; the control legs are long enough that the fillet is not shrunk.
 * Ends stay on the barb axis because those runs are collinear control points.
 */
function rubberHose(ctrl: V3[], r: number, bend: number) {
  const dense = filletPath(dedupe(ctrl), bend);
  const curve = new PolylineCurve(dense);
  const length = hoseSpan(dense);
  return new THREE.TubeGeometry(curve, Math.max(64, Math.ceil(length / 0.6)), r, 10, false);
}
/** Samples along `axis` (out of the fitting). Negative distances lie on the barb. */
function onAxis(point: V3, axis: V3, distances: number[]): V3[] {
  return distances.map((d) => vadd(point, vmul(axis, d)));
}
/**
 * Control polygon from fitting A to fitting B. Each `axis` points out of its barb.
 * The polygon slides 4 mm onto the barb, passes through the tip, and runs straight
 * along the axis before the sweep. Only the ends of each straight run are stored,
 * so the fillet sees the whole leg.
 */
function seated(a: { point: V3; axis: V3 }, b: { point: V3; axis: V3 }, mids: V3[], leadA = 36, leadB = 36, engage = 4): V3[] {
  return [
    ...onAxis(a.point, a.axis, [-engage, 0, leadA]),
    ...mids,
    ...onAxis(b.point, b.axis, [leadB, 0, -engage]),
  ];
}
/**
 * Push-on. Same 7 mm as Intake & Fuel's HOSE_ENGAGE. The bore is the barb radius
 * and the same facet count, so the rubber sits on the surface. The wall is at
 * least 1.5 mm outside that bore. The wire sits on that wall, halfway along the overlap.
 */
export const HOSE_PUSH = 7;
export type PushSeat = { point: V3; axis: V3; barbR: number; segs: number; hoseR: number };
function sleeveOuter(hoseR: number, barbR: number) {
  return Math.max(hoseR, barbR + 1.5);
}
/** Same roll as cylBetween / an unrotated cyl: local +Y goes to the outward axis. Even facet counts still share flats when the axis is reversed. */
function pushQuat(axis: V3) {
  return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...vnorm(axis)));
}
function addPushEnd(p: Part, seat: PushSeat, withRing = true) {
  const axis = vnorm(seat.axis);
  const q = pushQuat(axis);
  const outer = sleeveOuter(seat.hoseR, seat.barbR);
  const yIn = -HOSE_PUSH;
  const yTip = -0.08;
  const yOut = 0.2;
  const pose = (g: THREE.BufferGeometry) => {
    g.applyQuaternion(q);
    g.translate(seat.point[0], seat.point[1], seat.point[2]);
    return g;
  };
  if (outer > seat.hoseR + 0.05 || seat.hoseR <= seat.barbR + 0.05) {
    const shell = new THREE.CylinderGeometry(outer, outer, yOut - yIn, seat.segs, 1, true);
    shell.translate(0, (yIn + yOut) / 2, 0);
    p.add(pose(shell), 'rubber');
  }
  // Outward bore normals. Erosion shrinks the bore onto the barb (that joint is
  // allowlisted) instead of growing it into the neighbouring nipple 11 mm away.
  const bore = new THREE.CylinderGeometry(seat.barbR, seat.barbR, yTip - yIn, seat.segs, 1, true);
  bore.translate(0, (yIn + yTip) / 2, 0);
  p.add(pose(bore), 'rubber');
  const pos: number[] = [];
  const nor: number[] = [];
  for (let i = 0; i < seat.segs; i++) {
    const a0 = (i / seat.segs) * Math.PI * 2;
    const a1 = ((i + 1) / seat.segs) * Math.PI * 2;
    const ring = (a: number, rad: number): [number, number, number] => [Math.sin(a) * rad, yIn, Math.cos(a) * rad];
    const o0 = ring(a0, outer), o1 = ring(a1, outer), i0 = ring(a0, seat.barbR), i1 = ring(a1, seat.barbR);
    for (const v of [o0, i0, o1, o1, i0, i1]) {
      pos.push(...v);
      nor.push(0, -1, 0);
    }
  }
  const lip = new THREE.BufferGeometry();
  lip.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  lip.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  p.add(pose(lip), 'rubber');
  if (!withRing) return;
  const c = vadd(seat.point, vmul(axis, -HOSE_PUSH / 2));
  const ring = clampTorus(outer);
  ring.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...axis)));
  ring.translate(c[0], c[1], c[2]);
  p.add(ring, 'zincPlate');
}
/**
 * Wire radius. Major radius is the sleeve OD plus this, so the inner radius equals
 * the OD (gap 0, inside the 0.2 mm allowance). 0.4 keeps the two parallel throttle
 * clamps, 11 mm apart, from meeting: their outer extents sum to 10.6 mm.
 */
const CLAMP_WIRE = 0.4;
function clampTorus(outer: number) {
  return torus(outer + CLAMP_WIRE, CLAMP_WIRE, 6, 14);
}
/** World-space wire, centred on the push-on. Kept off the hose mesh: its inner normals walk outward under erosion. */
function placeClamp(p: Part, outer: number, seat: PushSeat) {
  const axis = vnorm(seat.axis);
  const ring = clampTorus(outer);
  ring.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...axis)));
  const c = vadd(seat.point, vmul(axis, -HOSE_PUSH / 2));
  ring.translate(c[0], c[1], c[2]);
  p.add(ring, 'zincPlate');
}
/** Wire on the sleeve OD. Hole along local +Y so frame() can aim it down the barb. */
function wireClamp(outer: number) {
  return new Part().add(clampTorus(outer).rotateX(Math.PI / 2), 'zincPlate');
}
/**
 * One tube for the free run. Where the catalogue hose is larger than the barb, the
 * tube also covers the 7 mm push-on and the bore sits inside it. Where the barb is
 * the larger of the two, the tube stops at the tip and the sleeve is the overlap.
 */
function pushHose(ctrl: V3[], hoseR: number, bend: number, seats: PushSeat[], withRing = true) {
  const p = new Part();
  // The free tube stops at the tip. The sleeve is the only rubber on the barb, so a
  // 2 mm erosion cannot pull a too-tight tube down into the brass.
  const path = ctrl.filter((pt) => !seats.some((s) => {
    const rel = vsub(pt, s.point);
    const along = vdot(rel, vnorm(s.axis));
    const radial = Math.sqrt(Math.max(0, vlen(rel) ** 2 - along * along));
    return along < -0.3 && along > -(HOSE_PUSH + 1) && radial < Math.max(hoseR, s.barbR) + 2;
  }));
  p.add(bend >= 20 ? rubberHose(path, hoseR, bend) : hose(path, hoseR, bend), 'rubber');
  for (const s of seats) addPushEnd(p, s, withRing);
  return p;
}
/**
 * Corrugated heater hose. Rings stay on the centreline; the wall waves radially
 * so a bend-radius check of the ring centres ignores the corrugation.
 */
function corrugatedHose(pts: V3[], r: number, bend: number) {
  const dense = filletPath(pts, bend);
  const radial = 12;
  const g = tube(dense, r, radial, Math.max(80, Math.ceil(hoseSpan(dense) / 0.8)));
  const pos = g.attributes.position;
  const stride = radial + 1;
  const rings = pos.count / stride;
  const centers: THREE.Vector3[] = [];
  for (let i = 0; i < rings; i++) {
    const c = new THREE.Vector3();
    for (let j = 0; j < stride; j++) c.add(new THREE.Vector3().fromBufferAttribute(pos, i * stride + j));
    centers.push(c.multiplyScalar(1 / stride));
  }
  let arc = 0;
  const amp = 1.5, pitch = 8;
  for (let i = 0; i < rings; i++) {
    if (i > 0) arc += centers[i].distanceTo(centers[i - 1]);
    const lift = amp * Math.sin((arc / pitch) * Math.PI * 2);
    for (let j = 0; j < stride; j++) {
      const idx = i * stride + j;
      const vx = pos.getX(idx) - centers[i].x;
      const vy = pos.getY(idx) - centers[i].y;
      const vz = pos.getZ(idx) - centers[i].z;
      const mag = Math.hypot(vx, vy, vz) || 1;
      pos.setXYZ(idx, pos.getX(idx) + (vx / mag) * lift, pos.getY(idx) + (vy / mag) * lift, pos.getZ(idx) + (vz / mag) * lift);
    }
  }
  g.computeVertexNormals();
  return g;
}
/** Worm-drive band. Hole along +Y so frame() can aim it down the hose. Inner radius is the hose radius plus 0.05. */
const wormBand = (hoseR: number) => {
  const p = new Part();
  const tubeR = 1.15;
  const R = hoseR + 1.2;
  p.add(torus(R, tubeR, 8, 22).rotateX(Math.PI / 2), 'zincPlate');
  // The screw housing sits outside the band. A box centred on the torus major
  // radius puts its inner face through the hose, and the clamp test reads that face.
  const boxW = 8;
  const boxX = R + tubeR + boxW / 2;
  p.add(box(boxW, 5.5, 7), 'zincPlate', [boxX, 0, 0]);
  p.add(yToZ(cyl(1.2, 9, 8)), 'darkSteel', [boxX, 1.2, 0]);
  return p;
};
/** Flat faces, each with its own vertices. A later weld must not average the bore normal into the wall. */
function flatGeom(tris: [THREE.Vector3, THREE.Vector3, THREE.Vector3][]) {
  const pos: number[] = [];
  const nor: number[] = [];
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3();
  for (const [a, b, c] of tris) {
    ab.subVectors(b, a); ac.subVectors(c, a); n.crossVectors(ab, ac);
    if (n.lengthSq() < 1e-10) continue;
    n.normalize();
    for (const p of [a, b, c]) {
      pos.push(p.x, p.y, p.z);
      nor.push(n.x, n.y, n.z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}
function facePair(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, outward: THREE.Vector3) {
  const n = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(b, a), new THREE.Vector3().subVectors(d, a));
  const fwd = n.dot(outward) >= 0;
  const tri = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3): [THREE.Vector3, THREE.Vector3, THREE.Vector3] => [p, q, r];
  return fwd ? [tri(a, b, c), tri(a, c, d)] : [tri(a, d, c), tri(a, c, b)];
}
/**
 * Rubber cap on a CylinderGeometry barb.
 * Local frame: origin at the tip, +Y along the outward axis (root → tip).
 *
 * The outer wall is one cup: an open cylinder from the lip to past the tip, closed
 * by a single end disc. That replaces the old per-flat panels, which left a slot
 * at every corner of the 10-gon. The bore stays one inset quad per flat, on the
 * chord, so each quad stays on its own face and touches the barb without crossing
 * it. Bore normals are the face normals and point out of the rubber: erosion
 * shrinks the cap off the barb. Do not recompute those normals. The cup vertices
 * sit well outside the bore, so a later weld cannot average the two.
 */
function gonCapLocal(r: number, segs: number, engage: number, outer: number, cup: number) {
  const tris: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [];
  const ap = r * Math.cos(Math.PI / segs);
  const half = r * Math.sin(Math.PI / segs);
  const u = half - Math.min(0.22, half * 0.28);
  const yRoot = -engage;
  const yTip = -0.04;
  const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  for (let i = 0; i < segs; i++) {
    const th = ((i + 0.5) / segs) * Math.PI * 2;
    const N = new THREE.Vector3(Math.sin(th), 0, Math.cos(th));
    const T = new THREE.Vector3(Math.cos(th), 0, -Math.sin(th));
    const at = (radial: number, along: number, y: number) => P(N.x * radial + T.x * along, y, N.z * radial + T.z * along);
    const bore = [at(ap, -u, yRoot), at(ap, u, yRoot), at(ap, u, yTip), at(ap, -u, yTip)];
    tris.push(...facePair(bore[0], bore[3], bore[2], bore[1], N.clone().negate()));
  }
  const length = engage + cup;
  const side = new THREE.CylinderGeometry(outer, outer, length, 32, 1, true);
  side.translate(0, (cup - engage) / 2, 0);
  const disc = new THREE.CircleGeometry(outer, 32);
  disc.rotateX(Math.PI / 2);
  disc.translate(0, cup, 0);
  return { wall: flatGeom(tris), cup: mergeGeometries([side, disc], false)! };
}
/** Bake a local cap (tip at the origin, +Y outward) onto a cylBetween barb. */
function capOnCylBetween(root: V3, tip: V3, r: number, segs: number, engage: number, outer: number, cup: number) {
  const { wall, cup: cupGeo } = gonCapLocal(r, segs, engage, outer, cup);
  const va = new THREE.Vector3(...root), vb = new THREE.Vector3(...tip);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  for (const g of [wall, cupGeo]) {
    g.applyQuaternion(q);
    g.translate(vb.x, vb.y, vb.z);
  }
  return { wall, cup: cupGeo };
}
/**
 * Rubber cap for TEE_AIR_INJ, shown only when the air-injection group is off.
 *
 * The nipple is cylBetween([x, y+8, z], [x, y, z], 2.8, 10), the shape of
 * TEE_AIR_INJ. The cup covers 5 mm of that 8 mm barb. The hose, when emissions
 * equipment is on, carries the clamp; this cap is bare. One cylinder closed by
 * an end disc, bore quads on the 10-gon flats. No MATING entry.
 */
export function airInjVacCap() {
  const p = new Part();
  const [ix, iy, iz] = TEE_AIR_INJ.point;
  const { wall, cup } = capOnCylBetween([ix, iy + 8, iz], [ix, iy, iz], 2.8, 10, 5, 4.6, 4);
  p.add(cup, 'rubber');
  p.add(wall, 'rubber');
  return p;
}
/**
 * Rubber cap on the EGR tee's diverter port. 202-05 has no plug for that port.
 * Shown only when the diverter hose is hidden. Five millimetres of the 10-sided
 * barrel, bore on the flats.
 */
function egrTeeCapGeom() {
  const tip = EGR_TEE_PORTS.aft.point;
  const axis = vnorm(EGR_TEE_PORTS.aft.axis);
  const root = vadd(tip, vmul(axis, -18));
  return capOnCylBetween(root, tip, 2.2, 10, 5, 3.15, 3.2);
}
const along = (a: V3, b: V3) => V(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
const mid = (a: V3, b: V3): V3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
const at = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function registerAncillarySmall(def: (id: string, proto: () => Part, items: () => THREE.Matrix4[]) => void) {
  const M = (p: V3, n: THREE.Vector3 = Y, x?: THREE.Vector3) => frame(V(...p), n, x);
  def('air-inj-vac-cap', () => airInjVacCap(), () => [new THREE.Matrix4()]);
  // Gasket under the breather flange (case top y 122) and on the intermediate-shaft cover face (z 282).
  def('breather-gasket', () => new Part().add(plate(28, 0.8, 22), 'gasket'), () => [M([-52, 121.6, 146] as V3)]);
  def('ishaft-cover-gasket', () => new Part().add(yToZ(cyl(20, 0.6, 28)), 'gasket', [72, -48, 282.3]), () => [new THREE.Matrix4()]);
  if (VARIANT.airInjection) {
    const Zp = V(0, 0, 1);
    def('air-rubber', () => new Part().add(torus(8, 3.2, 8, 16), 'rubber'), () =>
      AIR_MOUNTS.map((q) => M(q)));
    def('air-sleeve', () => new Part().add(yToZ(cyl(3, 28, 10)), 'steel'), () =>
      AIR_MOUNTS.map((q) => M(q)));
    // Buffers pressed into the retaining clip.
    def('air-buffer', () => new Part().add(yToX(cyl(5, 10, 12)), 'rubber'), () =>
      [[-189, 114, 352], [-189, 114, 358]].map((q) => M(q as V3)));
    const inlet = checkValveInlet();
    const outDir = vnorm(vsub(PUMP_OUT.tip, PUMP_OUT.neck));
    // 108-00 #28–#31 are short elbows off the pump and the diverter, not loops around the housing.
    // Diverter inlet tip is the outboard end of the nipple (x −172). Outlet tip is y 56. Dump tip is z 482.
    // #28 leaves the outlet (up and outboard), turns aft and down, and runs inboard onto the
    // diverter inlet. Each leg is long enough for a bend of 1.5× the 12 mm OD.
    const pumpHose: V3[] = [
      vadd(PUMP_OUT.tip, vmul(outDir, -HOSE_PUSH)),
      PUMP_OUT.tip,
      vadd(PUMP_OUT.tip, vmul(outDir, 50)),
      [-358.9, 152.1, 413],
      [-348, 130, 430],
      [-318, 92, 446],
      [-276, 54, 450],
      [-230, 30, 448],
      [-216, 26, 448],
      [-172, 26, 448],
      [-165, 26, 448],
    ];
    // #29 is the elbow from the upward diverter outlet down onto the check-valve inlet.
    // The last straight run starts at y 30: higher than that the centreline meets the pump fins.
    const valveHose: V3[] = [
      [-142, 56 - HOSE_PUSH, 448],
      [-142, 56, 448],
      [-150, 96, 438],
      [-172, 108, 418],
      [-196, 88, 398],
      [-197, 69, 392],
      [inlet[0], 30, inlet[2]],
      inlet,
      [inlet[0], inlet[1] - HOSE_PUSH, inlet[2]],
    ];
    // Kat 502 p.141, illustration 108-00 item 30 (930 113 139 02): a short straight
    // sleeve under the diverter. 7 mm on the dump nipple (r 7), then the open run.
    // OD 16 is larger than the nipple (OD 14), so the bore closes down onto the brass.
    const dumpCtrl: V3[] = [
      [-142, 26, 482 - HOSE_PUSH],
      [-142, 26, 482],
      [-142, 26, 543],
    ];
    const pumpSeat: PushSeat = { point: PUMP_OUT.tip, axis: outDir, barbR: 6.2, segs: 12, hoseR: 6 };
    const inletSeat: PushSeat = { point: [-172, 26, 448], axis: [-1, 0, 0], barbR: 7, segs: 12, hoseR: 6 };
    const outletSeat: PushSeat = { point: [-142, 56, 448], axis: [0, 1, 0], barbR: 7, segs: 12, hoseR: 6 };
    const valveSeat: PushSeat = { point: inlet, axis: [0, 1, 0], barbR: 7, segs: 12, hoseR: 6 };
    const dumpSeat: PushSeat = { point: DUMP_PORT.point, axis: DUMP_PORT.axis, barbR: 7, segs: 12, hoseR: 8 };
    // Rings live on the clamp parts, halfway along the sleeve. The hose only carries the bore.
    def('air-hose-pump', () => pushHose(pumpHose, 6, 24, [pumpSeat, inletSeat], false), () => [new THREE.Matrix4()]);
    def('air-hose-valve', () => pushHose(valveHose, 6, 24, [outletSeat, valveSeat], false), () => [new THREE.Matrix4()]);
    def('air-hose-dump', () => pushHose(dumpCtrl, 8, 28, [dumpSeat]), () => [new THREE.Matrix4()]);
    // 108-00 #31, catalogue 750 mm, modelled 848 mm. 7 mm on the diverter nipple and 7 mm on TEE_AIR_INJ.
    // The throttle end is straight up the axis from y 190 through the tip, so the
    // 30 mm of clear air under the nipple stays coaxial. The turn onto that leg
    // is a 3×OD bend. Bore on that barb is the nipple radius, 2.8.
    const airSeat: PushSeat = {
      point: TEE_AIR_INJ.point, axis: TEE_AIR_INJ.axis, barbR: TEE_AIR_INJ.barbR, segs: 10, hoseR: VAC_HOSE_R,
    };
    const vacCtrl = seated(
      { point: DIVERTER_VAC, axis: [1, 0, 0] },
      airSeat,
      [
        // U-turn off the +X nipple, then the outboard road over the fan.
        // A reversal here fillets to about 4 mm, under the 3×OD floor.
        [-59, 110, 410],
        [-200, 140, 390],
        [-230, 235, 300],
        [-230, 250, 118],
        [-145, 240, 115],
        [-90, 190, 165],
      ],
      50,
      47,
      HOSE_PUSH,
    );
    const vacDiverterSeat: PushSeat = { point: DIVERTER_VAC, axis: [1, 0, 0], barbR: 2.2, segs: 10, hoseR: VAC_HOSE_R };
    def('air-hose-vacuum', () => pushHose(vacCtrl, VAC_HOSE_R, 24, [vacDiverterSeat, airSeat], false), () => [new THREE.Matrix4()]);
    def('air-clamp-vacuum', () => {
      const p = new Part();
      placeClamp(p, sleeveOuter(VAC_HOSE_R, 2.2), vacDiverterSeat);
      placeClamp(p, sleeveOuter(VAC_HOSE_R, TEE_AIR_INJ.barbR), airSeat);
      return p;
    }, () => [new THREE.Matrix4()]);
    const onSleeve = (seat: PushSeat) => M(vadd(seat.point, vmul(vnorm(seat.axis), -HOSE_PUSH / 2)), V(...vnorm(seat.axis)));
    def('air-clamp-pump', () => wireClamp(sleeveOuter(6, 6.2)), () => [onSleeve(pumpSeat)]);
    def('air-clamp-valve', () => wireClamp(sleeveOuter(6, 7)), () => [onSleeve(valveSeat)]);
    // 108-00 #33, one band on #28 and one on #29. Each sits on the swollen sleeve, halfway along the 7 mm push-on.
    def('air-clamp-dump', () => wireClamp(sleeveOuter(6, 7)), () => [onSleeve(inletSeat), onSleeve(outletSeat)]);
    const [vx, vy, vz] = AIR_CHECK_VALVE_OUTLET.point;
    def('air-sealing-ring', () => new Part().add(torus(13.2, 1.2, 8, 24).rotateX(Math.PI / 2), 'copper'), () => [M([vx, vy - 0.4, vz] as V3)]);
    def('air-check-gasket', () => new Part().add(torus(12, 1.2, 8, 20).rotateX(Math.PI / 2), 'rubber'), () => [M([vx, vy + CHECK_HEX_H + 0.4, vz] as V3)]);
    const pulleyBolt = (i: number): V3 => {
      const a = PULLEY_BOLT_A0 + (i / 4) * Math.PI * 2;
      return [P.x + PULLEY_BOLT_R * Math.cos(a), P.y + PULLEY_BOLT_R * Math.sin(a), FAN.zPumpBelt - 6];
    };
    def('air-pulley-screws', () => new Part().add(cyl(2.2, 10, 8), 'zincPlate'), () =>
      [0, 1, 2, 3].map((i) => M(pulleyBolt(i), Zp)));
    def('air-pulley-washers', () => new Part().add(torus(4.6, 0.8, 6, 14).rotateX(Math.PI / 2), 'darkSteel'), () =>
      [0, 1, 2, 3].map((i) => {
        const q = pulleyBolt(i);
        return M([q[0], q[1], q[2] - 4] as V3, Zp);
      }));
    def('air-bracket-nuts', () => {
      const p = new Part();
      // On the sleeve ends, seated against each eye. Bolt axis is +Z.
      for (const [x, y, z] of AIR_MOUNTS) p.add(yToZ(hexNut(13, 7)), 'zincPlate', [x, y, z - 16]);
      return p;
    }, () => [new THREE.Matrix4()]);
    def('air-pump-fasteners', () => {
      const p = new Part();
      // Nuts on the buffer studs, strap bolt through the clip, pivot screw through the lower eye.
      for (const z of [352, 358]) p.add(yToX(hexNut(10, 6)), 'zincPlate', [-196, 114, z]);
      p.add(yToZ(cyl(3.2, 14, 8)), 'zincPlate', [-188, 116, BODY_ZC]);
      p.add(yToZ(cyl(3.6, 16, 10)), 'zincPlate', [BR_PIVOT[0], BR_PIVOT[1], BR_PIVOT[2] + 4]);
      p.add(yToZ(hexNut(13, 6)), 'zincPlate', [BR_PUMP[0], BR_PUMP[1], BR_PUMP[2] + 11.2]);
      return p;
    }, () => [new THREE.Matrix4()]);
    def('air-diverter-nuts', () => {
      const p = new Part();
      p.add(hexNut(10, 6), 'zincPlate', [-142, 5, 444]);
      p.add(hexNut(10, 6), 'zincPlate', [-134, 5, 452]);
      return p;
    }, () => [new THREE.Matrix4()]);
  }
  if (VARIANT.egr) {
    const e = EGR;
    def('egr-gasket', () => new Part().add(torus(16, 1.2, 6, 18).rotateX(Math.PI / 2), 'gasket'), () => [M([e.x, e.y - 8, e.z] as V3)]);
    def('egr-seal', () => new Part().add(torus(7, 2.2, 6, 14), 'rubber'), () => [M([e.x, e.y + 10, e.z + 32] as V3)]);
    def('egr-buffer', () => new Part().add(cyl(6, 8, 12), 'rubber'), () => [M([e.x, e.y - 34, e.z] as V3)]);
    // Four 10-sided barbs, r 2.2, each the port the matching hose slides onto.
    def('egr-tee', () => {
      const p = new Part();
      // Upper and aft leave the centre on the hose axis. The two outboard ports
      // turn, so each has a straight 12 mm barb: the clamp sits on that barrel,
      // not on the diagonal run back to the junction.
      p.add(cylBetween(EGR_TEE_CTR, EGR_TEE_PORTS.upper.point, 2.2, 10), 'blackPlastic');
      p.add(cylBetween(EGR_TEE_CTR, EGR_TEE_PORTS.aft.point, 2.2, 10), 'blackPlastic');
      for (const port of [EGR_TEE_PORTS.lower, EGR_TEE_PORTS.outboard]) {
        const root = vadd(port.point, vmul(vnorm(port.axis), -12));
        p.add(cylBetween(root, port.point, 2.2, 10), 'blackPlastic');
        p.add(cylBetween(EGR_TEE_CTR, root, 2.2, 10), 'blackPlastic');
      }
      return p;
    }, () => [new THREE.Matrix4()]);
    const vacSeat = (end: { point: V3; axis: V3 }, segs = 10, barbR = 2.2): PushSeat => ({
      ...end, barbR, segs, hoseR: VAC_HOSE_R,
    });
    // 202-05 #15, about 40 mm. Tips are 33 mm apart on one axis; 7 mm on each barb.
    // Leads stay short of each other so the run is one straight line.
    const up = EGR_TEE_PORTS.upper;
    const shortCtrl = seated(THROTTLE_PORTED_VAC, up, [], 16, 12, HOSE_PUSH);
    const shortSeats = [vacSeat(THROTTLE_PORTED_VAC, 12, 3.2), vacSeat(up)];
    def('egr-hose-short', () => pushHose(shortCtrl, VAC_HOSE_R, 24, shortSeats, false), () => [new THREE.Matrix4()]);
    // 202-05 #16, 770 mm. Outboard port, then the left-side corridor down to the
    // valve's −Z barb. The straight 465 mm chord from the throttle tee to that
    // barb passes through the crankcase, so this is the clear run.
    const ob = EGR_TEE_PORTS.outboard;
    const longCtrl = seated(ob, EGR_BARB_2, [
      [-150, 198, 100],
      [-188, 150, 120],
      [-170, 110, 150],
      [-162, 20, 158],
      [-162, -85, 160],
      [-90, -145, 115],
      [40, -175, 40],
    ], 22, 200, HOSE_PUSH);
    const longSeats = [vacSeat(ob), vacSeat(EGR_BARB_2, 8)];
    def('egr-hose-long', () => pushHose(longCtrl, VAC_HOSE_R, 24, longSeats, false), () => [new THREE.Matrix4()]);
    // One 202-05 #17. The printed 465 mm is the straight cut; the clear run has
    // to stay outboard of the case, so it is longer. It parallels #16, 14 mm above it.
    const lo = EGR_TEE_PORTS.lower;
    const backCtrl = seated(lo, EGR_BARB_UP, [
      [-150, 210, 95],
      [-200, 160, 115],
      [-182, 112, 172],
      [-174, 22, 180],
      [-166, -68, 184],
      [-150, -108, 172],
      [-96, -148, 142],
      [-20, -155, 150],
      [-12, -210, 40],
    ], 52, 36, HOSE_PUSH);
    const returnSeats = [vacSeat(lo), vacSeat(EGR_BARB_UP)];
    def('egr-hose-return', () => pushHose(backCtrl, VAC_HOSE_R, 24, returnSeats, false), () => [new THREE.Matrix4()]);
    // The other 202-05 #17, to the diverter. Hidden with air injection;
    // egr-tee-cap closes this port while it is off. The 465 mm chord crosses the
    // fan and the chain housing, so the hose goes over them.
    const aft = EGR_TEE_PORTS.aft;
    // First corner is further along the port axis, so the lead stays straight.
    const divCtrl = seated(aft, { point: DIVERTER_VAC_EGR, axis: [1, 0, 0] }, [
      vadd(aft.point, vmul(aft.axis, 100)),
      [-250, 290, 175],
      [-265, 270, 260],
      [-265, 180, 400],
      [-190, 150, 460],
      [-25, 140, 432],
    ], 55, 84, HOSE_PUSH);
    const divSeats = [vacSeat(aft), vacSeat({ point: DIVERTER_VAC_EGR, axis: [1, 0, 0] })];
    def('egr-hose-diverter', () => pushHose(divCtrl, VAC_HOSE_R, 24, divSeats, false), () => [new THREE.Matrix4()]);
    const band = sleeveOuter(VAC_HOSE_R, 2.2);
    def('egr-clamp-diverter', () => {
      const p = new Part();
      for (const s of divSeats) placeClamp(p, band, s);
      return p;
    }, () => [new THREE.Matrix4()]);
    def('egr-clamp-vac', () => {
      const p = new Part();
      for (const s of [...shortSeats, ...longSeats, ...returnSeats]) {
        placeClamp(p, sleeveOuter(VAC_HOSE_R, s.barbR), s);
      }
      return p;
    }, () => [new THREE.Matrix4()]);
    def('egr-tee-cap', () => {
      const { wall, cup } = egrTeeCapGeom();
      return new Part().add(cup, 'rubber').add(wall, 'rubber');
    }, () => [new THREE.Matrix4()]);
    def('egr-fasteners', () => {
      const p = new Part();
      // Nuts on the flange annulus, above the body. Bolts through the bracket, below the valve.
      for (const ang of [0.6, 2.4]) {
        p.add(hexNut(10, 6), 'zincPlate', [e.x + 30 * Math.cos(ang), e.y + 34, e.z + 30 * Math.sin(ang)]);
      }
      p.add(hexNut(10, 6), 'zincPlate', [e.x, e.y - 26, e.z]);
      p.add(cyl(3, 12, 8), 'zincPlate', [e.x - 18, e.y - 24, e.z]);
      p.add(cyl(3, 12, 8), 'zincPlate', [e.x + 18, e.y - 24, e.z]);
      return p;
    }, () => [new THREE.Matrix4()]);
  }
  // 105-10 baffles under the barrels, on the fin-gap line [s*70, −186, z].
  // Vertical sprung sheet: thin across the fin gap (Z), standing in Y, with a crowned top edge.
  const baffle = (w: number, h: number, t: number) => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, -h / 2);
    s.lineTo(w / 2, -h / 2);
    s.lineTo(w / 2, h / 2 - 2);
    s.quadraticCurveTo(0, h / 2 + 3, -w / 2, h / 2 - 2);
    s.closePath();
    const g = extrude(s, t, 0, 6);
    g.translate(0, 0, -t / 2);
    return new Part().add(g, 'zincPlate');
  };
  const gapZ = (a: number, b: number) => (CYL_Z[a] + CYL_Z[b]) / 2;
  const gaps: [number, number][] = [[1, 2], [2, 3], [4, 5], [5, 6]];
  const atBaffle = (s: number, z: number) => M([s * 70, -186, z]);
  def('cyl-baffle-14', () => baffle(48, 14, 2.4), () => gaps.map(([a, b]) => {
    const s = a <= 3 ? 1 : -1;
    return atBaffle(s, gapZ(a, b));
  }));
  def('cyl-baffle-15', () => baffle(40, 14, 2.4), () => [1, 4].map((c) => {
    const s = c <= 3 ? 1 : -1;
    return atBaffle(s, CYL_Z[c] + 70);
  }));
  def('cyl-baffle-16', () => baffle(40, 14, 2.4), () => [3, 6].map((c) => {
    const s = c <= 3 ? 1 : -1;
    return atBaffle(s, CYL_Z[c] - 70);
  }));
  def('cyl-baffle-spring', () => new Part().add(tube([[-8, -5, 0], [-3, 3, 1.2], [3, 5, 0], [8, -5, -1.2]], 1.05, 6, 20), 'darkSteel'), () => [1, 2, 3, 4, 5, 6].map((c) => {
    const s = c <= 3 ? 1 : -1;
    return atBaffle(s, CYL_Z[c]);
  }));
  def('cyl-cover-plate', () => new Part().add(plate(40, 3, 220), 'zincPlate'), () => [1, -1].map((s) =>
    M([s * 70, -208, 0] as V3)));
  // Heater hoses (108-10 #10 and #13). Each rubber end slides 7 mm onto its spigot.
  // Bend radius is 1.5× the 30 mm OD. The spigot bead stays behind that overlap.
  const hb = HEATER_BLOWER;
  const rightStub = heaterStub(1), leftStub = heaterStub(-1);
  const hoseR = 15;
  const heaterBend = 58;
  const socketTip: V3 = [245, hb.y, 340];
  const link: V3[] = [
    [socketTip[0] - HOSE_PUSH, hb.y, 340],
    socketTip,
    [280, hb.y, 352],
    [hb.x, hb.y, hb.z - 34],
  ];
  const onStub = (stub: ReturnType<typeof heaterStub>, z: number): V3 => [stub.tip[0], stub.tip[1], z];
  const rightMouth: V3 = [hb.x + 26, 64, hb.z];
  const leftMouth: V3 = [hb.x - 26, 64, hb.z];
  // The spigot points +Z at the silencer. The hose stays above the drum, then
  // drops on a diagonal that clears the superellipse, and runs coaxial to z 236
  // (short of the bead at z 226). That leg is what keeps the bend at 1.5× OD.
  const rightH: V3[] = [
    rightMouth,
    [300, -20, 400],
    [rightStub.tip[0], -70, 355],
    onStub(rightStub, 300),
    onStub(rightStub, 236),
  ];
  const leftH: V3[] = [
    leftMouth,
    [40, -25, 400],
    [-120, -55, 400],
    [leftStub.tip[0], -70, 370],
    onStub(leftStub, 290),
    onStub(leftStub, 236),
  ];
  const big = (end: { point: V3; axis: V3 }, segs = 12, barbR = 12): PushSeat => ({ ...end, barbR, segs, hoseR });
  const rightSeats = [
    big({ point: rightMouth, axis: [1, 0, 0] }),
    big({ point: rightStub.tip, axis: [0, 0, 1] }),
  ];
  const leftSeats = [
    big({ point: leftMouth, axis: [-1, 0, 0] }),
    big({ point: leftStub.tip, axis: [0, 0, 1] }),
  ];
  const linkSeat: PushSeat = { point: socketTip, axis: [1, 0, 0], barbR: 11, segs: 14, hoseR: 9 };
  const withEnds = (pts: V3[], r: number, bend: number, seats: PushSeat[], ring = false) => {
    const p = new Part();
    p.add(corrugatedHose(pts, r, bend), 'rubber');
    for (const s of seats) addPushEnd(p, s, ring);
    return p;
  };
  def('heater-dist-piece', () => {
    const p = new Part();
    // Moulded tee: neck up into the blower outlet, elbows out to the two hoses.
    // Each mouth is an 8 mm cylinder (12 sides) so the hose bore shares its flats.
    p.add(cyl(12, 26, 16), 'blackPlastic', [0, 14, 0]);
    p.add(cylBetween([26, 0, 0], [18.2, 0, 0], 12, 12), 'blackPlastic');
    p.add(cylBetween([-26, 0, 0], [-18.2, 0, 0], 12, 12), 'blackPlastic');
    p.add(tube([[-18, 0, 0], [-8, 0, 0], [0, 8, 0], [0, 22, 0]], 12, 10, 28), 'blackPlastic');
    p.add(tube([[18, 0, 0], [8, 0, 0], [0, 8, 0], [0, 18, 0]], 12, 10, 28), 'blackPlastic');
    return p;
  }, () => [M([hb.x, 64, hb.z] as V3)]);
  def('heater-socket', () => new Part().add(yToX(cyl(11, 18, 14)), 'castAlu').add(boxMM([-6, 18, -6], [6, 28, 6]), 'castAlu'), () => [M([236, hb.y, 340] as V3)]);
  def('heater-hose-link', () => withEnds(link, 9, 27, [linkSeat]), () => [new THREE.Matrix4()]);
  def('heater-hose-right', () => withEnds(rightH, hoseR, heaterBend, rightSeats), () => [new THREE.Matrix4()]);
  def('heater-hose-left', () => withEnds(leftH, hoseR, heaterBend, leftSeats), () => [new THREE.Matrix4()]);
  def('heater-hose-supports', () => wormBand(15), () => [
    M(at(rightH[0], rightH[1], 0.62), along(rightH[0], rightH[1])),
    M(at(leftH[1], leftH[2], 0.22), along(leftH[1], leftH[2])),
  ]);
  const half = (seat: PushSeat) => M(vadd(seat.point, vmul(vnorm(seat.axis), -HOSE_PUSH / 2)), V(...vnorm(seat.axis)));
  // Socket end: the sleeve is wider than the free run, so this band is sized to that OD.
  def('heater-clamp-sp', () => wireClamp(sleeveOuter(9, 11)), () => [half(linkSeat)]);
  def('heater-clamp-band', () => wormBand(9), () => [
    M(at(link[2], link[3], 0.35), along(link[2], link[3])),
    M(at(link[1], link[2], 0.55), along(link[1], link[2])),
  ]);
  def('heater-clamps', () => wormBand(15), () => {
    const band = (h: V3[], i: number, t: number) => M(at(h[i], h[i + 1], t), along(h[i], h[i + 1]));
    // Four sit halfway along the push-on. Two stay on the free run. 108-10 #12 is six.
    return [
      half(rightSeats[0]), half(rightSeats[1]),
      half(leftSeats[0]), half(leftSeats[1]),
      band(rightH, 1, 0.55), band(leftH, 2, 0.45),
    ];
  });
  def('heater-blower-hardware', () => {
    const p = new Part();
    // Heads seated on the arm's aft face; shanks run through the arm and the foot.
    const zArm = hb.z - 3;
    const zFoot0 = hb.z - 16;
    const headZ = zArm + 6 + 1.5;
    const shankZ1 = zArm + 6;
    const shankZ0 = zFoot0 + 0.4;
    for (const [x, y] of HEATER_BOLTS) {
      p.add(yToZ(hexNut(8, 3)), 'darkSteel', [x, y, headZ]);
      p.add(yToZ(cyl(2.2, shankZ1 - shankZ0, 8)), 'zincPlate', [x, y, (shankZ0 + shankZ1) / 2]);
    }
    p.add(hexNut(10, 5), 'zincPlate', [236, hb.y + 23, 340]);
    p.add(hexNut(10, 5), 'zincPlate', [234, hb.y + 23, 338]);
    return p;
  }, () => [new THREE.Matrix4()]);
  if (VARIANT.frontExhaust === 'catalytic-converter') {
    const c = (x: number, y: number, z: number): V3 => [x, y - 250, z - 330];
    // Can radius is 28. The arch's lower edge is local y −2, so a placement y of 30
    // sits that edge on the crown. Centred on the can (z 0), not 24 mm off to one side.
    const shieldAt = c(0, 30, 0);
    const CAT_BOLTS: [number, number][] = [];
    for (const x of [-36, -12, 12, 36]) for (const z of [-12, 12]) CAT_BOLTS.push([x, z]);
    def('cat-cover', () => {
      const p = new Part();
      // Pressed heat shield: a shallow arch, not a flat plate. Edges at x ±46.
      const s = new THREE.Shape();
      s.moveTo(-46, 0); s.quadraticCurveTo(0, 12, 46, 0); s.lineTo(46, -2);
      s.quadraticCurveTo(0, 10, -46, -2); s.closePath();
      let shield: THREE.BufferGeometry = extrude(s, 36).translate(0, 0, -18);
      const holes = CAT_BOLTS.map(([x, z]) => cyl(4.6, 8, 12).translate(x, catArchOuter(x) - 2, z));
      const random = Math.random;
      let sRand = 0xCA7B01 >>> 0;
      Math.random = () => {
        sRand = (sRand + 0x6D2B79F5) >>> 0;
        let t = Math.imul(sRand ^ (sRand >>> 15), 1 | sRand);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      try { shield = csgSub(shield, ...holes); }
      finally { Math.random = random; }
      p.add(shield, 'aluminized');
      return p;
    }, () => [M(shieldAt)]);
    def('cat-cap', () => new Part().add(cyl(8, 6, 12), 'zincPlate'), () => [M(c(96, 20, 0))]);
    def('cat-plug', () => new Part().add(hexNut(10, 5), 'zincPlate').add(torus(5, 0.8, 6, 12).rotateX(Math.PI / 2), 'copper'), () => [M(c(96, 26, 0))]);
    def('cat-bracket', () => {
      const p = new Part();
      // 3 mm strap. Top face at local y 1.5, so placement y −29.5 puts it on the can bottom (y −28).
      p.add(new THREE.BoxGeometry(48, 3, 12, 2, 2, 2), 'zincPlate');
      p.add(new THREE.BoxGeometry(14, 3, 12, 2, 2, 2), 'zincPlate', [-28, -6, 0], [0, 0, 0.7]);
      return p;
    }, () => [M(c(40, -29.5, 0))]);
    def('cat-cover-fasteners', () => {
      const p = new Part();
      // Head seated on the arch. Shank through the sheet and 4 mm into the can.
      for (const [x, z] of CAT_BOLTS) {
        const yOut = catArchOuter(x);
        const yTip = catCanTop(z) - 4;
        p.add(hexNut(8, 3), 'zincPlate', [x, yOut + 1.5, z]);
        p.add(cyl(2.2, yOut - yTip, 8), 'zincPlate', [x, (yOut + yTip) / 2, z]);
      }
      return p;
    }, () => [M(shieldAt)]);
  }
  void box;
}
