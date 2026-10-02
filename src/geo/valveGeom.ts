/**
 * Shared valve-axis geometry for the piston crown, the head and the cam housing.
 * Imported by core.ts and valvetrain.ts — keep this module free of those imports.
 *
 * Face centres sit on the bore centreline, intake at y +22 and exhaust at y −23,
 * with the real head diameters. The tips stagger by `LOBE_DZ` so the two lobes
 * on one cylinder do not occupy the same cam station. Crown pockets are eyebrows
 * in the dome height field only: at most 3 mm deep, and the shell under them
 * stays at least 4 mm thick. The valves are not slid along the stem for clearance.
 */
import * as THREE from 'three';
import { SPEC, CYL_TOP_X, CYL_Z } from '../data/layout';
import { DEG, cylBetween } from './util';

/** Axial stagger of the stem tips. The faces themselves stay at z = 0. */
export const LOBE_DZ = 7;
export const VALVE_LEN = 112;
export const STEM_R = 4.5;
export const VALVE_ANGLE = { in: 28 * DEG, ex: 32 * DEG } as const;
export const VALVE_DIA = { in: 49, ex: 41.5 } as const;
export const GUIDE_Y0 = 22;
export const GUIDE_Y1 = 64;
/**
 * Head-local face centre. x is far enough into the chamber that the tilted rim
 * dips only a couple of millimetres into the dome, which a 3 mm eyebrow can clear.
 */
export const VALVE_FACE = { in: { x: 8.7, y: 22, z: 0 }, ex: { x: 8.9, y: -23, z: 0 } } as const;
/** Piston-local x of the head deck at TDC. Pin |x| = crankRadius + rodLength. */
export const PISTON_DECK = CYL_TOP_X - (SPEC.crankRadius + SPEC.rodLength);
/** How far the eyebrow plane sits off the valve face, toward the piston (opposite the stem). */
const POCKET_CLEAR = 1.2;
/** Crescent depth limit, measured down from the uncut dome. */
const POCKET_DEPTH = 3;
/** Minimum crown thickness under a pocket. */
const CROWN_THICK = 4;

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function faceCentre(side: 1 | -1): THREE.Vector3 {
  const f = side > 0 ? VALVE_FACE.in : VALVE_FACE.ex;
  return V(f.x, f.y, f.z);
}

/** Stem unit vector in the head frame, from the seat toward the tip. */
export function stemDirLocal(side: 1 | -1): THREE.Vector3 {
  const a = side > 0 ? VALVE_ANGLE.in : VALVE_ANGLE.ex;
  const face = faceCentre(side);
  const tipZ = side > 0 ? -LOBE_DZ : LOBE_DZ;
  const dz = (tipZ - face.z) / VALVE_LEN;
  const k = Math.sqrt(Math.max(0, 1 - dz * dz));
  return V(Math.cos(a) * k, side * Math.sin(a) * k, dz);
}

/** Head-local point on the seated valve, `y` mm from the face along the stem. */
export function stemPointLocal(side: 1 | -1, y: number): THREE.Vector3 {
  return faceCentre(side).addScaledVector(stemDirLocal(side), y);
}

export function bankSign(cyl: number): 1 | -1 {
  return cyl <= 3 ? 1 : -1;
}

/** Head-local point → engine frame (left heads are turned 180° about Y). */
export function headToEngine(cyl: number, p: THREE.Vector3): THREE.Vector3 {
  const s = bankSign(cyl);
  return V(s * CYL_TOP_X + s * p.x, p.y, CYL_Z[cyl] + s * p.z);
}

/** Crown underside lathe: (r=0, top−6) to (r=R−6, top−7). */
export function crownUndersideX(r: number): number {
  const R = SPEC.bore / 2 - 0.1;
  const top = SPEC.compressionHeight;
  const r1 = R - 6;
  const t = Math.min(1, Math.max(0, r / r1));
  return (top - 6) + ((top - 7) - (top - 6)) * t;
}

const BORE_R = SPEC.bore / 2 - 0.1;
const SQUISH_R = BORE_R - 7.5;

/** Uncut crown height (piston-local x): pent-roof dome, then the squish band out to the bore. */
export function uncutCrownX(y: number, z: number): number | null {
  const top = SPEC.compressionHeight;
  const r = Math.hypot(y, z);
  if (r > BORE_R + 0.05) return null;
  if (r >= SQUISH_R) {
    const knee = BORE_R - 1;
    if (r <= knee) {
      const u = (r - SQUISH_R) / (knee - SQUISH_R);
      return (top + 0.6) * (1 - u) + top * u;
    }
    const u = Math.min(1, (r - knee) / 1);
    return top * (1 - u) + (top - 1) * u;
  }
  const t = r / SQUISH_R;
  const domeH = top + 0.6 + 11.4 * Math.pow(Math.max(0, 1 - t * t), 0.85);
  return domeH - 2.2 * Math.pow(Math.abs(z) / SQUISH_R, 2);
}

/**
 * Crown surface the piston mesh uses. Eyebrows run across the dome and the squish
 * under each valve: no deeper than 3 mm, and at least 4 mm of crown under them.
 */
export function crownSurfaceX(y: number, z: number): number | null {
  const uncut = uncutCrownX(y, z);
  if (uncut == null) return null;
  return domeReliefX(y, z, uncut, Math.hypot(y, z));
}

/**
 * Eyebrow pocket. `crownX` is the uncut height at (y, z). The plane sits 1.2 mm
 * piston-side of the valve face. The outer lip of the squish is left full height.
 */
export function domeReliefX(y: number, z: number, crownX: number, r: number): number {
  const R = BORE_R;
  if (r > R - 0.5) return crownX;
  const floor = Math.max(crownUndersideX(r) + CROWN_THICK, crownX - POCKET_DEPTH);
  let x = crownX;
  for (const side of [1, -1] as const) {
    const headR = (side > 0 ? VALVE_DIA.in : VALVE_DIA.ex) / 2;
    const d = stemDirLocal(side);
    const face = stemPointLocal(side, 0);
    const fx = face.x + PISTON_DECK;
    const dx = crownX - fx;
    const dy = y - face.y;
    const dz = z - face.z;
    const axial = dx * d.x + dy * d.y + dz * d.z;
    const perp2 = dx * dx + dy * dy + dz * dz - axial * axial;
    // Flat under the head, then a short blend outside the rim so the crescent closes.
    const pocketR = headR + 1.6;
    // The head is several millimetres thick toward the tip, so the crown under that
    // thickness is part of the crescent. Past the fillet there is nothing to clear.
    if (perp2 > pocketR * pocketR || axial > 8) continue;
    const Fx = fx - POCKET_CLEAR * d.x;
    const Fy = face.y - POCKET_CLEAR * d.y;
    const Fz = face.z - POCKET_CLEAR * d.z;
    const planeX = Fx - ((y - Fy) * d.y + (z - Fz) * d.z) / d.x;
    const perp = Math.sqrt(Math.max(0, perp2));
    const blend = 1.4;
    const inner = headR + 0.2;
    let pocket = planeX;
    if (perp > inner) {
      const u = (perp - inner) / blend;
      const s = u * u * (3 - 2 * u);
      pocket = planeX + (crownX - planeX) * s;
    }
    x = Math.min(x, Math.max(pocket, floor));
  }
  return x;
}

function alongCyl(side: 1 | -1, y0: number, y1: number, r: number, segs: number) {
  const a = stemPointLocal(side, y0);
  const b = stemPointLocal(side, y1);
  return cylBetween([a.x, a.y, a.z], [b.x, b.y, b.z], r, segs);
}

/** Spherical chamber bowl. Opening ≈ Ø88 at the deck, crown ≈ 14 mm into the head. */
export function headChamberCutter(): THREE.BufferGeometry {
  const bowl = new THREE.SphereGeometry(76, 40, 28);
  bowl.translate(-62, 0, 0);
  return bowl;
}

/**
 * Valve-head pocket, guide bore and spring well. Cut in a second pass from the chamber
 * so the bore is not swallowed by the sphere boolean. Seat-ring OD is headR+0.28;
 * the pocket is larger so tessellation does not leave a press-fit intersection.
 * Guide OD is 6.55 and the stem seal is 7.4, so the bore is 8.2.
 */
/** Valve-head counterbore. Stopped short of the guide so the two bores are cut in separate passes. */
export function headValvePockets(): THREE.BufferGeometry[] {
  return ([1, -1] as const).map((side) => {
    const headR = (side > 0 ? VALVE_DIA.in : VALVE_DIA.ex) / 2;
    return alongCyl(side, -4, 22, headR + 1.6, 36);
  });
}
/** Guide bore (clears the 6.55 guide and the 7.4 seal) and the spring well. */
export function headValveBores(): THREE.BufferGeometry[] {
  const cuts: THREE.BufferGeometry[] = [];
  for (const side of [1, -1] as const) {
    // Guide OD 6.55, stem seal 7.4. An open valve's neck (r ≈ 17 at 10 mm lift) sits past the head pocket.
    cuts.push(alongCyl(side, 10, 40, 18, 24));
    cuts.push(alongCyl(side, 8, 100, 10.2, 24));
    cuts.push(alongCyl(side, 46, 130, 14.6, 24));
  }
  return cuts;
}

export function headReliefCutters(): THREE.BufferGeometry[] {
  return [headChamberCutter(), ...headValvePockets(), ...headValveBores()];
}

/** Spring pockets in engine space for one cam housing (springs pass into the casting). */
export function camSpringCutters(s: 1 | -1): THREE.BufferGeometry[] {
  const cyls = s > 0 ? [1, 2, 3] : [4, 5, 6];
  const cuts: THREE.BufferGeometry[] = [];
  for (const c of cyls) for (const side of [1, -1] as const) {
    const a = headToEngine(c, stemPointLocal(side, 48));
    const b = headToEngine(c, stemPointLocal(side, 120));
    // r 16 clears the Ø20 spring and stops short of the cam-housing nut discs
    // (the nearest disc centre is 23.6 mm off the stem; the seat probe is at r 6).
    cuts.push(cylBetween([a.x, a.y, a.z], [b.x, b.y, b.z], 16, 20));
  }
  return cuts;
}
