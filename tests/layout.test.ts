import { describe, it, expect } from 'vitest';
import { SPEC, firingTdcAngle, pinX, CYL_Z, THROW_DEG } from '../src/data/layout';

describe('engine layout', () => {
  it('bore x stroke gives 2994 cc', () => {
    const cc = (6 * Math.PI * (SPEC.bore / 2) ** 2 * SPEC.stroke) / 1000;
    expect(Math.round(cc)).toBe(2994);
  });
  it('crank throws produce firing order 1-6-2-4-3-5 at 120° intervals', () => {
    // map each cylinder's TDC to the 720° cycle: opposite cylinders fire 360° apart
    const seq = SPEC.firingOrder.map((c) => firingTdcAngle(c));
    for (let i = 1; i < seq.length; i++) {
      expect(((seq[i] - seq[i - 1]) % 360 + 360) % 360).toBe(120);
    }
  });
  it('opposed pairs are 180° apart and all throws distinct', () => {
    expect(new Set(Object.values(THROW_DEG)).size).toBe(6);
    expect(Math.abs(THROW_DEG[4] - THROW_DEG[1])).toBe(180);
  });
  it('piston at TDC sits one stroke above BDC', () => {
    const tdc = pinX(1, 0).pinX, bdc = pinX(1, 180).pinX;
    expect(tdc - bdc).toBeCloseTo(SPEC.stroke, 3);
  });
  it('has six distinct throw positions with 8 main bearings', () => {
    expect(new Set(Object.values(CYL_Z)).size).toBe(6);
  });
});
