import './style.css';
import { Viewer } from './app/viewer';
import { PARTS, PART_BY_ID } from './data/parts';
import { TEARDOWN, stepIndexOf } from './data/teardown';
import { SYSTEMS, SystemKey, design911Url, ILLUSTRATIONS } from './data/catalog';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const viewer = new Viewer($('view'));
(window as any).viewer = viewer;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

// ---------------------------------------------------------------- steps
const N = TEARDOWN.length;
function renderStep() {
  const s = viewer.step;
  $('step-title').textContent = s === 0 ? 'Assembled engine' : `${s}/${N} · ${TEARDOWN[s - 1].title}`;
  $('step-note').textContent = s === 0
    ? `Next: ${TEARDOWN[0].title}. Tap › to disassemble in factory order.`
    : s === N ? 'Teardown complete — right case half on the stand.' : `${TEARDOWN[s - 1].note}  Next: ${TEARDOWN[s].title}.`;
  ($('btn-back') as HTMLButtonElement).disabled = s === 0;
  ($('btn-next') as HTMLButtonElement).disabled = s === N;
  $('step-bar').style.width = `${(s / N) * 100}%`;
  renderList();
}
$('btn-next').onclick = () => { if (viewer.step < N) { viewer.setStep(viewer.step + 1); renderStep(); } };
$('btn-back').onclick = () => { if (viewer.step > 0) { viewer.setStep(viewer.step - 1); renderStep(); } };

// ---------------------------------------------------------------- explode
const slider = $('explode') as HTMLInputElement;
slider.oninput = () => { viewer.setExplode(+slider.value / 100); $('explode-val').textContent = `${slider.value}%`; };

// ---------------------------------------------------------------- selection / info card
function showInfo(id: string | null) {
  viewer.select(id);
  const el = $('info');
  if (!id) { el.classList.add('hidden'); renderList(); return; }
  const p = PART_BY_ID[id];
  const cat = p.catalog.map((c) => `<tr><td class="mono">${esc(c.ill)} · #${esc(c.pos)}</td><td class="mono pn">${esc(c.pn)}</td></tr>${c.note ? `<tr class="note"><td colspan="2">${esc(c.note)}</td></tr>` : ''}`).join('');
  const specs = Object.entries(p.specs).map(([k, v]) => `<div class="spec"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
  const url = design911Url(p.catalog[0].ill);
  const st = stepIndexOf(id);
  el.innerHTML = `
    <div class="info-head">
      <div><div class="kicker">${esc(SYSTEMS[p.system].label)} · Ill. ${esc(p.catalog[0].ill)}</div><h2>${esc(p.name)}</h2></div>
      <button class="icon-btn small" id="info-close" aria-label="Close">✕</button>
    </div>
    <div class="info-body">
      <p>${esc(p.description)}</p>
      ${specs ? `<div class="specs">${specs}</div>` : ''}
      <table class="cat"><tbody>${cat}</tbody></table>
      <div class="meta">${st >= 0 ? `Removed at step ${st + 1}: ${esc(TEARDOWN[st].title)}` : 'Stays on the engine stand'}${url ? ` · <a href="${url}" target="_blank" rel="noopener">Catalogue ill. ${esc(p.catalog[0].ill)} ↗</a>` : ''}</div>
    </div>
    <div class="info-actions">
      <button id="act-hide">${viewer.hidden.has(id) ? 'Show' : 'Hide'}</button>
      <button id="act-iso">${viewer.isolated === id ? 'Show all' : 'Isolate'}</button>
      <button id="act-focus">Focus</button>
    </div>`;
  el.classList.remove('hidden');
  $('info-close').onclick = () => showInfo(null);
  $('act-hide').onclick = () => { viewer.toggleHidden(id); if (viewer.hidden.has(id)) showInfo(null); else showInfo(id); };
  $('act-iso').onclick = () => { viewer.isolate(viewer.isolated === id ? null : id); if (viewer.isolated) viewer.focus(id); else viewer.resetView(); showInfo(id); };
  $('act-focus').onclick = () => viewer.focus(id);
  renderList();
}
viewer.onPick = (id) => showInfo(id && id === viewer.selected ? null : id);

// ---------------------------------------------------------------- parts list
const order: SystemKey[] = ['crankcase', 'crank', 'pistons', 'heads', 'valvetrain', 'camdrive', 'lubrication', 'cooling', 'induction', 'ignition', 'exhaust', 'clutch'];
function renderList() {
  const list = $('parts-list');
  if ($('parts').classList.contains('hidden')) return;
  $('parts-count').textContent = `${PARTS.length}`;
  list.innerHTML = order.map((sys) => {
    const items = PARTS.filter((p) => p.system === sys);
    if (!items.length) return '';
    const groups = [...new Set(items.map((p) => p.catalog[0].ill))].map((i) => ILLUSTRATIONS[i]?.ill ?? i).join(', ');
    return `<div class="grp"><div class="grp-head"><span>${esc(SYSTEMS[sys].label)}</span><small>Ill. ${esc(groups)}</small></div>${items.map((p) => {
      const off = viewer.hidden.has(p.id) || viewer.isRemoved(p.id);
      return `<div class="item ${viewer.selected === p.id ? 'sel' : ''} ${off ? 'off' : ''}" data-id="${p.id}">
        <span class="nm">${esc(p.name)}</span>
        <button class="eye" data-eye="${p.id}" aria-label="Toggle visibility">${viewer.hidden.has(p.id) ? '◌' : '●'}</button></div>`;
    }).join('')}</div>`;
  }).join('');
}
$('parts-list').addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const eye = t.closest('[data-eye]') as HTMLElement | null;
  if (eye) { viewer.toggleHidden(eye.dataset.eye!); renderList(); return; }
  const it = t.closest('[data-id]') as HTMLElement | null;
  if (it) {
    const id = it.dataset.id!;
    showInfo(id);
    if (!viewer.isRemoved(id) && !viewer.hidden.has(id)) viewer.focus(id);
    if (window.innerWidth < 700) $('parts').classList.add('hidden');
  }
});
$('btn-parts').onclick = () => { $('parts').classList.toggle('hidden'); renderList(); };
$('parts-close').onclick = () => $('parts').classList.add('hidden');

// ---------------------------------------------------------------- reset
$('btn-reset').onclick = () => {
  viewer.setStep(0); viewer.setExplode(0); slider.value = '0'; $('explode-val').textContent = '0%';
  viewer.hidden.clear(); viewer.isolate(null); showInfo(null); viewer.resetView(); renderStep();
};

// ---------------------------------------------------------------- boot
viewer.start();
viewer.load(import.meta.env.BASE_URL, (f) => { $('load-text').textContent = `Loading parts… ${Math.round(f * 100)}%`; })
  .then(() => {
    $('loader').classList.add('done');
    renderStep();
    const q = new URLSearchParams(location.search);
    if (q.has('explode')) { const v = Math.max(0, Math.min(100, +q.get('explode')!)); slider.value = String(v); slider.dispatchEvent(new Event('input')); }
    if (q.has('step')) { viewer.setStep(Math.max(0, Math.min(N, +q.get('step')!))); renderStep(); }
    if (q.has('part')) showInfo(q.get('part'));
    if (q.has('isolate')) { viewer.isolate(q.get('isolate')); viewer.focus(q.get('isolate')!); }
    viewer.snap();
    // shareable camera: ?cam=x,y,z&target=x,y,z (engine mm)
    const v3 = (k: string) => (q.get(k) ?? '').split(',').map(Number);
    if (q.has('cam') && v3('cam').length === 3 && v3('cam').every(Number.isFinite)) {
      const vv = viewer as any; vv.camera.position.set(...v3('cam'));
      if (q.has('target') && v3('target').length === 3) vv.controls.target.set(...v3('target'));
      vv.controls.update(); vv.kick?.();
    }
    (window as any).__ready = true;
  })
  .catch((e) => { $('load-text').textContent = `Failed to load: ${e}`; console.error(e); });
