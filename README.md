# carousell-searcher

Daily Carousell Singapore deal scout for used iPad Pro 11-inch models with M1 or newer chips.

## What It Does

- Searches Carousell Singapore for iPad Pro 11-inch M1, M2, and M4 listings.
- Uses both keyword `/q/?tab=marketplace&sort_by=3` pages and `/search/?query=...&tab=marketplace&sort_by=3` pages so results are newest-first on the marketplace tab.
- Filters to used iPad Pro 11-inch listings under SGD 1000, with a small exception for unusually compelling above-budget listings.
- Extracts generation, chip, storage, colour, condition, battery, Apple Pencil inclusion, and caveats from seller text.
- Deduplicates previously reported listings in `.carousell-scout-state.json`, re-reporting only price/detail changes.

## Setup

```sh
pnpm install
```

The default provider uses Playwright. Carousell may show a Cloudflare challenge to new automated browser profiles. If that happens, run once with a visible persistent browser, solve the challenge, then use the same profile for automation:

```sh
CAROUSELL_HEADLESS=false CAROUSELL_USER_DATA_DIR=.carousell-profile pnpm scout
CAROUSELL_USER_DATA_DIR=.carousell-profile pnpm scout
```

If the daily run reports a Cloudflare challenge, repeat the visible-profile command above to refresh the browser session.

## Usage

```sh
pnpm scout
pnpm scout --json
pnpm scout --dry-run
```

Useful environment variables:

- `CAROUSELL_HEADLESS=false`
- `CAROUSELL_USER_DATA_DIR=.carousell-profile`
- `CAROUSELL_STATE_FILE=.carousell-scout-state.json`
- `CAROUSELL_MAX_LISTINGS=80`

## Codex Automation Prompt

The Codex automation should run daily from this workspace and execute:

```sh
pnpm scout
```

If the command prints listing blocks, report them exactly. If it prints `No new qualifying listings since last run.`, return that line only. If it fails with a Cloudflare challenge, report the setup command from this README so the browser profile can be refreshed.
