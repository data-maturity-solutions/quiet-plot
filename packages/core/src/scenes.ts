import type { GardenData, PersonaView, Plant, PlantView, Scene } from './types';

interface SceneContext {
  data: GardenData;
  plants: Record<string, PlantView>;
  personas: Record<string, PersonaView>;
  dayKey: number;
}

/** Picks at most one scene for the day: crowding first, then stretched/quiet, then celebration. */
export function pickScene(ctx: SceneContext): Scene | null {
  return crowding(ctx) ?? stretched(ctx) ?? celebration(ctx);
}

function active(ctx: SceneContext, id: string) {
  const v = ctx.plants[id];
  return v && v.status === 'active' ? v : null;
}

function crowding(ctx: SceneContext): Scene | null {
  const plantById = new Map(ctx.data.plants.map((p) => [p.id, p]));
  const candidates = ctx.data.links
    .filter((l) => l.sign === -1)
    .map((l) => ({ l, s: plantById.get(l.fromId), t: plantById.get(l.toId) }))
    .filter((x): x is { l: typeof x.l; s: Plant; t: Plant } => !!x.s && !!x.t)
    .filter(({ s, t }) => (active(ctx, s.id)?.effective ?? 0) >= 70 && (active(ctx, t.id)?.effective ?? 100) < 45);
  const pick = candidates[0];
  if (!pick) return null;
  const { s, t } = pick;
  const a = s.personaId;
  const b = t.personaId;
  const lines =
    a === b
      ? [
          { personaId: a, text: `${s.name} and ${t.name} both want the same hours.` },
          { personaId: a, text: `${s.name} is winning. I'm not sure it should be.` },
        ]
      : [
          { personaId: a, text: `${cap(s.name)} is going well. I'd like to keep at it.` },
          { personaId: b, text: `It's taking the hours ${t.name} used to get.` },
          { personaId: a, text: '...Fair.' },
        ];
  return {
    id: `crowding:${pick.l.id}:${ctx.dayKey}`,
    kind: 'crowding',
    lines,
    choices: [
      {
        id: 'ease',
        label: `Ease off ${s.name} for a few days`,
        effects: [
          { type: 'snooze', plantIds: [s.id], days: 3 },
          { type: 'priority', plantIds: [t.id], days: 3 },
        ],
        outcome: `${cap(s.name)} can wait a few days. ${cap(t.name)} moves up the gate.`,
      },
      { id: 'leave', label: 'Leave it for now', effects: [], outcome: 'Left as it is.' },
    ],
  };
}

function stretched(ctx: SceneContext): Scene | null {
  const views = Object.values(ctx.personas);
  const loud = views.find((p) => p.mood === 'stretched');
  const quiet = views.find((p) => p.mood === 'quiet' || p.mood === 'away');
  if (!loud || !quiet) return null;
  const quietPlants = ctx.data.plants.filter((p) => p.personaId === quiet.id && active(ctx, p.id));
  const loudPlants = ctx.data.plants.filter((p) => p.personaId === loud.id && active(ctx, p.id));
  const neglected = [...quietPlants].sort(
    (x, y) => (ctx.plants[x.id]?.effective ?? 0) - (ctx.plants[y.id]?.effective ?? 0),
  )[0];
  const quietName = ctx.data.personas.find((p) => p.id === quiet.id)?.name ?? 'them';
  return {
    id: `stretched:${loud.id}:${quiet.id}:${ctx.dayKey}`,
    kind: 'stretched',
    lines: [
      { personaId: loud.id, text: "I've had most of your week. I know." },
      { personaId: quiet.id, text: neglected ? `${cap(neglected.name)} hasn't had a look-in.` : "I've barely been out." },
      { personaId: loud.id, text: "Take a few days. I'll keep the list." },
    ],
    choices: [
      {
        id: 'share',
        label: `Give ${quietName} a few days`,
        effects: [
          { type: 'priority', plantIds: quietPlants.map((p) => p.id), days: 3 },
          { type: 'snooze', plantIds: loudPlants.filter((p) => p.importance < 3).map((p) => p.id), days: 2 },
        ],
        outcome: `${cap(quietName)} gets the gate for a few days.`,
      },
      { id: 'later', label: 'Not now', effects: [], outcome: 'Maybe next week.' },
    ],
  };
}

function celebration(ctx: SceneContext): Scene | null {
  const plantById = new Map(ctx.data.plants.map((p) => [p.id, p]));
  const pick = ctx.data.links
    .filter((l) => l.sign === 1)
    .map((l) => ({ l, s: plantById.get(l.fromId), t: plantById.get(l.toId) }))
    .find(
      ({ s, t }) =>
        !!s && !!t && active(ctx, s.id)?.state === 'blooming' && active(ctx, t.id)?.state === 'blooming',
    );
  if (!pick || !pick.s || !pick.t) return null;
  const { s, t } = pick;
  return {
    id: `celebration:${pick.l.id}:${ctx.dayKey}`,
    kind: 'celebration',
    lines: [
      { personaId: s.personaId, text: `${cap(s.name)} is doing well.` },
      { personaId: t.personaId, text: `So is ${t.name}. Funny, that.` },
      { personaId: s.personaId, text: 'Not that funny.' },
    ],
    choices: [
      {
        id: 'press',
        label: 'Press a flower',
        effects: [{ type: 'press', text: `${cap(s.name)} and ${t.name} were both blooming.` }],
        outcome: 'Pressed into the journal.',
      },
      { id: 'nice', label: 'Nice', effects: [], outcome: '' },
    ],
  };
}

function cap(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
