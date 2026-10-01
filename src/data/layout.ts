/**
 * Engine coordinate frame (millimetres):
 *  +X = car right (cylinders 1-3), -X = car left (cylinders 4-6)
 *  +Y = up, +Z = pulley/fan end (rear of car), -Z = flywheel end (toward gearbox).
 * Crankshaft axis is the Z axis.
 */
export const SPEC = {
  bore: 95,
  stroke: 70.4,
  crankRadius: 35.2,
  rodLength: 127, // centre-to-centre (estimate, see docs/engine-spec.md)
  compressionHeight: 38, // pin centre to crown edge (estimate)
  displacementCc: 2994,
  compression: 8.5,
  firingOrder: [1, 6, 2, 4, 3, 5] as const,
  cylinderPitch: 118, // bore spacing within a bank (estimate)
  mainJournalD: 60,
  rodJournalD: 53,
};

export const TDC_X = SPEC.crankRadius + SPEC.rodLength + SPEC.compressionHeight; // ~200
export const DECK_X = 103; // crankcase cylinder face
export const CYL_TOP_X = 201; // cylinder / head joint
export const HEAD_OUT_X = 262; // head / cam-housing joint
export const CAM_X = 292; // camshaft axis
export const CAM_HOUSING_OUT_X = 320;
export const INT_SHAFT_Y = -84;
export const CASE_Z = { flywheel: -205, pulley: 212 };

/** Crank throw z positions (throw order along crank from pulley end: 1,4,2,5,3,6). */
export const CYL_Z: Record<number, number> = { 1: 147.5, 4: 88.5, 2: 29.5, 5: -29.5, 3: -88.5, 6: -147.5 };
export const MAIN_Z = [-177, -118, -59, 0, 59, 118, 177];
export const NOSE_BEARING_Z = 240;

/** Crank throw angle (deg, about +Z, from +X) chosen so that firing order 1-6-2-4-3-5 holds with 120° intervals. */
export const THROW_DEG: Record<number, number> = { 1: 0, 6: 60, 2: 120, 4: 180, 3: 240, 5: 300 };

export function bankOf(cyl: number): 1 | -1 { return cyl <= 3 ? 1 : -1; }

/** Crank angle (deg) at which each cylinder reaches firing TDC, derived from throw phase & bank. */
export function firingTdcAngle(cyl: number): number {
  // Right bank TDC when throw points +X (0°), left bank when throw points -X (180°).
  const target = bankOf(cyl) === 1 ? 0 : 180;
  return (((target - THROW_DEG[cyl]) % 360) + 360) % 360;
}

/** Piston pin position along the bank axis (|x|) for crank rotation `crankDeg`. */
export function pinX(cyl: number, crankDeg = 0): { pinX: number; throwXY: [number, number]; rodAngle: number } {
  const a = (THROW_DEG[cyl] + crankDeg) * (Math.PI / 180);
  const tx = SPEC.crankRadius * Math.cos(a), ty = SPEC.crankRadius * Math.sin(a);
  const s = bankOf(cyl);
  const dx = Math.sqrt(SPEC.rodLength ** 2 - ty ** 2);
  const px = tx + s * dx;
  const rodAngle = Math.atan2(-ty, px - tx); // rod direction from big end to pin
  return { pinX: px, throwXY: [tx, ty], rodAngle };
}

/** Spark-plug boss offset along the cylinder row from the bore axis (head-local z), clear of the lower head stud. */
export const SPARK_Z = 22;
export const INTAKE_PORT = { x: CYL_TOP_X + 26, y: 65 }; // runner flange seats on the head intake flange (top y 65)
/** Injector seat in the intake runner (runner-local, right bank) and its axis. */
export const INJ = { dx: 8, dy: 50, ux: 0.84, uy: 0.54 };
