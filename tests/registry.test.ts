import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { PARTS, PART_BY_ID } from '../src/data/parts';
import { ILLUSTRATIONS, SYSTEMS } from '../src/data/catalog';
import { ASSET_BUILDERS } from '../src/geo/assets';

describe('part registry', () => {
  it('has unique ids', () => {
    expect(new Set(PARTS.map((p) => p.id)).size).toBe(PARTS.length);
  });
  it('covers the major engine systems', () => {
    const systems = new Set(PARTS.map((p) => p.system));
    for (const k of Object.keys(SYSTEMS)) expect(systems.has(k as any), k).toBe(true);
  });
  it('has six of every per-cylinder part', () => {
    for (const pre of ['piston', 'conrod', 'cylinder', 'head', 'valves', 'spark-plug', 'spark-plug-connector', 'intake-runner', 'injector']) {
      expect(PARTS.filter((p) => new RegExp(`^${pre}-\\d$`).test(p.id)).length, pre).toBe(6);
    }
  });
  it('every part references a catalogue illustration with a Porsche-format part number', () => {
    const pn = /^((\d{3}|PCG|N) ?[\dx ]{3,}|—)/;
    for (const p of PARTS) {
      expect(p.catalog.length, p.id).toBeGreaterThan(0);
      for (const c of p.catalog) {
        expect(ILLUSTRATIONS[c.ill], `${p.id} ill ${c.ill}`).toBeDefined();
        expect(c.pn, `${p.id} pn`).toMatch(pn);
      }
    }
  });
  it('every part has a description and a buildable, exported asset', () => {
    for (const p of PARTS) {
      expect(p.description.length, p.id).toBeGreaterThan(20);
      expect(ASSET_BUILDERS[p.asset], p.asset).toBeTypeOf('function');
      expect(existsSync(`public/parts/${p.asset}.glb`), `${p.asset}.glb`).toBe(true);
    }
  });
  it('places cylinders 1-3 on the right bank (+X) and 4-6 on the left (-X)', () => {
    for (const c of [1, 2, 3]) expect(PART_BY_ID[`cylinder-${c}`].position![0]).toBeGreaterThan(0);
    for (const c of [4, 5, 6]) expect(PART_BY_ID[`cylinder-${c}`].position![0]).toBeLessThan(0);
  });
  it('orders cylinders 1-3 / 4-6 from the pulley end toward the flywheel', () => {
    const z = (c: number) => PART_BY_ID[`cylinder-${c}`].position![2];
    expect(z(1)).toBeGreaterThan(z(2)); expect(z(2)).toBeGreaterThan(z(3));
    expect(z(4)).toBeGreaterThan(z(5)); expect(z(5)).toBeGreaterThan(z(6));
  });
});
