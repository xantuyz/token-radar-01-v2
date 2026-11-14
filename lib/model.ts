// Token Radar's model, radar-2-comps: comparables-based implied value.
//
// A protocol with no token on record is scored from the snapshot's own figures only. The value
// multiple is not a flat constant: for each category, the live (token-trading) protocols in that
// category give the market's own mcap/TVL multiple, and the model takes their MEDIAN. A category
// with fewer than 3 live protocols falls back to the global median over all live protocols, so a
// thin category never inherits one outlier's multiple. The multiple is clamped to [0.05, 3.0].
//
//   categoryMultiple = clamp(median(mcap_usd / tvl_usd over live in category), 0.05, 3.0)
//   growthMult       = 1 + clamp(change_7d ?? 0, -60, 120) / 100 * 0.5
//   maturityMult     = 0.6 + min(age_days ?? 365, 1095) / 1095 * 0.4
//   breadthMult      = 1 + min(max(chains.length - 1, 0), 4) * 0.02
//   implied          = max(1, round(tvl_usd * categoryMultiple * growthMult * maturityMult * breadthMult))
//
// No protocol name is ever special-cased: the same function scores every row, and every input is
// a field the snapshot carries (category, chains, TVL, 7-day change, listed date).

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  multiple_floor: number;
  multiple_cap: number;
  min_live_per_category: number;
  breadth_step: number;
  breadth_max_extra_chains: number;
  implied_cap: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  multiple_floor: 0.05,
  multiple_cap: 3.0,
  min_live_per_category: 3,
  breadth_step: 0.02,
  breadth_max_extra_chains: 4,
  implied_cap: 100_000_000_000_000,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2-comps';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 200;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One row's model breakdown: every multiplier the implied value is built from. */
export interface ModelBreakdown {
  category_multiple: number;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  age_days: number | null;
}

/** One category's comparables: the live protocols the multiple is taken from. */
export interface Comparable {
  category: string;
  live_count: number;
  median_multiple: number;
  applied_multiple: number;
  fallback_to_global: boolean;
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: ModelBreakdown;
  farm_steps: string[];
}

/** A board row's full form for data.js, with the farm plan included. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  model: ModelBreakdown;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, the comparables and the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  global_median_multiple: number;
  comparables: Comparable[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The median of a non-empty list of numbers; NaN when the list is empty. */
function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Clamp a multiple into the model's [multiple_floor, multiple_cap] band. */
function clampMultiple(value: number, model: ModelConstants): number {
  return Math.min(model.multiple_cap, Math.max(model.multiple_floor, value));
}

/**
 * The comparables table: for every category with at least one live protocol, the median
 * mcap/TVL multiple of that category's live protocols, clamped. Categories with fewer than
 * `min_live_per_category` live protocols fall back to the global median over all live protocols.
 * The global median itself is the clamped median over every live protocol in the snapshot.
 */
export function comparablesFor(snapshot: Snapshot, model: ModelConstants = MODEL): { comparables: Comparable[]; globalMedian: number } {
  const live = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.tvl_usd > 0);
  // A snapshot with no live protocol at all has no market to learn a multiple from; fall back to a
  // neutral 0.25 so the board still ranks by TVL instead of collapsing to NaN.
  const rawGlobal = median(live.map((p) => (p.mcap_usd as number) / p.tvl_usd));
  const globalMedian = clampMultiple(Number.isFinite(rawGlobal) ? rawGlobal : 0.25, model);
  const byCategory = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? 'Other';
    const list = byCategory.get(key) ?? [];
    list.push((p.mcap_usd as number) / p.tvl_usd);
    byCategory.set(key, list);
  }
  const comparables: Comparable[] = [...byCategory.entries()]
    .map(([category, multiples]) => {
      const raw = median(multiples);
      const fallback = multiples.length < model.min_live_per_category;
      return {
        category,
        live_count: multiples.length,
        median_multiple: round4(clampMultiple(raw, model)),
        applied_multiple: round4(fallback ? globalMedian : clampMultiple(raw, model)),
        fallback_to_global: fallback,
      };
    })
    .sort((a, b) => (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));
  return { comparables, globalMedian: round4(globalMedian) };
}

/** The category multiple one protocol is scored with, from the comparables table. */
export function categoryMultipleFor(protocol: SnapshotProtocol, comparables: Comparable[], globalMedian: number): number {
  const key = protocol.category ?? 'Other';
  const row = comparables.find((c) => c.category === key);
  if (row === undefined) return globalMedian;
  return row.applied_multiple;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  comparables: Comparable[],
  globalMedian: number,
  model: ModelConstants = MODEL,
): { implied: number; breakdown: ModelBreakdown } {
  const age = ageDays(asOf, protocol.listed_at);
  const categoryMultiple = categoryMultipleFor(protocol, comparables, globalMedian);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const extraChains = Math.min(Math.max(protocol.chains.length - 1, 0), model.breadth_max_extra_chains);
  const breadthMult = 1 + extraChains * model.breadth_step;
  const raw = protocol.tvl_usd * categoryMultiple * growthMult * maturityMult * breadthMult;
  const implied = Math.min(model.implied_cap, Math.max(1, Math.round(raw)));
  return {
    implied,
    breakdown: {
      category_multiple: round4(categoryMultiple),
      growth_pct: round4(growthPct),
      growth_multiplier: round4(growthMult),
      maturity_multiplier: round4(maturityMult),
      breadth_multiplier: round4(breadthMult),
      age_days: age,
    },
  };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const { comparables, globalMedian } = comparablesFor(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug is covered, even one whose record no longer looks
  // pre-token (coverage is the gate's row and is never gambled on a missing or changed record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: rankable pre-token protocols below the watchlist floor, by TVL, capped.
  // Never a replacement for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const { implied, breakdown } = impliedValue(p, snapshot.as_of, comparables, globalMedian, model);
    return { p, implied, breakdown };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.breakdown.age_days,
    implied_value_usd: s.implied,
    model: s.breakdown,
    farm_steps: farmSteps(s.p, s.breakdown.age_days).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** Gas for the opening transaction, from the capital tier: $2 to $8. */
function gasFor(capital: number): number {
  if (capital >= 250) return 8;
  if (capital >= 150) return 6;
  if (capital >= 100) return 4;
  return 2;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/**
 * One category's farm template: the opening position, the weekly qualifying action, the claim
 * check, and the thing the farmer holds. Twelve templates cover the snapshot's categories; the
 * default covers the rest. Every template's weekly action and claim check are written for that
 * category's own mechanics, not a shared sentence with a name swapped in.
 */
interface FarmTemplate {
  asset: string;
  deposit: (name: string, chain: string, capital: number) => string;
  weekly: (name: string, chain: string, capital: number) => string;
  claim: (name: string) => string;
}

const TEMPLATES: Record<string, FarmTemplate> = {
  lending: {
    asset: 'borrow position',
    deposit: (name, chain, capital) => `Supply $${capital} of USDC to ${name} on ${chain} as collateral, then borrow a small amount against it and keep both legs of the position open.`,
    weekly: (name) => `Adjust the position once a week: repay a little of the borrow or top up collateral so the position stays healthy and active on ${name}.`,
    claim: (name) => `Open ${name}'s own points or rewards page and check the supply and borrow points the position has earned; claim only from the link it publishes.`,
  },
  dex: {
    asset: 'LP shares',
    deposit: (name, chain, capital) => `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} in a balanced pair and keep the LP shares.`,
    weekly: (name) => `Swap a small amount through the pool once a week and, if the price range drifted, rebalance the position back into range on ${name}.`,
    claim: (name) => `Open ${name}'s own points or rewards page and check the LP fees and points the position has earned; claim only from the link it publishes.`,
  },
  perps: {
    asset: 'margin balance',
    deposit: (name, chain, capital) => `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedged position, then leave the margin in place.`,
    weekly: (name) => `Place one small trade a week on ${name} and close it the same day, so trading volume accrues without leaving a large position open overnight.`,
    claim: (name) => `Open ${name}'s own trading-rewards page and check the volume points and fee rebates the account has earned; claim only from the link it publishes.`,
  },
  bridge: {
    asset: 'bridged funds',
    deposit: (name, chain, capital) => `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in an app on the destination chain.`,
    weekly: (name) => `Bridge a small amount back or onward once a week through ${name}, so the route stays active on both sides.`,
    claim: (name) => `Open ${name}'s own points page and check the bridging volume the wallet has earned; claim only from the link it publishes.`,
  },
  staking: {
    asset: 'staking receipt',
    deposit: (name, chain, capital) => `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the staking receipt token.`,
    weekly: (name) => `Restake the staking rewards once a week, or top up the stake with a small amount, so the stake on ${name} keeps growing.`,
    claim: (name) => `Open ${name}'s own rewards page and check the staking points and restaking rewards the receipt has earned; claim only from the link it publishes.`,
  },
  rwa: {
    asset: 'yield-bearing asset',
    deposit: (name, chain, capital) => `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it in the farm wallet.`,
    weekly: (name) => `Check the yield accrued once a week on ${name} and, if the protocol offers it, roll the yield back into the position.`,
    claim: (name) => `Open ${name}'s own rewards page and check the yield and points the holding has earned; claim only from the link it publishes.`,
  },
  stable: {
    asset: 'stable balance',
    deposit: (name, chain, capital) => `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it in the farm wallet.`,
    weekly: (name) => `Mint or redeem a small amount once a week through ${name} and keep a balance in the protocol so the position stays counted.`,
    claim: (name) => `Open ${name}'s own rewards page and check the stability and holding points the balance has earned; claim only from the link it publishes.`,
  },
  prediction: {
    asset: 'market position',
    deposit: (name, chain, capital) => `Fund $${capital} on ${name} on ${chain} and place one position in a market that resolves after at least a week.`,
    weekly: (name) => `Place one new market position a week on ${name}, in a different market each time, and let each resolve on its own.`,
    claim: (name) => `Open ${name}'s own markets page, collect any winnings, then check the trading points the account has earned; claim only from the link it publishes.`,
  },
  curator: {
    asset: 'vault shares',
    deposit: (name, chain, capital) => `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares.`,
    weekly: (name) => `Check the vault's allocation once a week on ${name} and, if a new vault opened, move a small part of the deposit to it.`,
    claim: (name) => `Open ${name}'s own vault-rewards page and check the points the vault shares have earned; claim only from the link it publishes.`,
  },
  insurance: {
    asset: 'cover policy',
    deposit: (name, chain, capital) => `Buy $${capital} of cover from ${name} on ${chain} for a protocol you already use, and keep the policy active.`,
    weekly: (name) => `Check the policy once a week on ${name} and, if cover is about to lapse, renew it before it expires.`,
    claim: (name) => `Open ${name}'s own rewards page and check the cover points the policy has earned; claim only from the link it publishes.`,
  },
  yield: {
    asset: 'strategy shares',
    deposit: (name, chain, capital) => `Deposit $${capital} into ${name}'s main yield strategy on ${chain} and keep the strategy shares.`,
    weekly: (name) => `Harvest the yield once a week on ${name} and compound it back into the same strategy.`,
    claim: (name) => `Open ${name}'s own rewards page and check the harvest and strategy points the deposit has earned; claim only from the link it publishes.`,
  },
  default: {
    asset: 'position',
    deposit: (name, chain, capital) => `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`,
    weekly: (name) => `Make one qualifying action each week on ${name}, such as a deposit, a swap or a vote, so the wallet stays active.`,
    claim: (name) => `Open ${name}'s own points or rewards page and check what the position has earned; claim only from the link it publishes.`,
  },
};

/** The farm template for a protocol, from its DefiLlama category alone. */
function templateFor(p: SnapshotProtocol): FarmTemplate {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return TEMPLATES.lending!;
  if (c.includes('dex') || c.includes('amm') || c.includes('liquidity manager')) return TEMPLATES.dex!;
  if (c.includes('perpetual') || c.includes('derivativ') || c.includes('basis') || c.includes('leveraged')) return TEMPLATES.perps!;
  if (c.includes('bridge')) return TEMPLATES.bridge!;
  if (c.includes('stak') || c.includes('restak')) return TEMPLATES.staking!;
  if (c.includes('rwa')) return TEMPLATES.rwa!;
  if (c.includes('stable')) return TEMPLATES.stable!;
  if (c.includes('prediction')) return TEMPLATES.prediction!;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk') || c.includes('index')) return TEMPLATES.curator!;
  if (c.includes('insurance')) return TEMPLATES.insurance!;
  if (c.includes('yield') || c.includes('farm')) return TEMPLATES.yield!;
  return TEMPLATES.default!;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list
 * of names. The opening position, the weekly action and the claim check all follow the
 * protocol's category template.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const gas = gasFor(capital);
  const hold = holdDaysFor(age);
  const t = templateFor(p);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. Keep the ${t.asset} receipt in this wallet, not your main one.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: t.deposit(p.name, chain, capital),
      cost: `$${capital} of capital and about $${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: t.weekly(p.name, chain, capital),
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the ${t.asset} for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: t.claim(p.name),
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction for this ${t.asset} in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's full form for data.js, with its model breakdown and farm plan. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    model: row.model,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const { comparables, globalMedian } = comparablesFor(snapshot, model);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    global_median_multiple: globalMedian,
    comparables,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (r.implied_value_usd > MODEL.implied_cap) return `${r.slug} has implied value above the cap`;
  }
  return null;
}

/** A data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
