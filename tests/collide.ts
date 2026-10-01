/**
 * Assembled-pose interference checker. Every PartDef is built from ASSET_BUILDERS at its registry pose, flattened
 * to world-space triangles and eroded by `tol` mm along its vertex normals (so touching / seated faces don't count),
 * then all part pairs with overlapping bounds are tested triangle-vs-triangle with a BVH (three-mesh-bvh).
 */
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { ASSET_BUILDERS } from '../src/geo/assets';
import { PARTS } from '../src/data/parts';
import { fastenerSets } from '../src/geo/fasteners';

export interface Hit { a: string; b: string; tris: number; box: THREE.Box3 }
interface Solid { id: string; geom: THREE.BufferGeometry; bvh: MeshBVH; box: THREE.Box3 }

const cache = new Map<string, THREE.Object3D>();
function solid(id: string, asset: string, pos: number[] | undefined, rot: number[] | undefined, tol: number): Solid {
  if (!cache.has(asset)) cache.set(asset, ASSET_BUILDERS[asset]());
  const root = cache.get(asset)!;
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...((pos ?? [0, 0, 0]) as [number, number, number])),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...((rot ?? [0, 0, 0]) as [number, number, number]))),
    new THREE.Vector3(1, 1, 1),
  );
  root.updateMatrixWorld(true);
  const out: number[] = [];
  const v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
  root.traverse((o: any) => {
    if (!o.isMesh) return;
    let g: THREE.BufferGeometry = o.geometry;
    g = g.index ? g.toNonIndexed() : g.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    // instanced hardware: expand every instance
    const inst: THREE.Matrix4[] = o.isInstancedMesh ? Array.from({ length: o.count }, (_, i) => { const im = new THREE.Matrix4(); o.getMatrixAt(i, im); return im; }) : [new THREE.Matrix4()];
    for (const im of inst) {
      const w = m.clone().multiply(o.matrixWorld).multiply(im); nm.getNormalMatrix(w);
      const P = g.attributes.position, N = g.attributes.normal;
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(w); n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
        v.addScaledVector(n, -tol); out.push(v.x, v.y, v.z);
      }
    }
  });
  const geom = new THREE.BufferGeometry(); geom.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  const bvh = new MeshBVH(geom); geom.boundsTree = bvh as any; geom.computeBoundingBox();
  return { id, geom, bvh, box: geom.boundingBox!.clone() };
}

export function findCollisions(tol = 1, only?: (id: string) => boolean): Hit[] {
  const solids = PARTS.filter((p) => !only || only(p.id)).map((p) => solid(p.id, p.asset, p.position, p.rotation, tol));
  const hits: Hit[] = [];
  const I = new THREE.Matrix4();
  for (let i = 0; i < solids.length; i++)
    for (let j = i + 1; j < solids.length; j++) {
      const A = solids[i], B = solids[j];
      if (!A.box.intersectsBox(B.box)) continue;
      let tris = 0; const box = new THREE.Box3(); const seg = new THREE.Line3(), n1 = new THREE.Vector3(), n2 = new THREE.Vector3(), v0 = new THREE.Vector3();
      A.bvh.bvhcast(B.bvh, I, {
        intersectsTriangles(t1: any, t2: any) {
          // coplanar coincident faces are not a penetration (any real overlap also has crossing faces)
          t1.getNormal(n1); t2.getNormal(n2);
          if (Math.abs(n1.dot(n2)) > 0.9995 && Math.abs(n1.dot(v0.subVectors(t2.a, t1.a))) < 0.05) return false;
          if (!t1.intersectsTriangle(t2, seg)) return false;
          tris++; box.expandByPoint(seg.start).expandByPoint(seg.end); return tris >= 400;
        },
      } as any);
      if (tris) hits.push({ a: A.id, b: B.id, tris, box });
    }
  return hits;
}

/** Minimum surface-to-surface distance between two parts (mm, uneroded), via BVH closest-point queries. */
export function clearance(a: string, b: string): number {
  const def = (id: string) => PARTS.find((p) => p.id === id)!;
  const A = solid(a, def(a).asset, def(a).position, def(a).rotation, 0), B = solid(b, def(b).asset, def(b).position, def(b).rotation, 0);
  const t1: any = {}, t2: any = {};
  A.bvh.closestPointToGeometry(B.geom, new THREE.Matrix4(), t1, t2);
  return t1.distance ?? Infinity;
}

const id = (base: string) => new RegExp(`^(${base})(-[1-6]|-left|-right)?$`);
const pair = (a: string, b: string, why: string): [RegExp, RegExp, string] => [id(a), id(b), why];
const sameSide = (a: string, b: string, why: string): [RegExp, RegExp, string][] =>
  ['right', 'left'].map((sd) => [new RegExp(`^(${a})-${sd}$`), new RegExp(`^(${b})-${sd}$`), why] as [RegExp, RegExp, string]);

/**
 * Allowlist of pairs whose interpenetration (beyond the erosion tolerance) is expected. Everything else fails the
 * test. Two kinds, kept apart on purpose:
 *  - JOINT: real mating / seated / nested hardware (bolted faces, shafts in bores, gears in mesh, chain on sprockets).
 *  - SIMPLIFIED: pre-v3 modelling shortcuts where one part passes through a solid that is hollow / relieved on the
 *    real engine (case interior, valve guides, shroud cut-outs, piston valve reliefs). Listed explicitly so a new clash
 *    anywhere else — and any cam-drive vs exhaust contact — fails.
 */
export const MATING: [RegExp, RegExp, string][] = [
  // ---- JOINT: bottom end
  pair('crankcase-right', 'crankcase-left', 'JOINT case split flange'),
  pair('crankcase-right|crankcase-left', 'main-bearings|crankshaft|intermediate-shaft|crank-gears|cylinder|oil-pump|oil-cooler|oil-thermostat|sump-plate|breather-lid|distributor|fan-housing|upper-air-guide', 'JOINT seated in / bolted to the case'),
  ...sameSide('crankcase', 'chain-housing', 'JOINT chain box bolted to the case face / chain-well flange'),
  pair('crankshaft', 'main-bearings|conrod|crank-gears|crank-pulley|flywheel|pressure-plate', 'JOINT on the crank (journals, nose, flange)'),
  pair('conrod', 'piston', 'JOINT wrist pin'),
  pair('piston', 'cylinder', 'JOINT piston in bore'),
  pair('flywheel', 'clutch-disc|pressure-plate', 'JOINT clutch stack'), pair('clutch-disc', 'pressure-plate', 'JOINT clutch stack'),
  // ---- JOINT: top end
  pair('cylinder', 'head', 'JOINT cylinder/head sealing joint'),
  pair('head', 'valves|spark-plug|intake-runner', 'JOINT guides/seats, plug thread, intake port'),
  pair('cam-housing', 'head|camshaft|rockers|valves|valve-cover-upper|valve-cover-lower', 'JOINT cam housing on heads, bearings, rocker shafts, cover flanges'),
  pair('camshaft', 'rockers', 'JOINT lobes on rocker pads'), pair('rockers', 'valves', 'JOINT rocker tips on stems'),
  // ---- JOINT: cam drive (same bank only)
  ...sameSide('cam-housing', 'chain-housing', 'JOINT cam-housing end face gasketed into the chain box'),
  ...sameSide('camshaft', 'cam-sprocket', 'JOINT sprocket on cam nose'),
  ...sameSide('timing-chain', 'cam-sprocket|chain-tensioner', 'JOINT chain on cam sprocket / idler / guide ramps'),
  ...sameSide('chain-tensioner', 'chain-housing', 'JOINT idler shaft and adjuster seated in housing bosses'),
  ...sameSide('chain-housing', 'chain-housing-lid', 'JOINT cover on housing studs'),
  pair('intermediate-shaft', 'timing-chain|crank-gears|oil-pump', 'JOINT chains on int. sprockets, gear mesh, pump coupling'),
  pair('crankshaft', 'intermediate-shaft', 'JOINT gear mesh at the nose'),
  // ---- JOINT: exhaust, induction, fan
  pair('heat-exchanger', 'head', 'JOINT primaries in the exhaust ports'),
  pair('muffler', 'heat-exchanger', 'JOINT muffler inlet stubs over the HE outlets'),
  pair('injector', 'intake-runner|fuel-lines', 'JOINT injector in runner boss, fuel line on injector'),
  pair('plenum', 'intake-runner|air-filter|air-cleaner-lid|mixture-control-unit|fuel-lines', 'JOINT plenum fittings'),
  pair('air-filter', 'air-cleaner-lid|fuel-lines', 'JOINT air-cleaner drum'), pair('mixture-control-unit', 'fuel-lines|intake-runner', 'JOINT MCU lines'),
  pair('alternator', 'fan-pulley|fan-housing|fan-impeller|plenum', 'JOINT alternator in the fan housing, impeller on its shaft'),
  pair('fan-housing', 'fan-impeller', 'JOINT impeller in housing'), pair('fan-belt', 'fan-pulley|crank-pulley', 'JOINT belt in grooves'),
  // ---- SIMPLIFIED (pre-v3, not cam drive / exhaust)
  pair('crankcase-right|crankcase-left', 'conrod|piston|head|flywheel|pressure-plate', 'SIMPLIFIED case interior / head studs / rear seal boss not relieved'),
  pair('conrod', 'cylinder', 'SIMPLIFIED rod enters the cylinder skirt (skirt notches not modelled)'),
  pair('piston', 'head|valves', 'SIMPLIFIED dome at TDC: chamber/valve reliefs not cut'),
  pair('cylinder', 'valves', 'SIMPLIFIED valve heads at the barrel top'),
  pair('valve-cover-upper|valve-cover-lower', 'rockers|valves|camshaft|rocker-shaft-screws|rocker-shaft-nuts', 'SIMPLIFIED covers are solid shells (rocker-shaft screw heads inside them)'),
  pair('rockers', 'valve-cover-nuts-upper|valve-cover-nuts-lower', 'SIMPLIFIED rocker pivot bosses poke through the solid cover shell under an ear'),
  pair('upper-air-guide', 'cam-housing|cylinder|head|intake-runner|injector|plenum|rockers|valves|valve-cover-upper|distributor|fuel-lines|valve-cover-nuts-upper|intake-nuts|breather-nuts', 'SIMPLIFIED shroud cut-outs not modelled'),
  pair('fuel-lines', 'case-perimeter-nuts|crankcase-right|crankcase-left', 'SIMPLIFIED injection-line routing over the split-flange lugs is approximate'),
  pair('valves', 'cam-housing-nuts', 'SIMPLIFIED modelled valve springs/retainers sit too high (long tilted valves) and pass the cam-housing nut stations, as they pass the base plate'),
  pair('oil-cooler', 'distributor|intake-runner|upper-air-guide', 'SIMPLIFIED cooler block envelope'),
  pair('breather-lid', 'distributor|upper-air-guide', 'SIMPLIFIED'), pair('plenum', 'distributor', 'SIMPLIFIED'),
];
/**
 * Fastener joints (JOINT, generated): each hardware set may overlap the part it seats on and the part it threads
 * into (shank / stud in its hole); a stud may pass through the part its nut clamps. Nothing else is allowed, so a nut
 * buried in a rib, a bolt through a neighbouring part or a stud through a spark plug is still flagged.
 */
const FASTENER_JOINTS = new Set<string>();
for (const f of fastenerSets()) for (const it of f.items) {
  FASTENER_JOINTS.add(`${f.id}|${it.seat}`); FASTENER_JOINTS.add(`${f.id}|${it.into}`);
  if (it.stud) FASTENER_JOINTS.add(`${it.into}|${it.seat}`);
}
// screw + nut pairs (thread engagement)
for (const [a, b] of [['case-through-bolts', 'case-through-nuts'], ['rocker-shaft-screws-right', 'rocker-shaft-nuts-right'], ['rocker-shaft-screws-left', 'rocker-shaft-nuts-left']]) FASTENER_JOINTS.add(`${a}|${b}`);
export const isFastenerJoint = (a: string, b: string) => FASTENER_JOINTS.has(`${a}|${b}`) || FASTENER_JOINTS.has(`${b}|${a}`);
export const isMating = (a: string, b: string) =>
  isFastenerJoint(a, b) || MATING.some(([x, y]) => (x.test(a) && y.test(b)) || (x.test(b) && y.test(a)));
