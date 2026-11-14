# Validation — token-radar-01 v2, model radar-2-comps (unchanged from v1)

Validated 2026-11-14 (WIB) against `token-radar-01-kit/input/snapshot.json`
(758 protocols, watchlist 40, `as_of` 2026-11-14, floor $50,000,000).
v2 changes vs v1: dashboard only (Farm column on the board, denser rows,
detail panel restructured with a farm-plan glance above the fold, Facts grid
polish, "How to verify this entry" block in Methodology). `lib/model.ts`,
`main.ts` and `vendor/makefun-board.ts` are byte-identical to v1 (diff clean);
the board and data.js outputs are therefore byte-identical to v1's.

## Determinism (2 runs, coordinator, 14 Nov ~18:25 WIB)

```sh
MAKEFUN_OUTPUT_DIR=/tmp/v2run1 node main.ts --input <snapshot.json>   # exit 0
MAKEFUN_OUTPUT_DIR=/tmp/v2run2 node main.ts --input <snapshot.json>   # exit 0
```

| file | sha256 (run 1 == run 2) |
| --- | --- |
| board.json | `ceccd1f31bcfc7d817ddc1e771fbd008b23aaf101c0f2dedb91a68faf04c062a` |
| data.js | `4a159923166f519fd4e664127c68949f718d0deb481c4fced3b2bbfc58f03cb6` |
| dossier.json | `bfc050b314b68c7993cef26dde86f51d5fbfa146b2e2b0d6ca850139aec75674` |

All three files byte-identical across both runs. board.json and data.js are
also byte-identical to v1's (same model, same snapshot). No `Date.now`, no
randomness. (Dossier sha changes after any dashboard edit — re-run to refresh.)

## Board checks (`boardIssue(board, snapshot) === null`)

- Rows: **226** (40 watchlist + 186 early). See the count note below.
- Watchlist coverage: **40/40**.
- Ranks: exactly 1..226, each once.
- Implied value: non-increasing with rank; range $396,662,979 → $199,388;
  not all equal; every value a positive safe integer ≤ $100,000,000,000,000.
- Every slug exists in the snapshot; every row is pre-token
  (`mcap_usd`, `gecko_id`, `symbol` all null); 0 CEX rows, 0 versioned names.
- Farm steps: 6 per row, every string 135–236 characters (gate: 20–600).
- `node -e` loads `data.js`: `window.RADAR` present, `model_version`
  `radar-2-comps`, 226 rows each carrying full `model` breakdown +
  `farm_steps`, 24 live rows, 36 comparables, `global_median_multiple` 0.1689,
  counts 40 / 226 / 186 / 24.

## ⚠️ Count note: 226 rows, not 240

The brief assumed 200 rankable early rows below the floor. The snapshot
actually holds only **186** rankable pre-token protocols below the $50M floor
(210 pre-token below the floor minus 15 CEX minus 9 versioned names).
`EARLY_ROWS` stays 200 as a cap, but the slice yields 186, so the board is
40 + 186 = **226 rows**. This still satisfies the gate (≥100 rows, full
watchlist coverage). Reaching 240 would require either CEX/versioned rows or
pre-token protocols above the floor that the watchlist rule excluded as
wrapped/staked/bridged products — neither was taken.

## Top 10 rows (slug — implied value)

1. steakhouse-financial — $396,662,979 (Risk Curators, mult 0.1689*)
2. gauntlet — $236,242,849 (Risk Curators, mult 0.1689*)
3. usdd — $150,346,785 (CDP, mult 0.1687)
4. bittensor-dtao — $77,264,755 (Dexs, mult 0.3424)
5. veda — $67,238,065 (Onchain Capital Allocator, mult 0.05†)
6. onre — $66,095,536 (RWA, mult 0.2748)
7. opentrade — $58,775,428 (RWA, mult 0.2748)
8. plume-vaults — $54,001,113 (RWA, mult 0.2748)
9. nonce-capital — $51,906,592 (Risk Curators, mult 0.1689*)
10. r25 — $37,428,357 (RWA, mult 0.2748)

\* Risk Curators has 0 live protocols → falls back to the global median 0.1689.
† Onchain Capital Allocator has 3 live protocols with median 0.0059, clamped
up to the 0.05 floor.

## Model constants (radar-2-comps)

- Category multiple: per-category median `mcap/tvl` over live protocols;
  <3 live → global median; clamp `[0.05, 3.0]`. Global median: **0.1689**
  (144 live protocols).
- Growth: `1 + clamp(change_7d ?? 0, -60, 120)/100 × 0.5`.
- Maturity: `0.6 + min(age_days ?? 365, 1095)/1095 × 0.4`.
- Breadth: `1 + min(max(chains − 1, 0), 4) × 0.02`.
- Implied: `max(1, round(tvl × multiple × growth × maturity × breadth))`,
  capped at $100,000,000,000,000.

## Farm-plan diversity

12 category templates (lending/CDP, DEX/AMM, perps/derivatives, bridge,
staking/restaking, RWA, stablecoin, prediction, curator/vault, insurance,
yield, default). Verified after normalising out name/capital/chain/hold:
**13 distinct opening-step texts** (12 templates + 1 normalisation artefact
where a protocol's name equals its chain), **12 distinct weekly actions** and
**12 distinct claim checks**. Capital tiers $50/$100/$150/$250 by TVL;
opening gas $2–$8 by tier; hold 60/45/30 days by age.

## Sizes (gate caps) — v2, coordinator 14 Nov ~18:25 WIB

- board.json 359,356 bytes (cap 8 MiB). data.js 355,941 bytes.
- Dashboard source: index.html 9,426 + app.css 13,451 + app.js 30,208 =
  **53,085 bytes** (guidance < 64 KB); 0 external URLs (`grep http` = 0).
- dossier.json **1,121,176 bytes** (cap 1.5 MiB); dossier text **53,354 bytes**
  (cap 65,536) — complete, all 3 dashboard files whole, no "left out" line.
- Screenshots (validate-shots.py PASS): 1-board.png 250,091 B, 2-detail.png
  293,141 B, 3-filtered.png 256,196 B — all 1440×900, each < 512 KiB cap.
  Board shot shows 8 full rows + Farm column; detail shot shows the farm-plan
  glance + steps 1–2 above the fold (step 2 ends y≈838 < 900); filtered shot
  shows Risk Curators, "33 of 226 rows shown".
- out/ regenerated after the final dashboard edit so out/dashboard,
  out/screenshots and out/dossier.json match the repo files exactly.

## Repo state at handover

Files written by this builder: `main.ts`, `lib/model.ts`,
`vendor/makefun-board.ts` (verbatim copy, `cmp` clean), `LICENSE` (MIT,
SPDX line present), `.makefun/owner.json`, `README.md`, `VALIDATION.md`.
The dashboard builder's files (`dashboard/`, repo-root `data.js`,
`screenshots/`) were not touched. At handover `screenshots/` is still empty,
so a repo-dir end-to-end run of `main.ts` will still stop at the
"hand in 3 screenshots" check after writing `board.json`/`data.js` — that
resolves once the dashboard builder lands the 3 screenshots; no model change
is needed for it.

## Revisions made after first validation

1. `lib/model.ts`: guard for a snapshot with zero live protocols — the
   global median now falls back to 0.25 instead of NaN (never triggers on
   this snapshot; outputs byte-identical before/after).
2. `main.ts`: warns on stderr if any watchlist slug is no longer pre-token
   (still covered on the board, never dropped); stdout now also reports the
   model version, global median multiple and top implied value.
