import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { basePath, chainPath, chainPins, tensionerLayout, ADJ } from '../src/geo/core';

describe.each([[1, 'right'], [-1, 'left']] as Array<[1 | -1, string]>)('chain tensioner, %s bank', (s) => {
  const B = basePath(s), P = chainPath(s), T = tensionerLayout(s), { pins } = chainPins(s);
  const inward = B.nLo.clone().negate();
  const dLine = (q: { x: number; y: number }) => new THREE.Vector2(q.x - B.lo1.x, q.y - B.lo1.y).dot(inward); // >0 = pushed into the loop
  it('idler sits under the slack (lower) run and is wrapped from outside the loop', () => {
    expect(P.idlerArc.circ.sg).toBe(-1); // chain passes over it (clockwise arc in a CCW loop)
    // its pitch circle reaches past the straight run into the loop: it pushes the chain, not just touches it
    expect(dLine(T.idler) + T.idlerR).toBeGreaterThan(10);
    // centre below the deflected chain
    expect(dLine(T.idler)).toBeLessThan(Math.max(...P.pts.filter((q) => Math.abs(q.x - T.idler.x) < T.idlerR && dLine(q) < 60).map(dLine)) - T.idlerR + 0.5);
    // and on the slack run, not the tight (upper) one
    const dUp = new THREE.Vector2(T.idler.x - B.up1.x, T.idler.y - B.up1.y).dot(B.nUp);
    expect(dUp).toBeLessThan(-40);
  });
  it('idler deflects the slack run >= 10 mm and the chain wraps it >= 25 deg', () => {
    // pitch line around the idler station vs the straight two-sprocket run
    const near = P.pts.filter((q) => Math.abs(q.x - T.idler.x) < T.idlerR && dLine(q) < 60);
    const defl = Math.max(...near.map(dLine));
    expect(defl).toBeGreaterThanOrEqual(10);
    expect((P.idlerWrap * 180) / Math.PI).toBeGreaterThanOrEqual(25);
  });
  it('chain rollers sit on the idler pitch circle (real engagement, not floating)', () => {
    const on = pins.filter((q) => Math.abs(Math.hypot(q.x - T.idler.x, q.y - T.idler.y) - T.idlerR) < 0.3);
    expect(on.length).toBeGreaterThanOrEqual(2);
    // and no roller cuts into the idler
    for (const q of pins) expect(Math.hypot(q.x - T.idler.x, q.y - T.idler.y)).toBeGreaterThan(T.idlerR - 0.3);
  });
  it('plunger dome bears on the arm tail pad (contact <= 0.5 mm), plunger extended', () => {
    expect(Math.abs(T.contact.distanceTo(T.tail) - ADJ.pad)).toBeLessThanOrEqual(0.5);
    expect(T.adjBase.distanceTo(T.contact)).toBeCloseTo(T.reach, 6);
    expect(T.plunger).toBeGreaterThan(2);
  });
});
