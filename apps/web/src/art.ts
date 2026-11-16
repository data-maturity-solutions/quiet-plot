import type { PlantKind, PlantState } from '@plot/core';

type Growing = Exclude<PlantState, 'fallow' | 'harvested'>;

/** Placeholder ASCII art, 5 columns by 3 rows. Swap for tiles later at the same grid size. */
const ART: Record<PlantKind, Record<Growing, string[]>> = {
  perennial: {
    blooming: ['  @  ', ' \\|/ ', '  |  '],
    healthy: ['  Y  ', '  |/ ', '  |  '],
    dry: ['  y  ', '  |  ', '  |  '],
    wilting: ['     ', '  ,_ ', '  |  '],
  },
  annual: {
    blooming: [' o o ', ' \\|/ ', '  |  '],
    healthy: ['  o  ', ' \\|  ', '  |  '],
    dry: ['  .  ', '  |  ', '  |  '],
    wilting: ['     ', '  ._ ', '  |  '],
  },
  herb: {
    blooming: [' ψψψ ', ' \\|/ ', '  |  '],
    healthy: ['  ψ  ', ' \\|/ ', '  |  '],
    dry: ['  v  ', ' \\v/ ', '  |  '],
    wilting: [' v v ', ' \\vv/', '  |  '],
  },
};

const FALLOW = ['     ', '  .  ', ' ~~~ '];
const HARVESTED = ['  ✓  ', ' \\_/ ', '     '];

export function plantArt(kind: PlantKind, state: PlantState): string {
  const lines = state === 'fallow' ? FALLOW : state === 'harvested' ? HARVESTED : ART[kind][state];
  return [...lines, '─────'].join('\n');
}

export const STATE_WORDS: Record<PlantState, string> = {
  blooming: 'blooming',
  healthy: 'healthy',
  dry: 'dry',
  wilting: 'wilting',
  fallow: 'resting',
  harvested: 'harvested',
};

export function bar(value: number, width = 10): string {
  const filled = Math.round((Math.max(0, Math.min(100, value)) / 100) * width);
  return `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`;
}
