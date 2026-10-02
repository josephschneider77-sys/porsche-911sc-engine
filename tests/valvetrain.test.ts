import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  CAM, PEAK_R, LASH, PAD_LEN, EYE_LEN, PAD_W, FIRE_CRANK, ASSEMBLED_CRANK, trainPose, camshaft, camWebZ, lobeRadius,
  rockerStations, plugCoverLocal,
} from '../src/geo/valvetrain';
import { CAM_X, SPARK_TIP, SPARK_Z, SPARK_AXIS, SPARK_HOLE_R, SPARK_FLANGE_T, sparkDirHead, sparkRoll, plugTipEngine, plugAxisEngine } from '../src/data/layout';
import { CAM_NOSE, CAM_WEB, CHAIN_Z, CH_Z0, CH_Z1, coverMatrix } from '../src/geo/core';
import { crownSurfaceX, PISTON_DECK, VALVE_DIA, VALVE_FACE, stemDirLocal } from '../src/geo/valveGeom';
import { ASSET_BUILDERS, partPose } from '../src/geo/assets';
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
      // The 7.5 mm lobe arrives as at least 10.5 mm intake and 11.1 mm exhaust.
      expect(peak.lift, `${tag} lift`).toBeGreaterThanOrEqual(side > 0 ? 10.5 : 11.1);
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
    const lowerL = box('valve-cover-lower-left'), lowerR = box('valve-cover-lower-right');
    expect(Math.abs(lowerL.min.z - lowerR.min.z), 'lower flywheel end').toBeLessThan(2);
    expect(lowerL.max.z, 'lower pulley end').toBeCloseTo(lowerR.max.z, 0);
    expect(lowerL.min.z).toBeGreaterThan(CH_Z0 - 1);
    expect(lowerL.max.z).toBeLessThan(CH_Z1 + 1);
    // The seal lip (cover-local z under 3) stays on the cam-housing rail on both
    // banks. Cylinder 6 is a half-round scallop in the end wall, not a boss past the rail.
    const lip = (id: string, s: 1 | -1) => {
      const root = ASSET_BUILDERS[id]();
      const inv = coverMatrix(s, true).clone().invert();
      const b = new THREE.Box3();
      const v = new THREE.Vector3();
      root.updateMatrixWorld(true);
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const P = mesh.geometry.attributes.position;
        for (let i = 0; i < P.count; i++) {
          v.fromBufferAttribute(P, i).applyMatrix4(mesh.matrixWorld);
          const local = v.clone().applyMatrix4(inv);
          // The cylinder-6 boss is past local |y| 186. The seal is the lip inside the rail.
          if (local.z < 3 && Math.abs(local.y) < 184) b.expandByPoint(v);
        }
      });
      return b;
    };
    const lipL = lip('valve-cover-upper-left', -1), lipR = lip('valve-cover-upper-right', 1);
    expect(Math.abs(lipL.min.z - lipR.min.z), 'upper seal flywheel end').toBeLessThan(2);
    expect(Math.abs(lipL.max.z - lipR.max.z), 'upper seal pulley end').toBeLessThan(2);
    expect(lipL.min.z).toBeGreaterThan(CH_Z0 - 1);
    expect(lipL.max.z).toBeLessThan(CH_Z1 + 1);
    const upperL = box('valve-cover-upper-left'), upperR = box('valve-cover-upper-right');
    expect(upperL.min.z, 'upper flywheel end').toBeCloseTo(upperR.min.z, 0);
    expect(upperL.max.z, 'upper pulley end').toBeCloseTo(upperR.max.z, 0);
    expect(upperL.min.z, 'scallop stays on the rail').toBeGreaterThan(CH_Z0 - 1);
    expect(upperL.max.z).toBeLessThan(CH_Z1 + 1);
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
          const d = Math.hypot(c.x - st.x, c.y - st.y, (c.z - st.z) * 4);
          if (d < bestD) { bestD = d; best = i; }
        });
        expect(bestD, `${id} floating fragment`).toBeLessThan(80);
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

  it('is watertight apart from coincident seams, and rays from inside the metal hit a wall', () => {
    // Weld vertices that share a position (lathe phi seam, indexed copies). A remaining
    // boundary edge is a hole. Main's head / right housing / upper / lower covers were
    // 144 / 1192 / 670 / 871; the parts this branch rebuilds have to close completely.
    const openEdges = (id: string) => {
      const root = ASSET_BUILDERS[id]();
      root.updateMatrixWorld(true);
      const count = new Map<string, number>();
      const v = new THREE.Vector3();
      const keyOf = (i: number, P: THREE.BufferAttribute, m: THREE.Matrix4) => {
        v.fromBufferAttribute(P, i).applyMatrix4(m);
        // toFixed(-0) is the string "-0.000", which splits a lathe seam in half.
        const q = (n: number) => {
          const r = Math.round(n * 1000);
          return Object.is(r, -0) ? 0 : r;
        };
        return `${q(v.x)}_${q(v.y)}_${q(v.z)}`;
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
    const closed = [
      'cylinder-head',
      'cam-housing-right', 'cam-housing-left',
      'valve-cover-upper-right', 'valve-cover-lower-right',
      'valve-cover-upper-left', 'valve-cover-lower-left',
      'valve-cover-gasket-upper-right', 'valve-cover-gasket-upper-left',
      'valve-cover-gasket-lower-right', 'valve-cover-gasket-lower-left',
      'spark-plug', 'spark-plug-connector',
      'rockers-right', 'rockers-left',
    ];
    for (const id of closed) expect(openEdges(id), id).toBe(0);
    const miss = (id: string, origin: THREE.Vector3) => {
      let n = 0;
      const dirs = 24;
      for (let i = 0; i < dirs; i++) {
        const y = 1 - (i / (dirs - 1)) * 2;
        const rr = Math.sqrt(Math.max(0, 1 - y * y));
        const phi = i * Math.PI * (3 - Math.sqrt(5));
        const dir = new THREE.Vector3(Math.cos(phi) * rr, y, Math.sin(phi) * rr);
        if (!rayHit(id, origin, dir, 120)) n++;
      }
      return n;
    };
    const headPose = partPose('head-1');
    expect(miss('head-1', new THREE.Vector3(30, 0, 0).applyMatrix4(headPose)), 'head').toBe(0);
    // The cover mesh is already in engine space. partPose is identity; the roof
    // skin is cover-local z 27, between the cavity and the 28 mm shell.
    const skin = new THREE.Vector3(0, 40, 27.2).applyMatrix4(coverMatrix(1, false));
    expect(miss('valve-cover-lower-right', skin), 'lower cover skin').toBe(0);
    expect(miss('spark-plug-1', new THREE.Vector3(0, -20, 0).applyMatrix4(partPose('spark-plug-1'))), 'plug hex').toBe(0);
  });

  it('opens the upper cover only on the plug holes', () => {
    // Rays from inside the pan toward the roof. The lower lid is closed.
    // An upper-lid ray may miss only when it passes through a plug hole.
    const holeAt = (s: 1 | -1) => (s > 0 ? [1, 2, 3] : [4, 5, 6]).map((c) => plugCoverLocal(c, 22));
    for (const s of [1, -1] as const) for (const upper of [true, false]) {
      const id = `valve-cover-${upper ? 'upper' : 'lower'}-${s > 0 ? 'right' : 'left'}`;
      const frame = coverMatrix(s, upper);
      const origin = new THREE.Vector3(0, 0, 8).applyMatrix4(frame);
      const holes = upper ? holeAt(s) : [];
      let missed = 0;
      for (let ix = -2; ix <= 2; ix++) for (let iy = -3; iy <= 3; iy++) {
        const local = new THREE.Vector3(ix * 6, iy * 40, 22);
        const throughHole = holes.some((h) => Math.hypot(local.x - h.x, local.y - h.y) < SPARK_HOLE_R + 4);
        if (throughHole) continue;
        const target = new THREE.Vector3(ix * 6, iy * 40, 30).applyMatrix4(frame);
        const dir = target.clone().sub(origin).normalize();
        if (!rayHit(id, origin, dir, 200)) missed++;
      }
      expect(missed, id).toBe(0);
      if (upper) {
        const cyls = s > 0 ? [1, 2, 3] : [4, 5, 6];
        for (const c of cyls) {
          const tip = new THREE.Vector3(...plugTipEngine(c));
          const axis = new THREE.Vector3(...plugAxisEngine(c));
          const start = tip.clone().addScaledVector(axis, SPARK_FLANGE_T - 18);
          expect(rayHit(id, start, axis, 36), `${id} plug bore cyl ${c}`).toBeNull();
        }
      }
    }
  });

  it('keeps the electrode 1.5 mm off the piston at TDC and clear of both valve heads', () => {
    const tip = new THREE.Vector3(SPARK_TIP.x, SPARK_TIP.y, SPARK_Z);
    const crown = crownSurfaceX(tip.y, tip.z);
    expect(crown).not.toBeNull();
    expect(tip.x - (crown! - PISTON_DECK)).toBeGreaterThanOrEqual(1.5);
    // Ground-strap outer face. 2.2 mm survives the 1 mm erosion on each mesh; 1.5 mm is the floor.
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(...SPARK_AXIS).normalize());
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), sparkRoll(1)));
    for (const corner of [[0, 0.75, 0], [0.55, 0.75, -0.7], [-0.55, 0.75, 0.9]] as const) {
      const p = new THREE.Vector3(...corner).applyQuaternion(q).add(tip);
      const c = crownSurfaceX(p.y, p.z);
      expect(c, `strap ${corner}`).not.toBeNull();
      const gap = p.x - (c! - PISTON_DECK);
      expect(gap, `strap ${corner}`).toBeGreaterThanOrEqual(2.2);
      const rf = Math.sqrt(Math.max(0, 76 * 76 - p.y * p.y - p.z * p.z)) - 62;
      expect(p.x, `strap roof ${corner}`).toBeLessThan(rf - 0.2);
    }
    const dir = new THREE.Vector3(...SPARK_AXIS).normalize();
    const elev = Math.atan2(dir.y, Math.hypot(dir.x, dir.z)) * 180 / Math.PI;
    const offAxis = Math.acos(Math.min(1, dir.x)) * 180 / Math.PI;
    expect(elev).toBeCloseTo(35.95, 1);
    expect(offAxis).toBeCloseTo(36.79, 1);
    for (const side of [1, -1] as const) {
      const face = side > 0
        ? new THREE.Vector3(VALVE_FACE.in.x, VALVE_FACE.in.y, VALVE_FACE.in.z)
        : new THREE.Vector3(VALVE_FACE.ex.x, VALVE_FACE.ex.y, VALVE_FACE.ex.z);
      const stem = stemDirLocal(side);
      const R = (side > 0 ? VALVE_DIA.in : VALVE_DIA.ex) / 2;
      for (const lift of [0, 11.2]) {
        const seat = face.clone().addScaledVector(stem, lift);
        for (let t = 0; t <= 26; t += 2) {
          const p = tip.clone().addScaledVector(dir, t);
          const rel = p.clone().sub(seat);
          const axial = rel.dot(stem);
          const radial = Math.sqrt(Math.max(0, rel.lengthSq() - axial * axial));
          if (axial > -4 && axial < 8) expect(radial, `side ${side} lift ${lift} t ${t}`).toBeGreaterThan(R + 6.6);
        }
      }
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
