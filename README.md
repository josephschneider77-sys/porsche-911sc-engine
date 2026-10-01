# Porsche 911 SC 3.0 engine: interactive teardown

**Live:** https://josephschneider77-sys.github.io/porsche-911sc-engine/

A phone-friendly Three.js model of the 1978 Porsche 911 SC Type 930/03 air-cooled flat-six (2994 cc, 95 × 70.4 mm). Every part is modelled at real-world scale in millimetres. Shapes are traced from the Porsche parts-catalogue illustrations; see [`docs/engine-spec.md`](docs/engine-spec.md).

- **Disassemble** step by step in the workshop teardown order (34 steps, Next/Back).
- **Explode** slider for an animated exploded view.
- **Tap a part** to highlight it and see its name, description, specs, Porsche part number and catalogue illustration/position. From there you can **Hide**, **Isolate** or **Focus** it.
- **Parts list** grouped by system, following the catalogue groups 101-105, 106/107, 202, 301 and 901.
- Orbit, pinch-zoom and two-finger pan. **Reset** returns to the start.

## Develop
```bash
npm ci
npm run assets   # regenerate public/parts/*.glb from the procedural builders (src/geo)
npm run dev
npm test         # registry, teardown order, layout/firing order, geometry
npm run build
```

Deep links: `?explode=100`, `?step=12`, `?part=head-1`, `?isolate=crankshaft`.

## Structure
- `src/geo/`: procedural part builders (lathe, extrude, gear and sprocket shapes, tubes). Exported per part as GLB by `scripts/export-glb.ts`.
- `src/data/parts.ts`: part registry with catalogue references, placement and explode vectors.
- `src/data/teardown.ts`: disassembly sequence.
- `src/app/viewer.ts`: WebGL viewer (WebGL2/WebGL1 via three r170). No WebGPU required.

No scanned catalogue images are included. All geometry is original.
