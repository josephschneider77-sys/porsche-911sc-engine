/**
 * Fastener sets modelled as their own removable hardware parts (instanced GLBs). Counts are the 1978-83 911 SC
 * quantities from the Porsche parts catalogue (Kat 002, ill.json in the v3 reference pack) unless noted; placement
 * follows the Pelican/Dempsey rebuild photos (photo-ref/book) and is estimated (E) where no photo shows it.
 * The geometry (positions, axes, seat/thread parts) lives in src/geo/fasteners.ts; tests/fasteners.test.ts checks
 * that every set there has exactly `count` items, each seated flat on its seat part with the head on the open side.
 */
import type { CatalogRef } from './parts';

export interface FastenerSpec {
  id: string; name: string; count: number;
  /** Teardown step id in which the set comes off (see teardown.ts). */
  step: string;
  /** Carried off with this part (and removed in `step` later), e.g. cam-housing nuts lifted with the cam housing. */
  carriedBy?: string;
  /** Part whose explode vector the set follows (slightly further out). */
  follows: string;
  size: string; catalog: CatalogRef[]; description: string;
}

const b2 = (fn: (s: 'right' | 'left', n: 1 | -1) => FastenerSpec) => [fn('right', 1), fn('left', -1)];

export const FASTENER_SPECS: FastenerSpec[] = [
  ...b2((b) => ({
    id: `head-nuts-${b}`, name: `Cylinder-head barrel nuts, ${b} bank`, count: 12, step: 'cam-housings', follows: `cam-housing-${b}`, size: 'M10 barrel nut + washer',
    catalog: [{ ill: '103-00', pos: '17', pn: '901 104 382 02', qty: 24, note: 'Barrel nut (12 per bank); washer #16 999 031 091 01 x24' },
      { ill: '101-05', pos: '3', pn: '930 101 170 00', qty: 12, note: 'Lower head studs (Dilavar) in the case; upper studs 911 101 172 00' }],
    description: 'Four tall barrel nuts per head on the case head studs (4 studs per cylinder), seated on bosses on top of the head core under the cam housing. Reached with a long hex socket through the cam housing; they come off just before the cam housing + heads lift away.',
  })),
  ...b2((b) => ({
    id: `cam-housing-nuts-${b}`, name: `Cam-housing to head nuts, ${b} bank`, count: 12, step: 'heads', carriedBy: `cam-housing-${b}`, follows: `cam-housing-${b}`, size: 'M8 hex nut + washer',
    catalog: [{ ill: '103-05', pos: '22', pn: '900 084 004 03', qty: 40, note: 'M8 hex nut (24 cam housing to heads + 16 chain housing); washer #21, spring washer #23' },
      { ill: '103-00', pos: '7', pn: '999 062 041 02', qty: 24, note: 'Stud BM8x50 in the head' }],
    description: 'Four M8 nuts per head on studs from the head through the cam-housing base plate. The cam housing lifts off with the heads still attached; these come off on the bench to separate them.',
  })),
  ...(['upper', 'lower'] as const).flatMap((u) => b2((b) => ({
    id: `valve-cover-nuts-${u}-${b}`, name: `Valve-cover nuts, ${u} ${b}`, count: u === 'upper' ? 8 : 12, step: 'valve-covers', follows: `valve-cover-${u}-${b}`, size: 'M8 hex nut + spring washer',
    catalog: [{ ill: '103-05', pos: '25', pn: '900 076 025 02', qty: 34, note: 'M8 nut; plus 6 special nuts #24 901 111 271 00 (40 total, 10 per cover: 8 upper / 12 lower per bank modelled)' },
      { ill: '103-05', pos: '14/15', pn: '999 062 009 02 / 999 062 010 02', qty: 34, note: 'Studs BM8x28 x12 / BM8x35 x22 in the cam housing' }],
    description: `Nuts on the ${u} valve cover ear studs (studs in the cam-housing rails), axis normal to the cover seat flange.`,
  }))),
  ...b2((b, s) => ({
    id: `chain-cover-nuts-${b}`, name: `Chain-housing cover nuts, ${b}`, count: s > 0 ? 10 : 9, step: 'chain-covers', follows: `chain-housing-lid-${b}`, size: 'M6 lock nut + washer',
    catalog: [{ ill: '103-05', pos: '12', pn: '900 910 012 02', qty: 19, note: 'M6 lock nut (19 per engine; split 10 right / 9 left, E); washer #11 x19' },
      { ill: '103-05', pos: '3', pn: '999 062 102 02', qty: 19, note: 'Stud BM6x22 in the chain housing' }],
    description: 'Perimeter lock nuts holding the chain-housing cover on the housing studs. The catalogue lists 19 cover studs for the engine; the rebuild photos of a later 3.2 cover show about 13 per side, so the per-side split here is estimated.',
  })),
  ...b2((b) => ({
    id: `chain-housing-nuts-${b}`, name: `Chain-housing to crankcase nuts, ${b}`, count: 5, step: 'chain-housings', follows: `chain-housing-${b}`, size: 'M8 hex nut + washer',
    catalog: [{ ill: '103-05', pos: '22', pn: '900 084 004 03', qty: 40, note: 'Same M8 nut as the cam-housing studs (16 for the chain housings in total; 5 per side modelled on the case flange, the cam-housing end studs are not modelled)' }],
    description: 'Nuts inside the chain box on the inner-edge flange, on studs from the crankcase chain well. Only reachable once the cover, chain and sprocket are off.',
  })),
  ...b2((b) => ({
    id: `intake-nuts-${b}`, name: `Intake-pipe flange nuts, ${b}`, count: 6, step: 'intake', follows: b === 'right' ? 'intake-runner-1' : 'intake-runner-4', size: 'M8 lock nut + washer',
    catalog: [{ ill: '106-00', pos: '8', pn: '999 084 601 02', qty: 12, note: 'M8 lock nut; washer #12 900 025 007 02 x12' },
      { ill: '103-00', pos: '6', pn: '999 062 009 02', qty: 12, note: 'Intake stud in the head' }],
    description: 'Two nuts per intake pipe on studs in the head intake flange.',
  })),
  ...b2((b) => ({
    id: `exhaust-nuts-${b}`, name: `Heat-exchanger port nuts, ${b}`, count: 6, step: 'heat-exchangers', follows: `heat-exchanger-${b}`, size: 'M8 brass nut',
    catalog: [{ ill: '202-00', pos: '32/33', pn: '900 076 025 02 / 999 085 001 02', qty: 12, note: '6 hex + 6 socket-head nuts per engine as listed; modelled as 2 hex nuts per port' },
      { ill: '103-00', pos: '5', pn: '999 062 220 02', qty: 12, note: 'Exhaust stud in the head' }],
    description: 'Two nuts per exhaust port clamping the heat-exchanger flange to the head studs from below; notorious for seizing.',
  })),
  { id: 'case-through-bolts', name: 'Crankcase through-bolts', count: 11, step: 'split', follows: 'crankcase-left', size: 'M10x1 through-bolt + washer',
    catalog: [{ ill: '101-10', pos: '25', pn: '930 101 173 02', qty: 11, note: 'Screw; plus 1 stud #16 930 101 175 00 with a cap nut each end; washers #27 x12' }],
    description: 'Long through-bolts across the main bearing webs, heads on the right half (x+) with sealing washers, threaded into cap nuts on the left half.' },
  { id: 'case-through-nuts', name: 'Crankcase through-bolt cap nuts', count: 13, step: 'split', follows: 'crankcase-left', size: 'M10x1 cap nut + washer',
    catalog: [{ ill: '101-05', pos: '26', pn: '930 101 172 01', qty: 13, note: 'Cap nut M10x1; washers #25 x12' }],
    description: '12 cap nuts on the left half plus the second cap nut of the through-stud on the right half.' },
  { id: 'case-perimeter-nuts', name: 'Crankcase perimeter nuts', count: 24, step: 'split', follows: 'crankcase-left', size: 'M8 lock nut + washer',
    catalog: [{ ill: '101-05', pos: '21', pn: '900 910 022 02', qty: 24, note: 'M8 lock nut; washer #20 x24' },
      { ill: '101-10', pos: '5', pn: '999 062 115 02', qty: 13, note: 'Stud M8x32 (plus longer studs) in the right half' }],
    description: 'Lock nuts around the split flange (16 along the top, 8 along the bottom clear of the sump), on studs from the right half, nuts on the left half lugs.' },
  { id: 'flywheel-bolts', name: 'Flywheel bolts', count: 9, step: 'flywheel', follows: 'flywheel', size: 'M10 flywheel bolt',
    catalog: [{ ill: '102-00', pos: '6', pn: '930 102 206 00', qty: 9 }], description: 'Nine bolts through the flywheel hub into the crankshaft flange.' },
  { id: 'clutch-bolts', name: 'Pressure-plate bolts', count: 9, step: 'clutch', follows: 'pressure-plate', size: 'M8 pan-head screw + lock ring',
    catalog: [{ ill: '301-00', pos: '4', pn: '900 067 090 02', qty: 9, note: 'Lock rings #3 900 027 015 02 x9' }], description: 'Nine screws through the pressure-plate cover flange into the flywheel; back off evenly.' },
  { id: 'pulley-bolt', name: 'Crankshaft pulley bolt', count: 1, step: 'pulley', follows: 'crank-pulley', size: 'M12x1.5x22 + washer',
    catalog: [{ ill: '102-00', pos: '15', pn: '999 093 005 02', qty: 1, note: 'Washer #14 900 028 014 02' }], description: 'Central bolt clamping the pulley to the crank nose.' },
  { id: 'fan-pulley-nut', name: 'Fan pulley nut', count: 1, step: 'belt', follows: 'fan-pulley', size: 'M16x1 nut',
    catalog: [{ ill: '105-00', pos: '11', pn: '901 603 905 01', qty: 1 }], description: 'Nut on the alternator shaft clamping the pulley halves and tension shims.' },
  { id: 'oil-pump-nuts', name: 'Oil pump cover nuts', count: 4, step: 'int-shaft', follows: 'oil-pump', size: 'M8 nut + tab washer',
    catalog: [{ ill: '104-00', pos: '5', pn: '900 076 025 02', qty: 7, note: 'Hex nut M8 (7 listed; 4 on the pump cover modelled), tab washers #4' }], description: 'Nuts holding the pump cover plate and body together on their studs.' },
  { id: 'sump-nuts', name: 'Sump plate nuts', count: 12, step: 'externals', follows: 'sump-plate', size: 'M6 nut + spring washer',
    catalog: [{ ill: '101-05', pos: '35', pn: '900 076 010 02', qty: 12, note: 'Spring washers #34 x12' }], description: 'Twelve nuts round the sump (strainer) cover on studs from both case halves.' },
  { id: 'thermostat-nuts', name: 'Oil thermostat nuts', count: 3, step: 'externals', follows: 'oil-thermostat', size: 'M6 lock nut + washer',
    catalog: [{ ill: '101-10', pos: '41', pn: '900 910 012 02', qty: 3, note: 'Washers #42 x3' }], description: 'Three nuts holding the thermostat housing to its pad under the right half.' },
  { id: 'breather-nuts', name: 'Breather cover nuts', count: 2, step: 'externals', follows: 'breather-lid', size: 'M6 nut + spring washer',
    catalog: [{ ill: '101-10', pos: '36', pn: '900 076 010 02', qty: 2, note: 'Spring washers #35 x2 (assignment to the breather cover estimated)' }], description: 'Two nuts on the breather cover studs.' },
  ...b2((b) => ({
    id: `rocker-shaft-screws-${b}`, name: `Rocker-shaft screws, ${b}`, count: 6, step: 'rockers', follows: `rockers-${b}`, size: 'Pan-head screw',
    catalog: [{ ill: b === 'left' ? '103-10' : '103-15', pos: '45', pn: '999 067 008 00', qty: 12, note: 'Expanding-shaft screw' }], description: 'Screw through each expanding rocker shaft; slackening it releases the shaft.',
  })),
  ...b2((b) => ({
    id: `rocker-shaft-nuts-${b}`, name: `Rocker-shaft nuts, ${b}`, count: 6, step: 'rockers', follows: `rockers-${b}`, size: 'Nut',
    catalog: [{ ill: b === 'left' ? '103-10' : '103-15', pos: '47', pn: '901 105 376 02', qty: 12 }], description: 'Nut on the other end of each rocker-shaft screw, on the opposite tower face.',
  })),
];
export const FASTENER_SPEC_BY_ID: Record<string, FastenerSpec> = Object.fromEntries(FASTENER_SPECS.map((f) => [f.id, f]));
