/** Fastener stations shared by part geometry (bosses, lugs, counterbores) and the hardware sets (fasteners.ts). */
import { MAIN_Z } from '../data/layout';

/** Head-local stud / nut patterns. */
export const HEAD_HW = {
  barrel: { x: 45, r: 57 }, // barrel-nut seat (top of the head core bosses), stud circle radius at 45 deg
  camStud: { y: 54, z: 28 }, // cam-housing studs (+-y, +-z)
  intake: { x: 26, z: 28 }, exhaust: { x: 34, z: 30 },
};
/** Through-bolt bosses: seat faces at |x|, bolt rows y, main-web z. */
export const CASE_TB = { x: 106, r: 11, y: [62, -62], z: MAIN_Z.filter((z) => z > -150).slice().sort((a, b) => a - b) };
/** Split-flange lugs: seat face |x|, lug centre heights, z stations (16 top, 8 bottom clear of the sump).
 * Top centres sit in the flat rail (y 112) so the bosses do not stand up as a fin comb. */
export const CASE_LUG = {
  x: 18, yTop: 104, yBot: -136, r: 8,
  top: Array.from({ length: 16 }, (_, i) => -188 + (i * (190 + 188)) / 15),
  bottom: [-188, -163, -138, -113, 115, 140, 165, 190],
};
