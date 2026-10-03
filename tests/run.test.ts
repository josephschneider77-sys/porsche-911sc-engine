/**
 * Running-engine kinematics. Ratios come from measureDrive() (the meshes and the
 * tooth counts that build them). A crank sweep may not create an intersecting pair
 * that the assembled pose does not already have — there is no motion allowlist.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { PART_BY_ID, PARTS } from '../src/data/parts';
import { ASSET_BUILDERS } from '../src/geo/assets';
import { pinX, SPEC } from '../src/data/layout';
import { FIRE_CRANK, trainPose, ASSEMBLED_CRANK } from '../src/geo/valvetrain';
import {
  INT_SPROCKET_R, IDLER_SPROCKET_R, INT_T, CAM_T, CRANK_GEAR_T, INT_GEAR, DIST_WHEEL_TEETH,
} from '../src/geo/core';
import { DIST_PINION_TEETH, DIST, DIST_AXIS } from '../src/geo/aux';
import { trianglesClash } from './collide';
import { EngineRun } from '../src/sim/run';
import {
  measureDrive, rodPoses, rodLengthError, chainGapError, crownClearance,
  chainPoly, beltPoly, bindLoop, skinLoop, chainTravel, beltTravel,
  valveLift, rockerDelta, idlerSpin, spinsAt, IDLE_RPM, REDLINE_RPM,
} from '../src/sim/drive';

const ORDER = [1, 6, 2, 4, 3, 5];

describe('crank-driven ratios', () => {
  const g = measureDrive();

  it('locks the cam at half crank speed, opposite the crank, from the tooth counts', () => {
    expect(g.crank).toBe(1);
    expect(g.intermediate).toBeCloseTo(-CRANK_GEAR_T / INT_GEAR.teeth, 10);
    expect(g.cam).toBeCloseTo(-0.5, 10);
    expect(g.cam).toBeCloseTo(g.intermediate * (INT_T / CAM_T), 10);
  });

  it('turns the fan and the air pump the same way as the crank, at the measured cord ratio', () => {
    expect(g.fan).toBeGreaterThan(1);
    expect(g.pump).toBeGreaterThan(0);
    expect(g.cords.crank * g.crank).toBeCloseTo(g.cords.fan * g.fan, 4);
    expect(g.cords.fanOuter * g.fan).toBeCloseTo(g.cords.pump * g.pump, 4);
    expect(g.fanBeltPerCrankRad).toBeCloseTo(g.cords.crank, 4);
    expect(g.pumpBeltPerCrankRad).toBeCloseTo(g.cords.fanOuter * g.fan, 4);
  });

  it('advances each chain one link per intermediate tooth, opposite the crank', () => {
    const tooth = g.intermediate * INT_T / (Math.PI * 2);
    for (const s of [1, -1] as const) {
      expect(g.chainLinksPerCrankRad[s]).toBeCloseTo(tooth, 8);
      expect(Math.sign(g.chainLinksPerCrankRad[s])).toBe(Math.sign(g.intermediate));
    }
  });

  it('turns both idlers opposite the intermediate shaft, at the sprocket pitch-radius ratio', () => {
    const mag = Math.abs(g.intermediate) * (INT_SPROCKET_R / IDLER_SPROCKET_R);
    for (const s of [1, -1] as const) {
      expect(Math.sign(g.idler[s])).toBe(-Math.sign(g.intermediate));
      expect(Math.abs(g.idler[s])).toBeCloseTo(mag, 1);
    }
  });

  it('turns the rotor at exactly half crank speed and the pinion at the 22:14 mesh', () => {
    expect(g.rotor).toBe(0.5);
    expect(Math.abs(g.pinion)).toBeCloseTo(DIST_WHEEL_TEETH / DIST_PINION_TEETH, 8);
    expect(Math.abs(g.pinion)).not.toBeCloseTo(0.5, 2);
  });

  it('keeps every listed spinner on a real part', () => {
    for (const s of spinsAt(90)) expect(PART_BY_ID[s.id], s.id).toBeTruthy();
  });
});

describe('firing order and valve phase', () => {
  it('fires 1-6-2-4-3-5, each piston at TDC with both valves on the base circle', () => {
    ORDER.forEach((cyl, i) => expect(FIRE_CRANK[cyl]).toBe(i * 120));
    for (const cyl of ORDER) {
      const at = Math.abs(pinX(cyl, FIRE_CRANK[cyl]).pinX);
      const bdc = Math.abs(pinX(cyl, FIRE_CRANK[cyl] + 180).pinX);
      expect(at - bdc).toBeCloseTo(SPEC.stroke, 3);
      expect(trainPose(cyl, 1, FIRE_CRANK[cyl]).lift).toBeLessThan(0.05);
      expect(trainPose(cyl, -1, FIRE_CRANK[cyl]).lift).toBeLessThan(0.05);
      // One turn later the piston is at TDC again and this cylinder is on overlap.
      expect(trainPose(cyl, 1, FIRE_CRANK[cyl] + 360).lift).toBeGreaterThan(1);
    }
  });

  it('matches the assembled piston and rod poses at crank 0', () => {
    for (const p of rodPoses(0)) {
      const piston = PART_BY_ID[`piston-${p.cyl}`];
      const rod = PART_BY_ID[`conrod-${p.cyl}`];
      expect(p.pinX).toBeCloseTo(piston.position![0], 6);
      expect(p.throwX).toBeCloseTo(rod.position![0], 6);
      expect(p.throwY).toBeCloseTo(rod.position![1], 6);
      expect(p.rodAngle).toBeCloseTo(rod.rotation![2], 6);
    }
  });
});

describe('a full 720° cycle', () => {
  it('holds rod length, chain tooth gaps, belt cord speed and crown clearance', () => {
    const baseClear = Math.min(
      ...[1, 2, 3, 4, 5, 6].flatMap((cyl) => ([1, -1] as const).map((side) => crownClearance(cyl, side, ASSEMBLED_CRANK))),
    );
    const at0 = chainGapError(1, 0);
    const worst = { int: 0, cam: 0, idler: 0 };
    for (let deg = 0; deg <= 720; deg += 1) {
      expect(rodLengthError(deg), `rod ${deg}`).toBeLessThan(1e-6);
      for (const s of [1, -1] as const) {
        const e = chainGapError(s, deg);
        worst.int = Math.max(worst.int, e.int);
        worst.cam = Math.max(worst.cam, e.cam);
        worst.idler = Math.max(worst.idler, e.idler);
      }
      for (const cyl of ORDER) for (const side of [1, -1] as const) {
        expect(crownClearance(cyl, side, deg), `clear ${cyl} ${side} ${deg}`).toBeGreaterThan(baseClear - 0.35);
      }
    }
    // Rollers stay in the tooth gap. Pitch is 9.525 mm. The assembled seating is a
    // few tenths; it must not walk onto a tooth as the crank turns.
    expect(worst.int, `int from ${at0.int}`).toBeLessThan(at0.int + 0.45);
    expect(worst.cam, `cam from ${at0.cam}`).toBeLessThan(Math.max(at0.cam, 0.3) + 0.45);
    expect(worst.idler, `idler from ${at0.idler}`).toBeLessThan(Math.max(at0.idler, 0.3) + 0.45);
  }, 120000);
});

describe('pedal', () => {
  it('rises toward redline while held and falls back toward idle when released', () => {
    const e = new EngineRun();
    e.start();
    e.pedal = true;
    for (let i = 0; i < 90; i++) e.tick(1 / 30, 0, 0);
    expect(e.rpm).toBeGreaterThan(IDLE_RPM + 500);
    expect(e.rpm).toBeLessThan(REDLINE_RPM);
    const peaked = e.rpm;
    e.pedal = false;
    for (let i = 0; i < 40; i++) e.tick(1 / 30, 0, 0);
    expect(e.rpm).toBeLessThan(peaked - 200);
    expect(e.rpm).toBeGreaterThan(IDLE_RPM - 1);
    const turned = e.crankDeg;
    expect(turned).toBeGreaterThan(30);
    e.stop();
    expect(e.rpm).toBe(0);
    expect(e.crankDeg).toBe(0);
    e.tick(0.1, 0, 0);
    expect(e.crankDeg).toBe(0);
  });

  it('stops itself when a teardown step or an explode is applied', () => {
    const e = new EngineRun();
    e.start();
    e.tick(0.2, 0, 0);
    expect(e.running).toBe(true);
    e.tick(0.1, 1, 0);
    expect(e.running).toBe(false);
    expect(e.crankDeg).toBe(0);
    e.start();
    e.tick(0.1, 0, 0.2);
    expect(e.running).toBe(false);
  });
});

// ---------------------------------------------------------------- posed clash sweep
const built = new Map<string, THREE.Object3D>();
function builtAsset(id: string): THREE.Object3D {
  const asset = PART_BY_ID[id].asset;
  let g = built.get(asset);
  if (!g) { g = ASSET_BUILDERS[asset](); built.set(asset, g); }
  return g;
}

const Z = new THREE.Vector3(0, 0, 1);
function spinPoint(v: THREE.Vector3, c: THREE.Vector3, axis: THREE.Vector3, angle: number) {
  v.sub(c).applyAxisAngle(axis, angle).add(c);
}

interface Baked { geom: THREE.BufferGeometry; bvh: MeshBVH; box: THREE.Box3 }

function posePart(id: string, deg: number): Float32Array {
  const root = builtAsset(id);
  root.updateMatrixWorld(true);
  const def = PART_BY_ID[id];
  const reg = new THREE.Matrix4().compose(
    new THREE.Vector3(...(def.position ?? [0, 0, 0])),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...(def.rotation ?? [0, 0, 0]))),
    new THREE.Vector3(1, 1, 1),
  );
  const recip = /^piston-(\d)$/.exec(id) || /^conrod-(\d)$/.exec(id);
  const spin = spinsAt(deg).find((s) => s.id === id);
  const out: number[] = [];
  const v = new THREE.Vector3();
  root.traverse((o: any) => {
    if (!o.isMesh) return;
    const kin = typeof o.userData.kin === 'string' ? o.userData.kin : '';
    const src = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
    const P = src.attributes.position as THREE.BufferAttribute;
    const inst: THREE.Matrix4[] = o.isInstancedMesh
      ? Array.from({ length: o.count }, (_, i) => { const m = new THREE.Matrix4(); o.getMatrixAt(i, m); return m; })
      : [new THREE.Matrix4()];
    for (const im of inst) {
      const world = new THREE.Matrix4().multiplyMatrices(o.matrixWorld, im);
      if (id.startsWith('timing-chain-')) {
        const s: 1 | -1 = id.endsWith('left') ? -1 : 1;
        const { poly, z } = chainPoly(s);
        const attr = new THREE.BufferAttribute(new Float32Array(P.count * 3), 3);
        for (let i = 0; i < P.count; i++) {
          v.fromBufferAttribute(P, i).applyMatrix4(world);
          attr.setXYZ(i, v.x, v.y, v.z);
        }
        const bind = bindLoop(attr, poly, z);
        const posed = attr.clone();
        skinLoop(bind, chainTravel(s, deg), posed, true, 'link');
        for (let i = 0; i < posed.count; i++) out.push(posed.getX(i), posed.getY(i), posed.getZ(i));
        continue;
      }
      if (id === 'fan-belt' || id === 'air-pump-belt') {
        const kind = id === 'fan-belt' ? 'fan' : 'pump';
        const { poly, z } = beltPoly(kind);
        const attr = new THREE.BufferAttribute(new Float32Array(P.count * 3), 3);
        for (let i = 0; i < P.count; i++) {
          v.fromBufferAttribute(P, i).applyMatrix4(world);
          attr.setXYZ(i, v.x, v.y, v.z);
        }
        const bind = bindLoop(attr, poly, z);
        const posed = attr.clone();
        skinLoop(bind, beltTravel(kind, deg), posed, false);
        for (let i = 0; i < posed.count; i++) out.push(posed.getX(i), posed.getY(i), posed.getZ(i));
        continue;
      }
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(world);
        if (recip) {
          const cyl = +recip[1];
          const pose = rodPoses(deg).find((p) => p.cyl === cyl)!;
          const m = new THREE.Matrix4();
          if (id.startsWith('piston')) {
            const s = pose.pinX >= 0 ? 0 : Math.PI;
            m.compose(new THREE.Vector3(pose.pinX, 0, pose.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, s, 0)), new THREE.Vector3(1, 1, 1));
          } else {
            m.compose(new THREE.Vector3(pose.throwX, pose.throwY, pose.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, pose.rodAngle)), new THREE.Vector3(1, 1, 1));
          }
          v.applyMatrix4(m);
        } else if (id.startsWith('valves-')) {
          const cyl = +id.slice(7);
          if (kin === 'lift:in' || kin === 'lift:ex') {
            const side: 1 | -1 = kin.endsWith('in') ? 1 : -1;
            const d = valveLift(cyl, side, deg);
            v.addScaledVector(d.stem, d.dLift);
          }
          v.applyMatrix4(reg);
        } else if (id.startsWith('rockers-') && kin.startsWith('arm:')) {
          const m = kin.match(/^arm:(\d):(-?1)$/)!;
          const d = rockerDelta(+m[1], +m[2] as 1 | -1, deg);
          spinPoint(v, new THREE.Vector3(d.x, d.y, 0), Z, d.dBeta);
        } else if (id.startsWith('chain-tensioner-') && kin === 'idler') {
          const s: 1 | -1 = id.endsWith('left') ? -1 : 1;
          const d = idlerSpin(s, deg);
          spinPoint(v, new THREE.Vector3(d.x, d.y, 0), Z, d.angle);
        } else if (id === 'distributor' && (kin === 'rotor' || kin === 'pinion')) {
          const ratio = kin === 'rotor' ? measureDrive().rotor : measureDrive().pinion;
          const axis = new THREE.Vector3(...DIST_AXIS).normalize();
          spinPoint(v, new THREE.Vector3(...DIST.pinion), axis, ratio * deg * Math.PI / 180);
        } else if (id === 'alternator' && kin === 'shaft') {
          spinPoint(v, new THREE.Vector3(0, fanY(), 0), Z, measureDrive().fan * deg * Math.PI / 180);
        } else if (spin) {
          spinPoint(v, spin.center, spin.axis, spin.angle);
        } else if (def.position || def.rotation) {
          v.applyMatrix4(reg);
        }
        out.push(v.x, v.y, v.z);
      }
    }
    if (src !== o.geometry) src.dispose();
  });
  return new Float32Array(out);
}

function fanY() {
  return spinsAt(0).find((s) => s.id === 'fan-impeller')!.center.y;
}

function solidOf(pts: Float32Array): Baked | null {
  if (pts.length < 9) return null;
  // Same sliver reject as the assembled-pose checker. Collapsed CSG edges are not metal.
  const clean: number[] = [];
  for (let i = 0; i < pts.length; i += 9) {
    const abx = pts[i + 3] - pts[i], aby = pts[i + 4] - pts[i + 1], abz = pts[i + 5] - pts[i + 2];
    const acx = pts[i + 6] - pts[i], acy = pts[i + 7] - pts[i + 1], acz = pts[i + 8] - pts[i + 2];
    const cx = aby * acz - abz * acy, cy = abz * acx - abx * acz, cz = abx * acy - aby * acx;
    if (cx * cx + cy * cy + cz * cz < 1e-4) continue;
    for (let k = 0; k < 9; k++) clean.push(pts[i + k]);
  }
  if (clean.length < 9) return null;
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(clean, 3));
  const bvh = new MeshBVH(geom);
  geom.computeBoundingBox();
  return { geom, bvh, box: geom.boundingBox!.clone() };
}

function pairHits(a: Baked, b: Baked): boolean {
  if (!a.box.intersectsBox(b.box)) return false;
  let hit = false;
  const seg = new THREE.Line3(), n1 = new THREE.Vector3(), n2 = new THREE.Vector3(), v0 = new THREE.Vector3();
  a.bvh.bvhcast(b.bvh, new THREE.Matrix4(), {
    intersectsTriangles(t1: any, t2: any) {
      if (!trianglesClash(t1, t2, n1, n2, v0, seg)) return false;
      hit = true;
      return true;
    },
  } as any);
  return hit;
}

describe('crank sweep clashes', () => {
  it('creates no new intersecting pair over two crank revolutions', () => {
    const movers = PARTS.map((p) => p.id).filter((id) => (
      /^piston-|^conrod-|^valves-|^rockers-|^timing-chain-|^chain-tensioner-|^camshaft-|^cam-sprocket-/.test(id)
      || id === 'crankshaft' || id === 'crank-gears' || id === 'distributor' || id === 'intermediate-shaft'
      || id === 'fan-impeller' || id === 'crank-pulley' || id === 'air-pump-pulley'
    ));
    const housings = PARTS.map((p) => p.id).filter((id) => (
      /^cylinder-|^head-|^cam-housing-|^chain-housing|^valve-cover-|^crankcase-/.test(id)
      || id === 'oil-pump' || id === 'fan-housing'
    ));
    const pairs: [string, string][] = [];
    const restBox = new Map<string, THREE.Box3>();
    const boxOf = (id: string) => {
      let b = restBox.get(id);
      if (!b) {
        const s = solidOf(posePart(id, 0));
        b = s ? s.box.clone() : new THREE.Box3();
        restBox.set(id, b);
      }
      return b;
    };
    for (const a of movers) for (const b of housings) {
      if (a === b) continue;
      const A = boxOf(a).clone().expandByScalar(40);
      if (A.intersectsBox(boxOf(b))) pairs.push([a, b]);
    }
    // Reciprocating parts against each other and against the crank.
    for (const cyl of ORDER) {
      pairs.push([`piston-${cyl}`, `valves-${cyl}`], [`piston-${cyl}`, `conrod-${cyl}`], [`conrod-${cyl}`, 'crankshaft']);
    }
    pairs.push(
      ['rockers-right', 'camshaft-right'], ['rockers-left', 'camshaft-left'],
      ['timing-chain-right', 'cam-sprocket-right'], ['timing-chain-left', 'cam-sprocket-left'],
      ['timing-chain-right', 'intermediate-shaft'], ['timing-chain-left', 'intermediate-shaft'],
      ['timing-chain-right', 'chain-tensioner-right'], ['timing-chain-left', 'chain-tensioner-left'],
      ['distributor', 'crank-gears'],
    );
    const key = (a: string, b: string) => a < b ? `${a}|${b}` : `${b}|${a}`;
    const unique = [...new Map(pairs.map((p) => [key(p[0], p[1]), p])).values()];
    const housingSet = new Set(housings);
    const cache = new Map<string, Baked | null>();
    const at = (id: string, deg: number) => {
      // Housings do not move with the crank. Rebuild only the parts this angle poses.
      const k = housingSet.has(id) ? id : `${id}@${deg}`;
      if (!cache.has(k)) cache.set(k, solidOf(posePart(id, deg)));
      return cache.get(k)!;
    };
    const baseline = new Set<string>();
    for (const [a, b] of unique) {
      const A = at(a, 0), B = at(b, 0);
      if (A && B && pairHits(A, B)) baseline.add(key(a, b));
    }
    const fresh: string[] = [];
    for (let deg = 5; deg <= 720; deg += 5) {
      for (const k of [...cache.keys()]) if (k.includes('@')) cache.delete(k);
      for (const [a, b] of unique) {
        const k = key(a, b);
        if (baseline.has(k)) continue;
        const A = at(a, deg), B = at(b, deg);
        if (A && B && pairHits(A, B)) fresh.push(`${k} @ ${deg}°`);
      }
      if (fresh.length > 12) break;
    }
    expect(fresh).toEqual([]);
  }, 720000);
});
