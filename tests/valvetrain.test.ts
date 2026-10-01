import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  CAM, PEAK_R, LASH, PAD_LEN, EYE_LEN, FIRE_CRANK, ASSEMBLED_CRANK, trainPose, camshaft, camWebZ, lobeRadius,
  rockerStations,
} from '../src/geo/valvetrain';
import { CAM_X } from '../src/data/layout';
import { CAM_NOSE, CAM_WEB, CHAIN_Z, CH_Z0, CH_Z1 } from '../src/geo/core';
import { ASSET_BUILDERS } from '../src/geo/assets';
import { rayHit } from './hw';

const PEAK_AT = { in: 450, ex: 270 } as const;

function worldVerts(obj: THREE.Object3D): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  obj.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  const inst = new THREE.Matrix4();
  obj.traverse((o: any) => {
    if (o.isInstancedMesh) {
      const p = o.geometry.attributes.position as THREE.BufferAttribute;
      for (let n = 0; n < o.count; n++) {
        o.getMatrixAt(n, inst); inst.premultiply(o.matrixWorld);
        for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(inst); out.push(v.clone()); }
      }
      return;
    }
    if (!o.isMesh) return;
    const p = o.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); out.push(v.clone()); }
  });
  return out;
}

describe('top-end batch 1', () => {
  it('keeps every lobe peak under the journal so the cam can slide through the bore', () => {
    expect(PEAK_R).toBeLessThan(CAM.journalR - 0.5);
    expect(PEAK_R).toBeLessThan(CAM.boreR - 0.5);
    expect(lobeRadius(0)).toBeCloseTo(CAM.baseR + CAM.lift, 5);
    expect(lobeRadius(Math.PI)).toBeCloseTo(CAM.baseR, 5);
  });

  it('gives 0.10 mm lash on the base circle at firing TDC and opens the valve on the nose', () => {
    for (const cyl of [1, 2, 3, 4, 5, 6]) for (const side of [1, -1] as const) {
      const which = side > 0 ? 'in' : 'ex';
      const tag = `cyl ${cyl} ${which}`;
      const closed = trainPose(cyl, side, FIRE_CRANK[cyl]);
      expect(closed.lobeR, tag).toBeCloseTo(CAM.baseR, 2);
      expect(closed.lift, tag).toBeLessThan(0.05);
      expect(closed.gap, tag).toBeCloseTo(LASH, 2);
      const peak = trainPose(cyl, side, FIRE_CRANK[cyl] + PEAK_AT[which]);
      expect(peak.lobeR, tag).toBeCloseTo(PEAK_R, 2);
      expect(peak.lift, `${tag} lift`).toBeGreaterThan(4);
      expect(peak.gap, tag).toBeLessThan(0.02);
      // Photo proportions: a long pad arm and a distinct shorter eye arm, not a stub on the boss.
      expect(closed.lay.P.distanceTo(closed.lay.K), `${tag} pad arm`).toBeGreaterThan(PAD_LEN - 1);
      expect(closed.lay.P.distanceTo(closed.lay.ball), `${tag} eye arm`).toBeGreaterThan(EYE_LEN - 1);
    }
  });

  it('phases the opposite bank so cylinder 4 is on overlap while cylinder 1 is closed', () => {
    expect(trainPose(1, 1, ASSEMBLED_CRANK).lift).toBeLessThan(0.05);
    expect(trainPose(1, -1, ASSEMBLED_CRANK).lift).toBeLessThan(0.05);
    expect(trainPose(4, 1, ASSEMBLED_CRANK).lift).toBeGreaterThan(1);
    expect(trainPose(4, -1, ASSEMBLED_CRANK).lift).toBeGreaterThan(1);
  });

  it('keeps cam mesh vertices inside the journal radius except the journals', () => {
    const bands = camWebZ(1).map((z) => [z - CAM.journalW / 2 - 1, z + CAM.journalW / 2 + 1] as const);
    const onJournal = (z: number) => bands.some(([a, b]) => z >= a && z <= b);
    let maxJournal = 0, maxOther = 0, nJournal = 0;
    for (const v of worldVerts(camshaft(1))) {
      const r = Math.hypot(v.x - CAM_X, v.y);
      if (onJournal(v.z)) { maxJournal = Math.max(maxJournal, r); nJournal++; }
      else maxOther = Math.max(maxOther, r);
    }
    expect(nJournal).toBeGreaterThan(80);
    expect(maxJournal).toBeGreaterThan(CAM.journalR - 0.15);
    expect(maxJournal).toBeLessThan(CAM.journalR + 0.4);
    expect(maxOther, 'lobe / shank / nose').toBeLessThan(CAM.journalR - 0.4);
  });

  it('line-bores the cam from the chain end and mirrors the left rocker stations', () => {
    const open = rayHit('cam-housing-right', new THREE.Vector3(CAM_X, 0, 400), new THREE.Vector3(0, 0, -1), 800);
    expect(open, 'bore plugged').not.toBeNull();
    expect(400 - open!.distance, 'first hit should be the flywheel-end cap').toBeLessThan(CH_Z0 + 20);
    const web = rayHit('cam-housing-right', new THREE.Vector3(CAM_X, CAM.boreR + 1.5, 400), new THREE.Vector3(0, 0, -1), 800);
    expect(web).not.toBeNull();
    expect(400 - web!.distance).toBeGreaterThan(CH_Z0 + 40);
    const right = trainPose(1, 1, 0).lay;
    const left = trainPose(6, 1, 0).lay;
    expect(left.P.x).toBeCloseTo(-right.P.x, 2);
    expect(left.P.y).toBeCloseTo(right.P.y, 2);
    expect(left.z).toBeCloseTo(-right.z, 2);
    const rightEx = trainPose(1, -1, 0).lay;
    const leftEx = trainPose(6, -1, 0).lay;
    expect(leftEx.P.x).toBeCloseTo(-rightEx.P.x, 2);
    expect(leftEx.z).toBeCloseTo(-rightEx.z, 2);
  });

  it('keeps the right cover on the housing seat and extends only the left flywheel end', () => {
    const box = (id: string) => new THREE.Box3().setFromObject(ASSET_BUILDERS[id]());
    for (const u of ['upper', 'lower'] as const) {
      const L = box(`valve-cover-${u}-left`), R = box(`valve-cover-${u}-right`);
      // Cylinder 6's exhaust hub sits on the flywheel end wall. The left cover
      // and its gasket end rail move past that hub; the right cover stays put.
      expect(R.min.z - L.min.z, `${u} left flywheel extension`).toBeGreaterThan(20);
      expect(R.min.z - L.min.z, `${u} left flywheel extension`).toBeLessThan(36);
      expect(L.max.z, `${u} pulley end`).toBeCloseTo(R.max.z, 0);
      expect(R.min.z, `${u} right flywheel end`).toBeGreaterThan(CH_Z0 - 1);
      expect(L.max.z, u).toBeLessThan(CH_Z1 + 1);
      expect(R.max.z - R.min.z, `${u} right length`).toBeGreaterThan(CH_Z1 - CH_Z0 - 20);
    }
  });

  it('keeps every rocker sub-mesh in one connected piece per station', () => {
    const tol = 0.75;
    const count = (meshes: THREE.Mesh[]) => {
      const boxes = meshes.map((m) => new THREE.Box3().setFromObject(m));
      const parent = meshes.map((_, i) => i);
      const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
      for (let i = 0; i < meshes.length; i++) for (let j = i + 1; j < meshes.length; j++) {
        if (boxes[i].clone().expandByScalar(tol).intersectsBox(boxes[j])) {
          const a = find(i), b = find(j);
          if (a !== b) parent[a] = b;
        }
      }
      return new Set(meshes.map((_, i) => find(i))).size;
    };
    for (const s of [1, -1] as const) {
      const id = s > 0 ? 'rockers-right' : 'rockers-left';
      const root = ASSET_BUILDERS[id]();
      root.updateMatrixWorld(true);
      const meshes: THREE.Mesh[] = [];
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && !(m as THREE.InstancedMesh).isInstancedMesh) meshes.push(m);
      });
      const stations = rockerStations(s);
      const groups: THREE.Mesh[][] = stations.map(() => []);
      for (const m of meshes) {
        const c = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3());
        let best = 0, bestD = Infinity;
        stations.forEach((st, i) => {
          const d = Math.hypot(c.x - st.x, c.y - st.y, c.z - st.z);
          if (d < bestD) { bestD = d; best = i; }
        });
        expect(bestD, `${id} floating fragment`).toBeLessThan(56);
        groups[best].push(m);
      }
      groups.forEach((g, i) => {
        const tag = `${id} cyl ${stations[i].cyl} side ${stations[i].side}`;
        expect(g.length, tag).toBeGreaterThan(4);
        expect(count(g), `${tag} components`).toBe(1);
      });
    }
  });

  it('seats the cam dowel in the flange hole and stands it proud of the sprocket', () => {
    const lip = CAM_WEB.depth / 2 + CAM_WEB.bevel;
    for (const s of [1, -1] as const) {
      const b = s > 0 ? 'right' : 'left';
      const zc = CHAIN_Z[s];
      const pin = worldVerts(ASSET_BUILDERS[`cam-pin-${b}`]());
      const zs = pin.map((v) => v.z - zc);
      const tip = Math.max(...zs), tail = Math.min(...zs);
      expect(tip - tail, `${b} length`).toBeCloseTo(CAM_NOSE.pin.len, 1);
      expect(tip, `${b} proud of the web`).toBeGreaterThan(lip + CAM_NOSE.pin.proud - 0.25);
      expect(tail, `${b} inside the flange`).toBeLessThan(CAM_NOSE.flange[1] - 1);
      expect(tail, `${b} not through the flange back`).toBeGreaterThan(CAM_NOSE.flange[0] + 1);
      const rad = pin.map((v) => Math.hypot(v.x - CAM_X * s, v.y));
      expect((Math.min(...rad) + Math.max(...rad)) / 2, `${b} circle`).toBeCloseTo(CAM_NOSE.pin.rad, 0);
    }
  });
});
