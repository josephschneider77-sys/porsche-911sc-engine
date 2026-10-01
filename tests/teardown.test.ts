import { describe, it, expect } from 'vitest';
import { TEARDOWN, validateTeardown, stepIndexOf, removedAfter, carriedAfter, BASE_PART } from '../src/data/teardown';
import { PARTS } from '../src/data/parts';

const before = (a: string, b: string) => expect(stepIndexOf(a), `${a} before ${b}`).toBeLessThan(stepIndexOf(b));

describe('teardown order', () => {
  it('removes every part exactly once, except the base case half', () => {
    expect(validateTeardown()).toEqual([]);
    expect(removedAfter(TEARDOWN.length).size).toBe(PARTS.length - 1);
    expect(stepIndexOf(BASE_PART)).toBe(-1);
  });
  it('follows the workshop sequence', () => {
    before('pressure-plate', 'flywheel');
    before('clutch-disc', 'flywheel');
    before('muffler', 'heat-exchanger-right');
    before('air-cleaner-lid', 'plenum');
    before('mixture-control-unit', 'plenum');
    before('fan-belt', 'fan-housing');
    before('fan-housing', 'upper-air-guide');
    before('valve-cover-upper-left', 'rockers-left');
    before('chain-housing-lid-right', 'cam-sprocket-right');
    before('chain-tensioner-right', 'cam-sprocket-right');
    before('cam-sprocket-right', 'camshaft-right');
    before('rockers-right', 'camshaft-right');
    before('camshaft-right', 'chain-housing-right');
    before('chain-housing-right', 'cam-housing-right');
    before('cam-housing-left', 'head-4');
    before('head-1', 'cylinder-1');
    before('cylinder-1', 'piston-1');
    before('piston-6', 'crankcase-left');
    before('crankcase-left', 'crankshaft');
    before('chain-housing-lid-right', 'timing-chain-right');
    before('cam-sprocket-left', 'crankcase-left');
    before('flywheel', 'crankshaft');
    before('crank-pulley', 'crankshaft');
    before('crankshaft', 'main-bearings');
  });
  it('has no empty steps and titles for each', () => {
    for (const s of TEARDOWN) { expect(s.parts.length, s.id).toBeGreaterThan(0); expect(s.title.length).toBeGreaterThan(3); }
  });
  it('heads (with valves) leave the engine with the cam housings, and stay off', () => {
    const k = stepIndexOf('cam-housing-right') + 1; // steps completed
    for (let n = k; n <= TEARDOWN.length; n++) for (let c = 1; c <= 6; c++) {
      const off = (id: string) => removedAfter(n).has(id) || carriedAfter(n).has(id);
      expect(off(`head-${c}`), `head-${c} after step ${n}`).toBe(true);
      expect(off(`valves-${c}`), `valves-${c} after step ${n}`).toBe(true);
    }
    expect(carriedAfter(k).get('head-1')).toBe('cam-housing-right');
    expect(carriedAfter(k).get('head-4')).toBe('cam-housing-left');
  });
  it('timing chains leave with the cam sprockets (no stiff loops left hanging)', () => {
    expect(stepIndexOf('timing-chain-right')).toBe(stepIndexOf('cam-sprocket-right'));
    expect(stepIndexOf('timing-chain-left')).toBe(stepIndexOf('cam-sprocket-left'));
  });
});
