/**
 * Ancillary assets: cooling (105), induction/CIS (106/107), ignition (901), exhaust & heat exchangers (202),
 * lubrication (104), clutch/flywheel (102/301). Shapes traced from the Porsche parts-catalogue illustrations.
 */
import * as THREE from 'three';
import {
  Part, V3, DEG, lathe, boxMM, cyl, cylBetween, yToZ, yToX, roundRect, circlePath, circleShape, ringShape,
  polyShape, gearShape, extrude, extrudeC, hexNut, tube, torus,
} from './util';
import { CYL_Z, CASE_Z, INT_SHAFT_Y, CYL_TOP_X, INTAKE_PORT, INJ } from '../data/layout';
export { INTAKE_PORT, INJ };

export const FAN = { y: 255, zHousing0: 205, zHousing1: 290, zFan: 262, zBelt: 303, rCrankPulley: 78, rFanPulley: 56 };
export const PLENUM = { y0: 205, y1: 262, x: 110, z0: -165, z1: 172 };
export const EXH_PORT = { x: CYL_TOP_X + 34, y: -68 };

// ---------------------------------------------------------------- 105-00 cooling
export function fanHousing() {
  const p = new Part();
  const prof: [number, number][] = [[128, FAN.zHousing0], [134, FAN.zHousing0], [134, 270], [140, 282], [152, FAN.zHousing1], [146, FAN.zHousing1], [134, 284], [128, 272]];
  // lathe axis Y -> map (r, z)
  p.add(yToZ(lathe(prof, 72)), 'magnesium', [0, FAN.y, 0]);
  // outer stiffening ribs & mounting ears
  for (let a = 0; a < 360; a += 30) {
    const r = 136, x = r * Math.cos(a * DEG), y = r * Math.sin(a * DEG);
    const rib = boxMM([-3, -2, FAN.zHousing0], [3, 6, 268]); rib.rotateZ((a - 90) * DEG);
    p.add(rib, 'magnesium', [x, FAN.y + y, 0]);
  }
  // lower feet onto the air guide / case
  for (const x of [-95, 95]) p.add(boxMM([x - 14, 118, FAN.zHousing0], [x + 14, 170, 240]), 'magnesium');
  // alternator strap (#2) + clamp bolt (#2A)
  p.add(yToZ(lathe([[62, -8], [66, -8], [66, 8], [62, 8]], 48)), 'steel', [0, FAN.y, 214]);
  p.add(boxMM([-8, FAN.y + 64, 206], [8, FAN.y + 78, 222]), 'steel');
  p.add(yToX(cyl(4, 30, 8)), 'zincPlate', [0, FAN.y + 72, 214]);
  // strap arms tying alternator to housing
  for (const a of [30, 150, 270]) {
    const c = Math.cos(a * DEG), s = Math.sin(a * DEG);
    p.add(cylBetween([66 * c, FAN.y + 66 * s, 214], [128 * c, FAN.y + 128 * s, 214], 4, 8), 'magnesium');
  }
  return p.g;
}
export function fanImpeller() {
  const p = new Part();
  const z = FAN.zFan;
  p.add(yToZ(lathe([[18, -4], [58, -4], [92, -1], [92, 1], [58, 3], [18, 3]], 64)), 'magnesium', [0, FAN.y, z]);
  p.add(yToZ(lathe([[10, -8], [22, -8], [22, 10], [10, 10]], 24)), 'steel', [0, FAN.y, z]);
  // 11 blades (930 106 012) -- swept, twisted plates
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2;
    const sh = polyShape([[54, -2], [122, 6], [122, 9], [54, 3]]);
    const g = extrudeC(sh, 22);
    g.rotateX(0); g.rotateY(0);
    const blade = new THREE.Mesh(g);
    const grp = new THREE.Group(); grp.add(blade);
    blade.rotation.x = 32 * DEG; // pitch
    grp.rotation.z = a;
    grp.position.set(0, FAN.y, z + 4);
    grp.updateMatrixWorld(true);
    const gg = g.clone().applyMatrix4(blade.matrixWorld);
    p.add(gg, 'magnesium');
  }
  return p.g;
}
export function alternator() {
  const p = new Part();
  const zc = 205, L = 52;
  p.add(yToZ(lathe([[20, -L], [56, -L], [60, -L + 6], [60, L - 6], [56, L], [22, L]], 64)), 'castAlu', [0, FAN.y, zc]);
  // cooling slots / ribs
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const b = boxMM([-1.4, 58, zc - L + 10], [1.4, 62, zc + L - 10]); b.rotateZ(a);
    p.add(b, 'castAlu', [0, FAN.y, 0]);
  }
  p.add(yToZ(cyl(12, 60, 16)), 'steel', [0, FAN.y, zc + L + 25]);
  // rear terminal cover / regulator
  p.add(boxMM([-20, FAN.y - 70, zc - 40], [20, FAN.y - 56, zc - 6]), 'blackPlastic');
  for (const a of [45, 135, 225, 315]) p.add(yToZ(cyl(4.5, 8, 8)), 'zincPlate', [48 * Math.cos(a * DEG), FAN.y + 48 * Math.sin(a * DEG), zc - L - 3]);
  return p.g;
}
function vPulley(r: number, grooves: number, width: number) {
  const prof: [number, number][] = [[6, 0], [r, 0]];
  for (let g = 0; g < grooves; g++) {
    const y0 = g * width;
    prof.push([r, y0 + 1.5], [r - 10, y0 + width / 2 - 1], [r - 10, y0 + width / 2 + 1], [r, y0 + width - 1.5]);
  }
  prof.push([r, grooves * width], [r - 14, grooves * width], [r - 22, grooves * width - 6], [26, grooves * width - 6], [20, grooves * width], [6, grooves * width]);
  return lathe(prof, 64);
}
export function fanPulley() {
  const p = new Part();
  const g = yToZ(vPulley(FAN.rFanPulley, 1, 16));
  p.add(g, 'steel', [0, FAN.y, FAN.zBelt - 8]);
  for (let i = 0; i < 3; i++) { const a = i * 2.09; p.add(yToZ(cyl(3, 6, 6)), 'zincPlate', [22 * Math.cos(a), FAN.y + 22 * Math.sin(a), FAN.zBelt + 10]); }
  p.add(yToZ(hexNut(22, 10)), 'darkSteel', [0, FAN.y, FAN.zBelt + 14]);
  return p.g;
}
export function crankPulley() {
  const p = new Part();
  p.add(yToZ(vPulley(FAN.rCrankPulley, 2, 14)), 'steel', [0, 0, 290]);
  p.add(yToZ(hexNut(19, 10)), 'darkSteel', [0, 0, 323]);
  // timing marks
  p.add(boxMM([-1, FAN.rCrankPulley - 6, 316], [1, FAN.rCrankPulley, 318.5]), 'ceramic');
  return p.g;
}
export function fanBelt() {
  const p = new Part();
  const c1 = new THREE.Vector2(0, 0), r1 = FAN.rCrankPulley - 5;
  const c2 = new THREE.Vector2(0, FAN.y), r2 = FAN.rFanPulley - 5;
  const d = c2.clone().sub(c1), L = d.length(), base = Math.atan2(d.y, d.x);
  const beta = Math.acos((r1 - r2) / L);
  const pts: V3[] = [];
  const arc = (c: THREE.Vector2, r: number, a0: number, a1: number, n: number) => { for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; pts.push([c.x + r * Math.cos(a), c.y + r * Math.sin(a), FAN.zBelt]); } };
  arc(c2, r2, base - beta, base + beta, 30);
  arc(c1, r1, base + beta, base + 2 * Math.PI - beta, 40);
  const curve = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q)), true);
  const sh = polyShape([[-5, -4.5], [5, -4.5], [3, 4.5], [-3, 4.5]]);
  const g = new THREE.ExtrudeGeometry(sh, { steps: 200, extrudePath: curve, bevelEnabled: false });
  p.add(g, 'rubber');
  return p.g;
}

// ---------------------------------------------------------------- 105-05 air guide (upper shroud)
export function upperAirGuide() {
  const p = new Part();
  const zA = -172, zB = 192, len = zB - zA, t = 3.5;
  // central roof (horizontal, y=150) with hole for distributor
  const roof = roundRect(190, len, 6);
  roof.holes.push(circlePath(40, -75, -(150)) as THREE.Path);
  const rg = extrude(roof, t); rg.rotateX(Math.PI / 2); // shape y -> world -z ; extrude +z -> world -y... rotate: (x,y,z)->(x,-z,y)
  rg.translate(0, 150 + t, (zA + zB) / 2);
  p.add(rg, 'satinBlack');
  // sloped wings with runner holes
  const ax = 95, ay = 150, bx = 290, by = 78;
  const slopeLen = Math.hypot(bx - ax, by - ay), ang = Math.atan2(by - ay, bx - ax);
  for (const s of [1, -1] as const) {
    const zs = s > 0 ? [CYL_Z[1], CYL_Z[2], CYL_Z[3]] : [CYL_Z[4], CYL_Z[5], CYL_Z[6]];
    const wing = new THREE.Shape();
    wing.moveTo(0, zA); wing.lineTo(slopeLen, zA); wing.lineTo(slopeLen, zB - 20); wing.lineTo(0, zB); wing.closePath();
    const sAt = (INTAKE_PORT.x - ax) / Math.cos(ang);
    for (const zc of zs) {
      const h = new THREE.Path(); h.absellipse(sAt, zc, 30, 27, 0, Math.PI * 2, true, 0); wing.holes.push(h);
    }
    const wg = extrude(wing, t); // x along slope, y = engine z, z = thickness
    const m = new THREE.Matrix4();
    const u = new THREE.Vector3(Math.cos(ang) * s, Math.sin(ang), 0);
    const e = new THREE.Vector3(0, 0, 1);
    const n = new THREE.Vector3().crossVectors(u, e);
    m.makeBasis(u, e, n); m.setPosition(ax * s, ay, 0);
    wg.applyMatrix4(m);
    p.add(wg, 'satinBlack');
    // outer skirt down over the cam housing
    p.add(boxMM([s > 0 ? bx - 2 : -bx - 2, 44, zA], [s > 0 ? bx + 2 : -bx + 2, by + 2, zB - 20]), 'satinBlack');
    // moulded stiffening ribs
    for (const zr of [zA + 40, (zA + zB) / 2, zB - 60]) {
      const r = cylBetween([(ax + 10) * s, ay + 4, zr], [(bx - 10) * s, by + 4 + 2, zr], 2.2, 6);
      p.add(r, 'satinBlack');
    }
  }
  // front end plate (flywheel side) closes the tunnel
  const fp = polyShape([[-290, 44], [290, 44], [290, 80], [95, 152], [-95, 152], [-290, 80]]);
  fp.holes.push(circlePath(0.01, 0, 0) as THREE.Path);
  fp.holes.pop();
  const hole = new THREE.Path(); hole.moveTo(-105, 60); hole.lineTo(105, 60); hole.lineTo(105, 120); hole.lineTo(-105, 120); hole.closePath(); fp.holes.push(hole);
  p.add(extrude(fp, t), 'satinBlack', [0, 0, zA - t]);
  // rear collar cradling the fan housing (partial ring)
  const collar = yToZ(new THREE.CylinderGeometry(141, 141, 26, 48, 1, true, Math.PI * 0.62, Math.PI * 0.76));
  p.add(collar, 'satinBlack', [0, FAN.y, zB - 6]);
  // hot air outlet socket (#4) at the flywheel end, left
  p.add(yToZ(lathe([[30, 0], [34, 0], [34, 40], [30, 40]], 32)), 'satinBlack', [-160, 118, zA - 40]);
  return p.g;
}

// ---------------------------------------------------------------- 104-00 / 101 lubrication bits
export function oilCooler() {
  const p = new Part();
  const x0 = -205, x1 = -95, y0 = 74, y1 = 124, z0 = 30, z1 = 148;
  p.add(boxMM([x0, y0, z0], [x0 + 6, y1, z1]), 'castAlu');
  p.add(boxMM([x1 - 6, y0, z0], [x1, y1, z1]), 'castAlu');
  for (let z = z0 + 3; z < z1 - 2; z += 3.2) p.add(boxMM([x0 + 6, y0 + 3, z], [x1 - 6, y1 - 3, z + 0.9]), 'machinedAlu');
  for (const y of [y0 + 10, (y0 + y1) / 2, y1 - 10]) p.add(cylBetween([x0 + 6, y, (z0 + z1) / 2], [x1 - 6, y, (z0 + z1) / 2], 4, 10), 'castAlu');
  p.add(cylBetween([x1, 98, 60], [-60, 104, 60], 7, 12), 'castAlu');
  p.add(cylBetween([x1, 98, 120], [-60, 104, 120], 7, 12), 'castAlu');
  return p.g;
}
export function oilThermostat() {
  const p = new Part();
  p.add(lathe([[0.1, 0], [22, 0], [22, 4], [16, 6], [16, 34], [0.1, 34]], 32), 'castAlu', [58, -168, 118]);
  p.add(cyl(28, 5, 32), 'castAlu', [58, -136, 118]);
  for (const a of [0, 2.1, 4.2]) p.add(hexNut(10, 6), 'zincPlate', [58 + 22 * Math.cos(a), -140, 118 + 22 * Math.sin(a)]);
  return p.g;
}
export function breatherLid() {
  const p = new Part();
  const sh = roundRect(46, 70, 16);
  const g = extrude(sh, 6, 2); g.rotateX(-Math.PI / 2);
  p.add(g, 'castAlu', [-45, 120, 152]);
  p.add(cylBetween([-45, 128, 152], [-45, 150, 152], 11, 20), 'castAlu');
  p.add(cylBetween([-45, 150, 152], [-45, 150, 190], 9, 16), 'castAlu');
  for (const dz of [-24, 24]) p.add(hexNut(11, 6), 'zincPlate', [-45, 130, 152 + dz]);
  return p.g;
}
export function sumpPlate() {
  const p = new Part();
  const y = -134;
  const plate = lathe([[0.1, 0], [80, 0], [80, 4], [70, 6], [60, 12], [0.1, 12]], 64);
  plate.rotateX(Math.PI);
  p.add(plate, 'castAlu', [0, y, -10]);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; p.add(hexNut(10, 6), 'zincPlate', [74 * Math.cos(a), y - 6, -10 + 74 * Math.sin(a)]); }
  p.add(hexNut(19, 8), 'darkSteel', [0, y - 16, -10]);
  // strainer (#38) sits inside, sandwiched by gaskets (#39)
  p.add(lathe([[0.1, 0], [72, 0], [72, 2], [0.1, 2]], 64), 'gasket', [0, y + 1, -10]);
  const scr = lathe([[0.1, 0], [68, 0], [68, 18], [60, 22], [0.1, 22]], 64);
  p.add(scr, 'zincPlate', [0, y + 3, -10]);
  for (let r = 12; r < 68; r += 8) p.add(torus(r, 0.8, 4, 48).rotateX(Math.PI / 2), 'darkSteel', [0, y + 25.5, -10]);
  return p.g;
}
export function oilPump() {
  const p = new Part();
  const zc = 254, y = -92;
  const body = extrudeC(roundRect(92, 62, 14), 16, 1.5);
  p.add(body, 'castAlu', [0, y, zc]);
  // pressure + scavenge gear pairs shown through the cover split
  for (const [x, t] of [[-20, 10], [20, 10]] as const) p.add(extrudeC(gearShape(t, 13, 16, 3), 8), 'steel', [x, y, zc + 12]);
  p.add(extrudeC(roundRect(92, 62, 14), 4), 'castAlu', [0, y, zc + 18]);
  for (const [x, yy] of [[-38, 22], [38, 22], [-38, -22], [38, -22]]) p.add(yToZ(hexNut(10, 5)), 'zincPlate', [x, y + yy, zc + 22]);
  p.add(yToZ(cyl(9, 26, 16)), 'steel', [0, INT_SHAFT_Y, zc - 18]); // connecting shaft (#6)
  return p.g;
}

// ---------------------------------------------------------------- 106-00 / 107 induction & CIS
export function plenum() {
  const p = new Part();
  const { y0, y1, x, z0, z1 } = PLENUM;
  const sec = roundRect(2 * x, y1 - y0, 20, 0, (y0 + y1) / 2);
  const g = extrude(sec, z1 - z0, 3); g.translate(0, 0, z0);
  p.add(g, 'castAlu');
  // outlet stubs (with rubber sleeves #10)
  for (const [c, zc] of Object.entries(CYL_Z)) {
    const s = +c <= 3 ? 1 : -1;
    p.add(cylBetween([x * s - 4 * s, 232, zc], [(x + 16) * s, 232, zc], 21, 24), 'castAlu');
    p.add(cylBetween([(x + 14) * s, 232, zc], [(x + 34) * s, 232, zc], 23.5, 24), 'rubber');
    for (const dx of [18, 31]) p.add(yToX(torus(24, 1.2, 4, 24)), 'steel', [(x + dx) * s, 232, zc]);
  }
  // air-cleaner lower housing (#9)
  const lh = roundRect(300, 250, 18, 0, 20);
  const lg = extrude(lh, 40, 2); lg.rotateX(-Math.PI / 2); lg.translate(0, y1 - 2, 0);
  p.add(lg, 'blackPlastic');
  // throttle body / idle air housing (#27) toward rear
  p.add(yToZ(cyl(34, 40, 32)), 'castAlu', [0, 234, z1 + 18]);
  p.add(yToZ(torus(34, 2, 6, 32)), 'steel', [0, 234, z1 + 36]);
  // struts (#18/#19)
  for (const s of [1, -1]) p.add(cylBetween([s * 100, 212, -140], [s * 88, 150, -150], 4, 8), 'zincPlate');
  return p.g;
}
export function airFilter() {
  const p = new Part();
  const y = 300;
  p.add(boxMM([-140, y, -95], [140, y + 3, 135]), 'blackPlastic');
  for (let x = -134; x <= 134; x += 5) p.add(boxMM([x - 1.3, y + 3, -90], [x + 1.3, y + 22, 130]), 'filterPaper');
  p.add(boxMM([-140, y + 22, -95], [140, y + 24, 135]), 'rubber');
  return p.g;
}
export function airCleanerLid() {
  const p = new Part();
  const y = 324;
  const lid = roundRect(300, 250, 22, 0, 20);
  const g = extrude(lid, 22, 6); g.rotateX(-Math.PI / 2); g.translate(0, y, 0);
  p.add(g, 'blackPlastic');
  // raised dome + snout (#14) toward the mixture control unit
  p.add(boxMM([-100, y + 22, -60], [100, y + 34, 110]), 'blackPlastic');
  p.add(tube([[-120, y + 16, 60], [-160, y + 16, 60], [-190, y - 4, 60]], 38, 24, 24), 'blackPlastic');
  // restraining straps (#15)
  for (const x of [-150, 150]) p.add(boxMM([x - 4, y - 22, -20], [x + 4, y + 12, 0]), 'steel');
  return p.g;
}
/** Intake pipe for one cylinder (106-00 #1-#6), local coords: port at origin z=0, right-bank orientation. */
export function intakeRunner() {
  const p = new Part();
  const P0: V3 = [0, 0, 0];
  const pts: V3[] = [P0, [0, 40, 0], [-12, 90, 0], [-40, 132, 0], [-80, 154, 0], [-(INTAKE_PORT.x - PLENUM.x - 34), 160, 0]];
  p.add(tube(pts, 20, 24, 48), 'castAlu');
  // head flange
  const fl = roundRect(46, 40, 12); fl.holes.push(circlePath(17.5) as THREE.Path);
  const fg = extrudeC(fl, 8); fg.rotateX(Math.PI / 2); p.add(fg, 'castAlu', [0, 4, 0]);
  // injector boss (#21 injector sits here)
  p.add(cylBetween([-6, 44, 0], [22, 62, 0], 9, 16), 'castAlu');
  return p.g;
}
export function injector() {
  const p = new Part();
  p.add(lathe([[0.1, 0], [3, 0], [5, 6], [7, 6], [7, 30], [6, 34], [6, 40], [0.1, 40]], 20), 'steel');
  p.add(hexNut(14, 7), 'brass', [0, 36, 0]);
  return p.g;
}
export function mixtureControlUnit() {
  const p = new Part();
  const c: V3 = [-200, 250, 60];
  // air flow meter funnel housing (#2) with venturi and sensor plate (#9)
  p.add(lathe([[40, -40], [64, -40], [70, -10], [70, 18], [58, 30], [40, 30]], 48), 'castAlu', c);
  p.add(cyl(38, 2, 32), 'steel', [c[0], c[1] + 6, c[2]]);
  // lever pivot boss (#8)
  p.add(yToX(cyl(8, 150, 12)), 'castAlu', [c[0], c[1] + 10, c[2]]);
  // fuel distributor (#1) on top of the meter
  const fd: V3 = [c[0] + 30, c[1] + 50, c[2]];
  p.add(cyl(30, 34, 36), 'zincPlate', fd);
  p.add(cyl(26, 10, 36), 'zincPlate', [fd[0], fd[1] + 20, fd[2]]);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    p.add(cylBetween([fd[0] + 20 * Math.cos(a), fd[1] + 25, fd[2] + 20 * Math.sin(a)], [fd[0] + 28 * Math.cos(a), fd[1] + 28, fd[2] + 28 * Math.sin(a)], 3.5, 8), 'brass');
    p.add(hexNut(11, 6), 'brass', [fd[0] + 28 * Math.cos(a), fd[1] + 28, fd[2] + 28 * Math.sin(a)]);
  }
  // control pressure regulator / fuel inlet banjos
  for (const a of [0.5, 3.6]) p.add(yToX(cyl(6, 20, 10)), 'brass', [fd[0] + 34 * Math.cos(a), fd[1] - 5, fd[2] + 34 * Math.sin(a)]);
  // cold-start valve (#30) & aux air regulator (#36)
  p.add(yToZ(cyl(12, 40, 16)), 'darkSteel', [-120, 250, 140]);
  // boot to the air cleaner
  p.add(tube([[c[0], c[1] - 40, c[2]], [c[0] + 10, c[1] - 55, c[2]], [-110, 232, c[2]]], 34, 20, 20), 'rubber');
  return p.g;
}
export function fuelLines() {
  const p = new Part();
  const fd: V3 = [-170, 328, 60];
  let i = 0;
  for (const [c, zc] of Object.entries(CYL_Z)) {
    const s = +c <= 3 ? 1 : -1;
    const a = (i++ / 6) * Math.PI * 2;
    const start: V3 = [fd[0] + 28 * Math.cos(a), fd[1], fd[2] + 28 * Math.sin(a)];
    const end: V3 = [s * (INTAKE_PORT.x + INJ.dx + 40 * INJ.ux), INTAKE_PORT.y + INJ.dy + 40 * INJ.uy, zc];
    const mid: V3 = [s * 140 + (s < 0 ? -20 : 0), 300, zc * 0.8 + 10];
    p.add(tube([start, [start[0], start[1] + 18, start[2]], mid, [end[0], end[1] + 30, end[2]], end], 2.4, 6, 48), 'steel');
  }
  // warm-up regulator (#54) on the crankcase
  p.add(boxMM([-60, 122, -190], [-20, 150, -140]), 'zincPlate');
  p.add(cyl(14, 26, 20), 'zincPlate', [-40, 160, -165]);
  return p.g;
}

// ---------------------------------------------------------------- 901-00 ignition
export function distributor() {
  const p = new Part();
  const x = -75, z = 150;
  p.add(lathe([[14, 104], [20, 104], [24, 120], [32, 150], [32, 168], [0.1, 168]], 32), 'castAlu', [x, 0, z]);
  // cap (#8) with 7 towers
  p.add(lathe([[0.1, 168], [36, 168], [37, 180], [30, 196], [0.1, 198]], 36), 'blackPlastic', [x, 0, z]);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; p.add(cyl(6, 14, 12), 'blackPlastic', [x + 22 * Math.cos(a), 196, z + 22 * Math.sin(a)]); }
  p.add(cyl(6, 16, 12), 'blackPlastic', [x, 204, z]);
  // clamps
  for (const a of [0.7, 3.8]) p.add(boxMM([-2, 160, -2], [2, 178, 2]), 'steel', [x + 36 * Math.cos(a), 0, z + 36 * Math.sin(a)]);
  // vacuum unit
  p.add(yToX(cyl(20, 26, 24)), 'zincPlate', [x - 44, 150, z]);
  return p.g;
}
export function sparkPlug() {
  const p = new Part();
  // local: tip at origin, terminal along -Y (hangs below the head)
  p.add(lathe([[0.1, 0], [7, 0], [7, -18]], 16), 'steel');
  p.add(hexNut(20.8, 10).translate(0, -23, 0), 'steel');
  p.add(lathe([[0.1, -28], [9, -28], [6, -36], [5.5, -58], [3, -60], [3, -66], [0.1, -66]], 20), 'ceramic');
  // plug connector (#21)
  p.add(lathe([[0.1, -52], [11, -52], [11, -80], [6, -92], [0.1, -92]], 16), 'rubber');
  return p.g;
}

// ---------------------------------------------------------------- 202-00 exhaust / heating
export function heatExchanger(s: 1 | -1) {
  const p = new Part();
  const zs = s > 0 ? [CYL_Z[1], CYL_Z[2], CYL_Z[3]] : [CYL_Z[4], CYL_Z[5], CYL_Z[6]];
  const X = (x: number) => x * s;
  const shellY = -175, shellX = 228;
  // outer heater shell: flattened tube along Z
  const shell = new THREE.Shape(); shell.absellipse(0, 0, 44, 34, 0, Math.PI * 2, false, 0);
  const sg = extrude(shell, 430, 2); sg.translate(X(shellX), shellY, -205);
  p.add(sg, 'heatSteel');
  // stamped ribs / seams
  for (let z = -195; z < 222; z += 22) {
    const rib = new THREE.Shape(); rib.absellipse(0, 0, 47, 37, 0, Math.PI * 2, false, 0);
    const h = new THREE.Path(); h.absellipse(0, 0, 44, 34, 0, Math.PI * 2, true, 0); rib.holes.push(h);
    p.add(extrudeC(rib, 3, 0, 24), 'heatSteel', [X(shellX), shellY, z]);
  }
  // primary pipes from each exhaust port (#31 gaskets at flange)
  for (const zc of zs) {
    const port: V3 = [X(EXH_PORT.x), EXH_PORT.y, zc];
    const pts: V3[] = [port, [X(EXH_PORT.x), -100, zc], [X(EXH_PORT.x - 4), -130, zc + 6], [X(shellX), shellY + 20, zc + 16]];
    p.add(tube(pts, 18, 16, 24), 'heatSteel');
    const fl = roundRect(44, 34, 8); fl.holes.push(circlePath(16) as THREE.Path);
    const fg = extrudeC(fl, 6); fg.rotateX(Math.PI / 2);
    p.add(fg, 'heatSteel', [port[0], port[1] - 3, port[2]]);
    for (const dz of [-16, 16]) p.add(hexNut(12, 7), 'brass', [port[0], port[1] - 9, port[2] + dz]);
  }
  // outlet to silencer
  p.add(tube([[X(shellX - 10), shellY - 5, 222], [X(shellX - 20), shellY - 8, 280], [X(150), -185, 318], [X(150), -185, 334]], 22, 16, 30), 'heatSteel');
  // heater air outlet (to cabin) at the flywheel end, with adapter (#27)
  p.add(tube([[X(shellX), shellY + 10, -205], [X(shellX), shellY + 20, -240], [X(shellX - 20), shellY + 40, -262]], 26, 20, 16), 'heatSteel');
  // fresh-air inlet from the blower / engine at the rear top
  p.add(tube([[X(shellX), shellY + 30, 200], [X(shellX - 10), shellY + 70, 212]], 16, 12, 10), 'heatSteel');
  return p.g;
}
export function muffler() {
  const p = new Part();
  const sec = roundRect(118, 112, 44);
  const g = extrudeC(sec, 540, 3);
  g.rotateY(Math.PI / 2); // extrude along x
  p.add(g, 'heatSteel', [0, -178, 390]);
  // seams
  for (const x of [-268, 268]) {
    const seam = roundRect(124, 118, 47); seam.holes.push(roundRect(118, 112, 44) as unknown as THREE.Path);
    const sg2 = extrudeC(seam, 4); sg2.rotateY(Math.PI / 2); p.add(sg2, 'heatSteel', [x, -178, 390]);
  }
  // inlets (#2 gaskets, #5 clamps)
  for (const s of [1, -1]) {
    p.add(cylBetween([150 * s, -185, 325], [150 * s, -185, 340], 25, 20), 'heatSteel');
    p.add(yToZ(torus(26, 3, 6, 24)), 'steel', [150 * s, -185, 330]);
  }
  // tailpipe (chrome), exiting rearward on the left
  p.add(tube([[-200, -200, 440], [-205, -205, 470], [-210, -212, 500]], 26, 24, 12), 'chrome');
  p.add(yToZ(torus(26, 2.5, 6, 32)), 'chrome', [-210, -212, 500]);
  // bracket (#34)
  p.add(boxMM([-40, -122, 360], [40, -110, 420]), 'darkSteel');
  return p.g;
}

// ---------------------------------------------------------------- 102-00 / 301 flywheel & clutch
export const FLY_Z = CASE_Z.flywheel - 8; // crank flange face
export function flywheel() {
  const p = new Part();
  const z = FLY_Z;
  const prof: [number, number][] = [[20, 0], [55, 0], [60, -4], [110, -4], [128, -2], [134, 0], [134, -28], [128, -30], [60, -30], [55, -18], [20, -18]];
  p.add(yToZ(lathe(prof, 96)), 'steel', [0, 0, z]);
  // starter ring gear (#5 in 301-00): 130 teeth
  p.add(extrude(gearShape(130, 136, 142, 133), 12), 'forgedSteel', [0, 0, z - 14]);
  // bolts x9 (#6) and timing mark
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; p.add(yToZ(hexNut(13, 6)), 'darkSteel', [36 * Math.cos(a), 36 * Math.sin(a), z - 21]); }
  // pressure-plate dowels / bolts on rim
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2 + 0.2; p.add(yToZ(cyl(4, 8, 8)), 'zincPlate', [124 * Math.cos(a), 124 * Math.sin(a), z - 33]); }
  return p.g;
}
export function clutchDisc() {
  const p = new Part();
  const z = FLY_Z - 34;
  const lining = ringShape(112.5, 77.5);
  for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; lining.holes.push(circlePath(3.5, 96 * Math.cos(a), 96 * Math.sin(a)) as THREE.Path); }
  p.add(extrudeC(lining, 3.4), 'friction', [0, 0, z + 2.2]);
  p.add(extrudeC(lining, 3.4), 'friction', [0, 0, z - 2.2]);
  p.add(extrudeC(ringShape(100, 40), 1), 'steel', [0, 0, z]);
  // damper springs + hub (splined)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const g = yToX(cyl(7, 26, 12)); g.rotateZ(a + Math.PI / 2);
    p.add(g, 'darkSteel', [58 * Math.cos(a), 58 * Math.sin(a), z]);
  }
  p.add(extrudeC(gearShape(20, 13, 16, 0), 22), 'steel', [0, 0, z]);
  p.add(yToZ(lathe([[16, -12], [36, -12], [40, -5], [40, 5], [36, 12], [16, 12]], 32)), 'darkSteel', [0, 0, z]);
  return p.g;
}
export function pressurePlate() {
  const p = new Part();
  const z = FLY_Z - 40;
  // cover (#1) -- stamped steel with ventilation windows
  const cover = lathe([[132, 0], [132, -4], [126, -6], [120, -28], [112, -34], [72, -36], [70, -34], [112, -30], [117, -26], [126, -4]], 72);
  p.add(yToZ(cover), 'zincPlate', [0, 0, z]);
  // diaphragm spring fingers
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const f = polyShape([[34, -5], [80, -8], [80, 8], [34, 5]]);
    const g = extrudeC(f, 2); g.rotateZ(a);
    p.add(g, 'steel', [0, 0, z - 32]);
  }
  p.add(yToZ(torus(78, 3, 6, 64)), 'steel', [0, 0, z - 32]);
  // pressure plate ring
  p.add(extrudeC(ringShape(112, 78), 10), 'castAlu', [0, 0, z - 10]);
  // mounting bolts (#3 lock rings x9)
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2 + 0.2; p.add(yToZ(hexNut(13, 6)), 'darkSteel', [124 * Math.cos(a), 124 * Math.sin(a), z - 8]); }
  return p.g;
}
