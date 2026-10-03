import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import {
  CAM, PEAK_R, PEAK_CRANK, LASH, PAD_W, FIRE_CRANK, ASSEMBLED_CRANK, trainPose, camshaft, camWebZ, lobeRadius,
  rockerStations, plugCoverLocal, valveHeadEngine,
} from '../src/geo/valvetrain';
import { CAM_X, SPARK_TIP, SPARK_Z, SPARK_AXIS, SPARK_HOLE_R, SPARK_FLANGE_T, sparkDirHead, sparkRoll, plugTipEngine, plugAxisEngine } from '../src/data/layout';
import { CAM_NOSE, CAM_WEB, CHAIN_Z, CH_Z0, CH_Z1, coverMatrix } from '../src/geo/core';
import { crownSurfaceX, PISTON_DECK, VALVE_DIA, VALVE_FACE, STEM_R, stemDirLocal } from '../src/geo/valveGeom';
import { ASSET_BUILDERS, partPose } from '../src/geo/assets';
import { SMALL_GEOM } from '../src/geo/smallParts';
import { rayHit } from './hw';
import { clearance } from './collide';

const PEAK_AT = PEAK_CRANK;

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

/** Triangle islands in one mesh. Welded at 0.001 mm, same key as the watertight edge test. */
function meshComponents(mesh: THREE.Mesh): number {
  const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  const P = g.attributes.position as THREE.BufferAttribute;
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let p = parent.get(k) ?? k;
    if (p !== k) { p = find(p); parent.set(k, p); }
    return p;
  };
  const unite = (a: string, b: string) => {
    const pa = find(a), pb = find(b);
    if (pa !== pb) parent.set(pa, pb);
  };
  const q = (n: number) => {
    const r = Math.round(n * 1000);
    return Object.is(r, -0) ? 0 : r;
  };
  const v = new THREE.Vector3();
  const key = (i: number) => {
    v.fromBufferAttribute(P, i).applyMatrix4(mesh.matrixWorld);
    return `${q(v.x)}_${q(v.y)}_${q(v.z)}`;
  };
  const seen = new Set<string>();
  let n = 0;
  for (let i = 0; i < P.count; i += 3) {
    const ks = [key(i), key(i + 1), key(i + 2)];
    for (const k of ks) if (!parent.has(k)) parent.set(k, k);
    unite(ks[0], ks[1]);
    unite(ks[1], ks[2]);
  }
  for (let i = 0; i < P.count; i += 3) {
    const r = find(key(i));
    if (!seen.has(r)) { seen.add(r); n++; }
  }
  return n;
}

describe('top-end batch 1', () => {
  it('keeps every lobe peak under the journal so the cam can slide through the bore', () => {
    expect(CAM.boreR).toBeCloseTo(23.55, 2);
    expect(CAM.journalR).toBeCloseTo(23.35, 2);
    expect(CAM.boreR - CAM.journalR).toBeGreaterThan(0.15);
    expect(CAM.boreR - CAM.journalR).toBeLessThan(0.35);
    expect(CAM.baseR).toBeCloseTo(14.7, 2);
    expect(PEAK_R).toBeLessThan(CAM.journalR - 0.5);
    expect(PEAK_R).toBeLessThan(CAM.boreR - 0.5);
    expect(lobeRadius(0, 1)).toBeCloseTo(CAM.baseR + CAM.lift.in, 5);
    expect(lobeRadius(0, -1)).toBeCloseTo(CAM.baseR + CAM.lift.ex, 5);
    expect(lobeRadius(0, 1)).toBeLessThan(22.85);
    expect(lobeRadius(0, -1)).toBeLessThan(22.85);
    expect(lobeRadius(Math.PI, 1)).toBeCloseTo(CAM.baseR, 5);
    expect(lobeRadius(Math.PI, -1)).toBeCloseTo(CAM.baseR, 5);
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
      expect(peak.lobeR, tag).toBeCloseTo(side > 0 ? lobeRadius(0, 1) : lobeRadius(0, -1), 2);
      // FVD 930 105 147 17 / Cat Cams, with 0.10 mm lash: 11.3 intake, 9.9 exhaust.
      const want = side > 0 ? 11.3 : 9.9;
      expect(Math.abs(peak.lift - want), `${tag} lift`).toBeLessThanOrEqual(0.3);
      const overlap = trainPose(cyl, side, FIRE_CRANK[cyl] + 360);
      const wantTdc = side > 0 ? 1.15 : 1.35;
      expect(Math.abs(overlap.lift - wantTdc), `${tag} overlap TDC`).toBeLessThanOrEqual(0.15);
      const b = peak.lay.ball.clone().sub(peak.lay.P).rotateAround(new THREE.Vector2(0, 0), peak.beta).add(peak.lay.P);
      const dx = b.x - peak.lay.tip.x, dy = b.y - peak.lay.tip.y;
      const along = dx * peak.lay.stem.x + dy * peak.lay.stem.y;
      const off = Math.hypot(dx - peak.lay.stem.x * along, dy - peak.lay.stem.y * along);
      expect(off, `${tag} ball on the stem`).toBeLessThanOrEqual(3);
      const s = cyl <= 3 ? 1 : -1;
      const cam = new THREE.Vector2(s * CAM_X, 0);
      expect(Math.abs(closed.lay.K.distanceTo(cam) - CAM.baseR), `${tag} pad on base circle`).toBeLessThanOrEqual(0.05);
      expect(peak.gap, tag).toBeLessThan(0.02);
      const pad = closed.lay.P.distanceTo(closed.lay.K);
      const eye = closed.lay.P.distanceTo(closed.lay.ball);
      expect(pad, `${tag} pad arm`).toBeGreaterThanOrEqual(31);
      expect(pad, `${tag} pad arm`).toBeLessThanOrEqual(35);
      expect(eye, `${tag} eye arm`).toBeGreaterThanOrEqual(33);
      expect(eye, `${tag} eye arm`).toBeLessThanOrEqual(40);
      expect(closed.lay.P.distanceTo(closed.lay.C), `${tag} shaft to cam`).toBeGreaterThanOrEqual(40);
      expect(closed.lay.P.distanceTo(closed.lay.C), `${tag} shaft to cam`).toBeLessThanOrEqual(42);
      expect(PAD_W, 'pad shoe width').toBe(19);
    }
  });

  it('seats the pad shoe on the base circle and keeps main pan heights', () => {
    const root = ASSET_BUILDERS['rockers-right']();
    root.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    for (const side of [1, -1] as const) {
      const pose = trainPose(1, side, 0);
      let gap = Infinity;
      root.traverse((o: any) => {
        if (!o.isMesh || o.material?.name !== 'polishedSteel') return;
        const P = o.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < P.count; i++) {
          v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld);
          // The shoe is 19 mm wide and has no mid-plane vertices, so the crown
          // sits on the flat faces, up to 9.5 mm off the lobe centre.
          if (Math.abs(v.z - pose.lay.z) > 12) continue;
          gap = Math.min(gap, Math.hypot(v.x - pose.lay.C.x, v.y - pose.lay.C.y) - CAM.baseR);
        }
      });
      expect(Math.abs(gap), side > 0 ? 'intake shoe' : 'exhaust shoe').toBeLessThan(0.02);
    }
    const span = (id: string, s: 1 | -1, upper: boolean) => {
      const inv = coverMatrix(s, upper).clone().invert();
      const part = ASSET_BUILDERS[id]();
      part.updateMatrixWorld(true);
      let max = -Infinity;
      part.traverse((o: any) => {
        if (!o.isMesh) return;
        const P = o.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < P.count; i++) {
          v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld).applyMatrix4(inv);
          if (v.z > max) max = v.z;
        }
      });
      return max;
    };
    // Main's upper bosses reached 27.9 mm and the lower ribs 24.0 mm. The pans
    // stay at that envelope: collars under 27.9, ribs at 24. No clearance box.
    expect(span('valve-cover-upper-right', 1, true)).toBeLessThanOrEqual(27.9);
    expect(span('valve-cover-upper-left', -1, true)).toBeLessThanOrEqual(27.9);
    expect(span('valve-cover-lower-right', 1, false)).toBeCloseTo(24, 1);
    expect(span('valve-cover-lower-left', -1, false)).toBeCloseTo(24, 1);
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
    expect(lowerL.min.z, 'lower flywheel end').toBeCloseTo(lowerR.min.z, 0);
    expect(lowerR.max.z - lowerR.min.z, 'lower right length').toBeGreaterThan(CH_Z1 - CH_Z0 - 20);
    expect(lowerL.max.z - lowerL.min.z, 'lower left length').toBeGreaterThan(CH_Z1 - CH_Z0 - 20);
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
    expect(upperR.max.z - upperR.min.z, 'upper right length').toBeGreaterThan(CH_Z1 - CH_Z0 - 20);
    expect(upperL.max.z - upperL.min.z, 'upper left length').toBeGreaterThan(CH_Z1 - CH_Z0 - 20);
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
        expect(bestD, `${id} floating fragment`).toBeLessThan(56);
        groups[best].push(m);
      }
      groups.forEach((g, i) => {
        const tag = `${id} cyl ${stations[i].cyl} side ${stations[i].side}`;
        expect(g.length, tag).toBeGreaterThan(4);
        expect(count(g), `${tag} components`).toBe(1);
        for (const m of g) expect(meshComponents(m), `${tag} mesh`).toBe(1);
      });
    }
  });

  it('keeps every rebuilt part one solid, apart from assemblies', () => {
    // A rocker bank is six stations, and a station is a shaft plus a bush plus a
    // forging. Each of those meshes is one solid; the station test checks they meet.
    // Rocker banks are six stations. Cam housings are an existing multi-mesh
    // casting; the rocker pockets do not join those scraps into one body.
    const assemblies = new Set(['rockers-right', 'rockers-left', 'cam-housing-right', 'cam-housing-left']);
    const touched = [
      'cylinder-head',
      'valve-cover-upper-right', 'valve-cover-lower-right',
      'valve-cover-upper-left', 'valve-cover-lower-left',
      'valve-cover-gasket-upper-right', 'valve-cover-gasket-upper-left',
      'valve-cover-gasket-lower-right', 'valve-cover-gasket-lower-left',
      'spark-plug', 'spark-plug-connector',
      'rockers-right', 'rockers-left',
    ];
    const touch = (a: THREE.Box3, b: THREE.Box3) => a.clone().expandByScalar(0.2).intersectsBox(b);
    for (const id of touched) {
      const root = ASSET_BUILDERS[id]();
      root.updateMatrixWorld(true);
      const meshes: THREE.Mesh[] = [];
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) meshes.push(m);
      });
      const solid = meshes.filter((m) => (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) > 0);
      expect(solid.length, id).toBeGreaterThan(0);
      const cover = id.startsWith('valve-cover-') && !id.includes('gasket');
      if (cover) {
        // The pan shell is one solid the length of the cover. The lip boolean
        // also leaves closed scraps in another mesh; those are not a second pan.
        const long = solid.some((m) => {
          if (meshComponents(m) !== 1) return false;
          const size = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());
          return size.length() > 300;
        });
        expect(long, `${id} pan`).toBe(true);
        continue;
      }
      solid.forEach((m, i) => expect(meshComponents(m), `${id} mesh ${i}`).toBe(1));
      if (assemblies.has(id)) continue;
      const boxes = solid.map((m) => new THREE.Box3().setFromObject(m));
      const parent = solid.map((_, i) => i);
      const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
      for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
        if (touch(boxes[i], boxes[j])) {
          const a = find(i), b = find(j);
          if (a !== b) parent[a] = b;
        }
      }
      expect(new Set(solid.map((_, i) => find(i))).size, `${id} body`).toBe(1);
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
    const samples: [string, string, THREE.Vector3][] = [
      ['head-1', 'head web', new THREE.Vector3(30, 0, 0).applyMatrix4(headPose)],
      ['head-1', 'head roof', new THREE.Vector3(42, -8, 6).applyMatrix4(headPose)],
      ['valve-cover-lower-right', 'lower roof', new THREE.Vector3(0, 40, 20.6).applyMatrix4(coverMatrix(1, false))],
      ['valve-cover-lower-right', 'lower rib', new THREE.Vector3(0, 0, 22.4).applyMatrix4(coverMatrix(1, false))],
      ['valve-cover-upper-right', 'upper roof', new THREE.Vector3(0, 20, 20.6).applyMatrix4(coverMatrix(1, true))],
      ['valve-cover-upper-right', 'upper roof b', new THREE.Vector3(0, 20, 21.3).applyMatrix4(coverMatrix(1, true))],
      ['spark-plug-1', 'plug hex', new THREE.Vector3(0, -20, 0).applyMatrix4(partPose('spark-plug-1'))],
      ['spark-plug-1', 'plug shell', new THREE.Vector3(0, -8, 0).applyMatrix4(partPose('spark-plug-1'))],
      ['spark-plug-1', 'plug insulator', new THREE.Vector3(0, -48, 0).applyMatrix4(partPose('spark-plug-1'))],
      ['cam-housing-right', 'housing wall', new THREE.Vector3(CAM_X + 28, 0, 40)],
      ['cam-housing-left', 'housing wall', new THREE.Vector3(-CAM_X - 28, 0, -40)],
    ];
    for (const [id, tag, origin] of samples) expect(miss(id, origin), tag).toBe(0);
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

  it('keeps rockers and valves at least 0.5 mm off the covers through a 2° crank sweep', () => {
    const bake = (id: string) => {
      const root = ASSET_BUILDERS[id]();
      root.updateMatrixWorld(true);
      const pos: number[] = [];
      const v = new THREE.Vector3();
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
        const P = g.attributes.position;
        for (let i = 0; i < P.count; i++) {
          v.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld);
          pos.push(v.x, v.y, v.z);
        }
      });
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      return new MeshBVH(geom);
    };
    const coverOf = (s: 1 | -1, upper: boolean) =>
      bake(`valve-cover-${upper ? 'upper' : 'lower'}-${s > 0 ? 'right' : 'left'}`);
    const covers = new Map<string, MeshBVH>();
    for (const s of [1, -1] as const) for (const upper of [true, false]) {
      covers.set(`${s}:${upper ? 1 : 0}`, coverOf(s, upper));
    }
    const odd = (bvh: MeshBVH, p: THREE.Vector3) => {
      const hits = bvh.raycast(new THREE.Ray(p, new THREE.Vector3(0.2, 0.9, 0.15).normalize()), THREE.DoubleSide) as { distance: number }[];
      return hits.filter((h) => h.distance > 1e-3).length % 2 === 1;
    };
    const target = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 };
    let min = Infinity, where = '';
    const q = new THREE.Vector3();
    for (const s of [1, -1] as const) {
      const id = s > 0 ? 'rockers-right' : 'rockers-left';
      const root = ASSET_BUILDERS[id]();
      root.updateMatrixWorld(true);
      const stations = rockerStations(s);
      const groups = stations.map(() => [] as THREE.Vector3[]);
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const P = m.geometry.attributes.position;
        const v = new THREE.Vector3();
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i < P.count; i++) {
          v.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld);
          pts.push(v.clone());
        }
        if (!pts.length) return;
        const c = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
        let best = 0, bestD = Infinity;
        stations.forEach((st, i) => {
          const d = Math.hypot(c.x - st.x, c.y - st.y, c.z - st.z);
          if (d < bestD) { bestD = d; best = i; }
        });
        groups[best].push(...pts);
      });
      const valves = stations.map((st) => {
        const head = valveHeadEngine(st.cyl, st.side, ASSEMBLED_CRANK);
        const g = head.index ? head.toNonIndexed() : head;
        const P = g.attributes.position;
        const pts: THREE.Vector3[] = [];
        const v = new THREE.Vector3();
        for (let i = 0; i < P.count; i += 2) {
          v.fromBufferAttribute(P, i);
          pts.push(v.clone());
        }
        const d = stemDirLocal(st.side);
        const stem = new THREE.Vector3(s * d.x, d.y, s * d.z).normalize();
        const closed = trainPose(st.cyl, st.side, ASSEMBLED_CRANK);
        return { pts, stem, lift0: closed.lift, beta0: closed.beta };
      });
      for (let crank = 0; crank < 720; crank += 2) {
        stations.forEach((st, i) => {
          const pose = trainPose(st.cyl, st.side, crank);
          const dlt = pose.beta - valves[i].beta0;
          const cs = Math.cos(dlt), sn = Math.sin(dlt);
          const bvh = covers.get(`${s}:${st.side > 0 ? 1 : 0}`)!;
          const consider = (p: THREE.Vector3) => {
            bvh.closestPointToPoint(p, target as never);
            if (target.distance > 6) return;
            const signed = target.distance < 2.5 && odd(bvh, p) ? -target.distance : target.distance;
            if (signed < min) {
              min = signed;
              where = `cyl ${st.cyl} side ${st.side} crank ${crank}`;
            }
          };
          for (let k = 0; k < groups[i].length; k++) {
            const p = groups[i][k];
            const dx = p.x - st.x, dy = p.y - st.y;
            q.set(st.x + cs * dx - sn * dy, st.y + sn * dx + cs * dy, p.z);
            consider(q);
          }
          const shift = valves[i].lift0 - pose.lift;
          for (const p of valves[i].pts) {
            q.copy(p).addScaledVector(valves[i].stem, shift);
            consider(q);
          }
        });
      }
    }
    console.log(`cover sweep minimum ${min.toFixed(3)} mm at ${where}`);
    expect(min, where).toBeGreaterThanOrEqual(0.5);
  });

  it('sends rays from the cover side into each cam-housing cover land', () => {
    // A ray from the cover toward the seat must meet a front face. The left rails
    // and machined lands used to be inside-out, so the ray entered through the back.
    const halfL = (CH_Z1 - CH_Z0 - 8) / 2;
    const bake = (id: string) => {
      const root = ASSET_BUILDERS[id]();
      root.updateMatrixWorld(true);
      const pos: number[] = [];
      const v = new THREE.Vector3();
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
        const P = g.attributes.position;
        for (let i = 0; i < P.count; i++) {
          v.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld);
          pos.push(v.x, v.y, v.z);
        }
      });
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      return new MeshBVH(geom);
    };
    for (const s of [1, -1] as const) {
      const id = `cam-housing-${s > 0 ? 'right' : 'left'}`;
      const bvh = bake(id);
      for (const upper of [true, false]) {
        const frame = coverMatrix(s, upper);
        const inward = new THREE.Vector3().setFromMatrixColumn(frame, 2).negate();
        const p = new THREE.Vector3();
        const samples: [number, number][] = [];
        for (let y = -halfL + 8; y <= halfL - 8; y += 2) samples.push([-23.2, y], [23.2, y]);
        for (let x = -18; x <= 18; x += 4) samples.push([x, halfL - 4], [x, -halfL + 4]);
        let miss = 0, n = 0;
        for (const [x, y] of samples) {
          p.set(x, y, 1.5).applyMatrix4(frame);
          const front = bvh.raycastFirst(new THREE.Ray(p, inward), THREE.FrontSide) as { distance: number } | null;
          const dbl = bvh.raycastFirst(new THREE.Ray(p, inward), THREE.DoubleSide) as { distance: number } | null;
          if (!dbl || dbl.distance > 12) continue;
          n++;
          if (!front || front.distance > dbl.distance + 0.05) miss++;
        }
        expect(n, `${id} ${upper ? 'upper' : 'lower'} samples`).toBeGreaterThan(80);
        expect(miss, `${id} ${upper ? 'upper' : 'lower'} escaping rays`).toBe(0);
      }
    }
  });
});

describe('valve-cover gasket windows', () => {
  /** Enclosed openings in the gasket sheet. The outside of the frame is the one region that touches the raster border. */
  function enclosed(id: string) {
    const root = SMALL_GEOM[id].proto().g;
    root.updateMatrixWorld(true);
    const pos: number[] = [];
    const v = new THREE.Vector3();
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
      const P = g.attributes.position;
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld);
        pos.push(v.x, v.y, v.z);
      }
    });
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const bvh = new MeshBVH(geom);
    const x0 = -60, x1 = 60, y0 = -210, y1 = 210, step = 1;
    const nx = Math.round((x1 - x0) / step);
    const ny = Math.round((y1 - y0) / step);
    const metal = new Uint8Array(nx * ny);
    const origin = new THREE.Vector3();
    const dir = new THREE.Vector3(0, 0, 1);
    for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
      origin.set(x0 + (ix + 0.5) * step, y0 + (iy + 0.5) * step, -3);
      const hits = bvh.raycast(new THREE.Ray(origin, dir), THREE.DoubleSide) as { distance: number }[];
      if (hits.length) metal[iy * nx + ix] = 1;
    }
    const seen = new Uint8Array(nx * ny);
    const out: { w: number; h: number }[] = [];
    const stack: number[] = [];
    for (let i = 0; i < metal.length; i++) {
      if (metal[i] || seen[i]) continue;
      seen[i] = 1;
      stack.push(i);
      let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity, edge = false;
      while (stack.length) {
        const k = stack.pop()!;
        const ix = k % nx, iy = (k - ix) / nx;
        minx = Math.min(minx, ix); maxx = Math.max(maxx, ix);
        miny = Math.min(miny, iy); maxy = Math.max(maxy, iy);
        if (ix === 0 || iy === 0 || ix === nx - 1 || iy === ny - 1) edge = true;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const jx = ix + dx, jy = iy + dy;
          if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) continue;
          const j = jy * nx + jx;
          if (metal[j] || seen[j]) continue;
          seen[j] = 1;
          stack.push(j);
        }
      }
      if (!edge) out.push({ w: maxx - minx + 1, h: maxy - miny + 1 });
    }
    return out;
  }

  it('counts the same enclosed windows on the left as on the right', () => {
    const upper = (id: string) => enclosed(id).filter((w) => w.w >= 45 && w.h >= 40).length;
    const lower = (id: string) => enclosed(id).filter((w) => w.w >= 50 && w.h >= 18 && w.h <= 40).length;
    const ur = upper('valve-cover-gasket-upper-right');
    const ul = upper('valve-cover-gasket-upper-left');
    const lr = lower('valve-cover-gasket-lower-right');
    const ll = lower('valve-cover-gasket-lower-left');
    console.log(`gasket windows upper R/L ${ur}/${ul}  upright lower R/L ${lr}/${ll}`);
    expect(ul, 'upper large windows').toBe(ur);
    expect(ll, 'lower upright windows').toBe(lr);
    expect(ur, 'upper right large windows').toBe(3);
    expect(lr, 'lower right upright windows').toBe(3);
  });
});
