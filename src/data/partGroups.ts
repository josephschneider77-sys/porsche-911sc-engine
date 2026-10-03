/**
 * Part groups. The viewer draws one checkbox per group.
 *
 * A part joins a group in either of two ways:
 *   1. Tag it: set `group: 'air-injection'` on its PartDef (src/data/parts.ts).
 *      Small parts can set the same field on their SmallSpec; parts.ts copies it through.
 *   2. List its id in `PART_GROUPS` below (`members` or `inverse`).
 * An id that is not in PARTS is reserved. The registry and the tests ignore it until the part exists.
 *
 * `members` are shown only when the group is on.
 * `inverse` are shown only when the group is off (the fittings that close the ports the group leaves open).
 * Inverse wins if an id is listed both ways.
 *
 * Export: `PART_GROUPS` from this file (`src/data/partGroups.ts`).
 * The emissions checkbox is the group `air-injection`. Its URL and localStorage flag is `emissions`
 * (`EMISSIONS_FLAG`): absent or `0` is off, `1` is on. The default is off.
 */
export const AIR_INJECTION = 'air-injection';
/** Query-string and localStorage key for the Emissions equipment checkbox. Default off. */
export const EMISSIONS_FLAG = 'emissions';

export interface PartGroup {
  id: string;
  /** Checkbox label. */
  label: string;
  /** Off unless the user turns it on. */
  defaultOn: boolean;
  /** Hidden when the group is off. Ids that are not modelled yet are kept here on purpose. */
  members: readonly string[];
  /** Shown only when the group is off. Ids that are not modelled yet are kept here on purpose. */
  inverse: readonly string[];
}

const n = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => `${prefix}${i + 1}`);

export const PART_GROUPS: readonly PartGroup[] = [
  {
    id: AIR_INJECTION,
    label: 'Emissions equipment',
    defaultOn: false,
    members: [
      'air-pump', 'air-pump-pulley', 'air-pump-belt', 'air-pump-bracket', 'air-pump-strap',
      'air-retainer', 'air-check-valve', 'air-diverter', 'air-diverter-support', 'air-pump-cleaner',
      'air-rubber', 'air-sleeve', 'air-buffer',
      'air-hose-pump', 'air-hose-valve', 'air-hose-dump', 'air-hose-vacuum',
      'egr-hose-diverter',
      'air-clamp-pump', 'air-clamp-valve', 'air-clamp-dump', 'air-clamp-vacuum',
      'egr-clamp-diverter',
      'air-sealing-ring', 'air-check-gasket',
      'air-pulley-screws', 'air-pulley-washers', 'air-bracket-nuts', 'air-pump-fasteners', 'air-diverter-nuts',
      // Reserved for Top End (not on main yet). Registering the id is enough; no geometry edit.
      ...n('air-union-', 6),
      ...n('air-union-ring-', 6),
      'air-tube-left', 'air-tube-right', 'air-tube-seal',
    ],
    inverse: [
      // Top End owns these plugs. Shown only when emissions equipment is off.
      ...n('air-port-plug-', 6),
      'air-inj-vac-cap',
      // Closes the EGR tee's aft port while the diverter leg (202-05 #17) is hidden.
      'egr-tee-cap',
    ],
  },
];

export interface GroupedPart { id: string; group?: string }

/** Group id a part declares, or the group whose member list names it. Inverse ids are not members. */
export function memberGroup(part: GroupedPart): string | undefined {
  for (const g of PART_GROUPS) {
    if (g.inverse.includes(part.id)) return undefined;
    if (part.group === g.id || g.members.includes(part.id)) return g.id;
  }
  return part.group;
}

export function hiddenPartIds(parts: readonly GroupedPart[], enabled: ReadonlySet<string>): Set<string> {
  const present = new Set(parts.map((p) => p.id));
  const hidden = new Set<string>();
  for (const g of PART_GROUPS) {
    const on = enabled.has(g.id);
    if (on) {
      for (const id of g.inverse) if (present.has(id)) hidden.add(id);
    } else {
      for (const p of parts) {
        if (g.inverse.includes(p.id)) continue;
        if (p.group === g.id || g.members.includes(p.id)) hidden.add(p.id);
      }
    }
  }
  return hidden;
}

/** `emissions=1` enables air injection. Anything else, including a missing flag, leaves it off. */
export function emissionsEnabled(on: boolean): Set<string> {
  return on ? new Set([AIR_INJECTION]) : new Set();
}
