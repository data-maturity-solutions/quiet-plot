import { describe, expect, it } from 'vitest';
import { bestMatch, computeView, DAY, replayPlant, ripple, spread, type GardenData, type Plant, type PlotEvent } from './index';

const T0 = Date.UTC(2026, 10, 1);

function plant(id: string, personaId: string, extra: Partial<Plant> = {}): Plant {
  return { id, personaId, secondPersonaId: null, name: id, kind: 'perennial', rhythmDays: 7, importance: 2, createdAt: T0, ...extra };
}

let nextId = 1;
function ev(plantId: string, type: PlotEvent['type'], dayOffset: number, value: number | null = null): PlotEvent {
  return { id: nextId++, plantId, type, value, at: T0 + dayOffset * DAY };
}

describe('replayPlant', () => {
  it('starts at 60 and decays 25 per rhythm period', () => {
    const p = plant('p', 'a');
    expect(replayPlant(p, [], T0).vitality).toBe(60);
    expect(replayPlant(p, [], T0 + 7 * DAY).vitality).toBeCloseTo(35);
  });

  it('never drops below the floor', () => {
    expect(replayPlant(plant('p', 'a'), [], T0 + 100 * DAY).vitality).toBe(5);
  });

  it('recovers faster than it decays', () => {
    const p = plant('p', 'a');
    const v = replayPlant(p, [ev('p', 'water', 7)], T0 + 7 * DAY).vitality;
    expect(v).toBeCloseTo(70);
  });

  it('resets herbs to full when watered', () => {
    const p = plant('h', 'a', { kind: 'herb' });
    expect(replayPlant(p, [ev('h', 'water', 20)], T0 + 20 * DAY).vitality).toBe(100);
  });

  it('does not decay while fallow', () => {
    const p = plant('p', 'a');
    const s = replayPlant(p, [ev('p', 'fallow', 0)], T0 + 30 * DAY);
    expect(s.status).toBe('fallow');
    expect(s.vitality).toBe(60);
  });

  it('applies check-ins', () => {
    const p = plant('p', 'a');
    expect(replayPlant(p, [ev('p', 'checkin', 0, 2)], T0).vitality).toBe(85);
    expect(replayPlant(p, [ev('p', 'checkin', 0, 0)], T0).vitality).toBe(30);
  });
});

describe('spread', () => {
  it('drags a supported plant down when its source is poor', () => {
    const base = new Map([['sleep', 10], ['focus', 60]]);
    const out = spread(base, [{ id: 'l', fromId: 'sleep', toId: 'focus', sign: 1, strength: 2 }]);
    expect(out.get('focus')!).toBeLessThan(60);
  });

  it('lets a booming competitor crowd its target', () => {
    const base = new Map([['side', 95], ['sleep', 60]]);
    const out = spread(base, [{ id: 'l', fromId: 'side', toId: 'sleep', sign: -1, strength: 1 }]);
    expect(out.get('sleep')!).toBeLessThan(60);
  });

  it('reaches two hops', () => {
    const base = new Map([['a', 10], ['b', 50], ['c', 50]]);
    const out = spread(base, [
      { id: '1', fromId: 'a', toId: 'b', sign: 1, strength: 3 },
      { id: '2', fromId: 'b', toId: 'c', sign: 1, strength: 3 },
    ]);
    expect(out.get('c')!).toBeLessThan(50);
  });
});

describe('computeView', () => {
  const data: GardenData = {
    personas: [
      { id: 'org', key: 'organiser', name: 'the Organiser', createdAt: T0 },
      { id: 'heart', key: 'heart', name: 'the Heart', createdAt: T0 },
      { id: 'idle', key: 'idler', name: 'the Idler', createdAt: T0 },
    ],
    plants: [
      plant('focus', 'org', { importance: 3, rhythmDays: 2 }),
      plant('mum', 'heart', { importance: 3 }),
      plant('guitar', 'idle', { importance: 1 }),
    ],
    links: [{ id: 'l1', fromId: 'focus', toId: 'guitar', sign: -1, strength: 2 }],
    events: [
      ev('focus', 'water', 1), ev('focus', 'water', 2), ev('focus', 'water', 3),
      ev('focus', 'water', 4), ev('focus', 'water', 5), ev('focus', 'water', 6),
    ],
  };

  it('marks a persona hogging attention as stretched and others quiet', () => {
    const view = computeView(data, T0 + 6.5 * DAY);
    expect(view.personas.org!.mood).toBe('stretched');
    expect(view.personas.heart!.mood).toBe('quiet');
  });

  it('puts at most three asks at the gate, neediest first', () => {
    const view = computeView(data, T0 + 6.5 * DAY);
    expect(view.gate.length).toBeLessThanOrEqual(3);
    expect(view.gate[0]!.plantId).toBe('mum');
  });

  it('offers a scene, and none once today is done', () => {
    const now = T0 + 6.5 * DAY;
    expect(computeView(data, now).scene).not.toBeNull();
    expect(computeView(data, now, Math.floor(now / DAY)).scene).toBeNull();
  });

  it('reports what a plant would drag down', () => {
    const items = ripple(
      { ...data, links: [{ id: 'l', fromId: 'mum', toId: 'guitar', sign: 1, strength: 2 }] },
      'mum',
      T0 + DAY,
    );
    expect(items[0]?.plantId).toBe('guitar');
    expect(items[0]!.delta).toBeLessThan(0);
  });

  it('shows what an already-wilting plant is dragging down', () => {
    const items = ripple(
      { ...data, links: [{ id: 'l', fromId: 'mum', toId: 'guitar', sign: 1, strength: 2 }] },
      'mum',
      T0 + 60 * DAY,
    );
    expect(items[0]?.plantId).toBe('guitar');
    expect(items[0]!.delta).toBeLessThan(0);
  });
});

describe('quick tend matching', () => {
  const plants = [plant('a', 'x', { name: 'call Mum' }), plant('b', 'x', { name: 'sleep' }), plant('c', 'x', { name: 'reading' })];
  it('matches natural phrases', () => {
    expect(bestMatch('called mum', plants)?.id).toBe('a');
    expect(bestMatch('slept well', plants)?.id).toBe('b');
    expect(bestMatch('read a book', plants)?.id).toBe('c');
    expect(bestMatch('fixed the car', plants)).toBeNull();
  });
});
