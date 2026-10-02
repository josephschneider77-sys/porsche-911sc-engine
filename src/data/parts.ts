import { SystemKey } from './catalog';
import { CYL_Z, DECK_X, CYL_TOP_X, bankOf, pinX, INTAKE_PORT, INJ, SPARK_Z } from './layout';
import { FASTENER_SPECS } from './fastenerSpec';
import { SMALL_SPECS, smallRef } from './smallSpec';
import { VARIANT } from './variant';

export type Vec3 = [number, number, number];
export interface CatalogRef {
  ill: string; // Porsche catalogue illustration, e.g. "102-00"
  pos: string; // item (position) number in that illustration
  pn: string; // Porsche part number (1978 911 SC application)
  qty?: number; // quantity per engine in the catalogue
  note?: string;
}
export interface PartDef {
  id: string;
  name: string;
  system: SystemKey;
  asset: string; // GLB in public/parts/
  position?: Vec3; // mm, engine frame
  rotation?: Vec3; // radians, Euler XYZ
  explode: Vec3; // mm offset at full explode
  catalog: CatalogRef[];
  description: string;
  specs: Record<string, string>;
}

const R = Math.PI;
const side = (c: number) => (bankOf(c) === 1 ? 'right' : 'left');
const bankRot = (c: number): Vec3 => (bankOf(c) === 1 ? [0, 0, 0] : [0, R, 0]);
const CYLS = [1, 2, 3, 4, 5, 6];

const RUNNER_PN: Record<number, string> = { 1: '911 110 420 06', 2: '911 110 470 06', 3: '911 110 480 06', 4: '911 110 440 06', 5: '911 110 450 06', 6: '911 110 490 06' };

function perCylinder(): PartDef[] {
  const out: PartDef[] = [];
  for (const c of CYLS) {
    const s = bankOf(c), z = CYL_Z[c];
    const { pinX: px, throwXY, rodAngle } = pinX(c, 0);
    out.push({
      id: `conrod-${c}`, name: `Connecting rod, cyl. ${c}`, system: 'crank', asset: 'conrod',
      position: [throwXY[0], throwXY[1], z], rotation: [0, 0, rodAngle], explode: [s * 70, 0, 0],
      catalog: [{ ill: '102-00', pos: '16', pn: '930 103 015 5x', qty: 6, note: 'Weight group 1-9 (633-714 g); last digit = group' },
        { ill: '102-00', pos: '18/19', pn: '914 103 171 00 / 901 103 173 00', qty: 12, note: 'Rod bolt / nut' },
        { ill: '102-00', pos: '20', pn: '930 103 148 00', qty: 12, note: 'Rod bearing shell, std.' }],
      description: 'Forged steel H-section rod with a split big end (bolted cap) and pressed-in bronze small-end bush. Rods are matched by weight group across the engine.',
      specs: { 'Centre distance': '127 mm (est.; 127.8 often cited)', 'Big-end journal': 'Ø53 mm', 'Small-end bush': 'Ø22 mm pin', Material: 'Forged steel' },
    });
    out.push({
      id: `piston-${c}`, name: `Piston, cyl. ${c}`, system: 'pistons', asset: 'piston',
      position: [px, 0, z], rotation: bankRot(c), explode: [s * 170, 0, 0],
      catalog: [{ ill: '102-05', pos: '1', pn: '930 103 962 03', qty: 6, note: 'Supplied as cylinder + piston set (Mahle, -80); Schmidt alt. 930 103 966 04' },
        { ill: '102-05', pos: '2', pn: '930 103 963 00', note: 'Piston ring set' }, { ill: '102-05', pos: '3/4', pn: '930 103 375 00 / N 012 278 1', note: 'Pin / circlip C22' }],
      description: 'Forged/cast light-alloy domed piston for 8.5:1 compression, three rings (two compression, one oil) and a floating wrist pin retained by circlips. Valve reliefs are machined into the dome.',
      specs: { Bore: '95.0 mm', Stroke: '70.4 mm', Compression: '8.5 : 1', Rings: '3', Pin: 'Ø22 mm floating' },
    });
    out.push({
      id: `cylinder-${c}`, name: `Cylinder ${c} (Nikasil)`, system: 'pistons', asset: 'cylinder',
      position: [DECK_X * s, 0, z], rotation: bankRot(c), explode: [s * 290, 0, 0],
      catalog: [{ ill: '102-05', pos: '1', pn: '930 103 962 03', qty: 6, note: 'Matched to piston (size group)' },
        { ill: '102-05', pos: '5/6', pn: '930 104 194 02 / 930 104 317 00', note: 'Base gasket 0.25 mm / head sealing ring' }],
      description: 'Individual finned aluminium barrel with a Nikasil (nickel-silicon carbide) bore coating — new for the 3.0 engines. Each cylinder is clamped between crankcase and head by long head studs; no head gasket, just a sealing ring.',
      specs: { Bore: '95.0 mm', Material: 'Al alloy, Nikasil bore', Fins: 'Radial, ~15', 'Swept volume': '499 cc' },
    });
    out.push({
      id: `head-${c}`, name: `Cylinder head ${c}`, system: 'heads', asset: 'cylinder-head',
      position: [CYL_TOP_X * s, 0, z], rotation: bankRot(c), explode: [s * 400, 0, 0],
      catalog: [{ ill: '103-00', pos: '1', pn: '930 104 029 08', qty: 6, note: 'Without valves' }],
      description: 'Individual single-cylinder cast aluminium head with a hemispherical chamber, two valves in a V, intake port on top and exhaust port below. The spark plug sits low on the exhaust side.',
      specs: { Valves: '2 (1 in / 1 ex)', 'Intake valve': 'Ø49 mm', 'Exhaust valve': 'Ø41.5 mm', 'Valve angle': '~28° in / ~32° ex (est.)' },
    });
    out.push({
      id: `valves-${c}`, name: `Valves & springs, cyl. ${c}`, system: 'valvetrain', asset: `valve-set-${c}`,
      position: [CYL_TOP_X * s, 0, z], rotation: bankRot(c), explode: [s * 470, 0, 0],
      catalog: [{ ill: '103-00', pos: '9', pn: '930 105 409 01', note: 'Intake valve' }, { ill: '103-00', pos: '10', pn: '930 105 419 08', note: 'Exhaust valve (sodium filled)' },
        { ill: '103-00', pos: '13-15', pn: '901 105 901 50 / 901 105 421 03 / 901 105 417 00', note: 'Spring set / retainer / collets' }],
      description: 'Intake (Ø49 mm) and exhaust (Ø41.5 mm) valves with a directional outer spring, inner spring, stepped retainer and two three-bead keeper halves. The stem seal and keepers are the existing catalogue parts, reshaped. Clearance is the 0.10 mm gap at the rocker screw, cold. The mesh is built at the assembled crank, so a cylinder on overlap is off its seat.',
      specs: { 'Valve clearance': '0.10 mm cold', Springs: 'Dual, outer damper coils at the head', 'Stem Ø': '9 mm', 'Installed height': '34.5 mm (Bentley SC, not Dempsey)', 'Keeper grooves': '3' },
    });
    const zRot: Vec3 = s === 1 ? [0, 0, -20 * (R / 180)] : [0, R, -20 * (R / 180)];
    out.push({
      id: `spark-plug-${c}`, name: `Spark plug, cyl. ${c}`, system: 'ignition', asset: 'spark-plug',
      position: [(CYL_TOP_X + 16) * s, -44, z + SPARK_Z * s], rotation: zRot, explode: [s * 380, -220, 0],
      catalog: [{ ill: '901-00', pos: '16', pn: '999 170 162 90', qty: 6 }, { ill: '901-00', pos: '21', pn: '911 602 315 00', note: 'Plug connector' }],
      description: 'Spark plug with shielded connector, fitted from below on the exhaust side of each head.',
      specs: { Thread: 'M14 x 1.25', Gap: '0.7 mm (typ.)' },
    });
    out.push({
      id: `intake-runner-${c}`, name: `Intake pipe, cyl. ${c}`, system: 'induction', asset: `intake-runner-${c}`,
      position: [INTAKE_PORT.x * s, INTAKE_PORT.y, z], rotation: bankRot(c), explode: [s * 240, 420, 0],
      catalog: [{ ill: '106-00', pos: String(c), pn: RUNNER_PN[c], note: c === 6 ? 'Cylinder 6, 930.04 US not California (Kat 502 p97, fig 106-00 #6, 911 110 490 06). California/Japan 911 110 420 06 is not used.' : `Intake pipe, cylinder ${c}` }, { ill: '106-00', pos: '10', pn: '928 110 158 01', note: 'Rubber sleeve' }],
      description: `Cast aluminium intake pipe (Kat 502 p97, fig 106-00 #${c}, ${RUNNER_PN[c]}). Each cylinder has its own web.${c === 3 ? ' Two M8×20 studs stand on the side of this riser (drawn; no 3A line in the text extract).' : ''} A 32 mm rubber sleeve and two worm-drive clamps join the spigot to the distributor. The injector sits in a bored boss with a rubber seat sleeve.`,
      specs: { Material: 'Cast Al', 'Port end': 'Ø44 mm spigot', Sealing: 'Rubber sleeve, 2 clamps' },
    });
    const injRot: Vec3 = [0, 0, (s === 1 ? -57 : 57) * (R / 180)];
    out.push({
      id: `injector-${c}`, name: `Injection valve, cyl. ${c}`, system: 'induction', asset: 'injector',
      position: [(INTAKE_PORT.x + INJ.dx) * s, INTAKE_PORT.y + INJ.dy, z], rotation: injRot, explode: [s * 300, 480, 0],
      catalog: [{ ill: '107-10', pos: '21', pn: '911 110 225 01', qty: 6 }],
      description: 'Bosch K-Jetronic continuous injection valve: opens at ~3.3 bar and sprays continuously into the intake port; quantity is metered by the fuel distributor, not by the nozzle.',
      specs: { Type: 'Bosch CIS (mechanical)', 'Opening pressure': '~3.3 bar (typ.)' },
    });
  }
  return out;
}

const bank = (s: 1 | -1) => (s === 1 ? 'right' : 'left');
function perBank(): PartDef[] {
  const out: PartDef[] = [];
  for (const s of [1, -1] as const) {
    const b = bank(s), B = s === 1 ? 'R' : 'L', ill = s === 1 ? '103-15' : '103-10';
    const cyls = s === 1 ? '1-3' : '4-6';
    out.push({
      id: `cam-housing-${b}`, name: `Camshaft housing, ${b} (cyl. ${cyls})`, system: 'heads', asset: `cam-housing-${b}`, explode: [s * 520, 0, 0],
      catalog: [{ ill: '103-05', pos: '13', pn: '930 105 021 00', qty: 2 }],
      description: 'Cast aluminium cam tower bolted across the three heads of one bank. One body, line-bored for the cam through four webs, with a rocker-shaft bore and spot face each side of every cylinder. Closed by upper and lower valve covers. The left housing is the mirror of the right.',
      specs: { Material: 'Cast Al', 'Cam bore': 'Ø47.1 mm, 4 webs (unverified)', 'Rocker bores': 'Ø18 mm × 6 (unverified)', 'Rocker shafts': '6' },
    });
    for (const up of [true, false]) {
      out.push({
        id: `valve-cover-${up ? 'upper' : 'lower'}-${b}`, name: `Valve cover, ${up ? 'upper' : 'lower'} ${b}`, system: 'heads',
        asset: `valve-cover-${up ? 'upper' : 'lower'}-${b}`, explode: [s * 560, up ? 160 : -160, 0],
        catalog: [up ? { ill: '103-05', pos: '17', pn: '901 105 115 03', qty: 2, note: 'Gasket #18 930 105 194 00' } : { ill: '103-05', pos: '19', pn: '930 105 116 00', qty: 2, note: 'Gasket #20 930 105 195 01' }],
        description: `${up ? 'Upper (intake-side)' : 'Lower (exhaust-side)'} ribbed valve cover sealing the rocker gallery of the camshaft housing.`,
        specs: { Material: 'Cast alloy', Fasteners: 'Nuts on studs' },
      });
    }
    out.push({
      id: `camshaft-${b}`, name: `Camshaft, ${b}`, system: 'camdrive', asset: `camshaft-${b}`, explode: [s * 640, 60, 0],
      catalog: [{ ill, pos: '42', pn: s === 1 ? '930 105 148 08' : '930 105 147 08', qty: 1, note: 'SC grind, -81' }],
      description: 'Chilled cast-iron camshaft with one intake and one exhaust lobe per cylinder, ground journals in the four housing webs, and a keyed nose for the existing Woodruff key, flange, thrust washer and M22 nut. Every lobe peak is under the journal radius so the cam slides in from the chain end. Driven at half crank speed.',
      specs: { Speed: '½ crank', Lobes: '6 (base circle + flank + nose)', Journals: '4 × Ø46.7 mm (unverified)', 'Lobe peak': 'Ø45.4 mm, under the journal (unverified)' },
    });
    out.push({
      id: `rockers-${b}`, name: `Rocker arms & shafts, ${b}`, system: 'valvetrain', asset: `rockers-${b}`, explode: [s * 600, 30, 60],
      catalog: [{ ill, pos: '48', pn: '930 105 043 00', qty: 12, note: 'Rocker arm' }, { ill, pos: '44', pn: '901 105 342 04', qty: 12, note: 'Rocker shaft (expanding)' }, { ill, pos: '49/50', pn: '901 105 370 02 / 999 034 005 00', note: 'Adjusting screw / nut' }],
      description: 'Forged rocker arms on hollow slotted expanding shafts. The pad sits on the cam base circle; clearance is the 0.10 mm gap between the adjuster ball and the valve stem (cold). Intake and exhaust arms mirror across the cam.',
      specs: { Count: '6 per bank', 'Shaft': 'Ø18 mm hollow, 2 grooves (unverified)', Ratio: '~1.1 at this layout (unverified)', Lash: '0.10 mm cold at the screw' },
    });
    out.push({
      id: `timing-chain-${b}`, name: `Timing chain, ${b}`, system: 'camdrive', asset: `timing-chain-${b}`, explode: [s * 380, -40, 240],
      catalog: [{ ill, pos: '1', pn: '901 105 529 00', qty: 1, note: 'Duplex roller chain; can only be removed after splitting the case' }],
      description: 'Duplex roller chain from the 24 T intermediate-shaft sprocket (inside the case chain well) out through the open inner edge of the chain box to the 28 T cam sprocket; the slack lower run passes over the idler sprocket.',
      specs: { Pitch: '9.525 mm (3/8")', Type: 'Duplex', Links: '92 (model)', Plane: s === 1 ? 'z 258 mm' : 'z 235 mm' },
    });
    out.push({
      id: `cam-sprocket-${b}`, name: `Camshaft sprocket, ${b}`, system: 'camdrive', asset: `cam-sprocket-${b}`, explode: [s * 520, 40, 320],
      catalog: [{ ill, pos: '38', pn: '901 105 546 02', qty: 1 }, { ill, pos: '39', pn: '—', note: 'Driven through the dowel pin from the keyed flange (cam-flange)' }],
      description: 'Duplex cam sprocket, held on the cam nose by the M22 nut and spring washer; a dowel pin through one of 17 vernier holes couples it to the keyed flange behind it.',
      specs: { Adjustment: 'Dowel-pin vernier', Teeth: '28 (pitch Ø85)', Speed: '½ crank' },
    });
    out.push({
      id: `cam-flange-${b}`, name: `Camshaft sprocket flange, ${b}`, system: 'camdrive', asset: `cam-flange-${b}`, explode: [s * 580, 50, 240],
      catalog: [{ ill, pos: '36', pn: '901 105 583 01', qty: 1 }],
      description: 'Tall bright keyed hub on the cam nose. The Woodruff key drives it, and 16 round scallops on the short sprocket-face rim take the dowel that drives the sprocket. The lands between the scallops are wider than the scallops, and the bore is open. Choosing which scallop lines up with which of the sprocket’s 17 holes gives the vernier.',
      specs: { Location: 'Woodruff key in the cam-nose keyway', Scallops: '16 on the sprocket-face rim, lands wider than the notches' },
    });
    out.push({
      id: `adjuster-cover-${b}`, name: `Chain-adjuster cover, ${b}`, system: 'camdrive', asset: `adjuster-cover-${b}`, explode: [s * 300, -60, 420],
      catalog: [{ ill, pos: '31', pn: '—', qty: 1, note: 'With gasket #29 and round seal #30' }],
      description: 'Round cover over the chain-adjuster opening in the chain-housing lid, sealed by a gasket and an O-ring style round seal and held by three combination screws.',
      specs: { Screws: '3 (#33) + spring washers (#32)' },
    });
    out.push({
      id: `chain-tensioner-${b}`, name: `Chain tensioner & guides, ${b}`, system: 'camdrive', asset: `chain-tensioner-${b}`, explode: [s * 360, -120, 320],
      catalog: [{ ill, pos: '10', pn: '930 105 049 00', note: 'Chain adjuster (hydraulic, oil-fed on later cars)' }, { ill, pos: '5/6', pn: s === 1 ? '901 105 506 02 / 901 105 055 00' : '901 105 505 02 / 901 105 055 00', note: 'Idler arm / idler sprocket' }, { ill, pos: '2', pn: '911 105 222 06', note: 'Guide rail' }],
      description: 'Heavy forged idler arm with a wide bushed boss. The 19 T idler presses 38 mm into the slack (return) run from outside the loop, so the chain wraps it and rollers seat in its teeth. The sealed hydraulic adjuster lies inclined in the lower inner corner of the box (stud, washer and nut on the cast mounting lug); its plunger dome bears on the round pad on the arm tail. Moulded guide rails sit on the tight run and outside the slack run.',
      specs: { Type: 'Hydraulic adjuster (930/04: sealed unit 930 105 049 00)', Idler: '19 T, outside wrap', 'Slack-run deflection': '38 mm (model)', Plunger: 'in contact with the arm pad' },
    });
    out.push({
      id: `chain-housing-${b}`, name: `Chain housing, ${b}`, system: 'camdrive', asset: `chain-housing-${b}`, explode: [s * 340, -20, 170],
      catalog: [{ ill: '103-05', pos: s === 1 ? '2' : '1', pn: s === 1 ? '930 105 062 01' : '930 105 061 02', qty: 1 }],
      description: 'Deep cast chain box bolted to the crankcase face at the pulley end, outboard of the case chain well; the cam-housing end is gasketed into its outer end. Curved outer wall with draft ribs, straight inner edge, rounded cam end, floor rising from the tensioner corner so it sits well above the heat exchanger.',
      specs: { Material: 'Cast Al', Gasket: '930 105 193 00', 'End view': '≈229 × 200 mm (est.)', Depth: '70 mm to cover face (est.)' },
    });
    out.push({
      id: `chain-housing-lid-${b}`, name: `Chain housing cover, ${b}`, system: 'camdrive', asset: `chain-housing-lid-${b}`, explode: [s * 380, -20, 380],
      catalog: [{ ill: '103-05', pos: s === 1 ? '7' : '6', pn: s === 1 ? '930 105 064 01' : '930 105 063 01', qty: 1 }],
      description: 'Flat cast chain-box cover: straight inner edge, rounded cam end, horizontal and diagonal stiffening ribs, low cam-centre boss and ~13 perimeter nuts.',
      specs: { Gasket: s === 1 ? '930 105 192 01' : '930 105 191 03' },
    });
    out.push({
      id: `heat-exchanger-${b}`, name: `Heat exchanger, ${b} (cyl. ${cyls})`, system: 'exhaust', asset: `heat-exchanger-${b}`, explode: [s * 330, -320, 0],
      catalog: [{ ill: '202-00', pos: '26', pn: '930 211 025 01', qty: 2 }, { ill: '202-00', pos: '31', pn: '930 111 191 13', note: 'Port gasket x6' }],
      description: 'Combined exhaust manifold and cabin heater: three primary pipes pass through a finned inner box inside a steel shell; fresh air blown through the shell is heated and ducted to the cabin.',
      specs: { Material: 'Steel, aluminised', Primaries: '3 per side' },
    });
  }
  return out;
}

const single: PartDef[] = [
  { id: 'crankcase-right', name: 'Crankcase, right half (cyl. 1-3)', system: 'crankcase', asset: 'crankcase-right', explode: [70, 0, 0],
    catalog: [{ ill: '101-10', pos: '1', pn: '930 101 915 00', qty: 1, note: 'Case halves supplied as a matched pair with studs' }],
    description: 'Right half of the vertically split, pressure-cast aluminium crankcase (the 3.0 SC returned to aluminium from the 2.7’s magnesium). Hollow crank bay with seven line-bored main saddles plus the nose saddle in the pulley-end chain well; each saddle has a machined half-bore and two stud pads. Cylinders 1-3 register on spigot bores in the deck.',
    specs: { Material: 'Pressure-cast aluminium', 'Main bearings': '8 (7 + nose)', Fasteners: 'Through-bolts + M8 perimeter', Lubrication: 'Dry sump' } },
  { id: 'crankcase-left', name: 'Crankcase, left half (cyl. 4-6)', system: 'crankcase', asset: 'crankcase-left', explode: [-180, 0, 0],
    catalog: [{ ill: '101-05', pos: '1', pn: '930 101 915 00', qty: 1, note: 'Matched pair' }, { ill: '101-05', pos: '3', pn: '930 101 170 00', qty: 12, note: 'Lower head studs (Dilavar)' }],
    description: 'Left half of the two-piece aluminium crankcase, carrying cylinders 4-6. Same hollow bay and saddle webs as the right half, joined on the machined split flange with sealant, through-bolts and perimeter studs.',
    specs: { Material: 'Pressure-cast aluminium', 'Head studs': 'Steel upper / Dilavar lower', 'Case bolt torque': '3.5 mkg (25 ft-lb) M8' } },
  { id: 'main-bearings', name: 'Main bearing shells (1-8)', system: 'crank', asset: 'main-bearings', explode: [0, -60, 0],
    catalog: [{ ill: '102-00', pos: '21-24', pn: '930 101 901 00', qty: 1, note: 'Set: shells I, II-VII, bearing sleeve VIII 964 101 138 01' }],
    description: 'Steel-backed split main shells for bearings 1-7, each half with a locating tab, plus the one-piece nose bushing (bearing 8) at the pulley end. Bearing 1 (flywheel end) is the thrust bearing.',
    specs: { Count: '7 split + 1 bushing', 'Thrust bearing': 'No. 1' } },
  { id: 'crankshaft', name: 'Crankshaft', system: 'crank', asset: 'crankshaft', explode: [0, -30, 0],
    catalog: [{ ill: '102-00', pos: '1', pn: '930 102 015 01', qty: 1, note: 'SC -79' }],
    description: 'Forged, counterweighted crank with six individual throws and eight main bearings (SC: Ø60 mains 1–7, enlarged nose bearing 8). Thick cheeks, some near-round and some pear-shaped opposite the crankpin. Only the 66 mm 2.0/2.2 T cranks were uncounterweighted.',
    specs: { Stroke: '70.4 mm', 'Main journals': 'Ø60 mm', 'Rod journals': 'Ø53 mm', Throws: '6 @ 120°', 'Firing order': '1-6-2-4-3-5' } },
  { id: 'crank-gears', name: 'Crank timing gear & distributor drive gear', system: 'crank', asset: 'crank-gears', explode: [0, -30, 90],
    catalog: [{ ill: '102-00', pos: '8', pn: '901 102 111 00', note: 'Timing gear (drives intermediate shaft)' }, { ill: '102-00', pos: '10', pn: VARIANT.driveWheel, note: 'Distributor drive wheel for this engine variant' }],
    description: 'Gear on the crank nose driving the intermediate shaft, plus the helical gear that drives the distributor shaft.',
    specs: { Drive: 'Crank → intermediate shaft (gear)', 'Tooth counts': '35 : 60 (module 168/95, 84 mm centres)' } },
  { id: 'intermediate-shaft', name: 'Intermediate shaft', system: 'camdrive', asset: 'intermediate-shaft', explode: [0, -180, 60],
    catalog: [{ ill: '103-15', pos: '43', pn: '930 105 013 01', qty: 1, note: 'Size 0 (gear code matched to case)' }],
    description: 'Lay shaft below the crank, gear-driven from the crankshaft (60 T helical gear, 35:60). Two 24 T duplex sprockets drive the cam chains so the cams turn at half crank speed. The flywheel end drives the oil pump through a separate splined connecting shaft.',
    specs: { Bearings: '2 plain', 'Drives': 'Cam chains + oil pump', Sprockets: '2 × 24 T duplex', Gear: '60 T helical, module 168/95' } },
  { id: 'oil-pump', name: 'Oil pump (pressure + scavenge)', system: 'lubrication', asset: 'oil-pump', explode: [0, -200, -140],
    catalog: [{ ill: '104-00', pos: '1', pn: '911 107 008 01', qty: 1 }, { ill: '104-00', pos: '6', pn: '901 107 121 00', note: 'Connecting shaft' }],
    description: 'Cast two-section pump in the flywheel-end bay, long axis across the case: larger scavenge section, smaller pressure section, four top ribs, three mounting ears on the cover, and a pickup that leaves the pressure end and rises about 90° in a bend as long as the body. The three M8 nuts sit on those ears. A splined stub on the intermediate-shaft axis drives it through the dark connecting shaft.',
    specs: { Type: 'Gear, 2-stage, 4-rib', System: 'Dry sump, ~13 L total (typ.)' } },
  { id: 'sump-plate', name: 'Sump cover plate & oil strainer', system: 'lubrication', asset: 'sump-plate', explode: [0, -300, 0],
    catalog: [{ ill: '101-05', pos: '38', pn: '930 107 314 00', qty: 1, note: 'Oil strainer' }, { ill: '101-05', pos: '39', pn: '930 101 391 01', qty: 2, note: 'Gaskets' }, { ill: '101-05', pos: '41', pn: '911 107 176 03', note: 'Drain plug' }],
    description: 'Pressed-steel sump cover: flat field, raised outer rim, and a wide horseshoe channel (about 5.5 mm deep, 18 mm wall) with the hex drain plug in the notch at the top of the U. The coarse strainer and its two gaskets sit inboard of the plate. Eight M6 nuts (101-05 #35); the other four of that line hold the breather lid.',
    specs: { Fasteners: '8 × M6', Drain: '911 107 176 03' } },
  { id: 'oil-thermostat', name: 'Oil thermostat', system: 'lubrication', asset: 'oil-thermostat', explode: [40, 180, 40],
    catalog: [{ ill: '101-10', pos: '37', pn: '930 107 765 00', qty: 1 }],
    description: 'Wax-element cartridge (930 107 765 00) in the top of the right case half at the pulley end, beside the oil-pressure switch. Flange, O-ring land, rectangular windows onto the brass element, a yellow band and a dark cup; the body sits down in the case. Two M6 nuts and two spring washers (101-10 #36/#35). The three lock nuts belong to the intermediate-shaft cover.',
    specs: { Location: 'Top of the right case half, pulley end' } },
  { id: 'oil-cooler', name: 'Engine oil cooler', system: 'lubrication', asset: 'oil-cooler', explode: [220, -60, -40],
    catalog: [{ ill: '104-00', pos: '8', pn: '911 107 041 00', qty: 1 }],
    description: 'Behr plate-and-fin crankcase cooler (911 107 041 00) on the right case deck at the flywheel end, in the pocket between cylinder 3 and the ring gear. Mount face x = 103, normal +X. The core runs outboard, parallel to the cylinders: long axis +X, height along Y, depth along Z. Fins are X-Y plates stacked along Z so fan air drops through them top to bottom; the ±Z faces are smooth side panels. The BEHR stamp is on the outboard end plate, readable from the outboard side. A Ø14 return runs along the bottom face and ends in a spigot pointing +X. Real core 195 × 140 × 80 mm. This model uses 137 × 140 × 60 because the cyl-3-to-ring gap here is about 65 mm against about 100 mm on the car; the real depth hits the flywheel and the cam housing. Seals: two 999 704 172 50 (104-00 #3) side by side on the upper ports and one 999 704 173 50 (104-00 #2) on the lower port. With the shroud on, only the cap (911 106 406 00) shows.',
    specs: { Location: 'Right case deck, flywheel end, between cyl 3 and the ring gear', Type: 'Plate-and-fin, air top to bottom', Fasteners: '4 × M8 stud, nut and spring washer, normal +X', Core: 'model-fit 137 × 140 × 60 mm (real 195 × 140 × 80)', Seals: '2 × 999 704 172 50 (#3), 1 × 999 704 173 50 (#2)' } },
  { id: 'breather-lid', name: 'Crankcase breather cover', system: 'lubrication', asset: 'breather-lid', explode: [0, 260, 60],
    catalog: [{ ill: '101-05', pos: '37', pn: '901 107 073 02', qty: 1, note: '1978 SC lid. 930 107 073 00 is tagged 83-/turbo in this catalogue; Stoddard’s cast 930 107 073 02 is the later supersession.' }],
    description: 'Cast aluminium breather tower on top of the left case half at the pulley end: ribbed body, angled hose neck to the oil tank, and a small switch boss. The 1978 catalogue line is 901 107 073 02 (101-05 #37, USA). Four M6 nuts (101-05 #35).', specs: { Fasteners: '4 × M6 (101-05 #35)' } },
  { id: 'fan-housing', name: 'Fan housing', system: 'cooling', asset: 'fan-housing', explode: [0, 80, 640],
    catalog: [{ ill: '105-00', pos: '1', pn: '930 106 005 00', qty: 1, note: '-79 up to engine 639 9201' }, { ill: '105-00', pos: '2', pn: '—', note: 'Alternator strap' }],
    description: 'Unpainted dull-grey magnesium drum: grooved barrel, rolled intake bell, five broad stator vanes and a solid alternator cradle. A yellow-zinc band clamp sits on the barrel where the red upper air guide wraps it. Fan and alternator come out as one unit, sliding out through the shroud collar.',
    specs: { Material: 'Cast magnesium, unpainted', Mount: 'Strap-clamped alternator', Throat: '~234 mm' } },
  { id: 'fan-impeller', name: 'Cooling fan (11 blades)', system: 'cooling', asset: 'fan-impeller', explode: [0, 100, 700],
    catalog: [{ ill: '105-00', pos: '6', pn: '930 106 011 01', qty: 1, note: '-79' }, { ill: '105-00', pos: '7', pn: '930 106 564 00', note: 'Shims (belt tension)' }],
    description: 'Eleven broad twisted blades on a large cast hub dish (1978–79, Ø226). The yellow-zinc face plate is riveted to the dish and carries the inner pulley half.',
    specs: { Blades: '11', 'Ratio': '~1.67 : 1 (belt pitch 60 / 36)', Diameter: '226 mm' } },
  { id: 'alternator', name: 'Alternator', system: 'cooling', asset: 'alternator', explode: [0, 70, 560],
    catalog: [{ ill: '902-05', pos: '1', pn: '911 603 120 02', qty: 1, note: 'Generator -81' }],
    description: 'Bosch 14 V alternator in the fan-housing cradle. Cast end shields, a darker laminated stator with copper windings in the windows, and a slip-ring end with two diode plates, a brush block and terminal studs. The fan is on its shaft; the belt drives it from the crank pulley. External regulator on the 1978 car.',
    specs: { Output: '14 V, ~70 A', Regulator: 'External (1978)' } },
  { id: 'fan-pulley', name: 'Fan / alternator pulley', system: 'cooling', asset: 'fan-pulley', explode: [0, 80, 760],
    catalog: [{ ill: '105-00', pos: '8', pn: '911 106 208 00', qty: 1 }, { ill: '105-00', pos: '10', pn: '911 106 033 03', note: 'Hub extension' }],
    description: 'Removable outer half of the split 82 mm pulley (911 106 208 00). Two V-grooves: the inner one takes the alternator belt, the outer one the air-injection belt. Six 0.5 mm shims (five between the halves, one outside) and the cupped cap under the M16 nut. The inner half is the face plate on the fan hub. 108-00 #35 is this same pulley.', specs: { Adjustment: '6 × 0.5 mm shims', 'Outside diameter': '~82 mm', Grooves: '2' } },
  { id: 'fan-belt', name: 'V-belt', system: 'cooling', asset: 'fan-belt', explode: [0, 150, 560],
    catalog: [{ ill: '105-00', pos: '12', pn: '999 192 097 50', qty: 1, note: '9.5 x 725, -79' }],
    description: 'Narrow V-belt from crank pulley to the fan/alternator pulley. Losing it means no cooling.', specs: { Size: '9.5 x 725 mm' } },
  { id: 'crank-pulley', name: 'Crankshaft pulley', system: 'crank', asset: 'crank-pulley', explode: [0, 0, 420],
    catalog: [{ ill: '102-00', pos: '12', pn: '930 102 028 09', qty: 1, note: '-78, Ø134. 930 102 028 01 is also tagged -78/SC.' }],
    description: 'Single-groove pressed-steel pulley, about Ø134, with concentric pressed rings and a Z1/TDC notch. The belt pitch sits in that groove. The twin-groove crank pulley was the air-conditioning option.', specs: { Grooves: '1', 'Outside diameter': '~134 mm', Marks: 'Z1 (TDC cyl 1)', Finish: 'Yellow zinc' } },
  { id: 'upper-air-guide', name: 'Upper air guide (shroud)', system: 'cooling', asset: 'upper-air-guide', explode: [0, 300, 0],
    catalog: [{ ill: '105-05', pos: '1', pn: '930 106 041 00', qty: 1, note: 'Catalogue lists this -78 part as red; later replacement PCG 106 041 04 is black' }],
    description: '1978 orange-red moulded shell. The fan-end collar wraps the front of the grey fan housing; each wing has three stadium injector windows. The right flywheel-end corner is open over the oil cooler so air from the tunnel can drop through the fins. The later black PCG 106 041 04 is the replacement, not what this car wears.', specs: { Material: 'GRP, orange-red', Colour: '1978 red (930 106 041 00)' } },
  { id: 'oil-cooler-cap', name: 'Oil-cooler cap', system: 'cooling', asset: 'oil-cooler-cap', explode: [280, 80, -180],
    catalog: [{ ill: '105-05', pos: '3', pn: '911 106 406 00', qty: 1 }],
    description: 'Small cap (911 106 406 00, 105-05 #3) over the oil-cooler pocket on the right flywheel end. With the shroud fitted, this is the only part of the cooler visible. The skirt screw at z −185 and the four right end-plate screws seat on it.',
    specs: { Location: 'Over the right flywheel-end cooler pocket', 'Part number': '911 106 406 00' } },
  { id: 'plenum', name: 'Air distributor & air-cleaner housing', system: 'induction', asset: 'plenum', explode: [0, 520, 0],
    catalog: [{ ill: '106-00', pos: '9', pn: '911 110 106 13', qty: 1, note: '930.04 US, not California (Kat 502 p97, fig 106-00 #9). California housing 911 110 106 15 is not used.' }],
    description: '1978 US (930/04) air distributor 911 110 106 13: a tray-lipped box with six horizontal 38 mm ports and a round opening for the separate throttle housing. Cold-start boss on the flywheel end. The lower half of the oval air-cleaner canister sits on an outlet neck. The intake snout is on the lid. No cold-start spider.', specs: { 'Port ID': '38 mm', 'Box': '155 × 190 × 78 mm', 'Throttle': 'separate, 930 110 248 02' } },
  { id: 'air-filter', name: 'Air filter element', system: 'induction', asset: 'air-filter', explode: [0, 640, 0],
    catalog: [{ ill: '106-00', pos: '13', pn: '911 110 185 02', qty: 1 }], description: 'Rectangular panel element (Mahle LX 261): orange urethane frame, pleated paper. 402 × 181 × 41.4 mm.', specs: { Length: '402 mm', Width: '181 mm', Height: '41.4 mm' } },
  { id: 'air-cleaner-lid', name: 'Air cleaner lid', system: 'induction', asset: 'air-cleaner-lid', explode: [0, 760, 0],
    catalog: [{ ill: '106-00', pos: '14', pn: '930 110 184 00', qty: 1 }, { ill: '106-00', pos: '15', pn: '930 110 365 00', note: 'Restraining strap' }],
    description: 'Lid 930 110 184 00 (106-00 #14): the upper half of the oval air cleaner, with the intake snout on the left end above the equator, four wire clips and the yellow label.', specs: {} },
  { id: 'mixture-control-unit', name: 'Mixture control unit (air-flow meter + fuel distributor)', system: 'induction', asset: 'mixture-control-unit', explode: [-320, 600, 0],
    catalog: [{ ill: '107-00', pos: '1', pn: '911 110 967 00', note: 'Fuel distributor, 930.04 (Kat 502 p106, fig 107-00 #1)' }, { ill: '107-00', pos: '2', pn: '911 110 965 00', note: 'Air flow meter' }, { ill: '107-00', pos: '9', pn: '911 110 943 00', note: 'Sensor plate' }],
    description: 'Bosch K-Jetronic mixture unit for the 1978 US engine (930/04). The air-flow meter sits on the plenum venturi, with a barbed takeoff for the auxiliary-air hose and an outlet bell Ø131 (E, from clamp S 131/9). The fuel distributor (Kat 502 p106) keeps the 80 × 40 × 88 mm footprint: waisted ribbed lower housing, upper housing jointed at mid-height, hex outlet towers 15 mm proud on the Ø76 circle (E). Screw socket #49 for control-pressure line #51 stands on a raised hub at the top centre, with a union nut rather than a fourth banjo. Cold-start banjo and two M12 connection pieces. No M14 return union.',
    specs: { System: 'Bosch CIS K-Jetronic', 'System pressure': '~4.5-5.2 bar (typ.)' } },
  { id: 'fuel-lines', name: 'Injection lines & warm-up regulator', system: 'induction', asset: 'fuel-lines', explode: [-160, 560, 0],
    catalog: [{ ill: '107-10', pos: '23', pn: '911 110 093 11 / 12', note: 'Injection lines cyl 1-3 / 4-6' }, { ill: '107-10', pos: '54', pn: '911 606 105 09', note: 'Warm-up valve (control pressure regulator)' }],
    description: 'Steel CIS lines for 930/04 (Kat 502 p110–113, fig 107-10). Six injector lines (911 110 093 11 for cylinders 1–3, 911 110 093 12 for 4–6) each end in a union nut on the injector thread. Line #61 (930 110 513 00) runs from the warm-up banjo to the return-side M12. Line #62 (930 110 514 00) leaves the other M12. Line #63 (930 110 570 00) joins the distributor banjo to the cold-start banjo. The warm-up line #51 lives in wur-lines.', specs: { Lines: '6 injector + #61 + #62 + #63' } },
  { id: 'ignition-leads', name: 'Ignition lead set', system: 'ignition', asset: 'ignition-leads', explode: [-60, 460, 60],
    catalog: [{ ill: '901-00', pos: '17', pn: '911 609 011 07', qty: 1, note: 'Left set, braided' }, { ill: '901-00', pos: '17A', pn: '911 609 010 07', qty: 1, note: 'Right set, braided' }, { ill: '901-00', pos: '9', pn: '—', note: 'Primary lead, CD box is body-mounted' }, { ill: '901-00', pos: '18', pn: '911 609 061 07', note: 'Coil lead' }], description: 'Two braided three-lead sets, left 911 609 011 07 and right 911 609 010 07, each gathered by a band. The right set has ring-terminal ground pigtails. Leads leave the suppression connectors on a bend of at least 25 mm. Plug-end runs stay on the current plug pose. The coil lead and the primary end in the clip on the shroud’s pulley-end bay edge.', specs: { Leads: '6 plug + coil + primary', Shield: 'Braided, left and right sets' } },
  { id: 'fan-hub', name: 'Fan hub extension', system: 'cooling', asset: 'fan-hub', explode: [0, 100, 680],
    catalog: [{ ill: '105-00', pos: '10', pn: '—', qty: 1 }], description: 'Yellow-zinc face plate riveted to the fan, carrying the inner pulley half, a ring of 16 holes and the keyed boss. Six studs hold it to the hub dish.', specs: { Studs: '6' } },
  { id: 'airbox-struts', name: 'Air-cleaner struts', system: 'induction', asset: 'airbox-struts', explode: [0, 640, 0],
    catalog: [{ ill: '106-00', pos: '18', pn: '911 110 133 02', note: 'Straight strut' }, { ill: '106-00', pos: '19', pn: '911 110 269 00', note: 'Angled strut, tags -80' }, { ill: '106-00', pos: '20', pn: '911 110 154 00', note: 'Bonded rubber buffer ×2' }], description: 'Two struts (911 110 133 02 straight, 911 110 269 00 angled) with one bonded rubber buffer each, on four M8 studs at the flywheel side of the distributor lid.', specs: {} },
  { id: 'warm-up-regulator', name: 'Warm-up regulator', system: 'induction', asset: 'warm-up-regulator', explode: [-200, 300, -200],
    catalog: [{ ill: '107-10', pos: '54', pn: '—', qty: 1 }], description: 'Bosch warm-up (control-pressure) regulator bolted to the left case half so it feels engine temperature.', specs: { Fastening: '2 screws' } },
  { id: 'distributor', name: 'Ignition distributor', system: 'ignition', asset: 'distributor', explode: [-160, 420, 100],
    catalog: [{ ill: '901-00', pos: '1', pn: '930 602 021 02', qty: 1, note: '930/04, -79' }, { ill: '901-00', pos: '2', pn: '930 602 910 00', note: 'Vacuum unit' }, { ill: '901-00', pos: '8', pn: '930 602 904 00', note: 'Cap' }, { ill: '901-00', pos: '3', pn: '930 602 902 00', note: 'Rotor' }, { ill: '901-00', pos: '23', pn: '122 035 281', qty: 7, note: 'Suppression connectors on the six towers and the centre tower' }, { ill: '901-00', pos: '35', pn: '930 602 922 00', note: 'Pinion pin' }, { ill: '901-00', pos: '36', pn: '930 602 422 03', note: 'Pinion, counterclockwise (930/04). 422 02 is the 930/03 pinion' }],
    description: 'Bosch breakerless CD distributor 930 602 021 02 in the left-case bore at the pulley end. Cast housing with a hold-down lug on the case stud. Black cylindrical cap, about Ø70, with a shoulder ring and two 1.5 mm spring-steel bails. Six towers with straight suppression connectors 122 035 281, plus one on the centre tower. Shallow zinc vacuum can on a curved saddle under the cap rim; the nipple is on the rim and points toward the cap. The hose seat is DIST_VAC_NIPPLE.',
    specs: { 'Firing order': '1-6-2-4-3-5', Ignition: 'CD, breakerless', Location: 'Left case, pulley end', Cap: 'Ø70 Bosch, black', 'Vacuum can': 'Ø52 × 22 on a saddle, nipple toward the cap', Rotation: 'CCW (looking down the cap)' } },
  { id: 'muffler', name: 'Exhaust silencer', system: 'exhaust', asset: 'muffler', explode: [0, -260, 520],
    catalog: [{ ill: '202-00', pos: '1', pn: '930 111 022 00', qty: 1 }, { ill: '202-00', pos: '2', pn: '911 111 191 01', note: 'Gasket' }],
    description: 'Transverse rear silencer fed by both heat exchangers, single tailpipe on the left.', specs: {} },
  { id: 'flywheel', name: 'Flywheel with starter ring gear', system: 'clutch', asset: 'flywheel', explode: [0, 0, -320],
    catalog: [{ ill: '102-00', pos: '2', pn: '930 102 204 00', qty: 1, note: '-79; 9 bolts #6 930 102 206 00' }, { ill: '301-00', pos: '5', pn: '911 116 239 00', note: 'Starter ring gear' }],
    description: 'Steel flywheel bolted to the crank flange with nine bolts, carrying the shrunk-on starter ring gear and the clutch friction face.', specs: { Bolts: '9' } },
  { id: 'clutch-disc', name: 'Clutch disc', system: 'clutch', asset: 'clutch-disc', explode: [0, 0, -440],
    catalog: [{ ill: '301-00', pos: '2', pn: '915 116 011 19', qty: 1 }], description: 'Sprung-hub clutch disc splined to the 915 gearbox input shaft.', specs: { Diameter: '225 mm' } },
  { id: 'pressure-plate', name: 'Clutch pressure plate', system: 'clutch', asset: 'pressure-plate', explode: [0, 0, -560],
    catalog: [{ ill: '301-00', pos: '1', pn: '915 116 001 27', qty: 1 }, { ill: '301-00', pos: '3', pn: '900 027 015 02', note: 'Lock rings x9' }],
    description: 'Diaphragm-spring pressure plate bolted to the flywheel.', specs: { Diameter: '225 mm' } },
];

function ancillary(): PartDef[] {
  const out: PartDef[] = [
    { id: 'ishaft-cover', name: 'Intermediate-shaft cover', system: 'crankcase', asset: 'ishaft-cover', explode: [40, -40, 220],
      catalog: [{ ill: '101-10', pos: '39', pn: '911 105 162 00', qty: 1, note: 'Up to engine 63D 4069' }],
      description: 'Oval cover on the pulley-end face of the right crankcase half, closing the intermediate shaft. Three M6 lock nuts (101-10 #41) and a gasket. These are the three lock nuts that used to be counted on the oil thermostat.',
      specs: { Fasteners: '3 × M6 lock nut', Applies: 'up to 63D 4069' } },
  ];
  if (VARIANT.airInjection) out.push(
    { id: 'air-pump', name: 'Air-injection pump', system: 'exhaust', asset: 'air-pump', explode: [-220, -80, 80],
      catalog: [{ ill: '108-00', pos: '7', pn: '911 113 111 03', qty: 1 }],
      description: 'Air-injection pump 911 113 111 03, low on the left (distributor side) at the pulley end. It swings on the M8×120 pivot screw. The outlet faces the diverter valve.',
      specs: { 'Centre distance': '~316 mm from the fan axis', Belt: '9.5 × 950' } },
    { id: 'air-pump-pulley', name: 'Air-injection pump pulley', system: 'exhaust', asset: 'air-pump-pulley', explode: [-220, -40, 160],
      catalog: [{ ill: '108-00', pos: '8', pn: '911 113 158 01', qty: 1 }],
      description: 'Pressed-steel pulley 911 113 158 01 on the pump shaft, one V-groove in line with the outer groove of the fan pulley.',
      specs: { 'Pitch radius': '65 mm' } },
    { id: 'air-pump-belt', name: 'Air-injection V-belt', system: 'exhaust', asset: 'air-pump-belt', explode: [-80, 40, 160],
      catalog: [{ ill: '108-00', pos: '34', pn: '900 192 021 50', qty: 1, note: '9.5 × 950' }],
      description: 'V-belt 900 192 021 50 (9.5 × 950) from the outer groove of the fan pulley to the pump pulley, behind the alternator belt.',
      specs: { Size: '9.5 × 950 mm' } },
    { id: 'air-pump-bracket', name: 'Air-injection pump bracket', system: 'exhaust', asset: 'air-pump-bracket', explode: [-160, 40, 40],
      catalog: [{ ill: '108-00', pos: '1', pn: '911 113 113 02', qty: 1 }],
      description: 'Bracket 911 113 113 02 carrying the pump pivot. Two feet take M8 nuts; the arm reaches the pump without meeting the case skin.',
      specs: {} },
    { id: 'air-pump-strap', name: 'Air-injection tension strap', system: 'exhaust', asset: 'air-pump-strap', explode: [-180, 80, 80],
      catalog: [{ ill: '108-00', pos: '14', pn: '911 113 125 02', qty: 1 }],
      description: 'Slotted tension strap 911 113 125 02 from the top of the pump up to the retaining bracket on the fan housing. It sits inboard of the belt.',
      specs: {} },
    { id: 'air-retainer', name: 'Air-injection retaining bracket', system: 'exhaust', asset: 'air-retainer', explode: [-80, 120, 80],
      catalog: [{ ill: '108-00', pos: '12', pn: '911 113 126 02', qty: 1 }],
      description: 'Retaining bracket 911 113 126 02 on the left of the fan housing, with two bonded rubber buffers.',
      specs: { Buffers: '2 × 930 110 194 00' } },
    { id: 'air-check-valve', name: 'Air-injection check valve', system: 'exhaust', asset: 'air-check-valve', explode: [-80, 80, 40],
      catalog: [{ ill: '108-00', pos: '26', pn: '911 113 115 01', qty: 1 }],
      description: 'Check valve 911 113 115 01, vertical. The outlet points down: AIR_CHECK_VALVE_OUTLET.direction is (0, −1, 0) and the point is the hex face. Top End’s air tube starts there; its spigot points the other way, up into the hex. Sealing ring #21 sits on the face. The tube itself is not modelled here.',
      specs: { Outlet: 'M24 hex, A24×29 ring' } },
    { id: 'air-diverter', name: 'Air-injection diverter valve', system: 'exhaust', asset: 'air-diverter', explode: [-200, -40, 20],
      catalog: [{ ill: '108-00', pos: '22', pn: '930 113 147 01', qty: 1 }],
      description: 'Diverter valve 930 113 147 01 beside the pump, sending pump air to the check valve or dumping it.',
      specs: {} },
    { id: 'air-diverter-support', name: 'Diverter-valve support', system: 'exhaust', asset: 'air-diverter-support', explode: [-200, -80, 20],
      catalog: [{ ill: '108-00', pos: '23', pn: '930 113 146 01', qty: 1 }],
      description: 'Support 930 113 146 01 under the diverter valve, held by two hex nuts and spring washers.',
      specs: {} },
    { id: 'air-pump-cleaner', name: 'Air-injection pump air cleaner', system: 'exhaust', asset: 'air-pump-cleaner', explode: [-160, 20, 40],
      catalog: [{ ill: '108-00', pos: '17', pn: '911 113 117 02', qty: 1 }],
      description: 'Small air cleaner 911 113 117 02 on the inboard side of the air pump.',
      specs: {} },
  );
  out.push(
    { id: 'heater-blower', name: 'Heater blower', system: 'cooling', asset: 'heater-blower', explode: [180, 40, 200],
      catalog: [{ ill: '108-10', pos: '1', pn: '911 624 151 02', qty: 1 }],
      description: 'Heater blower 911 624 151 02 (108-10) on the right of the fan housing, feeding the two heat-exchanger hoses.',
      specs: {} },
    { id: 'heater-blower-support', name: 'Heater blower support', system: 'cooling', asset: 'heater-blower-support', explode: [140, 40, 160],
      catalog: [{ ill: '108-10', pos: '2', pn: '911 211 139 02', qty: 1 }],
      description: 'Support 911 211 139 02 carrying the heater blower off the fan-housing side.',
      specs: {} },
  );
  if (VARIANT.egr) out.push(
    { id: 'egr-valve', name: 'EGR valve', system: 'exhaust', asset: 'egr-valve', explode: [-40, -180, 0],
      catalog: [{ ill: '202-05', pos: '7', pn: '911 113 183 01', qty: 1 }],
      description: 'EGR valve 911 113 183 01 (202-05 #7) under the catalytic converter, between the two pipelines.',
      specs: {} },
    { id: 'egr-pipe-feed', name: 'EGR feed pipeline', system: 'exhaust', asset: 'egr-pipe-feed', explode: [-80, -160, -40],
      catalog: [{ ill: '202-05', pos: '1', pn: '930 113 190 01', qty: 1 }],
      description: 'Pipeline 930 113 190 01 (202-05 #1) from the EGR valve inlet nipple to the flanged takeoff on the left heat exchanger.',
      specs: {} },
    { id: 'egr-pipe-return', name: 'EGR return pipeline', system: 'exhaust', asset: 'egr-pipe-return', explode: [80, -160, 40],
      catalog: [{ ill: '202-05', pos: '11', pn: '911 113 177 03', qty: 1 }],
      description: 'Pipeline 911 113 177 03 (202-05 #11) from the EGR valve outlet nipple to the boss on the catalytic converter.',
      specs: {} },
    { id: 'egr-bracket', name: 'EGR retaining bracket', system: 'exhaust', asset: 'egr-bracket', explode: [-40, -200, 0],
      catalog: [{ ill: '202-05', pos: '3', pn: '—', qty: 1 }],
      description: 'Retaining bracket (202-05 #3) under the EGR valve. The audit transcription does not give a part number.',
      specs: {} },
  );
  return out;
}

const base: PartDef[] = [...single, ...perBank(), ...perCylinder(), ...ancillary()];
/** Fastener sets (data/fastenerSpec.ts) as removable hardware parts; geometry is in world coordinates (no pose). */
function hardware(): PartDef[] {
  const ex = (id: string) => base.find((p) => p.id === id)!.explode;
  const hw = FASTENER_SPECS.map((f) => {
    const e = ex(f.follows);
    const len = Math.hypot(...e) || 1;
    return {
      id: f.id, name: f.name, system: 'hardware' as SystemKey, asset: f.id,
      explode: e.map((v) => v * (1 + 60 / len)) as Vec3,
      catalog: f.catalog, description: f.description,
      specs: { Quantity: String(f.count), Size: f.size, 'Removed at step': f.step },
    };
  });
  const small = SMALL_SPECS.map((f) => {
    const e = ex(f.follows); const len = Math.hypot(...e) || 1;
    return { id: f.id, name: f.name, system: 'hardware' as SystemKey, asset: f.id, explode: e.map((v) => v * (1 + 40 / len)) as Vec3,
      catalog: f.catalog?.length ? f.catalog : [{ ill: smallRef(f.id)[0], pos: smallRef(f.id)[1], pn: '—', qty: f.count }], description: f.description, specs: { Quantity: String(f.count), Size: f.size, 'Removed at step': f.step } };
  });
  return [...hw, ...small];
}
export const PARTS: PartDef[] = [...base, ...hardware()];
export const PART_BY_ID: Record<string, PartDef> = Object.fromEntries(PARTS.map((p) => [p.id, p]));
export { side };
