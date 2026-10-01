/**
 * Fastener hardware geometry. Every set in data/fastenerSpec.ts gets its items here: seat point p (on the face the
 * head/nut bears on, engine frame mm), axis n (unit, pointing OUT of the joint, i.e. from the seat toward the head),
 * the part it seats on and the part it threads into. Group assets are built as InstancedMesh (one per prototype
 * mesh), studs that stay in the threaded part are added to that part's asset (see assets.ts).
 */
import * as THREE from 'three';
import { instancedGroup } from './instancing';
import { Part, yToZ, hexNut, cyl, lathe, mesh } from './util';
import { MatKey } from './materials';
import { CYL_Z, CYL_TOP_X, INTAKE_PORT, CAM_X, CASE_Z } from '../data/layout';
import { HEAD_HW, CASE_TB, CASE_LUG } from './hwLayout';
export { HEAD_HW, CASE_TB, CASE_LUG };
import { seat, probe } from './probe';
import { adjusterCover } from './smallParts';
import { END_PAD, railBolts, tensionerLayout, coverMatrix, VC_EARS, VC_EDGE, chainCoverBolts, chainHousingStuds, HOUSING_Z1, HOUSING_Z0, CHAIN_LID, CHAIN_Z, CAM_NOSE } from './core';
import { rockerStations, SHAFT } from './valvetrain';
import { chainEndStations, chainLidStations, VC_SPECIAL, shroudScrews } from './stations';
import { EXH_PORT, FAN, FLY_Z, SUMP, THERMO, BREATHER, OIL_PUMP, OIL_COOLER, DIST, AIRBOX_STRUTS, WUR } from './aux';

export type Kind = 'nut' | 'lock' | 'barrel' | 'cap' | 'bolt' | 'pan' | 'socket' | 'combi';
export interface FItem { p: THREE.Vector3; n: THREE.Vector3; seat: string; into: string; stud?: boolean }
export interface FSet {
  id: string; kind: Kind; M: number; mat: MatKey;
  washer: number; // washer radius (0 = none)
  spring?: boolean; // split spring washer under the nut/head (on top of the flat washer if any)
  tab?: boolean; // folded tab washer instead of a flat one
  len: number; // bolt/screw shank length below the seat face
  grip: number; // seat face -> threaded part face (studs)
  embed: number; // stud thread engagement in the threaded part
  items: FItem[];
}
/** Nominal hardware dimensions by thread size (mm). */
export const DIM: Record<number, { af: number; h: number; wr: number; wt: number }> = {
  6: { af: 10, h: 5, wr: 6.25, wt: 1.2 }, 8: { af: 13, h: 6.5, wr: 8, wt: 1.6 }, 10: { af: 17, h: 8, wr: 10, wt: 2 },
  12: { af: 19, h: 10, wr: 12, wt: 3.4 }, 16: { af: 24, h: 13, wr: 15, wt: 3 }, 5: { af: 8, h: 4, wr: 5, wt: 1 },
  22: { af: 32, h: 10, wr: 16, wt: 2.5 },
};
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const sides = [1, -1] as const;
const bname = (s: number) => (s > 0 ? 'right' : 'left');
const bankCyls = (s: number) => (s > 0 ? [1, 2, 3] : [4, 5, 6]);
/** Head-local (lx, ly, lz) -> engine frame for cylinder c (left heads are turned 180 deg about Y). */
function headW(c: number, lx: number, ly: number, lz: number) { const s = c <= 3 ? 1 : -1; return V(s * (CYL_TOP_X + lx), ly, CYL_Z[c] + s * lz); }
function headN(c: number, nx: number, ny: number, nz: number) { const s = c <= 3 ? 1 : -1; return V(s * nx, ny, s * nz); }

let cache: FSet[] | null = null;
export function fastenerSets(): FSet[] {
  if (cache) return cache;
  const out: FSet[] = [];
  const set = (id: string, kind: Kind, M: number, o: Partial<FSet>, items: FItem[]) =>
    out.push({ id, kind, M, mat: 'zincPlate', washer: 0, len: 0, grip: 0, embed: 0, ...o, items });
  for (const s of sides) {
    const b = bname(s), cyls = bankCyls(s);
    // head barrel nuts on the case head studs
    const r45 = HEAD_HW.barrel.r * Math.SQRT1_2;
    set(`head-nuts-${b}`, 'barrel', 10, { washer: DIM[10].wr, grip: HEAD_HW.barrel.x + CYL_TOP_X - 104, embed: 8, mat: 'darkSteel' }, cyls.flatMap((c) => [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([a, d]) =>
      ({ p: headW(c, HEAD_HW.barrel.x, a * r45, d * r45), n: headN(c, 1, 0, 0), seat: `head-${c}`, into: `crankcase-${b}`, stud: true }))));
    // cam housing -> head
    const { y: cy, z: cz } = HEAD_HW.camStud;
    set(`cam-housing-nuts-${b}`, 'nut', 8, { washer: 7, spring: true, grip: 10, embed: 14 }, cyls.flatMap((c) => [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([a, d]) =>
      ({ p: headW(c, 71, a * cy, d * cz), n: headN(c, 1, 0, 0), seat: `cam-housing-${b}`, into: `head-${c}`, stud: true }))));
    // valve covers: nuts on the ear tops (cover-local z = 7), studs in the cam-housing rails
    for (const upper of [true, false]) {
      const m = coverMatrix(s, upper), nm = new THREE.Matrix3().getNormalMatrix(m), u = upper ? 'upper' : 'lower';
      const items: FItem[] = [];
      VC_EARS(upper).forEach((yy, i) => { for (const xx of [-VC_EDGE, VC_EDGE]) if (upper || xx < 0 || !VC_SPECIAL.includes(i))
        items.push({ p: V(xx, yy, 7).applyMatrix4(m), n: V(0, 0, 1).applyMatrix3(nm).normalize(), seat: `valve-cover-${u}-${b}`, into: `cam-housing-${b}`, stud: true }); });
      set(`valve-cover-nuts-${u}-${b}`, 'nut', 8, { washer: DIM[8].wr, grip: 7, embed: 10 }, items);
    }
    // chain-housing cover
    set(`chain-cover-nuts-${b}`, 'lock', 6, { washer: DIM[6].wr, grip: CHAIN_LID.top - HOUSING_Z1, embed: 12 },
      chainCoverBolts(s).map((q) => ({ p: V(q.x, q.y, CHAIN_LID.top), n: V(0, 0, 1), seat: `chain-housing-lid-${b}`, into: `chain-housing-${b}`, stud: true })));
    // chain housing -> crankcase (inside the box, on the inner-edge flange)
    set(`chain-housing-nuts-${b}`, 'nut', 8, { washer: DIM[8].wr, spring: true, grip: 6, embed: 14 },
      chainHousingStuds(s).map((q) => ({ p: V(q.x, q.y, q.z), n: V(s, 0, 0), seat: `chain-housing-${b}`, into: `crankcase-${b}`, stud: true })));
    // intake pipes: nuts on the runner flange top
    const { x: ix, z: iz } = HEAD_HW.intake;
    set(`intake-nuts-${b}`, 'lock', 8, { washer: DIM[8].wr, grip: 8, embed: 10 }, cyls.flatMap((c) => [-1, 1].map((d) =>
      ({ p: headW(c, ix, INTAKE_PORT.y + 8, d * iz), n: V(0, 1, 0), seat: `intake-runner-${c}`, into: `head-${c}`, stud: true }))));
    // heat exchanger port flanges: nuts on the flange underside
    const { x: ex, z: ez } = HEAD_HW.exhaust;
    // per port: hex nut on the outer stud, socket-head nut on the stud tight against the barrel (202-00 #32/#33)
    for (const [id, kind, d] of [[`exhaust-nuts-${b}`, 'nut', 1], [`exhaust-socket-nuts-${b}`, 'socket', -1]] as const)
      set(id, kind, 8, { mat: 'brass', grip: 7.2, embed: 12 }, cyls.map((c) =>
        ({ p: headW(c, ex, EXH_PORT.y - 6.6, d * ez), n: V(0, -1, 0), seat: `heat-exchanger-${b}`, into: `head-${c}`, stud: true })));
    // rocker shafts: socket-head screw on the +z spot face, conical nut on the -z face, axis parallel to the cam
    const stations = rockerStations(s);
    set(`rocker-shaft-screws-${b}`, 'pan', 6, { len: SHAFT.half * 2 - 8, mat: 'darkSteel' }, stations.map((st) =>
      ({ p: V(st.x, st.y, st.z + st.half), n: V(0, 0, 1), seat: `cam-housing-${b}`, into: `rockers-${b}` })));
    set(`rocker-shaft-nuts-${b}`, 'nut', 6, { mat: 'darkSteel' }, stations.map((st) =>
      ({ p: V(st.x, st.y, st.z - st.half), n: V(0, 0, -1), seat: `cam-housing-${b}`, into: `rockers-${b}` })));
  }
  // crankcase through-bolts across the main webs: heads right, cap nuts left; the 12th position is a stud with 2 cap nuts
  const TB = CASE_TB;
  const tb = TB.z.flatMap((z) => TB.y.map((y) => ({ y, z })));
  const studAt = tb.length - 1;
  set('case-through-bolts', 'bolt', 10, { washer: 11, len: 2 * TB.x + 8, mat: 'darkSteel' }, tb.filter((_, i) => i !== studAt).map(({ y, z }) =>
    ({ p: V(TB.x, y, z), n: V(1, 0, 0), seat: 'crankcase-right', into: 'crankcase-left' })));
  set('case-through-nuts', 'cap', 10, { washer: DIM[10].wr, grip: 2 * TB.x, embed: 0, mat: 'darkSteel' },
    tb.map(({ y, z }) => ({ p: V(-TB.x, y, z), n: V(-1, 0, 0), seat: 'crankcase-left', into: 'crankcase-right' })));
  set('case-through-stud-nut', 'cap', 10, { washer: DIM[10].wr, grip: 2 * TB.x, embed: 0, mat: 'darkSteel' },
    [{ p: V(TB.x, tb[studAt].y, tb[studAt].z), n: V(1, 0, 0), seat: 'crankcase-right', into: 'crankcase-left', stud: true }]);
  // perimeter: studs in the right half, lock nuts on the left-half lugs
  set('case-perimeter-nuts', 'lock', 8, { washer: DIM[8].wr, grip: 2 * CASE_LUG.x, embed: 14 }, [
    ...CASE_LUG.top.map((z) => ({ p: V(-CASE_LUG.x, CASE_LUG.yTop, z), n: V(-1, 0, 0), seat: 'crankcase-left', into: 'crankcase-right', stud: true })),
    ...CASE_LUG.bottom.map((z) => ({ p: V(-CASE_LUG.x, CASE_LUG.yBot, z), n: V(-1, 0, 0), seat: 'crankcase-left', into: 'crankcase-right', stud: true })),
  ]);
  const ring = (n: number, r: number, a0 = 0) => Array.from({ length: n }, (_, i) => a0 + (i / n) * Math.PI * 2).map((a) => [r * Math.cos(a), r * Math.sin(a)]);
  // flywheel bolts (seat on the hub rear face), clutch bolts (seat on the cover flange)
  set('flywheel-bolts', 'pan', 10, { len: 21, mat: 'darkSteel' }, ring(9, 36).map(([x, y]) => ({ p: V(x, y, FLY_Z - 14), n: V(0, 0, -1), seat: 'flywheel', into: 'crankshaft' })));
  set('clutch-bolts', 'pan', 8, { spring: true, len: 14, mat: 'darkSteel' }, ring(9, 129, 0.2).map(([x, y]) => ({ p: V(x, y, FLY_Z - 34.6), n: V(0, 0, -1), seat: 'pressure-plate', into: 'flywheel' })));
  set('pulley-bolt', 'bolt', 12, { washer: 12.5, len: 22, mat: 'zincPlate' }, [{ p: V(0, 0, 324), n: V(0, 0, 1), seat: 'crank-pulley', into: 'crankshaft' }]);
  set('fan-pulley-nut', 'nut', 16, { washer: 20, grip: 24, embed: 6, mat: 'darkSteel' }, [{ p: V(0, FAN.y, FAN.zBelt + 10), n: V(0, 0, 1), seat: 'fan-pulley', into: 'alternator', stud: true }]);
  set('oil-pump-nuts', 'nut', 8, { tab: true, grip: 20, embed: 4 }, OIL_PUMP.studs.slice(0, 3).map(([x, y]) => ({ p: V(x, y, OIL_PUMP.coverFace), n: V(0, 0, -1), seat: 'oil-pump', into: 'oil-pump', stud: true })));
  set('sump-nuts', 'nut', 6, { spring: true, grip: SUMP.grip, embed: 12 }, ring(12, SUMP.boltR, Math.PI / 12).map(([x, z]) =>
    ({ p: V(x, SUMP.seatY, SUMP.zc + z), n: V(0, -1, 0), seat: 'sump-plate', into: x > 0 ? 'crankcase-right' : 'crankcase-left', stud: true })));
  set('thermostat-nuts', 'lock', 6, { washer: DIM[6].wr, grip: THERMO.grip, embed: 10 }, ring(3, 22).map(([dx, dz]) =>
    ({ p: V(THERMO.x + dx, THERMO.seatY, THERMO.z + dz), n: V(0, -1, 0), seat: 'oil-thermostat', into: 'crankcase-right', stud: true })));
  set('breather-nuts', 'nut', 6, { spring: true, grip: BREATHER.grip, embed: 10 }, BREATHER.studs.map(([x, z]) =>
    ({ p: V(x, BREATHER.seatY, z), n: V(0, 1, 0), seat: 'breather-lid', into: 'crankcase-left', stud: true })));
  for (const s of sides) {
    const b = bname(s);
    // cam sprocket nut + spring washer (103-10/-15 #40/#41) on the cam nose thread, seated on the sprocket hub face
    set(`cam-nut-${b}`, 'nut', 22, { spring: true, mat: 'darkSteel' }, [{ p: V(CAM_X * s, 0, CHAIN_Z[s] + CAM_NOSE.hubFace), n: V(0, 0, 1), seat: `cam-sprocket-${b}`, into: `camshaft-${b}` }]);
    // chain-housing end studs from the cam-housing end face through the box back wall (nuts inside the box)
    set(`chain-end-nuts-${b}`, 'nut', 8, { washer: 7, spring: true, grip: END_PAD.z1 - END_PAD.z0, embed: 12 }, chainEndStations(s).map((q) => ({ p: q, n: V(0, 0, 1), seat: `chain-housing-${b}`, into: `cam-housing-${b}`, stud: true })));
    // valve-cover special nuts (103-05 #24): stud-nuts on 3 outboard lower-cover ears per bank
    const m = coverMatrix(s, false), nm = new THREE.Matrix3().getNormalMatrix(m);
    set(`valve-cover-special-${b}`, 'cap', 8, { washer: DIM[8].wr, len: 14, mat: 'darkSteel' }, VC_SPECIAL.map((i) => ({ p: V(VC_EDGE, VC_EARS(false)[i], 7).applyMatrix4(m), n: V(0, 0, 1).applyMatrix3(nm).normalize(), seat: `valve-cover-lower-${b}`, into: `cam-housing-${b}` })));
  }
  // chain-housing lid nuts (103-05 '-' 3 nuts + spring washers): long studs from the box back wall through the lid
  for (const s of sides) set(`chain-lid-nuts-${bname(s)}`, 'nut', 8, { spring: true, grip: CHAIN_LID.top - HOUSING_Z0, embed: 0 }, chainLidStations(s).map((q) => ({ p: V(q.x, q.y, CHAIN_LID.top), n: V(0, 0, 1), seat: `chain-housing-lid-${bname(s)}`, into: `chain-housing-${bname(s)}`, stud: true })));
  // oil cooler (104-00 #5/#9): 4 nuts + spring washers on case studs through the cooler feet
  set('oil-cooler-nuts', 'nut', 8, { spring: true, grip: OIL_COOLER.foot, embed: 12 }, OIL_COOLER.studs.map(([x, z]) => ({ p: V(x, OIL_COOLER.footTop, z), n: V(0, 1, 0), seat: 'oil-cooler', into: 'crankcase-left', stud: true })));
  // distributor clamp nut (901-00 #5-#7): washer + spring washer, stud in the left case half
  set('distributor-nut', 'nut', 8, { washer: DIM[8].wr, spring: true, grip: DIST.clampTop - DIST.caseY, embed: 12 }, [{ p: V(DIST.stud[0], DIST.clampTop, DIST.stud[1]), n: V(0, 1, 0), seat: 'distributor-clamp', into: 'crankcase-left', stud: true }]);
  // fan impeller to hub-extension nuts (105-00 #4/#5)
  set('fan-nuts', 'nut', 6, { spring: true, grip: 3, embed: 8 }, ring(6, 34, Math.PI / 6).map(([x, y]) => ({ p: V(x, FAN.y + y, FAN.zFan + 8), n: V(0, 0, 1), seat: 'fan-impeller', into: 'fan-hub', stud: true })));
  // air-guide (shroud) screws (105-05 #10-#12, #17)
  for (const g of shroudScrews()) set(g.id, g.kind, g.M, { washer: g.washer, len: g.len, mat: 'zincPlate' }, g.items);
  // air-cleaner strut nuts (106-00 #23/#24)
  set('airbox-strut-nuts', 'nut', 8, { spring: true, grip: 6, embed: 10 }, AIRBOX_STRUTS.map((q) => ({ p: V(q[0], q[1], q[2]), n: V(0, 1, 0), seat: 'airbox-struts', into: 'plenum', stud: true })));
  // warm-up regulator nuts on the case (107-10 #55/#56: pan screws + spring washers)
  set('wur-screws', 'pan', 6, { spring: true, len: 12 }, WUR.screws.map(([x, z]) => ({ p: V(x, WUR.flangeTop, z), n: V(0, 1, 0), seat: 'warm-up-regulator', into: 'crankcase-left' })));
  // guide-rail bolts (103-10/15 #3; sealing rings #4 are a small-part set) through rail + carrier into the box back wall
  for (const s of sides) { const b = bname(s); set(`rail-bolts-${b}`, 'bolt', 6, { washer: 7, len: CHAIN_Z[s] + 11.1 - (HOUSING_Z0 + 4) + 8, mat: 'darkSteel' }, railBolts(s).map((q) => ({ p: q.clone(), n: V(0, 0, 1), seat: `chain-tensioner-${b}`, into: `chain-housing-${b}` }))); }
  // chain-adjuster cover screws (103-10/15 #32/#33): 3 combination screws + spring washers into the lid
  for (const s of sides) { const b = bname(s); const T = tensionerLayout(s); const c = adjusterCover(s);
    set(`adjuster-cover-screws-${b}`, 'combi', 5, { spring: true, len: 8, mat: 'zincPlate' }, ring(3, 24.5, 0.5).map(([dx, dy]) => ({ p: V(c.x + dx, c.y + dy, CHAIN_LID.top + 3.5), n: V(0, 0, 1), seat: `adjuster-cover-${b}`, into: `chain-housing-lid-${b}` }))); }
  // odd crankcase hardware: 101-10 #11 hex bolt, #20/#21 washer + lock nut, 101-05 #22/#23 spring washer + M10 nut (E positions)
  set('case-right-bolt', 'bolt', 8, { washer: 0, len: 16, mat: 'zincPlate' }, [{ p: caseFlat(1, [[30, -95]]), n: V(0, 1, 0), seat: 'crankcase-right', into: 'crankcase-right' }]);
  set('case-right-nut', 'lock', 8, { washer: DIM[8].wr, grip: 0, embed: 12 }, [{ p: caseFlat(1, [[30, 55]]), n: V(0, 1, 0), seat: 'crankcase-right', into: 'crankcase-right', stud: true }]);
  set('case-m10-nut', 'nut', 10, { spring: true, grip: 0, embed: 14 }, [{ p: caseTop(-40, -186, -1, true), n: V(0, -1, 0), seat: 'crankcase-left', into: 'crankcase-left', stud: true }]);
  cache = out;
  return out;
}
/** First flat (level within 0.05 mm over r 6) spot on the case top near the given candidates (build time). */
function caseFlat(s: 1 | -1, cands: [number, number][]) {
  const id = s > 0 ? 'crankcase-right' : 'crankcase-left';
  for (const [x0, z0] of cands) for (let dx = -12; dx <= 12; dx += 3) for (let dz = -12; dz <= 12; dz += 3) {
    const x = x0 + dx, z = z0 + dz; const h = probe(id, V(x, 400, z), V(0, -1, 0)); if (!h) continue;
    const ok = [[6, 0], [-6, 0], [0, 6], [0, -6], [4, 4], [-4, -4]].every(([a, b]) => { const q = probe(id, V(x + a, 400, z + b), V(0, -1, 0)); return q && Math.abs(q.point.y - h.point.y) < 0.05; });
    if (ok) return h.point.clone();
  }
  throw new Error('caseFlat: no flat spot');
}
/** Seat point on the case top (or bottom) found by probing (build time). */
function caseTop(x: number, z: number, s: 1 | -1, bottom = false) {
  const id = s > 0 ? 'crankcase-right' : 'crankcase-left';
  return seat(id, V(x, bottom ? -400 : 400, z), V(0, bottom ? 1 : -1, 0), 800);
}
/** Stud-only sets: studs that stay in their host part with no nut of their own in the model (bellhousing etc.). */
export interface StudSet { id: string; M: number; len: number; into: string; items: { p: THREE.Vector3; n: THREE.Vector3 }[] }
export function studSets(): StudSet[] {
  const bell = (s: 1 | -1, n: number) => Array.from({ length: n }, (_, i) => { const a = (s > 0 ? -0.6 : Math.PI + 0.6) + s * i * 0.55; return { p: V(Math.min(Math.max(150 * Math.cos(a), -98), 98), 112 * Math.sin(a), CASE_Z.flywheel), n: V(0, 0, -1) }; });
  return [
    { id: 'bellhousing-studs-right', M: 10, len: 45, into: 'crankcase-right', items: bell(1, 2) },
    { id: 'bellhousing-studs-left', M: 10, len: 45, into: 'crankcase-left', items: bell(-1, 3) },
  ];
}
export function studSetGeometry(st: StudSet, it: { p: THREE.Vector3; n: THREE.Vector3 }) {
  const g = cyl(st.M / 2 * 0.96, st.len + 14, 10); g.translate(0, (st.len - 14) / 2, 0);
  return g.applyMatrix4(itemMatrix({ p: it.p, n: it.n, seat: '', into: st.into }));
}
/** Height of the hardware above its seat face (washer + head/nut), mm. */
export function headHeight(f: FSet) {
  if (f.id.startsWith('rocker-shaft-screws')) return 6;
  if (f.id.startsWith('rocker-shaft-nuts')) return 5.5;
  const d = DIM[f.M]; const wt = (f.washer || f.tab ? d.wt : 0) + (f.spring ? springT(f) : 0);
  switch (f.kind) {
    case 'barrel': return wt + 13;
    case 'lock': return wt + d.h * 1.3;
    case 'cap': return wt + 0.7 * d.h + 0.22 * d.af;
    case 'bolt': return wt + (f.M === 10 ? 10 : 0.7 * f.M);
    case 'pan': return wt + 0.6 * f.M;
    case 'combi': return wt + 0.65 * f.M;
    case 'socket': return wt + d.h;
    default: return wt + d.h;
  }
}
export const springT = (f: FSet) => Math.max(1, 0.22 * f.M);
/** Bearing radius of the head/nut/washer on the seat face. */
export function bearingR(f: FSet) {
  if (f.id.startsWith('rocker-shaft-screws')) return 5;
  if (f.id.startsWith('rocker-shaft-nuts')) return 7.2;
  const d = DIM[f.M];
  if (f.washer) return f.washer;
  if (f.tab) return d.wr;
  if (f.spring) return 0.5 * d.af * 0.85;
  if (f.kind === 'pan') return 0.95 * f.M;
  return 0.5 * d.af;
}
/** Prototype hardware along +Y with the seat face at y = 0 (head/nut up, shank down). */
function prototype(f: FSet): Part {
  const p = new Part(); const d = DIM[f.M]; const M = f.M;
  let y = 0;
  if (f.washer) { p.add(lathe([[M / 2 + 0.4, 0], [f.washer, 0], [f.washer, d.wt], [M / 2 + 0.4, d.wt]], 20), 'zincPlate'); y = d.wt; }
  if (f.tab) { // tab washer: flat ring + one tab folded up against a nut flat
    p.add(lathe([[M / 2 + 0.4, 0], [d.wr, 0], [d.wr, d.wt], [M / 2 + 0.4, d.wt]], 20), 'steel');
    const t = new THREE.BoxGeometry(d.af * 0.45, d.h * 0.8, d.wt); t.translate(0, d.wt + d.h * 0.4, d.af / 2 + d.wt / 2 + 0.1); p.add(t, 'steel'); y = d.wt;
  }
  if (f.spring) { const t = springT(f), ro = 0.5 * d.af * 0.85; p.add(lathe([[M / 2 + 0.3, 0], [ro, 0], [ro, t], [M / 2 + 0.3, t]], 16, 0.15, Math.PI * 2 - 0.3), 'darkSteel', [0, y, 0]); y += t; }
  const hexAt = (h: number, y0: number, af = d.af) => { const g = hexNut(af, h); g.translate(0, y0 + h / 2, 0); return g; };
  // Reshape the existing rocker-shaft sets to the photos. Other pan heads and nuts are unchanged.
  if (f.id.startsWith('rocker-shaft-screws')) {
    const hh = 6, hr = 5;
    // socket cap (photo 6): bearing face at y = 0, hex socket in the top
    p.add(lathe([[0.2, 0], [hr, 0], [hr, hh - 0.35], [hr - 0.2, hh], [2.45, hh], [2.45, hh - 3.1], [0.2, hh - 3.1]], 20), f.mat, [0, y, 0]);
    if (f.len > 0) { const g = cyl(M / 2, f.len, 12); g.translate(0, -f.len / 2, 0); p.add(g, 'steel'); }
    return p;
  }
  if (f.id.startsWith('rocker-shaft-nuts')) {
    const fr = 7.2, hh = 5.5;
    // conical flange nut (photo 7): flange on the seat, cone into the shaft, internal hex in the outer face
    p.add(lathe([
      [2.2, -5.6], [5.4, -0.3], [fr, 0], [fr, 1.5],
      [5.0, 1.7], [5.0, hh], [2.4, hh], [2.4, 2.2], [0.9, 2.2],
    ], 20), f.mat, [0, y, 0]);
    return p;
  }
  switch (f.kind) {
    case 'nut': p.add(hexAt(d.h, y), f.mat); break;
    case 'lock': p.add(hexAt(d.h, y), f.mat); p.add(lathe([[d.af * 0.45, 0], [d.af * 0.45, d.h * 0.3], [M * 0.55, d.h * 0.3], [M * 0.55, 0]], 16), 'blackPlastic', [0, y + d.h, 0]); break;
    case 'barrel': p.add(lathe([[0.1, 0], [d.af * 0.5, 0], [d.af * 0.5, 9], [d.af * 0.42, 13], [0.1, 13]], 12), f.mat, [0, y, 0]); break;
    case 'cap': p.add(hexAt(0.7 * d.h, y), f.mat); p.add(lathe([[0.1, d.af * 0.22], [d.af * 0.2, d.af * 0.19], [d.af * 0.38, d.af * 0.08], [d.af * 0.45, 0]], 14), f.mat, [0, y + 0.7 * d.h, 0]); break;
    case 'bolt': {
      // M10 case through-bolts: full hex head (AF 17) so the head reads as a bolt, not a plain rod
      const af = M === 10 ? 17 : d.af, hh = M === 10 ? 10 : 0.7 * M;
      p.add(hexAt(hh, y, af), f.mat);
      p.add(lathe([[M / 2 + 0.3, 0], [af * 0.46, 0], [af * 0.5, 1.1], [M / 2 + 0.3, 1.1]], 6), f.mat, [0, y, 0]);
      break;
    }
    case 'pan': p.add(lathe([[0.1, 0.6 * M], [0.6 * M, 0.6 * M], [0.9 * M, 0.25 * M], [0.95 * M, 0], [0.1, 0]], 18), f.mat, [0, y, 0]); break;
    case 'combi': p.add(lathe([[0.1, 0], [d.af * 0.62, 0], [d.af * 0.62, 0.12 * M]], 18), f.mat, [0, y, 0]); p.add(hexAt(0.53 * M, y + 0.12 * M, d.af * 0.9), f.mat); break;
    case 'socket': p.add(lathe([[M / 2 + 0.3, 0], [d.af * 0.48, 0], [d.af * 0.48, d.h - 0.5], [d.af * 0.44, d.h], [M / 2 + 0.3, d.h]], 18), f.mat, [0, y, 0]); p.add(hexNut(d.af * 0.45, 0.6).translate(0, y + d.h - 0.2, 0), 'darkSteel'); break;
  }
  if (f.len > 0) { const g = cyl(M / 2, f.len, 10); g.translate(0, -f.len / 2, 0); p.add(g, 'steel'); }
  return p;
}
/** Instance transform: prototype +Y onto n, seat face at p. */
export function itemMatrix(it: FItem) {
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), it.n.clone().normalize());
  return new THREE.Matrix4().compose(it.p, q, V(1, 1, 1));
}
/** Group asset for one set: InstancedMesh per prototype mesh. */
export function fastenerGroup(f: FSet): THREE.Object3D { return instancedGroup(f.id, prototype(f), f.items.map(itemMatrix)); }
/** Stud geometry (engine frame) for a set's stud items: from inside the threaded part up into/through the nut. */
export function studGeometry(f: FSet, it: FItem): THREE.BufferGeometry {
  const d = DIM[f.M];
  const top = headHeight(f) - (f.kind === 'barrel' ? 3 : f.kind === 'cap' ? d.h * 0.4 : -1.5);
  const bot = -(f.grip + f.embed);
  const g = cyl(f.M / 2 * 0.96, top - bot, 10); g.translate(0, (top + bot) / 2, 0);
  return g.applyMatrix4(itemMatrix(it));
}
export { mesh, yToZ };
