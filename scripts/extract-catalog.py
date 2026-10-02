"""Extract the engine-group lines of the Porsche parts catalogue into docs/catalog/engine-lines.json.

Target engine: 1978 US 911 SC type 930/04 (Kat 502 writes it '930.04', and '911.04' on some rows).
Input when present: ill.json parsed from the catalogue PDF. This repo does not contain the PDF or ill.json;
without that file the script re-filters the committed JSON (tags and notes already on each row) and appends the
Kat 502 groups that the older extract never had (105-10, 108-00, 108-10, 109-00, 202-05, 202-20, and the
930/04 catalytic-converter rows of 202-00).

`auto` is a reason the row does not apply to a 1978 930/04, or '' if it is a candidate line.
"""
import json, os, re, sys

G = ['101-05', '101-10', '102-00', '102-05', '103-00', '103-05', '103-10', '103-15', '104-00', '104-05',
     '105-00', '105-05', '105-10', '106-00', '107-00', '107-10', '108-00', '108-10', '109-00',
     '202-00', '202-05', '202-20', '301-00', '901-00', '902-05']
# Groups whose rows are authored here (Kat 502 pages cited in the audit). Re-runs replace them.
AUTHORED = {'105-10', '108-00', '108-10', '109-00', '202-05', '202-20'}
order = '890ABCDEFG'
yr = lambda c: order.index(c) if c in order else 99

def engine_codes(text):
    """Engine-type tokens: 930.04, 911.04, and slash continuations (930.03/09, 911.04/05/06/15).
    A part number such as 930.102.115.01 does not match: the two-digit group must not run into a third digit."""
    codes = []
    for m in re.finditer(r'(?:930|911)\.(\d{2})(?!\d)((?:\s*/\s*\d{2})*)', text):
        codes.append(m.group(1))
        codes.extend(re.findall(r'\d{2}', m.group(2) or ''))
    return codes

def applicability(tags, notes, pn, pos, ill):
    T = ' '.join(list(tags) + list(notes)).upper()
    auto = ''
    # 930.60 / 930.66 are engine types. 930.602… is a part number and is not Turbo.
    if re.search(r'TURBO|930\.6\d(?!\d)|CARRERA|SPM|SPORTOMATIC', T):
        auto = 'other model (Turbo / Carrera / Sportomatic)'
    for t in tags:
        m = re.fullmatch(r'(\d\d)?-(\d\d)?', t)
        if m:
            a, b = m.group(1), m.group(2)
            if (a and int(a) > 78) or (b and int(b) < 78):
                auto = f'model years {t}: not a 1978 engine'
        if re.fullmatch(r'\d\d', t) and int(t) > 78:
            auto = f'model year {t}-: not a 1978 engine'
        if t == '/RL':
            auto = 'right-hand-drive variant (the model is a LHD/US car)'
    # "M 63D 4070 >>" is from that engine. "M >> 63D 4069" is up to that engine and still applies to 1978.
    # A row that carries both (the cover, one illustration line for two ranges) keeps the up-to applicability.
    has_upto = any(re.search(r'M >>', n) for n in notes)
    from_id = ''
    for n in notes:
        m = re.match(r'M (\w{3}) \w+ >>', n)
        if m and yr(m.group(1)[2]) > 0:
            from_id = m.group(1)
        if re.search(r'OVERSIZE|UNDERSIZE', n.upper()):
            auto = auto or 'repair oversize'
    if from_id and not has_upto:
        auto = auto or f'from engine no. {from_id} (after 1978)'
    codes = engine_codes(T)
    if codes and '04' not in codes:
        shown = '/'.join(dict.fromkeys(codes))
        auto = f'engine type {shown}: not 930/04'
    # "930.602.021.04/09" names the distributor this part fits. 930/04 uses 021.02.
    cited: list[str] = []
    for m in re.finditer(r'930\.602\.021\.(\d{2})((?:\s*/\s*\d{2})*)', T):
        cited.append(m.group(1))
        cited.extend(re.findall(r'\d{2}', m.group(2) or ''))
    if cited and '02' not in cited:
        shown = '/'.join(dict.fromkeys(cited))
        auto = f'for distributor 930 602 021 {shown}: not the 930/04 distributor 021 02'
    # (J) = Japan. "Not for (J)" means the row IS the 49-state part.
    if re.search(r'\(J\)', T) and not re.search(r'NOT FOR\s*\(J\)', T):
        auto = auto or 'Japan (J) market'
    if re.search(r'\(CAL(?:IF)?\.?\)', T):
        auto = auto or 'California (CAL) market'
    option = bool(re.search(r'\bM399\b|\bM559\b', T))
    non_option = bool(re.search(r'\bSC\b|(?:930|911)\.\d{2}|\d{2}-\d{2}|-\d{2}', T))
    if option and not non_option:
        auto = auto or 'air-conditioning option M399/M559'
    # Kat 502 ties 930 102 115 01 to the 930/03 pinion. The 930/04 wheel is 930 102 115 02.
    if pn == '930 102 115 01' and ill == '102-00' and pos == '10':
        auto = auto or 'paired with the 930/03 distributor pinion; 930/04 uses 930 102 115 02'
    if pn == '930 111 183 03' and ill == '202-00' and pos == '6':
        auto = auto or 'RoW pre-silencer; 930/04 front element is catalytic converter 930 113 228 01'
    return auto

def row_from_ill(g, r, seen):
    pos, pn, desc, *rest = r
    notes = [x[1:].strip() for x in rest if x.startswith('|')]
    fields = [x for x in rest if not x.startswith('|')]
    qty = next((f for f in reversed(fields) if re.fullmatch(r'\d+|X|\*', f)), '')
    if not qty and any('*' in f for f in fields):
        qty = '*'
    tags = [f for f in fields if f != qty]
    k = f'{g}#{pos}#{pn}'
    seen[k] = seen.get(k, 0) + 1
    if seen[k] > 1:
        k += f'#{seen[k]}'
    return dict(key=k, ill=g, pos=pos, pn=pn, desc=desc, qty=qty, tags=tags, notes=notes,
                auto=applicability(tags, notes, pn, pos, g))

def authored_rows():
    """Lines transcribed from Kat 502 for groups the Kat 002 extract did not carry. Pages are the audit citations."""
    def R(ill, pos, pn, desc, qty, tags=None, notes=None):
        tags, notes = tags or [], notes or []
        return dict(key=f'{ill}#{pos}#{pn}', ill=ill, pos=pos, pn=pn, desc=desc, qty=str(qty),
                    tags=tags, notes=notes, auto=applicability(tags, notes, pn, pos, ill))
    rows = []
    # 105-10 cylinder baffles (p94). The five SC lines this engine was missing.
    rows += [
        R('105-10', '14', '930 106 023 00', 'Baffle plate', 4, ['SC']),
        R('105-10', '15', '930 106 221 00', 'Baffle plate', 2, ['SC']),
        R('105-10', '16', '930 106 222 00', 'Baffle plate', 2, ['SC']),
        R('105-10', '17', '930 106 228 00', 'Leaf spring', 6, ['SC']),
        R('105-10', '18', '930 106 301 00', 'Cover plate', 2, ['SC']),
    ]
    # 108-00 air injection (drawing p141, list p142-143). Every row applies to 930/04.
    a = [
        ('1', '911 113 113 02', 'Bracket', 1),
        ('2', '911 113 121 00', 'Rubber mounting', 2),
        ('3', '911 113 122 00', 'Spacer sleeve', 2),
        ('4', '900 151 008 02', 'Washer', 1),
        ('4', '911 113 162 00', 'Washer', 1),
        ('5', '900 076 025 02', 'Hexagon nut', 6),
        ('6', 'N 012 241 8', 'Spring washer', 6),
        ('7', '911 113 111 03', 'Air pump', 1),
        ('8', '911 113 158 01', 'Pulley', 1),
        ('9', '900 067 008 02', 'Pan-head screw', 4),
        ('10', 'N 012 226 5', 'Spring washer', 4),
        ('11', '900 249 006 02', 'Countersunk screw', 1),
        ('12', '911 113 126 02', 'Retaining bracket', 1),
        ('13', '930 110 194 00', 'Bonded rubber buffer', 2),
        ('14', '911 113 125 02', 'Support', 1),
        ('15', '900 075 085 02', 'Hexagon-head bolt', 1),
        ('16', '900 025 007 02', 'Washer', 1),
        ('17', '911 113 117 02', 'Air cleaner', 1),
        ('18', '911 113 145 02', 'Union', 6),
        ('19', '900 123 033 20', 'Sealing ring', 6),
        ('20', '911 113 043 01', 'Air tube', 1),
        ('21', '900 123 060 30', 'Sealing ring', 1),
        ('22', '930 113 147 01', 'Diverter valve', 1),
        ('23', '930 113 146 01', 'Support', 1),
        ('24', '999 072 005 09', 'Hexagon nut', 2),
        ('25', 'N 012 226 5', 'Spring washer', 2),
        ('26', '911 113 115 01', 'Check valve', 1),
        ('27', '911 113 146 00', 'Gasket', 1),
        ('28', '930 113 138 03', 'Hose', 1),
        ('29', '930 113 137 01', 'Hose', 1),
        ('30', '930 113 139 02', 'Hose', 1),
        ('31', '999 239 003 40', 'Hose', 1),
        ('32', '999 512 038 02', 'Hose clamp', 1),
        ('32A', 'PCG 512 237 02', 'Hose clamp', 1),
        ('33', '999 512 296 02', 'Hose clamp', 2),
        ('34', '900 192 021 50', 'V-belt', 1),
        ('35', '911 106 208 00', 'Pulley', 1),
    ]
    for pos, pn, desc, qty in a:
        notes = []
        if pos == '11':
            notes = ['M 8 X 120']
        if pos == '31':
            notes = ['3,2 X 7', '750 MM']
        if pos == '34':
            notes = ['9,5 X 950']
        if pos == '21':
            notes = ['A 24 X 29']
        rows.append(R('108-00', pos, pn, desc, qty, ['930.04'], notes))
    # 108-10 heater blower (p148-150). #17-#20 are M399/M559; #1A/#1B are 80-.
    b = [
        ('1', '911 624 151 02', 'Heater blower', 1, []),
        ('2', '911 211 139 02', 'Support', 1, ['-79']),
        ('3', '999 512 244 02', 'Clamp', 1, []),
        ('4', '911 211 135 02', 'Distributing piece', 1, []),
        ('5', '—', 'Tapping screw', 2, []),
        ('6', '—', 'Hexagon nut', 2, []),
        ('7', '—', 'Washer', 2, []),
        ('8', '911 211 272 02', 'Hose', 1, []),
        ('9', '—', 'Hose clamp', 2, []),
        ('10', '901 211 195 00', 'Heater hose', 1, []),
        ('11', '911 211 277 00', 'Support', 2, []),
        ('12', '—', 'Hose clamp', 6, []),
        ('13', '911 211 522 00', 'Heater hose', 1, []),
        ('14', '930 106 326 01', 'Hot-air socket', 1, []),
        ('15', '—', 'Washer', 2, []),
        ('16', '—', 'Hexagon nut', 2, []),
        ('17', '911 211 139 03', 'Support', 1, ['M399']),
        ('1A', '911 624 151 04', 'Heater blower', 1, ['80-']),
    ]
    for pos, pn, desc, qty, tags in b:
        rows.append(R('108-10', pos, pn, desc, qty, tags))
    # 202-00 catalytic converter hardware that the older extract skipped (p173-174).
    rows += [
        R('202-00', '6', '930 113 228 01', 'Catalytic converter', 1, ['930.04', '78']),
        R('202-00', '6A', '911 606 123 00', 'Oxygen sensor', 1),
        R('202-00', '7', '930 113 233 01', 'Heat shield', 1, ['-79']),
        R('202-00', '8', '930 113 153 00', 'Cap', 1),
        R('202-00', '8A', '—', 'Sealing ring', 1),
        R('202-00', '8B', '—', 'Screw plug', 1),
        R('202-00', '9', '—', 'Hexagon nut', 8),
        R('202-00', '10', '—', 'Hexagon-head bolt', 8),
        R('202-00', '11', '—', 'Washer', 8),
        R('202-00', '12', '930 113 196 00', 'Retaining bracket', 1),
    ]
    # 202-05 EGR (p177-178). #2A throttle plate is California only.
    e = [
        ('1', '930 113 190 01', 'Pipeline', 1, []),
        ('2', '—', 'Gasket', 1, []),
        ('2A', '—', 'Throttle plate', 1, ['(CALIF.)']),
        ('3', '—', 'Retaining bracket', 1, []),
        ('4', '—', 'Hexagon-head bolt', 2, []),
        ('5', '—', 'Spring washer', 3, []),
        ('6', '—', 'Hexagon nut', 1, []),
        ('7', '911 113 183 01', 'EGR valve', 1, []),
        ('8', '—', 'Hexagon-head bolt', 2, []),
        ('9', '—', 'Spring washer', 2, []),
        ('10', '—', 'Hexagon nut', 2, []),
        ('11', '911 113 177 03', 'Pipeline', 1, []),
        ('12', '—', 'Sealing rubber', 1, []),
        ('13', '—', 'Pressure screw', 1, []),
        ('14', '—', 'Washer', 1, []),
        ('15', '999 239 003 40', 'Hose', 1, []),
        ('16', '999 239 003 40', 'Hose', 1, []),
        ('17', '999 239 003 40', 'Hose', 2, []),
        ('18', '—', 'T-piece', 1, []),
        ('19', '—', 'Buffer', 1, []),
    ]
    for pos, pn, desc, qty, tags in e:
        notes = []
        if pos == '15':
            notes = ['3,2 X 7', '40 MM']
        if pos == '16':
            notes = ['3,2 X 7', '770 MM']
        if pos == '17':
            notes = ['3,2 X 7', '465 MM']
        rows.append(R('202-05', pos, pn, desc, qty, tags or ['930.04'], notes))
    return rows

def main():
    src = sys.argv[1] if len(sys.argv) > 1 else '/workspace/911sc/ref/ill.json'
    out_path = 'docs/catalog/engine-lines.json'
    seen = {}
    out = []
    extra = authored_rows()
    extra_keys = {r['key'] for r in extra}
    if os.path.exists(src):
        d = json.load(open(src))
        for g in G:
            if g not in d or g in AUTHORED:
                continue
            for r in d[g]['rows']:
                out.append(row_from_ill(g, r, seen))
        out = [o for o in out if o['key'] not in extra_keys and not (o['ill'] == '202-00' and o['pn'] == '930 113 228 01')]
    else:
        prev = json.load(open(out_path))
        for o in prev:
            if o['ill'] in AUTHORED or o['key'] in extra_keys:
                continue
            if o['ill'] == '202-00' and o['pn'] == '930 113 228 01':
                continue
            o = dict(o)
            o['auto'] = applicability(o.get('tags') or [], o.get('notes') or [], o['pn'], o['pos'], o['ill'])
            out.append(o)
    out.extend(extra)
    json.dump(out, open(out_path, 'w'), indent=0)
    print(len(out), 'lines;', sum(1 for o in out if not o['auto']), 'candidates')

if __name__ == '__main__':
    main()
