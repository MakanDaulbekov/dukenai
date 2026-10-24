import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, generateDemo, toCSV, forecastProduct, buildPlan, addDays, todayKZ, category } from '../forecast.js';
import { createApp } from '../server.js';
const today = todayKZ(), tomorrow = addDays(today, 1);
const row = (date, qty, extra={}) => ({ date, product:'Хлеб', qty, price:100, stock:3, shelf_life_days:2, ...extra });
test('demo CSV round trips with 90 days and 15 products',()=>{
  const data=generateDemo(); const parsed=parseCSV('\uFEFF'+toCSV(data));
  assert.equal(parsed.length,1350);assert.equal(new Set(parsed.map(r=>r.date)).size,90);assert.equal(new Set(parsed.map(r=>r.product)).size,15);
});
test('CSV supports quotes, Unicode, semicolons and decimals',()=>{
  const parsed=parseCSV(`date;product;qty;price;stock;shelf_life_days\r\n${today};"Хлеб, ""Дархан""";0;1,5;2;0\r\n`);
  assert.equal(parsed[0].product,'Хлеб, "Дархан"');assert.equal(parsed[0].qty,0);assert.equal(parsed[0].price,1.5);
});
test('invalid dates, negative values, duplicates and broken CSV are rejected',()=>{
  const header='date,product,qty,price,stock,shelf_life_days\n';
  for(const line of ['2026-02-30,Хлеб,1,2,3,1',`${today},Хлеб,-1,2,3,1`,`${tomorrow},Хлеб,1,2,3,1`,`${today},"Хлеб,1,2,3,1`,`${today},Хлеб,,2,3,1`])assert.throws(()=>parseCSV(header+line));
  assert.throws(()=>parseCSV(header+`${today},Хлеб,1,2,3,1\n${today},Хлеб,1,2,3,1`),/duplicate/);
});
test('baseline uses the last four matching weekdays, including zeros; no future leakage',()=>{
  const rows=[35,28,21,14,7].map((n,i)=>row(addDays(tomorrow,-n),[900,0,20,40,60][i]));
  rows.push(row(tomorrow,10000));
  const r=forecastProduct(rows,tomorrow,'residential',{});
  assert.equal(r.base,30); assert.equal(r.samples,4);
});
test('weather, office weekends and holiday factors are explained and multiplied',()=>{
  const date='2026-03-08';
  const breadRows=[28,21,14,7].map(n=>row(addDays(date,-n),100,{product:'Круассан'}));
  const pastry=forecastProduct(breadRows,date,'office',{});
  assert.equal(pastry.forecast,78); assert.equal(pastry.reasons.length,3);
  const tea=forecastProduct(breadRows.map(r=>({...r,product:'Чай'})),date,'residential',{[date]:{temperature:-20}});
  assert.equal(tea.forecast,120);
  const ice=forecastProduct(breadRows.map(r=>({...r,product:'Мороженое'})),date,'residential',{[date]:{temperature:-20}});
  assert.equal(ice.forecast,70);
});
test('weekly plan counts opening inventory only once and excludes expired stock',()=>{
  const today='2026-10-24', tomorrow='2026-10-25';
  const records=Array.from({length:35},(_,i)=>row(addDays(today,i-34),10,{stock:50,shelf_life_days:30}));
  const p=buildPlan(records,{date:tomorrow,today});
  assert.equal(p.items[0].order,0);assert.equal(p.week.reduce((s,d)=>s+d.order,0),21);
  const expired=buildPlan(records.map(r=>({...r,shelf_life_days:0})),{date:tomorrow,today});
  assert.equal(expired.items[0].usableStock,0);assert.equal(expired.tips[0].expired,true);assert.equal(expired.tips[0].discount,0);
});
test('tips compare stock with cumulative sales before expiry',()=>{
  const records=Array.from({length:35},(_,i)=>row(addDays(today,i-34),8,{product:'Молоко',stock:28,price:650,shelf_life_days:2}));
  const p=buildPlan(records,{date:tomorrow,today});
  const expected=p.tips[0].expected;
  assert.equal(p.tips[0].excess,28-expected);assert.equal(p.tips[0].valueAtRisk,(28-expected)*650);assert.equal(p.tips[0].discount,20);
});
test('HTTP: upload, forecast, summary, bad input and separate sessions',async()=>{
  const app=createApp({weatherProvider:async()=>({})});const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    const initial=await fetch(base+'/api/config');const cookie=initial.headers.get('set-cookie').split(';')[0];assert.equal((await initial.json()).dataset.products,15);
    const csv=toCSV(Array.from({length:35},(_,i)=>row(addDays(today,i-34),10,{product:'Тестовый хлеб'})));
    const uploaded=await fetch(base+'/api/upload',{method:'POST',headers:{cookie,'Content-Type':'text/csv'},body:csv});assert.equal(uploaded.status,200);assert.match(uploaded.headers.get('set-cookie'),/Max-Age=7200/);
    const p=await (await fetch(base+`/api/forecast?date=${tomorrow}&district=residential`,{headers:{cookie}})).json();assert.equal(p.items.length,1);assert.equal(p.items[0].product,'Тестовый хлеб');assert.equal(p.week.length,7);assert.equal(p.weather,null);
    const invalid=await fetch(base+'/api/upload',{method:'POST',headers:{cookie,'Content-Type':'text/csv'},body:'invalid'});assert.equal(invalid.status,400);
    const own=await(await fetch(base+'/api/config',{headers:{cookie}})).json();assert.equal(own.dataset.products,1);
    const other=await(await fetch(base+'/api/config')).json();assert.equal(other.dataset.products,15);
    const summary=await(await fetch(base+'/api/summary',{headers:{cookie}})).json();assert.equal(summary.mode,'rules');assert.match(summary.text,/Тестовый хлеб/);
    const tips=await fetch(base+'/api/tips',{headers:{cookie}});assert.equal(tips.status,200);
    for(const query of ['date=bad','district=bad','city=bad','date='+today])assert.equal((await fetch(base+'/api/forecast?'+query,{headers:{cookie}})).status,400);
    assert.equal((await fetch(base+'/api/upload',{method:'POST',headers:{cookie,'Content-Type':'text/csv','Sec-Fetch-Site':'cross-site'},body:csv})).status,403);
    const page=await fetch(base+'/');assert.equal(page.status,200);assert.match(await page.text(),/DukenAI/);
    assert.equal((await fetch(base+'/api/demo',{method:'POST',headers:{cookie}})).status,200);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});

test('English product categories use word boundaries',()=>{ assert.equal(category('Steak'),'celebration'); assert.equal(category('Tea'),'tea'); assert.equal(category('Steamed rice'),'other'); });

test('English demo product names preserve forecasting categories',()=>{
  const russian=['Баурсаки','Хлеб на закваске','Круассан','Булочка с маком','Самса','Багет','Синнабон','Печенье овсяное','Торт медовик','Чай чёрный','Кофе','Молоко','Мороженое','Мука','Яйца'];
  const english=[...new Set(generateDemo().map(r=>r.product))];
  assert.equal(english.length,15);
  english.forEach((name,i)=>{assert.doesNotMatch(name,/[А-Яа-яЁё]/);assert.equal(category(name),category(russian[i]),name);});
  const p=buildPlan(generateDemo(),{date:tomorrow,today});
  assert.doesNotMatch(JSON.stringify(p),/[А-Яа-яЁё]/);
});
