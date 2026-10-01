import { describe, it, expect } from 'vitest';
import { evaluate } from '../scripts/checklistEval';
import { SMALL_SPECS } from '../src/data/smallSpec';
import { SMALL_GEOM } from '../src/geo/smallParts';
import { stepIndexOf } from '../src/data/teardown';

const R = evaluate();

describe('parts checklist (docs/parts-checklist.md)', () => {
  it('every claim and N/A line references a catalogue line, quantities add up, nothing is double-counted', () => {
    expect(R.errors).toEqual([]);
  });
  it('every non-excluded catalogue line is modelled, N/A with a reason, an alternative row, or explicitly listed as still missing', () => {
    for (const r of R.rows) {
      const s = R.status.get(r.key)!;
      if (s.kind === 'missing') expect(s.listed, `${r.key} ${r.desc} is unaccounted for`).toBe(true);
      if (s.kind === 'na') expect(s.why.length, r.key).toBeGreaterThan(8);
      if (r.qty === '*') expect(['na', 'auto', 'alt'], `${r.key} qty * cannot be counted`).toContain(s.kind);
    }
  });
  it('covers at least 99% of the countable lines', () => {
    const v = [...R.status.values()];
    const missing = v.filter((s) => s.kind === 'missing').length, counted = v.filter((s) => s.kind !== 'auto').length;
    expect(missing / counted).toBeLessThan(0.01);
  });
});

describe('small parts', () => {
  it('every small-part spec has geometry with exactly its catalogue count', () => {
    for (const s of SMALL_SPECS) { expect(SMALL_GEOM[s.id], s.id).toBeDefined(); expect(SMALL_GEOM[s.id].items().length, s.id).toBe(s.count); }
  });
  it('keys come out only after what they locate: nut, then sprocket, then key', () => {
    for (const b of ['left', 'right']) {
      expect(stepIndexOf(`cam-nut-${b}`), b).toBeLessThan(stepIndexOf(`cam-sprocket-${b}`));
      expect(stepIndexOf(`cam-sprocket-${b}`), b).toBeLessThanOrEqual(stepIndexOf(`cam-flange-${b}`));
      expect(stepIndexOf(`cam-flange-${b}`), b).toBeLessThanOrEqual(stepIndexOf(`cam-key-${b}`));
      expect(stepIndexOf(`cam-key-${b}`), b).toBeLessThanOrEqual(stepIndexOf(`camshaft-${b}`));
    }
    expect(stepIndexOf('crank-circlip')).toBeLessThan(stepIndexOf('crank-key'));
    expect(stepIndexOf('crank-gear-ring')).toBeLessThan(stepIndexOf('crank-key'));
    for (const id of ['ishaft-bearings', 'ishaft-thrust', 'ishaft-circlips', 'ishaft-stopper']) expect(stepIndexOf(id), id).toBe(stepIndexOf('intermediate-shaft'));
  });
});
