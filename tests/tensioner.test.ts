import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CAM_X, INT_SHAFT_Y } from '../src/data/layout';
import {
  basePath, chainPath, chainPins, tensionerLayout, ADJ, CAM_NOSE, CAM_SPROCKET_R, INT_SPROCKET_R,
  SPROCKET_HOLES, FLANGE_NOTCHES, VERNIER, CHAIN_Z, guideRails, railInner,
} from '../src/geo/core';
import { rayHit } from './hw';

describe.each([[1, 'right'], [-1, 'left']] as Array<[1 | -1, string]>)('chain tensioner, %s bank', (s, b) => {
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
  it('chain rollers sit on the cam and intermediate pitch circles', () => {
    const onCam = pins.filter((q) => Math.abs(Math.hypot(q.x - CAM_X * s, q.y) - CAM_SPROCKET_R) < 0.35);
    const onInt = pins.filter((q) => Math.abs(Math.hypot(q.x, q.y - INT_SHAFT_Y) - INT_SPROCKET_R) < 0.35);
    expect(onCam.length).toBeGreaterThanOrEqual(4);
    expect(onInt.length).toBeGreaterThanOrEqual(3);
    for (const q of pins) {
      expect(Math.hypot(q.x - CAM_X * s, q.y)).toBeGreaterThan(CAM_SPROCKET_R - 0.35);
      expect(Math.hypot(q.x, q.y - INT_SHAFT_Y)).toBeGreaterThan(INT_SPROCKET_R - 0.35);
    }
  });
  it('cam sprocket has 17 open vernier holes and a land between them', () => {
    const X = CAM_X * s, z = CHAIN_Z[s] + 30;
    const at = (a: number, rad: number) => new THREE.Vector3(X + rad * Math.cos(a) * s, rad * Math.sin(a), z);
    const down = new THREE.Vector3(0, 0, -1);
    for (let i = 0; i < SPROCKET_HOLES; i++) {
      const a = CAM_NOSE.pin.a + (i * 2 * Math.PI) / SPROCKET_HOLES;
      expect(rayHit(`cam-sprocket-${b}`, at(a, CAM_NOSE.pin.rad), down, 60), `hole ${i}`).toBeNull();
    }
    const mid = CAM_NOSE.pin.a + Math.PI / SPROCKET_HOLES;
    expect(rayHit(`cam-sprocket-${b}`, at(mid, CAM_NOSE.pin.rad), down, 60)).not.toBeNull();
  });
  it('flange rim is scalloped: open at the dowel, solid halfway to the next notch', () => {
    const X = CAM_X * s, z = CHAIN_Z[s] + 30;
    const down = new THREE.Vector3(0, 0, -1);
    const notchR = CAM_NOSE.pin.rad - VERNIER.notchR * 0.45;
    const open = new THREE.Vector3(X + notchR * Math.cos(CAM_NOSE.pin.a) * s, notchR * Math.sin(CAM_NOSE.pin.a), z);
    expect(rayHit(`cam-flange-${b}`, open, down, 60)).toBeNull();
    const landA = CAM_NOSE.pin.a + Math.PI / FLANGE_NOTCHES;
    const land = new THREE.Vector3(X + (CAM_NOSE.pin.rad - 0.6) * Math.cos(landA) * s, (CAM_NOSE.pin.rad - 0.6) * Math.sin(landA), z);
    expect(rayHit(`cam-flange-${b}`, land, down, 60)).not.toBeNull();
  });
  it('guide-rail shoes sit against the chain run', () => {
    for (const r of guideRails(s)) {
      const f = (r.f0 + r.f1) / 2;
      const q = r.a.clone().lerp(r.b, f);
      const hit = rayHit(`chain-tensioner-${b}`, new THREE.Vector3(q.x, q.y, CHAIN_Z[s]), new THREE.Vector3(r.n.x, r.n.y, 0), 20);
      expect(hit, `rail at x ${q.x.toFixed(0)}`).toBeTruthy();
      expect(Math.abs(hit!.distance - railInner(0.5))).toBeLessThan(0.6);
    }
  });
});
