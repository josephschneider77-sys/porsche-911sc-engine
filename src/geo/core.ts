/**
 * Bottom end + top end assets (crankcase, crank, rods, pistons, cylinders, heads, valve train, cam drive).
 * Shapes traced from the Porsche 911 1978-83 parts catalogue illustrations (groups 101-103) and scaled with
 * published / measured dimensions (see docs/engine-spec.md). All units mm.
 */
import * as THREE from 'three';
import {
  Part, V3, DEG, lathe, boxMM, cyl, cylBetween, yToZ, yToX, roundRect, circlePath, circleShape, ringShape,
  polyShape, hull, circlePts, gearShape, timingGearShape, sprocketRingShape, extrude, extrudeC, hexNut, tube, torus, spring, paramSurface, plate, gusset, csgSub, woodruffGeom, cutGroup, subtractSolids,
} from './util';
import {
  SPEC, SPARK_Z, CYL_Z, MAIN_Z, THROW_DEG, DECK_X, CYL_TOP_X, HEAD_OUT_X, CAM_X, CAM_HOUSING_OUT_X, INT_SHAFT_Y, CASE_Z, NOSE_BEARING_Z,
} from '../data/layout';
import type { MatKey } from './materials';
import { HEAD_HW, CASE_TB, CASE_LUG } from './hwLayout';

/** Chain plane (centre of the duplex chain) per bank: in front of the cam-housing end (z 222), rows clear of each other. */
export const CHAIN_Z: Record<1 | -1, number> = { 1: 258, [-1]: 235 } as any;

export const CRANK_GEAR_T = 35;

export const bankZ = (s: 1 | -1) => (s === 1 ? [CYL_Z[1], CYL_Z[2], CYL_Z[3]] : [CYL_Z[4], CYL_Z[5], CYL_Z[6]]);

// ---------------------------------------------------------------- crankcase half (101-05 left / 101-10 right)
/**
 * Pressure-cast aluminium half (SC: aluminium, not magnesium). The section changes along the crank:
 * flat top split flange (perimeter nuts and cast bosses flush with the rail), a scalloped bottom edge, a sloping shoulder, a belly that
 * curves inward under the crank, and a deck of three proud spigot bosses with recessed joins between
 * them. The bay is a deep tub — thick saddle webs inboard of the spigot tunnels, a far wall behind
 * them — so the bores read as open holes and the split face is not a row of see-through slots.
 * Chain well stays at the pulley end (+Z): that is where the cam-drive chain housings bolt on.
 */
const CASE_CAST: MatKey = 'sandCast';
export function crankcaseHalf(s: 1 | -1) {
  const p = new Part();
  const z0 = CASE_Z.flywheel, z1 = CASE_Z.pulley;
  const X = (x: number) => x * s;
  const cyls = bankZ(s).slice().sort((a, b) => a - b);
  const CAST = CASE_CAST;

  const toXY = (pts: [number, number][]) => pts.map(([y, z]) => [-z, y] as [number, number]);
  // Natural (y,z) walk — top toward +Z, back along the bottom — is clockwise once mapped to shape x = -z.
  const extrudeYZ = (outer: [number, number][], x0: number, thick: number, mat: MatKey, holes: [number, number, number][] = []) => {
    const sh = polyShape(toXY(outer).reverse());
    for (const [y, z, r] of holes) sh.holes.push(circlePath(r, -z, y) as THREE.Path);
    const g = extrude(sh, thick, 0, 8);
    g.rotateY(Math.PI / 2);
    g.translate(s > 0 ? x0 : -(x0 + thick), 0, 0);
    p.add(g, mat);
  };
  const scallop = (z: number, zs: readonly number[], amp: number) =>
    zs.reduce((a, zb) => a + amp * Math.exp(-(((z - zb) / 8.5) ** 2)), 0);
  /** Closed (y, z) loop. Outer edge carries one lobe per perimeter bolt; inner edge is the smooth cavity mouth. */
  const band = (outer: boolean): [number, number][] => {
    const yT = outer ? 112 : 96;
    const yB = outer ? -118 : -102;
    const zA = outer ? -198 : -182;
    const zB = outer ? 204 : 188;
    const endR = outer ? 20 : 12;
    // Top rail is flat. A scallop here reads as a fin comb from the pulley end.
    const ampTop = 0;
    const ampBot = outer ? 13 : 0;
    const pts: [number, number][] = [];
    const N = 120;
    const z0e = zA + endR, z1e = zB - endR;
    const yM = (yT + yB) / 2, yR = (yT - yB) / 2;
    for (let i = 0; i <= N; i++) {
      const z = z0e + (z1e - z0e) * (i / N);
      pts.push([yT + scallop(z, CASE_LUG.top, ampTop), z]);
    }
    for (let i = 1; i < 12; i++) {
      const a = Math.PI / 2 - (i / 12) * Math.PI;
      pts.push([yM + yR * Math.sin(a), z1e + endR * Math.cos(a)]);
    }
    for (let i = N; i >= 0; i--) {
      const z = z0e + (z1e - z0e) * (i / N);
      const drop = outer ? 12 * Math.exp(-(((z + 10) / 78) ** 2)) : 0;
      pts.push([yB - scallop(z, CASE_LUG.bottom, ampBot) - drop, z]);
    }
    for (let i = 1; i < 12; i++) {
      const a = -Math.PI / 2 - (i / 12) * Math.PI;
      pts.push([yM + yR * Math.sin(a), z0e + endR * Math.cos(a)]);
    }
    return pts;
  };
  const outerBand = band(true), innerBand = band(false);
  const flange = (mat: MatKey, x0: number, thick: number) => {
    const sh = polyShape(toXY(outerBand).reverse());
    const hole = toXY(innerBand);
    const path = new THREE.Path();
    path.moveTo(hole[0][0], hole[0][1]);
    for (let i = 1; i < hole.length; i++) path.lineTo(hole[i][0], hole[i][1]);
    path.closePath();
    sh.holes.push(path);
    const g = extrude(sh, thick, 0, 5);
    g.rotateY(Math.PI / 2);
    g.translate(s > 0 ? x0 : -(x0 + thick), 0, 0);
    p.add(g, mat);
  };
  // bright machined parting face, cast body of the flange just behind it
  flange('machinedAlu', 0, 1.5);
  flange(CAST, 1.3, 6.5);

  // closed lofts: shoulder slopes down onto the deck, belly tucks inward and sags under the crank
  const crown = (z: number) => {
    let y = 28;
    for (const zc of cyls) {
      const d = Math.abs(z - zc);
      const R = 72;
      if (d < R) y = Math.max(y, Math.sqrt(R * R - d * d) * 0.8);
    }
    return y;
  };
  const loft = (section: (z: number) => [number, number][], zA: number, zB: number) => {
    const n = section(zA).length;
    p.add(paramSurface((u, v) => {
      const z = zA + (zB - zA) * u;
      const sec = section(z);
      const f = Math.min(n - 1e-4, v * n);
      const i = Math.floor(f);
      const t = f - i;
      const a = sec[i], b = sec[(i + 1) % n];
      return [(a[0] + (b[0] - a[0]) * t) * s, a[1] + (b[1] - a[1]) * t, z];
    }, 64, n * 3), CAST);
  };
  loft((z) => {
    const c = crown(z);
    return [[8, 104], [60, c + 2], [48, Math.max(24, c - 16)], [14, 90]];
  }, z0 + 6, z1 - 6);
  loft((z) => {
    const drop = 22 * Math.exp(-(((z + 8) / 96) ** 2));
    const tuck = 12 * Math.exp(-(((z + 8) / 120) ** 2));
    // Tuck the belly inboard of the oil-pump cover nuts at the flywheel end (z ≈ -161).
    const pump = Math.exp(-(((z + 158) / 22) ** 2));
    // Inner corner stays outside the intermediate-shaft tunnel (the old [10, −88] ran through the shaft).
    const open: [number, number][] = [[28, -104], [52, -56 - drop * 0.12], [68 - tuck, -100 - drop], [16, -116 - drop * 0.4]];
    const clear: [number, number][] = [[8, -124], [14, -128], [20, -134], [10, -136]];
    return open.map((q, i) => [q[0] + (clear[i][0] - q[0]) * pump, q[1] + (clear[i][1] - q[1]) * pump] as [number, number]);
  }, z0 + 6, z1 - 6);

  // far wall of the tub. Outline necks between the bores; only the three spigot circles are open.
  const env = (z: number, sign: 1 | -1) => {
    let y = sign * 26;
    if (sign < 0) y -= 12 * Math.exp(-(((z + 10) / 90) ** 2));
    for (const zc of cyls) {
      const d = Math.abs(z - zc);
      const R = 52;
      if (d < R) {
        const h = Math.sqrt(R * R - d * d) + 2;
        y = sign > 0 ? Math.max(y, h) : Math.min(y, -h);
      }
    }
    return y;
  };
  const wallZA = Math.max(z0 + 6, Math.min(...cyls) - 58);
  const wallZB = Math.min(z1 - 8, Math.max(...cyls) + 58);
  const wall: [number, number][] = [];
  const WN = 72;
  for (let i = 0; i <= WN; i++) {
    const z = wallZA + (wallZB - wallZA) * i / WN;
    wall.push([env(z, 1), z]);
  }
  for (let i = WN; i >= 0; i--) {
    const z = wallZA + (wallZB - wallZA) * i / WN;
    wall.push([env(z, -1), z]);
  }
  extrudeYZ(wall, 66, 12, CAST, cyls.map((z) => [0, z, 46.2]));

  // one barrel boss per spigot: open bore, bright counterbore ring, stud bosses just outside the ring
  for (const zc of cyls) {
    const boss = yToX(lathe([
      [46.4, 0], [52, 2], [76, 9], [76, 16], [56, 23], [50.2, 27.5], [46.4, 29.5],
    ], 48));
    if (s < 0) boss.rotateZ(Math.PI);
    const root = (DECK_X - 29.5) * s;
    p.add(boss, CAST, [root, 0, zc]);
    const face = yToX(lathe([[46.3, 0], [50.4, 0], [50.4, 2.2], [46.3, 2.2]], 48));
    if (s < 0) face.rotateZ(Math.PI);
    p.add(face, 'machinedAlu', [(DECK_X - 2.2) * s, 0, zc]);
    const liner = yToX(lathe([[45.0, 0.8], [46.2, 0.8], [46.2, 20], [45.0, 20]], 32));
    if (s < 0) liner.rotateZ(Math.PI);
    p.add(liner, 'bore', [root, 0, zc]);
    for (const a of [45, 135, 225, 315]) {
      const yy = 57 * Math.sin(a * DEG), zz = 57 * Math.cos(a * DEG);
      p.add(yToX(cyl(6.4, 8, 14)), CAST, [(DECK_X - 7) * s, yy, zc + zz]);
      p.add(yToX(cyl(5.5, 1.3, 12)), 'machinedAlu', [(DECK_X - 2.4) * s, yy, zc + zz]);
      p.add(cylBetween([(DECK_X - 5) * s, yy, zc + zz], [(HEAD_OUT_X - 4) * s, yy, zc + zz], 4.6, 10), 'zincPlate');
    }
  }
  // narrow recessed bridge in each cusp between bosses, set back from the spigot face
  for (let i = 0; i < cyls.length - 1; i++) {
    const zm = (cyls[i] + cyls[i + 1]) / 2;
    p.add(boxMM([s > 0 ? 76 : -90, -16, zm - 6], [s > 0 ? 90 : -76, 16, zm + 6]), CAST);
  }

  // thick saddle webs. They stop inboard of the spigot tunnel so the bore mouth stays a clean circle.
  const SADDLE_R = 33.2;
  const disk = (r: number, x: number, y: number) => {
    const h = new THREE.Path(); h.absarc(x * s, y, r, 0, Math.PI * 2, s > 0); return h;
  };
  const notch = (x0: number, y0: number, x1: number, y1: number) => {
    const h = new THREE.Path();
    const a: [number, number][] = [[x0 * s, y0], [x0 * s, y1], [x1 * s, y1], [x1 * s, y0]];
    const q = s > 0 ? a : a.slice().reverse();
    h.moveTo(q[0][0], q[0][1]); q.slice(1).forEach(([x, y]) => h.lineTo(x, y)); h.closePath(); return h;
  };
  const addProfile = (pts: [number, number][], zA: number, zB: number, mat: MatKey, holes: THREE.Path[] = []) => {
    if (zB - zA < 0.4) return;
    const m = pts.map(([x, y]) => [x * s, y] as [number, number]);
    const sh = polyShape(s > 0 ? m : m.slice().reverse());
    for (const h of holes) sh.holes.push(h);
    const g = extrude(sh, zB - zA, 0, 8); g.translate(0, 0, zA); p.add(g, mat);
  };
  // solid sump wall under the bay (same section as the pre-sculpt case) so relief valves and oil fittings
  // seat on the outside bottom instead of a ray slipping through the thin belly into the crank
  // Semicircular relief on the split (r 17.5 about the intermediate shaft) so the shaft,
  // the Ø32 flange land and the thrust collar are not buried in the sump wall. Each half
  // bulges the relief into its own x, and the outer belly stays so the oil fittings still seat.
  const boreR = 17.5, cy = INT_SHAFT_Y;
  const sump: [number, number][] = [[0, -56], [0, cy + boreR]];
  for (let i = 1; i < 12; i++) {
    const a = Math.PI / 2 - (i / 12) * Math.PI;
    sump.push([boreR * Math.cos(a), cy + boreR * Math.sin(a)]);
  }
  sump.push([0, cy - boreR], [0, -120], [14, -128], [40, -126], [70, -118], [90, -104], [84, -90], [60, -74], [32, -62]);
  addProfile(sump, z0 + 4, z1 - 4, CAST);
  // Lower edge stays inboard of the oil-pump cover nuts (y ≈ -88, |x| ≈ 28) at the flywheel main.
  const WEB: [number, number][] = [
    [0, 96], [24, 92], [50, 70], [50, 46], [40, 36], [40, -28], [26, -50], [22, -68], [22, -104], [0, -100],
  ];
  for (const z of MAIN_Z) {
    // Flywheel main stays clear of the oil-pump cover nuts; the others are the thick saddle webs.
    const half = z < -160 ? 8 : 14;
    addProfile(WEB, z - half, z + half, CAST, [disk(SADDLE_R, 0, 0), disk(16, 0, INT_SHAFT_Y), notch(0, 30.5, 7, 40)]);
    const seat = yToZ(lathe([[SADDLE_R - 0.4, -9], [SADDLE_R + 2.6, -9], [SADDLE_R + 2.6, 9], [SADDLE_R - 0.4, 9]], 36, s > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI));
    p.add(seat, 'machinedAlu', [0, 0, z]);
    const iSeat = yToZ(lathe([[13.6, -8], [17.2, -8], [17.2, 8], [13.6, 8]], 28, s > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI));
    p.add(iSeat, 'machinedAlu', [0, INT_SHAFT_Y, z]);
    for (const y of [46, -46]) {
      p.add(boxMM([s > 0 ? 0 : -4, y - 7.5, z - 10], [s > 0 ? 4 : 0, y + 7.5, z + 10]), 'machinedAlu');
      p.add(yToX(cyl(4.2, 3.4, 14)), 'bore', [X(1.8), y, z]);
    }
  }

  // rounded end bulkheads (rear main, and the nose passing into the chain well)
  const END: [number, number][] = [
    [0, 100], [18, 106], [46, 64], [58, 28], [58, -36], [44, -72], [20, -108], [0, -112],
  ];
  addProfile(END, z0, z0 + 8, CAST, [disk(46, 0, 0), disk(18, 0, INT_SHAFT_Y)]);
  addProfile(END, z1 - 7, z1, 'machinedAlu', [disk(38, 0, 0), disk(18, 0, INT_SHAFT_Y)]);

  // through-bolt bosses: seat face exactly at |x| = CASE_TB.x
  for (const z of CASE_TB.z) for (const y of CASE_TB.y) {
    p.add(yToX(cyl(12, 10, 16)), CAST, [X(90), y, z]);
    p.add(yToX(cyl(CASE_TB.r, CASE_TB.x - 95, 24)), CAST, [X((CASE_TB.x + 94) / 2 - 0.5), y, z]);
    p.add(yToX(cyl(CASE_TB.r, 1, 24)), 'machinedAlu', [X(CASE_TB.x - 0.5), y, z]);
  }
  // perimeter nut bosses, one per bolt, sitting in the flange lobes. Seat face at |x| = CASE_LUG.x.
  for (const [y, zs] of [[CASE_LUG.yTop, CASE_LUG.top], [CASE_LUG.yBot, CASE_LUG.bottom]] as const) for (const z of zs) {
    p.add(yToX(cyl(CASE_LUG.r, CASE_LUG.x, 16)), CAST, [X(CASE_LUG.x / 2), y, z]);
    p.add(yToX(cyl(CASE_LUG.r - 0.8, 1.2, 14)), 'machinedAlu', [X(CASE_LUG.x - 0.6), y, z]);
  }
  // sump-stud bosses: the strainer cover nuts thread upward into these (seat just above the plate)
  for (let i = 0; i < 12; i++) {
    const a = Math.PI / 12 + (i / 12) * Math.PI * 2;
    const x = 74 * Math.cos(a);
    if (x * s < 1) continue;
    const z = -10 + 74 * Math.sin(a);
    p.add(cyl(6.5, 8, 12), CAST, [x, -124, z]);
  }
  // oil-passage plugs on the lower flank (follow the belly, no straight gallery bar)
  for (const z of [-115, -40, 70, 155]) {
    const y = -104 - 10 * Math.exp(-(((z + 8) / 96) ** 2));
    p.add(yToX(cyl(8, 11, 12)), CAST, [X(52), y, z]);
    p.add(yToX(hexNut(12, 5)), 'darkSteel', [X(60), y, z]);
  }

  // flywheel end is a round seal boss, not a squared plate
  const bell = yToZ(new THREE.CylinderGeometry(56, 62, 12, 40, 1, true, s > 0 ? 0 : Math.PI, Math.PI));
  p.add(bell, CAST, [0, 2, z0 - 5]);
  p.add(yToZ(lathe([[44, -1.1], [58, -1.1], [58, 1.1], [44, 1.1]], 40, s > 0 ? 0 : Math.PI, Math.PI)), 'machinedAlu', [0, 2, z0 - 12]);
  for (const [x, y] of [[78, 58], [84, -54], [36, -100], [40, 92]] as const) {
    p.add(yToZ(cyl(8, 10, 14)), CAST, [X(x), y, z0 - 4]);
    p.add(yToZ(cyl(4.6, 22, 8)), 'zincPlate', [X(x), y, z0 - 10]);
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
      g.rotateZ(Math.atan2(by - ay, bx - ax)); g.translate((ax + bx) / 2, (ay + by) / 2, 0); p.add(g, CAST);
    }
  };
  strip(s > 0 ? top : top.slice().reverse());
  strip(s > 0 ? bot : bot.slice().reverse());
  const plate = polyShape(s > 0 ? [...bot, ...top] : [...bot, ...top].reverse());
  plate.holes.push(circlePath(29, 0, 0) as THREE.Path);
  p.add(extrude(plate, 6, 0, 8), CAST, [0, 0, W.z1 - 6]);
  const noseZ = 236;
  p.add(yToZ(lathe([[29, 0], [42, 0], [42, W.z1 - 6 - 220], [29, W.z1 - 6 - 220]], 32, s > 0 ? 0 : Math.PI, Math.PI)), CAST, [0, 0, 220]);
  p.add(yToZ(lathe([[26.2, -8], [32, -8], [32, 8], [26.2, 8]], 32, s > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI)), 'machinedAlu', [0, 0, noseZ]);
  for (const y of [40, -40]) {
    p.add(boxMM([s > 0 ? 0 : -4, y - 6, noseZ - 7], [s > 0 ? 4 : 0, y + 6, noseZ + 7]), 'machinedAlu');
    p.add(yToX(cyl(3.6, 3.2, 12)), 'bore', [X(1.6), y, noseZ]);
  }
  for (const q of chainHousingStuds(s)) p.add(yToX(cyl(7.5, CHAIN_BOX_INNER_X - 104, 14)), CAST, [X((CHAIN_BOX_INNER_X + 104) / 2), q.y, q.z]);
  // Bosses below keep the v5 seat faces (sender tops y=123, spot faces y=125, number pad y=113.5,
  // thermostat flange y=-128, breather lid y=122, M10 nut face y=-131). Stalks run the other way,
  // into the casting, and taper so they don't offer a second flat for caseFlat / onSurf.
  if (s > 0) {
    // raised part-number pad + bosses for the oil pressure transmitter, warning switch and connection piece
    // (101-10 #43-#50: small-part sets seat on the boss tops)
    p.add(boxMM([58, 104, 102], [92, 112, 168]), CAST);
    p.add(boxMM([54, 60, 98], [96, 104, 172]), CAST);
    p.add(boxMM([62, 111, 110], [88, 113.5, 160]), 'machinedAlu');
    for (const [bx, bz] of [[40, 150], [64, 120], [64, 160]] as [number, number][]) {
      p.add(cyl(11, 10, 16), CAST, [bx, 118, bz]);
      p.add(cyl(18, 50, 16, 11), CAST, [bx, 88, bz]);
    }
    // spot-faced pads for the odd 101-10 #11 bolt and #20/#21 stud nut (E positions)
    for (const bz of [-95, 55]) {
      p.add(cyl(10, 12, 20), CAST, [30, 119, bz]);
      p.add(cyl(16, 46, 16, 10), CAST, [30, 90, bz]);
    }
    // oil-thermostat pad on TOP of the right half at the pulley end (flange underside y 110).
    // Low enough that the cap stays inside the fan-shroud collar. Matches THERMO in aux.ts.
    p.add(cyl(24, 22, 28), CAST, [96, 99, 176]);
    p.add(cyl(20, 2.2, 32), 'machinedAlu', [96, 108.9, 176]);
  } else {
    p.add(boxMM([-76, 108, 108], [-30, 122, 190]), CAST);
    p.add(boxMM([-80, 56, 118], [-36, 108, 188]), CAST);
    // spot-faced pad under the left half for the 101-05 #22/#23 M10 stud nut (E position)
    p.add(cyl(10, 8, 20), CAST, [-40, -127, -186]);
    p.add(cyl(10, 28, 16, 16), CAST, [-40, -109, -186]);
    // warm-up regulator flange underside is y = 116.2 (WUR.flangeTop - 5). Screws thread down into this pad.
    p.add(boxMM([-72, 114.8, -198], [-48, 116.2, -142]), 'machinedAlu');
    p.add(boxMM([-76, 46, -202], [-44, 114.8, -138]), CAST);
    // distributor clamp spacer bottoms at y = 107 (DIST.caseY). Stay inboard of the cooler feet (x >= -81).
    p.add(boxMM([-80.2, 105.4, 99], [-64, 107, 115]), 'machinedAlu');
    p.add(boxMM([-80.2, 52, 99], [-64, 105.4, 115]), CAST);
    // oil-cooler feet: underside exactly y = 95 (footTop 101 − foot 6). Four pads, inboard of the
    // tank wall at x = -95, z-extent ±8.15 so the oil-port spigots at z = 49 and z = 75 (r 4) stay clear.
    for (const sz of [36, 62, 88, 112]) {
      // disk under the stud, r 5.5 inside the r 8 foot and inboard of the tank wall at x -95.
      // Top face exactly y 95. Stalk stays below the foot and clear of the oil-port spigots.
      p.add(cyl(5.5, 1.4, 24), 'machinedAlu', [-89, 94.3, sz]);
      p.add(boxMM([-94.2, 50, sz - 6], [-83, 93.8, sz + 6]), CAST);
    }
  }
  // round sump boss (strainer cover seats here)
  p.add(yToZ(lathe([[0.1, -2], [84, -2], [84, 2], [0.1, 2]], 48, s > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI)).rotateX(Math.PI / 2), CAST, [0, -126, -10]);
  // Pulley-end bay. The 60 T tips stop at z 204.7; the pocket continues through the bulkhead
  // so that face cannot meet the teeth. Web bores are opened because a hole centred on the
  // split does not survive the extrude triangulator. The running tunnel stays inside the
  // bearing-seat ID (13.6) except at the collar and the sprockets.
  const axial = (r: number, y: number, zA: number, zB: number) => {
    const g = yToZ(cyl(r, zB - zA, 32));
    g.translate(0, y, (zA + zB) / 2);
    return g;
  };
  const yS = INT_SHAFT_Y;
  // End disks are not capped: these are through-bores, and a disk at the cutter end sealed the hole.
  const open = (n: THREE.Vector3) => Math.abs(n.z) < 0.85;
  subtractSolids(p.g, [
    axial(13.55, yS, -210, 161.4),
    axial(16.6, yS, 160.8, 168.8),
    axial(13.55, yS, 168.4, 186.6),
    axial(57.5, yS, 186.2, 209.2),
    axial(39.5, yS, 186.2, 210.2),
    axial(15.5, yS, 208.6, 226.5),
    axial(41.2, yS, 225.5, 270),
    axial(14.5, yS, 269, 284),
    axial(36.5, 0, 190.8, 225),
  ], open);
  // The gear pocket removes the lower lug. The left lock nut still needs a seat under the
  // two rays the pocket took (the other two still hit the lug outside the pocket). Both
  // patches stay out of the 60 T ring: z 196.8 is 0.5 mm outside the tip circle, and
  // y −129.2 is at z 190, ahead of the tooth face at z 192.
  if (s < 0) {
    p.add(boxMM([-18, -137.4, 195.6], [-16.5, -136.0, 198.0]), 'machinedAlu');
    p.add(boxMM([-18, -130.6, 189.0], [-14.5, -127.8, 190.9]), 'machinedAlu');
  }
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
/** Keep the half-plane nx·p ≤ d. Convex, order preserved. */
function clipHalfPlane(poly: [number, number][], nx: number, ny: number, d: number): [number, number][] {
  const out: [number, number][] = [];
  const n = poly.length;
  const side = (pt: [number, number]) => nx * pt[0] + ny * pt[1] - d;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const sa = side(a), sb = side(b);
    if (sa <= 1e-6) out.push(a);
    if ((sa < -1e-6 && sb > 1e-6) || (sa > 1e-6 && sb < -1e-6)) {
      const t = sa / (sa - sb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}
/**
 * Cheek opposite the crankpin. `lobe` is how far the counterweight centre sits from the main axis.
 * Lobes that point down are shortened so they stay above the case sump floor (y −56).
 */
function lobeReach(a: number, lobe: number) {
  const yDir = -Math.sin(a);
  return yDir < -0.25 ? Math.min(lobe, 50 / -yDir) : lobe;
}
type CheekKind = 'pear' | 'round';
interface CheekSpec { k: CheekKind; lobe: number; flat?: number }
/**
 * Twelve cheeks, not one repeated racetrack. Pulley-side (`p`) and flywheel-side (`m`) differ.
 * Most carry a pear counterweight opposite the pin; the main-journal cheeks are nearer round,
 * some with a flat chord. Read off the assy-5 / assy-10 / pt3-12 stack: thick, varied, compact.
 */
const CHEEK: Record<number, { p: CheekSpec; m: CheekSpec }> = {
  1: { p: { k: 'round', lobe: 6, flat: 40 }, m: { k: 'pear', lobe: 34 } },
  4: { p: { k: 'pear', lobe: 40 }, m: { k: 'pear', lobe: 26, flat: 44 } },
  2: { p: { k: 'pear', lobe: 36 }, m: { k: 'round', lobe: 8, flat: 36 } },
  5: { p: { k: 'pear', lobe: 38 }, m: { k: 'pear', lobe: 30 } },
  3: { p: { k: 'round', lobe: 10, flat: 38 }, m: { k: 'pear', lobe: 42 } },
  6: { p: { k: 'pear', lobe: 32 }, m: { k: 'round', lobe: 8, flat: 34 } },
};
function cheekOutline(px: number, py: number, a: number, spec: CheekSpec): [number, number][] {
  const ux = Math.cos(a), uy = Math.sin(a);
  const reach = lobeReach(a, spec.lobe);
  const mainR = spec.k === 'round' ? 50 : 44;
  const pinBoss = spec.k === 'round' ? 24 : 31;
  const blob = spec.k === 'round' ? 16 : 23;
  let pts = hull([
    ...circlePts(0, 0, mainR, 40),
    ...circlePts(px, py, pinBoss, 28),
    ...circlePts(-ux * reach, -uy * reach, blob, 22),
  ]);
  if (spec.flat != null) pts = clipHalfPlane(pts, -uy, ux, spec.flat);
  return pts;
}
export function crankshaft() {
  const p = new Part();
  const rMain = SPEC.mainJournalD / 2, rPin = SPEC.rodJournalD / 2, r = SPEC.crankRadius;
  const mainW = 16, pinW = 20.4;
  for (const z of MAIN_Z) {
    // short polished main: the shells are ±7.4, and the cheeks come up to the fillet
    p.add(yToZ(lathe([
      [rMain - 5, -mainW / 2], [rMain - 1.5, -mainW / 2 + 2.4], [rMain, -mainW / 2 + 4],
      [rMain, mainW / 2 - 4], [rMain - 1.5, mainW / 2 - 2.4], [rMain - 5, mainW / 2],
    ], 48)), 'polishedSteel', [0, 0, z]);
    p.add(yToX(cyl(3, 0.6, 10)), 'bore', [rMain + 0.05, 0, z]); // oil hole
  }
  const throws = Object.entries(CYL_Z).map(([c, z]) => ({ c: +c, z, a: THROW_DEG[+c] * DEG }));
  const cheekT = 12.6;
  // centre of the gap between the pin flank and the main-journal flank (mains are 29.5 from each pin)
  const cheekOff = (pinW / 2 + (29.5 - mainW / 2)) / 2;
  for (const t of throws) {
    const px = r * Math.cos(t.a), py = r * Math.sin(t.a);
    p.add(yToZ(lathe([
      [rPin - 3.5, -pinW / 2], [rPin - 0.8, -pinW / 2 + 2.2], [rPin, -pinW / 2 + 3.6],
      [rPin, pinW / 2 - 3.6], [rPin - 0.8, pinW / 2 - 2.2], [rPin - 3.5, pinW / 2],
    ], 40)), 'polishedSteel', [px, py, t.z]);
    p.add(yToX(cyl(2.6, 0.6, 10)).rotateZ(t.a), 'bore', [px + (rPin + 0.05) * Math.cos(t.a), py + (rPin + 0.05) * Math.sin(t.a), t.z]);
    const pair = CHEEK[t.c];
    for (const side of [-1, 1] as const) {
      const spec = side > 0 ? pair.p : pair.m;
      const zw = t.z + side * cheekOff;
      const pts = cheekOutline(px, py, t.a, spec);
      p.add(extrudeC(polyShape(pts), cheekT, 1.15, 4), 'forgedDark', [0, 0, zw]);
      p.add(yToZ(cyl(3.6, cheekT + 0.4, 8)), 'bore', [px * 0.42, py * 0.42, zw]);
    }
  }
  // flywheel flange: 9 bolt holes, dowel, pilot bore (102-00 #6). Face stays at FLY_Z so the flywheel and bolts seat.
  const fl = circleShape(54);
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; fl.holes.push(circlePath(4.2, 36 * Math.cos(a), 36 * Math.sin(a)) as THREE.Path); }
  fl.holes.push(circlePath(10) as THREE.Path);
  fl.holes.push(circlePath(3.1, 46 * Math.cos(0.35), 46 * Math.sin(0.35)) as THREE.Path);
  p.add(extrude(fl, 12, 1), 'forgedDark', [0, 0, CASE_Z.flywheel - 8]);
  p.add(yToZ(cyl(3, 9, 12)), 'steel', [46 * Math.cos(0.35), 46 * Math.sin(0.35), CASE_Z.flywheel - 8 - 3.2]);
  p.add(yToZ(cyl(rMain, 24, 32)), 'polishedSteel', [0, 0, -196]); // rear seal journal
  // nose, outward from the last (round) cheek: main 7 is already at z 177, then gear seat, ring, drive, circlip, main 8, pulley spigot
  const nose = yToZ(lathe([[rMain, 186], [CRANK_NOSE.seatR, 186], [CRANK_NOSE.seatR, CRANK_NOSE.groove[0]], [CRANK_NOSE.seatR - 1.2, CRANK_NOSE.groove[0]], [CRANK_NOSE.seatR - 1.2, CRANK_NOSE.groove[1]],
    [CRANK_NOSE.seatR, CRANK_NOSE.groove[1]], [CRANK_NOSE.seatR, 228], [27, 228], [27, 256], [20, 256], [20, 318], [8, 320]], 48));
  const K = CRANK_NOSE.key;
  const pocket = woodruffGeom(K.D + 0.1, K.h + 0.05, K.b + 0.1).rotateY(-Math.PI / 2).translate(0, CRANK_NOSE.seatR + K.proud, K.z);
  p.add(csgSub(nose, pocket), 'polishedSteel');
  p.add(extrude(ringShape(8.5, 5), 4, 0, 24), 'polishedSteel', [0, 0, 316]); // tapped M12x1.5 pulley-bolt hole
  return p.g;
}

/**
 * Shared slice pitch for the timing pair. Both helices step on these planes over z 192–204.7
 * (12.7 mm / 64). A mismatched 11-vs-12 stair made the flanks cross between slice centres.
 */
export const MESH_DZ = 12.7 / 64;
const MESH_ZREF = 192 + 12.7 / 2;
/** Helical tooth stack. `rate` is d(angle)/dz. `tapered` is the timing pair; the distributor wheel keeps gearShape. */
function addHelix(p: Part, teeth: number, rRoot: number, rTip: number, holeR: number, z0: number, z1: number, rate: number, mat: MatKey, at: V3, phase = 0, tapered = false, dz = 0) {
  const step = dz > 0 ? dz : (z1 - z0) / 8;
  const zRef = dz > 0 ? MESH_ZREF : (z0 + z1) / 2;
  const lip = tapered ? 0 : 0.04;
  for (let z = z0; z < z1 - 1e-6;) {
    const zNext = Math.min(z1, z + step);
    const ang = phase + rate * ((z + zNext) / 2 - zRef);
    const s = tapered ? timingGearShape(teeth, rRoot, rTip, holeR) : gearShape(teeth, rRoot, rTip, holeR);
    p.add(extrude(s, zNext - z + lip, 0, 1).rotateZ(ang), mat, [at[0], at[1], at[2] + z]);
    z = zNext;
  }
}
/** Keyed hub disc. The slot opens through the OD so it is not drawn past the rim (that sliver was degenerate). */
function keyedHubOutline(hubR: number, boreR: number, kb: number) {
  const yOut = Math.sqrt(Math.max(0, hubR * hubR - kb * kb));
  const a = Math.asin(kb / boreR);
  const aL = Math.atan2(yOut, -kb), aR = Math.atan2(yOut, kb);
  const pts: [number, number][] = [];
  const n = 72;
  for (let i = 0; i <= n; i++) {
    const ang = aL + (aR + Math.PI * 2 - aL) * (i / n);
    pts.push([hubR * Math.cos(ang), hubR * Math.sin(ang)]);
  }
  const b0 = Math.PI / 2 - a, b1 = Math.PI / 2 + a - Math.PI * 2;
  for (let i = 0; i <= 64; i++) {
    const ang = b0 + (b1 - b0) * (i / 64);
    pts.push([boreR * Math.cos(ang), boreR * Math.sin(ang)]);
  }
  pts.push([-kb, yOut]);
  const deduped: [number, number][] = [];
  for (const p of pts) {
    const last = deduped[deduped.length - 1];
    if (last && Math.hypot(last[0] - p[0], last[1] - p[1]) < 1e-4) continue;
    deduped.push(p);
  }
  const first = deduped[0], last = deduped[deduped.length - 1];
  if (first && last && Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-4) deduped.pop();
  return polyShape(deduped);
}
/** Crank timing gear (102-00 #8, 35 T helical) + distributor drive wheel (102-00 #10, smaller brass helical). */
export function crankGears() {
  const p = new Part();
  const N = CRANK_NOSE, kb = N.key.b / 2 + 0.05;
  const z0 = N.gear[0], z1 = N.gear[1];
  // Crank gear key/root interference is a known geometric conflict between the 84 mm gear centres
  // and the Ø56 crank nose with its Woodruff key, pending a real measurement of the crank nose Ø or gear centres.
  // 35 T stays. The hub slot stops at the rim (r ≈ 29.35). Every tooth slice is then notched
  // straight through on the key, up to r 31.0. The sides sit 1.15 mm outside the key so the
  // 1 mm collision erosion cannot walk the flanks back into it. That notches the gap root.
  // The key, the nose and the centres are unchanged.
  const pr = (CRANK_GEAR_T * INT_GEAR.module) / 2;
  const hubR = pr - 1.6;
  // Key metal is |x| <= 2.5 and y <= 30.6. The notch top is r 31.0 (0.4 mm over the key).
  // The sides are 1.15 mm outside the key so the 1 mm collision erosion cannot walk a flank
  // back into the key. The notch still takes the tooth-gap root.
  const slot = boxMM([-(2.5 + 1.15), 0, z0 - 0.02], [2.5 + 1.15, 31, z1 + 0.02]);
  const geared = new Part();
  geared.add(extrude(keyedHubOutline(hubR, N.seatR + 0.05, kb), z1 - z0, 0, 1), 'steel', [0, 0, z0]);
  // Same tan(30°)/pr rate and the same z planes as the intermediate gear over the 12.7 mm mesh.
  const rate = Math.tan(30 * DEG) / pr;
  addHelix(geared, CRANK_GEAR_T, pr - 1.7, pr + 2.5, N.seatR + 0.25, z0, z1, rate, 'steel', [0, 0, 0], 0, true, MESH_DZ);
  // Axial slot aligned with the key (+Y). A twisted slot would miss the key between slices.
  subtractSolids(geared.g, [slot]);
  p.g.add(geared.g);
  // smaller-OD brass distributor gear, same hand, narrow face. Spur profile, not the timing taper.
  // Zero-area seam triangles on the bore read as a hit against the case web.
  const dist = new Part();
  const d0 = N.drive[0], d1 = N.drive[1];
  const dRate = Math.tan(28 * DEG) / 31;
  dist.add(extrude(ringShape(30.2, N.seatR + 0.05), d1 - d0), 'bronze', [0, 0, d0]);
  addHelix(dist, 22, 29.4, 32.4, 28.6, d0, d1, dRate, 'bronze', [0, 0, 0], 0, false, 0);
  dropDegenerate(dist.g);
  p.g.add(dist.g);
  return p.g;
}

/** Drop zero-area triangles. They survive extrusion at a seam and the collision BVH still counts them. */
function dropDegenerate(root: THREE.Object3D) {
  root.traverse((o: any) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    const src = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
    const P = src.getAttribute('position');
    const clean: number[] = [];
    const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
    for (let i = 0; i < P.count; i += 3) {
      A.fromBufferAttribute(P, i); B.fromBufferAttribute(P, i + 1); C.fromBufferAttribute(P, i + 2);
      if (B.clone().sub(A).cross(C.clone().sub(A)).lengthSq() < 1e-8) continue;
      clean.push(A.x, A.y, A.z, B.x, B.y, B.z, C.x, C.y, C.z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(clean, 3));
    g.computeVertexNormals();
    o.geometry = g;
  });
}

// ---------------------------------------------------------------- connecting rod (102-00 #16), local: big end at 0, small end +X
/** Half of a big-end outline (convex hull clipped to one side of the split) closed by the journal arc. */
function bigEndHalf(outer: [number, number][], side: 1 | -1, ri: number) {
  const clip = clipHalfPlane(outer, -side, 0, 0.4);
  let iLo = 0, iHi = 0;
  clip.forEach((pt, i) => { if (pt[1] < clip[iLo][1]) iLo = i; if (pt[1] > clip[iHi][1]) iHi = i; });
  const walk = (from: number, to: number) => {
    const w: [number, number][] = [];
    for (let k = 0; k < clip.length; k++) {
      const i = (from + k) % clip.length;
      w.push(clip[i]);
      if (i === to) break;
    }
    return w;
  };
  // the outside path is the one that reaches further onto this side of the split
  let path = walk(iLo, iHi);
  const back = walk(iHi, iLo);
  if (Math.max(...back.map((pt) => pt[0] * side)) > Math.max(...path.map((pt) => pt[0] * side))) path = back.slice().reverse();
  const shp = new THREE.Shape();
  shp.moveTo(path[0][0], path[0][1]);
  for (const pt of path.slice(1)) shp.lineTo(pt[0], pt[1]);
  // bore back along this half: rod (+X) clockwise through angle 0, cap (−X) counterclockwise through angle π
  shp.absarc(0, 0, ri, Math.PI / 2, side > 0 ? -Math.PI / 2 : Math.PI * 1.5, side > 0);
  shp.closePath();
  return shp;
}
/** Forged I-beam rod: shoulders into two bolt bosses, separate cap, bronze small-end bush. Centre distance stays rodLength. */
export function conrod() {
  const p = new Part();
  const L = SPEC.rodLength, t = 20;
  const ri = SPEC.rodJournalD / 2 + 2;
  const rodOuter = hull([
    ...circlePts(0, 0, 38, 36),
    ...circlePts(14, 30, 11.5, 16),
    ...circlePts(14, -30, 11.5, 16),
    [46, 16], [46, -16],
  ]);
  const capOuter = hull([
    ...circlePts(0, 0, 35.5, 32),
    ...circlePts(-8, 28, 10, 14),
    ...circlePts(-8, -28, 10, 14),
  ]);
  p.add(extrudeC(bigEndHalf(rodOuter, 1, ri), t, 0.7, 8), 'forgedDark');
  p.add(extrudeC(bigEndHalf(capOuter, -1, ri), t - 1.2, 0.6, 8), 'forgedDark', [-0.7, 0, 0]);
  // stock bolt + nut: nuts proud of the cap (faces visible), heads on the beam shoulder
  for (const y of [-30, 30]) {
    p.add(yToX(cyl(4.4, 58, 12)), 'steel', [-6, y, 0]);
    p.add(yToX(hexNut(12, 7)), 'darkSteel', [24, y, 0]);
    p.add(yToX(hexNut(13, 8)), 'darkSteel', [-38, y, 0]);
  }
  // I-beam: thin recessed web, raised edge flanges, widening into the shoulders
  const x0 = 44, x1 = L - 20;
  p.add(extrudeC(polyShape([[x0, -6.5], [x1, -3.6], [x1, 3.6], [x0, 6.5]]), 6.2), 'forgedDark');
  p.add(extrudeC(polyShape([[x0 - 2, 7], [x1, 4.2], [x1, 10.5], [x0 - 2, 17]]), t - 1.5, 0.45), 'forgedDark');
  p.add(extrudeC(polyShape([[x0 - 2, -17], [x1, -10.5], [x1, -4.2], [x0 - 2, -7]]), t - 1.5, 0.45), 'forgedDark');
  // small end, pressed bronze bush, oil hole on the crown
  p.add(extrudeC(polyShape([[x1 - 6, -11], [L - 10, -16], [L - 10, 16], [x1 - 6, 11]]), t - 2, 0.4), 'forgedDark');
  p.add(extrudeC(ringShape(18, 12.1), t - 2, 0.5), 'forgedDark', [L, 0, 0]);
  p.add(extrudeC(ringShape(12.1, 11), t - 3), 'bronze', [L, 0, 0]);
  p.add(yToX(cyl(1.5, 6, 8)), 'bore', [L + 15.5, 0, 0]);
  // rod bearing shells (#20), copper-coloured edge
  for (const ph of [0.02, Math.PI + 0.02]) p.add(yToZ(lathe([[SPEC.rodJournalD / 2, -8.6], [SPEC.rodJournalD / 2 + 1.7, -8.6], [SPEC.rodJournalD / 2 + 1.7, 8.6], [SPEC.rodJournalD / 2, 8.6]], 16, ph, Math.PI - 0.04)), 'bronze');
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


// ---------------------------------------------------------------- camshaft housing (103-05 #13), engine coords
// The housing, camshaft and rocker meshes live in valvetrain.ts. These stations stay here because the
// valve covers, chain housings and the keyed cam-nose hardware are built from them.
export const CH_Z0 = -168, CH_Z1 = CASE_Z.pulley;
/** Valve-cover ear positions along engine Z (relative to housing centre). */
const VC_EAR_F = (upper: boolean) => (upper ? [-0.39, -0.13, 0.13, 0.39] : [-0.42, -0.252, -0.084, 0.084, 0.252, 0.42]);
/** Valve-cover ear stations along engine Z, relative to the housing centre (mm): 4 per edge upper, 6 lower (103-05: 40 nuts). */
export const VC_EARS = (upper: boolean) => VC_EAR_F(upper).map((f) => f * (CH_Z1 - CH_Z0 - 30));
/** Ear centre offset across the cover (cover-local x). */
export const VC_EDGE = 31;

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
/**
 * Extra cover length at the flywheel end. Both banks are 0: the cover matches the cam-housing seat rails
 * (`CH_Z0`..`CH_Z1`), the same length and Z position as the right cover. The old left-only +30 mm overhang is gone.
 */
export const VC_EXT = (_s: 1 | -1) => 0;
export function valveCover(s: 1 | -1, upper: boolean) {
  const loc = new Part();
  const len = CH_Z1 - CH_Z0 - 8, w = 58;
  const L = CH_Z1 - CH_Z0;
  // hollow cast pan (v5): drafted outer shell 2.5-3 mm thick over a matching cavity that clears the rocker gear,
  // on a seat flange ring; everything below the seat plane is trimmed off. Ears stay on VC_EARS so the nuts land on the housing bosses.
  const ext = VC_EXT(s), cy = -ext / 2;
  const cavity = new THREE.ExtrudeGeometry(roundRect(VC_CAV.w0 * 2, len - 30 + ext, 1), { depth: 29, bevelEnabled: true, bevelThickness: 10, bevelSize: 8, bevelSegments: 1, curveSegments: 6 });
  cavity.translate(0, cy, -20);
  const below = boxMM([-w, -len, -40], [w, len, 0.01]);
  // Stepped seat flange: thin outer lip, then a raised land the pan walls leave from.
  const lip = extrude(roundRect(w, len + ext, 7), 1.15, 0.25, 6).translate(0, cy, 0);
  const step = extrude(roundRect(w - 7, len - 6 + ext, 5), 2.15, 0.4, 6).translate(0, cy, 1.15);
  // Sprocket-end notch (pulley / chain end, local +y). Deep enough to read, clear of the ear pads.
  const notch = boxMM([-15, len / 2 - 16 + cy, -1], [15, len / 2 + 4 + cy, 16]);
  loc.add(csgSub(lip, cavity, notch), 'castAlu');
  loc.add(csgSub(step, cavity, notch), 'castAlu');
  const pan = new THREE.ExtrudeGeometry(roundRect(w - 17, len - 22 + ext, 6), { depth: 12, bevelEnabled: true, bevelThickness: 10, bevelSize: 8, bevelSegments: 1, curveSegments: 6 });
  loc.add(csgSub(pan.translate(0, cy, 0), cavity, below, notch), 'castAlu');
  // Stud towers blended into the pan wall. The nut face stays a flat disc at z = 7.
  const earCut = new THREE.ExtrudeGeometry(roundRect(31, len - 30 + ext, 1), { depth: 29, bevelEnabled: true, bevelThickness: 10, bevelSize: 8, bevelSegments: 1, curveSegments: 6 }).translate(0, cy, -20);
  const earBoss = yToZ(lathe([
    [16.4, 0], [14.8, 1.4], [12.4, 3.0], [10.2, 4.8], [8.8, 6.3], [8.8, 7], [0.4, 7],
  ], 24));
  for (const yy of VC_EARS(upper)) {
    for (const xx of [-VC_EDGE, VC_EDGE]) {
      loc.add(csgSub(earBoss.clone().translate(xx, yy, 0), earCut), 'castAlu');
      // Wide at the pan wall, narrowing into the tower, and kept below the nut face.
      const sign = xx > 0 ? 1 : -1;
      const wall = xx - sign * 17;
      const root = xx - sign * 4.5;
      const gussetPts: [number, number][] = sign > 0
        ? [[wall, yy - 13], [root, yy - 8], [root, yy + 8], [wall, yy + 13]]
        : [[root, yy - 8], [wall, yy - 13], [wall, yy + 13], [root, yy + 8]];
      loc.add(csgSub(extrude(polyShape(gussetPts), 5.8, 0.45, 2), earCut), 'castAlu');
    }
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
 * (z-6..-5.4) | sprocket #38 hub (z-5.4..+10), dowelled to the flange by straight pin #39 | spring washer #40 +
 * nut #41 (fasteners.ts cam-nut-*) on the M22x1.5 thread (E) at the nose end.
 * Pin #39 (900 243 001 00, Ø6 × 14) sits on a circle outside the hub and the M22 nut, through the sprocket web
 * and 2 mm proud of that web, with its tail seated in one flange-rim scallop. It is the existing `cam-pin-*` part.
 */
// Camshaft mesh: valvetrain.ts camshaft(). Nose stack shared with the CoS key, flange, shim and nut.
/** Sprocket web disc (extrudeC). Flat faces at ±depth/2; bevel lips sit `bevel` mm outside those faces. */
export const CAM_WEB = { depth: 6, bevel: 0.6 };
/** Vernier: 17 sprocket holes and 16 flange-rim scallops on one circle. Only the dowel angle lines up. */
export const SPROCKET_HOLES = 17;
export const FLANGE_NOTCHES = 16;
export const VERNIER = { holeR: 3.35, notchR: 2.0 };
export const CAM_NOSE = {
  r: 11, key: { D: 9.6, h: 4.8, b: 4, proud: 1.8, dz: -11 }, flange: [-16, -6] as [number, number], flangeR: 24,
  shim: 0.6, hubFace: 10, end: 23,
  // rad 24 is the pin circle (flange rim). It clears the hub (r ≤ 19.5) and the M22 nut (vertex r ≈ 18.5).
  pin: { r: 3, rad: 24, a: 0.3 + Math.PI / 6, len: 14, proud: 2 },
};
/**
 * Disc of radius R with semicircular rim notches (centres on the rim). Outer path, CCW.
 * notchR 2.0 on the Ø48 rim: scallop ≈ 9.6°, land ≈ 12.9°, so the lands are wider than the scallops.
 */
function vernierRim(s: 1 | -1, R: number, notchR: number, nNotch: number, a0: number, samples = 480): [number, number][] {
  const centres = Array.from({ length: nNotch }, (_, i) => {
    const a = a0 + (i * 2 * Math.PI) / nNotch;
    return [R * Math.cos(a) * s, R * Math.sin(a)] as [number, number];
  });
  const pts: [number, number][] = [];
  for (let i = 0; i < samples; i++) {
    const g = (i / samples) * Math.PI * 2;
    const dx = Math.cos(g), dy = Math.sin(g);
    let t = R;
    for (const [cx, cy] of centres) {
      const b = dx * cx + dy * cy;
      const disc = b * b - (cx * cx + cy * cy - notchR * notchR);
      if (disc < 0) continue;
      const tEnter = b - Math.sqrt(disc);
      const rimIn = (R * dx - cx) ** 2 + (R * dy - cy) ** 2 < notchR * notchR - 1e-4;
      if (rimIn && tEnter > 1 && tEnter < t) t = tEnter;
    }
    pts.push([t * dx, t * dy]);
  }
  return pts;
}
/**
 * Scalloped annulus as one outline (outer CCW, then the bore traced CW), same trick as
 * sprocketRingShape. ExtrudeGeometry's hole triangulator bridges this rim and caps the bore.
 */
function scallopedAnnulus(s: 1 | -1, R: number, notchR: number, nNotch: number, a0: number, rHole: number) {
  const outer = vernierRim(s, R, notchR, nNotch, a0);
  const aJoin = Math.atan2(outer[0][1], outer[0][0]);
  const pts = outer.slice();
  const innerN = 72;
  for (let i = 0; i <= innerN; i++) {
    const a = aJoin - (i / innerN) * Math.PI * 2;
    pts.push([rHole * Math.cos(a), rHole * Math.sin(a)]);
  }
  return polyShape(pts);
}
/** Sprocket flange (#36): tall bright keyed hub, 16 scallops only on the short sprocket-face rim. The dowel sits in one scallop. */
export function camFlange(s: 1 | -1) {
  const p = new Part();
  const X = CAM_X * s, zc = CHAIN_Z[s], N = CAM_NOSE;
  const keyed = () => {
    const bore = new THREE.Path();
    const kb = N.key.b / 2 + 0.05, a = Math.asin(kb / (N.r + 0.05));
    bore.absarc(0, 0, N.r + 0.05, Math.PI / 2 + a, Math.PI / 2 - a + 2 * Math.PI, false);
    bore.lineTo(kb, N.r + N.key.proud + 0.4); bore.lineTo(-kb, N.r + N.key.proud + 0.4); bore.closePath();
    return bore;
  };
  const z0 = N.flange[0], z1 = N.flange[1], rimH = 3.2, hubR = 22;
  // Tall bright hub ends before the dowel (pin tail starts at z −8.4). Scallops are only the short skirt at the sprocket face.
  // curveSegments 32 keeps the keyed bore round; 4 segments polygon it into an octagon.
  const hub = circleShape(hubR); hub.holes.push(keyed());
  p.add(extrude(hub, z1 - z0 - rimH, 0, 32), 'polishedSteel', [X, 0, zc + z0]);
  const rim = scallopedAnnulus(s, N.flangeR, VERNIER.notchR, FLANGE_NOTCHES, N.pin.a, hubR + 0.2);
  p.add(extrude(rim, rimH, 0, 1), 'polishedSteel', [X, 0, zc + z1 - rimH]);
  return p.g;
}

// ---------------------------------------------------------------- cam chain drive (103-10/-15), duplex 3/8" roller chain
// Duplex 3/8 in. Cam sprocket 28 T (face count of 901 105 546 04). Intermediate sprocket 24 T
// (published; Pelican). Idler 19 T (face count of 901 105 055 00). With the 35:60 crank/intermediate
// gears the cam turns at exactly ½ crank: (35/60)*(24/28) = 1/2.
export const PITCH = 9.525; // ISO 606 / BS 06B-2 duplex, 3/8 in
export const INT_T = 24, CAM_T = 28, IDLER_T = 19;
export const INT_SPROCKET_R = PITCH / (2 * Math.sin(Math.PI / INT_T)); // 36.5
export const CAM_SPROCKET_R = PITCH / (2 * Math.sin(Math.PI / CAM_T)); // 42.5
export const IDLER_SPROCKET_R = PITCH / (2 * Math.sin(Math.PI / IDLER_T)); // 28.9
const ROW = 5.1; // duplex row offset from chain centre (transverse pitch ≈ 10.2)
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
/**
 * Chain pin centres. On each sprocket the rollers sit one tooth apart (chord = pitch),
 * centred on the wrap, so a valley lines up with every roller. Straight runs are split
 * into equal chords as close to the pitch as the tangent length allows. Even count so
 * inner and outer plates alternate.
 */
export function chainPins(s: 1 | -1) {
  const { arcs } = chainPath(s);
  const teethOf = (r: number) => {
    let teeth = CAM_T, bd = Math.abs(r - CAM_SPROCKET_R);
    for (const [rr, tt] of [[INT_SPROCKET_R, INT_T], [IDLER_SPROCKET_R, IDLER_T]] as [number, number][]) {
      const d = Math.abs(r - rr);
      if (d < bd) { bd = d; teeth = tt; }
    }
    return teeth;
  };
  const arcPts = arcs.map((A) => {
    const step = (Math.PI * 2) / teethOf(A.circ.r);
    const sweep = A.a1 - A.a0;
    const dir = Math.sign(sweep) || 1;
    const span = Math.abs(sweep);
    const nInt = Math.max(1, Math.round(span / step));
    const margin = (span - nInt * step) / 2;
    const a0 = A.a0 + dir * margin;
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= nInt; k++) {
      const a = a0 + dir * step * k;
      pts.push(new THREE.Vector3(A.circ.c.x + A.circ.r * Math.cos(a), A.circ.c.y + A.circ.r * Math.sin(a), 0));
    }
    return pts;
  });
  const pins: THREE.Vector3[] = [];
  for (let i = 0; i < arcs.length; i++) {
    const here = arcPts[i], next = arcPts[(i + 1) % arcs.length];
    for (let k = 0; k < here.length - 1; k++) pins.push(here[k]);
    const p0 = here[here.length - 1], p1 = next[0];
    const nChord = Math.max(1, Math.round(p0.distanceTo(p1) / PITCH));
    pins.push(p0);
    for (let k = 1; k < nChord; k++) pins.push(p0.clone().lerp(p1, k / nChord));
  }
  let len = 0;
  for (let i = 0; i < pins.length; i++) len += pins[i].distanceTo(pins[(i + 1) % pins.length]);
  return { n: pins.length, len, pins };
}
/** y of a run (line a-b) at engine x. */
const runY = (a: THREE.Vector2, b: THREE.Vector2, x: number) => a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
/** Hydraulic adjuster: body length, plunger + dome, arm-tail pad radius, and the plunger axis z offset from the chain plane. */
export const ADJ = { body: 50, dome: 4.5, pad: 6.5, zOff: { 1: -13, [-1]: -5 } as Record<number, number> };
/**
 * Tensioner geometry (photo rebuild-pic10 / tensioner-pic3/4): 19 T idler OUTSIDE the loop under the slack run, about
 * 2/3 of the way to the cam, pushed IDLER_PUSH mm up into the run so the chain wraps it. The idler arm pivots outboard
 * of it; its tail pad (inboard) rests on the plunger of the hydraulic adjuster, which stands inclined (~36 deg) in the
 * lower inner corner of the box with its base where the v3 floor already was, so nothing drops toward the heat exchanger.
 */
export function tensionerLayout(s: 1 | -1) {
  const { lo1, lo2, nLo } = basePath(s);
  const idlerR = IDLER_SPROCKET_R;
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
/**
 * Root-gap centre of sprocketRingShape, as a fraction of the tooth pitch.
 * The valley floor runs from 0.50 to 1.02 (the next tooth's 0.02 root).
 */
export const SPROCKET_GAP = 0.76;
/** Rotation that puts a tooth gap (sprocketRingShape valley centre) on the nearest chain roller. */
export function toothPhase(s: 1 | -1, cx: number, cy: number, r: number, teeth: number) {
  const { pins } = chainPins(s);
  let best = pins[0], bd = Infinity;
  for (const q of pins) { const d = Math.abs(Math.hypot(q.x - cx, q.y - cy) - r); if (d < bd) { bd = d; best = q; } }
  return Math.atan2(best.y - cy, best.x - cx) - SPROCKET_GAP * ((Math.PI * 2) / teeth);
}
/** Solid duplex sprocket: two toothed rings, a bored web, and a centre groove for the middle plates. No lightening holes. */
function duplexSprocket(p: Part, teeth: number, r: number, at: V3, hub: number, mat: MatKey = 'steel', phase = 0) {
  const rr = r - 3.6, rt = r + 3.4;
  for (const dz of [-ROW, ROW]) {
    p.add(extrudeC(sprocketRingShape(teeth, rr, rt, rr - 5.5), 4.8, 0, 2).rotateZ(phase), mat, [at[0], at[1], at[2] + dz]);
  }
  const web = circleShape(rr - 5.2); web.holes.push(circlePath(hub) as THREE.Path);
  for (const zc of [-4.5, 4.5]) p.add(extrudeC(web, 6.2, 0.25, 24), mat, [at[0], at[1], at[2] + zc]);
}
/** Link plate inside the previous silhouette. Pin holes are cut with CSG; shape holes triangulate across the bore. */
function chainPlate(outer: boolean) {
  const shape = outer
    ? polyShape([
      [-PITCH / 2 - 3.4, -4.1], [-PITCH / 2 + 0.4, -2.05], [PITCH / 2 - 0.4, -2.05], [PITCH / 2 + 3.4, -4.1],
      [PITCH / 2 + 4.4, 0],
      [PITCH / 2 + 3.4, 4.1], [PITCH / 2 - 0.4, 2.05], [-PITCH / 2 + 0.4, 2.05], [-PITCH / 2 - 3.4, 4.1],
      [-PITCH / 2 - 4.4, 0],
    ])
    : roundRect(PITCH + 5.8, 8.2, 4.1);
  const pinHole = (x: number) => yToZ(cyl(1.72, 4, 12)).translate(x, 0, 0);
  return csgSub(extrudeC(shape, 1.2, 0, 3), pinHole(PITCH / 2), pinHole(-PITCH / 2));
}
export function timingChain(s: 1 | -1) {
  const p = new Part();
  const { n, pins } = chainPins(s);
  const z = CHAIN_Z[s];
  const inner = chainPlate(false);
  const outer = chainPlate(true);
  // Roller Ø6.4 and pin Ø3.4, full duplex size (a 06B-2 roller is Ø6.35).
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
  // Nose boss (r 42 from z 220) and the lower split pad (y −46..−34, z 229..243) stand inside the
  // plate envelope. Move only the vertices that enter them; pitch line, rollers and plates stay put elsewhere.
  clearNose(p.g);
  return p.g;
}
function clearNose(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  root.traverse((o: any) => {
    if (!o.isMesh) return;
    const P = o.geometry.attributes.position as THREE.BufferAttribute;
    const inv = o.matrixWorld.clone().invert();
    let changed = false;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld);
      let moved = false;
      const rho = Math.hypot(v.x, v.y);
      if (v.z > 218 && v.z < 278 && rho < 42.6 && rho > 8) {
        const f = 42.6 / rho; v.x *= f; v.y *= f; moved = true;
      }
      // Pad is only 8 mm wide, but a plate edge can cross it with both vertices outside that strip.
      // Whole left-chain crown (its plates reach z ≈ 246). The right chain starts at z ≈ 247, so it is left alone.
      if (v.z > 220 && v.z < 246.5 && Math.abs(v.x) < 36 && v.y > -47.6 && v.y < -20) {
        v.y = -47.6; moved = true;
      }
      if (!moved) continue;
      v.applyMatrix4(inv);
      P.setXYZ(i, v.x, v.y, v.z);
      changed = true;
    }
    if (changed) P.needsUpdate = true;
  });
}
export function camSprocket(s: 1 | -1) {
  const p = new Part();
  const X = CAM_X * s, z = CHAIN_Z[s], N = CAM_NOSE;
  const rr = CAM_SPROCKET_R - 3.6, rt = CAM_SPROCKET_R + 3.4;
  for (const dz of [-ROW, ROW]) {
    p.add(extrudeC(sprocketRingShape(CAM_T, rr, rt, rr - 5), 5.2, 0, 2).rotateZ(toothPhase(s, X, 0, CAM_SPROCKET_R, CAM_T)), 'steel', [X, 0, z + dz]);
  }
  // web: a ring of 17 vernier holes. One of them (the dowel angle) carries pin #39.
  const web = circleShape(rr - 4);
  const W = CAM_WEB;
  for (let i = 0; i < SPROCKET_HOLES; i++) {
    const q = N.pin.a + (i * 2 * Math.PI) / SPROCKET_HOLES;
    web.holes.push(circlePath(VERNIER.holeR, N.pin.rad * Math.cos(q) * s, N.pin.rad * Math.sin(q)) as THREE.Path);
  }
  web.holes.push(circlePath(N.r + 8.2) as THREE.Path);
  p.add(extrudeC(web, W.depth, W.bevel, 24), 'steel', [X, 0, z]);
  // one tubular boss on the engaged hole, from the flange face back to the web
  const webBack = -W.depth / 2 - W.bevel;
  const bx = N.pin.rad * Math.cos(N.pin.a) * s, by = N.pin.rad * Math.sin(N.pin.a);
  p.add(yToZ(lathe([[N.pin.r + 0.12, N.flange[1]], [5.4, N.flange[1]], [5.4, webBack + 0.4], [N.pin.r + 0.12, webBack + 0.4]], 18)), 'steel', [X + bx, by, z]);
  const z0 = N.flange[1] + N.shim; // hub back face on the shim
  p.add(yToZ(lathe([[N.r + 0.15, z0], [N.r + 8.5, z0], [N.r + 8.5, z0 + 2.2], [N.r + 8.2, z0 + 2.2], [N.r + 8.2, 7], [N.r + 5, N.hubFace], [N.r + 0.15, N.hubFace]], 32)), 'steel', [X, 0, z]);
  return p.g;
}
/**
 * Chain tensioner (103-10/-15): idler sprocket (#6, 19 T) on its arm (#5) pressed up into the slack run so the chain
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
  if (s < 0) out.push({ a: up1, b: up2, n: nUp, f0: 0.28, f1: 0.5 });
  return out;
}
/** Rail mounting tabs: bosses outboard of the rail (clear of the chain plates) that take the rail bolts. */
export const RAIL_TAB = { off: 16.5, r: 8, z0: -16, z1: 11.1 };
/** Curved U-channel shoe. `inner` is the gap from the pitch line to the shoe face; `bow` pulls the middle in. */
export const RAIL_SHOE = { inner: 4.9, thick: 6.5, bow: 0.55 };
/** Distance from the pitch line to the shoe's inner face at fraction u along the rail (0 at the start). */
export function railInner(u: number) { return RAIL_SHOE.inner - RAIL_SHOE.bow * Math.sin(Math.PI * u); }
/** Forged idler-arm leg: waisted bar from one eye to the next, local +X along the leg. */
function armLinkShape(L: number, rA: number, rB: number) {
  const dip = Math.min(rA, rB) * 0.36;
  const yAt = (x: number) => { const u = x / L; return (1 - u) * rA + u * rB - dip * Math.sin(Math.PI * u); };
  const n = 14;
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) pts.push([(L * i) / n, yAt((L * i) / n)]);
  for (let i = 1; i < 8; i++) { const a = Math.PI / 2 - (Math.PI * i) / 8; pts.push([L + rB * Math.cos(a), rB * Math.sin(a)]); }
  for (let i = n; i >= 0; i--) pts.push([(L * i) / n, -yAt((L * i) / n)]);
  for (let i = 1; i < 8; i++) { const a = -Math.PI / 2 - (Math.PI * i) / 8; pts.push([rA * Math.cos(a), rA * Math.sin(a)]); }
  return polyShape(pts);
}
/** 19 T idler: duplex rings, eight lightening holes, bronze bush, round bore. */
function idlerSprocket(p: Part, s: 1 | -1, T: ReturnType<typeof tensionerLayout>, z: number) {
  const r = T.idlerR;
  const phase = toothPhase(s, T.idler.x, T.idler.y, r, IDLER_T);
  const rr = r - 3.6, rt = r + 3.4;
  const at: V3 = [T.idler.x, T.idler.y, z];
  for (const dz of [-ROW, ROW]) {
    p.add(extrudeC(sprocketRingShape(IDLER_T, rr, rt, rr - 4.4), 4.8, 0, 2).rotateZ(phase), 'steel', [at[0], at[1], at[2] + dz]);
  }
  const web = circleShape(rr - 4);
  const holeC = 14.2, holeR = 4;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    web.holes.push(circlePath(holeR, holeC * Math.cos(a), holeC * Math.sin(a)) as THREE.Path);
  }
  web.holes.push(circlePath(8.6) as THREE.Path);
  for (const zc of [-4.2, 4.2]) p.add(extrudeC(web, 5.2, 0.15, 20), 'steel', [at[0], at[1], at[2] + zc]);
  // Bronze bush only. The shaft and its bolt head are added with the arm so one pin runs through both.
  p.add(yToZ(lathe([[6.1, -6.5], [8.5, -6.5], [8.5, 6.5], [6.1, 6.5]], 24)), 'bronze', at);
}
/** Rail bolts (#3, 4 per bank): one through each end of the first two rails, head on the rail front face. */
export function railBolts(s: 1 | -1) {
  const z = CHAIN_Z[s];
  return guideRails(s).slice(0, 2).flatMap((r) => [r.f0 + 0.04, r.f1 - 0.04].map((f) => { const q = r.a.clone().lerp(r.b, f).add(r.n.clone().multiplyScalar(RAIL_TAB.off)); return new THREE.Vector3(q.x, q.y, z + RAIL_TAB.z1); }));
}
export function chainTensioner(s: 1 | -1) {
  const p = new Part();
  const z = CHAIN_Z[s];
  const T = tensionerLayout(s);
  // idler sprocket: 19 T duplex, 8 lightening holes, bronze bush, round bore (no hex)
  idlerSprocket(p, s, T, z);
  // heavy forged support: wide bushed boss under the sprocket, smaller pivot eye, tapered tail
  const armZ = z - 13;
  const armLeg = (a: THREE.Vector2, b: THREE.Vector2, rA: number, rB: number) => {
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
    const g = extrudeC(armLinkShape(L, rA, rB), 9, 0.4, 2);
    g.rotateZ(Math.atan2(dy, dx)); g.translate(a.x, a.y, armZ); p.add(g, 'forgedDark');
  };
  armLeg(T.pivot, T.idler, 12, 16);
  armLeg(T.idler, T.tail, 15, 7);
  p.add(yToZ(cyl(16, 14, 24)), 'forgedDark', [T.idler.x, T.idler.y, armZ]);
  p.add(yToZ(lathe([[8.2, -7], [10.4, -7], [10.4, 7], [8.2, 7]], 20)), 'bronze', [T.idler.x, T.idler.y, armZ]);
  p.add(yToZ(cyl(11, 12, 20)), 'forgedDark', [T.pivot.x, T.pivot.y, armZ]);
  p.add(yToZ(lathe([[5.4, -6], [7.2, -6], [7.2, 6], [5.4, 6]], 16)), 'bronze', [T.pivot.x, T.pivot.y, armZ]);
  p.add(yToZ(cyl(6.2, 12, 14)), 'polishedSteel', [T.pivot.x, T.pivot.y, armZ]); // idler arm pivot shaft (#3)
  // Idler sprocket shaft: through the bronze bush and into the arm boss, bolt head on the cover side.
  {
    const bushFront = z + 6.5;
    const shaftBack = armZ - 4;
    const shaftR = 5.5;
    p.add(yToZ(cyl(shaftR, bushFront - shaftBack, 18)), 'polishedSteel', [T.idler.x, T.idler.y, (shaftBack + bushFront) / 2]);
    p.add(yToZ(hexNut(14, 5)), 'zincPlate', [T.idler.x, T.idler.y, bushFront + 2.5]);
  }
  // tail pad (hardened, Z-axis) that the plunger dome bears on
  const padZ0 = z - 18, padZ1 = Math.max(T.adjZ + 8, z - 12);
  p.add(yToZ(cyl(ADJ.pad, padZ1 - padZ0, 20)), 'polishedSteel', [T.tail.x, T.tail.y, (padZ0 + padZ1) / 2]);
  // sealed hydraulic adjuster (930 105 049 00): cast body, mounting lug, tapered nose, dark gland, bleeder
  const adj = new Part();
  const L = ADJ.body, reach = T.reach;
  adj.add(lathe([
    [0.1, 0], [11.6, 0], [11.6, 3.2], [14.2, 5.4], [14.2, 8.5], [12.4, 11],
    [12.4, L * 0.36], [9.4, L * 0.56], [8.4, L * 0.7],
    [11.6, L * 0.76], [11.6, L * 0.86], [7.2, L * 0.92], [7.2, L], [0.1, L],
  ], 28), 'castAlu');
  adj.add(cyl(8.5, 7, 20), 'darkSteel', [0, L - 3.2, 0]);
  adj.add(cyl(2.2, 6, 10).rotateZ(Math.PI / 2).translate(11.4, L * 0.42, 0), 'darkSteel');
  adj.add(hexNut(7, 3.4).rotateZ(Math.PI / 2).translate(15.2, L * 0.42, 0), 'zincPlate');
  adj.add(cyl(5, reach - ADJ.dome - (L - 2), 14), 'polishedSteel', [0, (L - 2 + reach - ADJ.dome) / 2, 0]);
  adj.add(lathe([[0.1, 0], [6.5, 0], [6.5, 1.5], [3, ADJ.dome], [0.1, ADJ.dome]], 18), 'steel', [0, reach - ADJ.dome, 0]);
  adj.g.rotation.z = Math.atan2(T.axis.y, T.axis.x) - Math.PI / 2; adj.g.position.set(T.adjBase.x, T.adjBase.y, T.adjZ);
  p.g.add(adj.g);
  // Bake the rotated adjuster onto this part. cutGroup bakes matrixWorld into each mesh and then
  // zeroes only that mesh, so a leftover parent rotation would throw the body across the engine.
  p.g.updateMatrixWorld(true);
  const baked: THREE.Mesh[] = [];
  adj.g.traverse((o) => { if ((o as THREE.Mesh).isMesh) baked.push(o as THREE.Mesh); });
  for (const m of baked) {
    m.geometry = m.geometry.clone().applyMatrix4(m.matrixWorld);
    m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.scale.set(1, 1, 1); m.updateMatrix();
    p.g.add(m);
  }
  p.g.remove(adj.g);
  // thick cast mounting lug: two bosses, the stud through the outer one
  const earC = T.adjBase.clone().add(T.axis.clone().multiplyScalar(16));
  const ear2 = T.ear.clone().add(T.axis.clone().multiplyScalar(16));
  p.add(extrudeC(polyShape(hull([
    ...circlePts(earC.x, earC.y, 12, 16),
    ...circlePts(T.ear.x, T.ear.y, 9, 14),
    ...circlePts(ear2.x, ear2.y, 7, 12),
  ])), 7.5, 0.45), 'castAlu', [0, 0, T.adjZ]);
  p.add(yToZ(cyl(3.1, 7.5, 12)), 'darkSteel', [ear2.x, ear2.y, T.adjZ]);
  p.add(yToZ(cyl(4, T.adjZ + 12 - (HOUSING_Z0 + 4) , 10)), 'zincPlate', [T.ear.x, T.ear.y, (T.adjZ + 12 + HOUSING_Z0 + 4) / 2]);
  p.add(yToZ(cyl(8, 1.6, 16)), 'zincPlate', [T.ear.x, T.ear.y, T.adjZ + 3.6 + 0.8]);
  p.add(yToZ(hexNut(13, 6.5)), 'zincPlate', [T.ear.x, T.ear.y, T.adjZ + 3.6 + 1.6 + 3.25]);
  // plastic guide rails (#2): one continuous bowed U-channel per rail, not a chord of straight pads
  const shoe = (a: THREE.Vector2, b: THREE.Vector2, n: THREE.Vector2, f0: number, f1: number) => {
    const A = a.clone().lerp(b, f0), B = a.clone().lerp(b, f1);
    const steps = 28;
    const st = (i: number) => {
      const u = i / steps;
      const taper = Math.min(1, u * 7, (1 - u) * 7);
      const inner = railInner(u);
      const hz = 5.2 * (0.62 + 0.38 * taper);
      return { c: A.clone().lerp(B, u), inner, hz, taper };
    };
    // Z stays under the rail-bolt seat (RAIL_TAB.z1) so the bolt head still lands on the saddle face.
    const prism = (rad0: (s: ReturnType<typeof st>) => number, rad1: (s: ReturnType<typeof st>) => number, z0: (s: ReturnType<typeof st>) => number, z1: (s: ReturnType<typeof st>) => number) => {
      const pos: number[] = []; const idx: number[] = [];
      const id = (x: number, y: number, zz: number) => { pos.push(x, y, zz); return pos.length / 3 - 1; };
      const v0: number[] = [], v1: number[] = [], v2: number[] = [], v3: number[] = [];
      for (let i = 0; i <= steps; i++) {
        const s = st(i);
        const p0 = s.c.clone().addScaledVector(n, rad0(s));
        const p1 = s.c.clone().addScaledVector(n, rad1(s));
        v0.push(id(p0.x, p0.y, z + z0(s))); v1.push(id(p1.x, p1.y, z + z0(s)));
        v2.push(id(p0.x, p0.y, z + z1(s))); v3.push(id(p1.x, p1.y, z + z1(s)));
      }
      const quad = (a: number, b: number, c: number, d: number) => idx.push(a, b, c, a, c, d);
      for (let i = 0; i < steps; i++) {
        quad(v0[i], v1[i], v1[i + 1], v0[i + 1]);
        quad(v2[i], v2[i + 1], v3[i + 1], v3[i]);
        quad(v0[i], v0[i + 1], v2[i + 1], v2[i]);
        quad(v1[i], v3[i], v3[i + 1], v1[i + 1]);
      }
      quad(v0[0], v2[0], v3[0], v1[0]);
      quad(v0[steps], v1[steps], v3[steps], v2[steps]);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx); g.computeVertexNormals();
      p.add(g, 'blackPlastic');
    };
    prism((s) => s.inner, (s) => s.inner + RAIL_SHOE.thick, (s) => -s.hz, (s) => s.hz);
    // lips stay ~1 mm proud of the shoe so the roller (r 3.2) is not buried; back rib on the outer face
    prism((s) => s.inner - 1.05 * s.taper, (s) => s.inner + 0.35 * s.taper, () => 5.3, () => 7.5);
    prism((s) => s.inner - 1.05 * s.taper, (s) => s.inner + 0.35 * s.taper, () => -7.5, () => -5.3);
    prism((s) => s.inner + RAIL_SHOE.thick, (s) => s.inner + RAIL_SHOE.thick + 1.5 * s.taper, () => -2.2, () => 2.2);
  };
  const rails = guideRails(s);
  rails.forEach((r, i) => {
    shoe(r.a, r.b, r.n, r.f0, r.f1);
    if (i >= 2) return;
    for (const f of [r.f0 + 0.04, r.f1 - 0.04]) {
      const run = r.a.clone().lerp(r.b, f);
      const bolt = run.clone().add(r.n.clone().multiplyScalar(RAIL_TAB.off));
      p.add(yToZ(cyl(RAIL_TAB.r + 2.6, 5.5, 16)), 'blackPlastic', [bolt.x, bolt.y, z + RAIL_TAB.z0 + 3.2]);
      p.add(yToZ(cyl(RAIL_TAB.r, RAIL_TAB.z1 - RAIL_TAB.z0, 20)), 'blackPlastic', [bolt.x, bolt.y, z + (RAIL_TAB.z0 + RAIL_TAB.z1) / 2]);
      const start = RAIL_SHOE.inner + RAIL_SHOE.thick;
      const len = RAIL_TAB.off - start;
      const tab = boxMM([-3.4, 0, -6], [3.4, len + 2, 6]);
      tab.rotateZ(Math.atan2(r.n.y, r.n.x) - Math.PI / 2);
      tab.translate(run.x + r.n.x * start, run.y + r.n.y * start, z);
      p.add(tab, 'blackPlastic');
    }
  });
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
  // Deep cast outer wall: filleted outline, bowed to follow the chain, drafted out toward the cover, ribbed back to the straight wall.
  // The inner-edge flange (nut seats at |x| = 124) is not bowed, and the floor bow stays small so the heat exchanger stays clear.
  {
    let smooth = wall.map((q) => [q[0], q[1]] as [number, number]);
    for (let pass = 0; pass < 2; pass++) {
      const next: [number, number][] = [smooth[0]];
      for (let i = 0; i + 1 < smooth.length; i++) {
        const a = smooth[i], b = smooth[i + 1];
        next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      next.push(smooth[smooth.length - 1]);
      smooth = next;
    }
    const camPt = new THREE.Vector2(CAM_X * s, 0);
    const bowOf = (q: [number, number]) => {
      if (Math.abs(q[0] * s - CHAIN_BOX_INNER_X) < 14) return 0;
      if (q[1] < -90) return 2.5;
      if (q[0] * s > CAM_X - 36) return 16;
      return 12;
    };
    const pushOut = (q: [number, number], i: number, extra: number) => {
      const prev = smooth[Math.max(0, i - 1)], next = smooth[Math.min(smooth.length - 1, i + 1)];
      let tx = next[0] - prev[0], ty = next[1] - prev[1], l = Math.hypot(tx, ty) || 1;
      tx /= l; ty /= l;
      let ox = ty, oy = -tx;
      if (ox * (q[0] - camPt.x) + oy * (q[1] - camPt.y) < 0) { ox *= -1; oy *= -1; }
      const d = bowOf(q) + extra;
      return [q[0] + ox * d, q[1] + oy * d] as [number, number];
    };
    // Pull the skin off the inner-edge nut window. The flange face at |x|=124 is the seat; metal outboard of it buries the nut.
    const clearNuts = (q: [number, number]): [number, number] => {
      const ax = q[0] * s;
      const nutBand = (q[1] < -108 && q[1] > -156) || (q[1] > 20 && q[1] < 70);
      if (nutBand && ax > CHAIN_BOX_INNER_X - 1 && ax < CHAIN_BOX_INNER_X + 22) return [CHAIN_BOX_INNER_X * s, q[1]];
      return q;
    };
    const skin0 = smooth.map((q, i) => clearNuts(pushOut(q, i, 0)));
    const skin1 = smooth.map((q, i) => clearNuts(pushOut(q, i, bowOf(q) > 0 ? 4.5 : 0)));
    const zA = HOUSING_Z0 + 6, zB = HOUSING_Z1 - 12, thick = 5;
    const n = skin0.length;
    const pos: number[] = []; const idx: number[] = [];
    const id = (x: number, y: number, zz: number) => { pos.push(x, y, zz); return pos.length / 3 - 1; };
    const inward = (q: [number, number], i: number) => {
      const prev = skin0[Math.max(0, i - 1)], nxt = skin0[Math.min(n - 1, i + 1)];
      let tx = nxt[0] - prev[0], ty = nxt[1] - prev[1], l = Math.hypot(tx, ty) || 1;
      tx /= l; ty /= l;
      let ix = -ty, iy = tx;
      if (ix * (camPt.x - q[0]) + iy * (camPt.y - q[1]) < 0) { ix *= -1; iy *= -1; }
      return [ix, iy] as [number, number];
    };
    const a0: number[] = [], b0: number[] = [], a1: number[] = [], b1: number[] = [];
    for (let i = 0; i < n; i++) {
      const inn = inward(skin0[i], i);
      a0.push(id(skin0[i][0], skin0[i][1], zA));
      b0.push(id(skin0[i][0] + inn[0] * thick, skin0[i][1] + inn[1] * thick, zA));
      a1.push(id(skin1[i][0], skin1[i][1], zB));
      b1.push(id(skin1[i][0] + inn[0] * thick, skin1[i][1] + inn[1] * thick, zB));
    }
    const quad = (a: number, b: number, c: number, d: number) => idx.push(a, b, c, a, c, d);
    for (let i = 0; i + 1 < n; i++) {
      quad(a0[i], a0[i + 1], a1[i + 1], a1[i]);
      quad(b0[i], b1[i], b1[i + 1], b0[i + 1]);
      quad(a0[i], b0[i], b0[i + 1], a0[i + 1]);
      quad(a1[i], a1[i + 1], b1[i + 1], b1[i]);
    }
    const skin = new THREE.BufferGeometry();
    skin.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    skin.setIndex(idx); skin.computeVertexNormals();
    p.add(skin, 'castAlu');
    for (let i = 4; i < n - 4; i += 8) {
      const a = smooth[i], b = skin0[i];
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]); if (d < 3) continue;
      const g = boxMM([-1.6, 0, zA + 2], [1.6, d, zB - 2]);
      g.rotateZ(Math.atan2(b[1] - a[1], b[0] - a[0]) - Math.PI / 2);
      g.translate(a[0], a[1], 0); p.add(g, 'castAlu');
    }
  }
  // lid-face flange lip (closed ring incl. the inner edge, which bolts to the case well flange)
  p.add(extrude(shapeFrom(chainOutline(s, 3), [chainOutline(s, -4)]), 5, 0, 6), 'castAlu', [0, 0, HOUSING_Z1 - 5]);
  // inner-edge flange to the crankcase well (gasket face)
  const yTop = Math.max(...o.filter((q) => Math.abs(q[0] * s - CHAIN_BOX_INNER_X) < 0.5).map((q) => q[1]));
  const yBot = Math.min(...o.filter((q) => Math.abs(q[0] * s - CHAIN_BOX_INNER_X) < 0.5).map((q) => q[1]));
  // flange strips (nuts for the case studs seat on their outer face). The lower strip is tall
  // enough that the nuts sit above the bulging floor wall.
  p.add(boxMM([CHAIN_BOX_INNER_X * s - (s > 0 ? 0 : 6), yBot, HOUSING_Z0], [CHAIN_BOX_INNER_X * s + (s > 0 ? 6 : 0), yBot + 36, HOUSING_Z1]), 'castAlu');
  p.add(boxMM([CHAIN_BOX_INNER_X * s - (s > 0 ? 0 : 6), yTop - 18, HOUSING_Z0], [CHAIN_BOX_INNER_X * s + (s > 0 ? 6 : 0), yTop, HOUSING_Z1]), 'castAlu');
  // cast bosses for the cover studs (studs added with the hardware).
  // A boss beside the inner-edge nuts is clipped at the flange face so the nut head stays clear.
  for (const b of chainCoverBolts(s)) {
    const z0b = b.x * s > CAM_END_X - 4 ? CAM_HOUSING_END_Z + 5 : HOUSING_Z0 + 4;
    const zc = (z0b + HOUSING_Z1) / 2;
    let boss = yToZ(cyl(5.5, HOUSING_Z1 - z0b, 14));
    boss.translate(b.x, b.y, zc);
    const seatX = (CHAIN_BOX_INNER_X + 6) * s;
    const crossesNut = [yTop - 10, yBot + 13.5].some((y) => Math.hypot(b.x - seatX, b.y - y) < 8);
    if (crossesNut) {
      const cutter = s > 0
        ? boxMM([seatX - 0.2, -400, 0], [400, 400, 400])
        : boxMM([-400, -400, 0], [seatX + 0.2, 400, 400]);
      boss = csgSub(boss, cutter);
    }
    p.add(boss, 'castAlu');
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
  // low machined pad over the cam (the chain-side closure is this lid, not a plug in the cam bore)
  p.add(yToZ(lathe([[0, 0], [32, 0], [32, 1.5], [18, 2.1], [18, 2.6], [0, 2.6]], 48)), 'castAlu', [CAM_X * s, 0, zt - 0.3]);
  p.add(yToZ(lathe([[8, 0], [14, 0], [14, 0.5], [8, 0.5]], 32)), 'machinedAlu', [CAM_X * s, 0, zt + 2.2]);
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

/**
 * Intermediate shaft (103-15 #43): 60 T helical gear + two 24 T duplex sprockets.
 * Sprocket planes stay at CHAIN_Z and the gear stays on the crank-gear plane (z 192–206): the photo's
 * sprocket|gear|sprocket stack would move a chain or the mesh, so the gear remains inboard of both sprockets.
 * The long flywheel-end run is the oil-pump connecting shaft, drawn as its own dark tube in this asset.
 */
/** 60 T intermediate gear. Module keeps the 35 T crank gear meshed on the existing 84 mm centres. */
export const INT_GEAR = { teeth: 60, module: 168 / (CRANK_GEAR_T + 60) };
export function intermediateShaft() {
  const p = new Part();
  const y = INT_SHAFT_Y;
  const seg = (r: number, z0: number, z1: number, mat: MatKey, segs = 24) => {
    if (z1 - z0 < 0.4) return;
    p.add(yToZ(cyl(r, z1 - z0, segs)), mat, [0, y, (z0 + z1) / 2]);
  };
  // oil-pump connecting shaft (104-00 #6): dark tube, spline where it meets the intermediate shaft
  seg(6.6, -118, -74, 'darkSteel', 16);
  for (let i = 0; i < 8; i++) {
    const g = boxMM([-1.15, 4.2, -5], [1.15, 9.4, 5]);
    g.rotateZ((i / 8) * Math.PI * 2);
    g.translate(0, y, -80);
    p.add(g, 'darkSteel');
  }
  // rear journal (j0 = −60). Circlips sit just outside it on the Ø18 land; bearing ID is 26.1.
  seg(9, -74, -69.4, 'steel');
  seg(8.15, -69.4, -68.2, 'steel');
  seg(13, -68, -52, 'polishedSteel');
  seg(8.15, -51.8, -50.6, 'steel');
  seg(9, -50.6, -46, 'steel');
  // stout span between the two case journals (webs are bored Ø32, so r 12 clears)
  seg(12, -46, 136, 'steel', 20);
  // pulley-end journal (j1 = 150) + thrust shoulder. Thrust washers and circlips seat on the Ø18 lands.
  seg(9, 136, 138.4, 'steel');
  seg(8.15, 138.4, 140.4, 'steel');
  seg(9, 140.4, 142, 'steel');
  seg(13, 142, 158, 'polishedSteel');
  seg(9, 158, 161.6, 'steel'); // thrust washer (z 159) and circlip (z 160.8) sit on this land
  seg(15.2, 161.6, 165.2, 'steel'); // thrust collar; the z 177 web bore is Ø32, so r 15.2 still clears it
  seg(11, 165.2, 188, 'steel');
  // bolted flange + 60 T helical gear, centred on the crank gear (z 192–206), opposite hand
  seg(16, 188, 192, 'steel');
  const pr = (INT_GEAR.teeth * INT_GEAR.module) / 2;
  const g0 = 192, g1 = 206;
  const hub = circleShape(36);
  hub.holes.push(circlePath(10) as THREE.Path);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.18;
    hub.holes.push(circlePath(3.5, 28 * Math.cos(a), 28 * Math.sin(a)) as THREE.Path);
  }
  p.add(extrude(hub, g1 - g0 + 2), 'steel', [0, y, g0 - 1]);
  const k = INT_GEAR.module / 2;
  // Teeth stop at z 204.7, 0.26 mm short of the pulley-end bulkhead (z 205). The hub still spans z 192–206.
  // Same slice planes as the crank gear (MESH_DZ) and the opposite tan(30°)/pr rate, so a flank
  // that clears at one depth clears the whole face. Phase seats the crank tip in the gap.
  const toothZ1 = 204.7;
  const rate = -Math.tan(30 * DEG) / pr;
  const meshPhase = Math.PI / INT_GEAR.teeth - 0.055;
  addHelix(p, INT_GEAR.teeth, pr - 3.2 * k, pr + 1.6 * k, 34, g0, toothZ1, rate, 'steel', [0, y, 0], meshPhase, true, MESH_DZ);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.18;
    const x = 28 * Math.cos(a), yy = y + 28 * Math.sin(a);
    p.add(yToZ(cyl(3.3, g1 - g0 + 4, 10)), 'steel', [x, yy, (g0 + g1) / 2]);
    p.add(yToZ(hexNut(8, 3)), 'darkSteel', [x, yy, g1 + 1.2]);
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.18;
    const tab = boxMM([-13, -3.2, -0.7], [13, 3.2, 0.7]);
    tab.translate(0, 28, 0);
    tab.rotateZ(a + Math.PI / 6);
    tab.translate(0, y, g1 + 1.4);
    p.add(tab, 'darkSteel');
  }
  // short spacer, then the two duplex sprockets on their existing planes (left 235, right 258)
  seg(13, 208, 226, 'steel');
  for (const s of [1, -1] as const) duplexSprocket(p, INT_T, INT_SPROCKET_R, [0, y, CHAIN_Z[s]], 9, 'steel', toothPhase(s, 0, y, INT_SPROCKET_R, INT_T));
  seg(12, 250.2, 257.6, 'steel'); // land between the almost-touching sprocket rows
  seg(11, 266, 276, 'polishedSteel');
  p.add(yToZ(hexNut(16, 6)), 'darkSteel', [0, y, 280]);
  TEMP_shaveForLockNutStud(p.g);
  return p.g;
}

/**
 * Temporary static-pose hack for the left M8 lock nut and the stud through the lower lug.
 * Bottom End's zero-clash PR will move the stud and boss outboard and then delete this.
 * Removing the call restores all 60 whole teeth.
 */
export const TEMP_LOCKNUT_STUD_SHAVE = true;
export function TEMP_shaveForLockNutStud(root: THREE.Object3D) {
  if (!TEMP_LOCKNUT_STUD_SHAVE) return;
  subtractSolids(root, perimeterClashSolids());
}

/**
 * Solids the 60 T gear still has to clear after the case pocket removes both lug bosses:
 * the left M8 lock nut (washer r 8, hex AF 13, nylon cap) and the stud through the lug.
 * Each solid is 2.4 mm outside the fastener. The collision test erodes 1 mm, and the
 * fastener normals point inward, so a tighter pad comes back as a hit.
 */
export function perimeterClashSolids(): THREE.BufferGeometry[] {
  const seat = new THREE.Vector3(-CASE_LUG.x, CASE_LUG.yBot, 190);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0));
  const m = new THREE.Matrix4().compose(seat, q, new THREE.Vector3(1, 1, 1));
  const wt = 1.6, h = 6.5, af = 13, pad = 2.4;
  const along = (g: THREE.BufferGeometry, y0: number, y1: number) => g.translate(0, (y0 + y1) / 2, 0).applyMatrix4(m);
  // Inboard of the seat (local y < 0) so the tooth ring is already gone on the face the nut bears on.
  const washer = along(cyl(8 + pad, wt + 1.8, 24), -1.6, wt + 0.2);
  const hex = along(cyl(af / Math.sqrt(3) + pad, h + 0.3, 16), wt - 0.15, wt + h + 0.15);
  const nylon = along(cyl(af * 0.45 + pad, h * 0.3 + 1.6, 20), wt + h - 0.2, wt + h + h * 0.3 + 1.4);
  // studGeometry: r = M/2*0.96, from -(grip+embed) to headHeight+1.5. Lock head is wt + h*1.3.
  const top = wt + h * 1.3 + 1.5, bot = -(2 * CASE_LUG.x + 14);
  const stud = along(cyl(4 * 0.96 + pad, top - bot + 0.4, 12), bot - 0.2, top + 0.2);
  return [washer, hex, nylon, stud];
}
