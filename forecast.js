import { holiday, isPayday } from './holidays.js';
export const DAY = 86400000;
export const CITIES = { almaty: { name: 'Almaty', latitude: 43.2389, longitude: 76.8897 }, astana: { name: 'Astana', latitude: 51.1694, longitude: 71.4491 }, kyzylorda: { name: 'Kyzylorda', latitude: 44.8488, longitude: 65.4823 } };
export const DISTRICTS = { residential: 'Residential area', office: 'Office area', university: 'University area' };
export const dateISO = date => date.toISOString().slice(0, 10);
export const addDays = (date, n) => dateISO(new Date(new Date(date + 'T12:00:00Z').getTime() + n * DAY));
export const todayKZ = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Almaty', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && dateISO(new Date(value)) === value; }
export const daysBetween = (from, to) => Math.round((Date.parse(to + 'T12:00:00Z') - Date.parse(from + 'T12:00:00Z')) / DAY);
// shelf_life_days is recorded together with stock on the row's date: the leftover can still be sold
// for that many following days. 0 = already expired. The last sellable day is therefore fixed by the
// row date, so an older CSV cannot make expired stock look fresh.
export const lastSellable = row => addDays(row.date, row.shelf_life_days);
const weekday = date => new Date(date + 'T12:00:00Z').getUTCDay();
const average = rows => rows.reduce((s, r) => s + r.qty, 0) / rows.length;
export function category(product) {
  if (/чай|\btea\b/i.test(product)) return 'tea';
  if (/морожен|\bice cream\b/i.test(product)) return 'ice';
  if (/мука|мяс|говяд|баран|торт|печень|булоч|круассан|синнабон|баурсак|шоколад|слад|\b(?:flour|meat|steak|cake|cookies?|croissants?|baursaks?|bun|cinnamon roll)\b/i.test(product)) return 'celebration';
  if (/хлеб|багет|батон|\b(?:bread|baguette)\b/i.test(product)) return 'bread';
  return 'other';
}
// Excel with a Russian/Kazakh locale saves CSV in Windows-1251, dates as DD.MM.YYYY and numbers as "1 300,5".
export function decodeCSV(buffer) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch { return new TextDecoder('windows-1251').decode(buffer); }
}
function normalizeDate(value) {
  const iso = value.match(/^(\d{4}-\d{2}-\d{2})(?:[T ]\d{1,2}:\d{2}(?::\d{2})?)?$/);
  if (iso) return iso[1];
  // Only dots: "03/04/2026" is ambiguous (US Excel writes M/D/Y), so slashes are rejected instead of guessed.
  const dmy = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?: \d{1,2}:\d{2}(?::\d{2})?)?$/);
  return dmy ? `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}` : value;
}
// RFC4180-style CSV parsing: quoted commas, escaped quotes, BOM, CRLF and semicolon.
export function parseCSV(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('The CSV is empty. Add headers and at least one sales row.');
  if (Buffer.byteLength(text, 'utf8') > 2 * 1024 * 1024) throw new Error('The file exceeds 2 MB. Upload a smaller CSV.');
  text = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const delimiter = text.split('\n')[0].includes(';') ? ';' : ',';
  const table = []; let row = [], cell = '', quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else cell += c;
    } else if (c === '"') {
      if (cell.length || closed) throw new Error('Invalid quotation marks in the CSV.');
      quoted = true;
    } else if (c === delimiter || c === '\n') {
      row.push(cell.trim()); cell = ''; closed = false;
      if (c === '\n') { if (row.some(Boolean)) table.push(row); row = []; }
    } else { if (closed && c.trim()) throw new Error('Unexpected text after a closing quote in the CSV.'); cell += c; }
  }
  if (quoted) throw new Error('Unclosed quotation marks in the CSV.');
  row.push(cell.trim()); if (row.some(Boolean)) table.push(row);
  const columns = ['date', 'product', 'qty', 'price', 'stock', 'shelf_life_days'];
  const header = table.shift()?.map(v => v.toLowerCase());
  if (!header || columns.some(k => !header.includes(k)) || new Set(header).size !== header.length) throw new Error('Required columns: ' + columns.join(', ') + '.');
  if (!table.length || table.length > 15000) throw new Error('The CSV must contain between 1 and 15,000 rows.');
  const seen = new Set(), products = new Set();
  const records = table.map((cells, i) => {
    const line = i + 2;
    if (cells.length !== header.length) throw new Error(`Row ${line}: the number of cells does not match the header.`);
    const raw = Object.fromEntries(header.map((h, k) => [h, cells[k]]));
    raw.date = normalizeDate(raw.date);
    if (!validDate(raw.date) || raw.date > todayKZ()) throw new Error(`Row ${line}: date must be a valid date (YYYY-MM-DD or DD.MM.YYYY), no later than today.`);
    if (!raw.product || raw.product.length > 100 || /[\x00-\x1F]/.test(raw.product)) throw new Error(`Row ${line}: check the product name (1–100 characters).`);
    const r = { date: raw.date, product: raw.product };
    for (const k of ['qty', 'price', 'stock', 'shelf_life_days']) {
      const numeric = raw[k].replace(/[\s']/g, '').replace(',', '.');
      if (!/^\d+(\.\d+)?$/.test(numeric)) throw new Error(`Row ${line}: ${k} must be a non-negative number.`);
      r[k] = Number(numeric);
      if (!Number.isFinite(r[k]) || r[k] > 1000000 || (k !== 'price' && !Number.isInteger(r[k]))) throw new Error(`Row ${line}: ${k} must be a whole number up to 1,000,000 (price may include decimals).`);
    }
    if (r.shelf_life_days > 3650) throw new Error(`Row ${line}: shelf life cannot exceed 3,650 days.`);
    const key = JSON.stringify([r.date, r.product]);
    if (seen.has(key)) throw new Error(`Row ${line}: duplicate product “${r.product}” on ${r.date}. Combine sales for that day.`);
    seen.add(key); products.add(r.product); return r;
  });
  if (products.size > 100) throw new Error('This MVP supports up to 100 products.');
  return records.sort((a, b) => a.date.localeCompare(b.date));
}
export function metadata(records, source = 'upload') {
  return { source, rows: records.length, products: new Set(records.map(r => r.product)).size, days: new Set(records.map(r => r.date)).size, from: records[0].date, to: records.at(-1).date };
}
export function forecastProduct(rows, date, district, weather) {
  const past = rows.filter(r => r.date < date);
  if (!past.length) throw new Error('The forecast date must be after the sales history.');
  const latest = past.at(-1);
  const comparable = past.filter(r => weekday(r.date) === weekday(date) && r.date >= addDays(date, -56)).slice(-4);
  const sample = comparable.length ? comparable : past.slice(-14);
  const base = average(sample);
  const reasons = [{ label: comparable.length ? `Average of ${sample.length} matching weekdays` : `Limited data: average of ${sample.length} recorded days`, factor: 1, kind: 'base' }];
  let factor = 1;
  const adjust = (value, label) => { factor *= value; reasons.push({ label, factor: value, kind: 'adjustment' }); };
  const h = holiday(date), type = category(latest.product), weekend = [0, 6].includes(weekday(date));
  if (h.boost && type === 'celebration') adjust(1.3, `${h.name}: +30%`);
  if (isPayday(date)) adjust(1.1, 'Payday: +10%');
  if (district === 'office' && weekend) adjust(0.6, 'Office area on a weekend: −40%');
  if (district === 'university' && weekend) adjust(0.75, 'University area on a weekend: −25%');
  const summer = [6, 7, 8].includes(Number(date.slice(5, 7)));
  if (summer && district === 'university') adjust(0.8, 'Summer break: −20%');
  if (summer && type === 'ice') adjust(1.1, 'Summer season: +10%');
  if (summer && type === 'tea') adjust(0.9, 'Summer season: −10%');
  const temp = weather?.[date]?.temperature;
  if (Number.isFinite(temp)) {
    if (temp < 5 && type === 'tea') adjust(1.2, `Cold weather, ${Math.round(temp)}°C: +20%`);
    if (temp < 5 && type === 'ice') adjust(0.7, `Cold weather, ${Math.round(temp)}°C: −30%`);
    if (temp >= 28 && type === 'tea') adjust(0.8, `Hot weather, ${Math.round(temp)}°C: −20%`);
    if (temp >= 28 && type === 'ice') adjust(1.3, `Hot weather, ${Math.round(temp)}°C: +30%`);
  }
  const forecast = Math.round(base * factor), bufferRate = latest.shelf_life_days <= 2 ? 0.05 : 0.1;
  const buffer = Math.ceil(forecast * bufferRate);
  const expires = lastSellable(latest);
  const stock = expires >= date ? latest.stock : 0;
  return { product: latest.product, forecast, base: Math.round(base * 10) / 10, buffer, bufferRate, stock: latest.stock, usableStock: stock, order: Math.max(0, forecast + buffer - stock), price: latest.price, shelfLife: latest.shelf_life_days, stockDate: latest.date, stockExpires: expires, samples: sample.length, limited: comparable.length < 4, reasons };
}
export function buildPlan(records, { date, district = 'residential', city = 'almaty', weather = {}, source = 'upload', today = todayKZ() }) {
  const groups = new Map();
  for (const row of records) { if (!groups.has(row.product)) groups.set(row.product, []); groups.get(row.product).push(row); }
  const products = [...groups.values()];
  // The simulation always starts tomorrow. For a later forecast date, the days in between are simulated
  // too (sales follow the forecast, baking follows the plan), so stock is not counted as if nothing sold.
  const start = date < addDays(today, 1) ? date : addDays(today, 1);
  const days = Array.from({ length: daysBetween(start, date) + 7 }, (_, i) => addDays(start, i));
  const simulated = days.map(day => ({ date: day, items: products.map(rows => forecastProduct(rows, day, district, weather)) }));
  // FIFO stock simulation. Opening stock is counted once and expires on its own date; expired batches cannot offset orders.
  products.forEach((rows, p) => {
    const latest = rows.at(-1);
    let batches = latest.stock ? [{ qty: latest.stock, expires: lastSellable(latest) }] : [];
    for (const day of simulated) {
      const row = day.items[p];
      batches = batches.filter(b => b.expires >= day.date && b.qty > 0);
      row.usableStock = batches.reduce((s, b) => s + b.qty, 0);
      row.order = Math.max(0, row.forecast + row.buffer - row.usableStock);
      // New production uses the same conservative shelf-life assumption as the last batch.
      if (row.order) batches.push({ qty: row.order, expires: addDays(day.date, Math.max(1, latest.shelf_life_days) - 1) });
      batches.sort((a, b) => a.expires.localeCompare(b.expires));
      let demand = row.forecast;
      for (const b of batches) { const take = Math.min(b.qty, demand); b.qty -= take; demand -= take; }
    }
  });
  const week = simulated.filter(d => d.date >= date);
  const items = week[0].items.map(r => ({ ...r }));
  const tips = [];
  products.forEach(rows => {
    const latest = rows.at(-1);
    const daysLeft = Math.max(0, daysBetween(today, lastSellable(latest)));
    if (latest.stock === 0 || daysLeft > 14) return;
    let expected = 0;
    for (let i = 1; i <= daysLeft; i++) expected += forecastProduct(rows, addDays(today, i), district, weather).forecast;
    const excess = Math.max(0, latest.stock - expected), expired = daysLeft === 0;
    if (excess) tips.push({ product: latest.product, stock: latest.stock, days: daysLeft, expected, excess, valueAtRisk: excess * latest.price, discount: expired ? 0 : (daysLeft === 1 ? 30 : 20), expired });
  });
  tips.sort((a, b) => b.valueAtRisk - a.valueAtRisk);
  const history = Array.from({ length: 30 }, (_, i) => {
    const d = addDays(today, i - 29), rows = records.filter(r => r.date === d);
    return { date: d, qty: rows.length ? rows.reduce((s, r) => s + r.qty, 0) : null };
  });
  const sum = (arr, key) => arr.reduce((s, r) => s + r[key], 0);
  const warnings = [];
  if (items.some(r => r.limited)) warnings.push('Some products have fewer than 4 matching weekdays. Their forecasts are preliminary.');
  if (items.some(r => r.stockDate < today)) warnings.push('Stock is taken from the latest entry for each product. Check stock and remaining shelf life today.');
  if (!holiday(date).lunarCalendarKnown) warnings.push('The Kurban Ait date for the selected year has not been added to the demo calendar.');
  if (date > addDays(today, 1)) warnings.push('For days before the selected date, the plan assumes sales match the forecast and you bake or order as planned. Check stock before baking.');
  if (!weather[date]) warnings.push('Weather is unavailable for the selected date. No weather adjustment is applied.');
  const result = { date, district, city, holiday: holiday(date).name, items, week: week.map(d => ({ ...d, forecast: sum(d.items, 'forecast'), order: sum(d.items, 'order') })), history, tips, warnings, dataset: metadata(records, source), weather: weather[date] || null, totals: { forecast: sum(items, 'forecast'), order: sum(items, 'order'), stock: sum(items, 'stock'), buffer: sum(items, 'buffer'), risk: sum(tips, 'valueAtRisk'), riskQty: sum(tips, 'excess'), baseline: Math.round(sum(items, 'base')) } };
  result.summary = summarize(result);
  return result;
}
export function summarize(plan) {
  const lead = [...plan.items].sort((a, b) => b.order - a.order)[0];
  const dayName = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' }).format(new Date(plan.date + 'T12:00:00Z'));
  const weather = plan.weather ? `Expect ${Math.round(plan.weather.temperature)}°C in ${CITIES[plan.city].name}.` : 'No weather adjustment is included yet.';
  const district = plan.district === 'office' && [0, 6].includes(weekday(plan.date)) ? 'The demo rule reduces weekend demand in office areas by 40%.' : `The baseline uses sales on matching weekdays. Neighborhood: ${DISTRICTS[plan.district].toLowerCase()}.`;
  return { mode: 'rules', title: `Plan for ${dayName}`, text: `${weather} ${district} Prepare ${plan.totals.order} units including a buffer and usable stock. ${lead.product}: prepare ${lead.order} units for expected demand of ${lead.forecast}.`, note: plan.tips.length ? `${plan.tips.length} products need a shelf-life check. See discount suggestions below.` : 'No excess stock found for products with up to 14 days remaining.' };
}
export function generateDemo(today = todayKZ()) {
  const products = [
    ['Baursaks',140,100,28,1], ['Sourdough bread',78,650,12,2], ['Croissant',46,850,54,1],
    ['Poppy seed bun',62,350,8,2], ['Samsa',52,450,6,1], ['Baguette',38,550,6,1],
    ['Cinnamon roll',34,750,10,2], ['Oatmeal cookies',28,1200,14,7], ['Honey cake',16,1500,8,3],
    ['Black tea',42,450,8,180], ['Coffee',55,900,4,60], ['Milk',8,650,28,2],
    ['Ice cream',14,500,22,90], ['Flour',12,700,6,180], ['Eggs',15,950,10,14]
  ];
  const rows = [];
  for (let day = 0; day < 90; day++) {
    const date = addDays(today, day - 89), weekend = [0,6].includes(weekday(date));
    products.forEach(([product, base, price, stock, shelf_life_days], p) => {
      const wave = Math.sin(day * 1.7 + p * 0.8) * 0.1 + Math.cos(day * 0.42 + p) * 0.05;
      const qty = Math.max(0, Math.round(base * (1 + wave) * (weekend ? 1.08 : 1) * (0.94 + day / 1500)));
      rows.push({ date, product, qty, price, stock, shelf_life_days });
    });
  }
  return rows;
}
export function toCSV(records) {
  const cols = ['date','product','qty','price','stock','shelf_life_days'];
  const quote = s => '"' + String(s).replaceAll('"','""') + '"';
  return cols.join(',') + '\n' + records.map(r => cols.map(k => quote(r[k])).join(',')).join('\n') + '\n';
}
