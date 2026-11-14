# Token Radar — radar-2-comps

A token launch radar for make.fun's `token-radar-01` bounty. It reads the sealed
DefiLlama snapshot (`snapshot.json`: 758 protocols, watchlist of 40), ranks every
pre-token protocol by an implied launch value, and writes a static dashboard that
shows the board, a detail view per protocol, and a concrete farm plan for each one.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
```

Node 22.18+ (standard library only, no install step). The program writes
`out/board.json` (the ranked board), `out/data.js` (the dashboard's full dataset),
copies `dashboard/` and `screenshots/` to `out/`, and writes `out/dossier.json`
with `buildDossier` from `vendor/makefun-board.ts`. Runs are deterministic: two
runs on the same snapshot write byte-identical outputs.

## The model (radar-2-comps)

Comparables-based, derived from the snapshot's own figures — no protocol name is
ever special-cased:

- **Category multiple**: for each category, the median `mcap_usd / tvl_usd` over
  that category's live (token-trading) protocols. Categories with fewer than 3
  live protocols fall back to the global median over all live protocols.
  Clamped to `[0.05, 3.0]`.
- **Growth**: `1 + clamp(change_7d ?? 0, -60, 120) / 100 × 0.5`.
- **Maturity**: `0.6 + min(age_days ?? 365, 1095) / 1095 × 0.4` (age = `as_of`
  minus `listed_at`).
- **Breadth**: `1 + min(max(chains − 1, 0), 4) × 0.02`.
- **Implied value**: `max(1, round(tvl × categoryMultiple × growth × maturity
  × breadth))`, capped at $100,000,000,000,000.

## The board

- All 40 watchlist protocols are covered, plus the rankable pre-token protocols
  below the $50M floor (pre-token, not a CEX, name not ending in a version
  marker), by TVL — 186 of them on this snapshot, so 226 rows in total.
- Ranks 1..N, implied value non-increasing with rank, ties broken by slug.
- 24 live-token protocols are set aside in a separate Live view, shown at market
  cap (a fact, not a model).

## Farm plans

Six steps per protocol, from its category, chains, TVL and age only. Twelve
category templates (lending/CDP, DEX/AMM, perps/derivatives, bridge,
staking/restaking, RWA, stablecoin, prediction, curator/vault, insurance,
yield, default) each with its own opening position, weekly action and claim
check. Capital tiers $50/$100/$150/$250 by TVL, gas $2–$8, hold 60/45/30 days
by age.

## Files

- `main.ts` — entry point: read snapshot, build board, write outputs.
- `lib/model.ts` — the model: snapshot parsing, comparables, implied value,
  farm plans, board building, gate checks, `data.js` writer.
- `vendor/makefun-board.ts` — the kit's dossier library, verbatim.
- `dashboard/` — the static page (no network, reads `data.js`).
- `screenshots/` — board, detail and filtered views of the dashboard.
- `VALIDATION.md` — the validation report for this build.
