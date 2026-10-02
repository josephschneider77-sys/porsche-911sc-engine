/**
 * Small parts (keys, pins, washers, shims, gaskets, O-rings, circlips, plugs, senders, clamps, fittings) as instanced
 * hardware sets. Prototypes are built with +Y as the "out of the seat" axis and the origin on the seat; `items`
 * gives one world matrix per piece. Counts/steps/claims live in data/smallSpec.ts; tests/smallParts check both agree.
 */
import * as THREE from 'three';
import { Part, lathe, cyl, torus, box, boxMM, hexNut, tube, extrudeC, roundRect, circlePath, circleShape, woodruffGeom, spring, yToZ, cylBetween, csgSub, csgUnion, mesh, type V3 } from './util';
import { manifoldSub } from './manifoldCut';
import { frame } from './instancing';
import { fastenerSets } from './fasteners';
import { partPose, seat, probe } from './probe';
import { VC_EXT, vcStuds, chainCoverBolts, CAM_NOSE, CAM_WEB, CHAIN_Z, CRANK_NOSE, HOUSING_Z0, HOUSING_Z1, CHAIN_LID, CHAIN_BOX_INNER_X, chainOutline, chainCaseFace, coverMatrix, tensionerLayout, railBolts, CH_Z0, CH_Z1 } from './core';
import { CAM_X, CYL_Z, DECK_X, CYL_TOP_X, HEAD_OUT_X, INT_SHAFT_Y, INJ, CASE_Z, MAIN_Z, bankOf, SPARK_HOLE_R, SPARK_TUBE_R } from '../data/layout';
import { LIP_Z, chainLidStations } from './stations';
import { plugCoverLocal, railJogs } from './valvetrain';
import { FLY_Z, EXH_PORT, THERMO, DIST_AXIS, distW, WUR, AIRBOX, SUMP, OIL_PUMP, OIL_COOLER, FAN, SHROUD, airCleanerLayout, airboxSnoutSamples, SNOUT_R } from './aux';
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
/**
 * One closed sheet. Stud ears are part of the outline, so the ring is not a
 * stack of floating discs. The upper gasket's plug bridges are the material
 * between separate windows, joined to both rails.
 */
function coverGasket(s: 1 | -1, up: boolean) {
  const L = CH_Z1 - CH_Z0 - 8;
  const halfL = L / 2;
  const studs = vcStuds(up, s);
  let outline = hull2([
    ...rectPts(58, L, 7),
    ...studs.flatMap((st) => earPts(st.x, st.y, 8)),
  ]);
  // Exhaust stems and the adjuster arms cross the head-side rail. Bulge the
  // outline past each jog and leave a slot inside it, so the ring stays closed.
  const railSlots: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const circles: { x: number; y: number; r: number }[] = [];
  const unions: THREE.Path[] = [];
  const unionYs: number[] = [];
  if (!up) {
    const extra: [number, number][] = [];
    for (const j of railJogs(s, false)) {
      const cy = (j.y0 + j.y1) / 2;
      const outer = j.sign * (j.reach + 8);
      if (Math.abs(cy) > halfL - 28) {
        // Cap station. The stem sits on the head side and the rocker crosses
        // near the cover centre. One hole around both, inside a bulged ear.
        // A rectangle through y = ±halfL is not a valid shape hole.
        const head = { x: j.sign * 25, y: cy, r: 15 };
        const rock = { x: j.sign * 8, y: cy, r: 14 };
        unions.push(unionCircles(rock, head));
        unionYs.push(cy);
        const yFar = Math.sign(cy) * (Math.abs(cy) + head.r + 8);
        extra.push(
          [j.sign * (25 + head.r + 6), cy],
          [j.sign * (25 + head.r + 6), yFar],
          [j.sign * (8 - rock.r - 6), yFar],
          [j.sign * (8 - rock.r - 6), cy],
        );
      } else {
        const head = j.sign * (j.reach - 1);
        // Across the bay as well: the arm crosses the cam-side frame, not only the head rail.
        const cam = -j.sign * 24;
        railSlots.push({
          x0: Math.min(head, cam),
          x1: Math.max(head, cam),
          y0: j.y0 - 3,
          y1: j.y1 + 3,
        });
        for (const y of [j.y0 - 2, cy, j.y1 + 2]) extra.push([outer, y]);
      }
    }
    if (extra.length) {
      outline = hull2([...outline, ...extra]);
      if (ringArea(outline) < 0) outline.reverse();
    }
  }
  if (ringArea(outline) < 0) outline.reverse();
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const st of studs) shape.holes.push(circlePath(3.4, st.x, st.y) as THREE.Path);
  const bites: THREE.BufferGeometry[] = [];
  if (up) {
    const plugs = (s > 0 ? [1, 2, 3] : [4, 5, 6])
      .map((c) => plugCoverLocal(c, 0))
      .filter((p) => Math.abs(p.y) < halfL - SPARK_HOLE_R - 4);
    const ys = plugs.map((p) => p.y).sort((a, b) => a - b);
    // Left flywheel rail: cylinder 6's stem and the intake rocker cross near y −163.
    // The window stops 10 mm short of the outline so the hole does not split the ring.
    const yLo = s < 0 ? -176 : -halfL + 16;
    let yHi = halfL - 16;
    const endLoc = plugCoverLocal(s > 0 ? 1 : 6, 0);
    const inboard = halfL - Math.abs(endLoc.y);
    const tubeClear = SPARK_TUBE_R + 4.2;
    if (inboard > -tubeClear && inboard < halfL) {
      const depth = Math.max(tubeClear, inboard + tubeClear);
      const endSign: 1 | -1 = endLoc.y > 0 ? 1 : -1;
      if (endSign > 0) yHi = halfL - depth - 8;
      const y0 = endSign * (halfL - depth);
      const y1 = endSign * (halfL + 8);
      bites.push(boxMM(
        [endLoc.x - tubeClear, Math.min(y0, y1), -4],
        [endLoc.x + tubeClear, Math.max(y0, y1), 4],
      ));
    }
    const bands = [yLo, ...ys.flatMap((y) => [y - 18, y + 18]), yHi];
    for (let i = 0; i < bands.length; i += 2) {
      const a = bands[i], b = bands[i + 1];
      if (b - a > 8) shape.holes.push(rectHole(0, (a + b) / 2, 52, b - a, 3));
    }
    // Larger than the cover hole: the seal flange (r = SPARK_HOLE_R + 0.12) crosses
    // this sheet, and the elbow swings off the axis beside the hole.
    for (const p of plugs) shape.holes.push(circlePath(SPARK_HOLE_R + 2.4, p.x, p.y) as THREE.Path);
  } else {
    // Diagonal webs, the same lean as the lower-cover ribs. Each window stays
    // inside the frame, including the flywheel end of the left bank.
    const ang = 0.72 * s;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const nx = -dy, ny = dx;
    const along = 36, across = 24;
    for (let k = -3; k <= 2; k++) {
      const cy = (k + 0.5) * 58;
      const corners: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      const pts = corners.reverse().map(([sx, sy]) => new THREE.Vector2(
        dx * sx * along / 2 + nx * sy * across / 2,
        cy + dy * sx * along / 2 + ny * sy * across / 2,
      ));
      const hitStem = railSlots.some((h) => Math.abs((h.y0 + h.y1) / 2 - cy) < 36)
        || unionYs.some((y) => Math.abs(y - cy) < 42);
      if (!hitStem) shape.holes.push(new THREE.Path(pts));
    }
    for (const h of circles) shape.holes.push(circlePath(h.r, h.x, h.y) as THREE.Path);
    for (const h of unions) shape.holes.push(h);
    for (const h of railSlots) {
      shape.holes.push(new THREE.Path([
        new THREE.Vector2(h.x0, h.y0),
        new THREE.Vector2(h.x0, h.y1),
        new THREE.Vector2(h.x1, h.y1),
        new THREE.Vector2(h.x1, h.y0),
      ]));
    }
  }
  let g: THREE.BufferGeometry = extrudeC(shape, 0.4);
  g.translate(0, 0, -0.25);
  // Top face points at the cover. A reversed patch erodes up into the lip.
  if (!g.attributes.normal) g.computeVertexNormals();
  {
    const P = g.attributes.position, N = g.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      const z = P.getZ(i), nz = N.getZ(i);
      if ((z > -0.2 && nz < -0.3) || (z < -0.3 && nz > 0.3)) N.setXYZ(i, -N.getX(i), -N.getY(i), -nz);
    }
    N.needsUpdate = true;
  }
  if (bites.length) g = manifoldSub(g, ...bites);
  return new Part().add(g, 'gasket');
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
/** Chain-adjuster cover (103-10/15 #29-#31) on the lid outside face: gasket, round seal, cover (engine frame). */
export function adjusterCoverPart(s: 1 | -1) {
  const c = adjusterCover(s); const p = new Part();
  p.add(yToZ(lathe([[11, 0], [29, 0], [29, 0.5], [11, 0.5]], 48)), 'gasket', [c.x, c.y, CHAIN_LID.top]);
  p.add(torus(16.5, 1.5, 8, 40), 'rubber', [c.x, c.y, CHAIN_LID.top + 1.8]);
  // flat annulus: top face stays at local z 3.5 so the three cover screws still seat. Centre hole r 11.
  p.add(yToZ(lathe([[11, 0.5], [30, 0.5], [30, 3.5], [11, 3.5]], 48)), 'castAlu', [c.x, c.y, CHAIN_LID.top]);
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
  def(`cam-shim-${b}`, () => { const sh = new THREE.Shape(); sh.absarc(0, 0, N.r + 8, 0, Math.PI * 2, false);
    const kb = N.key.b / 2 + 0.05, a = Math.asin(kb / (N.r + 0.05)); const bore = new THREE.Path();
    bore.absarc(0, 0, N.r + 0.05, Math.PI / 2 + a, Math.PI / 2 - a + 2 * Math.PI, false); bore.lineTo(kb, N.r + N.key.proud + 0.4); bore.lineTo(-kb, N.r + N.key.proud + 0.4); bore.closePath(); sh.holes.push(bore);
    const g = extrudeC(sh, N.shim); g.translate(0, 0, N.shim / 2); return new Part().add(g, 'steel'); }, () => [new THREE.Matrix4().makeTranslation(Xc, 0, zc + N.flange[1])]);
  def(`cam-thrust-washer-${b}`, () => washer(N.r + 0.2, 22, 2.5, 'bronze'), () => [M(V(Xc, 0, zc + N.flange[0] - 2.5), Z)]);
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
/** Adjuster cover centre: first point along the adjuster axis where an r 30 disc lies on the lid, clear of the cover nuts, the lid-centre studs and the lid bosses (build time). */
export function adjusterCover(s: 1 | -1) {
  const T = tensionerLayout(s); const b = bn(s);
  const blocks = [
    { x: T.adjBase.x + T.axis.x * 30, y: T.adjBase.y + T.axis.y * 30, r: 14 },
    { x: T.pivot.x, y: T.pivot.y, r: 14 },
  ];
  for (let d = 0; d <= 90; d += 2) for (const side of [0, 6, -6, 12, -12]) {
    const c = T.adjBase.clone().add(T.axis.clone().multiplyScalar(d)).add(new THREE.Vector2(-T.axis.y, T.axis.x).multiplyScalar(side));
    if (chainCoverBolts(s).some((q) => Math.hypot(q.x - c.x, q.y - c.y) < 30 + 12)) continue;
    // M8 lid-centre nuts (across-corners ~7.5) and the studs that the housing carries up to them
    if (chainLidStations(s).some((q) => Math.hypot(q.x - c.x, q.y - c.y) < 30 + 10)) continue;
    if (blocks.some((q) => Math.hypot(q.x - c.x, q.y - c.y) < 30 + q.r)) continue;
    let ok = true; for (let i = 0; i < 12 && ok; i++) { const a = (i / 12) * Math.PI * 2; const h = probe(`chain-housing-lid-${b}`, V(c.x + 30 * Math.cos(a), c.y + 30 * Math.sin(a), 400), V(0, 0, -1)); if (!h || Math.abs(h.point.z - CHAIN_LID.top) > 0.3) ok = false; }
    if (ok) return c;
  }
  throw new Error('adjusterCover: no spot');
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
  // Handoff nipple for Bottom End's air-hose-vacuum. No hose mesh leaves this barb. Top stays under the shell.
  const inj = new THREE.Group();
  inj.name = 'fitting:vac-airinj';
  const [ix, iy, iz] = TEE_AIR_INJ.point;
  inj.add(mesh(cylBetween([ix, iy + 6, iz], [ix, iy, iz], 2.8, 10), 'brass'));
  inj.add(mesh(torus(4.2, 0.7, 6, 14).rotateX(Math.PI / 2), 'zincPlate', [ix, iy + 2.2, iz]));
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
def('muffler-hardware', () => { const p = new Part(); p.add(lathe([[30, 0], [44, 0], [44, 1.2], [30, 1.2]], 32), 'gasket'); p.add(lathe([[30, -40], [36, -40], [36, -39], [30, -39]], 32), 'gasket'); for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; p.add(hexNut(13, 6.5).translate(38 * Math.cos(a), 4.5, 38 * Math.sin(a)), 'zincPlate'); p.add(cyl(4, 20, 8).translate(38 * Math.cos(a), 0, 38 * Math.sin(a)), 'zincPlate'); } for (const k of [-1, 1]) p.add(torus(30, 2.5, 6, 32).rotateX(Math.PI / 2).translate(k * 120, -30, 0), 'zincPlate'); return p; }, () => [M(V(0, -250, -330), V(0, 0, 1))]);
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
void [box, HOUSING_Z1, INJ, seat, Y, Z, X];
