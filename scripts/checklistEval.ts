/** Evaluates src/data/checklist.ts against the catalogue lines and the modelled geometry (used by the test + doc). */
import { readFileSync } from 'node:fs';
import { CLAIMS, NOT_APPLICABLE, STILL_MISSING, FEATURES, POOLS, type Claim } from '../src/data/checklist';
import { PARTS } from '../src/data/parts';
import { fastenerSets } from '../src/geo/fasteners';
import { SMALL_GEOM } from '../src/geo/smallParts';

export interface Row { key: string; ill: string; pos: string; pn: string; desc: string; qty: string; auto: string }
export type Status = { kind: 'modelled'; claims: Claim[]; sum: number } | { kind: 'na'; why: string } | { kind: 'auto'; why: string } | { kind: 'alt'; of: string } | { kind: 'missing'; why: string; listed: boolean };

export function loadRows(): Row[] {
  const raw = JSON.parse(readFileSync(new URL('../docs/catalog/engine-lines.json', import.meta.url), 'utf8'));
  return (Array.isArray(raw) ? raw : raw.lines) as Row[];
}
const base = (id: string) => id.replace(/-(\d|left|right)$/, '');
/** `by` patterns: a `*` glob, or a regex when it starts with ^ (e.g. ^head-\d$). */
const glob = (g: string) => (g.startsWith('^') ? new RegExp(g) : new RegExp(`^${g.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`));

/** Capacity of one concrete source for a `what`. */
function sources(by: string, what: string): { id: string; what: string; cap: number }[] {
  if (by.startsWith('pool:')) {
    const pool = POOLS[by.slice(5)]; if (!pool) throw new Error(`unknown pool ${by}`);
    return pool.flatMap((p) => sources(p.by, p.what || what));
  }
  const re = glob(by), out: { id: string; what: string; cap: number }[] = [];
  const fs = fastenerSets().filter((f) => re.test(f.id));
  for (const f of fs) {
    const n = f.items.length;
    const cap = what === 'item' ? n : what === 'washer' ? (f.washer > 0 ? n : 0) : what === 'spring' ? ((f as any).spring ? n : 0) : what === 'tab' ? ((f as any).tab ? n : 0) : what === 'stud' ? f.items.filter((i) => i.stud).length : -1;
    if (cap < 0) throw new Error(`fastener set ${f.id}: unknown what "${what}"`);
    out.push({ id: f.id, what, cap });
  }
  if (fs.length) return out;
  const small = Object.keys(SMALL_GEOM).filter((id) => re.test(id));
  for (const id of small) {
    const n = SMALL_GEOM[id].items().length, k = FEATURES[id] ?? FEATURES[base(id)];
    const per = what === 'item' ? 1 : k?.[what];
    if (per === undefined) throw new Error(`small set ${id}: no feature "${what}"`);
    out.push({ id, what, cap: n * per });
  }
  if (small.length) return out;
  const parts = PARTS.filter((p) => re.test(p.id));
  for (const p of parts) {
    const per = what === 'item' ? 1 : (FEATURES[p.id] ?? FEATURES[base(p.id)])?.[what];
    if (per === undefined) throw new Error(`part ${p.id}: no feature "${what}"`);
    out.push({ id: p.id, what, cap: per });
  }
  if (!out.length) throw new Error(`claim source "${by}" matches nothing`);
  return out;
}

export function evaluate() {
  const rows = loadRows();
  const primary = new Map<string, Row>(); // ill#pos -> first candidate row
  const anyPos = new Map<string, Row>(); // ill#pos -> first row, including excluded ones
  for (const r of rows) {
    if (r.pos === '-') continue;
    const k = `${r.ill}#${r.pos}`;
    if (!anyPos.has(k)) anyPos.set(k, r);
    if (!r.auto && !primary.has(k)) primary.set(k, r);
  }
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const resolve = (line: string) => { const r = byKey.get(line) ?? primary.get(line) ?? anyPos.get(line); if (!r) throw new Error(`checklist line ${line} not in the catalogue`); return r; };
  const errors: string[] = [];
  const used = new Map<string, number>(); // id|what -> used
  const claimed = new Map<string, Claim[]>(), sums = new Map<string, number>();
  for (const c of CLAIMS) {
    const r = resolve(c.line); const what = c.what ?? 'item';
    let src: ReturnType<typeof sources>;
    try { src = sources(c.by, what); } catch (e) { errors.push(`${c.line}: ${(e as Error).message}`); continue; }
    const total = src.reduce((a, s) => a + Math.max(0, s.cap - (used.get(`${s.id}|${s.what}`) ?? 0)), 0);
    const qty = Number(r.qty);
    const n = c.n ?? (Number.isFinite(qty) ? qty - (sums.get(r.key) ?? 0) : total);
    if (n > total) errors.push(`${c.line} (${r.desc}): claims ${n} x ${what} from ${c.by} but only ${total} left`);
    let left = n; for (const s of src) { const k = `${s.id}|${s.what}`; const free = s.cap - (used.get(k) ?? 0); const take = Math.min(free, left); if (take > 0) { used.set(k, (used.get(k) ?? 0) + take); left -= take; } }
    claimed.set(r.key, [...(claimed.get(r.key) ?? []), c]); sums.set(r.key, (sums.get(r.key) ?? 0) + n);
  }
  const na = new Map<string, string>(); for (const x of NOT_APPLICABLE) { const r = resolve(x.line); if (na.has(r.key)) errors.push(`${x.line}: listed N/A twice`); na.set(r.key, x.why); }
  const miss = new Map<string, string>(); for (const x of STILL_MISSING) miss.set(resolve(x.line).key, x.why);
  const handledPos = new Set<string>([...claimed.keys(), ...na.keys()].map((k) => { const r = byKey.get(k)!; return r.pos === '-' ? k : `${r.ill}#${r.pos}`; }));
  const status = new Map<string, Status>();
  for (const r of rows) {
    const k = r.key;
    if (claimed.has(k) && na.has(k)) errors.push(`${k}: both claimed and N/A`);
    if (r.auto) { if (claimed.has(k)) errors.push(`${k}: claimed but excluded (${r.auto})`); status.set(k, { kind: 'auto', why: r.auto }); continue; }
    if (claimed.has(k)) {
      const s = sums.get(k)!; const q = r.qty;
      const ok = q === 'X' ? s >= 1 : q === '*' ? false : s === Number(q);
      if (!ok) errors.push(`${k} (${r.desc}): catalogue qty ${q}, claimed ${s}`);
      status.set(k, { kind: 'modelled', claims: claimed.get(k)!, sum: s }); continue;
    }
    if (na.has(k)) { status.set(k, { kind: 'na', why: na.get(k)! }); continue; }
    if (r.pos !== '-' && handledPos.has(`${r.ill}#${r.pos}`) && !miss.has(k)) { status.set(k, { kind: 'alt', of: `${r.ill} #${r.pos}` }); continue; }
    status.set(k, { kind: 'missing', why: miss.get(k) ?? 'not modelled', listed: miss.has(k) });
  }
  return { rows, status, errors, used };
}
