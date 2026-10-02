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

- Bore 95.0 **K**; stroke 70.4 **K** (crank radius 35.2); con-rod centre distance 127 *E* (127.8 mm is often cited; the model keeps 127 so the pistons do not move); piston compression height 38 *E*.
- Main journal Ø60 *E* (SC "larger mains"); rod journal Ø53 *E*; conrod weight groups 633-714 g **K** (102-00 #16).
- Bore spacing within a bank 118 *E*; bank offset 59 *E* (each throw between two mains; throw order from the pulley end 1-4-2-5-3-6).
- Crank throw phases (deg): 1:0, 6:60, 2:120, 4:180, 3:240, 5:300. With right-bank TDC at +X and left-bank TDC at −X, this gives firing TDCs every 120° in the order 1-6-2-4-3-5 (checked in `tests/layout.test.ts`).
- Cylinder: base-flange Ø116, fin OD 115, height 98 *E*. Head: 61 thick *E*. Cam axis 292 from the crank centreline *E*.
- Valves: intake Ø49, exhaust Ø41.5, stem Ø9 *E*; valve angles ~28° / ~32° *E*.
- Flywheel OD ~268 with 130-tooth ring gear *E*; clutch 225 *E*.
- Fan Ø226 **K** for 1978–79 (Pelican forum 428673; catalogue 930 106 011 01 is the -79 impeller and does not state 245 mm). Later cars are ~245 *E*. Belt 9.5 × 725 **K** (105-00 #12).
- Timing chain pitch 3/8" (9.525) *E*. Cam drive (see §16): crank gear 35 T : intermediate gear 60 T (module 168/95, 84 mm centres), intermediate sprockets 24 T, cam sprockets 28 T (pitch Ø85), idler 19 T — cam at exactly ½ crank. Bottom End signed off; tooth counts unverified against Dempsey, chosen for exact 2:1 with 24T/28T.

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
| **103-00 Cylinder head** | 1 | Head ×6 (`head-n`) | 930 104 019 05 |
| | 9/10 | Intake / exhaust valve (`valves-n`) | 930 105 409 13 / 930 105 419 08 |
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
| **901-00 Ignition** | 1 / 16 | Distributor / spark plugs ×6 | 930 602 021 04 / 999 170 170 90 |
| **202-00 Exhaust (SC)** | 1 / 26 | Silencer / heat exchangers ×2 | 930 111 022 00 / 930 211 025 01 |
| **301-00 Clutch** | 1 / 2 / 5 | Pressure plate / disc / ring gear | 915 116 001 27 / 915 116 011 19 / 911 116 239 00 |

The full registry, with descriptions, specs and explode vectors, is in `src/data/parts.ts`.

## 4. Teardown order (engine on stand)
Adapted from Pelican Parts / Wayne Dempsey, *101 Projects*, Project 12 "Engine Teardown" [W2], plus Joe Engineer's teardown write-up [W3] and the Pelican rebuild overview [W4]:

1. Clutch pressure plate and disc (9 bolts) → 2. Flywheel (9 bolts) → 3. Silencer → 4. Heat exchangers (6 port nuts per side) → 5. Air-cleaner lid and element → 6. Mixture control unit, injection lines and injectors → 7. Air distributor and intake pipes (6 flange nuts per side) → 8. V-belt and fan pulley (pulley nut) → 9. Fan housing with fan and alternator → 10. Distributor and plugs → 11. Upper air guide and oil cooler → 12. Crank pulley (centre bolt) → 13. Valve covers (8 upper hex nuts + 9 lower hex nuts + 3 special nuts per bank) → 14. Chain-housing covers (10 right / 9 left lock nuts); with the covers off the tensioned chains are visible → 15. Chain tensioners and idler arms → 16. Cam sprockets and timing chains (on the real engine the chains hang slack round the intermediate shaft until the case is split; the viewer removes them here so they don't hang as rigid loops) → 17. Rocker arms and shafts (6 shaft screws + 6 nuts per bank) → 18. Camshafts → 19. Chain housings (5 nuts per side) → 20. Cam housings with heads (12 barrel nuts per bank; the heads and valves lift off with their cam housing as one unit, via the step's `carries` list, together with the 24 cam-housing-to-head nuts) → 21. Valves (bench, on the lifted unit) → 22. Heads off the cam housings (bench; the 24 cam-housing nuts) → 23. Cylinders → 24. Pistons → 25. Breather (2 nuts), thermostat (3 nuts), sump plate (12 nuts) → 26. Split the case (11 through-bolts, 13 through-bolt nuts, 24 perimeter nuts) → 27. Crank with rods → 28. Intermediate shaft and oil pump (4 nuts) → 29. Main bearing shells. The right case half stays on the stand.

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
- The air-injection pump (108-00), engine carrier (109-00), oil lines and tank, heater blower (108-10), plug leads and wiring are not modelled. Illustration 108-00 (“Air injection”, model column 911 SC, model life 1978>>1983) lists a union per cylinder for the 1978 USA 930/04: position 18, 911 113 145 02 and 911 113 145 04, qty 6, and position 19, sealing ring 900 123 033 20, qty 6, A 10×13.5 CU, blank remark and model column. Those head fittings are not in this model.
- 1978 air guide: the catalogue lists the -78 part 930 106 041 00 as red. The model shows that orange-red part. The later black replacement is PCG 106 041 04.

## 7. Visual fidelity pass (v2, photo-referenced)
The parts were compared against rebuild photos (joe-engineer.com 911 SC rebuild series, FVD, Design911 and Heritage product shots) and remodelled to match. The photos are reference only and are not shipped with the app.

**Materials:** `castAlu` (raw sand-cast aluminium, 0x96989a), `magnesium`, `finBlack` (satin-black cylinder fins), `forgedDark` (as-forged crank webs and rod beams), `polishedSteel` (journals), `yellowZinc` (pulleys and fasteners), `blackPaint`, and `aluminized` (heat exchangers). At load time the viewer adds a procedural sand-cast noise to cast and painted materials. It changes albedo and roughness and is evaluated in rest-pose space, so the texture stays fixed to the part when the engine explodes.

**Compression:** `scripts/export-glb.ts` writes GLBs with gltf-transform `dedup`, `weld` and meshopt compression (`--raw` turns this off). The viewer decodes them with `MeshoptDecoder`.

**Bottom end (PR 1):**
- Crankcase halves: hollow crank bay whose section changes along the crank (flat top split flange with cast bosses, scalloped bottom edge, sloping shoulder, belly tucking inward, three proud spigot bosses) with seven main saddles plus the nose saddle in the pulley-end chain well. Each saddle is a thick web with a machined half-bore, a locating notch and two stud pads, set inboard of the spigot tunnels; the intermediate shaft has its own bore in every web. Cylinder spigots are open bores in individual bosses, with a machined counterbore ring and four head-stud bosses just outside it. Through-bolt bosses, perimeter nut lobes, oil-passage plugs, the round flywheel seal boss, the part-number pad and the sender / bolt / breather pads are on the cast exterior. The left-case oil-cooler mounting bosses are machined flush with the cooler-foot undersides (y 95), with the pad 0.2 mm under the foot and a spot face inside the stud hole. The crank bay, saddle webs, intermediate-shaft bores and the chain-well plate are open around the rotating parts; the flywheel seal land sits about 2 mm off the flywheel disk. Cast skin is a darker sand-cast tone; the flange, spigots and saddles are bright machined faces. Main shells are steel-backed halves with locating tabs (bearing 1 thrust); bearing 8 is a steel nose bushing.
- Cylinders: rounded-square fin pack (16 fins, stud notches at the corners) in satin black, with a bare machined skirt and spigot.
- Heads: fins stacked along the cylinder axis, combustion chamber, spring-well cam face, and port bosses.
- Pistons: ring belt, recessed skirt, and a domed crown with valve reliefs.
- Conrods: forged beam, blended big end and bolted cap.
- Crankshaft: dark forged webs, polished journals and oil holes.

**Top end and cam drive (PR 2):**
- Duplex timing chains: two roller rows, inner and outer plates with a shared centre plate, pins.
- Duplex cam sprockets (28 T) with a 17-hole vernier web, flange, dowel and big nut. The intermediate shaft carries two duplex 24 T sprockets.
- Chain tensioner rebuilt as a layout: forged idler arm on a shaft, duplex 19 T idler sprocket on the slack run, a hydraulic adjuster below with a bolted flange and plunger, and plastic guide ramps on aluminium carriers.
- Chain housing and lid: outline traced from end-view photos (int-shaft lobe, cam boss, tensioner pocket). Perimeter bolt bosses with studs, washers and nuts; outer flange lip; external ribs; raised cam-sprocket dome with a machined plug; lid ribs; idler-shaft cap.
- Cam housings: continuous cam tunnel, rocker-shaft towers with machined faces, cover-seat rails with stud bosses, end bores, tunnel cover, oil-feed bosses.
- Valve covers: chamfered pan on a seat flange with bolt ears (3 per edge on the upper cover, 5 on the lower). The upper cover has two machined round bosses and raised cast PORSCHE lettering.
- Camshaft: polished lobes and journals on a dark shaft.

**Cooling, induction, exhaust and clutch (PR 3):**
- Fan housing: unpainted dull-grey magnesium drum (deep barrel, circumferential grooves, five stator vanes, solid alternator cradle, yellow-zinc band clamp).
- Fan: 11 broad twisted blades on a large hub dish, Ø226. The yellow-zinc face plate (inner pulley half) is riveted to the fan; the outer half, six shims and the cupped cap come off with the belt.
- CIS: black moulded air distributor with one ribbed lobe per intake pipe and a cast throttle/idle housing. The air cleaner is now the SC's round drum lying across the engine (lower half on the distributor, upper half = lid with snout and straps) with a cylindrical pleated element. The air-flow meter is a black-painted funnel with a brass sensor plate; the grey fuel distributor sits beside it.
- Heat exchangers: aluminised lofted heater box, lumpy over each primary, with a seam flange, 2-stud port flanges, entry sleeves and the heater-outlet adapter.
- Muffler: aluminised oval drum with a slight banana curve, seam flange and dished end caps.
- Flywheel: dark body, ground friction face, ring gear, balance drillings.
- 1978 upper air guide: orange-red GRP (about #C04A30). The collar wraps the front of the fan housing; each wing has three stadium windows.

## 8. Cam drive, chain boxes and interference test (v3)
Joe's v2 review: the chain cover collided with the exhaust and the chain covers were far too big. The cam drive was re-sized from photos in Wayne Dempsey's *How to Rebuild and Modify Porsche 911 Engines 1965-1989*, using only public previews: the author's sample pages at 101projects.com and his Pelican Parts tech articles [S5] and *911 Carrera chain tensioners*. A public Porsche 1981 911 SC brochure / technical-data sheet on archive.org was used to cross-check the spec. Photos are reference only and are not in the repo.

**Method.** In the open-box photos (right chain housing with chain, both housings end-on, and the bare covers) the duplex-chain pin pitch (9.525 mm) was counted to get a px/mm scale (≈2.7 px/mm in the 1000-px views). Everything else was measured against it. Values are estimates (*E*).

| Item | v2 | v3 (*E*) |
|---|---|---|
| Cam sprocket | 36 T (pitch Ø109) | **28 T (pitch Ø85)**; FVD face count, chain-wrap Ø ≈ 80-85 |
| Int.-shaft sprockets | 18 T (ratio patch) | **24 T**, the published count; see §16 |
| Crank : int. gear | 36 : 48 | 36 : 48 (int. shaft at ¾ crank, so cam at ½ crank) |
| Chain box, end view | hull reaching x ≈ −16 … 372, y ≈ −200 … 80 (crossed the centreline, overlapped the other bank and sat on the heat exchanger) | **x 118 … 347, y −145 … 55** (≈229 × 200 mm): straight inner edge at \|x\| = 118, round end around the cam (r 55), floor rising from −145 at the tensioner corner to −58 under the cam |
| Box depth | 54 + dome | 70 mm from the case face (z 212 → 282), flat cover, low cam boss (5 mm) |
| Chain planes | z 221 / 239 (the two chains overlapped) | z 235 (left) / 258 (right), clear of the cam-housing end (z 222) and of each other |
| Tensioner | adjuster hanging vertically below the idler (to y ≈ −200, over the heat exchanger) | 15 T idler under the slack run at x ≈ 213 (v4: see §9); arm pivots outboard; adjuster lies inclined ~20° in the lower inner corner (x 104 … 183, y ≥ −145). In rebuild-pic10 the adjuster stands at ≈60°; at that angle this model's box floor would have to drop to ≈ −165, onto the heat exchanger, so the angle is a deliberate compromise |
| Oil pump | pulley end, in the chain path | flywheel end, cyl. 6 bay |

Inboard of x = 118 the chains run in a hollow cast **chain well** on the case face. It has top and bottom walls and a front plate flush with the covers, plus the bearing-8 boss. The well opens sideways into the bolted-on chain box. The heat exchanger's fresh-air inlet is now a forward stub low on the outboard side of its pulley-end cap, instead of a tube rising into the chain box.

**Interference test** (`tests/collisions.test.ts`, helper `tests/collide.ts`, CLI `npx tsx scripts/collisions.ts [tol]`):
1. Every registry part is built at its assembled pose and eroded 1 mm along its normals, so seated faces don't count. A sheet thinner than 0.55 mm is eroded by only 0.4 of its thickness, so 0.5 mm paper does not turn inside out.
2. Every pair with overlapping bounds is checked triangle-vs-triangle with three-mesh-bvh. Coincident coplanar faces are ignored, and so is an intersection that lies on one edge of each triangle (a shared seam). A segment that crosses a triangle is a real overlap; `tests/collisions.test.ts` checks that a 1 mm block overlap fails, a shared face does not, and two triangles that only share an edge do not.
3. The test fails on any intersecting pair not in the `MATING` allowlist. Bottom-end and ancillary entries stay only when the overlap is a real joint and the why names it (`threaded`, `pressed` or `seated`); an entry without that word fails. Head, cylinder, cam, valvetrain, cover and chain-drive lines are left as the top-end work wrote them, including the skirt and valve-relief shortcuts. Cam-drive joints are same-bank only.
4. Extra assertions:
   - No cam-drive part ever touches the exhaust.
   - The left and right cam drives never touch each other.
   - Chain box, cover and tensioner each keep ≥ 10 mm of air to the heat exchanger. Current values (v4): box 25.3 / 28.4 mm, cover 26.8 / 26.8 mm, tensioner 52.7 / 51.5 mm (right / left).

Against the v2 geometry all 9 assertions fail.

## 9. Chain tensioning and fasteners (v4)
Joe's v3 review: the idler floated beside the chain without tensioning it, many bolts pointed the wrong way, and most of the engine's fasteners were missing.

### Tensioner
- The chain path (`chainPath()` in `src/geo/core.ts`) is a three-circle loop: crank-side intermediate sprocket, cam sprocket, and the 19 T idler wrapped **from the outside** on the return (slack) run. The idler centre is pushed 38 mm into the loop from the straight two-sprocket run (`IDLER_PUSH`). Tooth phase on the idler, cam and intermediate sprockets is set so the gaps line up with the rollers. Link count and wrap are whatever `chainPins` / `chainPath` compute for those radii.
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
| `valve-cover-nuts-lower-right` | 9 | M8 hex nut + spring washer | valve-covers | 103-05 #25 900 076 025 02 ×34; 103-05 #14/15 999 062 009 02 / 999 062 010 02 ×34 |
| `valve-cover-nuts-lower-left` | 9 | M8 hex nut + spring washer | valve-covers | 103-05 #25 900 076 025 02 ×34; 103-05 #14/15 999 062 009 02 / 999 062 010 02 ×34 |
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
- The valve-spring stack passes through the cam-housing nut stations (simplified springs). Fixed in the top-end batch: the stack clears those nuts (see §11).
- The 46° adjuster angle remains a compromise; the photos show about 60°.


## 10. Every part (v5)
Joe's request: "every detail, every part". For example, the half-moon (Woodruff) key in the camshaft keyway and the sprocket held on by its nut.

### What was added
- **Registry:** 129 → 266 parts. 31 → 59 fastener sets (254 → 324 nuts/bolts/screws, 164 → 207 studs). There are now 100 small-part sets (235 instances); each one is its own removable part. Specs, counts, steps and catalogue references live in `src/data/smallSpec.ts`; geometry is in `src/geo/smallParts.ts`.
- **Cam nose (each bank):**
  - Woodruff key `cam-key-*` (103-10/15 #37), 4 × 5 × 10 mm, seated in a keyway cut into the nose.
  - Thrust washer (#34) and sprocket flange.
  - Alignment shim (#35), locating pin (#39), sprocket, spring washer and M22×1.5 nut (`cam-nut-*`).
  - Teardown order is enforced as nut → sprocket → flange → key → camshaft.
- **Crank nose:** Woodruff key, intermediate ring and circlip, removed in that order (circlip and ring first, key last).
- **Intermediate shaft:** bearings, thrust bearings, circlips and stopper. All come out with the shaft.
- **Head and valve train:** head studs (24 drawn) and bronze rocker bushes.
- **Plugs and seals:** cam-housing plugs, the second chain-lid plug and the chain-case plugs, plus oil-cooler O-rings.
- **Other hardware:** gaskets and sealing rings; WUR, cold-start, aux-air and vacuum-limiter washers; pre-muffler nuts and clamps; sump-plate gaskets; and coil and primary ignition leads.

### Hollowed and relieved solids
- **Valve covers:** CSG pans with a real cavity (`VC_CAV`) and solid nut ears (`earCut`). Bosses, lettering and ribs are raised by `VC_RAISE`.
- **Upper air guide:** cut-outs for the distributor, breather neck, plenum foot and the six injector bores. The skirt is notched at each cylinder.
- **Breather lid, plenum underside and oil-cooler end tank:** relieved around the distributor. The oil cooler now uses ported spigots with O-ring seals.
- **Crankcase (PR #8, hollow casting):** kept as merged. v5 adds only proud boss pads for the senders, the right case bolts and the M10 nut.

### Collision allowlist
Bottom-end and ancillary overlaps stay only when they are a real joint. Each of those entries names the joint (`threaded`, `pressed` or `seated`), and the collision test fails an entry that does not. Fastener seats are generated from the hardware sets.

- **Removed (geometry now clears):** solid case interior against the crank, rods, intermediate shaft, oil pump, thermostat, sump plate, breather lid, distributor and fan housing; rear seal boss against the flywheel; oil-pump cover nuts against the left case (spotfaces); fuel lines against the upper air guide; the alternator against the air distributor. Ignition leads intersect only the cap towers, the plug boots and the shroud holders. They leave each tower on the outboard side of the cap, run the inboard shroud edge (under the runner stubs, through the holders) and, for the right bank, cross above the roof at the flywheel end. They then drop at the open end of the bank and come back under the head to the boot. On the right the drop is a short slant just outside the skirt at the flywheel end (about 20 mm out, aft of the cam-housing cap). On the left it descends on the inboard line, past the wing and ahead of the chain housing, before moving out. A lead never goes below its own boot, and it does not loop outside the valve covers. Plenum and fuel lines are main's meshes, unmodified. The alternator clears the compact air distributor by about 24 mm, so that pair is not allowlisted. The collision test also accepts a `PENDING-INTAKE` tag for an overlap that only an intake-owned part can clear; nothing is tagged with it.
- **Fuel lines and plenum:** taken from main with the 1978 CIS intake (compact air distributor, per-cylinder runners, loom at y 258). The loom passes the fan horn with about 39 mm of daylight, so the horn is not notched. Induction and fuel pairs are not allowlisted. The only induction entry is main's warm-up regulator seated on the left-case pad.
- **Kept, bottom end:** shells pressed in the saddles, journals pressed in the shells, gears and pulley pressed on the crank nose, flywheel seated on the flange, wrist pin, clutch stack, oil-pump coupling, cylinder spigot seated on the deck, chain-box gasket face, belt in the pulley grooves, impeller and pulley pressed on the alternator shaft, impeller seated in the fan housing, lead jacket seated in the cap tower, boot seated on the plug, lead clipped in the holder, muffler stubs seated on the heat-exchanger outlets. The alternator sits in the fan-housing cradle with a fraction of a millimetre of clearance and does not intersect it, so that pair is not an allowlist entry. Upper-air-guide screws stay threaded fastener joints; the guide mesh was not cut for them.
- **Left to the top-end work (not changed here):**
  - conrod × cylinder skirt (the fin-root disk is a closed cap; relieving it means editing the cylinder);
  - piston dome / valve reliefs;
  - valve heads × cylinder;
  - valve-cover edges, gaskets, rocker-shaft screws and cover nuts;
  - cam plug, cam key and the chain drive. The crank/intermediate gear-mesh allowlist was already removed when the timing-chain work merged; it is not restored here. The cylinder skirt is left for that work to relieve.

### Parts checklist
`docs/parts-checklist.md` is generated by `scripts/checklist-doc.ts` from `src/data/checklist.ts`. It lists every catalogue line as one of: modelled (with its source), N/A (with a reason), an alternative row, excluded (other year/model) or MISSING.
- `tests/checklist.test.ts` checks every claimed quantity against the real instance counts. Nothing can be counted twice.
- Totals: 418 modelled, 150 N/A, 230 alternative, 199 excluded, 1 missing (105-05 #3 air guide 911 106 406 00; its location has not been identified).
- Illustration 108-00 (air injection) is outside the checklist and is not modelled. The 1978 USA 930/04 fittings are the position 18 unions and position 19 sealing rings named in the caveats above.

### Known approximations (E)
- **Stud lengths:** these are allocated across catalogue lines by pool (`POOLS`), not stud by stud.
- **Features asserted per part:** rings, bushes, plugs and similar features baked into a part's mesh are counted from `FEATURES` rather than measured from the geometry.
- **Estimated positions:** the intermediate-shaft stopper and circlips, the cam-housing plug and the second chain-lid plug.
- **Oil-cooler feet:** sit on a machined pad 0.2 mm under the foot, with a spot face inside the stud hole flush at y 95.

## 11. Top end batch 1 (cam housings, cams, rockers, valves)

Geometry is in `src/geo/valvetrain.ts`. Chief of Staff parts are reshaped, not duplicated: the cam Woodruff key, flange, shim, thrust washer and M22 nut still use `CAM_NOSE`; the keeper halves and stem seals stay inside the valve mesh; the rocker-shaft screw and nut sets are the existing `rocker-shaft-screws-*` / `rocker-shaft-nuts-*`.

The external full-length oil line on the old housing is gone. Photos of the housing do not show one. The splash tube (`930.105.362.00`) and the banjo stay; the tube is moved off the journal centreline.

Photo pass (batch 2) reshapes the same meshes against the comparison sheets. The cam-housing photo is the photo column of `cam-housing.png`. Exhaust-valve shape follows the SC valve 930.105.419.51; the 930 Turbo sodium-filled valve is shape comparison only and is not the part modelled. Nothing below was measured from Dempsey’s rebuild book unless the last column says so.

### Dimensions

| Item | Value used | Source | vs Dempsey |
|---|---|---|---|
| Valve lash, cold, intake and exhaust | 0.10 mm between the adjuster ball surface and the stem tip; the pad crown is on the base circle | Wayne Dempsey, “911 Valve Adjustment” (same author as the rebuild book) | verified |
| Intake / exhaust head Ø | 49 mm / 41.5 mm | Catalogue 930.105.409.13 / 930.105.419.51 | not re-measured in the book for this pass |
| Included angle | 28° intake / 32° exhaust | Previous model. Not found as a quoted figure in the sources used here | unverified |
| Overall valve length | 112 mm | Previous model | unverified |
| Stem Ø | 9 mm | Common 911 stem size; not quoted from Dempsey here | unverified |
| Seat ring | land 1.25 mm tall, OD = head Ø + 0.56 mm | The dark ring on the comparison sheet was a fat collar (about +2.4 mm and 5 mm tall). This is a thin land just outside the 45° face | unverified |
| Keeper grooves | 3 beads, two half-cones (901.105.417.00) | Photo of 901.105.417.00 | unverified as a measured width |
| Installed spring height | 34.5 mm | Bentley 911 SC specification 34.5 ± 0.3 mm, quoted on a DDK forum thread. Not Dempsey | unverified against the book |
| Outer spring | centre Ø20.0 mm, wire Ø1.55 mm, 5.2 turns, dark, damper coils at the head end | Two distinct helices. Outer OD is kept near the previous stack so the cam-housing stud nuts still clear | unverified |
| Inner spring | centre Ø12.1 mm, wire Ø0.92 mm, 8 turns, brighter steel, phase-offset from the outer | Radial gap to the outer wire is about 2.7 mm, so the coils do not read as one spring | unverified |
| Cam journal Ø | 46.7 mm | Chosen just under a Ø47 bore. The audit photos read “about Ø47” | unverified |
| Cam bore Ø | 47.1 mm, four webs, open from the chain end | Same audit. Four journals are visible on the cam photo | unverified |
| Lobe base radius / lift / peak radius | 15.2 mm / 7.5 mm / 22.7 mm | Peak is under the journal (22.85 mm limit) so the cam still slides in. Profile is a base circle, a flank, and an offset circular nose (radius 13.2 mm). The flank meets the base circle at 1.22 rad with zero slope. The section is a straight extrusion: full-width flat face, 0.5 mm edge chamfer, no axial crown | unverified. Not a measured SC cam card |
| Lobe width | 12.4 mm | Intake and exhaust centres of one cylinder are 14 mm apart, with a 1.7 mm ground groove between the pair. Each lobe is phased to its own rocker (intake peak 450° crank, exhaust 270°) | unverified |
| Shank Ø | 33.6 mm in the middle of a span, 28.4 mm on the cheeks beside a lobe | Stout next to the journals. The cheek is just under the Ø30.4 heel so the base circle shows without a deep neck. Ground relief between each pair is Ø25.2 | unverified |
| Cam nose | r 11 mm, Woodruff 4 × 5 × 10, M22 external thread | Key, washer and nut still use `CAM_NOSE`. Flange OD is 48 mm (the pin-circle rim); see §14 | key / nut interface unchanged |
| Cam dowel | Ø6 × 14 mm, 2 mm proud of the sprocket web, tail in the flange hole | 900 243 001 00. Stoddard lists the pin as 6 × 14. Same `cam-pin-*` part; circle radius 24 mm, outside the M22 nut | length from the parts listing |
| Cam housing | one sand casting. Head face: two lobed spring wells per cylinder on raised gasket lands, four to six cast bosses around each opening, pocket floors set back about 5 mm, small round oil/drain holes between the wells, cam-tunnel spine proud of the pockets and ending before the bore. Outer tunnel is a drafted arch with filleted lips, longitudinal ribs, a bearing-boss bulge at each journal, and a transverse rib between journals | Photo column of the cam-housing comparison sheet. Spine, bay cheeks and tunnel bands stay outside the Ø47.1 bore. Nut faces stay at x = 272 | unverified |
| Valve covers | both banks, seat length `CH_Z1 − CH_Z0 − 8`. Lip 1.15 mm plus a 2.15 mm step. Sprocket-end notch 30 mm wide. Stud ears are towers (base Ø about 33) with a gusset blending the pan wall into the ear. Nut face stays a flat disc at local z = 7. Two round bosses and the PORSCHE letters stay on the upper covers | Comparison sheet. Left cover still matches the right cover’s Z (`VC_EXT` = 0); the test forbids the old 30 mm flywheel overhang | unverified |
| Left valve-cover gasket | same closed ring as the right. Where a rocker crosses a side rail the hole and the outer edge jog out together, so the rail stays one piece and the arm is in the opening | The 10–11 mm rockers cross the outboard rail. A notch would open the seal | model clearance, unverified |
| Rocker shaft | Ø18, half-length 13 mm (was 17), hollow, slotted ends. Boss OD about 25 mm, 22 mm tall | The outer stations sit next to a cover stud. 17 mm ran the shaft end into that stud; 13 mm clears it by about 1 mm. The boss stays | unverified |
| Rocker arm | one side-profile outline, extruded 9.6 mm. I-beam channels cut in from both flat faces, wide in the middle and narrow toward the pad and the eye, with a rib left between the channels. Pad arm 42 mm, eye arm 34 mm, pad shoe 19 mm wide. Intake eye bend 71°, exhaust 50°. Adjuster ball Ø6.4 and an M8 locknut on the eye | The old 28° bend, with the valves at y +22 / y −23, swings the eye across the stem and turns the 7.5 mm lobe into about 4.5 mm at the valve. 71° / 50° keep the arm lengths and put the eye along the stem, so the same lobe is about 10.5 mm intake and 11.1 mm exhaust. The shaft is the circle that puts the pad crown on the base circle (gap 0–0.05 mm) and the ball 0.10 mm off the stem. It moves only as far as that requires | unverified |
| Rocker-shaft screw | M6 socket head, 999.067.008.00, shank 26 mm | Photo; the catalogue text says pan head. Same part set, reshaped | head shape from the photo |
| Rocker-shaft nut | Conical flange, internal hex, 901.105.376.02 | Photo of 901.105.376.03 (catalogue lists .02) | shape from the photo |
| Rocker ratio | follows from the pad on the base circle and the ball on the stem. Cam lift is 7.5 mm; valve lift at the nose is about 10.5 mm intake and 11.1 mm exhaust, and it does not drop below the previous 6.71 / 5.57 mm | The lengths give a published-style ratio near 1.4 once the eye is along the stem. The 28° layout does not | unverified |
| Firing order | 1-6-2-4-3-5, cams at half crank speed | Standard 911. Opposite cylinders are 360° apart on the 720° cycle | verified as the engine’s order, not as a page citation |

Closed valves meet the 45° seat with no gap. At the assembled crank (cylinder 1 at firing TDC) cylinder 4 is on overlap and both of its valves are off the seat. Each cylinder has its own valve asset for that reason.

### Tests

`tests/valvetrain.test.ts` checks lash, nose lift (at least 10 mm, above the previous 6.71 / 5.57 mm), the pad crown on the base circle within 0.05 mm, lobe-peak versus the Ø47.1 bore, the open bore from the chain end, the left/right mirror, the left valve cover against the cam-housing seat, the cam dowel, a closed cover shell (no ray from inside the pan misses the roof), the plug axis clear of the exhaust flange and 2.5 mm off the heat exchanger, the electrode 1.5 mm off the piston at TDC and clear of both valve heads, and that every rocker sub-mesh on a station is one connected piece. Cover studs sit in the gaps between those shafts, because the old ear line ran through the intake shaft. The plug axis is `SPARK_AXIS` (35.95° above horizontal, 36.79° off the cylinder axis, 8.98° off the upper-cover normal), through the upper cover. The 19 mm shoe is wider than the gap to the next lobe, so the wings outside this lobe are cut back clear of the peak radius. The left flywheel journal sits just outboard of the cylinder-6 shoe; the right bank's station would land on that shoe. The connector is a straight tube, a seal flange in the upper-cover hole, and a 90° elbow. The shoe face is the posed lobe normal, 0.04 mm off the polar point.

## 12. Batch 2 — rotating assembly

Photo pass on the crank, rods, crank gears, intermediate shaft, crank pulley and pulley bolt. Layout constants (`crankRadius`, `rodLength`, `THROW_DEG`, `CYL_Z`, `MAIN_Z`, chain planes) are unchanged.

- **Crankshaft.** Twelve thick forged cheeks, not one repeated thin racetrack. Cheeks beside the mains are nearer round (some with a flat chord); the others are pear-shaped with a counterweight lobe opposite the crankpin. Mains 1–7 stay Ø60 **K** on the existing stations, with a short polished land and a fillet into the cheek. Rod journals stay Ø53. Main 8 (nose) stays Ø54 *E* (r 27) inside the existing nose sleeve, then the pulley spigot. The flywheel flange keeps the 9-bolt pattern, pilot bore and adds a dowel. Counterweight lobes that point downward are kept above the sump floor (y −56).
- **Conrods.** Forged I-beam: recessed web, raised flanges, big-end shoulders with two bolt bosses, a slightly narrower cap, and nuts proud of the cap. Centre distance stays 127 mm *E* (127.8 mm is the figure many rebuilders quote; changing it would move the pistons).
- **Crank gears.** 35 T steel helical timing gear (keyed hub) and a smaller-OD brass helical distributor gear. The module is 168/95 so the 35:60 pair still meshes on the 84 mm centres. The intermediate gear is the opposite hand. The distributor gear is unchanged. Bottom End signed off; tooth counts unverified against Dempsey, chosen for exact 2:1 with 24T/28T.
- **Intermediate shaft.** Sprocket centres stay at z 235 and z 258, now 24 T, and the 60 T gear stays on the crank-gear plane (hub z 192–206; tooth tips stop at z 204.7 so they clear the pulley-end bore wall). The photo order (sprocket, then gear, then sprocket) cannot be met without moving a chain or the mesh, so the gear remains inboard of both sprockets. The gear is helical, bolted to a flange with a lock-plate, and the flywheel-end extension is drawn as a separate dark connecting-shaft tube in the same asset. All 60 teeth are whole. The bottom perimeter stud at z 190, its lock nut and both case-half lugs are lowered to y −150 (was y −136, 52 mm from the shaft) and the flange lobe follows, so a tip circle of r 54.8 clears the stud, the lock-nut hex and the lug by more than 1 mm. The gear pocket (r 57.5) no longer takes that lug, so the nut seats on the boss. Journals stay where `ishaft-bearings`, thrust washers, circlips and the stopper seat.
- **Crank pulley.** Single groove, pressed-steel dish, yellow zinc, Z1 notch, bolt recessed in the hub. Batch 3 sets the lip to Ø134 and moves the belt pitch onto that groove (`FAN.rCrankPulley` 65, pitch radius 60, `FAN.zBelt` 303).
- **Pulley bolt.** M12×1.5×22, zinc, washer radius 12.5 mm (was a 24 mm-radius disc) and 3.4 mm thick.

## 13. Batch 3 — oiling system

Photo pass on the oil pump, sump plate, oil thermostat, breather tower and relief plugs, plus the crank-pulley diameter carried over from batch 2.

- **Oil pump.** Two-section aluminium body in the flywheel-end bay (scavenge on −X, pressure on +X with four longitudinal ribs), a joint band, three mounting ears on the cover, and top port bosses. The pickup leaves the pressure (+X) end and turns about 90° up in a smooth bend about as long as the body (centreline radius about 44 mm, OD about 13 mm) *E*. The three M8 nuts sit on the ear studs; the pressure-section end has no cover bolts. Body about 70 × 34 mm (length along X / height) *E*. The long axis is across the case: the open bay between the z −177 and z −118 webs is only about 37 mm, so a 2.2× body along Z would bury a web. Cover face z −158 so the M8 nuts stay clear of that web. Drive stub and dark connecting shaft stay on the intermediate-shaft axis (y −84). Sump stud circle stays r 74 *E*.
- **Sump plate.** Pressed-steel cover with a flat field, a raised outer rim, and a horseshoe channel about 5.5 mm proud and 18 mm wide (drain plug in the notch at the top of the U, opening toward +Z). Central hex plug 911 107 176 03, strainer and gasket stack in the same asset. Nut count stays **12**. 101-05 #34/#35 are qty 12 with no note that splits them, and the sump photo shows 8.
- **Oil thermostat.** Moved from under the right half to the top of the right half at the pulley end (x 88, z 176, flange top y 118), beside the oil-pressure sender and switch. The cap stays below the shroud collar and the fitting banjo. Windowed cartridge, O-ring land, dark element cup. Three ears (1978 hardware). Nut count stays **3**: 101-10 #41 is three M6 lock nuts through engine 63D; the two-bolt flange (900 075 057 02) is tagged after 63D. The old underside pad is removed. Flange ear centres are about 16–18 mm from the cap axis *E*; body about Ø31 *E*.
- **Breather.** Cast ribbed tower with an angled hose neck. Part number stays **901 107 073 02**, the 1978 SC line (tag SC). 930 107 073 00 in this catalogue is tagged 83-/turbo. Stoddard’s cast 930 107 073 02 is the later supersession; the mesh follows the teardown photos. Nut count stays **2** (101-10 #35/#36 qty 2, assignment estimated). The photo shows four nuts and there is no qty-4 line to move them to.
- **Relief plugs.** Hex-head screw plugs with a washer face and a copper sealing ring, seated on the case underside. The pistons are hollow cups with the spring inside the cup.
- **Crank pulley.** Lip Ø134 (r 67). Belt pitch radius 60 at z 303, still in the single groove; the fan pulley valley stays on that same plane (`rFanPulley` 41, pitch 36). Concentric pressed rings on the dish face. Washer seat remains z 324.

## 14. Batch 4 — fan, shroud and alternator

Photo pass on the cooling fan, fan housing, split pulley, Bosch alternator and the 1978 upper air guide. The crank pulley and belt plane are unchanged. Fan height is corrected in §15.

- **Colour.** The red part on the 1978 SC is the upper air guide (930 106 041 00), orange-red GRP about #C04A30, roughness ~0.6. The later black replacement PCG 106 041 04 stays in the catalogue note. The fan housing (930 106 005 00) is natural dull mid-grey cast magnesium, not black and not red. Albedo is #6C6F71 with roughness 0.92 and a low environment response, so the lit surface in the viewer reads about #8A8D8F instead of washing out toward white.
- **Fan.** Tip diameter 226 mm (r 113) **K**: Pelican 428673 says every 911 fan is 245 mm except the 1978–79 fan, which is 226 mm. 930 106 011 01 is tagged -79/SC and the catalogue JSON does not state 245 mm. Eleven broad blades, twist about 45° at the root to 25° at the tip, large hub dish. Housing throat inner radius about 117 mm (tip + 4 mm).
- **Housing.** Deep drum, five circumferential grooves on the engine-side barrel, axial ribs, five broad stator vanes and a solid cradle with six holes on the rear face. The two box feet and the three rod spokes are gone. Yellow-zinc band clamp, with two nuts and two washers, on the barrel just pulley-side of the shroud collar. Depth of the drum is about 91 mm (z 205–296) *E*; a rennlist note puts a 70 A housing near 95 mm.
- **Pulley.** Split. Inner half is the yellow-zinc face plate on `fan-hub` (disc about Ø122, six studs, 16-hole ring, conical flank OD 82). Outer half, six 0.5 mm shims (five between the halves, one outside) and the cupped cap are `fan-pulley`, so the belt step still lifts only those. OD 82 mm **K** (Sierra Madre / 911 106 208 00, "double 82 mm, 76–79"). Shim 930 106 564 00, 0.5 mm, six drawn **K**. Nut M16×1, 24 mm AF **K**. Pitch radius 36 on the same plane as the crank (z 303). Ratio 60/36 ≈ 1.67.
- **Alternator.** Bosch 14 V, 911 603 120 02, about 70 A, external regulator. Two cast end shields, darker laminated stator, copper windings in the windows, slip-ring end with two horseshoe diode plates, a central brush block and three terminal studs. Body about Ø114 × 90 mm *E* (length about 0.8 × OD), seated in the cradle. The copper ground strap runs from the lower slip-ring stud to the housing barrel.
- **Upper air guide.** One moulded shell. The collar (inner r 139.5) wraps the engine-side barrel with about 3 mm clearance and no undercut, so the housing still slides out on +Z in the fan step. Stadium windows, three per wing, with raised rims. Centre roof boss and a U notch on the collar's engine-side rim. Screw lips, end plate and hot-air socket stay where the existing screws seat.
- **Belt length.** Pitch length is the open-belt formula with crank pitch r 60 and fan pitch r 36 (the modelled groove radii are `FAN.rCrankPulley − 5` and `FAN.rFanPulley − 5`), belt plane z 303. Centre distance `FAN.y` = 210.33 mm gives a pitch length of 725 mm. The previous axis at y 255 was about 814 mm and is retired.

## 15. Batch 5 — belt length and fan height

The fan group moved down with the new centre distance. `FAN.y` was 255; it is now 210.33, a drop of 44.67 mm. Fan housing, impeller, hub, pulley, belt, alternator and collar bolts all sit on that axis. The housing lip was reduced to r 136 so the full circle clears the crank pulley and the chain-box gaskets. The shroud mouth is a sleeve on that same axis, z 214–232, radius 146, just engine-side of the band clamp.

- **Upper air guide.** Wings, skirts, screw lips and the flywheel-end plate stay seated on the heads. The fan end is one skin: the flat centre roof eases into a horn whose mouth is a short sleeve on the fan axis, wrapped around the housing barrel just engine-side of the band clamp (z 214–232, radius 146). Where that skin would enter the throttle body, the alternator or the distributor cap it is cut back locally. The distributor moved to x −98, z 146 so the cap clears the lowered alternator; the shroud opening moved with it.
- **Intake.** The CIS stack stays at the main height. The lowered fan does not move the plenum, air cleaner, mixture unit, runners, boots, fuel lines or linkage. Top-end parts (heads, cam housings, valvetrain, chain drive) are not moved.
- **Alternator.** Drive-end and rectifier shields are the bright aluminium castings (cooling slots in the drive end, smaller windows on the slip-ring end). The laminated stator is a short inset waist. Copper shows in the windows and does not form the outer silhouette. Brush block, diode plates and the ground-strap stud stay on the slip-ring face.
- **Fan housing colour.** Albedo #6C6F71, roughness 0.92, environment intensity 0.12, so the lit magnesium reads about #8A8D8F. The impeller keeps its own magnesium finish.

## 16. Top end batch 2 — timing chain

Photo pass on the cam sprockets and flanges, the intermediate-shaft sprockets, both duplex chains, the tensioners (idler arm, idler sprocket, hydraulic body, mounting ear), the guide rails, the chain housings and lids, and the chain-side cam covers (`930 105 196 00`). Existing parts were reshaped. Cam axes, chain planes, the fan housing and the upper air guide were not moved. The crank and intermediate gears stay on the 84 mm centres; their module changed so a 28 T cam and a 24 T intermediate sprocket still give exactly half crank speed. Bottom End signed off; tooth counts unverified against Dempsey, chosen for exact 2:1 with 24T/28T.

The crankcase chain well follows that chain-box outline. Bottom End accepts the rise of the well's top edge at |x| = 118 (from y 20.33 to y 26.14) and of the three upper chain-housing stud bosses (z 226 / 247 / 268). Those bosses span x 104–118 and the studs are at x ±124. It tracks the real box, including the 28 T cam sprocket and the sealed tensioner. The case was not frozen at the earlier outline.

### Tensioner: sealed, not pressure-fed

The 1978 930/03 chain tensioner is the sealed hydraulic unit **930 105 049 00** (checklist 103-10/15 #10). **930 105 053 00** is the alternate of the same family; **930 105 053 04** is the later supersession of that sealed unit (Stoddard: “Latest Supersession of Hydraulic Tensioner”, supersedes 049) and is excluded from engine 63D onward. The pressure-fed Carrera tensioner is a 1984-on part. The bolt-on update is **930 105 911 00** (left) and **930 105 912 00 / 01** (right), listed N/A in the checklist as an alternative. Wayne Dempsey’s Pelican Project 16 says pressure-fed tensioners were introduced in 1984 and sold as a kit for 1969–1983 engines; an SC through 1983 did not come with them. This model keeps the sealed body: a cast body with a thick mounting lug, a tapered nose and a dark gland, a bleeder screw (the PET bleeder 930 105 573 00 is an internal feature, not a separate fed line) and a steel plunger. There is no oil-feed banjo. The body shape follows the 930 105 053 04 supersession photo (FVD), which is the same sealed family.

- Dempsey, “Chain Tensioners — Carrera Style”: https://www.pelicanparts.com/techarticles/101_Projects_Porsche_911/16-Carrera_Chain_Tensioner_Install/16-Carrera_Chain_Tensioner_Install.htm
- Stoddard, 930 105 053 04: https://www.stoddard.com/en/diagrams-porsche-911-1983-eu-3-0sc-coupe-manual-gearbox-5-speed/engine-and-fuel-feed-36/timing-chain-timing-sprocket-rocker-gear-chain-tensioner-4241/93010505304-chain-tensioner-911-from-1965-1983-7013

### Vernier sprocket and flange

The sprocket (**901 105 546 02**, photo of 901 105 546 04) has **17** equally spaced holes and **28** teeth (face count of the FVD photo, twice). The flange (**901 105 583 01**, photo of 901 105 583 02) is a tall bright keyed hub with **16** round scallops on a short rim (Ø48 mm) at the sprocket face, about half the hub height. The lands between those scallops are wider than the scallops. The skirt is one outline (scalloped outside, bore traced back) so the bore stays open. The dowel **900 243 001 00** (Ø6 × 14) passes through the one pair that lines up. Rauch & Spiegel, who make the flange, state the 17/16 count; Dempsey’s cam-timing article says the pin meets only one flange hole. The flange stays keyed; the sprocket is not (a keyway on the sprocket would lock the vernier).

- Heritage, camshaft chain sprocket: https://www.heritagepartscentre.com/eu/90110554604-camshaft-chain-sprocket.html
- Heritage, camshaft sprocket flange: https://www.heritagepartscentre.com/eu/90110558302-camshaft-sprocket-flange.html
- Rauch & Spiegel, sprocket carrier hub: https://www.rauchandspiegel.com/product/camshaft-sprocket-carrier-hub/
- Dempsey, “Camshaft Timing”: https://www.pelicanparts.com/techarticles/101_Projects_Porsche_911/15-Cam_Timing/15-Cam_Timing.htm

### Sizes

| Item | Value used | Source | vs Dempsey |
|---|---|---|---|
| Chain | duplex 3/8 in, pitch 9.525 mm. Figure-8 outer plates and rounded inner plates, each with two pin holes. Roller Ø6.4, pin Ø3.4. Part stays **901 105 529 00** | ISO 606 / BS 06B-2 (roller Ø6.35). Plate silhouette from Heritage 993 105 529 00 and the divided 911 105 529 51 | pitch already used in §8; plate height not re-measured in the book |
| Cam sprocket | 28 T, pitch Ø 85.0 mm | Face count of FVD 901 105 546 04 (twice). At 3/8 in that pitch diameter sits in the old chain-wrap Ø 80–85 scale | tooth count not a page citation |
| Intermediate sprockets | 24 T, solid duplex, planes z 235 / 258 (was 18 T) | Pelican: 24 T sprockets drive the cam sprockets. An oblique photo looked near 28 T; that count is not used | not a page citation |
| Crank gear | 35 T, module 168/95, 84 mm centres with the 60 T gear. Tapered flanks with backlash, helix over the 12.7 mm tooth face. Hub slot stops at the hub rim (r ≈ 29.35). Every tooth slice is notched straight through on the key up to r 31.0, 1.15 mm outside the key on each side, which notches the tooth-gap root | (35/60)×(24/28) = 1/2. Bottom End signed off; tooth counts unverified against Dempsey, chosen for exact 2:1 with 24T/28T. A 964 parts legend prints 34 T, which is not an exact 2:1 with 24/28. Crank gear key/root interference is a known geometric conflict between the 84 mm gear centres and the Ø56 crank nose with its Woodruff key, pending a real measurement of the crank nose Ø or gear centres. The slot clears the key; that pair is not an allowlisted joint. Main's hub OD r 33.4 is not restored | 36 T in §12 was an estimate |
| Idler | 19 T, 8 lightening holes, bronze bush, round bore | Face count of FVD 901 105 055 00. Outside wrap, `IDLER_PUSH` 38 | 19 T not in the book |
| Flange | Tall keyed hub, round scallops on the Ø48 rim × 16, lands wider than the scallops, open bore | FVD 901 105 583 02. Rauch & Spiegel 16 / 17 vernier | unverified against the book |
| Sprocket holes | 17 × Ø6.7 on the Ø48 circle, one boss on the dowel hole | Same | unverified against the book |
| Idler arm | Heavy forging, wide bronze-bushed boss, smaller pivot, tapered tail. Left **901 105 505 02**, right **901 105 506 02** | 1978 PET numbers. Shape from the later 930 105 510 00 photo (FVD) | curve not traced from the book |
| Guide rails | left 3 × 911 105 222 06, right 2 × 911 105 222 06. Moulded U-channel, side walls, ribbed back, two saddles, tapered ends. Inner face 4.9 mm off the pitch line | FVD 911 105 222 06 and Heritage. Brown 911 105 222 05 stays the alternate row, not an extra part | rail curve not measured from the book |
| Chain box | Deep cast box, curved outer wall and ribs. Outline still the photo-scaled hull; bolt stations still 10 right / 9 left | Joe Engineer chain-housing photos. Gasket outline FVD 930 105 193 06 | wall draft *E* |
| Lid | flat plate, low cam pad r 32 instead of the cone | Same covers | pad height *E* |
| Chain-side cover | **930 105 196 00**, flat annulus, centre hole r 11, top face at the existing screw seat | Heritage “Camshaft Flange Cover” | unverified against the book |
| Cam-bore end | chain end of the cam bore stays open. **930 105 161 00** remains the flywheel-end lid | Valvetrain test | unchanged |

- Pelican, intermediate sprocket tooth count (“two 24 tooth sprockets driving two 27 tooth sprockets”): https://forums.pelicanparts.com/porsche-911-technical-forum/200267-new-chains-without-new-sprockets-read.html
- Pelican, crank 27 T / intermediate gear 48 T / intermediate sprocket 24 T / cam 27 T: https://forums.pelicanparts.com/911-engine-rebuilding-forum/328011-cam-timing-different-1-3-4-6-a.html — the cam here is 28 T from the FVD face count. The crank and intermediate gears are 35:60 (module 168/95). Bottom End signed off; tooth counts unverified against Dempsey, chosen for exact 2:1 with 24T/28T.
- Heritage, intermediate sprocket: https://www.heritagepartscentre.com/eu/90110512504-intermediate-shaft-chain-sprocket.html
- Heritage, black guide rail: https://www.heritagepartscentre.com/eu/91110522206-timing-chain-guide-rail-black.html
- Heritage, brown guide rail: https://www.heritagepartscentre.com/eu/91110522205-timing-chain-guide-rail-brown.html
- Heritage, duplex chain (later endless, plate shape): https://www.heritagepartscentre.com/eu/99310552900-timing-chain-closed.html — the SC chain remains 901 105 529 00. Divided chain: https://www.heritagepartscentre.com/eu/91110552951-timing-chain-divided.html
- Heritage, flange cover: https://www.heritagepartscentre.com/eu/93010519600-camshaft-flange-cover.html
- Heritage, later idler arms (shape only): https://www.heritagepartscentre.com/eu/93010550900-chain-tensioner-sprocket-support-left.html and https://www.heritagepartscentre.com/eu/93010551000-chain-tensioner-sprocket-support-right.html

Each chain wraps the intermediate sprocket, the cam sprocket and the idler, with rollers on those pitch circles. The plunger still meets the idler-arm pad. The rail shoes sit on the chain runs. No new collision-allowlist entry.

## 17. Batch 6 — 1978 CIS intake and fuel circuit

Section 15's note that the CIS stack stays put is superseded here. The air distributor, runners, sleeves, mixture unit and fuel lines are rebuilt. Cylinder heads are unchanged: the intake flange face is still world y 65, the studs are still head-local x 26, z ±28, and the runner flange (46 × 76) still seats on that face.

K = published figure. E = estimated from the JE / FVD photographs in `photo-ref/`.

| Dimension | Value | Tag | Source |
| --- | --- | --- | --- |
| Port ID | 38 mm | K | Jim Williams, CIS Primer, Pelican 8327087; JE aluminium-airbox note: 1978–79 US / 1978–83 Euro are 38 mm, US 1980–83 are 34 mm |
| Port OD | 44 mm | E | Scaled off the sleeve in reassembly-19 |
| Sleeve OD | 47 mm | E | FVD 911 110 885 02 and reassembly-19 (the sleeve is the fat band on each stub) |
| Sleeve length | 50 mm | E | Same photo; two worm-drive clamps, screws up |
| Sleeve ID | 44 mm | E | Same as the stub and the runner spigot; the rubber is stretched on |
| Metal gap inside the sleeve | 8 mm | E | Each end covered by 21 mm of rubber |
| Box width across the stub faces | 155 mm | E | reassembly-19, scaled off the 47 mm sleeves (three sleeves per side, nearly touching) |
| Stub pitch along the crank | 50 mm | E | reassembly-19: the three stubs are adjacent |
| Box length along the crank | 190 mm | E | Three pitches plus wall and the cold-start boss |
| Box height | 78 mm (y 174–252) | E | JE teardown-16 / 18 / 37 / 38; top stays ~30 mm under the air-cleaner drum |
| Stub length past the face | 28 mm | E | reassembly-19, short straight tubes, axis horizontal |
| Throttle bore | 26 mm | E | Housing at the pulley end (+Z) |

The 1978 car has no cold-start spider. The cold-start valve sprays into the lower chamber through a boss on the flywheel end. The lower air-cleaner shell stays in the housing part (911 110 106 13). The neck and the shell seam from the first pass are closed in §18.

Each runner is its own mesh (`intake-runner-1`…`6`) because the head pitch is 118 mm and the stub pitch is 50 mm, so the Z bend differs per cylinder. Stub order follows the crank: the pulley-end cylinder of each bank (1 and 4) takes the pulley-end stub (z +50), so the pipes converge and do not cross. The spigot is coaxial with its stub and the sleeve. Left-bank injectors lean outboard (−X); the pose is a +57° roll, the mirror of the right bank's −57°.

The paper flange gasket is 0.5 mm thick and sits on the head face (local y 0..0.5). The runner flange (top still at local y 8, the nut face) sits on the gasket. Outline 42 × 72, 2 mm inside the 46 × 76 flange, port hole Ø36, stud holes Ø10.4. The collision test caps erosion on sheets thinner than 0.55 mm so this paper does not turn inside out. The head flange and the stud pattern did not change.

Fuel-line ends, and what they seat on:

- feed: banjo + two washers on the distributor inlet → filter-side hex in `fuel-lines` (the filter is off the engine)
- six injector lines: distributor outlet banjo → injector nipple face
- warm-up regulator: two lines (`wur-lines`), banjo + two washers at both ends (1978 distributor with the push valve)
- cold-start feed: distributor side banjo → cold-start-valve banjo
- return: M14×1.5 union on the distributor (the copper sealing ring) → tank-side hex in `fuel-lines`

The filter and the tank are off the engine, so those two hexes are fittings in the line assembly. Each line arrives along the hex axis and stops on the face. Catalogue feature counts in `checklist.ts` are unchanged.

## 18. Air cleaner and fuel-line routing

The Ø160 × 440 mm open drum is replaced by a flat oval canister, the black housing in JE reassembly-55 and 57. The paper element is not a round cartridge. The part on the car is **911 110 185 02**, Mahle LX 261, the orange rectangular panel in the JE filter photo. A circle tall enough to hold that 181 mm panel would be larger than the old drum, so the shell is an ellipse around the panel.

| Dimension | Value | Tag | Source |
| --- | --- | --- | --- |
| Element length | 402 mm | K | Heritage 911 110 185 02; Mahle LX 261 |
| Element width | 181 mm | K | Same |
| Element height | 41.4 mm | K | mhteile.com Mahle LX 261 listing |
| Inner ellipse | 224 × 84 mm | E | Clears the panel corners (half-axes 112 and 42) |
| Wall | 3.6 mm | E | reassembly-61 tray |
| Straight length | 440 mm, plus 3.6 mm end caps | E | reassembly-55, a long canister rather than a trough |
| Equator | y 378 | E | Split of the two halves; underside y 332.4 |
| Lip | 9 × 3.2 mm | E | Clip land in reassembly-55 |
| Canister centre Z | 36 mm | E | +Z cheek stays clear of the alternator slip-ring face (z ≈ 164) |
| Outlet neck | Ø32 tube, opening Ø44, flange Ø60 | E | Seated on the outer bottom; the opening is left out of the skin |

The two oval halves meet on the equator: wall, end-cap diameter and lip faces are in contact. Equator vertices keep a horizontal normal so the 1 mm erosion does not walk the edge into the other half, and the triangle test treats an intersection that lies on a shared boundary edge as contact. The outlet neck ends on the outer bottom with its flange on that surface; the skin leaves a Ø44 opening so the tube is not a dead end. The element is centred on the equator.

The six distributor outlets are one row on 17 mm centres (eyes Ø14.6, so neighbours have about 2.4 mm of air). The stubs all leave outboard and fan by about ±15° so the lines gather into the ribbon without crossing. The body is long enough that the end eyes sit on the lid, the warm-up ports stay on the flywheel face, and the return union's hex sits on the pulley face. The six injector lines leave as a ribbon at x −134, 8 mm apart, held by the clip there. They follow the runner about 4 mm off the cast tube. Over the Ø44 spigot the line rises clear of the worm-clamp screws, then a 6 mm centreline bend turns into an 8 mm tube nut. The nut bore is 0.05 mm larger than the line. The steel stops at that nut and stays inside about x ±286. Right-bank lines cross at y 260, just above the plenum lid; cylinder 3 crosses at z −136 so it misses the banjo nuts. The two warm-up-regulator lines drop through the cylinder-6 shroud window (x ≤ −208, z −162/−174, clear of the z −185 wing rib and the hot-air socket screws) and come back inboard under the wing. The cold-start feed, the inlet and the return are short runs off their fittings. A fuel line, a banjo and a clamp are each one solid; distinct solids inside the same part are not allowed to interpenetrate.

The head flange and the bottom end are unchanged. The distributor recess and the ignition-lead paths over the shroud edge are not moved. The canister stays above the alternator (measured clearance about 24 mm); the plenum throttle face (z 128) does not reach the alternator (z ≈ 164).

### Auxiliary air, vacuum, cold-start seat

The black rubber tube that left the air-meter and stopped near the right-front runner was not the throttle boot (it was Ø15, and it met no spigot). On the K-Jetronic layout that takeoff is metered air for the auxiliary air regulator: after the sensor plate, through the regulator, back into the manifold downstream of the throttle. The meter now has a brass barb. One hose runs to the regulator's upper barb; the lower barb feeds a brass pipe on the plenum's flywheel face, clear of the regulator body and of the shroud roof (y 153.5). The cold-start valve is centred on its boss (y 206, the spray hole). The O-ring sits on the boss face, the flange sits on the ring, and two pan-head screws with spring washers bear on the flange. Their shanks run into Ø5 holes in the boss (shank Ø4.8). The air-meter flange and the distributor bracket sit on the plenum lid face (y 253.2, the bevel above the 252 mm profile). The airbox strut feet sit on that same face, and the rubber pads meet the shell.

Vacuum: a nipple on the plenum lid, the T-piece, the limiter's side barb, and a nipple on the distributor vacuum can. Three hoses join those four fittings. The breather tower's neck is the spigot for 901 107 394 00, which the checklist leaves off the engine (the oil tank is body-mounted); there is no breather hose mesh. The heater flexible pipe seats on the left adapter mouth and on a ferrule at the body end. `tests/fuel-lines.test.ts` checks every named line, including these.