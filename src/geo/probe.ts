/**
 * Build-time ray probes against posed raw part geometry, used to seat small parts and hardware exactly on the
 * modelled faces (instead of hand-typed coordinates). Only used by the asset/geometry code, never in the browser.
 */
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { RAW_BUILDERS } from './rawAssets';
import { PARTS } from '../data/parts';

export function partPose(id: string) {
  const d = PARTS.find((p) => p.id === id)!;
  return new THREE.Matrix4().compose(new THREE.Vector3(...(d.position ?? [0, 0, 0])), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(d.rotation ?? [0, 0, 0]))), new THREE.Vector3(1, 1, 1));
}
const cache = new Map<string, MeshBVH>();
export function posedBVH(id: string): MeshBVH {
  if (cache.has(id)) return cache.get(id)!;
  const d = PARTS.find((p) => p.id === id)!;
  const root = RAW_BUILDERS[d.asset](); root.updateMatrixWorld(true);
  const pose = partPose(id); const out: number[] = []; const v = new THREE.Vector3();
  root.traverse((o: any) => {
    if (!o.isMesh) return;
    const g: THREE.BufferGeometry = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
    const P = g.attributes.position;
    const mats: THREE.Matrix4[] = o.isInstancedMesh ? Array.from({ length: o.count }, (_, i) => { const m = new THREE.Matrix4(); o.getMatrixAt(i, m); return m.premultiply(o.matrixWorld); }) : [o.matrixWorld];
    for (const m of mats) { const w = pose.clone().multiply(m); for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(w); out.push(v.x, v.y, v.z); } }
  });
  const geom = new THREE.BufferGeometry(); geom.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  const bvh = new MeshBVH(geom); cache.set(id, bvh); return bvh;
}
/** First hit of a ray from `o` along `d` on part `id`: point + distance, or null. */
export function probe(id: string, o: THREE.Vector3, d: THREE.Vector3, far = 1e4) {
  const h = posedBVH(id).raycastFirst(new THREE.Ray(o, d.clone().normalize()), THREE.DoubleSide) as any;
  if (!h || h.distance > far) return null;
  return { point: h.point as THREE.Vector3, distance: h.distance as number };
}
/** Seat point: cast from `o` along `d` onto the part, throws if nothing is hit (keeps layout errors loud). */
export function seat(id: string, o: THREE.Vector3, d: THREE.Vector3, far = 400): THREE.Vector3 {
  const h = probe(id, o, d, far);
  if (!h) throw new Error(`seat(): no hit on ${id} from ${o.toArray().map((x) => x.toFixed(0))} along ${d.toArray()}`);
  return h.point.clone();
}
