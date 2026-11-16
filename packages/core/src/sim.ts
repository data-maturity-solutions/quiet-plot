import { faceFor, personaDef } from './personas';
import { pickScene } from './scenes';
import {
  DAY,
  type Ask,
  type GardenData,
  type GardenView,
  type Link,
  type PersonaMood,
  type PersonaView,
  type Plant,
  type PlantState,
  type PlantStatus,
  type PlantView,
  type PlotEvent,
  type RippleItem,
} from './types';

export const RULES = {
  startVitality: 60,
  decayPerRhythm: 25,
  waterBoost: 35,
  floor: 5,
  spreadFactor: 0.12,
  spreadRounds: 2,
  balanceWindowDays: 7,
  awayAfterDays: 10,
  gateSize: 3,
  gateMinScore: 15,
};

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface PlantSnapshot {
  vitality: number;
  status: PlantStatus;
  snoozedUntil: number | null;
  priorityUntil: number | null;
  lastTendedAt: number | null;
}

/** Replays a plant's events (any order) up to `now` and returns its own vitality, before roots. */
export function replayPlant(plant: Plant, events: PlotEvent[], now: number): PlantSnapshot {
  const sorted = events
    .filter((e) => e.plantId === plant.id && e.at <= now)
    .sort((a, b) => a.at - b.at || a.id - b.id);

  let v = RULES.startVitality;
  let t = plant.createdAt;
  let status: PlantStatus = 'active';
  let snoozedUntil: number | null = null;
  let priorityUntil: number | null = null;
  let lastTendedAt: number | null = null;

  const decayTo = (until: number) => {
    if (status === 'active' && until > t) {
      const days = (until - t) / DAY;
      v = Math.max(RULES.floor, v - (days / Math.max(plant.rhythmDays, 0.25)) * RULES.decayPerRhythm);
    }
    t = Math.max(t, until);
  };

  for (const e of sorted) {
    decayTo(e.at);
    switch (e.type) {
      case 'water':
        v = plant.kind === 'herb' ? 100 : Math.min(100, v + RULES.waterBoost);
        lastTendedAt = e.at;
        if (status === 'fallow') status = 'active';
        break;
      case 'checkin':
        if (e.value === 2) v = Math.max(v, 85);
        else if (e.value === 1) v = Math.max(v, 55);
        else v = Math.min(v, 30);
        lastTendedAt = e.at;
        break;
      case 'snooze':
        snoozedUntil = e.at + (e.value ?? 1) * DAY;
        break;
      case 'priority':
        priorityUntil = e.at + (e.value ?? 3) * DAY;
        break;
      case 'fallow':
        if (status === 'active') status = 'fallow';
        break;
      case 'unfallow':
        if (status === 'fallow') status = 'active';
        break;
      case 'harvest':
        status = 'harvested';
        v = 100;
        lastTendedAt = e.at;
        break;
    }
  }
  decayTo(now);

  return {
    vitality: v,
    status,
    snoozedUntil: snoozedUntil !== null && snoozedUntil > now ? snoozedUntil : null,
    priorityUntil: priorityUntil !== null && priorityUntil > now ? priorityUntil : null,
    lastTendedAt,
  };
}

/** Spreads influence along roots. Paused or finished plants act as neutral (50). */
export function spread(base: Map<string, number>, links: Link[], neutral: Set<string> = new Set()) {
  let current = new Map(base);
  for (let round = 0; round < RULES.spreadRounds; round++) {
    const next = new Map(base);
    for (const link of links) {
      const from = neutral.has(link.fromId) ? 50 : current.get(link.fromId);
      const to = next.get(link.toId);
      if (from === undefined || to === undefined) continue;
      next.set(link.toId, to + link.sign * link.strength * RULES.spreadFactor * (from - 50));
    }
    for (const [id, value] of next) next.set(id, clamp(value, 0, 100));
    current = next;
  }
  return current;
}

export function stateOf(effective: number, status: PlantStatus): PlantState {
  if (status === 'fallow') return 'fallow';
  if (status === 'harvested') return 'harvested';
  if (effective >= 80) return 'blooming';
  if (effective >= 55) return 'healthy';
  if (effective >= 35) return 'dry';
  return 'wilting';
}

function snapshots(data: GardenData, now: number) {
  const snaps = new Map<string, PlantSnapshot>();
  for (const plant of data.plants) {
    if (plant.createdAt <= now) snaps.set(plant.id, replayPlant(plant, data.events, now));
  }
  const base = new Map<string, number>();
  const neutral = new Set<string>();
  for (const [id, s] of snaps) {
    base.set(id, s.vitality);
    if (s.status !== 'active') neutral.add(id);
  }
  return { snaps, base, neutral };
}

/**
 * What this plant wilting costs everything else: the plant at 10 compared with it at a healthy
 * baseline (60, or its current value if higher). Already-wilting plants show what they drag down now.
 */
export function ripple(data: GardenData, plantId: string, now: number): RippleItem[] {
  const { base, neutral } = snapshots(data, now);
  const current = base.get(plantId);
  if (current === undefined) return [];
  const healthy = new Map(base).set(plantId, Math.max(current, RULES.startVitality));
  const before = spread(healthy, data.links, neutral);
  const worse = new Map(base).set(plantId, 10);
  const after = spread(worse, data.links, neutral);
  const items: RippleItem[] = [];
  for (const [id, value] of after) {
    if (id === plantId || neutral.has(id)) continue;
    const delta = Math.round(value - (before.get(id) ?? value));
    if (delta !== 0) items.push({ plantId: id, delta });
  }
  return items.sort((a, b) => a.delta - b.delta);
}

function ownerWeights(plant: Plant): [string, number][] {
  return plant.secondPersonaId
    ? [[plant.personaId, 0.6], [plant.secondPersonaId, 0.4]]
    : [[plant.personaId, 1]];
}

export function computeView(data: GardenData, now: number, sceneDoneDayKey: number | null = null): GardenView {
  const { snaps, base, neutral } = snapshots(data, now);
  const effective = spread(base, data.links, neutral);
  const plantById = new Map(data.plants.map((p) => [p.id, p]));

  const plants: Record<string, PlantView> = {};
  for (const [id, s] of snaps) {
    const eff = effective.get(id) ?? s.vitality;
    plants[id] = {
      id,
      vitality: Math.round(s.vitality),
      effective: Math.round(eff),
      state: stateOf(eff, s.status),
      status: s.status,
      snoozedUntil: s.snoozedUntil,
      priorityUntil: s.priorityUntil,
      lastTendedAt: s.lastTendedAt,
    };
  }

  // Balance: share of recent tending per persona.
  const windowStart = now - RULES.balanceWindowDays * DAY;
  const tended = new Map<string, number>(data.personas.map((p) => [p.id, 0]));
  const lastTended = new Map<string, number>();
  for (const e of data.events) {
    if (e.at > now || (e.type !== 'water' && e.type !== 'checkin' && e.type !== 'harvest')) continue;
    const plant = plantById.get(e.plantId);
    if (!plant) continue;
    for (const [pid, w] of ownerWeights(plant)) {
      if (e.at >= windowStart) tended.set(pid, (tended.get(pid) ?? 0) + w);
      lastTended.set(pid, Math.max(lastTended.get(pid) ?? 0, e.at));
    }
  }
  const total = [...tended.values()].reduce((a, b) => a + b, 0);
  const fair = data.personas.length ? total / data.personas.length : 0;

  const personas: Record<string, PersonaView> = {};
  for (const persona of data.personas) {
    const own = data.plants.filter(
      (p) => (p.personaId === persona.id || p.secondPersonaId === persona.id) && plants[p.id]?.status === 'active',
    );
    const avg = own.length ? own.reduce((a, p) => a + (plants[p.id]?.effective ?? 50), 0) / own.length : null;
    const count = tended.get(persona.id) ?? 0;
    const share = fair > 0 ? count / fair : 1;
    const last = lastTended.get(persona.id) ?? persona.createdAt;

    let mood: PersonaMood = 'content';
    if (own.length && now - last > RULES.awayAfterDays * DAY) mood = 'away';
    else if (data.personas.length >= 3 && total >= 4 && share > 2) mood = 'stretched';
    else if (own.length && ((avg !== null && avg < 40) || (total >= 4 && share < 0.5))) mood = 'quiet';
    else if (avg !== null && avg >= 75) mood = 'thriving';

    personas[persona.id] = {
      id: persona.id,
      mood,
      face: faceFor(persona.key, mood),
      share: Math.round(share * 100) / 100,
      averageHealth: avg === null ? null : Math.round(avg),
    };
  }

  const dayKey = Math.floor(now / DAY);
  const gate = buildGate(data, plants, now, dayKey);
  const scene =
    sceneDoneDayKey === dayKey ? null : pickScene({ data, plants, personas, dayKey });

  const start = data.personas.reduce((m, p) => Math.min(m, p.createdAt), now);
  return { now, day: Math.floor((now - start) / DAY) + 1, plants, personas, gate, scene };
}

function capitalise(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function fillTemplate(template: string, plantName: string) {
  return template.replaceAll('{Plant}', capitalise(plantName)).replaceAll('{plant}', plantName);
}

function buildGate(data: GardenData, views: Record<string, PlantView>, now: number, dayKey: number): Ask[] {
  const personaById = new Map(data.personas.map((p) => [p.id, p]));
  const scored = data.plants
    .map((plant) => {
      const v = views[plant.id];
      if (!v || v.status !== 'active' || v.snoozedUntil) return null;
      if (v.lastTendedAt !== null && now - v.lastTendedAt < DAY / 2) return null;
      let score = (100 - v.effective) * plant.importance;
      if (v.priorityUntil) score *= 2;
      return score >= RULES.gateMinScore ? { plant, score } : null;
    })
    .filter((x): x is { plant: Plant; score: number } => x !== null)
    .sort((a, b) => b.score - a.score);

  const chosen: Plant[] = [];
  const usedPersonas = new Set<string>();
  for (const { plant } of scored) {
    if (chosen.length >= RULES.gateSize) break;
    if (!usedPersonas.has(plant.personaId)) {
      chosen.push(plant);
      usedPersonas.add(plant.personaId);
    }
  }
  for (const { plant } of scored) {
    if (chosen.length >= RULES.gateSize) break;
    if (!chosen.includes(plant)) chosen.push(plant);
  }

  return chosen.map((plant) => {
    const persona = personaById.get(plant.personaId);
    const templates = personaDef(persona?.key ?? '').asks[plant.kind];
    const template = templates[hash(plant.id + dayKey) % templates.length] ?? '{Plant}?';
    return { plantId: plant.id, personaId: plant.personaId, text: fillTemplate(template, plant.name) };
  });
}
