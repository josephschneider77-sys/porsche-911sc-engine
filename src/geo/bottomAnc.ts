/**
 * Bottom-end ancillaries traced from Kat 502: air injection (108-00), heater blower (108-10),
 * EGR (202-05), cylinder baffles (105-10) and the 930/04 catalytic converter (202-00 #6).
 * Drawings decide shape and placement. Coordinates are millimetres in the engine frame.
 */
import * as THREE from 'three';
import { VARIANT } from '../data/variant';
import { CYL_Z } from '../data/layout';
import { FAN, AIR_CHECK_VALVE_OUTLET } from './aux';
import { frame } from './instancing';
import { Part, cyl, cylBetween, lathe, box, boxMM, hexNut, tube, torus, yToZ, yToX, type V3 } from './util';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const Y = V(0, 1, 0);
const X = V(1, 0, 0);
/** Same solid as a box, split so a bracket or plate is more than a 12-triangle shell. */
const slab = (min: V3, max: V3) => {
  const g = new THREE.BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2], 2, 2, 2);
  g.translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  return g;
};
const plate = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d, 2, 2, 2);

/** Pump axis. Pitch radius 65 against the fan's 36 makes the 9.5×950 belt at about 315 mm centres. Body stops before the pulley. */
export const AIR_PUMP = { x: -270, y: 50, z: 336, r: 34, half: 14 };
const P = AIR_PUMP;

export function airPump() {
  const p = new Part();
  // Cast body, pulley end toward −Z. The shaft enters the pulley bore (pressed). Pulley valley is z 314.
  p.add(yToZ(cyl(P.r, P.half * 2, 40)), 'castAlu', [P.x, P.y, P.z]);
  p.add(yToZ(cyl(12, 22, 20)), 'machinedAlu', [P.x, P.y, P.z - P.half - 8]);
  p.add(yToZ(cyl(20, 8, 24)), 'castAlu', [P.x, P.y, P.z + P.half - 2]);
  // Outboard inlet (upper) and outlet (lower). Both stop short of the pivot foot and the pulley disc.
  p.add(yToX(cyl(8, 18, 16)), 'castAlu', [P.x - P.r - 6, P.y + 8, P.z + 4]);
  p.add(yToX(cyl(7, 18, 14)), 'castAlu', [P.x - P.r - 5, P.y - 26, P.z + 4]);
  // Pivot foot is aft of the pulley (disc ends z 322) so the belt groove does not sweep the ear.
  p.add(boxMM([P.x - 14, -8, 330], [P.x + 14, P.y - P.r, 346]), 'castAlu');
  return p.g;
}
export function airPumpPulley() {
  const p = new Part();
  const z = FAN.zPumpBelt;
  const prof: [number, number][] = [
    [14, z - 8], [58, z - 8], [72, z - 4], [65, z], [72, z + 4], [58, z + 8], [14, z + 8], [14, z - 8],
  ];
  p.add(yToZ(lathe(prof, 40)), 'yellowZinc', [P.x, P.y, 0]);
  return p.g;
}
export function airPumpBelt() {
  const p = new Part();
  const c1 = new THREE.Vector2(P.x, P.y), r1 = 65;
  const c2 = new THREE.Vector2(0, FAN.y), r2 = FAN.rFanPulley - 5;
  const d = c2.clone().sub(c1), L = d.length(), base = Math.atan2(d.y, d.x);
  const beta = Math.acos((r1 - r2) / L);
  const pts: V3[] = [];
  const arc = (c: THREE.Vector2, r: number, a0: number, a1: number, n: number) => {
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push([c.x + r * Math.cos(a), c.y + r * Math.sin(a), FAN.zPumpBelt]);
    }
  };
  arc(c2, r2, base - beta, base + beta, 28);
  arc(c1, r1, base + beta, base + 2 * Math.PI - beta, 36);
  const curve = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q)), true);
  const sh = new THREE.Shape();
  sh.moveTo(-5, -4.2); sh.lineTo(5, -4.2); sh.lineTo(3, 4.2); sh.lineTo(-3, 4.2); sh.closePath();
  p.add(new THREE.ExtrudeGeometry(sh, { steps: 160, extrudePath: curve, bevelEnabled: false }), 'rubber');
  return p.g;
}
/** Rubber-mount centres (108-00 #2). Shared by the bracket feet, sleeves and nuts. */
export const AIR_MOUNTS: V3[] = [[P.x + 70, 30, P.z + 10], [P.x + 70, 78, P.z + 10]];

export function airPumpBracket() {
  const p = new Part();
  // Feet hold the rubber mountings. The arm stays aft of the chain box (ends z 282) and clear of the pump body.
  for (const [x, y, z] of AIR_MOUNTS) p.add(slab([x - 10, y - 18, z - 16], [x + 10, y + 18, z + 16]), 'castAlu');
  p.add(slab([P.x + 38, 44, P.z + 4], [AIR_MOUNTS[0][0] + 10, 62, P.z + 16]), 'castAlu');
  return p.g;
}
export function airPumpStrap() {
  const p = new Part();
  // Slotted strap up from the pump, then inboard. Shares the retainer's outboard face. Aft of the belt plane.
  p.add(slab([P.x - 6, P.y + 46, P.z + 6], [P.x + 6, 150, P.z + 18]), 'zincPlate');
  p.add(slab([P.x - 6, 146, P.z + 6], [-188, 158, P.z + 18]), 'zincPlate');
  return p.g;
}
export function airRetainer() {
  const p = new Part();
  // On the left of the fan housing, aft of the drum (z 296), clear of the shell. Outboard face meets the strap.
  p.add(slab([-188, 148, 344], [-176, 240, 360]), 'zincPlate');
  return p.g;
}
export function airCheckValve() {
  const p = new Part();
  const [x, y, z] = AIR_CHECK_VALVE_OUTLET.point;
  // Vertical: hex outlet down, its bottom face 4 mm above the spigot point so ring #21 can sit between.
  p.add(hexNut(27, 14), 'yellowZinc', [x, y + 12, z]);
  p.add(cyl(12, 22, 20), 'castAlu', [x, y + 28, z]);
  p.add(cyl(7, 14, 12), 'castAlu', [x, y + 46, z]);
  return p.g;
}
export function airDiverter() {
  const p = new Part();
  p.add(boxMM([-160, 8, 430], [-124, 44, 466]), 'castAlu');
  // Inlet on the outboard face, outlet on top, dump aft. Each nipple stands proud of the body.
  p.add(yToX(cyl(7, 16, 12)), 'castAlu', [-164, 26, 448]);
  p.add(cyl(7, 16, 12), 'castAlu', [-142, 48, 448]);
  p.add(yToZ(cyl(7, 20, 12)), 'castAlu', [-142, 26, 472]);
  return p.g;
}
export function airDiverterSupport() {
  const p = new Part();
  // Plate shares the valve's bottom face. The ear shares the inboard face, clear of the inlet nipple.
  p.add(slab([-148, 4, 436], [-128, 8, 460]), 'zincPlate');
  p.add(slab([-124, 8, 440], [-116, 30, 452]), 'zincPlate');
  return p.g;
}
export function airPumpCleaner() {
  const p = new Part();
  // Canister on the outboard inlet, clear of the pulley disc (disc ends z 322, outer x −342).
  p.add(yToX(cyl(15, 32, 18)), 'blackPlastic', [-380, P.y + 8, P.z + 4]);
  p.add(yToX(cyl(9, 36, 12)), 'blackPlastic', [-346, P.y + 8, P.z + 4]);
  return p.g;
}

/** Heater blower on the right of the fan housing (108-10). */
export const HEATER_BLOWER = { x: 340, y: 140, z: 410 };
export function heaterBlower() {
  const p = new Part();
  const b = HEATER_BLOWER;
  p.add(yToZ(cyl(40, 60, 28)), 'blackPlastic', [b.x, b.y, b.z]);
  // Inlet on the fan side, outlet underneath, mounting lug sharing the support's inboard face.
  p.add(yToZ(cyl(12, 16, 14)), 'blackPlastic', [b.x, b.y, b.z - 38]);
  p.add(cyl(14, 20, 14), 'blackPlastic', [b.x, b.y - 44, b.z]);
  p.add(boxMM([b.x - 40, b.y - 12, b.z - 10], [b.x - 28, b.y + 8, b.z + 8]), 'blackPlastic');
  return p.g;
}
export function heaterBlowerSupport() {
  const p = new Part();
  const b = HEATER_BLOWER;
  // Ends on the blower lug's inboard face. Aft of the fan drum (z 296).
  p.add(slab([b.x - 90, b.y - 12, b.z - 10], [b.x - 40, b.y + 8, b.z + 8]), 'zincPlate');
  return p.g;
}

export const EGR = { x: -70, y: -300, z: 20 };
export function egrValve() {
  const p = new Part();
  const e = EGR;
  p.add(cyl(22, 36, 24), 'castAlu', [e.x, e.y + 10, e.z]);
  p.add(cyl(28, 12, 24), 'castAlu', [e.x, e.y + 32, e.z]);
  p.add(cyl(6, 14, 10), 'castAlu', [e.x + 18, e.y + 36, e.z]);
  // Side port for the sealing rubber, proud of the body.
  p.add(yToZ(cyl(6, 16, 12)), 'castAlu', [e.x, e.y + 10, e.z + 26]);
  return p.g;
}
export function egrPipeFeed() {
  const p = new Part();
  const e = EGR;
  p.add(tube([[e.x - 28, e.y, e.z], [e.x - 80, e.y - 10, e.z - 40], [e.x - 140, e.y - 6, e.z - 90]], 8, 10, 24), 'aluminized');
  return p.g;
}
export function egrPipeReturn() {
  const p = new Part();
  const e = EGR;
  p.add(tube([[e.x + 28, e.y, e.z], [e.x + 90, e.y - 8, e.z + 30], [e.x + 150, e.y - 4, e.z + 70]], 8, 10, 24), 'aluminized');
  return p.g;
}
export function egrBracket() {
  const p = new Part();
  const e = EGR;
  p.add(slab([e.x - 30, e.y - 28, e.z - 8], [e.x + 30, e.y - 22, e.z + 8]), 'zincPlate');
  return p.g;
}

/** Catalytic converter 930 113 228 01. Local frame, placed by the small-part matrix at (0, -250, -330). */
export function catalyticConverterPart() {
  const p = new Part();
  const R = 28, L = 168;
  // Cylindrical can, about 3:1 here so it stays in the old pre-silencer pocket; conical ends.
  p.add(yToX(cyl(R, L, 36)), 'aluminized', [0, 0, 0]);
  p.add(yToX(cyl(R, 18, 28, 16)), 'aluminized', [L / 2 + 6, 0, 0]);
  p.add(yToX(cyl(16, 18, 28, R)), 'aluminized', [-(L / 2 + 6), 0, 0]);
  // Triangular 3-bolt flanges.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
      p.add(cyl(7, 6, 12), 'aluminized', [s * (L / 2 + 16), 16 * Math.cos(a), 16 * Math.sin(a)]);
    }
    p.add(torus(16, 1.2, 6, 18).rotateY(Math.PI / 2), 'gasket', [s * (L / 2 + 20), 0, 0]);
  }
  // Test-port boss on the inlet cone (cap is its own part).
  p.add(cyl(6, 8, 12), 'aluminized', [L / 2 + 8, 14, 0]);
  // Existing front-pipe / clamp features the 202-00 checklist already counts, kept short of the muffler.
  p.add(cylBetween([0, -R, 0], [0, -R - 16, -36], 16, 14), 'aluminized');
  p.add(lathe([[14, 0], [18, 0], [18, 8], [14, 8]], 16).rotateX(-Math.PI / 2), 'heatSteel', [0, -R - 16, -36]);
  for (const k of [-1, 1]) p.add(cylBetween([k * 70, 0, 0], [k * 110, 16, 24], 12, 12), 'aluminized');
  return p;
}

const nutAt = (p: Part, x: number, y: number, z: number, af = 13, h = 6) => {
  p.add(hexNut(af, h), 'zincPlate', [x, y + h / 2, z]);
};
/** Tube that stays on the polyline. A loose Catmull-Rom chord bows into neighbouring parts. */
const hose = (pts: V3[], r: number) => {
  const dense: V3[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const steps = 8;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      dense.push([
        pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t,
        pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t,
        pts[i][2] + (pts[i + 1][2] - pts[i][2]) * t,
      ]);
    }
  }
  dense.push(pts[pts.length - 1]);
  return tube(dense, r, 8, Math.max(16, dense.length));
};
const along = (a: V3, b: V3) => V(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
/** Clamp band. TorusGeometry's hole is +Z; roll it onto +Y so frame() can aim the hole along the hose. */
const band = (R: number) => new Part().add(torus(R, 1.3, 6, 18).rotateX(Math.PI / 2), 'zincPlate');
const mid = (a: V3, b: V3): V3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
const at = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function registerAncillarySmall(def: (id: string, proto: () => Part, items: () => THREE.Matrix4[]) => void) {
  const M = (p: V3, n: THREE.Vector3 = Y, x?: THREE.Vector3) => frame(V(...p), n, x);
  // Gasket under the breather flange (case top y 122) and on the intermediate-shaft cover face (z 282).
  def('breather-gasket', () => new Part().add(plate(28, 0.8, 22), 'gasket'), () => [M([-52, 121.6, 146] as V3)]);
  def('ishaft-cover-gasket', () => new Part().add(yToZ(cyl(20, 0.6, 28)), 'gasket', [72, -48, 282.3]), () => [new THREE.Matrix4()]);
  if (VARIANT.airInjection) {
    const Zp = V(0, 0, 1);
    // Hole along X, same axis as the sleeve. rotateY puts TorusGeometry's +Z hole onto +X.
    def('air-rubber', () => new Part().add(torus(8, 3.2, 8, 16).rotateY(Math.PI / 2), 'rubber'), () =>
      AIR_MOUNTS.map((q) => M(q)));
    def('air-sleeve', () => new Part().add(yToX(cyl(3, 36, 10)), 'steel'), () =>
      AIR_MOUNTS.map((q) => M(q)));
    // Buffers pressed into the retainer's outboard face, clear of the strap joint.
    def('air-buffer', () => new Part().add(yToX(cyl(6, 16, 12)), 'rubber'), () =>
      [[-192, 183, 352], [-192, 220, 352]].map((q) => M(q as V3)));
    const pumpHose: V3[] = [[-314, 24, 340], [-350, -10, 400], [-250, -40, 460], [-180, 16, 470], [-168, 26, 448]];
    const valveHose: V3[] = [[-142, 52, 448], [-180, 80, 470], [-230, 60, 440], [-210, 28, 410], [-210, 0, 400]];
    const dumpHose: V3[] = [[-142, 26, 480], [-100, 8, 510], [-60, -16, 545]];
    def('air-hose-pump', () => new Part().add(hose(pumpHose, 6), 'rubber'), () => [new THREE.Matrix4()]);
    def('air-hose-valve', () => new Part().add(hose(valveHose, 6), 'rubber'), () => [new THREE.Matrix4()]);
    def('air-hose-dump', () => new Part().add(hose(dumpHose, 6), 'rubber'), () => [new THREE.Matrix4()]);
    def('air-hose-vacuum', () => {
      const p = new Part();
      const pts: V3[] = [];
      for (let i = 0; i <= 24; i++) {
        const a = (i / 24) * Math.PI * 6;
        pts.push([-430 + 16 * Math.cos(a), 150 + 16 * Math.sin(a), 460 + i * 1.5]);
      }
      p.add(tube(pts, 2.2, 6, 40), 'rubber');
      return p;
    }, () => [new THREE.Matrix4()]);
    def('air-clamp-pump', () => band(8.2), () => [M(mid(pumpHose[1], pumpHose[2]), along(pumpHose[1], pumpHose[2]))]);
    def('air-clamp-valve', () => band(8.2), () => [M(mid(valveHose[1], valveHose[2]), along(valveHose[1], valveHose[2]))]);
    def('air-clamp-dump', () => band(8.2), () =>
      [M(mid(dumpHose[0], dumpHose[1]), along(dumpHose[0], dumpHose[1])), M(mid(dumpHose[1], dumpHose[2]), along(dumpHose[1], dumpHose[2]))]);
    const [vx, vy, vz] = AIR_CHECK_VALVE_OUTLET.point;
    def('air-sealing-ring', () => new Part().add(torus(13.2, 1.2, 8, 24).rotateX(Math.PI / 2), 'copper'), () => [M([vx, vy + 1.2, vz] as V3)]);
    def('air-check-gasket', () => new Part().add(torus(12, 1.2, 8, 20).rotateX(Math.PI / 2), 'rubber'), () => [M([vx, vy + 22, vz] as V3)]);
    const pulleyBolt = (i: number): V3 => {
      const a = (i / 4) * Math.PI * 2 + 0.5;
      return [P.x + 22 * Math.cos(a), P.y + 22 * Math.sin(a), FAN.zPumpBelt - 2];
    };
    def('air-pulley-screws', () => new Part().add(yToZ(cyl(2.2, 8, 8)), 'zincPlate'), () =>
      [0, 1, 2, 3].map((i) => M(pulleyBolt(i), Zp)));
    def('air-pulley-washers', () => new Part().add(torus(4.2, 0.7, 6, 12), 'darkSteel'), () =>
      [0, 1, 2, 3].map((i) => M([pulleyBolt(i)[0], pulleyBolt(i)[1], FAN.zPumpBelt - 6], Zp)));
    def('air-bracket-nuts', () => {
      const p = new Part();
      // On the sleeve ends, seated against each foot. Axis X, so the nut is turned onto its side.
      for (const [x, y, z] of AIR_MOUNTS) p.add(yToX(hexNut(13, 8)), 'zincPlate', [x - 12, y, z]);
      return p;
    }, () => [new THREE.Matrix4()]);
    def('air-pump-fasteners', () => {
      const p = new Part();
      // Nuts on the buffer studs, strap bolt through the retainer joint, pivot screw through the pump foot.
      for (const y of [183, 220]) p.add(yToX(hexNut(13, 8)), 'zincPlate', [-200, y, 352]);
      p.add(yToX(cyl(3.5, 16, 10)), 'zincPlate', [-188, 152, 350]);
      p.add(yToZ(cyl(4, 18, 10)), 'zincPlate', [P.x, 2, 338]);
      return p;
    }, () => [new THREE.Matrix4()]);
    def('air-diverter-nuts', () => {
      const p = new Part();
      p.add(hexNut(10, 6), 'zincPlate', [-142, 5, 444]);
      p.add(hexNut(10, 6), 'zincPlate', [-134, 5, 452]);
      return p;
    }, () => [new THREE.Matrix4()]);
  }
  if (VARIANT.egr) {
    const e = EGR;
    def('egr-gasket', () => new Part().add(torus(16, 1.2, 6, 18).rotateX(Math.PI / 2), 'gasket'), () => [M([e.x, e.y - 8, e.z] as V3)]);
    def('egr-seal', () => new Part().add(torus(7, 2.2, 6, 14), 'rubber'), () => [M([e.x, e.y + 10, e.z + 32] as V3)]);
    def('egr-buffer', () => new Part().add(cyl(6, 8, 12), 'rubber'), () => [M([e.x, e.y - 34, e.z] as V3)]);
    def('egr-tee', () => new Part().add(cyl(4, 20, 8), 'blackPlastic').add(yToX(cyl(4, 16, 8)), 'blackPlastic'), () => [M([e.x + 18, e.y + 50, e.z] as V3)]);
    def('egr-hose-short', () => new Part().add(hose([[e.x + 18, e.y + 40, e.z], [e.x + 18, e.y + 50, e.z]], 2.2), 'rubber'), () => [new THREE.Matrix4()]);
    def('egr-hose-long', () => {
      const pts: V3[] = [];
      for (let i = 0; i <= 28; i++) {
        const a = (i / 28) * Math.PI * 8;
        pts.push([e.x - 40 + 16 * Math.cos(a), e.y - 50, e.z - 20 + i * 3]);
      }
      return new Part().add(tube(pts, 2.2, 6, 36), 'rubber');
    }, () => [new THREE.Matrix4()]);
    def('egr-hose-pair', () => {
      const p = new Part();
      // Leave the tee above the valve body and run clear of the case.
      p.add(hose([[e.x + 24, e.y + 50, e.z], [e.x + 70, e.y + 70, e.z + 30], [e.x + 110, e.y + 40, e.z + 70]], 2.2), 'rubber');
      p.add(hose([[e.x + 12, e.y + 56, e.z], [e.x + 40, e.y + 80, e.z - 24], [e.x + 80, e.y + 60, e.z - 60]], 2.2), 'rubber');
      return p;
    }, () => [new THREE.Matrix4()]);
    def('egr-fasteners', () => {
      const p = new Part();
      // Nuts on the flange annulus, above the body. Bolts through the bracket, below the valve.
      for (const ang of [0.6, 2.4]) {
        p.add(hexNut(10, 6), 'zincPlate', [e.x + 30 * Math.cos(ang), e.y + 34, e.z + 30 * Math.sin(ang)]);
      }
      p.add(hexNut(10, 6), 'zincPlate', [e.x, e.y - 26, e.z]);
      p.add(cyl(3, 12, 8), 'zincPlate', [e.x - 18, e.y - 24, e.z]);
      p.add(cyl(3, 12, 8), 'zincPlate', [e.x + 18, e.y - 24, e.z]);
      return p;
    }, () => [new THREE.Matrix4()]);
  }
  // 105-10 baffles. Square fins reach about ±57 mm in Z and ±61 mm in Y, so the plates sit under the barrels.
  const baffle = (w: number, h: number, t: number) => new Part().add(plate(w, h, t), 'zincPlate');
  const gapZ = (a: number, b: number) => (CYL_Z[a] + CYL_Z[b]) / 2;
  const gaps: [number, number][] = [[1, 2], [2, 3], [4, 5], [5, 6]];
  def('cyl-baffle-14', () => baffle(48, 10, 14), () => gaps.map(([a, b]) => {
    const s = a <= 3 ? 1 : -1;
    return M([s * 70, -186, gapZ(a, b)] as V3);
  }));
  def('cyl-baffle-15', () => baffle(40, 10, 12), () => [1, 4].map((c) => {
    const s = c <= 3 ? 1 : -1;
    return M([s * 70, -186, CYL_Z[c] + 70] as V3);
  }));
  def('cyl-baffle-16', () => baffle(40, 10, 12), () => [3, 6].map((c) => {
    const s = c <= 3 ? 1 : -1;
    return M([s * 70, -186, CYL_Z[c] - 70] as V3);
  }));
  def('cyl-baffle-spring', () => new Part().add(box(18, 1.2, 8), 'darkSteel'), () => [1, 2, 3, 4, 5, 6].map((c) => {
    const s = c <= 3 ? 1 : -1;
    return M([s * 100, -186, CYL_Z[c]] as V3);
  }));
  def('cyl-cover-plate', () => new Part().add(plate(40, 3, 220), 'zincPlate'), () => [1, -1].map((s) =>
    M([s * 55, -208, 0] as V3)));
  // Heater hoses and clamps (108-10). Far runs stay in the clear air already proven against the exchangers.
  const hb = HEATER_BLOWER;
  const link: V3[] = [[230, hb.y, 340], [280, hb.y, 352], [hb.x, hb.y, hb.z - 34]];
  const rightH: V3[] = [[hb.x + 6, 72, hb.z + 6], [400, 50, 320], [410, -80, 40], [410, -160, -160], [320, -165, -210]];
  // Left hose drops first, then runs outboard of the right hose (x 470, y −280) so the two never meet.
  const leftH: V3[] = [[hb.x - 6, 72, hb.z - 6], [hb.x - 6, 20, 380], [470, -20, 280], [470, -280, -60], [0, -280, -60], [-470, -280, -60], [-330, -190, -210]];
  def('heater-dist-piece', () => new Part().add(cyl(11, 24, 16), 'blackPlastic'), () => [M([hb.x, hb.y - 54, hb.z] as V3)]);
  def('heater-socket', () => new Part().add(yToX(cyl(11, 18, 14)), 'castAlu').add(boxMM([-6, 18, -6], [6, 28, 6]), 'castAlu'), () => [M([236, hb.y, 340] as V3)]);
  def('heater-hose-link', () => new Part().add(hose(link, 9), 'rubber'), () => [new THREE.Matrix4()]);
  def('heater-hose-right', () => new Part().add(hose(rightH, 8), 'rubber'), () => [new THREE.Matrix4()]);
  def('heater-hose-left', () => new Part().add(hose(leftH, 7), 'rubber'), () => [new THREE.Matrix4()]);
  def('heater-hose-supports', () => band(10), () => [
    M(mid(rightH[1], rightH[2]), along(rightH[1], rightH[2])),
    M(mid(leftH[2], leftH[3]), along(leftH[2], leftH[3])),
  ]);
  def('heater-clamp-sp', () => band(12.5), () => [M(at(link[0], link[1], 0.72), along(link[0], link[1]))]);
  def('heater-clamp-band', () => band(11.5), () => [
    M(at(link[1], link[2], 0.28), along(link[1], link[2])),
    M(at(rightH[0], rightH[1], 0.62), along(rightH[0], rightH[1])),
  ]);
  def('heater-clamps', () => band(10), () => {
    const segs: [V3, V3][] = [[rightH[2], rightH[3]], [rightH[3], rightH[4]], [leftH[2], leftH[3]], [leftH[3], leftH[4]], [leftH[4], leftH[5]], [leftH[5], leftH[6]]];
    return segs.map(([a, b]) => M(mid(a, b), along(a, b)));
  });
  def('heater-blower-hardware', () => {
    const p = new Part();
    // Screws through the blower lug and the support. Nuts on the socket tab, clear of the hose.
    p.add(yToX(cyl(1.8, 14, 8)), 'zincPlate', [hb.x - 40, hb.y - 4, hb.z - 4]);
    p.add(yToX(cyl(1.8, 14, 8)), 'zincPlate', [hb.x - 40, hb.y + 2, hb.z + 4]);
    p.add(hexNut(10, 5), 'zincPlate', [236, hb.y + 23, 340]);
    p.add(hexNut(10, 5), 'zincPlate', [234, hb.y + 23, 338]);
    return p;
  }, () => [new THREE.Matrix4()]);
  if (VARIANT.frontExhaust === 'catalytic-converter') {
    const c = (x: number, y: number, z: number): V3 => [x, y - 250, z - 330];
    def('cat-cover', () => new Part().add(plate(90, 2, 16), 'aluminized'), () => [M(c(0, 56, 24))]);
    def('cat-cap', () => new Part().add(cyl(8, 6, 12), 'zincPlate'), () => [M(c(96, 20, 0))]);
    def('cat-plug', () => new Part().add(hexNut(10, 5), 'zincPlate').add(torus(5, 0.8, 6, 12).rotateX(Math.PI / 2), 'copper'), () => [M(c(96, 26, 0))]);
    def('cat-bracket', () => new Part().add(plate(70, 3, 14), 'zincPlate'), () => [M(c(40, -36, 20))]);
    def('cat-cover-fasteners', () => {
      const p = new Part();
      let n = 0;
      for (const x of [-60, -20, 20, 60]) for (const z of [-18, 18]) {
        p.add(hexNut(10, 4), 'zincPlate', [x, -2, z]);
        p.add(yToZ(cyl(3, 8, 6)).rotateZ(Math.PI / 2), 'zincPlate', [x, 4, z]);
        p.add(torus(5, 0.5, 4, 10), 'zincPlate', [x, 1, z]);
        n++;
      }
      void n;
      return p;
    }, () => [M(c(0, 60, 24))]);
  }
  void box;
}
