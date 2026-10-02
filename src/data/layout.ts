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

/**
 * Spark plug axis, head-local. One plug per cylinder. These numbers are the whole
 * aim and they are not final — the entry direction is still being checked.
 * `COVER_BOOT_HOLE` is the matching switch for a round connector hole in a cover,
 * outside the gasket, and it stays off until that is decided.
 *
 * Provisional until the catalogue audit of the plug entry. Not a photo decision.
 * Tip (12, −8, 28), 58° outboard, 24° along the row. The shell clears both valve
 * heads, the exhaust-flange plate and the cam-housing stud nuts. The heat
 * exchanger stays well clear. The terminal boot meets the cam-housing wall, so
 * the housing is relieved on this same axis.
 *
 * partPose: position is the electrode tip. The quaternion maps plug-local (0, −1, 0)
 * onto the engine axis (s·dx, dy, s·dz), with SPARK_ROLL about local +Y applied first.
 * A plug-local point (0, y, 0) is tip + (−y) · axis in the engine frame.
 */
export const SPARK_TIP = { x: 12, y: -8 };
export const SPARK_Z = 28;
/** Radians. Lean about +Z from straight down (−Y), outboard as the plug leaves the chamber. */
export const SPARK_TILT = 58 * Math.PI / 180;
/**
 * Radians. Along-row lean, toward the neighbouring cylinder.
 * Provisional: 58° outboard and 24° along the row. Not a catalogue decision.
 */
export const SPARK_PITCH = 24 * Math.PI / 180;
/** Radians. Spin about the plug axis so a hex flat faces the barrel fins. */
export const SPARK_ROLL = 0;
/**
 * Round connector hole in the cover, outside the gasket rail.
 * Off until the entry direction is decided. When on, the hole is cut in the lower
 * cover (exhaust side) on the plug axis, outboard of the gasket.
 */
export const COVER_BOOT_HOLE = false;
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
 * Plug-local Y of the terminal nut the boot grips.
 * Engine point = tip + (−SPARK_NIPPLE_Y) · axis.
 */
export const SPARK_NIPPLE_Y = -70;
/**
 * Plug-local Y inside the boot, where the lead ends. The boot surrounds the terminal nut;
 * this point is in that rubber, not past it.
 */
/**
 * Plug-local Y inside the boot, where the lead ends. The boot surrounds the terminal nut
 * and stops just behind it: further along the axis the housing rail is 5.6 mm from the
 * centre, and a longer boot goes through that rail.
 */
export const SPARK_BOOT_Y = -72;
/**
 * Head-local distance along the axis from the tip to the end of the wrench well.
 * The casting is thicker than the 19 mm reach, so the spot-face is not yet the
 * outside of the head. The well is the counterbore from that face out through
 * the casting; the hex sits in it. It is not a final plug angle.
 */
export const SPARK_WELL_T = 92;
/** Unit axis in the head frame, from the electrode tip toward the boot. */
export function sparkDirHead(): [number, number, number] {
  const c = Math.cos(SPARK_TILT);
  return [Math.sin(SPARK_TILT), -c * Math.cos(SPARK_PITCH), -c * Math.sin(SPARK_PITCH)];
}
export const INTAKE_PORT = { x: CYL_TOP_X + 26, y: 65 }; // runner flange seats on the head intake flange (top y 65)
/** Injector seat in the intake runner (runner-local, right bank) and its axis. */
export const INJ = { dx: 8, dy: 50, ux: 0.84, uy: 0.54 };
