/** Shared instancing: one prototype Part (any number of meshes) -> one InstancedMesh per material. */
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Part } from './util';

export function instancedGroup(id: string, proto: Part, mats: THREE.Matrix4[]): THREE.Group {
  const g = new THREE.Group(); g.name = id;
  proto.g.updateMatrixWorld(true);
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  proto.g.traverse((o) => {
    const me = o as THREE.Mesh; if (!me.isMesh) return;
    let geo = me.geometry.clone().applyMatrix4(me.matrixWorld);
    if (geo.index) geo = geo.toNonIndexed();
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const m = me.material as THREE.Material; byMat.set(m, [...(byMat.get(m) ?? []), geo]);
  });
  byMat.forEach((geos, material) => {
    const geo = mergeVertices(mergeGeometries(geos, false)!, 1e-3);
    const im = new THREE.InstancedMesh(geo, material, mats.length);
    mats.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true; im.computeBoundingBox(); im.computeBoundingSphere();
    g.add(im);
  });
  return g;
}
/** Basis matrix: prototype +Y -> n, prototype +X -> x (made orthogonal to n), origin at p. */
export function frame(p: THREE.Vector3, n: THREE.Vector3, x?: THREE.Vector3) {
  const Y = n.clone().normalize();
  let X = x ? x.clone() : Math.abs(Y.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
  X.addScaledVector(Y, -X.dot(Y)).normalize();
  const Z = new THREE.Vector3().crossVectors(X, Y);
  return new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(p);
}
