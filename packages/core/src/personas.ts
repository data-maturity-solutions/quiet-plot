import type { PersonaMood, PlantKind } from './types';

export interface StarterPlant {
  name: string;
  kind: PlantKind;
  rhythmDays: number;
  importance: number;
}

export interface PersonaDef {
  key: string;
  name: string;
  caresAbout: string;
  /** Characters either side of the face, e.g. [•_•]. */
  frame: [string, string];
  colour: string;
  asks: Record<PlantKind, string[]>;
  starters: StarterPlant[];
}

const EYES: Record<PersonaMood, string> = {
  thriving: 'ᵔᴗᵔ',
  content: '•ᴗ•',
  quiet: '-.-',
  stretched: '⊙﹏⊙',
  away: ' · ',
};

export const CAST: PersonaDef[] = [
  {
    key: 'organiser',
    name: 'the Organiser',
    caresAbout: 'work, admin, money',
    frame: ['[', ']'],
    colour: 'amber',
    asks: {
      perennial: ['Did {plant} get a proper slot today?', 'Any time blocked for {plant}?'],
      annual: ['Any progress on {plant}?', '{Plant}. Still on the list. Moved at all?'],
      herb: ['{Plant}. Done?', 'Has {plant} been dealt with?'],
    },
    starters: [
      { name: 'focus time', kind: 'perennial', rhythmDays: 2, importance: 3 },
      { name: 'inbox and admin', kind: 'herb', rhythmDays: 7, importance: 2 },
      { name: 'tax return', kind: 'annual', rhythmDays: 7, importance: 2 },
    ],
  },
  {
    key: 'heart',
    name: 'the Heart',
    caresAbout: 'family, friends, partner',
    frame: ['(', ')'],
    colour: 'rose',
    asks: {
      perennial: ['Did you get to {plant}?', '{Plant}. Been on my mind.'],
      annual: ['How is {plant} coming along?', 'Any news on {plant}?'],
      herb: ['Did {plant} happen?', '{Plant}, sorted?'],
    },
    starters: [
      { name: 'call Mum', kind: 'perennial', rhythmDays: 7, importance: 3 },
      { name: 'date night', kind: 'perennial', rhythmDays: 14, importance: 2 },
      { name: 'catch up with friends', kind: 'perennial', rhythmDays: 14, importance: 2 },
    ],
  },
  {
    key: 'idler',
    name: 'the Idler',
    caresAbout: 'fun, rest, hobbies',
    frame: ['~(', ')~'],
    colour: 'sky',
    asks: {
      perennial: ['Any time for {plant} lately?', '{Plant}? No rush. Just asking.'],
      annual: ['{Plant}. Whenever you like.', 'Poked at {plant} at all?'],
      herb: ['{Plant}. Done, or still pending?', 'Did {plant} get done?'],
    },
    starters: [
      { name: 'guitar', kind: 'perennial', rhythmDays: 7, importance: 1 },
      { name: 'a slow weekend', kind: 'perennial', rhythmDays: 7, importance: 2 },
      { name: 'reading', kind: 'perennial', rhythmDays: 3, importance: 1 },
    ],
  },
  {
    key: 'tender',
    name: 'the Tender',
    caresAbout: 'body, sleep, movement',
    frame: ['{', '}'],
    colour: 'moss',
    asks: {
      perennial: ['How has {plant} been?', 'Did {plant} get a look-in today?'],
      annual: ['Any steps on {plant}?', '{Plant}, moving along?'],
      herb: ['Did {plant} happen?', '{Plant}, done?'],
    },
    starters: [
      { name: 'sleep', kind: 'perennial', rhythmDays: 1, importance: 3 },
      { name: 'movement', kind: 'perennial', rhythmDays: 2, importance: 2 },
      { name: 'cook a proper meal', kind: 'herb', rhythmDays: 3, importance: 1 },
    ],
  },
  {
    key: 'tinkerer',
    name: 'the Tinkerer',
    caresAbout: 'learning, making, curiosity',
    frame: ['<', '>'],
    colour: 'violet',
    asks: {
      perennial: ['Fiddled with {plant} at all?', 'Anything new on {plant}?'],
      annual: ['How far along is {plant}?', '{Plant}. Got a minute for it?'],
      herb: ['{Plant}, done?', 'Did {plant} get sorted?'],
    },
    starters: [
      { name: 'side project', kind: 'perennial', rhythmDays: 7, importance: 1 },
      { name: 'learn something new', kind: 'perennial', rhythmDays: 7, importance: 1 },
    ],
  },
  {
    key: 'keeper',
    name: 'the Keeper',
    caresAbout: 'home and surroundings',
    frame: ['|', '|'],
    colour: 'clay',
    asks: {
      perennial: ['Has {plant} been seen to?', 'How is {plant} looking?'],
      annual: ['{Plant}. Any progress?', 'Is {plant} getting there?'],
      herb: ['{Plant}, done this round?', 'Has {plant} been done?'],
    },
    starters: [
      { name: 'tidy the house', kind: 'herb', rhythmDays: 7, importance: 2 },
      { name: 'bills and budget', kind: 'herb', rhythmDays: 30, importance: 2 },
      { name: 'water the real plants', kind: 'herb', rhythmDays: 4, importance: 1 },
    ],
  },
];

/** Suggested roots between starter plants, applied only when both plants exist. */
export const STARTER_LINKS: { from: string; to: string; sign: 1 | -1; strength: number }[] = [
  { from: 'sleep', to: 'focus time', sign: 1, strength: 2 },
  { from: 'movement', to: 'sleep', sign: 1, strength: 1 },
  { from: 'cook a proper meal', to: 'sleep', sign: 1, strength: 1 },
  { from: 'a slow weekend', to: 'focus time', sign: 1, strength: 1 },
  { from: 'a slow weekend', to: 'date night', sign: 1, strength: 1 },
  { from: 'tidy the house', to: 'a slow weekend', sign: 1, strength: 1 },
  { from: 'focus time', to: 'a slow weekend', sign: -1, strength: 1 },
  { from: 'side project', to: 'sleep', sign: -1, strength: 1 },
];

export function personaDef(key: string): PersonaDef {
  return CAST.find((p) => p.key === key) ?? CAST[0]!;
}

export function faceFor(key: string, mood: PersonaMood): string {
  const def = personaDef(key);
  return `${def.frame[0]}${EYES[mood]}${def.frame[1]}`;
}
