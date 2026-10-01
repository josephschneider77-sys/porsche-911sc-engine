import { findCollisions } from '../tests/collide';
const [a, b, tol] = process.argv.slice(2);
const hits = findCollisions(Number(tol ?? 1), (id) => id === a || id === b);
for (const h of hits) console.log(h.a, h.b, h.tris, h.box.min.toArray().map((v) => v.toFixed(0)).join(','), '->', h.box.max.toArray().map((v) => v.toFixed(0)).join(','));
