import { describe, it, expect } from 'vitest';
import { PARTS, PART_BY_ID } from '../src/data/parts';
import {
  AIR_INJECTION, EMISSIONS_FLAG, PART_GROUPS, emissionsEnabled, hiddenPartIds, memberGroup,
} from '../src/data/partGroups';
import { activeTeardown, emissionsHidden, validateTeardown, BASE_PART } from '../src/data/teardown';
import { isMating, isFastenerJoint } from './collide';

const RESERVED_MEMBERS = [
  ...[1, 2, 3, 4, 5, 6].flatMap((i) => [`air-union-${i}`, `air-union-ring-${i}`]),
  'air-tube-left', 'air-tube-right', 'air-tube-seal',
];
const RESERVED_INVERSE = [1, 2, 3, 4, 5, 6].map((i) => `air-port-plug-${i}`);

describe('part groups', () => {
  const group = PART_GROUPS.find((g) => g.id === AIR_INJECTION)!;

  it('exports the air-injection group behind the emissions flag, off by default', () => {
    expect(EMISSIONS_FLAG).toBe('emissions');
    expect(group.label).toBe('Emissions equipment');
    expect(group.defaultOn).toBe(false);
    expect(emissionsEnabled(false).has(AIR_INJECTION)).toBe(false);
    expect(emissionsEnabled(true).has(AIR_INJECTION)).toBe(true);
  });

  it('reserves Top End ids that are not modelled yet', () => {
    for (const id of [...RESERVED_MEMBERS, ...RESERVED_INVERSE]) expect(PART_BY_ID[id], id).toBeUndefined();
    for (const id of RESERVED_MEMBERS) expect(group.members).toContain(id);
    for (const id of RESERVED_INVERSE) expect(group.inverse).toContain(id);
  });

  it('a tagged part joins the group without being listed', () => {
    expect(memberGroup({ id: 'future-air-widget', group: AIR_INJECTION })).toBe(AIR_INJECTION);
    const hidden = hiddenPartIds([{ id: 'future-air-widget', group: AIR_INJECTION }], new Set());
    expect(hidden.has('future-air-widget')).toBe(true);
    const shown = hiddenPartIds([{ id: 'future-air-widget', group: AIR_INJECTION }], emissionsEnabled(true));
    expect(shown.has('future-air-widget')).toBe(false);
  });

  it('keeps EGR and the catalytic converter visible in both states', () => {
    for (const on of [false, true]) {
      const hidden = emissionsHidden(on);
      expect(hidden.has('egr-valve')).toBe(false);
      expect(hidden.has('catalytic-converter')).toBe(false);
      expect(hidden.has('egr-hose-long')).toBe(false);
    }
  });

  it('hides air injection when off, and the caps when on', () => {
    const off = emissionsHidden(false);
    const on = emissionsHidden(true);
    expect(off.has('air-pump')).toBe(true);
    expect(off.has('air-hose-vacuum')).toBe(true);
    expect(off.has('air-clamp-vacuum')).toBe(true);
    expect(off.has('air-hose-dump')).toBe(true);
    expect(off.has('air-inj-vac-cap')).toBe(false);
    expect(off.has('egr-tee-cap')).toBe(false);
    expect(off.has('egr-hose-diverter')).toBe(true);
    expect(off.has('egr-clamp-diverter')).toBe(true);
    expect(off.has('egr-clamp-vac')).toBe(false);
    expect(off.has('egr-hose-return')).toBe(false);
    expect(on.has('air-pump')).toBe(false);
    expect(on.has('air-inj-vac-cap')).toBe(true);
    expect(on.has('egr-tee-cap')).toBe(true);
    expect(on.has('egr-hose-diverter')).toBe(false);
    expect(on.has('egr-clamp-diverter')).toBe(false);
    expect(on.has('air-clamp-vacuum')).toBe(false);
    for (const id of RESERVED_MEMBERS) expect(off.has(id)).toBe(false);
    for (const id of RESERVED_INVERSE) expect(on.has(id)).toBe(false);
  });

  it('does not allowlist the TEE cap against the vacuum tee', () => {
    expect(isMating('air-inj-vac-cap', 'vacuum-fittings')).toBe(false);
    expect(isFastenerJoint('air-inj-vac-cap', 'vacuum-fittings')).toBe(false);
  });
});

describe.each([false, true])('teardown with emissions %s', (on) => {
  const steps = activeTeardown(on);
  const hidden = emissionsHidden(on);
  const visible = PARTS.filter((p) => !hidden.has(p.id));

  it('removes every visible part once, drops empty steps, and keeps the numbers contiguous', () => {
    expect(validateTeardown(steps, visible)).toEqual([]);
    expect(steps.every((s) => s.parts.length > 0)).toBe(true);
    expect(steps.find((s) => s.parts.includes(BASE_PART))).toBeUndefined();
    const listed = steps.flatMap((s) => s.parts);
    expect(new Set(listed).size).toBe(listed.length);
    expect(listed.length).toBe(visible.length - 1);
  });

  it('leaves the EGR valve and the converter on their steps', () => {
    expect(steps.some((s) => s.parts.includes('egr-valve'))).toBe(true);
    expect(steps.some((s) => s.parts.includes('catalytic-converter'))).toBe(true);
  });
});
