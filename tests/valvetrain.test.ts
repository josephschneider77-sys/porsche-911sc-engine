import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  CAM, PEAK_R, LASH, PAD_LEN, EYE_LEN, PAD_W, FIRE_CRANK, ASSEMBLED_CRANK, trainPose, camshaft, camWebZ, lobeRadius,
  rockerStations,
} from '../src/geo/valvetrain';
import { CAM_X } from '../src/data/layout';
import { CAM_NOSE, CAM_WEB, CHAIN_Z, CH_Z0, CH_Z1, coverMatrix } from '../src/geo/core';
import { SPARK_TIP, SPARK_Z, sparkDirHead, COVER_BOOT_HOLE } from '../src/data/layout';
import { ASSET_BUILDERS } from '../src/geo/assets';
import { rayHit } from './hw';
import { clearance } from './collide';

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
    expect(CAM.boreR).toBeCloseTo(23.55, 2);
    expect(CAM.journalR).toBeCloseTo(23.35, 2);
    expect(CAM.boreR - CAM.journalR).toBeGreaterThan(0.15);
    expect(CAM.boreR - CAM.journalR).toBeLessThan(0.35);
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
      // Main lifted 6.71 mm intake and 5.57 mm exhaust. The same 7.5 mm lobe
      // arrives as about 10.5 / 11.1 mm with the 71° / 50° eye.
      expect(peak.lift, `${tag} lift`).toBeGreaterThanOrEqual(10);
      const s = cyl <= 3 ? 1 : -1;
      const cam = new THREE.Vector2(s * CAM_X, 0);
      expect(Math.abs(closed.lay.K.distanceTo(cam) - CAM.baseR), `${tag} pad on base circle`).toBeLessThanOrEqual(0.05);
      expect(peak.gap, tag).toBeLessThan(0.02);
      // Photo proportions: a long pad arm and a distinct shorter eye arm, not a stub on the boss.
      expect(closed.lay.P.distanceTo(closed.lay.K), `${tag} pad arm`).toBeGreaterThan(PAD_LEN - 1);
      expect(closed.lay.P.distanceTo(closed.lay.ball), `${tag} eye arm`).toBeGreaterThan(EYE_LEN - 1);
      expect(PAD_W, 'pad shoe width').toBe(19);
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

  it('trims the left valve cover to the cam-housing seat, matching the right cover', () => {
    const box = (id: string) => new THREE.Box3().setFromObject(ASSET_BUILDERS[id]());
    for (const u of ['upper', 'lower'] as const) {
      const L = box(`valve-cover-${u}-left`), R = box(`valve-cover-${u}-right`);
      expect(L.min.z, `${u} flywheel end`).toBeCloseTo(R.min.z, 0);
      expect(L.max.z, `${u} pulley end`).toBeCloseTo(R.max.z, 0);
      expect(L.min.z, u).toBeGreaterThan(CH_Z0 - 1);
      expect(L.max.z, u).toBeLessThan(CH_Z1 + 1);
      expect(R.max.z - R.min.z, `${u} length`).toBeGreaterThan(CH_Z1 - CH_Z0 - 20);
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

  it('does not grow top-end boundary edges past the cut shells', () => {
    // Boundary edges after welding vertices to 1 mm.
    // Main df88f34: covers 1123/1228/1073/1282, housings 1156, cams 357/317, rockers 2527/2544.
    // Camshafts stay on that baseline. Covers, housings and rockers are higher because the
    // stud holes, rocker pockets and line bore are real cuts; a deleted window (the old
    // 2.8 mm triangle cull) jumps a cover well past these ceilings.
    const baseline: Record<string, number> = {
      'valve-cover-upper-right': 2700,
      'valve-cover-lower-right': 3600,
      'valve-cover-upper-left': 2500,
      'valve-cover-lower-left': 3360,
      'cam-housing-right': 8800,
      'cam-housing-left': 9000,
      'camshaft-right': 357,
      'camshaft-left': 317,
      'rockers-right': 2750,
      'rockers-left': 2750,
    };
    const openEdges = (id: string) => {
      const root = ASSET_BUILDERS[id]();
      root.updateMatrixWorld(true);
      const count = new Map<string, number>();
      const v = new THREE.Vector3();
      const keyOf = (i: number, P: THREE.BufferAttribute, m: THREE.Matrix4) => {
        v.fromBufferAttribute(P, i).applyMatrix4(m);
        return `${Math.round(v.x)}_${Math.round(v.y)}_${Math.round(v.z)}`;
      };
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
        const P = g.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < P.count; i += 3) {
          const k = [keyOf(i, P, mesh.matrixWorld), keyOf(i + 1, P, mesh.matrixWorld), keyOf(i + 2, P, mesh.matrixWorld)];
          for (let e = 0; e < 3; e++) {
            const a = k[e], b = k[(e + 1) % 3];
            if (a === b) continue;
            const edge = a < b ? `${a}|${b}` : `${b}|${a}`;
            count.set(edge, (count.get(edge) ?? 0) + 1);
          }
        }
      });
      let open = 0;
      for (const n of count.values()) if (n === 1) open++;
      return open;
    };
    for (const [id, max] of Object.entries(baseline)) {
      expect(openEdges(id), id).toBeLessThanOrEqual(max);
    }
  });

  it('does not open windows in the valve covers', () => {
    // Rays from inside the pan toward the roof, clear of the stud ears.
    // A deleted patch lets the ray out; the stud holes are outside this grid.
    expect(COVER_BOOT_HOLE).toBe(false);
    for (const s of [1, -1] as const) for (const upper of [true, false]) {
      const id = `valve-cover-${upper ? 'upper' : 'lower'}-${s > 0 ? 'right' : 'left'}`;
      const frame = coverMatrix(s, upper);
      const origin = new THREE.Vector3(0, 0, 8).applyMatrix4(frame);
      let missed = 0;
      for (let ix = -2; ix <= 2; ix++) for (let iy = -3; iy <= 3; iy++) {
        const target = new THREE.Vector3(ix * 6, iy * 40, 30).applyMatrix4(frame);
        const dir = target.clone().sub(origin).normalize();
        if (!rayHit(id, origin, dir, 60)) missed++;
      }
      expect(missed, id).toBe(0);
    }
  });

  it('keeps the plug body off the exhaust flange and 2.5 mm off the heat exchanger', () => {
    const [dx, dy, dz] = sparkDirHead();
    const dir = new THREE.Vector3(dx, dy, dz).normalize();
    const tip = new THREE.Vector3(SPARK_TIP.x, SPARK_TIP.y, SPARK_Z);
    // Flange plate, head-local: x 12–56, y −63.5..−52, z −39..39, hole r 15.5 at (34, z 0).
    for (let t = 0; t <= 90; t += 1) {
      const p = tip.clone().addScaledVector(dir, t);
      if (p.y < -63.5 || p.y > -52 || p.x < 12 || p.x > 56 || Math.abs(p.z) > 39) continue;
      const fromHole = Math.hypot(p.x - 34, p.z);
      expect(fromHole, `axis at t ${t} is in the flange plate`).toBeGreaterThan(15.5);
    }
    expect(clearance('spark-plug-1', 'heat-exchanger-right')).toBeGreaterThanOrEqual(2.5);
    expect(clearance('spark-plug-4', 'heat-exchanger-left')).toBeGreaterThanOrEqual(2.5);
  });
});
