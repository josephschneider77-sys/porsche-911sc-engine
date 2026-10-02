/**
 * Parts-catalogue checklist (v5): every engine-group line of the 911 SC parts catalogue (docs/catalog/engine-lines.json,
 * extracted from the Kat 002 reference pack) is either CLAIMED by modelled geometry with the matching quantity, or
 * explicitly NOT APPLICABLE with a reason. Lines the extractor already excluded (other models, later model years,
 * repair oversizes) carry their `auto` reason. An unclaimed line that shares its illustration position with a claimed
 * (or N/A) line is an alternative part number for the same item and is listed as such.
 *
 * A claim names what supplies the quantity:
 *  - a fastener set (src/geo/fasteners.ts) with `what` = item | washer | spring | tab | stud (validated against the
 *    set's flags: a washer claim needs a modelled washer under every head, a stud claim needs modelled studs, ...),
 *  - a small-part set (src/geo/smallParts.ts): `what` = item, or a feature label from FEATURES,
 *  - a registry part (src/data/parts.ts): `what` = item (the part itself) or a feature label from FEATURES
 *    (e.g. the bolts and shells drawn as part of each conrod),
 *  - a pool (POOLS) of several of the above, used where the catalogue splits one kind of item by length/variant and
 *    the model only knows stations (crankcase studs: which length sits in which hole is estimated, E).
 * `by` may use `*` globs, or a regex when it starts with ^. The test (tests/checklist.test.ts) expands every claim to concrete sources and allocates the
 * quantity against their capacity, so no modelled item is counted twice.
 * Used only by tests and scripts/checklist-doc.ts (not bundled into the app).
 */
export interface Claim { line: string; by: string; what?: string; n?: number; note?: string }
export interface NotApplicable { line: string; why: string }

/** Per-instance counts of items drawn as part of a registry part or a small-part prototype. */
export const FEATURES: Record<string, Record<string, number>> = {
  'crankcase': { bellstud: 4 },
  'conrod': { bush: 1, bolt: 2, nut: 2, shell: 2 },
  'piston': { pin: 1, clip: 2, rings: 1 },
  'valves': { intake: 1, exhaust: 1, shim: 2, seat: 2, springs: 2, retainer: 2, collet: 4, seal: 2, guide: 2 },
  'main-bearings': { shellI: 2, shell: 12, sleeve: 1 },
  'crank-gears': { gear: 1, drive: 1 },
  'rockers': { shaft: 6, bush: 6, arm: 6, screw: 6, locknut: 6 },
  'chain-tensioner': { rail: 3, support: 1, idler: 1, bolt: 1, adjuster: 1, bleeder: 1, spring: 1, nut: 1 },
  'cam-flange-cover': { gasket: 1, seal: 1 },
  'sump-plate': { lidgasket: 1, strainer: 1, gasket: 2, plug: 1 },
  'oil-pump': { shaft: 1 },
  'fan-housing': { strap: 1, clamp: 1, washer: 2, nut: 2 },
  'fan-pulley': { shim: 1 },
  'upper-air-guide': { socket: 1 },
  'airbox-struts': { strutA: 1, strutB: 1, buffer: 2 },
  'mixture-control-unit': { distributor: 1, meter: 1 },
  'fuel-lines': { line: 6, fuelA: 1, fuelB: 1, fuelC: 1 },
  'warm-up-regulator': { conn: 2, ring: 2 },
  'distributor': { cap: 1, pin: 1, connector: 7 },
  'ignition-leads': { coil: 1, plug: 1, line: 1, right: 1 },
  'flywheel': { ring: 1 },
  // small-part prototypes
  'case-connection-left': { ring: 1 },
  'oil-return-tubes': { seal: 2 },
  'relief-pistons': { spring: 1 },
  'relief-plugs': { ring: 1 },
  'case-oil-fittings': { ring: 1, cut: 1, union: 1 },
  'oil-temp-sensor': { ring: 1 },
  'oil-pressure-sender': { ring: 2, socket: 1 },
  'oil-pressure-fitting': { ring: 2, socket: 1 },
  'chain-lid-plug': { ring: 1 },
  'cam-oil-banjo': { piece: 1, ring: 4 },
  'cam-temp-switch': { ring: 1 },
  'airbox-straps': { support: 1, screw: 1 },
  'airbox-fittings': { washer: 1, washer2: 2, spring: 1, gasket: 1, stopper: 1, plug: 1, ring: 1, union: 1, hose: 1, clamp: 2 },
  'vacuum-limiter': { sleeve: 1, bolt: 1, spring: 1 },
  'vacuum-fittings': { clamp: 5, socket: 1 },
  'injection-line-bracket': { clamp: 1, nut: 1, spring: 1 },
  'afm-screws': { spring: 1, washer: 1 },
  'throttle-housing': { spring: 1, oring: 1 },
  'cold-start-valve': { oring: 1, piece: 1, gasket: 1, screw: 2, spring: 2 },
  'aux-air-valve': { spring: 2, screw: 2 },
  'additional-air-valve': { support: 1, spring2: 2 },
  'aux-air-plumbing': { clamp: 7, pipe: 1, conn: 1 },
  'wur-lines': { socket: 1, ring2: 1, tube: 1, conn: 1, ring3: 1, banjo: 3, ring: 6 },
  'throttle-linkage': { bracket: 1, sleeve: 2, lever: 2, washer: 1, spring: 4, nut: 4, rod: 1, spring2: 1 },
  'muffler-hardware': { gasket: 1, gasket2: 1, screw: 3, nut: 3, clamp: 2 },
  'pre-muffler': { gasket: 2, gasket1: 1, bolt: 6, nut: 6, pipe: 1, socket: 1, clamp: 2, clampbolt: 2, clampnut: 2, washer: 1 },
  'heater-adapters': { clamp: 1, bolt: 1 },
  'heater-hose': { clamp: 2 },
  'muffler-bracket': { nut: 2, spring: 2, washer: 2, bolt: 2 },
};

/** Pools: the same `what` drawn from several sources (allocated in order). */
export const POOLS: Record<string, { by: string; what: string }[]> = {
  // studs screwed into the left case half (101-05 #2-#14 except the head studs #3)
  'case-left-studs': [
    { by: 'chain-housing-nuts-left', what: 'stud' }, { by: 'oil-cooler-nuts', what: 'stud' }, { by: 'distributor-nut', what: 'stud' },
    { by: 'breather-nuts', what: 'stud' }, { by: 'case-m10-nut', what: 'stud' }, { by: 'oil-pump-nuts', what: 'stud' },
    { by: 'sump-nuts', what: 'stud' }, { by: 'crankcase-left', what: 'bellstud' },
  ],
  // studs in the right half (101-10 #2-#16 except #11). Head studs are also claimed on 101-05 as the upper and lower lines.
  'case-right-studs': [
    { by: 'case-perimeter-nuts', what: 'stud' }, { by: 'chain-housing-nuts-right', what: 'stud' }, { by: 'thermostat-nuts', what: 'stud' },
    { by: 'case-right-nut', what: 'stud' }, { by: 'case-through-stud-nut', what: 'stud' }, { by: 'crankcase-right', what: 'bellstud' },
    { by: 'head-nuts-right', what: 'stud' },
  ],
  'exhaust-studs': [{ by: 'exhaust-nuts-*', what: 'stud' }, { by: 'exhaust-socket-nuts-*', what: 'stud' }],
  // 103-05 #21-#23: 40 x (washer, M8 nut, spring washer) = cam housing to heads 24 + chain housing 12 + chain-housing end studs 4
  'cam-chain-nuts': [{ by: 'cam-housing-nuts-*', what: '' }, { by: 'chain-housing-nuts-*', what: '' }, { by: 'chain-end-nuts-*', what: '' }],
};

const C = (line: string, by: string, what = 'item', n?: number, note?: string): Claim => ({ line, by, what, n, note });
const bankLines = (ill: string, b: 'left' | 'right'): Claim[] => [
  C(`${ill}#1`, `timing-chain-${b}`),
  ...(b === 'left'
    ? [C('103-10#2', 'chain-tensioner-left', 'rail', 3)]
    : [C('103-15#2#911 105 222 05', 'chain-tensioner-right', 'rail', 1), C('103-15#2#911 105 222 06', 'chain-tensioner-right', 'rail', 2)]),
  C(`${ill}#3`, `rail-bolts-${b}`), C(`${ill}#4`, `rail-bolts-${b}`, 'washer', undefined, 'sealing ring = the washer under each rail bolt'),
  C(`${ill}#5`, `chain-tensioner-${b}`, 'support'), C(`${ill}#6`, `chain-tensioner-${b}`, 'idler'), C(`${ill}#7`, `chain-tensioner-${b}`, 'bolt'),
  C(`${ill}#8`, `idler-sleeve-${b}`), C(`${ill}#9`, `idler-circlip-${b}`), C(`${ill}#10`, `chain-tensioner-${b}`, 'adjuster'),
  C(`${ill}#25`, `chain-tensioner-${b}`, 'bleeder'), C(`${ill}#27`, `chain-tensioner-${b}`, 'spring'), C(`${ill}#28`, `chain-tensioner-${b}`, 'nut'),
  C(`${ill}#29`, `cam-flange-cover-${b}`, 'gasket'), C(`${ill}#30`, `cam-flange-cover-${b}`, 'seal'), C(`${ill}#31`, `cam-flange-cover-${b}`),
  C(`${ill}#32`, `cam-flange-cover-screws-${b}`, 'spring'), C(`${ill}#33`, `cam-flange-cover-screws-${b}`),
  C(`${ill}#34`, `cam-thrust-washer-${b}`), C(`${ill}#35`, `cam-shim-${b}`), C(`${ill}#36`, `cam-flange-${b}`), C(`${ill}#37`, `cam-key-${b}`),
  C(`${ill}#38`, `cam-sprocket-${b}`), C(`${ill}#39`, `cam-pin-${b}`), C(`${ill}#40`, `cam-nut-${b}`, 'spring'), C(`${ill}#41`, `cam-nut-${b}`),
  C(`${ill}#42`, `camshaft-${b}`),
];

export const CLAIMS: Claim[] = [
  // ---- 101-05 crankcase, left half
  C('101-05#1', 'crankcase-left'),
  ...['2', '4', '5', '6', '7', '9', '10', '11', '12', '13', '14'].map((p) => C(`101-05#${p}`, 'pool:case-left-studs', 'stud')),
  C('101-05#3#911 101 172 00', 'head-nuts-*', 'upperStud', 12, 'upper head studs, two per cylinder'),
  C('101-05#3#930 101 170 00', 'head-nuts-*', 'lowerStud', 12, 'lower Dilavar head studs, two per cylinder'),
  C('101-05#15', 'case-dowels', 'item', 2), C('101-05#16', 'oil-return-tubes'), C('101-05#17', 'oil-return-tubes', 'seal'),
  C('101-05#18', 'case-connection-left'), C('101-05#19', 'case-connection-left', 'ring'),
  C('101-05#-#911 101 011 01', 'spray-jets', 'item', 3),
  C('101-05#20', 'case-perimeter-nuts', 'washer'), C('101-05#21', 'case-perimeter-nuts'),
  C('101-05#22', 'case-m10-nut', 'spring'), C('101-05#23', 'case-m10-nut'),
  C('101-05#24', 'case-through-orings', 'item', 12), C('101-05#25', 'case-through-nuts', 'washer'),
  C('101-05#26', 'case-through-nuts', 'item', 12), C('101-05#26', 'case-through-stud-nut', 'item', 1),
  C('101-05#27', 'relief-pistons', 'item', 1), C('101-05#28', 'relief-pistons', 'spring', 1), C('101-05#29', 'relief-plugs', 'ring', 1), C('101-05#30', 'relief-plugs', 'item', 1),
  C('101-05#31', 'case-oil-fittings', 'item', 1), C('101-05#32', 'case-oil-fittings', 'cut', 1), C('101-05#33', 'case-oil-fittings', 'union', 1),
  C('101-05#34', 'sump-nuts', 'spring'), C('101-05#35', 'sump-nuts'),
  C('101-05#36', 'sump-plate', 'lidgasket'), C('101-05#37', 'sump-plate'), C('101-05#38', 'sump-plate', 'strainer'), C('101-05#39', 'sump-plate', 'gasket'),
  C('101-05#41', 'sump-plate', 'plug'), C('101-05#42', 'sump-drain-ring'),
  // ---- 101-10 crankcase, right half
  C('101-10#1', 'crankcase-right'),
  ...['2', '3', '4', '5', '6', '7', '8', '9', '10', '12', '13', '14', '15', '16'].map((p) => C(`101-10#${p}`, 'pool:case-right-studs', 'stud')),
  C('101-10#11', 'case-right-bolt'), C('101-10#17', 'crank-seal-rear'), C('101-10#18', 'case-roll-pin'), C('101-10#19', 'case-dowels', 'item', 2),
  C('101-10#20', 'case-right-nut', 'washer'), C('101-10#21', 'case-right-nut'),
  C('101-10#22', 'case-oil-fittings', 'ring', 1), C('101-10#24', 'case-oil-fittings', 'ring', 1),
  C('101-10#25', 'case-through-bolts'), C('101-10#26', 'case-through-orings', 'item', 12),
  C('101-10#27', 'case-through-bolts', 'washer', 11), C('101-10#27', 'case-through-stud-nut', 'washer'),
  C('101-10#-#911 101 011 01', 'spray-jets', 'item', 3), C('101-10#28', 'oil-temp-sensor'),
  C('101-10#29', 'relief-pistons', 'item', 1), C('101-10#30', 'relief-pistons', 'spring', 1), C('101-10#31', 'relief-plugs', 'ring', 1), C('101-10#32', 'relief-plugs', 'item', 1),
  C('101-10#33', 'case-oil-fittings', 'cut', 1), C('101-10#34', 'case-oil-fittings', 'union', 1),
  C('101-10#35', 'breather-nuts', 'spring'), C('101-10#36', 'breather-nuts'),
  C('101-10#37', 'oil-thermostat'), C('101-10#38', 'thermostat-oring'), C('101-10#41', 'thermostat-nuts'), C('101-10#42', 'thermostat-nuts', 'washer'),
  C('101-10#43', 'oil-pressure-sender', 'ring', 1), C('101-10#44', 'oil-pressure-sender', 'socket'), C('101-10#45', 'oil-pressure-sender'), C('101-10#46', 'oil-pressure-sender', 'ring', 1),
  C('101-10#47', 'oil-pressure-switch'), C('101-10#48', 'oil-pressure-fitting'), C('101-10#49', 'oil-pressure-fitting', 'ring'), C('101-10#50', 'oil-pressure-fitting', 'socket'),
  // ---- 102-00 crankshaft, rods, bearings
  C('102-00#1', 'crankshaft'), C('102-00#2', 'flywheel'), C('102-00#3', 'crank-pilot-bush'), C('102-00#6', 'flywheel-bolts'),
  C('102-00#7', 'crank-key'), C('102-00#8', 'crank-gears', 'gear'), C('102-00#9', 'crank-gear-ring'), C('102-00#10', 'crank-gears', 'drive'), C('102-00#11', 'crank-circlip'),
  C('102-00#12', 'crank-pulley'), C('102-00#14', 'pulley-bolt', 'washer'), C('102-00#15', 'pulley-bolt'),
  C('102-00#16', 'conrod-*'), C('102-00#17', 'conrod-*', 'bush'), C('102-00#18', 'conrod-*', 'bolt'), C('102-00#19', 'conrod-*', 'nut'), C('102-00#20', 'conrod-*', 'shell'),
  C('102-00#22#930 101 131 51', 'main-bearings', 'shellI', 2, 'bearing I as two half shells (the 2-off shell variant)'),
  C('102-00#23', 'main-bearings', 'shell'), C('102-00#24', 'main-bearings', 'sleeve'),
  C('102-00#25', 'pulley-pin'), C('102-00#26', 'flywheel-oring'), C('102-00#27', 'flywheel-seal'),
  // ---- 102-05 cylinders / pistons
  C('102-05#1', '^cylinder-\\d$'), C('102-05#2', 'piston-*', 'rings'), C('102-05#3', 'piston-*', 'pin'), C('102-05#4', 'piston-*', 'clip'),
  C('102-05#5', 'cyl-base-gaskets'), C('102-05#6', 'head-seals'),
  // ---- 103-00 heads / valves
  C('103-00#1', '^head-\\d$'), C('103-00#5', 'pool:exhaust-studs', 'stud'), C('103-00#6', 'intake-nuts-*', 'stud'), C('103-00#7', 'cam-housing-nuts-*', 'stud'),
  C('103-00#8', 'head-dowels'), C('103-00#9', 'valves-*', 'intake'), C('103-00#10', 'valves-*', 'exhaust'), C('103-00#11', 'valves-*', 'shim', 12, 'qty "as required": one shim under each spring pair'),
  C('103-00#12', 'valves-*', 'seat'), C('103-00#13', 'valves-*', 'springs'), C('103-00#14', 'valves-*', 'retainer'), C('103-00#15', 'valves-*', 'collet'),
  C('103-00#16', 'head-nuts-*', 'washer'), C('103-00#17', 'head-nuts-*'), C('103-00#18', 'valves-*', 'seal'),
  C('103-00#-#000 043 204 48', 'valves-*', 'guide', 12, 'valve guide sleeves, qty "as required"'),
  // ---- 103-05 chain housings / cam housings / covers
  C('103-05#1', 'chain-housing-left'), C('103-05#2', 'chain-housing-right'),
  C('103-05#3', 'chain-cover-nuts-*', 'stud'), C('103-05#-#999 062 046 02', 'chain-lid-nuts-*', 'stud', 2), C('103-05#4', 'chain-lid-nuts-*', 'stud', 1),
  C('103-05#5', 'chain-housing-gasket-*'), C('103-05#6', 'chain-housing-lid-left'), C('103-05#7#930 105 064 10', 'chain-housing-lid-right'),
  C('103-05#-#999 062 010 02', 'chain-end-nuts-*', 'stud', 1, 'one of the four chain-housing end studs'),
  C('103-05#-#900 123 007 30', 'chain-lid-plug-left', 'ring'), C('103-05#-#N 016 155 3', 'chain-lid-plug-left'), C('103-05#-#N 016 155 4', 'chain-lid-plug2-left'),
  C('103-05#-#900 123 007 30#2', 'chain-lid-plug-right', 'ring'), C('103-05#-#N 016 155 3#2', 'chain-lid-plug-right'), C('103-05#-#N 016 155 4#2', 'chain-lid-plug2-right'),
  C('103-05#8', 'chain-lid-gasket-left'), C('103-05#9', 'chain-lid-gasket-right'), C('103-05#10', 'chain-case-plug-*'),
  C('103-05#11', 'chain-cover-nuts-*', 'washer'), C('103-05#12', 'chain-cover-nuts-*'),
  C('103-05#-#N 012 241 8', 'chain-lid-nuts-*', 'spring'), C('103-05#-#900 076 025 02', 'chain-lid-nuts-*'),
  C('103-05#13', '^cam-housing-(left|right)$'), C('103-05#14', 'valve-cover-nuts-*', 'stud', 12), C('103-05#15', 'valve-cover-nuts-*', 'stud', 22),
  C('103-05#-#930 105 362 00', 'cam-splash-tube-*'), C('103-05#-#901 105 379 00', 'cam-housing-stoppers-*'),
  C('103-05#16', 'cam-end-cover-*'), C('103-05#17', 'valve-cover-upper-*'), C('103-05#18', 'valve-cover-gasket-upper-*'),
  C('103-05#19', 'valve-cover-lower-*'), C('103-05#20', 'valve-cover-gasket-lower-*'),
  C('103-05#21', 'pool:cam-chain-nuts', 'washer'), C('103-05#22', 'pool:cam-chain-nuts', 'item'), C('103-05#23', 'pool:cam-chain-nuts', 'spring'),
  C('103-05#24', 'valve-cover-special-*'), C('103-05#25', 'valve-cover-nuts-*'), C('103-05#26', 'cam-housing-plug-*'),
  C('103-05#27', 'cam-oil-banjo-*', 'piece'), C('103-05#28', 'cam-oil-banjo-*', 'ring'), C('103-05#29', 'cam-oil-banjo-*'),
  C('103-05#30', 'cam-temp-switch'), C('103-05#31', 'cam-temp-switch', 'ring'),
  // ---- 103-10 (left bank) / 103-15 (right bank) chain drive + cam nose
  ...bankLines('103-10', 'left'), ...bankLines('103-15', 'right'),
  C('103-10#44', 'rockers-*', 'shaft'), C('103-10#45', 'rocker-shaft-screws-*'), C('103-10#46', 'rockers-*', 'bush'), C('103-10#47', 'rocker-shaft-nuts-*'),
  C('103-10#48', 'rockers-*', 'arm'), C('103-10#49', 'rockers-*', 'screw'), C('103-10#50', 'rockers-*', 'locknut'),
  C('103-15#43', 'intermediate-shaft'), C('103-15#44', 'ishaft-circlips', 'item', 2), C('103-15#45', 'ishaft-circlips', 'item', 1), C('103-15#46', 'ishaft-thrust'),
  C('103-15#47', 'ishaft-bearings'), C('103-15#48', 'ishaft-stopper'), C('103-15#49', 'ishaft-circlips', 'item', 1),
  // ---- 104-00 oil pump / cooler
  C('104-00#1', 'oil-pump'), C('104-00#2', 'oil-pump-seals', 'item', 1), C('104-00#2', 'oil-cooler-seal-riser'), C('104-00#3', 'oil-pump-seals', 'item', 2), C('104-00#3', 'oil-cooler-seals'), C('104-00#4', 'oil-pump-nuts', 'tab'),
  C('104-00#5', 'oil-pump-nuts', 'item', 3), C('104-00#5', 'oil-cooler-nuts', 'item', 4), C('104-00#6', 'oil-pump', 'shaft'), C('104-00#8', 'oil-cooler'), C('104-00#9', 'oil-cooler-nuts', 'spring'),
  // ---- 105-00 fan / 902-05 alternator
  C('105-00#1', 'fan-housing'), C('105-00#2', 'fan-housing', 'strap'), C('105-00#4', 'fan-nuts', 'spring'), C('105-00#5', 'fan-nuts'), C('105-00#6', 'fan-impeller'),
  C('105-00#7', 'fan-pulley', 'shim', 1, 'belt-adjusting shim stack, qty "as required"'), C('105-00#8', 'fan-pulley'), C('105-00#9', 'fan-pulley-nut', 'washer'),
  C('105-00#10', 'fan-hub'), C('105-00#11', 'fan-pulley-nut'), C('105-00#12', 'fan-belt'),
  C('902-05#1', 'alternator'), C('902-05#-#911 612 233 00', 'alternator-strap'),
  // ---- 105-05 air guides
  C('105-05#1', 'upper-air-guide'), C('105-05#2', 'shroud-speed-nuts'), C('105-05#3', 'oil-cooler-cap'), C('105-05#4', 'upper-air-guide', 'socket'), C('105-05#6', 'shroud-cover-plate'), C('105-05#9', 'shroud-stopper'),
  C('105-05#10', 'shroud-screws'), C('105-05#10#999 143 004 08', 'shroud-end-screws'), C('105-05#10#900 075 057 02', 'shroud-collar-bolts-a'), C('105-05#10#900 075 014 02', 'shroud-collar-bolts-b'),
  C('105-05#11', 'shroud-end-screws', 'washer'), C('105-05#12', 'shroud-socket-screws'),
  C('105-05#13', 'fan-housing', 'clamp'), C('105-05#16', 'fan-housing', 'washer'), C('105-05#17', 'fan-housing', 'nut'),
  // ---- 106-00 intake / air cleaner
  ...[1, 2, 3, 4, 5, 6].map((c) => C(`106-00#${c}`, `intake-runner-${c}`)),
  C('106-00#7', 'intake-gaskets'), C('106-00#8', 'intake-nuts-*'), C('106-00#9', 'plenum'), C('106-00#10', 'intake-boots'), C('106-00#11', 'intake-boot-clamps'),
  C('106-00#12', 'intake-nuts-*', 'washer'), C('106-00#13', 'air-filter'), C('106-00#14', 'air-cleaner-lid'), C('106-00#15', 'airbox-straps'),
  C('106-00#16', 'airbox-straps', 'support'), C('106-00#17', 'airbox-straps', 'screw'), C('106-00#18', 'airbox-struts', 'strutA'), C('106-00#19', 'airbox-struts', 'strutB'),
  C('106-00#20', 'airbox-struts', 'buffer', 2), C('106-00#21', 'airbox-fittings', 'washer'), C('106-00#22', 'airbox-fittings', 'washer2'),
  C('106-00#23', 'airbox-strut-nuts', 'spring', 4), C('106-00#23', 'airbox-fittings', 'spring', 1), C('106-00#24', 'airbox-strut-nuts'),
  C('106-00#26', 'airbox-fittings', 'gasket'), C('106-00#28', 'airbox-fittings', 'stopper'), C('106-00#29', 'injector-orings-a'), C('106-00#30', 'injector-orings-b'),
  C('106-00#31', 'airbox-fittings', 'plug'), C('106-00#32', 'airbox-fittings', 'ring'), C('106-00#33', 'airbox-fittings', 'union'), C('106-00#34', 'airbox-fittings', 'hose'),
  C('106-00#36', 'airbox-fittings', 'clamp'),
  // ---- 107-00 / 107-10 CIS
  C('107-00#1', 'mixture-control-unit', 'distributor'), C('107-00#2', 'mixture-control-unit', 'meter'),
  C('107-10#7', 'vacuum-limiter'), C('107-10#8', 'vacuum-limiter', 'sleeve'), C('107-10#9', 'vacuum-limiter', 'bolt'), C('107-10#10', 'vacuum-limiter', 'spring'),
  C('107-10#12', 'vacuum-fittings', 'clamp', 4), C('107-10#14', 'vacuum-fittings'), C('107-10#15', 'vacuum-fittings', 'clamp', 1), C('107-10#17', 'vacuum-fittings', 'socket'),
  C('107-10#1#900 067 089 02', 'afm-screws'), C('107-10#2', 'afm-screws', 'spring'), C('107-10#3', 'afm-screws', 'washer'),
  C('107-10#4#930 110 248 02', 'throttle-housing'), C('107-10#5', 'throttle-housing', 'spring'), C('107-10#6', 'throttle-housing', 'oring'),
  C('107-10#18', 'air-guide'),
  C('107-10#19', 'airbox-clamps', 'item', 1), C('107-10#20', 'airbox-clamps', 'item', 1),
  C('107-10#21', '^injector-\\d$'), C('107-10#22', 'injector-orings-c'), C('107-10#23', 'fuel-lines', 'line', 3), C('107-10#23#911 110 093 12', 'fuel-lines', 'line', 3),
  C('107-10#24', 'injection-line-rings'), C('107-10#25', 'injection-banjos'), C('107-10#26', 'injection-line-bracket'), C('107-10#27', 'injection-line-bracket', 'clamp'),
  C('107-10#28', 'injection-line-bracket', 'nut'), C('107-10#29', 'injection-line-bracket', 'spring'),
  C('107-10#30', 'cold-start-valve'), C('107-10#31', 'cold-start-valve', 'oring'), C('107-10#32', 'cold-start-valve', 'piece'), C('107-10#33', 'cold-start-valve', 'gasket'),
  C('107-10#34', 'cold-start-valve', 'screw'), C('107-10#35', 'cold-start-valve', 'spring'),
  C('107-10#36', 'aux-air-valve'), C('107-10#37', 'aux-air-valve', 'spring'), C('107-10#38', 'aux-air-valve', 'screw'),
  C('107-10#39', 'additional-air-valve'), C('107-10#40', 'additional-air-valve', 'support'), C('107-10#41', 'additional-air-valve', 'spring2'),
  C('107-10#43', 'aux-air-plumbing'), C('107-10#44', 'aux-air-plumbing', 'clamp', 4), C('107-10#45', 'aux-air-plumbing', 'clamp', 2), C('107-10#46', 'aux-air-plumbing', 'pipe'),
  C('107-10#47', 'aux-air-plumbing', 'conn'), C('107-10#48', 'aux-air-plumbing', 'clamp', 1),
  C('107-10#49', 'wur-lines', 'socket'), C('107-10#50', 'wur-lines', 'ring2'), C('107-10#51', 'wur-lines', 'tube'), C('107-10#52', 'wur-lines', 'conn'), C('107-10#53', 'wur-lines', 'ring3'),
  C('107-10#54', 'warm-up-regulator'), C('107-10#55', 'wur-screws'), C('107-10#56', 'wur-screws', 'spring'), C('107-10#57', 'warm-up-regulator', 'conn'), C('107-10#58', 'warm-up-regulator', 'ring'),
  C('107-10#59', 'wur-lines', 'banjo'), C('107-10#60', 'wur-lines', 'ring'), C('107-10#61', 'fuel-lines', 'fuelA'), C('107-10#62', 'fuel-lines', 'fuelB'), C('107-10#63', 'fuel-lines', 'fuelC'),
  C('107-10#64', 'throttle-linkage', 'bracket'), C('107-10#65', 'throttle-linkage', 'sleeve'), C('107-10#66', 'throttle-linkage', 'lever', 1), C('107-10#67', 'throttle-linkage', 'washer'),
  C('107-10#68', 'throttle-linkage', 'lever', 1), C('107-10#69', 'throttle-linkage', 'spring'), C('107-10#70', 'throttle-linkage', 'nut'), C('107-10#72', 'throttle-linkage', 'rod'),
  C('107-10#73', 'throttle-linkage', 'spring2'),
  // ---- 202-00 exhaust / heating
  C('202-00#1', 'muffler'), C('202-00#2', 'muffler-hardware', 'gasket'), C('202-00#3', 'muffler-hardware', 'screw'), C('202-00#4', 'muffler-hardware', 'nut'), C('202-00#5', 'muffler-hardware', 'clamp'),
  C('202-00#6', 'pre-muffler'), C('202-00#13', 'pre-muffler', 'gasket'), C('202-00#14', 'pre-muffler', 'gasket1'), C('202-00#15', 'pre-muffler', 'bolt'), C('202-00#16', 'pre-muffler', 'nut'),
  C('202-00#17', 'pre-muffler', 'pipe'), C('202-00#18', 'pre-muffler', 'socket'), C('202-00#19', 'pre-muffler', 'clamp'), C('202-00#20', 'pre-muffler', 'clampbolt'), C('202-00#21', 'pre-muffler', 'clampnut'),
  C('202-00#22', 'pre-muffler', 'washer'), C('202-00#23', 'muffler-hardware', 'gasket2'),
  C('202-00#26', 'heat-exchanger-*'), C('202-00#27', 'heater-adapters'), C('202-00#28', 'heater-adapters', 'clamp'), C('202-00#-#999 075 057 02', 'heater-adapters', 'bolt', 2, 'qty "as required": one clamp bolt per adapter'),
  C('202-00#29', 'heater-hose'), C('202-00#30', 'heater-hose', 'clamp'), C('202-00#31', 'exhaust-gaskets'), C('202-00#32', 'exhaust-nuts-*'), C('202-00#33', 'exhaust-socket-nuts-*'),
  C('202-00#34', 'muffler-bracket'), C('202-00#35', 'muffler-bracket', 'nut'), C('202-00#36', 'muffler-bracket', 'spring'), C('202-00#37', 'muffler-bracket', 'washer'), C('202-00#38', 'muffler-bracket', 'bolt'),
  // ---- 301-00 clutch / flywheel
  C('301-00#1', 'pressure-plate'), C('301-00#2', 'clutch-disc'), C('301-00#3', 'clutch-bolts', 'spring'), C('301-00#4', 'clutch-bolts'), C('301-00#5', 'flywheel', 'ring'),
  // ---- 901-00 ignition
  C('901-00#4', 'distributor-oring'), C('901-00#5', 'distributor-nut', 'washer'), C('901-00#6', 'distributor-nut', 'spring'), C('901-00#7', 'distributor-nut'),
  C('901-00#8', 'distributor', 'cap'), C('901-00#9', 'ignition-leads', 'line'), C('901-00#16', '^spark-plug-\\d$'), C('901-00#17', 'ignition-leads'),
  C('901-00#17A', 'ignition-leads', 'right'),
  C('901-00#18', 'ignition-leads', 'coil'), C('901-00#19', 'ignition-leads', 'plug'), C('901-00#21', '^spark-plug-connector-\\d$'), C('901-00#22', 'ignition-lead-holders'),
  C('901-00#23', 'distributor', 'connector'), C('901-00#35', 'distributor', 'pin'),
];

const range = (ill: string, pos: (string | number)[], why: string): NotApplicable[] => pos.map((p) => ({ line: `${ill}#${p}`, why }));
const BODY = 'body-mounted, not part of the engine assembly';
export const NOT_APPLICABLE: NotApplicable[] = [
  ...['999 707 113 40', '999 707 113 41', '999 707 112 40', '900 041 013 01'].map((pn) => ({ line: `101-05#-#${pn}`, why: 'component of the later oil-tube set 930 107 040 01 (alternative to the four #16 tubes with #17 seals, which are modelled)' })),
  { line: '102-00#21', why: 'set header: its contents are the #22-#24 lines' },
  { line: '103-05#-#900 076 064 02', why: 'alternative part number of the 3 lid nuts on the line above (900 076 025 02)' },
  ...['103-10', '103-15'].flatMap((ill) => range(ill, [11, 17, 19, 22, 23], 'internal part of the sealed chain adjuster (#10), which is modelled as one unit')),
  { line: '103-10#-#930 105 911 00', why: 'alternative (pressure-fed) chain adjuster for the same station' },
  { line: '103-15#-#930 105 912 00', why: 'alternative (pressure-fed) chain adjuster for the same station' },
  { line: '103-15#-#930 105 912 01', why: 'alternative (pressure-fed) chain adjuster for the same station' },
  { line: '104-00#7', why: 'oil filter: ' + BODY + ' (on the oil tank / filter console in the right rear wing)' },
  ...range('104-00', [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 39, 40, 46, 47, 48, 49], 'oil tank, filler, dipstick, external oil lines and their hardware: ' + BODY),
  ...['999 512 198 02', 'PCG 512 198 02', '944 107 091 01', '930 107 601 02', '900 104 013 02', '944 107 091 01#2', '930 107 601 02#2', '900 104 013 02#2'].map((pn) => ({ line: `104-00#-#${pn}`, why: 'oil tank filler / hose hardware: ' + BODY })),
  ...range('104-05', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27], 'front oil cooler, its thermostat and lines: ' + BODY + ' (front right wing)'),
  ...range('106-00', ['-#999 239 018 40', '-#999 181 022 51'], 'bulk hose sold by the metre (qty *), cut to length on assembly'),
  ...range('107-00', [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14], 'internal part of the mixture control unit (fuel distributor + air-flow meter), modelled as one unit'),
  { line: '107-00#15', why: 'parts kit (no separate item)' },
  { line: '107-10#-#930 110 292 00', why: 'stopper with no illustration in Kat 502 fig 107-10; not placed on the 930/04 flap housing' },
  { line: '107-10#-#930 110 292 00#2', why: 'stopper with no illustration in Kat 502 fig 107-10; not placed on the 930/04 flap housing' },
  ...['N 020 359 1', 'N 020 353 5', '999 181 709 50'].map((pn) => ({ line: `107-10#-#${pn}`, why: 'bulk hose sold by the metre (qty *), cut to length on assembly' })),
  { line: '301-00#-#915 116 911 00', why: 'repair kit (no separate item)' },
  { line: '901-00#10', why: 'dust cover under the distributor cap (internal, hidden by the cap)' },
  ...range('901-00', [11, 12, 13, 14, 15, 20], 'ignition coil and its mounting / tower cap: ' + BODY + ' (left rear wing)'),
  ...range('901-00', [24, 25, 26], 'capacitive-discharge switch unit and its screws: ' + BODY),
  ...range('901-00', [27, 29, 31, 32, 33, 34], 'steering lock / ignition switch: ' + BODY + ' (steering column)'),
  { line: '901-00#-#999 190 123 02', why: 'blind rivets for the steering-lock rosette: ' + BODY },
  ...range('902-05', [2, 4, 5], 'alternator mounting support inside the fan housing, modelled as part of the alternator / fan-housing castings'),
  { line: '902-05#-#928 603 910 00', why: 'diode plate: internal to the alternator' },
  { line: '902-05#6', why: 'same nut as 105-00 #11 (fan pulley nut on the alternator shaft), counted there' },
  ...range('902-05', [7, 8, 9, 10], 'starter motor and its cap / nut / lock ring: mounted on the transmission bellhousing, not the engine'),
];

/** Lines still not modelled (reported by the doc generator; the test requires this list to match reality). */
export const STILL_MISSING: NotApplicable[] = [];

/** Groups covered by this checklist (108-00 air injection is not on this US 49-state/ROW reference engine set; see docs). */
export const CHECKLIST_GROUPS = ['101-05', '101-10', '102-00', '102-05', '103-00', '103-05', '103-10', '103-15', '104-00', '104-05', '105-00', '105-05', '106-00', '107-00', '107-10', '202-00', '301-00', '901-00', '902-05'];
