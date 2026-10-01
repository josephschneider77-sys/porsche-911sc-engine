/** World-space BVHs of parts for ray queries (raw part geometry, i.e. without the studs added for the hardware). */
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { RAW_BUILDERS } from '../src/geo/rawAssets';
import { partPose } from '../src/geo/assets';
import { PART_BY_ID } from '../src/data/parts';

const cache = new Map<string, MeshBVH>();
export function partBVH(id: string): MeshBVH {
  if (cache.has(id)) return cache.get(id)!;
  const root = RAW_BUILDERS[PART_BY_ID[id].asset]();
  root.updateMatrixWorld(true);
  const pose = partPose(id); const out: number[] = []; const v = new THREE.Vector3();
  root.traverse((o: any) => {
    if (!o.isMesh) return;
    const g: THREE.BufferGeometry = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
    const w = pose.clone().multiply(o.matrixWorld); const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(w); out.push(v.x, v.y, v.z); }
  });
  const geom = new THREE.BufferGeometry(); geom.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  const bvh = new MeshBVH(geom); cache.set(id, bvh); return bvh;
}
/** First hit of a ray against a part (distance + unit face normal), or null beyond `far`. */
export function rayHit(id: string, origin: THREE.Vector3, dir: THREE.Vector3, far = 1e4) {
  const h = partBVH(id).raycastFirst(new THREE.Ray(origin, dir.clone().normalize()), THREE.DoubleSide) as any;
  if (!h || h.distance > far) return null;
  return { distance: h.distance as number, normal: (h.face.normal as THREE.Vector3).clone().normalize() };
}
