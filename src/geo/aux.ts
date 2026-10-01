/**
 * Ancillary assets: cooling (105), induction/CIS (106/107), ignition (901), exhaust & heat exchangers (202),
 * lubrication (104), clutch/flywheel (102/301). Shapes traced from the Porsche parts-catalogue illustrations.
 */
import * as THREE from 'three';
import {
  Part, V3, DEG, lathe, boxMM, cyl, cylBetween, yToZ, yToX, roundRect, circlePath, circleShape, ringShape,
  polyShape, gearShape, extrude, extrudeC, hexNut, tube, torus, paramSurface, hull, circlePts,
} from './util';
import { CYL_Z, CASE_Z, INT_SHAFT_Y, CYL_TOP_X, INTAKE_PORT, INJ } from '../data/layout';
export { INTAKE_PORT, INJ };

export const FAN = { y: 255, zHousing0: 205, zHousing1: 290, zFan: 262, zBelt: 303, rCrankPulley: 78, rFanPulley: 56 };
export const PLENUM = { y0: 205, y1: 262, x: 110, z0: -165, z1: 172 };
/** Round air-cleaner canister lying across the engine (SC), axis along X. */
export const AIRBOX = { y: 362, z: 40, r: 80, len: 440 };
export const EXH_PORT = { x: CYL_TOP_X + 34, y: -68 };

// ---------------------------------------------------------------- 105-00 cooling
export function fanHousing() {
  // Photo-matched (photo-ref/fan-housing, FVD 930.106.031): cast magnesium drum, painted black on the car, with
  // rolled intake bell, three raised circumferential bands, alternator strap and two cast feet to the shroud.
  const p = new Part();
  const z0 = FAN.zHousing0, z1 = FAN.zHousing1;
  const prof: [number, number][] = [[129, z0], [135, z0], [137, z0 + 3], [137, 268], [139, 276], [144, 283], [152, z1 - 1], [154, z1 + 2], [150, z1 + 4], [142, z1], [133, 282], [129, 272]];
  p.add(yToZ(lathe(prof, 96)), 'blackPaint', [0, FAN.y, 0]);
  for (const z of [216, 236, 256]) p.add(yToZ(lathe([[136.5, -3], [140, -2], [140, 2], [136.5, 3]], 96)), 'blackPaint', [0, FAN.y, z]);
  // axial stiffening ribs on the drum (front half) and the clamp lugs
  for (let a = 15; a < 360; a += 30) {
    const r = 137, x = r * Math.cos(a * DEG), y = r * Math.sin(a * DEG);
    const rib = boxMM([-1.8, -1, z0 + 2], [1.8, 4, 266]); rib.rotateZ((a - 90) * DEG);
    p.add(rib, 'blackPaint', [x, FAN.y + y, 0]);
  }
  // lower feet onto the air guide / case
  for (const x of [-95, 95]) {
    const ft = hull([...circlePts(0, 0, 14, 12), ...circlePts(0, 40, 18, 12)]);
    const g = extrudeC(polyShape(ft), 34, 1.5); g.rotateZ(x > 0 ? 0.6 : -0.6);
    p.add(g, 'blackPaint', [x, 128, 222]);
  }
  // alternator strap (#2) + clamp bolt (#2A)
  p.add(yToZ(lathe([[62, -8], [66, -8], [66, 8], [62, 8]], 48)), 'steel', [0, FAN.y, 214]);
  p.add(boxMM([-8, FAN.y + 64, 206], [8, FAN.y + 78, 222]), 'steel');
  p.add(yToX(cyl(4, 30, 8)), 'zincPlate', [0, FAN.y + 72, 214]);
  // stator spokes tying the alternator to the housing
  for (const a of [30, 150, 270]) {
    const c = Math.cos(a * DEG), sn = Math.sin(a * DEG);
    p.add(cylBetween([66 * c, FAN.y + 66 * sn, 214], [130 * c, FAN.y + 130 * sn, 214], 4.5, 8), 'blackPaint');
  }
  return p.g;
}
export function fanImpeller() {
  // Photo-matched (photo-ref/fan-impeller): 11 broad, flat, twisted paddle blades (930 106 012), silver-grey cast
  // magnesium, riveted to a pressed hub with a ring of holes.
  const p = new Part();
  const z = FAN.zFan;
  p.add(yToZ(lathe([[24, -6], [60, -6], [64, -3], [64, 4], [58, 6], [24, 6]], 64)), 'magnesium', [0, FAN.y, z]);
  const hub = circleShape(52); hub.holes.push(circlePath(13) as THREE.Path);
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; hub.holes.push(circlePath(4.2, 34 * Math.cos(a), 34 * Math.sin(a)) as THREE.Path); }
  p.add(extrudeC(hub, 2, 0, 24), 'zincPlate', [0, FAN.y, z + 7]);
  p.add(yToZ(lathe([[10, -8], [22, -8], [22, 12], [10, 12]], 24)), 'steel', [0, FAN.y, z]);
  for (let i = 0; i < 11; i++) {
    const a0 = (i / 11) * Math.PI * 2;
    const r0 = 62, r1 = 124;
    const g = paramSurface((u, v) => {
      const r = r0 + (r1 - r0) * u;
      const halfChord = 17 + 9 * u; // broader at the tip
      const pitch = (40 - 14 * u) * DEG; // twist root -> tip
      const c = (v - 0.5) * 2 * halfChord;
      const ang = a0 + (c * Math.cos(pitch)) / r;
      return [r * Math.cos(ang), FAN.y + r * Math.sin(ang), z + 2 + c * Math.sin(pitch)];
    }, 10, 6);
    p.add(g, 'magnesium');
    // tip edge thickness strip
  }
  for (let i = 0; i < 11; i++) { const a = (i / 11) * Math.PI * 2; p.add(yToZ(cyl(2.4, 5, 8)), 'steel', [56 * Math.cos(a), FAN.y + 56 * Math.sin(a), z + 6]); }
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
  p.add(g, 'yellowZinc', [0, FAN.y, FAN.zBelt - 8]);
  // belt-adjusting shims stack + 3 hub bolts, central nut
  p.add(yToZ(lathe([[14, 0], [30, 0], [30, 4], [14, 4]], 36)), 'yellowZinc', [0, FAN.y, FAN.zBelt + 6]);
  for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.5; p.add(yToZ(hexNut(10, 5)), 'zincPlate', [22 * Math.cos(a), FAN.y + 22 * Math.sin(a), FAN.zBelt + 12]); }
  p.add(yToZ(hexNut(22, 10)), 'darkSteel', [0, FAN.y, FAN.zBelt + 15]);
  return p.g;
}
export function crankPulley() {
  const p = new Part();
  p.add(yToZ(vPulley(FAN.rCrankPulley, 2, 14)), 'yellowZinc', [0, 0, 290]);
  p.add(yToZ(lathe([[18, 0], [34, 0], [34, 6], [18, 6]], 36)), 'yellowZinc', [0, 0, 318]);
  p.add(yToZ(hexNut(19, 10)), 'darkSteel', [0, 0, 327]);
  // timing marks (Z1 TDC notch + paint)
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
  // rear collar cradling the fan housing (partial ring under the fan axis).
  // CylinderGeometry puts theta=0 at +Z; after yToZ that maps to -Y, so centre the arc on theta=0 to sit below the housing.
  const collar = yToZ(new THREE.CylinderGeometry(141, 141, 26, 48, 1, true, -Math.PI * 0.38, Math.PI * 0.76));
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
  // Photo-matched (photo-ref/plenum): black moulded-plastic air distributor with one bulbous ribbed "finger" over
  // each intake pipe, cast-aluminium throttle housing at the rear, and the lower half of the round air-cleaner
  // canister on top.
  const p = new Part();
  const { y0, y1, x, z0, z1 } = PLENUM;
  const sec = roundRect(2 * x - 50, y1 - y0, 22, 0, (y0 + y1) / 2);
  const g = extrude(sec, z1 - z0, 4); g.translate(0, 0, z0);
  p.add(g, 'blackPlastic');
  for (const [c, zc] of Object.entries(CYL_Z)) {
    const s = +c <= 3 ? 1 : -1;
    // lobe: tapered bulge from the centre body out to the outlet
    p.add(tube([[s * 40, 238, zc], [s * 80, 236, zc], [s * (x + 2), 232, zc]], 25, 20, 10), 'blackPlastic');
    p.add(yToX(lathe([[0.1, -4], [22, -4], [25, 6], [0.1, 6]], 20)), 'blackPlastic', [s * 40, 238, zc]);
    // moulded ribs across the lobe crest
    for (const dx of [55, 75, 95]) p.add(yToX(torus(26, 1.6, 4, 24)), 'blackPlastic', [s * dx, 235 + (95 - dx) * 0.05, zc]);
    // outlet stubs with rubber sleeves (#10) + clamps
    p.add(cylBetween([x * s - 4 * s, 232, zc], [(x + 16) * s, 232, zc], 21, 24), 'blackPlastic');
    p.add(cylBetween([(x + 14) * s, 232, zc], [(x + 34) * s, 232, zc], 23.5, 24), 'rubber');
    for (const dx of [18, 31]) p.add(yToX(torus(24, 1.2, 4, 24)), 'steel', [(x + dx) * s, 232, zc]);
  }
  // longitudinal ribs on the top of the centre body
  for (const dx of [-30, 0, 30]) p.add(boxMM([dx - 1.5, y1 + 2, z0 + 10], [dx + 1.5, y1 + 7, z1 - 10]), 'blackPlastic');
  // throttle / idle-air housing (#27), cast aluminium, toward the rear
  p.add(yToZ(lathe([[0.1, -24], [36, -24], [36, 18], [32, 22], [0.1, 22]], 36)), 'castAlu', [0, 234, z1 + 18]);
  p.add(yToZ(torus(34, 2, 6, 32)), 'steel', [0, 234, z1 + 38]);
  p.add(yToX(cyl(5, 90, 10)), 'steel', [0, 234, z1 + 12]); // throttle shaft
  p.add(boxMM([44, 220, z1], [52, 252, z1 + 24]), 'castAlu'); // throttle lever boss
  // neck up to the canister
  p.add(extrude(roundRect(150, 60, 24), AIRBOX.y - AIRBOX.r + 30 - y1, 2).rotateX(-Math.PI / 2).translate(0, y1, AIRBOX.z), 'blackPlastic');
  // lower half of the round air-cleaner canister (#9)
  airboxHalf(p, -1);
  // struts (#18/#19)
  for (const s of [1, -1]) p.add(cylBetween([s * 100, 212, -140], [s * 88, 150, -150], 4, 8), 'zincPlate');
  return p.g;
}
/** Half (sign: +1 upper / -1 lower) of the cylindrical air-cleaner canister: shell, dished end caps, seam lip. */
function airboxHalf(p: Part, sign: 1 | -1) {
  const { y, z, r, len } = AIRBOX;
  const shell = paramSurface((u, v) => {
    const a = Math.PI * v * sign; // 0..pi (upper) / 0..-pi (lower), measured from +Z
    return [-len / 2 + len * u, y + r * Math.sin(a), z + r * Math.cos(a)];
  }, 8, 36);
  p.add(shell, 'blackPlastic');
  // moulded hoops around the drum
  for (const xx of [-len / 2 + 30, -len / 6, len / 6, len / 2 - 30]) {
    const hoop = new THREE.TorusGeometry(r + 1, 2.2, 4, 36, Math.PI); hoop.rotateY(Math.PI / 2);
    if (sign < 0) hoop.rotateX(Math.PI);
    p.add(hoop, 'blackPlastic', [xx, y, z]);
  }
  // end caps (dished half discs)
  for (const e of [-1, 1]) {
    const cap = new THREE.CircleGeometry(r, 36, sign > 0 ? 0 : Math.PI, Math.PI); // in XY; rotate to YZ plane
    cap.rotateY(Math.PI / 2); // circle normal -> +X; x->-z, y->y
    p.add(cap, 'blackPlastic', [e * len / 2, y, z]);
    const dome = lathe([[r, 0], [r - 6, 8], [r * 0.5, 12], [0.1, 13]], 36, (sign > 0) === (e > 0) ? Math.PI : 0, Math.PI);
    dome.rotateZ(e > 0 ? -Math.PI / 2 : Math.PI / 2);
    p.add(dome, 'blackPlastic', [e * len / 2, y, z]);
  }
  // seam lip along the split line
  for (const zz of [z - r - 4, z + r + 4]) p.add(boxMM([-len / 2, y - 1.5, zz - 4], [len / 2, y + 1.5, zz + 4]), 'blackPlastic');
}
export function airFilter() {
  // Round pleated paper element (SC), lying inside the canister.
  const p = new Part();
  const { y, z, r, len } = AIRBOX;
  const L = len - 40;
  const pleats = 64;
  const outer = paramSurface((u, v) => {
    const a = u * Math.PI * 2; const rr = r - 14 + 7 * Math.abs(Math.sin(pleats * a / 2));
    return [-L / 2 + L * v, y + rr * Math.sin(a), z + rr * Math.cos(a)];
  }, pleats * 4, 1, true);
  p.add(outer, 'filterPaper');
  const inner = paramSurface((u, v) => { const a = u * Math.PI * 2; const rr = r - 36; return [-L / 2 + L * v, y + rr * Math.sin(a), z + rr * Math.cos(a)]; }, 36, 1, true);
  p.add(inner, 'zincPlate');
  for (const e of [-1, 1]) p.add(yToX(lathe([[r - 38, -5], [r - 4, -5], [r - 4, 5], [r - 38, 5]], 48)), 'rubber', [e * (L / 2), y, z]);
  return p.g;
}
export function airCleanerLid() {
  // Upper half of the round canister with spring clips and the intake snout at the left end.
  const p = new Part();
  const { y, z, r, len } = AIRBOX;
  airboxHalf(p, 1);
  // spring clips / straps (#15)
  for (const xx of [-len / 3, len / 3]) for (const zz of [z - r - 4, z + r + 4]) {
    p.add(boxMM([xx - 6, y - 12, zz - 2], [xx + 6, y + 14, zz + 2]), 'steel', [0, 0, Math.sign(zz - z) * 2]);
  }
  // intake snout (#14) on the left end, pointing forward/down
  p.add(tube([[-len / 2 + 30, y + r - 20, z - 20], [-len / 2 + 30, y + r + 10, z - 60], [-len / 2 + 30, y + 40, z - 120]], 30, 24, 16), 'blackPlastic');
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
  // Photo-matched (photo-ref/mixture-control-unit): black-painted air-flow meter funnel (inverted cone) with the
  // brass sensor plate in its throat, lever pivot housing, and the grey zinc-cast fuel distributor beside it.
  const p = new Part();
  const c: V3 = [-200, 250, 60];
  p.add(lathe([[40, -40], [46, -40], [44, -20], [56, 6], [74, 26], [76, 32], [70, 32], [52, 10], [40, -16]], 48), 'blackPaint', c);
  p.add(lathe([[0.1, 0], [39, 0], [39, 1.6], [0.1, 1.6]], 32), 'brass', [c[0], c[1] - 12, c[2]]);
  p.add(cyl(4, 6, 10), 'steel', [c[0], c[1] - 9, c[2]]);
  // lever housing under the funnel toward the fuel distributor
  p.add(boxMM([c[0] - 20, c[1] - 52, c[2] - 14], [c[0] + 20, c[1] - 36, c[2] + 100]), 'blackPaint');
  // fuel distributor (#1), grey zinc casting, beside the meter
  const fd: V3 = [c[0], c[1] - 20, c[2] + 110];
  p.add(lathe([[0.1, -18], [30, -18], [30, 12], [26, 16], [26, 26], [0.1, 26]], 36), 'zincPlate', fd);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    p.add(cylBetween([fd[0] + 20 * Math.cos(a), fd[1] + 25, fd[2] + 20 * Math.sin(a)], [fd[0] + 28 * Math.cos(a), fd[1] + 28, fd[2] + 28 * Math.sin(a)], 3.5, 8), 'brass');
    p.add(hexNut(11, 6), 'brass', [fd[0] + 28 * Math.cos(a), fd[1] + 28, fd[2] + 28 * Math.sin(a)]);
  }
  for (const a of [0.5, 3.6]) p.add(yToX(cyl(6, 20, 10)), 'brass', [fd[0] + 34 * Math.cos(a), fd[1] - 5, fd[2] + 34 * Math.sin(a)]);
  // cold-start valve (#30)
  p.add(yToZ(cyl(12, 40, 16)), 'darkSteel', [-120, 250, 140]);
  // boot from the meter outlet to the throttle housing / distributor
  p.add(tube([[c[0], c[1] - 40, c[2]], [c[0] + 10, c[1] - 55, c[2]], [-110, 232, c[2]]], 34, 20, 20), 'rubber');
  return p.g;
}
export function fuelLines() {
  const p = new Part();
  const fd: V3 = [-200, 258, 170]; // fuel distributor head (see mixtureControlUnit)
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
  // Photo-matched (photo-ref/heat-exchanger-right): aluminised stamped-steel heater box, lumpy over each primary,
  // with a welded seam flange along its length, three primaries with 2-stud port flanges, the heater-air outlet
  // at the flywheel end and the exhaust outlet to the silencer at the pulley end.
  const p = new Part();
  const zs = s > 0 ? [CYL_Z[1], CYL_Z[2], CYL_Z[3]] : [CYL_Z[4], CYL_Z[5], CYL_Z[6]];
  const X = (x: number) => x * s;
  const shellY = -175, shellX = 228, zA = -205, zB = 222;
  const half = (z: number) => {
    const t = (z - zA) / (zB - zA);
    let a = 40 + 6 * Math.sin(Math.PI * t), b = 30 + 5 * Math.sin(Math.PI * t);
    for (const zc of zs) { const k = Math.exp(-(((z - zc - 12) / 34) ** 2)); a += 5 * k; b += 7 * k; }
    return [a, b];
  };
  const se = (ang: number, a: number, b: number, n = 2.8) => {
    const c = Math.cos(ang), sn = Math.sin(ang);
    return [a * Math.sign(c) * Math.abs(c) ** (2 / n), b * Math.sign(sn) * Math.abs(sn) ** (2 / n)];
  };
  const shell = paramSurface((u, v) => {
    const z = zA + (zB - zA) * v; const [a, b] = half(z); const [x, y] = se(u * Math.PI * 2, a, b);
    return [X(shellX + x), shellY + y, z];
  }, 40, 48, true);
  p.add(shell, 'aluminized');
  // end caps
  for (const z of [zA, zB]) {
    const [a, b] = half(z); const pts: [number, number][] = [];
    for (let i = 0; i < 40; i++) { const [x, y] = se((i / 40) * Math.PI * 2, a, b); pts.push([X(shellX + x), shellY + y]); }
    const cap = new THREE.ShapeGeometry(polyShape(s > 0 ? pts : pts.slice().reverse()), 1); cap.translate(0, 0, z);
    p.add(cap, 'aluminized');
  }
  // seam flange along the outer & inner flanks (mid-height)
  for (const side of [1, -1]) {
    p.add(paramSurface((u, v) => {
      const z = zA + 4 + (zB - zA - 8) * u; const [a] = half(z);
      return [X(shellX + side * (a - 1 + 8 * v)), shellY + 2, z];
    }, 40, 1), 'aluminized');
  }
  // primary pipes from each exhaust port with 2-stud port flanges (#31 gaskets)
  for (const zc of zs) {
    const port: V3 = [X(EXH_PORT.x), EXH_PORT.y, zc];
    const pts: V3[] = [port, [X(EXH_PORT.x), -100, zc], [X(EXH_PORT.x - 4), -130, zc + 6], [X(shellX), shellY + 20, zc + 12]];
    p.add(tube(pts, 18, 16, 24), 'aluminized');
    const fl = polyShape(hull([...circlePts(0, 0, 22, 20), ...circlePts(-30, 0, 9, 10), ...circlePts(30, 0, 9, 10)]));
    fl.holes.push(circlePath(16) as THREE.Path);
    const fg = extrudeC(fl, 6, 0.6, 4); fg.rotateX(Math.PI / 2); fg.rotateY(Math.PI / 2);
    p.add(fg, 'heatSteel', [port[0], port[1] - 3, port[2]]);
    for (const dz of [-30, 30]) p.add(hexNut(12, 7), 'brass', [port[0], port[1] - 9, port[2] + dz]);
    // sleeve where the primary enters the box
    p.add(yToZ(lathe([[19, -8], [24, -8], [24, 8], [19, 8]], 20)).rotateX(-Math.PI / 2 + 0.5), 'aluminized', [X(EXH_PORT.x - 2), -136, zc + 8]);
  }
  // outlet to silencer
  p.add(tube([[X(shellX - 10), shellY - 5, zB - 10], [X(shellX - 20), shellY - 8, 280], [X(150), -185, 318], [X(150), -185, 334]], 22, 16, 30), 'aluminized');
  // heater air outlet (to cabin) at the flywheel end, with adapter (#27)
  p.add(tube([[X(shellX), shellY + 10, zA + 10], [X(shellX), shellY + 20, -240], [X(shellX - 20), shellY + 40, -262]], 26, 20, 16), 'aluminized');
  p.add(yToZ(lathe([[25, -6], [29, -6], [29, 6], [25, 6]], 24)).rotateX(-0.7), 'heatSteel', [X(shellX - 18), shellY + 38, -258]);
  // fresh-air inlet from the blower at the pulley end
  p.add(tube([[X(shellX), shellY + 26, zB - 22], [X(shellX - 10), shellY + 70, 212]], 16, 12, 10), 'aluminized');
  return p.g;
}
export function muffler() {
  // Photo-matched (photo-ref/muffler): aluminised oval drum with a gentle banana curve and a welded seam flange
  // around its middle, two inlet stubs with clamps and the chrome tailpipe on the left.
  const p = new Part();
  const zc = 390, half = 270, a = 58, b = 55;
  const cy = (x: number) => -178 + 12 * (1 - (x / half) ** 2);
  const se = (ang: number, n = 3.2) => { const c = Math.cos(ang), sn = Math.sin(ang); return [a * Math.sign(c) * Math.abs(c) ** (2 / n), b * Math.sign(sn) * Math.abs(sn) ** (2 / n)]; };
  p.add(paramSurface((u, v) => {
    const x = -half + 2 * half * v; const [zz, yy] = se(u * Math.PI * 2);
    return [x, cy(x) + yy, zc + zz];
  }, 40, 30, true), 'aluminized');
  // dished end caps
  for (const e of [-1, 1]) {
    const pts: [number, number][] = []; for (let i = 0; i < 40; i++) { const [zz, yy] = se((i / 40) * Math.PI * 2); pts.push([zz, yy]); }
    const cap = new THREE.ShapeGeometry(polyShape(pts), 1); cap.rotateY(Math.PI / 2); cap.translate(e * half, cy(e * half), zc);
    p.add(cap, 'aluminized');
    const lip = paramSurface((u, v) => { const [zz, yy] = se(u * Math.PI * 2); const k = 1 + 0.06 * v; return [e * (half - 2 + 4 * v), cy(e * half) + yy * k, zc + zz * k]; }, 40, 1, true);
    p.add(lip, 'aluminized');
  }
  // seam flange around the mid-plane (front + back + ends)
  for (const side of [1, -1]) p.add(paramSurface((u, v) => { const x = -half + 2 + (2 * half - 4) * u; return [x, cy(x), zc + side * (a - 1 + 9 * v)]; }, 30, 1), 'aluminized');
  // inlets (#2 gaskets, #5 clamps)
  for (const s of [1, -1]) {
    p.add(cylBetween([150 * s, -185, 325], [150 * s, -185, 340], 25, 20), 'aluminized');
    p.add(yToZ(torus(26, 3, 6, 24)), 'steel', [150 * s, -185, 330]);
  }
  // tailpipe (chrome), exiting rearward on the left
  p.add(tube([[-200, -200, 440], [-205, -205, 470], [-210, -212, 500]], 26, 24, 12), 'chrome');
  p.add(yToZ(lathe([[24, 0], [28.5, 0], [28.5, 34], [26, 36], [24, 34]], 32)), 'chrome', [-210, -212, 488]);
  // bracket (#34)
  p.add(boxMM([-40, -122, 360], [40, -110, 420]), 'darkSteel');
  return p.g;
}
// ---------------------------------------------------------------- 102-00 / 301 flywheel & clutch
export const FLY_Z = CASE_Z.flywheel - 8; // crank flange face
export function flywheel() {
  // Photo-matched (photo-ref/flywheel): dark cast-iron/steel body, ground (polished) friction face, pressed-on
  // starter ring gear, 9 bolts on a centre boss, dowels on the rim.
  const p = new Part();
  const z = FLY_Z;
  const prof: [number, number][] = [[20, 0], [55, 0], [60, -4], [110, -4], [128, -2], [134, 0], [134, -28], [128, -30], [60, -30], [55, -18], [20, -18]];
  p.add(yToZ(lathe(prof, 96)), 'darkSteel', [0, 0, z]);
  p.add(yToZ(lathe([[78, -30.2], [127, -30.2], [127, -30.6], [78, -30.6]], 96)), 'polishedSteel', [0, 0, z]);
  p.add(extrude(gearShape(130, 136, 142, 133), 12, 0, 4), 'forgedSteel', [0, 0, z - 14]);
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; p.add(yToZ(hexNut(13, 6)), 'darkSteel', [36 * Math.cos(a), 36 * Math.sin(a), z - 21]); }
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2 + 0.2; p.add(yToZ(cyl(4, 8, 8)), 'zincPlate', [124 * Math.cos(a), 124 * Math.sin(a), z - 33]); }
  // lightening/balance drillings on the back face
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; p.add(yToZ(cyl(6, 1, 12)), 'bore', [92 * Math.cos(a), 92 * Math.sin(a), z - 4.6]); }
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
