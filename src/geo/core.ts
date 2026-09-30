/**
 * Bottom end + top end assets (crankcase, crank, rods, pistons, cylinders, heads, valve train, cam drive).
 * Shapes traced from the Porsche 911 1978-83 parts catalogue illustrations (groups 101-103) and scaled with
 * published / measured dimensions (see docs/engine-spec.md). All units mm.
 */
import * as THREE from 'three';
import {
  Part, V3, DEG, lathe, boxMM, cyl, cylBetween, yToZ, yToX, roundRect, circlePath, circleShape, ringShape,
  polyShape, hull, circlePts, gearShape, extrude, extrudeC, hexNut, tube, torus, spring,
} from './util';
import {
  SPEC, CYL_Z, MAIN_Z, THROW_DEG, DECK_X, CYL_TOP_X, HEAD_OUT_X, CAM_X, CAM_HOUSING_OUT_X, INT_SHAFT_Y, CASE_Z, NOSE_BEARING_Z,
} from '../data/layout';

const bankZ = (s: 1 | -1) => (s === 1 ? [CYL_Z[1], CYL_Z[2], CYL_Z[3]] : [CYL_Z[4], CYL_Z[5], CYL_Z[6]]);

// ---------------------------------------------------------------- crankcase half (101-05 left / 101-10 right)
export function crankcaseHalf(s: 1 | -1) {
  const p = new Part();
  const z0 = CASE_Z.flywheel, z1 = CASE_Z.pulley, len = z1 - z0;
  // outer section (right half, mirrored for left) -- tall narrow cast shell with chamfered shoulders
  const outer: [number, number][] = [[0, -124], [62, -124], [86, -110], [100, -80], [100, 74], [90, 100], [60, 112], [0, 112]];
  const inner: [number, number][] = [[0, -116], [58, -116], [78, -104], [92, -78], [92, 70], [84, 94], [58, 104], [0, 104]];
  const mir = (pts: [number, number][]) => pts.map(([x, y]) => [x * s, y] as [number, number]);
  const sh = polyShape(s === 1 ? mir(outer) : mir(outer).reverse());
  const hole = new THREE.Path(); const ip = s === 1 ? mir(inner).reverse() : mir(inner);
  hole.moveTo(ip[0][0], ip[0][1]); ip.slice(1).forEach(([x, y]) => hole.lineTo(x, y)); hole.closePath();
  sh.holes.push(hole);
  const shell = extrude(sh, len); shell.translate(0, 0, z0);
  p.add(shell, 'castAlu');
  // end walls with crank / intermediate-shaft bores
  const endWall = (z: number, t: number, crankR: number) => {
    const ws = polyShape(s === 1 ? mir(outer) : mir(outer).reverse());
    ws.holes.push(circlePath(crankR, 0, 0) as THREE.Path);
    ws.holes.push(circlePath(20, 0, INT_SHAFT_Y) as THREE.Path);
    const g = extrude(ws, t); g.translate(0, 0, z);
    p.add(g, 'castAlu');
  };
  endWall(z0, 8, 48); endWall(z1 - 8, 8, 34);
  // main bearing webs (saddles) -- half discs with journal cut-out
  for (const z of MAIN_Z) {
    const web: [number, number][] = [[0, -116], [58, -116], [78, -104], [92, -78], [92, 70], [84, 94], [58, 104], [0, 104]];
    const ws = polyShape(s === 1 ? mir(web) : mir(web).reverse());
    ws.holes.push(circlePath(33, 0, 0) as THREE.Path);
    ws.holes.push(circlePath(18, 0, INT_SHAFT_Y) as THREE.Path);
    ws.holes.push(circlePath(16, 50 * s, -60) as THREE.Path); // oil passage / lightening
    const g = extrudeC(ws, 12); g.translate(0, 0, z);
    p.add(g, 'castAlu');
  }
  // split-line flanges with bolt bosses (top and bottom)
  p.add(boxMM([s > 0 ? 0 : -16, 106, z0], [s > 0 ? 16 : 0, 118, z1]), 'castAlu');
  p.add(boxMM([s > 0 ? 0 : -16, -130, z0], [s > 0 ? 16 : 0, -118, z1]), 'castAlu');
  for (let z = z0 + 25; z < z1 - 10; z += 58) {
    p.add(hexNut(13, 7), 'zincPlate', [9 * s, 121.5, z]);
    p.add(hexNut(13, 7), 'zincPlate', [9 * s, -133.5, z]);
  }
  // cylinder spigot pads on deck with head studs and through-bolt cap nuts
  for (const zc of bankZ(s)) {
    const pad = yToX(lathe([[46, 0], [60, 0], [60, 5], [55, 7], [47.5, 7], [47.5, 0]], 48));
    if (s < 0) pad.rotateZ(Math.PI);
    p.add(pad, 'castAlu', [(DECK_X - 4) * s, 0, zc]);
    p.add(yToX(cyl(47.4, 0.5, 40)), 'bore', [(DECK_X - 3) * s, 0, zc]);
    for (const a of [45, 135, 225, 315]) {
      const y = 57 * Math.sin(a * DEG), z = 57 * Math.cos(a * DEG);
      p.add(cylBetween([(DECK_X - 4) * s, y, zc + z], [(HEAD_OUT_X - 4) * s, y, zc + z], 5, 10), 'zincPlate');
    }
  }
  // vertical ribs & through-bolt bosses between cylinders
  const zs = bankZ(s).slice().sort((a, b) => a - b);
  const mids = [zs[0] - 59, (zs[0] + zs[1]) / 2, (zs[1] + zs[2]) / 2, zs[2] + 59];
  for (const zm of mids) {
    if (zm < z0 + 6 || zm > z1 - 6) continue;
    p.add(boxMM([s > 0 ? 94 : -104, -78, zm - 4], [s > 0 ? 104 : -94, 72, zm + 4]), 'castAlu');
    for (const y of [-40, 40]) {
      p.add(yToX(cyl(9, 12, 20)), 'castAlu', [100 * s, y, zm]);
      p.add(yToX(hexNut(15, 9)), 'darkSteel', [108 * s, y, zm]);
    }
  }
  // longitudinal stiffening ribs
  p.add(boxMM([s > 0 ? 88 : -102, 78, z0], [s > 0 ? 102 : -88, 86, z1]), 'castAlu');
  p.add(boxMM([s > 0 ? 88 : -102, -92, z0], [s > 0 ? 102 : -88, -84, z1]), 'castAlu');
  // pulley-end nose (houses bearing 8, intermediate shaft end and oil pump)
  const nose = new THREE.Shape();
  if (s > 0) { nose.moveTo(0, -124); nose.lineTo(52, -124); nose.lineTo(58, -60); nose.lineTo(40, 30); nose.lineTo(0, 44); nose.closePath(); }
  else { nose.moveTo(0, -124); nose.lineTo(0, 44); nose.lineTo(-40, 30); nose.lineTo(-58, -60); nose.lineTo(-52, -124); nose.closePath(); }
  nose.holes.push(circlePath(26, 0, 0) as THREE.Path);
  const ng = extrude(nose, 50); ng.translate(0, 0, z1); p.add(ng, 'castAlu');
  // flywheel-end seal boss (half)
  const boss = yToZ(new THREE.CylinderGeometry(58, 58, 10, 32, 1, true, s > 0 ? 0 : Math.PI, Math.PI));
  p.add(boss, 'castAlu', [0, 0, z0 - 5]);
  // oil pressure sender (right) / breather tower seat (left)
  if (s > 0) {
    p.add(cyl(11, 22, 16), 'castAlu', [40, 120, 170]);
    p.add(cyl(15, 30, 24), 'darkSteel', [40, 142, 170]);
  } else {
    p.add(boxMM([-70, 112, 120], [-20, 120, 185]), 'castAlu');
  }
  // lower oil-return / sump pad
  p.add(boxMM([s > 0 ? 0 : -96, -128, -100], [s > 0 ? 96 : 0, -124, 80]), 'castAlu');
  return p.g;
}

// ---------------------------------------------------------------- main bearing shells (102-00 #21-24)
export function mainBearings() {
  const p = new Part();
  for (const z of MAIN_Z) {
    const g = yToZ(lathe([[30.1, -8], [32.6, -8], [32.6, 8], [30.1, 8]], 40));
    p.add(g, 'bronze', [0, 0, z]);
  }
  p.add(yToZ(lathe([[25, -11], [28, -11], [28, 11], [25, 11]], 32)), 'bronze', [0, 0, NOSE_BEARING_Z]);
  return p.g;
}

// ---------------------------------------------------------------- crankshaft (102-00 #1)
export function crankshaft() {
  const p = new Part();
  const rMain = SPEC.mainJournalD / 2, rPin = SPEC.rodJournalD / 2, r = SPEC.crankRadius;
  const mainW = 18, pinW = 21;
  for (const z of MAIN_Z) {
    p.add(yToZ(lathe([[rMain - 3, -mainW / 2], [rMain, -mainW / 2 + 1.5], [rMain, mainW / 2 - 1.5], [rMain - 3, mainW / 2]], 40)), 'steel', [0, 0, z]);
  }
  const throws = Object.entries(CYL_Z).map(([c, z]) => ({ c: +c, z, a: THROW_DEG[+c] * DEG }));
  for (const t of throws) {
    const px = r * Math.cos(t.a), py = r * Math.sin(t.a);
    p.add(yToZ(lathe([[rPin - 2, -pinW / 2], [rPin, -pinW / 2 + 1.5], [rPin, pinW / 2 - 1.5], [rPin - 2, pinW / 2]], 36)), 'steel', [px, py, t.z]);
    // webs either side: hull of main boss + pin boss (the 930/03 crank is not counterweighted)
    for (const side of [-1, 1]) {
      const zw = t.z + side * (pinW / 2 + 5);
      const pts = hull([...circlePts(0, 0, rMain + 10, 28), ...circlePts(px, py, rPin + 9, 28)]);
      const sh = polyShape(pts);
      sh.holes.push(circlePath(5, px * 0.45, py * 0.45) as THREE.Path); // oil drilling
      p.add(extrudeC(sh, 10, 1.2, 8), 'forgedSteel', [0, 0, zw]);
    }
  }
  // flywheel flange with 9 bolt holes (102-00 #6 pan-head screws x9)
  const fl = circleShape(52);
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; fl.holes.push(circlePath(5.5, 36 * Math.cos(a), 36 * Math.sin(a)) as THREE.Path); }
  fl.holes.push(circlePath(10) as THREE.Path);
  p.add(extrude(fl, 12, 1), 'forgedSteel', [0, 0, CASE_Z.flywheel - 8]);
  p.add(yToZ(cyl(rMain, 24, 32)), 'steel', [0, 0, -196]);
  // nose: timing gear seat, distributor drive seat, bearing 8 journal, pulley snout
  p.add(yToZ(lathe([[rMain, 186], [34, 186], [34, 226], [27, 226], [27, 256], [20, 256], [20, 318], [8, 320]], 36)), 'steel');
  return p.g;
}

/** Crank timing gear (102-00 #8) + distributor drive wheel (102-00 #10). */
export function crankGears() {
  const p = new Part();
  p.add(extrudeC(gearShape(36, 34.5, 38.5, 22), 14, 0.4), 'steel', [0, 0, 199]);
  // helical-looking distributor drive wheel: stacked twisted slices
  for (let i = 0; i < 4; i++) {
    const g = extrudeC(gearShape(24, 30, 33, 22), 3); g.rotateZ(i * 2.2 * DEG);
    p.add(g, 'bronze', [0, 0, 213 + i * 3]);
  }
  p.add(yToZ(cyl(24, 3, 32)), 'darkSteel', [0, 0, 208]);
  return p.g;
}

// ---------------------------------------------------------------- connecting rod (102-00 #16), local: big end at 0, small end +X
export function conrod() {
  const p = new Part();
  const L = SPEC.rodLength, t = 21;
  // big-end half (rod side) and cap, split on x=0 plane
  const half = (cap: boolean) => {
    const s = new THREE.Shape();
    const ro = 42, ri = SPEC.rodJournalD / 2 + 2;
    const a0 = cap ? Math.PI / 2 : -Math.PI / 2, a1 = cap ? 1.5 * Math.PI : Math.PI / 2;
    s.absarc(0, 0, ro, a0, a1, false); s.absarc(0, 0, ri, a1, a0, true); s.closePath();
    return s;
  };
  p.add(extrudeC(half(false), t, 0.8), 'forgedSteel');
  p.add(extrudeC(half(true), t, 0.8), 'forgedSteel', [-0.8, 0, 0]);
  // bolt bosses + bolts & nuts (#18/#19)
  for (const y of [-34, 34]) {
    p.add(yToX(cyl(8, 22, 16)), 'forgedSteel', [4, y, 0]);
    p.add(yToX(cyl(8, 16, 16)), 'forgedSteel', [-10, y, 0]);
    p.add(yToX(cyl(4.5, 48, 12)), 'steel', [-2, y, 0]);
    p.add(yToX(hexNut(13, 9)), 'darkSteel', [-22, y, 0]);
  }
  // I-beam: web + flanges
  const x0 = 34, x1 = L - 14;
  const web = polyShape([[x0, -17], [x1, -9], [x1, 9], [x0, 17]]);
  p.add(extrudeC(web, 7), 'forgedSteel');
  for (const sgn of [-1, 1]) {
    p.add(extrudeC(polyShape(sgn > 0 ? [[x0, 12], [x1, 5], [x1, 10], [x0, 18]] : [[x0, -18], [x1, -10], [x1, -5], [x0, -12]]), t - 2, 0.6), 'forgedSteel');
  }
  // small end with bronze bush (#17)
  p.add(extrudeC(ringShape(17.5, 12), t - 2, 0.6), 'forgedSteel', [L, 0, 0]);
  p.add(extrudeC(ringShape(12, 11), t - 1), 'bronze', [L, 0, 0]);
  // rod bearing shells (#20)
  p.add(yToZ(lathe([[SPEC.rodJournalD / 2, -9], [SPEC.rodJournalD / 2 + 2, -9], [SPEC.rodJournalD / 2 + 2, 9], [SPEC.rodJournalD / 2, 9]], 32)), 'bronze');
  return p.g;
}

// ---------------------------------------------------------------- piston (102-05), local: pin axis along Z at origin, crown toward +X
export function piston() {
  const p = new Part();
  const R = SPEC.bore / 2 - 0.1, top = SPEC.compressionHeight;
  const prof: [number, number][] = [
    [R - 5, -44], [R - 0.4, -44], [R - 0.2, 12],
    [R - 0.2, 14], [R - 3, 14], [R - 3, 16.5], [R - 0.1, 16.5], // oil ring groove
    [R - 0.1, 21], [R - 3, 21], [R - 3, 23], [R, 23],
    [R, 27], [R - 3, 27], [R - 3, 29], [R, 29],
    [R, top - 1], [R - 1, top], [R - 8, top + 1], // squish band
    [34, top + 4], [26, top + 9], [14, top + 11.5], [0.1, top + 12], // dome
  ];
  const inner: [number, number][] = [[0.1, top - 6], [R - 6, top - 7], [R - 5, -44]];
  const g = yToX(lathe([...inner.reverse(), ...prof], 64));
  p.add(g, 'machinedAlu');
  // valve reliefs on dome
  for (const [yy, rr] of [[14, 12], [-15, 10]] as const) {
    p.add(yToX(cyl(rr, 1.2, 24)), 'castAlu', [top + 9.5, yy, 0]);
  }
  // pin bosses and pin (#3) + circlips (#4)
  for (const z of [-1, 1]) {
    p.add(yToZ(cyl(14, 8, 24)), 'machinedAlu', [0, 0, z * (R - 6)]);
    p.add(yToZ(torus(11.2, 0.9, 6, 24)), 'steel', [0, 0, z * (R - 2)]);
  }
  p.add(yToZ(lathe([[7, -R + 2], [11, -R + 2], [11, R - 2], [7, R - 2]], 24)), 'steel');
  // rings (#2)
  for (const x of [15.2, 22, 28]) p.add(yToX(lathe([[R - 2.8, -0.8], [R + 0.05, -0.8], [R + 0.05, 0.8], [R - 2.8, 0.8]], 64)), 'darkSteel', [x, 0, 0]);
  return p.g;
}

// ---------------------------------------------------------------- cylinder (102-05 #1), local: base on case deck at x=0, axis +X
export function cylinder() {
  const p = new Part();
  const H = CYL_TOP_X - DECK_X; // 98
  const rb = SPEC.bore / 2;
  const prof: [number, number][] = [[rb, -14], [rb + 4, -14], [rb + 4, 0], [58, 0], [58, 6], [52.5, 7]];
  // cooling fins: tapered, pitch 5.4 mm
  let y = 9;
  while (y < H - 9) {
    prof.push([52.5, y - 0.4], [57.5, y], [57.5, y + 1.6], [52.5, y + 2.2]);
    y += 5.4;
  }
  prof.push([52.5, H - 6], [51, H - 5], [51, H], [rb, H]);
  p.add(yToX(lathe(prof, 56)), 'nikasil');
  p.add(yToX(lathe([[rb - 0.01, -14], [rb - 0.01, H]], 56)), 'bore');
  // base gasket (#5) and head sealing ring (#6)
  p.add(yToX(lathe([[rb + 4, -0.3], [56, -0.3], [56, 0], [rb + 4, 0]], 48)), 'gasket');
  return p.g;
}

// ---------------------------------------------------------------- cylinder head (103-00), local: combustion face at x=0, outer +X
export const HEAD_W = HEAD_OUT_X - CYL_TOP_X; // 61
export function cylinderHead() {
  const p = new Part();
  const W = HEAD_W;
  // core casting
  p.add(boxMM([0, -52, -42], [W, 54, 42]), 'castAlu');
  p.add(yToX(cyl(56, 8, 48)), 'castAlu', [4, 0, 0]);
  // vertical cooling fins (plates normal to Z) -- traced from the finned head in ill. 103-00
  for (let z = -54; z <= 54; z += 6) {
    if (Math.abs(z) < 41) continue;
    const sh = polyShape([[6, -50], [W - 4, -44], [W - 2, 48], [8, 54]]);
    p.add(extrudeC(sh, 2.2), 'castAlu', [0, 0, z]);
  }
  for (let y = -44; y <= 44; y += 7) {
    // transverse fins on the side faces
    p.add(boxMM([10, y - 1, -56], [W - 6, y + 1, 56]), 'castAlu');
  }
  // intake port (top) with flange & 2 studs
  const ip = roundRect(46, 40, 12);
  ip.holes.push(circlePath(17.5) as THREE.Path);
  const ipg = extrudeC(ip, 10); ipg.rotateX(Math.PI / 2);
  p.add(ipg, 'castAlu', [26, 60, 0]);
  p.add(yToZ(cyl(17.4, 1, 32)).rotateX(Math.PI / 2), 'bore', [26, 63, 0]);
  for (const z of [-17, 17]) { p.add(cyl(4, 14, 8), 'zincPlate', [26, 70, z]); p.add(hexNut(13, 6), 'zincPlate', [26, 68, z]); }
  // exhaust port (bottom) flange & studs
  const ep = roundRect(44, 34, 8); ep.holes.push(circlePath(15.5) as THREE.Path);
  const epg = extrudeC(ep, 10); epg.rotateX(Math.PI / 2);
  p.add(epg, 'castAlu', [34, -57, 0]);
  p.add(yToZ(cyl(15.4, 1, 32)).rotateX(Math.PI / 2), 'bore', [34, -61, 0]);
  for (const z of [-16, 16]) p.add(cyl(4, 16, 8), 'zincPlate', [34, -64, z]);
  // spark plug boss (lower side, angled outward)
  const sp = cyl(11, 22, 20); sp.rotateZ(-20 * DEG);
  p.add(sp, 'castAlu', [16, -50, 34]);
  // valve guide bosses toward cam housing (#2)
  p.add(cylBetween([W - 4, 26, 0], [W + 6, 31, 0], 8, 16), 'castAlu');
  p.add(cylBetween([W - 4, -26, 0], [W + 6, -32, 0], 8, 16), 'castAlu');
  // cam housing studs (#5-#7)
  for (const [y, z] of [[36, 30], [36, -30], [-36, 30], [-36, -30]]) {
    p.add(yToX(cyl(4, 16, 8)), 'zincPlate', [W + 4, y, z]);
  }
  // combustion chamber face ring
  p.add(yToX(lathe([[40, -0.5], [48, -0.5], [48, 0.5], [40, 0.5]], 48)), 'machinedAlu', [-0.5, 0, 0]);
  return p.g;
}

/** Valves, springs, retainers for one cylinder (103-00 #9-#18), local = head frame. */
export const VALVE_ANGLE = { intake: 28 * DEG, exhaust: 32 * DEG };
export const VALVE_LEN = 112;
export function valveSet() {
  const p = new Part();
  const one = (dia: number, ang: number, sign: 1 | -1) => {
    const g = new THREE.Group();
    const L = VALVE_LEN;
    const v = new Part();
    v.add(lathe([[0.1, 0], [dia / 2, 0], [dia / 2, 1.8], [dia / 2 - 3, 4], [5.5, 14], [4.5, 22], [4.5, L - 6], [4.2, L - 5], [4.5, L - 4], [4.5, L], [0.1, L]], 32), sign > 0 ? 'steel' : 'heatSteel');
    // spring seat, double springs (#13), retainer (#14), collets (#15)
    v.add(lathe([[5, L - 52], [17, L - 52], [17, L - 50], [5, L - 50]], 24), 'steel');
    v.add(spring(15, 1.9, L - 50, L - 14, 5.5), 'darkSteel');
    v.add(spring(10.5, 1.4, L - 50, L - 14, 6.5), 'darkSteel');
    v.add(lathe([[5, L - 14], [16.5, L - 14], [16.5, L - 11], [6, L - 8], [5, L - 8]], 24), 'steel');
    v.add(new THREE.CylinderGeometry(5, 6.2, 7, 12).translate(0, L - 10, 0), 'steel');
    g.add(v.g);
    // orient: valve axis from chamber toward outside & up (intake) / down (exhaust)
    g.rotation.z = -Math.PI / 2 + sign * ang;
    g.position.set(2.5, sign * 14, 0);
    p.addObj(g);
  };
  one(49, VALVE_ANGLE.intake, 1);
  one(41.5, VALVE_ANGLE.exhaust, -1);
  return p.g;
}

// ---------------------------------------------------------------- camshaft housing (103-05 #13), engine coords
const CH_Z0 = -168, CH_Z1 = CASE_Z.pulley;
export function camHousing(s: 1 | -1) {
  const p = new Part();
  const X = (x: number) => x * s;
  const lo = (a: number, b: number) => [Math.min(X(a), X(b)), Math.max(X(a), X(b))];
  const bx = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, m: any = 'castAlu') => {
    const [a, b] = lo(x0, x1); p.add(boxMM([a, y0, z0], [b, y1, z1]), m);
  };
  // base plate against heads
  bx(HEAD_OUT_X, HEAD_OUT_X + 12, -70, 72, CH_Z0, CH_Z1);
  // outer spine
  bx(CAM_HOUSING_OUT_X - 14, CAM_HOUSING_OUT_X, -30, 30, CH_Z0, CH_Z1);
  // cover seats (upper & lower rails)
  bx(HEAD_OUT_X + 8, HEAD_OUT_X + 18, 64, 74, CH_Z0, CH_Z1);
  bx(HEAD_OUT_X + 8, HEAD_OUT_X + 18, -74, -64, CH_Z0, CH_Z1);
  // bearing towers / cross-webs between cylinders and at ends (with cam bore)
  const zs = bankZ(s).slice().sort((a, b) => a - b);
  const webs = [CH_Z0 + 6, (zs[0] + zs[1]) / 2, (zs[1] + zs[2]) / 2, CH_Z1 - 6];
  for (const zw of webs) {
    const sh = polyShape(s > 0
      ? [[HEAD_OUT_X + 10, -70], [HEAD_OUT_X + 18, -72], [CAM_HOUSING_OUT_X - 10, -32], [CAM_HOUSING_OUT_X - 10, 32], [HEAD_OUT_X + 18, 72], [HEAD_OUT_X + 10, 70]]
      : [[-(HEAD_OUT_X + 10), 70], [-(HEAD_OUT_X + 18), 72], [-(CAM_HOUSING_OUT_X - 10), 32], [-(CAM_HOUSING_OUT_X - 10), -32], [-(HEAD_OUT_X + 18), -72], [-(HEAD_OUT_X + 10), -70]]);
    sh.holes.push(circlePath(25, X(CAM_X), 0) as THREE.Path);
    p.add(extrudeC(sh, 12), 'castAlu', [0, 0, zw]);
  }
  // rocker shaft bosses (#44 shafts pass through)
  for (const zc of zs) for (const y of [40, -40]) {
    p.add(yToZ(cyl(9, 40, 16)), 'castAlu', [X(CAM_X + 16), y, zc]);
  }
  // cam oil feed line along outer spine (#29 banjo bolts)
  p.add(tube([[X(CAM_HOUSING_OUT_X + 5), 20, CH_Z1 + 10], [X(CAM_HOUSING_OUT_X + 6), 22, 60], [X(CAM_HOUSING_OUT_X + 6), 22, CH_Z0 + 20]], 3.2, 8, 40), 'steel');
  for (const z of [CH_Z1 - 20, CH_Z0 + 20]) p.add(yToX(hexNut(14, 8)), 'brass', [X(CAM_HOUSING_OUT_X + 4), 20, z]);
  // flywheel-end lids (#16/#17)
  p.add(yToZ(cyl(30, 6, 32)), 'castAlu', [X(CAM_X), 0, CH_Z0 - 3]);
  // stud nuts to heads (#22 x40 across both sides)
  for (const zc of zs) for (const [y, dz] of [[60, 30], [60, -30], [-60, 30], [-60, -30]]) {
    p.add(yToX(hexNut(13, 7)), 'zincPlate', [X(HEAD_OUT_X + 16), y, zc + dz]);
  }
  return p.g;
}

/** Upper / lower valve cover (103-05 #19/#20 style), engine coords. */
export function valveCover(s: 1 | -1, upper: boolean) {
  const loc = new Part();
  const len = CH_Z1 - CH_Z0 - 8, w = 58;
  loc.add(extrudeC(roundRect(w, len, 10), 5, 1.5), 'castAlu');
  for (const dx of [-16, 0, 16]) loc.add(boxMM([dx - 1.2, -len / 2 + 14, 2], [dx + 1.2, len / 2 - 14, 8]), 'castAlu');
  loc.add(boxMM([-w / 2 + 12, -len / 2 + 14, 2], [w / 2 - 12, -len / 2 + 17, 8]), 'castAlu');
  loc.add(boxMM([-w / 2 + 12, len / 2 - 17, 2], [w / 2 - 12, len / 2 - 14, 8]), 'castAlu');
  for (let i = 0; i < 8; i++) {
    const yy = -len / 2 + 20 + (i * (len - 40)) / 7;
    for (const xx of [-w / 2 + 6, w / 2 - 6]) { const n = hexNut(10, 6); n.rotateX(Math.PI / 2); loc.add(n, 'zincPlate', [xx, yy, 5]); }
  }
  // local x = along slope, local y = engine Z, local z = outward normal
  const a0 = new THREE.Vector3((HEAD_OUT_X + 13) * s, upper ? 74 : -74, 0);
  const a1 = new THREE.Vector3((CAM_HOUSING_OUT_X - 7) * s, upper ? 32 : -32, 0);
  const mid = a0.clone().add(a1).multiplyScalar(0.5);
  let u = a1.clone().sub(a0).normalize();
  const e = new THREE.Vector3(0, 0, 1);
  let n = new THREE.Vector3().crossVectors(u, e);
  const outward = new THREE.Vector3(mid.x - CAM_X * s, mid.y, 0);
  if (n.dot(outward) < 0) { u = u.negate(); n = new THREE.Vector3().crossVectors(u, e); }
  const m = new THREE.Matrix4().makeBasis(u, e, n);
  m.setPosition(mid.clone().add(n.clone().multiplyScalar(2)).setZ((CH_Z0 + CH_Z1) / 2));
  loc.g.applyMatrix4(m);
  const out = new Part(); out.addObj(loc.g); return out.g;
}

// ---------------------------------------------------------------- camshaft (103-10/-15 #42)
export function camshaft(s: 1 | -1) {
  const p = new Part();
  const X = CAM_X * s;
  p.add(yToZ(cyl(15, CH_Z1 - CH_Z0 + 30, 24)), 'steel', [X, 0, (CH_Z0 + CH_Z1) / 2 + 15]);
  const zs = bankZ(s).slice().sort((a, b) => a - b);
  const webs = [CH_Z0 + 6, (zs[0] + zs[1]) / 2, (zs[1] + zs[2]) / 2, CH_Z1 - 6];
  for (const zw of webs) p.add(yToZ(cyl(24, 12, 32)), 'machinedAlu', [X, 0, zw]);
  const cyls = s > 0 ? [1, 2, 3] : [4, 5, 6];
  cyls.forEach((c) => {
    const zc = CYL_Z[c];
    for (const [dz, ph] of [[-9, 0], [9, 110]] as const) {
      // egg-shaped lobe outline
      const pts: [number, number][] = [];
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        const lift = Math.max(0, Math.cos(a)) ** 2 * 10.5;
        pts.push([(19 + lift) * Math.cos(a), (19 + lift) * Math.sin(a)]);
      }
      const g = extrudeC(polyShape(pts), 13);
      g.rotateZ(((THROW_DEG[c] / 2) + ph) * DEG);
      p.add(g, 'steel', [X, 0, zc + dz]);
    }
  });
  // sprocket flange (#36) at chain end
  p.add(yToZ(cyl(26, 10, 32)), 'steel', [X, 0, CH_Z1 + 8]);
  return p.g;
}

/** Rocker arms + shafts for one bank (103-10/-15 #44-#50). */
export function rockers(s: 1 | -1) {
  const p = new Part();
  const zs = bankZ(s);
  for (const zc of zs) {
    for (const [up, dz] of [[1, -9], [-1, 9]] as const) {
      const pivot: [number, number] = [CAM_X + 16, up * 40];
      const camC: [number, number] = [CAM_X, up * 21];
      const tip: [number, number] = [CAM_X + 6, up * 58];
      const pts = hull([...circlePts(pivot[0], pivot[1], 10, 16), ...circlePts(camC[0], camC[1], 6, 12), ...circlePts(tip[0], tip[1], 6, 12)]);
      p.add(extrudeC(polyShape(s > 0 ? pts : pts.map(([x, y]) => [-x, y] as [number, number]).reverse()), 16, 0.8), 'forgedSteel', [0, 0, zc + dz]);
      p.add(yToZ(cyl(8.5, 40, 16)), 'steel', [pivot[0] * s, pivot[1], zc]);
      // adjusting screw (#49) & nut (#50)
      p.add(cylBetween([tip[0] * s, up * 52, zc + dz], [tip[0] * s, up * 70, zc + dz], 3.8, 10), 'steel');
      p.add(hexNut(11, 5).translate(tip[0] * s, up * 66, zc + dz), 'darkSteel');
    }
  }
  return p.g;
}

// ---------------------------------------------------------------- cam chain drive (103-10/-15)
const INT_SPROCKET_R = 9.525 / (2 * Math.sin(Math.PI / 24));
const CAM_SPROCKET_R = 9.525 / (2 * Math.sin(Math.PI / 36));
export const CHAIN_Z: Record<1 | -1, number> = { 1: 236, [-1]: 222 } as any;

function chainPath(s: 1 | -1) {
  // two circles: intermediate shaft sprocket & cam sprocket; external tangent loop
  const c1 = new THREE.Vector2(0, INT_SHAFT_Y), r1 = INT_SPROCKET_R;
  const c2 = new THREE.Vector2(CAM_X * s, 0), r2 = CAM_SPROCKET_R;
  const pts: THREE.Vector2[] = [];
  const d = c2.clone().sub(c1); const L = d.length(); const base = Math.atan2(d.y, d.x);
  const beta = Math.acos((r1 - r2) / L); // >90deg: large sprocket wraps more than half
  // around c2 from base+beta to base-beta (the far side), then c1 back
  const arc = (c: THREE.Vector2, r: number, a0: number, a1: number, n: number) => {
    for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; pts.push(new THREE.Vector2(c.x + r * Math.cos(a), c.y + r * Math.sin(a))); }
  };
  arc(c2, r2, base - beta, base + beta, 40); // far side of cam sprocket
  arc(c1, r1, base + beta, base + Math.PI * 2 - beta, 40); // long way round small sprocket
  return { pts, c1, c2 };
}
export function timingChain(s: 1 | -1) {
  const p = new Part();
  const { pts } = chainPath(s);
  const curve = new THREE.CatmullRomCurve3(pts.map((v) => new THREE.Vector3(v.x, v.y, 0)), true);
  const len = curve.getLength(); const pitch = 9.525; const n = Math.round(len / pitch);
  const z = CHAIN_Z[s];
  for (let i = 0; i < n; i++) {
    const a = curve.getPointAt(i / n), b = curve.getPointAt(((i + 1) % n) / n);
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const outer = i % 2 === 0;
    const plate = extrudeC(roundRect(pitch + 5, 8, 3.5), 1.1, 0, 3);
    plate.rotateZ(ang);
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    for (const side of [-1, 1]) p.add(plate.clone(), 'darkSteel', [cx, cy, z + side * (outer ? 5 : 3.6)]);
    p.add(yToZ(cyl(3.2, 7, 8)), 'steel', [a.x, a.y, z]);
  }
  return p.g;
}
export function camSprocket(s: 1 | -1) {
  const p = new Part();
  const sh = gearShape(36, CAM_SPROCKET_R - 3.5, CAM_SPROCKET_R + 3.5, 0, true);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; sh.holes.push(circlePath(8, 34 * Math.cos(a), 34 * Math.sin(a)) as THREE.Path); }
  sh.holes.push(circlePath(12) as THREE.Path);
  p.add(extrudeC(sh, 7, 0.5), 'steel', [CAM_X * s, 0, CHAIN_Z[s]]);
  p.add(yToZ(cyl(22, 12, 32)), 'steel', [CAM_X * s, 0, CHAIN_Z[s] + 6]);
  p.add(yToZ(hexNut(27, 10)), 'darkSteel', [CAM_X * s, 0, CHAIN_Z[s] + 16]);
  return p.g;
}
/** Chain tensioner (chain adjuster #10), idler arm (#5), sprocket (#6), guide rails (#2). */
export function chainTensioner(s: 1 | -1) {
  const p = new Part();
  const z = CHAIN_Z[s];
  const { c1, c2 } = chainPath(s);
  // lower run midpoint: idler pressing upward on slack side
  const mx = (c1.x + c2.x) / 2, my = (c1.y + c2.y) / 2 - 58;
  p.add(extrudeC(gearShape(15, 20, 25, 5, true), 7), 'steel', [mx, my + 10, z]);
  const arm = polyShape([[-8, -6], [70, -2], [70, 8], [-8, 10]]);
  const ag = extrudeC(arm, 6); ag.rotateZ(s > 0 ? 0.25 : Math.PI - 0.25);
  p.add(ag, 'forgedSteel', [mx, my + 10, z - 8]);
  // hydraulic adjuster body pointing down
  p.add(cyl(14, 70, 24), 'castAlu', [mx + 50 * s, my - 30, z - 8]);
  p.add(cyl(7, 20, 16), 'steel', [mx + 50 * s, my + 12, z - 8]);
  p.add(hexNut(17, 8), 'zincPlate', [mx + 50 * s, my - 68, z - 8]);
  // guide rails (plastic) along upper run
  const d = c2.clone().sub(c1); const ang = Math.atan2(d.y, d.x);
  const rail = extrudeC(roundRect(d.length() * 0.55, 6, 3), 12);
  rail.rotateZ(ang);
  p.add(rail, 'blackPlastic', [(c1.x + c2.x) / 2 - Math.sin(ang) * 42, (c1.y + c2.y) / 2 + Math.cos(ang) * 42, z]);
  return p.g;
}
/** Chain housing (103-05 #1/#2) and its lid (#6/#7). */
function chainOutline(s: 1 | -1, grow: number) {
  const pts = hull([...circlePts(46 * s, INT_SHAFT_Y - 10, 48 + grow, 24), ...circlePts(CAM_X * s, 0, CAM_SPROCKET_R + 22 + grow, 32), ...circlePts(130 * s, -110, 22 + grow, 12)]);
  return pts;
}
export function chainHousing(s: 1 | -1) {
  const p = new Part();
  const o = chainOutline(s, 0), i = chainOutline(s, -7);
  const sh = polyShape(o); const h = new THREE.Path(); const ir = i.slice().reverse(); h.moveTo(ir[0][0], ir[0][1]); ir.slice(1).forEach(([x, y]) => h.lineTo(x, y)); h.closePath(); sh.holes.push(h);
  p.add(extrude(sh, 36, 1), 'castAlu', [0, 0, CASE_Z.pulley]);
  // back wall with shaft openings
  const bw = polyShape(o); bw.holes.push(circlePath(28, CAM_X * s, 0) as THREE.Path); bw.holes.push(circlePath(40, 46 * s, INT_SHAFT_Y - 10) as THREE.Path);
  p.add(extrude(bw, 3), 'castAlu', [0, 0, CASE_Z.pulley]);
  // flange bolts
  o.forEach(([x, y], k) => { if (k % 3 === 0) p.add(yToZ(hexNut(10, 6)), 'zincPlate', [x * 0.97, y * 0.97 + (y < 0 ? 2 : -2), CASE_Z.pulley + 37]); });
  return p.g;
}
export function chainHousingLid(s: 1 | -1) {
  const p = new Part();
  const o = chainOutline(s, 0);
  p.add(extrude(polyShape(o), 5, 1.2), 'castAlu', [0, 0, CASE_Z.pulley + 37]);
  // stiffening ribs radiating from cam boss
  p.add(yToZ(cyl(38, 10, 36)), 'castAlu', [CAM_X * s, 0, CASE_Z.pulley + 47]);
  p.add(yToZ(cyl(18, 4, 24)), 'machinedAlu', [CAM_X * s, 0, CASE_Z.pulley + 53]);
  // tensioner cover (#31 cover)
  const { c1, c2 } = chainPath(s);
  const mx = (c1.x + c2.x) / 2 + 50 * s, my = (c1.y + c2.y) / 2 - 88;
  p.add(yToZ(cyl(37, 8, 36)), 'castAlu', [mx, my, CASE_Z.pulley + 46]);
  for (const a of [0, 2.1, 4.2]) p.add(yToZ(hexNut(10, 5)), 'zincPlate', [mx + 30 * Math.cos(a), my + 30 * Math.sin(a), CASE_Z.pulley + 51]);
  const o2 = o.filter((_, k) => k % 4 === 0);
  o2.forEach(([x, y]) => p.add(yToZ(hexNut(10, 5)), 'zincPlate', [x * 0.96, y * 0.96, CASE_Z.pulley + 44]));
  return p.g;
}

/** Intermediate shaft (103-15 #43) with drive gear & double sprocket. */
export function intermediateShaft() {
  const p = new Part();
  p.add(yToZ(cyl(14, 330, 24)), "steel", [0, INT_SHAFT_Y, 80]);
  for (const z of [-60, 150]) p.add(yToZ(cyl(19, 16, 24)), "machinedAlu", [0, INT_SHAFT_Y, z]);
  p.add(extrudeC(gearShape(48, 45, 49.5, 14), 14, 0.4), 'steel', [0, INT_SHAFT_Y, 199]);
  for (const s of [1, -1] as const) {
    p.add(extrudeC(gearShape(24, INT_SPROCKET_R - 3.5, INT_SPROCKET_R + 3.5, 14, true), 7, 0.4), 'steel', [0, INT_SHAFT_Y, CHAIN_Z[s]]);
  }
  p.add(yToZ(cyl(20, 26, 24)), 'steel', [0, INT_SHAFT_Y, 229]);
  return p.g;
}
