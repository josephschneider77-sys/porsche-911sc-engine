# Porsche 911 SC 3.0 engine (Type 930/03, 1978): spec and parts reference

This is the brief the procedural model in `src/geo/` is built from. All geometry is modelled from scratch in Three.js. No catalogue scans or copyrighted images are embedded in the app. The catalogue illustrations were used only as a visual reference for part shapes, how parts are grouped, and the exploded layout. Every part's info panel shows its Porsche part number and catalogue illustration/position.

## 1. Headline specification

| Item | Value | Source |
|---|---|---|
| Engine type | 930/03 (RoW 911 SC coupé/targa 1978-79); 930/04 & /06 US/Cal | Porsche Kat 002 "Summary types" [P1]; production table [S4] |
| Layout | Air-cooled horizontally opposed 6, dry sump | [S1] [S2] |
| Displacement | 2994 cc | [S1] [S2] |
| Bore × stroke | 95.0 × 70.4 mm | [S1] [S2] [S3] |
| Compression | 8.5 : 1 | [S2] [S3] [S4] |
| Output | 132 kW / 180 PS @ 5500 rpm, 265 Nm @ 4200 rpm | [P1] [S4] |
| Crankcase | Two-piece pressure-cast aluminium, vertically split (the 2.7 used magnesium) | [S2] [S5] [W1] |
| Cylinders | Individual aluminium barrels with Nikasil bores | [S2] |
| Valve train | SOHC per bank, 2 valves/cyl, rocker arms on shafts, duplex chain drive with tensioners | [P1 103-05…103-15] [S6] |
| Crankshaft | Forged, 8 main bearings (7 split shells + nose bushing No. 8; No. 1 = thrust) | [P1 102-00] [W1] |
| Firing order | 1-6-2-4-3-5 | brief / workshop manual [W1] |
| Bank layout | Cyl. 1-3 right bank, 4-6 left bank; cyl. 1 at the pulley (fan) end | brief / [W1] |
| Fuel system | Bosch K-Jetronic (CIS): mixture control unit = air-flow meter + fuel distributor | [P1 107-00/107-10] [S2] |
| Cooling | 11-blade vertical fan on alternator shaft, belt from crank pulley | [S2] [P1 105-00] |
| Ignition | Breakerless CD, Bosch distributor 930 602 021 04 | [S2] [P1 901-00] |

### Dimensions used for modelling (mm)
Known dimensions are marked **K**. Values estimated from the catalogue illustrations' proportions and the known dimensions are marked *E*.

- Bore 95.0 **K**; stroke 70.4 **K** (crank radius 35.2); con-rod centre distance 127 *E*; piston compression height 38 *E*.
- Main journal Ø60 *E* (SC "larger mains"); rod journal Ø53 *E*; conrod weight groups 633-714 g **K** (102-00 #16).
- Bore spacing within a bank 118 *E*; bank offset 59 *E* (each throw between two mains; throw order from the pulley end 1-4-2-5-3-6).
- Crank throw phases (deg): 1:0, 6:60, 2:120, 4:180, 3:240, 5:300. With right-bank TDC at +X and left-bank TDC at −X, this gives firing TDCs every 120° in the order 1-6-2-4-3-5 (checked in `tests/layout.test.ts`).
- Cylinder: base-flange Ø116, fin OD 115, height 98 *E*. Head: 61 thick *E*. Cam axis 292 from the crank centreline *E*.
- Valves: intake Ø49, exhaust Ø41.5, stem Ø9 *E*; valve angles ~28° / ~32° *E*.
- Flywheel OD ~268 with 130-tooth ring gear *E*; clutch 225 *E*.
- Fan ~245 *E*; belt 9.5 × 725 **K** (105-00 #12).
- Timing chain pitch 3/8" (9.525) *E*. Cam drive (v3, see §8): crank gear 36 T : intermediate gear 48 T (module 2, 84 mm centres), intermediate sprockets 18 T, cam sprockets 27 T (pitch Ø82), idler 15 T — cam at ½ crank *E*.

## 2. Coordinate frame
+X is the car's right side (cylinders 1-3). +Y is up. +Z is the pulley/fan end (rear of the car). The crank axis is Z. Units are millimetres. See `src/data/layout.ts`.

## 3. Parts list by catalogue group (1978 911 SC application)
The part numbers come from the Porsche Classic parts catalogue **Kat 002, 911 1978-83** [P1]. Where the catalogue lists several numbers for a part, the number valid for model year 78 / engines up to the 1979 changeover (the "-79" entry) is used.

| Group / ill. | Pos | Part (model id) | Porsche P/N |
|---|---|---|---|
| **101-05 Crankcase, left** | 1 | Crankcase pair (`crankcase-left`) | 930 101 915 00 |
| | 3 | Head studs, lower (Dilavar) ×12 | 930 101 170 00 |
| | 37 | Breather lid (`breather-lid`) | 901 107 073 02 |
| | 38/39/41 | Oil strainer / gaskets / drain plug (`sump-plate`) | 930 107 314 00 / 930 101 391 01 / 911 107 176 03 |
| **101-10 Crankcase, right** | 1 | Crankcase pair (`crankcase-right`) | 930 101 915 00 |
| | 37 | Oil thermostat (`oil-thermostat`) | 930 107 765 00 |
| **102-00 Crankshaft** | 1 | Crankshaft (`crankshaft`) | 930 102 015 01 |
| | 2 | Flywheel (`flywheel`) | 930 102 204 00 |
| | 8 / 10 | Timing gear / distributor drive wheel (`crank-gears`) | 901 102 111 00 / 930 102 115 01 |
| | 12 | Crank pulley (`crank-pulley`) | 930 102 028 01 |
| | 16 | Connecting rod ×6 (`conrod-1…6`) | 930 103 015 5x |
| | 21-24 | Main bearing set (`main-bearings`) | 930 101 901 00 |
| **102-05 Cylinder with piston** | 1 | Cylinder + piston set ×6 (`cylinder-n`, `piston-n`) | 930 103 962 03 (Mahle) |
| | 2/3/4 | Rings / pin / circlip | 930 103 963 00 / 930 103 375 00 / N 012 278 1 |
| **103-00 Cylinder head** | 1 | Head ×6 (`head-n`) | 930 104 029 08 |
| | 9/10 | Intake / exhaust valve (`valves-n`) | 930 105 409 01 / 930 105 419 08 |
| | 13 | Valve spring set | 901 105 901 50 |
| **103-05 Cam housing / chain case** | 13 | Camshaft housing ×2 (`cam-housing-*`) | 930 105 021 00 |
| | 1/2 | Chain case L/R (`chain-housing-*`) | 930 105 061 02 / 930 105 062 01 |
| | 6/7 | Chain case lid L/R | 930 105 063 01 / 930 105 064 01 |
| | 17/19 | Valve covers (upper/lower) | 901 105 115 03 / 930 105 116 00 |
| **103-10 / 103-15 Valve control L/R** | 1 | Timing chain | 901 105 529 00 |
| | 42 | Camshaft L / R | 930 105 147 08 / 930 105 148 08 |
| | 38 | Cam sprocket | 901 105 546 02 |
| | 10 | Chain adjuster (tensioner) | 930 105 049 00 |
| | 44/48 | Rocker shaft / rocker arm ×12 | 901 105 342 04 / 930 105 043 00 |
| | 43 (103-15) | Intermediate shaft | 930 105 013 01 |
| **104-00 Lubrication** | 1 | Oil pump (`oil-pump`) | 911 107 008 01 |
| | 8 | Oil cooler (`oil-cooler`) | 911 107 041 00 |
| **105-00 Air cooling** | 1 | Fan housing (`fan-housing`) | 930 106 005 00 |
| | 6 | Impeller, 11 blades (`fan-impeller`) | 930 106 011 01 |
| | 8 / 12 | Fan pulley / V-belt 9.5×725 | 911 106 208 00 / 999 192 097 50 |
| **105-05 Air guide** | 1 | Upper air guide (`upper-air-guide`) | 930 106 041 00 (listed "-78, red"); black replacement PCG 106 041 04 |
| **902-05 Generator** | 1 | Alternator (`alternator`) | 911 603 120 02 |
| **106-00 Air cleaner (SC)** | 1-6 | Intake pipes, cyl. 1…6 | 911 110 420/470/480/440/450/490 06 |
| | 9/13/14 | Housing / filter / lid | 911 110 106 13 / 911 110 185 02 / 930 110 184 00 |
| **107-00 Mixture control unit** | 1/2 | Fuel distributor / air-flow meter | 911 110 967 00 / 911 110 965 00 |
| **107-10 K-Jetronic** | 21 / 23 / 54 | Injector ×6 / injection lines / warm-up valve | 911 110 225 01 / 911 110 093 11-12 / 911 606 105 09 |
| **901-00 Ignition** | 1 / 16 | Distributor / spark plugs ×6 | 930 602 021 04 / 999 170 162 90 |
| **202-00 Exhaust (SC)** | 1 / 26 | Silencer / heat exchangers ×2 | 930 111 022 00 / 930 211 025 01 |
| **301-00 Clutch** | 1 / 2 / 5 | Pressure plate / disc / ring gear | 915 116 001 27 / 915 116 011 19 / 911 116 239 00 |

The full registry, with descriptions, specs and explode vectors, is in `src/data/parts.ts`.

## 4. Teardown order (engine on stand)
Adapted from Pelican Parts / Wayne Dempsey, *101 Projects*, Project 12 "Engine Teardown" [W2], plus Joe Engineer's teardown write-up [W3] and the Pelican rebuild overview [W4]:

1. Clutch pressure plate and disc (9 bolts) → 2. Flywheel (9 bolts) → 3. Silencer → 4. Heat exchangers (6 port nuts per side) → 5. Air-cleaner lid and element → 6. Mixture control unit, injection lines and injectors → 7. Air distributor and intake pipes (6 flange nuts per side) → 8. V-belt and fan pulley (pulley nut) → 9. Fan housing with fan and alternator → 10. Distributor and plugs → 11. Upper air guide and oil cooler → 12. Crank pulley (centre bolt) → 13. Valve covers (8 upper + 12 lower nuts per bank) → 14. Chain-housing covers (10 right / 9 left lock nuts); with the covers off the tensioned chains are visible → 15. Chain tensioners and idler arms → 16. Cam sprockets and timing chains (on the real engine the chains hang slack round the intermediate shaft until the case is split; the viewer removes them here so they don't hang as rigid loops) → 17. Rocker arms and shafts (6 shaft screws + 6 nuts per bank) → 18. Camshafts → 19. Chain housings (5 nuts per side) → 20. Cam housings with heads (12 barrel nuts per bank; the heads and valves lift off with their cam housing as one unit, via the step's `carries` list, together with the 24 cam-housing-to-head nuts) → 21. Valves (bench, on the lifted unit) → 22. Heads off the cam housings (bench; the 24 cam-housing nuts) → 23. Cylinders → 24. Pistons → 25. Breather (2 nuts), thermostat (3 nuts), sump plate (12 nuts) → 26. Split the case (11 through-bolts, 13 through-bolt nuts, 24 perimeter nuts) → 27. Crank with rods → 28. Intermediate shaft and oil pump (4 nuts) → 29. Main bearing shells. The right case half stays on the stand.

The order is encoded in `src/data/teardown.ts` and checked in `tests/teardown.test.ts`.

## 5. Reference sources per group
**Catalogue (primary shape and part-number reference).** The text catalogue [P1] supplies the illustration numbers, positions and part numbers. The Design911 diagram pages reproduce the same Porsche illustrations and were used as the drawing reference:

| Group | Illustration | Diagram page |
|---|---|---|
| Crankcase L / R | 101-05 / 101-10 | https://www.design911.com/diagrams/d/39152/0 · https://www.design911.com/diagrams/d/39158/0 |
| Crankshaft, rods, flywheel, pulley | 102-00 | https://www.design911.com/diagrams/d/39154/0 |
| Cylinders & pistons | 102-05 | https://www.design911.com/diagrams/d/39155/0 |
| Cylinder heads & valves | 103-00 | https://www.design911.com/diagrams/d/39156/0 |
| Cam housing & chain case | 103-05 | https://www.design911.com/diagrams/d/39157/0 |
| Valve control (cam, rockers, chains) L / R | 103-10 / 103-15 | https://www.design911.com/diagrams/d/39159/0 · https://www.design911.com/diagrams/d/39160/0 |
| Oil pump / oil system | 104-00 | https://www.design911.com/diagrams/d/39161/0 |
| Fan, housing, belt | 105-00 | https://www.design911.com/diagrams/d/39165/0 |
| Air guide (shroud) | 105-05 | https://www.design911.com/diagrams/d/39166/0 |
| Air cleaner & intake pipes | 106-00 | https://www.design911.com/diagrams/d/39168/0 |
| Mixture control unit / K-Jetronic | 107-00 / 107-10 | https://www.design911.com/diagrams/d/39171/0 · https://www.design911.com/diagrams/d/39174/0 |
| Exhaust & heat exchangers | 202-00 | https://www.design911.com/diagrams/d/39189/0 |
| Clutch | 301-00 | https://www.design911.com/diagrams/d/39186/0 |
| Ignition / generator | 901-00 / 902-05 | [P1] text; generator drawing as used on Design911 electrical pages |

Stoddard and Rose Passion catalogue pages cross-check the same part numbers, e.g. crankshaft 930 102 015 08 superseding -01/-05 [S7].

**References**
- [P1] Porsche Classic, *Parts catalogue Kat 002, Type 911 model years 1978-1983* (PDF, 24.07.2017): https://files.porsche.com/f/332100/671335edce/kat002-e-911-83-katalog.pdf
- [S1] carspector, 1978 911 SC technical specifications: https://carspector.com/car/Porsche/020971/
- [S2] Supercar Nostalgia, *Porsche 911 SC Guide*: https://supercarnostalgia.com/blog/porsche-911-sc
- [S3] encyCARpedia, 911 SC 3.0 (1978-79): https://www.encycarpedia.com/us/porsche/78-911-sc-3-0-coupe
- [S4] Simon's 911 SC production data: https://adelgigs.com/911scproductiondata.shtml
- [S5] Pelican Parts, *Rebuilding Your Porsche 911 Engine* (101 Projects, Project 14): https://www.pelicanparts.com/techarticles/101_Projects_Porsche_911/14-Engine_Rebuild/14-Engine_Rebuild.htm
- [S6] Pelican Parts, Engine Rebuild Wizard (W. Dempsey): https://www.pelicanparts.com/cgi-bin/wizards/Parts_Wizard.cgi?command=step6&wizard_root=911_engine_rebuild
- [S7] Stoddard diagram, crankshaft/flywheel/conrod (911 78-83): https://www.stoddard.com/en/diagrams-porsche-911-1983-eu-3-0sc-coupe-manual-gearbox-5-speed/clutch-and-engine-flywheel-2315/crankshaft-flywheel-bearing-connecting-rod-bolt-connecting-rod-pulley-1182/93010201508-crankshaft-990030055
- [W1] Porsche 911 workshop manual 1972-83 technical data (via Renntech summary): https://www.yumpu.com/en/document/view/25703788/72-83-porsche-911-series-cd-repair-manual-renntech
- [W2] Pelican Parts, *Porsche 911 Engine Teardown* (101 Projects, Project 12): https://www.pelicanparts.com/techarticles/101_Projects_Porsche_911/12-Engine_Teardown/12-Engine_Teardown.htm
- [W3] Joe Engineer, *Porsche 911 Engine Teardown Part 2*: https://joe-engineer.com/porsche-911-engine-teardown-part-2-disassembly-to-shortblock/
- [W4] Pelican Parts, *911 Motor Rebuild Overview*: https://www.pelicanparts.com/techarticles/911_engine_rebuild/911_engine_rebuild1.htm
- Klassik ATS, *Oil pump & intermediate shaft*: https://www.klassikats.com/2020/12/27/oil-pump-intermediate-shaft-how-to-rebuild-your-air-cooled-porsche-engine/

## 6. Accuracy caveats
- Overall proportions and the dimensions marked *E* are estimates traced from the catalogue drawings and scaled to the known bore, stroke and component sizes. They are not measured CAD data.
- Bank offset, cam and valve angles, and gear and sprocket tooth counts are approximate.
- Cam chains are duplex 3/8" roller chains on duplex sprockets. Since v4 the slack run is wrapped round the idler sprocket (§9); the deflection is set by the model's geometry and is not a measured value. Chain-box size and shape are scaled from rebuild photos by chain-pitch counting (§8), not measured; wall draft and internal webs are simplified.
- The oil pump sits inside the case at the flywheel end (cyl. 6 bay), driven off the back of the intermediate shaft by the connecting shaft (factory side-section [W1], Klassik ATS). Its exact position and shape are simplified.
- The air-injection pump (108-00), engine carrier (109-00), oil lines and tank, heater blower (108-10), plug leads and wiring are not modelled.
- 1978 air guide: the catalogue lists the -78 part 930 106 041 00 as red. The model shows the later black part, as requested.

## 7. Visual fidelity pass (v2, photo-referenced)
The parts were compared against rebuild photos (joe-engineer.com 911 SC rebuild series, FVD, Design911 and Heritage product shots) and remodelled to match. The photos are reference only and are not shipped with the app.

**Materials:** `castAlu` (raw sand-cast aluminium, 0x96989a), `magnesium`, `finBlack` (satin-black cylinder fins), `forgedDark` (as-forged crank webs and rod beams), `polishedSteel` (journals), `yellowZinc` (pulleys and fasteners), `blackPaint`, and `aluminized` (heat exchangers). At load time the viewer adds a procedural sand-cast noise to cast and painted materials. It changes albedo and roughness and is evaluated in rest-pose space, so the texture stays fixed to the part when the engine explodes.

**Compression:** `scripts/export-glb.ts` writes GLBs with gltf-transform `dedup`, `weld` and meshopt compression (`--raw` turns this off). The viewer decodes them with `MeshoptDecoder`.

**Bottom end (PR 1):**
- Crankcase halves: hollow crank bay (not a constant-section slab) with seven main saddles plus the nose saddle in the pulley-end chain well. Each saddle is a web with a machined half-bore, a locating notch and two stud pads; the intermediate shaft has its own bore in every web. Cylinder spigots are open bores in the deck with four head-stud bosses. Through-bolt bosses, perimeter lugs, oil-gallery plugs, ribs, flywheel bell and the part-number pad are on the cast exterior. Main shells are steel-backed halves with locating tabs (bearing 1 thrust); bearing 8 is a steel nose bushing.
- Cylinders: rounded-square fin pack (16 fins, stud notches at the corners) in satin black, with a bare machined skirt and spigot.
- Heads: fins stacked along the cylinder axis, combustion chamber, spring-well cam face, and port bosses.
- Pistons: ring belt, recessed skirt, and a domed crown with valve reliefs.
- Conrods: forged beam, blended big end and bolted cap.
- Crankshaft: dark forged webs, polished journals and oil holes.

**Top end and cam drive (PR 2):**
- Duplex timing chains: two roller rows, inner and outer plates with a shared centre plate, pins.
- Duplex cam sprockets (36 T) with a lightening-hole web, flange, dowel and big nut. The intermediate shaft carries two duplex 24 T sprockets.
- Chain tensioner rebuilt as a layout: forged idler arm on a shaft, duplex 15 T idler sprocket on the slack run, a hydraulic adjuster below with a bolted flange and plunger, and plastic guide ramps on aluminium carriers.
- Chain housing and lid: outline traced from end-view photos (int-shaft lobe, cam boss, tensioner pocket). Perimeter bolt bosses with studs, washers and nuts; outer flange lip; external ribs; raised cam-sprocket dome with a machined plug; lid ribs; idler-shaft cap.
- Cam housings: continuous cam tunnel, rocker-shaft towers with machined faces, cover-seat rails with stud bosses, end bores, tunnel cover, oil-feed bosses.
- Valve covers: chamfered pan on a seat flange with bolt ears (3 per edge on the upper cover, 5 on the lower). The upper cover has two machined round bosses and raised cast PORSCHE lettering.
- Camshaft: polished lobes and journals on a dark shaft.

**Cooling, induction, exhaust and clutch (PR 3):**
- Fan housing: black-painted magnesium drum with a rolled intake bell, three raised bands, axial ribs, cast feet and stator spokes.
- Fan: 11 broad, twisted paddle blades on a pressed hub with a ring of holes. Fan and crank pulleys are yellow zinc, with a shim stack and hub bolts.
- CIS: black moulded air distributor with one ribbed lobe per intake pipe and a cast throttle/idle housing. The air cleaner is now the SC's round drum lying across the engine (lower half on the distributor, upper half = lid with snout and straps) with a cylindrical pleated element. The air-flow meter is a black-painted funnel with a brass sensor plate; the grey fuel distributor sits beside it.
- Heat exchangers: aluminised lofted heater box, lumpy over each primary, with a seam flange, 2-stud port flanges, entry sleeves and the heater-outlet adapter.
- Muffler: aluminised oval drum with a slight banana curve, seam flange and dished end caps.
- Flywheel: dark body, ground friction face, ring gear, balance drillings.
- 1978 upper air guide: the catalogue part is red (Joe's reference engine has a red/orange shroud). It is still shown black, as requested.

## 8. Cam drive, chain boxes and interference test (v3)
Joe's v2 review: the chain cover collided with the exhaust and the chain covers were far too big. The cam drive was re-sized from photos in Wayne Dempsey's *How to Rebuild and Modify Porsche 911 Engines 1965-1989*, using only public previews: the author's sample pages at 101projects.com and his Pelican Parts tech articles [S5] and *911 Carrera chain tensioners*. A public Porsche 1981 911 SC brochure / technical-data sheet on archive.org was used to cross-check the spec. Photos are reference only and are not in the repo.

**Method.** In the open-box photos (right chain housing with chain, both housings end-on, and the bare covers) the duplex-chain pin pitch (9.525 mm) was counted to get a px/mm scale (≈2.7 px/mm in the 1000-px views). Everything else was measured against it. Values are estimates (*E*).

| Item | v2 | v3 (*E*) |
|---|---|---|
| Cam sprocket | 36 T (pitch Ø109) | **27 T (pitch Ø82)**; photo chain-wrap Ø ≈ 80-85 |
| Int.-shaft sprockets | 24 T | **18 T**, inside the case chain well |
| Crank : int. gear | 36 : 48 | 36 : 48 (int. shaft at ¾ crank, so cam at ½ crank) |
| Chain box, end view | hull reaching x ≈ −16 … 372, y ≈ −200 … 80 (crossed the centreline, overlapped the other bank and sat on the heat exchanger) | **x 118 … 347, y −145 … 55** (≈229 × 200 mm): straight inner edge at \|x\| = 118, round end around the cam (r 55), floor rising from −145 at the tensioner corner to −58 under the cam |
| Box depth | 54 + dome | 70 mm from the case face (z 212 → 282), flat cover, low cam boss (5 mm) |
| Chain planes | z 221 / 239 (the two chains overlapped) | z 235 (left) / 258 (right), clear of the cam-housing end (z 222) and of each other |
| Tensioner | adjuster hanging vertically below the idler (to y ≈ −200, over the heat exchanger) | 15 T idler under the slack run at x ≈ 213 (v4: see §9); arm pivots outboard; adjuster lies inclined ~20° in the lower inner corner (x 104 … 183, y ≥ −145). In rebuild-pic10 the adjuster stands at ≈60°; at that angle this model's box floor would have to drop to ≈ −165, onto the heat exchanger, so the angle is a deliberate compromise |
| Oil pump | pulley end, in the chain path | flywheel end, cyl. 6 bay |

Inboard of x = 118 the chains run in a hollow cast **chain well** on the case face. It has top and bottom walls and a front plate flush with the covers, plus the bearing-8 boss. The well opens sideways into the bolted-on chain box. The heat exchanger's fresh-air inlet is now a forward stub low on the outboard side of its pulley-end cap, instead of a tube rising into the chain box.

**Interference test** (`tests/collisions.test.ts`, helper `tests/collide.ts`, CLI `npx tsx scripts/collisions.ts [tol]`):
1. Every registry part is built at its assembled pose and eroded 1 mm along its normals, so seated faces don't count.
2. Every pair with overlapping bounds is checked triangle-vs-triangle with three-mesh-bvh. Coincident coplanar faces are ignored.
3. The test fails on any intersecting pair not in the `MATING` allowlist. The allowlist has **JOINT** entries (real bolted, seated or meshing hardware; cam-drive joints are same-bank only) and explicitly listed **SIMPLIFIED** pre-v3 shortcuts such as the solid case interior, solid valve covers, shroud cut-outs and piston valve reliefs.
4. Extra assertions:
   - No cam-drive part ever touches the exhaust.
   - The left and right cam drives never touch each other.
   - Chain box, cover and tensioner each keep ≥ 10 mm of air to the heat exchanger. Current values (v4): box 25.3 / 28.4 mm, cover 26.8 / 26.8 mm, tensioner 52.7 / 51.5 mm (right / left).

Against the v2 geometry all 9 assertions fail.

## 9. Chain tensioning and fasteners (v4)
Joe's v3 review: the idler floated beside the chain without tensioning it, many bolts pointed the wrong way, and most of the engine's fasteners were missing.

### Tensioner
- The chain path (`chainPath()` in `src/geo/core.ts`) is a three-circle loop: crank-side intermediate sprocket, cam sprocket, and the 15 T idler wrapped **from the outside** on the return (slack) run. The idler centre is pushed 38 mm into the loop from the straight two-sprocket run (`IDLER_PUSH`). The chain pitch line wraps it by 36°, and 2 rollers of the 88-link chain sit in idler tooth gaps. Tooth phase on the idler, cam and intermediate sprockets is set so the gaps line up with the rollers.
- The links are placed by `chainPins()` along that path, so the rendered chain bends round the idler instead of running straight past it.
- The idler arm pivots on its shaft. Its tail carries a round pad, and the hydraulic adjuster's plunger dome touches that pad (contact gap 0.000 mm, plunger out 8.6 mm). The adjuster is held by a stud, washer and M8 nut on a mounting ear on the housing. Guide rails sit on the tight run (upper) and outside the slack run (lower).
- Both banks are mirrored. Heat-exchanger clearances are in §8 (tensioner ≥ 51 mm, box ≥ 25 mm).
- The teardown now shows the covers off (step 14) before the tensioners come out (step 15).
- `tests/tensioner.test.ts` checks, per bank:
  - wrapped from outside;
  - pitch-line deflection ≥ 10 mm at the idler station;
  - wrap ≥ 25°;
  - ≥ 2 rollers on the idler pitch circle;
  - plunger contact ≤ 0.5 mm with positive extension.

  The collision test separately enforces that the chain stays clear of the housing.

### Fasteners
Each set is its own removable registry part (system `hardware`, catalogue group "Fasteners & hardware"). Geometry is in `src/geo/fasteners.ts` and specs (counts, steps, catalogue references) are in `src/data/fastenerSpec.ts`.
- Each set exports as **one GLB** with one `InstancedMesh` per material (EXT_mesh_gpu_instancing, meshopt). The matching studs are added to the part they thread into (case, heads, cam housing, chain housing, case lugs, flywheel flange).
- Every item has a position, an axis `n` (pointing out of the joint, towards the head or nut), a seat part, and an `into` part.
- Totals: **254 nuts/bolts in 31 sets, plus 164 studs**. The GLB total went from 3.12 MiB to 3.38 MiB (58 → 89 files).

| Set | Qty | Size | Removed at step | Catalogue (ill. #pos part no. ×qty per engine) |
|---|---|---|---|---|
| `head-nuts-right` | 12 | M10 barrel nut + washer | cam-housings | 103-00 #17 901 104 382 02 ×24; 101-05 #3 930 101 170 00 ×12 |
| `head-nuts-left` | 12 | M10 barrel nut + washer | cam-housings | 103-00 #17 901 104 382 02 ×24; 101-05 #3 930 101 170 00 ×12 |
| `cam-housing-nuts-right` | 12 | M8 hex nut + washer | heads (lifted with `cam-housing-right`) | 103-05 #22 900 084 004 03 ×40; 103-00 #7 999 062 041 02 ×24 |
| `cam-housing-nuts-left` | 12 | M8 hex nut + washer | heads (lifted with `cam-housing-left`) | 103-05 #22 900 084 004 03 ×40; 103-00 #7 999 062 041 02 ×24 |
| `valve-cover-nuts-upper-right` | 8 | M8 hex nut + spring washer | valve-covers | 103-05 #25 900 076 025 02 ×34; 103-05 #14/15 999 062 009 02 / 999 062 010 02 ×34 |
| `valve-cover-nuts-upper-left` | 8 | M8 hex nut + spring washer | valve-covers | 103-05 #25 900 076 025 02 ×34; 103-05 #14/15 999 062 009 02 / 999 062 010 02 ×34 |
| `valve-cover-nuts-lower-right` | 12 | M8 hex nut + spring washer | valve-covers | 103-05 #25 900 076 025 02 ×34; 103-05 #14/15 999 062 009 02 / 999 062 010 02 ×34 |
| `valve-cover-nuts-lower-left` | 12 | M8 hex nut + spring washer | valve-covers | 103-05 #25 900 076 025 02 ×34; 103-05 #14/15 999 062 009 02 / 999 062 010 02 ×34 |
| `chain-cover-nuts-right` | 10 | M6 lock nut + washer | chain-covers | 103-05 #12 900 910 012 02 ×19; 103-05 #3 999 062 102 02 ×19 |
| `chain-cover-nuts-left` | 9 | M6 lock nut + washer | chain-covers | 103-05 #12 900 910 012 02 ×19; 103-05 #3 999 062 102 02 ×19 |
| `chain-housing-nuts-right` | 5 | M8 hex nut + washer | chain-housings | 103-05 #22 900 084 004 03 ×40 |
| `chain-housing-nuts-left` | 5 | M8 hex nut + washer | chain-housings | 103-05 #22 900 084 004 03 ×40 |
| `intake-nuts-right` | 6 | M8 lock nut + washer | intake | 106-00 #8 999 084 601 02 ×12; 103-00 #6 999 062 009 02 ×12 |
| `intake-nuts-left` | 6 | M8 lock nut + washer | intake | 106-00 #8 999 084 601 02 ×12; 103-00 #6 999 062 009 02 ×12 |
| `exhaust-nuts-right` | 6 | M8 brass nut | heat-exchangers | 202-00 #32/33 900 076 025 02 / 999 085 001 02 ×12; 103-00 #5 999 062 220 02 ×12 |
| `exhaust-nuts-left` | 6 | M8 brass nut | heat-exchangers | 202-00 #32/33 900 076 025 02 / 999 085 001 02 ×12; 103-00 #5 999 062 220 02 ×12 |
| `case-through-bolts` | 11 | M10x1 through-bolt + washer | split | 101-10 #25 930 101 173 02 ×11 |
| `case-through-nuts` | 13 | M10x1 cap nut + washer | split | 101-05 #26 930 101 172 01 ×13 |
| `case-perimeter-nuts` | 24 | M8 lock nut + washer | split | 101-05 #21 900 910 022 02 ×24; 101-10 #5 999 062 115 02 ×13 |
| `flywheel-bolts` | 9 | M10 flywheel bolt | flywheel | 102-00 #6 930 102 206 00 ×9 |
| `clutch-bolts` | 9 | M8 pan-head screw + lock ring | clutch | 301-00 #4 900 067 090 02 ×9 |
| `pulley-bolt` | 1 | M12x1.5x22 + washer | pulley | 102-00 #15 999 093 005 02 ×1 |
| `fan-pulley-nut` | 1 | M16x1 nut | belt | 105-00 #11 901 603 905 01 ×1 |
| `oil-pump-nuts` | 4 | M8 nut + tab washer | int-shaft | 104-00 #5 900 076 025 02 ×7 |
| `sump-nuts` | 12 | M6 nut + spring washer | externals | 101-05 #35 900 076 010 02 ×12 |
| `thermostat-nuts` | 3 | M6 lock nut + washer | externals | 101-10 #41 900 910 012 02 ×3 |
| `breather-nuts` | 2 | M6 nut + spring washer | externals | 101-10 #36 900 076 010 02 ×2 |
| `rocker-shaft-screws-right` | 6 | Pan-head screw | rockers | 103-15 #45 999 067 008 00 ×12 |
| `rocker-shaft-screws-left` | 6 | Pan-head screw | rockers | 103-10 #45 999 067 008 00 ×12 |
| `rocker-shaft-nuts-right` | 6 | Nut | rockers | 103-15 #47 901 105 376 02 ×12 |
| `rocker-shaft-nuts-left` | 6 | Nut | rockers | 103-10 #47 901 105 376 02 ×12 |

Placement sources:
- Pelican/Dempsey rebuild photos (head barrel nuts through the cam housing, case perimeter nuts and through-bolts, chain-housing interior nuts, tensioner ear).
- 101 Projects sample pages.
- Catalogue illustrations 101-05/10, 102-00, 103-00/05, 104-00, 106-00, 202-00, 301-00.
- Where no photo shows a station, the spacing is estimated (E) from the part outline.

`tests/fasteners.test.ts` checks:
- Count per set matches the spec (and the instance count in the GLB builder).
- **Normal to the seat:** rays parallel to the axis, fired at four points round the bearing face, all hit the seat part within 2 ± 0.6 mm, with face normal within 6° of the axis.
- **Seated:** the head or nut bears on the seat, neither floating nor buried.
- **Accessible side:** nothing of the seat part lies within head height + 3 mm along +n.
- **Thread reach:** the stud or bolt reaches into its `into` part.
- **Teardown:** every set is removed in its spec step, together with the part it holds or one step before it.

In the collision test, set × seat, set × into, and stud host × seat are auto-allowlisted as **JOINT**s. Overlaps between hardware and simplified solids (rocker-shaft hardware inside the solid valve covers, air-guide/fuel-line envelopes, the valve-spring stack passing the cam-housing nut stations) are listed explicitly as **SIMPLIFIED**.

Other fixes in this pass:
- The spark plug is moved to z 22 so no head stud runs through it (the old crankcase × spark-plug allowlist entry is removed).
- The pressure-plate fulcrum ring, which stood on edge, now lies flat.
- Fake nuts on the chain-well front plate and the vertical "perimeter" nuts are removed.
- The heat-exchanger flange is waisted round its two studs.

### Known v4 inaccuracies
- Chain-cover nuts: the catalogue gives 19 per engine. The 10 right / 9 left split is estimated; 3.2 photos show about 13 per side.
- The cam-housing-to-chain-housing end studs are not modelled. 5 of the 8 chain-housing nuts per side are modelled, on the case flange.
- Exhaust port nuts are all modelled as hex. The catalogue mixes hex and socket-head.
- Breather-lid nut positions are estimated.
- Not modelled as separate hardware: distributor clamp, fan-housing strap and alternator bolts, oil-cooler nuts, air-guide screws, main-bearing studs (inside the case), oil-pump internal bolts. The SC has no engine-mounted oil-filter console (the filter is on the body), so none is modelled.
- Conrod bolts, cam-sprocket bolt, idler and adjuster-ear nuts are part of their host meshes and are not checked by the fastener test.
- The valve-spring stack passes through the cam-housing nut stations (simplified springs).
- The 46° adjuster angle remains a compromise; the photos show about 60°.

