import { describe, it, expect } from 'vitest';
import { cameraFromQuery, viewFromQuery, type CamPose } from '../src/app/queryCamera';

describe('URL camera vs teardown step framing', () => {
  // Step 27 is "Pistons" (1-based). Its default framing is the home pose of whatever is left on the stand.
  const step27: CamPose = { pos: [480, 320, 700], target: [0, 40, 40] };

  it('?cam= and ?target= win over step 27 framing', () => {
    expect(cameraFromQuery({ cam: '180,140,-760', target: '0,0,-60' }, step27))
      .toEqual({ pos: [180, 140, -760], target: [0, 0, -60] });
  });

  it('a finite cam wins at every step, and keeps the step target when ?target= is absent', () => {
    const step0: CamPose = { pos: [10, 20, 30], target: [1, 2, 3] };
    expect(cameraFromQuery({ cam: '560,40,30' }, step0)).toEqual({ pos: [560, 40, 30], target: [1, 2, 3] });
    expect(cameraFromQuery({ cam: '0,-1050,80', target: '0,0,40' }, step27))
      .toEqual({ pos: [0, -1050, 80], target: [0, 0, 40] });
  });

  it('cover-gasket is step 15, framed on the right flange', () => {
    const v = viewFromQuery('cover-gasket');
    expect(v?.step).toBe(15);
    expect(v?.pos.every((n) => Number.isFinite(n))).toBe(true);
    expect(v?.target.every((n) => Number.isFinite(n))).toBe(true);
    expect(viewFromQuery(null)).toBeNull();
    expect(viewFromQuery('missing')).toBeNull();
  });

  it('keeps the step pose when cam is missing or not three finite numbers', () => {
    expect(cameraFromQuery({}, step27)).toBe(step27);
    expect(cameraFromQuery({ cam: '1,2', target: '0,0,0' }, step27)).toBe(step27);
    expect(cameraFromQuery({ cam: '1,2,nope', target: '9,9,9' }, step27)).toBe(step27);
  });
});
