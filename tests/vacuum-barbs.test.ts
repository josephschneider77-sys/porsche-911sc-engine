import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { ASSET_BUILDERS } from '../src/geo/assets';
import { PARTS, PART_BY_ID } from '../src/data/parts';
import { SMALL_SPECS } from '../src/data/smallSpec';
import { TEE_AIR_INJ, THROTTLE_PORTED_VAC, serviceHoses } from '../src/geo/induction';
import { cylBetween } from '../src/geo/util';
import { emissionsHidden } from '../src/data/teardown';

const BRASS = 0xc9a54a;
const PLASTIC = 0x151515;
const CAST = 0x96989a;
const RUBBER = 0x0e0e0e;
const ZINC = 0xb4b6ae;

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

/** `parameters` exists on concrete geometries (Tube, Cylinder), not on the BufferGeometry type. */
const params = (g: THREE.BufferGeometry) =>
  (g as THREE.BufferGeometry & { parameters?: Record<string, number> }).parameters;

/** Centreline samples of a tubular hose, in world space. */
function tubeCenterline(geom: THREE.BufferGeometry, world: THREE.Matrix4): THREE.Vector3[] | null {
  const radial = params(geom)?.radialSegments as number | undefined;
  const tubular = params(geom)?.tubularSegments as number | undefined;
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
      const p = params(mesh.geometry) as { radiusTop?: number; radiusBottom?: number; height?: number } | undefined;
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
      const tubular = params(mesh.geometry)?.tubularSegments as number | undefined;
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

describe('paired throttle nipples', () => {
  const seats = [
    { name: 'TEE_AIR_INJ', seat: TEE_AIR_INJ },
    { name: 'THROTTLE_PORTED_VAC', seat: THROTTLE_PORTED_VAC },
  ];

  it('the pair is parallel, 10 to 12 mm apart, both pointing down', () => {
    const a = new THREE.Vector3(...TEE_AIR_INJ.axis).normalize();
    const b = new THREE.Vector3(...THROTTLE_PORTED_VAC.axis).normalize();
    expect(a.dot(b)).toBeGreaterThan(0.999);
    expect(a.y).toBeLessThan(-0.999);
    const d = new THREE.Vector3(...TEE_AIR_INJ.point).distanceTo(new THREE.Vector3(...THROTTLE_PORTED_VAC.point));
    expect(d).toBeGreaterThanOrEqual(10);
    expect(d).toBeLessThanOrEqual(12);
  });

  it('each nipple has at least 5 mm of push-on brass', () => {
    const root = ASSET_BUILDERS[PART_BY_ID['throttle-housing'].asset]();
    root.updateMatrixWorld(true);
    const short: string[] = [];
    for (const { name, seat } of seats) {
      const tip = new THREE.Vector3(...seat.point);
      let length = 0;
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const height = params(mesh.geometry)?.height as number | undefined;
        if (height == null) return;
        const box = new THREE.Box3().setFromObject(mesh);
        if (box.distanceToPoint(tip) > 0.8) return;
        if (height > length) length = height;
      });
      if (length < 5) short.push(`${name} push-on ${length.toFixed(1)} mm`);
    }
    expect(short).toEqual([]);
  });

  it.each(seats)('a ray of at least 30 mm from $name along its axis misses every part that is present with emissions on', ({ seat }) => {
    const hidden = emissionsHidden(true);
    const point = new THREE.Vector3(...seat.point);
    const axis = new THREE.Vector3(...seat.axis).normalize();
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

type Ring = { part: string; center: THREE.Vector3; axis: THREE.Vector3; tube: number; radius: number };

/** Hole axis of a torus. Vertices stay in generator order after a baked rotation. */
function torusFrame(geom: THREE.BufferGeometry, world: THREE.Matrix4): { center: THREE.Vector3; axis: THREE.Vector3 } | null {
  const radial = params(geom)?.radialSegments;
  const tubular = params(geom)?.tubularSegments;
  if (radial == null || tubular == null) return null;
  const stride = tubular + 1;
  const P = geom.attributes.position;
  const centers: THREE.Vector3[] = [];
  for (let i = 0; i < tubular; i++) {
    const c = new THREE.Vector3();
    let n = 0;
    for (let j = 0; j < radial; j++) {
      c.add(new THREE.Vector3().fromBufferAttribute(P, j * stride + i));
      n++;
    }
    if (n) centers.push(c.multiplyScalar(1 / n).applyMatrix4(world));
  }
  if (centers.length < 3) return null;
  const center = new THREE.Vector3();
  for (const c of centers) center.add(c);
  center.multiplyScalar(1 / centers.length);
  const axis = new THREE.Vector3();
  for (let i = 0; i < centers.length; i++) {
    const a = centers[i], b = centers[(i + 1) % centers.length];
    axis.x += (a.y - center.y) * (b.z - center.z) - (a.z - center.z) * (b.y - center.y);
    axis.y += (a.z - center.z) * (b.x - center.x) - (a.x - center.x) * (b.z - center.z);
    axis.z += (a.x - center.x) * (b.y - center.y) - (a.y - center.y) * (b.x - center.x);
  }
  if (axis.lengthSq() < 1e-8) return null;
  return { center, axis: axis.normalize() };
}

function clampRings(): Ring[] {
  const rings: Ring[] = [];
  for (const part of PARTS) {
    if (!inScope(part.id)) continue;
    const root = ASSET_BUILDERS[part.asset]();
    root.updateMatrixWorld(true);
    const pose = poseOf(part.id);
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const hex = (mesh.material as THREE.MeshStandardMaterial)?.color?.getHex?.();
      if (hex !== ZINC) return;
      const tube = params(mesh.geometry)?.tube;
      const radius = params(mesh.geometry)?.radius;
      // Wire clamps on a barb or a small hose. Boot bands and ring terminals are larger.
      if (tube == null || radius == null || tube < 0.55 || tube > 0.85 || radius < 3 || radius > 8) return;
      for (const inst of instancesOf(mesh)) {
        const frame = torusFrame(mesh.geometry, worldOf(pose, mesh, inst));
        if (frame) rings.push({ part: part.id, ...frame, tube, radius });
      }
    });
  }
  return rings;
}

type Seat = { id: string; point: THREE.Vector3; axis: THREE.Vector3 };

/** Push-on seats: every vacuum and aux-air end, plus the EGR hose on the throttle nipple. */
function hoseSeats(): Seat[] {
  const seats: Seat[] = [];
  for (const h of serviceHoses()) {
    for (const end of [h.a, h.b]) {
      seats.push({
        id: `${h.id}@${end.part}`,
        point: new THREE.Vector3(...end.point),
        axis: new THREE.Vector3(...end.axis).normalize(),
      });
    }
  }
  seats.push({
    id: 'egr-hose-long@throttle',
    point: new THREE.Vector3(...THROTTLE_PORTED_VAC.point),
    axis: new THREE.Vector3(...THROTTLE_PORTED_VAC.axis).normalize(),
  });
  return seats;
}

/** Rubber vertices, world space. The throttle band sits on an EGR hose outside the induction set. */
function rubberCloud(): THREE.Vector3[] {
  const want = new Set<string>([
    'vacuum-fittings', 'aux-air-plumbing',
    'egr-hose-long', 'egr-hose-short', 'egr-hose-return', 'egr-hose-diverter',
    'air-hose-vacuum', 'air-hose-pump', 'air-hose-valve', 'air-hose-dump',
  ]);
  const out: THREE.Vector3[] = [];
  const v = new THREE.Vector3();
  for (const part of PARTS) {
    if (!want.has(part.id)) continue;
    const root = ASSET_BUILDERS[part.asset]();
    root.updateMatrixWorld(true);
    const pose = poseOf(part.id);
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const hex = (mesh.material as THREE.MeshStandardMaterial)?.color?.getHex?.();
      if (hex !== RUBBER) return;
      const P = mesh.geometry.attributes.position;
      for (const inst of instancesOf(mesh)) {
        const world = worldOf(pose, mesh, inst);
        for (let i = 0; i < P.count; i++) out.push(v.fromBufferAttribute(P, i).applyMatrix4(world).clone());
      }
    });
  }
  return out;
}

describe('vacuum clamp rings', () => {
  const rings = clampRings();
  const seats = hoseSeats();
  const rubber = rubberCloud();

  it('every clamp ring is coaxial with a hose end and lies inside that overlap', () => {
    const rel = new THREE.Vector3();
    const bad: string[] = [];
    for (const ring of rings) {
      const seat = seats
        .map((s) => {
          const along = ring.center.clone().sub(s.point).dot(s.axis);
          const radial = ring.center.clone().sub(s.point).addScaledVector(s.axis, -along).length();
          return { s, along, radial, align: Math.abs(ring.axis.dot(s.axis)) };
        })
        .filter((x) => x.align > 0.85 && x.radial < 1.2 && x.along < 1 && x.along > -12)
        .sort((a, b) => a.radial - b.radial)[0];
      const at = `${ring.part} @ ${ring.center.toArray().map((n) => n.toFixed(0)).join(',')}`;
      if (!seat) { bad.push(`${at}: no coaxial hose end`); continue; }
      let inner = Infinity;
      for (const q of rubber) {
        rel.copy(q).sub(seat.s.point);
        const along = rel.dot(seat.s.axis);
        if (along < -12 || along > 1) continue;
        const radial = Math.sqrt(Math.max(0, rel.lengthSq() - along * along));
        if (radial < 1.5 || radial > 16) continue;
        if (along < inner) inner = along;
      }
      if (!Number.isFinite(inner)) { bad.push(`${at}: no hose over ${seat.s.id}`); continue; }
      // Inboard of the lip, and still short of the tip, so the wire is on rubber over the barb.
      if (seat.along < inner + 0.3 || seat.along > -0.4) {
        bad.push(`${at} on ${seat.s.id}: ring ${seat.along.toFixed(2)} mm, hose from ${inner.toFixed(2)} mm`);
      }
    }
    expect(bad).toEqual([]);
    expect(rings.length).toBeGreaterThan(0);
  });

  it('each ring inner radius meets the hose, with at most 0.2 mm of gap and no overlap', () => {
    const rel = new THREE.Vector3();
    const bad: string[] = [];
    for (const ring of rings) {
      const seat = seats
        .map((s) => {
          const along = ring.center.clone().sub(s.point).dot(s.axis);
          const radial = ring.center.clone().sub(s.point).addScaledVector(s.axis, -along).length();
          return { s, along, radial, align: Math.abs(ring.axis.dot(s.axis)) };
        })
        .filter((x) => x.align > 0.85 && x.radial < 1.2 && x.along < 1 && x.along > -12)
        .sort((a, b) => a.radial - b.radial)[0];
      const at = `${ring.part} @ ${ring.center.toArray().map((n) => n.toFixed(0)).join(',')}`;
      if (!seat) { bad.push(`${at}: no coaxial hose end`); continue; }
      const inner = ring.radius - ring.tube;
      const ringAlong = ring.center.clone().sub(seat.s.point).dot(seat.s.axis);
      // Sleeve vertices sit on the end rings, about 3.5 mm from the band. A wider
      // window reaches the next hose at the junction.
      const outside = ring.radius + ring.tube + 0.3;
      let od = 0;
      for (const q of rubber) {
        rel.copy(q).sub(seat.s.point);
        const along = rel.dot(seat.s.axis);
        if (Math.abs(along - ringAlong) > 3.8) continue;
        const radial = Math.sqrt(Math.max(0, rel.lengthSq() - along * along));
        if (radial < 1.2 || radial > outside) continue;
        if (radial > od) od = radial;
      }
      if (od <= 0) { bad.push(`${at}: no hose under the ring`); continue; }
      const gap = inner - od;
      if (gap < -0.02 || gap > 0.2) bad.push(`${at}: gap ${gap.toFixed(3)} mm (ring inner ${inner.toFixed(2)}, hose ${od.toFixed(2)})`);
    }
    expect(bad).toEqual([]);
  });
});

describe('thermo-valve hose length', () => {
  it('stays near the 107-10 #13 cut of 245 mm', () => {
    // #13A is 30 mm, #13B is 370 mm, #16 is 40 mm of a larger hose. #13 is the cut that fits.
    const root = ASSET_BUILDERS[PART_BY_ID['vacuum-fittings'].asset]();
    let path = 0;
    let leads = 0;
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || mesh.name !== 'line:vac-thermo') return;
      const par = params(mesh.geometry);
      const curve = (mesh.geometry as THREE.TubeGeometry).parameters?.path;
      if (curve && 'getLength' in curve) path += (curve as { getLength: () => number }).getLength();
      else if (par?.height != null && (par.radiusTop ?? 0) > 4) leads += par.height;
    });
    // Two 7 mm push-ons, plus the straight leads, plus the swept run. The sleeve shell is 7.2 mm.
    const sleeves = 7.2 * 2;
    const length = path + Math.max(0, leads - sleeves);
    expect(length, `centreline ${length.toFixed(1)} mm`).toBeGreaterThan(220);
    expect(length).toBeLessThan(270);
  });
});

describe('hose slides onto the barb', () => {
  it('each vacuum and aux-air end covers at least 5 mm of its barb, coaxially', () => {
    // CIS fuel lines are steel tube in union nuts. They have no push-on barb.
    const clouds = new Map<string, THREE.Vector3[]>();
    const bad: string[] = [];
    const rel = new THREE.Vector3();
    for (const h of serviceHoses()) {
      const key = `${h.part}:${h.id}`;
      if (!clouds.has(key)) {
        const root = ASSET_BUILDERS[PART_BY_ID[h.part].asset]();
        root.updateMatrixWorld(true);
        const pose = poseOf(h.part);
        const pts: THREE.Vector3[] = [];
        const v = new THREE.Vector3();
        root.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh || mesh.name !== `line:${h.id}`) return;
          const P = mesh.geometry.attributes.position;
          for (const inst of instancesOf(mesh)) {
            const world = worldOf(pose, mesh, inst);
            for (let i = 0; i < P.count; i++) pts.push(v.fromBufferAttribute(P, i).applyMatrix4(world).clone());
          }
        });
        clouds.set(key, pts);
      }
      const verts = clouds.get(key)!;
      for (const end of [h.a, h.b]) {
        const where = `${h.id} @ ${end.part}`;
        if (end.barbR == null) { bad.push(`${where}: no barb radius`); continue; }
        const tip = new THREE.Vector3(...end.point);
        const axis = new THREE.Vector3(...end.axis).normalize();
        const bore: THREE.Vector3[] = [];
        let reaches = false;
        for (const q of verts) {
          rel.copy(q).sub(tip);
          const along = rel.dot(axis);
          const radial = Math.sqrt(Math.max(0, rel.lengthSq() - along * along));
          if (along > -1 && radial < 20) reaches = true;
          if (Math.abs(radial - end.barbR) < 0.2 && along > -12 && along < 1) bore.push(q.clone());
        }
        if (bore.length < 8) { bad.push(`${where}: bore not on the barb`); continue; }
        let inner = Infinity;
        const centroid = new THREE.Vector3();
        for (const q of bore) {
          centroid.add(q);
          const along = q.clone().sub(tip).dot(axis);
          if (along < inner) inner = along;
        }
        centroid.multiplyScalar(1 / bore.length);
        rel.copy(centroid).sub(tip);
        const cAlong = rel.dot(axis);
        const cRadial = Math.sqrt(Math.max(0, rel.lengthSq() - cAlong * cAlong));
        if (inner > -5) bad.push(`${where}: covers ${(-inner).toFixed(2)} mm`);
        if (cRadial > 0.35) bad.push(`${where}: bore ${cRadial.toFixed(2)} mm off the axis`);
        if (!reaches) bad.push(`${where}: hose stops short of the tip`);
      }
    }
    expect(bad).toEqual([]);
  });
});

/** Surface gap between two triangle soups. Faceted cylinders read a few tenths under the true radii. */
function surfaceGap(a: THREE.BufferGeometry, b: THREE.BufferGeometry): number {
  const ga = a.index ? a.toNonIndexed() : a;
  const gb = b.index ? b.toNonIndexed() : b;
  const bvh = new MeshBVH(gb);
  const hit = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 };
  bvh.closestPointToGeometry(ga, new THREE.Matrix4(), hit, { point: new THREE.Vector3(), distance: 0, faceIndex: 0 });
  return hit.distance;
}

type Lead = { point: THREE.Vector3; axis: THREE.Vector3; reach: number; radial: number };

/**
 * Drop triangles that touch this hose's own straight lead.
 * The lead is the capsule along the outward axis from the fitting tip.
 * A mid-run contact is not a lead, even when the surfaces touch.
 */
function withoutLeads(geom: THREE.BufferGeometry, leads: Lead[]): THREE.BufferGeometry {
  const g = geom.index ? geom.toNonIndexed() : geom;
  const P = g.attributes.position;
  const keep: number[] = [];
  const rel = new THREE.Vector3();
  for (let i = 0; i < P.count; i += 3) {
    let seated = false;
    for (let k = 0; k < 3 && !seated; k++) {
      const vert = new THREE.Vector3().fromBufferAttribute(P, i + k);
      seated = leads.some((lead) => {
        rel.copy(vert).sub(lead.point);
        const along = rel.dot(lead.axis);
        // The sleeve occupies the 7 mm inboard of the tip. That contact is the seat, not a clash.
        if (along < -9 || along > lead.reach) return false;
        return rel.addScaledVector(lead.axis, -along).length() < lead.radial;
      });
    }
    if (seated) continue;
    for (let k = 0; k < 3; k++) {
      const v = new THREE.Vector3().fromBufferAttribute(P, i + k);
      keep.push(v.x, v.y, v.z);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
  return out;
}

describe('hose to fitting clearance', () => {
  it('a 6 mm centreline offset between an r 1.5 rod and an r 4.5 hose fails the 2 mm rule', () => {
    // 6.0 = 1.5 + 4.5, so the surfaces touch. Centreline distance would report 6 mm and pass.
    const rod = cylBetween([0, 0, 0], [0, 40, 0], 1.5, 24);
    const hose = cylBetween([6, 0, 0], [6, 40, 0], 4.5, 24);
    const gap = surfaceGap(rod, hose);
    expect(gap, `surface gap ${gap.toFixed(2)} mm`).toBeLessThan(2);
    expect(gap).toBeLessThan(0.5);
  });

  it('every barb and fitting body stays at least 2 mm off every hose except that hose\'s own lead', () => {
    // The old check called any vertex within 1.2 mm a seated contact, then ignored
    // every sample within 16 mm of those vertices. The wire arm kissed vac-thermo
    // mid-run (6.0 mm between centrelines, r 1.5 + r 4.5) and those samples were
    // dropped, so the table reported about 15.9 mm. A tangent also is not a triangle
    // clash: trianglesClash wants a segment that crosses a face. This is the
    // surface distance, and the only samples removed are each hose's own lead.
    const leadsOf = new Map<string, Lead[]>();
    for (const h of serviceHoses()) {
      const list = leadsOf.get(`${h.part}:${h.id}`) ?? [];
      for (const end of [h.a, h.b]) {
        list.push({
          point: new THREE.Vector3(...end.point),
          axis: new THREE.Vector3(...end.axis).normalize(),
          reach: 4,
          radial: 4,
        });
      }
      leadsOf.set(`${h.part}:${h.id}`, list);
    }
    type Soup = { id: string; geom: THREE.BufferGeometry; box: THREE.Box3; radial: number };
    const fittings: Soup[] = [];
    const hoses: Soup[] = [];
    const bake = (mesh: THREE.Mesh, world: THREE.Matrix4) => {
      const src = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
      const baked = src.clone();
      baked.applyMatrix4(world);
      baked.computeBoundingBox();
      const p = params(mesh.geometry);
      const radial = Math.max(p?.radius ?? 0, p?.radiusTop ?? 0, p?.radiusBottom ?? 0);
      return { geom: baked, box: baked.boundingBox!, radial };
    };
    // Emissions on is the larger set: the cap is not a hose, and every vacuum hose is present.
    const hidden = emissionsHidden(true);
    const wanted = new Set([
      'vacuum-fittings', 'aux-air-plumbing',
      'air-hose-vacuum', 'air-hose-pump', 'air-hose-valve', 'air-hose-dump',
      'egr-hose-long', 'egr-hose-short', 'egr-hose-return', 'egr-hose-diverter',
    ]);
    for (const part of PARTS) {
      if (hidden.has(part.id) || !wanted.has(part.id)) continue;
      const root = ASSET_BUILDERS[part.asset]();
      root.updateMatrixWorld(true);
      const pose = poseOf(part.id);
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const hex = (mesh.material as THREE.MeshStandardMaterial)?.color?.getHex?.();
        const named = typeof mesh.name === 'string' ? mesh.name : '';
        const tubular = params(mesh.geometry)?.tubularSegments != null;
        const hose = named.startsWith('line:') || (tubular && hex === RUBBER);
        let fitting: string | null = null;
        let p: THREE.Object3D | null = mesh.parent;
        while (p) {
          if (typeof p.name === 'string' && p.name.startsWith('fitting:')) { fitting = p.name; break; }
          p = p.parent;
        }
        for (const inst of instancesOf(mesh)) {
          const world = worldOf(pose, mesh, inst);
          const baked = bake(mesh, world);
          if (hose) {
            const id = named.startsWith('line:') ? `${part.id}:${named.slice(5)}` : part.id;
            hoses.push({ id, ...baked });
          } else if (fitting && part.id === 'vacuum-fittings') {
            fittings.push({ id: fitting, ...baked });
          }
        }
      });
    }
    const fitById = new Map<string, Soup[]>();
    for (const f of fittings) {
      const list = fitById.get(f.id) ?? [];
      list.push(f);
      fitById.set(f.id, list);
    }
    const fitPacked = [...fitById.entries()].map(([id, parts]) => {
      const pts: number[] = [];
      const box = new THREE.Box3();
      for (const part of parts) {
        box.union(part.box);
        const P = part.geom.attributes.position;
        for (let i = 0; i < P.count; i++) {
          pts.push(P.getX(i), P.getY(i), P.getZ(i));
        }
      }
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      return { id, geom, box };
    });
    const byHose = new Map<string, Soup[]>();
    for (const h of hoses) {
      const list = byHose.get(h.id) ?? [];
      list.push(h);
      byHose.set(h.id, list);
    }
    const report: string[] = [];
    const bad: string[] = [];
    for (const [id, geoms] of byHose) {
      const leads = (leadsOf.get(id) ?? []).map((lead) => ({
        ...lead,
        // Open sleeves and the flared aux-air bore do not always carry a radius parameter.
        radial: Math.max(lead.radial, 14, ...geoms.map((g) => g.radial + 1.5)),
      }));
      let min = Infinity;
      for (const geom of geoms) {
        const stripped = withoutLeads(geom.geom, leads);
        const count = stripped.attributes.position?.count ?? 0;
        if (count < 3) continue;
        stripped.computeBoundingBox();
        const hoseBox = stripped.boundingBox!;
        for (const fit of fitPacked) {
          const dx = Math.max(0, hoseBox.min.x - fit.box.max.x, fit.box.min.x - hoseBox.max.x);
          const dy = Math.max(0, hoseBox.min.y - fit.box.max.y, fit.box.min.y - hoseBox.max.y);
          const dz = Math.max(0, hoseBox.min.z - fit.box.max.z, fit.box.min.z - hoseBox.max.z);
          const boxGap = Math.hypot(dx, dy, dz);
          if (boxGap >= 2 && !id.startsWith('vacuum-fittings:')) {
            if (boxGap < min) min = boxGap;
            continue;
          }
          const d = surfaceGap(stripped, fit.geom);
          if (d < min) min = d;
        }
      }
      if (!Number.isFinite(min)) continue;
      report.push(`${id} ${min.toFixed(2)}`);
      if (min < 2) bad.push(`${id} ${min.toFixed(2)} mm`);
    }
    report.sort();
    expect(bad, report.join('; ')).toEqual([]);
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
