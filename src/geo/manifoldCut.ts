/**
 * Watertight booleans. three-bvh-csg leaves boundary edges on a blind hole; Manifold
 * does not. Used for the head, cam housings, covers and rockers. Other parts keep
 * the existing boolean so their meshes stay as the other owners built them.
 */
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import init from 'manifold-3d';

async function boot() {
  if (typeof process !== 'undefined' && process.versions?.node) return init();
  const { wasmUrl } = await import('./manifoldWasmUrl');
  return init({ locateFile: () => wasmUrl });
}
const wasm = await boot();
wasm.setup();
const { Manifold, Mesh } = wasm;

function posWeld(g: THREE.BufferGeometry) {
  const src = g.index ? g.toNonIndexed() : g;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', src.getAttribute('position').clone());
  return mergeVertices(out, 1e-3);
}

function toM(g: THREE.BufferGeometry, label = 'mesh') {
  let geo: THREE.BufferGeometry;
  try {
    geo = posWeld(g);
  } catch (e) {
    throw new Error(`${label} weld: ${(e as Error).message}`);
  }
  const pos = geo.getAttribute('position');
  const vertProperties = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    vertProperties[i * 3] = pos.getX(i);
    vertProperties[i * 3 + 1] = pos.getY(i);
    vertProperties[i * 3 + 2] = pos.getZ(i);
  }
  const index = geo.getIndex()!;
  const triVerts = new Uint32Array(index.count);
  for (let i = 0; i < triVerts.length; i++) triVerts[i] = index.getX(i);
  try {
    return new Manifold(new Mesh({ numProp: 3, vertProperties, triVerts }));
  } catch (e) {
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    throw new Error(`${label} (${pos.count} verts, ${bb.min.toArray().map((n) => n.toFixed(1))} .. ${bb.max.toArray().map((n) => n.toFixed(1))}): ${(e as Error).message}`);
  }
}

function fromM(m: InstanceType<typeof Manifold>) {
  const mesh = m.getMesh();
  const numProp = mesh.numProp;
  const n = mesh.vertProperties.length / numProp;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = mesh.vertProperties[i * numProp];
    pos[i * 3 + 1] = mesh.vertProperties[i * numProp + 1];
    pos[i * 3 + 2] = mesh.vertProperties[i * numProp + 2];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (mesh.triVerts.length) g.setIndex(new THREE.BufferAttribute(new Uint32Array(mesh.triVerts), 1));
  g.computeVertexNormals();
  return g;
}

/** `base` plus every extra solid. Inputs must already be closed. */
export function manifoldAdd(base: THREE.BufferGeometry, ...extra: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (!extra.length) return base;
  let acc = toM(base, 'base');
  for (let i = 0; i < extra.length; i++) {
    const c = toM(extra[i], `add${i}`);
    const next = acc.add(c);
    acc.delete();
    c.delete();
    acc = next;
  }
  const status = String(acc.status());
  if (status !== 'NoError') {
    acc.delete();
    throw new Error(`manifold add ${status}`);
  }
  const g = fromM(acc);
  acc.delete();
  return g;
}

/** `base` minus every cutter, as one closed solid. Inputs must already be closed. */
export function manifoldSub(base: THREE.BufferGeometry, ...cutters: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (!cutters.length) return base;
  let acc = toM(cutters[0], 'cutter0');
  for (let i = 1; i < cutters.length; i++) {
    const c = toM(cutters[i], `cutter${i}`);
    const next = acc.add(c);
    acc.delete();
    c.delete();
    acc = next;
  }
  const b = toM(base, 'base');
  const result = b.subtract(acc);
  b.delete();
  acc.delete();
  const status = String(result.status());
  if (status !== 'NoError') {
    result.delete();
    throw new Error(`manifold subtract ${status}`);
  }
  const g = fromM(result);
  result.delete();
  return g;
}

/** Bake and subtract closed cutters from every mesh they meet. The result stays closed. */
export function cutClosed(root: THREE.Object3D, ...cutters: THREE.BufferGeometry[]) {
  if (!cutters.length) return root;
  root.updateMatrixWorld(true);
  const boxes = cutters.map((c) => {
    c.computeBoundingBox();
    return c.boundingBox!.clone();
  });
  let acc: InstanceType<typeof Manifold> | null = null;
  const ensure = () => {
    if (acc) return acc;
    acc = toM(cutters[0], 'union0');
    for (let i = 1; i < cutters.length; i++) {
      const c = toM(cutters[i], `union${i}`);
      const next = acc.add(c);
      acc.delete();
      c.delete();
      acc = next;
    }
    return acc;
  };
  root.traverse((o: THREE.Object3D) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh) return;
    const g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    g.computeBoundingBox();
    if (!boxes.some((b) => b.intersectsBox(g.boundingBox!))) return;
    const b = toM(g, `part ${g.boundingBox!.min.toArray().map((n) => n.toFixed(0)).join(',')}`);
    const result = b.subtract(ensure());
    b.delete();
    const status = String(result.status());
    if (status !== 'NoError') {
      result.delete();
      throw new Error(`manifold cut ${status}`);
    }
    mesh.geometry = fromM(result);
    result.delete();
    mesh.position.set(0, 0, 0);
    mesh.rotation.set(0, 0, 0);
    mesh.scale.set(1, 1, 1);
    mesh.updateMatrix();
  });
  const done = acc as InstanceType<typeof Manifold> | null;
  done?.delete();
  return root;
}
