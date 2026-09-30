/* Build every part asset procedurally and write binary glTF (GLB) files to public/parts/. */
import { writeFileSync, mkdirSync } from 'node:fs';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { ASSET_BUILDERS } from '../src/geo/assets';
import { consolidate } from '../src/geo/util';

// Minimal FileReader polyfill for GLTFExporter (binary mode) under Node.
(globalThis as any).FileReader = class {
  result: ArrayBuffer | null = null; onloadend: (() => void) | null = null;
  readAsArrayBuffer(b: Blob) { b.arrayBuffer().then((ab) => { this.result = ab; this.onloadend?.(); }); }
  readAsDataURL(b: Blob) { b.arrayBuffer().then((ab) => { (this as any).result = 'data:application/octet-stream;base64,' + Buffer.from(ab).toString('base64'); this.onloadend?.(); }); }
};

const only = process.argv.slice(2);
mkdirSync('public/parts', { recursive: true });
const exporter = new GLTFExporter();
let total = 0;
for (const [id, build] of Object.entries(ASSET_BUILDERS)) {
  if (only.length && !only.includes(id)) continue;
  const obj = consolidate(build(), id);
  const glb = (await exporter.parseAsync(obj, { binary: true })) as ArrayBuffer;
  writeFileSync(`public/parts/${id}.glb`, Buffer.from(glb));
  total += glb.byteLength;
  let tris = 0; obj.traverse((o: any) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
  console.log(`${id.padEnd(28)} ${(glb.byteLength / 1024).toFixed(0).padStart(6)} KB  ${Math.round(tris)} tris`);
}
console.log(`total ${(total / 1024 / 1024).toFixed(2)} MB`);
