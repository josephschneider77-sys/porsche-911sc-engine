/**
 * Bottom end + top end assets (crankcase, crank, rods, pistons, cylinders, heads, valve train, cam drive).
 * Shapes traced from the Porsche 911 1978-83 parts catalogue illustrations (groups 101-103) and scaled with
 * published / measured dimensions (see docs/engine-spec.md). All units mm.
 */
import * as THREE from 'three';
import { ShapeUtils } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  Part, V3, DEG, lathe, closedLathe, boxMM, cyl, cylBetween, yToZ, yToX, roundRect, circlePath, circleShape, ringShape,
  polyShape, hull, circlePts, gearShape, timingGearShape, sprocketRingShape, rollerChainShape, extrude, extrudeC, hexNut, tube, torus, spring, paramSurface, plate, gusset, csgSub, csgUnion, woodruffGeom, subtractSolids, cutGroup,
} from './util';
import { cutClosed, manifoldAdd, manifoldIntersect, manifoldSub } from './manifoldCut';
import {
  SPEC, SPARK_Z, SPARK_TIP, SPARK_MINOR_D, SPARK_SEAT_Y, SPARK_WELL_T, sparkDirHead, CYL_Z, MAIN_Z, THROW_DEG, DECK_X, CYL_TOP_X, HEAD_OUT_X, CAM_X, CAM_HOUSING_OUT_X, INT_SHAFT_Y, CASE_Z, NOSE_BEARING_Z,
} from '../data/layout';
import type { MatKey } from './materials';
import { HEAD_HW, CASE_TB, CASE_LUG, caseLugY } from './hwLayout';
import { crownSurfaceX, headChamberCutter, headValvePockets, headValveBores, stemDirLocal, stemPointLocal } from './valveGeom';

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
/**
 * Drop loft triangles that sit inside the cast distributor boss. The open skin cannot be CSG'd.
 * The boss flange (r 16–38) covers this opening, so the cut edge is not a hole in the case.
 * Axis matches DIST in aux.ts.
 */
function punchDistributor(g: THREE.BufferGeometry) {
  const src = g.index ? g.toNonIndexed() : g;
  const P = src.getAttribute('position');
  const o = new THREE.Vector3(-36.2, 26.5, 216);
  const aim = new THREE.Vector3(-150, 168, 150);
  const A = aim.sub(o).normalize();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), w = new THREE.Vector3();
  const near = (p: THREE.Vector3) => {
    const t = w.copy(p).sub(o).dot(A);
    const r = w.copy(o).addScaledVector(A, t).distanceTo(p);
    // Bore through the shank, plus the skin under the hold-down lug (r 45, t 93–104).
    if (t >= 12 && t <= 102 && r < 18) return true;
    return t >= 93 && t <= 104 && r < 45;
  };
  const pos: number[] = [];
  for (let i = 0; i < P.count; i += 3) {
    a.fromBufferAttribute(P, i); b.fromBufferAttribute(P, i + 1); c.fromBufferAttribute(P, i + 2);
    if (near(a) || near(b) || near(c)) continue;
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.computeVertexNormals();
  return out;
}
/** mulberry32. three-bvh-csg jitters coplanar rays with Math.random, so the hollow right case was not byte-stable. */
function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let crankRightSeeded = false;
export function crankcaseHalf(s: 1 | -1) {
  if (s > 0 && !crankRightSeeded) {
    crankRightSeeded = true;
    const random = Math.random;
    Math.random = mulberry32(0x9115c);
    try { return crankcaseHalf(s); }
    finally { Math.random = random; crankRightSeeded = false; }
  }
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
      // The z 190 lug is lowered clear of the intermediate gear. The flange lobe follows it.
      const gearLug = outer ? 16 * Math.exp(-(((z - 190) / 9) ** 2)) : 0;
      pts.push([yB - scallop(z, CASE_LUG.bottom, ampBot) - drop - gearLug, z]);
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
    (p.g.children[p.g.children.length - 1] as THREE.Mesh).userData.flange = true;
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
  const loft = (section: (z: number) => [number, number][], zA: number, zB: number, punch = false) => {
    const n = section(zA).length;
    let g = paramSurface((u, v) => {
      const z = zA + (zB - zA) * u;
      const sec = section(z);
      const f = Math.min(n - 1e-4, v * n);
      const i = Math.floor(f);
      const t = f - i;
      const a = sec[i], b = sec[(i + 1) % n];
      return [(a[0] + (b[0] - a[0]) * t) * s, a[1] + (b[1] - a[1]) * t, z];
    }, 64, n * 3);
    if (punch) g = punchDistributor(g);
    p.add(g, CAST);
  };
  // Skin stays outside the crank/rod swing. Chords of a 4-point loop cut back into the bay,
  // so each section is subdivided and pushed out to r 86 (rod swing peaks near r 73).
  const pushOut = (x: number, y: number, minR: number): [number, number] => {
    const r = Math.hypot(x, y);
    if (r >= minR) return [x, y];
    const k = minR / Math.max(r, 0.001);
    return [x * k, y * k];
  };
  const bulge = (pts: [number, number][], minR: number): [number, number][] => {
    const out: [number, number][] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      for (let k = 0; k < 6; k++) {
        const t = k / 6;
        out.push(pushOut(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, minR));
      }
    }
    return out;
  };
  // 48 T gear, tip r 49.6 about the intermediate shaft. Keep the skin 8 mm outside that circle.
  const clearGear = (x: number, y: number, z: number): [number, number] => {
    if (z < 178 || z > 230) return [x, y];
    const dy = y - INT_SHAFT_Y;
    const d = Math.hypot(x, dy);
    if (d >= 66) return [x, y];
    const k = 66 / Math.max(d, 0.2);
    return [x * k, INT_SHAFT_Y + dy * k];
  };
  // Low fan-collar tab (r 9 at local x 39, y 84). Drop the shoulder under it.
  const underTab = (x: number, y: number, z: number): [number, number] => {
    if (z < 186 || z > 216) return [x, y];
    if (x > 18 && x < 64 && y > 48 && y < 120) return [x, 48];
    return [x, y];
  };
  // Shoulder clears the piston skirts (r 47 on each bore) and the rod beams that rise beside them.
  const overPistons = (x: number, y: number, z: number): [number, number] => {
    let yy = y;
    for (const zc of cyls) {
      if (Math.abs(z - zc) > 50 || x > 100) continue;
      if (yy < 86 && yy > 10) yy = 88;
    }
    return [x, yy];
  };
  loft((z) => {
    const c = crown(z);
    const raw: [number, number][] = [[8, 104], [34, Math.max(90, c)], [64, Math.max(88, c)], [78, 70], [50, 88], [16, 96]];
    return bulge(raw, 90).map(([x, y]) => {
      let q = overPistons(x, y, z);
      q = underTab(q[0], q[1], z);
      return clearGear(q[0], q[1], z);
    });
  }, z0 + 6, z1 - 6, s < 0);
  loft((z) => {
    // Oil-pump cover and pickup (z -175..-120): skin stays below the nuts and the pump body.
    const open: [number, number][] = [[12, -100], [40, -86], [62, -104], [74, -118], [46, -124], [16, -116]];
    const low: [number, number][] = [[16, -138], [42, -148], [64, -146], [78, -132], [52, -140], [20, -142]];
    const raw = (z > -178 && z < -118 ? low : open);
    return bulge(raw, 90).map(([x, y]) => clearGear(x, y, z));
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
  extrudeYZ(wall, 66, 12, CAST, cyls.map((z) => [0, z, 54]));

  // one barrel boss per spigot: open bore, bright counterbore ring, stud bosses just outside the ring
  for (const zc of cyls) {
    // Bore 54: 2.5 mm off the cylinder skirt (OD 51.5). The deck seat is the face outside that.
    // Peak r 62: the old r 76 swell reached the flywheel (cyl 6) and the next piston skirt.
    const boss = yToX(lathe([
      [54, 0], [58, 2], [62, 9], [62, 16], [56, 23], [54, 27.5], [54, 29.5],
    ], 48));
    if (s < 0) boss.rotateZ(Math.PI);
    const root = (DECK_X - 29.5) * s;
    p.add(boss, CAST, [root, 0, zc]);
    const face = yToX(lathe([[58.5, 0], [64, 0], [64, 2.2], [58.5, 2.2]], 48));
    if (s < 0) face.rotateZ(Math.PI);
    p.add(face, 'machinedAlu', [(DECK_X - 2.2) * s, 0, zc]);
    const liner = yToX(lathe([[53.2, 0.8], [54, 0.8], [54, 20], [53.2, 20]], 32));
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
  const addProfile = (pts: [number, number][], zA: number, zB: number, mat: MatKey, holes: THREE.Path[] = []) => {
    if (zB - zA < 0.4) return;
    const m = pts.map(([x, y]) => [x * s, y] as [number, number]);
    const sh = polyShape(s > 0 ? m : m.slice().reverse());
    for (const h of holes) sh.holes.push(h);
    const g = extrude(sh, zB - zA, 0, 8); g.translate(0, 0, zA); p.add(g, mat);
  };
  // Sump is a wall, not a plug. Inner edge stays ~14 mm inside the outer skin so the crank bay,
  // intermediate shaft and oil pump are open; the outer skin still carries the sump studs and plugs.
  // The wall top (y −108 at the split) sits below the shaft, so the Ø32 land is not buried in it.
  // Outer peak is x 90 at y −102. The oil cooler no longer crosses this wall.
  const sumpWall: [number, number][] = [
    [0, -108], [0, -120], [16, -128], [42, -126], [74, -116], [90, -102], [82, -88], [66, -78],
    [54, -84], [68, -98], [70, -110], [44, -116], [22, -112], [12, -106],
  ];
  addProfile(sumpWall, z0 + 4, z1 - 4, CAST);
  // Lower edge stays inboard of the oil-pump cover nuts (y ≈ -88, |x| ≈ 28) at the flywheel main.
  const WEB: [number, number][] = [
    [0, 96], [24, 92], [50, 70], [50, 46], [40, 36], [40, -28], [26, -50], [22, -68], [22, -108], [0, -112],
  ];
  // Cheek faces sit ~6.2 mm from each main centre. Webs stop at 3 mm so the gap is ~3 mm.
  // Pulley main may run forward to z 185 (timing gear starts at 192). Flywheel main may run aft.
  const webSpan = (z: number): [number, number] => (z < -160 ? [z - 5, z + 3] : z > 160 ? [z - 3, z + 8] : [z - 3, z + 3]);
  for (const z of MAIN_Z) {
    const [zA, zB] = webSpan(z);
    // Bores are notches in the outline. A hole across the split leaves a wall through the journal.
    const webPts: [number, number][] = WEB.map((q) => [q[0], q[1]]);
    const addNotch = (r: number, cy: number) => {
      webPts.push([0, cy - r]);
      const N = 18;
      for (let i = 1; i < N; i++) {
        const a = -Math.PI / 2 + (i / N) * Math.PI;
        webPts.push([r * Math.cos(a), cy + r * Math.sin(a)]);
      }
      webPts.push([0, cy + r]);
    };
    addNotch(20, INT_SHAFT_Y);
    addNotch(34, 0);
    addProfile(webPts, zA, zB, CAST);
    (p.g.children[p.g.children.length - 1] as THREE.Mesh).userData.saddle = true;
    const seat = yToZ(lathe([[SADDLE_R - 0.4, -3], [SADDLE_R + 2.6, -3], [SADDLE_R + 2.6, 3], [SADDLE_R - 0.4, 3]], 36, s > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI));
    p.add(seat, 'machinedAlu', [0, 0, z]);
    // ID 16.2 clears the r 13 intermediate journals by 3 mm (the old 13.6 land was a 0.6 mm running fit, inside the 1 mm erosion).
    const iSeat = yToZ(lathe([[16.2, -3], [19.4, -3], [19.4, 3], [16.2, 3]], 28, s > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI));
    p.add(iSeat, 'machinedAlu', [0, INT_SHAFT_Y, z]);
    for (const y of [46, -46]) {
      p.add(boxMM([s > 0 ? 0 : -4, y - 7.5, z - 3], [s > 0 ? 4 : 0, y + 7.5, z + 3]), 'machinedAlu');
      p.add(yToX(cyl(4.2, 3.4, 14)), 'bore', [X(1.8), y, z]);
    }
  }

  // rounded end bulkheads (rear main, and the nose passing into the chain well)
  const END: [number, number][] = [
    [0, 100], [18, 106], [46, 64], [58, 28], [58, -36], [44, -72], [20, -108], [0, -112],
  ];
  // Rear bore clears the flywheel flange (r 54) with 6 mm. Pulley bore clears the crank gear
  // (tip r 38.6) and the intermediate gear (tip r 49.6); the two holes meet because the gears mesh.
  addProfile(END, z0, z0 + 8, CAST, [disk(62, 0, 0), disk(20, 0, INT_SHAFT_Y)]);
  // Crown held at y 76 so the fan drum (bottom ~ y 88) and the alternator are outside the casting.
  const END_FAN: [number, number][] = [
    [0, 76], [28, 76], [46, 64], [58, 28], [58, -36], [44, -72], [20, -108], [0, -112],
  ];
  // Starts at z 209: crank gear ends at 206, so the wall is 3 mm clear of the teeth.
  addProfile(END_FAN, z1 - 3, z1, 'machinedAlu', [disk(44, 0, 0), disk(54, 0, INT_SHAFT_Y)]);

  // through-bolt bosses: seat face exactly at |x| = CASE_TB.x
  for (const z of CASE_TB.z) for (const y of CASE_TB.y) {
    p.add(yToX(cyl(12, 10, 16)), CAST, [X(90), y, z]);
    p.add(yToX(cyl(CASE_TB.r, CASE_TB.x - 95, 24)), CAST, [X((CASE_TB.x + 94) / 2 - 0.5), y, z]);
    p.add(yToX(cyl(CASE_TB.r, 1, 24)), 'machinedAlu', [X(CASE_TB.x - 0.5), y, z]);
  }
  // perimeter nut bosses, one per bolt, sitting in the flange lobes. Seat face at |x| = CASE_LUG.x.
  for (const [top, zs] of [[true, CASE_LUG.top], [false, CASE_LUG.bottom]] as const) for (const z of zs) {
    const y = caseLugY(z, top);
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

  // Seal land in the flywheel recess. Disk face at r > 60 is z -217; this face is z -214.5
  // (2.5 mm running clearance). ID 66 stays outside the crank flange (r 54) and the hub (r 55).
  p.add(yToZ(lathe([[66, 0], [78, 0], [78, 7], [66, 7]], 48, s > 0 ? 0 : Math.PI, Math.PI)), CAST, [0, 0, -214.5]);
  for (const [x, y] of [[78, 58], [84, -54], [36, -100], [40, 92]] as const) {
    // Bosses end at z -209, 4 mm off the hub face and 8 mm off the recessed disk.
    p.add(yToZ(cyl(8, 6, 14)), CAST, [X(x), y, -206]);
    p.add(yToZ(cyl(4.6, 6, 8)), 'zincPlate', [X(x), y, -206]);
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
  // Bores are notches on the split. A full circle centred on x=0 sits outside the half-plate, so earcut
  // drops it and the nose (r 20) plus the intermediate-shaft nut stay buried in a solid wall.
  const notchArc = (sign: 1 | -1, cy: number, r: number, down: boolean): [number, number][] => {
    const pts: [number, number][] = [];
    const N = 16;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const a = down ? Math.PI / 2 - t * Math.PI : -Math.PI / 2 + t * Math.PI;
      pts.push([sign * Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    return pts;
  };
  const platePts: [number, number][] = s > 0
    ? [...bot, ...top.slice(0, -1), [0.5, 46], ...notchArc(1, 0, 46, true), [0.5, -46], [0.5, INT_SHAFT_Y + 24], ...notchArc(1, INT_SHAFT_Y, 24, true), [0.5, INT_SHAFT_Y - 24], [0.5, -136]]
    : [[-0.5, 50], [-60, 44], [X(CHAIN_BOX_INNER_X), W.yTop], [X(CHAIN_BOX_INNER_X), W.yBot], [-70, -140], [-0.5, -138], [-0.5, -136], [-0.5, INT_SHAFT_Y - 24], ...notchArc(-1, INT_SHAFT_Y, 24, false), [-0.5, INT_SHAFT_Y + 24], [-0.5, -46], ...notchArc(-1, 0, 46, false), [-0.5, 46]];
  p.add(extrude(polyShape(platePts), 6, 0, 8), CAST, [0, 0, W.z1 - 6]);
  const noseZ = 236;
  // Inner r 36 clears the distributor-drive gear (tip r 32.4) where this tube starts at z 220.
  p.add(yToZ(lathe([[36, 0], [42, 0], [42, W.z1 - 6 - 220], [36, W.z1 - 6 - 220]], 32, s > 0 ? 0 : Math.PI, Math.PI)), CAST, [0, 0, 220]);
  // Bore 31: the nose journal is r 27 here. The old r 26.2 saddle was inside the journal.
  p.add(yToZ(lathe([[31, -8], [36, -8], [36, 8], [31, 8]], 32, s > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI)), 'machinedAlu', [0, 0, noseZ]);
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
    // Oil-cooler pad is added after the interior cut (see below). A boolean on this
    // cheek spiked into the cooler.
  } else {
    p.add(boxMM([-76, 108, 108], [-30, 122, 190]), CAST);
    // Shoulder cone (r 13.2 → 16.4 around local t 92–95) used to enter this block,
    // which reached r 14.5 inside the bore. punchDistributor only drops outer-shell
    // triangles, so the bore is cut out of the block itself. Ends stay outside the
    // solid so the subtraction is an open tunnel, not a wall across the shank.
    {
      const o = new THREE.Vector3(-36.2, 26.5, 216);
      const A = new THREE.Vector3(-150, 168, 150).sub(o).normalize();
      const at = (t: number) => o.clone().addScaledVector(A, t);
      const a = at(25), b = at(115);
      const cheek = boxMM([-80, 56, 118], [-36, 108, 188]);
      p.add(csgSub(cheek, cylBetween([a.x, a.y, a.z], [b.x, b.y, b.z], 17.5, 24)), CAST);
    }
    // spot-faced pad under the left half for the 101-05 #22/#23 M10 stud nut (E position)
    p.add(cyl(10, 8, 20), CAST, [-40, -127, -186]);
    p.add(cyl(10, 28, 16, 16), CAST, [-40, -109, -186]);
    // warm-up regulator flange underside is y = 116.2 (WUR.flangeTop - 5). Screws thread down into this pad.
    p.add(boxMM([-72, 114.8, -198], [-48, 116.2, -142]), 'machinedAlu');
    p.add(boxMM([-76, 46, -202], [-44, 114.8, -138]), CAST);
    // Cast distributor boss, blended out of the pulley-end skin. Same axis as DIST in aux.ts.
    // The flange (r 16–38) covers the skin opening. The hold-down stud lands on its own pad,
    // not on a box corner. Mouth face is local t 93, just behind the distributor shoulder.
    {
      const o = new THREE.Vector3(-36.2, 26.5, 216);
      const Y = new THREE.Vector3(-150, 168, 150).sub(o).normalize();
      const hint = new THREE.Vector3(-1, 0.08, 0.42);
      const X = hint.clone().addScaledVector(Y, -hint.dot(Y)).normalize();
      const Z = new THREE.Vector3().crossVectors(X, Y);
      const m = new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(o);
      // Flange grows to r 50 so it covers the r 45 skin opening under the lug.
      const boss = lathe([
        [16.4, 40], [22, 40], [28, 62], [42, 76], [50, 84], [50, 93],
        [17.2, 93], [16.4, 88], [16.4, 40],
      ], 32);
      boss.applyMatrix4(m);
      // Notch only where the flange would cover a through-bolt or enter the fan mouth.
      // The rest of the collar still spans r 18–30.
      const bossHold = new THREE.Group();
      bossHold.add(new THREE.Mesh(boss));
      subtractSolids(bossHold, [
        boxMM([-140, 48, 163], [-103, 78, 191]),
        boxMM([-115, 58, 200], [-40, 125, 228]),
        // The r 50 flange would enter the fan mouth and the shroud horn.
        boxMM([-130, 80, 218], [-50, 155, 255]),
      ]);
      p.add((bossHold.children[0] as THREE.Mesh).geometry, CAST);
      // Same local stud as DIST.stud in aux.ts: +X, the vacuum-can side.
      const atStud = (y: number) => new THREE.Vector3(28, y, 2).applyMatrix4(m);
      const s0 = atStud(70), s1 = atStud(90), s2 = atStud(97.5);
      p.add(cylBetween([s0.x, s0.y, s0.z], [s1.x, s1.y, s1.z], 12, 16), CAST);
      p.add(cylBetween([s1.x, s1.y, s1.z], [s2.x, s2.y, s2.z], 11, 16), 'machinedAlu');
    }
  }
  // round sump boss (strainer cover seats here).
  const sumpBoss = yToZ(lathe([[0.1, -2], [84, -2], [84, 2], [0.1, 2]], 48, s > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI)).rotateX(Math.PI / 2);
  sumpBoss.translate(0, -126, -10);
  p.add(sumpBoss, CAST);
  hollowCaseInterior(p, s);
  // 60 T running tunnel. The hollow above opens the bay; these cutters finish the bearing
  // seats and the gear pocket (tips stop at z 204.7). Plane clip, so it still cuts meshes
  // the hollow already turned into BufferGeometry. End disks stay open.
  const axial = (r: number, y: number, zA: number, zB: number) => {
    const g = yToZ(cyl(r, zB - zA, 32));
    g.translate(0, y, (zA + zB) / 2);
    return g;
  };
  const yS = INT_SHAFT_Y;
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
  return p.g;
}

/** CSG only on closed solids. Open skins (param surfaces, lathes) invert under three-bvh-csg. */
function cutSolids(root: THREE.Object3D, cutters: THREE.BufferGeometry[]) {
  root.updateMatrixWorld(true);
  const boxes = cutters.map((c) => { c.computeBoundingBox(); return c.boundingBox!.clone(); });
  const solid = new Set(['ExtrudeGeometry', 'CylinderGeometry', 'BoxGeometry']);
  root.traverse((o: THREE.Object3D) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh) return;
    if (!solid.has(mesh.geometry.type)) return;
    if (mesh.userData.saddle) return; // extruded half-bores; a later boolean fills them
    const g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    g.computeBoundingBox();
    const hit = cutters.filter((_, i) => boxes[i].intersectsBox(g.boundingBox!));
    if (!hit.length) return;
    // One cutter. A stack of coaxial subtractions drops the later bores (the pulley bay stayed solid).
    mesh.geometry = csgSub(g, hit.length === 1 ? hit[0] : csgUnion(hit));
    mesh.position.set(0, 0, 0); mesh.rotation.set(0, 0, 0); mesh.scale.set(1, 1, 1); mesh.updateMatrix();
  });
}

/**
 * Clearance pockets in the casting. Cutters are the empty volume (running clearance built in),
 * so internal parts are not buried in a solid bay and the saddle bores stay put.
 */
function hollowCaseInterior(p: Part, s: 1 | -1) {
  const cuts: THREE.BufferGeometry[] = [];
  const cylZ = (r: number, y: number, za: number, zb: number, segs = 28) => {
    if (zb - za < 1) return;
    cuts.push(yToZ(cyl(r, zb - za, segs)).translate(0, y, (za + zb) / 2));
  };
  // Crank bay between the saddle webs. Webs keep their half-bores (r 33.2 / r 16).
  // r 76 clears the cheek envelope (~r 70) and opens the rear bulkhead around the flange (r 54).
  const webs = [...MAIN_Z].sort((a, b) => a - b);
  const webSpan = (z: number): [number, number] => (z < -160 ? [z - 5, z + 3] : z > 160 ? [z - 3, z + 8] : [z - 3, z + 3]);
  let prev = -206;
  for (const z of webs) {
    const [a, b] = webSpan(z);
    // 1.2 mm short of the web so the saddle bore (r 33.2) is not opened. The split flange
    // is bored separately — a bay cutter that stops in the journal leaves a disk in the crank.
    cylZ(76, 0, prev, a - 1.2);
    prev = b + 1.2;
  }
  cylZ(76, 0, prev, 204);
  // Intermediate shaft through the sump wall. r 14 sits inside the Ø32 web bores, so the saddles are not opened.
  cylZ(14, INT_SHAFT_Y, -130, 186);
  // Timing gears: crank tip 38.6, intermediate tip 49.6. Start at z 187 so the pulley web (face z 186) stays.
  cylZ(48, 0, 186, 240);
  cylZ(64, INT_SHAFT_Y, 186, 284);
  // Oil-pump body, 3 mm off the casting. Stops at the z -118 web face so the saddle bore stays.
  // Floor stays above the sump skin so the oil-line fittings still find the outside wall.
  cuts.push(boxMM([-40, -132, -178], [60, -58, -130]));
  if (s > 0) {
    // Pickup stays in the sump, inboard of the cyl-3 spigot (x < 70). Same bend as oilPump().
    const path: [number, number, number][] = [[32, -86, -147], [46, -98, -147], [48, -112, -155], [24, -118, -148]];
    for (let i = 0; i + 1 < path.length; i++) cuts.push(cylBetween(path[i], path[i + 1], 11, 12));
  }
  // Cylinder register: skirt OD 51.5, bore 54 leaves 2.5 mm. Deck face outside r 54 stays as the seat.
  for (const zc of bankZ(s)) {
    const inner = 56, outer = DECK_X + 0.4, depth = outer - inner;
    cuts.push(yToX(cyl(54, depth, 36)).translate(s * (inner + depth / 2), 0, zc));
  }
  // Fan-collar tab relief (solid chain-well strips; the shoulder loft is ducked in the section).
  cuts.push(yToZ(cyl(22, 36, 20)).translate(s * 39, 84.2, 200));
  // Distributor bore on the left. Opens the chain-well solids the shaft passes through.
  // The cast boss is a lathe, so this cutter does not touch it. Keep in step with DIST in aux.ts.
  if (s < 0) {
    const o = [-36.2, 26.5, 216], aim = [-150, 168, 150];
    const d = [aim[0] - o[0], aim[1] - o[1], aim[2] - o[2]];
    const L = Math.hypot(d[0], d[1], d[2]);
    const u = d.map((v) => v / L);
    const at = (t: number): [number, number, number] => [o[0] + u[0] * t, o[1] + u[1] * t, o[2] + u[2] * t];
    cuts.push(cylBetween(at(-6), at(96), 14.6, 24));
  }
  const nutPockets: [number, number][] = s < 0 ? [[-10, -116], [30, -116]] : [[30, -116], [38, -56]];
  for (const [x, y] of nutPockets) cuts.push(yToZ(cyl(14, 36, 16)).translate(x, y, -166));
  // Every pocket in one pass. A second pass sees BufferGeometry and skips the flange,
  // which left the gears, the pump and the nut spot-faces buried in the split face.
  cutSolids(p.g, cuts);
  // Crank bore through the split flange only. r 42 clears the seal journal (r 30) and the
  // main (r 30); it stops at z -165, inside the flange mouth, so the end disk is not a wall.
  // The saddle webs are not tagged and keep their press-fit bores.
  // Bores in the split flange only (saddle webs keep the press-fit holes from the extrusion).
  // Crank r 42 clears the seal and main journals. Intermediate r 62 clears the 60 T tip (r 54.5).
  const flangeBores = [
    yToZ(cyl(42, 250, 28)).translate(0, 0, -85),
    yToZ(cyl(62, 120, 28)).translate(0, INT_SHAFT_Y, 230),
  ];
  p.g.updateMatrixWorld(true);
  p.g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.userData.flange) return;
    let g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    for (const cutter of flangeBores) g = csgSub(g, cutter);
    mesh.geometry = g;
    mesh.position.set(0, 0, 0); mesh.rotation.set(0, 0, 0); mesh.scale.set(1, 1, 1); mesh.updateMatrix();
  });
  // Gear and pump pockets clip the bottom perimeter-lug seats. Put those bosses back
  // so the nuts still land on a machined face. The z 190 stud is the lowered gear clearance.
  for (const z of CASE_LUG.bottom) {
    const y = caseLugY(z, false);
    p.add(yToX(cyl(CASE_LUG.r, CASE_LUG.x, 16)), CASE_CAST, [s * CASE_LUG.x / 2, y, z]);
    p.add(yToX(cyl(CASE_LUG.r - 0.8, 1.2, 14)), 'machinedAlu', [s * (CASE_LUG.x - 0.6), y, z]);
  }
  if (s > 0) {
    // Oil-cooler deck pad. Face is exactly x = 103 (normal +X), centre near (103, 8, −180),
    // in the pocket between cyl 3 and the ring gear. Keep studs and ports in step with
    // OIL_COOLER in aux.ts. Nothing of this pad crosses x = 103. Root stays outside the
    // crank cheek (r ~70) so the pad is not hollowed with the bay.
    const face = 103, xRoot = 74;
    const y0 = -72, y1 = 88, z0 = -210, z1 = -150;
    const zMid = (z0 + z1) / 2, yMid = (y0 + y1) / 2;
    const ports = [[20, -191, 0], [20, -169, 0], [-30, -180, 1]] as const;
    // Same [y, z] as OIL_COOLER.studs. Each is a cast boss with a 12 mm M8 tap
    // (modelled Ø8 so the Ø7.7 stud sits in the hole, embed 12, tip at the bore bottom).
    const studs = [[72, -198], [72, -162], [-56, -198], [-56, -162]] as const;
    const sh = roundRect(z1 - z0, y1 - y0, 8, -zMid, yMid);
    for (const [y, z, big] of ports) sh.holes.push(circlePath(big ? 11 : 10, -z, y) as THREE.Path);
    const cheekMesh = extrude(sh, face - xRoot, 0, 8);
    cheekMesh.rotateY(Math.PI / 2);
    cheekMesh.translate(xRoot, 0, 0);
    let cheek: THREE.BufferGeometry = cheekMesh;
    const capSh = roundRect(z1 - z0, y1 - y0, 8, -zMid, yMid);
    for (const [y, z, big] of ports) capSh.holes.push(circlePath(big ? 11 : 10, -z, y) as THREE.Path);
    const skinMesh = extrude(capSh, 1.2, 0, 8);
    skinMesh.rotateY(Math.PI / 2);
    skinMesh.translate(face - 1.2, 0, 0);
    let skin: THREE.BufferGeometry = skinMesh;
    const tap = (y: number, z: number) => {
      const g = cyl(4, 12.5, 20);
      g.rotateZ(Math.PI / 2);
      // +Y rotates to −X. Mouth opens past the face (x 104); bottom at x 91.5,
      // just inboard of the stud tip (x 91) so the reach probe still finds the bore.
      g.translate(face - 5.25, y, z);
      return g;
    };
    const taps = studs.map(([y, z]) => tap(y, z));
    cheek = csgSub(cheek, ...taps);
    skin = csgSub(skin, ...taps);
    p.add(cheek, CASE_CAST);
    p.add(skin, 'machinedAlu');
    for (const [y, z] of studs) {
      const boss = cyl(8, 12, 20);
      boss.rotateZ(Math.PI / 2);
      // Under the machined skin (skin starts at x 101.8), inside the pad.
      boss.translate(face - 7.6, y, z);
      p.add(csgSub(boss, tap(y, z)), CASE_CAST);
    }
  }
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
    let journal = yToZ(lathe([
      [rMain - 5, -mainW / 2], [rMain - 1.5, -mainW / 2 + 2.4], [rMain, -mainW / 2 + 4],
      [rMain, mainW / 2 - 4], [rMain - 1.5, mainW / 2 - 2.4], [rMain - 5, mainW / 2],
    ], 48)).translate(0, 0, z);
    // Crown oil hole. A disc buried 0.2 mm under the skin is hidden by the polished
    // face, so the journal is cut open and the dark floor sits on that surface.
    // Web faces are at ±3 mm; the 1 mm test moves them to ±2 mm. A round Ø5.6 reaches
    // ±2.8 mm, so the mouth is Ø3.8 and stays inside those faces. The saddle bore
    // (r 32.8) is still well outside the crown.
    const holeR = 1.9;
    const random = Math.random;
    Math.random = mulberry32(0xC0A11);
    try {
      const cutter = yToX(cyl(holeR, 8, 16)).translate(rMain + 1, 0, z);
      journal = csgSub(journal, cutter);
    } finally { Math.random = random; }
    p.add(journal, 'polishedSteel');
    // Floor of the recess, outer face on the journal surface (rMain).
    p.add(yToX(cyl(holeR - 0.2, 3, 12)), 'bore', [rMain - 1.5, 0, z]);
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
    [R, top - 1],
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
  // Crown height-field, dome plus squish, with an eyebrow under each valve.
  // The ring-belt lathe stops at the outer wall so this surface is the crown.
  const dome = paramSurface((u, v) => {
    const a = u * Math.PI * 2, r = v * R;
    const y = r * Math.cos(a), z = r * Math.sin(a);
    return [crownSurfaceX(y, z) ?? top - 1, y, z];
  }, 168, 52, true);
  p.add(dome, 'machinedAlu');
  // underside
  // Same stations as crownUndersideX: top−7.7 at the centre, top−8.7 at r = R−6.
  p.add(yToX(lathe([[0.1, top - 7.7], [R - 6, top - 8.7], [R - 5, -44]], 48)), 'castAlu');
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
  // Mahle 503 WR 27 barrel: bore Ø95 and spigot OD Ø103 (rb and rb+4). The catalog
  // flange is Ø113; this seating face is Ø112. The register below the face is the 14 mm pilot.
  // Catalog Länge 120 / Höhe 85.5 is overall length versus installed height; the barrel keeps the
  // layout's 98 mm deck-to-head so the head stays seated. Over a full crank turn the rod beam and
  // big end stay inside r ≈ 21 at this mouth and 20 mm off the spigot corner, so the skirt stays
  // round. Stock 911 cylinders are not notched for the rod.
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
  // Fin-root tube between the plates. A solid plug here fills the bore and swallows the valve heads.
  const finSpan = H - 7 - CYL_FIN.x0 + 1;
  const finMid = (CYL_FIN.x0 + H - 7) / 2;
  p.add(yToX(lathe([
    [51.2, -finSpan / 2], [52.4, -finSpan / 2], [52.4, finSpan / 2], [51.2, finSpan / 2], [51.2, -finSpan / 2],
  ], 48)), 'finBlack', [finMid, 0, 0]);
  // base gasket (#5)
  p.add(yToX(lathe([[rb + 4, -0.3], [55.5, -0.3], [55.5, 0], [rb + 4, 0]], 48)), 'gasket');
  // Head-stud bores. The studs (r 4.6) stand on the Ø114 circle and pass the barrel with clearance.
  // Fin plates already have r 6.5 holes; this opens the flange and any fin root they still clip.
  const studR = CYL_FIN.studR;
  for (const a of [45, 135, 225, 315]) {
    const yy = studR * Math.sin(a * DEG), zz = studR * Math.cos(a * DEG);
    cutGroup(p.g, yToX(cyl(6.0, H + 20, 16)).translate(H / 2 - 2, yy, zz));
  }
  return p.g;
}

// ---------------------------------------------------------------- cylinder head (103-00), local: combustion face at x=0, outer +X
/**
 * Single-cylinder head: finned body (fins stacked along the cylinder axis, like the barrel), a machined spigot that
 * drops into the barrel, a hemispherical chamber, intake port up / exhaust port down with 2-stud flanges, an M14
 * plug bore from the chamber up to the cam-housing face, and that face with the two valve-spring wells and four studs.
 */
export const HEAD_W = HEAD_OUT_X - CYL_TOP_X; // 61
/** Cut faces from the plug bore must point into the hole, not back into the casting. */
function flipPlugCutNormals(root: THREE.Object3D, tip: THREE.Vector3, dir: THREE.Vector3, seatT: number, minorR: number) {
  const v = new THREE.Vector3(), n = new THREE.Vector3(), radial = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry.attributes.normal) return;
    const P = mesh.geometry.attributes.position, N = mesh.geometry.attributes.normal;
    const nm = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    const inv = nm.clone().invert();
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(mesh.matrixWorld).sub(tip);
      const t = v.dot(dir);
      radial.copy(v).addScaledVector(dir, -t);
      const r = radial.length();
      n.fromBufferAttribute(N, i).transformDirection(mesh.matrixWorld);
      const nAxial = n.dot(dir);
      const nRad = r > 1e-6 ? n.dot(radial) / r : 0;
      // The boolean can leave the seat a few tenths proud of seatT. Flip that band
      // too: an inward normal there erodes into the washer, just outside the 0.3 mm seat window.
      const spot = t > seatT - 0.15 && t < seatT + 1.4 && r > minorR - 0.3 && r < 12.2 && nAxial < -0.15;
      const bore = t > -1 && t < seatT + 0.5 && Math.abs(r - minorR) < 0.45 && nRad > 0.15;
      if (!spot && !bore) continue;
      n.negate().applyMatrix3(inv);
      N.setXYZ(i, n.x, n.y, n.z);
    }
  });
}
export function cylinderHead() {
  const p = new Part();
  const W = HEAD_W;
  // Spigot into the barrel. The chamber bowl is cut from the core (headReliefCutters), not a shallow solid dome.
  // Closed annular wall. An open profile revolves into a surface with two boundary rings.
  p.add(yToX(lathe([
    [40, 0], [49.5, 0], [50.2, 1], [50.2, 5], [53, 6],
    [52.4, 6], [49.6, 5], [49.6, 1.2], [48.9, 0.55], [40, 0.55], [40, 0],
  ], 48)), 'machinedAlu');
  // core casting + barrel-nut bosses on the four head studs (nut seat at x = HEAD_HW.barrel.x)
  p.add(boxMM([5, -50, -42], [W - 16, 52, 42]), 'castAlu');
  const r45b = HEAD_HW.barrel.r * Math.SQRT1_2;
  for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) p.add(yToX(cyl(11.5, 10, 20)), 'castAlu', [HEAD_HW.barrel.x - 5, a * r45b, b * r45b]);
  // fins normal to the cylinder axis, rounded-square like the barrel, slightly larger
  const s45 = CYL_FIN.studR * Math.SQRT1_2;
  for (let x = 7, i = 0; x < 44; x += 4.6, i++) {
    const g = plate(114, 126 - i * 1.5, 16, 2, [[s45, s45, 6], [-s45, s45, 6], [s45, -s45, 6], [-s45, -s45, 6]], 0);
    g.rotateY(Math.PI / 2);
    p.add(g, 'castAlu', [x, 0, 0]);
  }
  // cam-side "rocker box" face with two spring wells
  // face block with counterbores over the barrel nuts (socket access from the cam-housing side)
  // Holes in this outline triangulate into a non-manifold plate. Cut them after the extrude.
  const fg = extrudeC(roundRect(108, 124, 10), 14, 0, 16);
  fg.rotateY(Math.PI / 2);
  fg.translate(W - 8, 0, 0);
  const faceCuts: THREE.BufferGeometry[] = [];
  for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    faceCuts.push(cylBetween([W - 22, b * r45b, -a * r45b], [W + 4, b * r45b, -a * r45b], 11.5, 20));
  }
  // Spring-well mouths on the valve axes. Shape x was −local z before the plate was turned onto +X.
  for (const side of [1, -1] as const) {
    const facePt = stemPointLocal(side, 0);
    const dir = stemDirLocal(side);
    const t = (W - 8 - facePt.x) / dir.x;
    const y = facePt.y + t * dir.y;
    const z = facePt.z + t * dir.z;
    faceCuts.push(cylBetween([W - 22, y, z], [W + 4, y, z], side > 0 ? 15.2 : 14.4, 24));
  }
  p.add(manifoldSub(fg, ...faceCuts), 'castAlu');
  // intake port (top) with flange & 2 studs
  const ip = roundRect(46, 76, 12);
  ip.holes.push(circlePath(17.5) as THREE.Path);
  const ipg = extrudeC(ip, 10); ipg.rotateX(Math.PI / 2);
  p.add(ipg, 'castAlu', [26, 60, 0]);
  p.add(cylBetween([26, 44, 0], [26, 56, 0], 22, 24), 'castAlu');
  p.add(yToZ(cyl(17.4, 1, 32)).rotateX(Math.PI / 2), 'bore', [26, 63, 0]);
  // Exhaust port (bottom): full flange plate and studs. The bore stays r 15.5, studs at z = ±30.
  const ep = roundRect(44, 78, 8); ep.holes.push(circlePath(15.5) as THREE.Path);
  const epg = extrudeC(ep, 11.5); epg.rotateX(Math.PI / 2);
  p.add(epg, 'castAlu', [34, -57.75, 0]); // flange face y -63.5
  p.add(cylBetween([34, -44, 0], [34, -54, 0], 20, 24), 'castAlu');
  p.add(yToZ(cyl(15.4, 1, 32)).rotateX(Math.PI / 2), 'bore', [34, -62.6, 0]);
  // M14 bore on the intake side, coaxial with the upper-cover hole. The exhaust
  // flange below is only the port plate: nothing is bored through it.
  const [pdx, pdy, pdz] = sparkDirHead();
  const plugDir = new THREE.Vector3(pdx, pdy, pdz);
  const plugTip = new THREE.Vector3(SPARK_TIP.x, SPARK_TIP.y, SPARK_Z);
  const along = (t: number): V3 => [plugTip.x + plugDir.x * t, plugTip.y + plugDir.y * t, plugTip.z + plugDir.z * t];
  // Washer spot-face at the end of the 19 mm reach. The minor bore runs from the
  // chamber through that face. The wrench well continues out of the casting so
  // the hex and the ceramic are not buried in the head wall.
  const seatT = -SPARK_SEAT_Y;
  const minorR = SPARK_MINOR_D / 2;
  // cam-housing studs (103-00 #7) are added with the hardware (fasteners.ts, HEAD_HW.camStud)
  // Separate passes. One boolean that includes the chamber sphere leaves the guide solid,
  // and a pocket that ends on the guide bore leaves a coplanar cap in the stem.
  cutClosed(p.g, headChamberCutter());
  cutClosed(p.g, ...headValvePockets());
  cutClosed(p.g, ...headValveBores());
  // One pass: minor bore, washer spot-face, then the wrench well out through the casting.
  // The well overlaps the spot-face so the hex is not left in a skin between the two cuts.
  cutClosed(
    p.g,
    cylBetween(along(-4), along(seatT), minorR, 24),
    // Start the spot-face before the seat so the bore corner is not left as a lip under the washer.
    cylBetween(along(seatT - 0.6), along(seatT + 2.6), 12, 20),
    // Past the cup neck (t ≈ 82). Ending the well at SPARK_WELL_T left a lip on the casting.
    cylBetween(along(seatT + 0.8), along(SPARK_WELL_T + 10), 16, 20),
  );
  // Case head studs (r 4.6 on the Ø114 circle) pass through with clearance. The barrel-nut face stays.
  const studR = HEAD_HW.barrel.r;
  for (const a of [45, 135, 225, 315]) {
    const yy = studR * Math.sin(a * DEG), zz = studR * Math.cos(a * DEG);
    cutClosed(p.g, cylBetween([-2, yy, zz], [HEAD_W + 2, yy, zz], 6.0, 16));
  }
  // Later booleans rebuild the mesh. The plug cut keeps the cutter's normals,
  // which point into the metal, and erosion then walks the spot-face into the washer.
  flipPlugCutNormals(p.g, plugTip, plugDir, seatT, minorR);
  return p.g;
}

// ---------------------------------------------------------------- camshaft housing (103-05 #13), engine coords
// The housing, camshaft and rocker meshes live in valvetrain.ts. These stations stay here because the
// valve covers, chain housings and the keyed cam-nose hardware are built from them.
export const CH_Z0 = -168, CH_Z1 = CASE_Z.pulley;
/** Lower-cover ear offset (cover-local x). The upper lid uses `UPPER_STUD_X`. */
export const VC_EDGE = 31;
/**
 * Upper-lid stud axis, cover-local |x|. Outboard of the sealing flange so the
 * gasket ring stays on the land and each ear carries its own washer.
 * On the right bank +x is the head edge; on the left bank +x is the cam edge.
 */
export const UPPER_STUD_X = 56;
/** Flat top of the three raised lugs on the lower cover (special nuts). Same plane as the hex-nut faces. */
export const VC_LUG_Z = 7;
export interface CoverStud { x: number; y: number }
/**
 * Cover studs, cover-local. Stations sit in the gaps between rocker shafts.
 * Upper: 3 per edge (6 per cover, 12 per engine). The upper gasket is drawn with those 6 holes.
 * Lower: 6 on the head edge and 5 on the cam edge (11 per cover, 22 per engine).
 * The banks are staggered, so each side has its own list.
 */
export function vcStuds(upper: boolean, s: 1 | -1): CoverStud[] {
  if (upper) {
    // Kat 502 p.66 ill. 103-05 #17: six ears, three along each long edge, none
    // opposite its neighbour. The head edge carries the ear nearest the plug
    // scallop; the cam edge carries the ear at the far rounded end. The drawing
    // pitch is snapped into the gaps between the intake shafts on this housing.
    const head = s > 0 ? [150, 40, -85] : [-125, 15, 120];
    const cam = s > 0 ? [90, -25, -158] : [-95, 45, 155];
    const headX = s > 0 ? UPPER_STUD_X : -UPPER_STUD_X;
    return [
      ...head.map((y) => ({ x: headX, y })),
      ...cam.map((y) => ({ x: -headX, y })),
    ];
  }
  // Keep each station far enough from the exhaust shaft that the cover pocket still
  // clears the shaft screw, and the tower does not meet the housing.
  const head = s > 0 ? [-165, -145, -55, -30, 52, 90] : [-125, -100, -15, 10, 115, 165];
  const cam = s > 0 ? [-170, -60, 56, 98, 170] : [-132, -8, 105, 148, 170];
  return [...head.map((y) => ({ x: -VC_EDGE, y })), ...cam.map((y) => ({ x: VC_EDGE, y }))];
}
/** Three raised lugs on the lower cover, on the cam edge between the hex studs. */
export function vcLugs(s: 1 | -1): CoverStud[] {
  const ys = s > 0 ? [-148, -38, 76] : [-108, 14, 128];
  return ys.map((y) => ({ x: VC_EDGE, y }));
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
 * Upper lid 901 105 115 03, cover-local. A closed cast shell: 4 mm walls, an 8 mm
 * flange 5 mm thick, and a crowned roof. The sealing face stays at z = 0.
 * The lip (inner + wall + flange = 48) covers the cam-housing rails (about
 * local x +34.5 and −33) and the head-side stem bridges (about +45).
 * The pan (inner half-width 36) still clears the intake rockers (|x| about 21).
 */
const UPPER_CAST = {
  wall: 4,
  flangeW: 8,
  flangeT: 5,
  innerX: 36,
  // The connector elbow clears the crown by about 3 mm (it rides near local z 25).
  // A taller arch erodes up into that tube.
  shoulder: 21,
  crown: 1.2,
  ceil: 19,
};
/** Outer height of the crowned roof at cover-local x. Peak is shoulder + crown. */
export function upperCrownZ(x: number) {
  const outerX = UPPER_CAST.innerX + UPPER_CAST.wall;
  const rise = UPPER_CAST.crown;
  const R = (outerX * outerX) / (2 * rise) + rise / 2;
  const peak = UPPER_CAST.shoulder + rise;
  const dx = Math.min(Math.abs(x), outerX - 0.4);
  return peak - R + Math.sqrt(R * R - dx * dx);
}
function castUpperShell(studHoles: THREE.BufferGeometry[], notch: THREE.BufferGeometry) {
  const len = CH_Z1 - CH_Z0 - 8;
  const halfL = len / 2;
  const C = UPPER_CAST;
  const outerX = C.innerX + C.wall;
  const lipX = outerX + C.flangeW;
  const innerY = halfL - C.flangeW - C.wall;
  const outerY = innerY + C.wall;
  // Rounded ends, the long pan on 103-05 #17, not a square-cut box.
  const endR = 28;
  const flange = extrude(roundRect(lipX * 2, halfL * 2, endR), C.flangeT, 0, 12);
  const walls = extrude(roundRect(outerX * 2, outerY * 2, 18), C.shoulder - C.flangeT + 1.2, 0, 10);
  walls.translate(0, 0, C.flangeT - 0.6);
  const rise = C.crown;
  const R = (outerX * outerX) / (2 * rise) + rise / 2;
  const peak = C.shoulder + rise;
  const cap = new THREE.CylinderGeometry(R, R, outerY * 2 + 8, 48);
  cap.translate(0, 0, peak - R);
  const keep = extrude(roundRect(outerX * 2 + 0.6, outerY * 2 + 0.6, 8), rise + 2.2, 0, 10);
  keep.translate(0, 0, C.shoulder - 0.5);
  const dome = manifoldIntersect(cap, keep);
  // The pulley end (+y) stays solid back to the sprocket notch. The seal crosses
  // that bulkhead, so the pan does not need a sheet laid across the opening.
  const cavY1 = innerY - 22;
  const cavity = extrude(roundRect(C.innerX * 2, innerY + cavY1, 6, 0, (cavY1 - innerY) / 2), C.ceil + 2, 0, 8);
  cavity.translate(0, 0, -2);
  const shell = manifoldAdd(flange, walls, dome);
  return manifoldSub(shell, cavity, notch, ...studHoles);
}
/**
 * Upper / lower valve cover (103-05 positions 17 and 19), engine coords. Kat 502 draws the upper lid
 * (901 105 115 03) with two round plug holes one cylinder pitch apart and a half-round opening at one
 * end, each on a collar, and the lower lid (930 105 116) as a ribbed pan with no holes. The holes are
 * cut in pocketValveCover, coaxial with the plug bore. The lower lid has diagonal ribs and three raised lugs.
 */
/** Valve-cover cavity: half-width at the seat (w0 + 8 bevel = 26) and how much the v5 hollow pan top rose (z 13.5 -> 22). */
export const VC_CAV = { w0: 18 }, VC_RAISE = 8.5;
/**
 * Extra cover length at the flywheel end. Both banks are 0: the cover matches the cam-housing seat rails
 * (`CH_Z0`..`CH_Z1`), the same length and Z position as the right cover.
 */
export const VC_EXT = (_s: 1 | -1) => 0;
export function valveCover(s: 1 | -1, upper: boolean) {
  const loc = new Part();
  const len = CH_Z1 - CH_Z0 - 8, w = 58;
  const ext = VC_EXT(s), cy = -ext / 2;
  // M8 cover studs (r 3.84) are part of the cam-housing asset. The hole is 6.4
  // so the shank clears the lip by more than 2 mm; the washer still has a face.
  const studs = vcStuds(upper, s);
  const studHoles = studs.map((st) => yToZ(cyl(6.4, 28, 16)).translate(st.x, st.y, -2));
  // Sprocket-end notch (pulley / chain end, local +y). On the upper lid it stops
  // under the crown so the top skin stays closed.
  const notch = boxMM([-15, len / 2 - 16 + cy, -1], [15, len / 2 + 4 + cy, upper ? 12 : 16]);
  if (upper) {
    loc.add(castUpperShell(studHoles, notch), 'castAlu');
  } else {
    // Lower lid: bevelled pan on a thin seat flange. Same shell as before.
    const endR = 7;
    const cavity = new THREE.ExtrudeGeometry(roundRect(VC_CAV.w0 * 2, len - 30 + ext, 1), { depth: 29, bevelEnabled: true, bevelThickness: 10, bevelSize: 8, bevelSegments: 1, curveSegments: 6 });
    cavity.translate(0, cy, -20);
    const below = boxMM([-w, -len, -40], [w, len, 0.01]);
    const lip = extrude(roundRect(w, len + ext, endR), 1.15, 0.25, 6).translate(0, cy, 0);
    const step = extrude(roundRect(w - 7, len - 6 + ext, Math.max(5, endR - 4)), 2.15, 0.4, 6).translate(0, cy, 1.15);
    loc.add(manifoldSub(lip, cavity, notch, ...studHoles), 'castAlu');
    loc.add(manifoldSub(step, cavity, notch, ...studHoles), 'castAlu');
    const pan = new THREE.ExtrudeGeometry(roundRect(w - 17, len - 22 + ext, 6), { depth: 12, bevelEnabled: true, bevelThickness: 10, bevelSize: 8, bevelSegments: 1, curveSegments: 6 });
    loc.add(manifoldSub(pan.translate(0, cy, 0), cavity, below, notch), 'castAlu');
  }
  // Stud towers blended into the pan wall. The nut face stays a flat disc at z = 7.
  // The cavity runs through the ear centres. Keep the nut face (z = 7, out to r 8.8)
  // so an M8 washer probe at r 6.8 still lands on the disc.
  const faceKeeps: THREE.BufferGeometry[] = [];
  for (const st of studs) faceKeeps.push(yToZ(cyl(9.2, 1.8, 24)).translate(st.x, st.y, 6.7));
  const earCut = manifoldSub(
    new THREE.ExtrudeGeometry(roundRect(31, len - 30 + ext, 1), { depth: 29, bevelEnabled: true, bevelThickness: 10, bevelSize: 8, bevelSegments: 1, curveSegments: 6 }).translate(0, cy, -20),
    ...faceKeeps,
  );
  // Closed tower. The stud bore is the later cut, so the profile runs to the axis.
  // Upper ears are wide enough that the seal jog around the stud lands on the boss.
  const earBoss = yToZ(lathe(upper
    ? [[12.4, 0], [11.2, 1.6], [10.0, 3.4], [8.8, 5.4], [8.8, 7], [0.4, 7], [12.4, 0]]
    : [[16.4, 0], [14.8, 1.4], [12.4, 3.0], [10.2, 4.8], [8.8, 6.3], [8.8, 7], [0.4, 7], [16.4, 0]],
  24));
  studs.forEach((st, i) => {
    const studHole = studHoles[i];
    loc.add(manifoldSub(earBoss.clone().translate(st.x, st.y, 0), earCut, studHole), 'castAlu');
    const sign = st.x > 0 ? 1 : -1;
    const wall = st.x - sign * 17;
    const root = st.x - sign * 4.5;
    const gussetPts: [number, number][] = sign > 0
      ? [[wall, st.y - 13], [root, st.y - 8], [root, st.y + 8], [wall, st.y + 13]]
      : [[root, st.y - 8], [wall, st.y - 13], [wall, st.y + 13], [root, st.y + 8]];
    loc.add(manifoldSub(extrude(polyShape(gussetPts), 5.8, 0.45, 2), earCut, studHole), 'castAlu');
  });
  if (upper) {
    // Two longitudinal ribs on the crown, outboard of the plug collars and the
    // connector elbow (that tube reaches about |x| 23).
    for (const rx of [-32, 32]) {
      const z0 = upperCrownZ(rx);
      loc.add(boxMM([rx - 1.7, -152, z0 - 0.25], [rx + 1.7, 142, z0 + 1.4]), 'castAlu');
    }
    // Raised cast PORSCHE lettering on the flat top, in the gap between plug holes.
    // Right holes sit near local Y −60 and +58; left holes sit near +16 and −102.
    // reads correctly from each bank's own side (letter-up toward +Y, advance toward the viewer's right)
    const letterY = s > 0 ? -4 : -44;
    const letterX = s > 0 ? 12 : 22;
    // Sit the letters on the crown, proud of the skin by about a millimetre.
    raisedText(loc, 'PORSCHE', letterX, letterY, 1.65, upperCrownZ(letterX) - 0.35, 1.3, 1.5, s, -s);
  } else {
    // Lower lid: diagonal ribs across the pan, and three wedge lugs for the special nuts.
    for (const k of [-2, -1, 0, 1, 2]) {
      const g = boxMM([-22, -1.4, 21.5], [22, 1.4, 24.0]);
      g.rotateZ(0.72 * s);
      g.translate(0, k * 58, 0);
      loc.add(g, 'castAlu');
    }
    for (const lug of vcLugs(s)) {
      const out = lug.x > 0 ? 1 : -1;
      const wedge = extrude(polyShape([
        [lug.x - out * 5, lug.y - 12],
        [lug.x - out * 5, lug.y + 12],
        [lug.x + out * 16, lug.y],
      ]), VC_LUG_Z, 0.2, 1);
      loc.add(wedge, 'castAlu');
      loc.add(yToZ(cyl(8.4, 1.4, 20)).translate(lug.x, lug.y, VC_LUG_Z - 0.7), 'castAlu');
    }
  }
  loc.g.applyMatrix4(coverMatrix(s, upper));
  const out = new Part(); out.addObj(loc.g); return out.g;
}

/** Valve-cover frame: local x = along the slope, local y = engine Z, local z = outward normal (seat flange at z 0). */
export function coverMatrix(s: 1 | -1, upper: boolean) {
  // Seat shifted +17 mm outboard in x. The head casting stays short; the cover,
  // gasket and studs move so the real-length valves land under the pan.
  const a0 = new THREE.Vector3((HEAD_OUT_X + 13 + 17) * s, upper ? 74 : -74, 0);
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
 * Cam nose stack (103-10/-15), measured along engine Z from the chain plane z = CHAIN_Z[s].
 * Inboard of the flange, Kat 502 p.70 / p.74 #29–#36:
 * gasket #29 | round seal #30 | cam-flange cover #31 (z cover0..cover1, see camNoseStack) |
 * thrust washer #34 (2.5 mm) | alignment shim #35 (0.6 mm) | sprocket flange #36 on Woodruff key #37 |
 * sprocket #38 hub, dowelled by pin #39 | spring washer #40 + nut #41.
 * The flange is shifted 0.6 mm outboard of the old -16..-6 station so the shim occupies the gap
 * that used to sit between flange and sprocket. The sprocket hub still starts at chain −5.4.
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
  r: 11, key: { D: 9.6, h: 4.8, b: 4, proud: 1.8, dz: -10.0 }, flange: [-15.4, -5.4] as [number, number], flangeR: 24,
  shim: 0.6, thrust: 2.5, hubFace: 10, end: 23,
  // rad 24 is the pin circle (flange rim). It clears the hub (r ≤ 19.5) and the M22 nut (vertex r ≈ 18.5).
  pin: { r: 3, rad: 24, a: 0.3 + Math.PI / 6, len: 14, proud: 2 },
};
/**
 * Cam-flange cover 930 105 196 00 (103-10/15 #31) and its seat.
 * O-ring 999 701 468 40 is 67.5 × 75.4 × 4. Three M6 screws on a 44.8 mm radius,
 * mirrored about the crank so every lug stays outboard of the chain-case back wall (x·s = 254)
 * and under the y = 40 pulley pad.
 * `hub` is the centre thickness under the thrust washer. With the left chain at z 235 that
 * puts the gasket on the housing end face (z 212) without moving the thrust shoulder.
 * The grooved body is `land` + `grooveW` + `land` (2.2 mm either side of the groove).
 * The raised rim stands proud of that body. Screw seats are inboard of the rim face so the
 * M6 heads stay under the duplex chain. Lugs are notches in the rim, inside its outer edge.
 * The rim stays outboard of the chain-case back wall (x·s = 254).
 */
export const CAM_COVER = {
  t: 10, hub: 4.1, gasketT: 0.4, land: 2.2,
  boreR: 18,
  // 999 701 468 40 is 67.5 × 75.4 × 4. The groove root is the ring ID, the body is the ring OD.
  bodyR: 37.7, grooveRoot: 33.75, grooveW: 4,
  // Heads are Ø12.4. 44.8 puts the head outside the 37.7 seal and inside the chain-box wall.
  boltR: 44.8, rimR: 47.2, rimInner: 37.7, notchHalf: 0.22, notchFloor: 46.4,
  pocketR: 25.5, seatFaceR: 47.2,
};
/** Axial depth of the grooved body: inboard land, groove, outboard land. */
export const CAM_COVER_BODY = CAM_COVER.land * 2 + CAM_COVER.grooveW;
/**
 * Three screw stations, the same on both banks. 930 105 196 00 is one part number.
 * The pulley pad and the chain-box back plate are cut back so the round cover fits.
 */
export function camCoverAngles(_s: 1 | -1): number[] {
  return [0, 120, 240];
}
/** Outboard face the cover screws sit on. Kept under the duplex chain, just inboard of the thrust washer. */
export function camCoverSeatZ(s: 1 | -1) {
  return camNoseStack(s).thrust0 - 0.8;
}
/** World station of one cover screw. `a` is the world angle from the cam axis (0 = +X). */
export function camCoverBolt(s: 1 | -1, deg: number) {
  const a = deg * DEG;
  const dx = Math.cos(a) * s, dy = Math.sin(a);
  return { x: CAM_X * s + CAM_COVER.boltR * dx, y: CAM_COVER.boltR * dy, a: Math.atan2(dy, dx) };
}
/**
 * Absolute Z of the cam-nose stack on one bank.
 * The thrust washer stays on the flange stack, so the camshaft shoulder does not move.
 * The cover's centre pocket floors on that washer; the deep body and raised rim hang inboard of it.
 * On the left bank the gasket then starts at z 212, the housing end face.
 */
export function camNoseStack(s: 1 | -1) {
  const zc = CHAIN_Z[s], N = CAM_NOSE;
  const flange0 = zc + N.flange[0], flange1 = zc + N.flange[1];
  const shim0 = flange0 - N.shim;
  const thrust0 = shim0 - N.thrust;
  const cover0 = thrust0 - CAM_COVER.hub, cover1 = cover0 + CAM_COVER.t, gasket0 = cover0 - CAM_COVER.gasketT;
  return { zc, flange0, flange1, shim0, thrust0, cover0, cover1, gasket0 };
}
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
export const CAM_END_X = 254; // inboard edge of the cam-housing end face that sits inside the box
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
const pinCache = new Map<number, { n: number; len: number; pins: THREE.Vector3[] }>();
/**
 * Chain pin centres. On each sprocket the rollers sit one tooth apart (chord = pitch),
 * and the whole set is slid along the wrap so every straight run splits into equal
 * chords within 0.2 mm of the pitch. Even count so inner and outer plates alternate.
 */
export function chainPins(s: 1 | -1) {
  const hit = pinCache.get(s);
  if (hit) return hit;
  const { arcs } = chainPath(s);
  const teethOf = (r: number) => {
    let teeth = CAM_T, bd = Math.abs(r - CAM_SPROCKET_R);
    for (const [rr, tt] of [[INT_SPROCKET_R, INT_T], [IDLER_SPROCKET_R, IDLER_T]] as [number, number][]) {
      const d = Math.abs(r - rr);
      if (d < bd) { bd = d; teeth = tt; }
    }
    return teeth;
  };
  // How far an end roller may pass the geometric tangent (mm of arc) while it is still seated.
  const HANG = 2.4;
  const spec = arcs.map((A) => {
    const step = (Math.PI * 2) / teethOf(A.circ.r);
    const sweep = A.a1 - A.a0;
    const dir = Math.sign(sweep) || 1;
    const span = Math.abs(sweep);
    const nInt = Math.max(1, Math.round(span / step));
    const slack = span - nInt * step;
    const hang = HANG / A.circ.r;
    return { A, step, dir, nInt, slack, lo: -hang, hi: slack + hang };
  });
  const block = (i: number, inset: number) => {
    const { A, step, dir, nInt } = spec[i];
    const a0 = A.a0 + dir * inset;
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= nInt; k++) {
      const a = a0 + dir * step * k;
      pts.push(new THREE.Vector3(A.circ.c.x + A.circ.r * Math.cos(a), A.circ.c.y + A.circ.r * Math.sin(a), 0));
    }
    return pts;
  };
  const worstOf = (insets: number[]) => {
    const arcPts = insets.map((inset, i) => block(i, inset));
    let worst = 0, n = 0;
    for (let i = 0; i < arcPts.length; i++) {
      const here = arcPts[i], next = arcPts[(i + 1) % arcPts.length];
      const d = here[here.length - 1].distanceTo(next[0]);
      const nChord = Math.max(1, Math.round(d / PITCH));
      n += spec[i].nInt + nChord;
      worst = Math.max(worst, Math.abs(d / nChord - PITCH));
    }
    // Inner and outer plates alternate, so the loop has to close on an even count.
    return n % 2 === 0 ? worst : Infinity;
  };
  // Centred is the start. Slide each wrap so the short idler run (and the others) land on the pitch.
  const steps = 17;
  let best = spec.map((sp) => Math.min(sp.hi, Math.max(sp.lo, sp.slack / 2)));
  let bestErr = worstOf(best);
  const sample = (sp: (typeof spec)[number]) => {
    const out: number[] = [];
    for (let k = 0; k < steps; k++) out.push(sp.lo + ((sp.hi - sp.lo) * k) / (steps - 1));
    return out;
  };
  const grids = spec.map(sample);
  for (const a of grids[0]) for (const b of grids[1]) for (const c of grids[2]) {
    const err = worstOf([a, b, c]);
    if (err < bestErr - 1e-6) { bestErr = err; best = [a, b, c]; }
  }
  const arcPts = best.map((inset, i) => block(i, inset));
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
  const out = { n: pins.length, len, pins };
  pinCache.set(s, out);
  return out;
}
/** y of a run (line a-b) at engine x. */
const runY = (a: THREE.Vector2, b: THREE.Vector2, x: number) => a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
/** Hydraulic adjuster: body length, plunger + dome, arm-tail pad radius, and the plunger axis z offset from the chain plane. */
export const ADJ = { body: 32, dome: 4.5, pad: 6.5, zOff: { 1: -13, [-1]: -5 } as Record<number, number> };
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
  // adjuster base in the lower inner corner at the v3 floor height; axis aims at the tail pad
  // Clear of the floor on the right and the inner-edge wall on the left. The barrel is Ø24.4.
  // Outboard of the inner-edge flange (face at |x| = 124) so the Ø24.4 barrel clears it.
  // The chain-box outline stays on the original corner; see chainOutline.
  const adjBase = new THREE.Vector2(s > 0 ? 142 : -142, -112);
  // The barrel stays in this corner. The tail sits on the 64 mm circle about the base
  // (plunger extended) and below the idler, outside the sprocket.
  const need = ADJ.body + ADJ.dome + ADJ.pad + 3;
  const sprocketClear = IDLER_SPROCKET_R + 3.4 + ADJ.pad + 4;
  let tail = idler.clone().add(dir.clone().multiplyScalar(-30)).add(nLo.clone().multiplyScalar(20));
  {
    let best: THREE.Vector2 | null = null;
    let bestD = Infinity;
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const t = new THREE.Vector2(adjBase.x + Math.cos(a) * need, adjBase.y + Math.sin(a) * need);
      // Above the rising box floor, outboard of the inner flange, and short of the chain run.
      if (t.y < -80 || t.y > -45) continue;
      if (Math.abs(t.x) < 155 || Math.abs(t.x) > 190) continue;
      const d = t.distanceTo(idler);
      if (d < sprocketClear || d >= bestD) continue;
      bestD = d;
      best = t;
    }
    if (best) tail = best;
  }
  const axis = tail.clone().sub(adjBase).normalize();
  const contact = tail.clone().sub(axis.clone().multiplyScalar(ADJ.pad)); // plunger dome apex touches the pad here
  const reach = contact.distanceTo(adjBase); // base -> apex
  const plunger = reach - ADJ.body - ADJ.dome; // exposed plunger length
  const adj = adjBase.clone().add(axis.clone().multiplyScalar(ADJ.body)); // top of the body (plunger exits here)
  const perp = new THREE.Vector2(-axis.y, axis.x).multiplyScalar(s); // toward the chain / box interior
  const outside = perp.clone().negate(); // away from the chain
  // The foot eye sits beside the tail pad, on the open side of the barrel. A bar on the
  // outer side of the barrel is boxed in by the case wall. The stud is up-chain of that
  // eye, clear of the lower rail, the idler and the lid stud.
  const footEye = new THREE.Vector2(155 * s, -65);
  const ear = new THREE.Vector2(165 * s, -32);
  const strapDrop = 9;
  const z = CHAIN_Z[s], adjZ = z + ADJ.zOff[s];
  return { idler, idlerR, pivot, tail, contact, adj, adjBase, axis, perp, outside, footEye, ear, reach, plunger, dir, up, z, adjZ, strapZ: adjZ - strapDrop, adjLen: ADJ.body };
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
  const z0 = N.flange[1]; // hub back face on the flange; the shim now sits inboard of the flange
  p.add(yToZ(lathe([[N.r + 0.15, z0], [N.r + 8.5, z0], [N.r + 8.5, z0 + 2.2], [N.r + 8.2, z0 + 2.2], [N.r + 8.2, 7], [N.r + 5, N.hubFace], [N.r + 0.15, N.hubFace]], 32)), 'steel', [X, 0, z]);
  return p.g;
}
/**
 * Chain tensioner (103-10/-15): idler sprocket (#6, 19 T) on its arm (#5) pressed up into the slack run so the chain
 * wraps it (~36 deg), arm pivoting on its shaft (#3) in the housing boss, tail pad loaded by the hydraulic chain
 * adjuster (#10) whose plunger dome bears on the pad; adjuster held by its mounting ear on a housing stud + M8 nut
 * (103-10 #27/#28); plastic guide rails (#2) on the tight run and under the slack run.
 */
/**
 * Plastic guide rails (103-10/15 #2). Both banks carry three bolted blocks.
 * Two black 911 105 222 06 sit on the tight run and the crank-to-idler slack run.
 * The third is the idler-to-cam run (where 103-15 draws the extra rail): a long ribbed
 * bar with a ramped lead-in beside the idler and two bolt holes. Brown on both banks
 * (222 05 on the right; the left catalogue line is still three of 222 06).
 */
/** Long-rail pad under sealing ring 900 123 066 30 (Ø14). The hole is the M6 clearance. */
const SLACK_PAD_R = 7;
/** Cover-stud shank stays this far from the long-rail surface. The boss around it is notched back. */
const SLACK_STUD_CLEAR = 3.8;
/** Chain-box wall is 5 mm inside the outline. The rail stays this far off the outline so the wall and the 1 mm clash erosion miss it. */
const SLACK_WALL_CLEAR = 8;
const studMemo = new Map<number, THREE.Vector2[]>();
const outlineMemo = new Map<number, [number, number][]>();
function chainWallDist(s: 1 | -1, p: THREE.Vector2) {
  let o = outlineMemo.get(s);
  if (!o) { o = chainOutline(s, 0); outlineMemo.set(s, o); }
  let best = Infinity;
  for (let i = 0; i < o.length; i++) {
    const ax = o[i][0], ay = o[i][1];
    const bx = o[(i + 1) % o.length][0], by = o[(i + 1) % o.length][1];
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / L2));
    const d = Math.hypot(p.x - (ax + dx * t), p.y - (ay + dy * t));
    if (d < best) best = d;
  }
  return best;
}
function coverStudPoints(s: 1 | -1) {
  let hit = studMemo.get(s);
  if (!hit) {
    hit = chainCoverBolts(s).map((b) => new THREE.Vector2(b.x, b.y));
    studMemo.set(s, hit);
  }
  return hit;
}
function slackFrame(s: 1 | -1) {
  const P = chainPath(s);
  const T = tensionerLayout(s);
  const ca = P.slackB.pa, cb = P.slackB.pb;
  const runLen = ca.distanceTo(cb);
  const dir = cb.clone().sub(ca).multiplyScalar(1 / runLen);
  let n = new THREE.Vector2(-dir.y, dir.x);
  if (n.dot(T.idler.clone().sub(ca.clone().lerp(cb, 0.5))) < 0) n.negate();
  const cam = new THREE.Vector2(CAM_X * s, 0);
  const at = (f: number, nOff: number) => ca.clone().lerp(cb, f).addScaledVector(n, nOff);
  const gap = (f: number, nOff: number, c: THREE.Vector2, tooth: number) => at(f, nOff).distanceTo(c) - tooth;
  const studs = coverStudPoints(s);
  return { ca, cb, n, runLen, T, cam, at, gap, studs, toothI: T.idlerR + 3.4, toothC: CAM_SPROCKET_R + 3.4 };
}
/** Shoe, chain face and outer face of the long rail at fraction f of the idler–cam tangent. */
function slackSection(s: 1 | -1, f: number) {
  const { gap, T, cam, at, studs, toothI, toothC } = slackFrame(s);
  const CLEAR = 0.6;
  let shoe = SLACK_SHOE;
  if (gap(f, shoe, cam, toothC) < CLEAR) {
    let lo = shoe, hi = SLACK_PLATE - 0.4;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      if (gap(f, mid, cam, toothC) < CLEAR) lo = mid; else hi = mid;
    }
    shoe = hi;
  }
  const clearOuter = (nOff: number) => gap(f, nOff, T.idler, toothI) >= CLEAR
    && studs.every((q) => at(f, nOff).distanceTo(q) >= SLACK_STUD_CLEAR)
    && chainWallDist(s, at(f, nOff)) >= SLACK_WALL_CLEAR;
  let outer = SLACK_OUTER;
  if (!clearOuter(outer)) {
    let lo = SLACK_PLATE + 0.6, hi = outer;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      if (clearOuter(mid)) lo = mid; else hi = mid;
    }
    outer = Math.max(lo, SLACK_PLATE + 0.6);
  }
  return { shoe, crest: SLACK_PLATE, outer };
}
/**
 * Long-rail ends and the two bolt stations.
 * The bar starts once the chain face is clear of the idler teeth; the outer face ramps
 * out from that tip and pulls in again where a cover stud stands beside the cam.
 * The sprocket and the pivot eye block a boss on the idler side of the arm, so the two
 * bolts sit in the cam-side window: one at each end, at least 15 mm apart. A boss that
 * close to the eye is notched. Pads stay off the stud shanks.
 */
function slackRailPlan(s: 1 | -1) {
  const frame = slackFrame(s);
  const { gap, T, runLen, cam, at, studs, toothI, toothC } = frame;
  const CLEAR = 0.6;
  let fIdler = 0.5;
  if (s > 0) {
    for (let f = 0.2; f < 0.7; f += 0.002) if (gap(f, SLACK_PLATE, T.idler, toothI) >= CLEAR) { fIdler = f; break; }
  } else {
    for (let f = 0.8; f > 0.3; f -= 0.002) if (gap(f, SLACK_PLATE, T.idler, toothI) >= CLEAR) { fIdler = f; break; }
  }
  const okBolt = (f: number) => {
    const p = at(f, SLACK_BOLT_N);
    // Hole (r 3.3) stays outside the pivot eye (r 11). The boss is notched back to the eye.
    if (p.distanceTo(T.pivot) < 11 + 3.3 + CLEAR) return false;
    if (gap(f, SLACK_BOLT_N, T.idler, toothI) < 5.6 + CLEAR) return false;
    if (gap(f, SLACK_PLATE, cam, toothC) < CLEAR) return false;
    if (studs.some((q) => p.distanceTo(q) < SLACK_PAD_R + SLACK_STUD_CLEAR)) return false;
    if (slackSection(s, f).outer < SLACK_BOLT_N + SLACK_PAD_R - 0.05) return false;
    return true;
  };
  const good: number[] = [];
  for (let f = -0.2; f <= 1.35; f += 0.002) if (okBolt(f)) good.push(f);
  let fA = good[0] ?? fIdler, fB = fA, start = fA, prev = fA, best = 0;
  for (const f of good) {
    if (f - prev > 0.008) start = f;
    if ((f - start) * runLen > best) { best = (f - start) * runLen; fA = start; fB = f; }
    prev = f;
  }
  const towardCam = s > 0 ? 1 : -1;
  const fCamBolt = towardCam > 0 ? fB : fA;
  let fCamTip = fCamBolt + towardCam * ((SLACK_PAD_R + 0.4) / runLen);
  const tipOk = (f: number) => gap(f, SLACK_PLATE, cam, toothC) >= CLEAR && slackSection(s, f).outer >= SLACK_PLATE + 0.5;
  if (!tipOk(fCamTip)) {
    for (let i = 0; i < 40 && !tipOk(fCamTip); i++) fCamTip -= towardCam * 0.002;
  }
  const f0 = Math.min(fIdler, fCamTip);
  const f1 = Math.max(fIdler, fCamTip);
  const uOf = (f: number) => (f - f0) / (f1 - f0);
  const boltU = [uOf(fA), uOf(fB)].sort((a, b) => a - b);
  return { f0, f1, boltU, n: frame.n };
}
export function guideRails(s: 1 | -1) {
  const { up1, up2, nUp } = basePath(s); const P = chainPath(s);
  const outward = (a: THREE.Vector2, b: THREE.Vector2) => {
    const d = b.clone().sub(a).normalize();
    let n = new THREE.Vector2(d.y, -d.x);
    const mid = a.clone().lerp(b, 0.5);
    const inside = new THREE.Vector2(CAM_X * s * 0.35, -30);
    if (n.dot(mid.clone().sub(inside)) < 0) n = n.negate();
    return n;
  };
  const black = 'blackPlastic' as MatKey;
  const sa = P.slackA.pa, sb = P.slackA.pb;
  const ca = P.slackB.pa, cb = P.slackB.pb;
  // +n is the outside of the chain (toward the idler). The block sits there, tangent to the run.
  const slack = slackRailPlan(s);
  const nSlack = slack.n;
  // Kat 502 #3 is four bolts per bank: one in each short rail, two in the idler-to-cam rail.
  return [
    // Stop short of the cover-stud pillar on the top wall.
    { a: up1, b: up2, n: nUp, f0: 0.53, f1: 0.71, mat: black, bolted: true, boltU: [0.5] },
    { a: sa, b: sb, n: outward(sa, sb), f0: s > 0 ? 0.55 : 0.2, f1: s > 0 ? 0.8 : 0.45, mat: black, bolted: true, boltU: [s > 0 ? 0.32 : 0.68] },
    {
      a: ca, b: cb, n: nSlack,
      f0: slack.f0, f1: slack.f1,
      mat: 'railBrown' as MatKey, bolted: true, slack: true,
      boltU: slack.boltU,
    },
  ];
}
/** Bolt stations as a fraction of each rail, in the full-height middle so the head has a flat seat. */
function railBoltU(r: { boltU?: number[] }) {
  return r.boltU ?? [0.22, 0.78];
}
/** Ribbed guide-rail block. `halfZ` covers the duplex chain; the bolt head seats on the +Z face. */
export const RAIL = { halfZ: 7.2, thick: 10, rib: 1.8, slotD: 6.6, slotW: 6.6, slotLand: 1.7, padR: 6.2, padT: 1.6 };
/** Long-rail rib, mm outside the pitch line. Roller radius 3.2 plus 0.4 mm running clearance. */
export const SLACK_SHOE = 3.6;
/** Chain plates reach 4.1 mm from the pitch line. The block face sits 0.4 mm outside them. */
export const SLACK_PLATE = 4.5;
/** Outer face of the long rail. A Ø14 pad centred on the bolt line stays on this face. */
export const SLACK_OUTER = 18.8;
/** Bolt centre along the long-rail normal. The pad is Ø14; its chain side is clipped clear of the plates. */
export const SLACK_BOLT_N = 11.4;
/** End-ramp divisor. Full height for u in (1/SLACK_RAMP, 1 − 1/SLACK_RAMP). */
const SLACK_RAMP = 16;
/** Curved U-channel shoe. `inner` is the gap from the pitch line to the shoe face; `bow` pulls the middle in. */
export const RAIL_SHOE = { inner: 4.9, thick: 6.5, bow: 0.55 };
/** Distance from the pitch line to the shoe's inner face at fraction u along the rail (0 at the start). */
export function railInner(u: number) { return RAIL_SHOE.inner - RAIL_SHOE.bow * Math.sin(Math.PI * u); }
/** Extra shoe offset at the cam end so the rib clears the sprocket teeth. Zero along the rest of the rail. */
function railBow(r: { camBow?: number; camAt?: 0 | 1 }, u: number) {
  if (!r.camBow) return 0;
  const camU = r.camAt ? u : 1 - u;
  const k = Math.max(0, (camU - 0.78) / 0.22);
  return r.camBow * k * k;
}
/** Rib tip, block inner face and block outer face, along the rail normal. The long rail is a straight ribbed bar. */
function railFaces(r: { slack?: boolean; f0: number; f1: number; camBow?: number; camAt?: 0 | 1 }, u: number, s: 1 | -1) {
  if (r.slack) {
    const sec = slackSection(s, r.f0 + (r.f1 - r.f0) * u);
    return { crest: sec.crest, inner: sec.crest, outer: sec.outer, shoe: sec.shoe };
  }
  const crest = railInner(u) + railBow(r, u);
  return { crest, inner: crest + RAIL.rib, outer: crest + RAIL.rib + RAIL.thick, shoe: crest };
}
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
/** 19 T idler: duplex rings, solid web, rounded roller-chain teeth, bronze bush, round bore. */
function idlerSprocket(p: Part, s: 1 | -1, T: ReturnType<typeof tensionerLayout>, z: number) {
  const r = T.idlerR;
  const phase = toothPhase(s, T.idler.x, T.idler.y, r, IDLER_T);
  const rr = r - 3.6, rt = r + 3.4;
  const at: V3 = [T.idler.x, T.idler.y, z];
  for (const dz of [-ROW, ROW]) {
    p.add(extrudeC(rollerChainShape(IDLER_T, rr, rt, rr - 4.4), 4.8, 0, 2).rotateZ(phase), 'steel', [at[0], at[1], at[2] + dz]);
  }
  const web = circleShape(rr - 5.4);
  web.holes.push(circlePath(8.6) as THREE.Path);
  // Between the rings. A web at the ring's z sits inside the tooth disc.
  for (const zc of [-1.4, 1.4]) p.add(extrudeC(web, 2.0, 0, 16), 'steel', [at[0], at[1], at[2] + zc]);
  // Bronze bush only. The shaft and its bolt head are added with the arm so one pin runs through both.
  p.add(yToZ(closedLathe([[6.1, -6.5], [8.5, -6.5], [8.5, 6.5], [6.1, 6.5]], 24)), 'bronze', at);
}
/** Closed plate with through-holes. `zAt` returns the bottom and top Z at a plan point. */
export function holedPlate(outer: [number, number][], holes: [number, number][][], zAt: (x: number, y: number) => [number, number]) {
  const area = (pts: [number, number][]) => pts.reduce((a, p, i) => {
    const q = pts[(i + 1) % pts.length];
    return a + p[0] * q[1] - q[0] * p[1];
  }, 0);
  const contour = area(outer) > 0 ? outer : outer.slice().reverse();
  const rings = holes.map((h) => (area(h) < 0 ? h : h.slice().reverse()));
  const faces = ShapeUtils.triangulateShape(
    contour.map(([x, y]) => new THREE.Vector2(x, y)),
    rings.map((h) => h.map(([x, y]) => new THREE.Vector2(x, y))),
  );
  const flat = [...contour, ...rings.flat()];
  const N = flat.length;
  const base = flat.map(([x, y]) => {
    const [z0, z1] = zAt(x, y);
    return { x, y, z0, z1 };
  });
  // Caps and walls do not share vertices. A shared edge averages the wall normal into the
  // flat face and the plate renders as triangular streaks.
  const pos: number[] = [];
  const idx: number[] = [];
  for (const p of base) pos.push(p.x, p.y, p.z0);
  for (const p of base) pos.push(p.x, p.y, p.z1);
  for (const [a, b, c] of faces) idx.push(a, c, b, a + N, b + N, c + N);
  const addWall = (ringStart: number, m: number) => {
    for (let i = 0; i < m; i++) {
      const A = base[ringStart + i], B = base[ringStart + ((i + 1) % m)];
      const v = pos.length / 3;
      pos.push(A.x, A.y, A.z0, B.x, B.y, B.z0, B.x, B.y, B.z1, A.x, A.y, A.z1);
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    }
  };
  addWall(0, contour.length);
  let start = contour.length;
  for (const ring of rings) { addWall(start, ring.length); start += ring.length; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/**
 * Closed tetrahedron joining an extra solid to the block. Vertices are copies of
 * existing ones, so both stay closed and become one welded piece. Nothing is moved.
 */
function bridgeTet(block: THREE.BufferGeometry, extra: THREE.BufferGeometry): THREE.BufferGeometry | null {
  const T = (block.index ? block.toNonIndexed() : block).getAttribute('position');
  const E = extra.getAttribute('position');
  let best = Infinity, ie = 0, jt = 0;
  for (let i = 0; i < E.count; i++) {
    const ex = E.getX(i), ey = E.getY(i), ez = E.getZ(i);
    for (let j = 0; j < T.count; j++) {
      const d = (ex - T.getX(j)) ** 2 + (ey - T.getY(j)) ** 2 + (ez - T.getZ(j)) ** 2;
      if (d < best) { best = d; ie = i; jt = j; }
    }
  }
  if (best < 1e-6 || best > 4) return null;
  const ex = E.getX(ie), ey = E.getY(ie), ez = E.getZ(ie);
  const ranked: { i: number; d: number }[] = [];
  for (let i = 0; i < E.count; i++) {
    if (i === ie) continue;
    const d = (ex - E.getX(i)) ** 2 + (ey - E.getY(i)) ** 2 + (ez - E.getZ(i)) ** 2;
    if (d > 0.04 && d < 25) ranked.push({ i, d });
  }
  ranked.sort((a, b) => a.d - b.d);
  if (ranked.length < 2) return null;
  const near = [ranked[0].i, ranked[1].i];
  const p = (attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number) => [attr.getX(i), attr.getY(i), attr.getZ(i)];
  const A = p(T, jt), B = p(E, ie), C = p(E, near[0]), D = p(E, near[1]);
  const pos = [
    ...A, ...C, ...B, ...A, ...B, ...D, ...A, ...D, ...C, ...B, ...C, ...D,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}
/** One mesh from several closed solids. Shared faces are not welded; each solid stays closed. */
function concatGeom(parts: THREE.BufferGeometry[]) {
  const pos: number[] = [];
  for (const g0 of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    const P = g.getAttribute('position');
    for (let i = 0; i < P.count; i++) pos.push(P.getX(i), P.getY(i), P.getZ(i));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
/** Slide a rail-bolt centre off the idler arm and its pivot. The slot and the housing boss follow. */
function clearOfArm(x: number, y: number, s: 1 | -1) {
  const T = tensionerLayout(s);
  let bx = x, by = y;
  const boss = 5.6, need = 3;
  const width = (t: number, rA: number, rB: number) => {
    const u = Math.max(0, Math.min(1, t));
    return (1 - u) * rA + u * rB - Math.min(rA, rB) * 0.36 * Math.sin(Math.PI * u);
  };
  for (let n = 0; n < 8; n++) {
    let worst = 0, wx = 0, wy = 0;
    const consider = (cx: number, cy: number, gap: number) => {
      const short = need - gap;
      if (short <= worst) return;
      const d = Math.hypot(bx - cx, by - cy) || 1;
      worst = short; wx = (bx - cx) / d; wy = (by - cy) / d;
    };
    for (const [ax, ay, bx2, by2, rA, rB] of [
      [T.pivot.x, T.pivot.y, T.idler.x, T.idler.y, 12, 16],
      [T.idler.x, T.idler.y, T.tail.x, T.tail.y, 15, 7],
    ] as const) {
      const dx = bx2 - ax, dy = by2 - ay, L2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((bx - ax) * dx + (by - ay) * dy) / L2));
      const cx = ax + dx * t, cy = ay + dy * t;
      consider(cx, cy, Math.hypot(bx - cx, by - cy) - width(t, rA, rB) - boss);
    }
    consider(T.pivot.x, T.pivot.y, Math.hypot(bx - T.pivot.x, by - T.pivot.y) - 11 - boss);
    consider(T.idler.x, T.idler.y, Math.hypot(bx - T.idler.x, by - T.idler.y) - 16 - boss);
    if (worst <= 0) break;
    bx += wx * Math.min(worst, 1.5);
    by += wy * Math.min(worst, 1.5);
  }
  return { x: bx, y: by };
}
/** Where a rail bolt passes through a slot: XY on the slot, Z on the +Z face of the block. */
function railBoltAt(r: ReturnType<typeof guideRails>[number], f: number, zChain: number, s: 1 | -1) {
  const u = (f - r.f0) / (r.f1 - r.f0);
  const q = r.a.clone().lerp(r.b, f);
  const faces = railFaces(r, u, s);
  // Long-rail slots stay on the block, under the pad. The 240° screw is cleared by
  // moving the bolt along the rail (guideRails) and notching the housing boss.
  const off = r.slack ? SLACK_BOLT_N : faces.outer - RAIL.slotLand - RAIL.slotD / 2;
  const bolt = q.add(r.n.clone().multiplyScalar(off));
  // The slack rail's holes are already in the cam-end block. Sliding them off the arm
  // would walk the slot out of the footprint and open the plate.
  const c = r.slack ? { x: bolt.x, y: bolt.y } : clearOfArm(bolt.x, bolt.y, s);
  return new THREE.Vector3(c.x, c.y, zChain + RAIL.halfZ + RAIL.padT);
}
/** Rail bolts (#3): through the slots of every rail, head on the +Z face. */
export function railBolts(s: 1 | -1) {
  const z = CHAIN_Z[s];
  return guideRails(s).filter((r) => r.bolted).flatMap((r) => railBoltU(r).map((u) => r.f0 + (r.f1 - r.f0) * u).map((f) => railBoltAt(r, f, z, s)));
}
/**
 * Arm centre, and how far the eyes and the idler bush may hang below it.
 * On the left the chain is close to the back plate, so the bottoms stop 1 mm above that plate.
 * The pivot boss is the same height as the eye, so the eye still sits on the boss.
 */
export function armSeat(s: 1 | -1) {
  const armZ = CHAIN_Z[s] - 13;
  const clearZ = HOUSING_Z0 + 4 + 1;
  const eyeBot = Math.max(-6, clearZ - armZ);
  const bushBot = Math.max(-7, clearZ - armZ);
  return { armZ, eyeBot, bushBot, bossTop: armZ + eyeBot };
}
/** Spacer sleeve #10A under the strap eye. The left strap sits 9 mm below the chain, so the sleeve stops on the back plate instead of running through the case face. */
export function adjusterSleeve(s: 1 | -1) {
  const T = tensionerLayout(s);
  const strapHalf = 1.6;
  const strapBottom = T.strapZ - strapHalf;
  const sleeve0 = Math.max(HOUSING_Z0 + 4.2, strapBottom - 9);
  return { strapHalf, sleeve0, sleeveLen: Math.max(2.5, strapBottom - sleeve0) };
}
export function chainTensioner(s: 1 | -1) {
  const p = new Part();
  const z = CHAIN_Z[s];
  const T = tensionerLayout(s);
  // idler sprocket: 19 T duplex, solid web, rounded roller-chain teeth, bronze bush
  idlerSprocket(p, s, T, z);
  // Forged arm: eyes bored so the bronze bushes sit in the holes.
  // The pivot eye ends on the housing boss (boss top = eye bottom). The shaft alone enters the boss.
  const seat = armSeat(s);
  const armZ = seat.armZ;
  // Bar stops short of each eye so the bush, shaft and tail pad sit in the bore, not in the forging.
  const armBar = (a: THREE.Vector2, b: THREE.Vector2, gapA: number, gapB: number, halfW: number) => {
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
    const len = L - gapA - gapB;
    if (len < 4) return;
    const sh = polyShape([[0, halfW], [len, halfW * 0.72], [len, -halfW * 0.72], [0, -halfW]]);
    // Stay under the idler sprocket (ring bottom is 7.5 mm below the chain). Depth 6 ends 2.5 mm short of it.
    const g = extrudeC(sh, 6, 0, 1);
    g.rotateZ(Math.atan2(dy, dx));
    g.translate(a.x + (dx / L) * gapA, a.y + (dy / L) * gapA, armZ);
    p.add(g, 'forgedDark');
  };
  // Ends clear the eye rims (idler 17.2, pivot 11) so the bars are not inside the bosses.
  armBar(T.pivot, T.idler, 11.4, 17.6, 7);
  armBar(T.idler, T.tail, 17.6, 7.2, 7);
  const eye = (x: number, y: number, profile: [number, number][]) => {
    p.add(yToZ(closedLathe(profile, 24)).translate(x, y, armZ), 'forgedDark');
  };
  // One boss: the wide middle joins what used to be three overlapping cheeks.
  eye(T.idler.x, T.idler.y, [[12, seat.eyeBot], [16, seat.eyeBot], [16, -3], [17.2, -3], [17.2, 3], [16, 3], [16, 5.8], [12, 5.8]]);
  eye(T.pivot.x, T.pivot.y, [[9.2, seat.eyeBot], [11, seat.eyeBot], [11, -1], [9.2, -1]]);
  p.add(yToZ(closedLathe([[8.2, seat.bushBot], [10.4, seat.bushBot], [10.4, 5.8], [8.2, 5.8]], 20)), 'bronze', [T.idler.x, T.idler.y, armZ]);
  p.add(yToZ(closedLathe([[7.2, seat.eyeBot], [7.8, seat.eyeBot], [7.8, 4], [7.2, 4]], 24)), 'bronze', [T.pivot.x, T.pivot.y, armZ]);
  // Shaft (#3) fills the eye and enters the boss, and stays above the case gasket.
  {
    const shaftTop = armZ + 4;
    const shaftBot = Math.max(armZ - 14, HOUSING_Z0 + 1.5);
    p.add(yToZ(cyl(6.2, shaftTop - shaftBot, 16)), 'polishedSteel', [T.pivot.x, T.pivot.y, (shaftBot + shaftTop) / 2]);
  }
  // Idler sprocket shaft: through the bronze bush and into the arm boss, bolt head on the cover side.
  {
    const bushFront = z + 6.5;
    const shaftBack = armZ - 4;
    const shaftR = 5.5;
    p.add(yToZ(cyl(shaftR, bushFront - shaftBack, 18)), 'polishedSteel', [T.idler.x, T.idler.y, (shaftBack + bushFront) / 2]);
    p.add(yToZ(hexNut(14, 5)), 'zincPlate', [T.idler.x, T.idler.y, bushFront + 2.5]);
  }
  // tail pad (hardened, Z-axis) that the plunger dome bears on
  const padZ0 = Math.max(z - 18, T.strapZ + 4), padZ1 = Math.max(T.adjZ + 8, padZ0 + 8);
  p.add(yToZ(cyl(ADJ.pad, padZ1 - padZ0, 20)), 'polishedSteel', [T.tail.x, T.tail.y, (padZ0 + padZ1) / 2]);
  (p.g.children[p.g.children.length - 1] as THREE.Mesh).name = 'seat:tail-pad';
  // sealed hydraulic adjuster (930 105 049 00, Kat 502 p.74 #10): straight cylinder.
  // Bleeder #25 and its ring stick out on +Z (local Z survives the axis rotation). The strap is added in world XY.
  const adj = new Part();
  const reach = T.reach;
  // The tail pad is only `reach` mm up the axis. A 50 mm body would run through it.
  const L = ADJ.body;
  const Rbody = 12.2;
  adj.add(closedLathe([[0.1, 0], [Rbody, 0], [Rbody, L - 1.4], [0.1, L - 1.4]], 28), 'castAlu');
  adj.add(closedLathe([[7.2, L - 1.4], [Rbody, L - 1.4], [Rbody, L], [7.2, L]], 24), 'darkSteel');
  const by = L * 0.55;
  adj.add(closedLathe([[3.3, 0], [5.8, 0], [5.8, 1.1], [3.3, 1.1]], 16).rotateX(Math.PI / 2).translate(0, by, Rbody), 'copper');
  adj.add(cyl(2.7, 6, 12).rotateX(Math.PI / 2).translate(0, by, Rbody + 3.1), 'darkSteel');
  adj.add(hexNut(8, 3.4).rotateX(Math.PI / 2).translate(0, by, Rbody + 7.8), 'zincPlate');
  // Apex on the tail-pad surface. The body is the 32 mm 930 105 049 00 barrel.
  const tipGap = 0;
  const plunge = Math.max(2, reach - tipGap - ADJ.dome - L - 0.6);
  adj.add(cyl(5, plunge, 14), 'polishedSteel', [0, L + 0.4 + plunge / 2, 0]);
  adj.add(closedLathe([[0.1, 0], [6.5, 0], [6.5, 1.5], [3, ADJ.dome], [0.1, ADJ.dome]], 18), 'steel', [0, reach - tipGap - ADJ.dome, 0]);
  (adj.g.children[adj.g.children.length - 1] as THREE.Mesh).name = 'seat:plunger-dome';
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
  // Flat strap on 930 105 049 00, from the eye beside the tail pad up to the stud.
  // Spacer sleeve #10A (930 105 513 00) stands on the stud between the housing boss and that eye.
  {
    const eyeA = T.footEye, eyeB = T.ear;
    const dx = eyeB.x - eyeA.x, dy = eyeB.y - eyeA.y, len = Math.hypot(dx, dy);
    const rEye = 8.2;
    const nSeg = 10;
    const pts: [number, number][] = [];
    for (let i = 0; i <= nSeg; i++) {
      const a = Math.PI / 2 + (Math.PI * i) / nSeg;
      pts.push([rEye * Math.cos(a), rEye * Math.sin(a)]);
    }
    for (let i = 0; i <= nSeg; i++) {
      const a = -Math.PI / 2 + (Math.PI * i) / nSeg;
      pts.push([len + rEye * Math.cos(a), rEye * Math.sin(a)]);
    }
    const ang = Math.atan2(dy, dx), c = Math.cos(ang), sn = Math.sin(ang);
    const world = (lx: number, ly: number): [number, number] => [eyeA.x + c * lx - sn * ly, eyeA.y + sn * lx + c * ly];
    const outline = pts.map(([lx, ly]) => world(lx, ly));
    const ring = (x: number, y: number): [number, number][] => Array.from({ length: 16 }, (_, i) => {
      const a = (i / 16) * Math.PI * 2;
      return [x + Math.cos(a) * 4.3, y + Math.sin(a) * 4.3] as [number, number];
    });
    p.add(holedPlate(outline, [ring(eyeA.x, eyeA.y), ring(eyeB.x, eyeB.y)], () => [T.strapZ - 1.6, T.strapZ + 1.6]), 'castAlu');
    // Pin through the foot eye. It stays in the strap, clear of the tail pad.
    p.add(yToZ(cyl(4.0, 7.2, 16)), 'castAlu', [eyeA.x, eyeA.y, T.strapZ]);
  }
  const { strapHalf, sleeve0, sleeveLen } = adjusterSleeve(s);
  p.add(yToZ(closedLathe([[4.25, 0], [7.4, 0], [7.4, sleeveLen], [4.25, sleeveLen]], 18)).translate(T.ear.x, T.ear.y, sleeve0), 'polishedSteel');
  const studTop = T.strapZ + strapHalf + 1.6;
  p.add(yToZ(cyl(4, studTop - (HOUSING_Z0 + 4), 12)), 'zincPlate', [T.ear.x, T.ear.y, (studTop + HOUSING_Z0 + 4) / 2]);
  p.add(yToZ(closedLathe([[4.4, 0], [8, 0], [8, 1.6], [4.4, 1.6]], 16)).translate(T.ear.x, T.ear.y, T.strapZ + strapHalf), 'zincPlate');
  p.add(yToZ(hexNut(13, 6.5)), 'zincPlate', [T.ear.x, T.ear.y, T.strapZ + strapHalf + 1.6 + 3.25]);
  // Guide rails (#2): one closed block per rail, shoe on the chain side, bolt pads on the +Z face.
  const railMesh = (r: ReturnType<typeof guideRails>[number]) => {
    const A = r.a.clone().lerp(r.b, r.f0), B = r.a.clone().lerp(r.b, r.f1);
    const n = r.n;
    const dir = B.clone().sub(A).normalize();
    const len = A.distanceTo(B);
    const steps = r.slack ? 32 : 24;
    const endRamp = (rail: { slack?: boolean; camBow?: number }) => (rail.slack ? SLACK_RAMP : rail.camBow ? 18 : 6);
    const st = (i: number) => {
      const u = i / steps;
      const ramp = endRamp(r);
      const taper = Math.min(1, u * ramp, (1 - u) * ramp);
      const faces = railFaces(r, u, s);
      return { c: A.clone().lerp(B, u), ...faces, taper, u };
    };
    const inner: [number, number][] = [], outer: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
      const s0 = st(i);
      // The shoe is the chain-side face of the block.
      const p0 = s0.c.clone().addScaledVector(n, s0.crest);
      const p1 = s0.c.clone().addScaledVector(n, s0.outer);
      inner.push([p0.x, p0.y]);
      outer.push([p1.x, p1.y]);
    }
    const footprint = [...inner, ...outer.reverse()];
    const boltF = railBoltU(r).map((u) => r.f0 + (r.f1 - r.f0) * u);
    const holes: [number, number][][] = boltF.map((f) => {
      const at = railBoltAt(r, f, z, s);
      const hw = RAIL.slotW / 2, hd = RAIL.slotD / 2;
      return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, ly]) => [at.x + dir.x * lx + n.x * ly, at.y + dir.y * lx + n.y * ly] as [number, number]);
    });
    const block = holedPlate(footprint, holes, (x, y) => {
      const u = ((x - A.x) * dir.x + (y - A.y) * dir.y) / len;
      const ramp = endRamp(r);
      const taper = Math.min(1, Math.max(0, u) * ramp, Math.max(0, 1 - u) * ramp);
      const k = 0.55 + 0.45 * taper;
      // Full-height underside is the boss top (CHAIN_Z − halfZ). The ends ramp up off it.
      return [z - RAIL.halfZ * k, z + RAIL.halfZ * k];
    });
    // Pad and ribs are part of this mesh. A second solid sitting on the face
    // survives the 1 mm erosion as an intra-part hit.
    const pieces: THREE.BufferGeometry[] = [block];
    if (r.bolted) {
      const ats = boltF.map((f) => railBoltAt(r, f, z, s));
      const pr = r.slack ? SLACK_PAD_R : RAIL.padR;
      const hole = RAIL.slotW / 2;
      const zc = z + RAIL.halfZ + RAIL.padT / 2;
      for (const at of ats) {
        // Annulus: the Ø14 ring seats on the pad and the shank passes through the hole.
        if (!r.slack) {
          const ring = yToZ(closedLathe([
            [hole, -RAIL.padT / 2], [pr, -RAIL.padT / 2], [pr, RAIL.padT / 2], [hole, RAIL.padT / 2],
          ], 24));
          ring.translate(at.x, at.y, zc);
          pieces.push(ring);
          continue;
        }
        // Seat ray lands at r 5.95, so the flat stays outside that ring.
        // Plates reach about n 4.1; the flat is the other side of them.
        const clip = 6.15;
        const along = (x: number, y: number) => (x - at.x) * n.x + (y - at.y) * n.y;
        const arc = (rad: number, nSeg: number): [number, number][] => Array.from({ length: nSeg }, (_, i) => {
          const a = (i / nSeg) * Math.PI * 2;
          return [at.x + Math.cos(a) * rad, at.y + Math.sin(a) * rad] as [number, number];
        });
        const raw = arc(pr, 32);
        const outer: [number, number][] = [];
        for (let i = 0; i < raw.length; i++) {
          const a = raw[i], b = raw[(i + 1) % raw.length];
          const ka = along(a[0], a[1]) >= -clip, kb = along(b[0], b[1]) >= -clip;
          if (ka) outer.push(a);
          if (ka !== kb) {
            const da = along(a[0], a[1]), db = along(b[0], b[1]);
            const t = (-clip - da) / (db - da);
            outer.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
          }
        }
        pieces.push(holedPlate(outer, [arc(hole, 16)], () => [zc - RAIL.padT / 2, zc + RAIL.padT / 2]));
      }
    }
    if (r.slack) {
      // Ribs in the roller lanes, the full length of the bar. A box keeps one normal per face:
      // a thin plate shares vertices, and the 1 mm clash erosion then folds the shoe into the chain.
      // The rib is 2.4 mm deep so that erosion cannot turn it inside out; past the chain face it
      // sits inside the block. Plates see the block face, not the rib.
      const xAxis = new THREE.Vector3(dir.x, dir.y, 0);
      const yAxis = new THREE.Vector3(-dir.y, dir.x, 0);
      const bandsAt = (u: number): [number, number][] => {
        const ramp = SLACK_RAMP;
        const taper = Math.min(1, Math.max(0, u) * ramp, Math.max(0, 1 - u) * ramp);
        const k = 0.55 + 0.45 * taper;
        const z0 = z - RAIL.halfZ * k, z1 = z + RAIL.halfZ * k;
        const out: [number, number][] = [];
        for (const [a, b] of [[z - RAIL.halfZ, z - 2.85], [z + 2.85, z + RAIL.halfZ]] as [number, number][]) {
          const lo = Math.max(a, z0), hi = Math.min(b, z1);
          if (hi - lo > 0.4) out.push([lo, hi]);
        }
        return out;
      };
      for (let i = 0; i < steps; i++) {
        const a = st(i), b = st(i + 1);
        const shoe = Math.max(a.shoe, b.shoe);
        const back = shoe + 2.4;
        const bands = bandsAt((a.u + b.u) / 2);
        for (const [z0, z1] of bands) {
          const g = new THREE.BoxGeometry((1 / steps) * len, back - shoe, z1 - z0);
          const m = new THREE.Matrix4().makeBasis(xAxis, yAxis, new THREE.Vector3(0, 0, 1));
          const c = a.c.clone().lerp(b.c, 0.5).addScaledVector(n, (shoe + back) / 2);
          m.setPosition(c.x, c.y, (z0 + z1) / 2);
          g.applyMatrix4(m);
          pieces.push(g);
        }
      }
    }
    const nPieces = pieces.length;
    for (let i = 1; i < nPieces; i++) {
      const link = bridgeTet(pieces[0], pieces[i]);
      if (link) pieces.push(link);
    }
    p.add(concatGeom(pieces), r.mat);
  };
  for (const r of guideRails(s)) railMesh(r);
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
    // The box corner stays put so the lid studs and cover-stud spacing do not move.
    // The barrel itself sits further outboard, clear of the flange, inside this outline.
    ...circlePts(134 * s, -124, 19 + grow, 16),
    ...circlePts(173.04 * s, -92.76, 16 + grow, 12),
    [(xi - 8) * s, runY(up1, up2, xi * s) + 34 + grow],
    [(xi - 8) * s, -144 - grow],
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
  // Studs stay off the strap the lid was drilled for. The live strap can move;
  // re-deriving the stations from it walks the studs and the lid holes.
  const strapA = { x: 131.97 * s, y: -97.45 }, strapB = { x: 183.50 * s, y: -56.22 };
  const nearStrap = (x: number, y: number) => {
    const dx = strapB.x - strapA.x, dy = strapB.y - strapA.y, L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - strapA.x) * dx + (y - strapA.y) * dy) / L2));
    return Math.hypot(x - (strapA.x + dx * t), y - (strapA.y + dy * t)) < 20;
  };
  const skip = (x: number, y: number) => inPassage(s)(x, y) || nearStrap(x, y);
  for (let every = 50; every < 140; every += 0.25) {
    const b = outlineBolts(o, every, skip);
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
export const CHAIN_LID = { z0: HOUSING_Z1 + 1.1, t: 4.5, top: HOUSING_Z1 + 1.1 + 7.6 };
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
  const backPoly = chainCaseFace(s);
  // The round cam-end cover crosses this plate. Notch the outline so the plate stays a closed shell.
  {
    const plate = clipOutsideCircle(backPoly, CAM_X * s, 0, CAM_COVER.rimR + 0.2);
    p.add(extrude(shapeFrom(plate), 4, 0, 8), 'castAlu', [0, 0, HOUSING_Z0]);
  }
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
  const longRail = guideRails(s).find((q) => q.slack)!;
  for (const b of chainCoverBolts(s)) {
    const z0b = b.x * s > CAM_END_X - 4 ? CAM_HOUSING_END_Z + 5 : HOUSING_Z0 + 4;
    // The long rail runs through the cam-end stud. Leave a gap there instead of
    // cutting the column: a coaxial CSG notch leaves a skin that still meets the rail.
    const rel = new THREE.Vector2(b.x, b.y).sub(longRail.a);
    const span = longRail.b.clone().sub(longRail.a);
    const f = rel.dot(span) / span.lengthSq();
    const nOff = rel.x * longRail.n.x + rel.y * longRail.n.y;
    const nearRail = f > longRail.f0 - 0.08 && f < longRail.f1 + 0.08 && nOff > -2 && nOff < 30;
    const zGap0 = CHAIN_Z[s] - RAIL.halfZ - 2.5;
    const zGap1 = CHAIN_Z[s] + RAIL.halfZ + RAIL.padT + 2.5;
    const spans: [number, number][] = nearRail
      ? [[z0b, Math.min(zGap0, HOUSING_Z1)], [Math.max(zGap1, z0b), HOUSING_Z1]]
      : [[z0b, HOUSING_Z1]];
    const seatX = (CHAIN_BOX_INNER_X + 6) * s;
    const crossesNut = [yTop - 10, yBot + 13.5].some((y) => Math.hypot(b.x - seatX, b.y - y) < 8);
    for (const [za, zb] of spans) {
      if (zb - za < 1.5) continue;
      let boss = yToZ(cyl(5.5, zb - za, 14));
      boss.translate(b.x, b.y, (za + zb) / 2);
      if (crossesNut) {
        const cutter = s > 0
          ? boxMM([seatX - 0.2, -400, 0], [400, 400, 400])
          : boxMM([-400, -400, 0], [seatX + 0.2, 400, 400]);
        boss = csgSub(boss, cutter);
      }
      p.add(boss, 'castAlu');
    }
  }
  // external ribs on the outer wall
  for (const b of outlineBolts(o, 110, (x) => x * s < CHAIN_BOX_INNER_X + 10)) {
    const g = boxMM([-1.5, 0, CAM_HOUSING_END_Z + 2], [1.5, 5, HOUSING_Z1 - 6]);
    g.rotateZ(Math.atan2(b.ny, b.nx) - Math.PI / 2); g.translate(b.x, b.y, 0); p.add(g, 'castAlu');
  }
  // Idler-arm shaft boss. Its top is the eye's bottom face, so the eye sits on it and only the shaft enters.
  {
    const bossTop = armSeat(s).bossTop;
    p.add(yToZ(cyl(12, bossTop - HOUSING_Z0, 18)), 'castAlu', [T.pivot.x, T.pivot.y, (HOUSING_Z0 + bossTop) / 2]);
  }
  // Stud boss stops where the spacer sleeve (#10A) starts, under the adjuster strap eye.
  {
    const { sleeve0 } = adjusterSleeve(s);
    p.add(yToZ(cyl(8, sleeve0 - HOUSING_Z0, 16)), 'castAlu', [T.ear.x, T.ear.y, (HOUSING_Z0 + sleeve0) / 2]);
  }
  // Seat under every guide-rail bolt. The top meets the rail's underside so the rail is clamped, not floating.
  for (const q of railBolts(s)) {
    const z1 = q.z - RAIL.padT - 2 * RAIL.halfZ;
    const h = z1 - HOUSING_Z0;
    if (h > 2) {
      let boss = yToZ(cyl(5.6, h, 14));
      boss.translate(q.x, q.y, HOUSING_Z0 + h / 2);
      // The 240° cover-screw head passes the cam-end boss. Notch that column out of the boss.
      const screw = camCoverBolt(s, 240);
      if (Math.hypot(q.x - screw.x, q.y - screw.y) < 5.6 + 6.2 + 0.4) {
        const cut = yToZ(cyl(6.2 + 0.8, h + 4, 20));
        cut.translate(screw.x, screw.y, HOUSING_Z0 + h / 2);
        boss = csgSub(boss, cut);
      }
      // The cam-side pair sits close to the pivot eye. Leave the eye, keep the bolt hole.
      const piv = T.pivot;
      if (Math.hypot(q.x - piv.x, q.y - piv.y) < 11 + 5.6 + 0.6) {
        const cut = yToZ(cyl(11.6, h + 4, 24));
        cut.translate(piv.x, piv.y, HOUSING_Z0 + h / 2);
        boss = csgSub(boss, cut);
      }
      p.add(boss, 'castAlu');
    }
  }
  // ears for the cam-housing end studs, bridged back to the top wall
  for (const [x, y] of END_STUDS[s]) {
    const h = END_PAD.z1 - END_PAD.z0, zc = (END_PAD.z0 + END_PAD.z1) / 2;
    p.add(yToZ(cyl(END_PAD.r, h, 24)), 'castAlu', [x, y, zc]);
    // The bridge stays above the round cam-end cover (rim r 47.2).
    p.add(boxMM([x - 7, 52, END_PAD.z0], [x + 7, y, END_PAD.z1]), 'castAlu');
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
/** Back face of the chain housing, where it gaskets onto the case. Outboard of CAM_END_X the cam housing closes the box, so the case gasket stops here. */
export function chainCaseFace(s: 1 | -1) {
  return clipBelowX(chainOutline(s, 0), s, CAM_END_X);
}
/**
 * Cut a circle out of a polygon where the circle bites an edge (the cam-end cover
 * crossing the chain-box back plate). The result follows the arc, so the plate
 * extrudes as a closed shell instead of a CSG cut.
 */
function clipOutsideCircle(pts: [number, number][], cx: number, cy: number, r: number): [number, number][] {
  const r2 = r * r;
  const area = pts.reduce((acc, p, i) => {
    const q = pts[(i + 1) % pts.length];
    return acc + p[0] * q[1] - q[0] * p[1];
  }, 0);
  const ccw = area > 0;
  const outside = (q: [number, number]) => (q[0] - cx) ** 2 + (q[1] - cy) ** 2 >= r2 - 1e-4;
  const start = pts.findIndex(outside);
  if (start < 0) return pts;
  const ring = pts.slice(start).concat(pts.slice(0, start));
  const hits = (a: [number, number], b: [number, number]) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const fx = a[0] - cx, fy = a[1] - cy;
    const A = dx * dx + dy * dy, B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - r2;
    const disc = B * B - 4 * A * C;
    if (disc < 0 || A < 1e-9) return [] as { t: number; p: [number, number] }[];
    const sd = Math.sqrt(disc);
    return [(-B - sd) / (2 * A), (-B + sd) / (2 * A)]
      .filter((t) => t > 1e-5 && t < 1 - 1e-5)
      .sort((p, q) => p - q)
      .map((t) => ({ t, p: [a[0] + dx * t, a[1] + dy * t] as [number, number] }));
  };
  const arc = (from: [number, number], to: [number, number]) => {
    let a0 = Math.atan2(from[1] - cy, from[0] - cx);
    let a1 = Math.atan2(to[1] - cy, to[0] - cx);
    if (ccw) while (a1 > a0) a1 -= Math.PI * 2;
    else while (a1 < a0) a1 += Math.PI * 2;
    const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 0.16));
    const mid: [number, number][] = [];
    for (let i = 1; i < n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      mid.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return mid;
  };
  const out: [number, number][] = [];
  let entered: [number, number] | null = null;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const aOut = outside(a), bOut = outside(b);
    const h = hits(a, b);
    if (aOut && bOut) {
      out.push(a);
      if (h.length === 2) out.push(h[0].p, ...arc(h[0].p, h[1].p), h[1].p);
    } else if (aOut && !bOut && h[0]) {
      out.push(a, h[0].p);
      entered = h[0].p;
    } else if (!aOut && bOut && h.length && entered) {
      const exit = h[h.length - 1].p;
      out.push(...arc(entered, exit), exit);
      entered = null;
    }
  }
  return out.length > 2 ? out : pts;
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
 * Centre-stud pads that chainLidStations measured on the flat lid. They stay at exactly
 * CHAIN_LID.top so the stud search still finds them once the field of the lid is a pan.
 */
export const LID_STUDS: Record<1 | -1, [number, number][]> = { 1: [[130, -40], [270, -70]], [-1]: [[-130, -40]] };
/**
 * Chain-housing lid (Kat 502 p.66, Bild 103-05 #6 left / #7 right). Pan: sealing face
 * on the gasket, raised perimeter rim and stud bosses up to the nut face, a deeper
 * relief in the field, a cross step on the upper part, and a stout diagonal tube with
 * a domed end on the visible outer face (the face the plugs go in from). Right-hand
 * part is 930 105 064 10. The nut face stays CHAIN_LID.top.
 */
export function chainHousingLid(s: 1 | -1) {
  const p = new Part();
  const o = chainOutline(s, 3);
  const z0 = CHAIN_LID.z0, top = CHAIN_LID.top;
  const fieldT = 3;
  p.add(extrude(shapeFrom(o), fieldT, 0, 8), 'castAlu', [0, 0, z0]);
  wallStrip(p, o.concat([o[0]]), 7, z0, top);
  // Cross step along the upper part of the outer face, above the deep field.
  const yStep = -6;
  const upper: [number, number][] = [];
  for (let i = 0; i < o.length; i++) {
    const a = o[i], b = o[(i + 1) % o.length];
    const ka = a[1] >= yStep, kb = b[1] >= yStep;
    const hit = (): [number, number] => {
      const t = (yStep - a[1]) / (b[1] - a[1]);
      return [a[0] + (b[0] - a[0]) * t, yStep];
    };
    if (ka && kb) upper.push(b);
    else if (ka && !kb) upper.push(hit());
    else if (!ka && kb) { upper.push(hit()); upper.push(b); }
  }
  if (upper.length > 2) p.add(extrude(shapeFrom(upper), 3.6, 0, 4), 'castAlu', [0, 0, z0 + fieldT]);
  for (const b of chainCoverBolts(s)) {
    p.add(yToZ(cyl(7.5, top - z0, 16)), 'castAlu', [b.x, b.y, (z0 + top) / 2]);
  }
  for (const [x, y] of LID_STUDS[s]) {
    p.add(yToZ(cyl(12, top - z0, 20)), 'castAlu', [x, y, (z0 + top) / 2]);
  }
  // Round bosses the two lid screw plugs seat on (probed from z = 400).
  for (const [x, y, r] of [[s * 232, -22, 11], [s * 250, 30, 9.5]] as [number, number, number][]) {
    p.add(yToZ(cyl(r, top - z0, 16)), 'castAlu', [x, y, (z0 + top) / 2]);
  }
  // Stout diagonal tube on the OUTER face, domed at the cam end. The plugs enter from this face.
  const T = tensionerLayout(s);
  const x1 = (CAM_X - 48) * s, y1 = 6;
  const x2 = T.adjBase.x + 28 * s, y2 = T.adjBase.y + 28;
  const tubeLen = Math.hypot(x2 - x1, y2 - y1);
  const tubeR = 5.4;
  const straight = Math.max(tubeR + 4, tubeLen - tubeR);
  const profile: [number, number][] = [[0.05, 0], [tubeR, 0], [tubeR, straight]];
  for (let i = 1; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    profile.push([Math.max(0.05, tubeR * Math.cos(a)), straight + tubeR * Math.sin(a)]);
  }
  const tube = closedLathe(profile, 16);
  tube.rotateZ(Math.atan2(y2 - y1, x2 - x1) - Math.PI / 2);
  tube.translate(x1, y1, z0 + fieldT + tubeR);
  p.add(tube, 'castAlu');
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
  return p.g;
}
