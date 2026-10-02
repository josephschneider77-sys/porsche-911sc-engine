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
/**
 * Named camera. `cover-gasket` is teardown step 15 (covers off) framed on the right
 * timing-cover gasket, still seated on the chain-housing flange.
 */
export const VIEW_PRESETS: Record<string, { step: number } & CamPose> = {
  'cover-gasket': { step: 15, pos: [250, 40, 560], target: [250, -25, 270] },
};

export function viewFromQuery(name: string | null | undefined): ({ step: number } & CamPose) | null {
  if (!name) return null;
  return VIEW_PRESETS[name] ?? null;
}

export function cameraFromQuery(query: { cam?: string | null; target?: string | null }, stepPose: CamPose): CamPose {
  const cam = parseVec3(query.cam);
  if (!cam) return stepPose;
  const target = parseVec3(query.target) ?? stepPose.target;
  return { pos: cam, target };
}
