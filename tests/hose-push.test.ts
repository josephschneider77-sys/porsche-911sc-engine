import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ASSET_BUILDERS } from '../src/geo/assets';
import { PART_BY_ID, PARTS } from '../src/data/parts';
import { heaterStub } from '../src/geo/aux';
import { TEE_AIR_INJ, THROTTLE_PORTED_VAC } from '../src/geo/induction';
import {
  HOSE_PUSH, PUMP_OUT, DUMP_PORT, DIVERTER_VAC, DIVERTER_VAC_EGR, EGR_BARB_UP, EGR_BARB_2, EGR_TEE_PORTS, HEATER_BLOWER, HEATER_BLOWER_INLET,
  checkValveInlet,
} from '../src/geo/bottomAnc';

const RUBBER = 0x0e0e0e;
const ZINC = 0xb4b6ae;

type Seat = { hose: string; point: number[]; axis: number[]; barbR: number; hoseR: number };

const outDir = new THREE.Vector3(...PUMP_OUT.tip).sub(new THREE.Vector3(...PUMP_OUT.neck)).normalize();
const hb = HEATER_BLOWER;
const rightStub = heaterStub(1);
const leftStub = heaterStub(-1);
const inlet = checkValveInlet();

/** Every rubber hose this branch owns. Bore radius is the barb radius. */
const SEATS: Seat[] = [
  { hose: 'air-hose-vacuum', point: DIVERTER_VAC, axis: [1, 0, 0], barbR: 2.2, hoseR: 3.5 },
  { hose: 'air-hose-vacuum', point: TEE_AIR_INJ.point, axis: TEE_AIR_INJ.axis, barbR: TEE_AIR_INJ.barbR, hoseR: 3.5 },
  { hose: 'egr-hose-short', point: THROTTLE_PORTED_VAC.point, axis: THROTTLE_PORTED_VAC.axis, barbR: THROTTLE_PORTED_VAC.barbR, hoseR: 3.5 },
  { hose: 'egr-hose-short', point: EGR_TEE_PORTS.upper.point, axis: EGR_TEE_PORTS.upper.axis, barbR: 2.2, hoseR: 3.5 },
  { hose: 'egr-hose-long', point: EGR_TEE_PORTS.valve.point, axis: EGR_TEE_PORTS.valve.axis, barbR: 2.2, hoseR: 3.5 },
  { hose: 'egr-hose-long', point: EGR_BARB_2.point, axis: EGR_BARB_2.axis, barbR: 2.2, hoseR: 3.5 },
  { hose: 'egr-hose-return', point: EGR_TEE_PORTS.return.point, axis: EGR_TEE_PORTS.return.axis, barbR: 2.2, hoseR: 3.5 },
  { hose: 'egr-hose-return', point: EGR_BARB_UP.point, axis: EGR_BARB_UP.axis, barbR: 2.2, hoseR: 3.5 },
  { hose: 'egr-hose-diverter', point: EGR_TEE_PORTS.diverter.point, axis: EGR_TEE_PORTS.diverter.axis, barbR: 2.2, hoseR: 3.5 },
  { hose: 'egr-hose-diverter', point: DIVERTER_VAC_EGR, axis: [1, 0, 0], barbR: 2.2, hoseR: 3.5 },
  { hose: 'air-hose-pump', point: PUMP_OUT.tip, axis: outDir.toArray(), barbR: 6.2, hoseR: 6 },
  { hose: 'air-hose-pump', point: [-172, 26, 448], axis: [-1, 0, 0], barbR: 7, hoseR: 6 },
  { hose: 'air-hose-valve', point: [-142, 56, 448], axis: [0, 1, 0], barbR: 7, hoseR: 6 },
  { hose: 'air-hose-valve', point: inlet, axis: [0, 1, 0], barbR: 7, hoseR: 6 },
  { hose: 'air-hose-dump', point: DUMP_PORT.point, axis: DUMP_PORT.axis, barbR: 7, hoseR: 8 },
  { hose: 'heater-hose-right', point: [hb.x + 26, 64, hb.z], axis: [1, 0, 0], barbR: 12, hoseR: 15 },
  { hose: 'heater-hose-right', point: rightStub.tip, axis: [0, 0, 1], barbR: 12, hoseR: 15 },
  { hose: 'heater-hose-left', point: [hb.x - 26, 64, hb.z], axis: [-1, 0, 0], barbR: 12, hoseR: 15 },
  { hose: 'heater-hose-left', point: leftStub.tip, axis: [0, 0, 1], barbR: 12, hoseR: 15 },
  { hose: 'heater-hose-link', point: [245, hb.y, 340], axis: [1, 0, 0], barbR: 11, hoseR: 9 },
  { hose: 'heater-hose-link', point: HEATER_BLOWER_INLET.point, axis: HEATER_BLOWER_INLET.axis, barbR: HEATER_BLOWER_INLET.barbR, hoseR: 9 },
];

function poseOf(id: string) {
  const d = PART_BY_ID[id];
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...(d.position ?? [0, 0, 0])),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...(d.rotation ?? [0, 0, 0]))),
    new THREE.Vector3(1, 1, 1),
  );
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

type Cloud = THREE.Vector3[];
const rubberOf = new Map<string, Cloud>();
function rubber(id: string): Cloud {
  const hit = rubberOf.get(id);
  if (hit) return hit;
  const root = ASSET_BUILDERS[PART_BY_ID[id].asset]();
  root.updateMatrixWorld(true);
  const pose = poseOf(id);
  const out: Cloud = [];
  const v = new THREE.Vector3();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const hex = (mesh.material as THREE.MeshStandardMaterial)?.color?.getHex?.();
    if (hex !== RUBBER) return;
    const P = mesh.geometry.attributes.position;
    for (const inst of instancesOf(mesh)) {
      const world = new THREE.Matrix4().multiplyMatrices(pose, mesh.matrixWorld).multiply(inst);
      for (let i = 0; i < P.count; i++) out.push(v.fromBufferAttribute(P, i).applyMatrix4(world).clone());
    }
  });
  rubberOf.set(id, out);
  return out;
}

function torusFrame(geom: THREE.BufferGeometry, world: THREE.Matrix4) {
  const par = (geom as THREE.TorusGeometry).parameters;
  const radial = par?.radialSegments;
  const tubular = par?.tubularSegments;
  if (radial == null || tubular == null) return null;
  const stride = tubular + 1;
  const P = geom.attributes.position;
  const centers: THREE.Vector3[] = [];
  for (let i = 0; i < tubular; i++) {
    const c = new THREE.Vector3();
    let n = 0;
    for (let j = 0; j < radial; j++) {
      const idx = j * stride + i;
      if (idx >= P.count) continue;
      c.add(new THREE.Vector3().fromBufferAttribute(P, idx).applyMatrix4(world));
      n++;
    }
    if (n) centers.push(c.multiplyScalar(1 / n));
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

type Ring = { center: THREE.Vector3; axis: THREE.Vector3; inner: number };
let rings: Ring[] | null = null;
function clampRings(): Ring[] {
  if (rings) return rings;
  rings = [];
  for (const part of PARTS) {
    const root = ASSET_BUILDERS[part.asset]();
    root.updateMatrixWorld(true);
    const pose = poseOf(part.id);
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const hex = (mesh.material as THREE.MeshStandardMaterial)?.color?.getHex?.();
      if (hex !== ZINC) return;
      const par = (mesh.geometry as THREE.TorusGeometry).parameters;
      const known = par?.radius != null && par.tube != null && par.tube <= 1.4 && par.radius <= 20;
      // Instanced clamp parts are merged, so the torus parameters are gone. The instance
      // matrix is the frame: origin at the wire centre, local +Y down the barb.
      if (!known && !(mesh as THREE.InstancedMesh).isInstancedMesh) return;
      for (const inst of instancesOf(mesh)) {
        const world = new THREE.Matrix4().multiplyMatrices(pose, mesh.matrixWorld).multiply(inst);
        if (known) {
          const frame = torusFrame(mesh.geometry, world);
          if (!frame) continue;
          rings!.push({ ...frame, inner: par.radius - par.tube });
          continue;
        }
        const center = new THREE.Vector3().setFromMatrixPosition(world);
        const axis = new THREE.Vector3(0, 1, 0).transformDirection(world).normalize();
        const local = mesh.geometry.attributes.position;
        let inner = Infinity;
        const p = new THREE.Vector3();
        const rel = new THREE.Vector3();
        for (let i = 0; i < local.count; i++) {
          rel.copy(p.fromBufferAttribute(local, i));
          const along = rel.dot(new THREE.Vector3(0, 1, 0));
          const radial = Math.sqrt(Math.max(0, rel.lengthSq() - along * along));
          if (radial > 0.4 && radial < inner) inner = radial;
        }
        if (!Number.isFinite(inner) || inner > 20) continue;
        rings!.push({ center, axis, inner });
      }
    });
  }
  return rings;
}

describe('owned hoses push onto the barb', () => {
  it('each end covers at least 5 mm, on the barb axis, with a clamp halfway on the hose OD', () => {
    const bad: string[] = [];
    const rel = new THREE.Vector3();
    for (const seat of SEATS) {
      const tip = new THREE.Vector3(...seat.point);
      const axis = new THREE.Vector3(...seat.axis).normalize();
      const where = `${seat.hose} @ ${seat.point.map((n) => n.toFixed(0)).join(',')}`;
      const verts = rubber(seat.hose);
      let inner = Infinity;
      let reaches = false;
      const seen = new Set<string>();
      const bore: THREE.Vector3[] = [];
      for (const q of verts) {
        rel.copy(q).sub(tip);
        const along = rel.dot(axis);
        const radial = Math.sqrt(Math.max(0, rel.lengthSq() - along * along));
        if (along > -1 && along < 2 && radial < seat.hoseR + 8) reaches = true;
        if (Math.abs(radial - seat.barbR) < 0.2 && along > -12 && along < 0.2) {
          // CylinderGeometry repeats the seam vertex, which pulls a centroid off the axis.
          const key = `${along.toFixed(2)}:${radial.toFixed(2)}:${q.x.toFixed(2)}:${q.y.toFixed(2)}:${q.z.toFixed(2)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          bore.push(q);
          if (along < inner) inner = along;
        }
      }
      if (bore.length < 8) bad.push(`${where}: bore not on the barb (${bore.length} verts)`);
      else {
        const cover = -inner;
        if (cover < 5) bad.push(`${where}: covers ${cover.toFixed(2)} mm`);
        if (cover < HOSE_PUSH - 0.6) bad.push(`${where}: covers ${cover.toFixed(2)} mm, want ${HOSE_PUSH}`);
        const centroid = new THREE.Vector3();
        for (const q of bore) centroid.add(q);
        centroid.multiplyScalar(1 / bore.length);
        rel.copy(centroid).sub(tip);
        const cAlong = rel.dot(axis);
        const cRadial = Math.sqrt(Math.max(0, rel.lengthSq() - cAlong * cAlong));
        if (cRadial > 0.6) bad.push(`${where}: bore ${cRadial.toFixed(2)} mm off the axis`);
      }
      if (!reaches) bad.push(`${where}: hose stops short of the tip`);
      const outer = Math.max(seat.hoseR, seat.barbR + 0.6);
      const ring = clampRings()
        .map((r) => {
          const along = r.center.clone().sub(tip).dot(axis);
          const radial = r.center.clone().sub(tip).addScaledVector(axis, -along).length();
          const align = Math.abs(r.axis.dot(axis));
          return { r, along, radial, align };
        })
        .filter((x) => x.align > 0.85 && x.radial < 1.5 && x.along < -1 && x.along > -8)
        .sort((a, b) => Math.abs(a.along + HOSE_PUSH / 2) - Math.abs(b.along + HOSE_PUSH / 2))[0];
      if (!ring) bad.push(`${where}: no clamp on the overlap`);
      else {
        const half = inner / 2;
        if (Math.abs(ring.along - half) > 1.2) {
          bad.push(`${where}: clamp at ${ring.along.toFixed(2)} mm, halfway is ${half.toFixed(2)}`);
        }
        if (Math.abs(ring.r.inner - outer) > 0.2) {
          bad.push(`${where}: clamp inner ${ring.r.inner.toFixed(2)} mm, hose OD ${outer.toFixed(2)}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
