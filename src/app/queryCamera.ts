/** Engine-frame camera pose, millimetres. */
export interface CamPose { pos: [number, number, number]; target: [number, number, number] }

export function parseVec3(raw: string | null | undefined): [number, number, number] | null {
  if (raw == null || raw.trim() === '') return null;
  const n = raw.split(',').map(Number);
  if (n.length !== 3 || n.some((v) => !Number.isFinite(v))) return null;
  return [n[0], n[1], n[2]];
}

/**
 * Deep-link camera. A finite `?cam=` (and `?target=` when it is also finite) wins over
 * whatever pose the teardown step, explode slider or part focus would have framed.
 * An absent or invalid cam leaves the step pose untouched.
 */
export function cameraFromQuery(query: { cam?: string | null; target?: string | null }, stepPose: CamPose): CamPose {
  const cam = parseVec3(query.cam);
  if (!cam) return stepPose;
  const target = parseVec3(query.target) ?? stepPose.target;
  return { pos: cam, target };
}
