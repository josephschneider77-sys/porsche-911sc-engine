/**
 * The viewer loads only public/parts/<id>.glb. Meshopt quantization shifts a vertex by a few
 * hundredths of a millimetre; a larger gap means the committed file was not exported from this source.
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { MeshBVH } from 'three-mesh-bvh';
import { ASSET_BUILDERS } from '../src/geo/assets';
import { consolidate } from '../src/geo/util';

const TOL = 0.05;

function bake(root: THREE.Object3D): THREE.BufferGeometry {
  const out: number[] = [];
  const v = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse((o: any) => {
    if (!o.isMesh) return;
    const g: THREE.BufferGeometry = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
    const P = g.attributes.position;
    const inst: THREE.Matrix4[] = o.isInstancedMesh
      ? Array.from({ length: o.count }, (_, i) => { const m = new THREE.Matrix4(); o.getMatrixAt(i, m); return m; })
      : [new THREE.Matrix4()];
    for (const im of inst) {
      const w = new THREE.Matrix4().multiplyMatrices(o.matrixWorld, im);
      for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(w); out.push(v.x, v.y, v.z); }
    }
  });
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  return geom;
}

function maxAway(from: THREE.BufferGeometry, onto: THREE.BufferGeometry): number {
  if (!from.attributes.position?.count || !onto.attributes.position?.count) return Infinity;
  const bvh = new MeshBVH(onto);
  const P = from.attributes.position;
  const v = new THREE.Vector3();
  const target: { distance: number } = { distance: 0 };
  let m = 0;
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i);
    bvh.closestPointToPoint(v, target as any);
    if (target.distance > m) m = target.distance;
    if (m > TOL) break;
  }
  return m;
}

async function loadGlb(id: string): Promise<THREE.Object3D> {
  const buf = readFileSync(`public/parts/${id}.glb`);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await new Promise<any>((res, rej) => loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '', res, rej));
  return gltf.scene;
}

describe('committed GLBs', () => {
  it('match the geometry built from source', async () => {
    await MeshoptDecoder.ready;
    const bad: string[] = [];
    for (const id of Object.keys(ASSET_BUILDERS)) {
      const src = bake(consolidate(ASSET_BUILDERS[id](), id));
      const glb = bake(await loadGlb(id));
      const d = Math.max(maxAway(src, glb), maxAway(glb, src));
      src.dispose(); glb.dispose();
      if (d > TOL) bad.push(`${id} ${d.toFixed(2)} mm`);
    }
    expect(bad).toEqual([]);
  }, 180000);
});
