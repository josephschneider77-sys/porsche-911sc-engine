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
  // pulley-end nose (bearing 8, intermediate shaft end, oil pump)
  const nose = new THREE.Shape();
  if (s > 0) { nose.moveTo(0, -124); nose.lineTo(52, -124); nose.lineTo(60, -60); nose.lineTo(44, 30); nose.lineTo(0, 46); nose.closePath(); }
  else { nose.moveTo(0, -124); nose.lineTo(0, 46); nose.lineTo(-44, 30); nose.lineTo(-60, -60); nose.lineTo(-52, -124); nose.closePath(); }
  nose.holes.push(circlePath(26, 0, 0) as THREE.Path);
  const ng = extrude(nose, 46, 2); ng.translate(0, 0, z1); p.add(ng, 'castAlu');
  for (const [x, y] of [[40, -110], [50, -40], [30, 30]] as const) p.add(yToZ(hexNut(10, 6)), 'zincPlate', [X(x), y, z1 + 49]);
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
  p.add(yToZ(cyl(15, CH_Z1 - CH_Z0 + 30, 24)), 'darkSteel', [X, 0, (CH_Z0 + CH_Z1) / 2 + 15]);
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

// ---------------------------------------------------------------- cam chain drive (103-10/-15), duplex 3/8" roller chain
const PITCH = 9.525;
const INT_SPROCKET_R = PITCH / (2 * Math.sin(Math.PI / 24)); // 24 T
const CAM_SPROCKET_R = PITCH / (2 * Math.sin(Math.PI / 36)); // 36 T
/** Chain plane (centre of the duplex chain) per bank. */
export const CHAIN_Z: Record<1 | -1, number> = { 1: 239, [-1]: 221 } as any;
const ROW = 5.1; // duplex row offset from chain centre
const HOUSING_Z1 = CASE_Z.pulley + 42; // chain housing face (lid seat)

function chainPath(s: 1 | -1) {
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
  // lower (slack, below the loop) run: tangent points at angle (base - beta) for s=1, (base + beta) for s=-1
  const al = s > 0 ? base - beta : base + beta;
  const lo1 = new THREE.Vector2(c1.x + r1 * Math.cos(al), c1.y + r1 * Math.sin(al));
  const lo2 = new THREE.Vector2(c2.x + r2 * Math.cos(al), c2.y + r2 * Math.sin(al));
  const au = s > 0 ? base + beta : base - beta;
  const up1 = new THREE.Vector2(c1.x + r1 * Math.cos(au), c1.y + r1 * Math.sin(au));
  const up2 = new THREE.Vector2(c2.x + r2 * Math.cos(au), c2.y + r2 * Math.sin(au));
  const nLo = new THREE.Vector2(Math.cos(al), Math.sin(al)); // outward normal of lower run
  const nUp = new THREE.Vector2(Math.cos(au), Math.sin(au));
  return { pts, c1, c2, lo1, lo2, up1, up2, nLo, nUp };
}
/** Tensioner geometry: idler sprocket on the slack run, arm pivot, hydraulic adjuster below. */
function tensionerLayout(s: 1 | -1) {
  const { lo1, lo2, nLo } = chainPath(s);
  const t = 0.58; // along the lower run from the intermediate sprocket
  const onRun = lo1.clone().lerp(lo2, t);
  const idlerR = PITCH / (2 * Math.sin(Math.PI / 15));
  const idler = onRun.clone().add(nLo.clone().multiplyScalar(idlerR - 1.5));
  const dir = lo2.clone().sub(lo1).normalize();
  const pivot = idler.clone().add(dir.clone().multiplyScalar(-52)).add(nLo.clone().multiplyScalar(14));
  const tail = idler.clone().add(dir.clone().multiplyScalar(30)).add(nLo.clone().multiplyScalar(10));
  const adj = new THREE.Vector2(tail.x, tail.y - 18); // plunger tip under arm tail
  return { idler, idlerR, pivot, tail, adj, adjLen: 64 };
}
function duplexSprocket(p: Part, teeth: number, r: number, at: V3, hub: number, mat: MatKey = 'steel') {
  const rr = r - 3.6, rt = r + 3.4;
  for (const dz of [-ROW, ROW]) {
    const ring = gearShape(teeth, rr, rt, 0, true); ring.holes.push(circlePath(rr - 4) as THREE.Path);
    p.add(extrudeC(ring, 5.2, 0.4, 2), mat, [at[0], at[1], at[2] + dz]);
  }
  // body between/under the rows
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
    const ring = gearShape(36, rr, rt, 0, true); ring.holes.push(circlePath(rr - 5) as THREE.Path);
    p.add(extrudeC(ring, 5.2, 0.4, 2), 'steel', [X, 0, z + dz]);
  }
  // dished web with 6 lightening holes + 4 adjuster slots (Porsche vernier: dowel + holes)
  const web = circleShape(rr - 4);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; web.holes.push(circlePath(8.5, 33 * Math.cos(a), 33 * Math.sin(a)) as THREE.Path); }
  web.holes.push(circlePath(13) as THREE.Path);
  p.add(extrudeC(web, 6, 0.6, 24), 'steel', [X, 0, z]);
  p.add(yToZ(lathe([[13, -8], [24, -8], [24, -3], [20, 0], [20, 8], [13, 8]], 36)), 'steel', [X, 0, z + 6]);
  // sprocket flange behind (#36) with dowel holes
  p.add(yToZ(lathe([[13, -6], [27, -6], [27, 0], [13, 0]], 36)), 'darkSteel', [X, 0, z - 7]);
  // big nut + thrust washer (#38/#39)
  p.add(yToZ(cyl(19, 3, 32)), 'polishedSteel', [X, 0, z + 15.5]);
  p.add(yToZ(hexNut(27, 11)), 'darkSteel', [X, 0, z + 22.5]);
  p.add(yToZ(cyl(4, 5, 10)), 'brass', [X + 18 * s, 10, z + 9]); // dowel
  return p.g;
}
/** Chain tensioner (chain adjuster #10), idler arm (#5), idler sprocket (#6), guide ramps (#2). */
export function chainTensioner(s: 1 | -1) {
  const p = new Part();
  const z = CHAIN_Z[s];
  const T = tensionerLayout(s);
  const { up1, up2, lo1, lo2, nUp, nLo, c1 } = chainPath(s);
  // idler sprocket (duplex, 15 T) on a stub shaft
  duplexSprocket(p, 15, T.idlerR, [T.idler.x, T.idler.y, z], 6);
  p.add(yToZ(cyl(6, 26, 12)), 'polishedSteel', [T.idler.x, T.idler.y, z]);
  // forged idler arm: pivot boss -> idler hub -> tail pad, behind the chain
  const armPts = hull([...circlePts(T.pivot.x, T.pivot.y, 11, 16), ...circlePts(T.idler.x, T.idler.y, 10, 16), ...circlePts(T.tail.x, T.tail.y, 7, 12)]);
  p.add(extrudeC(polyShape(armPts), 7, 1), 'forgedDark', [0, 0, z - 15]);
  p.add(yToZ(cyl(11, 22, 20)), 'forgedDark', [T.pivot.x, T.pivot.y, z - 8]);
  p.add(yToZ(cyl(7.5, 30, 16)), 'polishedSteel', [T.pivot.x, T.pivot.y, z - 6]); // idler arm shaft (#3)
  // hydraulic chain adjuster: body (alu), sealing flange, plunger up against the arm tail
  const ax = T.adj.x, ay = T.adj.y, zz = z - 15;
  p.add(lathe([[0, -T.adjLen], [12, -T.adjLen], [13.5, -T.adjLen + 4], [13.5, -14], [12, -10], [9, -10], [9, -2], [0, -2]], 28), 'castAlu', [ax, ay, zz]);
  for (let k = 0; k < 3; k++) p.add(cyl(14.4, 1.4, 28), 'castAlu', [ax, ay - 26 - k * 11, zz]); // turned grooves
  p.add(cyl(5.5, 12, 14), 'polishedSteel', [ax, ay + 4, zz]);
  p.add(lathe([[0, 0], [7, 0], [7, 3], [3, 5], [0, 5]], 14), 'steel', [ax, ay + 9.5, zz]);
  // flange ears (bolted to housing) and the bottom hex plug
  const fl = hull([...circlePts(ax - 22, 0, 7, 10), ...circlePts(ax + 22, 0, 7, 10), ...circlePts(ax, 0, 15, 16)]);
  const flg = extrudeC(polyShape(fl.map(([x, yv]) => [x - ax, yv] as [number, number])), 4); flg.rotateX(Math.PI / 2);
  p.add(flg, 'castAlu', [ax, ay - 16, zz]);
  for (const dx of [-22, 22]) p.add(hexNut(10, 5), 'zincPlate', [ax + dx, ay - 11.5, zz]);
  p.add(hexNut(17, 8), 'zincPlate', [ax, ay - T.adjLen - 4, zz]);
  // plastic guide ramps (#2): inside the loop under the upper run, and at the int-sprocket exit of the lower run
  const ramp = (a: THREE.Vector2, b: THREE.Vector2, n: THREE.Vector2, f0: number, f1: number) => {
    const A = a.clone().lerp(b, f0).add(n.clone().multiplyScalar(-5.5)), B = a.clone().lerp(b, f1).add(n.clone().multiplyScalar(-5.5));
    const d = B.clone().sub(A); const ang = Math.atan2(d.y, d.x);
    const g = extrudeC(roundRect(d.length(), 7, 3), 21, 0.6, 3); g.rotateZ(ang);
    p.add(g, 'blackPlastic', [(A.x + B.x) / 2 - n.x * 3.5, (A.y + B.y) / 2 - n.y * 3.5, z]);
    // aluminium carrier + 2 mounting bolts
    const c = extrudeC(roundRect(d.length() * 0.8, 6, 2), 6); c.rotateZ(ang);
    p.add(c, 'castAlu', [(A.x + B.x) / 2 - n.x * 9, (A.y + B.y) / 2 - n.y * 9, z - 13]);
  };
  ramp(up1, up2, nUp, 0.25, 0.8);
  ramp(lo1, lo2, nLo, 0.06, 0.34);
  void c1;
  return p.g;
}
/** Chain housing outline (engine XY, mm): int-shaft lobe, cam boss, tensioner pocket, straight top edge. */
function chainOutline(s: 1 | -1, grow: number): [number, number][] {
  const T = tensionerLayout(s);
  const pts = hull([
    ...circlePts(34 * s, INT_SHAFT_Y + 6, 50 + grow, 24),
    ...circlePts(CAM_X * s, 0, CAM_SPROCKET_R + 17 + grow, 36),
    ...circlePts(T.adj.x, T.adj.y - T.adjLen + 12, 21 + grow, 14),
  ]);
  return pts;
}
function outlineBolts(o: [number, number][], every: number) {
  // points evenly spaced along the polyline perimeter
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
  // make normals point outward from centroid
  const cx = o.reduce((t, p) => t + p[0], 0) / o.length, cy = o.reduce((t, p) => t + p[1], 0) / o.length;
  for (const q of out) if ((q.x - cx) * q.nx + (q.y - cy) * q.ny < 0) { q.nx *= -1; q.ny *= -1; }
  return out;
}
function shapeFrom(o: [number, number][], holes: [number, number][][] = []) {
  const sh = polyShape(o);
  for (const h of holes) { const p = new THREE.Path(); const r = h.slice().reverse(); p.moveTo(r[0][0], r[0][1]); r.slice(1).forEach(([x, y]) => p.lineTo(x, y)); p.closePath(); sh.holes.push(p); }
  return sh;
}
export function chainHousing(s: 1 | -1) {
  const p = new Part();
  const o = chainOutline(s, 0), i = chainOutline(s, -6);
  const D = HOUSING_Z1 - CASE_Z.pulley;
  p.add(extrude(shapeFrom(o, [i]), D, 0.8, 6), 'castAlu', [0, 0, CASE_Z.pulley]);
  // back wall with shaft openings
  const bw = shapeFrom(o); bw.holes.push(circlePath(30, CAM_X * s, 0) as THREE.Path); bw.holes.push(circlePath(40, 0, INT_SHAFT_Y) as THREE.Path);
  p.add(extrude(bw, 3), 'castAlu', [0, 0, CASE_Z.pulley]);
  // outer flange lip at the lid face, and cast bolt bosses (ears) around the perimeter with studs
  p.add(extrude(shapeFrom(chainOutline(s, 3), [chainOutline(s, -2)]), 5, 0.6, 6), 'castAlu', [0, 0, HOUSING_Z1 - 5]);
  for (const b of outlineBolts(o, 54)) {
    const x = b.x + b.nx * 2.5, y = b.y + b.ny * 2.5;
    p.add(yToZ(cyl(6, D - 6, 14)), 'castAlu', [x, y, CASE_Z.pulley + (D - 6) / 2 + 4]);
    p.add(yToZ(cyl(3, 14, 8)), 'zincPlate', [x, y, HOUSING_Z1 + 4]);
  }
  // external ribs running down the outer wall to the case flange
  for (const b of outlineBolts(o, 120)) {
    const g = boxMM([-1.6, 0, CASE_Z.pulley + 2], [1.6, 7, HOUSING_Z1 - 6]);
    g.rotateZ(Math.atan2(b.ny, b.nx) - Math.PI / 2); g.translate(b.x, b.y, 0); p.add(g, 'castAlu');
  }
  // internal webs: tensioner bore boss and idler-arm shaft boss
  const T = tensionerLayout(s);
  p.add(yToZ(cyl(13, D - 4, 18)), 'castAlu', [T.pivot.x, T.pivot.y, CASE_Z.pulley + (D - 4) / 2]);
  return p.g;
}
export function chainHousingLid(s: 1 | -1) {
  const p = new Part();
  const o = chainOutline(s, 3);
  const z0 = HOUSING_Z1 + 0.5;
  p.add(extrude(shapeFrom(o), 4.5, 1.2, 8), 'castAlu', [0, 0, z0]);
  // raised cam-sprocket dome with machined centre plug, stiffening ribs
  p.add(yToZ(lathe([[0, 0], [CAM_SPROCKET_R + 12, 0], [CAM_SPROCKET_R + 8, 8], [34, 13], [0, 13]], 48)), 'castAlu', [CAM_X * s, 0, z0 + 4]);
  p.add(yToZ(lathe([[0, 0], [22, 0], [22, 3], [19, 4], [0, 4]], 36)), 'machinedAlu', [CAM_X * s, 0, z0 + 17]);
  const T = tensionerLayout(s);
  const ribTo = (x1: number, y1: number, x2: number, y2: number, h = 6) => {
    const d = Math.hypot(x2 - x1, y2 - y1); const g = boxMM([-d / 2, -1.6, 0], [d / 2, 1.6, h]);
    g.rotateZ(Math.atan2(y2 - y1, x2 - x1)); g.translate((x1 + x2) / 2, (y1 + y2) / 2, z0 + 4); p.add(g, 'castAlu');
  };
  ribTo(CAM_X * s, 0, 30 * s, INT_SHAFT_Y + 10);
  ribTo(CAM_X * s, 0, T.adj.x, T.adj.y - 30);
  ribTo(30 * s, INT_SHAFT_Y + 10, T.adj.x, T.adj.y - 30);
  // idler shaft cap + tensioner access boss
  p.add(yToZ(cyl(14, 7, 24)), 'castAlu', [T.pivot.x, T.pivot.y, z0 + 7]);
  p.add(yToZ(hexNut(12, 5)), 'zincPlate', [T.pivot.x, T.pivot.y, z0 + 12.5]);
  // perimeter nuts + washers on the housing studs
  for (const b of outlineBolts(chainOutline(s, 0), 54)) {
    const x = b.x + b.nx * 2.5, y = b.y + b.ny * 2.5;
    p.add(yToZ(cyl(6, 1.2, 14)), 'zincPlate', [x, y, z0 + 5.1]);
    p.add(yToZ(hexNut(10, 6)), 'zincPlate', [x, y, z0 + 8.6]);
  }
  return p.g;
}

/** Intermediate shaft (103-15 #43): crank-driven gear + two duplex chain sprockets. */
export function intermediateShaft() {
  const p = new Part();
  p.add(yToZ(cyl(14, 330, 24)), 'steel', [0, INT_SHAFT_Y, 80]);
  for (const z of [-60, 150]) p.add(yToZ(cyl(19, 16, 24)), 'polishedSteel', [0, INT_SHAFT_Y, z]);
  p.add(extrudeC(gearShape(48, 45, 49.5, 14), 14, 0.4), 'steel', [0, INT_SHAFT_Y, 199]);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; p.add(yToZ(cyl(6, 15, 12)), 'darkSteel', [28 * Math.cos(a), INT_SHAFT_Y + 28 * Math.sin(a), 199]); }
  for (const s of [1, -1] as const) duplexSprocket(p, 24, INT_SPROCKET_R, [0, INT_SHAFT_Y, CHAIN_Z[s]], 14);
  p.add(yToZ(cyl(18, 50, 24)), 'steel', [0, INT_SHAFT_Y, 230]);
  p.add(yToZ(hexNut(22, 8)), 'darkSteel', [0, INT_SHAFT_Y, 252]);
  return p.g;
}
