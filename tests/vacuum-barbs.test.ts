import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { ASSET_BUILDERS } from '../src/geo/assets';
import { PARTS, PART_BY_ID } from '../src/data/parts';
import { SMALL_SPECS } from '../src/data/smallSpec';
import { TEE_AIR_INJ } from '../src/geo/induction';
import { emissionsHidden } from '../src/data/teardown';

const BRASS = 0xc9a54a;
const PLASTIC = 0x151515;
const CAST = 0x96989a;
const RUBBER = 0x0e0e0e;

const INDUCTION_HW = new Set(
  SMALL_SPECS.filter((s) => s.step === 'intake' || s.step === 'cis').map((s) => s.id),
);

const poseOf = (id: string) => {
  const d = PART_BY_ID[id];
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...(d.position ?? [0, 0, 0])),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...(d.rotation ?? [0, 0, 0]))),
    new THREE.Vector3(1, 1, 1),
  );
};

function inScope(id: string) {
  const p = PART_BY_ID[id];
  return p.system === 'induction' || INDUCTION_HW.has(id);
}

function instancesOf(o: THREE.Object3D): THREE.Matrix4[] {
  const mesh = o as THREE.InstancedMesh;
  if (!mesh.isInstancedMesh) return [new THREE.Matrix4()];
  return Array.from({ length: mesh.count }, (_, i) => {
    const m = new THREE.Matrix4();
    mesh.getMatrixAt(i, m);
    return m;
  });
}

function worldOf(pose: THREE.Matrix4, o: THREE.Object3D, inst: THREE.Matrix4) {
  return pose.clone().multiply(o.matrixWorld).multiply(inst);
}

/** Centreline samples of a tubular hose, in world space. */
function tubeCenterline(geom: THREE.BufferGeometry, world: THREE.Matrix4): THREE.Vector3[] | null {
  const radial = geom.parameters?.radialSegments as number | undefined;
  const tubular = geom.parameters?.tubularSegments as number | undefined;
  if (radial == null || tubular == null) return null;
  const stride = radial + 1;
  const P = geom.attributes.position;
  const centers: THREE.Vector3[] = [];
  for (let i = 0; i <= tubular; i++) {
    const c = new THREE.Vector3();
    for (let j = 0; j < radial; j++) c.add(new THREE.Vector3().fromBufferAttribute(P, i * stride + j));
    centers.push(c.multiplyScalar(1 / radial).applyMatrix4(world));
  }
  return centers;
}

function centerlines(partId: string, namePrefix = ''): THREE.Vector3[][] {
  const root = ASSET_BUILDERS[PART_BY_ID[partId].asset]();
  root.updateMatrixWorld(true);
  const pose = poseOf(partId);
  const lines: THREE.Vector3[][] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (namePrefix && !(typeof mesh.name === 'string' && mesh.name.startsWith(namePrefix))) return;
    for (const inst of instancesOf(mesh)) {
      const line = tubeCenterline(mesh.geometry, worldOf(pose, mesh, inst));
      if (line) lines.push(line);
    }
  });
  return lines;
}

function minBend(pts: THREE.Vector3[]) {
  let min = Infinity;
  for (let i = 1; i < pts.length - 1; i++) {
    const b = pts[i];
    let ia = i - 1;
    while (ia > 0 && pts[ia].distanceTo(b) < 8) ia--;
    let ic = i + 1;
    while (ic < pts.length - 1 && pts[ic].distanceTo(b) < 8) ic++;
    const a = pts[ia], c = pts[ic];
    const ab = a.distanceTo(b), bc = b.distanceTo(c), ca = c.distanceTo(a);
    if (ab < 2 || bc < 2) continue;
    const s = (ab + bc + ca) / 2;
    const k = s * (s - ab) * (s - bc) * (s - ca);
    if (k <= 1e-4) continue;
    const R = (ab * bc * ca) / (4 * Math.sqrt(k));
    if (R < min) min = R;
  }
  return min;
}

type End = { part: string; cyl: number; point: THREE.Vector3; axis: THREE.Vector3 };

function nippleMaterial(partId: string, hex: number | undefined, r: number, height: number) {
  // Hex nuts are short and wide (injector union is Ø13 × 5). A hose barb is longer than it is wide, or at least not a 5 mm nut.
  if (height <= 5.5 && r >= 5) return false;
  if (hex === BRASS && r >= 1.6 && r <= 7.6) return true;
  if (hex === PLASTIC && r >= 1.6 && r <= 7.6) return true;
  // Auxiliary-air barbs are cast, about Ø18. Mounting ears on other valves are not.
  return partId === 'aux-air-valve' && hex === CAST && r >= 8 && r <= 10;
}

/**
 * End-cap centres of a CylinderGeometry. Normals stay on the axis after the
 * mesh is rotated, which still works when the tube is shorter than its diameter.
 */
function cylinderCaps(geom: THREE.BufferGeometry, world: THREE.Matrix4): { point: THREE.Vector3; axis: THREE.Vector3 }[] {
  const P = geom.attributes.position;
  const N = geom.attributes.normal;
  if (!N || !P.count) return [];
  const nmat = new THREE.Matrix3().getNormalMatrix(world);
  const pts: THREE.Vector3[] = [];
  const normals: THREE.Vector3[] = [];
  for (let i = 0; i < P.count; i++) {
    pts.push(new THREE.Vector3().fromBufferAttribute(P, i).applyMatrix4(world));
    normals.push(new THREE.Vector3().fromBufferAttribute(N, i).applyMatrix3(nmat).normalize());
  }
  let axis = normals[0];
  let best = 0;
  const step = Math.max(1, Math.floor(normals.length / 24));
  for (let i = 0; i < normals.length; i += step) {
    const n = normals[i];
    let count = 0;
    for (const m of normals) if (Math.abs(m.dot(n)) > 0.9) count++;
    if (count > best) { best = count; axis = n; }
  }
  const posA = new THREE.Vector3();
  const posB = new THREE.Vector3();
  let na = 0, nb = 0;
  for (let i = 0; i < normals.length; i++) {
    const d = normals[i].dot(axis);
    if (d > 0.9) { posA.add(pts[i]); na++; }
    else if (d < -0.9) { posB.add(pts[i]); nb++; }
  }
  if (!na || !nb) return [];
  posA.multiplyScalar(1 / na);
  posB.multiplyScalar(1 / nb);
  const dir = posB.clone().sub(posA);
  if (dir.lengthSq() < 1e-6) return [];
  dir.normalize();
  return [
    { point: posA, axis: dir.clone().negate() },
    { point: posB, axis: dir },
  ];
}

/**
 * Free ends of brass, plastic and auxiliary-air nipples on induction and fuel parts.
 * A cylinder end is a nipple when it stands clear of the part (hoses excluded) and
 * is not the joint where two cylinders of that part meet. The root of a seated
 * nipple often stands just proud of the casting; the cylinder is connected if any
 * free end has a hose or a cap.
 */
function nippleEnds(): End[] {
  const ends: End[] = [];
  let cyl = 0;
  for (const part of PARTS) {
    if (!inScope(part.id)) continue;
    const root = ASSET_BUILDERS[part.asset]();
    root.updateMatrixWorld(true);
    const pose = poseOf(part.id);
    const solid: number[] = [];
    const v = new THREE.Vector3();
    const cylinders: { world: THREE.Matrix4; geom: THREE.BufferGeometry }[] = [];
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (typeof mesh.name === 'string' && mesh.name.startsWith('line:')) return;
      const hex = (mesh.material as THREE.MeshStandardMaterial)?.color?.getHex?.();
      const p = mesh.geometry.parameters as { radiusTop?: number; radiusBottom?: number; height?: number } | undefined;
      const r = Math.max(p?.radiusTop ?? 0, p?.radiusBottom ?? 0);
      const nipple = !!p && p.height != null && p.height >= 3.5 && p.height <= 48 && nippleMaterial(part.id, hex, r, p.height);
      for (const inst of instancesOf(mesh)) {
        const world = worldOf(pose, mesh, inst);
        const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
        const P = g.attributes.position;
        for (let i = 0; i < P.count; i++) {
          v.fromBufferAttribute(P, i).applyMatrix4(world);
          solid.push(v.x, v.y, v.z);
        }
        if (nipple) cylinders.push({ world, geom: mesh.geometry });
      }
    });
    if (!cylinders.length || solid.length < 9) continue;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(solid, 3));
    const caps: End[] = [];
    for (const m of cylinders) {
      const id = cyl++;
      for (const cap of cylinderCaps(m.geom, m.world)) {
        caps.push({ part: part.id, cyl: id, point: cap.point, axis: cap.axis });
      }
    }
    // An end is a nipple only when it is the outermost point of the part along its axis
    // and it is not the joint where two cylinders meet. A root buried in the casting,
    // and an elbow that stops on the next cylinder, are not open barbs.
    const proj = new THREE.Vector3();
    const positions = geom.attributes.position;
    for (const end of caps) {
      const joint = caps.some((o) => o.cyl !== end.cyl && o.point.distanceTo(end.point) < 3);
      if (joint) continue;
      let maxPast = 0;
      for (let i = 0; i < positions.count; i++) {
        proj.fromBufferAttribute(positions, i).sub(end.point);
        const along = proj.dot(end.axis);
        // The next 18 mm, and only the metal beside this end. A canister on the same
        // part further along the axis does not turn a nipple into a buried root.
        if (along <= 1.4 || along > 18) continue;
        const radial = proj.addScaledVector(end.axis, -along).length();
        if (radial < 10 && along > maxPast) maxPast = along;
      }
      if (maxPast < 1.4) ends.push(end);
    }
  }
  return ends;
}

type HoseEnd = { point: THREE.Vector3; dir: THREE.Vector3 };

function hoseEnds(visible: Set<string>): HoseEnd[] {
  const ends: HoseEnd[] = [];
  for (const p of PARTS) {
    if (!visible.has(p.id)) continue;
    const root = ASSET_BUILDERS[p.asset]();
    root.updateMatrixWorld(true);
    const pose = poseOf(p.id);
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const named = typeof mesh.name === 'string' && mesh.name.startsWith('line:');
      const hex = (mesh.material as THREE.MeshStandardMaterial)?.color?.getHex?.();
      const tubular = mesh.geometry.parameters?.tubularSegments as number | undefined;
      const hose = named || (tubular != null && hex === RUBBER);
      if (!hose) return;
      for (const inst of instancesOf(mesh)) {
        const world = worldOf(pose, mesh, inst);
        const line = tubeCenterline(mesh.geometry, world);
        if (line && line.length >= 2) {
          for (const [i, j] of [[0, 1], [line.length - 1, line.length - 2]] as const) {
            const dir = line[j].clone().sub(line[i]);
            if (dir.lengthSq() < 1e-6) continue;
            ends.push({ point: line[i], dir: dir.normalize() });
          }
          continue;
        }
        for (const cap of cylinderCaps(mesh.geometry, world)) {
          ends.push({ point: cap.point, dir: cap.axis });
        }
      }
    });
  }
  return ends;
}

function capCovers(tip: THREE.Vector3, visible: Set<string>) {
  for (const p of PARTS) {
    if (!visible.has(p.id) || !p.id.includes('cap')) continue;
    const root = ASSET_BUILDERS[p.asset]();
    root.updateMatrixWorld(true);
    const pose = poseOf(p.id);
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const P = mesh.geometry.attributes.position;
      for (const inst of instancesOf(mesh)) {
        const w = worldOf(pose, mesh, inst);
        for (let i = 0; i < P.count; i += 3) box.expandByPoint(v.fromBufferAttribute(P, i).applyMatrix4(w));
      }
    });
    const size = box.getSize(new THREE.Vector3());
    if (Math.max(size.x, size.y, size.z) > 40) continue;
    if (box.expandByScalar(0.6).containsPoint(tip)) return p.id;
  }
  return '';
}

/** Hose terminus within 6 mm along the barb (a 4 mm push-on counts) and coaxial with it. */
function coaxial(tip: End, ends: HoseEnd[]) {
  return ends.some((e) => {
    const delta = e.point.clone().sub(tip.point);
    const along = delta.dot(tip.axis);
    const radial = delta.clone().addScaledVector(tip.axis, -along).length();
    return Math.abs(along) <= 6 && radial < 2.6 && Math.abs(e.dir.dot(tip.axis)) > 0.75;
  });
}

describe('induction and fuel barbs', () => {
  const tips = nippleEnds();

  for (const on of [false, true]) {
    it(`every nipple is hosed or capped when emissions equipment is ${on ? 'on' : 'off'}`, () => {
      const hidden = emissionsHidden(on);
      const visible = new Set(PARTS.map((p) => p.id).filter((id) => !hidden.has(id)));
      const ends = hoseEnds(visible);
      const tee = new THREE.Vector3(...TEE_AIR_INJ.point);
      const byCyl = new Map<number, End[]>();
      for (const tip of tips) {
        const list = byCyl.get(tip.cyl) ?? [];
        list.push(tip);
        byCyl.set(tip.cyl, list);
      }
      const bad: string[] = [];
      const pending: string[] = [];
      for (const list of byCyl.values()) {
        if (list.some((tip) => coaxial(tip, ends) || capCovers(tip.point, visible))) continue;
        const handoff = list.some((tip) => tip.point.distanceTo(tee) < 4);
        const where = list.map((tip) => `${tip.part} @ ${tip.point.toArray().map((n) => n.toFixed(0)).join(',')}`).join(' | ');
        if (handoff) pending.push(where);
        else bad.push(where);
      }
      expect(bad, 'open barbs').toEqual([]);
      // air-hose-vacuum is still the hardcoded run in bottomAnc.ts. It is present with
      // emissions on and does not sit on the new barb, so that state is a pending handoff.
      // The emissions-off cap is built from TEE_AIR_INJ and has to cover the barb.
      if (on) expect(pending, 'TEE_AIR_INJ stays a pending handoff until air-hose-vacuum is re-ended').not.toEqual([]);
      else expect(pending, 'the emissions-off cap seats on TEE_AIR_INJ').toEqual([]);
    });
  }
});

describe('diverter barb lead-in', () => {
  it('a ray of at least 30 mm from TEE_AIR_INJ along its axis misses every part that is present with emissions on', () => {
    const hidden = emissionsHidden(true);
    const point = new THREE.Vector3(...TEE_AIR_INJ.point);
    const axis = new THREE.Vector3(...TEE_AIR_INJ.axis).normalize();
    const origin = point.clone().addScaledVector(axis, 0.5);
    let best = Infinity;
    let who = '';
    for (const p of PARTS) {
      if (hidden.has(p.id)) continue;
      const root = ASSET_BUILDERS[p.asset]();
      root.updateMatrixWorld(true);
      const pose = poseOf(p.id);
      const out: number[] = [];
      const v = new THREE.Vector3();
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
        const P = g.attributes.position;
        for (const im of instancesOf(mesh)) {
          const w = worldOf(pose, mesh, im);
          for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(w); out.push(v.x, v.y, v.z); }
        }
      });
      if (!out.length) continue;
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
      const bvh = new MeshBVH(geom);
      geom.computeBoundingBox();
      const ray = new THREE.Ray(origin, axis);
      if (!ray.intersectsBox(geom.boundingBox!)) continue;
      const hit = bvh.raycastFirst(ray, THREE.DoubleSide) as { distance: number } | null;
      if (hit && hit.distance < best) { best = hit.distance; who = p.id; }
    }
    expect(best + 0.5, `first hit ${who}`).toBeGreaterThanOrEqual(30);
  });
});

describe('distributor vacuum hose near the throttle', () => {
  it('bends at least 2.5× its outside diameter clear of the fittings, and stays off the EGR hose', () => {
    const dist = centerlines('vacuum-fittings', 'line:vac-distributor');
    // The 3.2×7 hose is modelled at r 3.2, so the mesh OD is 6.4 mm. 2.5× that is 16 mm.
    // Catalogue OD is 7 mm (2.5× = 17.5). The fillet is 18 mm; fitting leads stay shorter.
    const floor = 2.5 * 6.4;
    const bad: string[] = [];
    for (const line of dist) {
      const trimmed = line.filter((p) => p.distanceTo(line[0]) > 25 && p.distanceTo(line[line.length - 1]) > 25);
      const r = minBend(trimmed.length > 4 ? trimmed : line);
      if (r < floor - 0.5) bad.push(`bend ${r.toFixed(1)} mm, floor ${floor.toFixed(1)} mm`);
    }
    expect(bad).toEqual([]);
    const egr = centerlines('egr-hose-long').flat();
    let min = Infinity;
    let where = '';
    for (const line of dist) for (const a of line) for (const b of egr) {
      const d = a.distanceTo(b);
      if (d < min) {
        min = d;
        where = `${a.toArray().map((n) => n.toFixed(0)).join(',')} vs ${b.toArray().map((n) => n.toFixed(0)).join(',')}`;
      }
    }
    expect(min, `clearance ${min.toFixed(1)} mm at ${where}`).toBeGreaterThan(20);
  });
});
