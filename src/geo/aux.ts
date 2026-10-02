/**
 * Ancillary assets: cooling (105), induction/CIS (106/107), ignition (901), exhaust & heat exchangers (202),
 * lubrication (104), clutch/flywheel (102/301). Shapes traced from the Porsche parts-catalogue illustrations.
 */
import * as THREE from 'three';
import { partPose } from './probe';
import { frame } from './instancing';
import {
  Part, V3, DEG, lathe, boxMM, cyl, cylBetween, yToZ, yToX, roundRect, circlePath, circleShape, ringShape,
  polyShape, gearShape, extrude, extrudeC, hexNut, tube, torus, paramSurface, hull, circlePts, csgSub, cutGroup, subtractSolids,
} from './util';
import { CYL_Z, CASE_Z, INT_SHAFT_Y, CYL_TOP_X, INTAKE_PORT, INJ } from '../data/layout';
import { buildPlenumBox, AIR_NECK, BOX, LID_Y, WUR_CONN, runnerTunnelCutters } from './induction';
export { INTAKE_PORT, INJ };
export { intakeRunner, injector, mixtureControlUnit, fuelLines } from './induction';

/** Fan axis. y 210.33 is the crank-to-fan centre distance that makes the pitch length 725 mm (crank pitch r 60, fan pitch r 36, belt plane z 303). */
export const FAN = { y: 210.33, zHousing0: 205, zHousing1: 296, zFan: 262, zBelt: 303, rCrankPulley: 65, rFanPulley: 41 };
/**
 * 1978 air cleaner (106-00 #13/#14). A low rounded canister across the engine, not the old
 * Ø160 × 440 trough. The paper element is the rectangular Mahle LX 261 panel (see airFilter).
 * Housing size is E from JE reassembly-55/57/61; the element is K.
 */
export const AIRBOX = {
  /** Element length along X (K). Heritage 911 110 185 02 / Mahle LX 261. */
  len: 402,
  /** Element width along Z (K). Same sources. */
  wid: 181,
  /** Element height (K). mhteile Mahle LX 261 listing, 41.4 mm. */
  h: 41.4,
  /** Canister centre along Z. The +Z cheek stays clear of the alternator (slip-ring face z ≈ 164). */
  z: 36,
  /** Equator where the two oval halves meet. */
  yMid: 378,
  /** Inner ellipse, Z half-width and Y half-height. Flat enough to read as a canister, wide enough for the panel. */
  a: 112,
  b: 42,
  wall: 3.6,
  /** Straight tube, half-length along X. End caps add the wall thickness. */
  half: 220,
  /** Horizontal lip the clips grab. The two halves meet on its face. */
  lip: 9,
  lipT: 3.2,
  /** Lowest point of the outer shell (yMid − b − wall). */
  floorY: 332.4,
};

export interface AirCleanerLayout {
  innerX: number; innerZ: number; outerX: number; outerZ: number; lipX: number; lipZ: number;
  floorTop: number; seam: number; elemBottom: number; elemTop: number; elemY: number; crown: number;
}
export function airCleanerLayout(): AirCleanerLayout {
  const A = AIRBOX;
  const elemBottom = A.yMid - A.h / 2;
  const elemTop = A.yMid + A.h / 2;
  return {
    innerX: A.half, innerZ: A.a, outerX: A.half + A.wall, outerZ: A.a + A.wall,
    lipX: A.half + A.wall, lipZ: A.a + A.wall + A.lip,
    floorTop: A.yMid - A.b, seam: A.yMid, elemBottom, elemTop, elemY: A.yMid,
    crown: A.yMid + A.b + A.wall,
  };
}
/** Two stations on the intake snout for the hose clamps. Axis points along the snout, out of the lid. */
export function airboxSnoutSamples(): { p: V3; dir: V3 }[] {
  const pts = airboxSnoutPoints();
  return [0.32, 0.7].map((t) => {
    const f = t * (pts.length - 1);
    const i = Math.min(pts.length - 2, Math.floor(f));
    const u = f - i;
    const a = pts[i], b = pts[i + 1];
    const p: V3 = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const L = Math.hypot(d[0], d[1], d[2]) || 1;
    return { p, dir: [d[0] / L, d[1] / L, d[2] / L] };
  });
}
function airboxSnoutPoints(): V3[] {
  const A = AIRBOX;
  // On the lid (930 110 184 00), just above the equator, so the snout belongs to the upper half.
  const x0 = -(A.half + A.wall);
  const y = A.yMid + 16;
  const z = A.z;
  return [[x0 + 1, y, z], [x0 - 28, y + 4, z - 8], [x0 - 62, y + 8, z - 28]];
}
export const SNOUT_R = 14;
/** Exhaust port centre at the head flange; y puts the 7.2 mm heat-exchanger flange flush under the head flange (y -63.5). */
export const EXH_PORT = { x: CYL_TOP_X + 34, y: -64.1 };

// ---------------------------------------------------------------- 105-00 cooling
/** Box centred at radius r from the fan axis (0, FAN.y), then spun by a about that axis. X is radial. */
function fanBox(sx: number, sy: number, sz: number, r: number, z: number, a: number) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  g.translate(r, 0, z);
  g.rotateZ(a);
  g.translate(0, FAN.y, 0);
  return g;
}
export function fanHousing() {
  // 930 106 005 00: unpainted dull-grey magnesium drum. Deep barrel, five grooves, five broad stator vanes,
  // solid alternator cradle. No feet, no rod spokes. Throat clears the 226 mm fan by ~4 mm.
  const p = new Part();
  // Flange starts at z 208 so the shroud collar tabs (end z 204.9) stay clear of the drum face.
  const z0 = 208;
  // Lip stays inside r 136 so the full circle clears the crank pulley (top y 67) and the chain-box gaskets.
  const prof: [number, number][] = [
    [122, z0], [117, 218], [117, 280], [124, 288], [132, 294], [136, 296],
    [136, 293], [132, 286], [130, 276], [132, 264],
  ];
  let gz = 256;
  for (let i = 0; i < 5; i++) {
    prof.push([132, gz], [128.4, gz - 1.5], [128.4, gz - 4.8], [132, gz - 6.3]);
    gz -= 8.4;
  }
  prof.push([132, z0 + 4], [122, z0]);
  p.add(yToZ(lathe(prof, 80)), 'magCast', [0, FAN.y, 0]);
  for (let i = 0; i < 12; i++) p.add(fanBox(5.2, 3.2, 48, 129.2, 232, (i / 12) * Math.PI * 2 + 0.08), 'magCast');
  // five broad stator vanes, curved from the cradle out to the drum
  for (let i = 0; i < 5; i++) {
    const a0 = -0.55 + (i / 5) * Math.PI * 2;
    const vane = (side: number) => paramSurface((u, v) => {
      const r = 74 + 42 * u;
      const ang = a0 + 0.34 * (u - 0.15) + side * (3.1 / r);
      const zz = 216 + 42 * v;
      return [r * Math.cos(ang), FAN.y + r * Math.sin(ang), zz];
    }, 6, 2);
    p.add(vane(1), 'magCast'); p.add(vane(-1), 'magCast');
  }
  // solid cradle ring, six holes on the engine-side face
  const cradle = ringShape(72, 63);
  for (let i = 0; i < 6; i++) {
    const a = 0.15 + (i / 6) * Math.PI * 2;
    cradle.holes.push(circlePath(3.3, 67.4 * Math.cos(a), 67.4 * Math.sin(a)) as THREE.Path);
  }
  p.add(extrude(cradle, 38), 'magCast', [0, FAN.y, 214]);
  // alternator strap inside the cradle bore (105-00 #2) and its clamp bolt
  p.add(yToZ(lathe([[58.6, 220], [63.2, 220], [63.2, 234], [58.6, 234]], 48)), 'steel', [0, FAN.y, 0]);
  p.add(boxMM([-8, FAN.y + 60, 218], [8, FAN.y + 76, 236]), 'steel');
  p.add(yToX(cyl(3.4, 24, 8)), 'zincPlate', [0, FAN.y + 70, 227]);
  // yellow-zinc band clamp on the barrel, just pulley-side of the shroud collar (105-05 clamp, two nuts, two washers)
  p.add(yToZ(lathe([[134.6, 238], [143.5, 238], [143.5, 250], [134.6, 250]], 72)), 'yellowZinc', [0, FAN.y, 0]);
  p.add(boxMM([-11, FAN.y + 140, 236], [11, FAN.y + 154, 252]), 'yellowZinc');
  p.add(yToX(cyl(3.4, 26, 8)), 'zincPlate', [0, FAN.y + 147, 244]);
  for (const s of [-1, 1] as const) {
    p.add(yToX(lathe([[3.6, 0], [7.2, 0], [7.2, 1.5], [3.6, 1.5]], 16)), 'zincPlate', [s * 7, FAN.y + 147, 244]);
    const nut = yToX(hexNut(10, 5));
    p.add(nut, 'zincPlate', [s * 12, FAN.y + 147, 244]);
  }
  return p.g;
}
export function fanImpeller() {
  // 930 106 011 01, 1978–79: Ø226, 11 broad twisted blades, large cast hub dish. A touch lighter than the housing.
  // The dish rim is the forward face; blade roots start under it so the pulley-end view shows the bowl, not the roots.
  const p = new Part();
  const dish: [number, number][] = [
    [12, 246], [28, 250], [44, 256], [52, 262], [60, 266.5], [66, 268],
    [66, 269.2], [58, 269.2], [50, 265], [42, 258], [24, 252], [12, 248],
  ];
  p.add(yToZ(lathe(dish, 64)), 'magnesium', [0, FAN.y, 0]);
  const blade = (i: number, side: number) => paramSurface((u, v) => {
    const r = 63 + (113 - 63) * u;
    const halfChord = 30 - 4 * u;
    const pitch = (50 - 26 * u) * DEG;
    const c = (v - 0.5) * 2 * halfChord;
    // Forward edge sits just behind the dish rim and rakes toward the pulley as the blade twists.
    const zFront = 266.2 + 9 * u;
    const z0 = zFront - halfChord * Math.sin(pitch);
    const ang = (i / 11) * Math.PI * 2 + (c * Math.cos(pitch)) / r;
    const tn = -Math.sin(pitch), zn = Math.cos(pitch);
    const th = (2.3 - 0.8 * u) * side;
    const ang2 = ang + (th * tn) / r;
    return [r * Math.cos(ang2), FAN.y + r * Math.sin(ang2), z0 + c * Math.sin(pitch) + th * zn];
  }, 14, 6);
  for (let i = 0; i < 11; i++) { p.add(blade(i, 1), 'magnesium'); p.add(blade(i, -1), 'magnesium'); }
  return p.g;
}
export function alternator() {
  // Bosch 14 V (911 603 120 02): bright cast drive-end shield with cooling slots, a short
  // dark laminated waist, copper visible in the windows, rectifier shield with the brush
  // holder. Coaxial on the fan. Shaft stops at z 312 so the pulley nut stays proud.
  const p = new Part();
  const y = FAN.y;
  const at = (r: number, a: number, z: number): V3 => [r * Math.cos(a), y + r * Math.sin(a), z];
  const worldLathe = (prof: [number, number][], segs = 48) => { const g = yToZ(lathe(prof, segs)); g.translate(0, y, 0); return g; };
  const slots = (n: number, zc: number, ang0: number, sx: number, sy: number, sz: number, r: number) => {
    const cuts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < n; i++) cuts.push(fanBox(sx, sy, sz, r, zc, ang0 + (i / n) * Math.PI * 2));
    return cuts;
  };
  const boltAng = 0.6;
  // Rectifier / slip-ring shield (engine side). Smaller windows so the diode plates and brush block read as a face.
  p.add(csgSub(
    worldLathe([[20, 164], [54, 164], [58, 170], [58, 206], [54, 210], [24, 210], [20, 204], [16, 168], [16, 164]], 64),
    ...slots(4, 186, boltAng + Math.PI / 4, 34, 16, 18, 40),
  ), 'machinedAlu');
  // Drive-end shield (pulley side): the bright cast face, with six long cooling slots.
  p.add(csgSub(
    worldLathe([[18, 228], [52, 228], [58, 234], [58, 258], [54, 264], [28, 266], [16, 266], [14, 250], [18, 244], [18, 228]], 64),
    ...slots(6, 246, boltAng, 42, 14, 22, 36),
  ), 'machinedAlu');
  // Short laminated waist, inset so the shields — not the windings — own the silhouette.
  const st: [number, number][] = [[48, 210]];
  for (let z = 212; z <= 226; z += 2.2) st.push([53.4, z], [53.4, z + 0.35], [51.6, z + 0.6], [51.6, z + 1.7]);
  st.push([48, 228], [48, 210]);
  p.add(yToZ(lathe(st, 72)), 'darkSteel', [0, y, 0]);
  // Copper only inside the window band (does not form the outer diameter).
  p.add(yToZ(lathe([[28, 176], [40, 182], [47, 190], [47, 252], [40, 258], [28, 258], [26, 220], [28, 176]], 40)), 'copper', [0, y, 0]);
  // rectifier: two flat horseshoe diode plates on the slip-ring face, buttons, brush block, studs
  const horse = (a0: number) => {
    const R = 34, ri = 15, sweep = 2.15;
    const a1 = a0 + sweep;
    const sh = new THREE.Shape();
    sh.moveTo(R * Math.cos(a0), R * Math.sin(a0));
    sh.absarc(0, 0, R, a0, a1, false);
    sh.lineTo(ri * Math.cos(a1), ri * Math.sin(a1));
    sh.absarc(0, 0, ri, a1, a0, true);
    sh.closePath();
    const g = extrude(sh, 4.2);
    g.translate(0, y, 159.2);
    return g;
  };
  p.add(horse(-2.55), 'zincPlate');
  p.add(horse(0.55), 'zincPlate');
  for (const a0 of [-2.55, 0.55]) {
    for (let k = 0; k < 3; k++) {
      const a = a0 + 0.45 + k * 0.6;
      p.add(yToZ(cyl(2.6, 3.4, 12)), 'darkSteel', at(25, a, 156.4));
    }
  }
  p.add(boxMM([-12, y - 13, 152], [12, y + 13, 168.4]), 'blackPlastic');
  p.add(yToZ(cyl(9, 7, 16)), 'blackPlastic', [0, y, 155.5]);
  // stud the ground strap leaves from, on the right-hand slip-ring face, plus two neighbours
  p.add(yToZ(cyl(3.2, 9, 10)), 'brass', [52, y - 18, 178]);
  p.add(yToZ(cyl(2.4, 8, 8)), 'brass', [-18, y - 28, 160]);
  p.add(yToZ(cyl(2.4, 8, 8)), 'brass', [20, y - 26, 160]);
  // four through-bolts, heads on both ends
  for (const a of [boltAng, boltAng + Math.PI / 2, boltAng + Math.PI, boltAng + 1.5 * Math.PI]) {
    p.add(yToZ(cyl(2.6, 92, 8)), 'steel', at(50, a, 213));
    p.add(yToZ(hexNut(8, 4)), 'zincPlate', at(50, a, 165));
    p.add(yToZ(hexNut(8, 4)), 'zincPlate', at(50, a, 260));
  }
  // keyed shaft: includes z 289 (nut thread) and ends at 312, short of the nut face at 313
  p.add(yToZ(cyl(11, 64, 20)), 'steel', [0, y, 280]);
  return p.g;
}
export function fanPulley() {
  // Removable OUTER half of the 82 mm split pulley, five 0.5 mm shims between the halves, one outside, cupped cap.
  // The inner flank lives on fan-hub. Valley of the V is at z 303. Nut face is the cap at z 313.
  const p = new Part();
  const y = FAN.y;
  const outer: [number, number][] = [
    [33, 299.4], [36, 303], [41, 307.6], [41, 311], [34, 311], [33, 306.5], [33, 299.4],
  ];
  p.add(yToZ(lathe(outer, 48)), 'yellowZinc', [0, y, 0]);
  for (let i = 0; i < 5; i++) {
    const z = 296.25 + i * 0.55;
    p.add(yToZ(lathe([[16, z], [27, z], [27, z + 0.5], [16, z + 0.5]], 28)), 'yellowZinc', [0, y, 0]);
  }
  p.add(yToZ(lathe([[15, 311.2], [23, 311.2], [23, 311.7], [15, 311.7]], 24)), 'yellowZinc', [0, y, 0]);
  // cupped cap: flat nut face exactly at z 313 out past the M16 washer (rho 17), nothing proud of it
  const cap: [number, number][] = [
    [8, 311.9], [16, 311.5], [21, 311.9], [21, 313], [8, 313],
  ];
  p.add(yToZ(lathe(cap, 32)), 'yellowZinc', [0, y, 0]);
  return p.g;
}
export function crankPulley() {
  // 930/04 US, no A/C: one V-groove pressed-steel dish, OD 134 (lip r 67). The belt
  // pitch is FAN.rCrankPulley − 5 = 60, in the valley at z FAN.zBelt. Hub recess still
  // presents a washer face at z 324 for the pulley bolt.
  const p = new Part();
  // Groove is wide enough for the 9.5 mm belt (mesh spans about z 298–308, r 55–65).
  const prof: [number, number][] = [
    [6.6, 290],
    [46, 290],
    [67, 294],
    [67, 296],
    [54, 300],
    [54, 306],
    [67, 310],
    [67, 312],
    [58, 315],
    [58, 316.6],
    [48, 319.2],
    [48, 320.6],
    [38, 323],
    [38, 324.4],
    [28, 327],
    [22, 329.4],
    [17.6, 331],
    [17.6, 322.2],
    [6.6, 322.2],
  ];
  const body = yToZ(lathe(prof, 72));
  const notch = boxMM([-1.2, 64, 294], [1.2, 70, 312]);
  p.add(csgSub(body, notch), 'yellowZinc');
  // concentric pressed rings on the dish (the lathe steps, plus a bright bead on each)
  for (const [r, z] of [[58, 315.8], [48, 319.8], [38, 323.6]] as [number, number][]) {
    p.add(yToZ(lathe([[r - 1.3, -0.45], [r + 0.4, -0.15], [r + 0.4, 0.35], [r - 1.3, 0.55]], 64)), 'yellowZinc', [0, 0, z]);
  }
  // recessed hub: washer face exactly at z 324, normal +Z, bore for the M12 bolt
  p.add(extrude(ringShape(16.8, 6.6), 1.15), 'yellowZinc', [0, 0, 322.85]);
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
/**
 * Upper air guide (105-05 #1): roof over the case and the two sloped wings ending inboard of the cam housings
 * (the cam housings and valve covers stay outside the shroud, as on the car), outer skirts with injector holes and a
 * screw lip, flywheel-end plate beyond cylinders 3/6, cut-out round the distributor and breather, and a round collar
 * that wraps the engine side of the fan housing.
 */
/** Collar bolt tabs (bolts into the fan-housing front lip at r 132). */
export const SHROUD_TAB = { z0: 197, z1: 204.9, a: [-Math.PI / 2 - 0.3, -Math.PI / 2 + 0.3, -Math.PI / 2 + 0.95, -Math.PI / 2 + 1.12] };
export const SHROUD = { zA: -200, zB: 192, t: 3.5, ax: 95, ay: 150, bx: 252, by: 130, skirtY: 102, lipW: 12 };
const smooth01 = (t: number) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };
/**
 * One skin: the flat roof eases into a horn whose mouth is a short sleeve on the fan axis,
 * wrapped around the housing barrel just engine-side of the band clamp (z 238).
 * Profile leaves the roof horizontally and is on the sleeve circle before the housing flange.
 * Both sides meet on the crown, above the throttle. The left side stays outboard of the cap.
 */
function addFanMouth(p: Part) {
  const roofY = SHROUD.ay + SHROUD.t + 0.8;
  const RIM = 146;
  const zHorn1 = 214;
  const zS1 = 232; // short of the band-clamp screw boss (z 236)
  const Yf = FAN.y;
  const crownY = Yf + RIM + 2; // top of the mouth, shared by both sides
  const wingY = (x: number) => {
    const uu = (Math.abs(x) - SHROUD.ax) / (SHROUD.bx - SHROUD.ax);
    const top = SHROUD.ay + SHROUD.t;
    return top + (SHROUD.by + SHROUD.t - top) * Math.max(0, Math.min(1, uu));
  };
  // s=0 on the shroud beside the fan, s=1 at the shared crown (0, crownY, ~206).
  const profile = (s: number, side: number): [number, number, number] => {
    if (side > 0) {
      const z = 148 + 58 * smooth01(Math.min(1, s / 0.7));
      const y = roofY + (crownY - roofY) * smooth01(Math.max(0, (s - 0.12) / 0.68));
      const xIn = smooth01(Math.max(0, (s - 0.58) / 0.42));
      return [100 * (1 - xIn), y, z];
    }
    const y0 = wingY(-200) + 0.6;
    const z = 168 + 38 * smooth01(Math.min(1, s / 0.62));
    const y = y0 + (crownY - y0) * smooth01(Math.max(0, (s - 0.22) / 0.58));
    const xIn = smooth01(Math.max(0, (s - 0.48) / 0.52));
    return [-200 * (1 - xIn), y, z];
  };
  for (const off of [1.8, -1.8]) {
    const R = RIM + off;
    p.add(paramSurface((u, v) => {
      const a = u * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const mx = R * ca, my = Yf + R * sa;
      const skirt = smooth01((0.02 - sa) / 0.24);
      const s = Math.min(1, Math.max(0, sa) / 0.98);
      // ca==0 (the crown and the bottom) uses the right profile so the two halves meet.
      const [px, py, pz] = profile(s, ca < 0 ? -1 : 1);
      const xr = px + (mx - px) * skirt;
      const yr = py + (my - py) * skirt;
      const zr = pz + (220 - pz) * skirt;
      const sleeveAt = 0.72;
      if (v >= sleeveAt) {
        const t = (v - sleeveAt) / (1 - sleeveAt);
        return [mx, my, zHorn1 + (zS1 - zHorn1) * t];
      }
      const ts = smooth01(v / sleeveAt);
      const z = zr + (zHorn1 - zr) * ts;
      let x = xr + (mx - xr) * ts;
      let y = yr + (my - yr) * ts;
      if (z >= zHorn1 - 0.5) { x = mx; y = my; }
      return [x, y, z];
    }, 160, 80, true), 'shroudRed');
  }
}
/** Clearance around the distributor: cap Ø70 + 3 mm, towers, housing, and the shallow can. */
function distClearanceCuts(): THREE.BufferGeometry[] {
  const along = (y0: number, y1: number, r: number) => cylBetween(distW(0, y0, 0), distW(0, y1, 0), r, 20);
  const can = cylBetween(distW(26, 152, 2), distW(54, 152, 2), 30, 16);
  return [along(40, 100, 36), along(102, 170, 32), along(168, 220, 41), along(204, 252, 29), can];
}
export function upperAirGuide() {
  const p = new Part();
  const { zA, zB, t, ax, ay, bx, by, skirtY, lipW } = SHROUD; const len = zB - zA;
  const roof = roundRect(190, len, 6);
  const rg = extrude(roof, t); rg.rotateX(Math.PI / 2); rg.translate(0, ay + t, (zA + zB) / 2);
  // Contoured distributor opening (follows the cap, towers and can), plus the breather neck and the plenum foot.
  const distCuts = distClearanceCuts(), brCut = boxMM([-70, 142, 168], [-40, 176, 200]);
  // Fan-end of the flat plate meets the alternator. The horn replaces that patch; the cut stays
  // inside the alternator so the roof still runs out to the bell.
  // Slot over the warm-up regulator so the two top fuel ports (107-10 #52/#59) and their nuts clear the roof.
  // Stop at z −128: the cover plate (x 50, z −120) and the stopper (x −50, z −125) still sit on the plate.
  p.add(csgSub(rg, ...distCuts, brCut, boxMM([-94, 140, -210], [94, 172, -128]), boxMM([-60, 148, 162], [60, 172, 198])), 'shroudRed');
  const slopeLen = Math.hypot(bx - ax, by - ay), ang = Math.atan2(by - ay, bx - ax);
  for (const s of [1, -1] as const) {
    const zs = s > 0 ? [CYL_Z[1], CYL_Z[2], CYL_Z[3]] : [CYL_Z[4], CYL_Z[5], CYL_Z[6]];
    const wing = new THREE.Shape();
    wing.moveTo(0, zA); wing.lineTo(slopeLen, zA); wing.lineTo(slopeLen, zB - 20); wing.lineTo(0, zB); wing.closePath();
    const sAt = (INTAKE_PORT.x - ax) / Math.cos(ang);
    // Elongated rounded openings. absellipse stays valid where a polyline hole would cross the wing edge.
    for (const zc of zs) {
      const h = new THREE.Path();
      h.absellipse(sAt, zc, 34, 34, 0, Math.PI * 2, true, 0);
      wing.holes.push(h);
    }
    const wg = extrude(wing, t);
    const u = new THREE.Vector3(Math.cos(ang) * s, Math.sin(ang), 0), e = new THREE.Vector3(0, 0, 1), n = new THREE.Vector3().crossVectors(u, e);
    wg.applyMatrix4(new THREE.Matrix4().makeBasis(u, e, n).setPosition(ax * s, ay, 0));
    // injector clearance bores along each injector axis (wing + skirt + window rims)
    const injCuts = zs.map((zc) => { const P = new THREE.Vector3(s * (INTAKE_PORT.x + INJ.dx), INTAKE_PORT.y + INJ.dy, zc), d = new THREE.Vector3(s * INJ.ux, INJ.uy, 0); return cylBetween(P.clone().addScaledVector(d, -8).toArray() as V3, P.clone().addScaledVector(d, 150).toArray() as V3, 28, 16); });
    const runnerCuts = runnerTunnelCutters(s);
    // Wing, skirt and lip all get the same opening. The runner and the injector boss cross the outer edge together.
    // Inboard edge stays outside x = ±170 so the ignition-lead holders (probed at |x| 160) still find the wing.
    const skirtWindows = zs.map((zc) => boxMM([s > 0 ? bx - 78 : -bx - 16, 64, zc - 72], [s > 0 ? bx + 16 : -bx + 78, 188, zc + 72]));
    const up = n.clone().negate();
    for (const zc of zs) {
      const outer = new THREE.Shape();
      outer.absellipse(sAt, zc, 39, 43, 0, Math.PI * 2, false, 0);
      const inner = new THREE.Path();
      inner.absellipse(sAt, zc, 35, 39, 0, Math.PI * 2, true, 0);
      outer.holes.push(inner);
      const rim = extrude(outer, 2.2);
      rim.applyMatrix4(new THREE.Matrix4().makeBasis(u, e, up).setPosition(ax * s, ay, 0));
      p.add(csgSub(rim, ...injCuts, ...runnerCuts, ...skirtWindows), 'shroudRed');
    }
    // Lengthen each round hole into a stadium: a slot along Z through the wing, narrower than the hole so the ends stay round.
    const slots = zs.map((zc) => {
      const c = new THREE.Vector3(s * INTAKE_PORT.x, ay + sAt * Math.sin(ang), zc);
      const g = new THREE.BoxGeometry(52, 28, 72);
      g.applyMatrix4(new THREE.Matrix4().makeBasis(u, n, e).setPosition(c.x, c.y, c.z));
      return g;
    });
    p.add(csgSub(wg, ...(s < 0 ? distCuts : []), ...injCuts, ...runnerCuts, ...slots, ...skirtWindows), 'shroudRed');
    // outer skirt (YZ plate at x = bx) with a hole round each injector, inward screw lip at the bottom
    const sk = new THREE.Shape(); sk.moveTo(skirtY, zA); sk.lineTo(by + 1, zA); sk.lineTo(by + 1, zB - 20); sk.lineTo(skirtY, zB - 20); sk.closePath();
    const injY = INTAKE_PORT.y + INJ.dy + ((bx - (INTAKE_PORT.x + INJ.dx)) / INJ.ux) * INJ.uy;
    for (const zc of zs) sk.holes.push(circlePath(30, injY, zc) as THREE.Path);
    p.add(csgSub(swapSkirt(sk, t, s, bx), ...injCuts, ...runnerCuts, ...skirtWindows), 'shroudRed');
    // screw lip, notched round each intake runner
    const lipCuts = zs.map((zc) => boxMM([s > 0 ? bx - lipW - 1 : -bx - 1, skirtY - 1, zc - 18], [s > 0 ? bx + 1 : -bx + lipW + 1, skirtY + t + 1, zc + 18]));
    p.add(csgSub(boxMM([s > 0 ? bx - lipW : -bx, skirtY, zA], [s > 0 ? bx : -bx + lipW, skirtY + t, zB - 20]), ...lipCuts, ...runnerCuts), 'shroudRed');
    for (const zr of s > 0 ? [-150, -30, 90] : [-185, -90, 30]) p.add(cylBetween([(ax + 10) * s, ay + 4, zr], [(bx - 10) * s, by + 4 + 2, zr], 2.2, 6), 'shroudRed');
  }
  // flywheel-end plate beyond the last cylinders
  const fp = polyShape([[-bx, skirtY], [-110, skirtY], [-110, 132], [110, 132], [110, skirtY], [bx, skirtY], [bx, by + 2], [ax, ay + t], [-ax, ay + t], [-bx, by + 2]]);
  p.add(extrude(fp, t), 'shroudRed', [0, 0, zA - t]);
  // Horn: roof, sides and the round mouth are one skin. The mouth sleeves the housing barrel
  // just engine-side of the band clamp.
  addFanMouth(p);
  for (const a of SHROUD_TAB.a) p.add(yToZ(cyl(9, SHROUD_TAB.z1 - SHROUD_TAB.z0, 16)), 'shroudRed', [132 * Math.cos(a), FAN.y + 132 * Math.sin(a), (SHROUD_TAB.z0 + SHROUD_TAB.z1) / 2]);
  // raised centre boss on the roof
  p.add(lathe([[0.1, 0], [16, 0], [24, 3.5], [24, 8], [18, 10.5], [0.1, 10.5]], 28), 'shroudRed', [0, 153.5, -22]);
  // Clip at the left pulley-end bay edge. Coil lead and primary end in the slot, clear of the steel.
  // Bay-edge clip, outboard of the plug-lead bundle. Coil and primary end in the slot.
  p.add(boxMM([-312, 154, 178], [-260, 158, 200]), 'steel');
  p.add(boxMM([-312, 158, 178], [-304, 180, 200]), 'steel');
  p.add(boxMM([-268, 158, 178], [-260, 180, 200]), 'steel');
  // Strap back onto the left skirt so the clip is not floating past the sheet.
  p.add(boxMM([-264, 148, 184], [-236, 156, 196]), 'steel');
  // hot air outlet socket (#4) on the end plate, left, with its flange
  p.add(yToZ(lathe([[30, 0], [34, 0], [34, 40], [30, 40]], 32)), 'shroudRed', [-170, 118, zA - t - 40]);
  p.add(yToZ(lathe([[30, 0], [44, 0], [44, 2], [30, 2]], 32)), 'shroudRed', [-170, 118, zA - t - 2]);
  // Pocket over the oil cooler (right deck, flywheel end). Air from the shroud
  // tunnel drops through this opening onto the fins. The cap closes the outside.
  subtractSolids(p.g, [boxMM([103, 70, -212], [262, 175, -146])]);
  return p.g;
}
function swapSkirt(sk: THREE.Shape, t: number, s: 1 | -1, bx: number) {
  // shape (u = engine y, v = engine z) extruded along engine x
  const g = extrude(sk, t);
  g.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));
  g.translate(s > 0 ? bx - t : -bx, 0, 0);
  return g;
}

// ---------------------------------------------------------------- 104-00 lubrication: crankcase oil cooler
/**
 * 911 107 041 00 on the RIGHT case half, flywheel end. The mount face is the
 * deck plane x = 103 (normal +X). The core runs outboard (+X), parallel to
 * the cylinders, in the pocket between cyl 3 (fins end z −146) and the ring
 * gear (starts z −213). Air through the fins is top to bottom (−Y).
 *
 * Real core is 195 (X) × 140 (Y) × 80 (Z). This model's cyl-3-to-ring gap is
 * only about 65 mm, against about 100 mm on the car, so a real 80 mm depth
 * hits the flywheel and Top End's cam housing, cover, cam and banjo. The
 * model-fit envelope is x 103–248, y −62..78, z −210..−150: core about
 * 137 × 140 × 60, real height kept, depth and length shortened. Do not grow
 * it until that gap is opened — other teams own those parts.
 *
 * Studs and ports are [y, z]. The case pad in core.ts uses the same numbers.
 * The third port number is 1 for the 26×19 ring (104-00 #2) and 0 for a
 * 22×17 (104-00 #3).
 */
const BEHR: Record<string, [number, number, number, number][]> = {
  B: [[0, 0, 0, 6], [0, 6, 3, 6], [3, 6, 4, 5], [4, 5, 4, 3.4], [4, 3.4, 3, 3], [3, 3, 0, 3], [0, 0, 3, 0], [3, 0, 4, 1], [4, 1, 4, 2.6], [4, 2.6, 3, 3]],
  E: [[4, 0, 0, 0], [0, 0, 0, 6], [0, 6, 4, 6], [0, 3, 3, 3]],
  H: [[0, 0, 0, 6], [4, 0, 4, 6], [0, 3, 4, 3]],
  R: [[0, 0, 0, 6], [0, 6, 3, 6], [3, 6, 4, 5], [4, 5, 4, 3.4], [4, 3.4, 3, 3], [3, 3, 0, 3], [2, 3, 4, 0]],
};
export const OIL_COOLER = {
  /** Case spot face, and the flange's inboard face. The pad ends on this plane. */
  faceX: 103,
  /** Flange thickness along +X. Nut face is faceX + foot. */
  foot: 8,
  /** Upright flange, about 160 tall, as deep as the core. Four studs in the corners. */
  fy0: -72, fy1: 88,
  fz0: -210, fz1: -150,
  /**
   * Core inside the model-fit envelope. Long axis +X (137 mm outboard of the
   * 8 mm flange), height the real 140, depth 60 instead of the real 80.
   */
  y0: -62, y1: 78,
  z0: -210, z1: -150,
  /** Outboard end plate. Envelope stops at x 248 so the cam housing (x 262) stays clear. */
  x1: 248,
  /** Four corner studs, two upper and two lower. [y, z]. Same as the case pad. */
  studs: [[72, -198], [72, -162], [-56, -198], [-56, -162]] as [number, number][],
  /**
   * Ports in the flange face. [y, z, big]. Two upper (#3) side by side along Z,
   * one lower (#2). Same numbers as the case pad.
   */
  ports: [[20, -191, 0], [20, -169, 0], [-30, -180, 1]] as [number, number, number][],
  /** Plates in the X-Y plane, stacked along Z. Pitch about 2.6 mm. */
  finPitch: 2.6,
};
export function oilCooler() {
  const p = new Part();
  const C = OIL_COOLER;
  const yMidF = (C.fy0 + C.fy1) / 2, zMidF = (C.fz0 + C.fz1) / 2;
  // Separate end flange. rotateY(+90) sends shape +X to world −Z, so a hole's
  // shape-x is zMidF − worldZ. Inboard face lands on x = faceX.
  // Bearing probe sits at r 5.2, so each stud hole stays under that.
  const plate = roundRect(C.fz1 - C.fz0, C.fy1 - C.fy0, 8);
  for (const [y, z] of C.studs) plate.holes.push(circlePath(4.8, zMidF - z, y - yMidF) as THREE.Path);
  for (const [y, z, big] of C.ports) plate.holes.push(circlePath(big ? 9.7 : 8.7, zMidF - z, y - yMidF) as THREE.Path);
  p.add(extrudeC(plate, C.foot).rotateY(Math.PI / 2), 'castAlu', [C.faceX + C.foot / 2, yMidF, zMidF]);
  // Header just outboard of the flange. Pockets leave the M8 nuts in open air.
  const xFace = C.faceX + C.foot, xNut = xFace + 16, xSkin = C.x1 - 2.2;
  const header = boxMM([xFace, C.y0, C.z0], [xNut, C.y1, C.z1]);
  const pockets = C.studs.map(([y, z]) => {
    const g = cyl(10, 28, 16);
    g.rotateZ(Math.PI / 2);
    g.translate((xFace + xNut) / 2, y, z);
    return g;
  });
  const bigPort = C.ports.find((q) => q[2] === 1)!;
  // Chase so the return elbow can leave the lower port without sitting in the header.
  const chase = cylBetween([xFace + 2, bigPort[0], bigPort[1]], [xFace + 10, C.y0 - 8, bigPort[1]], 9, 12);
  p.add(csgSub(header, ...pockets, chase), 'castAlu');
  // Smooth side panels on ±Z (the tanks). Fins are X-Y plates stacked along Z,
  // so the air path is top to bottom and the side faces stay closed.
  const zTank = 5;
  for (const [z0, z1] of [[C.z0, C.z0 + zTank], [C.z1 - zTank, C.z1]] as [number, number][]) {
    p.add(boxMM([xNut - 1, C.y0, z0], [xSkin, C.y1, z1]), 'castAlu');
  }
  const plateT = 1.5;
  const zFin0 = C.z0 + zTank - 0.2, zFin1 = C.z1 - zTank + 0.2;
  for (let z = zFin0; z + plateT < zFin1; z += C.finPitch) {
    p.add(boxMM([xNut, C.y0 + 1.4, z], [xSkin - 0.3, C.y1 - 1.4, z + plateT]), 'machinedAlu');
  }
  // Outboard end plate.
  p.add(boxMM([C.x1 - 2.2, C.y0 + 3, C.z0 + 2], [C.x1, C.y1 - 3, C.z1 - 2]), 'castAlu');
  // BEHR stamp on the outboard end plate. From +X with up = +Y, screen-right is −Z,
  // so the letters run toward −Z and read BEHR. Centred on the end-plate centroid
  // so the extra verts don't tilt the core axis.
  const sc = 1.35, adv = 6.2 * sc;
  const wordW = 3 * adv + 4 * sc, wordH = 6 * sc;
  const zLeft = -180 + wordW / 2, yBot = 8 - wordH / 2, xStamp = C.x1 + 0.6;
  for (const [i, ch] of [...'BEHR'].entries()) {
    for (const [ax, ay, bx, by] of BEHR[ch]) {
      const zA = zLeft - (i * adv + ax * sc), yA = yBot + ay * sc;
      const zB = zLeft - (i * adv + bx * sc), yB = yBot + by * sc;
      p.add(cylBetween([xStamp, yA, zA], [xStamp, yB, zB], 0.45, 5), 'machinedAlu');
    }
  }
  // Ø14 return along the bottom face. Centre y −73 puts the crown at y −66,
  // under the heat-exchanger port plane (y −64). Spigot points +X.
  const big = bigPort;
  const ty = -73, tz = big[1];
  p.add(cylBetween([xFace + 1, big[0], tz], [xFace + 12, ty, tz], 6.2, 12), 'castAlu');
  // Stop short of the cam housing (x 262) so the spigot stays in the pocket.
  p.add(cylBetween([xFace + 8, ty, tz], [C.x1 + 4, ty, tz], 7, 16), 'castAlu');
  p.add(cylBetween([C.x1 - 2, ty, tz], [C.x1 + 2, ty, tz], 7.6, 12), 'castAlu');
  return p.g;
}
/**
 * Cap 911 106 406 00 (105-05 #3) over the cooler pocket. With the shroud on,
 * this is the piece that shows; the fins stay inside the opened air guide.
 * The lip and the flywheel panel are the seats the shroud screws lost when
 * the pocket was opened. Keep those faces exactly on the old screw stations.
 */
export function oilCoolerCap() {
  const p = new Part();
  // Top of the pocket. Inset from the shroud cut (x 103–262, z −212..−146) by more than 2 mm.
  p.add(boxMM([124, 132, -204], [256, 140, -154]), 'shroudRed');
  // Outer cheek, in the opened skirt, clear of the lip-screw washer (reaches x ≈ 251.5).
  p.add(boxMM([258, 108, -206], [260, 134, -154]), 'shroudRed');
  // Lip for the right skirt screw at z −185 and its speed nut. Top is y 105.5, underside y 102.
  // Clearance hole (shank r 3) so the screw seats on the lip instead of burying in the 3.5 mm sheet.
  const lip = boxMM([240, 102, -196], [252, 105.5, -174]);
  const lipHole = cyl(3.8, 8, 16);
  lipHole.translate(246, 103.75, -185);
  p.add(csgSub(lip, lipHole), 'shroudRed');
  // Speed nut just under the existing clip (that clip occupies y 101–102). The screw
  // stops inside the hole, so this nut is the thread the reach probe finds.
  const lipNut = cyl(7, 1.4, 16);
  lipNut.translate(246, 99.7, -185);
  const lipTap = cyl(2.3, 3, 12);
  lipTap.translate(246, 99.7, -185);
  p.add(csgSub(lipNut, lipTap), 'darkSteel');
  // Flywheel face for the end-plate screws that sat on the shroud plate (x 118, 170, 210, 244).
  const face = boxMM([108, 104, -203.5], [252, 128, -200]);
  const endXs = [118, 170, 210, 244];
  const endHoles = endXs.map((x) => {
    const g = cyl(3.8, 8, 16);
    g.rotateX(Math.PI / 2);
    g.translate(x, 116, -201.75);
    return g;
  });
  p.add(csgSub(face, ...endHoles), 'shroudRed');
  for (const x of endXs) {
    const nut = cyl(7, 1.6, 16);
    nut.rotateX(Math.PI / 2);
    nut.translate(x, 116, -198.3);
    const tap = cyl(2.3, 4, 12);
    tap.rotateX(Math.PI / 2);
    tap.translate(x, 116, -198.3);
    p.add(csgSub(nut, tap), 'darkSteel');
  }
  return p.g;
}
/**
 * Oil thermostat on TOP of the right case half at the pulley end.
 * seatY is the nut face (top of the flange). The case pad is at seatY − grip.
 * Three ears: 1978 PET 101-10 #41 is three M6 lock nuts (the two-bolt flange is post-63D).
 */
export const THERMO = {
  x: 88, z: 176, seatY: 118, grip: 8,
  // Ears sit outside the domed cap so an M6 washer (r 6.25) lands on a flat face.
  ears: [[18, 0], [4, 16], [6, -14]] as [number, number][],
};
export function oilThermostat() {
  const p = new Part();
  const { x, z, seatY, grip, ears } = THERMO;
  const yFlangeBot = seatY - grip;
  // rounded flange: disc plus three bolt ears. Cap stays under y 120 so it clears the
  // oil-pressure fitting banjo (seat y ~123) and the fan-shroud collar.
  p.add(cyl(14, grip, 40), 'machinedAlu', [x, yFlangeBot + grip / 2, z]);
  p.add(lathe([[0.1, 0], [7.5, 0], [6, 0.9], [0.1, 1.2]], 32), 'machinedAlu', [x, seatY - 0.15, z]);
  for (const [dx, dz] of ears) p.add(cyl(7.2, grip, 20), 'machinedAlu', [x + dx, yFlangeBot + grip / 2, z + dz]);
  // O-ring land, then a stepped cartridge. Rectangular windows face the pulley-end camera (+X / +Z).
  p.add(cyl(17.2, 6, 36), 'polishedSteel', [x, yFlangeBot - 3, z]);
  const yTop = yFlangeBot - 6;
  const band = (r: number, y0: number, y1: number, mat: 'polishedSteel' | 'darkSteel' | 'yellowZinc' = 'polishedSteel') =>
    p.add(cyl(r, y1 - y0, 36), mat, [x, (y0 + y1) / 2, z]);
  band(15.8, yTop - 5, yTop);
  const shell = cyl(15.2, 14, 36);
  shell.translate(x, yTop - 13, z);
  p.add(csgSub(
    shell,
    boxMM([x + 5.5, yTop - 18.5, z - 5.2], [x + 20, yTop - 7.5, z + 5.2]),
    boxMM([x - 20, yTop - 18.5, z - 5.2], [x - 5.5, yTop - 7.5, z + 5.2]),
    boxMM([x - 5.2, yTop - 18.5, z + 5.5], [x + 5.2, yTop - 7.5, z + 20]),
  ), 'polishedSteel');
  p.add(cyl(8.8, 12, 24), 'brass', [x, yTop - 13, z]);
  band(14.4, yTop - 22.5, yTop - 19.5, 'yellowZinc');
  // Stop above the pulley-end through-bolt (y 62, z 177).
  band(14.6, yTop - 32, yTop - 24, 'darkSteel');
  return p.g;
}
/** Breather tower on the left half: flange top y 132, two M6 nuts (101-10 #36 qty 2). */
export const BREATHER = { x: -50, seatY: 132, grip: 10, studs: [[-35, 122], [-35, 168]] as [number, number][] };
/** Clearance prism round the distributor cap (plan), height h centred at y. */
function distRelief(h: number, y: number) {
  const c = distW(0, 140, 0);
  return extrudeC(polyShape(circlePts(c[0], c[2], 34, 28)), h).rotateX(Math.PI / 2).translate(0, y, 0);
}
export function breatherLid() {
  const p = new Part();
  // flange in the XZ plane. extrude +Z, rotateX(-90) sends that thickness up; shape Y becomes −Z.
  // Ears stay outboard of the perimeter-nut heads (those reach x −28) and outside the distributor relief.
  const stud = BREATHER.studs;
  // Full-depth flange stays inboard of the shroud collar (at y 122 the collar wall is x ≈ −41)
  // and outboard of the perimeter-nut heads (they reach x −28).
  const outline = hull([
    ...circlePts(stud[0][0], -stud[0][1], 4.6, 10),
    ...circlePts(stud[1][0], -stud[1][1], 4.6, 10),
    ...circlePts(-36, -145, 4.6, 8),
  ]);
  const sh = polyShape(outline);
  const g = extrude(sh, BREATHER.grip);
  g.rotateX(-Math.PI / 2);
  g.translate(0, BREATHER.seatY - BREATHER.grip, 0);
  p.add(csgSub(g, distRelief(70, 145)), 'castAlu');
  // Foot under the tower, only the top 3 mm, where the collar wall has moved outboard.
  const tx = -50, tz = 186;
  const y0 = BREATHER.seatY;
  // Foot stays clear of the inner collar bolt (x −39, y 129, head out to z ~191).
  p.add(cyl(5.4, 2, 16), 'castAlu', [tx, y0 - 1, tz]);
  p.add(boxMM([-48, y0 - 2, 168], [tx, y0, 180]), 'castAlu');
  // Ribbed tower. Wide base and ribs begin above the collar bolt.
  p.add(cyl(7.4, 20, 22), 'castAlu', [tx, y0 + 16, tz]);
  p.add(lathe([[5.2, 0], [6.2, 2], [8.6, 8], [9.4, 12], [8.2, 18], [7.0, 24]], 20), 'castAlu', [tx, y0 + 4, tz]);
  for (const a of [-0.9, 0.5, 2.55, 3.5, 4.7]) {
    const rib = boxMM([-1.25, 10, 6.6], [1.25, 24, 10.6]);
    rib.rotateY(a);
    rib.translate(tx, y0, tz);
    p.add(rib, 'castAlu');
  }
  p.add(lathe([[6.4, 0], [7.6, 1.4], [5.2, 4.4], [1.8, 6.4], [0.1, 6.8]], 16), 'castAlu', [tx, y0 + 22, tz]);
  // Angled hose neck. Stops short of the fan housing (z 205) and the collar bolts (y ~129, z ~201).
  p.add(cylBetween([tx, y0 + 16, tz], [tx - 3, y0 + 24, tz + 6], 5.6, 14), 'castAlu');
  p.add(cylBetween([tx - 3, y0 + 24, tz + 6], [tx - 6, y0 + 30, tz + 10], 6.4, 12), 'castAlu');
  p.add(cylBetween([tx - 2, y0 + 20, tz + 3], [tx - 5, y0 + 28, tz + 8], 3.4, 10), 'bore');
  p.add(cylBetween([tx + 6, y0 + 8, tz - 3], [tx + 14, y0 + 10, tz - 1], 4.2, 12), 'castAlu');
  p.add(hexNut(10, 4), 'darkSteel', [tx + 14, y0 + 10, tz - 1]);
  p.add(boxMM([tx - 6, y0 + 5, tz - 12], [tx + 4, y0 + 8, tz - 3]), 'castAlu');
  return p.g;
}
/**
 * Raised trapezoidal bead along a horizontal path. `depth` is proud toward −Y
 * (the sump camera). Crown half-width `crown`, base half-width `halfW`.
 */
function raisedBead(path: V3[], halfW: number, crown: number, depth: number) {
  const N = path.length;
  const P = 4;
  const prof: [number, number][] = [[-halfW, 0], [-crown, depth], [crown, depth], [halfW, 0]];
  const pos: number[] = [];
  for (let i = 0; i < N; i++) {
    const p = new THREE.Vector3(...path[i]);
    const a = new THREE.Vector3(...path[Math.max(0, i - 1)]);
    const b = new THREE.Vector3(...path[Math.min(N - 1, i + 1)]);
    const t = b.sub(a); t.y = 0;
    if (t.lengthSq() < 1e-8) t.set(1, 0, 0);
    t.normalize();
    const side = new THREE.Vector3(-t.z, 0, t.x);
    for (const [s, u] of prof) pos.push(p.x + side.x * s, p.y - u, p.z + side.z * s);
  }
  const idx: number[] = [];
  for (let i = 0; i < N - 1; i++) {
    for (let k = 0; k < P - 1; k++) {
      const q = i * P + k;
      idx.push(q, q + P, q + 1, q + 1, q + P, q + P + 1);
    }
  }
  const cap = (i: number, flip: boolean) => {
    const b = i * P;
    idx.push(...(flip ? [b, b + 2, b + 1, b, b + 3, b + 2] : [b, b + 1, b + 2, b, b + 2, b + 3]));
  };
  cap(0, false);
  cap(N - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** Sump (strainer) cover. Nut face y = seatY, 12 M6 nuts at r 74 (101-05 #35 qty 12). */
export const SUMP = { seatY: -134, zc: -10, boltR: 74, grip: 6 };
export function sumpPlate() {
  const p = new Part();
  const yNut = SUMP.seatY, zc = SUMP.zc;
  // Flat field, raised rim, nut flange at axial 0. Negative axial is proud (toward the bottom camera).
  const dish = lathe([
    [0.1, -0.45], [48, -0.45], [52, -0.5], [56, -3.0], [61, -3.5], [65, -2.4],
    [68, 0], [80, 0], [80, 2.4], [68, 2.4], [62, 0.8], [52, 1.4], [16, 2.0], [0.1, 2.0],
  ], 80);
  p.add(dish, 'zincPlate', [0, yNut, zc]);
  // Sharp raised U. Feet sink 0.3 mm into the flat field so the walls emerge cleanly.
  // Crown is 5.5 mm proud, base 18 mm wide; opening toward +Z puts the plug in the notch.
  const Ru = 34, cz = zc - 12, a0 = 0.8, a1 = Math.PI * 2 - 0.8;
  const path: V3[] = [];
  for (let i = 0; i <= 48; i++) {
    const a = a0 + (a1 - a0) * (i / 48);
    path.push([Ru * Math.sin(a), yNut - 0.15, cz + Ru * Math.cos(a)]);
  }
  p.add(raisedBead(path, 9, 3.2, 5.8), 'zincPlate');
  // central drain boss + hex plug (911 107 176 03). Sealing ring sits at yNut − 9.
  p.add(cyl(11, 4, 24), 'zincPlate', [0, yNut - 5, zc]);
  p.add(hexNut(17, 7), 'darkSteel', [0, yNut - 9 - 3.5, zc]);
  // edge stack inside the case: lid gasket, strainer rim, second gasket. Screen is a coarse disc.
  p.add(lathe([[66, 0], [78, 0], [78, 0.7], [66, 0.7]], 64), 'gasket', [0, yNut + 3.1, zc]);
  p.add(lathe([[58, 0], [70, 0], [70, 1.1], [58, 1.1]], 48), 'darkSteel', [0, yNut + 4.2, zc]);
  p.add(lathe([[58, 0], [70, 0], [70, 0.7], [58, 0.7]], 48), 'gasket', [0, yNut + 5.5, zc]);
  for (let r = 14; r <= 54; r += 8) p.add(torus(r, 0.55, 4, 40).rotateX(Math.PI / 2), 'darkSteel', [0, yNut + 4.6, zc]);
  for (let i = 0; i < 12; i++) {
    const g = boxMM([-0.35, yNut + 4.1, -44], [0.35, yNut + 5.2, 0]);
    g.rotateY((i / 12) * Math.PI * 2);
    g.translate(0, 0, zc);
    p.add(g, 'darkSteel');
  }
  return p.g;
}
/**
 * Oil pump in the flywheel-end bay. The long axis is across the case (X): the bay between
 * the z −177 and z −118 webs is only ~37 mm deep, so a 2.2× body along Z will not fit.
 * coverFace is the flywheel face of the three mounting ears (oil-pump-nuts, n = −Z).
 * seals: four O-ring seats, [x, y, z]. The first is the large ring (104-00 #2);
 * the next two are 104-00 #3. The fourth is the extra 101-10 #24 ring.
 */
export const OIL_PUMP = {
  // Flywheel face of the cover. M8 nuts stand ~8 mm proud toward −Z and must stay
  // pulley-side of the flywheel web (solid through z −169).
  coverFace: -158,
  // Ears break the body silhouette (side camera looks along −Z). All stay inboard of
  // the left relief piston and outside the cyl-6 cheek disc.
  studs: [[38, -56], [-10, -116], [30, -116]] as [number, number][],
  seals: [
    [-14, -64.8, -147],
    [24, -64.8, -147], [-16, -90, -157.2],
    [16, -88, -157.2],
  ] as [number, number, number][],
};
export function oilPump() {
  const p = new Part();
  // Bay between the z −177 web (face −169) and the z −118 web (face −132) is ~37 mm.
  // Long axis stays X. The casting is a tall slab in that bay, not a long tube along Z.
  const z0 = OIL_PUMP.coverFace, zc = -147;
  const section = (x0: number, x1: number, h: number, d: number, y: number, mat: 'castAlu' | 'machinedAlu') => {
    const g = extrude(roundRect(d, h, Math.min(5, d / 2 - 0.4)), x1 - x0);
    g.rotateY(Math.PI / 2);
    g.translate(x0, y, zc);
    p.add(g, mat);
  };
  // Scavenge (larger, −X) and pressure (+X). Tops share y −70. Bottom stays above the relief piston.
  section(-26, 6, 32, 20, -86, 'castAlu');
  section(8, 44, 28, 18, -84, 'castAlu');
  section(3, 11, 34, 20, -85, 'machinedAlu');
  for (const dz of [-7.2, -2.4, 2.4, 7.2]) {
    p.add(boxMM([-20, -70, zc + dz - 1.15], [40, -62.8, zc + dz + 1.15]), 'castAlu');
  }
  // Cover plate behind the body, plus three ears that stick out of the XY silhouette.
  // Nut face is z = coverFace. No bolts on the pressure-section end.
  const plate = polyShape(hull([
    [-24, -100], [-24, -72], [42, -72], [42, -100],
  ]));
  const cover = extrude(plate, 3.4);
  cover.translate(0, 0, z0);
  p.add(cover, 'machinedAlu');
  for (const [x, y] of OIL_PUMP.studs) {
    const ear = circleShape(11, x, y);
    ear.holes.push(circlePath(3.5, x, y) as THREE.Path);
    const g = extrude(ear, 3.4);
    g.translate(0, 0, z0);
    p.add(g, 'machinedAlu');
    p.add(cyl(3.5, 6, 12).rotateX(Math.PI / 2), 'bore', [x, y, z0 + 3]);
  }
  p.add(cyl(7.2, 5, 16), 'castAlu', [-14, -67.2, zc]);
  p.add(cyl(6.4, 5, 16), 'castAlu', [24, -67.2, zc]);
  for (const [x, y] of OIL_PUMP.seals.slice(2)) p.add(cyl(6.2, 2.2, 14).rotateX(Math.PI / 2), 'castAlu', [x, y, z0 + 1.1]);
  p.add(yToZ(cyl(8, 10, 16)), 'steel', [0, INT_SHAFT_Y, -134]);
  p.add(yToZ(cyl(6.2, 40, 16)), 'darkSteel', [0, INT_SHAFT_Y, -118]);
  for (let i = 0; i < 8; i++) {
    const g = boxMM([-0.6, 4.2, -3], [0.6, 7.6, 3]);
    g.rotateZ((i / 8) * Math.PI * 2);
    g.translate(0, INT_SHAFT_Y, -128);
    p.add(g, 'darkSteel');
  }
  // Pickup stays in the sump, inboard of the cylinder spigots (x < 60) and below the crank.
  // Same polyline as the case pocket in hollowCaseInterior.
  const bend: V3[] = [[32, -86, zc], [46, -98, zc], [48, -112, zc - 8], [24, -118, -148]];
  p.add(tube(bend, 5.2, 12, 32), 'castAlu');
  p.add(yToZ(cyl(7, 8, 16)), 'castAlu', [24, -118, -144]);
  return p.g;
}

// ---------------------------------------------------------------- 106-00 / 107 induction & CIS
/** Per-triangle normals, so a mating face erodes straight along itself and not into its neighbour. */
function faceNormals(g: THREE.BufferGeometry) {
  const ng = g.index ? g.toNonIndexed() : g;
  ng.deleteAttribute('normal');
  ng.computeVertexNormals();
  return ng;
}
/**
 * Vertices on the equator keep a horizontal normal. The neighbouring band's face normal tilts,
 * and a 1 mm erosion would walk that edge into the other half.
 */
function levelSeam(g: THREE.BufferGeometry) {
  const ng = faceNormals(g);
  const P = ng.attributes.position, N = ng.attributes.normal;
  const y0 = AIRBOX.yMid;
  // The first band of the ellipse sits about 9 mm off the equator. Level that whole band.
  for (let i = 0; i < P.count; i++) {
    if (Math.abs(P.getY(i) - y0) > 14) continue;
    const x = N.getX(i), z = N.getZ(i);
    const L = Math.hypot(x, z) || 1;
    N.setXYZ(i, x / L, 0, z / L);
  }
  return ng;
}
/** Point on an ellipse in the shape XY plane (shape X → world Z, shape Y → world Y). */
function ell(a: number, b: number, t: number): [number, number] {
  return [a * Math.cos(t), b * Math.sin(t)];
}
/** Half of a thick elliptical ring. Upper is t = 0…π. Equator lies on shape y = 0. */
function halfRing(aO: number, bO: number, aI: number, bI: number, upper: boolean) {
  const s = new THREE.Shape();
  const n = 28;
  const t0 = upper ? 0 : Math.PI;
  const t1 = upper ? Math.PI : Math.PI * 2;
  const p0 = ell(aO, bO, t0);
  s.moveTo(p0[0], p0[1]);
  for (let i = 1; i <= n; i++) {
    const p = ell(aO, bO, t0 + (t1 - t0) * (i / n));
    s.lineTo(p[0], p[1]);
  }
  for (let i = n; i >= 0; i--) {
    const p = ell(aI, bI, t0 + (t1 - t0) * (i / n));
    s.lineTo(p[0], p[1]);
  }
  s.closePath();
  return s;
}
function halfDisk(a: number, b: number, upper: boolean) {
  const s = new THREE.Shape();
  const n = 28;
  const t0 = upper ? 0 : Math.PI;
  const t1 = upper ? Math.PI : Math.PI * 2;
  s.moveTo(0, 0);
  for (let i = 0; i <= n; i++) {
    const p = ell(a, b, t0 + (t1 - t0) * (i / n));
    s.lineTo(p[0], p[1]);
  }
  s.closePath();
  return s;
}
/** Extrude a YZ profile along X and centre it on the canister. */
function alongCan(shape: THREE.Shape, x0: number, length: number) {
  const g = extrude(shape, length, 0, 2);
  g.rotateY(Math.PI / 2);
  g.translate(x0, AIRBOX.yMid, AIRBOX.z);
  return faceNormals(g);
}
/** Elliptical skin. Inner winding points into the cavity. Quads stay short so the collision test does not see a 440 mm triangle. */
function ovalSkin(upper: boolean, outer: boolean) {
  const A = AIRBOX;
  const a = outer ? A.a + A.wall : A.a;
  const b = outer ? A.b + A.wall : A.b;
  const lift = 0;
  const t0 = upper ? 0 : Math.PI;
  const nu = 24, nv = 16;
  const grid: V3[] = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const t = t0 + Math.PI * (outer ? j / nv : 1 - j / nv);
    const x0 = -A.half + 0.6, x1 = A.half - 0.6;
    grid.push([x0 + (x1 - x0) * (i / nu), A.yMid + lift + b * Math.sin(t), A.z - a * Math.cos(t)]);
  }
  const idx: number[] = [];
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a0 = j * (nu + 1) + i, b0 = a0 + 1, c0 = a0 + nu + 1, d0 = c0 + 1;
    const cx = (grid[a0][0] + grid[d0][0]) / 2;
    const cy = (grid[a0][1] + grid[d0][1]) / 2;
    const cz = (grid[a0][2] + grid[d0][2]) / 2;
    // Outlet bore in the lower skin. The neck flange covers the rim.
    if (!upper && cy < A.yMid - b + 12 && Math.hypot(cx - AIR_NECK.x, cz - AIR_NECK.z) < AIR_NECK.hole) continue;
    idx.push(a0, c0, b0, b0, c0, d0);
  }
  const pos: number[] = [];
  for (const p of grid) pos.push(p[0], p[1], p[2]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return levelSeam(g);
}
function ovalCap(upper: boolean, xSign: number) {
  const A = AIRBOX;
  const a = A.a + A.wall, b = A.b + A.wall;
  const x0 = xSign > 0 ? A.half : -A.half - A.wall;
  // Rim only, so the equator is a short edge rather than a fan of large triangles.
  const rim = levelSeam(alongCan(halfRing(a, b, Math.max(1, a - A.wall), Math.max(1, b - A.wall), upper), x0, A.wall));
  // Closing plate meets the rim. Its diameter lies on the equator; levelSeam keeps that edge from crossing.
  const plate = levelSeam(alongCan(halfDisk(a - A.wall - 1, b - A.wall - 1, upper), x0, A.wall));
  return { rim, plate };
}
/** Outer-shell bottom at this Z (straight section). */
function shellBottom(z: number) {
  const A = AIRBOX;
  const a = A.a + A.wall, b = A.b + A.wall;
  const u = Math.min(0.999, ((z - A.z) / a) ** 2);
  return A.yMid - b * Math.sqrt(1 - u);
}
export function plenum() {
  // Cast distributor plus the lower half of the oval air-cleaner canister.
  const p = new Part();
  p.addObj(buildPlenumBox());
  const A = AIRBOX;
  p.add(ovalSkin(false, true), 'blackPlastic');
  p.add(ovalSkin(false, false), 'blackPlastic');
  for (const s of [-1, 1] as const) {
    const cap = ovalCap(false, s);
    p.add(cap.rim, 'blackPlastic');
    p.add(cap.plate, 'blackPlastic');
  }
  // Lip whose top face is the seam. Same footprint as the lid lip, so the two faces meet.
  const aO = A.a + A.wall;
  for (const side of [-1, 1] as const) {
    const z0 = A.z + side * (aO + 1.2), z1 = A.z + side * (aO + A.lip);
    for (let k = 0; k < 8; k++) {
      const xa = -A.half + (2 * A.half * k) / 8, xb = -A.half + (2 * A.half * (k + 1)) / 8;
      p.add(faceNormals(boxMM([xa, A.yMid - A.lipT, Math.min(z0, z1)], [xb, A.yMid, Math.max(z0, z1)])), 'blackPlastic');
    }
  }
  // Neck tube up to the shell, flange seated on the outer bottom (same part; the bore clears the tube).
  const { x, z, r, flange } = AIR_NECK;
  const yB = shellBottom(z);
  p.add(cylBetween([x, BOX.y1 - 1, z], [x, yB, z], r, 24), 'blackPlastic');
  p.add(lathe([[r, 0], [flange, 0], [flange, 3.2], [r, 3.2]], 28).translate(x, yB - 3.2, z), 'blackPlastic');
  return p.g;
}
export function airFilter() {
  // 911 110 185 02 / Mahle LX 261: rectangular panel, orange urethane frame, pleated paper.
  const p = new Part();
  const L = airCleanerLayout();
  const A = AIRBOX;
  const x0 = -A.len / 2, x1 = A.len / 2, z0 = A.z - A.wid / 2, z1 = A.z + A.wid / 2;
  const rail = 11;
  const y0 = L.elemBottom, y1 = L.elemTop;
  p.add(boxMM([x0, y0, z0], [x1, y1, z0 + rail]), 'urethane');
  p.add(boxMM([x0, y0, z1 - rail], [x1, y1, z1]), 'urethane');
  p.add(boxMM([x0, y0, z0], [x0 + rail, y1, z1]), 'urethane');
  p.add(boxMM([x1 - rail, y0, z0], [x1, y1, z1]), 'urethane');
  const pleats = paramSurface((u, v) => {
    const x = x0 + rail + 2 + (A.len - 2 * rail - 4) * u;
    const z = z0 + rail + 2 + (A.wid - 2 * rail - 4) * v;
    const y = L.elemY + 5.5 * Math.sin(u * 36 * Math.PI);
    return [x, y, z];
  }, 72, 8);
  p.add(pleats, 'filterPaper');
  return p.g;
}
export function airCleanerLid() {
  // Upper oval half. The wall and the lip meet the lower half on the equator.
  const p = new Part();
  const A = AIRBOX;
  p.add(ovalSkin(true, true), 'blackPlastic');
  p.add(ovalSkin(true, false), 'blackPlastic');
  for (const s of [-1, 1] as const) {
    const cap = ovalCap(true, s);
    p.add(cap.rim, 'blackPlastic');
    p.add(cap.plate, 'blackPlastic');
  }
  const aO = A.a + A.wall;
  for (const side of [-1, 1] as const) {
    const z0 = A.z + side * (aO + 1.2), z1 = A.z + side * (aO + A.lip);
    for (let k = 0; k < 8; k++) {
      const xa = -A.half + (2 * A.half * k) / 8, xb = -A.half + (2 * A.half * (k + 1)) / 8;
      p.add(faceNormals(boxMM([xa, A.yMid, Math.min(z0, z1)], [xb, A.yMid + A.lipT, Math.max(z0, z1)])), 'blackPlastic');
    }
  }
  for (const x of [-150, -50, 50, 150]) for (const side of [-1, 1] as const) {
    const zLip = A.z + side * (A.a + A.wall + A.lip * 0.55);
    p.add(tube([
      [x - 7, A.yMid + 2.4, zLip],
      [x, A.yMid + 13, zLip + side * 5],
      [x + 7, A.yMid + 2.4, zLip],
    ], 1.15, 6, 10), 'steel');
  }
  const crown = A.yMid + A.b + A.wall;
  p.add(boxMM([-36, crown - 0.6, A.z - 14], [36, crown + 0.5, A.z + 14]), 'yellowZinc');
  // Intake snout on lid #14. The first sample sits in the cap; the rest of the tube is outside it.
  p.add(tube(airboxSnoutPoints(), SNOUT_R, 16, 24), 'blackPlastic');
  return p.g;
}
/** Warm-up regulator (107-10 #54) on the left case top near the flywheel end: flange, body, vacuum can, two screws. */
export const WUR = { flangeTop: 121.2, screws: [[-60, -188], [-60, -152]] as [number, number][] };
export function warmUpRegulator() {
  const p = new Part();
  p.add(boxMM([-70, WUR.flangeTop - 5, -195], [-50, WUR.flangeTop, -145]), 'zincPlate');
  p.add(boxMM([-74, WUR.flangeTop, -186], [-46, 142, -146]), 'zincPlate');
  p.add(cyl(11, 8, 20), 'zincPlate', [-60, 143, -170]);
  // Two pads on the top, either side of the dome, for the fuel ports (Kat 502 107-10 #52 and #59).
  // Outboard of the shroud end-plate screw at x −60 (shank tip z −193) and short of the dome (z −181).
  p.add(boxMM([-96, 130, -191], [-76, 134, -182]), 'zincPlate');
  p.add(boxMM([-74, 136, -156], [-48, 142, -126]), 'zincPlate');
  const [cx, cy, cz] = WUR_CONN.face;
  p.add(cylBetween([cx, 136, cz], [cx, cy, cz], 5.2, 12), 'brass');
  p.add(lathe([[4.4, 0], [7.4, 0], [7.4, 1.2], [4.4, 1.2]], 14).translate(cx, cy, cz), 'copper');
  return p.g;
}
/**
 * Four M8 nut seats (106-00 #24) in two pairs on the flywheel side of the lid.
 * Strut A (911 110 133 02) is the straight column. Strut B (911 110 269 00, tags -80) is the angled brace.
 * One bonded rubber buffer (911 110 154 00) sits on each strut.
 */
export const AIRBOX_STRUTS = [[-62, 258, -18], [-48, 258, -6], [52, 258, -18], [66, 258, -6]] as V3[];
function strutFoot(studs: V3[], yTop: number) {
  const xs = studs.map((s) => s[0]);
  const zs = studs.map((s) => s[2]);
  let foot: THREE.BufferGeometry = boxMM([Math.min(...xs) - 8, LID_Y, Math.min(...zs) - 8], [Math.max(...xs) + 8, yTop, Math.max(...zs) + 8]);
  for (const [x, , z] of studs) foot = csgSub(foot, cylBetween([x, LID_Y - 2, z], [x, yTop + 2, z], 5, 12));
  const sole = foot.index ? foot.toNonIndexed() : foot;
  sole.computeVertexNormals();
  return sole;
}
function bufferAt(p: Part, x: number, z: number, yMetal: number) {
  const top = Math.min(shellBottom(z - 8), shellBottom(z), shellBottom(z + 8));
  p.add(cylBetween([x, yMetal, z], [x, top - 6, z], 7, 14), 'rubber');
  const disk = extrude(circleShape(7), 3.2, 0, 8);
  disk.rotateX(-Math.PI / 2);
  disk.translate(x, top - 3.2, z);
  p.add(faceNormals(disk), 'rubber');
}
export function airboxStruts() {
  const p = new Part();
  const left = [AIRBOX_STRUTS[0], AIRBOX_STRUTS[1]];
  const right = [AIRBOX_STRUTS[2], AIRBOX_STRUTS[3]];
  p.add(strutFoot(left, 258), 'zincPlate');
  p.add(strutFoot(right, 258), 'zincPlate');
  // Straight strut, inboard of its two studs.
  const lx = -55, lz = -12;
  const lTop = shellBottom(lz);
  p.add(boxMM([lx - 3, 258, lz - 3], [lx + 3, lTop - 20, lz + 3]), 'zincPlate');
  bufferAt(p, lx, lz, lTop - 20);
  // Angled strut. Top stays flywheel of the air-guide clamp ring and pulley of the meter duct.
  const rx0 = 58, rz0 = -14;
  const rx1 = 68, rz1 = 2;
  const rTop = shellBottom(rz1);
  p.add(cylBetween([rx0, 258, rz0], [rx1, rTop - 22, rz1], 3.2, 12), 'zincPlate');
  bufferAt(p, rx1, rz1, rTop - 22);
  return p.g;
}

// ---------------------------------------------------------------- 901-00 ignition
/**
 * 930/04 distributor, left case, pulley end. The crank drive wheel is z 211–223.
 * `pinion` is the gear centre. `aim` only fixes the shaft direction (up, outboard,
 * slightly toward the flywheel) so the cap sits in the bay beside the fan housing.
 * Local +Y is the rotor axis. Local +X is outboard and a little toward the fan,
 * which is where the vacuum can points.
 */
export const DIST = {
  pinion: [-36.2, 26.5, 216] as V3,
  aim: [-150, 168, 150] as V3,
  shankR: 13.2,
  /** Local Y from the pinion centre along the shaft toward the cap. The case mouth is ~t 88. */
  mouthY: 92,
  clampY: 102,
  clampT: 4.5,
  /** Stud in the local XZ plane. +X is the vacuum-can side, matching 901-00. */
  stud: [28, 2] as [number, number],
  /** Cap top. Towers stand on this face. */
  towerY: 208,
  towerR: 16,
  /** Ø14 posts, 34 mm, with a flared tip. */
  towerH: 34,
};
const distOrigin = new THREE.Vector3(...DIST.pinion);
const distAxisV = new THREE.Vector3(...DIST.aim).sub(distOrigin).normalize();
/** Unit rotor axis, pinion toward the cap. */
export const DIST_AXIS: V3 = [distAxisV.x, distAxisV.y, distAxisV.z];
/** Local +Y → rotor axis, local +X → outboard / fan side. */
export const DIST_MAT = frame(distOrigin, distAxisV, new THREE.Vector3(-1, 0.08, 0.42));
export function distW(x: number, y: number, z: number): V3 {
  const v = new THREE.Vector3(x, y, z).applyMatrix4(DIST_MAT);
  return [v.x, v.y, v.z];
}
/**
 * Hose seat on the vacuum-can nipple. The nipple is on the can rim and points
 * along the rotor axis toward the cap (local +Y). Intake & Fuel's hose ends here.
 */
export const DIST_VAC_NIPPLE = {
  point: distW(39, 190, 2),
  dir: [DIST_MAT.elements[4], DIST_MAT.elements[5], DIST_MAT.elements[6]] as V3,
};
function bake(g: THREE.BufferGeometry) { return g.applyMatrix4(DIST_MAT); }
function holdDownLug(): THREE.BufferGeometry {
  const sx = DIST.stud[0], sz = DIST.stud[1];
  // Shape Y becomes −Z under rotateX(−90), so the stud's shape y is −sz.
  // The slot runs along the bisector of the fastener seat probes, so the M8
  // land (r 6.8) stays metal while the arm still reads as a timing slot.
  const n = distAxisV.clone();
  const ref = Math.abs(n.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(n, ref).normalize();
  const v = new THREE.Vector3().crossVectors(n, u).normalize();
  const bis = u.clone().add(v).normalize();
  const Xc = new THREE.Vector3(DIST_MAT.elements[0], DIST_MAT.elements[1], DIST_MAT.elements[2]);
  const Zc = new THREE.Vector3(DIST_MAT.elements[8], DIST_MAT.elements[9], DIST_MAT.elements[10]);
  let lx = bis.dot(Xc), lz = bis.dot(Zc);
  const ll = Math.hypot(lx, lz) || 1;
  lx /= ll; lz /= ll;
  // Prefer the end of the slot that points away from the shank.
  if (lx * sx + lz * sz < 0) { lx = -lx; lz = -lz; }
  const studSx = sx, studSy = -sz;
  const slotEnd: [number, number] = [sx + lx * 18, -(sz + lz * 18)];
  const dir = Math.atan2(studSy, studSx);
  const rIn = 14;
  const sh = polyShape(hull([
    ...circlePts(rIn * Math.cos(dir - 0.55), rIn * Math.sin(dir - 0.55), 3, 8),
    ...circlePts(rIn * Math.cos(dir + 0.55), rIn * Math.sin(dir + 0.55), 3, 8),
    ...circlePts(studSx, studSy, 13, 16),
    ...circlePts(slotEnd[0], slotEnd[1], 7, 12),
  ]));
  // Keyhole: round end under the nut, slot continuing out. Half-width 4.4 stays
  // off the four seat probes at r 6.8 (they sit 45° off this bisector).
  const slot = new THREE.Path();
  const ang = Math.atan2(slotEnd[1] - studSy, slotEnd[0] - studSx);
  const hw = 4.4;
  const px = Math.cos(ang + Math.PI / 2) * hw, py = Math.sin(ang + Math.PI / 2) * hw;
  slot.moveTo(studSx + px, studSy + py);
  slot.lineTo(slotEnd[0] + px, slotEnd[1] + py);
  slot.absarc(slotEnd[0], slotEnd[1], hw, ang + Math.PI / 2, ang - Math.PI / 2, true);
  slot.lineTo(studSx - px, studSy - py);
  slot.absarc(studSx, studSy, hw, ang - Math.PI / 2, ang + Math.PI / 2, true);
  slot.closePath();
  sh.holes.push(slot);
  const plate = extrude(sh, DIST.clampT);
  plate.rotateX(-Math.PI / 2);
  plate.translate(0, DIST.clampY - DIST.clampT, 0);
  return bake(plate);
}
/** Fan hub (105-00 #10): yellow-zinc face plate riveted to the fan, with the inner pulley half, 16-hole ring and boss. */
export function fanHub() {
  const p = new Part();
  const y = FAN.y;
  // steel sleeve on the alternator shaft, under the plate
  p.add(yToZ(lathe([[11.6, 250], [16, 250], [16, 268], [11.6, 268]], 24)), 'steel', [0, y, 0]);
  // Ø122 face plate. +Z face exactly at z 270 for the six fan nuts (r 52). Centre open so the 16-hole web shows.
  const plate = circleShape(61);
  plate.holes.push(circlePath(33) as THREE.Path);
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i / 6) * Math.PI * 2;
    plate.holes.push(circlePath(3.1, 52 * Math.cos(a), 52 * Math.sin(a)) as THREE.Path);
  }
  p.add(extrude(plate, 4), 'yellowZinc', [0, y, 266]);
  // web with 16 holes and the conical inner flank. Lip stops at z 296, clear of the belt (z ≥ ~298).
  const web = circleShape(30);
  web.holes.push(circlePath(13) as THREE.Path);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.05;
    web.holes.push(circlePath(2.15, 25 * Math.cos(a), 25 * Math.sin(a)) as THREE.Path);
  }
  p.add(extrude(web, 3.2), 'yellowZinc', [0, y, 270]);
  const inner: [number, number][] = [
    [14, 273], [28, 274], [41, 286], [41, 292], [37, 296], [33, 296], [26, 278], [14, 274],
  ];
  p.add(yToZ(lathe(inner, 48)), 'yellowZinc', [0, y, 0]);
  // keyed boss in the bore
  p.add(boxMM([10, y - 3.2, 272], [16, y + 3.2, 278]), 'yellowZinc');
  return p.g;
}
export function distributor() {
  const p = new Part();
  // Helical pinion (901-00 #36, CCW 930 602 422 03). Three slices, a small twist, tip r 12.
  // Centre distance to the crank wheel (tip r 32.4) is 44.9 mm, so the tips stay 0.5 mm apart.
  for (let i = 0; i < 3; i++) {
    const slice = extrude(gearShape(14, 9.4, DIST_PINION_TIP, 5), 2.5);
    slice.rotateX(-Math.PI / 2);
    slice.translate(0, 0.4 + i * 2.35, 0);
    slice.rotateY((i - 1) * 0.14);
    p.add(bake(slice), 'bronze');
  }
  p.add(bake(lathe([[4.6, 0], [4.6, 10]], 16)), 'steel');
  // Pinion pin (901-00 #35, 930 602 922 00) across the gear.
  p.add(bake(cyl(1.5, 18, 8).rotateZ(Math.PI / 2).translate(0, 4.2, 0)), 'steel');
  p.add(holdDownLug(), 'castAlu');
  // Shank in the bore, O-ring groove, shoulder just proud of the case mouth (t 93), then the housing.
  p.add(bake(lathe([
    [7.2, 8], [8.4, 12], [DIST.shankR, 18], [DIST.shankR, 60],
    [11.4, 62.4], [11.4, 67.2], [DIST.shankR, 69.6], [DIST.shankR, 92],
    [16.4, 94], [16.4, 114],
    [26, 122], [26, 158], [22, 166], [20, 169],
  ], 32)), 'castAlu');
  // Bosch cap (#8): crisp Ø70 skirt, a defined shoulder ring, black. Shell so the rotor sits inside.
  p.add(bake(lathe([
    [20, 168], [20, 170],
    [34.4, 170.6], [37.4, 172.2], [37.4, 175.4], [35.05, 176.6],
    [35.05, 204.6], [33, 206], [27, 208.2], [18, 210.4],
    [15, 207.6], [22, 178], [22, 172], [20, 170], [20, 168],
  ], 48)), 'blackPlastic');
  // Two spring-steel bails, 1.5 mm, hugging the skirt and hooking the lip and the shoulder ring.
  for (const side of [1, -1] as const) {
    const phi = side > 0 ? Math.PI / 2 - 0.14 : -Math.PI / 2 - 0.14;
    const span = 0.28;
    const band = lathe([[35.15, 176.8], [36.65, 176.8], [36.65, 204.2], [35.15, 204.2]], 6, phi, span);
    const over = lathe([
      [35.15, 202.4], [36.65, 202.4], [36.65, 206.2], [32.4, 208.4], [32.4, 207], [35.15, 204.8],
    ], 6, phi, span);
    const under = lathe([
      [35.15, 175.2], [36.65, 175.2], [38.6, 173.6], [38.6, 171.6], [35.15, 170.8],
    ], 6, phi, span);
    p.add(bake(band), 'steel');
    p.add(bake(over), 'steel');
    p.add(bake(under), 'steel');
  }
  const phase = 0; // tower 0 is local +X: outboard, toward the left wing. Do not rephase.
  const postProf: [number, number][] = [[9.2, 0], [9.6, 2.2], [7.05, 4], [7.05, 26], [9.2, 32], [7.4, 34]];
  // Suppression connector 122 035 281: a straight sleeve on the tower, in place of a rubber boot.
  const connProf: [number, number][] = [[7.4, 8], [8.8, 8], [8.8, 33], [7.4, 33]];
  for (let i = 0; i < 6; i++) {
    const a = phase + (i / 6) * Math.PI * 2;
    const cx = DIST.towerR * Math.cos(a), cz = DIST.towerR * Math.sin(a);
    const post = lathe(postProf, 16);
    post.translate(cx, DIST.towerY, cz);
    p.add(bake(post), 'blackPlastic');
    const conn = lathe(connProf, 14);
    conn.translate(cx, DIST.towerY, cz);
    p.add(bake(conn), 'blackPlastic');
  }
  const centre = lathe([[5.6, 0], [6.2, 3], [6.2, 22], [8.2, 28], [6.4, 30]], 14);
  centre.translate(0, DIST.towerY, 0);
  p.add(bake(centre), 'blackPlastic');
  const cConn = lathe([[6.6, 10], [8.4, 10], [8.4, 30], [6.6, 30]], 12);
  cConn.translate(0, DIST.towerY, 0);
  p.add(bake(cConn), 'blackPlastic');
  // Rotor (#3), under the cap, pointing at tower 0.
  p.add(bake(boxMM([2, 186, -3.2], [18, 190, 3.2])), 'blackPlastic');
  p.add(bake(boxMM([16, 186.4, -2.2], [22, 189.6, 2.2])), 'brass');
  p.add(bake(cyl(5, 4, 12).translate(0, 188, 0)), 'blackPlastic');
  // Vacuum unit (#2): shallow Ø52 × 22 can on a curved saddle under the cap rim.
  // The nipple is on the rim and points toward the cap. Tip local (39, 190, 2).
  const saddle = lathe([[26.3, 140], [29.4, 142], [29.4, 164], [26.3, 166]], 20, -1.05, 2.1);
  p.add(bake(saddle), 'steel');
  p.add(bake(cylBetween([22, 156, 0], [34, 154, 1], 1.6, 8)), 'steel');
  const can = yToX(lathe([
    [0.1, 0], [22, 0.4], [26, 1.2], [26.6, 2.2], [26, 3.4],
    [25.2, 4.2], [25.2, 17.6],
    [26, 18.6], [26.6, 19.6], [22, 20.8], [0.1, 22],
  ], 36));
  can.translate(28, 152, 2);
  p.add(bake(can), 'zincPlate');
  p.add(bake(cylBetween([39, 176, 2], [39, 190, 2], 2.3, 10)), 'zincPlate');
  return p.g;
}
const DIST_PINION_TIP = 12;
/** Circular fillets so a Catmull-Rom tube stays on the polyline instead of bowing off it. */
function filleted(corners: V3[], radius = 16): V3[] {
  const P = corners.map((q) => new THREE.Vector3(...q));
  const out: V3[] = [];
  const push = (v: THREE.Vector3) => {
    const last = out.length ? new THREE.Vector3(...out[out.length - 1]) : null;
    if (!last || last.distanceTo(v) > 0.6) out.push([v.x, v.y, v.z]);
  };
  push(P[0]);
  for (let i = 1; i < P.length - 1; i++) {
    const prev = P[i - 1], c = P[i], next = P[i + 1];
    const d0 = c.clone().sub(prev), d1 = next.clone().sub(c);
    const l0 = d0.length(), l1 = d1.length();
    if (l0 < 1e-3 || l1 < 1e-3) { push(c); continue; }
    d0.multiplyScalar(1 / l0); d1.multiplyScalar(1 / l1);
    const beta = Math.acos(Math.min(1, Math.max(-1, d0.dot(d1))));
    if (beta < 0.12 || beta > 2.85) { push(c); continue; }
    const trim = Math.min(radius * Math.tan(beta / 2), l0 * 0.46, l1 * 0.46);
    const rEff = trim / Math.tan(beta / 2);
    const bin = new THREE.Vector3().crossVectors(d0, d1);
    if (bin.lengthSq() < 1e-10) { push(c); continue; }
    bin.normalize();
    const n0 = new THREE.Vector3().crossVectors(bin, d0).normalize();
    const a = c.clone().addScaledVector(d0, -trim);
    const b = c.clone().addScaledVector(d1, trim);
    const center = a.clone().addScaledVector(n0, rEff);
    const va = a.clone().sub(center), vb = b.clone().sub(center);
    const axis = new THREE.Vector3().crossVectors(va, vb);
    if (axis.lengthSq() < 1e-10) { push(a); push(b); continue; }
    axis.normalize();
    const ang = va.angleTo(vb);
    const steps = Math.max(2, Math.ceil(ang / (14 * DEG)));
    for (let k = 0; k <= steps; k++) push(center.clone().add(va.clone().applyAxisAngle(axis, ang * (k / steps))));
  }
  push(P[P.length - 1]);
  return out;
}
/** Top of a shroud wing at this |x| (left skin is thicker upward). */
function wingTop(x: number) {
  const { ax, ay, bx, by, t } = SHROUD;
  const u = Math.max(0, Math.min(1, (Math.abs(x) - ax) / (bx - ax)));
  return ay + (by - ay) * u + (x < 0 ? t : 0);
}
/** Straight run along a shroud edge, hopping the wing ribs so the wire stays on the skin. */
function alongEdge(x: number, y: number, z0: number, z1: number, ribs: number[], hop = 8): V3[] {
  const dir = Math.sign(z1 - z0) || 1;
  const pts: V3[] = [[x, y, z0]];
  const reach = hop > 8 ? hop + 14 : 12;
  for (const z of ribs.filter((z) => (z - z0) * dir > 6 && (z1 - z) * dir > 6).sort((p, q) => (p - q) * dir)) {
    // A plateau, not a single peak, when the hop has to clear a rib the spline would otherwise flatten.
    const arch: V3[] = hop > 8
      ? [[x, y, z - dir * reach], [x, y + hop, z - dir * 8], [x, y + hop, z + dir * 8], [x, y, z + dir * reach]]
      : [[x, y, z - dir * 12], [x, y + hop, z], [x, y, z + dir * 12]];
    pts.push(...arch);
  }
  pts.push([x, y, z1]);
  return pts;
}
/**
 * From the shroud above this head to the boot. The head, the fins and the cam housing close every
 * gap beside the cylinder, and the valve covers sit further out than the wire may stray. The open
 * drop is the end of the bank: flywheel end on the right (past cylinder 3), pulley end on the left
 * (past cylinder 4, ahead of the chain housing). The wire stays on the shroud to that end, drops
 * beside the head, and runs back under the head to the boot. Nothing goes below the boot.
 */
function bootDrop(s: 1 | -1, c: number, xLoom: number, yLoom: number, zRail: number, boot: THREE.Vector3, axis: THREE.Vector3): V3[] {
  const lane = [1, 2, 3, 4, 5, 6].indexOf(c) % 3;
  // Right: the cooler pocket fills x 103–262, z −212..−146. The drop stays on the
  // wing until z −140, crosses above the cap, then goes aft and outboard of the
  // cam-oil banjo before joining the under-head run. Left: the wing ends at
  // z 172 and the horn fills the corner, so the drop is at z 192, x −216.
  const zDrop = s > 0 ? -140 : 192 + lane * 4;
  const xOut = s * (214 + lane * 4); // left drop, inboard of the cam housing
  // Right under-run stays inboard of the primary pipes (they reach x ≈ 217 at y −100).
  const xUnder = s > 0 ? 184 + lane * 4 : s * (170 + lane * 10);
  // The rail is the inboard shroud line. Out past |x| ≈ 160 the runners drop through the wing.
  // Below the cooler return (centre y −73, radius 7) and above the heat-exchanger shell.
  const yUnder = Math.max(-98 - lane * 6, boot.y + 18);
  const yHigh = Math.max(yLoom, wingTop(xLoom) + 8, wingTop(s * 180) + 8);
  const ribs = s > 0 ? [-150, -30, 90] : [-185, -90, 30];
  const approach = boot.clone().addScaledVector(axis, -14);
  if (approach.y < boot.y + 12) approach.y = boot.y + 12;
  const yMeet = Math.max(approach.y, boot.y + 16, yUnder);
  // Inboard shroud line, under the horizontal run of the intake runners (their centreline is y 206 until |x| 160).
  const xRail = xLoom;
  const zRailEnd = s > 0 ? zDrop : 162;
  // Right bypass. The cam-oil banjo stands off the housing cap (about x 269–300,
  // y −45..−27, z −218..−186) and the heat-exchanger seam reaches x ≈ 275.
  // Cross above the cap (y 164), drop at x ≥ 308 and z ≤ −230, then come in
  // under the cooler. A drop at x 274, z −200 runs through the banjo.
  const zBy = -230 - lane * 5;
  const xPeak = 308 + lane * 6;
  const yOver = Math.max(yHigh, 164);
  const outStep: V3[] = s > 0
    ? [[xPeak, yOver, -142], [xPeak, yOver, zBy], [xPeak, yUnder, zBy], [xUnder, yUnder, zBy]]
    : [
        // Down on the inboard line first. The runners are overhead here; moving out at y 168 crosses them.
        [xRail, yHigh, zRailEnd],
        [xRail, 72, 180],
        [xOut, 64, zDrop],
        [s * 196, yUnder, 176],
      ];
  // Right: the bridge arrives at z −168. Run out to this cylinder (hopping the wing
  // ribs — a straight run at yHigh cuts the rib at z 90), then back to the drop.
  const rightOut = s > 0 ? alongEdge(xRail, yHigh, -160, zRail, ribs, 16) : [];
  return [
    ...(s > 0 ? rightOut : [[xRail, yHigh, zRail] as V3]),
    ...alongEdge(xRail, yHigh, zRail, zRailEnd, ribs, s > 0 ? 16 : 8),
    ...outStep,
    ...(s > 0 ? [] : [[xUnder, yUnder, 172] as V3]),
    [xUnder, yUnder, boot.z],
    [xUnder, yMeet, boot.z],
    [approach.x, approach.y, approach.z],
    [boot.x, boot.y, boot.z],
  ];
}
/**
 * One plug lead. Leaves its cap tower, rides the shroud edge over that head (through the holders),
 * then drops at the open end of the bank and comes back under the head to the boot. The boot is the
 * lowest point. The boot end follows `pose` (today's plug, or a later head-local plug).
 */
export function plugLeadPoints(c: number, i: number, pose = partPose(`spark-plug-${c}`)): V3[] {
  const s: 1 | -1 = c <= 3 ? 1 : -1;
  const lane = [1, 6, 2, 4, 3, 5].filter((n) => (n <= 3) === (c <= 3)).sort((a, b) => CYL_Z[b] - CYL_Z[a]).indexOf(c);
  const a = (i / 6) * Math.PI * 2;
  // Inboard of |x| 160, where the intake runners are still on the stub height (bottom y ≈ 192).
  const xLoom = s * (124 + lane * 8);
  const yLoom = wingTop(xLoom) + 9;
  const zRail = CYL_Z[c] + s * 34;
  const boot = new THREE.Vector3(0, -92, 0).applyMatrix4(pose);
  const axis = new THREE.Vector3(0, -1, 0).transformDirection(pose).normalize();
  // Tower 0 is local +X (outboard). The post sticks out along the rotor axis.
  // Straight run past the flared tip, then a bend of at least 25 mm as the leads gather.
  const ca = Math.cos(a), sa = Math.sin(a);
  const yTip = DIST.towerY + DIST.towerH;
  const tower = distW(DIST.towerR * ca, DIST.towerY + 4, DIST.towerR * sa);
  const tip = distW(DIST.towerR * ca, yTip, DIST.towerR * sa);
  // Bend inboard off the tip. A straight run along the axis would cross the vacuum hose.
  const n = i - 2.5;
  const away = distW(DIST.towerR * ca - 30, yTip + 2, DIST.towerR * sa);
  const gather = distW(-16, yTip - 6, n * 5);
  // Loose bundle over the left holders (x ≈ −132), spread by the firing index. Not a rail.
  const xB = -132 + n * 8;
  const yB = wingTop(xB) + 16;
  const zJoin = Math.max(48, Math.min(150, away[2]));
  const corners: V3[] = [
    tower, tip, away, gather,
    [xB, yB + 12, zJoin],
    [xB, yB, 60],
    [xB, yB, -60],
  ];
  if (s < 0) {
    corners.push([xLoom, yLoom, zRail]);
  } else {
    // One bridge over the roof at the flywheel end, above the cooler opening, then the right-hand holders.
    // Stop at the flywheel-end bridge. bootDrop runs out to the cylinder and back,
    // hopping the wing ribs. A straight leg to zRail cut the rib at z 90.
    corners.push(
      [xB, yB, -168],
      [n * 8, 172, -176],
      [xLoom, yLoom + 6, -168],
    );
  }
  const drop = bootDrop(s, c, xLoom, yLoom, zRail, boot, axis);
  // Cap end is filleted at 25 mm. The plug drop stays tighter so it misses the horn.
  // Left drop repeats the last corner, so that duplicate is dropped. Right drop starts
  // at the bridge (z −160), which is not in the corners.
  const dropped = filleted(drop, s > 0 ? 16 : 8);
  const pts = densify([...filleted(corners, 25), ...(s > 0 ? dropped : dropped.slice(1))], 12);
  const floor = boot.y;
  for (const p of pts) if (p[1] < floor) p[1] = floor;
  return pts;
}
/** Catmull-Rom bows off a long chord. Points every few centimetres keep the tube on the shroud line. */
function densify(pts: V3[], step = 24): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < pts.length; i++) {
    if (i === 0) { out.push(pts[i]); continue; }
    const a = new THREE.Vector3(...pts[i - 1]), b = new THREE.Vector3(...pts[i]);
    const n = Math.floor(a.distanceTo(b) / step);
    for (let k = 1; k <= n; k++) {
      const p = a.clone().lerp(b, k / (n + 1));
      out.push([p.x, p.y, p.z]);
    }
    out.push(pts[i]);
  }
  return out;
}
/** Metallic braid: two opposite 4-strand helices, dense enough to read at a normal camera distance. */
function braidedLead(pts: V3[], r = 3.6) {
  const curve = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q)), false, 'centripetal');
  const len = curve.getLength();
  const radial = 28;
  const tubular = Math.max(180, Math.ceil(len / 1.6));
  const g = new THREE.TubeGeometry(curve, tubular, r, radial, false);
  const pos = g.attributes.position;
  const stride = radial + 1;
  const turns = len / 4.5;
  for (let i = 0; i <= tubular; i++) {
    const u = i / tubular;
    for (let j = 0; j <= radial; j++) {
      const idx = i * stride + j;
      const v = j / radial;
      const h1 = Math.max(0, Math.cos((v * 4 - u * turns) * Math.PI * 2)) ** 4;
      const h2 = Math.max(0, Math.cos((v * 4 + u * turns) * Math.PI * 2)) ** 4;
      const lift = 0.75 * Math.max(h1, h2);
      if (lift < 1e-4) continue;
      // Radial direction is the vertex offset from the centreline sample.
      const c = curve.getPointAt(u);
      const vx = pos.getX(idx) - c.x, vy = pos.getY(idx) - c.y, vz = pos.getZ(idx) - c.z;
      const mag = Math.hypot(vx, vy, vz) || 1;
      pos.setXYZ(idx, pos.getX(idx) + vx / mag * lift, pos.getY(idx) + vy / mag * lift, pos.getZ(idx) + vz / mag * lift);
    }
  }
  g.computeVertexNormals();
  return g;
}
/** Ignition leads: left set 911 609 011 07 and right set 911 609 010 07, both braided. Plug ends stay on today's plug pose. */
export function ignitionLeads() {
  const p = new Part();
  const order = [1, 6, 2, 4, 3, 5];
  order.forEach((c, i) => {
    const pts = plugLeadPoints(c, i);
    p.add(braidedLead(pts), 'darkSteel');
  });
  // Band clip on each three-lead set, flat so it clears the runners overhead.
  // Left trio sits together at z 40 (x −144…−112). Right trio sits together at z −90 (x 124…140).
  const band = (cx: number, cy: number, cz: number, rx: number, ry: number) => {
    const g = torus(rx, 1.15, 8, 22);
    g.scale(1, ry / rx, 1);
    g.translate(cx, cy, cz);
    return g;
  };
  p.add(band(-128, 165, 40, 20, 8), 'darkSteel');
  p.add(band(132, 158, -90, 14, 8), 'darkSteel');
  // Two shield pigtails on the right set, ending in ring terminals.
  for (const [x, y, z] of [[156, 172, -72], [156, 172, -108]] as [number, number, number][]) {
    p.add(tube([[146, 164, -90], [x, y, z]], 1.4, 6, 10), 'darkSteel');
    p.add(torus(4.2, 0.9, 6, 14).rotateY(Math.PI / 2), 'zincPlate', [x, y, z]);
  }
  // Coil lead (#18). The coil is on the left inner wing (body), so the lead ends in the
  // shroud clip at the pulley-end bay edge, not in mid-air.
  const clipCoil: V3 = [-286, 168, 188];
  const centre = distW(0, DIST.towerY + 6, 0);
  const centreOut = distW(-24, DIST.towerY + DIST.towerH + 4, 0);
  const cl = filleted([
    centre, centreOut,
    [-150, 160, 120],
    [-286, 168, 162],
    clipCoil,
  ], 25);
  p.add(braidedLead(cl), 'darkSteel');
  // Primary (#9), under the coil lead, into the same clip.
  const clipPri: V3 = [-286, 164, 188];
  const body = distW(16, 140, 4);
  const el = filleted([
    body,
    distW(-8, 150, 10),
    [-286, 164, 150],
    clipPri,
  ], 25);
  p.add(tube(el, 1.8, 6, Math.max(32, el.length * 2)), 'blackPlastic');
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
    // waisted 2-stud flange (ring + stud ears + narrow bridges) so the spark plug beside it stays clear
    const fl = circleShape(18.5); fl.holes.push(circlePath(16) as THREE.Path);
    const parts = [fl, circleShape(8.6, -30, 0), circleShape(8.6, 30, 0), roundRect(14, 9, 2, -22, 0), roundRect(14, 9, 2, 22, 0)];
    for (const sh of parts) {
      const fg = extrudeC(sh, 6, 0.6, 4); fg.rotateX(Math.PI / 2); fg.rotateY(Math.PI / 2);
      p.add(fg, 'heatSteel', [port[0], port[1] - 3, port[2]]);
    }
    // sleeve where the primary enters the box
    p.add(yToZ(lathe([[19, -8], [24, -8], [24, 8], [19, 8]], 20)).rotateX(-Math.PI / 2 + 0.5), 'aluminized', [X(EXH_PORT.x - 2), -136, zc + 8]);
  }
  // outlet to silencer
  p.add(tube([[X(shellX - 10), shellY - 5, zB - 10], [X(shellX - 20), shellY - 8, 280], [X(150), -185, 318], [X(150), -185, 334]], 22, 16, 30), 'aluminized');
  // heater air outlet (to cabin) at the flywheel end, with adapter (#27)
  p.add(tube([[X(shellX), shellY + 10, zA + 10], [X(shellX), shellY + 20, -240], [X(shellX - 20), shellY + 40, -262]], 26, 20, 16), 'aluminized');
  p.add(yToZ(lathe([[25, -6], [29, -6], [29, 6], [25, 6]], 24)).rotateX(-0.7), 'heatSteel', [X(shellX - 18), shellY + 38, -258]);
  // fresh-air inlet stub from the blower hose, pointing forward out of the pulley-end cap, low and outboard so it stays
  // clear of the chain box (box floor >= y -125 over the heat exchanger)
  p.add(tube([[X(shellX + 12), shellY + 6, zB - 14], [X(shellX + 16), shellY + 8, zB + 10], [X(shellX + 18), shellY + 8, zB + 34]], 15, 12, 12), 'aluminized');
  p.add(yToZ(torus(15.5, 2.2, 6, 20)), 'steel', [X(shellX + 18), shellY + 8, zB + 28]);
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
  const prof: [number, number][] = [[25.2, 0], [55, 0], [60, -4], [110, -4], [128, -2], [134, 0], [134, -28], [128, -30], [60, -30], [55, -14], [25.2, -14]];
  p.add(yToZ(lathe(prof, 96)), 'darkSteel', [0, 0, z]);
  p.add(yToZ(lathe([[78, -30.2], [127, -30.2], [127, -30.6], [78, -30.6]], 96)), 'polishedSteel', [0, 0, z]);
  p.add(extrude(gearShape(130, 136, 142, 133), 12, 0, 4), 'forgedSteel', [0, 0, z - 14]);
  // 9 flywheel bolts on the hub rear face (z-18) and 9 pressure-plate screws on the rim: fasteners.ts
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
  // flat 4 mm mounting flange seated on the flywheel friction-face plane (z FLY_Z-30.6), screws at r 129
  const zf = FLY_Z - 30.6, d = z - zf;
  const cover = lathe([[136, 0], [136, -4], [122, -4], [120, -28 + d], [112, -34 + d], [72, -36 + d], [70, -34 + d], [112, -30 + d], [117, -26 + d], [119, -4 + d * 0.3], [120, 0]], 72);
  p.add(yToZ(cover), 'zincPlate', [0, 0, zf]);
  // diaphragm spring fingers
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const f = polyShape([[34, -5], [80, -8], [80, 8], [34, 5]]);
    const g = extrudeC(f, 2); g.rotateZ(a);
    p.add(g, 'steel', [0, 0, z - 32]);
  }
  p.add(torus(78, 3, 6, 64), 'steel', [0, 0, z - 32]); // fulcrum ring in the plate plane (was standing vertical)
  // pressure plate ring
  p.add(extrudeC(ringShape(112, 78), 10), 'castAlu', [0, 0, z - 10]);
  // mounting bolts (#3 lock rings x9)
  return p.g;
}
