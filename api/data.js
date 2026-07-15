'use strict';
// ═══════════════════════════════════════════════════════════════════
//  GREKO EGYPT  –  api/data.js  (Vercel Serverless)
//
//  Reads public/processed-data.json (v3 compact format).
//  NO XLSX parsing. Zero heavy dependencies.
//
//  Row format v3 (8 values):
//    [mo, cd, cu, t, rf_r, tn, ct, cp]
//     0   1   2   3  4     5   6   7
//  Derived at query time: yr (from array), qt, ca, pr, ch
// ═══════════════════════════════════════════════════════════════════

const fs   = require('fs');
const path = require('path');


const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_FULL  = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];

// ─────────────────────────────────────────────────────────────────
// v3 row column indices
// ─────────────────────────────────────────────────────────────────
const R = { mo:0, cd:1, cu:2, t:3, rf_r:4, tn:5, ct:6, cp:7 };

// ─────────────────────────────────────────────────────────────────
// Data loader — Vercel auto-bundles require()'d JSON files,
// so no includeFiles config needed in vercel.json.
// For local dev the same require() resolves from the filesystem.
// ─────────────────────────────────────────────────────────────────
let _cache = null;

function getProcessedData() {
  if (_cache) return _cache;

  try {
    // Primary: bundled alongside the function by Vercel's bundler
    _cache = require('../data/processed-data.json');
  } catch (e1) {
    try {
      // Fallback: legacy location
      _cache = require('../public/processed-data.json');
    } catch (e2) {
      throw new Error(
        `Cannot load processed-data.json. ` +
        `Primary error: ${e1.message}. Fallback error: ${e2.message}. ` +
        `Run: node scripts/processWorkbook.js`
      );
    }
  }

  const { version = 1, rows25, rows26, strings = [] } = _cache;
  console.log(`[api/data] v${version} | rows25=${rows25.length} rows26=${rows26.length} strings=${strings.length}`);
  return _cache;
}

// ─────────────────────────────────────────────────────────────────
// DAX Accumulator (THE single calculation engine — mirrors Power BI)
//
//   Partial Returns = SUM(ABS(Ton)) WHERE ref starts with 'R'
//   Return          = ABS(SUM(Ton WHERE Type='RINV') - Partial)
//   Sales           = SUM(Ton) - Partial - Return
//
//   Same logic applied to Ton, Carton, and Cups.
// ─────────────────────────────────────────────────────────────────
const newAcc = () => ({
  t_sum:0, t_partial:0, t_rinv:0,
  c_sum:0, c_partial:0, c_rinv:0,
  q_sum:0, q_partial:0, q_rinv:0,
});

function feed(acc, isRINV, rf_r, tn, ct, cp) {
  acc.t_sum += tn;  acc.c_sum += ct;  acc.q_sum += cp;
  if (rf_r) {
    acc.t_partial += Math.abs(tn);
    acc.c_partial += Math.abs(ct);
    acc.q_partial += Math.abs(cp);
  }
  if (isRINV) {
    acc.t_rinv += tn;
    acc.c_rinv += ct;
    acc.q_rinv += cp;
  }
}

function resolve(acc) {
  const tr = Math.abs(acc.t_rinv - acc.t_partial);
  const cr = Math.abs(acc.c_rinv - acc.c_partial);
  const qr = Math.abs(acc.q_rinv - acc.q_partial);
  return {
    ton:    { s: acc.t_sum - acc.t_partial - tr, r: tr, partial: acc.t_partial },
    carton: { s: acc.c_sum - acc.c_partial - cr, r: cr, partial: acc.c_partial },
    cups:   { s: acc.q_sum - acc.q_partial - qr, r: qr, partial: acc.q_partial },
  };
}

// ─────────────────────────────────────────────────────────────────
// Build pre-decoded lookups from the string table + maps
// Called once per cache lifetime (not per request)
// ─────────────────────────────────────────────────────────────────
function buildLookups(pd) {
  if (pd._lookups) return pd._lookups;
  const { strings, productMap, categoryMap, channelMap } = pd;

  // For each string ID, pre-compute its derived values
  const isRINV_arr = new Uint8Array(strings.length);   // 1 if type='RINV'
  const ch_arr     = new Array(strings.length);         // channel for customer IDs
  const ca_arr     = new Array(strings.length);         // category for product code IDs

  for (let i = 0; i < strings.length; i++) {
    const s = strings[i];
    isRINV_arr[i] = s === 'RINV' ? 1 : 0;
    ch_arr[i]     = channelMap[s]  || 'Other';
    ca_arr[i]     = categoryMap[s] || 'Unknown';
  }

  pd._lookups = { isRINV_arr, ch_arr, ca_arr };
  return pd._lookups;
}

// ─────────────────────────────────────────────────────────────────
// Aggregation engine
// ─────────────────────────────────────────────────────────────────
function aggregateRows(rows, monthSet, filters, lookups, strings) {
  const { chFilter, caFilter, cuFilter } = filters;
  const { isRINV_arr, ch_arr, ca_arr } = lookups;

  const total      = newAcc();
  const byMonth    = {};
  const byCategory = {};   // key: category string
  const byProduct  = {};   // key: cd (string ID)
  const byCustomer = {};   // key: cu (string ID)
  const byChannel  = {};   // key: channel string
  const custSet    = new Set();

  for (const r of rows) {
    const mo   = r[R.mo];
    if (!monthSet.has(mo)) continue;

    const cu   = r[R.cu];
    const ch   = ch_arr[cu];
    if (chFilter && ch !== chFilter)   continue;

    const cd   = r[R.cd];
    const ca   = ca_arr[cd];
    if (caFilter && ca !== caFilter)   continue;
    if (cuFilter !== undefined && cu !== cuFilter) continue;

    const tId  = r[R.t];
    const rf_r = r[R.rf_r];
    const tn   = r[R.tn];
    const ct   = r[R.ct];
    const cp   = r[R.cp];
    const rinv = isRINV_arr[tId];

    if (!byMonth[mo])    byMonth[mo]    = newAcc();
    if (!byCategory[ca]) byCategory[ca] = newAcc();
    if (!byProduct[cd])  byProduct[cd]  = newAcc();
    if (!byCustomer[cu]) byCustomer[cu] = newAcc();
    if (!byChannel[ch])  byChannel[ch]  = newAcc();

    const accs = [total, byMonth[mo], byCategory[ca], byProduct[cd], byCustomer[cu], byChannel[ch]];
    for (const acc of accs) feed(acc, rinv, rf_r, tn, ct, cp);

    custSet.add(cu);
  }

  return { total, byMonth, byCategory, byProduct, byCustomer, byChannel, custSet };
}

// ─────────────────────────────────────────────────────────────────
// Forecast helpers
// ─────────────────────────────────────────────────────────────────
function fcSum(fc, months, measure) {
  let t = 0;
  for (const code of Object.keys(fc))
    for (const m of months) t += fc[code]?.[m]?.[measure] ?? 0;
  return t;
}
function fcSumCode(fc, code, months, measure) {
  if (!fc[code]) return 0;
  return months.reduce((s, m) => s + (fc[code][m]?.[measure] ?? 0), 0);
}
function fcSumCat(fc, cat, months, measure, categoryMap) {
  let t = 0;
  for (const [code, c] of Object.entries(categoryMap))
    if (c === cat && fc[code])
      for (const m of months) t += fc[code][m]?.[measure] ?? 0;
  return t;
}
function fcMonth(fc, month, measure) {
  return Object.values(fc).reduce((s, v) => s + (v[month]?.[measure] ?? 0), 0);
}
function hasCupsTarget(fc26, months) {
  return months.some(m => Object.values(fc26).some(v => (v[m]?.cups ?? 0) > 0));
}

// ─────────────────────────────────────────────────────────────────
// Build full API response
// ─────────────────────────────────────────────────────────────────
function buildResponse(pd, months, rawFilters) {
  const { rows25, rows26, fc25, fc26, productMap, categoryMap, channelMap, strings } = pd;
  const lookups  = buildLookups(pd);
  const monthSet = new Set(months);

  // Resolve string filter values to channel/category/customer strings
  const filters = {
    chFilter: rawFilters.channel   || null,
    caFilter: rawFilters.category  || null,
    cuFilter: rawFilters.customer !== undefined
      ? strings.indexOf(rawFilters.customer)   // resolve to ID
      : undefined,
  };

  const agg25 = aggregateRows(rows25, monthSet, filters, lookups, strings);
  const agg26 = aggregateRows(rows26, monthSet, filters, lookups, strings);

  const res25   = resolve(agg25.total);
  const res26   = resolve(agg26.total);
  const hasCups = hasCupsTarget(fc26, months);

  const sorted  = [...months].sort((a, b) => a - b);
  const periodLabel = sorted.length === 1
    ? MONTHS_SHORT[sorted[0] - 1]
    : MONTHS_SHORT[sorted[0] - 1] + '–' + MONTHS_SHORT[sorted[sorted.length - 1] - 1];

  // ── meta ──────────────────────────────────────────────────────
  const meta = {
    period:       periodLabel,
    months,
    generated:    pd.generated,
    customers_25: agg25.custSet.size,
    customers_26: agg26.custSet.size,
    ton: {
      s25: res25.ton.s,    r25: res25.ton.r,    partial25: res25.ton.partial,
      s26: res26.ton.s,    r26: res26.ton.r,    partial26: res26.ton.partial,
      tgt25: fcSum(fc25, months, 'ton'), tgt26: fcSum(fc26, months, 'ton'),
    },
    carton: {
      s25: res25.carton.s, r25: res25.carton.r, partial25: res25.carton.partial,
      s26: res26.carton.s, r26: res26.carton.r, partial26: res26.carton.partial,
      tgt25: fcSum(fc25, months, 'carton'), tgt26: fcSum(fc26, months, 'carton'),
    },
    cups: {
      s25: res25.cups.s,   r25: res25.cups.r,   partial25: res25.cups.partial,
      s26: res26.cups.s,   r26: res26.cups.r,   partial26: res26.cups.partial,
      tgt25: hasCups ? fcSum(fc25, months, 'cups') : null,
      tgt26: hasCups ? fcSum(fc26, months, 'cups') : null,
    },
  };

  // ── monthly_data ──────────────────────────────────────────────
  const monthly_data = MONTHS_FULL.map((name, idx) => {
    const m   = idx + 1;
    const r25 = resolve(agg25.byMonth[m] || newAcc());
    const r26 = resolve(agg26.byMonth[m] || newAcc());
    return {
      month_id: m, month_short: MONTHS_SHORT[idx], month_name: name, in_period: months.includes(m),
      ton:    { s25: r25.ton.s,    r25: r25.ton.r,    s26: r26.ton.s,    r26: r26.ton.r,
                tgt25: fcMonth(fc25,m,'ton'),    tgt26: fcMonth(fc26,m,'ton')    },
      carton: { s25: r25.carton.s, r25: r25.carton.r, s26: r26.carton.s, r26: r26.carton.r,
                tgt25: fcMonth(fc25,m,'carton'), tgt26: fcMonth(fc26,m,'carton') },
      cups:   { s25: r25.cups.s,   r25: r25.cups.r,   s26: r26.cups.s,   r26: r26.cups.r,
                tgt25: hasCups ? fcMonth(fc25,m,'cups') : null,
                tgt26: hasCups ? fcMonth(fc26,m,'cups') : null },
    };
  });

  // ── category_data ─────────────────────────────────────────────
  const allCats = new Set([...Object.keys(agg25.byCategory), ...Object.keys(agg26.byCategory)]);
  const category_data = [];
  for (const cat of allCats) {
    if (!cat || cat === 'Unknown') continue;
    const r25 = resolve(agg25.byCategory[cat] || newAcc());
    const r26 = resolve(agg26.byCategory[cat] || newAcc());
    category_data.push({
      category: cat,
      ton:    { s25: r25.ton.s,    r25: r25.ton.r,    s26: r26.ton.s,    r26: r26.ton.r,
                tgt25: fcSumCat(fc25,cat,months,'ton',categoryMap),
                tgt26: fcSumCat(fc26,cat,months,'ton',categoryMap) },
      carton: { s25: r25.carton.s, r25: r25.carton.r, s26: r26.carton.s, r26: r26.carton.r,
                tgt25: fcSumCat(fc25,cat,months,'carton',categoryMap),
                tgt26: fcSumCat(fc26,cat,months,'carton',categoryMap) },
      cups:   { s25: r25.cups.s,   r25: r25.cups.r,   s26: r26.cups.s,   r26: r26.cups.r,
                tgt25: hasCups ? fcSumCat(fc25,cat,months,'cups',categoryMap) : null,
                tgt26: hasCups ? fcSumCat(fc26,cat,months,'cups',categoryMap) : null },
    });
  }

  // ── product_data ──────────────────────────────────────────────
  const allCds = new Set([...Object.keys(agg25.byProduct), ...Object.keys(agg26.byProduct)]);
  const product_data = [];
  for (const cdId of allCds) {
    const code = strings[cdId] || '';
    if (!code) continue;
    const r25 = resolve(agg25.byProduct[cdId] || newAcc());
    const r26 = resolve(agg26.byProduct[cdId] || newAcc());
    product_data.push({
      code,
      product:  productMap[code]  || code,
      category: categoryMap[code] || 'Unknown',
      ton:    { s25: r25.ton.s,    r25: r25.ton.r,    s26: r26.ton.s,    r26: r26.ton.r,
                tgt25: fcSumCode(fc25,code,months,'ton'),    tgt26: fcSumCode(fc26,code,months,'ton')    },
      carton: { s25: r25.carton.s, r25: r25.carton.r, s26: r26.carton.s, r26: r26.carton.r,
                tgt25: fcSumCode(fc25,code,months,'carton'), tgt26: fcSumCode(fc26,code,months,'carton') },
      cups:   { s25: r25.cups.s,   r25: r25.cups.r,   s26: r26.cups.s,   r26: r26.cups.r,
                tgt25: hasCups ? fcSumCode(fc25,code,months,'cups') : null,
                tgt26: hasCups ? fcSumCode(fc26,code,months,'cups') : null },
    });
  }

  // ── customer_data ─────────────────────────────────────────────
  const allCus = new Set([...Object.keys(agg25.byCustomer), ...Object.keys(agg26.byCustomer)]);
  const cuIds25 = new Set(Object.keys(agg25.byCustomer));
  const customer_data = [];
  for (const cuId of allCus) {
    const cust = strings[cuId] || '';
    if (!cust) continue;
    const r25 = resolve(agg25.byCustomer[cuId] || newAcc());
    const r26 = resolve(agg26.byCustomer[cuId] || newAcc());
    customer_data.push({
      customer: cust,
      channel:  channelMap[cust] || 'Other',
      in_25:    cuIds25.has(cuId),
      ton:    { s25: r25.ton.s,    r25: r25.ton.r,    s26: r26.ton.s,    r26: r26.ton.r    },
      carton: { s25: r25.carton.s, r25: r25.carton.r, s26: r26.carton.s, r26: r26.carton.r },
      cups:   { s25: r25.cups.s,   r25: r25.cups.r,   s26: r26.cups.s,   r26: r26.cups.r   },
    });
  }

  // ── channel_data ──────────────────────────────────────────────
  const allChs = new Set([...Object.keys(agg25.byChannel), ...Object.keys(agg26.byChannel)]);
  const channel_data = [];
  for (const ch of allChs) {
    if (!ch) continue;
    const r25 = resolve(agg25.byChannel[ch] || newAcc());
    const r26 = resolve(agg26.byChannel[ch] || newAcc());

    const custs25ch = new Set(rows25.filter(r => monthSet.has(r[R.mo]) && lookups.ch_arr[r[R.cu]] === ch).map(r => r[R.cu]));
    const custs26ch = new Set(rows26.filter(r => monthSet.has(r[R.mo]) && lookups.ch_arr[r[R.cu]] === ch).map(r => r[R.cu]));

    const ch_monthly = MONTHS_FULL.map((name, idx) => {
      const m  = idx + 1;
      const ms = new Set([m]);
      const nf = { chFilter: ch, caFilter: null, cuFilter: undefined };
      const cm25 = resolve(aggregateRows(rows25.filter(r => lookups.ch_arr[r[R.cu]] === ch), ms, {caFilter:null,cuFilter:undefined,chFilter:ch}, lookups, strings).total);
      const cm26 = resolve(aggregateRows(rows26.filter(r => lookups.ch_arr[r[R.cu]] === ch), ms, {caFilter:null,cuFilter:undefined,chFilter:ch}, lookups, strings).total);
      return {
        month_id: m, month_short: MONTHS_SHORT[idx],
        ton:    { s25: cm25.ton.s,    r25: cm25.ton.r,    s26: cm26.ton.s,    r26: cm26.ton.r    },
        carton: { s25: cm25.carton.s, r25: cm25.carton.r, s26: cm26.carton.s, r26: cm26.carton.r },
        cups:   { s25: cm25.cups.s,   r25: cm25.cups.r,   s26: cm26.cups.s,   r26: cm26.cups.r   },
      };
    });

    channel_data.push({
      channel: ch,
      customers_25: custs25ch.size,
      customers_26: custs26ch.size,
      ch_monthly,
      ton:    { s25: r25.ton.s,    r25: r25.ton.r,    s26: r26.ton.s,    r26: r26.ton.r    },
      carton: { s25: r25.carton.s, r25: r25.carton.r, s26: r26.carton.s, r26: r26.carton.r },
      cups:   { s25: r25.cups.s,   r25: r25.cups.r,   s26: r26.cups.s,   r26: r26.cups.r   },
    });
  }

  return { success: true, meta, monthly_data, category_data, product_data, customer_data, channel_data };
}

// ─────────────────────────────────────────────────────────────────
// Vercel Handler
// ─────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')     return res.status(405).json({ success: false, error: 'Method not allowed' });

  // ── Filesystem diagnostic (append ?debug=1 to see env details) ──
  if (req.query.debug === '1') {
    const tryRead = p => { try { return fs.readdirSync(p); } catch(e) { return e.message; } };
    const trySize = p => { try { return fs.statSync(p).size; } catch(e) { return e.message; } };
    const root    = path.join(__dirname, '..');
    const diag = {
      __dirname,
      cwd:      process.cwd(),
      rootDir:  tryRead(root),
      apiDir:   tryRead(__dirname),
      dataDir:  tryRead(path.join(root, 'data')),
      publicDir: tryRead(path.join(root, 'public')),
      candidates: [
        path.join(__dirname, '..', 'data',   'processed-data.json'),
        path.join(process.cwd(), 'data',     'processed-data.json'),
        path.join(__dirname, '..', 'public', 'processed-data.json'),
        path.join(process.cwd(), 'public',   'processed-data.json'),
      ].map(p => ({ path: p, exists: fs.existsSync(p), size: trySize(p) })),
    };
    return res.status(200).json(diag);
  }

  let step = 'init';
  try {
    step = 'reading processed-data.json';
    const pd = getProcessedData();

    step = 'parsing query params';
    const { months: mp, channel, category, customer } = req.query;
    const months = mp
      ? mp.split(',').map(Number).filter(n => n >= 1 && n <= 12)
      : [1, 2, 3, 4, 5, 6];

    step = 'building response';
    const data = buildResponse(pd, months, { channel, category, customer });

    const m = data.meta;
    console.log(`[api/data] ${m.period} S25=${m.ton.s25.toFixed(1)} S26=${m.ton.s26.toFixed(1)} Tgt26=${m.ton.tgt26.toFixed(1)} Ach=${m.ton.tgt26>0?(m.ton.s26/m.ton.tgt26*100).toFixed(1)+'%':'N/A'}`);

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
    return res.status(200).json(data);

  } catch (err) {
    console.error('[api/data] Error at step:', step, err.message);
    return res.status(200).json({ success: false, step, error: err.message, stack: err.stack });
  }
};
