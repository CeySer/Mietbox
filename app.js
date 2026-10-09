// ============================================================
//  MIETBOX – Vermieter-App
// ============================================================
import {
  $, $$, esc, num, eur, nowIso, toLocalInput, dayKey, fmtDate, fmtDT, fmtShort, rentalDays, toast,
  ITEM_TYPES, LOCK_TYPES, DEFAULT_CHECKLIST, PHOTO_KINDS, ID_KINDS, FEE_TYPES, LICENSE_CLASSES,
  DEFAULT_SETTINGS, DEFAULT_TERMS, rentalStatus, requiredDocs, docsComplete, COND_KINDS, feesTotal, suggestLateFee, contractHtml,
  downloadContract, shareContract, kautionPayout, compressImage, SignaturePad, initStore, isDemo, APP_NAME,
} from './common.js?v=3';

let store, user = null;
let items = [], rentals = [], settings = { ...DEFAULT_SETTINGS };
let started = false, dirty = false, pending = false;
const photoCache = {};
const ui = { calMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1), calItem: '', calSel: dayKey(new Date()), listFilter: 'offen', year: new Date().getFullYear() };
const app = $('#app'), nav = $('#nav');

// ---------- Start ----------
boot();
async function boot() {
  try { store = await initStore(); }
  catch (e) { app.innerHTML = `<div class="center-screen"><div class="card"><h2>Verbindung fehlgeschlagen</h2><p class="muted">${esc(e.message)}</p><p class="small">Prüfe die Internetverbindung und die Einträge in <b>config.js</b>.</p></div></div>`; return; }
  if (isDemo) $('#banner').innerHTML = `<div class="demo-banner">Demo-Modus: Daten bleiben nur in diesem Browser. Für echten Betrieb Firebase in config.js eintragen.</div>`;
  store.onAuth(u => { user = u; if (!u) { started = false; renderLogin(); } else start(); });
}

async function start() {
  if (started) return; started = true;
  try { settings = { ...DEFAULT_SETTINGS, ...(await store.getSettings() || {}) }; } catch (e) { console.error(e); }
  if (settings.terms && settings.terms.startsWith('## 1. Mietgegenstand') && !settings.terms.includes('{NUTZUNG}')) settings.terms = ''; // alte Vorlage → neue
  if (num(settings.loeschTage) === 30) settings.loeschTage = 90;
  let first = 0;
  store.watchCol('items', d => { items = d.sort((a, b) => (a.name || '').localeCompare(b.name || '')); refresh(); });
  store.watchCol('rentals', d => {
    const before = new Map(rentals.map(r => [r.id, r]));
    rentals = d.sort((a, b) => new Date(a.von) - new Date(b.von));
    if (first++) notifyChanges(before);
    refresh();
  });
  window.addEventListener('hashchange', () => { dirty = false; render(); window.scrollTo(0, 0); });
  render();
  setTimeout(autoCleanup, 4000);
}

// Live-Hinweise, wenn der Mieter etwas über den Link macht
function notifyChanges(before) {
  for (const r of rentals) {
    const o = before.get(r.id); if (!o) continue;
    const n = r.mieter?.name || 'Mieter';
    if (!o.signature && r.signature && r.signedBy === 'link') toast(`✍️ ${n} hat den Vertrag unterschrieben`, 'ok');
    if (!o.openRequestAt && r.openRequestAt) toast(`🔓 ${n} wartet am Anhänger und bittet um Öffnung`, 'ok');
    if (!o.renterPickupAt && r.renterPickupAt) toast(`🚗 ${n} hat abgeholt`, 'ok');
    if (!o.renterReturnAt && r.renterReturnAt) toast(`✅ ${n} hat zurückgegeben`, 'ok');
  }
}

function refresh() {
  if (!started) return;
  if (dirty) { if (!pending) { pending = true; showPending(); } return; }
  render(true);
}
function showPending() {
  const b = document.createElement('button');
  b.className = 'btn sm'; b.id = 'pendingBtn'; b.textContent = '↻ Neue Daten – aktualisieren';
  b.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:60';
  b.onclick = () => { dirty = false; render(true); };
  document.body.appendChild(b);
}

// ---------- Router ----------
function route() { const h = location.hash.replace(/^#\/?/, ''); const [p, id] = h.split('/'); return { p: p || 'start', id }; }

function render(keepScroll) {
  if (!user) return;
  pending = false; $('#pendingBtn')?.remove();
  const y = window.scrollY;
  const { p, id } = route();
  // offene/zugeklappte Abschnitte merken
  const openState = keepScroll ? new Map($$('details', app).map(d => [d.querySelector('summary')?.textContent.trim().slice(0, 8), d.open])) : new Map();
  app.onclick = null;
  renderNav(p);
  const views = { start: viewStart, kalender: viewCalendar, mieten: () => viewRentals(id), miete: () => viewRental(id), einnahmen: viewMoney, mehr: viewMore, artikel: () => id ? viewItem(id) : viewItems(), einstellungen: viewSettings };
  (views[p] || viewStart)();
  for (const d of $$('details', app)) { const k = d.querySelector('summary')?.textContent.trim().slice(0, 8); if (openState.has(k)) d.open = openState.get(k); }
  dirty = false;
  if (keepScroll) window.scrollTo(0, y);
}

const ICONS = {
  start: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  kalender: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  mieten: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  einnahmen: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  mehr: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
};
function renderNav(p) {
  nav.hidden = false;
  const active = p === 'miete' ? 'mieten' : (p === 'artikel' || p === 'einstellungen') ? 'mehr' : p;
  const L = { start: 'Start', kalender: 'Kalender', mieten: 'Mieten', einnahmen: 'Einnahmen', mehr: 'Mehr' };
  nav.innerHTML = `<div class="in">${Object.keys(L).map(k => `<a href="#/${k}" class="${active === k ? 'on' : ''}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[k]}</svg>${L[k]}</a>`).join('')}</div>`;
}
const header = (title, sub = '', back = '') => `
  <header class="top">${back ? `<a class="btn ghost sm" href="${back}">‹</a>` : `<div class="logo">M</div>`}
  <div class="title"><h1>${title}</h1>${sub ? `<div class="small muted">${sub}</div>` : ''}</div></header>`;
const fab = (href = '#/miete/neu') => `<a class="fab" href="${href}" aria-label="Neue Miete">+</a>`;
const itemById = (id) => items.find(i => i.id === id);
const itemIcon = (t) => ({ anhaenger: '🚚', werkzeug: '🔧', roller: '🛴', sonstiges: '📦' }[t] || '📦');

// ---------- Login ----------
function renderLogin() {
  nav.hidden = true; document.body.classList.add('no-nav');
  app.innerHTML = `<div class="center-screen"><div class="card" style="width:100%;max-width:400px">
    <div class="row" style="margin-bottom:10px"><div class="logo">M</div><h1 style="margin:0">${APP_NAME}</h1></div>
    <p class="muted small">Verleih-Verwaltung – Anmeldung nur für dich als Vermieter.</p>
    ${isDemo ? `<button class="btn block" id="demoGo">Demo starten</button>` : `
    <label>E-Mail</label><input id="em" type="email" autocomplete="username">
    <label>Passwort</label><input id="pw" type="password" autocomplete="current-password">
    <div class="btns"><button class="btn grow" id="loginBtn">Anmelden</button></div>
    <div class="btns"><button class="btn ghost sm" id="regBtn">Erstes Mal? Konto anlegen</button><button class="btn ghost sm" id="resetBtn">Passwort vergessen</button></div>`}
  </div></div>`;
  if (isDemo) { $('#demoGo').onclick = () => store.login('demo@mietbox'); return; }
  const go = (fn) => async () => {
    try { await fn($('#em').value.trim(), $('#pw').value); }
    catch (e) { toast(({ 'auth/invalid-credential': 'E-Mail oder Passwort falsch', 'auth/email-already-in-use': 'Konto gibt es schon – bitte anmelden', 'auth/weak-password': 'Passwort zu kurz (mind. 6 Zeichen)' }[e.code]) || e.message, 'err'); }
  };
  $('#loginBtn').onclick = go(store.login);
  $('#pw').onkeydown = (e) => { if (e.key === 'Enter') $('#loginBtn').click(); };
  $('#regBtn').onclick = go(store.register);
  $('#resetBtn').onclick = async () => { const e = $('#em').value.trim(); if (!e) return toast('Erst E-Mail eintragen'); await store.resetPw(e); toast('E-Mail zum Zurücksetzen gesendet', 'ok'); };
}

// ---------- Start / Übersicht ----------
function viewStart() {
  document.body.classList.remove('no-nav');
  const now = new Date(), today = dayKey(now);
  const open = rentals.filter(r => !r.closed);
  const st = (r) => rentalStatus(r, now).key;
  const overdue = open.filter(r => st(r) === 'ueberfaellig');
  const openReq = open.filter(r => r.openRequestAt && !r.lockReleased);
  const codeNeeded = open.filter(r => r.signature && !r.lockReleased && r.item?.lockType === 'code' && !(r.pickedUpAt || r.renterPickupAt) && !r.openRequestAt);
  const settle = open.filter(r => st(r) === 'zurueck');
  const pickToday = open.filter(r => dayKey(r.von) === today && !(r.pickedUpAt || r.renterPickupAt));
  const retToday = open.filter(r => dayKey(r.bis) === today && (r.pickedUpAt || r.renterPickupAt) && !(r.returnedAt || r.renterReturnAt));
  const unpaid = open.filter(r => !r.mietePaid && (r.pickedUpAt || r.renterPickupAt));
  const tuev = items.filter(i => i.tuevBis && (new Date(i.tuevBis) - now) < 60 * 864e5);
  const active = open.filter(r => ['aktiv', 'ueberfaellig'].includes(st(r)));
  const upcoming = open.filter(r => new Date(r.von) > now && new Date(r.von) - now < 14 * 864e5 && dayKey(r.von) !== today);
  const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthRev = rentals.filter(r => !r.storniert && new Date(r.von) >= mStart && new Date(r.von) <= now).reduce((s, r) => s + num(r.preis) + feesTotal(r), 0);
  const name = settings.name ? esc(settings.name.split(' ')[0]) : '';
  const alerts = [
    ...overdue.map(r => `<a class="alert red" href="#/miete/${r.id}">⏰ <span><b>Überfällig:</b> ${esc(r.item?.name)} bei ${esc(r.mieter?.name || '?')} – sollte zurück sein seit ${fmtShort(r.bis)}</span></a>`),
    ...openReq.map(r => `<a class="alert teal" href="#/miete/${r.id}">🔓 <span><b>${esc(r.mieter?.name || 'Mieter')} wartet</b> am ${esc(r.item?.name)} und bittet um Öffnung (${fmtShort(r.openRequestAt)})</span></a>`),
    ...codeNeeded.map(r => `<a class="alert teal" href="#/miete/${r.id}">🔑 <span><b>Code freigeben:</b> ${esc(r.mieter?.name)} hat unterschrieben – Abholung ${fmtShort(r.von)}</span></a>`),
    ...settle.map(r => `<a class="alert blue" href="#/miete/${r.id}">🧾 <span><b>Abrechnen:</b> ${esc(r.item?.name)} von ${esc(r.mieter?.name || '?')} ist zurück – Zustand prüfen & Kaution abrechnen</span></a>`),
    ...tuev.map(i => `<a class="alert amber" href="#/artikel/${i.id}">🛠️ <span><b>TÜV/HU:</b> ${esc(i.name)} fällig bis ${fmtDate(i.tuevBis)}</span></a>`),
  ];
  const line = (r) => { const s = rentalStatus(r, now); return `<a class="list-item" href="#/miete/${r.id}"><div class="ic">${itemIcon(r.item?.typ)}</div><div class="grow"><div class="t">${esc(r.mieter?.name || 'Ohne Namen')}</div><div class="small muted">${esc(r.item?.name || '')} · ${fmtShort(r.von)} – ${fmtShort(r.bis)}</div></div><span class="badge ${s.cls}">${s.label}</span></a>`; };
  app.innerHTML = `${header(`Hallo${name ? ' ' + name : ''} 👋`, fmtDate(now))}
    ${!items.length ? `<div class="card"><h2>Los geht's</h2><p class="muted">Leg zuerst deinen Anhänger (oder anderes Mietgerät) an und trag in den Einstellungen deine Daten und Unterschrift ein.</p><div class="btns"><a class="btn" href="#/artikel/neu">+ Anhänger anlegen</a><a class="btn sec" href="#/einstellungen">Einstellungen</a></div></div>` : ''}
    ${alerts.join('')}
    <div class="stats">
      <a class="stat" href="#/mieten"><div class="v">${active.length}</div><div class="l">gerade unterwegs</div></a>
      <a class="stat ${unpaid.length ? 'warn' : ''}" href="#/mieten"><div class="v">${unpaid.length}</div><div class="l">Miete noch offen</div></a>
      <div class="stat"><div class="v">${pickToday.length} / ${retToday.length}</div><div class="l">heute Abholung / Rückgabe</div></div>
      <a class="stat" href="#/einnahmen"><div class="v">${eur(monthRev)}</div><div class="l">Einnahmen diesen Monat</div></a>
    </div>
    ${pickToday.length + retToday.length ? `<h2>Heute</h2><div class="card list">${[...pickToday, ...retToday].map(line).join('')}</div>` : ''}
    ${active.length ? `<h2>Unterwegs</h2><div class="card list">${active.map(line).join('')}</div>` : ''}
    ${upcoming.length ? `<h2>Demnächst</h2><div class="card list">${upcoming.map(line).join('')}</div>` : ''}
    ${!rentals.length && items.length ? `<div class="card empty">Noch keine Mieten.<br>Tippe auf <b>+</b> für die erste Miete.</div>` : ''}
    ${fab()}`;
}

// ---------- Mieten-Liste & Archiv ----------
function viewRentals(sub) {
  const now = new Date();
  const arch = sub === 'archiv';
  const row = (r) => {
    const s = rentalStatus(r, now);
    let extra = '';
    if (arch) {
      const d = daysLeft(r.closedAt, idDays());
      extra = (r.idDeleted ? '<span class="tiny muted">Ausweisfotos gelöscht</span>' : `<span class="tiny muted">Ausweisfotos noch ${Math.max(0, d)} Tage</span>`) + (!r.storniert && !r.finalSentAt ? ' <span class="badge amber">Abrechnung nicht verschickt</span>' : '');
    }
    return `<a class="list-item" href="#/miete/${r.id}" data-s="${esc(((r.mieter?.name || '') + ' ' + (r.mieter?.telefon || '') + ' ' + (r.fahrer2?.name || '') + ' ' + (r.item?.name || '') + ' ' + (r.item?.kennzeichen || '')).toLowerCase())}" data-von="${esc(r.von)}" data-bis="${esc(r.bis)}"><div class="ic">${itemIcon(r.item?.typ)}</div><div class="grow"><div class="t">${esc(r.mieter?.name || 'Ohne Namen')}</div><div class="small muted">${esc(r.item?.name || '')} · ${fmtShort(r.von)} – ${fmtShort(r.bis)}</div><div class="small">${r.storniert ? '' : eur(num(r.preis) + feesTotal(r)) + ' '}${!arch ? (r.mietePaid ? '<span class="badge green">bezahlt</span>' : '<span class="badge amber">offen</span>') : extra}</div></div><span class="badge ${s.cls}">${s.label}</span></a>`;
  };
  const list = arch ? rentals.filter(r => r.closed).sort((a, b) => new Date(b.bis) - new Date(a.bis)) : rentals.filter(r => !r.closed);
  app.innerHTML = `${header(arch ? 'Archiv' : 'Mieten', arch ? 'Abgeschlossene & stornierte Mieten' : '')}
    <div class="seg" style="margin-bottom:12px"><button data-f="" class="${arch ? '' : 'on'}">Laufend (${rentals.filter(r => !r.closed).length})</button><button data-f="archiv" class="${arch ? 'on' : ''}">🗄️ Archiv (${rentals.filter(r => r.closed).length})</button></div>
    ${arch ? `<div class="card tight"><label style="margin-top:0">🔎 Wer hatte den Anhänger am …? (z. B. Blitzer, Unfall)</label><div class="row"><input type="date" id="qd"><input type="time" id="qt" style="max-width:120px"></div><div id="qdRes"></div></div>` : ''}
    <input id="q" placeholder="Suchen (Name, Telefon, Kennzeichen) …" style="margin-bottom:12px">
    <div class="card list" id="rl">${list.length ? list.map(row).join('') : `<div class="empty">${arch ? 'Noch nichts im Archiv. Abgeschlossene Mieten landen hier.' : 'Keine laufenden Mieten.'}</div>`}</div>
    ${arch ? `<p class="small muted">Ausweis- und Führerscheinfotos werden ${idDays()} Tage nach Abschluss automatisch gelöscht, Zustandsfotos nach ${fotoDays()} Tagen. Vertrag und Mieterdaten bleiben erhalten.</p>` : fab()}`;
  $$('.seg button').forEach(b => b.onclick = () => { location.hash = b.dataset.f ? '#/mieten/archiv' : '#/mieten'; });
  $('#q').oninput = (e) => { const q = e.target.value.toLowerCase(); $$('#rl .list-item').forEach(a => a.style.display = a.dataset.s.includes(q) ? '' : 'none'); };
  if (arch) {
    const run = () => {
      const d = $('#qd').value; if (!d) { $('#qdRes').innerHTML = ''; return; }
      const t = $('#qt').value;
      const a = new Date(d + 'T' + (t || '00:00')), b = t ? a : new Date(new Date(d + 'T00:00').getTime() + 864e5);
      const hits = rentals.filter(r => !r.storniert && new Date(r.pickedUpAt || r.renterPickupAt || r.von) <= b && new Date(r.returnedAt || r.renterReturnAt || r.bis) >= a);
      $('#qdRes').innerHTML = hits.length ? hits.map(r => `<a class="alert teal" style="margin:10px 0 0" href="#/miete/${r.id}">👤 <span><b>${esc(r.mieter?.name || '?')}</b>${r.fahrer2?.name ? ' (+ ' + esc(r.fahrer2.name) + ')' : ''} – ${esc(r.item?.name || '')}<br><span class="small">${fmtShort(r.pickedUpAt || r.renterPickupAt || r.von)} – ${fmtShort(r.returnedAt || r.renterReturnAt || r.bis)} · ${esc(r.mieter?.adresse || '')}</span></span></a>`).join('') : `<p class="small muted" style="margin:8px 0 0">Zu dieser Zeit war nichts vermietet.</p>`;
    };
    $('#qd').onchange = run; $('#qt').onchange = run;
  }
}

// ---------- Kalender ----------
function viewCalendar() {
  const m = ui.calMonth, now = new Date();
  const first = new Date(m.getFullYear(), m.getMonth(), 1);
  const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const rs = rentals.filter(r => !r.storniert && (!ui.calItem || r.itemId === ui.calItem));
  const onDay = (d) => { const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()), b = new Date(a); b.setDate(b.getDate() + 1); return rs.filter(r => new Date(r.von) < b && new Date(r.bis) > a); };
  const sel = new Date(ui.calSel + 'T00:00');
  const selList = onDay(sel);
  app.innerHTML = `${header('Kalender', 'Wann ist was vermietet?')}
    <div class="card tight">
      <div class="row between" style="margin-bottom:8px"><button class="btn ghost sm" id="prev">‹</button><b>${m.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</b><button class="btn ghost sm" id="next">›</button></div>
      ${items.length > 1 ? `<select id="calItem" style="margin-bottom:8px"><option value="">Alle Artikel</option>${items.map(i => `<option value="${i.id}" ${ui.calItem === i.id ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}</select>` : ''}
      <div class="cal">${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(d => `<div class="dow">${d}</div>`).join('')}
      ${days.map(d => { const l = onDay(d); return `<div class="d ${d.getMonth() !== m.getMonth() ? 'out' : ''} ${dayKey(d) === dayKey(now) ? 'today' : ''} ${dayKey(d) === ui.calSel ? 'sel' : ''}" data-day="${dayKey(d)}"><span class="n">${d.getDate()}</span>${l.slice(0, 3).map(r => { const s = rentalStatus(r).key; return `<div class="bar ${s === 'ueberfaellig' ? 'red' : r.closed ? 'done' : ''}"></div>`; }).join('')}</div>`; }).join('')}</div>
    </div>
    <h2>${fmtDate(sel)}</h2>
    <div class="card list">${selList.length ? selList.map(r => `<a class="list-item" href="#/miete/${r.id}"><div class="ic">${itemIcon(r.item?.typ)}</div><div class="grow"><div class="t">${esc(r.mieter?.name || 'Ohne Namen')}</div><div class="small muted">${esc(r.item?.name)} · ${fmtShort(r.von)} – ${fmtShort(r.bis)}</div></div><span class="badge ${rentalStatus(r).cls}">${rentalStatus(r).label}</span></a>`).join('') : `<div class="empty">Frei ✓<br><a class="btn sm" style="margin-top:8px" href="#/miete/neu?d=${ui.calSel}">+ Miete an diesem Tag</a></div>`}</div>
    ${fab(`#/miete/neu?d=${ui.calSel}`)}`;
  $('#prev').onclick = () => { ui.calMonth = new Date(m.getFullYear(), m.getMonth() - 1, 1); viewCalendar(); };
  $('#next').onclick = () => { ui.calMonth = new Date(m.getFullYear(), m.getMonth() + 1, 1); viewCalendar(); };
  $('#calItem') && ($('#calItem').onchange = (e) => { ui.calItem = e.target.value; viewCalendar(); });
  $$('.cal .d').forEach(el => el.onclick = () => { ui.calSel = el.dataset.day; viewCalendar(); });
}

// ---------- Einnahmen ----------
function viewMoney() {
  const Y = ui.year;
  const rows = Array.from({ length: 12 }, (_, i) => ({ m: i, n: 0, miete: 0, geb: 0, bar: 0, pp: 0, offen: 0 }));
  for (const r of rentals) {
    const d = new Date(r.von); if (d.getFullYear() !== Y || r.storniert) continue;
    const row = rows[d.getMonth()]; const p = num(r.preis), g = feesTotal(r);
    row.n++; row.miete += p; row.geb += g;
    if (r.mietePaid === 'bar') row.bar += p; else if (r.mietePaid === 'paypal') row.pp += p; else if (r.mietePaid === 'kaution') row.bar += p; else row.offen += p;
    if (!r.closed) row.offen += g; else if (r.kautionVia === 'paypal') row.pp += g; else row.bar += g;
  }
  const sum = rows.reduce((s, r) => { for (const k of ['n', 'miete', 'geb', 'bar', 'pp', 'offen']) s[k] += r[k]; return s; }, { n: 0, miete: 0, geb: 0, bar: 0, pp: 0, offen: 0 });
  const max = Math.max(1, ...rows.map(r => r.miete + r.geb));
  const kautionHeld = rentals.filter(r => !r.closed && r.kautionStatus === 'erhalten').reduce((s, r) => s + num(r.kaution), 0);
  const years = [...new Set([new Date().getFullYear(), ...rentals.map(r => new Date(r.von).getFullYear())])].sort();
  app.innerHTML = `${header('Einnahmen')}
    <div class="row" style="margin-bottom:12px"><select id="yr">${years.map(y => `<option ${y === Y ? 'selected' : ''}>${y}</option>`).join('')}</select><button class="btn sec" id="csv">CSV</button></div>
    <div class="stats">
      <div class="stat"><div class="v">${eur(sum.miete + sum.geb)}</div><div class="l">Umsatz ${Y} (${sum.n} Mieten)</div></div>
      <div class="stat ${sum.offen ? 'warn' : ''}"><div class="v">${eur(sum.offen)}</div><div class="l">noch offen</div></div>
      <div class="stat"><div class="v">${eur(sum.bar)}</div><div class="l">davon bar</div></div>
      <div class="stat"><div class="v">${eur(sum.pp)}</div><div class="l">davon PayPal</div></div>
    </div>
    ${kautionHeld ? `<div class="alert blue">🔒 <span>Du hältst gerade <b>${eur(kautionHeld)}</b> Kaution (gehört den Mietern, zählt nicht als Einnahme).</span></div>` : ''}
    <div class="card" style="overflow-x:auto"><table class="money"><thead><tr><th>Monat</th><th>Mieten</th><th>Miete</th><th>Gebühren</th><th>Offen</th><th style="width:22%"></th></tr></thead><tbody>
    ${rows.map(r => `<tr><td>${new Date(Y, r.m, 1).toLocaleDateString('de-DE', { month: 'short' })}</td><td>${r.n || ''}</td><td>${r.miete ? eur(r.miete) : ''}</td><td>${r.geb ? eur(r.geb) : ''}</td><td>${r.offen ? eur(r.offen) : ''}</td><td><div class="barline" style="width:${((r.miete + r.geb) / max * 100).toFixed(0)}%;${r.miete + r.geb ? '' : 'opacity:0'}"></div></td></tr>`).join('')}
    <tr class="sum"><td>Summe</td><td>${sum.n}</td><td>${eur(sum.miete)}</td><td>${eur(sum.geb)}</td><td>${eur(sum.offen)}</td><td></td></tr></tbody></table></div>
    <p class="small muted">Gezählt nach Mietbeginn. Gebühren gelten als bezahlt, sobald die Miete abgeschlossen ist. Tipp: Die CSV kannst du für die Steuer an den Steuerberater geben.</p>`;
  $('#yr').onchange = (e) => { ui.year = +e.target.value; viewMoney(); };
  $('#csv').onclick = () => {
    const head = ['Beginn', 'Ende', 'Artikel', 'Mieter', 'Miete', 'Gebühren', 'Bezahlt', 'Kaution', 'Kaution-Status'];
    const lines = rentals.filter(r => !r.storniert && new Date(r.von).getFullYear() === Y).map(r => [fmtShort(r.von), fmtShort(r.bis), r.item?.name, r.mieter?.name, num(r.preis).toFixed(2).replace('.', ','), feesTotal(r).toFixed(2).replace('.', ','), r.mietePaid || 'offen', num(r.kaution).toFixed(2).replace('.', ','), r.kautionStatus || 'offen']);
    const csv = [head, ...lines].map(l => l.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    downloadBlob(new Blob(['﻿' + csv], { type: 'text/csv' }), `Mietbox_Einnahmen_${Y}.csv`);
  };
}
function downloadBlob(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

// ---------- Mehr ----------
function viewMore() {
  app.innerHTML = `${header('Mehr')}
    <div class="card list">
      <a class="list-item" href="#/mieten/archiv"><div class="ic">🗄️</div><div class="grow"><div class="t">Archiv</div><div class="small muted">Abgeschlossene Mieten · Suche „Wer hatte den Anhänger am …?“</div></div><span class="chev">›</span></a>
      <a class="list-item" href="#/artikel"><div class="ic">🚚</div><div class="grow"><div class="t">Artikel</div><div class="small muted">Anhänger, Werkzeuge, E-Roller – Preise, Kaution, TÜV</div></div><span class="chev">›</span></a>
      <a class="list-item" href="#/einstellungen"><div class="ic">⚙️</div><div class="grow"><div class="t">Einstellungen</div><div class="small muted">Deine Daten, PayPal, Gebühren, Vertrag, Unterschrift</div></div><span class="chev">›</span></a>
      <a class="list-item" href="#" id="backup"><div class="ic">💾</div><div class="grow"><div class="t">Backup herunterladen</div><div class="small muted">Alle Mieten & Artikel als Datei (ohne Fotos)</div></div></a>
      <a class="list-item" href="#" id="logout"><div class="ic">🚪</div><div class="grow"><div class="t">Abmelden</div><div class="small muted">${esc(user?.email || '')}</div></div></a>
    </div>
    ${isDemo ? `<button class="btn danger block" id="demoReset">Demo-Daten komplett löschen</button>` : ''}
    <p class="small muted center">${APP_NAME} · ${isDemo ? 'Demo-Modus' : 'online synchronisiert'}</p>`;
  $('#backup').onclick = (e) => { e.preventDefault(); downloadBlob(new Blob([JSON.stringify({ exportiert: nowIso(), settings, items, rentals }, null, 1)], { type: 'application/json' }), `Mietbox_Backup_${dayKey(new Date())}.json`); };
  $('#logout').onclick = (e) => { e.preventDefault(); store.logout(); };
  $('#demoReset') && ($('#demoReset').onclick = () => { if (confirm('Alle Demo-Daten löschen?')) { localStorage.removeItem('mietbox_demo_v1'); location.hash = ''; location.reload(); } });
}

// ---------- Artikel ----------
function viewItems() {
  app.innerHTML = `${header('Artikel', 'Was du verleihst', '#/mehr')}
    <div class="card list">${items.length ? items.map(i => {
      const tuevSoon = i.tuevBis && (new Date(i.tuevBis) - new Date()) < 60 * 864e5;
      const busy = rentals.find(r => r.itemId === i.id && !r.closed && (r.pickedUpAt || r.renterPickupAt) && !(r.returnedAt || r.renterReturnAt));
      return `<a class="list-item" href="#/artikel/${i.id}"><div class="ic">${itemIcon(i.typ)}</div><div class="grow"><div class="t">${esc(i.name)}</div><div class="small muted">${eur(i.tagespreis)} / Tag · Kaution ${eur(i.kaution)}${i.kennzeichen ? ' · ' + esc(i.kennzeichen) : ''}</div></div>${busy ? '<span class="badge green">unterwegs</span>' : '<span class="badge grey">da</span>'}${tuevSoon ? ' <span class="badge red">TÜV</span>' : ''}</a>`;
    }).join('') : `<div class="empty">Noch nichts angelegt.</div>`}</div>
    <a class="btn block" href="#/artikel/neu">+ Artikel anlegen</a>`;
}

function viewItem(id) {
  const isNew = id === 'neu';
  const it = isNew ? { typ: 'anhaenger', lockType: 'fern', gps: true, tagespreis: 25, kaution: 100 } : itemById(id);
  if (!it) { app.innerHTML = header('Nicht gefunden', '', '#/artikel'); return; }
  app.innerHTML = `${header(isNew ? 'Neuer Artikel' : esc(it.name), '', '#/artikel')}
  <form class="card" id="itf">
    <label>Bezeichnung</label><input name="name" required value="${esc(it.name)}" placeholder="z. B. Anhänger 750 kg Plane">
    <label>Art</label><select name="typ">${Object.entries(ITEM_TYPES).map(([k, v]) => `<option value="${k}" ${it.typ === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
    <div class="grid2"><div><label>Preis pro Tag (€)</label><input name="tagespreis" inputmode="decimal" value="${esc(it.tagespreis ?? '')}"></div>
    <div><label>Kaution (€)</label><input name="kaution" inputmode="decimal" value="${esc(it.kaution ?? '')}"></div></div>
    <div class="grid2"><div><label>Kennzeichen</label><input name="kennzeichen" value="${esc(it.kennzeichen)}" placeholder="WES-AB 123"></div>
    <div><label>zul. Gesamtgewicht (kg)</label><input name="zgg" inputmode="numeric" value="${esc(it.zgg)}" placeholder="750"></div></div>
    <label>TÜV / HU gültig bis</label><input name="tuevBis" type="month" value="${esc(it.tuevBis ? it.tuevBis.slice(0, 7) : '')}">
    <label>Schloss / Übergabe</label><select name="lockType">${Object.entries(LOCK_TYPES).map(([k, v]) => `<option value="${k}" ${it.lockType === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
    <label class="check"><input type="checkbox" name="gps" ${it.gps ? 'checked' : ''}> Mit GPS-Ortung (Hinweis kommt automatisch in den Vertrag)</label>
    <label>Checkliste für Übergabe (eine Zeile pro Punkt)</label><textarea name="checklist" rows="7">${esc(it.checklist || DEFAULT_CHECKLIST[it.typ || 'anhaenger'])}</textarea>
    <label>Notiz (nur für dich)</label><textarea name="notiz" rows="2">${esc(it.notiz)}</textarea>
    <div class="btns"><button class="btn grow">Speichern</button>${isNew ? '' : '<button type="button" class="btn danger" id="delIt">Löschen</button>'}</div>
  </form>`;
  const f = $('#itf');
  f.addEventListener('input', () => dirty = true);
  f.typ.onchange = () => { if (!f.checklist.dataset.touched) f.checklist.value = DEFAULT_CHECKLIST[f.typ.value]; };
  f.checklist.oninput = () => f.checklist.dataset.touched = 1;
  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = { name: f.name.value.trim(), typ: f.typ.value, tagespreis: num(f.tagespreis.value), kaution: num(f.kaution.value), kennzeichen: f.kennzeichen.value.trim(), zgg: f.zgg.value.trim(), tuevBis: f.tuevBis.value ? f.tuevBis.value + '-28' : '', lockType: f.lockType.value, gps: f.gps.checked, checklist: f.checklist.value.trim(), notiz: f.notiz.value.trim() };
    const nid = isNew ? store.newId() : id;
    await store.set('items', nid, d); dirty = false; toast('Gespeichert', 'ok'); location.hash = '#/artikel';
  };
  $('#delIt') && ($('#delIt').onclick = async () => {
    if (rentals.some(r => r.itemId === id && !r.closed)) return toast('Es gibt noch laufende Mieten mit diesem Artikel', 'err');
    if (!confirm('Artikel wirklich löschen?')) return;
    await store.del('items', id); location.hash = '#/artikel';
  });
}

// ---------- Einstellungen ----------
function viewSettings() {
  const s = settings;
  app.innerHTML = `${header('Einstellungen', '', '#/mehr')}
  <form id="sf">
  <div class="card"><h2>Deine Daten (Vermieter)</h2><p class="small muted">Stehen so im Mietvertrag.</p>
    <label>Name</label><input name="name" value="${esc(s.name)}" placeholder="Vor- und Nachname">
    <label>Adresse</label><input name="adresse" value="${esc(s.adresse)}" placeholder="Straße Nr., PLZ Ort">
    <div class="grid2 stack"><div><label>Telefon</label><input name="telefon" type="tel" value="${esc(s.telefon)}"></div><div><label>E-Mail</label><input name="email" type="email" value="${esc(s.email)}"></div></div>
    <label>PayPal.me-Name</label><input name="paypalMe" value="${esc(s.paypalMe)}" placeholder="z. B. MaxMustermann (aus paypal.me/MaxMustermann)">
  </div>
  <div class="card"><h2>Gebühren & Regeln</h2>
    <div class="grid2"><div><label>Reinigungspauschale (€)</label><input name="reinigung" inputmode="decimal" value="${esc(s.reinigung)}"></div>
    <div><label>Verspätung je Stunde (€)</label><input name="verspaetungStunde" inputmode="decimal" value="${esc(s.verspaetungStunde)}"></div>
    <div><label>Kulanzzeit (Minuten)</label><input name="kulanzMinuten" inputmode="numeric" value="${esc(s.kulanzMinuten)}"></div>
    </div>
    <h3 style="margin-top:14px">Automatisch löschen (ab Abschluss)</h3>
    <div class="grid2"><div><label>Ausweis/Führerschein nach (Tagen)</label><input name="loeschTage" inputmode="numeric" value="${esc(s.loeschTage)}"></div>
    <div><label>Zustandsfotos nach (Tagen)</label><input name="fotoTage" inputmode="numeric" value="${esc(s.fotoTage)}"></div></div>
    <p class="small muted">Vertrag und Mieterdaten bleiben im Archiv, damit du später nachweisen kannst, wer den Anhänger hatte.</p>
  </div>
  <details class="card"><summary>📄 Vertragstext bearbeiten</summary>
    <p class="small muted">Vorlage, keine Rechtsberatung. Abschnitte beginnen mit <code>## </code>. Platzhalter: {REINIGUNG}, {VERSPAETUNG}, {KULANZ}, {LOESCHTAGE}, {FOTOTAGE}, {FAHRER} (weiterer Fahrer), {GPS} (GPS-Abschnitt, nur wenn der Artikel GPS hat).</p>
    <textarea name="terms" rows="16" style="font-size:.85rem">${esc(s.terms || DEFAULT_TERMS)}</textarea>
    <button type="button" class="btn ghost sm" id="resetTerms">Vorlage wiederherstellen</button>
  </details>
  <button class="btn block">Einstellungen speichern</button>
  </form>
  <div class="card" style="margin-top:12px"><h2>Deine Unterschrift</h2><p class="small muted">Wird automatisch in jeden Vertrag eingesetzt.</p>
    ${s.ownerSignature ? `<img class="sig-img" src="${s.ownerSignature}" alt="Unterschrift"><div class="btns"><button class="btn ghost sm" id="newSig">Neu unterschreiben</button></div>` : sigPadHtml('ownSig')}
  </div>`;
  const f = $('#sf');
  f.addEventListener('input', () => dirty = true);
  $('#resetTerms').onclick = () => { if (confirm('Vertragstext auf Vorlage zurücksetzen?')) f.terms.value = DEFAULT_TERMS; };
  f.onsubmit = async (e) => {
    e.preventDefault();
    settings = { ...settings, name: f.name.value.trim(), adresse: f.adresse.value.trim(), telefon: f.telefon.value.trim(), email: f.email.value.trim(), paypalMe: f.paypalMe.value.trim().replace(/^.*paypal\.me\//i, '').replace(/\/.*$/, ''), reinigung: num(f.reinigung.value), verspaetungStunde: num(f.verspaetungStunde.value), kulanzMinuten: num(f.kulanzMinuten.value), loeschTage: Math.max(1, num(f.loeschTage.value)), fotoTage: Math.max(1, num(f.fotoTage.value)), terms: (f.terms.value.trim() === DEFAULT_TERMS.trim() ? '' : f.terms.value.trim()) };
    await store.saveSettings(settings); dirty = false; toast('Gespeichert', 'ok');
  };
  if (s.ownerSignature) $('#newSig').onclick = () => { settings.ownerSignature = null; viewSettings(); };
  else bindSigPad('ownSig', async (data) => { settings.ownerSignature = data; await store.saveSettings(settings); toast('Unterschrift gespeichert', 'ok'); viewSettings(); });
}

function sigPadHtml(id, label = 'Hier mit dem Finger unterschreiben') {
  return `<div class="sig-wrap"><canvas class="sig" id="${id}"></canvas><div class="base"></div><div class="hint">${label}</div></div>
  <div class="btns"><button type="button" class="btn ghost sm" id="${id}-clr">Löschen</button><button type="button" class="btn grow" id="${id}-ok">Unterschrift speichern</button></div>`;
}
function bindSigPad(id, onSave, check) {
  const pad = new SignaturePad($('#' + id));
  $('#' + id).addEventListener('pointerdown', () => { dirty = true; $('#' + id).parentElement.querySelector('.hint')?.remove(); });
  $(`#${id}-clr`).onclick = () => pad.clear();
  $(`#${id}-ok`).onclick = async () => {
    if (pad.isEmpty()) return toast('Bitte erst unterschreiben', 'err');
    if (check && !check()) return;
    await onSave(pad.toDataURL());
  };
  return pad;
}

// ---------- Hilfen Miete ----------
const itemSnap = (it) => ({ id: it.id, name: it.name, typ: it.typ, kennzeichen: it.kennzeichen || '', zgg: it.zgg || '', gps: !!it.gps, lockType: it.lockType || 'fern', checklist: it.checklist || DEFAULT_CHECKLIST[it.typ] || '' });
const cfgSnap = () => ({ reinigung: num(settings.reinigung), verspaetungStunde: num(settings.verspaetungStunde), kulanzMinuten: num(settings.kulanzMinuten), loeschTage: num(settings.loeschTage) || 90, fotoTage: num(settings.fotoTage) || 365 });
const vermieterSnap = () => ({ name: settings.name, adresse: settings.adresse, telefon: settings.telefon, email: settings.email, paypalMe: settings.paypalMe });
const linkFor = (r) => new URL('mieter.html?id=' + r.id, location.href).href;
function waUrl(phone, text) {
  let p = String(phone || '').replace(/[^\d+]/g, '');
  if (p.startsWith('+')) p = p.slice(1); else if (p.startsWith('00')) p = p.slice(2); else if (p.startsWith('0')) p = '49' + p.slice(1);
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}
const ppUrl = (amount) => settings.paypalMe ? `https://paypal.me/${encodeURIComponent(settings.paypalMe)}/${num(amount).toFixed(2)}EUR` : '';
const checklistLines = (r) => (r.item?.checklist || '').split('\n').map(s => s.trim()).filter(Boolean);
async function upd(r, patch, msg) { try { await store.update('rentals', r.id, { ...patch, updatedAt: nowIso() }); if (msg) toast(msg, 'ok'); } catch (e) { toast('Fehler: ' + e.message, 'err'); } }
const daysLeft = (fromIso, days) => Math.ceil((new Date(fromIso).getTime() + days * 864e5 - Date.now()) / 864e5);
const idDays = () => num(settings.loeschTage) || 90;
const fotoDays = () => num(settings.fotoTage) || 365;

// Abrechnung einer Miete
function settlement(r) {
  const kautionIn = r.kautionStatus === 'erhalten' || r.kautionStatus === 'zurueck' || r.kautionStatus === 'einbehalten';
  const forderung = feesTotal(r) + (r.mietePaid ? 0 : num(r.preis));
  return { kautionIn, forderung, auszahlung: (kautionIn ? num(r.kaution) : 0) - forderung };
}

// ---------- Miete: Detail / Neu ----------
function viewRental(id) {
  const isNew = !id || id.startsWith('neu');
  let r;
  if (isNew) {
    if (!items.length) { app.innerHTML = `${header('Neue Miete', '', '#/mieten')}<div class="card"><p>Leg zuerst einen Artikel an (z. B. deinen Anhänger).</p><a class="btn" href="#/artikel/neu">+ Artikel anlegen</a></div>`; return; }
    const q = new URLSearchParams(location.hash.split('?')[1] || '');
    const d = q.get('d') ? new Date(q.get('d') + 'T10:00') : (() => { const x = new Date(); x.setMinutes(0, 0, 0); x.setHours(x.getHours() + 1); return x; })();
    const it = items[0];
    const bis = new Date(d); bis.setDate(bis.getDate() + 1);
    r = { id: 'neu', itemId: it.id, item: itemSnap(it), von: toLocalInput(d), bis: toLocalInput(bis), preis: num(it.tagespreis), kaution: num(it.kaution), tagespreis: num(it.tagespreis), zahlungsart: 'bar', mieter: {} };
  } else {
    r = rentals.find(x => x.id === id);
    if (!r) { app.innerHTML = `${header('Miete', '', '#/mieten')}<div class="card empty">Lädt … oder nicht gefunden.</div>`; return; }
  }
  const s = rentalStatus(r);
  const m = r.mieter || {}, f2 = r.fahrer2 || {};
  const picked = r.pickedUpAt || r.renterPickupAt, returned = r.returnedAt || r.renterReturnAt;
  const ro = !!r.closed; // Archiv = nur lesen
  const dis = ro ? 'disabled' : '';

  // --- Karte: Mietdaten ---
  const formCard = `
  <${isNew ? 'div' : 'details'} class="card" ${isNew ? 'open' : ''}>${isNew ? '<h2>Mietdaten</h2>' : `<summary>📝 Mietdaten & Mieter</summary>`}
  <form id="rf"><fieldset ${dis} style="border:0;padding:0;margin:0;min-width:0">
    <label>Artikel</label><select name="itemId">${items.map(i => `<option value="${i.id}" ${r.itemId === i.id ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}${r.itemId && !itemById(r.itemId) ? `<option value="${r.itemId}" selected>${esc(r.item?.name)} (gelöscht)</option>` : ''}</select>
    <div class="grid2 stack"><div><label>Von</label><input type="datetime-local" name="von" value="${esc(r.von)}" required></div><div><label>Bis</label><input type="datetime-local" name="bis" value="${esc(r.bis)}" required></div></div>
    <div class="grid2"><div><label>Miete (€) <span id="daysInfo" class="muted"></span></label><input name="preis" inputmode="decimal" value="${esc(r.preis)}"></div><div><label>Kaution (€)</label><input name="kaution" inputmode="decimal" value="${esc(r.kaution)}"></div></div>
    <label>Zahlung</label><select name="zahlungsart"><option value="bar" ${r.zahlungsart !== 'paypal' ? 'selected' : ''}>Bar</option><option value="paypal" ${r.zahlungsart === 'paypal' ? 'selected' : ''}>PayPal</option></select>
    <div id="overlap"></div>
    <hr><h3>Mieter</h3><p class="small muted">Kannst du auch leer lassen – der Mieter füllt es dann über den Link selbst aus.</p>
    <label>Name</label><input name="m_name" value="${esc(m.name)}" autocomplete="off">
    <label>Adresse</label><input name="m_adresse" value="${esc(m.adresse)}">
    <div class="grid2 stack"><div><label>Telefon (WhatsApp)</label><input name="m_telefon" type="tel" value="${esc(m.telefon)}"></div><div><label>E-Mail</label><input name="m_email" type="email" value="${esc(m.email)}"></div></div>
    <div class="grid2"><div><label>Geburtsdatum</label><input name="m_geburtsdatum" type="date" value="${esc(m.geburtsdatum)}"></div><div><label>Führerscheinklasse</label><select name="m_fuehrerschein"><option value="">–</option>${LICENSE_CLASSES.map(c => `<option ${m.fuehrerschein === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div></div>
    <details style="margin-top:12px" ${f2.name ? 'open' : ''}><summary class="small"><b>+ Weiterer Fahrer (optional)</b></summary>
      <p class="small muted">Nur eintragen, wenn noch jemand anderes fahren darf. Er steht dann im Vertrag, und sein Führerschein muss fotografiert werden.</p>
      <label>Name</label><input name="f2_name" value="${esc(f2.name)}" autocomplete="off">
      <div class="grid2"><div><label>Geburtsdatum</label><input name="f2_geburtsdatum" type="date" value="${esc(f2.geburtsdatum)}"></div><div><label>Führerscheinklasse</label><select name="f2_fuehrerschein"><option value="">–</option>${LICENSE_CLASSES.map(c => `<option ${f2.fuehrerschein === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div></div>
    </details>
    <label>Notiz (nur für dich)</label><textarea name="notiz" rows="2">${esc(r.notiz)}</textarea>
    ${ro ? '' : `<div class="btns"><button class="btn grow">${isNew ? 'Miete anlegen' : 'Änderungen speichern'}</button></div>`}
  </fieldset></form></${isNew ? 'div' : 'details'}>`;

  if (isNew) {
    app.innerHTML = `${header('Neue Miete', '', '#/mieten')}${formCard}`;
    bindRentalForm(r, true);
    return;
  }

  const link = linkFor(r);
  const lockT = r.item?.lockType || 'fern';
  const docsOk = docsComplete(r);
  const need = requiredDocs(r);
  const st = settlement(r);
  const late = returned || picked ? suggestLateFee(r) : { fee: 0 };
  const hasLateFee = (r.gebuehren || []).some(f => f.typ === 'verspaetung');
  const vorname = m.name ? ' ' + m.name.split(' ')[0] : '';
  const needQuittung = st.kautionIn && st.auszahlung > 0 && (r.kautionBackVia || 'bar') === 'bar';
  const quittungOk = !!(r.kautionQuittung?.sig && num(r.kautionQuittung.betrag) === Math.round(st.auszahlung * 100) / 100);
  const kautionLabel = ({ offen: 'offen', erhalten: 'erhalten', zurueck: 'zurückgezahlt', einbehalten: 'verrechnet', keine: 'keine' })[r.kautionStatus || 'offen'];

  // Archiv-Hinweis mit Lösch-Countdown
  let archiveBox = '';
  if (ro) {
    const dId = daysLeft(r.closedAt, idDays()), dFoto = daysLeft(r.closedAt, fotoDays());
    archiveBox = `<div class="card tight" style="border-color:var(--accent-2)"><h3>🗄️ Im Archiv seit ${fmtDate(r.closedAt)}${r.storniert ? ' (storniert)' : ''}</h3>
      <div class="small">🪪 Ausweis/Führerschein: ${r.idDeleted ? '<b>gelöscht</b>' : `werden in <b>${Math.max(0, dId)} Tagen</b> automatisch gelöscht`}</div>
      <div class="small">📸 Zustandsfotos: ${r.condDeleted ? '<b>gelöscht</b>' : `werden in <b>${Math.max(0, dFoto)} Tagen</b> automatisch gelöscht`}</div>
      <div class="small">📄 Vertrag & Mieterdaten: bleiben gespeichert (Nachweis, wer gefahren ist)</div>
      ${r.storniert ? '' : `<div class="btns"><button class="btn wa grow" data-act="share" data-final="1">📲 Endabrechnung per WhatsApp senden</button></div>${r.finalSentAt ? `<p class="tiny muted">Zuletzt verschickt am ${fmtShort(r.finalSentAt)}</p>` : ''}`}
      <div class="btns"><button class="btn ghost sm" data-act="reopen">Aus Archiv zurückholen</button></div></div>`;
  }

  app.innerHTML = `${header(esc(m.name || 'Neue Miete'), `${itemIcon(r.item?.typ)} ${esc(r.item?.name || '')}`, ro ? '#/mieten/archiv' : '#/mieten')}
  <div class="card tight">
    <div class="row between"><span class="badge ${s.cls}">${s.label}</span><span class="small muted">${rentalDays(r.von, r.bis)} Tag(e)</span></div>
    <dl class="kv" style="margin:10px 0 0">
      <dt>Abholung</dt><dd>${fmtDT(r.von)}</dd><dt>Rückgabe</dt><dd>${fmtDT(r.bis)}</dd>
      <dt>Miete</dt><dd>${eur(r.preis)} ${r.mietePaid ? '<span class="badge green">bezahlt</span>' : '<span class="badge amber">offen</span>'}</dd>
      <dt>Kaution</dt><dd>${eur(r.kaution)} <span class="badge ${st.kautionIn ? 'green' : r.kautionStatus === 'keine' ? 'grey' : 'amber'}">${kautionLabel}</span></dd>
      ${m.telefon ? `<dt>Telefon</dt><dd><a href="tel:${esc(m.telefon)}">${esc(m.telefon)}</a></dd>` : ''}
      ${f2.name ? `<dt>Weiterer Fahrer</dt><dd>${esc(f2.name)}</dd>` : ''}
    </dl>
    ${r.signature ? `<div class="row wrap-ok" style="margin-top:10px">${r.contractSentAt || r.signedBy === 'link' ? `<span class="badge green">📄 Vertrag ${r.contractSentAt ? 'verschickt ' + fmtShort(r.contractSentAt) : 'liegt beim Mieter (Link)'}</span>` : '<span class="badge amber">📄 Vertrag noch nicht verschickt</span>'}${r.closed ? (r.finalSentAt ? `<span class="badge green">Endabrechnung verschickt</span>` : '<span class="badge amber">Endabrechnung nicht verschickt</span>') : ''}</div>
    <div class="btns"><button class="btn ghost sm" data-act="pdf">📄 PDF ansehen</button></div>` : ''}
  </div>

  ${archiveBox}
  ${formCard}

  <details class="card" ${!docsOk && !ro ? 'open' : ''}><summary>🪪 Ausweis & Führerschein ${docsOk ? '<span class="badge green">vollständig</span>' : r.idDeleted ? '<span class="badge grey">gelöscht</span>' : `<span class="badge amber">${need.filter(k => r.docs?.[k]).length}/${need.length}</span>`}</summary>
    ${r.idDeleted ? `<p class="muted small">Ausweisfotos wurden ${idDays()} Tage nach Abschluss automatisch gelöscht.</p>` : `
    <p class="small muted">Foto machen oder Bild auswählen (z. B. per WhatsApp bekommen). Fotos bekommen automatisch den Aufdruck „KOPIE“ und werden ${idDays()} Tage nach Abschluss automatisch gelöscht.</p>
    <label class="check"><input type="checkbox" data-act="consent" ${r.consent ? 'checked' : ''} ${dis}> Mieter ist einverstanden, dass Ausweis/Führerschein fotografiert und bis ${idDays()} Tage nach Mietende gespeichert werden.</label>
    <div class="photos" id="ph-ids">${ro ? '' : need.map(k => uploadSlot(k, PHOTO_KINDS[k], !!r.docs?.[k])).join('')}</div>`}
  </details>

  <details class="card" ${docsOk && !r.signature && !ro ? 'open' : ''}><summary>✍️ Vertrag ${r.signature ? '<span class="badge green">unterschrieben</span>' : '<span class="badge amber">offen</span>'}</summary>
    ${r.signature ? `<p class="small">Unterschrieben ${r.signedBy === 'link' ? 'per Link' : 'vor Ort'} am <b>${fmtDT(r.signedAt)}</b></p><img class="sig-img" src="${r.signature}" alt="Unterschrift Mieter">
      ${ro ? '' : `<div class="btns"><button class="btn wa grow" data-act="share">📲 Vertrag (PDF) per WhatsApp senden</button></div>
      <p class="tiny muted">${r.contractSentAt ? 'Verschickt am ' + fmtShort(r.contractSentAt) + '.' : 'Öffnet das Teilen-Menü deines Handys – dort WhatsApp und den Kunden wählen.'}${r.signedBy === 'link' ? ' Der Mieter kann den Vertrag auch selbst über seinen Link herunterladen.' : ''}</p>`}
      <details style="margin-top:10px"><summary class="small">Vertrag ansehen</summary>${contractHtml(r)}</details>`
      : ro ? '<p class="small muted">Nicht unterschrieben.</p>'
      : !docsOk ? `<div class="alert amber">🪪 <span>Erst <b>Ausweis${need.includes('fuehrerschein') ? ' und Führerschein' : ''}</b> fotografieren und das Einverständnis anhaken – dann kannst du den Vertrag senden oder vor Ort unterschreiben lassen.</span></div>`
      : `
      ${!settings.ownerSignature ? `<div class="alert amber">⚠️ <span>Deine eigene Unterschrift fehlt noch – <a href="#/einstellungen">in Einstellungen hinterlegen</a>.</span></div>` : ''}
      <h3>Per WhatsApp senden</h3>
      <p class="small muted">Der Mieter prüft seine Daten, liest den Vertrag und unterschreibt auf seinem Handy.</p>
      <div class="btns" style="margin-top:6px"><a class="btn wa grow" target="_blank" href="${waUrl(m.telefon, `Hallo${vorname}, hier ist dein Mietvertrag (${r.item?.name}, ${fmtShort(r.von)} – ${fmtShort(r.bis)}). Bitte durchlesen und unterschreiben:\n${link}`)}" data-act="linkSent">📲 Vertrag per WhatsApp senden</a><button class="btn sec" data-act="copyLink">Link kopieren</button></div>
      ${r.linkSentAt ? `<p class="tiny muted">Link gesendet am ${fmtShort(r.linkSentAt)}</p>` : ''}
      <hr><h3>Oder vor Ort unterschreiben</h3>
      ${contractHtml(r)}
      <label class="check"><input type="checkbox" id="accept"> Mieter hat den Vertrag gelesen und ist einverstanden.</label>
      ${sigPadHtml('rSig', 'Mieter unterschreibt hier')}`}
  </details>

  ${r.signature && !r.storniert ? `
  <details class="card" ${!picked && !ro ? 'open' : ''}><summary>🔑 Abholung ${picked ? `<span class="badge green">${fmtShort(picked)}</span>` : ''}</summary>
    ${ro ? '' : lockT === 'code' ? `
      <label>Schloss-Code für diese Miete</label>
      <div class="row"><input id="lockCode" value="${esc(r.lockCode)}" inputmode="numeric" placeholder="Code aus der Schloss-App"><button class="btn sec" data-act="saveCode">Speichern</button></div>
      <label class="check"><input type="checkbox" data-act="release" ${r.lockReleased ? 'checked' : ''} ${r.lockCode ? '' : 'disabled'}> Code für den Mieter freigeben (erscheint auf seiner Link-Seite)</label>`
      : lockT === 'fern' ? `
      ${r.openRequestAt && !r.lockReleased ? `<div class="alert teal">🔓 <span><b>${esc(m.name || 'Mieter')} ist da</b> (seit ${fmtShort(r.openRequestAt)}) und wartet, dass du öffnest.</span></div>` : ''}
      <p class="small muted">Du öffnest das Schloss. Wenn der Mieter vor Ort ist, tippt er auf seiner Seite „Ich bin da“ und du bekommst hier Bescheid.</p>
      <label class="check"><input type="checkbox" data-act="release" ${r.lockReleased ? 'checked' : ''}> Schloss ist offen / Mieter darf mitnehmen</label>`
      : `<p class="small muted">Persönliche Übergabe.</p>`}
    ${ro ? '' : `<a class="btn wa sm" target="_blank" href="${waUrl(m.telefon, `Hallo${vorname}, hier kannst du bei der Abholung ${lockT === 'fern' ? 'Bescheid geben, wenn du da bist, und ' : ''}die Zustandsfotos machen:\n${link}${lockT === 'code' && r.lockCode && r.lockReleased ? `\nDein Schloss-Code: ${r.lockCode}` : ''}`)}">📲 Abhol-Link per WhatsApp</a>`}
    <hr><h3>Zustand bei Abholung</h3>
    ${checklistHtml('pickup', checklistLines(r), r.checkPickup, ro)}
    <div class="photos" id="ph-abholung">${ro ? '' : uploadSlot('abholung', 'Foto hinzufügen')}</div>
    <label>Notiz</label><textarea id="notePickup" rows="2" placeholder="z. B. kleiner Kratzer links hinten" ${dis}>${esc(r.notePickup)}</textarea>
    ${ro ? '' : `<div class="btns"><button class="btn sec sm" data-act="saveNote" data-k="notePickup">Notiz speichern</button>${picked ? '' : `<button class="btn grow" data-act="pickedUp">✓ Abgeholt (jetzt)</button>`}</div>`}
    ${r.renterPickupAt ? `<p class="small muted">Mieter hat Abholung bestätigt: ${fmtDT(r.renterPickupAt)}</p>` : ''}
  </details>

  <details class="card" ${picked && !ro && (!r.mietePaid || (r.kautionStatus || 'offen') === 'offen') ? 'open' : ''}><summary>💶 Zahlung</summary>
    <label>Miete ${eur(r.preis)}</label>
    <div class="seg" data-seg="mietePaid">${[['', 'Offen'], ['bar', 'Bar'], ['paypal', 'PayPal']].map(([k, l]) => `<button ${dis} class="${(r.mietePaid || '') === k || (k === 'bar' && r.mietePaid === 'kaution') ? 'on' : ''}" data-v="${k}">${l}</button>`).join('')}</div>
    <label>Kaution ${eur(r.kaution)}</label>
    <div class="seg" data-seg="kaution">${[['offen', 'Offen'], ['bar', 'Bar erhalten'], ['paypal', 'PayPal erh.'], ['keine', 'Keine']].map(([k, l]) => `<button ${dis} class="${(k === 'offen' && (!r.kautionStatus || r.kautionStatus === 'offen')) || (k === 'keine' && r.kautionStatus === 'keine') || (st.kautionIn && r.kautionVia === k) ? 'on' : ''}" data-v="${k}">${l}</button>`).join('')}</div>
    ${!ro && r.zahlungsart === 'paypal' && settings.paypalMe ? `<div class="btns"><a class="btn wa sm" target="_blank" href="${waUrl(m.telefon, `Hier kannst du per PayPal bezahlen: Miete ${eur(r.preis)}${num(r.kaution) ? ' + Kaution ' + eur(r.kaution) : ''} = ${eur(num(r.preis) + num(r.kaution))}\n${ppUrl(num(r.preis) + num(r.kaution))}`)}">PayPal-Link senden</a></div>` : ''}
  </details>` : ''}

  ${picked ? `
  <details class="card" ${!ro ? 'open' : ''}><summary>↩️ Rückgabe ${returned ? `<span class="badge blue">${fmtShort(returned)}</span>` : ''}</summary>
    ${r.renterReturnAt ? `<p class="small muted">Mieter hat Rückgabe gemeldet: ${fmtDT(r.renterReturnAt)}</p>` : ''}
    ${checklistHtml('return', checklistLines(r), r.checkReturn, ro)}
    <div class="photos" id="ph-rueckgabe">${ro ? '' : uploadSlot('rueckgabe', 'Foto hinzufügen')}</div>
    <label>Notiz</label><textarea id="noteReturn" rows="2" placeholder="z. B. dreckig, Gurt fehlt" ${dis}>${esc(r.noteReturn)}</textarea>
    ${ro ? '' : `<div class="btns"><button class="btn sec sm" data-act="saveNote" data-k="noteReturn">Notiz speichern</button>${r.returnedAt ? '' : `<button class="btn grow" data-act="returned">✓ Zurück (jetzt)</button>`}</div>`}
    <hr><h3>Gebühren</h3>
    ${late.fee > 0 && !hasLateFee && !ro ? `<div class="alert amber">⏰ <span>${late.hours} Std. zu spät → Vorschlag <b>${eur(late.fee)}</b> <button class="btn sm" data-act="addLate" data-fee="${late.fee}" data-h="${late.hours}">Hinzufügen</button></span></div>` : ''}
    ${(r.gebuehren || []).map((f, i) => `<div class="fee-row"><div class="grow"><b>${FEE_TYPES[f.typ] || f.typ}</b> ${f.notiz ? `<span class="small muted">– ${esc(f.notiz)}</span>` : ''}</div><b>${eur(f.betrag)}</b>${ro ? '' : `<button class="btn ghost sm" data-act="delFee" data-i="${i}">✕</button>`}</div>`).join('') || '<p class="small muted">Keine Gebühren.</p>'}
    ${ro ? '' : `<div class="grid3" style="margin-top:8px;grid-template-columns:1.3fr 1fr auto"><select id="feeTyp">${Object.entries(FEE_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select><input id="feeAmt" inputmode="decimal" placeholder="€" value="${esc(r.cfg?.reinigung ?? settings.reinigung)}"><button class="btn sec" data-act="addFee">+</button></div><input id="feeNote" placeholder="Notiz (optional)" style="margin-top:6px">`}
  </details>` : ''}

  ${!ro ? `
  <div class="card" id="closeCard"><h2>🏁 ${r.signature ? 'Vermietung abschließen' : 'Stornieren'}</h2>
    <dl class="kv">
      <dt>Miete</dt><dd>${eur(r.preis)} ${r.mietePaid ? '✓ bezahlt' : '<span class="badge amber">offen</span>'}</dd>
      <dt>Kaution erhalten</dt><dd>${st.kautionIn ? eur(r.kaution) : eur(0)}</dd>
      <dt>Gebühren</dt><dd>${eur(feesTotal(r))}</dd>
      <dt style="font-weight:800;color:var(--text)">${st.auszahlung >= 0 ? 'Du zahlst zurück' : 'Mieter zahlt noch'}</dt><dd style="font-size:1.15rem">${eur(Math.abs(st.auszahlung))}</dd>
    </dl>
    ${st.auszahlung > 0 ? `<div class="seg" style="margin-top:10px" data-seg="backVia">${[['bar', 'Rückzahlung bar'], ['paypal', 'per PayPal']].map(([k, l]) => `<button class="${(r.kautionBackVia || 'bar') === k ? 'on' : ''}" data-v="${k}">${l}</button>`).join('')}</div>` : ''}
    ${needQuittung ? (quittungOk ? `<div class="alert teal" style="margin-top:10px">✍️ <span>Mieter hat den Erhalt von <b>${eur(r.kautionQuittung.betrag)}</b> quittiert (${fmtShort(r.kautionQuittung.at)}).</span></div>`
      : `<hr><h3>Quittung Kaution</h3><p class="small">Mieter bestätigt: <b>„Ich habe ${eur(st.auszahlung)} Kaution in bar zurückerhalten.“</b></p>${sigPadHtml('qSig', 'Mieter unterschreibt hier')}`) : ''}
    ${!returned && picked ? `<p class="small muted">Noch nicht als zurückgegeben markiert – beim Abschließen wird die Rückgabe auf jetzt gesetzt.</p>` : ''}
    <p class="small muted">Danach landet die Miete im <b>Archiv</b>. Ausweisfotos werden nach ${idDays()} Tagen, Zustandsfotos nach ${fotoDays()} Tagen automatisch gelöscht. Vertrag & Mieterdaten bleiben.</p>
    ${r.signature ? `<div class="btns"><button class="btn block" data-act="close" ${needQuittung && !quittungOk ? 'disabled' : ''}>✓ Vermietung abschließen</button></div>${needQuittung && !quittungOk ? '<p class="tiny muted">Erst Quittung unterschreiben lassen.</p>' : ''}` : ''}
    ${!picked ? `<div class="btns"><button class="btn danger block" data-act="storno">Miete stornieren (findet nicht statt)</button></div>` : ''}
  </div>` : ''}`;

  bindRentalForm(r, false);
  bindRentalActions(r);
  loadPhotos(r);
}

function uploadSlot(kind, label, have) {
  return `<label class="upload ${have ? 'done' : ''}" data-kind="${kind}"><span class="big">📷</span>${label}${have ? '<span class="tiny">vorhanden ✓</span>' : '<span class="tiny">Kamera oder Galerie</span>'}<input type="file" accept="image/*" ${ID_KINDS.includes(kind) ? '' : 'multiple'} data-upload="${kind}"></label>`;
}
function checklistHtml(key, lines, state = {}, ro = false) {
  if (!lines.length) return '';
  return `<div data-check="${key}">${lines.map(l => `<label class="check"><input type="checkbox" data-line="${esc(l)}" ${state?.[l] ? 'checked' : ''} ${ro ? 'disabled' : ''}> ${esc(l)}</label>`).join('')}</div>`;
}

let photoToken = 0;
async function loadPhotos(r) {
  const my = ++photoToken;
  try {
    const ps = await store.listPhotos(r.id);
    if (my !== photoToken) return; // inzwischen neu gezeichnet
    photoCache[r.id] = ps;
    ps.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    for (const p of ps) {
      const host = ID_KINDS.includes(p.kind) ? $('#ph-ids') : $('#ph-' + p.kind);
      if (!host) continue;
      const el = document.createElement('div'); el.className = 'photo';
      el.innerHTML = `<img src="${p.data}" data-full alt=""><div class="cap">${esc(PHOTO_KINDS[p.kind])}${p.by === 'mieter' ? ' · Mieter' : ''}<br>${fmtShort(p.createdAt)}</div>${r.closed ? '' : `<button class="x" data-delphoto="${p.id}" aria-label="Foto entfernen">✕</button>`}`;
      const slot = host.querySelector(`.upload[data-kind="${p.kind}"]`);
      if (slot && ID_KINDS.includes(p.kind)) slot.replaceWith(el); // Ausweis: Foto ersetzt den Platzhalter
      else host.insertBefore(el, slot || null);
    }
  } catch (e) { console.error(e); }
}

function bindRentalForm(r, isNew) {
  const f = $('#rf'); if (!f || r.closed) return;
  f.addEventListener('input', () => dirty = true);
  let priceTouched = !isNew, kautionTouched = !isNew;
  f.preis.addEventListener('input', () => priceTouched = true);
  f.kaution.addEventListener('input', () => kautionTouched = true);
  const recalc = () => {
    const it = itemById(f.itemId.value);
    const d = rentalDays(f.von.value, f.bis.value);
    $('#daysInfo').textContent = `(${d} Tag${d > 1 ? 'e' : ''})`;
    if (it && !priceTouched) f.preis.value = (d * num(it.tagespreis)).toFixed(2).replace(/\.00$/, '');
    if (it && !kautionTouched) f.kaution.value = num(it.kaution);
    const a = new Date(f.von.value), b = new Date(f.bis.value);
    const clash = rentals.filter(x => x.id !== r.id && !x.closed && x.itemId === f.itemId.value && new Date(x.von) < b && new Date(x.bis) > a);
    $('#overlap').innerHTML = (b <= a ? `<div class="alert red" style="margin-top:10px">Ende liegt vor dem Beginn.</div>` : '') + clash.map(x => `<div class="alert red" style="margin-top:10px">⚠️ <span>Überschneidung mit ${esc(x.mieter?.name || 'einer Miete')} (${fmtShort(x.von)} – ${fmtShort(x.bis)})</span></div>`).join('');
  };
  ['itemId', 'von', 'bis'].forEach(n => f[n].addEventListener('change', () => { if (isNew || confirm('Preis neu berechnen?')) priceTouched = false; recalc(); }));
  recalc();
  if (!isNew) priceTouched = true;
  f.onsubmit = async (e) => {
    e.preventDefault();
    const it = itemById(f.itemId.value);
    if (new Date(f.bis.value) <= new Date(f.von.value)) return toast('Ende muss nach dem Beginn liegen', 'err');
    if ($('#overlap .alert') && !confirm('Es gibt eine Überschneidung. Trotzdem speichern?')) return;
    const data = {
      itemId: f.itemId.value, von: f.von.value, bis: f.bis.value, preis: num(f.preis.value), kaution: num(f.kaution.value),
      tagespreis: num(it?.tagespreis ?? r.tagespreis), zahlungsart: f.zahlungsart.value, notiz: f.notiz.value.trim(),
      mieter: { name: f.m_name.value.trim(), adresse: f.m_adresse.value.trim(), telefon: f.m_telefon.value.trim(), email: f.m_email.value.trim(), geburtsdatum: f.m_geburtsdatum.value, fuehrerschein: f.m_fuehrerschein.value },
      fahrer2: f.f2_name.value.trim() ? { name: f.f2_name.value.trim(), geburtsdatum: f.f2_geburtsdatum.value, fuehrerschein: f.f2_fuehrerschein.value } : null,
    };
    if (isNew || !r.signature) Object.assign(data, { item: it ? itemSnap(it) : r.item, cfg: cfgSnap(), vermieter: vermieterSnap(), terms: settings.terms || DEFAULT_TERMS, ownerSignature: settings.ownerSignature || null });
    else if ((data.preis !== num(r.preis) || data.von !== r.von || data.bis !== r.bis || data.kaution !== num(r.kaution) || (data.fahrer2?.name || '') !== (r.fahrer2?.name || '')) && !confirm('Der Vertrag ist schon unterschrieben. Trotzdem ändern?')) return;
    try {
      if (isNew) {
        const id = store.newId();
        await store.set('rentals', id, { ...data, createdAt: nowIso(), updatedAt: nowIso(), kautionStatus: 'offen', gebuehren: [], closed: false });
        dirty = false; toast('Miete angelegt – jetzt Ausweis fotografieren', 'ok'); location.hash = '#/miete/' + id;
      } else { await upd(r, data, 'Gespeichert'); dirty = false; render(true); }
    } catch (err) { toast('Fehler: ' + err.message, 'err'); }
  };
}

function bindRentalActions(r) {
  // Unterschrift vor Ort
  if ($('#rSig')) bindSigPad('rSig', async (sig) => {
    await upd(r, { signature: sig, signedAt: nowIso(), signedBy: 'vorort', ownerSignature: settings.ownerSignature || r.ownerSignature || null }, 'Vertrag unterschrieben ✓');
    dirty = false;
  }, () => {
    if (!r.mieter?.name) { toast('Erst Mieter-Name eintragen und speichern', 'err'); return false; }
    if (!$('#accept').checked) { toast('Bitte Häkchen „gelesen und einverstanden“ setzen', 'err'); return false; }
    return true;
  });

  // Quittung Kaution
  if ($('#qSig')) bindSigPad('qSig', async (sig) => {
    const st = settlement(r);
    await upd(r, { kautionQuittung: { sig, at: nowIso(), betrag: Math.round(st.auszahlung * 100) / 100 } }, 'Quittung gespeichert ✓');
    dirty = false;
  });

  // Fotos: Kamera oder Galerie
  $$('[data-upload]').forEach(inp => inp.onchange = async () => {
    const kind = inp.dataset.upload;
    if (ID_KINDS.includes(kind) && !r.consent) { inp.value = ''; return toast('Erst Einverständnis des Mieters anhaken', 'err'); }
    const files = [...inp.files]; if (!files.length) return;
    toast(files.length > 1 ? `${files.length} Fotos werden gespeichert …` : 'Foto wird gespeichert …');
    let ok = 0;
    for (const file of files) {
      try {
        const data = await compressImage(file, ID_KINDS.includes(kind) ? { max: 1400, quality: 0.65, watermark: `nur für Mietvertrag ${settings.name || APP_NAME} · ${new Date().toLocaleDateString('de-DE')}` } : {});
        await store.addPhoto(r.id, { kind, data, by: 'vermieter', createdAt: nowIso() });
        if (ID_KINDS.includes(kind)) await store.update('rentals', r.id, { ['docs.' + kind]: nowIso() });
        ok++;
      } catch (e) { console.error(e); toast(isDemo ? 'Demo-Speicher voll – mit Firebase passiert das nicht' : 'Fehler: ' + e.message, 'err'); break; }
    }
    if (ok) toast(ok > 1 ? `${ok} Fotos gespeichert ✓` : 'Foto gespeichert ✓', 'ok');
    dirty = false; render(true);
  });

  // Klicks
  app.onclick = async (e) => {
    const img = e.target.closest('img[data-full]');
    if (img) return openViewer(img.src, img.parentElement.querySelector('.cap')?.innerText || '');
    const dp = e.target.closest('[data-delphoto]');
    if (dp) {
      e.preventDefault();
      if (!confirm('Dieses Foto entfernen?')) return;
      const p = (photoCache[r.id] || []).find(x => x.id === dp.dataset.delphoto);
      await store.delPhoto(r.id, dp.dataset.delphoto);
      if (p && ID_KINDS.includes(p.kind) && !(photoCache[r.id] || []).some(x => x.kind === p.kind && x.id !== p.id)) await store.update('rentals', r.id, { ['docs.' + p.kind]: undefined });
      render(true); return;
    }
    const segBtn = e.target.closest('[data-seg] button');
    if (segBtn) return onSeg(r, segBtn.closest('[data-seg]').dataset.seg, segBtn.dataset.v);
    const a = e.target.closest('[data-act]'); if (!a) return;
    switch (a.dataset.act) {
      case 'linkSent': upd(r, { linkSentAt: r.linkSentAt || nowIso() }); break;
      case 'copyLink': try { await navigator.clipboard.writeText(linkFor(r)); toast('Link kopiert', 'ok'); } catch { prompt('Link kopieren:', linkFor(r)); } upd(r, { linkSentAt: r.linkSentAt || nowIso() }); break;
      case 'share': {
        const fin = !!a.dataset.final;
        toast('PDF wird erstellt …');
        try {
          const text = fin ? `Hallo${r.mieter?.name ? ' ' + r.mieter.name.split(' ')[0] : ''}, anbei die Endabrechnung zu deiner Miete (${r.item?.name}). Danke!` : `Hallo${r.mieter?.name ? ' ' + r.mieter.name.split(' ')[0] : ''}, anbei dein Mietvertrag (${r.item?.name}, ${fmtShort(r.von)} – ${fmtShort(r.bis)}).`;
          const res = await shareContract(r, photoCache[r.id] || await store.listPhotos(r.id), text);
          if (res) {
            await upd(r, fin ? { finalSentAt: nowIso() } : { contractSentAt: nowIso() });
            toast(res === 'download' ? 'PDF gespeichert – in WhatsApp als Datei anhängen' : 'Verschickt ✓', 'ok');
          }
        } catch (err) { toast(err.message, 'err'); }
        break;
      }
      case 'pdf': toast('PDF wird erstellt …'); try { await downloadContract(r, photoCache[r.id] || await store.listPhotos(r.id)); } catch (err) { toast(err.message, 'err'); } break;
      case 'consent': upd(r, { consent: a.checked, consentAt: a.checked ? nowIso() : null }); break;
      case 'saveCode': upd(r, { lockCode: $('#lockCode').value.trim() }, 'Code gespeichert'); break;
      case 'release': upd(r, { lockReleased: a.checked, ...(a.checked ? { releasedAt: nowIso() } : {}) }, a.checked ? (r.item?.lockType === 'code' ? 'Code freigegeben – Mieter sieht ihn jetzt' : 'Als geöffnet markiert') : 'Zurückgenommen'); break;
      case 'saveNote': upd(r, { [a.dataset.k]: $('#' + a.dataset.k).value.trim() }, 'Notiz gespeichert'); break;
      case 'pickedUp': upd(r, { pickedUpAt: nowIso(), checkPickup: readChecks('pickup'), notePickup: $('#notePickup').value.trim() }, 'Abholung gespeichert'); break;
      case 'returned': upd(r, { returnedAt: nowIso(), checkReturn: readChecks('return'), noteReturn: $('#noteReturn').value.trim() }, 'Rückgabe gespeichert'); break;
      case 'addLate': upd(r, { gebuehren: [...(r.gebuehren || []), { typ: 'verspaetung', betrag: num(a.dataset.fee), notiz: a.dataset.h + ' Std. zu spät' }] }, 'Verspätung hinzugefügt'); break;
      case 'addFee': {
        const betrag = num($('#feeAmt').value); if (!betrag) return toast('Betrag eingeben', 'err');
        upd(r, { gebuehren: [...(r.gebuehren || []), { typ: $('#feeTyp').value, betrag, notiz: $('#feeNote').value.trim() }] }, 'Gebühr hinzugefügt'); break;
      }
      case 'delFee': { const g = [...(r.gebuehren || [])]; g.splice(+a.dataset.i, 1); upd(r, { gebuehren: g }); break; }
      case 'close': {
        const picked = r.pickedUpAt || r.renterPickupAt;
        if (!picked && !confirm('Die Miete wurde noch nicht als abgeholt markiert. Trotzdem abschließen?')) return;
        if (!confirm('Vermietung abschließen und ins Archiv verschieben?')) return;
        const st = settlement(r);
        const patch = { closed: true, closedAt: nowIso(), storniert: false };
        if (picked && !(r.returnedAt || r.renterReturnAt)) patch.returnedAt = nowIso();
        if (r.returnedAt == null && r.renterReturnAt) patch.returnedAt = r.renterReturnAt;
        if ($('[data-check="return"]')) patch.checkReturn = readChecks('return');
        if (st.kautionIn) { patch.kautionStatus = st.auszahlung > 0 ? 'zurueck' : 'einbehalten'; patch.kautionBackVia = r.kautionBackVia || 'bar'; }
        if (!r.mietePaid) patch.mietePaid = st.kautionIn ? 'kaution' : (r.zahlungsart || 'bar');
        await upd(r, patch, 'Abgeschlossen – liegt jetzt im Archiv ✓');
        window.scrollTo(0, 0); break;
      }
      case 'storno':
        if (!confirm('Miete stornieren? Sie wird ins Archiv verschoben und zählt nicht zu den Einnahmen.')) return;
        await upd(r, { closed: true, storniert: true, closedAt: nowIso() }, 'Storniert');
        location.hash = '#/mieten/archiv'; break;
      case 'reopen':
        if (!confirm('Miete aus dem Archiv zurückholen? Die Lösch-Frist startet beim nächsten Abschluss neu.')) return;
        upd(r, { closed: false, storniert: false, closedAt: null }, 'Wieder offen'); break;
    }
  };
  // Checklisten sofort speichern
  $$('[data-check] input').forEach(cb => cb.onchange = () => {
    const key = cb.closest('[data-check]').dataset.check;
    upd(r, { [key === 'pickup' ? 'checkPickup' : 'checkReturn']: readChecks(key) });
  });
}

function readChecks(key) {
  const box = $(`[data-check="${key}"]`); if (!box) return null;
  const o = {}; $$('input', box).forEach(i => o[i.dataset.line] = i.checked); return o;
}

function onSeg(r, seg, v) {
  if (r.closed) return;
  if (seg === 'mietePaid') return upd(r, { mietePaid: v || null, mietePaidAt: v ? nowIso() : null }, v ? 'Miete als bezahlt markiert' : 'Miete wieder offen');
  if (seg === 'kaution') {
    if (v === 'offen') return upd(r, { kautionStatus: 'offen', kautionVia: null });
    if (v === 'keine') return upd(r, { kautionStatus: 'keine', kautionVia: null });
    return upd(r, { kautionStatus: 'erhalten', kautionVia: v, kautionAt: nowIso() }, 'Kaution erhalten ✓');
  }
  if (seg === 'backVia') return upd(r, { kautionBackVia: v });
}

function openViewer(src, cap) {
  const v = document.createElement('div'); v.className = 'viewer';
  v.innerHTML = `<div><img src="${src}" alt=""><div class="cap">${esc(cap)} · tippen zum Schließen</div></div>`;
  v.onclick = () => v.remove(); document.body.appendChild(v);
}

// ---------- Automatisches Löschen im Archiv ----------
// Ausweis/Führerschein nach X Tagen, Zustandsfotos nach Y Tagen – gezählt ab Abschluss.
async function autoCleanup() {
  const now = Date.now();
  for (const r of rentals.filter(r => r.closed && r.closedAt)) {
    const age = (now - new Date(r.closedAt)) / 864e5;
    const delId = !r.idDeleted && age > idDays();
    const delCond = !r.condDeleted && age > fotoDays();
    if (!delId && !delCond) continue;
    try {
      const ps = await store.listPhotos(r.id);
      const kinds = [...(delId ? ID_KINDS : []), ...(delCond ? COND_KINDS : [])];
      await Promise.all(ps.filter(p => kinds.includes(p.kind)).map(p => store.delPhoto(r.id, p.id)));
      const patch = {};
      if (delId) Object.assign(patch, { idDeleted: true, idDeletedAt: nowIso(), docs: null });
      if (delCond) Object.assign(patch, { condDeleted: true, condDeletedAt: nowIso() });
      await store.update('rentals', r.id, patch);
    } catch (e) { console.error(e); }
  }
}
