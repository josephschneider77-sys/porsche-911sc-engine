/**
 * Bottom end + top end assets (crankcase, crank, rods, pistons, cylinders, heads, valve train, cam drive).
 * Shapes traced from the Porsche 911 1978-83 parts catalogue illustrations (groups 101-103) and scaled with
 * published / measured dimensions (see docs/engine-spec.md). All units mm.
 */
import * as THREE from 'three';
import {
  Part, V3, DEG, lathe, boxMM, cyl, cylBetween, yToZ, yToX, roundRect, circlePath, circleShape, ringShape,
  polyShape, hull, circlePts, gearShape, extrude, extrudeC, hexNut, tube, torus, spring, paramSurface, plate, gusset, csgSub, woodruffGeom,
} from './util';
import {
  SPEC, SPARK_Z, CYL_Z, MAIN_Z, THROW_DEG, DECK_X, CYL_TOP_X, HEAD_OUT_X, CAM_X, CAM_HOUSING_OUT_X, INT_SHAFT_Y, CASE_Z, NOSE_BEARING_Z,
} from '../data/layout';
import type { MatKey } from './materials';
import { HEAD_HW, CASE_TB, CASE_LUG } from './hwLayout';

/** Chain plane (centre of the duplex chain) per bank: in front of the cam-housing end (z 222), rows clear of each other. */
export const CHAIN_Z: Record<1 | -1, number> = { 1: 258, [-1]: 235 } as any;

export const CRANK_GEAR_T = 36;

export const bankZ = (s: 1 | -1) => (s === 1 ? [CYL_Z[1], CYL_Z[2], CYL_Z[3]] : [CYL_Z[4], CYL_Z[5], CYL_Z[6]]);

// ---------------------------------------------------------------- crankcase half (101-05 left / 101-10 right)
/**
 * Pressure-cast aluminium half (SC: aluminium, not magnesium). Hollow crank cavity between an upper
 * shoulder and a lower sump wall, closed on the cylinder side by a deck with three spigot bores.
 * Eight saddles (mains 1-7 in the bay + nose bearing 8 in the chain well): each is a web with a
 * machined half-bore, two stud pads and an intermediate-shaft bore. Exterior is the sculpted casting
 * (ribs, gussets, through-bolt bosses, oil-gallery plugs, number pad), not a constant-section slab.
 * Chain well stays at the pulley end, where the cam drive actually runs.
 */
const CASE_UPPER: [number, number][] = [
  [0, 80], [28, 82], [56, 90], [78, 100], [90, 112], [72, 120], [36, 122], [12, 118], [0, 114],
];
const CASE_LOWER: [number, number][] = [
  [0, -56], [0, -120], [14, -128], [40, -126], [70, -118], [90, -104], [84, -90], [60, -74], [32, -62],
];
/** Saddle web: bridges the open bay, half-bore on the split, window in the rod bay. */
const CASE_WEB: [number, number][] = [
  [0, 100], [22, 104], [50, 92], [76, 74], [88, 52], [88, -48], [74, -68], [50, -90], [26, -110], [8, -118], [0, -114],
];
export function crankcaseHalf(s: 1 | -1) {
  const p = new Part();
  const z0 = CASE_Z.flywheel, z1 = CASE_Z.pulley;
  const X = (x: number) => x * s;
  const cwHole = s > 0;
  const disk = (r: number, x: number, y: number) => {
    const h = new THREE.Path(); h.absarc(x * s, y, r, 0, Math.PI * 2, cwHole); return h;
  };
  const notch = (x0: number, y0: number, x1: number, y1: number) => {
    const h = new THREE.Path();
    const a: [number, number][] = [[x0 * s, y0], [x0 * s, y1], [x1 * s, y1], [x1 * s, y0]];
    const q = cwHole ? a : a.slice().reverse();
    h.moveTo(q[0][0], q[0][1]); q.slice(1).forEach(([x, y]) => h.lineTo(x, y)); h.closePath(); return h;
  };
  const addProfile = (pts: [number, number][], zA: number, zB: number, mat: MatKey, holes: THREE.Path[] = []) => {
    if (zB - zA < 0.4) return;
    const m = pts.map(([x, y]) => [x * s, y] as [number, number]);
    const sh = polyShape(s > 0 ? m : m.slice().reverse());
    for (const h of holes) sh.holes.push(h);
    const g = extrude(sh, zB - zA, 0, 8); g.translate(0, 0, zA); p.add(g, mat);
  };
  // upper shoulder + lower sump wall: the bay between them (roughly |y| < 70) is the open crank cavity
  const intHole = disk(16, 0, INT_SHAFT_Y);
  addProfile(CASE_UPPER, z0, z1, 'castAlu');
  addProfile(CASE_LOWER, z0, z1, 'castAlu', [intHole]);
  // bright machined split-flange lips (perimeter only — the cavity stays open)
  addProfile([[0, 104], [16, 112], [16, 122], [0, 116]], z0, z1, 'machinedAlu');
  addProfile([[0, -118], [16, -128], [16, -108], [0, -100]], z0, z1, 'machinedAlu');
  // metal between the spigots, inboard of the deck, clear of each piston skirt
  const cyls = bankZ(s).slice().sort((a, b) => a - b);
  const bridges: [number, number][] = [[z0 + 4, cyls[0] - 52], [cyls[0] + 52, cyls[1] - 52], [cyls[1] + 52, cyls[2] - 52], [cyls[2] + 52, z1 - 4]];
  for (const [za, zb] of bridges) addProfile(
    [[46, -70], [90, -70], [90, 74], [46, 74]], za, zb, 'castAlu',
  );
  // mains 1-7: saddle web, machined half-bore, locating notch, two stud pads
  const SADDLE_R = 33.2;
  for (const z of MAIN_Z) {
    addProfile(CASE_WEB, z - 8, z + 8, 'castAlu', [
      disk(SADDLE_R, 0, 0), disk(16, 0, INT_SHAFT_Y), disk(15, 60, 16),
      notch(0, 30.5, 7, 40),
    ]);
    const seat = yToZ(lathe([[SADDLE_R - 0.4, -7.2], [SADDLE_R + 2.4, -7.2], [SADDLE_R + 2.4, 7.2], [SADDLE_R - 0.4, 7.2]], 36, s > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI));
    p.add(seat, 'machinedAlu', [0, 0, z]);
    const iSeat = yToZ(lathe([[13.6, -8], [17.2, -8], [17.2, 8], [13.6, 8]], 28, s > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI));
    p.add(iSeat, 'machinedAlu', [0, INT_SHAFT_Y, z]);
    for (const y of [46, -46]) {
      p.add(boxMM([s > 0 ? 0 : -4, y - 7.5, z - 8], [s > 0 ? 4 : 0, y + 7.5, z + 8]), 'machinedAlu');
      p.add(yToX(cyl(4.2, 3.4, 14)), 'bore', [X(1.8), y, z]);
    }
  }
  // flywheel-end bulkhead (rear main + int-shaft bore) and pulley-end bulkhead (nose passes through)
  const endOutline: [number, number][] = [
    [0, 114], [14, 120], [40, 122], [74, 116], [90, 100], [90, -96], [70, -116], [36, -126], [12, -128], [0, -120],
  ];
  addProfile(endOutline, z0, z0 + 9, 'castAlu', [disk(46, 0, 0), disk(20, 0, INT_SHAFT_Y)]);
  addProfile(endOutline, z1 - 8, z1, 'machinedAlu', [disk(40, 0, 0), disk(22, 0, INT_SHAFT_Y)]);
  // deck: YZ plate with three through-bores, outer face on the cylinder register
  {
    const y0 = -84, y1 = 84, za = z0 + 8, zb = z1 - 6, thick = DECK_X - 88;
    const corners: [number, number][] = [[-zb, y0], [-za, y0], [-za, y1], [-zb, y1]];
    const sh = polyShape(corners);
    for (const zc of cyls) sh.holes.push(circlePath(48, -zc, 0) as THREE.Path);
    const g = extrude(sh, thick, 0, 16); g.rotateY(Math.PI / 2);
    g.translate(s > 0 ? 88 : -(88 + thick), 0, 0);
    p.add(g, 'castAlu');
  }
  // cylinder spigots (bright machined rings) + 4 raised head-stud bosses + Dilavar studs
  for (const zc of cyls) {
    const ring = yToX(lathe([[48.2, 0], [62, 0], [62, 5.5], [56, 7.5], [48.2, 7.5]], 48));
    if (s < 0) ring.rotateZ(Math.PI);
    p.add(ring, 'machinedAlu', [(DECK_X - 6) * s, 0, zc]);
    for (const a of [45, 135, 225, 315]) {
      const y = 57 * Math.sin(a * DEG), z = 57 * Math.cos(a * DEG);
      p.add(yToX(cyl(8.2, 7, 16)), 'castAlu', [(DECK_X - 2) * s, y, zc + z]);
      p.add(yToX(cyl(7.2, 1.2, 16)), 'machinedAlu', [(DECK_X + 1.2) * s, y, zc + z]);
      p.add(cylBetween([(DECK_X - 2) * s, y, zc + z], [(HEAD_OUT_X - 4) * s, y, zc + z], 4.6, 10), 'zincPlate');
    }
  }
  // through-bolt bosses: wider cast root, machined seat face exactly at |x| = CASE_TB.x
  for (const z of CASE_TB.z) for (const y of CASE_TB.y) {
    p.add(yToX(cyl(16, 12, 20)), 'castAlu', [X(94), y, z]);
    p.add(yToX(cyl(CASE_TB.r, CASE_TB.x - 95, 24)), 'castAlu', [X((CASE_TB.x + 94) / 2 - 0.5), y, z]);
    p.add(yToX(cyl(CASE_TB.r, 1, 24)), 'machinedAlu', [X(CASE_TB.x - 0.5), y, z]);
  }
  // gussets from the deck band up to the flange, and transverse ribs along the shoulders
  const mids = [cyls[0] - 59, (cyls[0] + cyls[1]) / 2, (cyls[1] + cyls[2]) / 2, cyls[2] + 59];
  for (const zm of mids) {
    if (zm < z0 + 8 || zm > z1 - 8) continue;
    p.add(gusset([X(96), 68], [X(96), 108], [X(28), 116], 6, zm), 'castAlu');
    p.add(gusset([X(96), -70], [X(96), -112], [X(32), -122], 6, zm), 'castAlu');
  }
  for (let z = z0 + 18; z < z1 - 12; z += 36) {
    p.add(boxMM([s > 0 ? 70 : -92, 108, z - 2.2], [s > 0 ? 92 : -70, 116, z + 2.2]), 'castAlu');
    p.add(boxMM([s > 0 ? 72 : -94, -116, z - 2.2], [s > 0 ? 94 : -72, -106, z + 2.2]), 'castAlu');
  }
  // split-flange lugs: studs in the right half, lock-nut face on the left half at |x| = CASE_LUG.x
  for (const [y, zs, y0] of [[CASE_LUG.yTop, CASE_LUG.top, 115], [CASE_LUG.yBot, CASE_LUG.bottom, -126]] as const) for (const z of zs) {
    p.add(yToX(cyl(CASE_LUG.r, CASE_LUG.x, 16)), 'castAlu', [X(CASE_LUG.x / 2), y, z]);
    p.add(boxMM([s > 0 ? 0 : -CASE_LUG.x, Math.min(y, y0), z - CASE_LUG.r], [s > 0 ? CASE_LUG.x : 0, Math.max(y, y0), z + CASE_LUG.r]), 'castAlu');
  }
  // external oil gallery along the lower flank, with hex plugs in raised bosses
  p.add(yToZ(cyl(7.5, z1 - z0 - 36, 14)), 'castAlu', [X(90), -100, (z0 + z1) / 2]);
  for (const z of [-168, -130, 96, 150, 188]) {
    p.add(yToX(cyl(9, 14, 14)), 'castAlu', [X(84), -100, z]);
    p.add(yToX(hexNut(13, 6)), 'darkSteel', [X(96), -100, z]);
    p.add(yToX(cyl(3.2, 2, 10)), 'bore', [X(99.5), -100, z]);
  }
  // flywheel-end bell: rear-main seal boss, radial ribs, gearbox studs
  const bell = yToZ(new THREE.CylinderGeometry(62, 62, 16, 40, 1, true, s > 0 ? 0 : Math.PI, Math.PI));
  p.add(bell, 'castAlu', [0, 0, z0 - 8]);
  p.add(yToZ(lathe([[48, -1.2], [62, -1.2], [62, 1.2], [48, 1.2]], 40, s > 0 ? 0 : Math.PI, Math.PI)), 'machinedAlu', [0, 0, z0 - 16]);
  for (let a = -80; a <= 80; a += 20) {
    const ar = (s > 0 ? a : 180 - a) * DEG;
    const rib = boxMM([58, -3, -14], [100, 3, 2]); rib.rotateZ(ar);
    p.add(rib, 'castAlu', [0, 0, z0]);
  }
  for (const [x, y] of [[88, 70], [92, -66], [40, -118], [44, 104]] as const) {
    p.add(yToZ(cyl(9, 12, 16)), 'castAlu', [X(x), y, z0 - 6]);
    p.add(yToZ(cyl(5, 26, 8)), 'zincPlate', [X(x), y, z0 - 13]);
  }
  // pulley-end chain well: hollow pocket in front of the case face, open sideways into the chain box at |x| = 118.
  // Bearing 8 saddle (nose) lives in this pocket. Front plate is flush with the chain-box covers.
  const W = chainWellProfile(s);
  const top: [number, number][] = [[X(CHAIN_BOX_INNER_X), W.yTop], [X(60), 44], [X(0.5), 50]];
  const bot: [number, number][] = [[X(0.5), -138], [X(70), -140], [X(CHAIN_BOX_INNER_X), W.yBot]];
  const strip = (pts: [number, number][]) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1]; const l = Math.hypot(bx - ax, by - ay);
      const g = boxMM([-l / 2 - 0.5, 0, z1], [l / 2 + 0.5, 5, W.z1 - 6]);
      g.rotateZ(Math.atan2(by - ay, bx - ax)); g.translate((ax + bx) / 2, (ay + by) / 2, 0); p.add(g, 'castAlu');
    }
  };
  strip(s > 0 ? top : top.slice().reverse());
  strip(s > 0 ? bot : bot.slice().reverse());
  const plate = polyShape(s > 0 ? [...bot, ...top] : [...bot, ...top].reverse());
  plate.holes.push(circlePath(29, 0, 0) as THREE.Path);
  p.add(extrude(plate, 6, 0, 8), 'castAlu', [0, 0, W.z1 - 6]);
  // nose saddle (bearing 8): machined half-bore + two stud pads, inside the chain-well pocket
  const noseZ = 236;
  p.add(yToZ(lathe([[29, 0], [42, 0], [42, W.z1 - 6 - 220], [29, W.z1 - 6 - 220]], 32, s > 0 ? 0 : Math.PI, Math.PI)), 'castAlu', [0, 0, 220]);
  p.add(yToZ(lathe([[26.2, -8], [32, -8], [32, 8], [26.2, 8]], 32, s > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI)), 'machinedAlu', [0, 0, noseZ]);
  for (const y of [40, -40]) {
    p.add(boxMM([s > 0 ? 0 : -4, y - 6, noseZ - 7], [s > 0 ? 4 : 0, y + 6, noseZ + 7]), 'machinedAlu');
    p.add(yToX(cyl(3.6, 3.2, 12)), 'bore', [X(1.6), y, noseZ]);
  }
  for (const q of chainHousingStuds(s)) p.add(yToX(cyl(7.5, CHAIN_BOX_INNER_X - 104, 14)), 'castAlu', [X((CHAIN_BOX_INNER_X + 104) / 2), q.y, q.z]);
  if (s > 0) {
    // raised part-number pad + bosses for the oil pressure transmitter, warning switch and connection piece
    // (101-10 #43-#50: small-part sets seat on the boss tops)
    p.add(boxMM([58, 104, 102], [92, 112, 168]), 'castAlu');
    p.add(boxMM([62, 111, 110], [88, 113.5, 160]), 'machinedAlu');
    for (const [bx, bz] of [[40, 150], [64, 120], [64, 160]]) p.add(cyl(11, 10, 16), 'castAlu', [bx, 118, bz]);
    // spot-faced pads for the odd 101-10 #11 bolt and #20/#21 stud nut (E positions)
    for (const bz of [-95, 55]) p.add(cyl(10, 12, 20), 'castAlu', [30, 119, bz]);
    // oil-thermostat pad under the right half (flange face y -128, 3 studs)
    p.add(cyl(30, 12, 32), 'castAlu', [58, -122, 118]);
  } else {
    p.add(boxMM([-76, 108, 120], [-30, 122, 185]), 'castAlu');
    // spot-faced pad under the left half for the 101-05 #22/#23 M10 stud nut (E position)
    p.add(cyl(10, 8, 20), 'castAlu', [-40, -127, -186]);
  }
  // round sump boss (strainer cover seats here)
  p.add(yToZ(lathe([[0.1, -2], [84, -2], [84, 2], [0.1, 2]], 48, s > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI)).rotateX(Math.PI / 2), 'castAlu', [0, -126, -10]);
  return p.g;
}

// ---------------------------------------------------------------- main bearing shells (102-00 #21-24)
/** Steel-backed half shells (mains 1-7) with a locating tab, plus the one-piece nose bushing (No. 8). Bearing 1 is thrust. */
export function mainBearings() {
  const p = new Part();
  const Ri = SPEC.mainJournalD / 2 + 0.25, Ro = Ri + 2.35;
  const shell = (side: 1 | -1, z: number, thrust: boolean) => {
    const phi0 = side > 0 ? -Math.PI / 2 + 0.035 : Math.PI / 2 + 0.035;
    const arc = Math.PI - 0.07;
    p.add(yToZ(lathe([[Ri, -7.4], [Ri + 0.7, -7.4], [Ro, -6.2], [Ro, 6.2], [Ri + 0.7, 7.4], [Ri, 7.4]], 32, phi0, arc)), 'steel', [0, 0, z]);
    // locating tab on the upper parting line, staggered so the two halves don't occupy the same notch
    const tz = z + side * 3.1;
    p.add(boxMM([side > 0 ? 0.5 : -2.4, Ro - 0.2, tz - 2.3], [side > 0 ? 2.4 : -0.5, Ro + 3.6, tz + 2.3]), 'steel');
    if (thrust) for (const dz of [-1, 1]) p.add(yToZ(lathe(
      [[Ri + 0.3, dz * 7.2], [Ro + 3.4, dz * 7.2], [Ro + 3.4, dz * 9.1], [Ri + 0.3, dz * 9.1]], 28, phi0, arc,
    )), 'steel', [0, 0, z]);
  };
  MAIN_Z.forEach((z, i) => { shell(1, z, i === 0); shell(-1, z, i === 0); });
  p.add(yToZ(lathe([[24.6, -12], [28.4, -12], [28.4, 12], [24.6, 12]], 32)), 'steel', [0, 0, NOSE_BEARING_Z]);
  p.add(yToZ(lathe([[25.4, -1.1], [27.6, -1.1], [27.6, 1.1], [25.4, 1.1]], 24)), 'darkSteel', [0, 0, NOSE_BEARING_Z]);
  return p.g;
}

// ---------------------------------------------------------------- crankshaft (102-00 #1)
/** Crank nose (pulley end): timing gear #8 on Woodruff key #7, intermediate ring #9, distributor drive wheel #10, circlip #11. */
export const CRANK_NOSE = { seatR: 28, key: { D: 19, h: 7.5, b: 5, proud: 2.6, z: 199 }, gear: [192, 206] as [number, number], ring: [206, 211] as [number, number], drive: [211, 223] as [number, number], groove: [223.2, 224.9] as [number, number], pinR: 19 };
export function crankshaft() {
  const p = new Part();
  const rMain = SPEC.mainJournalD / 2, rPin = SPEC.rodJournalD / 2, r = SPEC.crankRadius;
  const mainW = 18, pinW = 21;
  for (const z of MAIN_Z) {
    p.add(yToZ(lathe([[rMain - 3, -mainW / 2], [rMain, -mainW / 2 + 1.5], [rMain, mainW / 2 - 1.5], [rMain - 3, mainW / 2]], 48)), 'polishedSteel', [0, 0, z]);
    p.add(yToX(cyl(3, 0.6, 10)), 'bore', [rMain + 0.05, 0, z]); // oil hole
  }
  const throws = Object.entries(CYL_Z).map(([c, z]) => ({ c: +c, z, a: THROW_DEG[+c] * DEG }));
  for (const t of throws) {
    const px = r * Math.cos(t.a), py = r * Math.sin(t.a);
    p.add(yToZ(lathe([[rPin - 2, -pinW / 2], [rPin, -pinW / 2 + 1.5], [rPin, pinW / 2 - 1.5], [rPin - 2, pinW / 2]], 44)), 'polishedSteel', [px, py, t.z]);
    p.add(yToX(cyl(2.6, 0.6, 10)).rotateZ(t.a), 'bore', [px + (rPin + 0.05) * Math.cos(t.a), py + (rPin + 0.05) * Math.sin(t.a), t.z]);
    // webs either side: hull of main boss + pin boss (the 930/03 crank is not counterweighted)
    for (const side of [-1, 1]) {
      const zw = t.z + side * (pinW / 2 + 5);
      // 911 webs are nearly round "discs" enclosing main + pin, with a short tail opposite the throw
      const ux = Math.cos(t.a), uy = Math.sin(t.a);
      const pts = hull([...circlePts(0, 0, rMain + 9, 32), ...circlePts(px, py, rPin + 10, 32), ...circlePts(-ux * 18, -uy * 18, rMain - 2, 24)]);
      const sh = polyShape(pts);
      p.add(extrudeC(sh, 10, 1.6, 8), 'forgedDark', [0, 0, zw]);
      p.add(yToZ(cyl(4, 10.4, 10)), 'bore', [px * 0.4, py * 0.4, zw]); // oil drilling plug
    }
  }
  // flywheel flange with 9 bolt holes (102-00 #6 pan-head screws x9)
  const fl = circleShape(52);
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; fl.holes.push(circlePath(4.2, 36 * Math.cos(a), 36 * Math.sin(a)) as THREE.Path); } // tapped M10x1
  fl.holes.push(circlePath(10) as THREE.Path);
  p.add(extrude(fl, 12, 1), 'forgedDark', [0, 0, CASE_Z.flywheel - 8]);
  p.add(yToZ(cyl(rMain, 24, 32)), 'polishedSteel', [0, 0, -196]);
  // nose: timing gear seat, distributor drive seat, bearing 8 journal, pulley snout
  const nose = yToZ(lathe([[rMain, 186], [CRANK_NOSE.seatR, 186], [CRANK_NOSE.seatR, CRANK_NOSE.groove[0]], [CRANK_NOSE.seatR - 1.2, CRANK_NOSE.groove[0]], [CRANK_NOSE.seatR - 1.2, CRANK_NOSE.groove[1]],
    [CRANK_NOSE.seatR, CRANK_NOSE.groove[1]], [CRANK_NOSE.seatR, 228], [27, 228], [27, 256], [20, 256], [20, 318], [8, 320]], 48));
  const K = CRANK_NOSE.key;
  const pocket = woodruffGeom(K.D + 0.1, K.h + 0.05, K.b + 0.1).rotateY(-Math.PI / 2).translate(0, CRANK_NOSE.seatR + K.proud, K.z);
  p.add(csgSub(nose, pocket), 'polishedSteel');
  p.add(extrude(ringShape(8.5, 5), 4, 0, 24), 'polishedSteel', [0, 0, 316]); // nose end with the tapped M12x1.5 pulley-bolt hole
  return p.g;
}

/** Crank timing gear (102-00 #8) + distributor drive wheel (102-00 #10). */
export function crankGears() {
  const p = new Part();
  const N = CRANK_NOSE, kb = N.key.b / 2 + 0.05;
  const keyedBore = () => { const h = new THREE.Path(); const a = Math.asin(kb / (N.seatR + 0.05)); h.absarc(0, 0, N.seatR + 0.05, Math.PI / 2 + a, Math.PI / 2 - a + 2 * Math.PI, false); h.lineTo(kb, N.seatR + N.key.proud + 0.4); h.lineTo(-kb, N.seatR + N.key.proud + 0.4); h.closePath(); return h; };
  const tg = gearShape(CRANK_GEAR_T, 34.5, 38.5, 0); tg.holes.push(keyedBore()); // 36 T, m 2 (meshes the 48 T int. gear at 84 mm)
  p.add(extrude(tg, N.gear[1] - N.gear[0], 0.4), 'steel', [0, 0, N.gear[0]]);
  // helical-looking distributor drive wheel (keyed on the same key line, E): stacked twisted slices
  const dz = (N.drive[1] - N.drive[0]) / 4;
  for (let i = 0; i < 4; i++) {
    const g = gearShape(26, 32, 35.5, 0); g.holes.push(circlePath(N.seatR + 0.05) as THREE.Path);
    p.add(extrude(g, dz).rotateZ(i * 2.2 * DEG), 'bronze', [0, 0, N.drive[0] + i * dz]);
  }
  return p.g;
}

// ---------------------------------------------------------------- connecting rod (102-00 #16), local: big end at 0, small end +X
/** Forged H/I-section rod: big end with blended shoulders, bolted cap with 2 bolts + nuts, tapered beam, bronze bush. */
export function conrod() {
  const p = new Part();
  const L = SPEC.rodLength, t = 21;
  const ri = SPEC.rodJournalD / 2 + 2;
  // rod-side big end: hull of the eye + bolt bosses + beam root, minus the journal half
  const rodSide = hull([...circlePts(0, 0, 40, 40).filter(([x]) => x >= -0.5), ...circlePts(4, 34, 9, 12), ...circlePts(4, -34, 9, 12), [44, 18], [44, -18]]);
  const outline = rodSide.map(([x, y]) => [Math.max(x, 0), y] as [number, number]).sort((a, b) => Math.atan2(a[1], a[0] - 10) - Math.atan2(b[1], b[0] - 10));
  const shp = new THREE.Shape();
  // start at (0,-40) go around the right side to (0,40), then back down along the journal arc
  const right = outline.filter(([x]) => x > 0.2);
  shp.moveTo(0, -40.5);
  for (const [x, y] of right) shp.lineTo(x, y);
  shp.lineTo(0, 40.5); shp.lineTo(0, ri);
  shp.absarc(0, 0, ri, Math.PI / 2, -Math.PI / 2, true);
  shp.lineTo(0, -40.5);
  p.add(extrudeC(shp, t, 0.8, 24), 'forgedDark');
  // cap
  const cap = new THREE.Shape(); cap.moveTo(0, -42); cap.lineTo(-6, -42); cap.absarc(-2, 0, 41, -Math.PI / 2 - 0.15, -1.5 * Math.PI + 0.15, true);
  cap.lineTo(-6, 42); cap.lineTo(0, 42); cap.lineTo(0, ri); cap.absarc(0, 0, ri, Math.PI / 2, 1.5 * Math.PI, false); cap.lineTo(0, -42);
  p.add(extrudeC(cap, t, 0.8, 24), 'forgedDark', [-0.6, 0, 0]);
  // bolts & nuts (#18/#19)
  for (const y of [-34, 34]) {
    p.add(yToX(cyl(4.5, 52, 12)), 'steel', [0, y, 0]);
    p.add(yToX(cyl(8, 6, 6)), 'darkSteel', [24, y, 0]);
    p.add(yToX(hexNut(13, 9)), 'darkSteel', [-26, y, 0]);
  }
  // I-beam: web + flanges, tapering toward the small end
  const x0 = 38, x1 = L - 15;
  p.add(extrudeC(polyShape([[x0, -18], [x1, -9.5], [x1, 9.5], [x0, 18]]), 6.5), 'forgedDark');
  for (const sgn of [-1, 1]) {
    p.add(extrudeC(polyShape(sgn > 0 ? [[x0 - 4, 13], [x1, 5.5], [x1, 10.5], [x0 - 4, 20]] : [[x0 - 4, -20], [x1, -10.5], [x1, -5.5], [x0 - 4, -13]]), t - 3, 0.7), 'forgedDark');
  }
  // small end with bronze bush (#17)
  p.add(extrudeC(ringShape(17.5, 12), t - 3, 0.6), 'forgedDark', [L, 0, 0]);
  p.add(extrudeC(polyShape([[L - 22, -11], [L - 8, -15], [L - 8, 15], [L - 22, 11]]), t - 3, 0.5), 'forgedDark');
  p.add(extrudeC(ringShape(12, 11), t - 1), 'bronze', [L, 0, 0]);
  p.add(yToZ(cyl(1.8, 30, 8)).rotateZ(Math.PI / 2), 'darkSteel', [L + 12, 0, 0]); // oil hole hint
  // rod bearing shells (#20)
  for (const ph of [0.02, Math.PI + 0.02]) p.add(yToZ(lathe([[SPEC.rodJournalD / 2, -9], [SPEC.rodJournalD / 2 + 2, -9], [SPEC.rodJournalD / 2 + 2, 9], [SPEC.rodJournalD / 2, 9]], 16, ph, Math.PI - 0.04)), 'bronze');
  return p.g;
}

// ---------------------------------------------------------------- piston (102-05), local: pin axis along Z at origin, crown toward +X
/**
 * Mahle forged dome piston (8.5:1): pent-roof dome with two big valve "eyebrow" reliefs, three ring grooves,
 * squish band, slab-recessed skirt around the pin bosses, floating pin + circlips. Built from a ring-belt lathe,
 * a parametric skirt (recessed at the pin axis) and a height-field dome.
 */
export function piston() {
  const p = new Part();
  const R = SPEC.bore / 2 - 0.1, top = SPEC.compressionHeight;
  // ring belt + squish band (lathe, Y->X)
  const prof: [number, number][] = [
    [R - 0.3, 10], [R - 0.2, 14], [R - 3, 14], [R - 3, 16.5], [R - 0.1, 16.5],
    [R - 0.1, 21], [R - 3, 21], [R - 3, 23], [R, 23],
    [R, 27], [R - 3, 27], [R - 3, 29], [R, 29],
    [R, top - 1], [R - 1, top], [R - 7.5, top + 0.6],
  ];
  p.add(yToX(lathe(prof, 72)), 'machinedAlu');
  // skirt: radius drops at the pin axis (+-Z) to expose the bosses, like the real slipper-style skirt
  const skirt = paramSurface((u, v) => {
    const a = u * Math.PI * 2, x = -44 + v * 54;
    const pinness = Math.abs(Math.sin(a));
    const inRecess = x > -30 && x < 6 ? Math.min(1, Math.min(x + 30, 6 - x) / 4) : 0;
    const r = R - 0.4 - 4.5 * inRecess * Math.max(0, (pinness - 0.72) / 0.28);
    return [x, r * Math.cos(a), r * Math.sin(a)];
  }, 96, 24, true);
  p.add(skirt, 'machinedAlu');
  p.add(yToX(lathe([[R - 5, -44], [R - 0.4, -44]], 64)), 'machinedAlu');
  // dome height-field with two valve reliefs
  const rd = R - 7.5;
  const domeH = (r: number) => { const t = r / rd; return top + 0.6 + 11.4 * Math.pow(Math.max(0, 1 - t * t), 0.85); };
  const reliefs = [{ y: 23, r: 23, h: top + 6.2 }, { y: -24, r: 20, h: top + 5.2 }];
  const wall = (d: number, rl: { r: number; h: number }) => rl.h + Math.max(0, d - rl.r + 2.5) * 3.2;
  const dome = paramSurface((u, v) => {
    const a = u * Math.PI * 2, r = v * rd;
    const y = r * Math.cos(a), z = r * Math.sin(a);
    // pent-roof: dome is lower along the pin axis
    let x = domeH(r) - 2.2 * Math.pow(Math.abs(z) / rd, 2);
    for (const rl of reliefs) x = Math.min(x, wall(Math.hypot(y - rl.y, z), rl));
    return [x, y, z];
  }, 144, 44, true);
  p.add(dome, 'machinedAlu');
  // underside
  p.add(yToX(lathe([[0.1, top - 6], [R - 6, top - 7], [R - 5, -44]], 48)), 'castAlu');
  // pin bosses and pin (#3) + circlips (#4)
  for (const z of [-1, 1]) {
    p.add(yToZ(lathe([[11.2, -5], [16, -5], [17, 0], [16, 5], [11.2, 5]], 24)), 'machinedAlu', [0, 0, z * (R - 9)]);
    p.add(torus(11.2, 0.9, 6, 24), 'steel', [0, 0, z * (R - 7)]);
  }
  p.add(yToZ(lathe([[7, -R + 7.5], [11, -R + 7.5], [11, R - 7.5], [7, R - 7.5]], 24)), 'polishedSteel');
  // rings (#2)
  for (const x of [15.2, 22, 28]) p.add(yToX(lathe([[R - 2.8, -0.8], [R + 0.05, -0.8], [R + 0.05, 0.8], [R - 2.8, 0.8]], 72)), 'darkSteel', [x, 0, 0]);
  return p.g;
}

// ---------------------------------------------------------------- cylinder (102-05 #1), local: base on case deck at x=0, axis +X
/**
 * Mahle Nikasil barrel as photographed (see photo-ref/cylinder): a bare round spigot + skirt at the case end, then a
 * stack of ~16 rounded-SQUARE fins (not round) with the four head-stud notches at the corners, satin-black painted,
 * and a machined round sealing spigot on top.
 */
export const CYL_FIN = { z: 57, y: 60, r: 15, pitch: 4.9, t: 2.1, x0: 17, studR: 57 };
export function cylinder() {
  const p = new Part();
  const H = CYL_TOP_X - DECK_X; // 98
  const rb = SPEC.bore / 2;
  // machined base spigot, seating flange, bare skirt, finned core wall, top spigot (one lathe)
  const prof: [number, number][] = [[rb, -14], [rb + 4, -14], [rb + 4, -1], [55.5, -1], [56, 0], [56, 2.5], [54, 3.5], [53.5, 12], [52, 15],
    [52, H - 6], [52.5, H - 6], [52.5, H - 4.5], [51, H - 4], [51, H - 0.6], [50.4, H], [rb, H]];
  p.add(yToX(lathe(prof, 64)), 'machinedAlu');
  p.add(yToX(lathe([[rb - 0.01, -14], [rb - 0.01, H]], 64)), 'bore');
  const s45 = CYL_FIN.studR * Math.SQRT1_2;
  const studHoles: [number, number, number][] = [[s45, s45, 6.5], [-s45, s45, 6.5], [s45, -s45, 6.5], [-s45, -s45, 6.5]];
  let k = 0;
  for (let x = CYL_FIN.x0; x < H - 7; x += CYL_FIN.pitch, k++) {
    // fins grow very slightly toward the head (hotter end) like the real casting
    const grow = Math.min(1, (x - CYL_FIN.x0) / 30) * 1.5;
    const g = plate(2 * CYL_FIN.z, 2 * CYL_FIN.y + grow, CYL_FIN.r, CYL_FIN.t, [...studHoles, [0, 0, 51.5]], 0.35);
    g.rotateY(Math.PI / 2);
    p.add(g, 'finBlack', [x, 0, 0]);
  }
  // fin root web between plates (painted)
  p.add(yToX(cyl(52.4, H - 7 - CYL_FIN.x0 + 1, 48)), 'finBlack', [(CYL_FIN.x0 + H - 7) / 2, 0, 0]);
  // base gasket (#5)
  p.add(yToX(lathe([[rb + 4, -0.3], [55.5, -0.3], [55.5, 0], [rb + 4, 0]], 48)), 'gasket');
  return p.g;
}

// ---------------------------------------------------------------- cylinder head (103-00), local: combustion face at x=0, outer +X
/**
 * Single-cylinder head: finned body (fins stacked along the cylinder axis, like the barrel), a machined spigot that
 * drops into the barrel, a hemispherical chamber, intake port up / exhaust port down with 2-stud flanges, spark-plug
 * boss on the exhaust side, and the cam-housing face with the two valve-spring wells and four studs.
 */
export const HEAD_W = HEAD_OUT_X - CYL_TOP_X; // 61
export function cylinderHead() {
  const p = new Part();
  const W = HEAD_W;
  // spigot into the barrel + chamber
  p.add(yToX(lathe([[40, 0], [49.5, 0], [50.2, 1], [50.2, 5], [53, 6]], 48)), 'machinedAlu');
  p.add(yToX(lathe([[0.1, 9], [18, 8.2], [32, 5.6], [42, 2.4], [46, 0.2], [40, 0]], 48)), 'castAlu');
  // core casting + barrel-nut bosses on the four head studs (nut seat at x = HEAD_HW.barrel.x)
  p.add(boxMM([5, -50, -42], [W - 16, 52, 42]), 'castAlu');
  const r45b = HEAD_HW.barrel.r * Math.SQRT1_2;
  for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) p.add(yToX(cyl(11.5, 10, 20)), 'castAlu', [HEAD_HW.barrel.x - 5, a * r45b, b * r45b]);
  // fins normal to the cylinder axis, rounded-square like the barrel, slightly larger
  const s45 = CYL_FIN.studR * Math.SQRT1_2;
  for (let x = 7, i = 0; x < 44; x += 4.6, i++) {
    const g = plate(114, 126 - i * 1.5, 16, 2, [[s45, s45, 6], [-s45, s45, 6], [s45, -s45, 6], [-s45, -s45, 6]], 0.3);
    g.rotateY(Math.PI / 2);
    p.add(g, 'castAlu', [x, 0, 0]);
  }
  // cam-side "rocker box" face with two spring wells
  // face block with counterbores over the barrel nuts (socket access from the cam-housing side)
  const face = roundRect(108, 124, 10);
  for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) face.holes.push(circlePath(11.5, a * r45b, b * r45b) as THREE.Path);
  const wellI: [number, number] = [0, 38], wellE: [number, number] = [0, -38];
  face.holes.push(circlePath(17.5, wellI[0], wellI[1]) as THREE.Path, circlePath(16.5, wellE[0], wellE[1]) as THREE.Path);
  const fg = extrudeC(face, 14, 0.8, 16); fg.rotateY(Math.PI / 2);
  p.add(fg, 'castAlu', [W - 8, 0, 0]);
  for (const [y, r] of [[38, 17.4], [-38, 16.4]]) p.add(yToX(cyl(r, 1, 32)), 'bore', [W - 15.5, y, 0]);
  // intake port (top) with flange & 2 studs
  const ip = roundRect(46, 76, 12);
  ip.holes.push(circlePath(17.5) as THREE.Path);
  const ipg = extrudeC(ip, 10); ipg.rotateX(Math.PI / 2);
  p.add(ipg, 'castAlu', [26, 60, 0]);
  p.add(cylBetween([26, 44, 0], [26, 56, 0], 22, 24), 'castAlu');
  p.add(yToZ(cyl(17.4, 1, 32)).rotateX(Math.PI / 2), 'bore', [26, 63, 0]);
  // exhaust port (bottom) flange & studs
  const ep = roundRect(44, 78, 8); ep.holes.push(circlePath(15.5) as THREE.Path);
  const epg = extrudeC(ep, 11.5); epg.rotateX(Math.PI / 2);
  p.add(epg, 'castAlu', [34, -57.75, 0]); // flange face y -63.5
  p.add(cylBetween([34, -44, 0], [34, -54, 0], 20, 24), 'castAlu');
  p.add(yToZ(cyl(15.4, 1, 32)).rotateX(Math.PI / 2), 'bore', [34, -62.6, 0]);
  // spark plug boss (lower side, angled outward)
  const sp = cyl(11, 26, 20); sp.rotateZ(-20 * DEG);
  p.add(sp, 'castAlu', [16, -50, SPARK_Z]);
  p.add(yToZ(cyl(7, 1, 16)).rotateX(Math.PI / 2).rotateZ(-20 * DEG), 'bore', [12, -62, SPARK_Z]);
  // cam-housing studs (103-00 #7) are added with the hardware (fasteners.ts, HEAD_HW.camStud)
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
    // seat ring #3/#4 (in the head), guide #2, stem seal #18, spring shim #11, spring seat ring #12, double springs #13,
    // retainer (concave washer) #14, two collet halves #15
    v.add(lathe([[dia / 2 - 2.5, 0.4], [dia / 2 + 3.5, 0.4], [dia / 2 + 3.5, 6.5], [dia / 2 - 1, 6.5]], 32), 'darkSteel');
    v.add(lathe([[4.6, L - 92], [7.2, L - 92], [7.2, L - 60], [4.6, L - 60]], 16), 'bronze');
    v.add(lathe([[4.6, L - 60], [7.6, L - 60], [7.6, L - 56], [6.2, L - 54], [4.6, L - 54]], 16), 'rubber');
    v.add(lathe([[7.8, L - 53], [17, L - 53], [17, L - 52.4], [7.8, L - 52.4]], 24), 'polishedSteel');
    v.add(lathe([[7.8, L - 52.4], [17, L - 52.4], [17, L - 50], [7.8, L - 50]], 24), 'steel');
    v.add(spring(15, 1.9, L - 50, L - 14, 5.5), 'darkSteel');
    v.add(spring(10.5, 1.4, L - 50, L - 14, 6.5), 'darkSteel');
    v.add(lathe([[5, L - 14], [16.5, L - 14], [16.5, L - 11], [6, L - 8], [5, L - 8]], 24), 'steel');
    for (const ph of [0.06, Math.PI + 0.06]) v.add(new THREE.CylinderGeometry(5.6, 6.2, 7, 8, 1, false, ph, Math.PI - 0.12).translate(0, L - 10, 0), 'steel');
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
/**
 * Photo-matched (photo-ref/cam-housing-right): long sand-cast housing with a continuous cam tunnel along the
 * outer spine, four bearing webs, tall rocker-shaft towers either side of each cylinder, cover-seat rails with
 * cast stud bosses, round tunnel bores at both ends and the external cam oil feed line.
 */
export const CH_Z0 = -168, CH_Z1 = CASE_Z.pulley;
/** Valve-cover ear positions along engine Z (relative to housing centre). */
const VC_EAR_F = (upper: boolean) => (upper ? [-0.39, -0.13, 0.13, 0.39] : [-0.42, -0.252, -0.084, 0.084, 0.252, 0.42]);
/** Valve-cover ear stations along engine Z, relative to the housing centre (mm): 4 per edge upper, 6 lower (103-05: 40 nuts). */
export const VC_EARS = (upper: boolean) => VC_EAR_F(upper).map((f) => f * (CH_Z1 - CH_Z0 - 30));
/** Ear centre offset across the cover (cover-local x). */
export const VC_EDGE = 31;
/** Rocker-shaft towers: axis x (unsigned), y, and machined end-face offset from the cylinder centre. */
export const ROCKER_TOWER = { x: CAM_X + 16, y: 40, face: 23 };
export function camHousing(s: 1 | -1) {
  const p = new Part();
  const X = (x: number) => x * s;
  const lo = (a: number, b: number) => [Math.min(X(a), X(b)), Math.max(X(a), X(b))];
  const bx = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, m: MatKey = 'castAlu') => {
    const [a, b] = lo(x0, x1); p.add(boxMM([a, y0, z0], [b, y1, z1]), m);
  };
  const L = CH_Z1 - CH_Z0, zc = (CH_Z0 + CH_Z1) / 2;
  // base plate against heads with machined skirt
  bx(HEAD_OUT_X, HEAD_OUT_X + 10, -70, 72, CH_Z0 - (s < 0 ? 17 : 5), CH_Z1); // extended at the flywheel end under the cyl. 6 nuts (v5 stud spread z +-28)
  bx(HEAD_OUT_X, HEAD_OUT_X + 2, -73, 75, CH_Z0 + 2, CH_Z1 - 2, 'machinedAlu');
  // cam tunnel: thick sector shell around the cam axis on the outer side (open toward the rockers)
  const tun = new THREE.Shape();
  const a0 = s > 0 ? -1.15 : Math.PI - 1.15, a1 = s > 0 ? 1.15 : Math.PI + 1.15;
  tun.absarc(X(CAM_X), 0, 33, a0, a1, false); tun.absarc(X(CAM_X), 0, 26, a1, a0, true);
  p.add(extrude(tun, L - 2, 0.8, 24), 'castAlu', [0, 0, CH_Z0 + 1]);
  // outer spine ribs on the tunnel (cast stiffeners)
  for (const y of [-14, 14]) bx(CAM_X + 30, CAM_HOUSING_OUT_X, y - 2.2, y + 2.2, CH_Z0 + 4, CH_Z1 - 4);
  // cover-seat rails (upper & lower) with machined seat faces
  for (const sg of [1, -1]) {
    bx(HEAD_OUT_X + 6, HEAD_OUT_X + 18, sg > 0 ? 62 : -76, sg > 0 ? 76 : -62, CH_Z0, CH_Z1);
    bx(CAM_HOUSING_OUT_X - 16, CAM_HOUSING_OUT_X - 4, sg > 0 ? 28 : -36, sg > 0 ? 36 : -28, CH_Z0, CH_Z1);
  }
  // bearing webs between cylinders and at the ends (with cam bore)
  const zs = bankZ(s).slice().sort((a, b) => a - b);
  const webs = [CH_Z0 + 6, (zs[0] + zs[1]) / 2, (zs[1] + zs[2]) / 2, CH_Z1 - 6];
  for (const zw of webs) {
    const sh = polyShape(s > 0
      ? [[HEAD_OUT_X + 8, -72], [HEAD_OUT_X + 18, -74], [CAM_HOUSING_OUT_X - 8, -34], [CAM_HOUSING_OUT_X - 8, 34], [HEAD_OUT_X + 18, 74], [HEAD_OUT_X + 8, 72]]
      : [[-(HEAD_OUT_X + 8), 72], [-(HEAD_OUT_X + 18), 74], [-(CAM_HOUSING_OUT_X - 8), 34], [-(CAM_HOUSING_OUT_X - 8), -34], [-(HEAD_OUT_X + 18), -74], [-(HEAD_OUT_X + 8), -72]]);
    sh.holes.push(circlePath(24, X(CAM_X), 0) as THREE.Path);
    sh.holes.push(circlePath(9, X(HEAD_OUT_X + 26), 46) as THREE.Path);
    sh.holes.push(circlePath(9, X(HEAD_OUT_X + 26), -46) as THREE.Path);
    p.add(extrudeC(sh, 12, 0.8, 6), 'castAlu', [0, 0, zw]);
  }
  // rocker-shaft towers either side of each cylinder (#44 shafts pass through), with machined end faces
  for (const zc2 of zs) for (const y of [40, -40]) {
    p.add(yToZ(cyl(10, 44, 18)), 'castAlu', [X(CAM_X + 16), y, zc2]);
    for (const dz of [-22.5, 22.5]) p.add(yToZ(cyl(8.6, 1, 18)), 'machinedAlu', [X(CAM_X + 16), y, zc2 + dz]);
    const t = boxMM([-5, -6, -18], [5, 6, 18]); t.translate(X(CAM_X + 8), y * 0.82, zc2); p.add(t, 'castAlu');
  }
  // cast stud bosses + studs on the rails where the valve-cover ears land
  for (const upper of [true, false]) for (const f of VC_EARS(upper)) {
    const z = zc + f;
    for (const yy of upper ? [69] : [-69]) {
      p.add(yToX(cyl(6.5, 12, 14)), 'castAlu', [X(HEAD_OUT_X + 12), yy, z]);
    }
    p.add(yToX(cyl(6, 10, 14)), 'castAlu', [X(CAM_HOUSING_OUT_X - 10), upper ? 32 : -32, z]);
  }
  // tunnel end bore bosses
  for (const z of [CH_Z0 - 1, CH_Z1 + 1]) p.add(yToZ(lathe([[24, -3], [34, -3], [34, 3], [24, 3]], 36)), 'castAlu', [X(CAM_X), 0, z]);
  // cam oil feed line along the outer spine (#29 banjo bolts)
  p.add(tube([[X(CAM_HOUSING_OUT_X + 5), 20, CH_Z1 + 10], [X(CAM_HOUSING_OUT_X + 6), 22, 60], [X(CAM_HOUSING_OUT_X + 6), 22, CH_Z0 + 20]], 3.2, 8, 40), 'steel');
  for (const z of [CH_Z1 - 20, 60, CH_Z0 + 20]) {
    p.add(yToX(hexNut(14, 8)), 'brass', [X(CAM_HOUSING_OUT_X + 4), 20, z]);
    p.add(yToX(cyl(8, 6, 14)), 'castAlu', [X(CAM_HOUSING_OUT_X - 1), 20, z]);
  }
  // flywheel-end tunnel cover (#16/#17)
  p.add(yToZ(lathe([[0, -3], [30, -3], [30, 2], [26, 4], [0, 4]], 36)), 'castAlu', [X(CAM_X), 0, CH_Z0 - 4]);
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + 0.5; p.add(yToZ(hexNut(9, 5)), 'zincPlate', [X(CAM_X) + 25 * Math.cos(a), 25 * Math.sin(a), CH_Z0 - 8]); }
  // nuts to the heads (#22) on the head studs: fasteners.ts (cam-housing-nuts)
  return p.g;
}

/** Minimal stroke font for cast lettering (4x6 grid). */
const STROKES: Record<string, number[][]> = {
  P: [[0, 0, 0, 6], [0, 6, 3, 6], [3, 6, 4, 5], [4, 5, 4, 4], [4, 4, 3, 3], [3, 3, 0, 3]],
  O: [[1, 0, 3, 0], [3, 0, 4, 1], [4, 1, 4, 5], [4, 5, 3, 6], [3, 6, 1, 6], [1, 6, 0, 5], [0, 5, 0, 1], [0, 1, 1, 0]],
  R: [[0, 0, 0, 6], [0, 6, 3, 6], [3, 6, 4, 5], [4, 5, 4, 4], [4, 4, 3, 3], [3, 3, 0, 3], [2, 3, 4, 0]],
  S: [[4, 5, 3, 6], [3, 6, 1, 6], [1, 6, 0, 5], [0, 5, 0, 4], [0, 4, 1, 3], [1, 3, 3, 3], [3, 3, 4, 2], [4, 2, 4, 1], [4, 1, 3, 0], [3, 0, 1, 0], [1, 0, 0, 1]],
  C: [[4, 5, 3, 6], [3, 6, 1, 6], [1, 6, 0, 5], [0, 5, 0, 1], [0, 1, 1, 0], [1, 0, 3, 0], [3, 0, 4, 1]],
  H: [[0, 0, 0, 6], [4, 0, 4, 6], [0, 3, 4, 3]],
  E: [[4, 0, 0, 0], [0, 0, 0, 6], [0, 6, 4, 6], [0, 3, 3, 3]],
};
/** Raised letters in a part's local frame: text runs along +y, letter-up along +x, raised along +z from z0. */
function raisedText(p: Part, text: string, x0: number, yc: number, sc: number, z0: number, h = 1.3, stroke = 1.5, fu = 1, fa = 1) {
  const adv = 6.6 * sc, W = (text.length - 1) * adv + 4 * sc, y0 = yc - (fa * W) / 2;
  [...text].forEach((ch, k) => (STROKES[ch] ?? []).forEach(([ax, ay, bx2, by]) => {
    const A = new THREE.Vector2(x0 + fu * ay * sc, y0 + fa * (k * adv + ax * sc)), B = new THREE.Vector2(x0 + fu * by * sc, y0 + fa * (k * adv + bx2 * sc));
    const d = B.clone().sub(A); const g = boxMM([-d.length() / 2 - stroke / 2, -stroke / 2, 0], [d.length() / 2 + stroke / 2, stroke / 2, h]);
    g.rotateZ(Math.atan2(d.y, d.x)); g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, z0); p.add(g, 'castAlu');
  }));
}

/**
 * Upper / lower valve cover (103-05 #19/#20), engine coords. Photo-matched (photo-ref/valve-cover-upper-right,
 * FVD genuine 901.105.115.11): flat-topped cast pan with chamfered sides on a thin seat flange, rounded bolt ears
 * (3 upper / 5 lower per edge), two machined round bosses on the upper cover, raised lettering band.
 */
/** Valve-cover cavity: half-width at the seat (w0 + 8 bevel = 26) and how much the v5 hollow pan top rose (z 13.5 -> 22). */
export const VC_CAV = { w0: 18 }, VC_RAISE = 8.5;
/** Extra cover length at the flywheel end (local -y), per bank. */
export const VC_EXT = (s: 1 | -1) => (s < 0 ? 30 : 0);
export function valveCover(s: 1 | -1, upper: boolean) {
  const loc = new Part();
  const len = CH_Z1 - CH_Z0 - 8, w = 58;
  const L = CH_Z1 - CH_Z0;
  // hollow cast pan (v5): drafted outer shell 2.5-3 mm thick over a matching cavity that clears the rocker gear,
  // on a seat flange ring; everything below the seat plane is trimmed off.
  // the left bank's cylinder 6 rocker gear sits past the housing centre line: that cover is 30 mm longer at the flywheel end (E: overhangs the housing end)
  const ext = VC_EXT(s), cy = -ext / 2;
  const cavity = new THREE.ExtrudeGeometry(roundRect(VC_CAV.w0 * 2, len - 30 + ext, 1), { depth: 29, bevelEnabled: true, bevelThickness: 10, bevelSize: 8, bevelSegments: 1, curveSegments: 6 });
  cavity.translate(0, cy, -20);
  const below = boxMM([-w, -len, -40], [w, len, 0.01]);
  loc.add(csgSub(extrude(roundRect(w, len + ext, 7), 3, 0.6, 6).translate(0, cy, 0), cavity), 'castAlu');
  const pan = new THREE.ExtrudeGeometry(roundRect(w - 17, len - 22 + ext, 6), { depth: 12, bevelEnabled: true, bevelThickness: 10, bevelSize: 8, bevelSegments: 1, curveSegments: 6 });
  loc.add(csgSub(pan.translate(0, cy, 0), cavity, below), 'castAlu');
  // ears (both long edges): bosses trimmed to a slightly narrower cavity so the full nut seat stays solid, nut seat at z 7
  const earCut = new THREE.ExtrudeGeometry(roundRect(31, len - 30 + ext, 1), { depth: 29, bevelEnabled: true, bevelThickness: 10, bevelSize: 8, bevelSegments: 1, curveSegments: 6 }).translate(0, cy, -20);
  for (const yy of VC_EARS(upper)) {
    for (const xx of [-VC_EDGE, VC_EDGE]) loc.add(csgSub(yToZ(cyl(8.5, 7, 16)).translate(xx, yy, 3.5), earCut), 'castAlu');
  }
  if (upper) {
    // two machined round bosses
    for (const yy of [-len * 0.2, len * 0.2]) {
      loc.add(yToZ(lathe([[0, 0], [12, 0], [12, 2], [15, 3], [18, 5], [18, 0]].reverse().map(([r, z]) => [r, z] as [number, number]), 36)), 'castAlu', [0, yy, 13.5 + VC_RAISE]);
      loc.add(yToZ(lathe([[0, 0], [16.5, 0], [16.5, 0.8], [12, 0.8], [11.5, -2], [0, -2]], 36)), 'machinedAlu', [0, yy, 18.6 + VC_RAISE]);
    }
    // raised cast PORSCHE lettering along the flat top
    // reads correctly from each bank's own side (letter-up toward +Y, advance toward the viewer's right)
    raisedText(loc, 'PORSCHE', s > 0 ? 1 : 13.6, 0, 2.1, 13.2 + VC_RAISE, 1.3, 1.5, s, -s);
  } else {
    // lower covers: low longitudinal stiffening ribs
    for (const dx of [-8, 8]) loc.add(boxMM([dx - 1.2, -len / 2 + 20, 13 + VC_RAISE], [dx + 1.2, len / 2 - 20, 15.5 + VC_RAISE]), 'castAlu');
  }
  loc.g.applyMatrix4(coverMatrix(s, upper));
  const out = new Part(); out.addObj(loc.g); return out.g;
}
/** Valve-cover frame: local x = along the slope, local y = engine Z, local z = outward normal (seat flange at z 0). */
export function coverMatrix(s: 1 | -1, upper: boolean) {
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
  return m;
}

// ---------------------------------------------------------------- camshaft (103-10/-15 #42)
/**
 * Cam nose stack (103-10/-15), measured along engine Z from the chain plane z = CHAIN_Z[s]:
 * thrust washer #34 (z-18.5..-16) | sprocket flange #36 on the Woodruff key #37 (z-16..-6) | alignment shim #35
 * (z-6..-5.4) | sprocket #38 hub (z-5.4..+13), dowelled to the flange by straight pin #39 | spring washer #40 +
 * nut #41 (fasteners.ts cam-nut-*) on the M22x1.5 thread (E) at the nose end.
 */
export const CAM_NOSE = { r: 11, key: { D: 9.6, h: 4.8, b: 4, proud: 1.8, dz: -11 }, flange: [-16, -6] as [number, number], shim: 0.6, hubFace: 10, end: 23, pin: { r: 3, rad: 16, a: 0.5 } };
export function camshaft(s: 1 | -1) {
  const p = new Part();
  const X = CAM_X * s, zc = CHAIN_Z[s], N = CAM_NOSE;
  const zN = zc + N.end;
  p.add(yToZ(cyl(15, CH_Z1 - CH_Z0, 24)), 'darkSteel', [X, 0, (CH_Z0 + CH_Z1) / 2]);
  // nose: plain journal under flange/sprocket with the Woodruff pocket cut in (half-moon, chord along the axis)
  const zt = zc + N.hubFace; // thread starts at the sprocket hub face
  const nose = yToZ(cyl(N.r, zt - CH_Z1 + 1, 28)).translate(X, 0, (CH_Z1 - 1 + zt) / 2);
  const k = N.key, kTop = N.r + k.proud;
  const pocket = woodruffGeom(k.D + 0.1, k.h + 0.05, k.b + 0.1).rotateY(-Math.PI / 2).translate(X, kTop, zc + k.dz);
  p.add(csgSub(nose, pocket), 'darkSteel');
  // M22 thread (E): slightly smaller core + thread rings
  p.add(yToZ(cyl(N.r - 0.4, zN - zt, 24)), 'darkSteel', [X, 0, (zt + zN) / 2]);
  for (let z = zt + 1; z < zN - 0.5; z += 1.5) p.add(yToZ(lathe([[N.r - 0.4, -0.4], [N.r, 0], [N.r - 0.4, 0.4]], 24)), 'darkSteel', [X, 0, z]);
  const zs = bankZ(s).slice().sort((a, b) => a - b);
  const webs = [CH_Z0 + 6, (zs[0] + zs[1]) / 2, (zs[1] + zs[2]) / 2, CH_Z1 - 6];
  for (const zw of webs) p.add(yToZ(cyl(23.5, 12, 32)), 'polishedSteel', [X, 0, zw]);
  const cyls = s > 0 ? [1, 2, 3] : [4, 5, 6];
  cyls.forEach((c) => {
    const zc2 = CYL_Z[c];
    for (const [dz, ph] of [[-9, 0], [9, 110]] as const) {
      const pts: [number, number][] = [];
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        const lift = Math.max(0, Math.cos(a)) ** 2 * 10.5;
        pts.push([(19 + lift) * Math.cos(a), (19 + lift) * Math.sin(a)]);
      }
      const g = extrudeC(polyShape(pts), 13);
      g.rotateZ(((THROW_DEG[c] / 2) + ph) * DEG);
      p.add(g, 'polishedSteel', [X, 0, zc2 + dz]);
    }
  });
  return p.g;
}
/** Sprocket flange (#36): keyed hub disc on the cam nose, carries the sprocket via the dowel pin #39. */
export function camFlange(s: 1 | -1) {
  const p = new Part();
  const X = CAM_X * s, zc = CHAIN_Z[s], N = CAM_NOSE;
  const sh = circleShape(24);
  const bore = new THREE.Path(); // bore with the key slot at +Y
  const kb = N.key.b / 2 + 0.05, a = Math.asin(kb / (N.r + 0.05));
  bore.absarc(0, 0, N.r + 0.05, Math.PI / 2 + a, Math.PI / 2 - a + 2 * Math.PI, false);
  bore.lineTo(kb, N.r + N.key.proud + 0.4); bore.lineTo(-kb, N.r + N.key.proud + 0.4); bore.closePath();
  sh.holes.push(bore);
  for (let i = 0; i < 3; i++) { const q = N.pin.a + (i * 2 * Math.PI) / 3; sh.holes.push(circlePath(N.pin.r + 0.05, N.pin.rad * Math.cos(q) * s, N.pin.rad * Math.sin(q)) as THREE.Path); }
  p.add(extrude(sh, N.flange[1] - N.flange[0], 0.5, 24), 'darkSteel', [X, 0, zc + N.flange[0]]);
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
      // rocker-arm bush (#46), bronze, pressed into the arm eye on the shaft
      p.add(yToZ(lathe([[8.55, -8.3], [9.9, -8.3], [9.9, 8.3], [8.55, 8.3]], 20)), 'bronze', [pivot[0] * s, pivot[1], zc + dz]);
      // adjusting screw (#49) & nut (#50)
      p.add(cylBetween([tip[0] * s, up * 52, zc + dz], [tip[0] * s, up * 70, zc + dz], 3.8, 10), 'steel');
      p.add(hexNut(11, 5).translate(tip[0] * s, up * 66, zc + dz), 'darkSteel');
    }
  }
  return p.g;
}

// ---------------------------------------------------------------- cam chain drive (103-10/-15), duplex 3/8" roller chain
// Sizes from Dempsey's rebuild photos (photo-ref/book: rebuild-pic10, tensioner-pic3/4/9/10, sample_page1) scaled by
// the 9.525 mm chain pitch: cam sprocket 27 T (pitch Ø 82 mm; photo chain-wrap Ø ≈ 80-85 mm), intermediate sprockets
// 18 T so the cam turns at ½ crank with the 36:48 crank/intermediate gear pair (int. shaft at ¾ crank).
const PITCH = 9.525;
const INT_T = 18, CAM_T = 27, IDLER_T = 15;
const INT_SPROCKET_R = PITCH / (2 * Math.sin(Math.PI / INT_T)); // 27.4
const CAM_SPROCKET_R = PITCH / (2 * Math.sin(Math.PI / CAM_T)); // 41.0
const ROW = 5.1; // duplex row offset from chain centre
/** Chain-housing box (both banks): bolts to the crankcase pulley face, cover face 70 mm proud of it. */
export const HOUSING_Z0 = CASE_Z.pulley, HOUSING_Z1 = CASE_Z.pulley + 70;
/** Straight inner (crankcase-side) edge of the chain box, |x|. Inboard of this the chains run in the case's chain well. */
export const CHAIN_BOX_INNER_X = 118;
const CAM_END_X = 254; // inboard edge of the cam-housing end face that sits inside the box
const CAM_HOUSING_END_Z = CASE_Z.pulley + 10; // 222

/** Straight two-sprocket loop (intermediate + cam sprocket, external tangents): the reference the idler deflects. */
export function basePath(s: 1 | -1) {
  const c1 = new THREE.Vector2(0, INT_SHAFT_Y), r1 = INT_SPROCKET_R;
  const c2 = new THREE.Vector2(CAM_X * s, 0), r2 = CAM_SPROCKET_R;
  const d = c2.clone().sub(c1); const L = d.length(); const base = Math.atan2(d.y, d.x);
  const beta = Math.acos((r1 - r2) / L);
  const al = s > 0 ? base - beta : base + beta; // lower (slack) run
  const lo1 = new THREE.Vector2(c1.x + r1 * Math.cos(al), c1.y + r1 * Math.sin(al));
  const lo2 = new THREE.Vector2(c2.x + r2 * Math.cos(al), c2.y + r2 * Math.sin(al));
  const au = s > 0 ? base + beta : base - beta;
  const up1 = new THREE.Vector2(c1.x + r1 * Math.cos(au), c1.y + r1 * Math.sin(au));
  const up2 = new THREE.Vector2(c2.x + r2 * Math.cos(au), c2.y + r2 * Math.sin(au));
  const nLo = new THREE.Vector2(Math.cos(al), Math.sin(al)); // outward normal of lower run (points down)
  const nUp = new THREE.Vector2(Math.cos(au), Math.sin(au));
  return { c1, c2, r1, r2, lo1, lo2, up1, up2, nLo, nUp };
}
/** How far the idler pushes the slack run into the loop, measured from the straight tangent line (mm, E). */
export const IDLER_PUSH = 38;
/** Idler station along the slack run, |x| (mm, E: photo rebuild-pic10, idler about 2/3 of the way to the cam). */
export const IDLER_X = 210;
/** Idler wrap: the chain's pitch line follows the idler pitch circle over this arc (computed, see chainPath). */
interface Circ { c: THREE.Vector2; r: number; sg: 1 | -1 }
/** Common tangent leaving circle a and arriving at circle b for a CCW loop; sg = -1 circles are wrapped from outside. */
function tangent(a: Circ, b: Circ) {
  const d = b.c.clone().sub(a.c), L = d.length(), phi = Math.atan2(d.y, d.x);
  const k = (a.sg * a.r - b.sg * b.r) / L;
  for (const sgn of [1, -1]) {
    const th = phi + sgn * Math.acos(k);
    const n = new THREE.Vector2(Math.cos(th), Math.sin(th));
    const pa = a.c.clone().add(n.clone().multiplyScalar(a.sg * a.r)), pb = b.c.clone().add(n.clone().multiplyScalar(b.sg * b.r));
    const t = new THREE.Vector2(-n.y, n.x);
    if (t.dot(pb.clone().sub(pa)) > 0) return { pa, pb, n };
  }
  throw new Error('no tangent');
}
/**
 * Chain pitch line (engine XY) for one bank: CCW loop over the cam sprocket, the intermediate sprocket and the idler.
 * The idler sits OUTSIDE the loop under the slack (lower) run and pushes it IDLER_PUSH mm inward, so the chain leaves
 * the intermediate sprocket, wraps over the top of the idler pitch circle and climbs to the cam sprocket.
 */
export function chainPath(s: 1 | -1) {
  const B = basePath(s);
  const T = tensionerLayout(s);
  const cam: Circ = { c: B.c2, r: B.r2, sg: 1 }, int: Circ = { c: B.c1, r: B.r1, sg: 1 }, idl: Circ = { c: T.idler, r: T.idlerR, sg: -1 };
  // CCW traversal order (see basePath): right bank cam -> int -> idler, left bank cam -> idler -> int
  const order = s > 0 ? [cam, int, idl] : [cam, idl, int];
  const tans = order.map((a, i) => tangent(a, order[(i + 1) % 3]));
  const pts: THREE.Vector2[] = [];
  const arcs: { circ: Circ; a0: number; a1: number }[] = [];
  order.forEach((C, i) => {
    const pin = tans[(i + 2) % 3].pb, pout = tans[i].pa;
    let a0 = Math.atan2(pin.y - C.c.y, pin.x - C.c.x), a1 = Math.atan2(pout.y - C.c.y, pout.x - C.c.x);
    if (C.sg > 0) { while (a1 <= a0) a1 += Math.PI * 2; } else { while (a1 >= a0) a1 -= Math.PI * 2; }
    arcs.push({ circ: C, a0, a1 });
    const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 0.05));
    for (let k = 0; k <= n; k++) { const a = a0 + ((a1 - a0) * k) / n; pts.push(new THREE.Vector2(C.c.x + C.r * Math.cos(a), C.c.y + C.r * Math.sin(a))); }
    // straight run to the next circle
    const A = tans[i].pa, Bp = tans[i].pb, m = Math.max(2, Math.ceil(A.distanceTo(Bp) / 6));
    for (let k = 1; k < m; k++) pts.push(A.clone().lerp(Bp, k / m));
  });
  const idlerArc = arcs[order.indexOf(idl)];
  const intToIdler = tans[1]; // slack run between the int sprocket and the idler (direction of travel differs per bank)
  const idlerToCam = s > 0 ? tans[2] : tans[0];
  return { ...B, pts, arcs, idlerArc, idlerWrap: Math.abs(idlerArc.a1 - idlerArc.a0), slackA: intToIdler, slackB: idlerToCam };
}
/** Chain pin centres (one per pitch) along the closed pitch line, shared by the chain mesh and the tests. */
export function chainPins(s: 1 | -1) {
  const { pts } = chainPath(s);
  const curve = new THREE.CatmullRomCurve3(pts.map((v) => new THREE.Vector3(v.x, v.y, 0)), true, 'centripetal');
  const len = curve.getLength(); const n = Math.round(len / PITCH / 2) * 2;
  return { n, len, pins: Array.from({ length: n }, (_, i) => curve.getPointAt(i / n)) };
}
/** y of a run (line a-b) at engine x. */
const runY = (a: THREE.Vector2, b: THREE.Vector2, x: number) => a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
/** Hydraulic adjuster: body length, plunger + dome, arm-tail pad radius, and the plunger axis z offset from the chain plane. */
export const ADJ = { body: 50, dome: 4.5, pad: 6.5, zOff: { 1: -13, [-1]: -5 } as Record<number, number> };
/**
 * Tensioner geometry (photo rebuild-pic10 / tensioner-pic3/4): 15 T idler OUTSIDE the loop under the slack run, about
 * 2/3 of the way to the cam, pushed IDLER_PUSH mm up into the run so the chain wraps it. The idler arm pivots outboard
 * of it; its tail pad (inboard) rests on the plunger of the hydraulic adjuster, which stands inclined (~36 deg) in the
 * lower inner corner of the box with its base where the v3 floor already was, so nothing drops toward the heat exchanger.
 */
export function tensionerLayout(s: 1 | -1) {
  const { lo1, lo2, nLo } = basePath(s);
  const idlerR = PITCH / (2 * Math.sin(Math.PI / IDLER_T));
  const xI = IDLER_X * s;
  const onRun = new THREE.Vector2(xI, runY(lo1, lo2, xI));
  const up = nLo.clone().multiplyScalar(-1);
  // pitch circle tangent to the straight run, then pushed IDLER_PUSH into the loop
  const idler = onRun.clone().add(nLo.clone().multiplyScalar(idlerR)).add(up.clone().multiplyScalar(IDLER_PUSH));
  const dir = lo2.clone().sub(lo1).normalize(); // along the run, toward the cam
  const pivot = idler.clone().add(dir.clone().multiplyScalar(44)).add(nLo.clone().multiplyScalar(4));
  const tail = idler.clone().add(dir.clone().multiplyScalar(-30)).add(nLo.clone().multiplyScalar(20));
  // adjuster base in the lower inner corner at the v3 floor height; axis aims at the tail pad
  const adjBase = new THREE.Vector2(134 * s, -124);
  const axis = tail.clone().sub(adjBase).normalize();
  const contact = tail.clone().sub(axis.clone().multiplyScalar(ADJ.pad)); // plunger dome apex touches the pad here
  const reach = contact.distanceTo(adjBase); // base -> apex
  const plunger = reach - ADJ.body - ADJ.dome; // exposed plunger length
  const adj = adjBase.clone().add(axis.clone().multiplyScalar(ADJ.body)); // top of the body (plunger exits here)
  const perp = new THREE.Vector2(-axis.y, axis.x).multiplyScalar(s); // toward the chain / box interior
  const ear = adjBase.clone().add(axis.clone().multiplyScalar(12)).add(perp.clone().multiplyScalar(21)); // mounting ear stud
  const z = CHAIN_Z[s], adjZ = z + ADJ.zOff[s];
  return { idler, idlerR, pivot, tail, contact, adj, adjBase, axis, perp, ear, reach, plunger, dir, up, z, adjZ, adjLen: ADJ.body };
}
/** Rotation that puts a tooth gap (roller seat, gearShape sprocket mode: gap centre at 0.875 pitch) on the nearest chain roller. */
export function toothPhase(s: 1 | -1, cx: number, cy: number, r: number, teeth: number) {
  const { pins } = chainPins(s);
  let best = pins[0], bd = Infinity;
  for (const q of pins) { const d = Math.abs(Math.hypot(q.x - cx, q.y - cy) - r); if (d < bd) { bd = d; best = q; } }
  return Math.atan2(best.y - cy, best.x - cx) - 0.875 * ((Math.PI * 2) / teeth);
}
function duplexSprocket(p: Part, teeth: number, r: number, at: V3, hub: number, mat: MatKey = 'steel', phase = 0) {
  const rr = r - 3.6, rt = r + 3.4;
  for (const dz of [-ROW, ROW]) {
    const ring = gearShape(teeth, rr, rt, 0, true); ring.holes.push(circlePath(rr - 4) as THREE.Path);
    p.add(extrudeC(ring, 5.2, 0.4, 2).rotateZ(phase), mat, [at[0], at[1], at[2] + dz]);
  }
  const body = circleShape(rr - 3.5); body.holes.push(circlePath(hub) as THREE.Path);
  p.add(extrudeC(body, 15.8, 0.6, 24), mat, at);
}
export function timingChain(s: 1 | -1) {
  const p = new Part();
  const { n, pins } = chainPins(s);
  const z = CHAIN_Z[s];
  const inner = extrudeC(roundRect(PITCH + 6.2, 8.8, 4.4), 1.2, 0, 3);
  const outer = extrudeC(polyShape([[-PITCH / 2 - 3.6, -4.3], [-PITCH / 2 + 1.5, -3.2], [PITCH / 2 - 1.5, -3.2], [PITCH / 2 + 3.6, -4.3], [PITCH / 2 + 4.6, 0], [PITCH / 2 + 3.6, 4.3], [PITCH / 2 - 1.5, 3.2], [-PITCH / 2 + 1.5, 3.2], [-PITCH / 2 - 3.6, 4.3], [-PITCH / 2 - 4.6, 0]]), 1.2);
  const roller = yToZ(cyl(3.2, 5.6, 10));
  const pin = yToZ(cyl(1.7, 22.4, 6));
  for (let i = 0; i < n; i++) {
    const a = pins[i], b = pins[(i + 1) % n];
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    const isInner = i % 2 === 0;
    const zs = isInner ? [-ROW - 3.4, -ROW + 3.4, ROW - 3.4, ROW + 3.4] : [-ROW * 2 + 0.2 - 0.6, 0, ROW * 2 - 0.2 + 0.6];
    for (const dz of zs) { const g = (isInner ? inner : outer).clone(); g.rotateZ(ang); p.add(g, isInner ? 'darkSteel' : 'steel', [cx, cy, z + dz]); }
    for (const dz of [-ROW, ROW]) p.add(roller.clone(), 'darkSteel', [a.x, a.y, z + dz]);
    p.add(pin.clone(), 'polishedSteel', [a.x, a.y, z]);
  }
  return p.g;
}
export function camSprocket(s: 1 | -1) {
  const p = new Part();
  const X = CAM_X * s, z = CHAIN_Z[s], N = CAM_NOSE;
  const rr = CAM_SPROCKET_R - 3.6, rt = CAM_SPROCKET_R + 3.4;
  for (const dz of [-ROW, ROW]) {
    const ring = gearShape(CAM_T, rr, rt, 0, true); ring.holes.push(circlePath(rr - 5) as THREE.Path);
    p.add(extrudeC(ring, 5.2, 0.4, 2).rotateZ(toothPhase(s, X, 0, CAM_SPROCKET_R, CAM_T)), 'steel', [X, 0, z + dz]);
  }
  // web: 6 lightening holes + the 3 vernier dowel holes (one carries the pin #39), hub on the cam nose
  const web = circleShape(rr - 4);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; web.holes.push(circlePath(5.5, 28 * Math.cos(a), 28 * Math.sin(a)) as THREE.Path); }
  for (let i = 0; i < 3; i++) { const q = N.pin.a + (i * 2 * Math.PI) / 3; web.holes.push(circlePath(N.pin.r + 0.05, N.pin.rad * Math.cos(q) * s, N.pin.rad * Math.sin(q)) as THREE.Path); }
  web.holes.push(circlePath(N.r + 8.2) as THREE.Path);
  p.add(extrudeC(web, 6, 0.6, 24), 'steel', [X, 0, z]);
  const z0 = N.flange[1] + N.shim; // hub back face on the shim
  p.add(yToZ(lathe([[N.r + 0.15, z0], [N.r + 8.5, z0], [N.r + 8.5, z0 + 2.2], [N.r + 8.2, z0 + 2.2], [N.r + 8.2, 7], [N.r + 5, N.hubFace], [N.r + 0.15, N.hubFace]], 32)), 'steel', [X, 0, z]);
  return p.g;
}
/**
 * Chain tensioner (103-10/-15): idler sprocket (#6, 15 T) on its arm (#5) pressed up into the slack run so the chain
 * wraps it (~36 deg), arm pivoting on its shaft (#3) in the housing boss, tail pad loaded by the hydraulic chain
 * adjuster (#10) whose plunger dome bears on the pad; adjuster held by its mounting ear on a housing stud + M8 nut
 * (103-10 #27/#28); plastic guide rails (#2) on the tight run and under the slack run.
 */
/** Plastic guide rails (103-10/15 #2): left 3, right 2 (E); each is a ramp `off` mm outside the chain run between fractions f0..f1. */
export function guideRails(s: 1 | -1) {
  const { up1, up2, nUp } = basePath(s); const P = chainPath(s);
  const sa = P.slackA.pa, sb = P.slackA.pb; const dd = sb.clone().sub(sa).normalize();
  let nn = new THREE.Vector2(dd.y, -dd.x); if (nn.y > 0) nn = nn.negate(); // outside of the loop = below the slack run
  const out = [{ a: up1, b: up2, n: nUp, f0: 0.53, f1: 0.82 }, { a: sa, b: sb, n: nn, f0: s > 0 ? 0.55 : 0.2, f1: s > 0 ? 0.8 : 0.45 }];
  if (s < 0) out.push({ a: up1, b: up2, n: nUp, f0: 0.14, f1: 0.36 });
  return out;
}
/** Rail mounting tabs: bosses outboard of the rail (clear of the chain plates) that take the rail bolts. */
export const RAIL_TAB = { off: 16.5, r: 8, z0: -16, z1: 11.1 };
/** Rail bolts (#3, 4 per bank): one through each end of the first two rails, head on the rail front face. */
export function railBolts(s: 1 | -1) {
  const z = CHAIN_Z[s];
  return guideRails(s).slice(0, 2).flatMap((r) => [r.f0 + 0.04, r.f1 - 0.04].map((f) => { const q = r.a.clone().lerp(r.b, f).add(r.n.clone().multiplyScalar(RAIL_TAB.off)); return new THREE.Vector3(q.x, q.y, z + RAIL_TAB.z1); }));
}
export function chainTensioner(s: 1 | -1) {
  const p = new Part();
  const z = CHAIN_Z[s];
  const T = tensionerLayout(s);
  const { up1, up2, nUp } = basePath(s);
  const P = chainPath(s);
  // idler sprocket (duplex, 15 T), tooth gaps phased onto the chain rollers, on its stub bolt (103-10 #7)
  duplexSprocket(p, IDLER_T, T.idlerR, [T.idler.x, T.idler.y, z], 6, 'steel', toothPhase(s, T.idler.x, T.idler.y, T.idlerR, IDLER_T));
  p.add(yToZ(cyl(6, 24, 12)), 'polishedSteel', [T.idler.x, T.idler.y, z]);
  p.add(yToZ(hexNut(13, 6)), 'darkSteel', [T.idler.x, T.idler.y, z + 15]);
  // forged idler arm behind the chain: pivot boss -> idler hub -> tail pad
  const armPts = hull([...circlePts(T.pivot.x, T.pivot.y, 10, 16), ...circlePts(T.idler.x, T.idler.y, 9, 16), ...circlePts(T.tail.x, T.tail.y, ADJ.pad, 12)]);
  p.add(extrudeC(polyShape(armPts), 6, 0.8), 'forgedDark', [0, 0, z - 15]);
  p.add(yToZ(cyl(10, 18, 20)), 'forgedDark', [T.pivot.x, T.pivot.y, z - 9]);
  p.add(yToZ(cyl(7, 28, 16)), 'polishedSteel', [T.pivot.x, T.pivot.y, z - 6]); // idler arm shaft (#3)
  // tail pad (hardened, Z-axis) that the plunger dome bears on
  const padZ0 = z - 18, padZ1 = Math.max(T.adjZ + 8, z - 12);
  p.add(yToZ(cyl(ADJ.pad, padZ1 - padZ0, 20)), 'polishedSteel', [T.tail.x, T.tail.y, (padZ0 + padZ1) / 2]);
  // hydraulic adjuster along its axis: alu body from the base, steel plunger, domed tip touching the tail pad
  const adj = new Part();
  const L = ADJ.body, reach = T.reach;
  adj.add(lathe([[0.1, 0], [11, 0], [12.5, 4], [12.5, L - 6], [11, L - 2], [8, L - 2], [8, L], [0.1, L]], 28), 'castAlu');
  for (let k = 0; k < 3; k++) adj.add(cyl(13.3, 1.3, 28), 'castAlu', [0, 12 + k * 10, 0]);
  adj.add(cyl(5, reach - ADJ.dome - (L - 2), 14), 'polishedSteel', [0, (L - 2 + reach - ADJ.dome) / 2, 0]);
  adj.add(lathe([[0.1, 0], [6.5, 0], [6.5, 1.5], [3, ADJ.dome], [0.1, ADJ.dome]], 18), 'steel', [0, reach - ADJ.dome, 0]);
  adj.g.rotation.z = Math.atan2(T.axis.y, T.axis.x) - Math.PI / 2; adj.g.position.set(T.adjBase.x, T.adjBase.y, T.adjZ);
  p.g.add(adj.g);
  // mounting ear at the body base with its stud and nut (stud from the housing boss)
  const earC = T.adjBase.clone().add(T.axis.clone().multiplyScalar(12));
  p.add(extrudeC(polyShape(hull([...circlePts(earC.x, earC.y, 11, 16), ...circlePts(T.ear.x, T.ear.y, 8, 16)])), 6, 0.6), 'castAlu', [0, 0, T.adjZ]);
  p.add(yToZ(cyl(4, T.adjZ + 12 - (HOUSING_Z0 + 4) , 10)), 'zincPlate', [T.ear.x, T.ear.y, (T.adjZ + 12 + HOUSING_Z0 + 4) / 2]);
  p.add(yToZ(cyl(8, 1.6, 16)), 'zincPlate', [T.ear.x, T.ear.y, T.adjZ + 3.6 + 0.8]);
  p.add(yToZ(hexNut(13, 6.5)), 'zincPlate', [T.ear.x, T.ear.y, T.adjZ + 3.6 + 1.6 + 3.25]);
  // plastic guide rails (#2): above the tight run near the inner edge, and under the slack run at the int exit
  const ramp = (a: THREE.Vector2, b: THREE.Vector2, n: THREE.Vector2, f0: number, f1: number) => {
    const off = 9.5;
    const A = a.clone().lerp(b, f0).add(n.clone().multiplyScalar(off)), B = a.clone().lerp(b, f1).add(n.clone().multiplyScalar(off));
    const d = B.clone().sub(A); const an = Math.atan2(d.y, d.x);
    const g = extrudeC(roundRect(d.length(), 6, 2.5), 21, 0.6, 3); g.rotateZ(an);
    p.add(g, 'blackPlastic', [(A.x + B.x) / 2, (A.y + B.y) / 2, z]);
    const c = extrudeC(roundRect(d.length() * 0.8, 5, 2), 5); c.rotateZ(an);
    p.add(c, 'castAlu', [(A.x + B.x) / 2 + n.x * 3, (A.y + B.y) / 2 + n.y * 3, z - 13.5]);
  };
  for (const r of guideRails(s)) ramp(r.a, r.b, r.n, r.f0, r.f1);
  for (const q of railBolts(s)) p.add(yToZ(cyl(RAIL_TAB.r, RAIL_TAB.z1 - RAIL_TAB.z0, 20)), 'blackPlastic', [q.x, q.y, z + (RAIL_TAB.z0 + RAIL_TAB.z1) / 2]);
  return p.g;
}
/** Clip a convex polygon to the half-plane x*s >= x0. */
function clipX(pts: [number, number][], s: 1 | -1, x0: number): [number, number][] {
  const out: [number, number][] = [];
  const inside = (q: [number, number]) => q[0] * s >= x0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if (inside(a)) out.push(a);
    if (inside(a) !== inside(b)) { const t = (x0 * s - a[0]) / (b[0] - a[0]); out.push([x0 * s, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}
/**
 * Chain-box outline (engine XY, mm). Photo-traced proportions (end view, tensioner-pic4 / rebuild-pic10 / sample_page1):
 * ~235 x 200 mm, straight inner edge at |x| = 118, round end around the cam sprocket, top following the tight run,
 * floor rising from the tensioner corner (≈-150 inboard of the heat exchanger) to ≈-58 under the cam.
 */
export function chainOutline(s: 1 | -1, grow: number): [number, number][] {
  const T = tensionerLayout(s);
  const { up1, up2 } = chainPath(s);
  const xi = CHAIN_BOX_INNER_X;
  const pts = hull([
    ...circlePts(CAM_X * s, 0, CAM_SPROCKET_R + 14 + grow, 40),
    ...circlePts(T.idler.x, T.idler.y, T.idlerR + 11 + grow, 20),
    ...circlePts(T.pivot.x, T.pivot.y, 17 + grow, 16),
    ...circlePts(T.adjBase.x, T.adjBase.y, 19 + grow, 16),
    ...circlePts(T.adj.x, T.adj.y, 16 + grow, 12),
    [(xi - 8) * s, runY(up1, up2, xi * s) + 34 + grow],
    [(xi - 8) * s, T.adjBase.y - 20 - grow],
  ]);
  return clipX(pts, s, xi - grow);
}
/** Inner-edge points between the chain runs are the open chain passage (no bolts there). */
const inPassage = (s: 1 | -1) => (x: number, y: number) => Math.abs(x * s - CHAIN_BOX_INNER_X) < 1 && y > -125 && y < 18;
function outlineBolts(o: [number, number][], every: number, skip?: (x: number, y: number) => boolean) {
  const out: { x: number; y: number; nx: number; ny: number }[] = [];
  const segs = o.map((a, i) => { const b = o[(i + 1) % o.length]; return { a, b, l: Math.hypot(b[0] - a[0], b[1] - a[1]) }; });
  const total = segs.reduce((t, s) => t + s.l, 0); const n = Math.round(total / every);
  let si = 0, acc = 0;
  for (let k = 0; k < n; k++) {
    const d = (k + 0.5) * (total / n);
    while (acc + segs[si].l < d) { acc += segs[si].l; si++; }
    const { a, b, l } = segs[si]; const t = (d - acc) / l;
    const tx = (b[0] - a[0]) / l, ty = (b[1] - a[1]) / l;
    out.push({ x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, nx: ty, ny: -tx });
  }
  const cx = o.reduce((t, p) => t + p[0], 0) / o.length, cy = o.reduce((t, p) => t + p[1], 0) / o.length;
  for (const q of out) if ((q.x - cx) * q.nx + (q.y - cy) * q.ny < 0) { q.nx *= -1; q.ny *= -1; }
  return skip ? out.filter((q) => !skip(q.x, q.y)) : out;
}
/** Cover-stud stations (19 per engine, 103-05 #3: 10 right / 9 left), 4 mm inside the box outline, clear of the open chain passage. */
export function chainCoverBolts(s: 1 | -1) {
  const o = chainOutline(s, 0), want = s > 0 ? 10 : 9;
  for (let every = 50; every < 120; every += 0.25) {
    const b = outlineBolts(o, every, inPassage(s));
    if (b.length === want) return b.map((q) => ({ x: q.x - q.nx * 4, y: q.y - q.ny * 4 }));
  }
  throw new Error('chainCoverBolts: no spacing gives the catalogue count');
}
/** Chain-housing -> crankcase studs on the inner-edge flange (nut seat = flange face inside the box), 5 per side. */
export function chainHousingStuds(s: 1 | -1) {
  const { yTop, yBot } = chainWellProfile(s);
  const x = (CHAIN_BOX_INNER_X + 6) * s;
  return [...[226, 247, 268].map((z) => ({ x, y: yTop - 10, z })), ...(s > 0 ? [224.5, 236, 274] : [252, 263, 274]).map((z) => ({ x, y: yBot + 13.5, z }))];
}
/** Chain-housing cover plate: bottom face just above the housing lip (bevel 0.8), nut seat = flat top face. */
export const CHAIN_LID = { z0: HOUSING_Z1 + 1.1, t: 4.5, top: HOUSING_Z1 + 1.1 + 4.5 + 0.8 };
function shapeFrom(o: [number, number][], holes: [number, number][][] = []) {
  const sh = polyShape(o);
  for (const h of holes) { const p = new THREE.Path(); const r = h.slice().reverse(); p.moveTo(r[0][0], r[0][1]); r.slice(1).forEach(([x, y]) => p.lineTo(x, y)); p.closePath(); sh.holes.push(p); }
  return sh;
}
/** Wall strip along an open polyline (thickness t inward of the outline), extruded z0..z1. */
function wallStrip(p: Part, pts: [number, number][], t: number, z0: number, z1: number, mat: MatKey = 'castAlu') {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const l = Math.hypot(bx - ax, by - ay); if (l < 0.01) continue;
    const g = boxMM([-l / 2 - 0.6, 0, z0], [l / 2 + 0.6, t, z1]); // CCW outline: +y local = inward
    g.rotateZ(Math.atan2(by - ay, bx - ax)); g.translate((ax + bx) / 2, (ay + by) / 2, 0); p.add(g, mat);
  }
}
/** Open polyline of the box wall: the outline minus its straight inner edge (that side opens into the case chain well). */
function boxWallPath(o: [number, number][], s: 1 | -1) {
  // rotate the CCW/CW outline so it starts just after the inner edge and ends just before it
  const onInner = (q: [number, number]) => Math.abs(q[0] * s - CHAIN_BOX_INNER_X) < 0.5;
  let k = o.findIndex((q, i) => onInner(q) && !onInner(o[(i + 1) % o.length]));
  const path: [number, number][] = [];
  for (let i = 0; i <= o.length; i++) { const q = o[(k + i) % o.length]; path.push(q); if (i > 0 && onInner(q)) break; }
  return path;
}
/** Cam-housing end studs (2 per bank, 103-05 #4 / BM8x65): outside the chain box above it, on ears of the chain
 * housing that lie on the cam-housing end face (found by stations.searchChainEndStations, E). */
export const END_PAD = { z0: 216.1, z1: 220.1, r: 9.5 };
export const END_STUDS: Record<1 | -1, [number, number][]> = { 1: [[266, 62], [282, 66]], [-1]: [[-286, 62], [-266, 62]] } as any;
export function chainHousing(s: 1 | -1) {
  const p = new Part();
  const o = chainOutline(s, 0);
  const wall = boxWallPath(o, s);
  const T = tensionerLayout(s);
  // back wall at the case face (inboard of the cam-housing end) + front ring in front of the cam-housing end
  const backPoly = clipBelowX(o, s, CAM_END_X);
  p.add(extrude(shapeFrom(backPoly), 4, 0, 8), 'castAlu', [0, 0, HOUSING_Z0]);
  // outboard of CAM_END_X the cam-housing end face itself closes the back of the box (gasketed joint)
  // side walls: full depth inboard of the cam-housing end, from the cam-end ring outboard of it
  wallStrip(p, wall, 5, CAM_HOUSING_END_Z + 1, HOUSING_Z1 - 5);
  for (const seg of splitRuns(wall, (q) => q[0] * s <= CAM_END_X - 4)) wallStrip(p, seg, 5, HOUSING_Z0, CAM_HOUSING_END_Z + 1.5);
  // lid-face flange lip (closed ring incl. the inner edge, which bolts to the case well flange)
  p.add(extrude(shapeFrom(chainOutline(s, 3), [chainOutline(s, -4)]), 5, 0, 6), 'castAlu', [0, 0, HOUSING_Z1 - 5]);
  // inner-edge flange to the crankcase well (gasket face)
  const yTop = Math.max(...o.filter((q) => Math.abs(q[0] * s - CHAIN_BOX_INNER_X) < 0.5).map((q) => q[1]));
  const yBot = Math.min(...o.filter((q) => Math.abs(q[0] * s - CHAIN_BOX_INNER_X) < 0.5).map((q) => q[1]));
  // 18 mm flange strips (nuts for the case studs seat on their inner face, see chainHousingStuds)
  p.add(boxMM([CHAIN_BOX_INNER_X * s - (s > 0 ? 0 : 6), yBot, HOUSING_Z0], [CHAIN_BOX_INNER_X * s + (s > 0 ? 6 : 0), yBot + 22, HOUSING_Z1]), 'castAlu');
  p.add(boxMM([CHAIN_BOX_INNER_X * s - (s > 0 ? 0 : 6), yTop - 18, HOUSING_Z0], [CHAIN_BOX_INNER_X * s + (s > 0 ? 6 : 0), yTop, HOUSING_Z1]), 'castAlu');
  // cast bosses for the cover studs (studs added with the hardware)
  for (const b of chainCoverBolts(s)) {
    const z0b = b.x * s > CAM_END_X - 4 ? CAM_HOUSING_END_Z + 5 : HOUSING_Z0 + 4;
    p.add(yToZ(cyl(5.5, HOUSING_Z1 - z0b, 14)), 'castAlu', [b.x, b.y, (z0b + HOUSING_Z1) / 2]);
  }
  // external ribs on the outer wall
  for (const b of outlineBolts(o, 110, (x) => x * s < CHAIN_BOX_INNER_X + 10)) {
    const g = boxMM([-1.5, 0, CAM_HOUSING_END_Z + 2], [1.5, 5, HOUSING_Z1 - 6]);
    g.rotateZ(Math.atan2(b.ny, b.nx) - Math.PI / 2); g.translate(b.x, b.y, 0); p.add(g, 'castAlu');
  }
  // internal bosses: idler-arm shaft & tensioner seat
  p.add(yToZ(cyl(12, CHAIN_Z[s] - 16 - HOUSING_Z0, 18)), 'castAlu', [T.pivot.x, T.pivot.y, (HOUSING_Z0 + CHAIN_Z[s] - 16) / 2]);
  // adjuster mounting-ear stud boss from the back wall up to the ear
  p.add(yToZ(cyl(8, T.adjZ - 3 - HOUSING_Z0, 16)), 'castAlu', [T.ear.x, T.ear.y, (HOUSING_Z0 + T.adjZ - 3) / 2]);
  // ears for the cam-housing end studs, bridged back to the top wall
  for (const [x, y] of END_STUDS[s]) {
    const h = END_PAD.z1 - END_PAD.z0, zc = (END_PAD.z0 + END_PAD.z1) / 2;
    p.add(yToZ(cyl(END_PAD.r, h, 24)), 'castAlu', [x, y, zc]);
    p.add(boxMM([x - 7, 44, END_PAD.z0], [x + 7, y, END_PAD.z1]), 'castAlu');
  }
  return p.g;
}
/** Consecutive sub-runs of a polyline whose points satisfy f. */
function splitRuns(pts: [number, number][], f: (q: [number, number]) => boolean) {
  const out: [number, number][][] = []; let cur: [number, number][] = [];
  for (const q of pts) { if (f(q)) cur.push(q); else { if (cur.length > 1) out.push(cur); cur = []; } }
  if (cur.length > 1) out.push(cur);
  return out;
}
/** Clip a convex polygon to x*s <= x0. */
function clipBelowX(pts: [number, number][], s: 1 | -1, x0: number): [number, number][] {
  const out: [number, number][] = [];
  const inside = (q: [number, number]) => q[0] * s <= x0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if (inside(a)) out.push(a);
    if (inside(a) !== inside(b)) { const t = (x0 * s - a[0]) / (b[0] - a[0]); out.push([x0 * s, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}
/**
 * Chain-housing cover (photo-matched to the bare covers in tensioner-pic9/10 and sample_page1): flat cast plate with
 * a straight inner edge, rounded cam end, a horizontal stiffening rib at cam height plus a diagonal ridge down to the
 * tensioner corner, a low cam-centre boss, the idler-shaft cap and perimeter nuts. No big dome.
 */
export function chainHousingLid(s: 1 | -1) {
  const p = new Part();
  const o = chainOutline(s, 3);
  const z0 = CHAIN_LID.z0, t = CHAIN_LID.t;
  p.add(extrude(shapeFrom(o), t, 0.8, 8), 'castAlu', [0, 0, z0]);
  const T = tensionerLayout(s);
  const zt = z0 + t;
  const ribTo = (x1: number, y1: number, x2: number, y2: number, h = 5, w = 3.4) => {
    const d = Math.hypot(x2 - x1, y2 - y1); const g = boxMM([-d / 2, -w / 2, 0], [d / 2, w / 2, h]);
    g.rotateZ(Math.atan2(y2 - y1, x2 - x1)); g.translate((x1 + x2) / 2, (y1 + y2) / 2, zt - 0.5); p.add(g, 'castAlu');
  };
  const xi = (CHAIN_BOX_INNER_X + 8) * s;
  ribTo(xi, 2, (CAM_X - 24) * s, 2); // horizontal rib at cam height
  ribTo((CAM_X - 18) * s, -14, T.adjBase.x + 14 * s, T.adjBase.y + 6); // diagonal ridge to the tensioner corner
  ribTo(xi, -46, T.idler.x, T.idler.y + 4, 3.5, 3);
  // low cam-centre boss with a machined plug
  p.add(yToZ(lathe([[0, 0], [30, 0], [26, 5], [0, 5]], 40)), 'castAlu', [CAM_X * s, 0, zt - 0.5]);
  p.add(yToZ(lathe([[0, 0], [17, 0], [17, 2], [15, 3], [0, 3]], 32)), 'machinedAlu', [CAM_X * s, 0, zt + 4.5]);
  // idler-shaft cap + tensioner boss
  p.add(yToZ(cyl(12, 6, 24)), 'castAlu', [T.pivot.x, T.pivot.y, zt + 2.5]);
  p.add(yToZ(hexNut(11, 4)), 'zincPlate', [T.pivot.x, T.pivot.y, zt + 7.5]);
  p.add(yToZ(cyl(14, 5, 24)), 'castAlu', [T.adjBase.x + T.axis.x * 30, T.adjBase.y + T.axis.y * 30, zt + 2]);
  // perimeter lock nuts on the housing studs: fasteners.ts (chain-cover-nuts)
  return p.g;
}

/** Inner-edge opening of the chain box (where it meets the case chain well) and the cover-face z. */
export function chainWellProfile(s: 1 | -1) {
  const o = chainOutline(s, 0).filter((q) => Math.abs(q[0] * s - CHAIN_BOX_INNER_X) < 0.5).map((q) => q[1]);
  return { yTop: Math.max(...o), yBot: Math.min(...o), z1: HOUSING_Z1 };
}

/** Intermediate shaft (103-15 #43): 48 T crank-driven gear + two 21 T duplex chain sprockets; drives the oil pump at the flywheel end. */
export const INT_GEAR = { teeth: 48, module: 2 };
export function intermediateShaft() {
  const p = new Part();
  const z0 = -100, z1 = CHAIN_Z[1] + 14;
  p.add(yToZ(cyl(9, z1 - z0, 20)), 'steel', [0, INT_SHAFT_Y, (z0 + z1) / 2]);
  for (const z of [-60, 150]) p.add(yToZ(cyl(13, 16, 24)), 'polishedSteel', [0, INT_SHAFT_Y, z]);
  const pr = (INT_GEAR.teeth * INT_GEAR.module) / 2;
  p.add(extrudeC(gearShape(INT_GEAR.teeth, pr - 3, pr + 1.5, 14), 14, 0.4), 'castAlu', [0, INT_SHAFT_Y, 199]); // matches v2 mesh (45 / 49.5)
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; p.add(yToZ(cyl(5, 15, 12)), 'darkSteel', [28 * Math.cos(a), INT_SHAFT_Y + 28 * Math.sin(a), 199]); }
  for (const s of [1, -1] as const) duplexSprocket(p, INT_T, INT_SPROCKET_R, [0, INT_SHAFT_Y, CHAIN_Z[s]], 9, 'steel', toothPhase(s, 0, INT_SHAFT_Y, INT_SPROCKET_R, INT_T));
  p.add(yToZ(hexNut(18, 7)), 'darkSteel', [0, INT_SHAFT_Y, z1 + 3]);
  // splined coupling end for the oil-pump connecting shaft (flywheel end)
  p.add(yToZ(cyl(11, 12, 16)), 'darkSteel', [0, INT_SHAFT_Y, z0 - 2]);
  return p.g;
}
