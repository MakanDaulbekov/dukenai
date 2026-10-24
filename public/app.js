'use strict';
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const icons = {
  wheat:'<path d="M12 22V5M12 17C6 17 4 13 4 10c5 0 8 3 8 7zM12 11c5 0 8-3 8-7-5 0-8 3-8 7zM12 21c6 0 9-4 9-8-5 0-9 3-9 8zM12 10C8 10 6 7 6 3c4 0 6 3 6 7z"/>',
  shop:'<path d="M3 10h18l-2-6H5l-2 6zM4 10v10h16V10M9 20v-6h6v6M3 10c0 3 4 3 4 0 0 3 5 3 5 0 0 3 5 3 5 0 0 3 4 3 4 0"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  list:'<rect x="5" y="4" width="15" height="17" rx="2"/><path d="M9 4V2M16 4V2M9 9h7M9 13h7M9 17h4"/>',
  chart:'<path d="M4 4v16h17M7 15l4-5 4 2 5-7M16 5h4v4"/>',
  database:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 4 16 4 16 0V5M4 12v7c0 4 16 4 16 0v-7"/>',
  leaf:'<path d="M20 3C7 1 2 9 7 15s15 0 13-12zM4 21 16 9M7 18v-7M7 17h7"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 17h.01"/>',
  upload:'<path d="M12 16V3M7 8l5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/>',
  download:'<path d="M12 3v13M7 11l5 5 5-5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/>',
  pin:'<path d="M19 9c0 6-7 12-7 12S5 15 5 9a7 7 0 0 1 14 0z"/><circle cx="12" cy="9" r="2.5"/>',
  sparkles:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3zM20 2v4M18 4h4"/>',
  bread:'<path d="M5 11a4 4 0 0 1-2-3c0-3 3-5 9-5s9 2 9 5a4 4 0 0 1-2 3v9H5v-9zM8 6l-1 3M13 5l-1 3M17 6l-1 3"/>',
  box:'<path d="m3 7 9-4 9 4v13H3V7zM3 7h18M12 3v4M9 12h6"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5l1.5 1.5M5 19l1.5-1.5M17.5 6.5l1.5-1.5"/>',
  cup:'<path d="M4 8h13v6a6 6 0 0 1-12 0V8M17 9h2a3 3 0 0 1 0 6h-2M4 21h15M8 3v2M13 2v3"/>'
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.box}</svg>`;
$$('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon));
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = value => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(value);
const dateLabel = (date, options = { day: 'numeric', month: 'long' }) => new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z'));
let config, plan, filter = 'all', horizon = 'day', busy = false, toastTimer;
async function api(path, options = {}) {
  const response = await fetch(path, { ...options, credentials: 'same-origin', signal: AbortSignal.timeout(18000) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'The request could not be completed.');
  return body;
}
function notify(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 4500); }
function error(message) { $('#error').textContent = message; $('#error').hidden = !message; }
function setBusy(value) {
  busy = value; $('#results').setAttribute('aria-busy', String(value));
  $('#calculate').disabled = value; $('#use-demo').disabled = value; $('#dialog-demo').disabled = value;
  $$('.upload-trigger').forEach(b => b.disabled = value);
  $('#calculate-label').textContent = value ? 'Calculating demand…' : 'Generate plan';
  $('#export').disabled = value || !plan;
}
function params() { return new URLSearchParams({ date: $('#forecast-date').value, district: $('#district').value, city: $('#city').value }); }
async function calculate() {
  if (busy) return;
  if (!$('#forecast-date').reportValidity()) return;
  setBusy(true); error('');
  try {
    const requested = params().toString();
    plan = await api('/api/forecast?' + requested);
    $('#dirty').hidden = params().toString() === requested;
    render(); $('#results').hidden = false; return true;
  } catch (e) { error(e.name === 'TimeoutError' ? 'The calculation timed out. Please try again.' : e.message); return false; }
  finally { setBusy(false); }
}
function renderDataset(dataset) {
  const source = dataset.source === 'demo' ? 'Demo data' : 'Your CSV';
  $('#data-context').innerHTML = `<span class="status-dot"></span>${source} · ${dataset.days} days · ${dataset.products} products · ${fmt(dataset.rows)} rows`;
  $('#dataset-info').textContent = `${source}: ${dateLabel(dataset.from)} — ${dateLabel(dataset.to)} · ${dataset.products} products.`;
}
function render() {
  renderDataset(plan.dataset);
  const total = plan.totals;
  $('#stat-demand').innerHTML = `${fmt(total.forecast)}<small>units</small>`;
  $('#stat-order').innerHTML = `${fmt(total.order)}<small>units</small>`;
  $('#stat-stock').innerHTML = `${fmt(total.stock)}<small>units</small>`;
  $('#stat-risk').innerHTML = `${fmt(total.risk)}<small>₸</small>`;
  $('#stat-demand-note').textContent = `${dateLabel(plan.date)} · ${plan.items.length} products`;
  $('#stat-risk-note').textContent = `${total.riskQty} units · at retail prices`;
  $('#insight-title').textContent = plan.date === config.tomorrow ? 'Tomorrow, at a glance.' : 'Your selected day.';
  $('#summary-text').textContent = plan.summary.text;
  $('#weather').innerHTML = plan.weather ? `${icon('sun')} ${Math.round(plan.weather.temperature)}°C · ${escapeHTML(config.cities[plan.city].name)} · ${dateLabel(plan.date)}` : `${icon('info')} No weather adjustment`;
  $('#product-count').textContent = plan.items.length; $('#risk-count').textContent = plan.tips.length;
  $('#tips-date').textContent = dateLabel(config.today);
  $('#warnings').innerHTML = plan.warnings.map(w => `<li>${escapeHTML(w)}</li>`).join('');
  renderChart(); renderTable(); renderTips();
}
function displayRows() {
  if (horizon === 'day') return plan.items;
  return plan.items.map(item => ({ ...item, forecast: plan.week.reduce((s, d) => s + d.items.find(r => r.product === item.product).forecast, 0), order: plan.week.reduce((s, d) => s + d.items.find(r => r.product === item.product).order, 0), buffer: plan.week.reduce((s, d) => s + d.items.find(r => r.product === item.product).buffer, 0) }));
}
function isBakery(product) { return /баурсак|хлеб|круассан|булоч|самса|багет|синнабон|печень|торт|bread|cake|croissant|bun|baursak|samsa|baguette|cinnamon roll|cookies/i.test(product); }
function productIcon(product) { return /чай|кофе|\b(?:tea|coffee)\b/i.test(product) ? 'cup' : isBakery(product) ? 'bread' : 'box'; }
function renderTable() {
  if (!plan) return;
  const query = $('#search').value.toLocaleLowerCase('en-GB').trim();
  const rows = displayRows().filter(r => r.product.toLocaleLowerCase('en-GB').includes(query) && (filter !== 'bakery' || isBakery(r.product)) && (filter !== 'risk' || plan.tips.some(t => t.product === r.product)));
  $('#plan-date').textContent = horizon === 'day' ? `for ${dateLabel(plan.date)}` : `for ${dateLabel(plan.date, {day:'numeric',month:'short'})} — ${dateLabel(plan.week.at(-1).date, {day:'numeric',month:'short'})}`;
  $('#plan-subtitle').textContent = horizon === 'day' ? 'Your baking and ordering recommendations for one day' : 'The total of 7 daily plans. Usable stock carries over until it expires.';
  $('#plan-body').innerHTML = rows.length ? rows.map(row => {
    const index = plan.items.findIndex(r => r.product === row.product), risk = plan.tips.find(t => t.product === row.product);
    const adjustment = row.reasons.filter(r => r.kind === 'adjustment').map(r => r.label).join(' · ');
    return `<tr><td><span class="product-cell"><span class="product-avatar">${icon(productIcon(row.product))}</span>${escapeHTML(row.product)}</span></td><td class="numeric">${fmt(row.forecast)}</td><td class="numeric">${fmt(row.stock)}</td><td class="numeric"><span class="order-number ${row.order ? '' : 'zero'}">${fmt(row.order)}</span></td><td class="reason-cell">${risk ? `<span class="tag warn">${risk.expired ? 'Expired' : 'Check stock'}</span>` : ''}${escapeHTML(horizon === 'week' ? 'Daily forecasts + batch tracking' : adjustment || 'Sales history · buffer ' + Math.round(row.bufferRate * 100) + '%')}</td><td><button class="row-toggle" data-detail="${index}" aria-label="Calculation: ${escapeHTML(row.product)}" aria-expanded="false" aria-controls="detail-${index}">⌄</button></td></tr><tr class="row-detail" id="detail-${index}" hidden><td colspan="6">${detailHTML(row, index)}</td></tr>`;
  }).join('') : '<tr><td colspan="6" class="empty-state">No matching products. Try a different search or filter.</td></tr>';
  $('#table-count').textContent = `Showing ${rows.length} of ${plan.items.length} products · quantities in units`;
}
function detailHTML(row, index) {
  const original = plan.items[index];
  if (horizon === 'week') return `<b>${escapeHTML(row.product)}: prepare ${fmt(row.order)} units this week</b><p>Each day is calculated separately. Opening stock is counted once, used by earliest expiry and carried over while still usable.</p><div class="reason-list">${plan.week.map(d => {const r=d.items[index];return `<span>${dateLabel(d.date,{day:'numeric',month:'short'})}: demand ${r.forecast} / prepare ${r.order}</span>`}).join('')}</div>`;
  return `<b>To prepare: ${original.order} units</b><p>Demand ${original.forecast} + buffer ${original.buffer} − usable stock ${original.usableStock}; the result cannot be negative.</p><p>Baseline: ${original.base} units · ${original.samples} observations · stock recorded on ${dateLabel(original.stockDate)}. Orders cannot be negative.${original.limited ? ' Fewer than 4 matching weekdays are available — this is a preliminary forecast.' : ''}</p><div class="reason-list">${original.reasons.map(r=>`<span>${escapeHTML(r.label)}</span>`).join('')}</div>`;
}
function renderTips() {
  $('#tips').innerHTML = plan.tips.length ? plan.tips.map(t => `<article class="tip-card"><div class="tip-top"><h3>${escapeHTML(t.product)}</h3><span class="tip-discount">${t.expired ? 'Expired' : '−' + t.discount + '%'}</span></div><p>On hand: ${t.stock} units · ${t.expired ? '0 days of shelf life remaining' : 'Remaining: ' + t.days + ' days'}<br>Expected sales before expiry: ${t.expected} units<br>Excess: ${t.excess} units · ${fmt(t.valueAtRisk)} ₸ at retail prices.</p><div class="tip-action"><span>${t.expired ? 'Remove this product from sale' : 'Consider a discount of ' + t.discount + '% today'}</span>${icon(t.expired ? 'info' : 'leaf')}</div></article>`).join('') : '<div class="tips-empty">No excess stock found for products with up to 14 days remaining. Check that your data is current before baking.</div>';
}
function renderChart() {
  if (!plan) return;
  const history = plan.history.slice(-Number($('#chart-range').value));
  const future = plan.week.map(d => ({ date: d.date, qty: d.forecast }));
  const allDates = [...history.map(d=>d.date)];
  let d = history.at(-1).date;
  while (d < future.at(-1).date) { d = new Date(Date.parse(d+'T12:00:00Z') + 86400000).toISOString().slice(0,10); allDates.push(d); }
  const W=680,H=215,L=40,R=18,T=28,B=30;
  const max = Math.max(1,...history.map(d=>d.qty??0),...future.map(d=>d.qty)), step = Math.max(1, Math.ceil(max/4/10)*10), ceiling = step*4;
  const x = date => L + allDates.indexOf(date)/(allDates.length-1)*(W-L-R), y = qty => H-B-(qty/ceiling)*(H-T-B);
  const firstFuture=x(future[0].date), lastHistory=history.at(-1);
  let grid=''; for(let i=0;i<=4;i++){ const val=i*step;grid+=`<line class="gridline" x1="${L}" y1="${y(val)}" x2="${W-R}" y2="${y(val)}"/><text x="${L-9}" y="${y(val)+3}" text-anchor="end">${fmt(val)}</text>`; }
  let path='', previous=false;
  history.forEach(d=>{ if(d.qty===null){previous=false;return;}path+=`${previous?'L':'M'}${x(d.date)},${y(d.qty)} `;previous=true; });
  const connected = new Date(future[0].date).getTime()-new Date(lastHistory.date).getTime()===86400000 && lastHistory.qty!==null;
  const forecastPoints = connected ? [lastHistory,...future] : future;
  const futurePath=forecastPoints.map((d,i)=>`${i?'L':'M'}${x(d.date)},${y(d.qty)}`).join(' ');
  const labels=[history[0].date,history[Math.floor(history.length/3)].date,history[Math.floor(history.length*2/3)].date,lastHistory.date,future.at(-1).date];
  const actualDots=history.filter(d=>d.qty!==null).map(d=>`<circle cx="${x(d.date)}" cy="${y(d.qty)}" r="3" fill="#78876b" opacity="0.8"><title>${dateLabel(d.date)}: sold ${d.qty} units</title></circle>`).join('');
  const dots=future.map(d=>`<circle cx="${x(d.date)}" cy="${y(d.qty)}" r="3" fill="#a85742"><title>${dateLabel(d.date)}: forecast ${d.qty} units</title></circle>`).join('');
  $('#chart').innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="chart-title chart-desc"><title id="chart-title">Sales history and forecast</title><desc id="chart-desc">${history.length} days of history and 7 forecast days. Missing dates appear as gaps. Forecast for the selected day: ${plan.totals.forecast} units.</desc><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a1b18b" stop-opacity=".14"/><stop offset="1" stop-color="#a1b18b" stop-opacity="0"/></linearGradient></defs><rect x="${firstFuture-5}" y="${T-12}" width="${W-R-firstFuture+5}" height="${H-T-B+12}" rx="3" fill="#f7eee7"/>${grid}<line x1="${firstFuture-5}" y1="${T-10}" x2="${firstFuture-5}" y2="${H-B}" stroke="#dfc6b7" stroke-dasharray="3 4"/><text class="forecast-label" x="${firstFuture}" y="${T-15}">FORECAST</text><path class="actual-line" d="${path}"/><path class="forecast-line" d="${futurePath}"/>${actualDots}${dots}${labels.map(d=>`<text x="${x(d)}" y="${H-8}" text-anchor="middle">${dateLabel(d,{day:'numeric',month:'short'})}</text>`).join('')}</svg>`;
}
async function useDemo() {
  if (busy) return;
  setBusy(true); error('');
  try { const response = await api('/api/demo',{method:'POST'}); plan = null; $('#results').hidden = true; renderDataset(response.dataset); $('#data-dialog').close(); setBusy(false); const ok = await calculate(); notify(ok ? 'Demo data loaded: 90 days, 15 products.' : 'Demo data loaded. Please generate the plan again.'); }
  catch(e){error(e.message)} finally{setBusy(false)}
}
async function upload(file) {
  if (!file || busy) return;
  if (file.size>2*1024*1024) { error('The file exceeds 2 MB. Please choose a smaller CSV.'); $('#data-dialog').close(); return; }
  if (!file.name.toLowerCase().endsWith('.csv')) {error('Please choose a .csv file.');$('#data-dialog').close();return;}
  setBusy(true);error('');
  try {
    // Raw bytes: the server accepts UTF-8 and Windows-1251 (Excel's default CSV encoding on Russian Windows).
    const response = await api('/api/upload', {method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file});
    plan = null; $('#results').hidden = true; renderDataset(response.dataset);
    $('#data-dialog').close();setBusy(false);const ok = await calculate();notify(ok ? 'CSV uploaded. Your plan now uses your sales data.' : 'CSV uploaded. Please generate the plan again.');
  } catch(e){error(e.message);$('#data-dialog').close();}finally{setBusy(false);$('#csv-file').value='';}
}
function downloadPlan() {
  if (!plan) return;
  const cell = value => { let str=String(value); if(/^[=+\-@\t\r]/.test(str))str="'"+str;return '"'+str.replaceAll('"','""')+'"'; };
  const rows = [['date','product','forecast','stock','prepare','buffer','why']];
  const days=horizon==='day'?[{date:plan.date,items:plan.items}]:plan.week;
  days.forEach(d=>d.items.forEach(r=>rows.push([d.date,r.product,r.forecast,r.usableStock,r.order,r.buffer,r.reasons.map(x=>x.label).join('; ')])));
  const blob=new Blob(['\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob), link=document.createElement('a');link.href=url;link.download=`dukenai-${horizon}-${plan.date}.csv`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Plan downloaded. No orders have been placed.');
}
$('#calculate').addEventListener('click',calculate);
$('#use-demo').addEventListener('click',useDemo);$('#dialog-demo').addEventListener('click',useDemo);
$$('.upload-trigger').forEach(button=>button.addEventListener('click',()=>$('#csv-file').click()));
$('#csv-file').addEventListener('change',event=>upload(event.target.files[0]));
$$('[data-open]').forEach(button=>button.addEventListener('click',()=>$('#'+button.dataset.open).showModal()));
$$('.close-dialog').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
$$('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}}));
['dragenter','dragover'].forEach(name=>$('#dropzone').addEventListener(name,event=>{event.preventDefault();$('#dropzone').classList.add('dragover');}));
['dragleave','drop'].forEach(name=>$('#dropzone').addEventListener(name,event=>{event.preventDefault();$('#dropzone').classList.remove('dragover');if(name==='drop')upload(event.dataTransfer.files[0]);}));
['city','district','forecast-date'].forEach(id=>$('#'+id).addEventListener('change',()=>$('#dirty').hidden=false));
$('#chart-range').addEventListener('change',renderChart);$('#search').addEventListener('input',renderTable);
$$('[data-filter]').forEach(button=>button.addEventListener('click',()=>{filter=button.dataset.filter;$$('[data-filter]').forEach(b=>{const selected=b===button;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});renderTable();}));
['day','week'].forEach(value=>$('#'+value+'-view').addEventListener('click',()=>{horizon=value;['day','week'].forEach(v=>{const button=$('#'+v+'-view');button.classList.toggle('selected',v===value);button.setAttribute('aria-pressed',String(v===value));});renderTable();}));
$('#plan-body').addEventListener('click',event=>{const button=event.target.closest('[data-detail]');if(!button)return;const detail=$('#detail-'+button.dataset.detail);detail.hidden=!detail.hidden;button.setAttribute('aria-expanded',String(!detail.hidden));button.textContent=detail.hidden?'⌄':'⌃';});
$('#export').addEventListener('click',downloadPlan);
$$('a.nav-item').forEach(link=>link.addEventListener('click',()=>{$$('.nav-item').forEach(l=>l.classList.remove('active'));link.classList.add('active');}));
async function init() {
  setBusy(true);
  try {config=await api('/api/config');$('#forecast-date').value=config.tomorrow;$('#forecast-date').min=config.tomorrow;$('#forecast-date').max=config.maxDate;$('#forecast-date').required=true;renderDataset(config.dataset);setBusy(false);await calculate();}
  catch(e){error('Could not load data. Please refresh the page. '+e.message);setBusy(false);}
}
init();
