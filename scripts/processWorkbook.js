'use strict';
// ═══════════════════════════════════════════════════════════════════
//  GREKO EGYPT  –  scripts/processWorkbook.js
//
//  Run locally before deploying:
//    node scripts/processWorkbook.js
//
//  Output format v3 (compact):
//    strings: shared string lookup table
//    rows25 / rows26: compact 8-value arrays
//      [mo, cd, cu, t, rf_r, tn, ct, cp]
//       0   1   2   3  4     5   6   7
//      mo   = month (1-12)
//      cd   = product code ID  (index into strings)
//      cu   = customer name ID (index into strings)
//      t    = invoice type ID  (index into strings — 'INV','RINV', etc.)
//      rf_r = 1 if Reference starts with 'R' (partial return), else 0
//      tn   = Num Ton (2 dp)
//      ct   = Num Carton (2 dp)
//      cp   = Invoice Quantity / Cups (2 dp)
//
//  Derived at aggregation time (NOT stored in rows):
//    yr    = implicit from rows25 vs rows26
//    qt    = Math.ceil(mo / 3)
//    ca    = categoryMap[strings[cd]]
//    pr    = productMap[strings[cd]]
//    ch    = channelMap[strings[cu]]
// ═══════════════════════════════════════════════════════════════════

const XLSX = require('xlsx');
const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

const WORKBOOK_URL =
  'https://kpvezuvifxoatyen.public.blob.vercel-storage.com/New%20Microsoft%20Excel%20Worksheet.xlsx';

const OUTPUT_PATH = path.join(__dirname, '..', 'public', 'processed-data.json');

const MONTHS_FULL = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────
const sf  = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const ss  = v => (v == null ? '' : String(v).trim());
const r4  = v => Math.round(v * 10000) / 10000;   // 4dp — needed for small ton values (avg ~0.002/line)
const ri  = v => Math.round(v);                    // integer — cups are whole units

function excelDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(Math.round((v - 25569) * 86_400_000));
  const d = new Date(v);
  return isNaN(d) ? null : d;
}
function rowMonth(v) { const d = excelDate(v); return d ? d.getMonth() + 1 : 0; }
function rowYear(v)  { const d = excelDate(v); return d ? d.getFullYear()   : 0; }

// ─────────────────────────────────────────────────────────────────
// String intern table
// ─────────────────────────────────────────────────────────────────
class StringTable {
  constructor() { this._map = new Map(); this._arr = []; }
  intern(s) {
    const str = ss(s);
    if (this._map.has(str)) return this._map.get(str);
    const id = this._arr.length;
    this._arr.push(str);
    this._map.set(str, id);
    return id;
  }
  toArray() { return this._arr; }
}

// ─────────────────────────────────────────────────────────────────
// Download
// ─────────────────────────────────────────────────────────────────
function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const proto  = url.startsWith('https') ? https : http;
    const chunks = [];
    proto.get(url, res => {
      if (res.statusCode !== 200)
        return reject(new Error(`HTTP ${res.statusCode}`));
      const total = parseInt(res.headers['content-length'] || '0');
      let downloaded = 0;
      res.on('data', c => {
        chunks.push(c);
        downloaded += c.length;
        if (total) process.stdout.write(`\r   ${(downloaded/1024/1024).toFixed(1)} / ${(total/1024/1024).toFixed(1)} MB`);
      });
      res.on('end',  () => { process.stdout.write('\n'); resolve(Buffer.concat(chunks)); });
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ─────────────────────────────────────────────────────────────────
// Forecast parser (unchanged)
// ─────────────────────────────────────────────────────────────────
function parseForecast(wb, sheetName) {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) { console.warn(`  ⚠  Sheet not found: "${sheetName}"`); return {}; }
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: 0 });
  const map  = {};
  for (const r of rows) {
    const code = ss(r['Code'] || r['code']);
    if (!code) continue;
    map[code] = {};
    for (let m = 1; m <= 12; m++) {
      const mn = MONTHS_FULL[m - 1];
      map[code][m] = {
        ton:    sf(r[`${mn} Ton`]     ?? r[`${mn}Ton`]     ?? 0),
        carton: sf(r[`${mn} Cartons`] ?? r[`${mn}Cartons`] ?? r[`${mn} Carton`] ?? 0),
        cups:   sf(r[`${mn} Cups`]    ?? r[`${mn}Cups`]    ?? 0),
      };
    }
  }
  console.log(`  ✓  ${sheetName}: ${Object.keys(map).length} product codes`);
  return map;
}

// ─────────────────────────────────────────────────────────────────
// Actual parser — v3 compact format
// Row: [mo, cd, cu, t, rf_r, tn, ct, cp]
// SAME pipeline for both years
// ─────────────────────────────────────────────────────────────────
function parseActual(wb, sheetName, channelMap, ST) {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) { console.warn(`  ⚠  Sheet not found: "${sheetName}"`); return []; }

  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null });

  let raw_tn_before = 0;
  for (const r of rawRows) {
    raw_tn_before += sf(r['Num Ton']);
  }

  const out = [];
  let skipped_nodate = 0;
  let skipped_zero   = 0;
  let raw_tn_after   = 0;  // sum of Num Ton for dated rows, pre-rounding

  for (const r of rawRows) {
    const month = rowMonth(r['Delivery Date']);
    if (!month) { skipped_nodate++; continue; }

    // Read raw values first
    const tn_raw = sf(r['Num Ton']);
    const ct_raw = sf(r['Num Carton']);
    const cp_raw = sf(r['Invoice lines/Quantity']);

    // Drop only truly zero rows (using raw values — NOT rounded values)
    if (tn_raw === 0 && ct_raw === 0 && cp_raw === 0) { skipped_zero++; continue; }

    // Apply precision AFTER the zero-filter
    // tn/ct: 4dp — individual line values are ~0.002 tons; 2dp would silently zero them out
    // cp: integer — cups are always whole units
    const tn = r4(tn_raw);
    const ct = r4(ct_raw);
    const cp = ri(cp_raw);

    raw_tn_after += tn_raw;

    const code    = ss(r['Code']);
    const partner = ss(r['Invoice lines/Partner'] ?? r['Invoice Partner Display Name'] ?? r['Partner'] ?? '');
    const type    = ss(r['Invoice lines/Number Type']);
    const ref     = ss(r['Invoice lines/Reference']);

    const rf_r = (ref.length > 0 && ref[0].toUpperCase() === 'R') ? 1 : 0;

    out.push([
      month,
      ST.intern(code),
      ST.intern(partner),
      ST.intern(type),
      rf_r,
      tn,
      ct,
      cp,
    ]);
  }

  // Diagnostic: raw sum of stored rows only
  const raw_tn_stored = out.reduce((s, r) => s + r[5], 0);

  console.log(`  ✓  ${sheetName}: ${out.length} rows, ${skipped_nodate} skipped (no date), ${skipped_zero} dropped (all-zero)`);
  console.log(`     Pre-rounding ΣTon (all rows)   : ${raw_tn_before.toFixed(2)}`);
  console.log(`     Pre-rounding ΣTon (dated rows) : ${raw_tn_after.toFixed(2)}`);
  console.log(`     Stored rows  ΣTon (4dp rounded): ${raw_tn_stored.toFixed(2)}`);
  return out;
}

// ─────────────────────────────────────────────────────────────────
// DAX validation (full-year preview)
// ─────────────────────────────────────────────────────────────────
function daxValidate(rows, ST, label) {
  let t_sum = 0, t_partial = 0, t_rinv = 0;
  for (const r of rows) {
    const tn   = r[5];
    const rf_r = r[4];
    const typ  = ST.toArray()[r[3]] || '';
    t_sum += tn;
    if (rf_r) t_partial += Math.abs(tn);
    if (typ === 'RINV') t_rinv += tn;
  }
  const t_ret  = Math.abs(t_rinv - t_partial);
  const t_sale = t_sum - t_partial - t_ret;
  console.log(`\n  📊 DAX Preview — ${label}`);
  console.log(`     Raw ΣTon      : ${t_sum.toFixed(2)}`);
  console.log(`     Partial Returns: ${t_partial.toFixed(2)}`);
  console.log(`     Returns (RINV) : ${t_ret.toFixed(2)}`);
  console.log(`     → Sales Ton    : ${t_sale.toFixed(2)}`);
  return { t_sum, t_partial, t_ret, t_sale };
}

// ─────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────
async function run() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log(' Greko Egypt – Workbook Preprocessor  (v3 compact)');
  console.log('═══════════════════════════════════════════════════\n');

  // Step 1: Download
  console.log('📥 Downloading workbook…');
  const buf = await downloadBuffer(WORKBOOK_URL);
  console.log(`   Total: ${(buf.length / 1024 / 1024).toFixed(2)} MB`);

  // Step 2: Parse
  console.log('\n📊 Parsing workbook…');
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  console.log(`   Sheets: ${wb.SheetNames.join(', ')}`);

  // Sheet names can vary slightly — accept both forms
  const sheetAct25 = wb.SheetNames.find(n => /Actual.?25$/i.test(n)) || 'Actual 25';
  const sheetAct26 = wb.SheetNames.find(n => /Actual.?2?0?26$/i.test(n)) || 'Actual 2026';
  const sheetFct25 = wb.SheetNames.find(n => /Forecast.?25$/i.test(n)) || 'Forecast 25';
  const sheetFct26 = wb.SheetNames.find(n => /Forecast.?2?0?26$/i.test(n)) || 'Forecast 26';

  const required = ['Main Data', 'Customers', sheetFct25, sheetFct26, sheetAct25, sheetAct26];
  const missing  = required.filter(s => !wb.SheetNames.includes(s));
  if (missing.length) {
    console.error(`\n❌  Missing: ${missing.join(', ')}  |  Available: ${wb.SheetNames.join(', ')}`);
    process.exit(1);
  }
  console.log(`   Using sheets: ${sheetAct25} / ${sheetAct26} / ${sheetFct25} / ${sheetFct26}`);

  // Step 3: Build lookup maps
  console.log('\n🗺  Building lookup maps…');
  const productMap  = {};   // code → product name
  const categoryMap = {};   // code → category name
  const channelMap  = {};   // customer name → channel name

  const mainRows = XLSX.utils.sheet_to_json(wb.Sheets['Main Data'], { defval: '' });
  for (const r of mainRows) {
    const code = ss(r['Code'] || r['code'] || r['Product Code']);
    if (!code) continue;
    productMap[code]  = ss(r['Product']  || r['product']  || r['Product Name'] || code);
    categoryMap[code] = ss(r['Category'] || r['category'] || r['Categories']   || 'Unknown');
  }
  console.log(`   productMap  : ${Object.keys(productMap).length} entries`);

  const custRows = XLSX.utils.sheet_to_json(wb.Sheets['Customers'], { defval: '' });
  if (custRows.length > 0) {
    console.log(`   Customers columns: ${Object.keys(custRows[0]).join(' | ')}`);
    for (const r of custRows) {
      const name = ss(r['Customers'] || r['Customer'] || r['Name'] || r['Partner'] || r['Display Name'] || r['Customer Name'] || r['Partner Name']);
      const ch   = ss(r['Channel']   || r['channel']  || r['Trade Channel'] || r['Sales Channel']);
      if (name) channelMap[name] = ch || 'Other';
    }
  }
  console.log(`   channelMap  : ${Object.keys(channelMap).length} entries (customer → channel)`);
  Object.entries(channelMap).slice(0, 2).forEach(([k, v]) => console.log(`   Sample: "${k.substring(0,40)}" → "${v}"`));

  // Step 4: Parse forecasts
  console.log('\n📈 Parsing forecasts…');
  const fc25 = parseForecast(wb, sheetFct25);
  const fc26 = parseForecast(wb, sheetFct26);

  // Step 5: Shared string table — no reference strings, only codes/names/types
  const ST = new StringTable();

  // Step 6: Parse actuals (identical pipeline for both years)
  console.log('\n📋 Parsing actuals…');
  const rows25 = parseActual(wb, sheetAct25, channelMap, ST);
  const rows26 = parseActual(wb, sheetAct26, channelMap, ST);

  // Step 7: Validation
  const v25 = daxValidate(rows25, ST, 'Actual 25  (full year)');
  const v26 = daxValidate(rows26, ST, 'Actual 26  (full year)');

  // Step 8: Assemble
  const strings = ST.toArray();
  const output = {
    version:   3,
    generated: new Date().toISOString(),
    source:    WORKBOOK_URL,
    // Row column layout (8 values per row):
    // [mo, cd, cu, t, rf_r, tn, ct, cp]
    //  0   1   2   3  4     5   6   7
    rowCols:   ['mo','cd','cu','t','rf_r','tn','ct','cp'],
    strings,       // shared intern table — product codes, customer names, type codes only
    productMap,    // code → product name
    categoryMap,   // code → category name
    channelMap,    // customer name → channel name
    fc25,
    fc26,
    rows25,
    rows26,
    validation: {
      rows25_count:  rows25.length,
      rows26_count:  rows26.length,
      raw_ton_25:    +v25.t_sum.toFixed(2),
      raw_ton_26:    +v26.t_sum.toFixed(2),
      sales_ton_25:  +v25.t_sale.toFixed(2),
      sales_ton_26:  +v26.t_sale.toFixed(2),
    },
  };

  // Step 9: Write
  const jsonStr = JSON.stringify(output);
  const sizeMB  = (Buffer.byteLength(jsonStr, 'utf8') / 1024 / 1024).toFixed(2);

  const outDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, jsonStr, 'utf8');

  console.log(`\n✅  Done!`);
  console.log(`    Strings table: ${strings.length} unique values (no reference strings)`);
  console.log(`    Output       : ${OUTPUT_PATH}`);
  console.log(`    Size         : ${sizeMB} MB`);

  if      (parseFloat(sizeMB) > 95) console.warn('\n⚠  Exceeds 95 MB — cannot commit to Git directly.');
  else if (parseFloat(sizeMB) > 25) console.warn('\n⚠  Exceeds GitHub 25 MB browser upload limit — use git CLI to push.');
  else                               console.log('\n    ✓ Under 25 MB — safe to commit via GitHub browser or git CLI.');

  console.log('\n    Next: git add public/processed-data.json && git commit && git push');
}

run().catch(err => {
  console.error('\n💥 FATAL:', err.message);
  console.error(err.stack);
  process.exit(1);
});
