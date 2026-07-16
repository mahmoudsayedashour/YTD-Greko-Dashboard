'use strict';
const XLSX = require('xlsx');
const http = require('http');
const https = require('https');

const url = 'https://kpvezuvifxoatyen.public.blob.vercel-storage.com/New%20Microsoft%20Excel%20Worksheet.xlsx';

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const chunks = [];
    proto.get(url, res => {
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function run() {
  const buf = await downloadBuffer(url);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const act = XLSX.utils.sheet_to_json(wb.Sheets['Actual 25']);
  console.log('Actual 25 columns:');
  console.log(Object.keys(act[0]).join(' | '));

  const cust = XLSX.utils.sheet_to_json(wb.Sheets['Customers']);
  console.log('\nCustomers columns:');
  console.log(Object.keys(cust[0]).join(' | '));
}
run();
