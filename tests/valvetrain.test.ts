import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  CAM, PEAK_R, LASH, FIRE_CRANK, ASSEMBLED_CRANK, trainPose, camshaft, camWebZ, lobeRadius,
} from '../src/geo/valvetrain';
import { CAM_X } from '../src/data/layout';
import { CH_Z0 } from '../src/geo/core';
import { rayHit } from './hw';

const PEAK_AT = { in: 450, ex: 270 } as const;

function worldVerts(obj: THREE.Object3D): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  obj.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  obj.traverse((o: any) => {
    if (!o.isMesh) return;
    const p = o.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); out.push(v.clone()); }
  });
  return out;
}

describe('top-end batch 1', () => {
  it('keeps every lobe peak under the journal so the cam can slide through the bore', () => {
    expect(PEAK_R).toBeLessThan(CAM.journalR - 0.5);
    expect(PEAK_R).toBeLessThan(CAM.boreR - 0.5);
    expect(lobeRadius(0)).toBeCloseTo(CAM.baseR + CAM.lift, 5);
    expect(lobeRadius(Math.PI)).toBeCloseTo(CAM.baseR, 5);
  });

  it('gives 0.10 mm lash on the base circle at firing TDC and opens the valve on the nose', () => {
    for (const cyl of [1, 2, 3, 4, 5, 6]) for (const side of [1, -1] as const) {
      const which = side > 0 ? 'in' : 'ex';
      const tag = `cyl ${cyl} ${which}`;
      const closed = trainPose(cyl, side, FIRE_CRANK[cyl]);
      expect(closed.lobeR, tag).toBeCloseTo(CAM.baseR, 2);
      expect(closed.lift, tag).toBeLessThan(0.05);
      expect(closed.gap, tag).toBeCloseTo(LASH, 2);
      const peak = trainPose(cyl, side, FIRE_CRANK[cyl] + PEAK_AT[which]);
      expect(peak.lobeR, tag).toBeCloseTo(PEAK_R, 2);
      expect(peak.lift, `${tag} lift`).toBeGreaterThan(4);
      expect(peak.gap, tag).toBeLessThan(0.02);
    }
  });

  it('phases the opposite bank so cylinder 4 is on overlap while cylinder 1 is closed', () => {
    expect(trainPose(1, 1, ASSEMBLED_CRANK).lift).toBeLessThan(0.05);
    expect(trainPose(1, -1, ASSEMBLED_CRANK).lift).toBeLessThan(0.05);
    expect(trainPose(4, 1, ASSEMBLED_CRANK).lift).toBeGreaterThan(1);
    expect(trainPose(4, -1, ASSEMBLED_CRANK).lift).toBeGreaterThan(1);
  });

  it('keeps cam mesh vertices inside the journal radius except the journals', () => {
    const bands = camWebZ(1).map((z) => [z - CAM.journalW / 2 - 1, z + CAM.journalW / 2 + 1] as const);
    const onJournal = (z: number) => bands.some(([a, b]) => z >= a && z <= b);
    let maxJournal = 0, maxOther = 0, nJournal = 0;
    for (const v of worldVerts(camshaft(1))) {
      const r = Math.hypot(v.x - CAM_X, v.y);
      if (onJournal(v.z)) { maxJournal = Math.max(maxJournal, r); nJournal++; }
      else maxOther = Math.max(maxOther, r);
    }
    expect(nJournal).toBeGreaterThan(80);
    expect(maxJournal).toBeGreaterThan(CAM.journalR - 0.15);
    expect(maxJournal).toBeLessThan(CAM.journalR + 0.4);
    expect(maxOther, 'lobe / shank / nose').toBeLessThan(CAM.journalR - 0.4);
  });

  it('line-bores the cam from the chain end and mirrors the left rocker stations', () => {
    const open = rayHit('cam-housing-right', new THREE.Vector3(CAM_X, 0, 400), new THREE.Vector3(0, 0, -1), 800);
    expect(open, 'bore plugged').not.toBeNull();
    expect(400 - open!.distance, 'first hit should be the flywheel-end cap').toBeLessThan(CH_Z0 + 20);
    const web = rayHit('cam-housing-right', new THREE.Vector3(CAM_X, CAM.boreR + 1.5, 400), new THREE.Vector3(0, 0, -1), 800);
    expect(web).not.toBeNull();
    expect(400 - web!.distance).toBeGreaterThan(CH_Z0 + 40);
    const right = trainPose(1, 1, 0).lay;
    const left = trainPose(6, 1, 0).lay;
    expect(left.P.x).toBeCloseTo(-right.P.x, 2);
    expect(left.P.y).toBeCloseTo(right.P.y, 2);
    expect(left.z).toBeCloseTo(-right.z, 2);
    const rightEx = trainPose(1, -1, 0).lay;
    const leftEx = trainPose(6, -1, 0).lay;
    expect(leftEx.P.x).toBeCloseTo(-rightEx.P.x, 2);
    expect(leftEx.z).toBeCloseTo(-rightEx.z, 2);
  });
});
