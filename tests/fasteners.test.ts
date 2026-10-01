import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { fastenerSets, headHeight, bearingR, FSet, FItem } from '../src/geo/fasteners';
import { ASSET_BUILDERS } from '../src/geo/assets';
import { FASTENER_SPECS } from '../src/data/fastenerSpec';
import { PART_BY_ID } from '../src/data/parts';
import { TEARDOWN, stepIndexOf } from '../src/data/teardown';
import { rayHit } from './hw';

const sets = fastenerSets();
const COS6 = Math.cos((6 * Math.PI) / 180);
const basis = (n: THREE.Vector3) => {
  const a = Math.abs(n.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(n, a).normalize(); return [u, new THREE.Vector3().crossVectors(n, u)];
};
/** Seat probe radius: inside the washer / head bearing ring, outside the clearance hole. */
const rho = (f: FSet) => Math.max(f.M / 2 + 1.2, f.washer ? 0.85 * f.washer : 0.72 * bearingR(f));
function seatErrors(f: FSet, it: FItem): string[] {
  const errs: string[] = []; const n = it.n.clone().normalize(); const [u, v] = basis(n); const r = rho(f);
  for (const [k, d] of [u, v, u.clone().negate(), v.clone().negate()].entries()) {
    const o = it.p.clone().addScaledVector(n, 2).addScaledVector(d, r);
    const h = rayHit(it.seat, o, n.clone().negate(), 20);
    if (!h) { errs.push(`ray ${k}: no seat face under the head (floating)`); continue; }
    if (Math.abs(h.distance - 2) > 0.6) errs.push(`ray ${k}: seat face ${(2 - h.distance).toFixed(2)} mm from the head (${h.distance < 2 ? 'buried' : 'floating'})`);
    else if (Math.abs(h.normal.dot(n)) < COS6) errs.push(`ray ${k}: axis ${(Math.acos(Math.min(1, Math.abs(h.normal.dot(n)))) * 180 / Math.PI).toFixed(1)} deg off the seat-face normal`);
  }
  return errs;
}
const tag = (f: FSet, i: number) => `${f.id}#${i} @(${f.items[i].p.toArray().map((x) => x.toFixed(1)).join(',')})`;

describe('fastener hardware', () => {
  it('every set matches the catalogue count in fastenerSpec, and every spec has geometry', () => {
    expect(sets.map((f) => f.id).sort()).toEqual(FASTENER_SPECS.map((f) => f.id).sort());
    for (const f of sets) expect(f.items.length, f.id).toBe(FASTENER_SPECS.find((s) => s.id === f.id)!.count);
  });
  it('group assets carry one instance per fastener', () => {
    for (const f of sets) {
      const g = ASSET_BUILDERS[f.id](); let n = 0;
      g.traverse((o: any) => { if (o.isInstancedMesh) { expect(o.count, f.id).toBe(f.items.length); n++; } });
      expect(n, f.id).toBeGreaterThan(0);
    }
  });
  it('seat and thread parts exist; axes are unit vectors', () => {
    for (const f of sets) for (const it of f.items) {
      expect(PART_BY_ID[it.seat], `${f.id} seat ${it.seat}`).toBeDefined();
      expect(PART_BY_ID[it.into], `${f.id} into ${it.into}`).toBeDefined();
      expect(it.n.length()).toBeCloseTo(1, 6);
    }
  });
  it('every head / nut is seated flat: axis normal to the seat face, bearing face touching it (not floating, not buried)', () => {
    const bad: string[] = [];
    for (const f of sets) f.items.forEach((it, i) => seatErrors(f, it).forEach((e) => bad.push(`${tag(f, i)} on ${it.seat}: ${e}`)));
    expect(bad).toEqual([]);
  });
  it('every head / nut is on the accessible side: nothing of the seat part above it along its axis', () => {
    const bad: string[] = [];
    for (const f of sets) f.items.forEach((it, i) => {
      const h = rayHit(it.seat, it.p.clone().addScaledVector(it.n, 0.3), it.n, headHeight(f) + 3);
      if (h) bad.push(`${tag(f, i)}: ${it.seat} material ${h.distance.toFixed(1)} mm above the seat (head buried / wrong side)`);
    });
    expect(bad).toEqual([]);
  });
  it('every fastener reaches the part it threads into along -axis', () => {
    const bad: string[] = [];
    for (const f of sets) f.items.forEach((it, i) => {
      // thread engagement: probe along -axis on the axis and at the thread flank radius (tapped holes are modelled)
      const reach = Math.max(f.len, f.grip + f.embed, 10) + 1; const n = it.n.clone().normalize(); const [u, v] = basis(n);
      const hit = [new THREE.Vector3(), u, v, u.clone().negate(), v.clone().negate()].some((d) =>
        rayHit(it.into, it.p.clone().addScaledVector(n, 0.3).addScaledVector(d, f.M / 2 - 0.4), n.clone().negate(), reach));
      if (!hit) bad.push(`${tag(f, i)}: ${it.into} not within ${reach.toFixed(0)} mm`);
    });
    expect(bad).toEqual([]);
  });
  it('each set comes off in its spec step, together with (or one step before) the part it holds', () => {
    const leaves = (id: string) => {
      const own = stepIndexOf(id);
      const carrier = TEARDOWN.findIndex((s) => Object.values(s.carries ?? {}).some((l) => l.includes(id)));
      return carrier >= 0 ? carrier : own;
    };
    for (const spec of FASTENER_SPECS) {
      const f = sets.find((s) => s.id === spec.id)!;
      expect(TEARDOWN[stepIndexOf(spec.id)]?.id, spec.id).toBe(spec.step);
      const k = leaves(spec.id);
      const parts = new Set(f.items.flatMap((it) => [it.seat, it.into]).filter((p) => p !== 'crankcase-right'));
      const ok = [...parts].some((p) => { const j = leaves(p); return j === k || j === k + 1; });
      expect(ok, `${spec.id} (step ${k}) vs ${[...parts].join(',')}`).toBe(true);
    }
  });
});
