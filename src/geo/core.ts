/**
 * Bottom end + top end assets (crankcase, crank, rods, pistons, cylinders, heads, valve train, cam drive).
 * Shapes traced from the Porsche 911 1978-83 parts catalogue illustrations (groups 101-103) and scaled with
 * published / measured dimensions (see docs/engine-spec.md). All units mm.
 */
import * as THREE from 'three';
import {
  Part, V3, DEG, lathe, boxMM, cyl, cylBetween, yToZ, yToX, roundRect, circlePath, circleShape, ringShape,
  polyShape, hull, circlePts, gearShape, extrude, extrudeC, hexNut, tube, torus, spring, paramSurface, plate, gusset,
} from './util';
import {
  SPEC, CYL_Z, MAIN_Z, THROW_DEG, DECK_X, CYL_TOP_X, HEAD_OUT_X, CAM_X, CAM_HOUSING_OUT_X, INT_SHAFT_Y, CASE_Z, NOSE_BEARING_Z,
} from '../data/layout';
import type { MatKey } from './materials';

/** Chain plane (centre of the duplex chain) per bank: in front of the cam-housing end (z 222), rows clear of each other. */
export const CHAIN_Z: Record<1 | -1, number> = { 1: 258, [-1]: 235 } as any;

export const CRANK_GEAR_T = 36;

const bankZ = (s: 1 | -1) => (s === 1 ? [CYL_Z[1], CYL_Z[2], CYL_Z[3]] : [CYL_Z[4], CYL_Z[5], CYL_Z[6]]);

// ---------------------------------------------------------------- crankcase half (101-05 left / 101-10 right)
/**
 * Pressure-cast aluminium half (SC: aluminium, not magnesium). Photo-matched features (photo-ref/crankcase-*):
 * vertical split flange with a row of M8 nuts top and bottom, three spigot bores per side on a flat deck, big
 * through-bolt bosses between the bores, triangular gussets from the deck to the top/bottom rails, transverse
 * casting ribs across the top, a ribbed flywheel-end bell around the rear main seal, a flat chain-housing face at
 * the pulley end with the oil-pump nose, a round sump boss underneath and the cast external oil gallery.
 */
export function crankcaseHalf(s: 1 | -1) {
  const p = new Part();
  const z0 = CASE_Z.flywheel, z1 = CASE_Z.pulley, len = z1 - z0;
  const X = (x: number) => x * s;
  const outer: [number, number][] = [[0, -124], [52, -124], [78, -114], [96, -96], [102, -74], [102, 72], [96, 92], [74, 108], [40, 113], [0, 113]];
  const inner: [number, number][] = outer.map(([x, y]) => [Math.max(0, x - 8), y > 0 ? y - 8 : y + 8] as [number, number]);
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
  // main bearing webs (saddles)
  for (const z of MAIN_Z) {
    const ws = polyShape(s === 1 ? mir(inner) : mir(inner).reverse());
    ws.holes.push(circlePath(33, 0, 0) as THREE.Path);
    ws.holes.push(circlePath(18, 0, INT_SHAFT_Y) as THREE.Path);
    ws.holes.push(circlePath(16, 50 * s, -60) as THREE.Path);
    ws.holes.push(circlePath(13, 52 * s, 62) as THREE.Path);
    const g = extrudeC(ws, 12); g.translate(0, 0, z);
    p.add(g, 'castAlu');
  }
  // split-line flanges (top & bottom) with bosses + nuts
  p.add(boxMM([s > 0 ? 0 : -18, 108, z0], [s > 0 ? 18 : 0, 121, z1]), 'castAlu');
  p.add(boxMM([s > 0 ? 0 : -18, -132, z0], [s > 0 ? 18 : 0, -120, z1]), 'castAlu');
  for (let z = z0 + 22; z < z1 - 8; z += 41) {
    for (const [y, dir] of [[121, 1], [-132, -1]] as const) {
      p.add(cyl(9, 4, 14), 'castAlu', [X(9), y + dir * 2, z]);
      p.add(hexNut(13, 7), 'zincPlate', [X(9), y + dir * 7, z]);
      p.add(cyl(3.9, 8, 8), 'zincPlate', [X(9), y + dir * 12, z]);
    }
  }
  // transverse casting ribs on the top + bottom surfaces
  for (let z = z0 + 12; z < z1 - 6; z += 29.5) {
    p.add(gusset([X(16), 121], [X(16), 108], [X(74), 108], 4, z), 'castAlu');
    p.add(gusset([X(16), -132], [X(16), -120], [X(72), -114], 4, z), 'castAlu');
  }
  // cylinder spigot bores on the deck + lower head studs (Dilavar)
  for (const zc of bankZ(s)) {
    const pad = yToX(lathe([[46, 0], [60, 0], [60, 5], [57, 7], [47.5, 7], [47.5, 0]], 48));
    if (s < 0) pad.rotateZ(Math.PI);
    p.add(pad, 'machinedAlu', [(DECK_X - 4) * s, 0, zc]);
    p.add(yToX(cyl(47.4, 0.5, 40)), 'bore', [(DECK_X - 3) * s, 0, zc]);
    for (const a of [45, 135, 225, 315]) {
      const y = 57 * Math.sin(a * DEG), z = 57 * Math.cos(a * DEG);
      p.add(cylBetween([(DECK_X - 4) * s, y, zc + z], [(HEAD_OUT_X - 4) * s, y, zc + z], 4.6, 10), 'zincPlate');
      p.add(yToX(cyl(7.5, 6, 14)), 'castAlu', [(DECK_X - 1) * s, y, zc + z]);
    }
  }
  // through-bolt bosses + nuts between and outside the bores, and the gussets above/below them
  const zs = bankZ(s).slice().sort((a, b) => a - b);
  const mids = [zs[0] - 59, (zs[0] + zs[1]) / 2, (zs[1] + zs[2]) / 2, zs[2] + 59];
  for (const zm of mids) {
    if (zm < z0 + 6 || zm > z1 - 6) continue;
    p.add(boxMM([s > 0 ? 94 : -103, -80, zm - 5], [s > 0 ? 103 : -94, 74, zm + 5]), 'castAlu');
    for (const y of [-46, 46]) {
      p.add(yToX(cyl(12, 10, 24)), 'castAlu', [X(103), y, zm]);
      p.add(yToX(hexNut(17, 10)), 'darkSteel', [X(113), y, zm]);
      p.add(yToX(cyl(5.5, 6, 10)), 'darkSteel', [X(121), y, zm]);
    }
    p.add(gusset([X(100), 70], [X(100), 108], [X(30), 112], 5, zm), 'castAlu');
    p.add(gusset([X(100), -72], [X(100), -116], [X(40), -124], 5, zm), 'castAlu');
  }
  // longitudinal stiffening rails
  p.add(boxMM([s > 0 ? 88 : -104, 78, z0], [s > 0 ? 104 : -88, 86, z1]), 'castAlu');
  p.add(boxMM([s > 0 ? 88 : -104, -92, z0], [s > 0 ? 104 : -88, -84, z1]), 'castAlu');
  // cast external oil gallery along the lower flank
  p.add(yToZ(cyl(8, len - 20, 16)), 'castAlu', [X(86), -104, (z0 + z1) / 2]);
  // flywheel-end bell: rear main seal boss with radial ribs
  const boss = yToZ(new THREE.CylinderGeometry(60, 60, 14, 40, 1, true, s > 0 ? 0 : Math.PI, Math.PI));
  p.add(boss, 'castAlu', [0, 0, z0 - 7]);
  p.add(yToZ(lathe([[49, -1], [60, -1], [60, 1], [49, 1]], 40, s > 0 ? 0 : Math.PI, Math.PI)), 'castAlu', [0, 0, z0 - 14]);
  for (let a = -75; a <= 75; a += 25) {
    const ar = (s > 0 ? a : 180 - a) * DEG;
    const rib = boxMM([60, -2.5, -10], [96, 2.5, 0]); rib.rotateZ(ar);
    p.add(rib, 'castAlu', [0, 0, z0]);
  }
  // gearbox mounting studs/bosses around the flywheel end
  for (const [x, y] of [[88, 70], [92, -66], [40, -118], [44, 104]] as const) {
    p.add(yToZ(cyl(9, 12, 16)), 'castAlu', [X(x), y, z0 - 6]);
    p.add(yToZ(cyl(5, 26, 8)), 'zincPlate', [X(x), y, z0 - 13]);
  }
  // pulley end: machined face rim for the chain housing gasket
  const rim = polyShape(s === 1 ? mir(outer) : mir(outer).reverse());
  rim.holes.push(((): THREE.Path => { const h = new THREE.Path(); const q = s === 1 ? mir(inner).reverse() : mir(inner); h.moveTo(q[0][0], q[0][1]); q.slice(1).forEach(([x, y]) => h.lineTo(x, y)); h.closePath(); return h; })());
  p.add(extrude(rim, 2), 'machinedAlu', [0, 0, z1]);
  // pulley-end chain well (photo-ref/book rebuild-pic11/12, tensioner-pic4): the int-shaft sprockets and the inboard
  // chain runs live in a hollow cast well in front of the case face; it opens sideways into the bolted-on chain box at
  // |x| = 118 and is closed by a front plate flush with the chain-box covers. Bearing 8 boss on the crank axis.
  const W = chainWellProfile(s);
  const top: [number, number][] = [[X(CHAIN_BOX_INNER_X), W.yTop], [X(60), 44], [X(0.5), 50]];
  const bot: [number, number][] = [[X(0.5), -138], [X(70), -140], [X(CHAIN_BOX_INNER_X), W.yBot]];
  const strip = (pts: [number, number][], inward: 1 | -1) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1]; const l = Math.hypot(bx - ax, by - ay);
      const g = boxMM([-l / 2 - 0.5, inward > 0 ? 0 : -5, z1], [l / 2 + 0.5, inward > 0 ? 5 : 0, W.z1 - 6]);
      g.rotateZ(Math.atan2(by - ay, bx - ax)); g.translate((ax + bx) / 2, (ay + by) / 2, 0); p.add(g, 'castAlu');
    }
  };
  // walls: inward = toward the well interior (top wall below its line, bottom wall above)
  strip(s > 0 ? top : top.slice().reverse(), 1);
  strip(s > 0 ? bot : bot.slice().reverse(), 1);
  const plate = polyShape(s > 0 ? [...bot, ...top] : [...bot, ...top].reverse());
  plate.holes.push(circlePath(29, 0, 0) as THREE.Path);
  p.add(extrude(plate, 6, 0, 8), 'castAlu', [0, 0, W.z1 - 6]);
  p.add(yToZ(lathe([[29, 0], [40, 0], [40, W.z1 - 6 - 228], [29, W.z1 - 6 - 228]], 32, s > 0 ? 0 : Math.PI, Math.PI)), 'castAlu', [0, 0, 228]);
  for (const [x, y] of [[40, -118], [96, -30], [92, 10], [30, 36], [80, -120]] as const) p.add(yToZ(hexNut(10, 5)), 'zincPlate', [X(x), y, W.z1 + 2.5]);
  if (s > 0) {
    // oil pressure sender + engine-number pad on the right half
    p.add(cyl(11, 22, 16), 'castAlu', [40, 121, 170]);
    p.add(cyl(15, 30, 24), 'darkSteel', [40, 143, 170]);
    p.add(boxMM([60, 100, 110], [92, 106, 160]), 'machinedAlu');
  } else {
    // breather / oil-filler tower seat on the left half
    p.add(boxMM([-72, 108, 120], [-18, 122, 185]), 'castAlu');
  }
  // round sump boss underneath (strainer cover seats here)
  p.add(yToZ(lathe([[0.1, -2], [84, -2], [84, 2], [0.1, 2]], 48, s > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI)).rotateX(Math.PI / 2), 'castAlu', [0, -126, -10]);
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
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; fl.holes.push(circlePath(5.5, 36 * Math.cos(a), 36 * Math.sin(a)) as THREE.Path); }
  fl.holes.push(circlePath(10) as THREE.Path);
  p.add(extrude(fl, 12, 1), 'forgedDark', [0, 0, CASE_Z.flywheel - 8]);
  p.add(yToZ(cyl(rMain, 24, 32)), 'polishedSteel', [0, 0, -196]);
  // nose: timing gear seat, distributor drive seat, bearing 8 journal, pulley snout
  p.add(yToZ(lathe([[rMain, 186], [34, 186], [34, 226], [27, 226], [27, 256], [20, 256], [20, 318], [8, 320]], 48)), 'polishedSteel');
  return p.g;
}

/** Crank timing gear (102-00 #8) + distributor drive wheel (102-00 #10). */
export function crankGears() {
  const p = new Part();
  p.add(extrudeC(gearShape(CRANK_GEAR_T, 34.5, 38.5, 22), 14, 0.4), 'steel', [0, 0, 199]); // 36 T, m 2 (meshes the 48 T int. gear at 84 mm)
  // helical-looking distributor drive wheel: stacked twisted slices
  for (let i = 0; i < 4; i++) {
    const g = extrudeC(gearShape(24, 30, 33, 22), 3); g.rotateZ(i * 2.2 * DEG);
    p.add(g, 'bronze', [0, 0, 213 + i * 3]);
  }
  p.add(yToZ(cyl(24, 3, 32)), 'darkSteel', [0, 0, 208]);
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
  p.add(yToZ(lathe([[SPEC.rodJournalD / 2, -9], [SPEC.rodJournalD / 2 + 2, -9], [SPEC.rodJournalD / 2 + 2, 9], [SPEC.rodJournalD / 2, 9]], 32)), 'bronze');
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
  // core casting
  p.add(boxMM([5, -50, -42], [W - 16, 52, 42]), 'castAlu');
  // fins normal to the cylinder axis, rounded-square like the barrel, slightly larger
  const s45 = CYL_FIN.studR * Math.SQRT1_2;
  for (let x = 7, i = 0; x < 44; x += 4.6, i++) {
    const g = plate(114, 126 - i * 1.5, 16, 2, [[s45, s45, 6], [-s45, s45, 6], [s45, -s45, 6], [-s45, -s45, 6]], 0.3);
    g.rotateY(Math.PI / 2);
    p.add(g, 'castAlu', [x, 0, 0]);
  }
  // cam-side "rocker box" face with two spring wells
  const face = roundRect(92, 124, 10);
  const wellI: [number, number] = [0, 38], wellE: [number, number] = [0, -38];
  face.holes.push(circlePath(17.5, wellI[0], wellI[1]) as THREE.Path, circlePath(16.5, wellE[0], wellE[1]) as THREE.Path);
  const fg = extrudeC(face, 14, 0.8, 16); fg.rotateY(Math.PI / 2);
  p.add(fg, 'castAlu', [W - 8, 0, 0]);
  for (const [y, r] of [[38, 17.4], [-38, 16.4]]) p.add(yToX(cyl(r, 1, 32)), 'bore', [W - 15.5, y, 0]);
  // intake port (top) with flange & 2 studs
  const ip = roundRect(46, 40, 12);
  ip.holes.push(circlePath(17.5) as THREE.Path);
  const ipg = extrudeC(ip, 10); ipg.rotateX(Math.PI / 2);
  p.add(ipg, 'castAlu', [26, 60, 0]);
  p.add(cylBetween([26, 44, 0], [26, 56, 0], 22, 24), 'castAlu');
  p.add(yToZ(cyl(17.4, 1, 32)).rotateX(Math.PI / 2), 'bore', [26, 63, 0]);
  for (const z of [-17, 17]) { p.add(cyl(4, 14, 8), 'zincPlate', [26, 70, z]); p.add(hexNut(13, 6), 'zincPlate', [26, 68, z]); }
  // exhaust port (bottom) flange & studs
  const ep = roundRect(44, 34, 8); ep.holes.push(circlePath(15.5) as THREE.Path);
  const epg = extrudeC(ep, 10); epg.rotateX(Math.PI / 2);
  p.add(epg, 'castAlu', [34, -57, 0]);
  p.add(cylBetween([34, -44, 0], [34, -54, 0], 20, 24), 'castAlu');
  p.add(yToZ(cyl(15.4, 1, 32)).rotateX(Math.PI / 2), 'bore', [34, -61, 0]);
  for (const z of [-16, 16]) p.add(cyl(4, 16, 8), 'zincPlate', [34, -64, z]);
  // spark plug boss (lower side, angled outward)
  const sp = cyl(11, 26, 20); sp.rotateZ(-20 * DEG);
  p.add(sp, 'castAlu', [16, -50, 34]);
  p.add(yToZ(cyl(7, 1, 16)).rotateX(Math.PI / 2).rotateZ(-20 * DEG), 'bore', [12, -62, 34]);
  // cam housing studs (#5-#7)
  for (const [y, z] of [[36, 30], [36, -30], [-36, 30], [-36, -30]]) {
    p.add(yToX(cyl(4, 16, 8)), 'zincPlate', [W + 4, y, z]);
  }
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
/**
 * Photo-matched (photo-ref/cam-housing-right): long sand-cast housing with a continuous cam tunnel along the
 * outer spine, four bearing webs, tall rocker-shaft towers either side of each cylinder, cover-seat rails with
 * cast stud bosses, round tunnel bores at both ends and the external cam oil feed line.
 */
const CH_Z0 = -168, CH_Z1 = CASE_Z.pulley;
/** Valve-cover ear positions along engine Z (relative to housing centre). */
const VC_EARS = (upper: boolean) => (upper ? [-0.36, 0, 0.36] : [-0.42, -0.21, 0, 0.21, 0.42]);
export function camHousing(s: 1 | -1) {
  const p = new Part();
  const X = (x: number) => x * s;
  const lo = (a: number, b: number) => [Math.min(X(a), X(b)), Math.max(X(a), X(b))];
  const bx = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, m: MatKey = 'castAlu') => {
    const [a, b] = lo(x0, x1); p.add(boxMM([a, y0, z0], [b, y1, z1]), m);
  };
  const L = CH_Z1 - CH_Z0, zc = (CH_Z0 + CH_Z1) / 2;
  // base plate against heads with machined skirt
  bx(HEAD_OUT_X, HEAD_OUT_X + 10, -70, 72, CH_Z0, CH_Z1);
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
    const z = zc + f * (L - 30);
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
  // stud nuts to heads (#22)
  for (const zc2 of zs) for (const [y, dz] of [[60, 30], [60, -30], [-60, 30], [-60, -30]]) {
    p.add(yToX(hexNut(13, 7)), 'zincPlate', [X(HEAD_OUT_X + 16), y, zc2 + dz]);
    p.add(yToX(cyl(8.5, 1.5, 16)), 'zincPlate', [X(HEAD_OUT_X + 12), y, zc2 + dz]);
  }
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
export function valveCover(s: 1 | -1, upper: boolean) {
  const loc = new Part();
  const len = CH_Z1 - CH_Z0 - 8, w = 58;
  const L = CH_Z1 - CH_Z0;
  // seat flange
  loc.add(extrude(roundRect(w, len, 7), 3, 0.6, 6), 'castAlu');
  // chamfered pan body (single-segment bevel = straight draft)
  const pan = new THREE.ExtrudeGeometry(roundRect(w - 22, len - 22, 6), { depth: 1, bevelEnabled: true, bevelThickness: 10, bevelSize: 8, bevelSegments: 1, curveSegments: 6 });
  pan.translate(0, 0, 3.5);
  loc.add(pan, 'castAlu');
  // ears with nuts and washers (both long edges)
  for (const f of VC_EARS(upper)) {
    const yy = f * (L - 30);
    for (const xx of [-w / 2 - 2, w / 2 + 2]) {
      loc.add(yToZ(cyl(7, 7, 16)), 'castAlu', [xx, yy, 3.5]);
      loc.add(yToZ(cyl(6.2, 1.2, 14)), 'zincPlate', [xx, yy, 7.6]);
      loc.add(yToZ(hexNut(10, 6)), 'zincPlate', [xx, yy, 11]);
    }
  }
  if (upper) {
    // two machined round bosses
    for (const yy of [-len * 0.2, len * 0.2]) {
      loc.add(yToZ(lathe([[0, 0], [12, 0], [12, 2], [15, 3], [18, 5], [18, 0]].reverse().map(([r, z]) => [r, z] as [number, number]), 36)), 'castAlu', [0, yy, 13.5]);
      loc.add(yToZ(lathe([[0, 0], [16.5, 0], [16.5, 0.8], [12, 0.8], [11.5, -2], [0, -2]], 36)), 'machinedAlu', [0, yy, 18.6]);
    }
    // raised cast PORSCHE lettering along the flat top
    // reads correctly from each bank's own side (letter-up toward +Y, advance toward the viewer's right)
    raisedText(loc, 'PORSCHE', s > 0 ? 1 : 13.6, 0, 2.1, 13.2, 1.3, 1.5, s, -s);
  } else {
    // lower covers: low longitudinal stiffening ribs
    for (const dx of [-8, 8]) loc.add(boxMM([dx - 1.2, -len / 2 + 20, 13], [dx + 1.2, len / 2 - 20, 15.5]), 'castAlu');
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
  const zN = CHAIN_Z[s] + 10; // nose carries the sprocket
  p.add(yToZ(cyl(15, CH_Z1 - CH_Z0, 24)), 'darkSteel', [X, 0, (CH_Z0 + CH_Z1) / 2]);
  p.add(yToZ(cyl(11, zN - CH_Z1 + 1, 20)), 'darkSteel', [X, 0, (CH_Z1 - 1 + zN) / 2]);
  const zs = bankZ(s).slice().sort((a, b) => a - b);
  const webs = [CH_Z0 + 6, (zs[0] + zs[1]) / 2, (zs[1] + zs[2]) / 2, CH_Z1 - 6];
  for (const zw of webs) p.add(yToZ(cyl(23.5, 12, 32)), 'polishedSteel', [X, 0, zw]);
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
      p.add(g, 'polishedSteel', [X, 0, zc + dz]);
    }
  });
  // sprocket flange (#36) at chain end
  p.add(yToZ(cyl(19, 6, 32)), 'steel', [X, 0, CH_Z1 + 4]);
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
const HOUSING_Z0 = CASE_Z.pulley, HOUSING_Z1 = CASE_Z.pulley + 70;
/** Straight inner (crankcase-side) edge of the chain box, |x|. Inboard of this the chains run in the case's chain well. */
export const CHAIN_BOX_INNER_X = 118;
const CAM_END_X = 254; // inboard edge of the cam-housing end face that sits inside the box
const CAM_HOUSING_END_Z = CASE_Z.pulley + 10; // 222

export function chainPath(s: 1 | -1) {
  // two circles: intermediate shaft sprocket & cam sprocket; external tangent loop
  const c1 = new THREE.Vector2(0, INT_SHAFT_Y), r1 = INT_SPROCKET_R;
  const c2 = new THREE.Vector2(CAM_X * s, 0), r2 = CAM_SPROCKET_R;
  const pts: THREE.Vector2[] = [];
  const d = c2.clone().sub(c1); const L = d.length(); const base = Math.atan2(d.y, d.x);
  const beta = Math.acos((r1 - r2) / L);
  const arc = (c: THREE.Vector2, r: number, a0: number, a1: number, n: number) => {
    for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; pts.push(new THREE.Vector2(c.x + r * Math.cos(a), c.y + r * Math.sin(a))); }
  };
  arc(c2, r2, base - beta, base + beta, 40);
  arc(c1, r1, base + beta, base + Math.PI * 2 - beta, 40);
  const al = s > 0 ? base - beta : base + beta; // lower (slack) run
  const lo1 = new THREE.Vector2(c1.x + r1 * Math.cos(al), c1.y + r1 * Math.sin(al));
  const lo2 = new THREE.Vector2(c2.x + r2 * Math.cos(al), c2.y + r2 * Math.sin(al));
  const au = s > 0 ? base + beta : base - beta;
  const up1 = new THREE.Vector2(c1.x + r1 * Math.cos(au), c1.y + r1 * Math.sin(au));
  const up2 = new THREE.Vector2(c2.x + r2 * Math.cos(au), c2.y + r2 * Math.sin(au));
  const nLo = new THREE.Vector2(Math.cos(al), Math.sin(al)); // outward normal of lower run (points down)
  const nUp = new THREE.Vector2(Math.cos(au), Math.sin(au));
  return { pts, c1, c2, lo1, lo2, up1, up2, nLo, nUp };
}
/** y of a run (line a-b) at engine x. */
const runY = (a: THREE.Vector2, b: THREE.Vector2, x: number) => a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
/**
 * Tensioner geometry (photo rebuild-pic10 / tensioner-pic3): 15 T idler under the slack run about ⅔ of the way to the
 * cam, idler arm pivoting outboard of it, arm tail inboard, hydraulic adjuster lying inclined in the lower inner corner
 * of the box pushing the tail up — nothing hangs down over the heat exchanger.
 */
export function tensionerLayout(s: 1 | -1) {
  const { lo1, lo2, nLo } = chainPath(s);
  const idlerR = PITCH / (2 * Math.sin(Math.PI / IDLER_T));
  const xI = 208 * s;
  const onRun = new THREE.Vector2(xI, runY(lo1, lo2, xI));
  const idler = onRun.clone().add(nLo.clone().multiplyScalar(idlerR - 1.5));
  const dir = lo2.clone().sub(lo1).normalize(); // along the run, toward the cam
  const pivot = idler.clone().add(dir.clone().multiplyScalar(44)).add(nLo.clone().multiplyScalar(4));
  const tail = idler.clone().add(dir.clone().multiplyScalar(-34)).add(nLo.clone().multiplyScalar(13));
  const axis = new THREE.Vector2(0.94 * s, 0.34); // adjuster axis, base -> plunger tip (≈20° above horizontal; the photo's ≈60° would need a deeper box over the heat exchanger)
  const adjLen = 56;
  const adj = tail.clone().add(axis.clone().multiplyScalar(-9)); // plunger tip under the arm tail
  const adjBase = adj.clone().add(axis.clone().multiplyScalar(-adjLen));
  return { idler, idlerR, pivot, tail, adj, adjBase, axis, adjLen, dir };
}
function duplexSprocket(p: Part, teeth: number, r: number, at: V3, hub: number, mat: MatKey = 'steel') {
  const rr = r - 3.6, rt = r + 3.4;
  for (const dz of [-ROW, ROW]) {
    const ring = gearShape(teeth, rr, rt, 0, true); ring.holes.push(circlePath(rr - 4) as THREE.Path);
    p.add(extrudeC(ring, 5.2, 0.4, 2), mat, [at[0], at[1], at[2] + dz]);
  }
  const body = circleShape(rr - 3.5); body.holes.push(circlePath(hub) as THREE.Path);
  p.add(extrudeC(body, 15.8, 0.6, 24), mat, at);
}
export function timingChain(s: 1 | -1) {
  const p = new Part();
  const { pts } = chainPath(s);
  const curve = new THREE.CatmullRomCurve3(pts.map((v) => new THREE.Vector3(v.x, v.y, 0)), true);
  const len = curve.getLength(); const n = Math.round(len / PITCH / 2) * 2;
  const z = CHAIN_Z[s];
  const inner = extrudeC(roundRect(PITCH + 6.2, 8.8, 4.4), 1.2, 0, 3);
  const outer = extrudeC(polyShape([[-PITCH / 2 - 3.6, -4.3], [-PITCH / 2 + 1.5, -3.2], [PITCH / 2 - 1.5, -3.2], [PITCH / 2 + 3.6, -4.3], [PITCH / 2 + 4.6, 0], [PITCH / 2 + 3.6, 4.3], [PITCH / 2 - 1.5, 3.2], [-PITCH / 2 + 1.5, 3.2], [-PITCH / 2 - 3.6, 4.3], [-PITCH / 2 - 4.6, 0]]), 1.2);
  const roller = yToZ(cyl(3.2, 5.6, 10));
  const pin = yToZ(cyl(1.7, 22.4, 6));
  for (let i = 0; i < n; i++) {
    const a = curve.getPointAt(i / n), b = curve.getPointAt(((i + 1) % n) / n);
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
  const X = CAM_X * s, z = CHAIN_Z[s];
  const rr = CAM_SPROCKET_R - 3.6, rt = CAM_SPROCKET_R + 3.4;
  for (const dz of [-ROW, ROW]) {
    const ring = gearShape(CAM_T, rr, rt, 0, true); ring.holes.push(circlePath(rr - 5) as THREE.Path);
    p.add(extrudeC(ring, 5.2, 0.4, 2), 'steel', [X, 0, z + dz]);
  }
  // web with 6 lightening holes (Porsche vernier: dowel + holes) and hub
  const web = circleShape(rr - 4);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; web.holes.push(circlePath(5.5, 25 * Math.cos(a), 25 * Math.sin(a)) as THREE.Path); }
  web.holes.push(circlePath(11) as THREE.Path);
  p.add(extrudeC(web, 6, 0.6, 24), 'steel', [X, 0, z]);
  p.add(yToZ(lathe([[11, -8], [18, -8], [18, -3], [16, 0], [16, 7], [11, 7]], 32)), 'steel', [X, 0, z + 6]);
  // sprocket flange behind (#36), seated on the cam nose
  p.add(yToZ(lathe([[11, -5], [21, -5], [21, 0], [11, 0]], 32)), 'darkSteel', [X, 0, z - 6]);
  // nut + thrust washer (#38/#39)
  p.add(yToZ(cyl(15, 2.5, 32)), 'polishedSteel', [X, 0, z + 14.5]);
  p.add(yToZ(hexNut(22, 9)), 'darkSteel', [X, 0, z + 20]);
  p.add(yToZ(cyl(3.5, 5, 10)), 'brass', [X + 14 * s, 8, z + 8]); // dowel
  return p.g;
}
/** Chain tensioner (chain adjuster #10), idler arm (#5), idler sprocket (#6), guide ramps (#2). */
export function chainTensioner(s: 1 | -1) {
  const p = new Part();
  const z = CHAIN_Z[s];
  const T = tensionerLayout(s);
  const { up1, up2, lo1, lo2, nUp, nLo } = chainPath(s);
  // idler sprocket (duplex, 15 T) on a stub shaft
  duplexSprocket(p, IDLER_T, T.idlerR, [T.idler.x, T.idler.y, z], 6);
  p.add(yToZ(cyl(6, 24, 12)), 'polishedSteel', [T.idler.x, T.idler.y, z]);
  // forged idler arm behind the chain: pivot boss -> idler hub -> tail pad
  const armPts = hull([...circlePts(T.pivot.x, T.pivot.y, 10, 16), ...circlePts(T.idler.x, T.idler.y, 9, 16), ...circlePts(T.tail.x, T.tail.y, 6.5, 12)]);
  p.add(extrudeC(polyShape(armPts), 6, 0.8), 'forgedDark', [0, 0, z - 15]);
  p.add(yToZ(cyl(10, 18, 20)), 'forgedDark', [T.pivot.x, T.pivot.y, z - 9]);
  p.add(yToZ(cyl(7, 28, 16)), 'polishedSteel', [T.pivot.x, T.pivot.y, z - 6]); // idler arm shaft (#3)
  // hydraulic chain adjuster, inclined in the lower inner corner: alu body, plunger tip against the arm tail
  const zz = z - 4;
  const adj = new Part();
  adj.add(lathe([[0, -T.adjLen], [11, -T.adjLen], [12.5, -T.adjLen + 4], [12.5, -14], [11, -10], [8, -10], [8, -2], [0, -2]], 28), 'castAlu');
  for (let k = 0; k < 3; k++) adj.add(cyl(13.3, 1.3, 28), 'castAlu', [0, -24 - k * 10, 0]);
  adj.add(cyl(5, 10, 14), 'polishedSteel', [0, 3, 0]);
  adj.add(lathe([[0, 0], [6.5, 0], [6.5, 2.5], [3, 4.5], [0, 4.5]], 14), 'steel', [0, 7.5, 0]);
  // mounting flange across the body (bolted to the housing back wall boss)
  const fl = extrudeC(polyShape(hull([...circlePts(-18, 0, 6, 10), ...circlePts(18, 0, 6, 10), ...circlePts(0, 0, 14, 16)])), 4);
  fl.rotateX(Math.PI / 2);
  adj.add(fl, 'castAlu', [0, -18, 0]);
  adj.add(hexNut(15, 7), 'zincPlate', [0, -T.adjLen - 3.5, 0]);
  const ang = Math.atan2(T.axis.y, T.axis.x) - Math.PI / 2;
  adj.g.rotation.z = ang; adj.g.position.set(T.adj.x, T.adj.y, zz);
  p.g.add(adj.g);
  // plastic guide ramps (#2): above the upper (tight) run near the inner edge, and under the lower run at the int exit
  const ramp = (a: THREE.Vector2, b: THREE.Vector2, n: THREE.Vector2, f0: number, f1: number, outside: boolean) => {
    const off = outside ? 9.5 : -5.5;
    const A = a.clone().lerp(b, f0).add(n.clone().multiplyScalar(off)), B = a.clone().lerp(b, f1).add(n.clone().multiplyScalar(off));
    const d = B.clone().sub(A); const an = Math.atan2(d.y, d.x);
    const g = extrudeC(roundRect(d.length(), 6, 2.5), 21, 0.6, 3); g.rotateZ(an);
    p.add(g, 'blackPlastic', [(A.x + B.x) / 2, (A.y + B.y) / 2, z]);
    const c = extrudeC(roundRect(d.length() * 0.8, 5, 2), 5); c.rotateZ(an);
    p.add(c, 'castAlu', [(A.x + B.x) / 2 + n.x * (outside ? 3 : -3), (A.y + B.y) / 2 + n.y * (outside ? 3 : -3), z - 13.5]);
  };
  ramp(up1, up2, nUp, 0.45, 0.78, true);
  ramp(lo1, lo2, nLo, 0.42, 0.55, false);
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
  p.add(boxMM([CHAIN_BOX_INNER_X * s - (s > 0 ? 0 : 6), yBot, HOUSING_Z0], [CHAIN_BOX_INNER_X * s + (s > 0 ? 6 : 0), yBot + 8, HOUSING_Z1]), 'castAlu');
  p.add(boxMM([CHAIN_BOX_INNER_X * s - (s > 0 ? 0 : 6), yTop - 8, HOUSING_Z0], [CHAIN_BOX_INNER_X * s + (s > 0 ? 6 : 0), yTop, HOUSING_Z1]), 'castAlu');
  // cast bolt bosses with studs for the cover (~13 per box)
  for (const b of outlineBolts(o, 58, inPassage(s))) {
    const x = b.x - b.nx * 2, y = b.y - b.ny * 2;
    const z0b = x * s > CAM_END_X - 4 ? CAM_HOUSING_END_Z + 5 : HOUSING_Z0 + 4;
    p.add(yToZ(cyl(5.5, HOUSING_Z1 - z0b, 14)), 'castAlu', [x, y, (z0b + HOUSING_Z1) / 2]);
    p.add(yToZ(cyl(3, 14, 8)), 'zincPlate', [x, y, HOUSING_Z1 + 4]);
  }
  // external ribs on the outer wall
  for (const b of outlineBolts(o, 110, (x) => x * s < CHAIN_BOX_INNER_X + 10)) {
    const g = boxMM([-1.5, 0, CAM_HOUSING_END_Z + 2], [1.5, 5, HOUSING_Z1 - 6]);
    g.rotateZ(Math.atan2(b.ny, b.nx) - Math.PI / 2); g.translate(b.x, b.y, 0); p.add(g, 'castAlu');
  }
  // internal bosses: idler-arm shaft & tensioner seat
  p.add(yToZ(cyl(12, CHAIN_Z[s] - 16 - HOUSING_Z0, 18)), 'castAlu', [T.pivot.x, T.pivot.y, (HOUSING_Z0 + CHAIN_Z[s] - 16) / 2]);
  p.add(yToZ(cyl(15, CHAIN_Z[s] - 15 - 14 - HOUSING_Z0, 18)), 'castAlu', [T.adjBase.x + T.axis.x * 30, T.adjBase.y + T.axis.y * 30, (HOUSING_Z0 + CHAIN_Z[s] - 29) / 2]);
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
  const z0 = HOUSING_Z1 + 0.5, t = 4.5;
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
  // perimeter nuts + washers on the housing studs
  for (const b of outlineBolts(chainOutline(s, 0), 58, inPassage(s))) {
    const x = b.x - b.nx * 2, y = b.y - b.ny * 2;
    p.add(yToZ(cyl(5.8, 1.2, 14)), 'zincPlate', [x, y, zt + 0.6]);
    p.add(yToZ(hexNut(10, 5.5)), 'zincPlate', [x, y, zt + 4]);
  }
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
  for (const s of [1, -1] as const) duplexSprocket(p, INT_T, INT_SPROCKET_R, [0, INT_SHAFT_Y, CHAIN_Z[s]], 9);
  p.add(yToZ(hexNut(18, 7)), 'darkSteel', [0, INT_SHAFT_Y, z1 + 3]);
  // splined coupling end for the oil-pump connecting shaft (flywheel end)
  p.add(yToZ(cyl(11, 12, 16)), 'darkSteel', [0, INT_SHAFT_Y, z0 - 2]);
  return p.g;
}
