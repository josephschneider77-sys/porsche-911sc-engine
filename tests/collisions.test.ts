import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { findCollisions, findIntraPartHits, erodedSolidsClash, allowedClash, isMating, clearance, geometriesClash, MATING, TOP_END_WHY } from './collide';
import { rayHit } from './hw';
import { OIL_COOLER, oilCooler, DIST, DIST_AXIS, distW } from '../src/geo/aux';
import { cylinder, conrod, piston } from '../src/geo/core';
import { SMALL_GEOM } from '../src/geo/smallParts';
import { valveHeadEngine, trainPose, FIRE_CRANK } from '../src/geo/valvetrain';
import { crownSurfaceX, crownUndersideX, stemPointLocal, stemDirLocal } from '../src/geo/valveGeom';
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
  it('chain tensioners, cam-flange covers and rail bolts do not interpenetrate themselves', () => {
    const hits = findIntraPartHits([
      'chain-tensioner-left', 'chain-tensioner-right',
      'cam-flange-cover-left', 'cam-flange-cover-right',
      'rail-bolts-left', 'rail-bolts-right',
    ], 1);
    // The plunger dome is seated on the tail pad. Anything else inside the part still fails.
    const seated = (h: { a: string; b: string }) =>
      (h.a === 'seat:plunger-dome' && h.b === 'seat:tail-pad') || (h.b === 'seat:plunger-dome' && h.a === 'seat:tail-pad');
    expect(hits.filter((h) => !seated(h)).map((h) => `${h.part}: ${h.a} x ${h.b} (${h.tris})`)).toEqual([]);
  });
});

describe('assembled-pose interference', () => {
  const hits = findCollisions(1); // 1 mm erosion per part => >2 mm interpenetration counts
  it('bottom-end and ancillary allowlist entries name a threaded, pressed or seated joint', () => {
    const bare = MATING.filter(([, , why]) => !TOP_END_WHY.has(why) && !/\b(threaded|pressed|seated|PENDING-INTAKE)\b/i.test(why));
    expect(bare.map(([, , why]) => why)).toEqual([]);
  });
  it('no part pair intersects unless it is a listed mating / known-simplified pair', () => {
    const bad = hits.filter((h) => !allowedClash(h)).map((h) => `${h.a} x ${h.b} (${h.tris} tri pairs)`);
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

  it('oil cooler mounts on the right-case deck pad', () => {
    expect(OIL_COOLER.faceX).toBe(103);
    expect(OIL_COOLER.ports).toHaveLength(3);
    const big = OIL_COOLER.ports.filter((q) => q[2] === 1);
    const upper = OIL_COOLER.ports.filter((q) => q[2] === 0);
    expect(big).toHaveLength(1);
    expect(upper).toHaveLength(2);
    expect(big[0][0]).toBeLessThan(Math.min(...upper.map((q) => q[0])));
    expect(Math.abs(upper[0][0] - upper[1][0])).toBeLessThan(1);
    const alongX = new THREE.Vector3(1, 0, 0);
    const face = rayHit('oil-cooler', new THREE.Vector3(90, 8, -180), alongX, 30);
    expect(face, 'flange inboard face').toBeTruthy();
    expect(Math.abs(90 + face!.distance - 103)).toBeLessThan(0.2);
    expect(Math.abs(face!.normal.x)).toBeGreaterThan(0.99);
    const pad = rayHit('crankcase-right', new THREE.Vector3(120, 8, -180), new THREE.Vector3(-1, 0, 0), 40);
    expect(pad, 'case deck pad').toBeTruthy();
    expect(Math.abs(120 - pad!.distance - 103)).toBeLessThan(0.2);
    expect(pad!.normal.x).toBeGreaterThan(0.99);
    for (const [y, z] of OIL_COOLER.studs) {
      const blocked = rayHit('oil-cooler', new THREE.Vector3(102, y, z), alongX, 10);
      expect(blocked, `stud hole (${y}, ${z})`).toBeNull();
      // Beside the tap the pad face is still x = 103. On the stud axis the ray enters the hole.
      const seat = rayHit('crankcase-right', new THREE.Vector3(120, y + 6, z), new THREE.Vector3(-1, 0, 0), 40);
      expect(seat, `stud pad (${y}, ${z})`).toBeTruthy();
      expect(Math.abs(120 - seat!.distance - 103)).toBeLessThan(0.2);
      expect(seat!.normal.x).toBeGreaterThan(0.99);
      const bore = rayHit('crankcase-right', new THREE.Vector3(120, y, z), new THREE.Vector3(-1, 0, 0), 40);
      expect(bore, `stud tap (${y}, ${z})`).toBeTruthy();
      const boreX = 120 - bore!.distance;
      expect(boreX, `tap bottom (${y}, ${z})`).toBeGreaterThan(88);
      expect(boreX, `tap is open at the face (${y}, ${z})`).toBeLessThan(96);
    }
    for (const [y, z, isBig] of OIL_COOLER.ports) {
      const id = isBig ? 'oil-cooler-seal-riser' : 'oil-cooler-seals';
      const placed = SMALL_GEOM[id].items().map((m) => ({
        p: new THREE.Vector3().setFromMatrixPosition(m),
        n: new THREE.Vector3().setFromMatrixColumn(m, 1).normalize(),
      }));
      const seal = placed.find((s) => Math.abs(s.p.y - y) < 0.5 && Math.abs(s.p.z - z) < 0.5);
      expect(seal, `seal at (${y}, ${z})`).toBeTruthy();
      expect(seal!.p.x).toBeLessThan(103);
      expect(seal!.p.x).toBeGreaterThan(99);
      expect(seal!.n.x).toBeGreaterThan(0.99);
    }
    const g = oilCooler();
    const box = new THREE.Box3().setFromObject(g);
    expect(box.min.z).toBeGreaterThanOrEqual(-213);
    expect(box.max.z).toBeLessThanOrEqual(-146);
    const corePts: THREE.Vector3[] = [];
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const arr = mesh.geometry.getAttribute('position');
      mesh.updateWorldMatrix(true, false);
      for (let i = 0; i < arr.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(arr, i).applyMatrix4(mesh.matrixWorld);
        if (v.y < -62 || v.y > 80) continue;
        corePts.push(v);
      }
    });
    const core = new THREE.Box3().setFromPoints(corePts);
    const near = (xTarget: number) => {
      const acc = new THREE.Vector3();
      const hit = corePts.filter((v) => Math.abs(v.x - xTarget) < 1.5);
      for (const v of hit) acc.add(v);
      return hit.length ? acc.multiplyScalar(1 / hit.length) : null;
    };
    const a = near(core.min.x), b = near(core.max.x);
    expect(a && b, 'core end centroids').toBeTruthy();
    const axis = b!.clone().sub(a!).normalize();
    const ang = Math.acos(Math.min(1, Math.abs(axis.dot(alongX)))) * 180 / Math.PI;
    expect(ang).toBeLessThan(5);
    // Model-fit length is 137 mm against a 140 mm height, so X is not the longest box edge.
    expect(box.max.x - box.min.x).toBeGreaterThan(box.max.z - box.min.z);
  });

  const COOLER_TOUCHED = ['oil-cooler', 'oil-cooler-nuts', 'oil-cooler-seals', 'oil-cooler-seal-riser', 'oil-cooler-cap', 'crankcase-right', 'upper-air-guide', 'ignition-leads', 'shroud-screws', 'shroud-end-screws', 'shroud-speed-nuts'];
  for (const tol of [0, 0.5]) it(`cooler parts the mount touches are clear at ${tol} mm`, () => {
    const touched = new Set(COOLER_TOUCHED);
    const bad = findCollisions(tol).filter((h) => (touched.has(h.a) || touched.has(h.b)) && !isMating(h.a, h.b));
    expect(bad.map((h) => `${h.a} x ${h.b} (${h.tris})`)).toEqual([]);
  });

  it('distributor lug seats on the left-case pad and the body does not enter the case', () => {
    const pair = (list: { a: string; b: string }[]) => list.filter((h) =>
      (h.a === 'distributor' && h.b === 'crankcase-left') || (h.b === 'distributor' && h.a === 'crankcase-left'));
    expect(pair(hits)).toEqual([]);
    expect(pair(findCollisions(0.5))).toEqual([]);
    expect(pair(findCollisions(0))).toEqual([]);
    const seat = distW(DIST.stud[0], 97.5, DIST.stud[1]);
    const axis = new THREE.Vector3(...DIST_AXIS);
    const origin = new THREE.Vector3(...seat).addScaledVector(axis, 6);
    const hit = rayHit('crankcase-left', origin, axis.clone().negate(), 14);
    expect(hit, 'stud pad at local t 97.5').toBeTruthy();
    expect(hit!.distance).toBeCloseTo(6, 0);
    expect(hit!.normal.dot(axis)).toBeGreaterThan(0.9);
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
  function pistonBVH() {
    const root = piston();
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
  }
  function oddHits(bvh: MeshBVH, p: THREE.Vector3) {
    const hits = bvh.raycast(new THREE.Ray(p, new THREE.Vector3(1, 0.137, 0.051).normalize()), THREE.DoubleSide) as { distance: number }[];
    return hits.filter((h) => h.distance > 1e-4).length % 2 === 1;
  }
  /** True mesh distance from the valve head to the piston. Positive is outside the solid. */
  function meshGap(bvh: MeshBVH, cyl: number, side: 1 | -1, crank: number) {
    const s = bankOf(cyl);
    const { pinX: px } = pinX(cyl, crank);
    const inv = new THREE.Matrix4().compose(
      new THREE.Vector3(px, 0, CYL_Z[cyl]),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, s === 1 ? 0 : Math.PI, 0)),
      new THREE.Vector3(1, 1, 1),
    ).invert();
    const pose = trainPose(cyl, side, crank);
    const face = stemPointLocal(side, 0).addScaledVector(stemDirLocal(side), -pose.lift);
    const faceP = new THREE.Vector3(s * (CYL_TOP_X + face.x), face.y, CYL_Z[cyl] + s * face.z).applyMatrix4(inv);
    const head = valveHeadEngine(cyl, side, crank);
    const g = head.index ? head.toNonIndexed() : head;
    const P = g.attributes.position;
    const target = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 };
    const p = new THREE.Vector3();
    let min = Infinity;
    for (let i = 0; i < P.count; i++) {
      p.fromBufferAttribute(P, i).applyMatrix4(inv);
      if (p.distanceTo(faceP) > 22) continue;
      bvh.closestPointToPoint(p, target as never);
      const signed = oddHits(bvh, p) ? -target.distance : target.distance;
      if (signed < min) min = signed;
    }
    return min;
  }

  it('keeps at least 1.74 mm at 1° steps across ±30° of overlap TDC', () => {
    const bvh = pistonBVH();
    let min = Infinity, where = '';
    for (const cyl of [1, 2, 3, 4, 5, 6]) {
      const overlap = FIRE_CRANK[cyl] + 360;
      for (let crank = overlap - 30; crank <= overlap + 30; crank += 1) {
        for (const side of [1, -1] as const) {
          const g = meshGap(bvh, cyl, side, crank);
          expect(g, `cyl ${cyl} side ${side} crank ${crank}`).toBeGreaterThanOrEqual(1.74);
          if (g < min) { min = g; where = `cyl ${cyl} side ${side} ${crank - overlap}° from overlap`; }
        }
      }
    }
    console.log(`valve-to-piston minimum ${min.toFixed(3)} mm at ${where}`);
    expect(min).toBeGreaterThanOrEqual(1.74);
    let thick = Infinity;
    for (let y = -46; y <= 46; y += 1) for (let z = -46; z <= 46; z += 1) {
      const sx = crownSurfaceX(y, z);
      if (sx == null) continue;
      thick = Math.min(thick, sx - crownUndersideX(Math.hypot(y, z)));
    }
    // The crown floor is 4.49. The sample lands on that floor; a binary float
    // prints just under it (4.49 − 2e−15) and must still pass.
    expect(thick + 1e-9, 'crown under the eyebrows').toBeGreaterThanOrEqual(4.49);
  });
});

describe('ancillary clearance at 0 and 0.5 mm', () => {
  // Parts this branch owns. A seated joint may overlap; anything else may not, at either erosion.
  const OURS = /^(air-(pump|hose|clamp|check|diverter|rubber|sleeve|buffer|sealing|retainer|bracket|pulley)|egr-|cat-|cyl-baffle|cyl-cover-plate|catalytic-converter|muffler-hardware|ignition-leads|heater-blower|heater-dist|heater-socket|heater-hose-link|heater-hose-left|heater-hose-right|heater-hose-supports|heater-clamp)/;
  for (const tol of [0, 0.5]) {
    it(`no unlisted clash on these parts at ${tol} mm erosion`, () => {
      const hits = findCollisions(tol);
      const bad = hits
        .filter((h) => (OURS.test(h.a) || OURS.test(h.b)) && !isMating(h.a, h.b))
        .map((h) => `${h.a} x ${h.b} (${h.tris} tri, box ${h.box.min.toArray().map((n) => n.toFixed(0)).join(',')})`);
      expect(bad).toEqual([]);
    });
  }
});
