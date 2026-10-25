// ============================================================
//  MIETBOX – Vermieter-App
// ============================================================
import {
  $, $$, esc, num, eur, nowIso, toLocalInput, dayKey, fmtDate, fmtDT, fmtShort, rentalDays, toast,
  ITEM_TYPES, LOCK_TYPES, DEFAULT_CHECKLIST, PHOTO_KINDS, ID_KINDS, FEE_TYPES, LICENSE_CLASSES,
  DEFAULT_SETTINGS, DEFAULT_TERMS, rentalStatus, requiredDocs, docsComplete, COND_KINDS, feesTotal, suggestLateFee, contractHtml,
  downloadContract, shareContract, kautionPayout, compressImage, calcPrice, waLink, normPhone, EXPENSE_CATS, DAMAGE_STATUS, DAMAGE_PAYER, SignaturePad, initStore, isDemo, APP_NAME,
} from './common.js?v=6';

let store, user = null;
let items = [], rentals = [], customers = [], expenses = [], damages = [], settings = { ...DEFAULT_SETTINGS };
let started = false, dirty = false, pending = false;
const photoCache = {};
const ui = { calMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1), calItem: '', calSel: dayKey(new Date()), listFilter: 'offen', year: new Date().getFullYear() };
const app = $('#app'), nav = $('#nav');

// ---------- Start ----------
try { if (localStorage.getItem('mietbox_theme') === 'dark') document.documentElement.dataset.theme = 'dark'; } catch { }
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
  store.watchCol('customers', d => { customers = d.sort((a, b) => (a.name || '').localeCompare(b.name || '')); refresh(); });
  store.watchCol('expenses', d => { expenses = d.sort((a, b) => (b.datum || '').localeCompare(a.datum || '')); refresh(); });
  store.watchCol('damages', d => { damages = d.sort((a, b) => (b.datum || '').localeCompare(a.datum || '')); refresh(); });
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
  const views = { start: viewStart, kalender: viewCalendar, mieten: () => viewRentals(id), miete: () => viewRental(id), einnahmen: viewMoney, mehr: viewMore, artikel: () => id ? viewItem(id) : viewItems(), einstellungen: viewSettings,
    kunden: viewCustomers, kunde: () => viewCustomer(id), ausgabe: () => viewExpense(id), schaeden: viewDamages, schaden: () => viewDamage(id) };
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
  const active = p === 'miete' ? 'mieten' : p === 'ausgabe' ? 'einnahmen' : ['artikel', 'einstellungen', 'kunden', 'kunde', 'schaeden', 'schaden'].includes(p) ? 'mehr' : p;
  const L = { start: 'Start', kalender: 'Kalender', mieten: 'Mieten', einnahmen: 'Finanzen', mehr: 'Mehr' };
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
  const tmr = new Date(now); tmr.setDate(tmr.getDate() + 1);
  const retTomorrow = open.filter(r => dayKey(r.bis) === dayKey(tmr) && (r.pickedUpAt || r.renterPickupAt) && !(r.returnedAt || r.renterReturnAt));
  const openDamages = damages.filter(d => d.status !== 'erledigt');
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
    ...retTomorrow.map(r => `<div class="alert teal">🔔 <span style="flex:1"><a href="#/miete/${r.id}"><b>Rückgabe morgen:</b> ${esc(r.mieter?.name || '?')} (${esc(r.item?.name)}, ${fmtShort(r.bis)})</a>${r.mieter?.telefon ? `<br><a class="btn wa sm" style="margin-top:6px" target="_blank" href="${reminderUrl(r, 'rueckgabe')}">📲 Erinnerung senden</a>` : ''}</span></div>`),
    ...(openDamages.length ? [`<a class="alert amber" href="#/schaeden">⚠️ <span><b>${openDamages.length} ${openDamages.length > 1 ? 'offene Schadensfälle' : 'offener Schadensfall'}</b> – Reparatur / Bezahlung klären</span></a>`] : []),
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

// ---------- Finanzen: Einnahmen, Ausgaben, Gewinn ----------
const rentalIncome = (r) => r.storniert ? 0 : num(r.preis) + feesTotal(r);
function itemStats(itemId) {
  const inc = rentals.filter(r => r.itemId === itemId && !r.storniert).reduce((s, r) => s + rentalIncome(r), 0);
  const exp = expenses.filter(e => e.itemId === itemId).reduce((s, e) => s + num(e.betrag), 0);
  const kauf = expenses.filter(e => e.itemId === itemId && e.kategorie === 'anschaffung').reduce((s, e) => s + num(e.betrag), 0);
  const n = rentals.filter(r => r.itemId === itemId && !r.storniert && r.signature).length;
  return { inc, exp, kauf, gewinn: inc - exp, n, pct: exp ? Math.min(100, Math.round(inc / exp * 100)) : (inc ? 100 : 0) };
}
function viewMoney() {
  const Y = ui.year;
  const rows = Array.from({ length: 12 }, (_, i) => ({ m: i, n: 0, miete: 0, geb: 0, bar: 0, pp: 0, offen: 0, aus: 0 }));
  for (const r of rentals) {
    const d = new Date(r.von); if (d.getFullYear() !== Y || r.storniert) continue;
    const row = rows[d.getMonth()]; const p = num(r.preis), g = feesTotal(r);
    row.n++; row.miete += p; row.geb += g;
    if (r.mietePaid === 'bar' || r.mietePaid === 'kaution') row.bar += p; else if (r.mietePaid === 'paypal') row.pp += p; else row.offen += p;
    if (!r.closed) row.offen += g; else if (r.kautionVia === 'paypal') row.pp += g; else row.bar += g;
  }
  const yExp = expenses.filter(e => (e.datum || '').startsWith(String(Y)));
  for (const e of yExp) rows[new Date(e.datum).getMonth()].aus += num(e.betrag);
  const sum = rows.reduce((s, r) => { for (const k of ['n', 'miete', 'geb', 'bar', 'pp', 'offen', 'aus']) s[k] += r[k]; return s; }, { n: 0, miete: 0, geb: 0, bar: 0, pp: 0, offen: 0, aus: 0 });
  const umsatz = sum.miete + sum.geb, gewinn = umsatz - sum.aus;
  const max = Math.max(1, ...rows.map(r => Math.max(r.miete + r.geb, r.aus)));
  const kautionHeld = rentals.filter(r => !r.closed && r.kautionStatus === 'erhalten').reduce((s, r) => s + num(r.kaution), 0);
  const years = [...new Set([new Date().getFullYear(), ...rentals.map(r => new Date(r.von).getFullYear()), ...expenses.map(e => new Date(e.datum).getFullYear())])].filter(Boolean).sort();
  app.innerHTML = `${header('Finanzen')}
    <div class="row" style="margin-bottom:12px"><select id="yr">${years.map(y => `<option ${y === Y ? 'selected' : ''}>${y}</option>`).join('')}</select><button class="btn sec" id="csv">CSV</button></div>
    <div class="stats">
      <div class="stat"><div class="v">${eur(umsatz)}</div><div class="l">Einnahmen ${Y} (${sum.n} Mieten)</div></div>
      <div class="stat"><div class="v">${eur(sum.aus)}</div><div class="l">Ausgaben ${Y}</div></div>
      <div class="stat ${gewinn < 0 ? 'warn' : ''}"><div class="v">${eur(gewinn)}</div><div class="l">Gewinn ${Y}</div></div>
      <div class="stat ${sum.offen ? 'warn' : ''}"><div class="v">${eur(sum.offen)}</div><div class="l">noch offen</div></div>
    </div>
    <p class="small muted" style="margin-top:-4px">Davon bar ${eur(sum.bar)} · PayPal ${eur(sum.pp)}</p>
    ${kautionHeld ? `<div class="alert blue">🔒 <span>Du hältst gerade <b>${eur(kautionHeld)}</b> Kaution (gehört den Mietern, zählt nicht als Einnahme).</span></div>` : ''}

    ${items.length ? `<h2>Hat sich bezahlt gemacht?</h2><div class="card">${items.map(i => { const st = itemStats(i.id); return `
      <div style="margin-bottom:12px"><div class="row between"><b>${itemIcon(i.typ)} ${esc(i.name)}</b><span class="badge ${st.gewinn >= 0 && st.exp ? 'green' : 'amber'}">${st.exp ? (st.gewinn >= 0 ? 'bezahlt ✓' : st.pct + ' %') : 'keine Kosten erfasst'}</span></div>
      <div style="height:10px;border-radius:5px;background:var(--line);margin:6px 0;overflow:hidden"><div style="height:100%;width:${st.pct}%;background:var(--accent)"></div></div>
      <div class="small muted">Einnahmen ${eur(st.inc)} · Kosten ${eur(st.exp)} · ${st.gewinn >= 0 ? 'Gewinn' : 'noch offen'} ${eur(Math.abs(st.gewinn))} · ${st.n} Mieten</div></div>`; }).join('')}
      <p class="tiny muted">Alle Jahre zusammen. Kosten = Ausgaben, die dem Artikel zugeordnet sind (z. B. Kaufpreis, Versicherung, TÜV).</p></div>` : ''}

    <h2>Monate ${Y}</h2>
    <div class="card" style="overflow-x:auto"><table class="money"><thead><tr><th>Monat</th><th>Mieten</th><th>Einnahmen</th><th>Ausgaben</th><th>Gewinn</th><th style="width:18%"></th></tr></thead><tbody>
    ${rows.map(r => { const e = r.miete + r.geb, g = e - r.aus; return `<tr><td>${new Date(Y, r.m, 1).toLocaleDateString('de-DE', { month: 'short' })}</td><td>${r.n || ''}</td><td>${e ? eur(e) : ''}</td><td>${r.aus ? eur(r.aus) : ''}</td><td style="${g < 0 ? 'color:var(--red)' : ''}">${e || r.aus ? eur(g) : ''}</td><td><div class="barline" style="width:${(e / max * 100).toFixed(0)}%;${e ? '' : 'opacity:0'}"></div>${r.aus ? `<div class="barline" style="margin-top:2px;background:var(--red);width:${(r.aus / max * 100).toFixed(0)}%"></div>` : ''}</td></tr>`; }).join('')}
    <tr class="sum"><td>Summe</td><td>${sum.n}</td><td>${eur(umsatz)}</td><td>${eur(sum.aus)}</td><td>${eur(gewinn)}</td><td></td></tr></tbody></table></div>

    <div class="row between"><h2 style="margin:0">Ausgaben ${Y}</h2><a class="btn sm" href="#/ausgabe/neu">+ Ausgabe</a></div>
    <div class="card list" style="margin-top:8px">${yExp.length ? yExp.map(e => `<a class="list-item" href="#/ausgabe/${e.id}"><div class="ic">🧾</div><div class="grow"><div class="t">${esc(EXPENSE_CATS[e.kategorie] || e.kategorie)}${e.notiz ? ' – ' + esc(e.notiz) : ''}</div><div class="small muted">${fmtDate(e.datum)}${e.itemId ? ' · ' + esc(itemById(e.itemId)?.name || '') : ''}${e.beleg ? ' · 📎 Beleg' : ''}</div></div><b>${eur(e.betrag)}</b></a>`).join('') : `<div class="empty">Noch keine Ausgaben. Trag z. B. den Kaufpreis des Anhängers ein, dann siehst du, ab wann er sich bezahlt macht.</div>`}</div>
    <p class="small muted">Einnahmen nach Mietbeginn gezählt, Gebühren zählen ab Abschluss als bezahlt. Die CSV enthält Einnahmen und Ausgaben – gut für die Steuererklärung.</p>`;
  $('#yr').onchange = (e) => { ui.year = +e.target.value; viewMoney(); };
  $('#csv').onclick = () => {
    const f2 = (n) => num(n).toFixed(2).replace('.', ',');
    const head = ['Art', 'Datum', 'Ende', 'Artikel', 'Kunde / Kategorie', 'Betrag', 'davon Gebühren', 'Bezahlt', 'Notiz'];
    const inc = rentals.filter(r => !r.storniert && new Date(r.von).getFullYear() === Y).map(r => ['Einnahme', fmtShort(r.von), fmtShort(r.bis), r.item?.name, r.mieter?.name, f2(rentalIncome(r)), f2(feesTotal(r)), r.mietePaid || 'offen', r.preisInfo || '']);
    const out = yExp.map(e => ['Ausgabe', fmtDate(e.datum), '', itemById(e.itemId)?.name || '', EXPENSE_CATS[e.kategorie] || e.kategorie, '-' + f2(e.betrag), '', '', e.notiz || '']);
    const csv = [head, ...inc, ...out].map(l => l.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    downloadBlob(new Blob(['﻿' + csv], { type: 'text/csv' }), `Mietbox_Finanzen_${Y}.csv`);
  };
}

function viewExpense(id) {
  const isNew = !id || id.startsWith('neu');
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const e = isNew ? { datum: dayKey(new Date()), kategorie: q.get('k') || 'anschaffung', itemId: q.get('i') || items[0]?.id || '', betrag: q.get('b') || '', notiz: q.get('n') || '' } : expenses.find(x => x.id === id);
  if (!e) { app.innerHTML = header('Nicht gefunden', '', '#/einnahmen'); return; }
  app.innerHTML = `${header(isNew ? 'Neue Ausgabe' : 'Ausgabe', '', '#/einnahmen')}
  <form class="card" id="ef">
    <div class="grid2"><div><label>Betrag (€)</label><input name="betrag" inputmode="decimal" required value="${esc(e.betrag)}"></div><div><label>Datum</label><input name="datum" type="date" required value="${esc(e.datum)}"></div></div>
    <label>Kategorie</label><select name="kategorie">${Object.entries(EXPENSE_CATS).map(([k, v]) => `<option value="${k}" ${e.kategorie === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
    <label>Gehört zu Artikel</label><select name="itemId"><option value="">– allgemein –</option>${items.map(i => `<option value="${i.id}" ${e.itemId === i.id ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}</select>
    <label>Notiz</label><input name="notiz" value="${esc(e.notiz)}" placeholder="z. B. Kaufpreis gebraucht, Versicherung 2027">
    <label>Beleg (Foto, optional)</label>
    <div class="photos">${e.beleg ? `<div class="photo"><img src="${e.beleg}" data-full alt=""><button type="button" class="x" id="delBeleg">✕</button></div>` : ''}<label class="upload"><span class="big">📷</span>Beleg<input type="file" accept="image/*" id="belegIn"></label></div>
    <div class="btns"><button class="btn grow">Speichern</button>${isNew ? '' : '<button type="button" class="btn danger" id="delE">Löschen</button>'}</div>
  </form>`;
  const f = $('#ef'); let beleg = e.beleg || null;
  f.addEventListener('input', () => dirty = true);
  $('#belegIn').onchange = async (ev) => { const file = ev.target.files[0]; if (!file) return; beleg = await compressImage(file, { max: 1100, quality: 0.55 }); const ph = document.createElement('div'); ph.className = 'photo'; ph.innerHTML = `<img src="${beleg}" alt="">`; $('.photos', f).prepend(ph); toast('Beleg angehängt – Speichern nicht vergessen'); };
  $('#delBeleg') && ($('#delBeleg').onclick = () => { beleg = null; $('#delBeleg').parentElement.remove(); });
  app.onclick = (ev) => { const img = ev.target.closest('img[data-full]'); if (img) openViewer(img.src, 'Beleg'); };
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const d = { betrag: num(f.betrag.value), datum: f.datum.value, kategorie: f.kategorie.value, itemId: f.itemId.value, notiz: f.notiz.value.trim(), beleg, updatedAt: nowIso() };
    if (!d.betrag) return toast('Betrag eingeben', 'err');
    const nid = isNew ? store.newId() : id;
    try { await store.set('expenses', nid, { ...(isNew ? { createdAt: nowIso() } : e), ...d, id: undefined }); } catch (err) { return toast('Fehler: ' + err.message, 'err'); }
    if (q.get('d')) await store.update('damages', q.get('d'), { expenseId: nid }).catch(() => { });
    dirty = false; toast('Gespeichert', 'ok'); history.back();
  };
  $('#delE') && ($('#delE').onclick = async () => { if (!confirm('Ausgabe löschen?')) return; await store.del('expenses', id); location.hash = '#/einnahmen'; });
}

function downloadBlob(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

// ---------- Mehr ----------
function viewMore() {
  app.innerHTML = `${header('Mehr')}
    <div class="card list">
      <a class="list-item" href="#/mieten/archiv"><div class="ic">🗄️</div><div class="grow"><div class="t">Archiv</div><div class="small muted">Abgeschlossene Mieten · Suche „Wer hatte den Anhänger am …?“</div></div><span class="chev">›</span></a>
      <a class="list-item" href="#/kunden"><div class="ic">👥</div><div class="grow"><div class="t">Kunden</div><div class="small muted">Stammkunden, Historie, Rabatt, gesperrte Kunden</div></div><span class="chev">›</span></a>
      <a class="list-item" href="#/schaeden"><div class="ic">⚠️</div><div class="grow"><div class="t">Schadensakte</div><div class="small muted">Schäden mit Fotos, Kosten, Reparatur, Versicherung</div></div><span class="chev">›</span></a>
      <a class="list-item" href="#/artikel"><div class="ic">🚚</div><div class="grow"><div class="t">Artikel</div><div class="small muted">Anhänger, Werkzeuge, E-Roller – Preise, Kaution, TÜV</div></div><span class="chev">›</span></a>
      <a class="list-item" href="#/einstellungen"><div class="ic">⚙️</div><div class="grow"><div class="t">Einstellungen</div><div class="small muted">Deine Daten, PayPal, Gebühren, Vertrag, Unterschrift</div></div><span class="chev">›</span></a>
      <a class="list-item" href="#" id="backup"><div class="ic">💾</div><div class="grow"><div class="t">Backup herunterladen</div><div class="small muted">Mieten, Artikel, Kunden, Ausgaben, Schäden (ohne Fotos)</div></div></a>
      <a class="list-item" href="#" id="logout"><div class="ic">🚪</div><div class="grow"><div class="t">Abmelden</div><div class="small muted">${esc(user?.email || '')}</div></div></a>
    </div>
    ${isDemo ? `<button class="btn danger block" id="demoReset">Demo-Daten komplett löschen</button>` : ''}
    <p class="small muted center">${APP_NAME} · ${isDemo ? 'Demo-Modus' : 'online synchronisiert'}</p>`;
  $('#backup').onclick = (e) => { e.preventDefault(); downloadBlob(new Blob([JSON.stringify({ exportiert: nowIso(), settings, items, rentals, customers, expenses, damages: damages.map(d => ({ ...d, photos: (d.photos || []).length + ' Foto(s)' })) }, null, 1)], { type: 'application/json' }), `Mietbox_Backup_${dayKey(new Date())}.json`); };
  $('#logout').onclick = (e) => { e.preventDefault(); store.logout(); };
  $('#demoReset') && ($('#demoReset').onclick = () => { if (confirm('Alle Demo-Daten löschen?')) { localStorage.removeItem('mietbox_demo_v1'); location.hash = ''; location.reload(); } });
}

// ---------- Artikel ----------
function extrasEditorHtml(list) {
  return `<div id="exList">${(list || []).map((x, i) => extraRow(x, i)).join('')}</div><button type="button" class="btn ghost sm" id="exAdd">+ Zubehör hinzufügen</button>`;
}
const extraRow = (x = {}, i = 0) => `<div class="row ex-row" style="margin-bottom:6px"><input class="ex-name" placeholder="z. B. Plane" value="${esc(x.name)}" style="flex:2"><input class="ex-preis" inputmode="decimal" placeholder="€" value="${esc(x.preis ?? '')}" style="flex:1;min-width:60px"><label class="check" style="padding:0;font-size:.8rem;white-space:nowrap"><input type="checkbox" class="ex-tag" ${x.proTag ? 'checked' : ''}> /Tag</label><button type="button" class="btn ghost sm ex-del">✕</button></div>`;
function readExtras() { return $$('.ex-row').map(r => ({ name: $('.ex-name', r).value.trim(), preis: num($('.ex-preis', r).value), proTag: $('.ex-tag', r).checked })).filter(x => x.name); }

function viewItems() {
  app.innerHTML = `${header('Artikel', 'Was du verleihst', '#/mehr')}
    <div class="card list">${items.length ? items.map(i => {
      const tuevSoon = i.tuevBis && (new Date(i.tuevBis) - new Date()) < 60 * 864e5;
      const busy = rentals.find(r => r.itemId === i.id && !r.closed && (r.pickedUpAt || r.renterPickupAt) && !(r.returnedAt || r.renterReturnAt));
      const dmg = damages.some(d => d.itemId === i.id && d.status !== 'erledigt');
      return `<a class="list-item" href="#/artikel/${i.id}"><div class="ic">${itemIcon(i.typ)}</div><div class="grow"><div class="t">${esc(i.name)}</div><div class="small muted">${eur(i.tagespreis)} / Tag · Kaution ${eur(i.kaution)}${i.kennzeichen ? ' · ' + esc(i.kennzeichen) : ''}</div></div>${busy ? '<span class="badge green">unterwegs</span>' : '<span class="badge grey">da</span>'}${tuevSoon ? ' <span class="badge red">TÜV</span>' : ''}${dmg ? ' <span class="badge amber">Schaden</span>' : ''}</a>`;
    }).join('') : `<div class="empty">Noch nichts angelegt.</div>`}</div>
    <a class="btn block" href="#/artikel/neu">+ Artikel anlegen</a>`;
}

function viewItem(id) {
  const isNew = id === 'neu';
  const it = isNew ? { typ: 'anhaenger', lockType: 'fern', gps: true, tagespreis: 25, kaution: 100, extras: [] } : itemById(id);
  if (!it) { app.innerHTML = header('Nicht gefunden', '', '#/artikel'); return; }
  const st = isNew ? null : itemStats(id);
  const dmgs = isNew ? [] : damages.filter(d => d.itemId === id);
  app.innerHTML = `${header(isNew ? 'Neuer Artikel' : esc(it.name), '', '#/artikel')}
  ${st ? `<div class="card tight"><div class="row between"><b>Bilanz (alle Jahre)</b><span class="badge ${st.gewinn >= 0 && st.exp ? 'green' : 'amber'}">${st.exp ? (st.gewinn >= 0 ? 'hat sich bezahlt gemacht ✓' : st.pct + ' % wieder drin') : 'Kosten noch nicht erfasst'}</span></div>
    <div style="height:10px;border-radius:5px;background:var(--line);margin:8px 0;overflow:hidden"><div style="height:100%;width:${st.pct}%;background:var(--accent)"></div></div>
    <div class="small muted">Einnahmen ${eur(st.inc)} · Kosten ${eur(st.exp)} · ${st.n} Mieten</div>
    <div class="btns"><a class="btn sec sm" href="#/ausgabe/neu?i=${id}&k=anschaffung">+ Kaufpreis / Kosten</a><a class="btn ghost sm" href="#/schaden/neu?i=${id}">⚠️ Schaden erfassen</a></div></div>` : ''}
  ${dmgs.length ? `<div class="card list">${dmgs.map(damageLine).join('')}</div>` : ''}
  <form class="card" id="itf">
    <label>Bezeichnung</label><input name="name" required value="${esc(it.name)}" placeholder="z. B. Anhänger 750 kg Plane">
    <label>Art</label><select name="typ">${Object.entries(ITEM_TYPES).map(([k, v]) => `<option value="${k}" ${it.typ === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
    <h3 style="margin-top:14px">Preise</h3>
    <div class="grid2"><div><label>Preis pro Tag (€)</label><input name="tagespreis" inputmode="decimal" value="${esc(it.tagespreis ?? '')}"></div>
    <div><label>Kaution (€)</label><input name="kaution" inputmode="decimal" value="${esc(it.kaution ?? '')}"></div>
    <div><label>Halber Tag, bis 5 Std. (€)</label><input name="preisHalbtag" inputmode="decimal" value="${esc(it.preisHalbtag ?? '')}" placeholder="optional"></div>
    <div><label>Wochenende (€)</label><input name="preisWochenende" inputmode="decimal" value="${esc(it.preisWochenende ?? '')}" placeholder="optional"></div>
    <div><label>Woche, 7 Tage (€)</label><input name="preisWoche" inputmode="decimal" value="${esc(it.preisWoche ?? '')}" placeholder="optional"></div>
    <div><label>Selbstbeteiligung (€)</label><input name="selbstbeteiligung" inputmode="decimal" value="${esc(it.selbstbeteiligung || '')}" placeholder="Standard: ${esc(settings.selbstbeteiligung ?? 1000)}"></div></div>
    <p class="tiny muted">Leere Felder werden nicht genutzt. Die App nimmt automatisch den günstigsten passenden Preis. Wochenende = höchstens 3 Tage inkl. Samstag und Sonntag.</p>
    <h3 style="margin-top:14px">Zubehör zum Dazubuchen</h3>
    <p class="tiny muted">Name, Preis und ob der Preis pro Tag oder einmalig gilt. Preis 0 = kostenlos dabei.</p>
    ${extrasEditorHtml(it.extras)}
    <h3 style="margin-top:14px">Details</h3>
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
  $('#exAdd').onclick = () => { $('#exList').insertAdjacentHTML('beforeend', extraRow()); dirty = true; };
  $('#exList').onclick = (e) => { const d = e.target.closest('.ex-del'); if (d) { d.closest('.ex-row').remove(); dirty = true; } };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = { name: f.name.value.trim(), typ: f.typ.value, tagespreis: num(f.tagespreis.value), kaution: num(f.kaution.value),
      preisHalbtag: num(f.preisHalbtag.value), preisWochenende: num(f.preisWochenende.value), preisWoche: num(f.preisWoche.value), selbstbeteiligung: num(f.selbstbeteiligung.value), extras: readExtras(),
      kennzeichen: f.kennzeichen.value.trim(), zgg: f.zgg.value.trim(), tuevBis: f.tuevBis.value ? f.tuevBis.value + '-28' : '', lockType: f.lockType.value, gps: f.gps.checked, checklist: f.checklist.value.trim(), notiz: f.notiz.value.trim() };
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
    <div class="grid2"><div><label>Selbstbeteiligung je Schaden (€)</label><input name="selbstbeteiligung" inputmode="decimal" value="${esc(s.selbstbeteiligung ?? 1000)}"></div><div><label>Reinigungspauschale (€)</label><input name="reinigung" inputmode="decimal" value="${esc(s.reinigung)}"></div>
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
  <div class="card"><h2>Design</h2><label class="check"><input type="checkbox" id="darkT" ${document.documentElement.dataset.theme === 'dark' ? 'checked' : ''}> Dunkles Design (nur auf diesem Handy)</label></div>
  <button class="btn block">Einstellungen speichern</button>
  </form>
  <div class="card" style="margin-top:12px"><h2>Deine Unterschrift</h2><p class="small muted">Wird automatisch in jeden Vertrag eingesetzt.</p>
    ${s.ownerSignature ? `<img class="sig-img" src="${s.ownerSignature}" alt="Unterschrift"><div class="btns"><button class="btn ghost sm" id="newSig">Neu unterschreiben</button></div>` : sigPadHtml('ownSig')}
  </div>`;
  const f = $('#sf');
  f.addEventListener('input', () => dirty = true);
  $('#darkT').onchange = (e) => { const d = e.target.checked; document.documentElement.dataset.theme = d ? 'dark' : ''; try { localStorage.setItem('mietbox_theme', d ? 'dark' : 'light'); } catch { } };
  $('#resetTerms').onclick = () => { if (confirm('Vertragstext auf Vorlage zurücksetzen?')) f.terms.value = DEFAULT_TERMS; };
  f.onsubmit = async (e) => {
    e.preventDefault();
    settings = { ...settings, name: f.name.value.trim(), adresse: f.adresse.value.trim(), telefon: f.telefon.value.trim(), email: f.email.value.trim(), paypalMe: f.paypalMe.value.trim().replace(/^.*paypal\.me\//i, '').replace(/\/.*$/, ''), reinigung: num(f.reinigung.value), selbstbeteiligung: num(f.selbstbeteiligung.value), verspaetungStunde: num(f.verspaetungStunde.value), kulanzMinuten: num(f.kulanzMinuten.value), loeschTage: Math.max(1, num(f.loeschTage.value)), fotoTage: Math.max(1, num(f.fotoTage.value)), terms: (f.terms.value.trim() === DEFAULT_TERMS.trim() ? '' : f.terms.value.trim()) };
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
const checklistLines = (r) => [...(r.item?.checklist || '').split('\n').map(s => s.trim()).filter(Boolean), ...(r.extras || []).map(x => 'Zubehör: ' + x.name)];
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
    r = { id: 'neu', itemId: it.id, item: itemSnap(it), von: toLocalInput(d), bis: toLocalInput(bis), preis: num(it.tagespreis), kaution: num(it.kaution), tagespreis: num(it.tagespreis), zahlungsart: 'bar', mieter: {}, extras: [] };
    const kc = q.get('k') && customerById(q.get('k'));
    if (kc) { r.customerId = kc.id; r.rabatt = num(kc.rabatt); r.mieter = { name: kc.name, adresse: kc.adresse, telefon: kc.telefon, email: kc.email, geburtsdatum: kc.geburtsdatum, fuehrerschein: kc.fuehrerschein }; }
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
    <div id="extrasBox"></div>
    <div class="grid2"><div><label>Rabatt (%)</label><input name="rabatt" inputmode="decimal" value="${esc(r.rabatt || '')}" placeholder="0"></div><div></div></div>
    <div id="priceInfo" class="small" style="margin-top:8px;padding:8px 10px;border-radius:10px;background:var(--accent-soft);color:var(--accent)"></div>
    <div class="grid2"><div><label>Miete gesamt (€) <span id="daysInfo" class="muted"></span></label><input name="preis" inputmode="decimal" value="${esc(num(r.preis).toFixed(2).replace('.', ',').replace(/,00$/, ''))}"></div><div><label>Kaution (€)</label><input name="kaution" inputmode="decimal" value="${esc(r.kaution)}"></div></div>
    <label>Zahlung</label><select name="zahlungsart"><option value="bar" ${r.zahlungsart !== 'paypal' ? 'selected' : ''}>Bar</option><option value="paypal" ${r.zahlungsart === 'paypal' ? 'selected' : ''}>PayPal</option></select>
    <div id="overlap"></div>
    <hr><h3>Mieter</h3>
    ${ro ? '' : `<label>👥 Stammkunde wählen</label><input list="custList" id="custPick" placeholder="Name oder Telefon tippen …" autocomplete="off"><datalist id="custList">${customers.map(c => `<option value="${esc(c.name)}${c.telefon ? ' · ' + esc(c.telefon) : ''}">`).join('')}</datalist>`}
    <input type="hidden" name="customerId" value="${esc(r.customerId || '')}"><div id="custInfo"></div>
    <p class="small muted">Oder neu eintragen – oder leer lassen, dann füllt der Mieter es über den Link selbst aus.</p>
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
      ${r.storniert ? '' : `<div class="btns">${m.telefon ? `<a class="btn wa grow" target="_blank" data-act="waFinal" href="${waUrl(m.telefon, `Hallo${vorname}, danke fürs Mieten! Hier ist deine Endabrechnung (Gebühren, Kaution) – über den Link kannst du sie als PDF herunterladen:\n${link}`)}">📲 Endabrechnung an ${esc(m.name ? m.name.split(' ')[0] : 'Kunden')} senden</a>` : ''}<button class="btn sec sm" data-act="share" data-final="1">PDF als Datei teilen</button></div>${r.finalSentAt ? `<p class="tiny muted">Zuletzt verschickt am ${fmtShort(r.finalSentAt)}</p>` : ''}`}
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
  ${r.customerId && customerById(r.customerId)?.gesperrt ? `<div class="alert red">⛔ <span><b>Achtung: Kunde ist gesperrt</b>${customerById(r.customerId).sperrGrund ? ' – ' + esc(customerById(r.customerId).sperrGrund) : ''}</span></div>` : ''}
  ${!ro && r.signature && !returned && m.telefon ? `<div class="card tight"><div class="row wrap-ok between"><b>💬 Nachricht an ${esc(m.name ? m.name.split(' ')[0] : 'Mieter')}</b>${r.remindedAt ? `<span class="tiny muted">zuletzt ${fmtShort(r.remindedAt)}</span>` : ''}</div><div class="btns">
    ${!picked ? `<a class="btn wa sm" target="_blank" data-act="reminded" href="${reminderUrl(r, 'abholung')}">Abhol-Erinnerung</a>` : s.key === 'ueberfaellig' ? `<a class="btn danger sm" target="_blank" data-act="reminded" href="${reminderUrl(r, 'ueberfaellig')}">⏰ Überfällig-Nachricht</a>` : `<a class="btn wa sm" target="_blank" data-act="reminded" href="${reminderUrl(r, 'rueckgabe')}">Rückgabe-Erinnerung</a>`}
  </div></div>` : ''}
  ${formCard}

  <details class="card" ${!docsOk && !ro ? 'open' : ''}><summary>🪪 Ausweis & Führerschein ${docsOk ? '<span class="badge green">vollständig</span>' : r.idDeleted ? '<span class="badge grey">gelöscht</span>' : `<span class="badge amber">${need.filter(k => r.docs?.[k]).length}/${need.length}</span>`}</summary>
    ${r.idDeleted ? `<p class="muted small">Ausweisfotos wurden ${idDays()} Tage nach Abschluss automatisch gelöscht.</p>` : `
    <p class="small muted">Foto machen oder Bild auswählen (z. B. per WhatsApp bekommen). Fotos bekommen automatisch den Aufdruck „KOPIE“ und werden ${idDays()} Tage nach Abschluss automatisch gelöscht.</p>
    <label class="check"><input type="checkbox" data-act="consent" ${r.consent ? 'checked' : ''} ${dis}> Mieter ist einverstanden, dass Ausweis/Führerschein fotografiert und bis ${idDays()} Tage nach Mietende gespeichert werden.</label>
    <div class="photos" id="ph-ids">${ro ? '' : need.map(k => uploadSlot(k, PHOTO_KINDS[k], !!r.docs?.[k])).join('')}</div>`}
  </details>

  <details class="card" ${docsOk && !r.signature && !ro ? 'open' : ''}><summary>✍️ Vertrag ${r.signature ? '<span class="badge green">unterschrieben</span>' : '<span class="badge amber">offen</span>'}</summary>
    ${r.signature ? `<p class="small">Unterschrieben ${r.signedBy === 'link' ? 'per Link' : 'vor Ort'} am <b>${fmtDT(r.signedAt)}</b></p><img class="sig-img" src="${r.signature}" alt="Unterschrift Mieter">
      ${ro ? '' : `<div class="btns">${m.telefon ? `<a class="btn wa grow" target="_blank" data-act="waContract" href="${waUrl(m.telefon, `Hallo${vorname}, hier ist dein unterschriebener Mietvertrag (${r.item?.name}, ${fmtShort(r.von)} – ${fmtShort(r.bis)}). Über den Link kannst du ihn jederzeit als PDF herunterladen:\n${link}`)}">📲 Vertrag an ${esc(m.name ? m.name.split(' ')[0] : 'Kunden')} senden</a>` : `<span class="small muted">Telefonnummer fehlt – oben bei Mietdaten eintragen.</span>`}<button class="btn sec sm" data-act="share">PDF als Datei teilen</button></div>
      <p class="tiny muted">${r.contractSentAt ? 'Verschickt am ' + fmtShort(r.contractSentAt) + '.' : 'Öffnet WhatsApp direkt im Chat mit dem Kunden – du musst nur noch auf Senden tippen.'}</p>`}
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
    ${(() => { const ds = damages.filter(d => d.rentalId === r.id); return `<hr><div class="row between"><h3 style="margin:0">Schäden</h3><a class="btn ghost sm" href="#/schaden/neu?r=${r.id}">⚠️ Schaden erfassen</a></div>${ds.length ? `<div class="list" style="margin-top:6px">${ds.map(damageLine).join('')}</div>` : '<p class="small muted">Keine Schäden erfasst.</p>'}`; })()}
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
  const chosen = new Set((r.extras || []).map(x => x.name));
  f.preis.addEventListener('input', () => { priceTouched = true; showInfo(); });
  f.kaution.addEventListener('input', () => kautionTouched = true);
  const itemNow = () => itemById(f.itemId.value) || r.item || {};
  const selExtras = () => (itemNow().extras || []).filter(x => chosen.has(x.name));
  const drawExtras = () => {
    const ex = itemNow().extras || [];
    $('#extrasBox').innerHTML = ex.length ? `<label>Zubehör dazu</label><div class="row wrap-ok" style="gap:6px">${ex.map((x, i) => `<label class="check" style="padding:6px 10px;border:1px solid var(--line);border-radius:10px;margin:0"><input type="checkbox" data-ex="${esc(x.name)}" ${chosen.has(x.name) ? 'checked' : ''}> ${esc(x.name)} <span class="muted small">${num(x.preis) ? eur(x.preis) + (x.proTag ? '/Tag' : '') : 'gratis'}</span></label>`).join('')}</div>` : '';
  };
  let calc = null;
  const showInfo = () => { if (!calc) return; $('#priceInfo').textContent = calc.text + (priceTouched && num(f.preis.value) !== calc.total ? `  →  manuell: ${eur(f.preis.value)}` : ''); };
  const recalc = () => {
    const it = itemNow();
    calc = calcPrice(it, f.von.value, f.bis.value, selExtras(), num(f.rabatt.value));
    $('#daysInfo').textContent = `(${calc.days} Tag${calc.days > 1 ? 'e' : ''})`;
    if (!priceTouched) f.preis.value = calc.total.toFixed(2).replace('.', ',').replace(/,00$/, '');
    if (!kautionTouched && it.kaution != null) f.kaution.value = num(it.kaution);
    showInfo();
    const a = new Date(f.von.value), b = new Date(f.bis.value);
    const clash = rentals.filter(x => x.id !== r.id && !x.closed && x.itemId === f.itemId.value && new Date(x.von) < b && new Date(x.bis) > a);
    $('#overlap').innerHTML = (b <= a ? `<div class="alert red" style="margin-top:10px">Ende liegt vor dem Beginn.</div>` : '') + clash.map(x => `<div class="alert red" style="margin-top:10px">⚠️ <span>Überschneidung mit ${esc(x.mieter?.name || 'einer Miete')} (${fmtShort(x.von)} – ${fmtShort(x.bis)})</span></div>`).join('');
  };
  const askRecalc = () => { if (isNew || !priceTouched || confirm('Preis neu berechnen?')) priceTouched = false; recalc(); };
  f.itemId.addEventListener('change', () => { chosen.clear(); drawExtras(); askRecalc(); });
  ['von', 'bis'].forEach(n => f[n].addEventListener('change', askRecalc));
  f.rabatt.addEventListener('change', askRecalc);
  $('#extrasBox').addEventListener('change', (e) => { const cb = e.target.closest('[data-ex]'); if (!cb) return; cb.checked ? chosen.add(cb.dataset.ex) : chosen.delete(cb.dataset.ex); askRecalc(); });
  // Stammkunde
  const showCust = (c) => {
    if (!c) { $('#custInfo').innerHTML = ''; return; }
    const st = custStats(c.id);
    $('#custInfo').innerHTML = c.gesperrt ? `<div class="alert red" style="margin-top:8px">⛔ <span><b>${esc(c.name)} ist gesperrt</b>${c.sperrGrund ? ' – ' + esc(c.sperrGrund) : ''}</span></div>`
      : `<div class="alert teal" style="margin-top:8px">${st.n >= 2 ? '⭐' : '👤'} <span><b>${esc(c.name)}</b> · ${st.n} Miete${st.n === 1 ? '' : 'n'} bisher${num(c.rabatt) ? ` · ${num(c.rabatt)} % Rabatt` : ''}${c.notiz ? '<br><span class="small">' + esc(c.notiz) + '</span>' : ''}</span></div>`;
  };
  showCust(customerById(f.customerId.value));
  $('#custPick') && $('#custPick').addEventListener('change', (e) => {
    const v = e.target.value.trim();
    const c = customers.find(c => `${c.name}${c.telefon ? ' · ' + c.telefon : ''}` === v) || customers.find(c => c.name === v);
    if (!c) return;
    f.customerId.value = c.id;
    f.m_name.value = c.name || ''; f.m_adresse.value = c.adresse || ''; f.m_telefon.value = c.telefon || ''; f.m_email.value = c.email || ''; f.m_geburtsdatum.value = c.geburtsdatum || ''; f.m_fuehrerschein.value = c.fuehrerschein || '';
    if (num(c.rabatt) && !num(f.rabatt.value)) { f.rabatt.value = num(c.rabatt); askRecalc(); }
    e.target.value = ''; showCust(c);
  });
  drawExtras(); recalc();
  if (!isNew) { priceTouched = num(r.preis) !== calc.total; showInfo(); }
  f.onsubmit = async (e) => {
    e.preventDefault();
    const it = itemById(f.itemId.value);
    if (new Date(f.bis.value) <= new Date(f.von.value)) return toast('Ende muss nach dem Beginn liegen', 'err');
    if ($('#overlap .alert') && !confirm('Es gibt eine Überschneidung. Trotzdem speichern?')) return;
    const cust = customerById(f.customerId.value);
    if (cust?.gesperrt && !confirm(`${cust.name} ist gesperrt. Trotzdem vermieten?`)) return;
    const extras = selExtras().map(x => ({ name: x.name, preis: num(x.preis), proTag: !!x.proTag }));
    const preis = num(f.preis.value);
    const data = {
      itemId: f.itemId.value, von: f.von.value, bis: f.bis.value, preis, kaution: num(f.kaution.value),
      tagespreis: num(it?.tagespreis ?? r.tagespreis), zahlungsart: f.zahlungsart.value, notiz: f.notiz.value.trim(),
      extras, rabatt: num(f.rabatt.value), customerId: f.customerId.value || null,
      preisInfo: calc && (extras.length || num(f.rabatt.value) || calc.label !== `${calc.days} Tag${calc.days > 1 ? 'e' : ''} × ${eur(it?.tagespreis)}` || preis !== calc.total) ? calc.text + (preis !== calc.total ? ` · vereinbart: ${eur(preis)}` : '') : '',
      mieter: { name: f.m_name.value.trim(), adresse: f.m_adresse.value.trim(), telefon: f.m_telefon.value.trim(), email: f.m_email.value.trim(), geburtsdatum: f.m_geburtsdatum.value, fuehrerschein: f.m_fuehrerschein.value },
      fahrer2: f.f2_name.value.trim() ? { name: f.f2_name.value.trim(), geburtsdatum: f.f2_geburtsdatum.value, fuehrerschein: f.f2_fuehrerschein.value } : null,
    };
    if (isNew || !r.signature) Object.assign(data, { item: it ? itemSnap(it) : r.item, cfg: { ...cfgSnap(), selbstbeteiligung: num(it?.selbstbeteiligung) || num(settings.selbstbeteiligung ?? 1000) }, vermieter: vermieterSnap(), terms: settings.terms || DEFAULT_TERMS, ownerSignature: settings.ownerSignature || null });
    else if ((data.preis !== num(r.preis) || data.von !== r.von || data.bis !== r.bis || data.kaution !== num(r.kaution) || (data.fahrer2?.name || '') !== (r.fahrer2?.name || '')) && !confirm('Der Vertrag ist schon unterschrieben. Trotzdem ändern?')) return;
    try {
      const cid = await upsertCustomer({ ...r, ...data });
      if (cid) data.customerId = cid;
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
      case 'waContract': upd(r, { contractSentAt: nowIso() }); break;
      case 'reminded': upd(r, { remindedAt: nowIso() }); break;
      case 'waFinal': upd(r, { finalSentAt: nowIso() }); break;
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
        const cid = await upsertCustomer(r); if (cid && cid !== r.customerId) patch.customerId = cid;
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

// ---------- Erinnerungen an Mieter (WhatsApp) ----------
function reminderText(r, kind) {
  const vn = r.mieter?.name ? ' ' + r.mieter.name.split(' ')[0] : '';
  const it = r.item?.name || 'Mietgegenstand';
  const late = num(r.cfg?.verspaetungStunde);
  if (kind === 'abholung') return `Hallo${vn}, kurze Erinnerung: Die Abholung von ${it} ist am ${fmtDT(r.von)}. Alles Weitere findest du hier:\n${linkFor(r)}`;
  if (kind === 'rueckgabe') return `Hallo${vn}, kurze Erinnerung: Bitte bring ${it} bis ${fmtDT(r.bis)} zurück (besenrein). Vergiss die Rückgabe-Fotos nicht:\n${linkFor(r)}\nDanke!`;
  return `Hallo${vn}, die Mietzeit für ${it} ist seit ${fmtDT(r.bis)} abgelaufen. Bitte bring ihn so schnell wie möglich zurück oder melde dich kurz bei mir.${late ? ` Laut Vertrag werden ab jetzt ${eur(late)} je angefangene Stunde berechnet.` : ''}`;
}
const reminderUrl = (r, kind) => waLink(r.mieter?.telefon, reminderText(r, kind));

// ---------- Kundenkartei ----------
const custStats = (cid) => {
  const rs = rentals.filter(r => r.customerId === cid && !r.storniert);
  return { n: rs.length, umsatz: rs.reduce((s, r) => s + rentalIncome(r), 0), last: rs.map(r => r.von).sort().pop(), rs };
};
const customerById = (id) => customers.find(c => c.id === id);
function findCustomer(m) {
  const p = normPhone(m.telefon);
  return (p && customers.find(c => normPhone(c.telefon) === p)) || (m.name && m.geburtsdatum && customers.find(c => c.name?.toLowerCase() === m.name.toLowerCase() && c.geburtsdatum === m.geburtsdatum)) || null;
}
// Mieterdaten in die Kundenkartei übernehmen (Notiz, Sperre, Rabatt bleiben erhalten)
async function upsertCustomer(r) {
  const m = r.mieter || {};
  if (!m.name) return r.customerId || null;
  const c = (r.customerId && customerById(r.customerId)) || findCustomer(m);
  const data = { name: m.name, adresse: m.adresse || '', telefon: m.telefon || '', email: m.email || '', geburtsdatum: m.geburtsdatum || '', fuehrerschein: m.fuehrerschein || '', updatedAt: nowIso() };
  try {
    if (c) { await store.update('customers', c.id, data); return c.id; }
    const id = store.newId();
    await store.set('customers', id, { ...data, rabatt: 0, notiz: '', gesperrt: false, createdAt: nowIso() });
    return id;
  } catch (e) { console.error(e); return r.customerId || null; }
}

function viewCustomers() {
  const rows = customers.map(c => ({ c, st: custStats(c.id) })).sort((a, b) => (b.st.last || '').localeCompare(a.st.last || ''));
  app.innerHTML = `${header('Kunden', `${customers.length} in der Kartei`, '#/mehr')}
    <input id="q" placeholder="Suchen (Name, Telefon, Ort) …" style="margin-bottom:12px">
    <div class="card list" id="cl">${rows.length ? rows.map(({ c, st }) => `<a class="list-item" href="#/kunde/${c.id}" data-s="${esc(((c.name || '') + ' ' + (c.telefon || '') + ' ' + (c.adresse || '')).toLowerCase())}"><div class="ic">${c.gesperrt ? '⛔' : st.n >= 2 ? '⭐' : '👤'}</div><div class="grow"><div class="t">${esc(c.name)}</div><div class="small muted">${st.n} Miete${st.n === 1 ? '' : 'n'} · ${eur(st.umsatz)}${st.last ? ' · zuletzt ' + new Date(st.last).toLocaleDateString('de-DE') : ''}</div></div>${c.gesperrt ? '<span class="badge red">gesperrt</span>' : num(c.rabatt) ? `<span class="badge teal">−${num(c.rabatt)} %</span>` : st.n >= 2 ? '<span class="badge green">Stammkunde</span>' : ''}</a>`).join('') : `<div class="empty">Noch keine Kunden. Sie werden automatisch angelegt, sobald du eine Miete mit Mieter-Namen speicherst.</div>`}</div>
    <a class="btn ghost block" href="#/kunde/neu">+ Kunde manuell anlegen</a>`;
  $('#q').oninput = (e) => { const q = e.target.value.toLowerCase(); $$('#cl .list-item').forEach(a => a.style.display = a.dataset.s.includes(q) ? '' : 'none'); };
}

function viewCustomer(id) {
  const isNew = id === 'neu';
  const c = isNew ? { rabatt: 0 } : customerById(id);
  if (!c) { app.innerHTML = header('Nicht gefunden', '', '#/kunden'); return; }
  const st = isNew ? { n: 0, umsatz: 0, rs: [] } : custStats(id);
  const dmgs = isNew ? [] : damages.filter(d => st.rs.some(r => r.id === d.rentalId));
  app.innerHTML = `${header(isNew ? 'Neuer Kunde' : esc(c.name), isNew ? '' : `${st.n} Mieten · ${eur(st.umsatz)}`, '#/kunden')}
  ${c.gesperrt ? `<div class="alert red">⛔ <span><b>Gesperrt</b>${c.sperrGrund ? ': ' + esc(c.sperrGrund) : ''} – an diesen Kunden nicht mehr vermieten.</span></div>` : ''}
  ${isNew ? '' : `<div class="btns" style="margin-top:0;margin-bottom:12px">${c.gesperrt ? '' : `<a class="btn" href="#/miete/neu?k=${id}">+ Neue Miete</a>`}${c.telefon ? `<a class="btn wa" target="_blank" href="${waLink(c.telefon, `Hallo ${c.name.split(' ')[0]}, `)}">WhatsApp</a><a class="btn ghost" href="tel:${esc(c.telefon)}">Anrufen</a>` : ''}</div>`}
  <form class="card" id="cf">
    <label>Name</label><input name="name" required value="${esc(c.name)}">
    <label>Adresse</label><input name="adresse" value="${esc(c.adresse)}">
    <div class="grid2 stack"><div><label>Telefon</label><input name="telefon" type="tel" value="${esc(c.telefon)}"></div><div><label>E-Mail</label><input name="email" type="email" value="${esc(c.email)}"></div></div>
    <div class="grid2"><div><label>Geburtsdatum</label><input name="geburtsdatum" type="date" value="${esc(c.geburtsdatum)}"></div><div><label>Führerscheinklasse</label><select name="fuehrerschein"><option value="">–</option>${LICENSE_CLASSES.map(k => `<option ${c.fuehrerschein === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div></div>
    <label>Stammkunden-Rabatt (%)</label><input name="rabatt" inputmode="decimal" value="${esc(c.rabatt || '')}" placeholder="0">
    <label>Notiz (nur für dich)</label><textarea name="notiz" rows="3" placeholder="z. B. sehr zuverlässig, bringt immer sauber zurück">${esc(c.notiz)}</textarea>
    <label class="check"><input type="checkbox" name="gesperrt" ${c.gesperrt ? 'checked' : ''}> ⛔ Nicht mehr vermieten (gesperrt)</label>
    <input name="sperrGrund" value="${esc(c.sperrGrund)}" placeholder="Grund, z. B. Schaden nicht bezahlt">
    <div class="btns"><button class="btn grow">Speichern</button>${isNew ? '' : '<button type="button" class="btn danger" id="delC">Löschen</button>'}</div>
  </form>
  ${st.rs.length ? `<h2>Mieten</h2><div class="card list">${[...st.rs].reverse().map(r => { const s = rentalStatus(r); return `<a class="list-item" href="#/miete/${r.id}"><div class="ic">${itemIcon(r.item?.typ)}</div><div class="grow"><div class="t">${esc(r.item?.name || '')}</div><div class="small muted">${fmtShort(r.von)} – ${fmtShort(r.bis)} · ${eur(rentalIncome(r))}${(r.gebuehren || []).length ? ' · Gebühren ' + eur(feesTotal(r)) : ''}</div></div><span class="badge ${s.cls}">${s.label}</span></a>`; }).join('')}</div>` : ''}
  ${dmgs.length ? `<h2>Schäden</h2><div class="card list">${dmgs.map(damageLine).join('')}</div>` : ''}
  ${isNew ? '' : `<p class="tiny muted">Die Kundenkartei enthält nur Kontaktdaten. Ausweisfotos bleiben bei der jeweiligen Miete und werden dort automatisch gelöscht.</p>`}`;
  const f = $('#cf');
  f.addEventListener('input', () => dirty = true);
  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = { name: f.name.value.trim(), adresse: f.adresse.value.trim(), telefon: f.telefon.value.trim(), email: f.email.value.trim(), geburtsdatum: f.geburtsdatum.value, fuehrerschein: f.fuehrerschein.value, rabatt: num(f.rabatt.value), notiz: f.notiz.value.trim(), gesperrt: f.gesperrt.checked, sperrGrund: f.sperrGrund.value.trim(), updatedAt: nowIso() };
    const nid = isNew ? store.newId() : id;
    await store.set('customers', nid, { ...(isNew ? { createdAt: nowIso() } : { createdAt: c.createdAt || nowIso() }), ...d });
    dirty = false; toast('Gespeichert', 'ok'); if (isNew) location.hash = '#/kunde/' + nid; else render(true);
  };
  $('#delC') && ($('#delC').onclick = async () => { if (!confirm('Kunde aus der Kartei löschen? Die Mieten selbst bleiben erhalten.')) return; await store.del('customers', id); location.hash = '#/kunden'; });
}

// ---------- Schadensakte ----------
const damageLine = (d) => `<a class="list-item" href="#/schaden/${d.id}"><div class="ic">${d.photos?.length ? `<img src="${d.photos[0]}" alt="" style="width:42px;height:42px;object-fit:cover;border-radius:12px">` : '⚠️'}</div><div class="grow"><div class="t">${esc(d.beschreibung || 'Schaden')}</div><div class="small muted">${fmtDate(d.datum)} · ${esc(d.itemName || itemById(d.itemId)?.name || '')}${d.mieterName ? ' · ' + esc(d.mieterName) : ''} · ${eur(d.kosten)} · ${DAMAGE_PAYER[d.zahlt || 'offen']}</div></div><span class="badge ${d.status === 'erledigt' ? 'green' : d.status === 'reparatur' ? 'blue' : 'amber'}">${DAMAGE_STATUS[d.status || 'offen']}</span></a>`;

function viewDamages() {
  const open = damages.filter(d => d.status !== 'erledigt'), done = damages.filter(d => d.status === 'erledigt');
  const sumOpen = open.reduce((s, d) => s + num(d.kosten), 0);
  app.innerHTML = `${header('Schadensakte', open.length ? `${open.length} offen · ${eur(sumOpen)}` : 'Alles erledigt', '#/mehr')}
    <a class="btn block" href="#/schaden/neu" style="margin-bottom:12px">+ Schaden erfassen</a>
    ${open.length ? `<h2>Offen</h2><div class="card list">${open.map(damageLine).join('')}</div>` : ''}
    ${done.length ? `<h2>Erledigt</h2><div class="card list">${done.map(damageLine).join('')}</div>` : ''}
    ${!damages.length ? `<div class="card empty">Keine Schäden – so soll es sein. 👍</div>` : ''}`;
}

function viewDamage(id) {
  const isNew = !id || id.startsWith('neu');
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  let d;
  if (isNew) {
    const r = q.get('r') ? rentals.find(x => x.id === q.get('r')) : null;
    d = { datum: dayKey(new Date()), itemId: r?.itemId || q.get('i') || items[0]?.id || '', rentalId: r?.id || '', mieterName: r?.mieter?.name || '', status: 'offen', zahlt: r ? 'mieter' : 'offen', photos: [], kosten: '' };
  } else d = damages.find(x => x.id === id);
  if (!d) { app.innerHTML = header('Nicht gefunden', '', '#/schaeden'); return; }
  const r = d.rentalId ? rentals.find(x => x.id === d.rentalId) : null;
  const feeAdded = r && (r.gebuehren || []).some(f => f.damageId === id);
  let photos = [...(d.photos || [])];
  const itemRentals = rentals.filter(x => x.itemId === d.itemId && !x.storniert).slice(-15).reverse();
  app.innerHTML = `${header(isNew ? 'Schaden erfassen' : 'Schaden', r ? esc(r.mieter?.name || '') : '', r ? '#/miete/' + r.id : '#/schaeden')}
  <form class="card" id="df">
    <label>Artikel</label><select name="itemId">${items.map(i => `<option value="${i.id}" ${d.itemId === i.id ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}</select>
    <label>Gehört zu Miete (optional)</label><select name="rentalId"><option value="">– keine / unbekannt –</option>${itemRentals.map(x => `<option value="${x.id}" ${d.rentalId === x.id ? 'selected' : ''}>${esc(x.mieter?.name || '?')} · ${fmtShort(x.von)}</option>`).join('')}</select>
    <label>Was ist kaputt?</label><textarea name="beschreibung" rows="3" required placeholder="z. B. Rücklicht links gebrochen, Plane eingerissen">${esc(d.beschreibung)}</textarea>
    <div class="grid2"><div><label>Datum</label><input name="datum" type="date" value="${esc(d.datum)}"></div><div><label>Kosten (€, geschätzt)</label><input name="kosten" inputmode="decimal" value="${esc(d.kosten)}"></div></div>
    <div class="grid2"><div><label>Wer zahlt?</label><select name="zahlt">${Object.entries(DAMAGE_PAYER).map(([k, v]) => `<option value="${k}" ${(d.zahlt || 'offen') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <div><label>Status</label><select name="status">${Object.entries(DAMAGE_STATUS).map(([k, v]) => `<option value="${k}" ${(d.status || 'offen') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div>
    <label>Versicherung / Aktenzeichen (optional)</label><input name="versicherung" value="${esc(d.versicherung)}" placeholder="z. B. Schadennummer">
    <label>Fotos (max. 4)</label>
    <div class="photos" id="dPh">${photos.map((p, i) => `<div class="photo"><img src="${p}" data-full alt=""><button type="button" class="x" data-delp="${i}">✕</button></div>`).join('')}<label class="upload"><span class="big">📷</span>Foto<span class="tiny">Kamera oder Galerie</span><input type="file" accept="image/*" multiple id="dIn"></label></div>
    <label>Notiz</label><textarea name="notiz" rows="2">${esc(d.notiz)}</textarea>
    <div class="btns"><button class="btn grow">Speichern</button>${isNew ? '' : '<button type="button" class="btn danger" id="delD">Löschen</button>'}</div>
  </form>
  ${isNew ? '' : `<div class="card"><h3>Weiter mit …</h3>
    ${r && !r.closed && d.zahlt === 'mieter' ? (feeAdded ? '<p class="small">✓ Als Gebühr bei der Miete eingetragen – wird mit der Kaution verrechnet.</p>' : `<button class="btn sec block" id="toFee">Dem Mieter als Gebühr berechnen (${eur(d.kosten)})</button>`) : ''}
    ${r && r.closed && d.zahlt === 'mieter' ? '<p class="small muted">Die Miete ist schon abgeschlossen – Betrag bitte direkt mit dem Mieter klären.</p>' : ''}
    ${d.expenseId ? `<p class="small">✓ Als Ausgabe erfasst. <a href="#/ausgabe/${d.expenseId}">Ansehen</a></p>` : `<a class="btn ghost block" style="margin-top:8px" href="#/ausgabe/neu?k=reparatur&i=${d.itemId}&b=${num(d.kosten)}&n=${encodeURIComponent('Schaden: ' + (d.beschreibung || '').slice(0, 60))}&d=${id}">Reparaturkosten als Ausgabe erfassen</a>`}
    ${r?.mieter?.telefon ? `<a class="btn wa block" style="margin-top:8px" target="_blank" href="${waLink(r.mieter.telefon, `Hallo ${r.mieter.name?.split(' ')[0] || ''}, bei der Rückgabe von ${r.item?.name} ist mir folgender Schaden aufgefallen: ${d.beschreibung}. Geschätzte Kosten: ${eur(d.kosten)}. Lass uns kurz sprechen.`)}">Mieter per WhatsApp informieren</a>` : ''}
  </div>`}`;
  const f = $('#df');
  f.addEventListener('input', () => dirty = true);
  const redraw = () => { $$('#dPh .photo').forEach(e => e.remove()); $('#dPh').insertAdjacentHTML('afterbegin', photos.map((p, i) => `<div class="photo"><img src="${p}" data-full alt=""><button type="button" class="x" data-delp="${i}">✕</button></div>`).join('')); };
  $('#dIn').onchange = async (e) => {
    for (const file of [...e.target.files]) {
      if (photos.length >= 4) { toast('Maximal 4 Fotos', 'err'); break; }
      photos.push(await compressImage(file, { max: 900, quality: 0.55 }));
    }
    e.target.value = ''; redraw(); dirty = true;
  };
  app.onclick = async (e) => {
    const img = e.target.closest('img[data-full]'); if (img) return openViewer(img.src, 'Schadensfoto');
    const dp = e.target.closest('[data-delp]'); if (dp) { photos.splice(+dp.dataset.delp, 1); redraw(); dirty = true; return; }
    if (e.target.id === 'toFee') {
      await store.update('rentals', r.id, { gebuehren: [...(r.gebuehren || []), { typ: 'schaden', betrag: num(d.kosten), notiz: (d.beschreibung || '').slice(0, 80), damageId: id }], updatedAt: nowIso() });
      toast('Als Gebühr eingetragen', 'ok');
    }
  };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const rid = f.rentalId.value, rr = rentals.find(x => x.id === rid);
    const data = { itemId: f.itemId.value, itemName: itemById(f.itemId.value)?.name || d.itemName || '', rentalId: rid, mieterName: rr?.mieter?.name || '', beschreibung: f.beschreibung.value.trim(), datum: f.datum.value, kosten: num(f.kosten.value), zahlt: f.zahlt.value, status: f.status.value, versicherung: f.versicherung.value.trim(), notiz: f.notiz.value.trim(), photos, expenseId: d.expenseId || null, updatedAt: nowIso() };
    if (JSON.stringify(data).length > 950000) return toast('Fotos zu groß – bitte eins entfernen', 'err');
    const nid = isNew ? store.newId() : id;
    try { await store.set('damages', nid, { createdAt: d.createdAt || nowIso(), ...data }); } catch (err) { return toast('Fehler: ' + err.message, 'err'); }
    dirty = false; toast('Gespeichert', 'ok');
    if (isNew) location.hash = '#/schaden/' + nid; else render(true);
  };
  $('#delD') && ($('#delD').onclick = async () => { if (!confirm('Schaden löschen?')) return; await store.del('damages', id); location.hash = '#/schaeden'; });
}
