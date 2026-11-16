export const DAY = 86_400_000;

export type PlantKind = 'perennial' | 'annual' | 'herb';
export type PlantStatus = 'active' | 'fallow' | 'harvested';
export type PlantState = 'blooming' | 'healthy' | 'dry' | 'wilting' | 'fallow' | 'harvested';
export type PersonaMood = 'thriving' | 'content' | 'quiet' | 'stretched' | 'away';

/** Check-in values: 2 thriving, 1 okay, 0 struggling. Snooze/priority values are days. */
export type EventType =
  | 'water'
  | 'checkin'
  | 'snooze'
  | 'priority'
  | 'fallow'
  | 'unfallow'
  | 'harvest';

export interface Persona {
  id: string;
  key: string;
  name: string;
  createdAt: number;
}

export interface Plant {
  id: string;
  personaId: string;
  secondPersonaId: string | null;
  name: string;
  kind: PlantKind;
  rhythmDays: number;
  importance: number;
  createdAt: number;
}

export interface Link {
  id: string;
  fromId: string;
  toId: string;
  sign: 1 | -1;
  strength: number;
}

export interface PlotEvent {
  id: number;
  plantId: string;
  type: EventType;
  value: number | null;
  at: number;
}

export interface JournalEntry {
  id: number;
  at: number;
  text: string;
}

export interface PlantView {
  id: string;
  vitality: number;
  effective: number;
  state: PlantState;
  status: PlantStatus;
  snoozedUntil: number | null;
  priorityUntil: number | null;
  lastTendedAt: number | null;
}

export interface PersonaView {
  id: string;
  mood: PersonaMood;
  face: string;
  share: number;
  averageHealth: number | null;
}

export interface Ask {
  plantId: string;
  personaId: string;
  text: string;
}

export interface SceneLine {
  personaId: string;
  text: string;
}

export type Effect =
  | { type: 'snooze'; plantIds: string[]; days: number }
  | { type: 'priority'; plantIds: string[]; days: number }
  | { type: 'press'; text: string };

export interface SceneChoice {
  id: string;
  label: string;
  effects: Effect[];
  outcome: string;
}

export interface Scene {
  id: string;
  kind: 'crowding' | 'stretched' | 'celebration';
  lines: SceneLine[];
  choices: SceneChoice[];
}

export interface RippleItem {
  plantId: string;
  delta: number;
}

export interface GardenData {
  personas: Persona[];
  plants: Plant[];
  links: Link[];
  events: PlotEvent[];
}

export interface GardenView {
  now: number;
  day: number;
  plants: Record<string, PlantView>;
  personas: Record<string, PersonaView>;
  gate: Ask[];
  scene: Scene | null;
}
