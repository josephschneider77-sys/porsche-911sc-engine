import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { findCollisions, findIntraPartHits, erodedSolidsClash, isMating, clearance, geometriesClash, MATING, TOP_END_WHY } from './collide';
import { rayHit } from './hw';
import { OIL_COOLER } from '../src/geo/aux';
import { cylinder, conrod } from '../src/geo/core';
import { valveHeadEngine, trainPose, FIRE_CRANK } from '../src/geo/valvetrain';
import { crownSurfaceX, stemPointLocal, stemDirLocal } from '../src/geo/valveGeom';
import { bankOf, CYL_Z, CYL_TOP_X, DECK_X, pinX } from '../src/data/layout';

const CAM_DRIVE = /^(chain-housing|chain-housing-lid|chain-tensioner|timing-chain|cam-sprocket)-(left|right)$/;
const EXHAUST = /^(heat-exchanger-(left|right)|muffler)$/;

describe('seated face contact', () => {
  const slab = (x0: number, x1: number) => {
    const g = new THREE.BoxGeometry(x1 - x0, 20, 20);
    g.translate((x0 + x1) / 2, 10, 0);
    return g;
  };
  it('two blocks that share a face are seated, not clashing', () => {
    expect(geometriesClash(slab(0, 10), slab(10, 20))).toBe(false);
  });
  it('a real 1 mm overlap still fails', () => {
    expect(geometriesClash(slab(0, 10), slab(9, 19))).toBe(true);
  });
  it('two triangles that only share an edge are seated', () => {
    const tri = (pts: number[]) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      return g;
    };
    const upper = tri([0, 0, 0, 20, 0, 0, 10, 8, 3]);
    const lower = tri([0, 0, 0, 20, 0, 0, 10, -8, 3]);
    expect(geometriesClash(upper, lower)).toBe(false);
  });
});

describe('intra-part fuel and induction solids', () => {
  const eye = (z: number) => {
    const g = new THREE.CylinderGeometry(7.3, 7.3, 8, 24);
    g.translate(0, 0, z);
    return g;
  };
  it('catches neighbouring Ø14.6 eyes 12 mm apart, and lets a touching pair pass', () => {
    // The old distributor pitch. 2.6 mm of overlap remains 0.6 mm after 1 mm of erosion each side.
    expect(erodedSolidsClash(eye(0), eye(12), 1)).toBe(true);
    expect(erodedSolidsClash(eye(0), eye(14.6), 1)).toBe(false);
  });
  it('lines, banjos, hoses and clamps do not interpenetrate themselves', () => {
    const hits = findIntraPartHits([
      'fuel-lines', 'wur-lines', 'injection-banjos', 'aux-air-plumbing', 'vacuum-fittings',
      'intake-boot-clamps', 'airbox-clamps', 'injection-line-rings', 'injection-line-bracket',
    ], 1);
    expect(hits.map((h) => `${h.part}: ${h.a} x ${h.b} (${h.tris})`)).toEqual([]);
  });
});

describe('assembled-pose interference', () => {
  const hits = findCollisions(1); // 1 mm erosion per part => >2 mm interpenetration counts
  it('bottom-end and ancillary allowlist entries name a threaded, pressed or seated joint', () => {
    const bare = MATING.filter(([, , why]) => !TOP_END_WHY.has(why) && !/\b(threaded|pressed|seated|PENDING-INTAKE)\b/i.test(why));
    expect(bare.map(([, , why]) => why)).toEqual([]);
  });
  it('no part pair intersects unless it is a listed mating / known-simplified pair', () => {
    const bad = hits.filter((h) => !isMating(h.a, h.b)).map((h) => `${h.a} x ${h.b} (${h.tris} tri pairs)`);
    expect(bad).toEqual([]);
  });
  it('cam drive (chain boxes, covers, tensioners, chains, sprockets) never touches the exhaust', () => {
    const bad = hits.filter((h) => (CAM_DRIVE.test(h.a) && EXHAUST.test(h.b)) || (CAM_DRIVE.test(h.b) && EXHAUST.test(h.a)));
    expect(bad.map((h) => `${h.a} x ${h.b}`)).toEqual([]);
  });
  it('left/right cam drives do not touch each other', () => {
    const bad = hits.filter((h) => CAM_DRIVE.test(h.a) && CAM_DRIVE.test(h.b) && h.a.split('-').pop() !== h.b.split('-').pop());
    expect(bad.map((h) => `${h.a} x ${h.b}`)).toEqual([]);
  });
  for (const sd of ['right', 'left'])
    for (const part of ['chain-housing', 'chain-housing-lid', 'chain-tensioner'])
      it(`${part}-${sd} keeps >= 10 mm air gap to heat-exchanger-${sd}`, () => {
        expect(clearance(`${part}-${sd}`, `heat-exchanger-${sd}`)).toBeGreaterThanOrEqual(10);
      });

  const coolerPair = (id: string) => hits.some((h) => (h.a === 'oil-cooler' && h.b === id) || (h.b === 'oil-cooler' && h.a === id));
  it('oil-cooler mounting feet meet the left-case bosses flush and do not interpenetrate', () => {
    expect(coolerPair('crankcase-left')).toBe(false);
    expect(coolerPair('crankcase-right')).toBe(false);
    const seatY = OIL_COOLER.footTop - OIL_COOLER.foot;
    for (const [x, z] of OIL_COOLER.studs) {
      const hit = rayHit('crankcase-left', new THREE.Vector3(x, seatY + 2, z), new THREE.Vector3(0, -1, 0), 8);
      expect(hit, `cooler stud (${x}, ${z})`).toBeTruthy();
      expect(hit!.distance, `seat under (${x}, ${z})`).toBeCloseTo(2, 1);
      expect(hit!.normal.y, `seat normal (${x}, ${z})`).toBeGreaterThan(0.99);
    }
    expect(clearance('oil-cooler', 'crankcase-left')).toBeLessThan(0.6);
  });
});

describe('conrod swing versus the cylinder skirt', () => {
  // Same predicate as findCollisions, at crank angles the assembled pose does not sample.
  // Explode fractions follow the viewer (EXPLODE_SCALE 0.85): the barrel slides out along its
  // axis faster than the rod, so the assembled pose is the tight one.
  const EXPLODE_SCALE = 0.85;
  function bake(root: THREE.Object3D) {
    root.updateMatrixWorld(true);
    const out: number[] = [];
    const v = new THREE.Vector3();
    root.traverse((o: any) => {
      if (!o.isMesh) return;
      const g: THREE.BufferGeometry = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      const P = g.attributes.position;
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld);
        out.push(v.x, v.y, v.z);
      }
    });
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
    const bvh = new MeshBVH(geom);
    geom.boundsTree = bvh as any;
    return geom;
  }
  const cylG = bake(cylinder());
  const rodG = bake(conrod());
  const cylBVH = cylG.boundsTree as MeshBVH;

  /** Rod `rodCyl` placed at `crank` degrees, expressed in the local frame of cylinder `barrelCyl`. */
  function rodToBarrel(rodCyl: number, barrelCyl: number, crank: number, explode: number) {
    const s = bankOf(rodCyl);
    const { throwXY, rodAngle } = pinX(rodCyl, crank);
    const rodM = new THREE.Matrix4().compose(
      new THREE.Vector3(throwXY[0] + s * 70 * explode * EXPLODE_SCALE, throwXY[1], CYL_Z[rodCyl]),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rodAngle)),
      new THREE.Vector3(1, 1, 1),
    );
    const bs = bankOf(barrelCyl);
    const cylM = new THREE.Matrix4().compose(
      new THREE.Vector3(DECK_X * bs + bs * 290 * explode * EXPLODE_SCALE, 0, CYL_Z[barrelCyl]),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, bs === 1 ? 0 : Math.PI, 0)),
      new THREE.Vector3(1, 1, 1),
    );
    return cylM.invert().multiply(rodM);
  }

  function poseRod(m: THREE.Matrix4) {
    const src = rodG.attributes.position;
    const arr = new Float32Array(src.count * 3);
    const v = new THREE.Vector3();
    let min = Infinity;
    const target: { distance: number } = { distance: Infinity };
    for (let i = 0; i < src.count; i++) {
      v.fromBufferAttribute(src, i).applyMatrix4(m);
      arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z;
      cylBVH.closestPointToPoint(v, target as any);
      if (target.distance < min) min = target.distance;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const bvh = new MeshBVH(geom);
    geom.boundsTree = bvh as any;
    let tris = 0;
    const seg = new THREE.Line3();
    cylBVH.bvhcast(bvh, new THREE.Matrix4(), {
      intersectsTriangles(t1: any, t2: any) {
        if (!t1.intersectsTriangle(t2, seg)) return false;
        tris++;
        return true;
      },
    } as any);
    return { min, tris };
  }

  it('keeps at least 1 mm to its own barrel and the opposite-bank neighbour through a full turn', () => {
    let own = Infinity, opp = Infinity;
    for (const explode of [0, 0.5]) {
      for (let crank = 0; crank < 360; crank += 15) {
        for (const cyl of [1, 4] as const) {
          const a = poseRod(rodToBarrel(cyl, cyl, crank, explode));
          expect(a.tris, `cyl ${cyl} crank ${crank} explode ${explode}`).toBe(0);
          own = Math.min(own, a.min);
          const other = cyl === 1 ? 4 : 1;
          const b = poseRod(rodToBarrel(cyl, other, crank, explode));
          expect(b.tris, `rod ${cyl} vs cyl ${other} crank ${crank} explode ${explode}`).toBe(0);
          opp = Math.min(opp, b.min);
        }
      }
    }
    // Envelope plus the measured gap. Own-barrel minimum is the spigot corner; the opposite-bank
    // minimum is the neighbouring fin, still clear of a rod notch.
    expect(own).toBeGreaterThanOrEqual(1);
    expect(opp).toBeGreaterThanOrEqual(1);
  });
});

describe('valve to piston around overlap TDC', () => {
  /** Signed gap from a head vertex to the crown height field. Positive is toward the head. */
  function gapAt(cyl: number, side: 1 | -1, crank: number) {
    const s = bankOf(cyl);
    const { pinX: px } = pinX(cyl, crank);
    const inv = new THREE.Matrix4().compose(
      new THREE.Vector3(px, 0, CYL_Z[cyl]),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, s === 1 ? 0 : Math.PI, 0)),
      new THREE.Vector3(1, 1, 1),
    ).invert();
    const pose = trainPose(cyl, side, crank);
    const face = stemPointLocal(side, 0).addScaledVector(stemDirLocal(side), pose.lift);
    const faceP = new THREE.Vector3(s * (CYL_TOP_X + face.x), face.y, CYL_Z[cyl] + s * face.z).applyMatrix4(inv);
    const head = valveHeadEngine(cyl, side, crank);
    const P = head.attributes.position;
    const idx = head.index;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), m = new THREE.Vector3();
    let min = Infinity;
    const consider = (p: THREE.Vector3) => {
      if (p.distanceTo(faceP) > 30) return;
      const sx = crownSurfaceX(p.y, p.z);
      if (sx == null || !Number.isFinite(sx) || !Number.isFinite(p.x)) return;
      min = Math.min(min, p.x - sx);
    };
    const nTri = idx ? idx.count : P.count;
    for (let i = 0; i < nTri; i += 3) {
      const ia = idx ? idx.getX(i) : i;
      const ib = idx ? idx.getX(i + 1) : i + 1;
      const ic = idx ? idx.getX(i + 2) : i + 2;
      a.fromBufferAttribute(P, ia).applyMatrix4(inv);
      b.fromBufferAttribute(P, ib).applyMatrix4(inv);
      c.fromBufferAttribute(P, ic).applyMatrix4(inv);
      consider(a); consider(b); consider(c);
      consider(m.copy(a).add(b).add(c).multiplyScalar(1 / 3));
    }
    return min;
  }

  it('keeps at least 1 mm across ±30° of crank around overlap TDC', () => {
    let min = Infinity;
    for (const cyl of [1, 2, 3, 4, 5, 6]) {
      const overlap = FIRE_CRANK[cyl] + 360;
      for (let crank = overlap - 30; crank <= overlap + 30; crank += 10) {
        for (const side of [1, -1] as const) {
          const g = gapAt(cyl, side, crank);
          expect(g, `cyl ${cyl} side ${side} crank ${crank}`).toBeGreaterThanOrEqual(1);
          min = Math.min(min, g);
        }
      }
    }
    expect(min).toBeGreaterThanOrEqual(1);
  });
});
