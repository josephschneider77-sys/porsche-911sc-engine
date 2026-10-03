import * as THREE from 'three';
import { RAW_BUILDERS } from './rawAssets';
import { fastenerSets, fastenerGroup, studGeometry } from './fasteners';
import { PARTS } from '../data/parts';
import { SPARK_MOUTH } from '../data/layout';
import { mat } from './materials';
import { SMALL_GEOM } from './smallParts';
import { instancedGroup } from './instancing';

export { partPose } from './probe';
import { partPose } from './probe';

/**
 * Elbow opening the ignition lead enters, for cylinders 1–6.
 * `point` is the outlet centre (plug-local SPARK_MOUTH in the engine frame).
 * `direction` is the outward unit axis of that opening (plug-local +X).
 * The lead travels along −direction and ends at `point`.
 */
export function PLUG_CONNECTOR_TERMINAL(cyl: number): { point: THREE.Vector3; direction: THREE.Vector3 } {
  const pose = partPose(`spark-plug-connector-${cyl}`);
  const point = new THREE.Vector3(...SPARK_MOUTH).applyMatrix4(pose);
  const direction = new THREE.Vector3(1, 0, 0).transformDirection(pose).normalize();
  return { point, direction };
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
  ...Object.fromEntries(Object.entries(SMALL_GEOM).map(([id, g]) => [id, () => {
    const items = g.items();
    // A single identity pose keeps mesh names (fuel-line endpoints are named line:<id>).
    if (items.length === 1 && items[0].equals(new THREE.Matrix4())) return g.proto().g;
    return instancedGroup(id, g.proto(), items);
  }])),
};
