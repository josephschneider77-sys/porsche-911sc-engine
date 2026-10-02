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
import { SMALL_SPECS } from '../src/data/smallSpec';

export interface Hit { a: string; b: string; tris: number; box: THREE.Box3 }
interface Solid { id: string; geom: THREE.BufferGeometry; bvh: MeshBVH; box: THREE.Box3 }

const _reach = new THREE.Vector3();
const _edge = new THREE.Vector3();
const _toP = new THREE.Vector3();
/** Most negative signed distance of `tri`'s vertices from the plane through `origin` with normal `n`. */
function planeReach(n: THREE.Vector3, origin: THREE.Vector3, tri: { a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3 }): number {
  let m = Infinity;
  for (const k of ['a', 'b', 'c'] as const) {
    const d = n.dot(_reach.subVectors(tri[k], origin));
    if (d < m) m = d;
  }
  return m;
}

/** Both points lie within `eps` of the same edge. A penetrating segment crosses the interior and fails this. */
function bothOnSameEdge(
  p: THREE.Vector3, q: THREE.Vector3,
  tri: { a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3 },
  eps: number,
): boolean {
  const vs = [tri.a, tri.b, tri.c];
  const eps2 = eps * eps;
  for (let i = 0; i < 3; i++) {
    const a = vs[i], b = vs[(i + 1) % 3];
    const near = (pt: THREE.Vector3) => {
      _edge.subVectors(b, a);
      const L2 = _edge.lengthSq();
      const t = L2 < 1e-12 ? 0 : Math.max(0, Math.min(1, _toP.subVectors(pt, a).dot(_edge) / L2));
      return pt.distanceToSquared(_toP.copy(a).addScaledVector(_edge, t)) <= eps2;
    };
    if (near(p) && near(q)) return true;
  }
  return false;
}

/**
 * Triangle contact is not a clash. Parallel faces within 0.05 mm are a seated joint. So is an
 * intersection that lies on one edge of each triangle (the two shells share that edge). A real
 * overlap sends the segment across a triangle, which is what a 1 mm block overlap does.
 */
export function trianglesClash(
  t1: { a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3; getNormal: (n: THREE.Vector3) => THREE.Vector3; intersectsTriangle: (t: unknown, seg: THREE.Line3) => boolean },
  t2: { a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3; getNormal: (n: THREE.Vector3) => THREE.Vector3 },
  n1: THREE.Vector3, n2: THREE.Vector3, v0: THREE.Vector3, seg: THREE.Line3,
): boolean {
  t1.getNormal(n1); t2.getNormal(n2);
  if (Math.abs(n1.dot(n2)) > 0.9995 && Math.abs(n1.dot(v0.subVectors(t2.a, t1.a))) < 0.05) return false;
  if (!t1.intersectsTriangle(t2, seg)) return false;
  // A shared edge or a coplanar pair comes back as a zero-length segment. A 1 mm overlap crosses.
  if (seg.start.distanceTo(seg.end) < 1e-3) return false;
  // Convex shell split (air-cleaner equator): the intersection is the shared boundary edge.
  if (bothOnSameEdge(seg.start, seg.end, t1, 0.35) && bothOnSameEdge(seg.start, seg.end, t2, 0.35)) return false;
  // A T-junction (a sheet edge lying on a face) puts every vertex of one triangle on or outside
  // the other's plane. Real overlap puts each triangle through the other's plane.
  if (planeReach(n1, t1.a, t2) > -0.05 || planeReach(n2, t2.a, t1) > -0.05) return false;
  return true;
}

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
    // Paper thinner than about 0.55 mm inverts under a 1 mm erosion and then intersects its own seat.
    // Cap only those sheets. Thicker gaskets keep the full shift so existing seats stay as they were.
    g.computeBoundingBox();
    const size = g.boundingBox!.getSize(new THREE.Vector3());
    const thin = Math.min(size.x, size.y, size.z);
    const eff = thin < 0.55 ? Math.min(tol, thin * 0.4) : tol;
    // instanced hardware: expand every instance
    const inst: THREE.Matrix4[] = o.isInstancedMesh ? Array.from({ length: o.count }, (_, i) => { const im = new THREE.Matrix4(); o.getMatrixAt(i, im); return im; }) : [new THREE.Matrix4()];
    for (const im of inst) {
      const w = m.clone().multiply(o.matrixWorld).multiply(im); nm.getNormalMatrix(w);
      const P = g.attributes.position, N = g.attributes.normal;
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(w); n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
        v.addScaledVector(n, -eff); out.push(v.x, v.y, v.z);
      }
    }
  });
  // CSG and helical extrudes leave zero-area slivers. They are not metal, and intersectsTriangle
  // reports them as hits against any triangle their collapsed edge numerically touches.
  const clean: number[] = [];
  for (let i = 0; i < out.length; i += 9) {
    const abx = out[i + 3] - out[i], aby = out[i + 4] - out[i + 1], abz = out[i + 5] - out[i + 2];
    const acx = out[i + 6] - out[i], acy = out[i + 7] - out[i + 1], acz = out[i + 8] - out[i + 2];
    const cx = aby * acz - abz * acy, cy = abz * acx - abx * acz, cz = abx * acy - aby * acx;
    if (cx * cx + cy * cy + cz * cz < 1e-4) continue;
    for (let k = 0; k < 9; k++) clean.push(out[i + k]);
  }
  const geom = new THREE.BufferGeometry(); geom.setAttribute('position', new THREE.Float32BufferAttribute(clean, 3));
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
          if (!trianglesClash(t1, t2, n1, n2, v0, seg)) return false;
          tris++; box.expandByPoint(seg.start).expandByPoint(seg.end); return tris >= 400;
        },
      } as any);
      if (tris) hits.push({ a: A.id, b: B.id, tris, box });
    }
  return hits;
}

/** Uneroded triangle test using the same contact rule as the assembled check. */
export function geometriesClash(a: THREE.BufferGeometry, b: THREE.BufferGeometry): boolean {
  const A = a.index ? a.toNonIndexed() : a.clone();
  const B = b.index ? b.toNonIndexed() : b.clone();
  const bvhA = new MeshBVH(A), bvhB = new MeshBVH(B);
  let hit = false;
  const seg = new THREE.Line3(), n1 = new THREE.Vector3(), n2 = new THREE.Vector3(), v0 = new THREE.Vector3();
  bvhA.bvhcast(bvhB, new THREE.Matrix4(), {
    intersectsTriangles(t1: any, t2: any) {
      if (!trianglesClash(t1, t2, n1, n2, v0, seg)) return false;
      hit = true;
      return true;
    },
  } as any);
  return hit;
}

/**
 * Erode a world-space mesh by `tol` mm along its vertex normals. Same thin-sheet cap as the assembled check.
 * Normals are left as authored; they are computed only when the geometry has none.
 */
function erodePositions(g: THREE.BufferGeometry, tol: number): number[] {
  const geo = g.index ? g.toNonIndexed() : g;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  geo.computeBoundingBox();
  const size = geo.boundingBox!.getSize(new THREE.Vector3());
  const thin = Math.min(size.x, size.y, size.z);
  const eff = thin < 0.55 ? Math.min(tol, thin * 0.4) : tol;
  const P = geo.attributes.position, N = geo.attributes.normal;
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  const out: number[] = [];
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i); n.fromBufferAttribute(N, i).normalize();
    v.addScaledVector(n, -eff); out.push(v.x, v.y, v.z);
  }
  return out;
}

function worldMesh(geometry: THREE.BufferGeometry, world: THREE.Matrix4): THREE.BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  g.applyMatrix4(world);
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

/** One logical piece: a fuel line, one banjo, one clamp, or one instanced copy. */
function subSolidKey(me: THREE.Object3D): string | null {
  if (typeof me.name === 'string' && me.name.startsWith('line:')) return `line:${me.name.slice(5).replace(/:cap$/, '')}`;
  let p: THREE.Object3D | null = me.parent;
  while (p) {
    if (typeof p.name === 'string' && (p.name.startsWith('banjo:') || p.name.startsWith('fitting:'))) return p.name;
    p = p.parent;
  }
  return null;
}

export interface IntraHit { part: string; a: string; b: string; tris: number }

/**
 * Distinct sub-solids inside one part. Instanced copies are separate even when they share a mesh.
 * Meshes of one fuel line, and children of a `banjo:` or `fitting:` group, are one piece.
 * Same erosion and the same seated-contact rule as findCollisions.
 */
export function findIntraPartHits(ids: string[], tol = 1): IntraHit[] {
  const hits: IntraHit[] = [];
  const poseOf = (id: string) => {
    const p = PARTS.find((d) => d.id === id)!;
    return new THREE.Matrix4().compose(
      new THREE.Vector3(...((p.position ?? [0, 0, 0]) as [number, number, number])),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...((p.rotation ?? [0, 0, 0]) as [number, number, number]))),
      new THREE.Vector3(1, 1, 1),
    );
  };
  for (const id of ids) {
    if (!cache.has(id)) cache.set(id, ASSET_BUILDERS[id]());
    const root = cache.get(id)!;
    root.updateMatrixWorld(true);
    const pose = poseOf(id);
    const groups = new Map<string, number[]>();
    const add = (key: string, pts: number[]) => {
      const cur = groups.get(key);
      if (cur) cur.push(...pts); else groups.set(key, pts);
    };
    let loose = 0;
    root.traverse((o: any) => {
      if (!o.isMesh) return;
      const inst: THREE.Matrix4[] = o.isInstancedMesh
        ? Array.from({ length: o.count }, (_, i) => { const im = new THREE.Matrix4(); o.getMatrixAt(i, im); return im; })
        : [new THREE.Matrix4()];
      inst.forEach((im, i) => {
        const world = pose.clone().multiply(o.matrixWorld).multiply(im);
        const baked = worldMesh(o.geometry, world);
        const key = o.isInstancedMesh ? `inst:${o.uuid}:${i}` : (subSolidKey(o) ?? `mesh:${loose++}`);
        add(key, erodePositions(baked, tol));
      });
    });
    const solids: { key: string; bvh: MeshBVH; box: THREE.Box3 }[] = [];
    for (const [key, pts] of groups) {
      if (pts.length < 9) continue;
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const bvh = new MeshBVH(geom); geom.boundsTree = bvh as any; geom.computeBoundingBox();
      solids.push({ key, bvh, box: geom.boundingBox!.clone() });
    }
    const I = new THREE.Matrix4();
    for (let i = 0; i < solids.length; i++) for (let j = i + 1; j < solids.length; j++) {
      const A = solids[i], B = solids[j];
      if (!A.box.intersectsBox(B.box)) continue;
      let tris = 0;
      const seg = new THREE.Line3(), n1 = new THREE.Vector3(), n2 = new THREE.Vector3(), v0 = new THREE.Vector3();
      A.bvh.bvhcast(B.bvh, I, {
        intersectsTriangles(t1: any, t2: any) {
          if (!trianglesClash(t1, t2, n1, n2, v0, seg)) return false;
          tris++; return tris >= 40;
        },
      } as any);
      if (tris) hits.push({ part: id, a: A.key, b: B.key, tris });
    }
  }
  return hits;
}

/**
 * Two eroded solids, same rule as the assembled check. Used to prove a 12 mm / r 7.3 eye pair
 * still fails at tol 1, and a touching pair does not.
 */
export function erodedSolidsClash(a: THREE.BufferGeometry, b: THREE.BufferGeometry, tol = 1): boolean {
  const ga = new THREE.BufferGeometry();
  ga.setAttribute('position', new THREE.Float32BufferAttribute(erodePositions(a, tol), 3));
  const gb = new THREE.BufferGeometry();
  gb.setAttribute('position', new THREE.Float32BufferAttribute(erodePositions(b, tol), 3));
  return geometriesClash(ga, gb);
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
 * Allowlist of pairs whose interpenetration (beyond the erosion tolerance) is expected.
 * Bottom end and ancillaries stay only when the overlap is a real joint, and the comment names it
 * (threaded, pressed or seated). Head, cylinder, cam, valvetrain, cover and chain-drive lines are
 * left as the top-end work wrote them, including the skirt and valve-relief shortcuts that work owns.
 */
export const MATING: [RegExp, RegExp, string][] = [
  // ---- bottom end and ancillaries: real joints
  pair('crankcase-right', 'crankcase-left', 'seated: crankcase split-flange faces'),
  pair('crankcase-right|crankcase-left', 'main-bearings', 'pressed: main-bearing shell in the saddle bore'),
  pair('crankcase-right|crankcase-left', 'cylinder', 'seated: cylinder spigot on the deck register'),
  ...sameSide('crankcase', 'chain-housing', 'seated: chain-box gasket face on the chain-well flange'),
  pair('crankshaft', 'main-bearings', 'pressed: crank journal in the main-bearing shell'),
  pair('crankshaft', 'conrod', 'pressed: rod journal in the big-end bearing'),
  pair('crankshaft', 'crank-gears', 'pressed: timing gear and distributor drive wheel on the crank nose'),
  pair('crankshaft', 'crank-pulley', 'pressed: crank pulley on the nose'),
  pair('crankshaft', 'flywheel', 'seated: flywheel on the crank flange'),
  pair('conrod', 'piston', 'pressed: wrist pin through the rod and piston'),
  pair('flywheel', 'clutch-disc|pressure-plate', 'seated: clutch disc and pressure plate on the flywheel face'),
  pair('clutch-disc', 'pressure-plate', 'seated: clutch disc against the pressure plate'),
  pair('intermediate-shaft', 'oil-pump', 'pressed: splined coupling in the oil pump'),
  pair('muffler', 'heat-exchanger', 'seated: muffler inlet stub over the heat-exchanger outlet'),
  pair('alternator', 'fan-pulley|fan-impeller', 'pressed: impeller and pulley on the alternator shaft'),
  pair('fan-housing', 'fan-impeller', 'seated: impeller running inside the fan housing'),
  pair('fan-belt', 'fan-pulley|crank-pulley', 'seated: belt in the pulley grooves'),
  pair('fan-hub', 'fan-impeller|alternator', 'pressed: fan hub on the alternator shaft and the impeller on the hub'),
  pair('warm-up-regulator', 'crankcase-left', 'JOINT regulator flange on the case pad'),
  pair('ignition-leads', 'distributor', 'seated: lead jacket in the cap tower'),
  pair('ignition-leads', 'spark-plug', 'seated: lead boot on the plug terminal'),
  pair('ignition-leads', 'ignition-lead-holders', 'seated: lead clipped in the shroud holder'),
  pair('oil-cooler-cap', 'shroud-speed-nuts', 'seated: speed nut on the cooler-cap lip (the 1 mm nut inverts under the 1 mm erosion; clean at 0 and 0.5 mm)'),
  // ---- top end (heads, cylinders, cams, valvetrain, covers, chain drive) — not rewritten here

  pair('piston', 'cylinder', 'JOINT piston in bore'),
  pair('cylinder', 'head', 'JOINT cylinder/head sealing joint'),
  pair('head', 'valves|spark-plug', 'JOINT guides/seats, plug thread'),
  pair('cam-housing', 'head|camshaft|rockers|valves|valve-cover-upper|valve-cover-lower', 'JOINT cam housing on heads, bearings, rocker shafts, cover flanges'),
  pair('camshaft', 'rockers', 'JOINT lobes on rocker pads'), pair('rockers', 'valves', 'JOINT rocker tips on stems'),
  ...sameSide('cam-housing', 'chain-housing', 'JOINT cam-housing end face gasketed into the chain box'),
  ...sameSide('camshaft', 'cam-sprocket', 'JOINT sprocket on cam nose'),
  ...sameSide('timing-chain', 'cam-sprocket', 'JOINT chain seated on the cam sprocket'),
  ...sameSide('timing-chain', 'chain-tensioner', 'JOINT chain wraps the idler sprocket'),
  ...sameSide('guide-rails', 'chain-housing', 'seated: guide rail on the chain-housing boss'),
  ...sameSide('chain-tensioner', 'chain-housing', 'JOINT idler shaft and adjuster seated in housing bosses'),
  ...sameSide('chain-housing', 'chain-housing-lid', 'JOINT cover on housing studs'),
  pair('intermediate-shaft', 'timing-chain', 'JOINT chain seated on the intermediate sprockets'),
  pair('heat-exchanger', 'head', 'JOINT primaries in the exhaust ports'),
  ...sameSide('cam-flange', 'camshaft|cam-sprocket', 'JOINT keyed flange on the cam nose, dowel into the sprocket'),
  ...sameSide('adjuster-cover', 'chain-housing-lid', 'JOINT cover gasketed onto the lid'),
  pair('conrod', 'cylinder', 'SIMPLIFIED rod enters the cylinder skirt (skirt notches not modelled)'),
  pair('piston', 'head|valves', 'SIMPLIFIED dome at TDC: chamber/valve reliefs not cut'),
  pair('cylinder', 'valves', 'SIMPLIFIED valve heads at the barrel top'),
  pair('valve-cover-upper|valve-cover-lower', 'rockers|valves', 'SIMPLIFIED hollow covers (v5): rocker-arm tips / valve-spring retainers cross the seat line at the long edges (modelled rocker gear ~5 mm wider than the cover seat)'),
  pair('cam-housing-plug', 'cam-splash-tube', 'JOINT gallery screw plug shank reaches the splash-tube bore it closes (E position)'),
  pair('cam-key', 'cam-shim', 'JOINT key passes through the keyed notch of the 0.6 mm shim (the thin shim inverts under the 1 mm erosion; clean at 0.5 mm)'),
  pair('valve-cover-upper|valve-cover-lower', 'rocker-shaft-screws|rocker-shaft-nuts', 'SIMPLIFIED a few rocker-shaft screw/nut heads tuck under the inner edge of an ear boss (bosses kept full so the cover-nut seats stay solid)'),
  pair('valve-cover-gasket-upper|valve-cover-gasket-lower', 'rockers|valves', 'SIMPLIFIED same seat-line crossing as the covers (rocker-arm tips / spring retainers at the long edges)'),
  pair('rockers', 'valve-cover-nuts-upper|valve-cover-nuts-lower', 'SIMPLIFIED rocker pivot bosses poke through the solid cover shell under an ear'),
];

/** Why-strings owned by the top-end / chain-drive work. Bottom-end entries are not in this set. */
export const TOP_END_WHY = new Set<string>([
  'JOINT piston in bore',
  'JOINT cylinder/head sealing joint',
  'JOINT guides/seats, plug thread',
  'JOINT cam housing on heads, bearings, rocker shafts, cover flanges',
  'JOINT lobes on rocker pads',
  'JOINT rocker tips on stems',
  'JOINT cam-housing end face gasketed into the chain box',
  'JOINT sprocket on cam nose',
  'JOINT chain seated on the cam sprocket',
  'JOINT chain wraps the idler sprocket',
  'seated: guide rail on the chain-housing boss',
  'JOINT idler shaft and adjuster seated in housing bosses',
  'JOINT cover on housing studs',
  'JOINT primaries in the exhaust ports',
  'JOINT keyed flange on the cam nose, dowel into the sprocket',
  'JOINT cover gasketed onto the lid',
  'JOINT regulator flange on the case pad',
  'SIMPLIFIED rod enters the cylinder skirt (skirt notches not modelled)',
  'SIMPLIFIED dome at TDC: chamber/valve reliefs not cut',
  'SIMPLIFIED valve heads at the barrel top',
  'SIMPLIFIED hollow covers (v5): rocker-arm tips / valve-spring retainers cross the seat line at the long edges (modelled rocker gear ~5 mm wider than the cover seat)',
  'JOINT gallery screw plug shank reaches the splash-tube bore it closes (E position)',
  'JOINT key passes through the keyed notch of the 0.6 mm shim (the thin shim inverts under the 1 mm erosion; clean at 0.5 mm)',
  'SIMPLIFIED a few rocker-shaft screw/nut heads tuck under the inner edge of an ear boss (bosses kept full so the cover-nut seats stay solid)',
  'SIMPLIFIED same seat-line crossing as the covers (rocker-arm tips / spring retainers at the long edges)',
  'SIMPLIFIED rocker pivot bosses poke through the solid cover shell under an ear',
]);
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
for (const sp of SMALL_SPECS) for (const h of sp.hosts) FASTENER_JOINTS.add(`${sp.id}|${h}`);
for (const [a, b] of [['case-through-bolts', 'case-through-stud-nut'], ['case-through-bolts', 'case-through-nuts'], ['rocker-shaft-screws-right', 'rocker-shaft-nuts-right'], ['rocker-shaft-screws-left', 'rocker-shaft-nuts-left']]) FASTENER_JOINTS.add(`${a}|${b}`);
export const isFastenerJoint = (a: string, b: string) => FASTENER_JOINTS.has(`${a}|${b}`) || FASTENER_JOINTS.has(`${b}|${a}`);
export const isMating = (a: string, b: string) =>
  isFastenerJoint(a, b) || MATING.some(([x, y]) => (x.test(a) && y.test(b)) || (x.test(b) && y.test(a)));
