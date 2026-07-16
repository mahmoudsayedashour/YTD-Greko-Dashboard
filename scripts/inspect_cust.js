'use strict';
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

async function run() {
  const buf = fs.readFileSync(path.join(__dirname, '..', 'data', 'processed-data.json'));
  const pd = JSON.parse(buf);
  console.log('pd string keys preview:', pd.strings.slice(0, 10));
}
run();
