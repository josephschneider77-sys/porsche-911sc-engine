import { findCollisions, allowedClash } from '../tests/collide';
const tol = Number(process.argv[2] ?? 1);
const t0 = Date.now();
const hits = findCollisions(tol);
for (const h of hits) {
  const c = h.box.getCenter(new (h.box.min.constructor as any)());
  console.log(`${allowedClash(h) ? 'ok  ' : 'BAD '} ${h.a} x ${h.b}  tris=${h.tris}  at (${c.x.toFixed(0)},${c.y.toFixed(0)},${c.z.toFixed(0)})`);
}
console.log(`${hits.length} pairs, ${hits.filter((h) => !allowedClash(h)).length} unexpected, ${Date.now() - t0} ms`);
