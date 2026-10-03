# Running the 930/04

The viewer can turn the engine from one crank angle. Every other moving part is a function of that angle. Ratios are measured from the meshes and from the tooth counts and pulley radii that build them (`measureDrive` in `src/sim/drive.ts`). Nothing in the sim keeps a second copy of those numbers.

The frame is the model's: +X car right (cylinders 1–3), −X car left (cylinders 4–6), +Y up, +Z the pulley and fan end. A positive ratio is right-hand about +Z, which is counter-clockwise when you look at the pulley.

## Pedal and tachometer

| | Value | Source |
| --- | --- | --- |
| Warm idle | 900 rpm | Porsche workshop spec for the 911 SC, 900 ± 50 rpm at oil about 90 °C. Published for the 1982 Targa and 1983 Cabriolet; Pelican's CIS article says "about 950 rpm", which sits inside that band. The 1978 procedure is the same family. The pedal-off target is the centre of the spec, 900. |
| Redline | 6700 rpm | Fuel-pump cutoff for the 1978–79 US SC, nominal 6700 ± 300 rpm. 1980–83 cars are 6500 ± 200. The tachometer red zone starts at 6700 and the dial runs to 7500. |
| Inertia | 0.70 s time constant speeding up, 1.15 s slowing down | Chosen so a held pedal climbs through the range and a release settles back to idle without snapping. |

Holding the Accelerator button, or holding Space or Arrow Up, aims at redline. Releasing it aims at idle. Stop returns the crank to the assembled pose (cylinder 1 at firing TDC) and the tachometer to zero, so teardown still matches the static mesh. A teardown step or an explode does the same. The air-injection pump group (every part id that starts with `air-` except the intake `air-filter` and `air-cleaner-lid`) is hidden until Emissions equipment is checked. With it shown, the pump pulley and its belt follow the pump ratio below.

## Ratios

`dθ/dθcrank` is the right-hand angle about the part's axis per radian of model crank. For the chain it is links along `chainPins` order per crank radian.

| Part | Ratio | Model direction | Source |
| --- | --- | --- | --- |
| Crankshaft, crank gears, crank pulley, flywheel, clutch | +1 | CCW at the pulley | The angle itself. Factory running direction is clockwise at the pulley. See disagreements. |
| Intermediate shaft | −35/60 = −0.583333 | Opposite the crank (CW at the pulley) | External mesh. Crank gear `CRANK_GEAR_T` 35, intermediate `INT_GEAR.teeth` 60, module giving 84 mm centres. Cam-drive note in `src/geo/core.ts`. |
| Camshafts, both banks, and their sprockets | −1/2 | Same sense as the intermediate shaft | (35/60) × (24/28) = 1/2. Both sprockets sit inside the chain, so the cam turns with the intermediate shaft, not with the crank. |
| Timing chain, each bank | −2.22817 links per crank radian | Decreasing pin index, which follows the intermediate teeth | One seated roller is one tooth. Pin angle on the 24 T sprocket, measured from `chainPins`. 24 × 35/60 / 2π. |
| Idler sprocket, each bank | +0.736842 | Opposite the intermediate shaft | Outside wrap. The chain's link rate divided by the idler's tooth angle (19 T), measured from seated pins. Pitch-radius ratio 24 T vs 19 T differs by about 0.2%. |
| Distributor rotor | +1/2 | Same sense as the crank, about `DIST_AXIS` toward the cap | A six-cylinder rotor turns once per two crank revolutions. Forced to 1/2. The gears are not 2:1. See disagreements. |
| Distributor pinion | +22/14 = +1.571429 | Same axis, no-slip with the crank wheel | `DIST_WHEEL_TEETH` 22 and `DIST_PINION_TEETH` 14. Sign is the cross product that matches velocity at the pitch point. |
| Cooling fan, fan pulley, alternator shaft | +1.66274 | Same sense as the crank | Open belt. Cord radii measured on the fan-belt mesh: crank 60.12 mm, fan 36.16 mm. |
| Fan belt | 60.12 mm per crank radian | Along the belt cord, with the crank pulley | Same crank cord. The fan cord × fan ratio matches it. |
| Air-pump pulley | +0.92884 | Same sense as the fan | Open belt on the outer fan groove. Fan ratio × (fan-outer cord 36.41 / pump cord 65.17), both measured on the pump-belt mesh. |
| Air-pump belt | 60.53 mm per crank radian | Along that cord | Fan-outer cord × fan ratio. The pump cord × pump ratio matches it. |
| Pistons and connecting rods | Stroke geometry | Firing order 1-6-2-4-3-5 | Throws `{1:0, 6:60, 2:120, 4:180, 3:240, 5:300}` degrees. TDC is +X on the right bank and −X on the left. |
| Valves and rockers | Cam half-speed, lobe to rocker | Intake nose 450° crank after firing TDC, exhaust nose 270° | `PEAK_CRANK` in `src/geo/valvetrain.ts`, the lobe phase the meshes were built with. |

## Disagreements

These are left as they are. The sim does not edit a mesh to force a catalogue number.

1. **Crank direction.** Factory practice is clockwise at the pulley (turn the pulley clockwise to the Z1 mark). These throws produce 1-6-2-4-3-5 only while the model crank angle increases, which is counter-clockwise looking at the pulley. The pistons stay on the pins the meshes were built with, so the sim follows the mesh. Every "same as the crank" line above is same as this model crank.

2. **Crank-pulley valley.** The groove valley at the belt plane measures r 54.00 mm. The belt cord, measured on the belt mesh, is r 60.12 mm. The belt was built on `FAN.rCrankPulley − 5` = 60. Surface speed uses the cord. The valley is not opened up to hide the gap.

3. **Distributor teeth.** The crank wheel is 22 T and the pinion is 14 T (1.571 : 1). A rotor at half crank speed wants 2 : 1. The rotor is turned at exactly 1/2. The pinion is turned at 22/14 so the two gears stay in mesh. On the car they are one shaft. Stoddard lists pinion 930 602 422 03 as counterclockwise for the 1978–83 SC; the sim's sign is the no-slip direction about `DIST_AXIS`, not a separate claim about that listing.

4. **Crank timing gear.** This model's crank gear is 35 T so (35/60)×(24/28) is exactly 1/2. A 964 technical booklet lists a 34 T crank sprocket on the same 60 T intermediate gear, which is not exactly 1/2. The sim uses the teeth in the mesh. The cam-drive comment in `core.ts` records the same choice.

5. **Valve peaks.** Lobe noses point at the rocker 450° (intake) and 270° (exhaust) of crank after firing TDC. That is the phase baked into the cam meshes. It is not a published 930/04 degree-wheel card, and it is not adjusted to one.

6. **Chain pitch closure.** `chainPins` keeps every chord within 0.2 mm of the 3/8 in pitch (9.525 mm) and an even link count. The closed loop is still about 9.5 mm short of 92 exact pitches, because 90 and 92 are the even counts that bracket the path length. A constant arc speed would walk the rollers onto the teeth. The chain is advanced one link per intermediate-sprocket tooth instead, so a seated roller moves to the next seated roller. Straight-run chords still differ from the pitch by up to 0.16 mm; that residual is the mesh, not a fudge in the ratio.

Fan-pulley valleys (inner r 36.00 at the alternator belt, outer r 36.00 at the air-pump belt) and the air-pump valley (r 65.00) sit within 1 mm of the belt cords measured on those meshes, so they are not listed above.

## Sources

- Porsche Kat 502 USA 911 '83, the catalogue this model is built against. Cam sprocket 28 T is the face count of 901 105 546 04; idler 19 T is the face count of 901 105 055 00. Illustration 108-00 is the air-injection pump on the 930/04.
- `docs/engine-spec.md` § cam drive and § distributor, including the Stoddard pinion note: https://www.stoddard.com/en/distributor-pinion-counterclockwise-rotation-P990031475
- Idle, 900 ± 50 rpm: Porsche workshop spec, 911 SC (published pages for the 1982 Targa and 1983 Cabriolet). https://workshop-manuals.com/porsche/911_sc_targa/f6-2994cc_3.0l_sohc/maintenance/tune-up_and_engine_performance_checks/idle_speed/system_information/specifications/
- Pelican CIS idle note, "about 950 rpm": https://www.pelicanparts.com/techarticles/101_Projects_Porsche_911/31-CIS_Fuel_Injection/31-CIS_Fuel_Injection.htm
- 1978–79 fuel-pump cutoff 6700 ± 300 rpm, and 1980–83 cutoff 6500 ± 200 rpm, as cited from the factory spec book on Pelican: http://forums.pelicanparts.com/porsche-911-technical-forum/515066-sc-2nd-gear-ratio-1-833-1-vs-1-778-1-a.html
- Clockwise at the pulley: Pelican, "911sc — how to turn engine by hand": http://forums.pelicanparts.com/porsche-911-technical-forum/792263-911sc-how-turn-engine-hand.html
