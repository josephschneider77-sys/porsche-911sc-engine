import { PARTS } from './parts';

/**
 * `carries`: parts that come off attached to one of this step's parts (carrier id -> carried ids) and are only
 * dismantled from it in a later step — e.g. the heads and valves lifting off with their cam housing.
 */
export interface TeardownStep { id: string; title: string; note: string; parts: string[]; carries?: Record<string, string[]> }
const cyl = (prefix: string, list = [1, 2, 3, 4, 5, 6]) => list.map((c) => `${prefix}-${c}`);
const both = (prefix: string) => [`${prefix}-right`, `${prefix}-left`];

/**
 * Teardown order for an engine already removed from the car and mounted on a stand, following the
 * sequence in W. Dempsey's "101 Projects" (Project 12 engine teardown) and the factory workshop manual:
 * ancillaries → fan/shroud → chain covers & tensioners → rockers & cams → cam housings + heads
 * → cylinders & pistons → split case → crank / intermediate shaft / pump.
 */
export const TEARDOWN: TeardownStep[] = [
  { id: 'clutch', title: 'Clutch pressure plate & disc', note: 'Lock the flywheel, back the nine pressure-plate bolts off evenly.', parts: ['pressure-plate', 'clutch-disc'] },
  { id: 'flywheel', title: 'Flywheel', note: 'Nine flywheel bolts; mark position for balance.', parts: ['flywheel'] },
  { id: 'muffler', title: 'Exhaust silencer', note: 'Clamps at both heat-exchanger outlets.', parts: ['muffler'] },
  { id: 'heat-exchangers', title: 'Heat exchangers', note: 'Six port nuts per side — soak them first; they seize.', parts: both('heat-exchanger') },
  { id: 'air-cleaner', title: 'Air cleaner lid & filter', note: 'Release the spring straps.', parts: ['air-cleaner-lid', 'air-filter'] },
  { id: 'cis', title: 'Mixture control unit, injection lines & injectors', note: 'Depressurise the fuel system; cap all lines.', parts: ['mixture-control-unit', 'fuel-lines', ...cyl('injector')] },
  { id: 'intake', title: 'Air distributor & intake pipes', note: 'Plug the intake ports with rags.', parts: ['plenum', ...cyl('intake-runner')] },
  { id: 'belt', title: 'V-belt', note: 'Remove shims from the fan pulley to slacken the belt.', parts: ['fan-belt', 'fan-pulley'] },
  { id: 'fan', title: 'Fan housing with fan & alternator', note: 'Loosen the strap clamp; fan housing, fan and alternator lift out together.', parts: ['fan-impeller', 'alternator', 'fan-housing'] },
  { id: 'distributor', title: 'Distributor & spark plugs', note: 'Mark rotor position before removal.', parts: ['distributor', ...cyl('spark-plug')] },
  { id: 'shroud', title: 'Upper air guide & oil cooler', note: 'The shroud comes off once the fan housing is out.', parts: ['upper-air-guide', 'oil-cooler'] },
  { id: 'pulley', title: 'Crankshaft pulley', note: 'Central bolt, hold the crank from the flywheel flange.', parts: ['crank-pulley'] },
  { id: 'valve-covers', title: 'Valve covers', note: 'Upper and lower covers on both cam housings.', parts: ['valve-cover-upper-right', 'valve-cover-lower-right', 'valve-cover-upper-left', 'valve-cover-lower-left'] },
  { id: 'chain-covers', title: 'Chain housing covers & tensioners', note: 'Remove covers, oil lines and both chain tensioners; idler arms off.', parts: [...both('chain-housing-lid'), ...both('chain-tensioner')] },
  { id: 'cam-sprockets', title: 'Camshaft sprockets & timing chains', note: 'Hold the sprocket (P202-type tool) and lift the chains off. On the real engine the chains then hang slack round the intermediate shaft until the case is split; the viewer takes them away here.', parts: [...both('cam-sprocket'), ...both('timing-chain')] },
  { id: 'rockers', title: 'Rocker arms & shafts', note: 'Label each rocker with its shaft (e.g. “#3 intake”).', parts: both('rockers') },
  { id: 'camshafts', title: 'Camshafts', note: 'Slide out toward the chain end without scoring the housing.', parts: both('camshaft') },
  { id: 'chain-housings', title: 'Chain housings', note: 'Now the chain cases can be unbolted.', parts: both('chain-housing') },
  { id: 'cam-housings', title: 'Cam housings with heads', note: 'Remove the 12 head-stud nuts per bank; lift cam housing + 3 heads (valves still in them) off the studs as one unit.', parts: both('cam-housing'),
    carries: { 'cam-housing-right': [...cyl('head', [1, 2, 3]), ...cyl('valves', [1, 2, 3])], 'cam-housing-left': [...cyl('head', [4, 5, 6]), ...cyl('valves', [4, 5, 6])] } },
  // Valves before heads (bench work on the lifted unit), so the valve sets never float in mid-air.
  { id: 'valves', title: 'Valves & springs (bench)', note: 'On the bench: spring compressor; keep valves in order.', parts: cyl('valves') },
  { id: 'heads', title: 'Cylinder heads (bench)', note: 'Separate the heads from the cam housing on the bench.', parts: cyl('head') },
  { id: 'cylinders', title: 'Cylinders', note: 'Rock each off the studs; keep matched to its piston.', parts: cyl('cylinder') },
  { id: 'pistons', title: 'Pistons', note: 'Circlips out, push pins; mark cylinder number and direction.', parts: cyl('piston') },
  { id: 'externals', title: 'Breather, oil thermostat & sump plate', note: 'Last external items before splitting the case.', parts: ['breather-lid', 'oil-thermostat', 'sump-plate'] },
  { id: 'split', title: 'Split the crankcase', note: 'Remove through-bolts and perimeter nuts; lift the left half off.', parts: ['crankcase-left'] },
  { id: 'crank', title: 'Crankshaft with connecting rods', note: 'Lift the crank out; then unbolt the rods (keep caps matched).', parts: ['crankshaft', 'crank-gears', ...cyl('conrod')] },
  { id: 'int-shaft', title: 'Intermediate shaft & oil pump', note: 'Lift the intermediate shaft out with the oil pump on its connecting shaft (the chains come out with it on the real engine).', parts: ['intermediate-shaft', 'oil-pump'] },
  { id: 'bearings', title: 'Main bearing shells', note: 'Only the right case half remains.', parts: ['main-bearings'] },
];

/** The part left on the stand after the final step. */
export const BASE_PART = 'crankcase-right';

export function stepIndexOf(partId: string): number {
  return TEARDOWN.findIndex((s) => s.parts.includes(partId));
}
/** Parts removed after completing `n` steps. */
export function removedAfter(n: number): Set<string> {
  const out = new Set<string>();
  TEARDOWN.slice(0, n).forEach((s) => s.parts.forEach((p) => out.add(p)));
  return out;
}
/** Parts lifted off the engine with a removed carrier but not yet dismantled from it, after `n` steps: part -> carrier. */
export function carriedAfter(n: number): Map<string, string> {
  const removed = removedAfter(n), out = new Map<string, string>();
  TEARDOWN.slice(0, n).forEach((s) => Object.entries(s.carries ?? {}).forEach(([c, ps]) => ps.forEach((p) => { if (!removed.has(p)) out.set(p, c); })));
  return out;
}
export function validateTeardown(): string[] {
  const errs: string[] = [];
  const ids = new Set(PARTS.map((p) => p.id));
  const seen = new Map<string, string>();
  for (const s of TEARDOWN) for (const p of s.parts) {
    if (!ids.has(p)) errs.push(`step ${s.id}: unknown part ${p}`);
    if (seen.has(p)) errs.push(`part ${p} in both ${seen.get(p)} and ${s.id}`);
    seen.set(p, s.id);
  }
  for (const id of ids) if (!seen.has(id) && id !== BASE_PART) errs.push(`part ${id} never removed`);
  if (seen.has(BASE_PART)) errs.push('base part must stay on the stand');
  TEARDOWN.forEach((s, i) => Object.entries(s.carries ?? {}).forEach(([c, ps]) => {
    if (!s.parts.includes(c)) errs.push(`step ${s.id}: carrier ${c} not removed in this step`);
    for (const p of ps) if (!(stepIndexOf(p) > i)) errs.push(`step ${s.id}: carried ${p} must be dismantled in a later step`);
  }));
  return errs;
}
