/**
 * Bottom-end ancillaries traced from Kat 502: air injection (108-00), heater blower (108-10),
 * EGR (202-05), cylinder baffles (105-10) and the 930/04 catalytic converter (202-00 #6).
 * Drawings decide shape and placement. Coordinates are millimetres in the engine frame.
 */
import * as THREE from 'three';
import { VARIANT } from '../data/variant';
import { CYL_Z } from '../data/layout';
import { FAN, SHROUD, AIR_CHECK_VALVE_OUTLET, CHECK_HEX_H, heaterStub, EGR_FEED_PORT } from './aux';
import { TEE_AIR_INJ, THROTTLE_PORTED_VAC } from './induction';
import { frame } from './instancing';
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
const PUMP_OUT = {
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
/** Bracket eyes: pump, pivot (#11), case. Rubbers sit in the pivot and the case eye. */
const BR_PUMP: V3 = [-186, -8, BR_Z];
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
  p.add(cyl(13, 10, 14).rotateX(Math.PI / 2), 'castAlu', PUMP_EAR_LO);
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
  // Triangular cast arm. Eyes: pump (on the lower ear), pivot (#11), case.
  const shape = polyShape([
    [BR_PUMP[0], BR_PUMP[1]], [BR_PIVOT[0], BR_PIVOT[1]], [BR_CASE[0], BR_CASE[1]],
  ]);
  const holeAt = (x: number, y: number, r: number) => { shape.holes.push(circlePath(r, x, y) as THREE.Path); };
  holeAt(-168, -6, 6);
  holeAt(-156, 28, 7);
  p.add(extrude(shape, 7).translate(0, 0, BR_Z - 3.5), 'castAlu');
  const eye = (at: V3, r = 12) => p.add(yToZ(lathe([[5.5, -7], [r, -7], [r, 7], [5.5, 7]], 18)), 'castAlu', at);
  eye(BR_PUMP, 13);
  eye(BR_PIVOT, 12);
  eye(BR_CASE, 13);
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
  p.add(yToX(cyl(3.2, 14, 10)), 'castAlu', [-116, 22, 432]);
  p.add(yToX(cyl(3.2, 14, 10)), 'castAlu', [-116, 12, 432]);
  return p.g;
}
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
  // Mounting foot. Inboard face meets the support.
  p.add(boxMM([b.x - 40, b.y - 18, b.z - 16], [b.x - 28, b.y + 12, b.z + 14]), 'blackPlastic');
  p.add(boxMM([b.x - 36, b.y - 22, b.z - 8], [b.x - 30, b.y - 16, b.z + 8]), 'blackPlastic');
  return p.g;
}
export function heaterBlowerSupport() {
  const p = new Part();
  const b = HEATER_BLOWER;
  // Cast arm with a lightening hole, ending on the blower foot. Aft of the fan drum.
  const x0 = b.x - 96, x1 = b.x - 40.6, y0 = b.y - 20, y1 = b.y + 18;
  const shape = polyShape([[x0, y0 + 6], [x1, y0], [x1, y1], [x0 + 18, y1], [x0, (y0 + y1) / 2 + 8]]);
  shape.holes.push(circlePath(7, (x0 + x1) / 2 - 4, b.y) as THREE.Path);
  p.add(extrude(shape, 6).translate(0, 0, b.z - 3), 'zincPlate');
  p.add(boxMM([x0 - 2, y0 - 2, b.z - 10], [x0 + 18, y0 + 3, b.z + 10]), 'zincPlate');
  return p.g;
}

export const EGR = { x: -70, y: -300, z: 20 };
export function egrValve() {
  const p = new Part();
  const e = EGR;
  // Diaphragm chamber with a crimped lip, cast body under it. Port tips are unchanged.
  p.add(lathe([
    [8, 0], [20, 0], [26, 3], [28, 8], [28, 14], [22, 18], [14, 20], [10, 18], [8, 12],
  ], 32), 'castAlu', [e.x, e.y + 22, e.z]);
  p.add(lathe([
    [12, 0], [18, 2], [20, 8], [16, 18], [14, 24], [12, 26],
  ], 28), 'castAlu', [e.x, e.y - 6, e.z]);
  p.add(cyl(6, 14, 10), 'castAlu', [e.x + 18, e.y + 36, e.z]);
  // Second vacuum barb, offset in Z, for one of the 202-05 #17 hoses.
  p.add(yToZ(cyl(3.2, 14, 8)), 'castAlu', [e.x + 18, e.y + 40, e.z - 16]);
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

/**
 * Air guide 911 106 406 00 (105-05 #3). Oil-cooler air duct, riveted to the underside of the
 * left shroud wing. Stoddard lists the successor 911 106 406 01 as "Air Duct For Oil Cooler".
 * On the 105-05 drawing it is the small duct under the shroud, open toward the fan, over the
 * engine oil cooler on the left case. Four rivets (no separate catalogue line) go up into the wing.
 */
/** Left shroud wing: underside is the z=0 face of the sloped sheet. +n goes up into the skin. */
function leftWingFrame() {
  const { ax, ay, bx, by } = SHROUD;
  const ang = Math.atan2(by - ay, bx - ax);
  const u = new THREE.Vector3(Math.cos(ang) * -1, Math.sin(ang), 0);
  const e = new THREE.Vector3(0, 0, 1);
  const n = new THREE.Vector3().crossVectors(u, e).normalize();
  const origin = new THREE.Vector3(ax * -1, ay, 0);
  return { u, e, n, origin };
}
function wingBox(su0: number, su1: number, se0: number, se1: number, sn0: number, sn1: number) {
  const { u, e, n, origin } = leftWingFrame();
  const g = new THREE.BoxGeometry(su1 - su0, se1 - se0, sn1 - sn0, 2, 2, 2);
  const mid = origin.clone()
    .addScaledVector(u, (su0 + su1) / 2)
    .addScaledVector(e, (se0 + se1) / 2)
    .addScaledVector(n, (sn0 + sn1) / 2);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(u, e, n).setPosition(mid));
  return g;
}

export function coolerAirGuide() {
  const p = new Part();
  // Duct under the left wing, over the flywheel half of the right-case cooler.
  // The flange top lies on the wing underside (sn = 0). The body hangs below it,
  // open toward the fan. Stops at z 48 so it misses the ignition-lead holder at z 60.
  // su 17–74 is world x about −112 to −168 along the slope.
  const su0 = 17, su1 = 74, se0 = 32, se1 = 48, wall = 3.6, drop = -12;
  p.add(wingBox(su0, su1, se0, se1, -2.4, 0), 'shroudRed');
  p.add(wingBox(su0, su0 + wall, se0, se1, drop, 0), 'shroudRed');
  p.add(wingBox(su1 - wall, su1, se0, se1, drop, 0), 'shroudRed');
  p.add(wingBox(su0, su1, se0, se0 + wall, drop, 0), 'shroudRed');
  p.add(wingBox(su0, su1, se0, se1 - wall, drop, drop + 2.6), 'shroudRed');
  const { u, e, n, origin } = leftWingFrame();
  for (const [su, se] of [[su0 + 8, 36], [su1 - 8, 36], [su0 + 8, 44], [su1 - 8, 44]] as [number, number][]) {
    const c = origin.clone().addScaledVector(u, su).addScaledVector(e, se);
    const a = c.clone().addScaledVector(n, -2.2);
    p.add(cylBetween([a.x, a.y, a.z], [c.x, c.y, c.z], 2.2, 8), 'zincPlate');
  }
  return p.g;
}

/** World origin of the catalytic converter (smallParts matrix). */
const CAT_AT: V3 = [0, -250, -330];
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
/** Worm-drive band. Hole along +Y so frame() can aim it down the hose. Sized to the hose radius. */
const wormBand = (hoseR: number) => {
  const p = new Part();
  const R = hoseR + 1.2;
  p.add(torus(R, 1.15, 8, 22).rotateX(Math.PI / 2), 'zincPlate');
  p.add(box(8, 5.5, 7), 'zincPlate', [R + 1.5, 0, 0]);
  p.add(yToZ(cyl(1.2, 9, 8)), 'darkSteel', [R + 1.5, 1.2, 0]);
  return p;
};
const along = (a: V3, b: V3) => V(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
const mid = (a: V3, b: V3): V3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
const at = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function registerAncillarySmall(def: (id: string, proto: () => Part, items: () => THREE.Matrix4[]) => void) {
  const M = (p: V3, n: THREE.Vector3 = Y, x?: THREE.Vector3) => frame(V(...p), n, x);
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
      vadd(PUMP_OUT.tip, vmul(outDir, -16)),
      PUMP_OUT.tip,
      vadd(PUMP_OUT.tip, vmul(outDir, 50)),
      [-358.9, 152.1, 413],
      [-348, 130, 430],
      [-318, 92, 446],
      [-276, 54, 450],
      [-230, 30, 448],
      [-216, 26, 448],
      [-172, 26, 448],
    ];
    // #29 is the elbow from the upward diverter outlet down onto the check-valve inlet.
    // The last straight run starts at y 30: higher than that the centreline meets the pump fins.
    const valveHose: V3[] = [
      [-142, 56, 448],
      [-150, 96, 438],
      [-172, 108, 418],
      [-196, 88, 398],
      [-197, 69, 392],
      [inlet[0], 30, inlet[2]],
      inlet,
    ];
    const dumpHose: V3[] = [
      [-142, 26, 464],
      [-142, 26, 482],
      [-128, 8, 540],
      [-108, -20, 610],
    ];
    const vac = TEE_AIR_INJ.point;
    const vacAxis = TEE_AIR_INJ.axis;
    // Axis points out of the spare branch (down). The last three points stay on that
    // axis and end on the TEE_AIR_INJ barb. Nothing else uses that barb. The run up to
    // below(48) stays off z −16 so it misses the fuel lines, and it leaves the
    // diverter nipple inboard of the support ear.
    const below = (d: number): V3 => [
      vac[0] + vacAxis[0] * d, vac[1] + vacAxis[1] * d, vac[2] + vacAxis[2] * d,
    ];
    // Outboard of the fan (x < −134) and aft of it (z > 300), then forward above the
    // plenum's rear wall and inboard onto the tee axis. The last three points stay on that axis.
    const vacHose: V3[] = [
      DIVERTER_VAC,
      // First leg is long enough for the turn off the nipple (1.5× the 4.4 mm OD).
      // The climb stays inboard of the valve hose, then outboard of the fan.
      [-50, 50, 400],
      [-160, 140, 400],
      [-215, 250, 360],
      [-210, 280, 140],
      [-86, 280, 80],
      [below(48)[0], below(48)[1], 36],
      below(48),
      below(16),
      vac,
    ];
    def('air-hose-pump', () => new Part().add(hose(pumpHose, 6, 24), 'rubber'), () => [new THREE.Matrix4()]);
    def('air-hose-valve', () => new Part().add(hose(valveHose, 6, 24), 'rubber'), () => [new THREE.Matrix4()]);
    def('air-hose-dump', () => new Part().add(hose(dumpHose, 6), 'rubber'), () => [new THREE.Matrix4()]);
    def('air-hose-vacuum', () => new Part().add(hose(vacHose, 2.2, 12), 'rubber'), () => [new THREE.Matrix4()]);
    def('air-clamp-pump', () => wormBand(6), () => [M(at(pumpHose[0], pumpHose[1], 0.45), along(pumpHose[0], pumpHose[1]))]);
    def('air-clamp-valve', () => wormBand(6), () => [M(at(valveHose[0], valveHose[1], 0.45), along(valveHose[0], valveHose[1]))]);
    def('air-clamp-dump', () => wormBand(6), () =>
      [M(at(dumpHose[1], dumpHose[2], 0.4), along(dumpHose[1], dumpHose[2])), M(at(dumpHose[2], dumpHose[3], 0.55), along(dumpHose[2], dumpHose[3]))]);
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
      p.add(yToZ(hexNut(13, 6)), 'zincPlate', [BR_PUMP[0], BR_PUMP[1], BR_PUMP[2] + 10]);
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
    def('egr-tee', () => new Part().add(cyl(4, 20, 8), 'blackPlastic').add(yToX(cyl(4, 16, 8)), 'blackPlastic'), () => [M([e.x + 18, e.y + 50, e.z] as V3)]);
    // 202-05 #15 is 40 mm between two barbs 10 mm apart. A circular bow of radius 8.4 mm
    // (above 1.5× the 4.4 mm OD) makes that length and stays outboard of the valve.
    def('egr-hose-short', () => {
      const s: V3 = [e.x + 18, e.y + 40, e.z];
      const tip: V3 = [e.x + 18, e.y + 50, e.z];
      const R = 8.4;
      const midY = (s[1] + tip[1]) / 2;
      const off = Math.sqrt(R * R - ((tip[1] - s[1]) / 2) ** 2);
      const c: V3 = [s[0] + off, midY, s[2]];
      const a0 = Math.atan2(s[1] - c[1], s[0] - c[0]);
      let sweep = Math.atan2(tip[1] - c[1], tip[0] - c[0]) - a0;
      if (sweep > Math.PI) sweep -= Math.PI * 2;
      if (sweep < -Math.PI) sweep += Math.PI * 2;
      // The short arc is only ~10 mm. The catalogue hose is 40 mm, so take the long way around.
      sweep += sweep > 0 ? -Math.PI * 2 : Math.PI * 2;
      const n = Math.ceil(Math.abs(sweep) / (6 * Math.PI / 180));
      const arc: V3[] = [];
      for (let i = 0; i <= n; i++) {
        const a = a0 + (sweep * i) / n;
        arc.push([c[0] + R * Math.cos(a), c[1] + R * Math.sin(a), s[2]]);
      }
      return new Part().add(hose(arc, 2.2, 8), 'rubber');
    }, () => [new THREE.Matrix4()]);
    const egrVac = THROTTLE_PORTED_VAC.point;
    // 202-05 #16 is 770 mm. Under the left exchanger, up just outboard of the shroud
    // skirt, then inboard above that sheet and onto the port. The alternator face is
    // at z 152, so the hose stops on the nipple.
    def('egr-hose-long', () => new Part().add(hose([
      [e.x + 30, e.y + 50, e.z + 14],
      // Outboard of the left cover plate, inboard of the plug-lead drop, then up
      // just clear of the distributor and across above it.
      [-102, -208, 64],
      [-150, -102, 118],
      [-201, -60, 154],
      [-201, 140, 134],
      [-201, 172, 160],
      [-188, 230, 146],
      egrVac,
    ], 2.2, 12), 'rubber'), () => [new THREE.Matrix4()]);
    def('egr-hose-pair', () => {
      const p = new Part();
      // One leg on the valve's second barb. The other is the short hose 202-05 #17 to the diverter nipple.
      p.add(hose([
        [e.x + 18, e.y + 56, e.z],
        [e.x + 18, e.y + 72, e.z],
        [e.x + 36, e.y + 72, e.z - 12],
        [e.x + 36, e.y + 52, e.z - 16],
        [e.x + 18, e.y + 46, e.z - 16],
      ], 2.2), 'rubber');
      // 202-05 #17 is a short hose. Under the left exchanger, up inboard of the
      // muffler and the chain box, then aft onto the diverter nipple along −X.
      p.add(hose([
        [e.x + 8, e.y + 50, e.z],
        [-96, -255, 150],
        [-96, -255, 298],
        [-96, 14, 304],
        [-84, 12, 424],
        DIVERTER_VAC_EGR,
      ], 2.2, 12), 'rubber');
      return p;
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
  // 105-10 baffles under the barrels. The right-case oil cooler (x 82–170, z −202–1,
  // bottom y −236) and the heat-exchanger shell occupy the old right-bank line, so any
  // plate whose Z meets the cooler drops below both, outboard of the core.
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
  const overCooler = (z: number, halfZ: number) => z + halfZ > -202 && z - halfZ < 1;
  // Below the cooler flange (bottom −236) and above the cover plate at −256.
  const baffleAt = (s: number, halfX: number, z: number, halfZ: number, y: number): V3 =>
    s > 0 && overCooler(z, halfZ) ? [174 + halfX, -246, z] : [s * 70, y, z];
  def('cyl-baffle-14', () => baffle(48, 14, 2.4), () => gaps.map(([a, b]) => {
    const s = a <= 3 ? 1 : -1;
    const z = gapZ(a, b);
    return M(baffleAt(s, 24, z, 1.2, -186));
  }));
  def('cyl-baffle-15', () => baffle(40, 14, 2.4), () => [1, 4].map((c) => {
    const s = c <= 3 ? 1 : -1;
    const z = CYL_Z[c] + 70;
    return M(baffleAt(s, 20, z, 1.2, -186));
  }));
  def('cyl-baffle-16', () => baffle(40, 14, 2.4), () => [3, 6].map((c) => {
    const s = c <= 3 ? 1 : -1;
    const z = CYL_Z[c] - 70;
    return M(baffleAt(s, 20, z, 1.2, -186));
  }));
  def('cyl-baffle-spring', () => new Part().add(tube([[-8, -5, 0], [-3, 3, 1.2], [3, 5, 0], [8, -5, -1.2]], 1.05, 6, 20), 'darkSteel'), () => [1, 2, 3, 4, 5, 6].map((c) => {
    const s = c <= 3 ? 1 : -1;
    return M(baffleAt(s, 9, CYL_Z[c], 1.2, -186));
  }));
  def('cyl-cover-plate', () => new Part().add(plate(40, 3, 220), 'zincPlate'), () => [1, -1].map((s) =>
    M(s > 0 ? [174 + 20, -256, 0] as V3 : [-70, -208, 0] as V3)));
  // Heater hoses (108-10 #10 and #13). Short runs from the distributing piece to each
  // fresh-air spigot. Bend radius is 1.5× the 30 mm OD. The last point is on the spigot,
  // past the bead; the tip itself is on the centreline.
  const hb = HEATER_BLOWER;
  const link: V3[] = [[230, hb.y, 340], [280, hb.y, 352], [hb.x, hb.y, hb.z - 34]];
  const rightStub = heaterStub(1), leftStub = heaterStub(-1);
  const hoseR = 15;
  const heaterBend = 58;
  // Above the silencer (its top is y −110, its front is z ≈ 332), then down in the gap
  // ahead of the drum onto each spigot. The last leg passes through the spigot tip.
  const onStub = (stub: ReturnType<typeof heaterStub>, z: number): V3 => [stub.tip[0], stub.tip[1], z];
  const rightH: V3[] = [
    [hb.x + 26, 64, hb.z],
    [300, -20, 400],
    [rightStub.tip[0], -80, 340],
    onStub(rightStub, 300),
    onStub(rightStub, 220),
  ];
  const leftH: V3[] = [
    [hb.x - 26, 64, hb.z],
    [40, -25, 400],
    [-120, -30, 390],
    [leftStub.tip[0], -80, 340],
    onStub(leftStub, 300),
    onStub(leftStub, 220),
  ];
  def('heater-dist-piece', () => {
    const p = new Part();
    // Moulded tee: neck up into the blower outlet, elbows out to the two hoses.
    p.add(cyl(12, 26, 16), 'blackPlastic', [0, 14, 0]);
    p.add(tube([[-26, 0, 0], [-8, 0, 0], [0, 8, 0], [0, 22, 0]], 12, 10, 28), 'blackPlastic');
    p.add(tube([[26, 0, 0], [8, 0, 0], [0, 8, 0], [0, 18, 0]], 12, 10, 28), 'blackPlastic');
    return p;
  }, () => [M([hb.x, 64, hb.z] as V3)]);
  def('heater-socket', () => new Part().add(yToX(cyl(11, 18, 14)), 'castAlu').add(boxMM([-6, 18, -6], [6, 28, 6]), 'castAlu'), () => [M([236, hb.y, 340] as V3)]);
  def('heater-hose-link', () => new Part().add(corrugatedHose(link, 9, 27), 'rubber'), () => [new THREE.Matrix4()]);
  def('heater-hose-right', () => new Part().add(corrugatedHose(rightH, hoseR, heaterBend), 'rubber'), () => [new THREE.Matrix4()]);
  def('heater-hose-left', () => new Part().add(corrugatedHose(leftH, hoseR, heaterBend), 'rubber'), () => [new THREE.Matrix4()]);
  def('heater-hose-supports', () => wormBand(15), () => [
    M(at(rightH[0], rightH[1], 0.62), along(rightH[0], rightH[1])),
    M(at(leftH[1], leftH[2], 0.22), along(leftH[1], leftH[2])),
  ]);
  def('heater-clamp-sp', () => wormBand(9), () => [M(at(link[0], link[1], 0.72), along(link[0], link[1]))]);
  def('heater-clamp-band', () => wormBand(9), () => [
    M(at(link[0], link[1], 0.35), along(link[0], link[1])),
    M(at(link[1], link[2], 0.28), along(link[1], link[2])),
  ]);
  def('heater-clamps', () => wormBand(15), () => {
    const band = (h: V3[], i: number, t: number) => M(at(h[i], h[i + 1], t), along(h[i], h[i + 1]));
    return [
      band(rightH, rightH.length - 2, 0.45), band(leftH, leftH.length - 2, 0.45),
      band(rightH, 0, 0.3), band(leftH, 0, 0.3),
      band(rightH, 1, 0.55), band(leftH, 1, 0.55),
    ];
  });
  def('heater-blower-hardware', () => {
    const p = new Part();
    // Screws through the blower lug and the support. Nuts on the socket tab, clear of the hose.
    p.add(yToX(cyl(1.8, 14, 8)), 'zincPlate', [hb.x - 40, hb.y - 4, hb.z - 4]);
    p.add(yToX(cyl(1.8, 14, 8)), 'zincPlate', [hb.x - 40, hb.y + 2, hb.z + 4]);
    p.add(hexNut(10, 5), 'zincPlate', [236, hb.y + 23, 340]);
    p.add(hexNut(10, 5), 'zincPlate', [234, hb.y + 23, 338]);
    return p;
  }, () => [new THREE.Matrix4()]);
  if (VARIANT.frontExhaust === 'catalytic-converter') {
    const c = (x: number, y: number, z: number): V3 => [x, y - 250, z - 330];
    def('cat-cover', () => {
      const p = new Part();
      // Pressed heat shield: a shallow arch, not a flat plate.
      const s = new THREE.Shape();
      s.moveTo(-46, 0); s.quadraticCurveTo(0, 12, 46, 0); s.lineTo(46, -2);
      s.quadraticCurveTo(0, 10, -46, -2); s.closePath();
      p.add(extrude(s, 36).translate(0, 0, -18), 'aluminized');
      return p;
    }, () => [M(c(0, 58, 24))]);
    def('cat-cap', () => new Part().add(cyl(8, 6, 12), 'zincPlate'), () => [M(c(96, 20, 0))]);
    def('cat-plug', () => new Part().add(hexNut(10, 5), 'zincPlate').add(torus(5, 0.8, 6, 12).rotateX(Math.PI / 2), 'copper'), () => [M(c(96, 26, 0))]);
    def('cat-bracket', () => {
      const p = new Part();
      p.add(new THREE.BoxGeometry(48, 3, 12, 2, 2, 2), 'zincPlate');
      p.add(new THREE.BoxGeometry(14, 3, 12, 2, 2, 2), 'zincPlate', [-28, -6, 0], [0, 0, 0.7]);
      return p;
    }, () => [M(c(40, -36, 20))]);
    def('cat-cover-fasteners', () => {
      const p = new Part();
      let n = 0;
      for (const x of [-60, -20, 20, 60]) for (const z of [-18, 18]) {
        p.add(hexNut(10, 4), 'zincPlate', [x, -2, z]);
        p.add(yToZ(cyl(3, 8, 6)).rotateZ(Math.PI / 2), 'zincPlate', [x, 4, z]);
        p.add(torus(5, 0.5, 4, 10), 'zincPlate', [x, 1, z]);
        n++;
      }
      void n;
      return p;
    }, () => [M(c(0, 60, 24))]);
  }
  void box;
}
