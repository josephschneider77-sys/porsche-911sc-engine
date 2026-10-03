import './style.css';
import { ENGINE_VARIANT } from './data/variant';
import { Viewer } from './app/viewer';
import { cameraFromQuery, viewFromQuery } from './app/queryCamera';
import { PARTS, PART_BY_ID } from './data/parts';
import { TEARDOWN, stepIndexOf } from './data/teardown';
import { SYSTEMS, SystemKey, design911Url, ILLUSTRATIONS } from './data/catalog';
import { IDLE_RPM, REDLINE_RPM, TACH_MAX_RPM, RED_ZONE_RPM } from './sim/drive';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const variantLabel = `Type ${ENGINE_VARIANT}`;
document.title = `911 SC 3.0 Engine — ${variantLabel} teardown`;
const variantEl = document.getElementById('variant-label');
if (variantEl) variantEl.textContent = `${variantLabel} · 2994 cc flat-six`;
document.querySelector('meta[name="description"]')?.setAttribute('content',
  `Interactive, disassemblable 3D model of the 1978 Porsche 911 SC 3.0 air-cooled flat-six (${variantLabel}, US).`);
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
// ---------------------------------------------------------------- run: pedal, tach, stop, emissions
const pedal = $('btn-pedal') as HTMLButtonElement;
function setPedal(down: boolean) {
  if (down && !viewer.engineRun.running) viewer.engineRun.start();
  viewer.engineRun.pedal = down && viewer.engineRun.running;
  pedal.classList.toggle('held', viewer.engineRun.pedal);
}
pedal.addEventListener('pointerdown', (e) => { e.preventDefault(); pedal.setPointerCapture(e.pointerId); setPedal(true); });
pedal.addEventListener('pointerup', () => setPedal(false));
pedal.addEventListener('pointercancel', () => setPedal(false));
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code !== 'Space' && e.code !== 'ArrowUp') return;
  const tag = (e.target as HTMLElement | null)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  e.preventDefault();
  setPedal(true);
});
window.addEventListener('keyup', (e) => {
  if (e.code !== 'Space' && e.code !== 'ArrowUp') return;
  setPedal(false);
});
$('btn-stop').onclick = () => { viewer.haltRun(); setPedal(false); paintTach(0); };
const emissions = $('emissions') as HTMLInputElement;
emissions.onchange = () => { viewer.setEmissions(emissions.checked); renderList(); };

const TACH_SWEEP = 270;
const TACH_START = -225;
function tachAngle(rpm: number) {
  const t = Math.max(0, Math.min(1, rpm / TACH_MAX_RPM));
  return TACH_START + t * TACH_SWEEP;
}
function polar(rpm: number, r: number) {
  const a = tachAngle(rpm) * Math.PI / 180;
  return [60 + r * Math.sin(a), 60 - r * Math.cos(a)];
}
(function drawTach() {
  const ticks = $('tach-ticks');
  for (let rpm = 0; rpm <= TACH_MAX_RPM; rpm += 500) {
    const major = rpm % 1000 === 0;
    const [x0, y0] = polar(rpm, major ? 40 : 44);
    const [x1, y1] = polar(rpm, 50);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x0.toFixed(2)); line.setAttribute('y1', y0.toFixed(2));
    line.setAttribute('x2', x1.toFixed(2)); line.setAttribute('y2', y1.toFixed(2));
    if (rpm >= RED_ZONE_RPM) line.setAttribute('stroke', '#ff4d2e');
    ticks.appendChild(line);
    if (major) {
      const [tx, ty] = polar(rpm, 32);
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', tx.toFixed(2)); label.setAttribute('y', (ty + 3).toFixed(2));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('fill', rpm >= RED_ZONE_RPM ? '#ff4d2e' : '#c8ccd2');
      label.setAttribute('font-size', '8');
      label.textContent = String(rpm / 1000);
      ticks.appendChild(label);
    }
  }
  const [ax, ay] = polar(RED_ZONE_RPM, 51);
  const [bx, by] = polar(TACH_MAX_RPM, 51);
  const large = TACH_SWEEP * (1 - RED_ZONE_RPM / TACH_MAX_RPM) > 180 ? 1 : 0;
  $('tach-red').setAttribute('d', `M ${ax.toFixed(2)} ${ay.toFixed(2)} A 51 51 0 ${large} 1 ${bx.toFixed(2)} ${by.toFixed(2)}`);
})();
function paintTach(rpm: number) {
  const a = tachAngle(rpm);
  $('tach-needle').setAttribute('transform', `rotate(${a.toFixed(2)} 60 60)`);
  $('tach-rpm').textContent = String(Math.round(rpm));
  $('tach').setAttribute('aria-label', `Tachometer ${Math.round(rpm)} rpm, idle ${IDLE_RPM}, redline ${REDLINE_RPM}`);
}
paintTach(0);
viewer.onFrame = (run) => paintTach(run.rpm);

const order: SystemKey[] = ['crankcase', 'crank', 'pistons', 'heads', 'valvetrain', 'camdrive', 'lubrication', 'cooling', 'induction', 'ignition', 'exhaust', 'clutch', 'hardware'];
function renderList() {
  const list = $('parts-list');
  if ($('parts').classList.contains('hidden')) return;
  $('parts-count').textContent = `${PARTS.length}`;
  list.innerHTML = order.map((sys) => {
    const items = PARTS.filter((p) => p.system === sys);
    if (!items.length) return '';
    const groups = [...new Set(items.map((p) => p.catalog[0].ill))].map((i) => ILLUSTRATIONS[i]?.ill ?? i).join(', ');
    return `<div class="grp"><div class="grp-head"><span>${esc(SYSTEMS[sys].label)}</span><small>Ill. ${esc(groups)}</small></div>${items.map((p) => {
      const off = viewer.hidden.has(p.id) || viewer.isRemoved(p.id) || viewer.emissionsHidden(p.id);
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
  viewer.haltRun(); setPedal(false); paintTach(0);
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
    const named = viewFromQuery(q.get('view'));
    if (named) { viewer.setStep(named.step); renderStep(); }
    if (q.has('part')) showInfo(q.get('part'));
    if (q.has('isolate')) { viewer.isolate(q.get('isolate')); viewer.focus(q.get('isolate')!); }
    // ?only=id,id hides every other part (assembled case-pair shots)
    if (q.has('only')) {
      const keep = new Set(q.get('only')!.split(',').map((s) => s.trim()).filter(Boolean));
      for (const id of viewer.nodes.keys()) if (!keep.has(id)) viewer.hidden.add(id);
    }
    if (q.get('emissions') === '1') { emissions.checked = true; viewer.setEmissions(true); }
    if (q.has('rpm')) viewer.engineRun.snapshot(Math.max(0, +q.get('rpm')!), q.has('crank') ? +q.get('crank')! : 40);
    else if (q.get('run') === '1') { viewer.engineRun.start(); if (q.has('crank')) viewer.engineRun.crankDeg = +q.get('crank')!; }
    if (viewer.rig && (q.get('run') === '1' || q.has('rpm'))) viewer.rig.pose(viewer.engineRun.crankDeg);
    paintTach(viewer.engineRun.rpm);
    viewer.snap();
    // ?cam= / ?target= win over step, explode and focus framing (including teardown step 27).
    const stepPose = {
      pos: viewer.camera.position.toArray() as [number, number, number],
      target: viewer.controls.target.toArray() as [number, number, number],
    };
    const pose = cameraFromQuery({ cam: q.get('cam'), target: q.get('target') }, stepPose);
    if (q.has('cam') && pose !== stepPose) viewer.lockQueryCamera(pose.pos, pose.target);
    else if (named) viewer.lockQueryCamera(named.pos, named.target);
    (window as any).__ready = true;
  })
  .catch((e) => { $('load-text').textContent = `Failed to load: ${e}`; console.error(e); });
