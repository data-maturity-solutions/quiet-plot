import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import type { GardenData, JournalEntry, Link, Persona, Plant, PlotEvent } from '@plot/core';

const here = dirname(fileURLToPath(import.meta.url));
export const DB_PATH = process.env.PLOT_DB ?? resolve(here, '../../../data/plot.db');
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS personas (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS plants (
    id TEXT PRIMARY KEY,
    persona_id TEXT NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
    second_persona_id TEXT REFERENCES personas(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('perennial', 'annual', 'herb')),
    rhythm_days REAL NOT NULL,
    importance INTEGER NOT NULL DEFAULT 2,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS links (
    id TEXT PRIMARY KEY,
    from_id TEXT NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
    to_id TEXT NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
    sign INTEGER NOT NULL CHECK (sign IN (1, -1)),
    strength INTEGER NOT NULL DEFAULT 1,
    UNIQUE (from_id, to_id)
  );
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plant_id TEXT NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    value REAL,
    at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS events_plant ON events (plant_id, at);
  CREATE TABLE IF NOT EXISTS journal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at INTEGER NOT NULL,
    text TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

type Row = Record<string, unknown>;

const toPersona = (r: Row): Persona => ({
  id: String(r.id),
  key: String(r.key),
  name: String(r.name),
  createdAt: Number(r.created_at),
});

const toPlant = (r: Row): Plant => ({
  id: String(r.id),
  personaId: String(r.persona_id),
  secondPersonaId: r.second_persona_id == null ? null : String(r.second_persona_id),
  name: String(r.name),
  kind: r.kind as Plant['kind'],
  rhythmDays: Number(r.rhythm_days),
  importance: Number(r.importance),
  createdAt: Number(r.created_at),
});

const toLink = (r: Row): Link => ({
  id: String(r.id),
  fromId: String(r.from_id),
  toId: String(r.to_id),
  sign: Number(r.sign) === -1 ? -1 : 1,
  strength: Number(r.strength),
});

const toEvent = (r: Row): PlotEvent => ({
  id: Number(r.id),
  plantId: String(r.plant_id),
  type: r.type as PlotEvent['type'],
  value: r.value == null ? null : Number(r.value),
  at: Number(r.at),
});

export function loadGarden(): GardenData {
  return {
    personas: (db.prepare('SELECT * FROM personas ORDER BY created_at, rowid').all() as Row[]).map(toPersona),
    plants: (db.prepare('SELECT * FROM plants ORDER BY created_at, rowid').all() as Row[]).map(toPlant),
    links: (db.prepare('SELECT * FROM links').all() as Row[]).map(toLink),
    events: (db.prepare('SELECT * FROM events ORDER BY at, id').all() as Row[]).map(toEvent),
  };
}

export function loadJournal(): JournalEntry[] {
  return (db.prepare('SELECT * FROM journal ORDER BY at DESC, id DESC LIMIT 50').all() as Row[]).map((r) => ({
    id: Number(r.id),
    at: Number(r.at),
    text: String(r.text),
  }));
}

export function getSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as Row | undefined;
  return row ? String(row.value) : null;
}

export function setSetting(key: string, value: string) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

export const insert = {
  persona(p: Persona) {
    db.prepare('INSERT INTO personas (id, key, name, created_at) VALUES (?, ?, ?, ?)').run(p.id, p.key, p.name, p.createdAt);
  },
  plant(p: Plant) {
    db.prepare(
      'INSERT INTO plants (id, persona_id, second_persona_id, name, kind, rhythm_days, importance, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(p.id, p.personaId, p.secondPersonaId, p.name, p.kind, p.rhythmDays, p.importance, p.createdAt);
  },
  link(l: Link) {
    db.prepare(
      'INSERT INTO links (id, from_id, to_id, sign, strength) VALUES (?, ?, ?, ?, ?) ON CONFLICT(from_id, to_id) DO UPDATE SET sign = excluded.sign, strength = excluded.strength',
    ).run(l.id, l.fromId, l.toId, l.sign, l.strength);
  },
  event(plantId: string, type: PlotEvent['type'], value: number | null, at: number) {
    db.prepare('INSERT INTO events (plant_id, type, value, at) VALUES (?, ?, ?, ?)').run(plantId, type, value, at);
  },
  journal(text: string, at: number) {
    db.prepare('INSERT INTO journal (at, text) VALUES (?, ?)').run(at, text);
  },
};

export function transaction(fn: () => void) {
  db.exec('BEGIN');
  try {
    fn();
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
