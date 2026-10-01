/**
 * Ancillary assets: cooling (105), induction/CIS (106/107), ignition (901), exhaust & heat exchangers (202),
 * lubrication (104), clutch/flywheel (102/301). Shapes traced from the Porsche parts-catalogue illustrations.
 */
import * as THREE from 'three';
import { partPose } from './probe';
import {
  Part, V3, DEG, lathe, boxMM, cyl, cylBetween, yToZ, yToX, roundRect, circlePath, circleShape, ringShape,
  polyShape, gearShape, extrude, extrudeC, hexNut, tube, torus, paramSurface, hull, circlePts, csgSub, cutGroup,
} from './util';
import { CYL_Z, CASE_Z, INT_SHAFT_Y, CYL_TOP_X, INTAKE_PORT, INJ } from '../data/layout';
import { buildPlenumBox, AIR_NECK, BOX, LID_Y, WUR_FACES, runnerTunnelCutters, DIST_VAC } from './induction';
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
  // On the lower cap, just below the equator, so the tube stays in this half.
  const x0 = -(A.half + A.wall);
  const y = A.yMid - 18;
  const z = A.z;
  return [[x0 + 1, y, z], [x0 - 28, y + 2, z - 8], [x0 - 62, y + 2, z - 28]];
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
  // 930/03 RoW, no A/C: one V-groove pressed-steel dish, OD 134 (lip r 67). The belt
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
export function upperAirGuide() {
  const p = new Part();
  const { zA, zB, t, ax, ay, bx, by, skirtY, lipW } = SHROUD; const len = zB - zA;
  const roof = roundRect(190, len, 6);
  const cut = new THREE.Path(); // distributor + breather opening
  const zc0 = (zA + zB) / 2, zCut0 = 100 - zc0, zCut1 = Math.min(205, zB - 3) - zc0; // shape y = engine z - zc0
  cut.moveTo(-95 + 0.5, zCut0); cut.lineTo(-20, zCut0); cut.lineTo(-20, zCut1); cut.lineTo(-95 + 0.5, zCut1); cut.closePath();
  roof.holes.push(cut);
  const rg = extrude(roof, t); rg.rotateX(Math.PI / 2); rg.translate(0, ay + t, (zA + zB) / 2);
  // v5 cut-outs: distributor cap opening (roof + left wing), breather neck, air-distributor foot slot
  const distCut = boxMM([-175, 130, 90], [-48, 180, 190]), brCut = boxMM([-70, 142, 168], [-40, 176, 200]);
  // Fan-end of the flat plate meets the alternator. The horn replaces that patch; the cut stays
  // inside the alternator so the roof still runs out to the bell.
  p.add(csgSub(rg, distCut, brCut, boxMM([-94, 140, -157], [94, 165, -143]), boxMM([-60, 148, 162], [60, 172, 198])), 'shroudRed');
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
    p.add(csgSub(wg, ...(s < 0 ? [distCut] : []), ...injCuts, ...runnerCuts, ...slots, ...skirtWindows), 'shroudRed');
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
  // hot air outlet socket (#4) on the end plate, left, with its flange
  p.add(yToZ(lathe([[30, 0], [34, 0], [34, 40], [30, 40]], 32)), 'shroudRed', [-170, 118, zA - t - 40]);
  p.add(yToZ(lathe([[30, 0], [44, 0], [44, 2], [30, 2]], 32)), 'shroudRed', [-170, 118, zA - t - 2]);
  return p.g;
}
function swapSkirt(sk: THREE.Shape, t: number, s: 1 | -1, bx: number) {
  // shape (u = engine y, v = engine z) extruded along engine x
  const g = extrude(sk, t);
  g.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));
  g.translate(s > 0 ? bx - t : -bx, 0, 0);
  return g;
}

// ---------------------------------------------------------------- 104-00 / 101 lubrication bits
export function oilCooler() {
  const p = new Part();
  const x0 = -199, x1 = -95, y0 = 74, y1 = 124, z0 = 30, z1 = 148;
  p.add(boxMM([x0, y0, z0], [x0 + 6, y1, z1]), 'castAlu');
  p.add(boxMM([x1 - 6, y0, z0], [x1, y1, z1]), 'castAlu');
  for (let z = z0 + 3; z < z1 - 2; z += 3.2) p.add(boxMM([x0 + 6, y0 + 3, z], [x1 - 6, y1 - 3, z + 0.9]), 'machinedAlu');
  for (const y of [y0 + 10, (y0 + y1) / 2, y1 - 10]) p.add(cylBetween([x0 + 6, y, (z0 + z1) / 2], [x1 - 6, y, (z0 + z1) / 2], 4, 10), 'castAlu');
  // oil ports: short spigots from the end tank to the case-top passages (O-rings: smallParts oil-cooler-seals)
  for (const z of [49, 75]) { p.add(cylBetween([x1, 97, z], [-84, 97, z], 4, 12), 'castAlu'); p.add(cylBetween([-84, 97, z], [-84, 92, z], 4, 12), 'castAlu'); }
  // four mounting feet on the case top (nuts: fasteners.ts oil-cooler-nuts)
  // v5: the end tank corner is relieved round the distributor base instead of overlapping it (feet added after the cut)
  cutGroup(p.g, distRelief(70, 100));
  for (const [x, z] of OIL_COOLER.studs) {
    const sh = polyShape(hull([...circlePts(x, z, 8, 12), ...circlePts(x1 + 2, z, 8, 12)]));
    sh.holes.push(circlePath(4.5, x, z) as THREE.Path); // stud (r 3.84) passes through; the foot stays clear of the case stud
    p.add(extrudeC(sh, OIL_COOLER.foot).rotateX(Math.PI / 2), 'castAlu', [0, OIL_COOLER.footTop - OIL_COOLER.foot / 2, 0]);
  }
  return p.g;
}
/** Oil-cooler feet: 4 studs in the left case top (case surface y 95 at x -90). */
export const OIL_COOLER = { foot: 6, footTop: 101, studs: [[-89, 36], [-89, 62], [-89, 88], [-89, 112]] as [number, number][] };
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
/** Clearance prism round the distributor base + clamp (plan hull), height h centred at y. */
function distRelief(h: number, y: number) { return extrudeC(polyShape(hull([...circlePts(DIST.x, DIST.z, 31, 32), ...circlePts(DIST.stud[0], DIST.stud[1], 11, 12)])), h).rotateX(Math.PI / 2).translate(0, y, 0); }
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
 * seals: seven O-ring seats, [x, y, z, axis] with axis 'Y' (top ports) or 'Z' (end face).
 */
export const OIL_PUMP = {
  // Flywheel face of the cover. M8 nuts stand ~8 mm proud toward −Z and must stay
  // pulley-side of the flywheel web (solid through z −169).
  coverFace: -158,
  // Ears break the body silhouette (side camera looks along −Z). All stay inboard of
  // the left relief piston and outside the cyl-6 cheek disc.
  studs: [[38, -56], [-10, -116], [30, -116]] as [number, number][],
  seals: [
    [-14, -64.8, -147], [24, -64.8, -147],
    [-16, -90, -157.2], [-4, -80, -157.2], [10, -100, -157.2], [16, -88, -157.2], [2, -96, -157.2],
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
  // Pickup leaves the +X end and rises ~90°. The bend is about as long as the body.
  // Once it climbs it stays outside the cyl-6 cheek (x ≳ 60 above y −60).
  const bend: V3[] = [[30, -84, zc], [42, -84, zc]];
  const Rc = 44, x0 = 46, y0 = -40;
  for (let i = 0; i <= 6; i++) {
    const t = (i / 6) * Math.PI / 2;
    bend.push([x0 + Rc * Math.sin(t), y0 - Rc * Math.cos(t), zc - 2 * Math.sin(t)]);
  }
  bend.push([90, -30, zc - 3], [90, -22, zc - 3.4]);
  p.add(tube(bend, 6.3, 14, 48), 'castAlu');
  p.add(cylBetween([90, -24, zc - 3.2], [90, -14, zc - 3.6], 8.2, 16), 'castAlu');
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
  p.add(tube(airboxSnoutPoints(), SNOUT_R, 16, 24), 'blackPlastic');
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
  return p.g;
}
/** Warm-up regulator (107-10 #54) on the left case top near the flywheel end: flange, body, vacuum can, two screws. */
export const WUR = { flangeTop: 121.2, screws: [[-60, -188], [-60, -152]] as [number, number][] };
export function warmUpRegulator() {
  const p = new Part();
  p.add(boxMM([-70, WUR.flangeTop - 5, -195], [-50, WUR.flangeTop, -145]), 'zincPlate');
  p.add(boxMM([-74, WUR.flangeTop, -186], [-46, 142, -146]), 'zincPlate');
  p.add(cyl(11, 8, 20), 'zincPlate', [-60, 143, -170]);
  // brass port bosses ending on WUR_FACES. The banjos (wur-lines) seat on those faces.
  for (const face of WUR_FACES) p.add(cylBetween([-74, face[1], face[2]], [face[0] + 0.2, face[1], face[2]], 5, 14), 'brass');
  return p.g;
}
/** Air-cleaner strut nut seats. y is the foot top the M8 nut bears on; the stud reaches the plenum. Under the drum. */
export const AIRBOX_STRUTS = [[-62, 258, -22], [62, 258, -22], [-62, 258, 72], [62, 258, 72]] as V3[];
export function airboxStruts() {
  const p = new Part();
  for (const [x, y, z] of AIRBOX_STRUTS) {
    // Column sits inboard of the stud so the M8 nut face at (x, y) stays clear.
    const inward = x > 0 ? -1 : 1;
    const ux = x + inward * 12;
    const xLo = Math.min(x, ux) - 8, xHi = Math.max(x, ux) + 8;
    // Foot sits on the lid face. The stud (on the plenum) passes through the hole.
    const foot = boxMM([xLo, LID_Y, z - 8], [xHi, y, z + 8]);
    const cut = csgSub(foot, cylBetween([x, 251, z], [x, y + 2, z], 5, 12));
    const sole = cut.index ? cut.toNonIndexed() : cut;
    sole.computeVertexNormals();
    p.add(sole, 'zincPlate');
    // Pad top meets the shell at its lowest point over the disk. The shell rises away from that point.
    const top = Math.min(shellBottom(z - 6), shellBottom(z), shellBottom(z + 6));
    p.add(boxMM([ux - 2.2, y, z - 2.2], [ux + 2.2, top - 16, z + 2.2]), 'zincPlate');
    p.add(cylBetween([ux, y + 1, z], [ux, top - 8, z], 6, 16), 'rubber');
    const disk = extrude(circleShape(6), 3.2, 0, 8);
    disk.rotateX(-Math.PI / 2);
    disk.translate(ux, top - 3.2, z);
    p.add(faceNormals(disk), 'rubber');
  }
  return p.g;
}

// ---------------------------------------------------------------- 901-00 ignition
/** Distributor hold-down clamp (stud in the left case top at z 116; cast spacer up to the clamp tab). */
export const DIST = { x: -98, z: 146, clampY: 122, clampT: 5, clampTop: 127, stud: [-72, 107] as [number, number], caseY: 107 };
export function distributorClamp() {
  const p = new Part();
  const sh = polyShape(hull([...circlePts(DIST.x, DIST.z, 29.5, 32), ...circlePts(DIST.stud[0], DIST.stud[1], 9, 12)]));
  sh.holes.push(circlePath(26.8, DIST.x, DIST.z) as THREE.Path); sh.holes.push(circlePath(4.2, DIST.stud[0], DIST.stud[1]) as THREE.Path);
  p.add(extrude(sh, DIST.clampT).rotateX(Math.PI / 2), 'steel', [0, DIST.clampTop, 0]);
  p.add(lathe([[4.2, DIST.caseY], [9, DIST.caseY], [9, DIST.clampY], [4.2, DIST.clampY]], 16), 'castAlu', [DIST.stud[0], 0, DIST.stud[1]]); // spacer boss
  return p.g;
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
  const x = DIST.x, z = DIST.z;
  p.add(lathe([[14, 104], [20, 104], [24, 120], [32, 150], [32, 168], [0.1, 168]], 32), 'castAlu', [x, 0, z]);
  // cap (#8) with 7 towers
  p.add(lathe([[0.1, 168], [36, 168], [37, 180], [30, 196], [0.1, 198]], 36), 'blackPlastic', [x, 0, z]);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; p.add(cyl(6, 14, 12), 'blackPlastic', [x + 22 * Math.cos(a), 196, z + 22 * Math.sin(a)]); }
  p.add(cyl(6, 16, 12), 'blackPlastic', [x, 204, z]);
  // vacuum unit, with the advance nipple the vacuum hose seats on
  p.add(yToX(cyl(20, 26, 24)), 'zincPlate', [x - 44, 150, z]);
  p.add(cylBetween([x - 44 - 12, 150, z], DIST_VAC.tip, 3.4, 10), 'brass');
  return p.g;
}
/** Top of a shroud wing at this |x| (left skin is thicker upward). */
function wingTop(x: number) {
  const { ax, ay, bx, by, t } = SHROUD;
  const u = Math.max(0, Math.min(1, (Math.abs(x) - ax) / (bx - ax)));
  return ay + (by - ay) * u + (x < 0 ? t : 0);
}
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
/** Arc at constant y around the distributor axis. `dir` forces the long way when the short way enters the fan. */
function capArc(a0: number, a1: number, r: number, y: number, dir: 1 | -1 | 0 = 0): V3[] {
  let d = a1 - a0;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (dir && Math.sign(d) !== dir) d += dir * Math.PI * 2;
  const steps = Math.max(2, Math.ceil(Math.abs(d) / 0.5));
  const pts: V3[] = [];
  for (let k = 1; k <= steps; k++) {
    const a = a0 + d * (k / steps);
    pts.push([DIST.x + r * Math.cos(a), y, DIST.z + r * Math.sin(a)]);
  }
  return pts;
}
/** Straight run along a shroud edge, hopping the wing ribs so the wire stays on the skin. */
function alongEdge(x: number, y: number, z0: number, z1: number, ribs: number[]): V3[] {
  const dir = Math.sign(z1 - z0) || 1;
  const pts: V3[] = [[x, y, z0]];
  for (const z of ribs.filter((z) => (z - z0) * dir > 14 && (z1 - z) * dir > 14).sort((p, q) => (p - q) * dir)) {
    pts.push([x, y, z - dir * 12], [x, y + 8, z], [x, y, z + dir * 12]);
  }
  pts.push([x, y, z1]);
  return pts;
}
/**
 * One plug lead. Leaves its cap tower, rides the shroud edge (through the lead holders over that
 * bank), then drops just outside the cam housing and comes in above the heat exchanger to the boot.
 * The last segment is collinear with the plug-boot axis.
 */
function plugLead(c: number, i: number): V3[] {
  const s: 1 | -1 = c <= 3 ? 1 : -1;
  const lane = [1, 6, 2, 4, 3, 5].filter((n) => (n <= 3) === (c <= 3)).sort((a, b) => CYL_Z[b] - CYL_Z[a]).indexOf(c);
  const a = (i / 6) * Math.PI * 2;
  const xLoom = s * (151 + lane * 9);
  const yLoom = wingTop(xLoom) + 9;
  const boot = new THREE.Vector3(0, -92, 0).applyMatrix4(partPose(`spark-plug-${c}`));
  const axis = new THREE.Vector3(0, -1, 0).transformDirection(partPose(`spark-plug-${c}`));
  // Short straight into the boot mouth. A longer run on this axis enters the heat exchanger.
  const mouth = boot.clone().addScaledVector(axis, 4);
  const aside = new THREE.Vector3(mouth.x + s * 26, mouth.y + 6, mouth.z);
  const at = (r: number, y: number): V3 => [DIST.x + r * Math.cos(a), y, DIST.z + r * Math.sin(a)];
  // Beside the bore, clear of the intake-runner tube, and still over the wing.
  const zRail = CYL_Z[c] + s * 34;
  const xOut = s * (352 + lane * 8);
  const yLow = -104 - lane * 7;
  // Inboard run stays off the primary's z until it is inside the pipe, then lines up with the boot.
  const zWide = boot.z + s * 14;
  // Out the top of the tower (above the cap, inside the plenum recess), then sideways below the plenum.
  const ribsL = [-185, -90, 30];
  const ribsR = [-150, -30, 90];
  const R = 74;
  // Cylinder 6's tower faces the alternator, so that lead steps left above the cap instead of radially out.
  const corners: V3[] = s < 0 && a > 0.4 && a < 1.3
    ? [at(22, 208), at(22, 212), [-126, 206, 152], [-168, 188, 136], [xLoom, yLoom + 12, 128]]
    : [at(22, 208), at(22, 212), at(22, 201), at(46, 194)];
  if (s < 0 && a > 0.4 && a < 1.3) {
    corners.push(...alongEdge(xLoom, yLoom, 116, zRail, ribsL));
  } else if (s < 0) {
    corners.push(at(R, 180), ...capArc(a, Math.PI, R, 180));
    corners.push(
      [xLoom, yLoom + 14, 124],
      ...alongEdge(xLoom, yLoom, 112, zRail, ribsL),
    );
  } else {
    // Right bank rides the left shroud edge aft, crosses the flywheel end above the roof, then the right clips.
    const xFeed = -186;
    const yFeed = wingTop(xFeed) + 9;
    corners.push(at(R, 180), ...capArc(a, -Math.PI / 2, R, 180));
    corners.push(
      [xFeed, yFeed + 6, 124],
      ...alongEdge(xFeed, yFeed, 112, -168, ribsL),
      [xFeed, 168, -176],
      [xLoom, 168, -178],
      ...alongEdge(xLoom, yLoom, -160, zRail, ribsR),
    );
  }
  const park: V3 = [s * 216, yLow, zWide];
  const lead = filleted([
    ...corners,
    [s * 214, wingTop(214) + 10, zRail],
    [s * 246, 160, zRail],
    [xOut, 148, zRail],
    [xOut, yLow, zWide],
    park,
  ], 10);
  const tail = filleted([
    park,
    [aside.x, aside.y, aside.z],
    [mouth.x, mouth.y, mouth.z],
    [boot.x, boot.y, boot.z],
  ], 4);
  return [...lead, ...tail.slice(1)];
}
/** Ignition lead set (901-00 #17): cap towers along the shroud edge, in the holders, down to each plug boot. */
export function ignitionLeads() {
  const p = new Part();
  const order = [1, 6, 2, 4, 3, 5];
  order.forEach((c, i) => {
    const pts = plugLead(c, i);
    p.add(tube(pts, 3.6, 8, Math.max(64, pts.length * 2)), 'blackPlastic');
  });
  // coil lead (901-00 #18) from the centre tower toward the body-mounted coil, ending in its cable plug (#19)
  const cl: V3[] = [[DIST.x, 212, DIST.z], [DIST.x, 290, DIST.z], [DIST.x - 60, 300, DIST.z + 60], [DIST.x - 160, 300, DIST.z + 120]];
  p.add(tube(cl, 3.6, 8, 60), 'blackPlastic');
  p.add(cylBetween([DIST.x - 160, 300, DIST.z + 120], [DIST.x - 185, 300, DIST.z + 135], 6, 12), 'blackPlastic');
  // primary electric line (#9) from the distributor body to the CD unit, with its plug
  const el: V3[] = [[DIST.x - 20, 150, DIST.z + 18], [DIST.x - 40, 175, DIST.z + 50], [DIST.x - 150, 290, DIST.z + 115]];
  p.add(tube(el, 1.8, 6, 40), 'blackPlastic');
  p.add(cylBetween([DIST.x - 150, 290, DIST.z + 115], [DIST.x - 166, 290, DIST.z + 124], 4, 10), 'blackPlastic');
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
