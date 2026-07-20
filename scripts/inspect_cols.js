const XLSX = require('xlsx');

async function main() {
  console.log('Fetching workbook...');
  const url = 'https://kpvezuvifxoatyen.public.blob.vercel-storage.com/New%20Microsoft%20Excel%20Worksheet.xlsx';
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  console.log('Loading workbook...');
  const wb = XLSX.read(buffer, { type: 'buffer' });
  console.log('Available Sheets:', wb.SheetNames);

  const sheetName = 'Actual 26';
  const sheet = wb.Sheets[sheetName];

  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, header: 1 });
  console.log('\nHeaders for Actual 26:');
  console.log(rows[0]);

  const dataRows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  console.log('\nSample Row 1:');
  console.log(dataRows[0]);
}

main().catch(console.error);
