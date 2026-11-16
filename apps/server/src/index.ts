import { randomUUID } from 'node:crypto';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import {
  CAST,
  DAY,
  STARTER_LINKS,
  computeView,
  matchPhrases,
  ripple,
  type EventType,
  type Plant,
  type PlantKind,
} from '@plot/core';
import { DB_PATH, db, getSetting, insert, loadGarden, loadJournal, setSetting, transaction } from './db';

const app = new Hono();
const id = () => randomUUID().slice(0, 8);

const offsetDays = () => Number(getSetting('offset_days') ?? 0);
const now = () => Date.now() + offsetDays() * DAY;
const sceneDoneDay = () => {
  const v = getSetting('scene_done_day');
  return v === null ? null : Number(v);
};

const KINDS: PlantKind[] = ['perennial', 'annual', 'herb'];
const EVENT_TYPES: EventType[] = ['water', 'checkin', 'snooze', 'priority', 'fallow', 'unfallow', 'harvest'];

function state() {
  const data = loadGarden();
  const t = now();
  return { data, view: computeView(data, t, sceneDoneDay()), journal: loadJournal(), offsetDays: offsetDays(), cast: CAST };
}

function cleanPlant(input: Record<string, unknown>, fallback?: Plant) {
  const name = String(input.name ?? fallback?.name ?? '').trim().slice(0, 60);
  const kind = KINDS.includes(input.kind as PlantKind) ? (input.kind as PlantKind) : fallback?.kind ?? 'perennial';
  const rhythmDays = Math.min(365, Math.max(0.5, Number(input.rhythmDays ?? fallback?.rhythmDays ?? 7) || 7));
  const importance = Math.min(3, Math.max(1, Math.round(Number(input.importance ?? fallback?.importance ?? 2) || 2)));
  return { name, kind, rhythmDays, importance };
}

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message }, 500);
});

app.get('/api/state', (c) => c.json(state()));

app.post('/api/setup', async (c) => {
  const body = (await c.req.json()) as {
    personas: { key: string; name?: string }[];
    plants: { personaKey: string; name: string; kind: PlantKind; rhythmDays: number; importance: number }[];
  };
  if (!body.personas?.length) return c.json({ error: 'Pick at least one persona' }, 400);
  const t = now();
  transaction(() => {
    const byKey = new Map<string, string>();
    for (const p of body.personas) {
      const def = CAST.find((d) => d.key === p.key);
      if (!def || byKey.has(p.key)) continue;
      const pid = id();
      byKey.set(p.key, pid);
      insert.persona({ id: pid, key: p.key, name: (p.name ?? def.name).trim() || def.name, createdAt: t });
    }
    const byName = new Map<string, string>();
    for (const raw of body.plants ?? []) {
      const personaId = byKey.get(raw.personaKey);
      const clean = cleanPlant(raw as unknown as Record<string, unknown>);
      if (!personaId || !clean.name) continue;
      const plantId = id();
      byName.set(clean.name.toLowerCase(), plantId);
      insert.plant({ id: plantId, personaId, secondPersonaId: null, createdAt: t, ...clean });
    }
    for (const l of STARTER_LINKS) {
      const fromId = byName.get(l.from);
      const toId = byName.get(l.to);
      if (fromId && toId) insert.link({ id: id(), fromId, toId, sign: l.sign, strength: l.strength });
    }
  });
  return c.json(state());
});

app.patch('/api/personas/:id', async (c) => {
  const body = (await c.req.json()) as { name?: string };
  const name = String(body.name ?? '').trim().slice(0, 40);
  if (name) db.prepare('UPDATE personas SET name = ? WHERE id = ?').run(name, c.req.param('id'));
  return c.json(state());
});

app.post('/api/plants', async (c) => {
  const body = (await c.req.json()) as Record<string, unknown>;
  const clean = cleanPlant(body);
  const personaId = String(body.personaId ?? '');
  if (!clean.name) return c.json({ error: 'Give the plant a name' }, 400);
  if (!db.prepare('SELECT 1 FROM personas WHERE id = ?').get(personaId)) return c.json({ error: 'Unknown persona' }, 400);
  const second = body.secondPersonaId ? String(body.secondPersonaId) : null;
  insert.plant({ id: id(), personaId, secondPersonaId: second && second !== personaId ? second : null, createdAt: now(), ...clean });
  return c.json(state());
});

app.patch('/api/plants/:id', async (c) => {
  const plant = loadGarden().plants.find((p) => p.id === c.req.param('id'));
  if (!plant) return c.json({ error: 'Plant not found' }, 404);
  const body = (await c.req.json()) as Record<string, unknown>;
  const clean = cleanPlant(body, plant);
  const personaId = body.personaId ? String(body.personaId) : plant.personaId;
  const second =
    'secondPersonaId' in body ? (body.secondPersonaId ? String(body.secondPersonaId) : null) : plant.secondPersonaId;
  db.prepare(
    'UPDATE plants SET name = ?, kind = ?, rhythm_days = ?, importance = ?, persona_id = ?, second_persona_id = ? WHERE id = ?',
  ).run(clean.name || plant.name, clean.kind, clean.rhythmDays, clean.importance, personaId, second === personaId ? null : second, plant.id);
  return c.json(state());
});

app.delete('/api/plants/:id', (c) => {
  db.prepare('DELETE FROM plants WHERE id = ?').run(c.req.param('id'));
  return c.json(state());
});

app.post('/api/links', async (c) => {
  const body = (await c.req.json()) as { fromId: string; toId: string; sign: number; strength: number };
  if (!body.fromId || !body.toId || body.fromId === body.toId) return c.json({ error: 'Pick two different plants' }, 400);
  insert.link({
    id: id(),
    fromId: body.fromId,
    toId: body.toId,
    sign: body.sign === -1 ? -1 : 1,
    strength: Math.min(3, Math.max(1, Math.round(body.strength || 1))),
  });
  return c.json(state());
});

app.delete('/api/links/:id', (c) => {
  db.prepare('DELETE FROM links WHERE id = ?').run(c.req.param('id'));
  return c.json(state());
});

app.post('/api/events', async (c) => {
  const body = (await c.req.json()) as { plantId: string; type: EventType; value?: number };
  if (!EVENT_TYPES.includes(body.type)) return c.json({ error: 'Unknown event' }, 400);
  if (!db.prepare('SELECT 1 FROM plants WHERE id = ?').get(body.plantId)) return c.json({ error: 'Plant not found' }, 404);
  insert.event(body.plantId, body.type, body.value ?? null, now());
  return c.json(state());
});

app.get('/api/ripple/:id', (c) => c.json(ripple(loadGarden(), c.req.param('id'), now())));

app.post('/api/scene', async (c) => {
  const body = (await c.req.json()) as { sceneId: string; choiceId: string };
  const t = now();
  const view = computeView(loadGarden(), t, sceneDoneDay());
  if (!view.scene || view.scene.id !== body.sceneId) return c.json({ error: 'That scene has passed' }, 409);
  const choice = view.scene.choices.find((ch) => ch.id === body.choiceId);
  if (!choice) return c.json({ error: 'Unknown choice' }, 400);
  transaction(() => {
    for (const effect of choice.effects) {
      if (effect.type === 'press') insert.journal(effect.text, t);
      else for (const plantId of effect.plantIds) insert.event(plantId, effect.type, effect.days, t);
    }
    setSetting('scene_done_day', String(Math.floor(t / DAY)));
  });
  return c.json({ ...state(), outcome: choice.outcome });
});

app.post('/api/quick', async (c) => {
  const body = (await c.req.json()) as { text: string };
  const data = loadGarden();
  const view = computeView(data, now());
  const candidates = data.plants.filter((p) => view.plants[p.id]?.status !== 'harvested');
  const results = matchPhrases(String(body.text ?? '').slice(0, 300), candidates);
  const t = now();
  transaction(() => {
    for (const r of results) if (r.plant) insert.event(r.plant.id, 'water', null, t);
  });
  return c.json({
    ...state(),
    matched: results.filter((r) => r.plant).map((r) => ({ phrase: r.phrase, plantId: r.plant!.id, name: r.plant!.name })),
    unmatched: results.filter((r) => !r.plant).map((r) => r.phrase),
  });
});

app.post('/api/clock', async (c) => {
  const body = (await c.req.json()) as { days: number };
  const days = Math.max(-365, Math.min(365, Number(body.days) || 0));
  setSetting('offset_days', String(offsetDays() + days));
  return c.json(state());
});

app.post('/api/reset', (c) => {
  transaction(() => {
    db.exec('DELETE FROM events; DELETE FROM links; DELETE FROM plants; DELETE FROM personas; DELETE FROM journal; DELETE FROM settings;');
  });
  return c.json(state());
});

// Deliberately not PORT: dev tooling often sets that for the web server.
const port = Number(process.env.PLOT_API_PORT ?? 403);
serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, () => {
  console.log(`quiet plot server on http://127.0.0.1:${port} (db: ${DB_PATH})`);
});
