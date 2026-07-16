'use strict';
const XLSX = require('xlsx');
const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

const WORKBOOK_URL = 'https://kpvezuvifxoatyen.public.blob.vercel-storage.com/New%20Microsoft%20Excel%20Worksheet.xlsx';

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const chunks = [];
    proto.get(url, res => {
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function run() {
  console.log('Downloading...');
  const buf = await downloadBuffer(WORKBOOK_URL);
  console.log('Parsing...');
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  console.log('Sheets:', wb.SheetNames.join(', '));

  // Check Main Data columns
  const mainRows = XLSX.utils.sheet_to_json(wb.Sheets['Main Data'], { defval: '' });
  if (mainRows.length > 0) {
    console.log('\n=== Main Data columns ===');
    console.log(Object.keys(mainRows[0]).join(' | '));
    console.log('\nSample row:');
    const r0 = mainRows[0];
    Object.entries(r0).slice(0,10).forEach(([k,v]) => console.log(' ', JSON.stringify(k), '->', JSON.stringify(v)));
  }

  // Check Forecast 26 columns
  const fc26Rows = XLSX.utils.sheet_to_json(wb.Sheets['Forecast 26'], { defval: 0 });
  if (fc26Rows.length > 0) {
    console.log('\n=== Forecast 26 columns ===');
    console.log(Object.keys(fc26Rows[0]).join(' | '));
    console.log('\nSample row (first non-zero):');
    const r = fc26Rows[0];
    Object.entries(r).slice(0,10).forEach(([k,v]) => console.log(' ', JSON.stringify(k), '->', JSON.stringify(v)));
    // Find any non-zero ton values
    for (const row of fc26Rows) {
      const vals = Object.entries(row).filter(([k,v]) => typeof v === 'number' && v > 0);
      if (vals.length > 0) {
        console.log('\nFirst fc26 row with non-zero values:');
        vals.slice(0,10).forEach(([k,v]) => console.log(' ', JSON.stringify(k), '->', v));
        break;
      }
    }
  }
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
