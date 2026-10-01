import * as THREE from 'three';
import { RAW_BUILDERS } from './rawAssets';
import { fastenerSets, fastenerGroup, studGeometry } from './fasteners';
import { PARTS } from '../data/parts';
import { mat } from './materials';

/** Registry pose of a part as a matrix (engine frame). */
export function partPose(id: string) {
  const d = PARTS.find((p) => p.id === id)!;
  return new THREE.Matrix4().compose(new THREE.Vector3(...(d.position ?? [0, 0, 0])), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(d.rotation ?? [0, 0, 0]))), new THREE.Vector3(1, 1, 1));
}
/** Add the studs that stay in this part (threaded into it) to its asset. Shared assets use their first part's pose. */
function withStuds(asset: string, build: () => THREE.Object3D) {
  return () => {
    const g = build();
    const first = PARTS.find((p) => p.asset === asset);
    if (!first) return g;
    const inv = partPose(first.id).invert();
    for (const f of fastenerSets()) for (const it of f.items) if (it.stud && it.into === first.id) g.add(new THREE.Mesh(studGeometry(f, it).applyMatrix4(inv), mat('zincPlate')));
    return g;
  };
}
/** Every GLB asset exported to public/parts/<id>.glb: part builders (+ their studs) and one instanced asset per fastener set. */
export const ASSET_BUILDERS: Record<string, () => THREE.Object3D> = {
  ...Object.fromEntries(Object.entries(RAW_BUILDERS).map(([k, b]) => [k, withStuds(k, b)])),
  ...Object.fromEntries(fastenerSets().map((f) => [f.id, () => fastenerGroup(f)])),
};
