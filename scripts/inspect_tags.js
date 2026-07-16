'use strict';
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
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
  const a25 = XLSX.utils.sheet_to_json(wb.Sheets['Actual 25'], { defval: '' });
  
  const tags = new Set();
  let count = 0;
  for (const r of a25) {
    if (r.Tags) {
      tags.add(r.Tags);
      count++;
    }
  }
  
  console.log('Found', count, 'rows with Tags');
  console.log('Unique Tags:', [...tags]);
}
run();
