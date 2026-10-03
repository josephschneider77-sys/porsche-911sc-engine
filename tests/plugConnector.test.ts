import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ASSET_BUILDERS, PLUG_CONNECTOR_TERMINAL, partPose } from '../src/geo/assets';
import { SPARK_TUBE_R } from '../src/data/layout';

function posedVerts(asset: THREE.Object3D, pose: THREE.Matrix4): THREE.Vector3[] {
  asset.updateMatrixWorld(true);
  const out: THREE.Vector3[] = [];
  const v = new THREE.Vector3();
  asset.traverse((o: any) => {
    if (!o.isMesh) return;
    const P = o.geometry.attributes.position as THREE.BufferAttribute;
    const m = pose.clone().multiply(o.matrixWorld);
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m);
      out.push(v.clone());
    }
  });
  return out;
}

/** Drop the tube's duplicated seam vertex so the ring centroid stays on the centreline. */
function dedupe(verts: THREE.Vector3[]): THREE.Vector3[] {
  const seen = new Set<string>();
  const out: THREE.Vector3[] = [];
  for (const v of verts) {
    const key = `${v.x.toFixed(3)}_${v.y.toFixed(3)}_${v.z.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

describe('plug connector terminal', () => {
  const asset = ASSET_BUILDERS['spark-plug-connector']();

  it('matches the rendered elbow mouth on every cylinder', () => {
    for (let c = 1; c <= 6; c++) {
      const { point, direction } = PLUG_CONNECTOR_TERMINAL(c);
      expect(direction.length(), `cyl ${c} direction`).toBeCloseTo(1, 6);
      const pose = partPose(`spark-plug-connector-${c}`);
      const verts = posedVerts(asset, pose);
      // End ring of the elbow: on the outlet plane, one tube-radius from its centre.
      // A segment back, the side vertices are still about a radius from `point`, so the
      // plane test is what keeps them out.
      const ring = dedupe(verts.filter((v) => {
        const along = v.clone().sub(point).dot(direction);
        return Math.abs(along) < 0.2 && Math.abs(v.distanceTo(point) - SPARK_TUBE_R) < 0.4;
      }));
      expect(ring.length, `cyl ${c} mouth ring`).toBeGreaterThanOrEqual(8);
      const centroid = ring.reduce((a, v) => a.add(v), new THREE.Vector3()).multiplyScalar(1 / ring.length);
      expect(centroid.distanceTo(point), `cyl ${c} mouth centre`).toBeLessThan(0.2);
    }
  });
});
