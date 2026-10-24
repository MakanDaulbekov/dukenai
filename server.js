import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCSV, generateDemo, metadata, buildPlan, todayKZ, addDays, validDate, CITIES, DISTRICTS, toCSV } from './forecast.js';
const root = path.dirname(fileURLToPath(import.meta.url));
const weatherCache = new Map();
export async function getWeather(city) {
  if (process.env.WEATHER_DISABLED === '1') return {};
  const key = `${city}:${todayKZ()}`, cached = weatherCache.get(key);
  if (cached && cached.until > Date.now()) return cached.data;
  const c = CITIES[city];
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({ latitude: c.latitude, longitude: c.longitude, daily: 'temperature_2m_mean,weather_code', timezone: 'Asia/Almaty', forecast_days: 16 }).toString();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) throw new Error('Weather unavailable');
    const body = await response.json(), data = {};
    body.daily?.time?.forEach((date, i) => {
      const temperature = body.daily.temperature_2m_mean?.[i];
      if (Number.isFinite(temperature)) data[date] = { temperature, code: body.daily.weather_code?.[i] ?? null, source: 'Open-Meteo' };
    });
    if (weatherCache.size > 12) weatherCache.clear();
    weatherCache.set(key, { data, until: Date.now() + 30 * 60000 }); return data;
  } catch { weatherCache.set(key, { data: {}, until: Date.now() + 60000 }); return {}; }
}
export function createApp({ weatherProvider = getWeather } = {}) {
  const app = express(), sessions = new Map();
  const TTL = 2 * 60 * 60 * 1000;
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'SAMEORIGIN', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'" });
    next();
  });
  app.get('/api/health', (_, res) => res.json({ ok: true }));
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.method !== 'GET' && req.get('sec-fetch-site') === 'cross-site') return res.status(403).json({ error: 'Uploads are only allowed from this site.' });
    const now = Date.now();
    for (const [id, entry] of sessions) if (now - entry.last > TTL) sessions.delete(id);
    let id = req.headers.cookie?.match(/(?:^|;\s*)dukenai_session=([a-f0-9]{48})(?:;|$)/)?.[1];
    if (!id || !sessions.has(id)) {
      if (sessions.size >= 100) return res.status(503).json({ error: 'The demo is busy. Please try again shortly.' });
      id = crypto.randomBytes(24).toString('hex');
      sessions.set(id, { records: null, source: 'demo', last: now, requests: [] });
    }
    res.cookie('dukenai_session', id, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: TTL });
    req.session = sessions.get(id); req.session.last = now;
    req.session.requests = req.session.requests.filter(t => now - t < 60000);
    if (req.session.requests.length >= 60) return res.status(429).json({ error: 'Too many requests. Please wait a minute.' });
    req.session.requests.push(now); next();
  });
  app.use(express.json({ limit: '2mb' }));
  app.use(express.text({ type: ['text/csv', 'text/plain', 'application/csv'], limit: '2mb' }));
  const data = req => req.session.records || generateDemo();
  app.get('/api/config', (req, res) => res.json({ today: todayKZ(), tomorrow: addDays(todayKZ(), 1), maxDate: addDays(todayKZ(), 9), cities: CITIES, districts: DISTRICTS, dataset: metadata(data(req), req.session.source) }));
  app.post('/api/upload', (req, res) => {
    try {
      const records = parseCSV(typeof req.body === 'string' ? req.body : req.body?.csv);
      const otherRows = [...sessions.values()].filter(s => s !== req.session).reduce((sum, s) => sum + (s.records?.length || 0), 0);
      if (otherRows + records.length > 150000) return res.status(503).json({ error: 'The demo is at capacity. Please try again later.' });
      req.session.records = records; req.session.source = 'upload';
      res.json({ dataset: metadata(records, 'upload') });
    } catch (error) { res.status(400).json({ error: error.message }); }
  });
  app.post('/api/demo', (req, res) => { req.session.records = null; req.session.source = 'demo'; res.json({ dataset: metadata(data(req), 'demo') }); });
  app.get('/api/demo.csv', (_, res) => res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="demo-sales.csv"' }).send('\uFEFF' + toCSV(generateDemo())));
  const resolve = async req => {
    const date = req.query.date || addDays(todayKZ(), 1), district = req.query.district || 'residential', city = req.query.city || 'almaty';
    if (typeof date !== 'string' || !validDate(date) || date < addDays(todayKZ(), 1) || date > addDays(todayKZ(), 9)) throw new Error('Choose a date from tomorrow through 9 days ahead.');
    if (typeof district !== 'string' || typeof city !== 'string' || !Object.hasOwn(DISTRICTS, district) || !Object.hasOwn(CITIES, city)) throw new Error('Unknown neighborhood or city.');
    return buildPlan(data(req), { date, district, city, weather: await weatherProvider(city), source: req.session.source });
  };
  for (const endpoint of ['forecast', 'tips', 'summary']) app.get(`/api/${endpoint}`, async (req, res) => {
    try { const plan = await resolve(req); res.json(endpoint === 'forecast' ? plan : endpoint === 'tips' ? { tips: plan.tips, asOf: todayKZ() } : plan.summary); }
    catch (error) { res.status(400).json({ error: error.message }); }
  });
  app.use('/api', (_, res) => res.status(404).json({ error: 'API route not found.' }));
  app.use(express.static(path.join(root, 'public')));
  app.use((err, req, res, next) => { res.status(err.status === 413 ? 413 : 400).json({ error: err.status === 413 ? 'The file exceeds 2 MB.' : 'Could not read the request.' }); });
  return app;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, '0.0.0.0', () => console.log(`DukenAI: http://localhost:${port}`));
}
