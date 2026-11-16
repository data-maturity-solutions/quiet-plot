# A Quiet Plot (prototype)

Your life as a small garden, looked after by the different sides of you. See
[docs/DESIGN.md](docs/DESIGN.md) for the idea, rules and open questions.

## Run it

Needs Node 22.13+ (uses the built-in `node:sqlite`) and pnpm. Developed on Node 24 and pnpm 12.

```bash
pnpm install
```

```bash
pnpm dev
```

Then open http://localhost:2311. The API runs on http://127.0.0.1:403. Override the ports with
`PLOT_WEB_PORT` and `PLOT_API_PORT`. On Linux, ports below 1024 need extra permissions, so set
`PLOT_API_PORT` to something higher there. Data lives in `data/plot.db` (override with `PLOT_DB`).

Use the **dev clock** in the header to skip days and watch plants dry out, personas get
stretched or quiet, and scenes appear.

## Checks

```bash
pnpm test
```

```bash
pnpm typecheck
```

`pnpm-workspace.yaml` allows esbuild's install script (used by Vite, tsx and vitest).

## Layout

```
packages/core   simulation: vitality, roots, ripple, gate, balance, scenes, quick-tend matching
apps/server     Hono + node:sqlite API, local only
apps/web        Vite + TypeScript, ASCII placeholder renderer (art in src/art.ts)
```
