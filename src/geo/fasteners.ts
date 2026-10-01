/**
 * Fastener hardware geometry. Every set in data/fastenerSpec.ts gets its items here: seat point p (on the face the
 * head/nut bears on, engine frame mm), axis n (unit, pointing OUT of the joint, i.e. from the seat toward the head),
 * the part it seats on and the part it threads into. Group assets are built as InstancedMesh (one per prototype
 * mesh), studs that stay in the threaded part are added to that part's asset (see assets.ts).
 */
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Part, yToZ, hexNut, cyl, lathe, mesh } from './util';
import { MatKey } from './materials';
import { CYL_Z, CYL_TOP_X, INTAKE_PORT } from '../data/layout';
import { HEAD_HW, CASE_TB, CASE_LUG } from './hwLayout';
export { HEAD_HW, CASE_TB, CASE_LUG };
import { coverMatrix, VC_EARS, VC_EDGE, chainCoverBolts, chainHousingStuds, HOUSING_Z1, bankZ, ROCKER_TOWER, CHAIN_LID } from './core';
import { EXH_PORT, FAN, FLY_Z, SUMP, THERMO, BREATHER, OIL_PUMP } from './aux';

export type Kind = 'nut' | 'lock' | 'barrel' | 'cap' | 'bolt' | 'pan';
export interface FItem { p: THREE.Vector3; n: THREE.Vector3; seat: string; into: string; stud?: boolean }
export interface FSet {
  id: string; kind: Kind; M: number; mat: MatKey;
  washer: number; // washer radius (0 = none)
  len: number; // bolt/screw shank length below the seat face
  grip: number; // seat face -> threaded part face (studs)
  embed: number; // stud thread engagement in the threaded part
  items: FItem[];
}
/** Nominal hardware dimensions by thread size (mm). */
export const DIM: Record<number, { af: number; h: number; wr: number; wt: number }> = {
  6: { af: 10, h: 5, wr: 6.25, wt: 1.2 }, 8: { af: 13, h: 6.5, wr: 8, wt: 1.6 }, 10: { af: 17, h: 8, wr: 10, wt: 2 },
  12: { af: 19, h: 10, wr: 12, wt: 2.5 }, 16: { af: 24, h: 13, wr: 15, wt: 3 },
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
      ({ p: headW(c, HEAD_HW.barrel.x, a * r45, d * r45), n: headN(c, 1, 0, 0), seat: `head-${c}`, into: `crankcase-${b}` }))));
    // cam housing -> head
    const { y: cy, z: cz } = HEAD_HW.camStud;
    set(`cam-housing-nuts-${b}`, 'nut', 8, { washer: 7, grip: 10, embed: 14 }, cyls.flatMap((c) => [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([a, d]) =>
      ({ p: headW(c, 71, a * cy, d * cz), n: headN(c, 1, 0, 0), seat: `cam-housing-${b}`, into: `head-${c}`, stud: true }))));
    // valve covers: nuts on the ear tops (cover-local z = 7), studs in the cam-housing rails
    for (const upper of [true, false]) {
      const m = coverMatrix(s, upper), nm = new THREE.Matrix3().getNormalMatrix(m), u = upper ? 'upper' : 'lower';
      const items: FItem[] = [];
      for (const yy of VC_EARS(upper)) for (const xx of [-VC_EDGE, VC_EDGE])
        items.push({ p: V(xx, yy, 7).applyMatrix4(m), n: V(0, 0, 1).applyMatrix3(nm).normalize(), seat: `valve-cover-${u}-${b}`, into: `cam-housing-${b}`, stud: true });
      set(`valve-cover-nuts-${u}-${b}`, 'nut', 8, { washer: DIM[8].wr, grip: 7, embed: 10 }, items);
    }
    // chain-housing cover
    set(`chain-cover-nuts-${b}`, 'lock', 6, { washer: DIM[6].wr, grip: CHAIN_LID.top - HOUSING_Z1, embed: 12 },
      chainCoverBolts(s).map((q) => ({ p: V(q.x, q.y, CHAIN_LID.top), n: V(0, 0, 1), seat: `chain-housing-lid-${b}`, into: `chain-housing-${b}`, stud: true })));
    // chain housing -> crankcase (inside the box, on the inner-edge flange)
    set(`chain-housing-nuts-${b}`, 'nut', 8, { washer: DIM[8].wr, grip: 6, embed: 14 },
      chainHousingStuds(s).map((q) => ({ p: V(q.x, q.y, q.z), n: V(s, 0, 0), seat: `chain-housing-${b}`, into: `crankcase-${b}`, stud: true })));
    // intake pipes: nuts on the runner flange top
    const { x: ix, z: iz } = HEAD_HW.intake;
    set(`intake-nuts-${b}`, 'lock', 8, { washer: DIM[8].wr, grip: 8, embed: 10 }, cyls.flatMap((c) => [-1, 1].map((d) =>
      ({ p: headW(c, ix, INTAKE_PORT.y + 8, d * iz), n: V(0, 1, 0), seat: `intake-runner-${c}`, into: `head-${c}`, stud: true }))));
    // heat exchanger port flanges: nuts on the flange underside
    const { x: ex, z: ez } = HEAD_HW.exhaust;
    set(`exhaust-nuts-${b}`, 'nut', 8, { mat: 'brass', grip: 7.2, embed: 12 }, cyls.flatMap((c) => [-1, 1].map((d) =>
      ({ p: headW(c, ex, EXH_PORT.y - 6.6, d * ez), n: V(0, -1, 0), seat: `heat-exchanger-${b}`, into: `head-${c}`, stud: true }))));
    // rocker shafts: screw head on the +z tower face, nut on the -z face
    const T = ROCKER_TOWER;
    const zs = bankZ(s);
    set(`rocker-shaft-screws-${b}`, 'pan', 6, { len: 2 * T.face + 2, mat: 'darkSteel' }, zs.flatMap((zc) => [T.y, -T.y].map((y) =>
      ({ p: V(s * T.x, y, zc + T.face), n: V(0, 0, 1), seat: `cam-housing-${b}`, into: `rockers-${b}` }))));
    set(`rocker-shaft-nuts-${b}`, 'nut', 6, { mat: 'darkSteel' }, zs.flatMap((zc) => [T.y, -T.y].map((y) =>
      ({ p: V(s * T.x, y, zc - T.face), n: V(0, 0, -1), seat: `cam-housing-${b}`, into: `rockers-${b}` }))));
  }
  // crankcase through-bolts across the main webs: heads right, cap nuts left; the 12th position is a stud with 2 cap nuts
  const TB = CASE_TB;
  const tb = TB.z.flatMap((z) => TB.y.map((y) => ({ y, z })));
  const studAt = tb.length - 1;
  set('case-through-bolts', 'bolt', 10, { washer: DIM[10].wr, len: 2 * TB.x + 8, mat: 'darkSteel' }, tb.filter((_, i) => i !== studAt).map(({ y, z }) =>
    ({ p: V(TB.x, y, z), n: V(1, 0, 0), seat: 'crankcase-right', into: 'crankcase-left' })));
  set('case-through-nuts', 'cap', 10, { washer: DIM[10].wr, grip: 2 * TB.x, embed: 0, mat: 'darkSteel' }, [
    ...tb.map(({ y, z }) => ({ p: V(-TB.x, y, z), n: V(-1, 0, 0), seat: 'crankcase-left', into: 'crankcase-right' })),
    { p: V(TB.x, tb[studAt].y, tb[studAt].z), n: V(1, 0, 0), seat: 'crankcase-right', into: 'crankcase-left', stud: true },
  ]);
  // perimeter: studs in the right half, lock nuts on the left-half lugs
  set('case-perimeter-nuts', 'lock', 8, { washer: DIM[8].wr, grip: 2 * CASE_LUG.x, embed: 14 }, [
    ...CASE_LUG.top.map((z) => ({ p: V(-CASE_LUG.x, CASE_LUG.yTop, z), n: V(-1, 0, 0), seat: 'crankcase-left', into: 'crankcase-right', stud: true })),
    ...CASE_LUG.bottom.map((z) => ({ p: V(-CASE_LUG.x, CASE_LUG.yBot, z), n: V(-1, 0, 0), seat: 'crankcase-left', into: 'crankcase-right', stud: true })),
  ]);
  const ring = (n: number, r: number, a0 = 0) => Array.from({ length: n }, (_, i) => a0 + (i / n) * Math.PI * 2).map((a) => [r * Math.cos(a), r * Math.sin(a)]);
  // flywheel bolts (seat on the hub rear face), clutch bolts (seat on the cover flange)
  set('flywheel-bolts', 'pan', 10, { len: 21, mat: 'darkSteel' }, ring(9, 36).map(([x, y]) => ({ p: V(x, y, FLY_Z - 14), n: V(0, 0, -1), seat: 'flywheel', into: 'crankshaft' })));
  set('clutch-bolts', 'pan', 8, { washer: 7, len: 14, mat: 'darkSteel' }, ring(9, 129, 0.2).map(([x, y]) => ({ p: V(x, y, FLY_Z - 34.6), n: V(0, 0, -1), seat: 'pressure-plate', into: 'flywheel' })));
  set('pulley-bolt', 'bolt', 12, { washer: 24, len: 40, mat: 'darkSteel' }, [{ p: V(0, 0, 324), n: V(0, 0, 1), seat: 'crank-pulley', into: 'crankshaft' }]);
  set('fan-pulley-nut', 'nut', 16, { washer: 20, grip: 24, embed: 6, mat: 'darkSteel' }, [{ p: V(0, FAN.y, FAN.zBelt + 10), n: V(0, 0, 1), seat: 'fan-pulley', into: 'alternator', stud: true }]);
  set('oil-pump-nuts', 'nut', 8, { grip: 20, embed: 4 }, OIL_PUMP.studs.map(([x, y]) => ({ p: V(x, y, OIL_PUMP.coverFace), n: V(0, 0, -1), seat: 'oil-pump', into: 'oil-pump', stud: true })));
  set('sump-nuts', 'nut', 6, { washer: DIM[6].wr, grip: SUMP.grip, embed: 12 }, ring(12, SUMP.boltR, Math.PI / 12).map(([x, z]) =>
    ({ p: V(x, SUMP.seatY, SUMP.zc + z), n: V(0, -1, 0), seat: 'sump-plate', into: x > 0 ? 'crankcase-right' : 'crankcase-left', stud: true })));
  set('thermostat-nuts', 'lock', 6, { washer: DIM[6].wr, grip: THERMO.grip, embed: 10 }, ring(3, 22).map(([dx, dz]) =>
    ({ p: V(THERMO.x + dx, THERMO.seatY, THERMO.z + dz), n: V(0, -1, 0), seat: 'oil-thermostat', into: 'crankcase-right', stud: true })));
  set('breather-nuts', 'nut', 6, { washer: DIM[6].wr, grip: BREATHER.grip, embed: 10 }, BREATHER.studs.map(([x, z]) =>
    ({ p: V(x, BREATHER.seatY, z), n: V(0, 1, 0), seat: 'breather-lid', into: 'crankcase-left', stud: true })));
  cache = out;
  return out;
}
/** Height of the hardware above its seat face (washer + head/nut), mm. */
export function headHeight(f: FSet) {
  const d = DIM[f.M]; const wt = f.washer ? d.wt : 0;
  switch (f.kind) {
    case 'barrel': return wt + 13;
    case 'lock': return wt + d.h * 1.3;
    case 'cap': return wt + 0.7 * d.h + 0.22 * d.af;
    case 'bolt': return wt + 0.7 * f.M;
    case 'pan': return wt + 0.6 * f.M;
    default: return wt + d.h;
  }
}
/** Bearing radius of the head/nut/washer on the seat face. */
export function bearingR(f: FSet) {
  const d = DIM[f.M];
  if (f.washer) return f.washer;
  if (f.kind === 'pan') return 0.95 * f.M;
  return 0.5 * d.af;
}
/** Prototype hardware along +Y with the seat face at y = 0 (head/nut up, shank down). */
function prototype(f: FSet): Part {
  const p = new Part(); const d = DIM[f.M]; const M = f.M;
  let y = 0;
  if (f.washer) { p.add(lathe([[M / 2 + 0.4, 0], [f.washer, 0], [f.washer, d.wt], [M / 2 + 0.4, d.wt]], 20), 'zincPlate'); y = d.wt; }
  const hexAt = (h: number, y0: number, af = d.af) => { const g = hexNut(af, h); g.translate(0, y0 + h / 2, 0); return g; };
  switch (f.kind) {
    case 'nut': p.add(hexAt(d.h, y), f.mat); break;
    case 'lock': p.add(hexAt(d.h, y), f.mat); p.add(lathe([[d.af * 0.45, 0], [d.af * 0.45, d.h * 0.3], [M * 0.55, d.h * 0.3], [M * 0.55, 0]], 16), 'blackPlastic', [0, y + d.h, 0]); break;
    case 'barrel': p.add(lathe([[0.1, 0], [d.af * 0.5, 0], [d.af * 0.5, 9], [d.af * 0.42, 13], [0.1, 13]], 12), f.mat, [0, y, 0]); break;
    case 'cap': p.add(hexAt(0.7 * d.h, y), f.mat); p.add(lathe([[0.1, d.af * 0.22], [d.af * 0.2, d.af * 0.19], [d.af * 0.38, d.af * 0.08], [d.af * 0.45, 0]], 14), f.mat, [0, y + 0.7 * d.h, 0]); break;
    case 'bolt': p.add(hexAt(0.7 * M, y, M === 10 ? 17 : d.af), f.mat); break;
    case 'pan': p.add(lathe([[0.1, 0.6 * M], [0.6 * M, 0.6 * M], [0.9 * M, 0.25 * M], [0.95 * M, 0], [0.1, 0]], 18), f.mat, [0, y, 0]); break;
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
export function fastenerGroup(f: FSet): THREE.Object3D {
  const g = new THREE.Group(); g.name = f.id;
  const proto = prototype(f);
  proto.g.updateMatrixWorld(true);
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  proto.g.children.forEach((c) => {
    const me = c as THREE.Mesh; let geo = me.geometry.clone().applyMatrix4(me.matrixWorld);
    if (geo.index) geo = geo.toNonIndexed();
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
    const m = me.material as THREE.Material; byMat.set(m, [...(byMat.get(m) ?? []), geo]);
  });
  byMat.forEach((geos, material) => {
    const geo = mergeVertices(mergeGeometries(geos, false)!, 1e-3);
    const im = new THREE.InstancedMesh(geo, material, f.items.length);
    f.items.forEach((it, i) => im.setMatrixAt(i, itemMatrix(it)));
    im.instanceMatrix.needsUpdate = true; im.computeBoundingBox(); im.computeBoundingSphere();
    g.add(im);
  });
  return g;
}
/** Stud geometry (engine frame) for a set's stud items: from inside the threaded part up into/through the nut. */
export function studGeometry(f: FSet, it: FItem): THREE.BufferGeometry {
  const d = DIM[f.M];
  const top = headHeight(f) - (f.kind === 'barrel' ? 3 : f.kind === 'cap' ? d.h * 0.4 : -1.5);
  const bot = -(f.grip + f.embed);
  const g = cyl(f.M / 2 * 0.96, top - bot, 10); g.translate(0, (top + bot) / 2, 0);
  return g.applyMatrix4(itemMatrix(it));
}
export { mesh, yToZ };
