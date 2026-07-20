const fs = require('fs');
const d = JSON.parse(fs.readFileSync('./data/processed-data.json', 'utf8'));

const { rows26, strings } = d;

const sample = new Set();
for (let i = 0; i < Math.min(1000, rows26.length); i++) {
  sample.add(strings[rows26[i][2]]);
}

console.log('Sample 2026 Partners:');
console.log(Array.from(sample).slice(0, 10));
