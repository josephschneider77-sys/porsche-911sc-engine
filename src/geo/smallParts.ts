/**
 * Small parts (keys, pins, washers, shims, gaskets, O-rings, circlips, plugs, senders, clamps, fittings) as instanced
 * hardware sets. Prototypes are built with +Y as the "out of the seat" axis and the origin on the seat; `items`
 * gives one world matrix per piece. Counts/steps/claims live in data/smallSpec.ts; tests/smallParts check both agree.
 */
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { Part, lathe, closedLathe, cyl, torus, box, boxMM, hexNut, tube, extrudeC, roundRect, circlePath, polyShape, woodruffGeom, spring, yToZ, cylBetween, csgSub, mesh, type V3 } from './util';
import { manifoldAdd, manifoldSub } from './manifoldCut';
import { frame } from './instancing';
import { fastenerSets } from './fasteners';
import { partPose, seat, probe } from './probe';
import { vcStuds, valveCover, chainCoverBolts, CAM_NOSE, CAM_WEB, CAM_COVER, CAM_COVER_BODY, camCoverAngles, camCoverBolt, camCoverSeatZ, camNoseStack, holedPlate, CHAIN_Z, CRANK_NOSE, HOUSING_Z0, HOUSING_Z1, CHAIN_LID, CHAIN_BOX_INNER_X, chainOutline, chainCaseFace, coverMatrix, tensionerLayout, CH_Z0, CH_Z1 } from './core';
import { CAM_X, CYL_Z, DECK_X, CYL_TOP_X, HEAD_OUT_X, INT_SHAFT_Y, INJ, CASE_Z, MAIN_Z, bankOf, SPARK_HOLE_R, SPARK_TUBE_R } from '../data/layout';
import { LIP_Z } from './stations';
import { plugCoverLocal, railJogs, camHousing, pocketValveCover, valveSet, rockers } from './valvetrain';
import { paintSealRing } from './sealRing';
import { FLY_Z, EXH_PORT, THERMO, DIST_AXIS, distW, WUR, AIRBOX, SUMP, OIL_PUMP, OIL_COOLER, FAN, SHROUD, airCleanerLayout, airboxSnoutSamples, SNOUT_R, sparkPlug, sparkPlugConnector } from './aux';
import { VARIANT } from '../data/variant';
import { PARTS } from '../data/parts';
import { catalyticConverterPart, registerAncillarySmall } from './bottomAnc';
import { bootFrames, clampFrames, SLEEVE, banjoProto, injectorBanjoMatrices, sealRingFrames, csvPoseMatrix, csvPortLocalGeometry, wurLinesPart, LINE_CLIP, BOX, aavMatrix, auxAirPlumbingPart, vacuumHosesPart, vacuumCluster, ADD_AIR_VAC, VAC_T, VAC_LIMIT, TEE_AIR_INJ, afmScrewMatrices, throttleHousingPart, airGuidePart, airGuideClampMatrices } from './induction';

function hull2(pts: [number, number][]): [number, number][] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const pt of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop();
    lower.push(pt);
  }
  const upper: [number, number][] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const pt = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop();
    upper.push(pt);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}
function ringArea(pts: [number, number][]) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a;
}
function rectPts(w: number, h: number, r: number, n = 6): [number, number][] {
  const hw = w / 2, hh = h / 2, pts: [number, number][] = [];
  const corners: [number, number, number][] = [[hw - r, hh - r, 0], [-hw + r, hh - r, Math.PI / 2], [-hw + r, -hh + r, Math.PI], [hw - r, -hh + r, Math.PI * 1.5]];
  for (const [cx, cy, a0] of corners) for (let i = 0; i < n; i++) {
    const a = a0 + (Math.PI / 2) * (i / n);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}
function earPts(cx: number, cy: number, r: number, n = 14): [number, number][] {
  const o: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return o;
}
/**
 * One hole around two overlapping circles. Winding is clockwise, opposite the
 * gasket outline, so THREE.Shape treats it as a hole.
 */
function unionCircles(
  a: { x: number; y: number; r: number },
  b: { x: number; y: number; r: number },
): THREE.Path {
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1;
  const base = Math.atan2(dy, dx);
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  const alpha = Math.acos(clamp((a.r * a.r + d * d - b.r * b.r) / (2 * a.r * d)));
  const beta = Math.acos(clamp((b.r * b.r + d * d - a.r * a.r) / (2 * b.r * d)));
  const pts: THREE.Vector2[] = [];
  const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n: number) => {
    let sweep = a1 - a0;
    while (sweep <= 0) sweep += Math.PI * 2;
    for (let i = 0; i <= n; i++) {
      const t = a0 + sweep * (i / n);
      pts.push(new THREE.Vector2(cx + Math.cos(t) * r, cy + Math.sin(t) * r));
    }
  };
  arc(a.x, a.y, a.r, base + alpha, base - alpha + Math.PI * 2, 12);
  const bBase = base + Math.PI;
  arc(b.x, b.y, b.r, bBase + beta, bBase - beta + Math.PI * 2, 16);
  pts.reverse();
  return new THREE.Path(pts);
}
function rectHole(cx: number, cy: number, w: number, h: number, r: number) {
  const pts = roundRect(w, h, r, cx, cy).getPoints(6);
  pts.reverse();
  return new THREE.Path(pts);
}
function clipHalfPlane(pts: THREE.Vector2[], inside: (p: THREE.Vector2) => boolean, at: (a: THREE.Vector2, b: THREE.Vector2) => number) {
  if (pts.length < 3) return pts;
  const out: THREE.Vector2[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const ina = inside(a), inb = inside(b);
    if (ina && inb) out.push(b.clone());
    else if (ina !== inb) {
      const t = at(a, b);
      const hit = a.clone().lerp(b, Math.min(1, Math.max(0, t)));
      out.push(hit);
      if (inb) out.push(b.clone());
    }
  }
  return out;
}
/** Keep a hole polygon inside the cover frame so it cannot run past the rail. */
function clipWindow(pts: THREE.Vector2[], x0: number, y0: number, x1: number, y1: number) {
  const div = (n: number) => (Math.abs(n) < 1e-9 ? 1e-9 : n);
  let p = pts;
  p = clipHalfPlane(p, (q) => q.x >= x0, (a, b) => (x0 - a.x) / div(b.x - a.x));
  p = clipHalfPlane(p, (q) => q.x <= x1, (a, b) => (x1 - a.x) / div(b.x - a.x));
  p = clipHalfPlane(p, (q) => q.y >= y0, (a, b) => (y0 - a.y) / div(b.y - a.y));
  p = clipHalfPlane(p, (q) => q.y <= y1, (a, b) => (y1 - a.y) / div(b.y - a.y));
  return p;
}
/**
 * Cover-local image of an engine-space mirror about z = 0.
 * Local y is engine z minus the cover origin, and that origin is
 * (CH_Z0 + CH_Z1) / 2, not 0, so negating local y alone misses the left bank.
 */
function mirrorLocal(x: number, y: number): [number, number] {
  const z0 = (CH_Z0 + CH_Z1) / 2;
  return [-x, -y - 2 * z0];
}
/**
 * Lower-right windows: three upright slots (the arm crossings) and the three
 * diagonal webs that sit between them. The left bank is this set mirrored
 * about engine z = 0, then clipped inside the cover.
 */
function rightLowerWindows(): { diagonals: THREE.Vector2[][]; slots: THREE.Vector2[][] } {
  const slots: { x0: number; x1: number; y0: number; y1: number }[] = [];
  for (const j of railJogs(1, false)) {
    const head = j.sign * (j.reach - 1);
    const cam = -j.sign * 24;
    slots.push({
      x0: Math.min(head, cam), x1: Math.max(head, cam),
      y0: j.y0 - 3, y1: j.y1 + 3,
    });
  }
  const diagonals: THREE.Vector2[][] = [];
  const slotsOut: THREE.Vector2[][] = [];
  const ang = 0.72;
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const nx = -dy, ny = dx;
  const along = 36, across = 24;
  for (let k = -3; k <= 2; k++) {
    const cy = (k + 0.5) * 58;
    if (slots.some((h) => Math.abs((h.y0 + h.y1) / 2 - cy) < 36)) continue;
    const corners: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    diagonals.push(corners.reverse().map(([sx, sy]) => new THREE.Vector2(
      dx * sx * along / 2 + nx * sy * across / 2,
      cy + dy * sx * along / 2 + ny * sy * across / 2,
    )));
  }
  for (const h of slots) {
    slotsOut.push([
      new THREE.Vector2(h.x0, h.y0), new THREE.Vector2(h.x0, h.y1),
      new THREE.Vector2(h.x1, h.y1), new THREE.Vector2(h.x1, h.y0),
    ]);
  }
  return { diagonals, slots: slotsOut };
}
/** Left diagonal at the mirrored centre, leaned with this bank's ribs (angle flips). */
function leanedDiagonal(cx: number, cy: number, ang: number): THREE.Vector2[] {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const nx = -dy, ny = dx;
  const along = 36, across = 24;
  const corners: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  return corners.reverse().map(([sx, sy]) => new THREE.Vector2(
    cx + dx * sx * along / 2 + nx * sy * across / 2,
    cy + dy * sx * along / 2 + ny * sy * across / 2,
  ));
}
/**
 * Upper windows for one bank. The left plug that is past the rail is pulled
 * onto the end so the third window stays on the sheet, the same three sizes
 * as the right (the cover is not centred on z = 0, so a pure mirror misses
 * the left valves).
 */
function bankUpperWindows(s: 1 | -1, halfL: number): { cx: number; cy: number; w: number; h: number }[] {
  const cyls = s > 0 ? [1, 2, 3] : [4, 5, 6];
  const ys = cyls
    .map((c) => plugCoverLocal(c, 0).y)
    .filter((y) => Math.abs(y) < halfL - SPARK_HOLE_R - 4)
    .sort((a, b) => a - b);
  const yLo = -halfL + 16;
  let yHi = halfL - 16;
  const endLoc = plugCoverLocal(s > 0 ? 1 : 6, 0);
  const inboard = halfL - Math.abs(endLoc.y);
  const tubeClear = SPARK_TUBE_R + 4.2;
  if (inboard > -tubeClear && inboard < halfL) {
    const depth = Math.max(tubeClear, inboard + tubeClear);
    yHi = halfL - depth - 8;
  }
  const bands = [yLo, ...ys.flatMap((y) => [y - 18, y + 18]), yHi];
  const out: { cx: number; cy: number; w: number; h: number }[] = [];
  for (let i = 0; i < bands.length; i += 2) {
    const a = bands[i], b = bands[i + 1];
    if (b - a > 8) out.push({ cx: 0, cy: (a + b) / 2, w: 52, h: b - a });
  }
  return out;
}
/** Half-round end notch at the plug that leaves the rail. Same bite on both banks. */
function plugEndNotch(s: 1 | -1, halfL: number): THREE.BufferGeometry | null {
  const endCyl = s > 0 ? 1 : 6;
  const endLoc = plugCoverLocal(endCyl, 0);
  const tubeClear = SPARK_TUBE_R + 4.2;
  const end = Math.sign(endLoc.y) || 1;
  const inboard = halfL - Math.abs(endLoc.y);
  // On the rail, match the cover scallop (inboard + tube clearance). Past the
  // rail, still bite the end wall at that plug's x so the left bank is notched.
  const depth = inboard > -tubeClear && inboard < halfL
    ? Math.max(tubeClear, inboard + tubeClear)
    : tubeClear + 8;
  const yTip = end * (halfL + 8);
  const yIn = end * (halfL - depth);
  return boxMM(
    [endLoc.x - tubeClear, Math.min(yIn, yTip), -4],
    [endLoc.x + tubeClear, Math.max(yIn, yTip), 4],
  );
}
/**
 * Closed sheet on the cover's real sealing flange. The outline is the lip and
 * the boss pads where the cam housing actually meets them, not the bounding box
 * of those pads and not the convex hull that bulged out between the studs.
 * Three windows sit where that flange can frame them. A gap in a frame is filled
 * only when it is under 25 mm², so the hole stays enclosed and still counts as clamped.
 */
const FLANGE_STEP = 0.5;
// Cell centres sit on multiples of 0.5 mm, so a 0.5 mm clamp sample lands in the cell, not on its edge.
const FLANGE_X0 = -52.25, FLANGE_X1 = 52.25, FLANGE_Y0 = -190.25, FLANGE_Y1 = 190.25;
const gasketCache = new Map<string, THREE.BufferGeometry>();
const bvhCache = new Map<string, MeshBVH>();

function bakeWorld(root: THREE.Object3D): MeshBVH {
  root.updateMatrixWorld(true);
  const pos: number[] = [];
  const v = new THREE.Vector3();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld);
      pos.push(v.x, v.y, v.z);
    }
  });
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return new MeshBVH(geom);
}
function rayHits(bvh: MeshBVH, origin: THREE.Vector3, dir: THREE.Vector3, max: number) {
  const h = bvh.raycastFirst(new THREE.Ray(origin, dir), THREE.DoubleSide) as { distance: number } | null;
  return !!(h && h.distance <= max && h.distance > 0.05);
}
function flangeCells(s: 1 | -1, up: boolean) {
  const cid = `cover:${s}:${up ? 1 : 0}`;
  const hid = `house:${s}`;
  const frame = coverMatrix(s, up);
  const normal = new THREE.Vector3().setFromMatrixColumn(frame, 2).normalize();
  const neg = normal.clone().negate();
  let cover = bvhCache.get(cid);
  if (!cover) { cover = bakeWorld(pocketValveCover(valveCover(s, up), s, up)); bvhCache.set(cid, cover); }
  let house = bvhCache.get(hid);
  if (!house) { house = bakeWorld(camHousing(s)); bvhCache.set(hid, house); }
  const nx = Math.round((FLANGE_X1 - FLANGE_X0) / FLANGE_STEP);
  const ny = Math.round((FLANGE_Y1 - FLANGE_Y0) / FLANGE_STEP);
  const mask = new Uint8Array(nx * ny);
  const world = new THREE.Vector3();
  for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
    const x = FLANGE_X0 + (ix + 0.5) * FLANGE_STEP;
    const y = FLANGE_Y0 + (iy + 0.5) * FLANGE_STEP;
    world.set(x, y, -0.25).applyMatrix4(frame);
    const cp = rayHits(cover, world, normal, 40);
    const cm = rayHits(cover, world, neg, 40);
    const hp = rayHits(house, world, normal, 40);
    const hm = rayHits(house, world, neg, 40);
    if ((cp && hm) || (cm && hp)) mask[iy * nx + ix] = 1;
  }
  return { mask, nx, ny };
}
function clearRect(mask: Uint8Array, nx: number, ny: number, x0: number, y0: number, x1: number, y1: number) {
  const loX = Math.min(x0, x1), hiX = Math.max(x0, x1);
  const loY = Math.min(y0, y1), hiY = Math.max(y0, y1);
  const ix0 = Math.max(0, Math.floor((loX - FLANGE_X0) / FLANGE_STEP));
  const ix1 = Math.min(nx, Math.ceil((hiX - FLANGE_X0) / FLANGE_STEP));
  const iy0 = Math.max(0, Math.floor((loY - FLANGE_Y0) / FLANGE_STEP));
  const iy1 = Math.min(ny, Math.ceil((hiY - FLANGE_Y0) / FLANGE_STEP));
  for (let iy = iy0; iy < iy1; iy++) {
    const y = FLANGE_Y0 + (iy + 0.5) * FLANGE_STEP;
    if (y < loY || y > hiY) continue;
    for (let ix = ix0; ix < ix1; ix++) {
      const x = FLANGE_X0 + (ix + 0.5) * FLANGE_STEP;
      if (x >= loX && x <= hiX) mask[iy * nx + ix] = 0;
    }
  }
}
function clearCircle(mask: Uint8Array, nx: number, ny: number, cx: number, cy: number, r: number) {
  const r2 = r * r;
  const ix0 = Math.max(0, Math.floor((cx - r - FLANGE_X0) / FLANGE_STEP));
  const ix1 = Math.min(nx, Math.ceil((cx + r - FLANGE_X0) / FLANGE_STEP));
  const iy0 = Math.max(0, Math.floor((cy - r - FLANGE_Y0) / FLANGE_STEP));
  const iy1 = Math.min(ny, Math.ceil((cy + r - FLANGE_Y0) / FLANGE_STEP));
  for (let iy = iy0; iy < iy1; iy++) {
    const y = FLANGE_Y0 + (iy + 0.5) * FLANGE_STEP;
    for (let ix = ix0; ix < ix1; ix++) {
      const x = FLANGE_X0 + (ix + 0.5) * FLANGE_STEP;
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r2) mask[iy * nx + ix] = 0;
    }
  }
}
/** Largest connected gap in the frame around a window, mm². Infinity if the rect leaves the grid. */
function frameGap(mask: Uint8Array, nx: number, ny: number, x0: number, y0: number, x1: number, y1: number, margin: number) {
  const ix0 = Math.floor((x0 - margin - FLANGE_X0) / FLANGE_STEP);
  const ix1 = Math.ceil((x1 + margin - FLANGE_X0) / FLANGE_STEP);
  const iy0 = Math.floor((y0 - margin - FLANGE_Y0) / FLANGE_STEP);
  const iy1 = Math.ceil((y1 + margin - FLANGE_Y0) / FLANGE_STEP);
  const inx0 = Math.floor((x0 - FLANGE_X0) / FLANGE_STEP);
  const inx1 = Math.ceil((x1 - FLANGE_X0) / FLANGE_STEP);
  const iny0 = Math.floor((y0 - FLANGE_Y0) / FLANGE_STEP);
  const iny1 = Math.ceil((y1 - FLANGE_Y0) / FLANGE_STEP);
  if (ix0 < 1 || iy0 < 1 || ix1 >= nx - 1 || iy1 >= ny - 1) return Infinity;
  const miss: number[] = [];
  const id = new Map<number, number>();
  for (let iy = iy0; iy < iy1; iy++) for (let ix = ix0; ix < ix1; ix++) {
    if (ix >= inx0 && ix < inx1 && iy >= iny0 && iy < iny1) continue;
    if (!mask[iy * nx + ix]) {
      const k = iy * nx + ix;
      id.set(k, miss.length);
      miss.push(k);
    }
  }
  if (!miss.length) return 0;
  const seen = new Uint8Array(miss.length);
  let biggest = 0;
  const stack: number[] = [];
  for (let i = 0; i < miss.length; i++) {
    if (seen[i]) continue;
    seen[i] = 1;
    stack.push(miss[i]);
    let n = 0;
    while (stack.length) {
      const k = stack.pop()!;
      n++;
      const ix = k % nx, iy = (k - ix) / nx;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const j = (iy + dy) * nx + (ix + dx);
        const m = id.get(j);
        if (m === undefined || seen[m]) continue;
        seen[m] = 1;
        stack.push(j);
      }
    }
    biggest = Math.max(biggest, n);
  }
  return biggest * FLANGE_STEP * FLANGE_STEP;
}
function punchWindow(mask: Uint8Array, nx: number, ny: number, cx: number, cy: number, w: number, h: number, margin: number, blocked?: Uint8Array) {
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
  const ix0 = Math.floor((x0 - margin - FLANGE_X0) / FLANGE_STEP);
  const ix1 = Math.ceil((x1 + margin - FLANGE_X0) / FLANGE_STEP);
  const iy0 = Math.floor((y0 - margin - FLANGE_Y0) / FLANGE_STEP);
  const iy1 = Math.ceil((y1 + margin - FLANGE_Y0) / FLANGE_STEP);
  const inx0 = Math.floor((x0 - FLANGE_X0) / FLANGE_STEP);
  const inx1 = Math.ceil((x1 - FLANGE_X0) / FLANGE_STEP);
  const iny0 = Math.floor((y0 - FLANGE_Y0) / FLANGE_STEP);
  const iny1 = Math.ceil((y1 - FLANGE_Y0) / FLANGE_STEP);
  for (let iy = iy0; iy < iy1; iy++) for (let ix = ix0; ix < ix1; ix++) {
    const i = iy * nx + ix;
    if (ix >= inx0 && ix < inx1 && iy >= iny0 && iy < iny1) mask[i] = 0;
    else if (!mask[i] && !blocked?.[i]) mask[i] = 1;
  }
}
function slotBands(s: 1 | -1): [number, number][] {
  return rightLowerWindows().slots.map((poly) => {
    let y0 = Infinity, y1 = -Infinity;
    for (const p of poly) {
      const y = s > 0 ? p.y : mirrorLocal(p.x, p.y)[1];
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    return [y0 - 6, y1 + 6] as [number, number];
  }).sort((a, b) => a[0] - b[0]);
}
/** Three y-bands clear of the rocker slots, each tall enough for one window. */
function windowBands(s: 1 | -1, up: boolean, holeH: number): [number, number][] {
  if (up) return [[-145, -55], [-35, 55], [65, 145]];
  const blocked = slotBands(s);
  const gaps: [number, number][] = [];
  let cursor = -175;
  for (const [a, b] of blocked) {
    if (a - cursor >= holeH + 4) gaps.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (175 - cursor >= holeH + 4) gaps.push([cursor, 175]);
  gaps.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]));
  return gaps.slice(0, 3).sort((a, b) => a[0] - b[0]);
}
function simplifyLoop(loop: [number, number][]) {
  const out: [number, number][] = [];
  const n = loop.length;
  for (let i = 0; i < n; i++) {
    const a = loop[(i + n - 1) % n], b = loop[i], c = loop[(i + 1) % n];
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (cross !== 0) out.push(b);
  }
  return out;
}
function pointInLoop(x: number, y: number, loop: [number, number][]) {
  let c = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [xi, yi] = loop[i], [xj, yj] = loop[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
/** Boundary loops of a mask. Outer rings are counter-clockwise, holes clockwise. */
function traceLoops(mask: Uint8Array, nx: number, ny): [number, number][][] {
  const adj = new Map<string, [number, number][]>();
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    const k = `${x0},${y0}`;
    const list = adj.get(k);
    if (list) list.push([x1, y1]);
    else adj.set(k, [[x1, y1]]);
  };
  const on = (ix: number, iy: number) => ix >= 0 && iy >= 0 && ix < nx && iy < ny && mask[iy * nx + ix] === 1;
  for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
    if (!on(ix, iy)) continue;
    if (!on(ix, iy + 1)) add(ix + 1, iy + 1, ix, iy + 1);
    if (!on(ix + 1, iy)) add(ix + 1, iy, ix + 1, iy + 1);
    if (!on(ix, iy - 1)) add(ix, iy, ix + 1, iy);
    if (!on(ix - 1, iy)) add(ix, iy + 1, ix, iy);
  }
  const loops: [number, number][][] = [];
  for (const key of [...adj.keys()]) {
    const startList = adj.get(key);
    if (!startList) continue;
    while (startList.length) {
      const [sx, sy] = key.split(',').map(Number) as [number, number];
      const first = startList.shift()!;
      const loop: [number, number][] = [[sx, sy]];
      let px = sx, py = sy, cx = first[0], cy = first[1];
      loop.push([cx, cy]);
      let guard = 0;
      while ((cx !== sx || cy !== sy) && guard++ < nx * ny * 8) {
        const opts = adj.get(`${cx},${cy}`);
        if (!opts || !opts.length) break;
        const inx = cx - px, iny = cy - py;
        let choice = 0, best = Infinity;
        for (let i = 0; i < opts.length; i++) {
          const vx = opts[i][0] - cx, vy = opts[i][1] - cy;
          const cross = inx * vy - iny * vx;
          const dot = inx * vx + iny * vy;
          let ang = Math.atan2(-cross, dot);
          if (ang <= 1e-9) ang += Math.PI * 2;
          if (ang < best) { best = ang; choice = i; }
        }
        const nxt = opts.splice(choice, 1)[0];
        px = cx; py = cy;
        cx = nxt[0]; cy = nxt[1];
        if (cx !== sx || cy !== sy) loop.push([cx, cy]);
      }
      const simple = simplifyLoop(loop);
      if (simple.length >= 3) loops.push(simple);
    }
  }
  return loops;
}
function loopArea(loop: [number, number][]) {
  let a = 0;
  for (let i = 0; i < loop.length; i++) {
    const p = loop[i], q = loop[(i + 1) % loop.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}
/** Join cells that meet only at a corner so the extruded sheet stays manifold. */
function sealCorners(mask: Uint8Array, nx: number, ny: number, blocked?: Uint8Array) {
  for (let pass = 0; pass < 4; pass++) {
    const add: number[] = [];
    for (let iy = 0; iy < ny - 1; iy++) for (let ix = 0; ix < nx - 1; ix++) {
      const a = mask[iy * nx + ix], b = mask[iy * nx + ix + 1];
      const c = mask[(iy + 1) * nx + ix], d = mask[(iy + 1) * nx + ix + 1];
      const pick = a && d && !b && !c ? iy * nx + ix + 1 : b && c && !a && !d ? iy * nx + ix : -1;
      if (pick >= 0 && !blocked?.[pick]) add.push(pick);
    }
    if (!add.length) break;
    for (const i of add) mask[i] = 1;
  }
}
function largestSheet(mask: Uint8Array, nx: number, ny: number, blocked?: Uint8Array) {
  sealCorners(mask, nx, ny, blocked);
  const seen = new Uint8Array(mask.length);
  let best: number[] = [];
  const stack: number[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue;
    const comp: number[] = [];
    seen[i] = 1;
    stack.push(i);
    while (stack.length) {
      const k = stack.pop()!;
      comp.push(k);
      const ix = k % nx, iy = (k - ix) / nx;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const jx = ix + dx, jy = iy + dy;
        if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) continue;
        const j = jy * nx + jx;
        if (!mask[j] || seen[j]) continue;
        seen[j] = 1;
        stack.push(j);
      }
    }
    if (comp.length > best.length) best = comp;
  }
  const out = new Uint8Array(mask.length);
  for (const i of best) out[i] = 1;
  return out;
}
/** One closed sheet. Each flange cell is a box; faces are shared, so the result is manifold. */
function flangeGeometry(mask: Uint8Array, nx: number, ny: number, blocked?: Uint8Array) {
  const sheet = largestSheet(mask, nx, ny, blocked);
  const on = (ix: number, iy: number) => ix >= 0 && iy >= 0 && ix < nx && iy < ny && sheet[iy * nx + ix] === 1;
  const verts = new Map<string, number>();
  const pos: number[] = [];
  const idx: number[] = [];
  const vid = (ix: number, iy: number, z: number) => {
    const k = `${ix},${iy},${z}`;
    let id = verts.get(k);
    if (id === undefined) {
      id = pos.length / 3;
      pos.push(FLANGE_X0 + ix * FLANGE_STEP, FLANGE_Y0 + iy * FLANGE_STEP, z ? 0.2 : -0.2);
      verts.set(k, id);
    }
    return id;
  };
  const quad = (a: number, b: number, c: number, d: number) => { idx.push(a, b, c, a, c, d); };
  const fan = (ring: [number, number][], z: number, ccw: boolean) => {
    const ids = ring.map(([x, y]) => vid(x, y, z));
    const n = ids.length;
    for (let i = 1; i < n - 1; i++) {
      if (ccw) idx.push(ids[0], ids[i], ids[i + 1]);
      else idx.push(ids[0], ids[i + 1], ids[i]);
    }
  };
  const ringOf = (ix: number, iy: number, w: number, h: number): [number, number][] => {
    const pts: [number, number][] = [];
    const run = (x0: number, y0: number, x1: number, y1: number) => {
      const steps = Math.abs(x1 - x0) + Math.abs(y1 - y0);
      const sx = Math.sign(x1 - x0), sy = Math.sign(y1 - y0);
      for (let s = 0; s < steps; s++) pts.push([x0 + sx * s, y0 + sy * s]);
    };
    run(ix, iy, ix + w, iy);
    run(ix + w, iy, ix + w, iy + h);
    run(ix + w, iy + h, ix, iy + h);
    run(ix, iy + h, ix, iy);
    return pts;
  };
  const used = new Uint8Array(nx * ny);
  let cells = 0;
  for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
    if (!on(ix, iy) || used[iy * nx + ix]) continue;
    let w = 1;
    while (ix + w < nx && on(ix + w, iy) && !used[iy * nx + ix + w]) w++;
    let h = 1;
    while (iy + h < ny) {
      let row = true;
      for (let k = 0; k < w; k++) if (!on(ix + k, iy + h) || used[(iy + h) * nx + ix + k]) row = false;
      if (!row) break;
      h++;
    }
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) { used[(iy + dy) * nx + ix + dx] = 1; cells++; }
    const ring = ringOf(ix, iy, w, h);
    fan(ring, 1, true);
    fan(ring, 0, false);
  }
  for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
    if (!on(ix, iy)) continue;
    if (!on(ix + 1, iy)) quad(vid(ix + 1, iy, 1), vid(ix + 1, iy, 0), vid(ix + 1, iy + 1, 0), vid(ix + 1, iy + 1, 1));
    if (!on(ix - 1, iy)) quad(vid(ix, iy, 1), vid(ix, iy + 1, 1), vid(ix, iy + 1, 0), vid(ix, iy, 0));
    if (!on(ix, iy + 1)) quad(vid(ix, iy + 1, 1), vid(ix + 1, iy + 1, 1), vid(ix + 1, iy + 1, 0), vid(ix, iy + 1, 0));
    if (!on(ix, iy - 1)) quad(vid(ix, iy, 1), vid(ix, iy, 0), vid(ix + 1, iy, 0), vid(ix + 1, iy, 1));
  }
  if (cells < 100) throw new Error('valve-cover gasket flange is empty');
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const hwBvhCache = new Map<string, MeshBVH>();
/** Rockers, valves and plugs posed as in the assembly, one BVH per bank. */
function hardwareBvh(s: 1 | -1): MeshBVH {
  const key = `${s}`;
  let bvh = hwBvhCache.get(key);
  if (bvh) return bvh;
  const poseOf = (id: string) => {
    const def = PARTS.find((p) => p.id === id);
    return new THREE.Matrix4().compose(
      new THREE.Vector3(...(def?.position ?? [0, 0, 0])),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(def?.rotation ?? [0, 0, 0]))),
      new THREE.Vector3(1, 1, 1),
    );
  };
  const cyls = s > 0 ? [1, 2, 3] : [4, 5, 6];
  const roots: { root: THREE.Object3D; pose: THREE.Matrix4 }[] = [
    { root: rockers(s), pose: new THREE.Matrix4() },
    ...cyls.flatMap((c) => [
      { root: valveSet(c), pose: poseOf(`valves-${c}`) },
      { root: sparkPlug(), pose: poseOf(`spark-plug-${c}`) },
      { root: sparkPlugConnector(), pose: poseOf(`spark-plug-connector-${c}`) },
    ]),
  ];
  const pos: number[] = [];
  const v = new THREE.Vector3();
  for (const { root, pose } of roots) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
      const P = g.attributes.position;
      const world = pose.clone().multiply(m.matrixWorld);
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(world);
        pos.push(v.x, v.y, v.z);
      }
    });
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  bvh = new MeshBVH(geom);
  hwBvhCache.set(key, bvh);
  return bvh;
}
/**
 * Flange cells the rocker, valve or plug actually occupies. Filling them back in
 * would be a clash, so a window frame may not rely on them.
 */
function hardwareCells(s: 1 | -1, up: boolean, mask: Uint8Array, nx: number, ny: number) {
  const blocked = new Uint8Array(mask.length);
  const bvh = hardwareBvh(s);
  const frame = coverMatrix(s, up);
  const world = new THREE.Vector3();
  const info = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 };
  const reach = 1.6;
  for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
    const x = FLANGE_X0 + (ix + 0.5) * FLANGE_STEP;
    const y = FLANGE_Y0 + (iy + 0.5) * FLANGE_STEP;
    world.set(x, y, -0.25).applyMatrix4(frame);
    const hit = bvh.closestPointToPoint(world, info, 0, reach);
    if (hit && hit.distance <= reach) blocked[iy * nx + ix] = 1;
  }
  return blocked;
}
/** True when hardware sits in the frame or in the lip just outside the hole. */
function frameBlocked(blocked: Uint8Array, nx: number, ny: number, x0: number, y0: number, x1: number, y1: number, band: number) {
  const ix0 = Math.max(0, Math.floor((x0 - band - FLANGE_X0) / FLANGE_STEP));
  const ix1 = Math.min(nx, Math.ceil((x1 + band - FLANGE_X0) / FLANGE_STEP));
  const iy0 = Math.max(0, Math.floor((y0 - band - FLANGE_Y0) / FLANGE_STEP));
  const iy1 = Math.min(ny, Math.ceil((y1 + band - FLANGE_Y0) / FLANGE_STEP));
  for (let iy = iy0; iy < iy1; iy++) {
    const y = FLANGE_Y0 + (iy + 0.5) * FLANGE_STEP;
    for (let ix = ix0; ix < ix1; ix++) {
      if (!blocked[iy * nx + ix]) continue;
      const x = FLANGE_X0 + (ix + 0.5) * FLANGE_STEP;
      if (x >= x0 && x <= x1 && y >= y0 && y <= y1) continue;
      return true;
    }
  }
  return false;
}
/**
 * A bay with no housing face is an extra enclosed hole once the seal ring
 * closes. Open a short channel from that hole into the nearest punched
 * window so the sheet still has three openings, and leave the seal band
 * itself in place.
 */
function joinSpareHoles(
  mask: Uint8Array, nx: number, ny: number,
  windows: { cx: number; cy: number }[],
  band: Uint8Array,
) {
  const idOf = new Int32Array(mask.length).fill(-1);
  const comps: number[][] = [];
  const stack: number[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] || idOf[i] >= 0) continue;
    const id = comps.length;
    const cells: number[] = [];
    idOf[i] = id;
    stack.push(i);
    let edge = false;
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    while (stack.length) {
      const k = stack.pop()!;
      cells.push(k);
      const ix = k % nx, iy = (k - ix) / nx;
      minx = Math.min(minx, ix); maxx = Math.max(maxx, ix);
      miny = Math.min(miny, iy); maxy = Math.max(maxy, iy);
      if (ix === 0 || iy === 0 || ix === nx - 1 || iy === ny - 1) edge = true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const jx = ix + dx, jy = iy + dy;
        if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) continue;
        const j = jy * nx + jx;
        if (mask[j] || idOf[j] >= 0) continue;
        idOf[j] = id;
        stack.push(j);
      }
    }
    const w = (maxx - minx + 1) * FLANGE_STEP, h = (maxy - miny + 1) * FLANGE_STEP;
    comps.push(edge || w < 45 || h < 40 ? [] : cells);
  }
  const windowIds = new Set<number>();
  for (const win of windows) {
    const ix = Math.round((win.cx - FLANGE_X0) / FLANGE_STEP - 0.5);
    const iy = Math.round((win.cy - FLANGE_Y0) / FLANGE_STEP - 0.5);
    const id = idOf[iy * nx + ix];
    if (id >= 0) windowIds.add(id);
  }
  const targets: number[] = [];
  for (const id of windowIds) for (let i = 0; i < idOf.length; i++) if (idOf[i] === id) targets.push(i);
  if (!targets.length) return;
  const isTarget = new Uint8Array(mask.length);
  for (const t of targets) isTarget[t] = 1;
  for (let id = 0; id < comps.length; id++) {
    if (windowIds.has(id) || !comps[id].length) continue;
    const seen = new Uint8Array(mask.length);
    const prev = new Int32Array(mask.length).fill(-1);
    const q: number[] = [];
    for (const c of comps[id]) { seen[c] = 1; q.push(c); }
    let found = -1;
    let qi = 0;
    while (qi < q.length && found < 0) {
      const k = q[qi++];
      const ix = k % nx, iy = (k - ix) / nx;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const jx = ix + dx, jy = iy + dy;
        if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) continue;
        const j = jy * nx + jx;
        if (seen[j]) continue;
        if (isTarget[j]) { prev[j] = k; found = j; break; }
        if (band[j]) continue;
        if (!mask[j] && idOf[j] !== id) continue;
        seen[j] = 1;
        prev[j] = k;
        q.push(j);
      }
    }
    if (found < 0) continue;
    const clear = new Set<number>();
    let c = prev[found];
    while (c >= 0 && idOf[c] !== id) {
      clear.add(c);
      c = prev[c];
    }
    for (const k of clear) {
      const ix = k % nx, iy = (k - ix) / nx;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        if (dx * dx + dy * dy > 10) continue;
        const jx = ix + dx, jy = iy + dy;
        if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) continue;
        const j = jy * nx + jx;
        if (!band[j]) mask[j] = 0;
      }
    }
  }
}
/** Cells the cover and the housing do not both meet, apart from the seal band. */
function dropUnclamped(
  mask: Uint8Array, nx: number, ny: number, s: 1 | -1, up: boolean, band: Uint8Array,
) {
  const frame = coverMatrix(s, up);
  const normal = new THREE.Vector3().setFromMatrixColumn(frame, 2).normalize();
  const neg = normal.clone().negate();
  const cover = bvhCache.get(`cover:${s}:${up ? 1 : 0}`);
  const house = bvhCache.get(`house:${s}`);
  if (!cover || !house) return;
  const world = new THREE.Vector3();
  const sees = (bvh: MeshBVH, dir: THREE.Vector3) => {
    const h = bvh.raycastFirst(new THREE.Ray(world.clone(), dir.clone()), THREE.DoubleSide) as { distance: number } | null;
    return !!(h && h.distance > 0.05 && h.distance <= 40);
  };
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || band[i]) continue;
    const ix = i % nx, iy = (i - ix) / nx;
    world.set(FLANGE_X0 + (ix + 0.5) * FLANGE_STEP, FLANGE_Y0 + (iy + 0.5) * FLANGE_STEP, -0.25).applyMatrix4(frame);
    if (!((sees(cover, normal) && sees(house, neg)) || (sees(cover, neg) && sees(house, normal)))) mask[i] = 0;
  }
}
function coverGasket(s: 1 | -1, up: boolean) {
  const key = `${s}:${up ? 1 : 0}`;
  let cached = gasketCache.get(key);
  if (!cached) {
    const halfL = (CH_Z1 - CH_Z0 - 8) / 2;
    const { mask, nx, ny } = flangeCells(s, up);
    for (const st of vcStuds(up, s)) clearCircle(mask, nx, ny, st.x, st.y, 4.2);
    if (!up) {
      // Cylinder 6's exhaust head meets the lower-left end corner. The flange
      // there is already open; this clears any cell the head still crosses.
      if (s < 0) clearRect(mask, nx, ny, 14, -(halfL - 8), 30, -(halfL - 1.6));
    } else {
      const cyls = s > 0 ? [1, 2, 3] : [4, 5, 6];
      for (const c of cyls) {
        const p = plugCoverLocal(c, 0);
        if (Math.abs(p.y) < halfL - SPARK_HOLE_R - 4) clearCircle(mask, nx, ny, p.x, p.y, SPARK_HOLE_R + 2.4);
      }
      if (s < 0) {
        const endLoc = plugCoverLocal(6, 0);
        const tubeClear = SPARK_TUBE_R + 4.2;
        const notchIn = -175.5 - 8;
        const yTip = -(halfL + 8);
        clearRect(mask, nx, ny, endLoc.x - tubeClear, Math.min(notchIn, yTip), endLoc.x + tubeClear, Math.max(notchIn, yTip));
      } else {
        const endLoc = plugCoverLocal(1, 0);
        const tubeClear = SPARK_TUBE_R + 4.2;
        const end = Math.sign(endLoc.y) || 1;
        const inboard = halfL - Math.abs(endLoc.y);
        const depth = inboard > -tubeClear && inboard < halfL ? Math.max(tubeClear, inboard + tubeClear) : tubeClear + 8;
        const yTip = end * (halfL + 8);
        const yIn = end * (halfL - depth);
        clearRect(mask, nx, ny, endLoc.x - tubeClear, Math.min(yIn, yTip), endLoc.x + tubeClear, Math.max(yIn, yTip));
      }
    }
    const blocked = hardwareCells(s, up, mask, nx, ny);
    const holeW = up ? 48 : 54;
    const holeH = up ? 44 : 22;
    // Lower bays run into the openings. A thicker frame keeps each one a
    // separate upright hole after the seal ring closes.
    const margin = up ? 0.5 : 3;
    // Lower centers sit on the housing frame lands. The upper sheet still
    // picks the three openings whose frames are already closed.
    const chosen: { cx: number; cy: number; gap: number }[] = !up
      ? (s > 0
        ? [{ cx: -8, cy: -154, gap: 0 }, { cx: -8, cy: -76, gap: 0 }, { cx: -8, cy: 42, gap: 0 }]
        : [{ cx: -6, cy: -148, gap: 0 }, { cx: -8, cy: -30, gap: 0 }, { cx: -2, cy: 88, gap: 0 }])
      : [];
    if (up) {
      const cands: { cx: number; cy: number; gap: number }[] = [];
      let globalBest = Infinity;
      for (let cy = -165 + holeH / 2; cy <= 165 - holeH / 2; cy += 2) {
        let best = Infinity, bestCx = 0;
        for (let cx = -10; cx <= 10; cx += 2) {
          const x0 = cx - holeW / 2, y0 = cy - holeH / 2, x1 = cx + holeW / 2, y1 = cy + holeH / 2;
          if (frameBlocked(blocked, nx, ny, x0, y0, x1, y1, 6)) continue;
          const gap = frameGap(mask, nx, ny, x0, y0, x1, y1, margin);
          if (gap < best) { best = gap; bestCx = cx; }
        }
        if (best < globalBest) globalBest = best;
        if (best <= 22) cands.push({ cx: bestCx, cy, gap: best });
      }
      if (cands.length < 3) throw new Error(`valve-cover gasket ${key} candidates ${cands.length} best gap ${globalBest.toFixed(1)}`);
      cands.sort((a, b) => a.gap - b.gap);
      for (const c of cands) {
        if (chosen.some((k) => Math.abs(k.cy - c.cy) < holeH + 8)) continue;
        chosen.push(c);
        if (chosen.length === 3) break;
      }
      if (chosen.length < 3) throw new Error(`valve-cover gasket ${key} placed ${chosen.length} windows`);
    }
    for (const c of chosen) punchWindow(mask, nx, ny, c.cx, c.cy, holeW, holeH, margin, blocked);
    for (let i = 0; i < mask.length; i++) if (blocked[i]) mask[i] = 0;
    // The outer band is one closed loop, jogged past a stem or a stud. Paint it
    // back over any window edge that crossed the lip.
    const band = new Uint8Array(mask.length);
    paintSealRing(s, up, band, nx, ny, FLANGE_X0, FLANGE_Y0, FLANGE_STEP);
    for (let i = 0; i < mask.length; i++) if (band[i]) mask[i] = 1;
    // The seal band stays outside the openings. Clear them again so a jog that
    // clips a corner cannot split one window into two.
    for (const c of chosen) clearRect(mask, nx, ny, c.cx - holeW / 2, c.cy - holeH / 2, c.cx + holeW / 2, c.cy + holeH / 2);
    for (const st of vcStuds(up, s)) clearCircle(mask, nx, ny, st.x, st.y, 6.6);
    for (let i = 0; i < mask.length; i++) if (blocked[i]) mask[i] = 0;
    if (up) joinSpareHoles(mask, nx, ny, chosen, band);
    if (!up) dropUnclamped(mask, nx, ny, s, up, band);
    const g = flangeGeometry(mask, nx, ny, blocked);
    g.translate(0, 0, -0.25);
    if (!g.attributes.normal) g.computeVertexNormals();
    const P = g.attributes.position, N = g.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      const z = P.getZ(i), nz = N.getZ(i);
      if ((z > -0.2 && nz < -0.3) || (z < -0.3 && nz > 0.3)) N.setXYZ(i, -N.getX(i), -N.getY(i), -nz);
    }
    N.needsUpdate = true;
    gasketCache.set(key, g);
    cached = g;
  }
  return new Part().add(cached.clone(), 'gasket');
}
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);
const BANKS = [1, -1] as const;
const bn = (s: number) => (s > 0 ? 'right' : 'left');
const CYLS = [1, 2, 3, 4, 5, 6];
type Mats = THREE.Matrix4[];
export interface SmallGeom { proto: () => Part; items: () => Mats }

// ---------- prototype helpers (+Y out of the seat) ----------
const washer = (ri: number, ro: number, t: number, m = 'steel' as any) => new Part().add(lathe([[ri, 0], [ro, 0], [ro, t], [ri, t]], 28), m);
const oring = (R: number, r: number, m = 'rubber' as any) => new Part().add(torus(R, r, 8, 40).rotateX(Math.PI / 2).translate(0, r, 0), m);
const pin = (r: number, L: number, m = 'steel' as any) => new Part().add(cyl(r, L, 14).translate(0, L / 2, 0), m);
const clip = (ri: number, ro: number, t: number) => { const p = new Part(); p.add(lathe([[ri, 0], [ro, 0], [ro, t], [ri, t]], 28, 0.35, Math.PI * 2 - 0.7), 'darkSteel'); return p; };
const plug = (af: number, h: number, r: number, ring = true) => { const p = new Part(); if (ring) p.add(lathe([[r + 0.2, 0], [r + 3, 0], [r + 3, 1.5], [r + 0.2, 1.5]], 24), 'brass'); p.add(hexNut(af, h).translate(0, (ring ? 1.5 : 0) + h / 2, 0), 'zincPlate'); p.add(cyl(r, 10, 16).translate(0, -5, 0), 'zincPlate'); return p; };
/** Flat gasket following an outline (pts in the local XZ plane), thickness t along +Y. */
const gasketRing = (pts: [number, number][], w: number, t = 0.5) => {
  const sh = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b)));
  const inner = new THREE.Path(insetPoly(pts, w).map(([a, b]) => new THREE.Vector2(a, b)));
  sh.holes.push(inner);
  const g = extrudeC(sh, t); g.rotateX(-Math.PI / 2); g.translate(0, t / 2, 0);
  // extrudeC is centred; rotateX(-90) maps +Z to +Y and shape y to -Z
  g.scale(1, 1, -1);
  return new Part().add(g, 'gasket');
};
function insetPoly(pts: [number, number][], w: number): [number, number][] {
  const n = pts.length; let area = 0; for (let i = 0; i < n; i++) { const [a, b] = pts[i], [c, d] = pts[(i + 1) % n]; area += a * d - c * b; }
  const sgn = area > 0 ? 1 : -1;
  return pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n], c = pts[(i + 1) % n];
    const e1 = new THREE.Vector2(p[0] - a[0], p[1] - a[1]).normalize(), e2 = new THREE.Vector2(c[0] - p[0], c[1] - p[1]).normalize();
    const n1 = new THREE.Vector2(-e1.y, e1.x).multiplyScalar(sgn), n2 = new THREE.Vector2(-e2.y, e2.x).multiplyScalar(sgn);
    const m = n1.clone().add(n2).normalize(); const k = w / Math.max(0.3, m.dot(n1));
    return [p[0] + m.x * k, p[1] + m.y * k] as [number, number];
  });
}
const circ = (r: number, n = 40): [number, number][] => Array.from({ length: n }, (_, i) => [r * Math.cos((i / n) * Math.PI * 2), r * Math.sin((i / n) * Math.PI * 2)]);
const M = (p: THREE.Vector3, n: THREE.Vector3, x?: THREE.Vector3) => frame(p, n, x);
const posed = (id: string, p: V3, n: V3, x?: V3) => { const P = partPose(id); const q = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromRotationMatrix(P)); return M(V(...p).applyMatrix4(P), V(...n).applyMatrix4(q), x ? V(...x).applyMatrix4(q) : undefined); };
const onSurf = (id: string, o: THREE.Vector3, d: THREE.Vector3, x?: THREE.Vector3) => { const h = probe(id, o, d, 600); if (!h) throw new Error(`small parts: no ${id} surface from ${o.toArray()}`); return M(h.point, d.clone().negate(), x); };

// ---------- composites ----------
function sender(bodyR: number, bodyH: number, hex: number, m = 'brass' as any) { const p = new Part(); p.add(lathe([[7.2, 0], [11, 0], [11, 1.5], [7.2, 1.5]], 24), 'copper'); p.add(hexNut(hex, 8).translate(0, 5.5, 0), 'zincPlate'); p.add(lathe([[0.1, 9.5], [bodyR, 9.5], [bodyR, 9.5 + bodyH], [bodyR - 3, 12 + bodyH], [0.1, 12 + bodyH]], 24), m); p.add(cyl(2.5, 6, 10).translate(0, 15 + bodyH, 0), 'brass'); return p; }
function banjo() { const p = new Part(); p.add(lathe([[5, 0], [8, 0], [8, 1.5], [5, 1.5]], 20), 'brass'); p.add(lathe([[0.1, 1.5], [9, 1.5], [9, 13.5], [0.1, 13.5]], 20), 'brass'); p.add(cylBetween([0, 7.5, 0], [22, 7.5, 0], 3.5, 10), 'zincPlate'); p.add(lathe([[5, 13.5], [8, 13.5], [8, 15], [5, 15]], 20), 'brass'); p.add(hexNut(14, 8).translate(0, 19, 0), 'zincPlate'); return p; }
function hoseClamp(R: number, w = 9) { const p = new Part(); p.add(lathe([[R, -w / 2], [R + 0.8, -w / 2], [R + 0.8, w / 2], [R, w / 2]], 32), 'zincPlate'); p.add(box(8, w, 10).translate(R + 4, 0, 0), 'zincPlate'); return p; }

const CAM_ZC = (s: 1 | -1) => CHAIN_Z[s];
/** Cover-stud hole in the lid gasket. M6 stud is r 3; the hole is centred on the stud. */
export const LID_STUD_HOLE_R = 3.3;
/**
 * Timing-cover gasket: the flange annulus (same outlines as the housing lip), from the flange
 * face to the cover face. Stud holes are coaxial with chainCoverBolts. No z-scale — frame
 * (+Y → +Z, +X → +X) maps local (x, t, −y) onto world (x, y, t).
 */
export function chainLidGasket(s: 1 | -1) {
  const ccw = (pts: [number, number][]) => {
    let a = 0;
    for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
    return a >= 0 ? pts : pts.slice().reverse();
  };
  // Flange outline, with the inboard edge held just outboard of the case chain-well plate
  // (the raw outline steps 3 mm onto that plate). Same chainOutline the flange is built from.
  const xCut = CHAIN_BOX_INNER_X + 1.2;
  const clipped: [number, number][] = [];
  const raw = chainOutline(s, 3);
  const past = (q: [number, number]) => q[0] * s >= xCut;
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i], b = raw[(i + 1) % raw.length];
    if (past(a)) clipped.push(a);
    if (past(a) !== past(b)) {
      const t = (xCut * s - a[0]) / (b[0] - a[0]);
      clipped.push([xCut * s, a[1] + (b[1] - a[1]) * t]);
    }
  }
  const outer = ccw(clipped);
  const inner = ccw(chainOutline(s, -4)).slice().reverse();
  const sh = new THREE.Shape(outer.map(([a, b]) => new THREE.Vector2(a, b)));
  sh.holes.push(new THREE.Path(inner.map(([a, b]) => new THREE.Vector2(a, b))));
  const t = CHAIN_LID.z0 - HOUSING_Z1;
  let geom: THREE.BufferGeometry = extrudeC(sh, t);
  const cutters = chainCoverBolts(s).map((q) => yToZ(cyl(LID_STUD_HOLE_R, t + 4, 20)).translate(q.x, q.y, 0));
  geom = csgSub(geom, ...cutters);
  geom.rotateX(-Math.PI / 2);
  geom.translate(0, t / 2, 0);
  return new Part().add(geom, 'gasket');
}
/** Triangular 3-hole gasket (#29) on the cover's inboard face. Centre opening plus one hole per screw. */
function coverGasketGeom(s: 1 | -1) {
  const stack = camNoseStack(s);
  const cx = CAM_X * s;
  const C = CAM_COVER;
  const bolts = camCoverAngles(s).map((d) => camCoverBolt(s, d));
  // The screw hole has to sit inside the outline. A sharp corner at boltR+6.6 cuts the
  // hole, and a CSG cylinder through that corner opens the shell. Round each corner.
  const holeR = 3.5;
  const Ro = holeR + 1.5;
  const centers = bolts.map((b) => new THREE.Vector2(b.x, b.y));
  const origin = new THREE.Vector2(cx, 0);
  const outward = (a: THREE.Vector2, b: THREE.Vector2) => {
    const d = b.clone().sub(a);
    const n = new THREE.Vector2(-d.y, d.x).normalize();
    if (n.dot(a.clone().add(b).multiplyScalar(0.5).sub(origin)) < 0) n.negate();
    return n;
  };
  const outline: [number, number][] = [];
  for (let i = 0; i < centers.length; i++) {
    const cur = centers[i];
    const n0 = outward(cur, centers[(i + centers.length - 1) % centers.length]);
    const n1 = outward(cur, centers[(i + 1) % centers.length]);
    const a0 = Math.atan2(n0.y, n0.x);
    let sweep = Math.atan2(n1.y, n1.x) - a0;
    while (sweep > Math.PI) sweep -= Math.PI * 2;
    while (sweep < -Math.PI) sweep += Math.PI * 2;
    const steps = 8;
    for (let k = 0; k <= steps; k++) {
      const t = a0 + sweep * (k / steps);
      outline.push([cur.x + Math.cos(t) * Ro, cur.y + Math.sin(t) * Ro]);
    }
  }
  const ring = (r: number, x: number, y: number, n = 24): [number, number][] =>
    Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      return [x + r * Math.cos(a), y + r * Math.sin(a)] as [number, number];
    });
  return holedPlate(
    outline,
    [ring(17, cx, 0), ...centers.map((c) => ring(holeR, c.x, c.y, 16))],
    () => [stack.gasket0, stack.gasket0 + C.gasketT],
  );
}
/**
 * Cam-flange cover 930 105 196 00 (Kat 502 p.70 Bild 103-10 and p.74 Bild 103-15, #31).
 * Deep cast body, O-ring groove with solid lands, raised rim, three screw lugs notched into that rim.
 * Gasket #29 and the round seal are features of this part. The three M6 screws are a fastener set.
 */
export function camFlangeCoverPart(s: 1 | -1) {
  const p = new Part();
  const stack = camNoseStack(s);
  const cx = CAM_X * s;
  const C = CAM_COVER;
  const bodyT = CAM_COVER_BODY;
  const g0 = C.land, g1 = g0 + C.grooveW;
  const seatZ = camCoverSeatZ(s);
  // Rim face stands proud of the grooved body and of the M6 heads, and stays under the duplex chain.
  const rimTop = seatZ + 6.4;
  // Centre pocket: the thrust washer seats on this face. Bore stays open for the cam nose.
  const hub = yToZ(closedLathe([
    [C.boreR, 0], [C.pocketR, 0], [C.pocketR, C.hub], [C.boreR, C.hub],
  ], 40));
  hub.translate(cx, 0, stack.cover0);
  p.add(hub, 'castAlu');
  // Grooved body. Lands of `land` (2.2 mm) on both sides of the groove.
  const body = yToZ(closedLathe([
    [C.pocketR - 0.4, 0], [C.bodyR, 0], [C.bodyR, g0], [C.grooveRoot, g0], [C.grooveRoot, g1],
    [C.bodyR, g1], [C.bodyR, bodyT], [C.pocketR - 0.4, bodyT],
  ], 48));
  body.translate(cx, 0, stack.cover0);
  p.add(body, 'castAlu');
  // Raised rim. The inboard plate is the screw seat. The outboard plate is notched around each
  // screw so the head sits in the rim and stays under the chain, without a hole that breaks the edge.
  const bolts = camCoverAngles(s).map((d) => camCoverBolt(s, d));
  const N = 240;
  // Seat notch clears the M6 shank and still leaves metal under the washer.
  // Rim notch clears the Ø12.4 head. Both open through the outer edge: a closed
  // hole at this radius would break the rim (bolt r 44.8, rim r 47.2).
  const radAt = (a: number, notchR: number) => {
    const ca = Math.cos(a), sa = Math.sin(a);
    let r = C.rimR;
    if (notchR <= 0) return r;
    // Stay outside the bore so the notch and the inner hole stay separate contours.
    const floor = C.rimInner + 0.9;
    for (const b of bolts) {
      const bx = b.x - cx, by = b.y;
      const bdot = bx * ca + by * sa;
      const disc = bdot * bdot - (bx * bx + by * by - notchR * notchR);
      if (disc <= 0) continue;
      const near = bdot - Math.sqrt(disc);
      if (near < r) r = Math.max(near, floor);
    }
    return r;
  };
  const rimPts = (notchR: number): [number, number][] => {
    const pts: [number, number][] = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const r = radAt(a, notchR);
      pts.push([cx + Math.cos(a) * r, Math.sin(a) * r]);
    }
    return pts;
  };
  const ring = (r: number, x: number, y: number, n = 40): [number, number][] =>
    Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      return [x + r * Math.cos(a), y + r * Math.sin(a)] as [number, number];
    });
  const seatPlan = (() => {
    const pts: [number, number][] = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      let r = radAt(a, 3.6);
      const ca = Math.cos(a), sa = Math.sin(a);
      // Local lug under the spring washer. The upper rim stays notched, so the head is not buried in it.
      for (const b of bolts) {
        const bx = (b.x - cx) / C.boltR, by = b.y / C.boltR;
        if (bx * ca + by * sa > Math.cos(0.16)) r = Math.max(r, C.boltR + 4.8);
      }
      pts.push([cx + Math.cos(a) * r, Math.sin(a) * r]);
    }
    return pts;
  })();
  const notchPlan = rimPts(6.5);
  // Shank clearance. The lug keeps metal under the washer; the hole keeps the M6 shank out of the cover.
  p.add(holedPlate(seatPlan, [ring(C.rimInner, cx, 0), ...bolts.map((b) => ring(3.6, b.x, b.y, 16))], () => [stack.cover0, seatZ]), 'castAlu');
  p.add(holedPlate(notchPlan, [ring(C.rimInner, cx, 0)], () => [seatZ, rimTop]), 'castAlu');
  p.add(coverGasketGeom(s), 'gasket');
  // 999 701 468 40, 67.5 × 75.4 × 4. The torus fills the groove: OD on the body, ID on the root.
  const ringR = (C.bodyR + C.grooveRoot) / 2, tubeR = (C.bodyR - C.grooveRoot) / 2;
  p.add(torus(ringR, tubeR, 10, 48), 'rubber', [cx, 0, stack.cover0 + g0 + C.grooveW / 2]);
  return p.g;
}
export const SMALL_GEOM: Record<string, SmallGeom> = {};
const def = (id: string, proto: () => Part, items: () => Mats) => { SMALL_GEOM[id] = { proto, items }; };

// ===== cam nose (per bank) =====
for (const s of BANKS) {
  const b = bn(s), Xc = CAM_X * s, zc = CAM_ZC(s), N = CAM_NOSE;
  def(`cam-key-${b}`, () => new Part().add(woodruffGeom(N.key.D, N.key.h, N.key.b), 'darkSteel'), () => [M(V(Xc, N.r + N.key.proud, zc + N.key.dz), Y, Z)]);
  // Ø6 × 14 pin: tail in the flange hole, tip `proud` mm past the sprocket-web bevel lip (the visible cam-nose end).
  def(`cam-pin-${b}`, () => pin(N.pin.r - 0.05, N.pin.len), () => {
    const lip = CAM_WEB.depth / 2 + CAM_WEB.bevel;
    const tail = lip + N.pin.proud - N.pin.len;
    return [M(V(Xc + N.pin.rad * Math.cos(N.pin.a) * s, N.pin.rad * Math.sin(N.pin.a), zc + tail), Z)];
  });
  def(`cam-shim-${b}`, () => {
    const ro = 22, ri = N.r + 0.2, n = 40;
    const pts: [number, number][] = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push([ro * Math.cos(a), ro * Math.sin(a)]); }
    for (let i = 0; i <= n; i++) { const a = -(i / n) * Math.PI * 2; pts.push([ri * Math.cos(a), ri * Math.sin(a)]); }
    const g = extrudeC(polyShape(pts), N.shim); g.translate(0, 0, N.shim / 2);
    return new Part().add(g, 'steel');
  }, () => [new THREE.Matrix4().makeTranslation(Xc, 0, camNoseStack(s).shim0)]);
  def(`cam-thrust-washer-${b}`, () => washer(N.r + 0.2, 22, N.thrust, 'bronze'), () => [M(V(Xc, 0, camNoseStack(s).thrust0), Z)]);
  // chain drive extras
  const T = tensionerLayout(s), z = CHAIN_Z[s];
  def(`idler-circlip-${b}`, () => clip(7, 9.5, 1), () => [M(V(T.pivot.x, T.pivot.y, z - 18.5), Z)]);
  def(`idler-sleeve-${b}`, () => pin(1.5, 20, 'darkSteel'), () => [M(V(T.pivot.x, T.pivot.y - 10, z - 13), Y)]);
  // chain housing: case-side gasket (#5), lid gasket (#8 L / #9 R), lid screw plug + ring, expansion plug (#10)
  def(`chain-housing-gasket-${b}`, () => gasketRing(chainCaseFace(s), 8), () => [M(V(0, 0, HOUSING_Z0), Z, X)]);
  def(`chain-lid-gasket-${b}`, () => chainLidGasket(s), () => [M(V(0, 0, HOUSING_Z1), Z, X)]);
  def(`chain-lid-plug-${b}`, () => plug(17, 6, 8), () => [onSurf(`chain-housing-lid-${b}`, V(s * 232, -22, 400), V(0, 0, -1))]);
  def(`chain-lid-plug2-${b}`, () => plug(14, 5, 7, false), () => [onSurf(`chain-housing-lid-${b}`, V(s * 250, 30, 400), V(0, 0, -1))]);
  def(`cam-housing-plug-${b}`, () => plug(14, 6, 7), () => [onSurf(`cam-housing-${b}`, V(s * 450, 0, -110), V(-s, 0, 0))]);
  def(`chain-case-plug-${b}`, () => { const p = new Part(); p.add(lathe([[0.1, 0], [7.5, 0], [7.5, 0.6], [6, 1.6], [0.1, 1.6]], 24), 'steel'); return p; }, () => [onSurf(`chain-housing-${b}`, V(s * 230, 120, HOUSING_Z0 + 30), V(0, -1, 0))]);
  // cam housing: valve-cover gaskets (#18 upper, #20 lower), end lid (#16), splash tube, stoppers, banjo feed, temp switch
  for (const up of [true, false]) {
    def(`valve-cover-gasket-${up ? 'upper' : 'lower'}-${b}`, () => coverGasket(s, up), () => [coverMatrix(s, up).clone()]);
  }
  def(`cam-end-cover-${b}`, () => { const p = new Part(); p.add(lathe([[0.1, 0], [27, 0], [27, 1], [25, 3], [0.1, 3]], 36), 'castAlu'); return p; }, () => [onSurf(`cam-housing-${b}`, V(Xc, 0, CH_Z0 - 60), Z)]);
  // Clear of the Ø46.7 journals (centre distance 30 mm). The old offset of 24 mm ran through the journals.
  // The plug axis crosses this x at about y 29. Break the tube there; the gaps are
  // shorter than the perforated run, and y 26 stays clear of the valve stems.
  def(`cam-splash-tube-${b}`, () => {
    const p = new Part();
    const z0 = CH_Z0 + 20;
    const z1 = CH_Z1 - 20;
    const gaps = (s > 0 ? [1, 2, 3] : [4, 5, 6]).map((c) => CYL_Z[c] + s * 44);
    let cursor = z0;
    for (const zc of gaps.sort((a, b) => a - b)) {
      const a = zc - 18;
      if (a > cursor + 6) p.add(cyl(3.5, a - cursor, 12).translate(0, (cursor - z0) + (a - cursor) / 2, 0), 'steel');
      cursor = Math.max(cursor, zc + 18);
    }
    if (z1 > cursor + 6) p.add(cyl(3.5, z1 - cursor, 12).translate(0, (cursor - z0) + (z1 - cursor) / 2, 0), 'steel');
    return p;
  }, () => [M(V((CAM_X - 22) * s, 26, CH_Z0 + 20), Z)]);
  // y ±56 stays on the end cap and off the cylinder-6 connector cup (the old ±24 crossed it).
  def(`cam-housing-stoppers-${b}`, () => { const p = new Part(); p.add(lathe([[0.1, -4], [5, -4], [5, 0], [5.5, 0], [5.5, 1.2], [0.1, 1.2]], 18), 'steel'); return p; }, () => [-1, 1].map((k) => onSurf(`cam-housing-${b}`, V(Xc - 24 * s, 56 * k, CH_Z0 - 60), Z)));
  def(`cam-oil-banjo-${b}`, () => { const p = banjo(); p.add(lathe([[5, 21], [8, 21], [8, 22.5], [5, 22.5]], 20), 'brass'); p.add(lathe([[5, 22.5], [8, 22.5], [8, 24], [5, 24]], 20), 'brass'); p.add(lathe([[0.1, 24], [6, 24], [6, 32], [0.1, 32]], 16), 'zincPlate'); return p; }, () => [onSurf(`cam-housing-${b}`, V(Xc - 14 * s, -36, CH_Z0 - 80), Z, V(s, 0, 0))]);
}
def('cam-temp-switch', () => sender(9, 10, 19), () => [onSurf('cam-housing-left', V(-CAM_X + 14, 58, CH_Z0 - 80), Z)]);

// ===== crank nose / flywheel =====
const CN = CRANK_NOSE;
def('crank-key', () => new Part().add(woodruffGeom(CN.key.D, CN.key.h, CN.key.b), 'darkSteel'), () => [M(V(0, CN.seatR + CN.key.proud, CN.key.z), Y, Z)]);
def('crank-gear-ring', () => washer(CN.seatR + 0.05, 33, CN.ring[1] - CN.ring[0]), () => [M(V(0, 0, CN.ring[0]), Z)]);
def('crank-circlip', () => clip(CN.seatR - 1.2 + 0.05, 33, 1.6), () => [M(V(0, 0, CN.groove[0] + 0.05), Z)]);
def('pulley-pin', () => pin(2.5, 10), () => [M(V(0, CN.pinR, 313), Z)]);
def('crank-pilot-bush', () => washer(7.5, 9.95, 11.5, 'bronze'), () => [M(V(0, 0, FLY_Z + 0.2), Z)]);
def('flywheel-seal', () => { const p = new Part(); p.add(lathe([[15, 0], [25, 0], [25, 10], [15, 10]], 32), 'rubber'); p.add(lathe([[22, 0.2], [25.05, 0.2], [25.05, 9.8], [22, 9.8]], 32), 'steel'); return p; }, () => [M(V(0, 0, FLY_Z - 12), Z)]);
def('flywheel-oring', () => oring(25.5, 2.1), () => [M(V(0, 0, FLY_Z - 4.2), Z)]);
def('crank-seal-rear', () => { const p = new Part(); p.add(lathe([[SPECR() + 0.1, 0], [44, 0], [44, 10], [SPECR() + 0.1, 10]], 40), 'rubber'); return p; }, () => [M(V(0, 0, CASE_Z.flywheel), Z)]);
function SPECR() { return 28.5; }

// ===== crankcase =====
const throughZ = MAIN_Z.slice(1, 6);
def('case-dowels', () => pin(6, 16, 'steel'), () => [V(0, 100, -150), V(0, 100, -60), V(0, 100, 60), V(0, 100, 150)].map((p) => M(p.clone().setX(-8), X)));
// ===== intermediate shaft (103-15 #44-#49)
const ISZ = { j0: -60, j1: 150, jw: 16 };
def('ishaft-bearings', () => new Part().add(yToZ(lathe([[13.05, -ISZ.jw / 2], [15.6, -ISZ.jw / 2], [15.6, ISZ.jw / 2], [13.05, ISZ.jw / 2]], 28)), 'bronze'), () => [ISZ.j0, ISZ.j1].map((z) => M(V(0, INT_SHAFT_Y, z), Y)));
def('ishaft-thrust', () => new Part().add(lathe([[9.1, -1], [19, -1], [19, 1], [9.1, 1]], 28), 'bronze'), () => [ISZ.j1 - ISZ.jw / 2 - 1.05, ISZ.j1 + ISZ.jw / 2 + 1.05].map((z) => M(V(0, INT_SHAFT_Y, z), Z)));
def('ishaft-circlips', () => new Part().add(lathe([[9.05, -0.6], [11.5, -0.6], [11.5, 0.6], [9.05, 0.6]], 20), 'darkSteel'), () => [ISZ.j0 - ISZ.jw / 2 - 0.7, ISZ.j0 + ISZ.jw / 2 + 0.7, ISZ.j1 - ISZ.jw / 2 - 2.8, ISZ.j1 + ISZ.jw / 2 + 2.8].map((z) => M(V(0, INT_SHAFT_Y, z), Z)));
def('ishaft-stopper', () => new Part().add(cyl(3, 10, 12).translate(0, 5, 0), 'steel'), () => [M(V(0, INT_SHAFT_Y + 19.1, ISZ.j1 + ISZ.jw / 2 + 6), Y)]);
def('case-roll-pin', () => pin(4, 16, 'darkSteel'), () => [M(V(-8, INT_SHAFT_Y - 40, -190), X)]);
def('spray-jets', () => { const p = new Part(); p.add(hexNut(10, 5).translate(0, 2.5, 0), 'brass'); p.add(cylBetween([0, 5, 0], [0, 12, 0], 2, 8), 'brass'); p.add(cylBetween([0, 12, 0], [8, 18, 0], 1.6, 8), 'brass'); return p; },
  () => CYLS.map((c) => { const s = bankOf(c); return M(V(s * 70, -60, CYL_Z[c] + 15 * s), V(s, 0.6, 0).normalize(), V(0, 0, 1)); }));
def('relief-plugs', () => {
  const p = new Part();
  p.add(lathe([[8.2, 0], [13.5, 0], [13.5, 1.6], [8.2, 1.6]], 28), 'copper');
  p.add(lathe([[6.4, 1.6], [11.2, 1.6], [11.2, 3.2], [6.4, 3.2]], 24), 'zincPlate');
  p.add(hexNut(19, 8).translate(0, 3.2 + 4, 0), 'zincPlate');
  p.add(cyl(7.2, 12, 16).translate(0, -6, 0), 'zincPlate');
  return p;
}, () => [V(-45, 0, -160), V(45, 0, 165)].map((p) => onSurf(p.x < 0 ? 'crankcase-left' : 'crankcase-right', V(p.x, -300, p.z), Y)));
def('relief-pistons', () => {
  const p = new Part();
  // hollow cup, open toward +Y (into the bore after the placement flip), spring inside the cup
  p.add(lathe([[3.2, 0], [7.4, 0], [7.6, 2], [7.6, 16], [6.2, 17], [3.2, 17]], 20), 'steel');
  p.add(lathe([[0.1, 1], [3.2, 1], [3.2, 16], [0.1, 16]], 16), 'bore');
  p.add(spring(4.2, 1.15, 2, 15, 6), 'darkSteel');
  return p;
}, () => [V(-45, 0, -160), V(45, 0, 165)].map((q) => { const m = onSurf(q.x < 0 ? 'crankcase-left' : 'crankcase-right', V(q.x, -300, q.z), Y); return m.multiply(new THREE.Matrix4().makeTranslation(0, 14, 0).premultiply(new THREE.Matrix4().makeRotationX(Math.PI))); }));
def('case-oil-fittings', () => { const p = new Part(); p.add(lathe([[0.1, 0], [12, 0], [12, 3], [0.1, 3]], 24), 'copper'); p.add(hexNut(27, 12).translate(0, 9, 0), 'zincPlate'); p.add(lathe([[7, 15], [10, 15], [9, 19], [7, 19]], 20), 'brass'); p.add(hexNut(22, 14).translate(0, 22, 0), 'zincPlate'); p.add(cyl(7.5, 30, 14).translate(0, 44, 0), 'steel'); return p; },
  () => [onSurf('crankcase-left', V(-62, -300, -110), Y), onSurf('crankcase-right', V(34, -300, -165), Y)]);
def('case-connection-left', () => sender(10, 6, 22, 'zincPlate'), () => [onSurf('crankcase-left', V(-62, -300, 160), Y)]);
def('oil-temp-sensor', () => sender(8, 18, 22), () => [onSurf('crankcase-right', V(33, -300, -120), Y)]);
def('oil-pressure-sender', () => { const p = sender(15, 3, 22, 'satinBlack'); p.add(lathe([[7.2, -1.5], [11, -1.5], [11, 0], [7.2, 0]], 24), 'copper'); return p; }, () => [onSurf('crankcase-right', V(40, 300, 150), V(0, -1, 0))]);
def('oil-pressure-switch', () => sender(12, 3, 24, 'satinBlack'), () => [onSurf('crankcase-right', V(64, 300, 120), V(0, -1, 0))]);
def('oil-pressure-fitting', () => { const p = banjo(); p.add(lathe([[0.1, 23], [6, 23], [6, 26], [0.1, 26]], 16), 'brass'); return p; }, () => [onSurf('crankcase-right', V(64, 300, 160), V(0, -1, 0))]);
def('thermostat-oring', () => oring(19, 1.8), () => [M(V(THERMO.x, THERMO.seatY - THERMO.grip - 4.8, THERMO.z), Y)]);
def('sump-drain-ring', () => washer(7, 11, 1.5, 'copper'), () => [M(V(0, SUMP.seatY - 9, SUMP.zc), V(0, -1, 0))]);
def('case-through-orings', () => oring(7.2, 1.2), () => fastenerSets().filter((f) => f.id.startsWith('case-through')).flatMap((f) => f.items.map((it) => M(it.p.clone().addScaledVector(it.n, -0.1), it.n.clone().negate()))));
def('oil-return-tubes', () => { const p = new Part(); const L = 150; p.add(cyl(7, L, 16).translate(0, L / 2, 0), 'steel'); p.add(torus(7.2, 1.6, 6, 24).rotateX(Math.PI / 2).translate(0, 6, 0), 'rubber'); p.add(torus(7.2, 1.6, 6, 24).rotateX(Math.PI / 2).translate(0, L - 6, 0), 'rubber'); return p; },
  () => [1, -1].flatMap((s) => [s > 0 ? [CYL_Z[1], CYL_Z[2]] : [CYL_Z[4], CYL_Z[5]], s > 0 ? [CYL_Z[2], CYL_Z[3]] : [CYL_Z[5], CYL_Z[6]]].map(([a, b2]) => M(V(s * (DECK_X + 6), -78, (a + b2) / 2), V(s, 0, 0)))));
def('oil-pump-seals', () => oring(9, 1.5), () => OIL_PUMP.seals.map(([x, y, z], i) => M(V(x, y, z), i < 2 ? Y : Z)));

def('oil-cooler-seals', () => oring(9.75, 1.25, 'copper'), () => OIL_COOLER.ports.filter((q) => q[2] === 0).map(([y, z]) => M(V(OIL_COOLER.faceX - 1.45, y, z), X)));
def('oil-cooler-seal-riser', () => oring(11.25, 1.75, 'copper'), () => OIL_COOLER.ports.filter((q) => q[2] === 1).map(([y, z]) => M(V(OIL_COOLER.faceX - 1.95, y, z), X)));

// ===== cylinders / heads =====
def('cyl-base-gaskets', () => washer(48.6, 52, 0.25, 'gasket'), () => CYLS.map((c) => posed(`cylinder-${c}`, [0.05, 0, 0], [1, 0, 0])));
def('head-seals', () => washer(48, 50.5, 1.2, 'copper'), () => CYLS.map((c) => posed(`cylinder-${c}`, [CYL_TOP_X - DECK_X - 1.3, 0, 0], [1, 0, 0])));
def('head-dowels', () => pin(4, 12), () => CYLS.flatMap((c) => [-40, 40].map((z) => posed(`head-${c}`, [HEAD_OUT_X - CYL_TOP_X - 6, 0, z], [1, 0, 0]))));
def('exhaust-gaskets', () => gasketRing(circ(22), 5, 0.8), () => CYLS.map((c) => posed(`head-${c}`, [EXH_PORT.x - CYL_TOP_X, EXH_PORT.y - 0.8, 0], [0, -1, 0])));
def('intake-gaskets', () => {
  // Real paper, 0.5 mm, sitting on the head face (local y 0). The collision test caps erosion on sheets this thin.
  const sh = roundRect(42, 72, 10);
  sh.holes.push(circlePath(18) as THREE.Path);
  for (const sz of [28, -28]) sh.holes.push(circlePath(5.2, 0, sz) as THREE.Path);
  const g = extrudeC(sh, 0.5); g.rotateX(Math.PI / 2); g.translate(0, 0.25, 0);
  const flat = g.toNonIndexed(); flat.deleteAttribute('normal'); flat.computeVertexNormals();
  // Extrude leaves zero-area cap triangles; those false-positive against the intake studs.
  const P = flat.attributes.position;
  const kept: number[] = [];
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
  for (let i = 0; i < P.count; i += 3) {
    va.fromBufferAttribute(P, i); vb.fromBufferAttribute(P, i + 1); vc.fromBufferAttribute(P, i + 2);
    if (va.distanceTo(vb) < 1e-3 || vb.distanceTo(vc) < 1e-3 || vc.distanceTo(va) < 1e-3) continue;
    if (vb.clone().sub(va).cross(vc.clone().sub(va)).length() < 1e-3) continue;
    for (const k of [0, 1, 2]) { kept.push(P.getX(i + k), P.getY(i + k), P.getZ(i + k)); }
  }
  const clean = new THREE.BufferGeometry();
  clean.setAttribute('position', new THREE.Float32BufferAttribute(kept, 3));
  clean.computeVertexNormals();
  return new Part().add(clean, 'gasket');
}, () => CYLS.map((c) => posed(`intake-runner-${c}`, [0, 0, 0], [0, 1, 0])));
def('intake-boots', () => { const ri = SLEEVE.id / 2, ro = SLEEVE.od / 2; const p = new Part(); p.add(lathe([[ri, 0], [ro, 0], [ro, SLEEVE.len], [ri, SLEEVE.len]], 32), 'rubber'); return p; }, () => bootFrames().map((b) => frame(V(...b.origin), V(...b.axis), Y)));
def('intake-boot-clamps', () => hoseClamp(SLEEVE.od / 2, 8), () => clampFrames().map((c) => frame(V(...c.origin), V(...c.axis), Y)));
// injector O-rings: 106-00 #29 (insert), #30 (injector body), 107-10 #22 (insulator)
for (const [id, y, R] of [['injector-orings-a', 8, 7.4], ['injector-orings-b', 13, 7.4], ['injector-orings-c', 30, 7.4]] as const)
  def(id, () => oring(R, 1.4), () => CYLS.map((c) => posed(`injector-${c}`, [0, y, 0], [0, 1, 0])));

// ===== ignition / cooling =====
def('distributor-oring', () => oring(13.2, 1.55), () => [M(V(...distW(0, 63.1, 0)), V(...DIST_AXIS))]);
def('ignition-lead-holders', () => { const p = new Part(); p.add(box(14, 10, 20).translate(0, 5, 0), 'blackPlastic'); return p; }, () => [-1, 1].flatMap((s) => [-60, 60].map((z) => onSurf('upper-air-guide', V(s * 132, 400, z), V(0, -1, 0)))));
def('shroud-speed-nuts', () => { const p = new Part(); p.add(box(18, 1, 22).translate(0, 0.5, 0), 'darkSteel'); return p; }, () => LIP_Z.right.map((z) => M(V(SHROUD.bx - SHROUD.lipW / 2, SHROUD.skirtY, z), V(0, -1, 0))));
def('shroud-cover-plate', () => { const p = new Part(); const g = extrudeC(roundRect(60, 40, 5), 1.5); g.rotateX(Math.PI / 2); g.translate(0, 0.75, 0); p.add(g, 'satinBlack'); return p; }, () => [onSurf('upper-air-guide', V(50, 400, -120), V(0, -1, 0))]);
def('shroud-stopper', () => { const p = new Part(); p.add(lathe([[0.1, -3], [9, -3], [9, 0], [11, 0], [11, 2], [0.1, 2]], 18), 'rubber'); return p; }, () => [onSurf('upper-air-guide', V(-50, 400, -125), V(0, -1, 0))]);
def('alternator-strap', () => {
  const p = new Part();
  // From the bottom slip-ring stud, under the plenum, onto the housing barrel. Identity pose: points are world mm.
  const y = FAN.y;
  // Leave the right-hand slip-ring stud, stay above the shroud roof, then drop into the housing wall.
  p.add(tube([[52, y - 18, 180], [70, y - 16, 200], [76, y - 28, 218], [92, y - 98, 228]], 2.2, 8, 18), 'copper');
  return p;
}, () => [M(V(0, 0, 0), Y, X)]);

// ===== induction / exhaust composites =====
def('cold-start-valve', () => {
  const p = new Part();
  // O-ring on the boss face. Flange sits on the ring. Pan heads (107-10 #34/#35) bear on the flange;
  // the shanks run into the holes cut in the plenum boss.
  p.add(lathe([[7.2, 0], [14, 0], [14, 2], [7.2, 2]], 24), 'gasket');
  p.add(box(44, 3.2, 14).translate(0, 3.6, 0), 'castAlu');
  // Intermediate piece 911 110 264 00 (107-10 #32): a machined collar between the flange and the valve body.
  p.add(lathe([[12.2, 12], [15.2, 12], [15.2, 18], [12.2, 18]], 24), 'machinedAlu');
  p.add(lathe([[0.1, 2], [12, 2], [12, 8], [0.1, 8]], 24), 'castAlu');
  p.add(torus(11, 1.3, 6, 24).rotateX(Math.PI / 2).translate(0, 8.5, 0), 'rubber');
  p.add(lathe([[0.1, 9], [12, 9], [12, 42], [8, 46], [0.1, 46]], 24), 'zincPlate');
  p.add(box(14, 10, 12).translate(0, 50, 0), 'blackPlastic');
  for (const k of [-1, 1]) {
    const x = k * 16;
    // Shank from 8 mm inside the boss (local −Y) up to the flange top at y 5.2.
    p.add(cyl(2.4, 13.2, 10).translate(x, -1.4, 0), 'darkSteel');
    p.add(lathe([[2.6, 5.2], [5.2, 5.2], [5.2, 6.2], [2.6, 6.2]], 12).translate(x, 0, 0), 'darkSteel');
    p.add(lathe([[0.1, 6.2], [4.6, 6.2], [4.6, 8.0], [3.2, 8.8], [0.1, 8.8]], 16).translate(x, 0, 0), 'zincPlate');
  }
  csvPortLocalGeometry(p);
  return p;
}, () => [csvPoseMatrix()]);
def('aux-air-valve', () => {
  const p = new Part();
  // Bosch auxiliary-air regulator 911 606 102 04. Rectangular body; barbs stay at local x ±26 so the hose seats do not move.
  p.add(boxMM([-16, 2, -12], [16, 30, 12]), 'castAlu');
  p.add(boxMM([-14, 0, -10], [14, 2.4, 10]), 'zincPlate');
  p.add(cylBetween([16, 16, 0], [26, 16, 0], 9, 14), 'castAlu');
  p.add(cylBetween([-16, 16, 0], [-26, 16, 0], 9, 14), 'castAlu');
  for (const k of [-1, 1]) {
    p.add(hexNut(10, 4).translate(k * 14, 5, 0), 'zincPlate');
    p.add(lathe([[3.2, 0.15], [5.5, 0.15], [5.5, 1.05], [3.2, 1.05]], 12).translate(k * 14, 0, 0), 'darkSteel');
  }
  return p;
}, () => [aavMatrix()]);
def('additional-air-valve', () => {
  const p = new Part();
  // 911 110 273 00 (107-10 #39, tags -80). Support #40 and two spring washers #41. Vacuum barb is ADD_AIR_VAC.
  const [tx, ty, tz] = ADD_AIR_VAC.tip;
  // Flywheel of the right-bank injector ribbon. The support hangs in that same pocket.
  p.add(boxMM([90, 292, -236], [118, 308, -214]), 'castAlu');
  p.add(cylBetween([90, 300, -224], [78, 300, -224], 8, 12), 'castAlu');
  p.add(cylBetween([118, 300, -224], [130, 300, -224], 8, 12), 'castAlu');
  p.add(cylBetween([104, 300, -214], [tx, ty, tz], 3.4, 10), 'brass');
  p.add(boxMM([96, 268, -232], [112, 294, -218]), 'zincPlate');
  for (const x of [100, 108]) {
    p.add(hexNut(8, 3).translate(x, 270, -225), 'zincPlate');
    p.add(lathe([[2.6, 0], [4.6, 0], [4.6, 1], [2.6, 1]], 12).translate(x, 268.2, -225), 'darkSteel');
  }
  return p;
}, () => [new THREE.Matrix4()]);
def('aux-air-plumbing', () => auxAirPlumbingPart(), () => [new THREE.Matrix4()]);
def('vacuum-limiter', () => { const p = new Part(); p.add(lathe([[0.1, 0], [16, 0], [16, 20], [0.1, 20]], 24), 'satinBlack'); p.add(cylBetween([0, 10, 0], [22, 10, 0], 3.6, 10), 'blackPlastic'); p.add(cyl(4.2, 5, 12).translate(0, 23, 0), 'zincPlate'); p.add(hexNut(10, 5).translate(0, 28, 0), 'zincPlate'); p.add(lathe([[3.6, 20], [6.2, 20], [6.2, 21.3], [3.6, 21.3]], 12), 'darkSteel'); return p; }, () => [M(V(...VAC_LIMIT.origin), Y)]);
def('vacuum-fittings', () => {
  const p = new Part();
  // Identity pose so the named vacuum hoses survive export (instancing drops mesh names).
  const [ox, oy, oz] = VAC_T.origin;
  // The T body is one fitting. Its primitives cross on purpose; they are not separate parts.
  const t = new THREE.Group();
  t.name = 'fitting:vac-t';
  t.add(mesh(cylBetween([ox - 14, oy, oz], [ox + 14, oy, oz], 3.6, 10), 'blackPlastic'));
  t.add(mesh(cylBetween([ox, oy, oz], [ox, oy, oz + 16], 3.6, 10), 'blackPlastic'));
  // Elbow up. The hose seat is vacTPorts().plusZ; a straight leg would meet the throttle flange.
  t.add(mesh(cylBetween([ox, oy, oz + 16], [ox, oy, oz + 22], 2.8, 10), 'brass'));
  t.add(mesh(cylBetween([ox, oy, oz + 20], [10, 274, 76], 2.8, 8), 'brass'));
  // Last 8 mm is along +Y so the hose seat is a flat face on vacTPorts().plusZ.
  t.add(mesh(cylBetween([10, 274, 76], [10, 282, 76], 2.8, 8), 'brass'));
  // Spare −Z leg of the tee. The diverter hose seats on the handoff nipple, not here.
  t.add(mesh(cylBetween([ox, oy, oz], [ox, oy, oz - 14], 2.8, 8), 'brass'));
  // Rings around the barbs, inboard of each tip so the hose ray meets the barb face.
  const xRing = torus(4.2, 0.7, 6, 14).rotateY(Math.PI / 2);
  t.add(mesh(xRing, 'zincPlate', [ox - 4, oy, oz]));
  t.add(mesh(xRing.clone(), 'zincPlate', [ox + 10, oy, oz]));
  t.add(mesh(torus(4.2, 0.7, 6, 14), 'zincPlate', [ox, 276, 78]));
  t.add(mesh(torus(4.2, 0.7, 6, 14).rotateX(Math.PI / 2), 'zincPlate', [ox, oy, oz - 6]));
  p.g.add(t);
  // Handoff nipple for Bottom End's air-hose-vacuum. No hose mesh leaves this barb.
  // Tip stays at TEE_AIR_INJ. The clamp ring's lower edge is 5.3 mm above that tip
  // (centre iy+6, tube r 0.7), so a rubber cap can grip more than 5 mm of free barb.
  // The root stops at iy+8, under the air-cleaner shell.
  const inj = new THREE.Group();
  inj.name = 'fitting:vac-airinj';
  const [ix, iy, iz] = TEE_AIR_INJ.point;
  inj.add(mesh(cylBetween([ix, iy + 8, iz], [ix, iy, iz], 2.8, 10), 'brass'));
  inj.add(mesh(torus(4.2, 0.7, 6, 14).rotateX(Math.PI / 2), 'zincPlate', [ix, iy + 6, iz]));
  p.g.add(inj);
  p.g.add(vacuumCluster().g);
  p.g.add(vacuumHosesPart().g);
  return p;
}, () => [new THREE.Matrix4()]);
def('airbox-clamps', () => {
  const p = new Part();
  // S 85/9. The meter clamp is this prototype scaled to S 131/9.
  // Major radius leaves about 1.5 mm of air on both the Ø85 boot and, once scaled, the Ø131 boot.
  const R = 42.5 + 3.0;
  p.add(torus(R, 1.15, 8, 28).rotateX(Math.PI / 2), 'zincPlate');
  p.add(box(4, 5, 4).translate(R + 2, 0, 0), 'zincPlate');
  p.add(hexNut(7, 3).translate(R + 3.2, 3, 0), 'zincPlate');
  return p;
}, () => airGuideClampMatrices());
def('injection-banjos', () => banjoProto(), () => injectorBanjoMatrices());
def('injection-line-rings', () => washer(4, 5.75, 1.2, 'copper'), () => sealRingFrames().map(({ p, n }) => M(V(...p), V(...n))));
def('injection-line-bracket', () => {
  const p = new Part();
  // One fitting: angle bracket #26, U-clamp #27, nut #28, spring washer #29,
  // plus the blower-hose clamps from 108-10 (the blower itself is not modelled).
  const g = new THREE.Group();
  g.name = 'fitting:line-bracket';
  const put = (geo: THREE.BufferGeometry, mat: 'zincPlate' | 'darkSteel') => g.add(mesh(geo, mat));
  put(box(28, 2.2, 18).translate(0, 1.1, 0), 'zincPlate');
  put(box(3, 16, 18).translate(-12, 10, 0), 'zincPlate');
  put(box(16, 3, 4).translate(-2, 16, -7), 'zincPlate');
  put(box(16, 3, 4).translate(-2, 16, 7), 'zincPlate');
  put(box(16, 3, 18).translate(-2, 12, 0), 'zincPlate');
  put(hexNut(10, 3.2).translate(6, 4.6, 0), 'zincPlate');
  put(lathe([[3.2, 2.2], [5.4, 2.2], [5.4, 3.3], [3.2, 3.3]], 12).translate(6, 0, 0), 'zincPlate');
  // 2×8/15 on the cyl 2–3 side, 2×11/15 and 12/15 beside them. Positions are E.
  put(torus(8, 0.9, 6, 16).rotateY(Math.PI / 2).translate(22, 24, -8), 'zincPlate');
  put(torus(8, 0.9, 6, 16).rotateY(Math.PI / 2).translate(22, 24, 10), 'zincPlate');
  put(torus(11, 0.9, 6, 16).rotateY(Math.PI / 2).translate(22, 36, 0), 'zincPlate');
  p.g.add(g);
  return p;
}, () => [M(V(LINE_CLIP.x, LINE_CLIP.y, LINE_CLIP.z), Y, X)]);
def('afm-screws', () => {
  const p = new Part();
  // Washer, compression spring, M6×25 pan head. The head stands on the spring; nothing enters the lid.
  p.add(lathe([[3.3, 0], [6.5, 0], [6.5, 1.2], [3.3, 1.2]], 16), 'zincPlate');
  p.add(spring(3.4, 0.7, 1.4, 8, 5), 'darkSteel');
  p.add(lathe([[2.8, 8.2], [5.6, 8.2], [5.6, 11.2], [2.2, 12.4], [2.2, 8.2]], 16), 'zincPlate');
  return p;
}, () => afmScrewMatrices());
def('throttle-housing', () => throttleHousingPart(), () => [new THREE.Matrix4()]);
def('air-guide', () => { const p = new Part(); p.addObj(airGuidePart()); return p; }, () => [new THREE.Matrix4()]);
def('wur-lines', () => { const p = new Part(); p.addObj(wurLinesPart()); return p; }, () => [new THREE.Matrix4()]);
def('throttle-linkage', () => { const p = new Part(); p.add(box(16, 2, 12).translate(0, 1, 0), 'zincPlate'); for (const k of [-1, 1]) p.add(lathe([[3.2, 2], [5.2, 2], [5.2, 9], [3.2, 9]], 12).translate(k * 5, 0, 0), 'bronze'); p.add(box(14, 3, 3.5).translate(7, 11, 0), 'zincPlate'); p.add(lathe([[3, 9], [6.5, 9], [6.5, 10.4], [3, 10.4]], 12), 'zincPlate'); p.add(cylBetween([7, 11, 0], [24, 16, 32], 2.1, 8), 'zincPlate'); p.add(spring(2.2, 0.65, 6, 18, 7).translate(-6, 0, 3), 'darkSteel'); for (const k of [-1, 1]) { p.add(hexNut(8, 3.2).translate(k * 5, 11, 0), 'zincPlate'); p.add(lathe([[2.5, 2], [4, 2], [4, 3.1], [2.5, 3.1]], 10).translate(k * 5, 0, 0), 'darkSteel'); } return p; }, () => [M(V(42, 236.6, 114), Y, X)]);
def('airbox-straps', () => { const p = new Part(); p.add(box(16, 1.6, 86).translate(0, 0.8, 0), 'zincPlate'); p.add(hexNut(8, 3.2).translate(0, 3.4, 0), 'zincPlate'); p.add(lathe([[3.2, 1.6], [5.2, 1.6], [5.2, 2.4], [3.2, 2.4]], 12), 'darkSteel'); return p; }, () => [-90, 90].map((x) => M(V(x, airCleanerLayout().crown + 1.8, AIRBOX.z), Y, X)));
def('airbox-fittings', () => { const p = new Part(); p.add(lathe([[0.1, 0], [18, 0], [18, 0.8], [0.1, 0.8]], 24), 'gasket'); p.add(hexNut(12, 5).translate(0, 6, 14), 'zincPlate'); p.add(lathe([[4, 0], [6.5, 0], [6.5, 1.2], [4, 1.2]], 12).translate(0, 0, 14), 'copper'); p.add(cylBetween([0, 2, 0], [0, 16, 0], 5, 12), 'blackPlastic'); p.add(cylBetween([0, 16, 0], [0, 28, 8], 4, 12), 'blackPlastic'); for (const y of [6, 18]) p.add(torus(6.2, 0.7, 6, 14).rotateX(Math.PI / 2).translate(0, y, 0), 'zincPlate'); return p; }, () => [M(V(airCleanerLayout().outerX + 1.2, AIRBOX.yMid - 16, AIRBOX.z + 16), X, Y)]);
def('muffler-hardware', () => {
  const p = new Part();
  // 202-00 #2/#3/#4/#5/#23 on the muffler inlet stubs. The converter has its own flanges.
  const ring = (r1: number, r2: number, t: number) => yToZ(lathe([[r1, 0], [r2, 0], [r2, t], [r1, t]], 24));
  // Aft of the exchanger outlet, which is still curving until z 318 and ends at z 334.
  // The rings and bolts sit on the muffler stubs (z 325–340), clear of that pipe.
  p.add(ring(30, 42, 1.2), 'gasket', [150, -185, 339]);
  p.add(ring(30, 36, 1), 'gasket', [-150, -185, 339]);
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
    const x = 150 + 48 * Math.cos(a), y = -185 + 48 * Math.sin(a);
    p.add(yToZ(cyl(3.2, 10, 8)), 'zincPlate', [x, y, 344]);
    p.add(yToZ(hexNut(13, 6)), 'zincPlate', [x, y, 350]);
  }
  // Band around the stub (torus already lies in XY). A ring stood on edge cut the exchanger outlet.
  for (const s of [1, -1]) p.add(torus(28, 1.6, 8, 24), 'zincPlate', [150 * s, -185, 338]);
  return p;
}, () => [new THREE.Matrix4()]);
def('heater-adapters', () => { const p = new Part(); p.add(lathe([[38, 0], [41, 0], [41, 30], [38, 30]], 32), 'aluminized'); p.add(torus(41.5, 2, 6, 32).rotateX(Math.PI / 2).translate(0, 15, 0), 'zincPlate'); p.add(cylBetween([41, 15, 0], [52, 15, 0], 3, 8), 'zincPlate'); return p; }, () => [-1, 1].map((s) => M(V(s * 180, -150, -250), V(0, 0, -1))));
/** Left heater-adapter mouth (axis −Z) and the body-side ferrule (mouth faces the hose, +Z). */
export const HEATER_HOSE_ENDS = {
  adapter: { tip: [-180, -150, -280] as V3, axis: [0, 0, -1] as V3 },
  ferrule: { tip: [-180, -170, -440] as V3, axis: [0, 0, 1] as V3 },
};
def('heater-hose', () => {
  const p = new Part();
  const a = HEATER_HOSE_ENDS.adapter.tip, b = HEATER_HOSE_ENDS.ferrule.tip;
  // Ferrule: the cabin duct is off the engine. Mouth (the tip) faces the adapter.
  p.add(cylBetween([b[0], b[1], b[2] - 18], b, 27, 16), 'aluminized');
  p.add(lathe([[27, 0], [33, 0], [33, 3], [27, 3]], 20).rotateX(Math.PI / 2).translate(b[0], b[1], b[2] - 16), 'zincPlate');
  const start: V3 = [a[0], a[1], a[2] - 0.35];
  const end: V3 = [b[0], b[1], b[2] + 0.35];
  const a1: V3 = [a[0], a[1], a[2] - 14];
  const b1: V3 = [b[0], b[1], b[2] + 14];
  for (const g of [cylBetween(start, a1, 26, 16), cylBetween(end, b1, 26, 16), tube([a1, [a[0], a[1] - 6, a[2] - 36], [b[0], b[1], b[2] + 28], b1], 26, 12, 20)]) {
    const me = mesh(g, 'aluminized');
    me.name = 'line:heater';
    p.g.add(me);
  }
  p.add(torus(28.5, 1.4, 6, 24).translate(a[0], a[1] - 3, a[2] - 16), 'zincPlate');
  p.add(torus(28.5, 1.4, 6, 24).translate(b[0], b[1], b[2] + 14), 'zincPlate');
  return p;
}, () => [new THREE.Matrix4()]);
def('muffler-bracket', () => { const p = new Part(); p.add(box(120, 4, 30).translate(0, 2, 0), 'zincPlate'); for (const k of [-1, 1]) { p.add(hexNut(13, 6.5).translate(k * 50, 7.5, 0), 'zincPlate'); p.add(lathe([[4.2, 4], [7.5, 4], [7.5, 5.2], [4.2, 5.2]], 12).translate(k * 50, 0, 0), 'darkSteel'); p.add(lathe([[4.2, -1.6], [8, -1.6], [8, 0], [4.2, 0]], 12).translate(k * 50, 0, 0), 'zincPlate'); p.add(cyl(4, 30, 8).translate(k * 50, -10, 0), 'zincPlate'); p.add(hexNut(13, 5.5).translate(k * 50, -25, 0), 'zincPlate'); } return p; }, () => [M(V(0, -300, -260), V(0, -1, 0))]);
def('pre-muffler', () => { const p = new Part(); p.add(boxMM([-110, -24, -40], [110, 24, 40]), 'aluminized'); for (const k of [-1, 1]) p.add(cylBetween([k * 110, 0, 0], [k * 170, 30, 40], 20, 16), 'aluminized'); p.add(cylBetween([0, 0, -40], [0, -10, -90], 22, 16), 'aluminized'); p.add(lathe([[20, 0], [24, 0], [24, 30], [20, 30]], 24).rotateX(-Math.PI / 2).translate(0, -10, -90), 'heatSteel'); for (const k of [-1, 1]) p.add(torus(22, 2, 6, 24).rotateY(Math.PI / 2).translate(k * 130, 10, 14), 'zincPlate'); p.add(lathe([[20, 0], [32, 0], [32, 1], [20, 1]], 24).rotateX(-Math.PI / 2).translate(0, -10, -120), 'gasket'); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; p.add(cylBetween([26 * Math.cos(a), -10 + 26 * Math.sin(a), -124], [26 * Math.cos(a), -10 + 26 * Math.sin(a), -116], 3, 8), 'zincPlate'); p.add(yToZ(hexNut(10, 5)), 'zincPlate', [26 * Math.cos(a), -10 + 26 * Math.sin(a), -126.5]); } for (const k of [-1, 1]) { p.add(cylBetween([k * 130, 36, 6], [k * 130, 36, 22], 3, 8), 'zincPlate'); p.add(yToZ(hexNut(10, 5)), 'zincPlate', [k * 130, 36, 24.5]); } for (const k of [-1, 1]) { p.add(lathe([[20, 0], [32, 0], [32, 1], [20, 1]], 24).rotateZ(Math.PI / 2).translate(k * 172, 30, 40), 'gasket'); } p.add(lathe([[4, 0], [12, 0], [12, 2], [4, 2]], 16).translate(0, 24, 0), 'zincPlate'); return p; }, () => [M(V(0, -250, -330), Y, X)]);
if (VARIANT.frontExhaust === 'catalytic-converter') {
  delete SMALL_GEOM['pre-muffler'];
  def('catalytic-converter', () => catalyticConverterPart(), () => [M(V(0, -250, -330), Y, X)]);
}
registerAncillarySmall(def);
void [box, HOUSING_Z1, INJ, seat, Y, Z, X];
