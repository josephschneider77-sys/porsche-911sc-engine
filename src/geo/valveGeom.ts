/**
 * Shared valve-axis geometry for the piston crown, the head and the cam housing.
 * Imported by core.ts and valvetrain.ts — keep this module free of those imports.
 *
 * The seated valve is shifted out along the stem (`SEAT_SHIFT`) so a closed head
 * clears the piston. Crown pockets are eyebrows in the dome height field only:
 * they never rewrite the ring-belt lathe, and the floor stays above the top ring land.
 */
import * as THREE from 'three';
import { SPEC, CYL_TOP_X, CYL_Z } from '../data/layout';
import { DEG, cylBetween } from './util';

export const LOBE_DZ = 7;
export const VALVE_LEN = 112;
export const STEM_R = 4.5;
export const VALVE_ANGLE = { in: 28 * DEG, ex: 32 * DEG } as const;
export const VALVE_DIA = { in: 49, ex: 41.5 } as const;
export const GUIDE_Y0 = 22;
export const GUIDE_Y1 = 64;
/**
 * Slide the whole seated valve out along the stem (away from the piston).
 * Closed intake rim then sits high enough that a ~1.25 mm eyebrow pocket
 * stays above the crown underside and the top ring land.
 */
export const SEAT_SHIFT = 2.6;
/** Piston-local x of the head deck at TDC. Pin |x| = crankRadius + rodLength. */
export const PISTON_DECK = CYL_TOP_X - (SPEC.crankRadius + SPEC.rodLength);
/** Axial floor of a crown pocket. The top ring groove ends at x = 29. */
export const DOME_FLOOR = 30.4;
/** Clearance from the closed valve face to the eyebrow plane, along the stem. */
const VALVE_MARGIN = 1.25;

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Stem unit vector in the head frame, from the seat toward the tip. */
export function stemDirLocal(side: 1 | -1): THREE.Vector3 {
  const a = side > 0 ? VALVE_ANGLE.in : VALVE_ANGLE.ex;
  return V(Math.cos(a), side * Math.sin(a), 0);
}

/** Head-local point on the seated valve, `y` mm from the face along the stem. */
export function stemPointLocal(side: 1 | -1, y: number): THREE.Vector3 {
  const localZ = side > 0 ? -LOBE_DZ : LOBE_DZ;
  const well = V(56, side * 38, localZ);
  const atGuide = 58;
  return stemDirLocal(side).multiplyScalar(y - atGuide + SEAT_SHIFT).add(well);
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

/**
 * Eyebrow pocket on the dome height field. `crownX` is the uncut dome height at (y, z).
 * Returns a lower x only inside the valve-head footprint. The floor is the higher of
 * the top-ring-land limit and 1.25 mm above the crown underside.
 */
export function domeReliefX(y: number, z: number, crownX: number, r: number): number {
  const R = SPEC.bore / 2 - 0.1;
  const rd = R - 7.5;
  if (r > rd - 0.15) return crownX;
  const floor = Math.max(DOME_FLOOR, crownUndersideX(r) + 1.25);
  let x = crownX;
  for (const side of [1, -1] as const) {
    const headR = (side > 0 ? VALVE_DIA.in : VALVE_DIA.ex) / 2;
    const d = stemDirLocal(side);
    const face = stemPointLocal(side, 0);
    const Fx = face.x + PISTON_DECK - VALVE_MARGIN * d.x;
    const Fy = face.y - VALVE_MARGIN * d.y;
    const Fz = face.z - VALVE_MARGIN * d.z;
    const planeX = Fx - ((y - Fy) * d.y + (z - Fz) * d.z) / d.x;
    // Footprint in the crown's yz plane. The head is tilted, so distance-to-axis of the
    // plane point overstates the rim; the disc's yz projection fits in headR.
    const rad = Math.hypot(y - face.y, z - face.z);
    const pocketR = headR + 3.2;
    const blend = 2.8;
    if (rad >= pocketR) continue;
    const inner = pocketR - blend;
    let pocket = planeX;
    if (rad > inner) {
      const u = (rad - inner) / blend;
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
    cuts.push(alongCyl(side, 8, 100, 8.4, 24));
    cuts.push(alongCyl(side, 46, 130, 14.6, 24));
  }
  return cuts;
}

export function headReliefCutters(): THREE.BufferGeometry[] {
  return [headChamberCutter(), ...headValvePockets(), ...headValveBores()];
}

/**
 * Drop triangles CSG left crossing a valve bore. A fin can span the hole with every
 * vertex outside it, so this is a real triangle-vs-cylinder test, not point samples.
 * The inset sits inside the cutter (guide wall 8.4, pocket wall headR+1.6, spring wall
 * 14.6), so the hole skin stays and the guide, seat and spring are clear of the casting.
 */
export function pruneHeadSlivers(root: THREE.Object3D) {
  const regions = ([1, -1] as const).flatMap((side) => {
    const headR = (side > 0 ? VALVE_DIA.in : VALVE_DIA.ex) / 2;
    return [
      { side, y0: -3, y1: 22, r: headR + 1.35 },
      { side, y0: 10, y1: 98, r: 8.15 },
      { side, y0: 48, y1: 128, r: 14.15 },
    ];
  });
  const frames = regions.map((reg) => ({ ...reg, f: stemPointLocal(reg.side, 0), dir: stemDirLocal(reg.side) }));
  const inSphere = (x: number, y: number, z: number) => {
    const dx = x + 62, dy = y, dz = z;
    return dx * dx + dy * dy + dz * dz < 74 * 74 && x > 0 && x < 15 && dy * dy + dz * dz < 42 * 42;
  };
  root.updateMatrixWorld(true);
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  const P = new THREE.Vector3(), Q = new THREE.Vector3(), E = new THREE.Vector3();
  const R0 = new THREE.Vector3(), F = new THREE.Vector3();
  const S = new THREE.Vector3(), E1 = new THREE.Vector3(), E2 = new THREE.Vector3();
  const H = new THREE.Vector3(), Qc = new THREE.Vector3();
  const axialOf = (p: THREE.Vector3, f: THREE.Vector3, dir: THREE.Vector3) =>
    (p.x - f.x) * dir.x + (p.y - f.y) * dir.y + (p.z - f.z) * dir.z;
  /** Edge PQ meets the finite cylinder. */
  const edgeHits = (y0: number, y1: number, r: number, f: THREE.Vector3, dir: THREE.Vector3) => {
    const t0 = axialOf(P, f, dir);
    const t1 = axialOf(Q, f, dir);
    const dt = t1 - t0;
    E.subVectors(Q, P);
    F.copy(E).addScaledVector(dir, -dt);
    R0.copy(P).sub(f).addScaledVector(dir, -t0);
    const a = F.dot(F);
    const b = 2 * R0.dot(F);
    const c = R0.dot(R0) - r * r;
    let s0 = 0, s1 = 1;
    if (Math.abs(dt) < 1e-9) {
      if (t0 < y0 || t0 > y1) return false;
    } else {
      const u0 = (y0 - t0) / dt, u1 = (y1 - t0) / dt;
      s0 = Math.max(0, Math.min(u0, u1));
      s1 = Math.min(1, Math.max(u0, u1));
      if (s0 > s1) return false;
    }
    const at = (s: number) => a * s * s + b * s + c;
    if (at(s0) <= 1e-8 || at(s1) <= 1e-8) return true;
    if (a > 1e-12) {
      const sMin = THREE.MathUtils.clamp(-b / (2 * a), s0, s1);
      if (at(sMin) <= 1e-8) return true;
    }
    return false;
  };
  /** Axis segment from y0 to y1 pierces the triangle (the fin caps the bore). */
  const axisHits = (y0: number, y1: number, f: THREE.Vector3, dir: THREE.Vector3) => {
    P.copy(f).addScaledVector(dir, y0);
    Q.copy(f).addScaledVector(dir, y1);
    E1.subVectors(B, A);
    E2.subVectors(C, A);
    E.subVectors(Q, P);
    H.crossVectors(E, E2);
    const det = E1.dot(H);
    if (Math.abs(det) < 1e-8) return false;
    const inv = 1 / det;
    S.subVectors(P, A);
    const u = inv * S.dot(H);
    if (u < -1e-6 || u > 1 + 1e-6) return false;
    Qc.crossVectors(S, E1);
    const v = inv * E.dot(Qc);
    if (v < -1e-6 || u + v > 1 + 1e-6) return false;
    const t = inv * E2.dot(Qc);
    return t >= -1e-6 && t <= 1 + 1e-6;
  };
  const pointIn = (p: THREE.Vector3, y0: number, y1: number, r2: number, f: THREE.Vector3, dir: THREE.Vector3) => {
    const t = axialOf(p, f, dir);
    if (t < y0 || t > y1) return false;
    const ox = p.x - f.x - t * dir.x, oy = p.y - f.y - t * dir.y, oz = p.z - f.z - t * dir.z;
    return ox * ox + oy * oy + oz * oz <= r2;
  };
  const kills = (y0: number, y1: number, r: number, f: THREE.Vector3, dir: THREE.Vector3) => {
    const r2 = r * r;
    if (pointIn(A, y0, y1, r2, f, dir) || pointIn(B, y0, y1, r2, f, dir) || pointIn(C, y0, y1, r2, f, dir)) return true;
    P.copy(A); Q.copy(B);
    if (edgeHits(y0, y1, r, f, dir)) return true;
    P.copy(B); Q.copy(C);
    if (edgeHits(y0, y1, r, f, dir)) return true;
    P.copy(C); Q.copy(A);
    if (edgeHits(y0, y1, r, f, dir)) return true;
    return axisHits(y0, y1, f, dir);
  };
  root.traverse((o: any) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    let g: THREE.BufferGeometry = o.geometry;
    g = g.index ? g.toNonIndexed() : g.clone();
    g.applyMatrix4(o.matrix);
    const pos = g.attributes.position;
    const keep: number[] = [];
    let dropped = 0;
    for (let i = 0; i < pos.count; i += 3) {
      A.fromBufferAttribute(pos, i);
      B.fromBufferAttribute(pos, i + 1);
      C.fromBufferAttribute(pos, i + 2);
      const abx = B.x - A.x, aby = B.y - A.y, abz = B.z - A.z;
      const acx = C.x - A.x, acy = C.y - A.y, acz = C.z - A.z;
      const cx = aby * acz - abz * acy, cy = abz * acx - abx * acz, cz = abx * acy - aby * acx;
      // Zero-area slivers left by the boolean report false intersections.
      if (cx * cx + cy * cy + cz * cz < 1e-8) { dropped++; continue; }
      const midX = (A.x + B.x + C.x) / 3, midY = (A.y + B.y + C.y) / 3, midZ = (A.z + B.z + C.z) / 3;
      let kill = inSphere(A.x, A.y, A.z) || inSphere(B.x, B.y, B.z) || inSphere(C.x, C.y, C.z) || inSphere(midX, midY, midZ);
      if (!kill) {
        for (const reg of frames) {
          if (kills(reg.y0, reg.y1, reg.r, reg.f, reg.dir)) { kill = true; break; }
        }
      }
      if (kill) { dropped++; continue; }
      keep.push(A.x, A.y, A.z, B.x, B.y, B.z, C.x, C.y, C.z);
    }
    if (!dropped) return;
    const ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
    ng.computeVertexNormals();
    o.geometry = ng;
    o.position.set(0, 0, 0);
    o.rotation.set(0, 0, 0);
    o.scale.set(1, 1, 1);
    o.updateMatrix();
  });
}

/** Spring pockets in engine space for one cam housing (springs pass into the casting). */
export function camSpringCutters(s: 1 | -1): THREE.BufferGeometry[] {
  const cyls = s > 0 ? [1, 2, 3] : [4, 5, 6];
  const cuts: THREE.BufferGeometry[] = [];
  for (const c of cyls) for (const side of [1, -1] as const) {
    const a = headToEngine(c, stemPointLocal(side, 48));
    const b = headToEngine(c, stemPointLocal(side, 120));
    cuts.push(cylBetween([a.x, a.y, a.z], [b.x, b.y, b.z], 15.2, 24));
  }
  return cuts;
}
