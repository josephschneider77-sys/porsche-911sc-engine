/**
 * Apply a crank angle to the loaded part objects. Whole parts spin about their real
 * axes. Tagged sub-meshes (valves, rockers, idler, rotor, pinion, alternator shaft)
 * move inside a housing that stays put. Chains and belts are skinned along the
 * builder curves so a later remesh still follows the same cord.
 */
import * as THREE from 'three';
import { bankOf } from '../data/layout';
import {
  measureDrive, spinsAt, rodPoses, valveLift, rockerDelta, idlerSpin,
  bindLoop, skinLoop, chainPoly, beltPoly, beltTravel, chainTravel, LoopBind,
} from './drive';
import { FAN, DIST, DIST_AXIS } from '../geo/aux';

const Z = new THREE.Vector3(0, 0, 1);
const DIST_AX = new THREE.Vector3(...DIST_AXIS).normalize();
const DIST_C = new THREE.Vector3(...DIST.pinion);

export interface RigNode {
  def: { id: string };
  inst: THREE.Object3D;
  meshes: THREE.Mesh[];
}

interface Skinned {
  mesh: THREE.Mesh;
  rest: THREE.BufferAttribute;
  bind: LoopBind;
  travel: (crankDeg: number) => number;
  clear: boolean;
  unit: 'mm' | 'link';
}

interface SpinMesh {
  mesh: THREE.Mesh;
  center: THREE.Vector3;
  axis: THREE.Vector3;
  ratio: () => number;
}

interface Slide {
  mesh: THREE.Mesh;
  stem: THREE.Vector3;
  dLift: (crankDeg: number) => number;
}

interface Spring {
  mesh: THREE.Mesh;
  rest: Float32Array;
  stem: THREE.Vector3;
  min: number;
  span: number;
  dLift: (crankDeg: number) => number;
}

interface Rocker {
  mesh: THREE.Mesh;
  x: number;
  y: number;
  dBeta: (crankDeg: number) => number;
}

function kinOf(mesh: THREE.Mesh): string {
  if (typeof mesh.userData.kin === 'string' && mesh.userData.kin) return mesh.userData.kin;
  const m = mesh.name.match(/#([^#]+)#/);
  return m ? m[1] : '';
}

function spinObject(obj: THREE.Object3D, center: THREE.Vector3, axis: THREE.Vector3, angle: number) {
  const q = new THREE.Quaternion().setFromAxisAngle(axis, angle);
  const spun = center.clone().applyQuaternion(q);
  obj.quaternion.copy(q);
  obj.position.copy(center).sub(spun);
}

export class Rig {
  private skinned: Skinned[] = [];
  private spins: SpinMesh[] = [];
  private slides: Slide[] = [];
  private springs: Spring[] = [];
  private rockers: Rocker[] = [];
  private witnesses: { mesh: THREE.Mesh; kind: 'fan' | 'pump'; poly: ReturnType<typeof beltPoly>['poly'] }[] = [];
  ready = false;

  constructor(private nodes: Map<string, RigNode>) {}

  bind() {
    const g = measureDrive();
    for (const n of this.nodes.values()) this.bindNode(n, g.rotor, g.pinion, g.fan);
    this.ready = true;
    this.pose(0);
  }

  private bindNode(n: RigNode, rotor: number, pinion: number, fan: number) {
    const id = n.def.id;
    if (id.startsWith('timing-chain-')) {
      const s: 1 | -1 = id.endsWith('left') ? -1 : 1;
      const { poly, z } = chainPoly(s);
      for (const mesh of n.meshes) this.trackSkin(mesh, poly, z, (deg) => chainTravel(s, deg), true, 'link');
    } else if (id === 'fan-belt' || id === 'air-pump-belt') {
      const kind = id === 'fan-belt' ? 'fan' : 'pump';
      const { poly, z } = beltPoly(kind);
      for (const mesh of n.meshes) this.trackSkin(mesh, poly, z, (deg) => beltTravel(kind, deg), false, 'mm');
      this.addWitness(n.inst, kind, poly);
    }
    const cyl = /^valves-(\d)$/.exec(id);
    if (cyl) {
      const c = +cyl[1];
      for (const mesh of n.meshes) {
        const k = kinOf(mesh);
        if (k === 'lift:in' || k === 'lift:ex') {
          const side: 1 | -1 = k.endsWith('in') ? 1 : -1;
          const stem = valveLift(c, side, 0).stem;
          this.slides.push({ mesh, stem, dLift: (deg) => valveLift(c, side, deg).dLift });
        } else if (k === 'spring:in' || k === 'spring:ex') {
          const side: 1 | -1 = k.endsWith('in') ? 1 : -1;
          this.trackSpring(mesh, c, side);
        }
      }
    }
    if (id.startsWith('rockers-')) {
      for (const mesh of n.meshes) {
        const m = kinOf(mesh).match(/^arm:(\d):(-?1)$/);
        if (!m) continue;
        const d = rockerDelta(+m[1], +m[2] as 1 | -1, 0);
        this.rockers.push({
          mesh, x: d.x, y: d.y,
          dBeta: (deg) => rockerDelta(+m[1], +m[2] as 1 | -1, deg).dBeta,
        });
      }
    }
    if (id.startsWith('chain-tensioner-')) {
      const s: 1 | -1 = id.endsWith('left') ? -1 : 1;
      for (const mesh of n.meshes) {
        if (kinOf(mesh) !== 'idler') continue;
        this.spins.push({
          mesh,
          center: new THREE.Vector3(idlerSpin(s, 0).x, idlerSpin(s, 0).y, 0),
          axis: Z,
          ratio: () => measureDrive().idler[s],
        });
      }
    }
    if (id === 'distributor') {
      for (const mesh of n.meshes) {
        const k = kinOf(mesh);
        if (k !== 'rotor' && k !== 'pinion') continue;
        const ratio = k === 'rotor' ? rotor : pinion;
        this.spins.push({ mesh, center: DIST_C.clone(), axis: DIST_AX, ratio: () => ratio });
      }
    }
    if (id === 'alternator') {
      for (const mesh of n.meshes) {
        if (kinOf(mesh) !== 'shaft') continue;
        this.spins.push({
          mesh, center: new THREE.Vector3(0, FAN.y, 0), axis: Z, ratio: () => fan,
        });
      }
    }
  }

  private trackSkin(mesh: THREE.Mesh, poly: LoopBind['poly'], z: number, travel: (deg: number) => number, clear: boolean, unit: 'mm' | 'link') {
    const pos = mesh.geometry.attributes.position as THREE.BufferAttribute;
    const rest = pos.clone();
    mesh.userData.restPos = rest;
    this.skinned.push({ mesh, rest, bind: bindLoop(rest, poly, z), travel, clear, unit });
  }

  private trackSpring(mesh: THREE.Mesh, cyl: number, side: 1 | -1) {
    const stem = valveLift(cyl, side, 0).stem;
    const pos = mesh.geometry.attributes.position as THREE.BufferAttribute;
    const rest = new Float32Array(pos.array.length);
    rest.set(pos.array as ArrayLike<number>);
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const p = rest[i * 3] * stem.x + rest[i * 3 + 1] * stem.y + rest[i * 3 + 2] * stem.z;
      if (p < min) min = p;
      if (p > max) max = p;
    }
    this.springs.push({
      mesh, rest, stem, min, span: Math.max(1e-3, max - min),
      dLift: (deg) => valveLift(cyl, side, deg).dLift,
    });
  }

  private addWitness(parent: THREE.Object3D, kind: 'fan' | 'pump', poly: ReturnType<typeof beltPoly>['poly']) {
    const g = new THREE.BoxGeometry(3.2, 7, 2.2);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: kind === 'fan' ? 0xff4d2e : 0xf2c14e, roughness: 0.4, metalness: 0.1 }));
    m.name = 'belt-witness';
    m.userData.partId = kind === 'fan' ? 'fan-belt' : 'air-pump-belt';
    parent.add(m);
    this.witnesses.push({ mesh: m, kind, poly });
  }

  pose(crankDeg: number) {
    if (!this.ready) return;
    const th = crankDeg * Math.PI / 180;
    for (const n of this.nodes.values()) {
      const id = n.def.id;
      const rod = /^conrod-(\d)$/.exec(id);
      const piston = /^piston-(\d)$/.exec(id);
      if (rod || piston) {
        const pose = rodPoses(crankDeg).find((p) => p.cyl === +(rod ?? piston)![1])!;
        if (piston) {
          const s = bankOf(pose.cyl);
          n.inst.position.set(pose.pinX, 0, pose.z);
          n.inst.rotation.set(0, s === 1 ? 0 : Math.PI, 0);
        } else {
          n.inst.position.set(pose.throwX, pose.throwY, pose.z);
          n.inst.rotation.set(0, 0, pose.rodAngle);
        }
      }
    }
    for (const s of spinsAt(crankDeg)) {
      const n = this.nodes.get(s.id);
      if (!n) continue;
      spinObject(n.inst, s.center, s.axis, s.angle);
    }
    for (const s of this.spins) spinObject(s.mesh, s.center, s.axis, s.ratio() * th);
    for (const s of this.slides) {
      s.mesh.position.copy(s.stem).multiplyScalar(s.dLift(crankDeg));
      s.mesh.quaternion.identity();
    }
    for (const s of this.springs) {
      const dL = s.dLift(crankDeg);
      const pos = s.mesh.geometry.attributes.position as THREE.BufferAttribute;
      const span = s.span;
      for (let i = 0; i < pos.count; i++) {
        const x = s.rest[i * 3], y = s.rest[i * 3 + 1], z = s.rest[i * 3 + 2];
        const t = (x * s.stem.x + y * s.stem.y + z * s.stem.z - s.min) / span;
        // Retainer end follows the valve. The seat end stays.
        const shift = t * dL;
        pos.setXYZ(i, x + s.stem.x * shift, y + s.stem.y * shift, z + s.stem.z * shift);
      }
      pos.needsUpdate = true;
    }
    for (const r of this.rockers) {
      spinObject(r.mesh, new THREE.Vector3(r.x, r.y, 0), Z, r.dBeta(crankDeg));
    }
    for (const sk of this.skinned) {
      const pos = sk.mesh.geometry.attributes.position as THREE.BufferAttribute;
      skinLoop(sk.bind, sk.travel(crankDeg), pos, sk.clear, sk.unit);
      sk.mesh.geometry.computeVertexNormals();
    }
    for (const w of this.witnesses) this.placeWitness(w.mesh, w.kind, w.poly, crankDeg);
  }

  private placeWitness(mesh: THREE.Mesh, kind: 'fan' | 'pump', poly: ReturnType<typeof beltPoly>['poly'], crankDeg: number) {
    // Park the mark on the free side of the crank (fan belt) or the pump (air belt) so it reads against the pulley.
    const base = kind === 'fan' ? poly.len * 0.62 : poly.len * 0.55;
    const travel = beltTravel(kind, crankDeg);
    const len = poly.len;
    let d = ((base + travel) % len + len) % len;
    let lo = 0, hi = poly.x.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (poly.s[mid] <= d) lo = mid; else hi = mid - 1;
    }
    const i = lo, j = (i + 1) % poly.x.length;
    const seg = poly.s[i + 1] - poly.s[i] || 1;
    const t = (d - poly.s[i]) / seg;
    const x = poly.x[i] + (poly.x[j] - poly.x[i]) * t;
    const y = poly.y[i] + (poly.y[j] - poly.y[i]) * t;
    const tx = (poly.x[j] - poly.x[i]) / seg, ty = (poly.y[j] - poly.y[i]) / seg;
    mesh.position.set(x - ty * 6.5, y + tx * 6.5, kind === 'fan' ? FAN.zBelt : FAN.zPumpBelt);
    mesh.quaternion.setFromAxisAngle(Z, Math.atan2(ty, tx));
  }
}
