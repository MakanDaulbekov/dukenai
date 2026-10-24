import { writeFile } from 'node:fs/promises';
import { generateDemo, toCSV } from './forecast.js';
await writeFile(new URL('./demo-sales.csv', import.meta.url), toCSV(generateDemo()), 'utf8');
console.log('demo-sales.csv: 90 days, 15 products, 1350 rows.');
