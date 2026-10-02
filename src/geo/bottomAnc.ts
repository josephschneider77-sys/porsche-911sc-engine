/**
 * Bottom-end ancillaries traced from Kat 502: air injection (108-00), heater blower (108-10),
 * EGR (202-05), cylinder baffles (105-10) and the 930/04 catalytic converter (202-00 #6).
 * Drawings decide shape and placement. Coordinates are millimetres in the engine frame.
 */
import * as THREE from 'three';
import { VARIANT } from '../data/variant';
import { CYL_Z } from '../data/layout';
import { FAN, AIR_CHECK_VALVE_OUTLET, CHECK_HEX_H, heaterStub, EGR_FEED_PORT } from './aux';
import { THROTTLE } from './induction';
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
 * Centreline with circular fillets. Radius is the minimum bend (about 2× the hose OD);
 * a short leg shrinks the fillet so the ends stay put.
 */
function filletPath(pts: V3[], radius: number): V3[] {
  const pushLine = (out: V3[], a: V3, b: V3) => {
    const d = vsub(b, a), L = vlen(d);
    const n = Math.max(1, Math.ceil(L / 8));
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
    const steps = Math.max(4, Math.ceil(om / 0.22));
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
/** Inboard ears the bracket and the strap land on. */
const PUMP_EAR_LO: V3 = [-198, -4, BODY_ZC];
const PUMP_EAR_HI: V3 = [-262, 124, BODY_ZC];
/** Bracket eyes: pump, pivot (#11), case. Rubbers sit in the pivot and the case eye. */
const BR_PUMP: V3 = [-186, -8, BODY_ZC];
const BR_PIVOT: V3 = [-148, -38, BODY_ZC];
const BR_CASE: V3 = [-140, 82, BODY_ZC];

export function airPump() {
  const p = new Part();
  // Round vane housing. Raised front face and hub nut face the pulley (−Z). Cover screws on the face.
  const face: [number, number][] = [
    [16, BODY_Z0 - 10], [28, BODY_Z0 - 10], [40, BODY_Z0 - 4], [P.r - 4, BODY_Z0],
    [P.r, BODY_Z0 + 6], [P.r - 2, BODY_Z1 - 8], [P.r - 10, BODY_Z1], [18, BODY_Z1], [16, BODY_Z0 - 10],
  ];
  p.add(yToZ(lathe(face, 40)), 'castAlu', [P.x, P.y, 0]);
  p.add(yToZ(hexNut(19, 8)), 'yellowZinc', [P.x, P.y, BODY_Z0 - 12]);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    p.add(yToZ(cyl(2.2, 6, 8)), 'darkSteel', [P.x + 32 * Math.cos(a), P.y + 32 * Math.sin(a), BODY_Z0 - 2]);
  }
  // Top and bottom cast ears. The lower one meets the bracket; the upper one takes the strap.
  p.add(cylBetween([P.x + 20, P.y - 36, BODY_ZC], PUMP_EAR_LO, 11, 14), 'castAlu');
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
  p.add(extrude(shape, 7).translate(0, 0, BODY_ZC - 3.5), 'castAlu');
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

/**
 * Handoff for the air-injection vacuum hose (108-00 #31).
 * Above the existing CIS vacuum harness. The manifold nipple `MANIFOLD_VAC` and the
 * vacuum tee already occupy the air between them, so this hose stops in the clear band
 * over that harness (fuel lines top out near y 321, the lower air-cleaner shell starts
 * near y 336). Intake & Fuel seats a branch from `MANIFOLD_VAC` / the vacuum tee on this point.
 */
export const AIR_INJ_VAC_PORT = {
  point: [-86, 328, -16] as V3,
  axis: [0, -1, 0] as V3,
  mates: 'plenum MANIFOLD_VAC / vacuum-fittings tee',
};
/**
 * Handoff for the long EGR vacuum hose (202-05 #16).
 * Aft of the throttle face (z 128) and clear of the plenum box (ends z 95).
 * Intake & Fuel owns the ported-vacuum nipple on the throttle body; this is where that nipple meets the hose.
 */
export const EGR_VAC_PORT = {
  point: [36, THROTTLE.y + 8, THROTTLE.zFace + 18] as V3,
  axis: [0, 0, 1] as V3,
  mates: 'plenum throttle, ported vacuum',
};
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
  // From the valve inlet nipple, across, then up the takeoff axis so the pipe is seated on the flange.
  const nose: V3 = [f.tip[0], f.tip[1] + 16, f.tip[2]];
  p.add(tube([[e.x - 34, e.y + 4, e.z], [e.x - 90, e.y - 8, e.z - 16], [f.tip[0], f.tip[1] - 28, f.tip[2]], f.tip, nose], 8, 12, 28), 'aluminized');
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
export function coolerAirGuide() {
  const p = new Part();
  // Over the flywheel half of the cooler (z 34–72), inboard of intake runner 4.
  // The distributor cut in the shroud starts at z 90, so these rivets still find the wing.
  // Flange up against the left wing (skin underside about y 142–146 here).
  // Stops at z 48 so it misses the ignition-lead holder at z 60.
  p.add(slab([-168, 140, 32], [-112, 146.5, 48]), 'shroudRed');
  p.add(slab([-168, 136, 32], [-164, 146.5, 48]), 'shroudRed');
  p.add(slab([-116, 136, 32], [-112, 146.5, 48]), 'shroudRed');
  p.add(slab([-168, 136, 32], [-112, 146.5, 36]), 'shroudRed');
  p.add(slab([-168, 136, 32], [-112, 139.4, 40]), 'shroudRed');
  p.add(slab([-168, 136, 42], [-112, 139.4, 48]), 'shroudRed');
  for (const [x, z] of [[-156, 36], [-124, 36], [-156, 44], [-124, 44]] as [number, number][]) {
    p.add(cyl(2.4, 16, 10), 'zincPlate', [x, 148, z]);
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

/** Catalytic converter 930 113 228 01. Local frame, placed by the small-part matrix at (0, -250, -330). */
export function catalyticConverterPart() {
  const p = new Part();
  const R = 28, L = 168;
  // Cylindrical can, about 3:1 here so it stays in the old pre-silencer pocket; conical ends.
  p.add(yToX(cyl(R, L, 36)), 'aluminized', [0, 0, 0]);
  p.add(yToX(cyl(R, 18, 28, 16)), 'aluminized', [L / 2 + 6, 0, 0]);
  p.add(yToX(cyl(16, 18, 28, R)), 'aluminized', [-(L / 2 + 6), 0, 0]);
  // Triangular 3-bolt flanges, a plate plus the bolt bosses.
  for (const s of [-1, 1]) {
    const plate = polyShape([[0, -24], [22, 14], [-22, 14]]);
    const g = extrude(plate, 5).rotateY(Math.PI / 2).translate(s * (L / 2 + 14), 0, 0);
    p.add(g, 'aluminized');
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
      p.add(cyl(7, 6, 12), 'aluminized', [s * (L / 2 + 16), 16 * Math.cos(a), 16 * Math.sin(a)]);
    }
    p.add(torus(16, 1.2, 6, 18).rotateY(Math.PI / 2), 'gasket', [s * (L / 2 + 20), 0, 0]);
  }
  // Centre seam band so the can reads as a welded shell, not a plain cylinder.
  p.add(yToX(lathe([[R - 0.4, -3], [R + 1.6, -3], [R + 1.6, 3], [R - 0.4, 3]], 28)), 'aluminized');
  // Test-port boss on the inlet cone (cap is its own part).
  p.add(cyl(6, 8, 12), 'aluminized', [L / 2 + 8, 14, 0]);
  // EGR return boss (202-05 #11) on the engine side of the can. Axis +Z; the pipe slides on from +Z.
  p.add(yToZ(cyl(8, 24, 14)), 'aluminized', [0, 8, 26]);
  p.add(yToZ(lathe([[8, 0], [14, 0], [14, 3], [8, 3]], 16)), 'aluminized', [0, 8, 14]);
  // Existing front-pipe / clamp features the 202-00 checklist already counts, kept short of the muffler.
  p.add(cylBetween([0, -R, 0], [0, -R - 16, -36], 16, 14), 'aluminized');
  p.add(lathe([[14, 0], [18, 0], [18, 8], [14, 8]], 16).rotateX(-Math.PI / 2), 'heatSteel', [0, -R - 16, -36]);
  for (const k of [-1, 1]) p.add(cylBetween([k * 70, 0, 0], [k * 110, 16, 24], 12, 12), 'aluminized');
  return p;
}

const nutAt = (p: Part, x: number, y: number, z: number, af = 13, h = 6) => {
  p.add(hexNut(af, h), 'zincPlate', [x, y + h / 2, z]);
};
/** Smooth hose. Fillets are at least 2× the OD, and the ends are not moved. */
const hose = (pts: V3[], r: number) => {
  const dense = filletPath(pts, 4 * r);
  return tube(dense, r, 8, Math.max(24, dense.length));
};
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
    const pumpHose: V3[] = [
      vadd(PUMP_OUT.tip, vmul(outDir, -14)),
      PUMP_OUT.tip,
      vadd(PUMP_OUT.tip, vmul(outDir, 26)),
      [-360, 180, 400],
      [-380, 30, 480],
      [-230, 26, 490],
      [-200, 26, 448],
      [-168, 26, 448],
    ];
    const valveHose: V3[] = [
      [-142, 56, 448], [-110, 120, 430], [-160, 160, 360],
      [inlet[0] + 40, inlet[1] + 50, inlet[2] + 10],
      [inlet[0], inlet[1] + 16, inlet[2]],
      inlet,
    ];
    const dumpHose: V3[] = [[-142, 26, 480], [-100, 8, 510], [-60, -16, 545]];
    const vac = AIR_INJ_VAC_PORT.point;
    // Outboard of the pump, up behind the fan, then in above the plenum lid. Last point is the handoff.
    const vacHose: V3[] = [
      [-116, 22, 432], [-80, 22, 432], [-80, 50, 490],
      [-340, 140, 490], [-340, 328, 490], [-340, 328, vac[2]],
      vac,
    ];
    def('air-hose-pump', () => new Part().add(hose(pumpHose, 6), 'rubber'), () => [new THREE.Matrix4()]);
    def('air-hose-valve', () => new Part().add(hose(valveHose, 6), 'rubber'), () => [new THREE.Matrix4()]);
    def('air-hose-dump', () => new Part().add(hose(dumpHose, 6), 'rubber'), () => [new THREE.Matrix4()]);
    def('air-hose-vacuum', () => new Part().add(hose(vacHose, 2.2), 'rubber'), () => [new THREE.Matrix4()]);
    def('air-clamp-pump', () => wormBand(6), () => [M(at(pumpHose[0], pumpHose[1], 0.45), along(pumpHose[0], pumpHose[1]))]);
    def('air-clamp-valve', () => wormBand(6), () => [M(at(valveHose[3], valveHose[4], 0.55), along(valveHose[3], valveHose[4]))]);
    def('air-clamp-dump', () => wormBand(6), () =>
      [M(at(dumpHose[0], dumpHose[1], 0.25), along(dumpHose[0], dumpHose[1])), M(at(dumpHose[1], dumpHose[2], 0.7), along(dumpHose[1], dumpHose[2]))]);
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
    def('egr-hose-short', () => new Part().add(hose([[e.x + 18, e.y + 40, e.z], [e.x + 18, e.y + 50, e.z]], 2.2), 'rubber'), () => [new THREE.Matrix4()]);
    const egrVac = EGR_VAC_PORT.point;
    // 202-05 #16. Down and out to the right, up behind the fan, in to the throttle handoff.
    def('egr-hose-long', () => new Part().add(hose([
      [e.x + 20, e.y + 50, e.z + 5],
      [e.x + 90, e.y + 10, e.z + 40],
      [240, -310, 80],
      [500, -310, 240],
      [500, -310, 520],
      [500, 340, 520],
      [200, 340, 520],
      [200, 340, 180],
      [egrVac[0] + 30, egrVac[1] + 24, egrVac[2] + 24],
      egrVac,
    ], 2.2), 'rubber'), () => [new THREE.Matrix4()]);
    def('egr-hose-pair', () => {
      const p = new Part();
      // One leg on the valve's second barb, offset in Z from the short hose. The other reaches the diverter nipple.
      p.add(hose([[e.x + 18, e.y + 58, e.z], [e.x + 18, e.y + 70, e.z - 16], [e.x + 18, e.y + 46, e.z - 16]], 2.2), 'rubber');
      p.add(hose([
        [e.x + 8, e.y + 50, e.z],
        [e.x + 8, e.y + 10, e.z - 30],
        [-80, -400, -40],
        [-460, -400, -40],
        [-460, -400, 560],
        [-460, 120, 560],
        [-40, 12, 560],
        [-40, 12, 450],
        [-80, 12, 432],
        [-116, 12, 432],
      ], 2.2), 'rubber');
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
  // 105-10 baffles. Square fins reach about ±57 mm in Z and ±61 mm in Y, so the plates sit under the barrels.
  const baffle = (w: number, h: number, t: number) => new Part().add(plate(w, h, t), 'zincPlate');
  const gapZ = (a: number, b: number) => (CYL_Z[a] + CYL_Z[b]) / 2;
  const gaps: [number, number][] = [[1, 2], [2, 3], [4, 5], [5, 6]];
  def('cyl-baffle-14', () => baffle(48, 10, 14), () => gaps.map(([a, b]) => {
    const s = a <= 3 ? 1 : -1;
    return M([s * 70, -186, gapZ(a, b)] as V3);
  }));
  def('cyl-baffle-15', () => baffle(40, 10, 12), () => [1, 4].map((c) => {
    const s = c <= 3 ? 1 : -1;
    return M([s * 70, -186, CYL_Z[c] + 70] as V3);
  }));
  def('cyl-baffle-16', () => baffle(40, 10, 12), () => [3, 6].map((c) => {
    const s = c <= 3 ? 1 : -1;
    return M([s * 70, -186, CYL_Z[c] - 70] as V3);
  }));
  def('cyl-baffle-spring', () => new Part().add(box(18, 1.2, 8), 'darkSteel'), () => [1, 2, 3, 4, 5, 6].map((c) => {
    const s = c <= 3 ? 1 : -1;
    return M([s * 100, -186, CYL_Z[c]] as V3);
  }));
  def('cyl-cover-plate', () => new Part().add(plate(40, 3, 220), 'zincPlate'), () => [1, -1].map((s) =>
    M([s * 55, -208, 0] as V3)));
  // Heater hoses (108-10 #10 and #13). Each ends on its exchanger spigot, coaxial, slid past the bead.
  const hb = HEATER_BLOWER;
  const link: V3[] = [[230, hb.y, 340], [280, hb.y, 352], [hb.x, hb.y, hb.z - 34]];
  const rightStub = heaterStub(1), leftStub = heaterStub(-1);
  const hoseR = 15;
  const seat = (stub: ReturnType<typeof heaterStub>, depth = 18): V3 => [stub.tip[0], stub.tip[1], stub.tip[2] - depth];
  const rightH: V3[] = [
    [hb.x + 18, 64, hb.z], [hb.x + 36, 64, hb.z],
    [440, 20, 430], [440, -310, 360],
    [rightStub.tip[0], -310, 320],
    [rightStub.tip[0], rightStub.tip[1], 300],
    rightStub.tip, seat(rightStub),
  ];
  const leftH: V3[] = [
    [hb.x - 18, 64, hb.z], [hb.x - 36, 40, hb.z - 20],
    [520, -20, 400], [520, -240, 220],
    [-520, -240, 160],
    [leftStub.tip[0], -240, 250],
    [leftStub.tip[0], leftStub.tip[1], 300],
    leftStub.tip, seat(leftStub),
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
  def('heater-hose-link', () => new Part().add(hose(link, 9), 'rubber'), () => [new THREE.Matrix4()]);
  def('heater-hose-right', () => new Part().add(hose(rightH, hoseR), 'rubber'), () => [new THREE.Matrix4()]);
  def('heater-hose-left', () => new Part().add(hose(leftH, hoseR), 'rubber'), () => [new THREE.Matrix4()]);
  def('heater-hose-supports', () => wormBand(15), () => [
    M(mid(rightH[2], rightH[3]), along(rightH[2], rightH[3])),
    M(mid(leftH[3], leftH[4]), along(leftH[3], leftH[4])),
  ]);
  def('heater-clamp-sp', () => wormBand(9), () => [M(at(link[0], link[1], 0.72), along(link[0], link[1]))]);
  def('heater-clamp-band', () => wormBand(9), () => [
    M(at(link[0], link[1], 0.35), along(link[0], link[1])),
    M(at(link[1], link[2], 0.28), along(link[1], link[2])),
  ]);
  def('heater-clamps', () => wormBand(15), () => {
    const last = (h: V3[]): [V3, V3] => [h[h.length - 2], h[h.length - 1]];
    const segs: [V3, V3][] = [last(rightH), last(leftH), [rightH[0], rightH[1]], [leftH[0], leftH[1]], [rightH[3], rightH[4]], [leftH[4], leftH[5]]];
    return segs.map(([a, b]) => M(mid(a, b), along(a, b)));
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
