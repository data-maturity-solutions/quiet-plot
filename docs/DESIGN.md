# A Quiet Plot — design

Working name. A small, unhurried game that keeps a rough digital twin of your life as a garden
tended by the different sides of you. It replaces a to-do list: instead of reading a list, you
look at the garden, notice what is dry or flourishing, and answer a few gentle questions.

Status: prototype. Everything here is a starting point to test, not a final decision.

## Goals

- **Remind people what needs attention** without nagging or a wall of tasks.
- **Show how things affect each other**: when one thing goes well, related things flourish; when
  one goes poorly, you can see what else it drags down.
- **Make balance the goal**, not productivity. Too much of one thing is a problem too.
- **Feel like a game**, and never feel like a chore. Data entry should be mostly taps.
- **Be forgiving.** Nothing dies, there are no streaks, and coming back is rewarded.

## Non-goals

- Not a precise measurement of anyone's life. The twin is a rough mirror.
- Not therapy or mental-health advice, even though personas are a reflective idea.
- Not a social network. Single user, local only, for now.

## The world

| Element | What it represents | Notes |
|---|---|---|
| **Garden** | Your life as a whole | One garden per person |
| **Creatures** | Your personas (the Organiser, the Heart, the Idler…) | You pick 3–5 at setup and can rename them |
| **Patches** | Each persona's corner of the garden | Shows that persona's plants |
| **Plants** | Things you want to look after | Sleep, call Mum, tax return, guitar |
| **Roots** | How one plant affects another | Supporting (+) or competing (−), strength 1–3 |
| **The gate** | Today's quick asks | At most 3, in each persona's voice |
| **Scenes** | Short conversations between personas | At most one a day; a one-tap decision |
| **Pressed flowers** | Good moments worth keeping | A small journal |

Interactions between personas take inspiration from the *dynamic* of films about inner
characters (distinct voices sharing one person, negotiating and needing each other). We do not
borrow any specific characters, names, look, or devices from those works.

### Plant kinds

| Kind | Used for | Behaviour |
|---|---|---|
| **Perennial** | Ongoing things: habits, relationships, health | Needs watering at a rhythm (every N days) |
| **Annual** | One-off projects or tasks | Grows as you work on it; **harvested** when done |
| **Herb** | Recurring chores | Watering means "done"; it regrows and needs doing again |

### Plant states

Derived from effective health (below). In the prototype these are drawn as small ASCII plants.

| State | Health | Meaning |
|---|---|---|
| Blooming | 80+ | Going really well |
| Healthy | 55–79 | Fine |
| Dry | 35–54 | Could do with attention |
| Wilting | below 35 | Needs attention, or is being dragged down |
| Fallow | — | Deliberately paused (holiday, illness, off-season). No decay |
| Harvested | — | An annual that is done |

### Persona states

Personas are never tended directly. Their state comes from their plants and from how your
recent attention is shared between them.

| State | When | Shown as |
|---|---|---|
| Thriving | Their plants are doing well | Bright face, sits with others |
| Content | Nothing notable | Neutral face |
| Quiet | Their plants are dry, or they have had little of your attention lately | Sleepy face. Misses you; never sad or accusing |
| Stretched | They are getting far more than their share of your attention | Frazzled face, crowds others |
| Away | Nothing of theirs tended for 10+ days | Out exploring. Returns with a small story when you tend one of their plants |

## Rules (prototype numbers, expect tuning)

### Vitality

- A new plant starts at **60**.
- It decays by **25 points per rhythm period**. A weekly plant loses about 25 a week.
- **Watering** adds **35**, so recovery is faster than decay. Capped at 100.
- **Herbs** reset to 100 when watered.
- **Check-in** (optional): thriving sets at least 85; okay sets at least 55; struggling sets at most 30.
- **Floor of 5.** Nothing ever reaches zero.
- **Fallow** stops decay until it is lifted.

### Effective health (how effects spread)

Each root from A to B adds `sign × strength × 0.12 × (A − 50)` to B. This runs for two rounds,
so effects reach two hops away with natural damping. Results are clamped to 0–100.

- **Supporting (+)**: rise and fall together. Good sleep lifts focus; poor sleep drags it.
- **Competing (−)**: compete for the same time. A booming side project eats into sleep.

### Ripple ("if this keeps wilting")

For any plant, recompute everything with that plant at 10, and compare with it at a healthy
baseline (60, or its current value if higher). The difference is the list of what it drags down,
so a plant that is already wilting shows what it is costing right now. Shown in the underground
view and on the plant.

### Attention (the gate)

Score each active plant: `(100 − effective health) × importance`, skipping snoozed, fallow and
harvested plants. Take the top 3, preferring different personas. Each ask is phrased in its
persona's voice and answered with **yes** (water) or **not yet** (snooze one day).

### Balance

Over the last 7 days, compare each persona's share of waterings with an even share.
More than twice the even share (with 3+ personas) means **stretched**. Under half, or an
average plant health below 40, means **quiet**.

### Scenes

Picked once a day from the garden's state. Prototype scene types:

1. **Crowding.** A competing root where the source is flourishing and the target is wilting.
   The two owners talk it over. Choices: ease off the source for a few days, or leave it.
2. **Stretched and quiet.** One persona is stretched while another is quiet. Choices: give the
   quiet one priority at the gate for a few days, or not now.
3. **Celebration.** A supporting root where both ends are blooming. One tap presses a flower.

Every choice turns into real changes (snoozes, gate priority, a pressed flower). The next day
can show a short consequence line.

## Minimal data entry

- **Setup:** pick personas, keep or drop suggested plants. Suggested roots come with them.
- **Daily:** answer the gate (taps). Optionally make one scene decision (one tap).
- **Quick tend:** type a phrase like "called Mum" and it is matched to a plant and watered.
- **Typing a new plant** is the only real typing, and it is rare.

## Tone

- Personas are dry and understated. Short lines. No exclamation-mark cheerfulness.
- Quiet personas miss you; they do not guilt you.
- Nobody wins an argument permanently. Scenes are about this week's trade-offs.
- Users can rename personas and, later, turn chatter down.

## Look

- **Prototype:** coloured ASCII glyphs on a character grid, monospace throughout.
- **Later:** swap each glyph for a small pixel-art tile at the same grid size, so the renderer
  does not need rewriting.
- Two views: **above ground** (the garden) and **underground** (roots and ripple numbers).

## Architecture

```
packages/core   pure TypeScript simulation: vitality, spread, ripple, attention, balance, scenes
apps/server     Node + Hono, SQLite via node:sqlite, local only
apps/web        Vite + TypeScript, ASCII renderer
```

- **Event log.** We store what happened (watered, checked in, snoozed…) and compute current
  state from it. Time passing, history and the journal come almost for free.
- **Dev clock.** The server keeps a day offset so the prototype can skip ahead and show decay.
- SQLite tables: `personas`, `plants`, `links`, `events`, `journal`, `settings`.

## Privacy

- Data stays in a local SQLite file.
- Any future Claude-written dialogue gets only an abstract state (for example "Organiser
  stretched, Idler quiet"), never the names of real plants or people, and is off by default.
- Encryption and backups to consider before anyone else uses it.

## Open questions

- Should important people be plants, or occasional visiting creatures of their own?
- How should overfeeding be detected: share of waterings (prototype), a weekly "how stretched
  do you feel?" question, or both?
- How chatty should personas be by default?
- Should personas disagree out loud in scenes more often, or only when it matters?
- Are numbers ever shown to users, or only words like "strained a lot"?
- What triggers wildlife and other rewards?

## Prototype scope

In: setup, garden view, underground view, plant drawer (water, check in, snooze, fallow,
roots), gate, one scene a day, pressed flowers, quick tend, add plant, dev clock.

Out for now: pixel tiles, Claude-written dialogue, away/exploring stories, wildlife, accounts,
sync, mobile layout polish.
