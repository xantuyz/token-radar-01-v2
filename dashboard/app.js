// Token Radar dashboard — vanilla JS, no network, no framework.
// Reads window.RADAR (data.js) and renders the board, filters, detail panel,
// live-token table and methodology. The model contract is radar-2-comps:
// each row may carry row.model {category_multiple, growth_pct, growth_multiplier,
// maturity_multiplier, breadth_multiplier} and row.farm_steps (6 strings).
// When those fields are absent (starter data), the page falls back to the
// row-level multipliers and the shared constants in DATA.model, and derives
// the farm plan from category / chains / TVL / age — never from a name.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA || !Array.isArray(DATA.rows)) {
    document.body.innerHTML = '<main style="padding:48px;font-family:monospace;color:#dbe7e2;background:#0a0e12">'
      + 'Token Radar: no data loaded. data.js was not found beside this page.</main>';
    return;
  }

  var FLOOR = DATA.floor_usd || 50000000;
  var M = DATA.model || {};
  var state = { q: '', category: 'all', tab: 'all', sort: 'implied', dir: -1, selected: null };

  /* ---------- formatting ---------- */
  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function formatUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var a = Math.abs(n);
    if (a >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function formatPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function formatAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function formatMult(n, digits) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    return '×' + n.toFixed(digits === undefined ? 3 : digits);
  }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function chainsOf(r, n) {
    var c = r.chains || [];
    if (!c.length) return 'an unnamed chain';
    return c.slice(0, n || 2).join(', ') + (c.length > (n || 2) ? ' +' + (c.length - (n || 2)) : '');
  }

  /* ---------- model: per-row breakdown, with fallbacks ---------- */
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function modelOf(row) {
    var m = row.model || {};
    var growthPct = m.growth_pct !== undefined ? m.growth_pct
      : (row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d);
    var growthMult = m.growth_multiplier !== undefined ? m.growth_multiplier
      : (row.growth_multiplier !== undefined ? row.growth_multiplier
        : 1 + (clamp(growthPct, M.growth_floor !== undefined ? M.growth_floor : -60,
            M.growth_cap !== undefined ? M.growth_cap : 120) / 100)
            * (M.growth_weight !== undefined ? M.growth_weight : 0.5));
    var age = row.age_days === null || row.age_days === undefined
      ? (M.unknown_age_days !== undefined ? M.unknown_age_days : 365) : row.age_days;
    var maturityMult = m.maturity_multiplier !== undefined ? m.maturity_multiplier
      : (row.maturity_multiplier !== undefined ? row.maturity_multiplier
        : (M.maturity_floor || 0.6) + (Math.min(Math.max(age, 0), M.maturity_days || 1095)
            / (M.maturity_days || 1095)) * (M.maturity_range || 0.4));
    return {
      category_multiple: m.category_multiple !== undefined ? m.category_multiple : null,
      growth_pct: growthPct,
      growth_multiplier: growthMult,
      maturity_multiplier: maturityMult,
      breadth_multiplier: m.breadth_multiplier !== undefined ? m.breadth_multiplier : null,
      age_used: age
    };
  }
  // Recompute implied value from the breakdown, to show the page and the
  // data agree. Returns null when a factor is unknown (no category multiple).
  function recomputeImplied(row, mo) {
    var cat = mo.category_multiple !== null ? mo.category_multiple : (M.base_multiple || 0.25);
    var breadth = mo.breadth_multiplier !== null ? mo.breadth_multiplier : 1;
    return Math.max(1, Math.round(row.tvl_usd * cat * mo.growth_multiplier * mo.maturity_multiplier * breadth));
  }

  /* ---------- comparables: median mcap/TVL of live protocols ---------- */
  function median(nums) {
    if (!nums.length) return null;
    var s = nums.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }
  var compByCategory = {};
  (function buildComparables() {
    var supplied = DATA.comparables || [];
    supplied.forEach(function (c) {
      compByCategory[c.category] = { median_multiple: c.median_multiple, live_count: c.live_count, top: [] };
    });
    var byCat = {};
    (DATA.live || []).forEach(function (r) {
      if (!r.tvl_usd || !r.mcap_usd) return;
      var cat = r.category || 'Other';
      (byCat[cat] = byCat[cat] || []).push(r);
    });
    Object.keys(byCat).forEach(function (cat) {
      var list = byCat[cat];
      var med = median(list.map(function (r) { return r.mcap_usd / r.tvl_usd; }));
      var top = list.slice().sort(function (a, b) { return b.mcap_usd - a.mcap_usd; }).slice(0, 3)
        .map(function (r) { return { name: r.name, slug: r.slug, mcap_usd: r.mcap_usd, multiple: r.mcap_usd / r.tvl_usd }; });
      if (!compByCategory[cat]) compByCategory[cat] = { median_multiple: med, live_count: list.length, top: top };
      else { compByCategory[cat].top = top; if (compByCategory[cat].live_count === undefined) compByCategory[cat].live_count = list.length; }
    });
  })();
  function comparablesFor(category) {
    var c = compByCategory[category || 'Other'];
    if (c) return c;
    var all = (DATA.live || []).filter(function (r) { return r.tvl_usd && r.mcap_usd; });
    return { median_multiple: median(all.map(function (r) { return r.mcap_usd / r.tvl_usd; })), live_count: 0, top: [] };
  }

  /* ---------- farm steps: use data.js, else derive from the row ---------- */
  function chainMain(r) { return (r.chains && r.chains.length) ? r.chains[0] : 'its main chain'; }
  function capitalFor(r) {
    if (r.tvl_usd >= 5e9) return 250;
    if (r.tvl_usd >= 1e9) return 150;
    if (r.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  // Opening-transaction gas for a capital tier (same tiers as the model's
  // gasFor: $8/$6/$4/$2). Used only for the at-a-glance estimate below.
  function gasFor(capital) {
    if (capital >= 250) return 8;
    if (capital >= 150) return 6;
    if (capital >= 100) return 4;
    return 2;
  }
  // Farm totals for one row, from its own TVL and age: capital tier,
  // hold days, step count, and an estimated gas total (first transaction
  // under $3 + opening gas + about $2 a week over the hold window).
  function farmTotals(r) {
    var capital = capitalFor(r);
    var hold = holdDaysFor(r.age_days);
    return {
      capital: capital,
      hold: hold,
      steps: farmSteps(r).length,
      gas: 3 + gasFor(capital) + 2 * Math.ceil(hold / 7)
    };
  }
  function actionFor(r, capital, chain) {
    var c = (r.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0)
      return 'Supply $' + capital + ' of USDC to ' + r.name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0)
      return 'Provide $' + capital + ' of liquidity to ' + r.name + '\u2019s main pool on ' + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0)
      return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + r.name + ' and use the bridged funds in its app.';
    if (c.indexOf('stak') >= 0 || c.indexOf('restak') >= 0)
      return 'Stake $' + capital + ' of the chain\u2019s staking asset through ' + r.name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0)
      return 'Deposit $' + capital + ' of USDC as margin on ' + r.name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0)
      return 'Fund $' + capital + ' and place one market position on ' + r.name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0)
      return 'Deposit $' + capital + ' into a ' + r.name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0)
      return 'Mint or deposit $' + capital + ' of the stable asset through ' + r.name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0)
      return 'Mint $' + capital + ' of the protocol\u2019s yield asset on ' + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0)
      return 'Buy $' + capital + ' of cover from ' + r.name + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + capital + ' of USDC into ' + r.name + ' on ' + chain + ' and keep the position open.';
  }
  function derivedFarmSteps(r) {
    var chain = chainMain(r), capital = capitalFor(r), hold = holdDaysFor(r.age_days);
    return [
      'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. Cost: under $3 of gas for the first transaction. Time: 5 minutes.',
      actionFor(r, capital, chain) + ' Cost: $' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas. Time: 15 minutes to set up.',
      'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote. Cost: about $2 of gas a week. Time: 10 minutes a week.',
      'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot. Cost: the $' + capital + ' stays in the position. Time: ' + hold + ' days.',
      'Before you withdraw, open the protocol\u2019s own points or rewards page and claim only from the link it publishes. Cost: no fee to check, and never pay to claim. Time: 10 minutes.',
      'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it. Cost: nothing but the log. Time: 5 minutes.'
    ];
  }
  function farmSteps(r) {
    if (Array.isArray(r.farm_steps) && r.farm_steps.length) return r.farm_steps;
    return derivedFarmSteps(r);
  }
  // Split a farm step into action / cost / time when it carries the markers.
  function splitStep(s) {
    var out = { action: s, cost: '', time: '' };
    var ci = s.indexOf(' Cost: ');
    if (ci >= 0) { out.action = s.slice(0, ci); var rest = s.slice(ci + 7); var ti = rest.indexOf(' Time: '); if (ti >= 0) { out.cost = rest.slice(0, ti); out.time = rest.slice(ti + 7); } else out.cost = rest; }
    return out;
  }

  /* ---------- filtering + sorting ---------- */
  function isWatchlist(r) { return r.tvl_usd >= FLOOR; }
  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.tab === 'watchlist' && !isWatchlist(r)) return false;
      if (state.tab === 'early' && isWatchlist(r)) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortRows(list) {
    var key = state.sort, dir = state.dir;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'farm') { av = capitalFor(a); bv = capitalFor(b); }
      else if (key === 'rank') { av = a.rank; bv = b.rank; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }
  function sortBy(key) {
    if (state.sort === key) state.dir = -state.dir;
    else { state.sort = key; state.dir = key === 'name' ? 1 : -1; }
    renderBoard();
  }

  /* ---------- board rendering ---------- */
  var boardBody = document.getElementById('board-body');
  var emptyBox = document.getElementById('empty');
  var countEl = document.getElementById('count');
  function renderBoard() {
    var list = sortRows(filteredRows());
    var max = 1;
    DATA.rows.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var html = '';
    list.forEach(function (r) {
      var g = r.change_7d === null ? 'n/a' : formatPct(r.change_7d);
      var gc = r.change_7d === null ? '' : (r.change_7d >= 0 ? 'pos' : 'neg');
      var pct = Math.max(3, Math.round((r.implied_value_usd / max) * 100));
      var ft = farmTotals(r);
      html += '<tr data-slug="' + esc(r.slug) + '" data-selected="' + (state.selected === r.slug) + '" tabindex="0">'
        + '<td class="num">' + r.rank + '</td>'
        + '<td><div class="name"><b>' + esc(r.name) + '</b><span class="sub">' + esc(r.category || 'Other') + ' · ' + esc(chainsOf(r)) + '</span></div></td>'
        + '<td class="num">' + formatUsd(r.tvl_usd) + '</td>'
        + '<td class="num ' + gc + '">' + g + '</td>'
        + '<td class="num">' + formatAge(r.age_days) + '</td>'
        + '<td><div class="implied"><div class="bar" aria-hidden="true"><i style="width:' + pct + '%"></i></div><span class="num">' + formatUsd(r.implied_value_usd) + '</span></div></td>'
        + '<td class="num farm-cell"><b>$' + ft.capital + '</b> · ' + ft.hold + 'd · ' + ft.steps + ' steps</td>'
        + '<td><span class="badge' + (isWatchlist(r) ? '' : ' early') + '">' + (isWatchlist(r) ? 'no token' : 'no token · early') + '</span></td>'
        + '</tr>';
    });
    boardBody.innerHTML = html;
    emptyBox.hidden = list.length !== 0;
    countEl.innerHTML = '<b>' + list.length + '</b> of ' + DATA.rows.length + ' rows shown';
    document.querySelectorAll('.th-btn').forEach(function (btn) {
      var k = btn.getAttribute('data-sort');
      btn.classList.toggle('active', state.sort === k);
      var arrow = btn.querySelector('.arrow');
      if (arrow) arrow.textContent = state.sort === k ? (state.dir < 0 ? '▼' : '▲') : '';
    });
    document.querySelectorAll('.tabs button').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-tab') === state.tab ? 'true' : 'false');
    });
  }

  /* ---------- detail view ---------- */
  var detailEmpty = document.getElementById('detail-empty');
  var detailBody = document.getElementById('detail-body');
  function showDetail(slug) {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    if (!row) { closeDetail(); return; }
    state.selected = slug;
    var mo = modelOf(row);
    var recomputed = recomputeImplied(row, mo);
    var comp = comparablesFor(row.category);
    var steps = farmSteps(row);
    var catMult = mo.category_multiple !== null ? mo.category_multiple : (M.base_multiple || 0.25);
    var catLabel = mo.category_multiple !== null ? 'Category multiple (median live mcap/TVL)' : 'Base multiple (no category multiple in data)';
    var breadth = mo.breadth_multiplier;
    var rowsHtml = ''
      + calcRow('TVL — value locked in the protocol', formatUsd(row.tvl_usd), '')
      + calcRow(catLabel, formatMult(catMult, 3), 'mult')
      + calcRow('Growth — ' + formatPct(mo.growth_pct) + ' over 7 days, clamped to [' + (M.growth_floor !== undefined ? M.growth_floor : -60) + ', ' + (M.growth_cap !== undefined ? M.growth_cap : 120) + ']%', formatMult(mo.growth_multiplier, 4), 'mult')
      + calcRow('Maturity — ' + formatAge(row.age_days) + ' listed' + (row.age_days === null ? ' (unknown age, ' + mo.age_used + 'd used)' : ''), formatMult(mo.maturity_multiplier, 4), 'mult')
      + (breadth !== null
          ? calcRow('Breadth — ' + (row.chains || []).length + ' chain' + ((row.chains || []).length === 1 ? '' : 's'), formatMult(breadth, 3), 'mult')
          : '')
      + '<div class="calc-row total"><span class="lab">Implied value = TVL × category × growth × maturity' + (breadth !== null ? ' × breadth' : '') + '</span><span class="val">' + formatUsd(row.implied_value_usd) + '</span></div>';
    var checkHtml = recomputed === null ? ''
      : (Math.abs(recomputed - row.implied_value_usd) <= Math.max(1, row.implied_value_usd * 0.01)
        ? '<p class="check ok">✓ Recomputed from the factors above: ' + formatUsd(recomputed) + ' — matches the board (within rounding of the published multipliers).</p>'
        : '<p class="check warn">Recomputed from the factors above: ' + formatUsd(recomputed) + ' — differs from the board value; the breakdown uses the data as supplied.</p>');
    var compRows = '';
    comp.top.forEach(function (t) {
      compRows += '<tr><td>' + esc(t.name) + '</td><td class="num">' + formatUsd(t.mcap_usd) + '</td><td class="num">' + formatMult(t.multiple, 2) + '</td></tr>';
    });
    function stepItem(s) {
      var p = splitStep(s);
      return '<li><div><b>' + esc(p.action) + '</b>'
        + (p.cost || p.time ? '<div class="cost">' + (p.cost ? 'Cost: <span>' + esc(p.cost) + '</span>' : '') + (p.cost && p.time ? ' · ' : '') + (p.time ? 'Time: <span>' + esc(p.time) + '</span>' : '') + '</div>' : '')
        + '</div></li>';
    }
    var stepsHtml = steps.map(stepItem).join('');
    var glanceStepsHtml = steps.slice(0, 2).map(stepItem).join('');
    var ft = farmTotals(row);
    var glanceHtml = '<div class="detail-section"><h3>Farm plan at a glance</h3>'
      + '<div class="glance-grid">'
      + '<div class="glance"><span>Capital</span><b class="hl">$' + ft.capital + '</b></div>'
      + '<div class="glance"><span>Est. gas total</span><b>≈$' + ft.gas + '</b></div>'
      + '<div class="glance"><span>Hold</span><b>' + ft.hold + ' days</b></div>'
      + '<div class="glance"><span>Steps</span><b>' + ft.steps + '</b></div>'
      + '</div>'
      + '<ol class="steps mini">' + glanceStepsHtml + '</ol>'
      + '<p class="comp-note">Full plan below — ' + ft.steps + ' steps with cost and time each. Gas total is an estimate: first transaction under $3, about $' + gasFor(ft.capital) + ' to open, about $2 a week over ' + Math.ceil(ft.hold / 7) + ' weeks of holding.</p></div>';
    detailBody.innerHTML = ''
      + '<div class="detail-head"><div><span class="kicker">Rank ' + row.rank + ' of ' + DATA.board_size + ' · ' + (isWatchlist(row) ? 'Watchlist' : 'Early radar') + '</span>'
      + '<h2>' + esc(row.name) + '</h2>'
      + '<p class="sub">' + esc(row.category || 'Other') + ' · ' + esc(chainsOf(row, 4)) + ' · listed ' + esc(row.listed_at || 'unknown') + '</p></div>'
      + '<button class="close" type="button" id="detail-close" aria-label="Close details">✕</button></div>'
      + glanceHtml
      + '<div class="detail-section"><h3>Facts</h3><div class="fact-grid">'
      + '<div class="fact"><span>TVL</span><b>' + formatUsd(row.tvl_usd) + '</b></div>'
      + '<div class="fact"><span>7d change</span><b class="' + (row.change_7d !== null && row.change_7d < 0 ? 'neg' : 'pos') + '">' + formatPct(row.change_7d) + '</b></div>'
      + '<div class="fact"><span>No-token age</span><b>' + formatAge(row.age_days) + '</b></div>'
      + '<div class="fact"><span>Chains</span><b>' + (row.chains || []).length + '</b></div>'
      + '<div class="fact"><span>Token status</span><b>records no token</b></div>'
      + '<div class="fact"><span>Implied</span><b class="hl">' + formatUsd(row.implied_value_usd) + '</b></div>'
      + '</div></div>'
      + '<div class="detail-section"><h3>Model breakdown — step by step</h3><div class="calc">' + rowsHtml + '</div>' + checkHtml + '</div>'
      + '<div class="detail-section"><h3>Category comparables — ' + esc(row.category || 'Other') + '</h3>'
      + '<table class="comp-table"><thead><tr><th scope="col">Live protocol</th><th scope="col">Market cap</th><th scope="col">Mcap / TVL</th></tr></thead><tbody>'
      + (compRows || '<tr><td colspan="3" class="sub">No live comparables in this category — the board-wide median is used instead.</td></tr>')
      + '</tbody></table>'
      + '<p class="comp-note">Median multiple for this category: <b class="num">' + formatMult(comp.median_multiple, 3) + '</b> across <b class="num">' + comp.live_count + '</b> live-token protocol' + (comp.live_count === 1 ? '' : 's') + '. Multiples are market cap divided by TVL, from the snapshot.</p></div>'
      + '<div class="detail-section"><h3>Farm plan — 6 steps</h3><ol class="steps">' + stepsHtml + '</ol>'
      + '<p class="comp-note">Steps are derived from this protocol\u2019s category, chains, TVL and age. Never pay to claim, and verify every link on the protocol\u2019s own page.</p></div>';
    detailEmpty.hidden = true;
    detailBody.hidden = false;
    document.getElementById('detail-close').addEventListener('click', closeDetail);
    renderBoard();
    var detailEl = document.getElementById('detail');
    if (detailEl && typeof detailEl.scrollIntoView === 'function') detailEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function calcRow(label, value, cls) {
    return '<div class="calc-row"><span class="lab">' + label + '</span><span class="val' + (cls ? ' ' + cls : '') + '">' + value + '</span></div>';
  }
  function closeDetail() {
    state.selected = null;
    detailBody.hidden = true;
    detailEmpty.hidden = false;
    detailBody.innerHTML = '';
    renderBoard();
    setHash();
  }

  /* ---------- live section ---------- */
  function renderLive() {
    var live = (DATA.live || []).slice().sort(function (a, b) { return b.mcap_usd - a.mcap_usd; });
    var html = '';
    live.forEach(function (r) {
      var mult = (r.tvl_usd && r.mcap_usd) ? r.mcap_usd / r.tvl_usd : null;
      html += '<tr><td><div class="name"><b>' + esc(r.name) + '</b><span class="sub">' + esc((r.chains || []).slice(0, 2).join(', ')) + '</span></div></td>'
        + '<td>' + esc(r.category || 'Other') + '</td>'
        + '<td class="num">' + formatUsd(r.tvl_usd) + '</td>'
        + '<td class="num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg') + '">' + formatPct(r.change_7d) + '</td>'
        + '<td class="num">' + formatUsd(r.mcap_usd) + '</td>'
        + '<td class="num">' + formatMult(mult, 2) + '</td></tr>';
    });
    document.getElementById('live-body').innerHTML = html;
    document.getElementById('live-count').textContent = live.length + ' protocols · market caps';
  }

  /* ---------- header, facts, methodology ---------- */
  function renderStatic() {
    document.getElementById('meta-asof').textContent = 'Snapshot ' + (DATA.as_of || '—');
    document.getElementById('meta-model').textContent = (DATA.model_version || 'model') + ' model';
    var src = (DATA.source || '').replace(/^DefiLlama\s*/, '');
    document.getElementById('foot-source').textContent = 'Source: ' + (DATA.source || 'DefiLlama protocol index');
    document.getElementById('floor-text').textContent = formatUsd(FLOOR);
    var watchN = DATA.rows.filter(isWatchlist).length;
    var top = DATA.rows[0];
    document.getElementById('facts').innerHTML = ''
      + '<div class="fact"><span>Watchlist covered</span><b><span class="hl">' + watchN + '</span> / ' + (DATA.watchlist_size || watchN) + '</b></div>'
      + '<div class="fact"><span>Pre-token rows scored</span><b>' + (DATA.board_size || DATA.rows.length) + '</b></div>'
      + '<div class="fact"><span>Early rows below the floor</span><b>' + (DATA.early_size || 0) + '</b></div>'
      + '<div class="fact"><span>Live-token protocols set aside</span><b>' + (DATA.live_size || (DATA.live || []).length) + '</b></div>'
      + '<div class="fact"><span>Top implied</span><b>' + (top ? formatUsd(top.implied_value_usd) + ' · ' + esc(top.name) : '—') + '</b></div>';
    document.getElementById('n-all').textContent = DATA.rows.length;
    document.getElementById('n-watch').textContent = watchN;
    document.getElementById('n-early').textContent = DATA.rows.length - watchN;
    var hasCat = DATA.rows.some(function (r) { return r.model && r.model.category_multiple !== undefined; })
      || DATA.rows.some(function (r) { return r.model && r.model.breadth_multiplier !== undefined; });
    var f = hasCat
      ? 'implied = round( tvl_usd × category_multiple × (1 + clamp(change_7d, ' + (M.growth_floor !== undefined ? M.growth_floor : -60) + ', ' + (M.growth_cap !== undefined ? M.growth_cap : 120) + ') / 100 × ' + (M.growth_weight !== undefined ? M.growth_weight : 0.5) + ') × (' + (M.maturity_floor || 0.6) + ' + min(age_days, ' + (M.maturity_days || 1095) + ') / ' + (M.maturity_days || 1095) + ' × ' + (M.maturity_range || 0.4) + ') × breadth_multiplier )'
      : 'implied = round( tvl_usd × ' + (M.base_multiple !== undefined ? M.base_multiple : 0.25) + ' × (1 + clamp(change_7d, ' + (M.growth_floor !== undefined ? M.growth_floor : -60) + ', ' + (M.growth_cap !== undefined ? M.growth_cap : 120) + ') / 100 × ' + (M.growth_weight !== undefined ? M.growth_weight : 0.5) + ') × (' + (M.maturity_floor || 0.6) + ' + min(age_days, ' + (M.maturity_days || 1095) + ') / ' + (M.maturity_days || 1095) + ' × ' + (M.maturity_range || 0.4) + ') )';
    document.getElementById('formula').textContent = f;
    document.getElementById('disclaimer').textContent = 'Snapshot ' + (DATA.as_of || '') + ' · floor ' + formatUsd(FLOOR) + ' · model ' + (DATA.model_version || '')
      + '. Implied value is this entry\u2019s claim, computed from the snapshot above; it is not a market price, not a prediction that a token will be issued, and not financial advice. '
      + '“Records no token” means the snapshot\u2019s DefiLlama record carries no market cap, no CoinGecko id and no symbol — the record is not proof that no token exists.';
  }

  /* ---------- controls ---------- */
  function fillCategories() {
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var sel = document.getElementById('category');
    sel.innerHTML = '<option value="all">All categories (' + cats.length + ')</option>'
      + cats.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join('');
  }
  function applyFilter() { renderBoard(); setHash(); }
  document.getElementById('q').addEventListener('input', function (e) { state.q = e.target.value; applyFilter(); });
  document.getElementById('category').addEventListener('change', function (e) { state.category = e.target.value; applyFilter(); });
  document.querySelectorAll('.tabs button').forEach(function (btn) {
    btn.addEventListener('click', function () { state.tab = btn.getAttribute('data-tab'); applyFilter(); });
  });
  document.querySelectorAll('.th-btn').forEach(function (btn) {
    btn.addEventListener('click', function () { sortBy(btn.getAttribute('data-sort')); });
  });
  document.getElementById('clear-filters').addEventListener('click', function () {
    state.q = ''; state.category = 'all'; state.tab = 'all';
    document.getElementById('q').value = '';
    document.getElementById('category').value = 'all';
    applyFilter();
  });
  boardBody.addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (tr) showDetail(tr.getAttribute('data-slug'));
  });
  boardBody.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr[data-slug]')) {
      e.preventDefault();
      showDetail(e.target.getAttribute('data-slug'));
    }
  });

  /* ---------- hash routing: #/detail/<slug> and #/filter/<category|watchlist|early> ---------- */
  function setHash() {
    var h = '';
    if (state.selected) h = '#/detail/' + encodeURIComponent(state.selected);
    else if (state.tab !== 'all') h = '#/filter/' + state.tab;
    else if (state.category !== 'all') h = '#/filter/' + encodeURIComponent(state.category);
    if (window.location.hash !== h) {
      try {
        if (h) window.history.replaceState(null, '', h);
        else window.history.replaceState(null, '', window.location.pathname + window.location.search);
      } catch (err) { /* history unavailable (e.g. sandboxed file view): the page still works */ }
    }
  }
  function readHash() {
    var h = window.location.hash || '';
    var m = h.match(/^#\/detail\/([^/?#]+)/);
    if (m) { state.selected = decodeURIComponent(m[1]); return; }
    var f = h.match(/^#\/filter\/([^/?#]+)/);
    if (f) {
      var v = decodeURIComponent(f[1]);
      if (v === 'watchlist' || v === 'early') { state.tab = v; state.category = 'all'; }
      else if (v === 'all') { state.tab = 'all'; state.category = 'all'; }
      else { state.category = v; state.tab = 'all'; }
    }
  }
  window.addEventListener('hashchange', function () {
    var prev = state.selected;
    readHash();
    if (state.selected && state.selected !== prev) showDetail(state.selected);
    else if (!state.selected && prev) closeDetail();
    else applyFilter();
    document.getElementById('q').value = state.q;
    document.getElementById('category').value = state.category;
  });

  /* ---------- boot ---------- */
  fillCategories();
  renderStatic();
  renderLive();
  readHash();
  document.getElementById('category').value = state.category;
  renderBoard();
  if (state.selected) showDetail(state.selected);
})();
