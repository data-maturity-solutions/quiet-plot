import type { GardenData, GardenView, JournalEntry, PersonaDef, RippleItem } from '@plot/core';

export interface AppState {
  data: GardenData;
  view: GardenView;
  journal: JournalEntry[];
  offsetDays: number;
  cast: PersonaDef[];
}

export interface SceneResult extends AppState {
  outcome: string;
}

export interface QuickResult extends AppState {
  matched: { phrase: string; plantId: string; name: string }[];
  unmatched: string[];
}

async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

export const api = {
  state: () => call<AppState>('/state'),
  setup: (body: unknown) => call<AppState>('/setup', 'POST', body),
  renamePersona: (id: string, name: string) => call<AppState>(`/personas/${id}`, 'PATCH', { name }),
  addPlant: (body: unknown) => call<AppState>('/plants', 'POST', body),
  updatePlant: (id: string, body: unknown) => call<AppState>(`/plants/${id}`, 'PATCH', body),
  deletePlant: (id: string) => call<AppState>(`/plants/${id}`, 'DELETE'),
  addLink: (body: unknown) => call<AppState>('/links', 'POST', body),
  deleteLink: (id: string) => call<AppState>(`/links/${id}`, 'DELETE'),
  event: (plantId: string, type: string, value?: number) => call<AppState>('/events', 'POST', { plantId, type, value }),
  ripple: (id: string) => call<RippleItem[]>(`/ripple/${id}`),
  scene: (sceneId: string, choiceId: string) => call<SceneResult>('/scene', 'POST', { sceneId, choiceId }),
  quick: (text: string) => call<QuickResult>('/quick', 'POST', { text }),
  clock: (days: number) => call<AppState>('/clock', 'POST', { days }),
  reset: () => call<AppState>('/reset', 'POST'),
};
