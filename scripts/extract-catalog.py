"""Extract the engine-group lines of the Porsche parts catalogue (Kat 002, 911 1978-83) into docs/catalog/engine-lines.json.
Input: ill.json parsed from the catalogue PDF text (see /workspace/911sc/ref/parse.py). Each row gets `auto`: a reason it
does not apply to a 1978 911 SC (930/03) engine, or '' if it is a candidate line."""
import json, re, sys
src = sys.argv[1] if len(sys.argv) > 1 else '/workspace/911sc/ref/ill.json'
d = json.load(open(src))
G = ['101-05','101-10','102-00','102-05','103-00','103-05','103-10','103-15','104-00','104-05','105-00','105-05',
     '106-00','107-00','107-10','202-00','301-00','901-00','902-05']
order = '890ABCDEFG'
yr = lambda c: order.index(c) if c in order else 99
out = []; seen = {}
for g in G:
  for r in d[g]['rows']:
    pos, pn, desc, *rest = r
    notes = [x[1:].strip() for x in rest if x.startswith('|')]
    fields = [x for x in rest if not x.startswith('|')]
    qty = next((f for f in reversed(fields) if re.fullmatch(r'\d+|X|\*', f)), '')
    if not qty and any('*' in f for f in fields): qty = '*'
    tags = [f for f in fields if f != qty]
    T = ' '.join(tags + notes).upper(); auto = ''
    if re.search(r'TURBO|930\.6|CARRERA|SPM|SPORTOMATIC', T): auto = 'other model (Turbo / Carrera / Sportomatic)'
    for t in tags:
      m = re.fullmatch(r'(\d\d)?-(\d\d)?', t)
      if m:
        a, b = m.group(1), m.group(2)
        if (a and int(a) > 78) or (b and int(b) < 78): auto = f'model years {t}: not a 1978 engine'
      if re.fullmatch(r'\d\d', t) and int(t) > 78 and qty: auto = f'model year {t}-: not a 1978 engine'
      if t == '/RL': auto = 'right-hand-drive variant (the model is a LHD/US car)'
    for n in notes:
      m = re.match(r'M (\w{3}) \w+ >>', n)
      if m and yr(m.group(1)[2]) > 0: auto = auto or f'from engine no. {m.group(1)} (after 1978)'
      if re.search(r'OVERSIZE|UNDERSIZE', n.upper()): auto = auto or 'repair oversize'
    k = f'{g}#{pos}#{pn}'; seen[k] = seen.get(k, 0) + 1
    if seen[k] > 1: k += f'#{seen[k]}'
    out.append(dict(key=k, ill=g, pos=pos, pn=pn, desc=desc, qty=qty, tags=tags, notes=notes, auto=auto))
json.dump(out, open('docs/catalog/engine-lines.json', 'w'), indent=0)
print(len(out), 'lines;', sum(1 for o in out if not o['auto']), 'candidates')
