import type { Plant } from './types';

const STOP = new Set(['a', 'an', 'the', 'my', 'some', 'with', 'to', 'and', 'did', 'went', 'got', 'for', 'of', 'i', 'up', 'in', 'on', 'today']);

const SYNONYMS: Record<string, string> = {
  called: 'call', rang: 'call', phoned: 'call', ring: 'call', phone: 'call',
  slept: 'sleep', ran: 'movement', run: 'movement', walked: 'movement', walk: 'movement',
  gym: 'movement', exercise: 'movement', read: 'reading', cooked: 'cook', tidied: 'tidy',
  cleaned: 'tidy', paid: 'bills', played: 'play', learnt: 'learn', learned: 'learn',
  mom: 'mum', mother: 'mum',
};

function stem(word: string) {
  const w = SYNONYMS[word] ?? word;
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s')) return w.slice(0, -1);
  return w;
}

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w && !STOP.has(w))
    .map(stem);
}

/** Matches each comma- or "and"-separated phrase to the best plant. */
export function matchPhrases(text: string, plants: Plant[]): { phrase: string; plant: Plant | null }[] {
  return text
    .split(/,|;|\band\b|\+/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((phrase) => ({ phrase, plant: bestMatch(phrase, plants) }));
}

export function bestMatch(phrase: string, plants: Plant[]): Plant | null {
  const words = new Set(tokens(phrase));
  let best: Plant | null = null;
  let bestScore = 0;
  for (const plant of plants) {
    const name = tokens(plant.name);
    if (!name.length) continue;
    const hits = name.filter((w) => words.has(w)).length;
    const score = hits / name.length;
    if (score > bestScore) {
      best = plant;
      bestScore = score;
    }
  }
  return bestScore >= 0.5 ? best : null;
}
