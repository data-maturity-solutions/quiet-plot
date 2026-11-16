import './styles.css';
import { DAY, faceFor, personaDef, type Link, type Persona, type PersonaMood, type Plant, type RippleItem } from '@plot/core';
import { api, type AppState } from './api';
import { bar, plantArt, STATE_WORDS } from './art';

const app = document.getElementById('app')!;
const toastEl = document.getElementById('toast')!;

type Drawer = { type: 'plant'; id: string } | { type: 'new'; personaId?: string; name?: string } | null;

let S: AppState | null = null;
let mode: 'above' | 'under' = 'above';
let drawer: Drawer = null;
let rippleFor: { id: string; items: RippleItem[] } | null = null;
let lastOutcome = '';
let busy = false;

const setup = {
  ready: false,
  picked: new Set(['organiser', 'heart', 'idler', 'tender']),
  names: {} as Record<string, string>,
  plants: new Set<string>(),
};

// ---------- helpers ----------

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]!);

let toastTimer = 0;
function toast(message: string) {
  if (!message) return;
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 3600);
}

async function run<T extends AppState>(fn: () => Promise<T>, after?: (result: T) => void) {
  if (busy) return;
  busy = true;
  try {
    const result = await fn();
    S = result;
    after?.(result);
    if (drawer?.type === 'plant' && !S.data.plants.some((p) => p.id === (drawer as { id: string }).id)) drawer = null;
    render();
    if (drawer?.type === 'plant') void loadRipple(drawer.id);
  } catch (err) {
    toast(err instanceof Error ? err.message : String(err));
  } finally {
    busy = false;
  }
}

async function loadRipple(id: string) {
  try {
    const items = await api.ripple(id);
    if (drawer?.type === 'plant' && drawer.id === id) {
      rippleFor = { id, items };
      render();
    }
  } catch {
    /* ripple is a nice-to-have */
  }
}

const persona = (id: string): Persona | undefined => S?.data.personas.find((p) => p.id === id);
const plant = (id: string): Plant | undefined => S?.data.plants.find((p) => p.id === id);
const colourOf = (personaId: string) => `var(--${personaDef(persona(personaId)?.key ?? '').colour})`;

function season(now: number) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  const south =
    /^(Australia|Antarctica)\//.test(tz) ||
    ['Pacific/Auckland', 'Pacific/Chatham', 'America/Santiago', 'America/Argentina', 'America/Sao_Paulo', 'America/Montevideo', 'Africa/Johannesburg'].some((p) => tz.startsWith(p));
  const month = new Date(now).getMonth();
  const north = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'][month]!;
  const flip: Record<string, string> = { winter: 'summer', summer: 'winter', spring: 'autumn', autumn: 'spring' };
  const phase = ['mid', 'late', 'early', 'mid', 'late', 'early', 'mid', 'late', 'early', 'mid', 'late', 'early'][month];
  return `${phase} ${south ? flip[north] : north}`;
}

function ago(t: number | null) {
  if (t === null || !S) return 'never';
  const d = Math.floor((S.view.now - t) / DAY);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
}

function rhythmText(days: number) {
  if (days === 1) return 'daily';
  if (days === 7) return 'weekly';
  if (days === 14) return 'fortnightly';
  if (days === 30) return 'monthly';
  return `every ${days} days`;
}

const MOOD_LINE: Record<PersonaMood, string> = {
  thriving: 'thriving',
  content: 'content',
  quiet: 'quiet · misses you',
  stretched: 'stretched thin',
  away: 'out exploring',
};

const KIND_LABEL = { perennial: 'ongoing', annual: 'one-off project', herb: 'recurring chore' } as const;

// ---------- render ----------

function render() {
  if (!S) {
    app.innerHTML = '<p class="loading">raking the soil…</p>';
    return;
  }
  if (!S.data.personas.length) {
    app.innerHTML = renderSetup(S);
    return;
  }
  app.innerHTML = renderGarden(S);
  requestAnimationFrame(drawRoots);
  if (drawer?.type === 'new') (app.querySelector('.drawer input[name="name"]') as HTMLInputElement | null)?.focus();
}

function renderSetup(s: AppState) {
  if (!setup.ready) {
    for (const def of s.cast) for (const p of def.starters) setup.plants.add(`${def.key}::${p.name}`);
    setup.ready = true;
  }
  const cards = s.cast
    .map((def) => {
      const on = setup.picked.has(def.key);
      const name = setup.names[def.key] ?? def.name;
      return `<article class="card cast-card ${on ? 'on' : ''}" style="--c:var(--${def.colour})">
        <label class="pick">
          <input type="checkbox" data-setup-persona="${def.key}" ${on ? 'checked' : ''}>
          <span class="face">${esc(faceFor(def.key, on ? 'thriving' : 'quiet'))}</span>
        </label>
        <input class="rename" data-setup-name="${def.key}" value="${esc(name)}" aria-label="Name for ${esc(def.name)}">
        <p class="muted small">looks after ${esc(def.caresAbout)}</p>
        <ul class="starters">${def.starters
          .map((p) => {
            const key = `${def.key}::${p.name}`;
            return `<li><label><input type="checkbox" data-setup-plant="${esc(key)}" ${setup.plants.has(key) ? 'checked' : ''} ${on ? '' : 'disabled'}>
              ${esc(p.name)} <span class="muted small">${KIND_LABEL[p.kind]}, ${rhythmText(p.rhythmDays)}</span></label></li>`;
          })
          .join('')}</ul>
      </article>`;
    })
    .join('');
  return `<main class="setup">
    <header class="setup-head">
      <h1 class="wordmark">a quiet plot</h1>
      <p>Your life as a small garden, looked after by the different sides of you.
      Pick the sides of you that live here, and keep the things each one looks after.</p>
    </header>
    <div class="cast">${cards}</div>
    <footer class="setup-foot">
      <button class="primary" data-action="setup">Plant the garden</button>
      <span class="muted small">${setup.picked.size} picked. You can rename, add and pull things up later.</span>
    </footer>
  </main>`;
}

function renderGarden(s: AppState) {
  const { view, data } = s;
  return `<div class="shell ${mode}">
    <header class="top">
      <div class="brand"><span class="wordmark">a quiet plot</span><span class="muted">day ${view.day} · ${season(view.now)}</span></div>
      <div class="seg" role="group" aria-label="View">
        <button data-action="mode" data-mode="above" aria-pressed="${mode === 'above'}">above ground</button>
        <button data-action="mode" data-mode="under" aria-pressed="${mode === 'under'}">underground</button>
      </div>
      <div class="dev" title="Prototype only: move time forward to see the garden change">
        <span class="muted small">dev clock${s.offsetDays ? ` +${s.offsetDays}d` : ''}</span>
        <button class="small" data-action="clock" data-days="1">+1 day</button>
        <button class="small" data-action="clock" data-days="7">+7 days</button>
        <button class="small ghost" data-action="reset">reset</button>
      </div>
    </header>
    <main class="layout">
      <section class="garden" id="garden" aria-label="Garden">
        <svg class="roots" id="roots" aria-hidden="true"></svg>
        <div class="patches">${data.personas.map(renderPatch).join('')}</div>
        ${mode === 'under' ? '<p class="hint muted small">Underground: numbers are health after roots. Pick a plant to see what it would drag down.</p>' : ''}
      </section>
      <aside class="side">
        ${renderGate(s)}
        ${renderScene(s)}
        ${renderBalance(s)}
        ${renderJournal(s)}
      </aside>
    </main>
    <form class="quick" data-form="quick">
      <span class="prompt" aria-hidden="true">&gt;</span>
      <input name="text" placeholder="called Mum, slept well, did the bills…" autocomplete="off" aria-label="Quick tend">
      <button>Tend</button>
      <button type="button" class="ghost" data-action="new">+ plant something</button>
    </form>
    ${drawer ? (drawer.type === 'plant' ? renderPlantDrawer(drawer.id) : renderNewDrawer(drawer)) : ''}
  </div>`;
}

function renderPatch(p: Persona) {
  const s = S!;
  const pv = s.view.personas[p.id];
  const plants = s.data.plants.filter((pl) => pl.personaId === p.id);
  return `<section class="patch mood-${pv?.mood ?? 'content'}" style="--c:${colourOf(p.id)}">
    <header class="patch-head">
      <span class="face" title="${pv?.mood ?? ''}">${esc(pv?.face ?? '')}</span>
      <div class="patch-who">
        <button class="pname linkish" data-action="rename" data-persona="${p.id}" title="Rename">${esc(p.name)}</button>
        <div class="muted small">${MOOD_LINE[pv?.mood ?? 'content']}</div>
      </div>
      <button class="ghost small add" data-action="new" data-persona="${p.id}" aria-label="Plant something for ${esc(p.name)}">+</button>
    </header>
    <div class="beds">${plants.map(renderPlant).join('') || '<p class="muted small empty">Nothing planted yet.</p>'}</div>
  </section>`;
}

function renderPlant(pl: Plant) {
  const v = S!.view.plants[pl.id];
  if (!v) return '';
  const r = rippleFor?.items.find((i) => i.plantId === pl.id);
  const selected = drawer?.type === 'plant' && drawer.id === pl.id;
  const second = pl.secondPersonaId ? persona(pl.secondPersonaId) : undefined;
  return `<button class="plant st-${v.state} ${selected ? 'selected' : ''}" data-action="open" data-plant="${pl.id}" data-anchor="${pl.id}"
      title="${esc(pl.name)}, ${STATE_WORDS[v.state]}${second ? `, shared with ${esc(second.name)}` : ''}">
    <pre class="art">${esc(plantArt(pl.kind, v.state))}</pre>
    <span class="label">${esc(pl.name)}</span>
    <span class="meta">${mode === 'under' ? `${v.effective}` : STATE_WORDS[v.state]}${second ? ' · shared' : ''}</span>
    ${r ? `<span class="delta ${r.delta > 0 ? 'up' : ''}">${r.delta > 0 ? '+' : ''}${r.delta}</span>` : ''}
    ${v.priorityUntil ? '<span class="flag" title="Moved up the gate">↑</span>' : ''}
  </button>`;
}

function renderGate(s: AppState) {
  const asks = s.view.gate
    .map((a) => {
      const who = persona(a.personaId);
      const pv = s.view.personas[a.personaId];
      return `<div class="ask" style="--c:${colourOf(a.personaId)}">
        <span class="face">${esc(pv?.face ?? '')}</span>
        <div class="ask-body">
          <div class="who small">${esc(who?.name ?? '')}</div>
          <p>${esc(a.text)}</p>
          <div class="row">
            <button class="primary small" data-action="ask-yes" data-plant="${a.plantId}">Yes</button>
            <button class="small" data-action="ask-later" data-plant="${a.plantId}">Not yet</button>
          </div>
        </div>
      </div>`;
    })
    .join('');
  return `<section class="card gate"><h2>at the gate</h2>${asks || '<p class="muted small">Nobody at the gate. Everything can wait.</p>'}</section>`;
}

function renderScene(s: AppState) {
  const scene = s.view.scene;
  if (!scene) {
    return lastOutcome ? `<section class="card scene"><h2>in the garden</h2><p class="muted small">${esc(lastOutcome)}</p></section>` : '';
  }
  const lines = scene.lines
    .map((l) => {
      const who = persona(l.personaId);
      return `<p class="line" style="--c:${colourOf(l.personaId)}"><span class="face">${esc(s.view.personas[l.personaId]?.face ?? '')}</span>
        <span><span class="who">${esc(who?.name ?? '')}</span> ${esc(l.text)}</span></p>`;
    })
    .join('');
  const choices = scene.choices
    .map((c, i) => `<button class="${i === 0 ? 'primary' : ''} small" data-action="scene" data-scene="${esc(scene.id)}" data-choice="${c.id}">${esc(c.label)}</button>`)
    .join('');
  return `<section class="card scene"><h2>in the garden this evening</h2>${lines}<div class="choices">${choices}</div></section>`;
}

function renderBalance(s: AppState) {
  const rows = s.data.personas
    .map((p) => {
      const pv = s.view.personas[p.id];
      return `<div class="bal" style="--c:${colourOf(p.id)}">
        <span class="face">${esc(pv?.face ?? '')}</span>
        <span class="bal-name small">${esc(p.name)}</span>
        <span class="bal-bar">${bar(Math.min(100, (pv?.share ?? 0) * 50), 8)}</span>
      </div>`;
    })
    .join('');
  return `<section class="card"><h2>balance · last 7 days</h2>${rows}<p class="muted small">Middle of the bar is a fair share.</p></section>`;
}

function renderJournal(s: AppState) {
  const items = s.journal
    .slice(0, 6)
    .map((e) => `<li><span class="muted small">${new Date(e.at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span> ✿ ${esc(e.text)}</li>`)
    .join('');
  return `<section class="card"><h2>pressed flowers</h2>${items ? `<ul class="journal">${items}</ul>` : '<p class="muted small">Good moments get pressed here.</p>'}</section>`;
}

function rootItem(l: Link, here: Plant) {
  const outgoing = l.fromId === here.id;
  const other = plant(outgoing ? l.toId : l.fromId);
  const verb = l.sign > 0 ? 'helps' : 'competes with';
  const strength = '•'.repeat(l.strength);
  const text = outgoing ? `this ${verb} <b>${esc(other?.name ?? '?')}</b>` : `<b>${esc(other?.name ?? '?')}</b> ${verb} this`;
  return `<li class="${l.sign > 0 ? 'pos' : 'neg'}"><span>${text} <span class="muted small">${strength}</span></span>
    <button class="ghost small" data-action="unlink" data-link="${l.id}" aria-label="Remove root">×</button></li>`;
}

function renderPlantDrawer(id: string) {
  const s = S!;
  const pl = plant(id);
  const v = s.view.plants[id];
  if (!pl || !v) return '';
  const owner = persona(pl.personaId);
  const roots = s.data.links.filter((l) => l.fromId === id || l.toId === id);
  const others = s.data.plants.filter((p) => p.id !== id);
  const waterLabel = pl.kind === 'herb' ? 'Done' : pl.kind === 'annual' ? 'Worked on it' : 'Water · I did this';
  const diff = v.effective - v.vitality;
  const ripple = rippleFor?.id === id ? rippleFor.items : null;
  const personaOptions = (selected: string | null, allowNone: boolean) =>
    (allowNone ? `<option value="">nobody</option>` : '') +
    s.data.personas.map((p) => `<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${esc(p.name)}</option>`).join('');

  return `<aside class="drawer" style="--c:${colourOf(pl.personaId)}" aria-label="${esc(pl.name)}">
    <div class="drawer-head">
      <span class="muted small">${esc(owner?.name ?? '')} · ${KIND_LABEL[pl.kind]}</span>
      <button class="ghost" data-action="close" aria-label="Close">×</button>
    </div>
    <pre class="art big st-${v.state}">${esc(plantArt(pl.kind, v.state))}</pre>
    <h2 class="drawer-title">${esc(pl.name)}</h2>
    <p class="status st-${v.state}">${STATE_WORDS[v.state]} · tended ${ago(v.lastTendedAt)} · ${rhythmText(pl.rhythmDays)}</p>
    <p class="meter">[${bar(v.effective)}] ${v.effective}%
      <span class="muted small">own ${v.vitality}${diff ? `, roots ${diff > 0 ? '+' : ''}${diff}` : ''}</span></p>
    ${
      v.status === 'harvested'
        ? '<p class="muted">Harvested. Pull it up whenever you like.</p>'
        : `<button class="primary wide" data-action="water" data-plant="${id}">${waterLabel}</button>
      <div class="label-sm">How's it going? (optional)</div>
      <div class="chips">
        <button data-action="checkin" data-plant="${id}" data-value="2">Thriving</button>
        <button data-action="checkin" data-plant="${id}" data-value="1">Okay</button>
        <button data-action="checkin" data-plant="${id}" data-value="0">Struggling</button>
      </div>
      <div class="row">
        <button class="small" data-action="snooze" data-plant="${id}">Snooze 2 days</button>
        ${v.status === 'fallow' ? `<button class="small" data-action="unfallow" data-plant="${id}">Wake it up</button>` : `<button class="small" data-action="fallow" data-plant="${id}">Let it rest</button>`}
        ${pl.kind === 'annual' ? `<button class="small" data-action="harvest" data-plant="${id}">Harvest · done</button>` : ''}
      </div>`
    }
    <h3>roots</h3>
    <ul class="roots-list">${roots.map((l) => rootItem(l, pl)).join('') || '<li class="muted small">No roots yet.</li>'}</ul>
    ${
      others.length
        ? `<form class="root-form" data-form="link" data-plant="${id}">
      <span class="small">this</span>
      <select name="sign" aria-label="Effect"><option value="1">helps</option><option value="-1">competes with</option></select>
      <select name="to" aria-label="Other plant">${others.map((o) => `<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select>
      <select name="strength" aria-label="Strength"><option value="1">a little</option><option value="2">quite a bit</option><option value="3">a lot</option></select>
      <button class="small">Add root</button>
    </form>`
        : ''
    }
    <h3>if this keeps wilting</h3>
    ${
      ripple === null
        ? '<p class="muted small">Looking underground…</p>'
        : ripple.length
          ? `<ul class="ripple">${ripple
              .slice(0, 6)
              .map((r) => `<li><span>${esc(plant(r.plantId)?.name ?? '?')}</span><span class="${r.delta < 0 ? 'neg' : 'pos'}">${r.delta > 0 ? '+' : ''}${r.delta}</span></li>`)
              .join('')}</ul>`
          : '<p class="muted small">Nothing else would notice.</p>'
    }
    <details class="edit">
      <summary>details</summary>
      <form data-form="edit" data-plant="${id}" class="stack">
        <label>Name <input name="name" value="${esc(pl.name)}" maxlength="60"></label>
        <label>Kind <select name="kind">${(['perennial', 'annual', 'herb'] as const)
          .map((k) => `<option value="${k}" ${k === pl.kind ? 'selected' : ''}>${KIND_LABEL[k]}</option>`)
          .join('')}</select></label>
        <label>Every how many days <input name="rhythmDays" type="number" min="0.5" max="365" step="0.5" value="${pl.rhythmDays}"></label>
        <label>Importance <select name="importance">${[1, 2, 3]
          .map((n) => `<option value="${n}" ${n === pl.importance ? 'selected' : ''}>${['', 'nice to have', 'matters', 'matters a lot'][n]}</option>`)
          .join('')}</select></label>
        <label>Belongs to <select name="personaId">${personaOptions(pl.personaId, false)}</select></label>
        <label>Shared with <select name="secondPersonaId">${personaOptions(pl.secondPersonaId, true)}</select></label>
        <button class="small">Save</button>
      </form>
    </details>
    <button class="ghost danger small" data-action="delete" data-plant="${id}">Pull it up</button>
  </aside>`;
}

function renderNewDrawer(d: { personaId?: string; name?: string }) {
  const s = S!;
  const pid = d.personaId ?? s.data.personas[0]?.id ?? '';
  return `<aside class="drawer" style="--c:${colourOf(pid)}" aria-label="Plant something">
    <div class="drawer-head"><span class="muted small">new plant</span><button class="ghost" data-action="close" aria-label="Close">×</button></div>
    <pre class="art big st-healthy">${esc(['     ', '     ', '  ,  ', '─────'].join('\n'))}</pre>
    <form data-form="new" class="stack">
      <label>What do you want to look after? <input name="name" required maxlength="60" value="${esc(d.name ?? '')}" placeholder="call Grandad, the garden shed, Spanish"></label>
      <label>Who looks after it <select name="personaId">${s.data.personas
        .map((p) => `<option value="${p.id}" ${p.id === pid ? 'selected' : ''}>${esc(p.name)}</option>`)
        .join('')}</select></label>
      <label>Kind <select name="kind">
        <option value="perennial">ongoing (a habit, a person, your health)</option>
        <option value="annual">one-off project (harvest when done)</option>
        <option value="herb">recurring chore (regrows after you do it)</option>
      </select></label>
      <label>Every how many days <input name="rhythmDays" type="number" min="0.5" max="365" step="0.5" value="7"></label>
      <label>Importance <select name="importance"><option value="1">nice to have</option><option value="2" selected>matters</option><option value="3">matters a lot</option></select></label>
      <button class="primary">Plant it</button>
    </form>
  </aside>`;
}

// ---------- roots overlay ----------

function drawRoots() {
  const svg = document.getElementById('roots') as SVGSVGElement | null;
  const garden = document.getElementById('garden');
  if (!svg || !garden || !S) return;
  const box = garden.getBoundingClientRect();
  svg.setAttribute('width', String(garden.scrollWidth));
  svg.setAttribute('height', String(garden.scrollHeight));
  const anchor = (id: string) => {
    const el = garden.querySelector(`[data-anchor="${id}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left - box.left + garden.scrollLeft + r.width / 2, y: r.bottom - box.top + garden.scrollTop - 4 };
  };
  const focus = drawer?.type === 'plant' ? drawer.id : null;
  const paths = S.data.links
    .map((l) => {
      const a = anchor(l.fromId);
      const b = anchor(l.toId);
      if (!a || !b) return '';
      const drop = 18 + Math.hypot(b.x - a.x, b.y - a.y) * 0.12;
      const d = `M${a.x},${a.y} C${a.x},${a.y + drop} ${b.x},${b.y + drop} ${b.x},${b.y}`;
      const hot = focus && (l.fromId === focus || l.toId === focus) ? 'hot' : '';
      const cls = `root ${l.sign > 0 ? 'pos' : 'neg'} ${hot}`;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + drop * 0.75 };
      const label =
        mode === 'under'
          ? `<text class="root-sign ${l.sign > 0 ? 'pos' : 'neg'}" x="${mid.x}" y="${mid.y}" text-anchor="middle" dominant-baseline="middle">${l.sign > 0 ? '+' : '−'}</text>`
          : '';
      return `<path class="${cls}" d="${d}" stroke-width="${0.6 + l.strength * 0.7}" marker-end="url(#arrow-${l.sign > 0 ? 'pos' : 'neg'})"/>${label}`;
    })
    .join('');
  svg.innerHTML = `<defs>
      <marker id="arrow-pos" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" class="arrow pos"/></marker>
      <marker id="arrow-neg" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" class="arrow neg"/></marker>
    </defs>${paths}`;
}

window.addEventListener('resize', () => requestAnimationFrame(drawRoots));

// ---------- events ----------

const EVENT_TOASTS: Record<string, string> = {
  water: 'Watered.',
  checkin: 'Noted.',
  snooze: 'Snoozed for two days.',
  fallow: 'Resting. It will not dry out while it rests.',
  unfallow: 'Awake again.',
  harvest: 'Harvested. Nicely done.',
};

app.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!el || !S) return;
  const { action, plant: plantId = '', persona: personaId } = el.dataset;
  switch (action) {
    case 'mode':
      mode = el.dataset.mode === 'under' ? 'under' : 'above';
      render();
      break;
    case 'clock': {
      const days = Number(el.dataset.days);
      void run(() => api.clock(days), () => toast(days === 1 ? 'A day passes.' : `${days} days pass.`));
      break;
    }
    case 'reset':
      if (confirm('Clear the whole garden and start again? This cannot be undone.')) {
        drawer = null;
        rippleFor = null;
        lastOutcome = '';
        void run(() => api.reset());
      }
      break;
    case 'open':
      drawer = { type: 'plant', id: plantId };
      rippleFor = null;
      render();
      void loadRipple(plantId);
      break;
    case 'close':
      drawer = null;
      rippleFor = null;
      render();
      break;
    case 'new':
      drawer = { type: 'new', personaId };
      rippleFor = null;
      render();
      break;
    case 'water':
    case 'checkin':
    case 'snooze':
    case 'fallow':
    case 'unfallow':
    case 'harvest': {
      const value = action === 'checkin' ? Number(el.dataset.value) : action === 'snooze' ? 2 : undefined;
      void run(() => api.event(plantId, action, value), () => toast(EVENT_TOASTS[action] ?? ''));
      break;
    }
    case 'ask-yes': {
      const p = plant(plantId);
      const who = p ? persona(p.personaId) : undefined;
      void run(() => api.event(plantId, 'water'), () => toast(`${p?.name ?? 'Done'}. ${who ? `${cap(who.name)} perks up.` : ''}`));
      break;
    }
    case 'ask-later':
      void run(() => api.event(plantId, 'snooze', 1), () => toast('Tomorrow, then.'));
      break;
    case 'scene':
      void run(
        () => api.scene(el.dataset.scene ?? '', el.dataset.choice ?? ''),
        (r) => {
          lastOutcome = r.outcome;
          toast(r.outcome);
        },
      );
      break;
    case 'unlink':
      void run(() => api.deleteLink(el.dataset.link ?? ''));
      break;
    case 'delete': {
      const p = plant(plantId);
      if (p && confirm(`Pull up "${p.name}"? Its history goes with it. This cannot be undone.`)) {
        drawer = null;
        rippleFor = null;
        void run(() => api.deletePlant(plantId), () => toast(`Pulled up ${p.name}.`));
      }
      break;
    }
    case 'rename': {
      const p = personaId ? persona(personaId) : undefined;
      const name = p ? prompt('Rename this side of you', p.name) : null;
      if (p && name?.trim()) void run(() => api.renamePersona(p.id, name.trim()));
      break;
    }
    case 'setup': {
      const personas = [...setup.picked].map((key) => ({ key, name: setup.names[key] }));
      if (!personas.length) {
        toast('Pick at least one side of you.');
        break;
      }
      const plants = S.cast
        .filter((def) => setup.picked.has(def.key))
        .flatMap((def) => def.starters.filter((p) => setup.plants.has(`${def.key}::${p.name}`)).map((p) => ({ personaKey: def.key, ...p })));
      void run(() => api.setup({ personas, plants }), () => toast('Planted. Come back tomorrow, or skip a day with the dev clock.'));
      break;
    }
  }
});

app.addEventListener('change', (e) => {
  const el = e.target as HTMLInputElement;
  if (el.dataset.setupPersona) {
    if (el.checked) setup.picked.add(el.dataset.setupPersona);
    else setup.picked.delete(el.dataset.setupPersona);
    render();
  } else if (el.dataset.setupPlant) {
    if (el.checked) setup.plants.add(el.dataset.setupPlant);
    else setup.plants.delete(el.dataset.setupPlant);
  }
});

app.addEventListener('input', (e) => {
  const el = e.target as HTMLInputElement;
  if (el.dataset.setupName) setup.names[el.dataset.setupName] = el.value;
});

app.addEventListener('submit', (e) => {
  const form = e.target as HTMLFormElement;
  const kind = form.dataset.form;
  if (!kind || !S) return;
  e.preventDefault();
  const f = Object.fromEntries(new FormData(form)) as Record<string, string>;
  const plantId = form.dataset.plant ?? '';
  switch (kind) {
    case 'quick': {
      const text = (f.text ?? '').trim();
      if (!text) return;
      void run(
        () => api.quick(text),
        (r) => {
          const parts: string[] = [];
          if (r.matched.length) parts.push(`Tended: ${r.matched.map((m) => m.name).join(', ')}.`);
          if (r.unmatched.length) {
            parts.push(`Couldn't place "${r.unmatched[0]}". Plant it?`);
            drawer = { type: 'new', name: r.unmatched[0] };
          }
          toast(parts.join(' '));
        },
      );
      break;
    }
    case 'link':
      void run(() => api.addLink({ fromId: plantId, toId: f.to, sign: Number(f.sign), strength: Number(f.strength) }), () => toast('Root laid.'));
      break;
    case 'edit':
      void run(
        () =>
          api.updatePlant(plantId, {
            name: f.name,
            kind: f.kind,
            rhythmDays: Number(f.rhythmDays),
            importance: Number(f.importance),
            personaId: f.personaId,
            secondPersonaId: f.secondPersonaId || null,
          }),
        () => toast('Saved.'),
      );
      break;
    case 'new':
      void run(
        () => api.addPlant({ ...f, rhythmDays: Number(f.rhythmDays), importance: Number(f.importance) }),
        () => {
          toast(`Planted ${f.name}.`);
          drawer = null;
        },
      );
      break;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && drawer) {
    drawer = null;
    rippleFor = null;
    render();
  }
});

function cap(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

api
  .state()
  .then((s) => {
    S = s;
    render();
  })
  .catch((err) => {
    app.innerHTML = `<p class="loading">Couldn't reach the server. Is it running? (${esc(String(err.message ?? err))})</p>`;
  });
