/* Build every part asset procedurally and write binary glTF (GLB) files to public/parts/.
 * Geometry is quantized + meshopt-compressed (EXT_meshopt_compression) to keep the download phone-friendly. */
import { writeFileSync, mkdirSync } from 'node:fs';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { WebIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, weld, dedup } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { ASSET_BUILDERS } from '../src/geo/assets';
import { consolidate } from '../src/geo/util';

// Minimal FileReader polyfill for GLTFExporter (binary mode) under Node.
(globalThis as any).FileReader = class {
  result: ArrayBuffer | null = null; onloadend: (() => void) | null = null;
  readAsArrayBuffer(b: Blob) { b.arrayBuffer().then((ab) => { this.result = ab; this.onloadend?.(); }); }
  readAsDataURL(b: Blob) { b.arrayBuffer().then((ab) => { (this as any).result = 'data:application/octet-stream;base64,' + Buffer.from(ab).toString('base64'); this.onloadend?.(); }); }
};

const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const raw = process.argv.includes('--raw');
mkdirSync('public/parts', { recursive: true });
const exporter = new GLTFExporter();
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new WebIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
let total = 0;
for (const [id, build] of Object.entries(ASSET_BUILDERS)) {
  if (only.length && !only.includes(id)) continue;
  const obj = consolidate(build(), id);
  const glb = new Uint8Array((await exporter.parseAsync(obj, { binary: true })) as ArrayBuffer);
  let out = glb;
  if (!raw) {
    const doc = await io.readBinary(glb);
    // Default 14-bit positions match main, so unchanged meshes stay byte-identical.
    // The hollow crankcase is ~500 mm across, and 14-bit steps (~0.03 mm) stack past the 0.05 mm GLB check.
    // The left heater hose runs from the blower (x ≈ 340) out around the left exchanger (x ≈ −520),
    // so its box is ~1 m across and 14-bit steps (~0.06 mm) miss the same check.
    // The ignition leads run from the right cam cover (x ≈ 380) out to the coil ring (x ≈ −520).
    const quantizePosition = id === 'crankcase-left' || id === 'crankcase-right' || id === 'heater-hose-left' || id === 'ignition-leads' ? 16 : 14;
    await doc.transform(dedup(), weld(), meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizePosition }));
    out = await io.writeBinary(doc);
  }
  writeFileSync(`public/parts/${id}.glb`, Buffer.from(out));
  total += out.byteLength;
  let tris = 0; obj.traverse((o: any) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
  console.log(`${id.padEnd(28)} ${(out.byteLength / 1024).toFixed(0).padStart(6)} KB  ${Math.round(tris)} tris`);
}
console.log(`total ${(total / 1024 / 1024).toFixed(2)} MB`);
