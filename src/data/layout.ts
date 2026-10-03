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
export const CAM_HOUSING_OUT_X = 337;
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

/**
 * Spark plug axis, head-local, from the electrode up to the upper valve cover.
 * Kat 502 illustration 103-05 (PDF p.66) draws lid 901 105 115 03 with two round
 * holes about one cylinder pitch apart and a half-round opening at one end.
 * The plug is threaded in a bore coaxial with that hole. Illustration 901-00
 * (PDF p.582) is the plug and the connector.
 *
 * The upper-cover plane on the right bank has normal (0.742, 0.671, 0), 42.1°
 * above horizontal. The datum is head-local (2.36, −20, 34): the centre electrode
 * is 0.75 mm behind it and the ground strap's outer face is 0.75 mm in front, so
 * that face is 2.3 mm clear of the piston crown at TDC. The cover hole is 51 mm
 * rearward of the cylinder centre and 8 mm toward the cam side of the lid (local
 * x −8), which keeps the ceramic off the M10 barrel nuts. The same head bore,
 * mirrored on the left, leans forward.
 *
 * Axis, datum → hole, head frame (0.8009, 0.5871, 0.1181):
 *   35.95° above horizontal
 *   36.79° off the cylinder axis (+X)
 *   8.98° off the cover normal
 * Path length from the datum to the cover face (local z 24) is 144 mm. Cylinders
 * 1–3 lean rearward and 4–6 forward. The left covers are the right-bank parts
 * turned 180° about Y, so cylinder 6 seals in the hole that cylinder 1 uses
 * on the right-hand lid. The left cam housing is built on those stations.
 *
 * partPose: position is this datum, 0.75 mm piston-side of the centre electrode.
 * The quaternion maps plug-local (0, −1, 0) onto the engine axis (s·dx, dy, s·dz).
 * `sparkRoll` spins about local +Y first. A plug-local point (0, y, 0) is
 * datum + (−y) · axis in the engine frame.
 */
export const SPARK_TIP = { x: 2.36, y: -20 };
export const SPARK_Z = 34;
/** Along-row offset of the cover hole from the cylinder centre, mm. Rearward on the right bank. */
export const SPARK_ROW = 51;
/** Unit axis in the head frame, from the electrode datum toward the cover hole. */
export const SPARK_AXIS: [number, number, number] = [0.8009, 0.5871, 0.1181];
export function sparkDirHead(): [number, number, number] {
  return SPARK_AXIS;
}
/**
 * Radians. Local +Y spin applied before the axis alignment.
 * 280° on the right lays the ground strap flat in the chamber so the outer face
 * stays off the crown. 100° is that roll plus a half turn, which mirrors it on
 * the left bank. The bore is 9° off the cover normal, so the 90° elbow leaves
 * nearly in the plane of the lid; the lead approaches from outside the cover.
 */
export function sparkRoll(s: 1 | -1): number {
  return (s > 0 ? 280 : 100) * Math.PI / 180;
}
/** Bosch W-series: M14×1.25, 19 mm reach, gasket seat. */
export const SPARK_REACH = 19;
/** How far the centre electrode projects past the shell end, mm. */
export const SPARK_PROJ = 1.6;
/** Internal minor diameter of M14×1.25 (ISO D1 = D − 1.082532·P), mm. The head bore is this cylinder. */
export const SPARK_MINOR_D = 14 - 1.082532 * 1.25;
/** Plug-local Y of the gasket seat. Reach is measured from the shell end. */
export const SPARK_SEAT_Y = -(SPARK_PROJ + SPARK_REACH);
/** Hex across flats, mm. */
export const SPARK_HEX_AF = 20.8;
/**
 * Plug-local Y of the terminal nut the connector grips.
 * Engine point = tip + (−SPARK_NIPPLE_Y) · axis.
 */
export const SPARK_NIPPLE_Y = -70;
/**
 * Distance along the axis from the tip to the connector's seal flange.
 * The cover seat moved +17 mm outboard; this is the new crossing of the
 * collar (cover-local z ≈ 24), the same station the flange used before the move.
 */
export const SPARK_FLANGE_T = 156.7;
/** Machined through-hole in the upper cover, mm radius. The seal flange is 0.12 mm larger. */
export const SPARK_HOLE_R = 13;
/** Connector tube outer radius, mm. It clears the cover hole; only the flange seats. */
export const SPARK_TUBE_R = 7.6;
/** Elbow bend radius, mm. The outlet runs in plug-local +X, off the lid. */
export const SPARK_BEND_R = 16;
/**
 * Plug-local point the ignition lead enters: the elbow outlet, 8 mm past the bend.
 * The straight tube ends 12 mm outside the flange; the quarter bend drops another
 * `SPARK_BEND_R` and turns to +X.
 */
export const SPARK_MOUTH: [number, number, number] = [SPARK_BEND_R + 8, -(SPARK_FLANGE_T + 12) - SPARK_BEND_R, 0];
/**
 * Head-local distance along the axis from the tip to where the wrench well
 * leaves the casting. The hex and the ceramic are inside it; past this station
 * the plug is in the rocker gallery, not in the head.
 */
export const SPARK_WELL_T = 78;
/** Electrode tip in the engine frame. */
export function plugTipEngine(cyl: number): [number, number, number] {
  const s = cyl <= 3 ? 1 : -1;
  return [s * (CYL_TOP_X + SPARK_TIP.x), SPARK_TIP.y, CYL_Z[cyl] + s * SPARK_Z];
}
/** Unit axis in the engine frame, tip toward the cover. Left heads mirror X and Z. */
export function plugAxisEngine(cyl: number): [number, number, number] {
  const s = cyl <= 3 ? 1 : -1;
  const [dx, dy, dz] = SPARK_AXIS;
  const x = s * dx, y = dy, z = s * dz;
  const L = Math.hypot(x, y, z);
  return [x / L, y / L, z / L];
}
export const INTAKE_PORT = { x: CYL_TOP_X + 26, y: 65 }; // runner flange seats on the head intake flange (top y 65)
/** Injector seat in the intake runner (runner-local, right bank) and its axis. */
export const INJ = { dx: 8, dy: 50, ux: 0.84, uy: 0.54 };
