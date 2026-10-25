// ============================================================
//  MIETBOX – Seite für den Mieter (per Link, ohne Anmeldung)
// ============================================================
import {
  $, $$, esc, num, eur, nowIso, fmtDT, fmtShort, rentalDays, toast, PHOTO_KINDS, LICENSE_CLASSES,
  rentalStatus, feesTotal, waLink, requiredDocs, docsComplete, COND_KINDS, contractHtml, downloadContract, compressImage, SignaturePad, initStore, isDemo, FEE_TYPES,
} from './common.js?v=6';

const app = $('#app');
const id = new URLSearchParams(location.search).get('id');
let store, r = null, step = 0, dirty = false, busy = false;

boot();
async function boot() {
  if (!id) return fail('Dieser Link ist unvollständig. Bitte frag beim Vermieter nach einem neuen Link.');
  try { store = await initStore(); } catch (e) { return fail('Keine Verbindung. Bitte Internet prüfen und Seite neu laden.'); }
  if (isDemo) $('#banner').innerHTML = `<div class="demo-banner">Demo-Modus</div>`;
  store.watchOne('rentals', id, (doc) => {
    const prev = r; r = doc;
    if (!r) return fail('Diese Miete wurde nicht gefunden oder ist nicht mehr aktiv.');
    // nicht neu zeichnen, während der Mieter tippt – außer bei wichtigen Änderungen
    const important = !prev || prev.lockReleased !== r.lockReleased || prev.closed !== r.closed || prev.lockCode !== r.lockCode || !!prev.signature !== !!r.signature || prev.mietePaid !== r.mietePaid || prev.kautionStatus !== r.kautionStatus || prev.renterPickupAt !== r.renterPickupAt || prev.renterReturnAt !== r.renterReturnAt || prev.openRequestAt !== r.openRequestAt;
    if (!dirty || important) render();
  }, () => fail('Diese Miete wurde nicht gefunden oder der Link ist abgelaufen.'));
}

function fail(msg) { app.innerHTML = `<div class="center-screen"><div class="card"><h2>Hoppla</h2><p class="muted">${esc(msg)}</p></div></div>`; }
async function save(patch, msg) {
  try { await store.update('rentals', id, { ...patch, updatedAt: nowIso() }); if (msg) toast(msg, 'ok'); return true; }
  catch (e) { console.error(e); toast('Speichern hat nicht geklappt – bitte nochmal versuchen', 'err'); return false; }
}

const V = () => r.vermieter || {};
let notify = null; // Text für "Vermieter Bescheid geben"
const me = () => (r.mieter?.name || '').trim();
const toOwner = (text) => waLink(V().telefon, `Hallo ${(V().name || '').split(' ')[0]}, ${text}${me() ? ' – ' + me() : ''}`);
const needsLicense = () => requiredDocs(r).includes('fuehrerschein');
const docKinds = () => requiredDocs(r);
const localPrev = {}; // gerade hochgeladene Ausweisfotos (nur Vorschau in dieser Sitzung)
const dataOk = () => { const m = r.mieter || {}; return m.name && m.adresse && m.telefon && m.geburtsdatum && (!needsLicense() || m.fuehrerschein); };
const docsOk = () => docsComplete(r);

function head() {
  return `<header class="top"><div class="logo">M</div><div class="title"><h1>Deine Miete</h1><div class="small muted">${esc(r.item?.name || '')} bei ${esc(V().name || 'deinem Vermieter')}</div></div></header>
  <div class="card tight"><dl class="kv">
    <dt>Abholung</dt><dd>${fmtDT(r.von)}</dd><dt>Rückgabe</dt><dd>${fmtDT(r.bis)}</dd>
    <dt>Miete</dt><dd>${eur(r.preis)} <span class="muted small">(${rentalDays(r.von, r.bis)} Tag${rentalDays(r.von, r.bis) > 1 ? 'e' : ''})</span></dd>
    <dt>Kaution</dt><dd>${eur(r.kaution)}</dd>
    ${num(r.cfg?.selbstbeteiligung) ? `<dt>Selbstbeteiligung</dt><dd>${eur(r.cfg.selbstbeteiligung)} <span class="muted small">je Schaden</span></dd>` : ''}
  </dl></div>`;
}

function render() {
  dirty = false;
  if (r.closed) return renderClosed();
  if (!r.signature) return renderWizard();
  renderMain();
}

// ---------- Schritt 1–3: Daten, Ausweis, Vertrag ----------
function renderWizard() {
  if (step === 0) step = !dataOk() ? 1 : !docsOk() ? 2 : 3;
  const m = r.mieter || {};
  let body = '';
  if (step === 1) body = `
    <div class="card"><h2>1. Deine Daten</h2><p class="small muted">Diese Angaben kommen in den Mietvertrag.</p>
    <form id="df">
      <label>Vor- und Nachname</label><input name="name" required value="${esc(m.name)}" autocomplete="name">
      <label>Adresse</label><input name="adresse" required value="${esc(m.adresse)}" placeholder="Straße Nr., PLZ Ort" autocomplete="street-address">
      <label>Handynummer</label><input name="telefon" type="tel" required value="${esc(m.telefon)}" autocomplete="tel">
      <label>E-Mail (optional, für den Vertrag)</label><input name="email" type="email" value="${esc(m.email)}" autocomplete="email">
      <div class="grid2"><div><label>Geburtsdatum</label><input name="geburtsdatum" type="date" required value="${esc(m.geburtsdatum)}"></div>
      <div><label>Führerscheinklasse</label><select name="fuehrerschein" ${needsLicense() ? 'required' : ''}><option value="">bitte wählen</option>${LICENSE_CLASSES.map(c => `<option ${m.fuehrerschein === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div></div>
      ${needsLicense() ? `<p class="small muted">Tipp: Mit Klasse B darf das Gespann meist höchstens 3.500 kg wiegen (Auto + Anhänger), bei schwereren Anhängern brauchst du B96 oder BE.</p>` : ''}
      <div class="btns"><button class="btn block">Weiter</button></div>
    </form></div>`;
  if (step === 2) body = `
    <div class="card"><h2>2. Ausweis${needsLicense() ? ' & Führerschein' : ''}</h2>
      <p class="small">Zur Absicherung brauchen wir ein Foto. Die Fotos bekommen den Aufdruck „KOPIE“, werden nur für diesen Mietvertrag genutzt und spätestens <b>${num(r.cfg?.loeschTage) || 30} Tage</b> nach Mietende gelöscht. Angaben, die nicht gebraucht werden (z. B. Zugangsnummer), darfst du abdecken.</p>
      <label class="check"><input type="checkbox" id="consent" ${r.consent ? 'checked' : ''}> Ich bin einverstanden, dass Fotos meines Ausweises${needsLicense() ? ' und Führerscheins' : ''} für diesen Mietvertrag gespeichert werden.</label>
      <div class="photos">${docKinds().map(k => localPrev[k]
        ? `<label class="photo" style="cursor:pointer"><img src="${localPrev[k]}" alt=""><div class="cap">✅ ${PHOTO_KINDS[k]}<br>tippen zum Ersetzen</div><input type="file" accept="image/*" data-up="${k}" hidden></label>`
        : `<label class="upload ${r.docs?.[k] ? 'done' : ''}"><span class="big">${r.docs?.[k] ? '✅' : '📷'}</span>${PHOTO_KINDS[k]}<span class="tiny">${r.docs?.[k] ? 'vorhanden' : 'Kamera oder Galerie'}</span><input type="file" accept="image/*" data-up="${k}"></label>`).join('')}</div>
      <div class="btns"><button class="btn ghost" id="back">Zurück</button><button class="btn grow" id="next" ${docsOk() ? '' : 'disabled'}>Weiter</button></div>
    </div>`;
  if (step === 3) body = `
    <div class="card"><h2>3. Vertrag unterschreiben</h2>
      <p class="small muted">Bitte lies den Vertrag durch (scrollen) und unterschreibe dann unten mit dem Finger.</p>
      ${contractHtml(r)}
      <label class="check"><input type="checkbox" id="accept"> Ich habe den Mietvertrag gelesen und bin einverstanden.</label>
      <div class="sig-wrap"><canvas class="sig" id="sig"></canvas><div class="base"></div><div class="hint">Hier mit dem Finger unterschreiben</div></div>
      <div class="btns"><button class="btn ghost" id="back">Zurück</button><button class="btn ghost" id="clr">Löschen</button><button class="btn grow" id="signBtn">Verbindlich unterschreiben</button></div>
    </div>`;
  app.innerHTML = head() + `<div class="steps">${[1, 2, 3].map(i => `<div class="${i <= step ? 'on' : ''}"></div>`).join('')}</div>` + body;

  if (step === 1) {
    const f = $('#df'); f.addEventListener('input', () => dirty = true);
    f.onsubmit = async (e) => {
      e.preventDefault();
      const mieter = { ...(r.mieter || {}) }; for (const k of ['name', 'adresse', 'telefon', 'email', 'geburtsdatum', 'fuehrerschein']) mieter[k] = f[k].value.trim();
      const age = (Date.now() - new Date(mieter.geburtsdatum)) / (365.25 * 864e5);
      if (age < 18) return toast('Mieten ist erst ab 18 Jahren möglich', 'err');
      if (await save({ mieter })) { step = docsOk() ? 3 : 2; window.scrollTo(0, 0); render(); }
    };
  }
  if (step === 2) {
    $('#consent').onchange = (e) => save({ consent: e.target.checked, consentAt: e.target.checked ? nowIso() : null });
    $('#back').onclick = () => { step = 1; render(); };
    $('#next').onclick = () => { step = 3; window.scrollTo(0, 0); render(); };
    $$('[data-up]').forEach(inp => inp.onchange = async () => {
      if (!$('#consent').checked) { inp.value = ''; return toast('Bitte erst das Einverständnis anhaken', 'err'); }
      const kind = inp.dataset.up, file = inp.files[0]; if (!file || busy) return;
      busy = true; toast('Foto wird hochgeladen …');
      try {
        const data = await compressImage(file, { max: 1600, quality: 0.7, watermark: `nur für Mietvertrag ${V().name || ''} · ${new Date().toLocaleDateString('de-DE')}` });
        await store.addPhoto(id, { kind, data, by: 'mieter', createdAt: nowIso() });
        localPrev[kind] = data;
        await save({ ['docs.' + kind]: nowIso() }, 'Foto gespeichert ✓');
        render();
      } catch (e) { toast('Upload fehlgeschlagen – bitte nochmal', 'err'); }
      busy = false;
    });
  }
  if (step === 3) {
    const pad = new SignaturePad($('#sig'));
    $('#sig').addEventListener('pointerdown', () => { dirty = true; $('.sig-wrap .hint')?.remove(); });
    $('#clr').onclick = () => pad.clear();
    $("#back").onclick = () => { step = docsOk() ? 1 : 2; render(); };
    $('#signBtn').onclick = async () => {
      if (!$('#accept').checked) return toast('Bitte bestätige, dass du den Vertrag gelesen hast', 'err');
      if (pad.isEmpty()) return toast('Bitte unterschreiben', 'err');
      if (!dataOk() || !docsOk()) { step = 0; return render(); }
      $('#signBtn').disabled = true;
      notify = `ich habe den Mietvertrag für ${r.item?.name || 'die Miete'} (${fmtShort(r.von)}) gerade unterschrieben.`;
      if (await save({ signature: pad.toDataURL(), signedAt: nowIso(), signedBy: 'link' }, 'Danke! Vertrag unterschrieben ✓')) window.scrollTo(0, 0);
      else { notify = null; $('#signBtn').disabled = false; }
    };
  }
}

// ---------- Nach der Unterschrift ----------
function renderMain() {
  const v = V(), lockT = r.item?.lockType || 'code';
  const picked = r.pickedUpAt || r.renterPickupAt, returned = r.returnedAt || r.renterReturnAt;
  const kautionIn = ['erhalten', 'zurueck', 'einbehalten'].includes(r.kautionStatus) || r.kautionStatus === 'keine';
  const toPay = (r.mietePaid ? 0 : num(r.preis)) + (kautionIn ? 0 : num(r.kaution));
  const pc = r.renterPhotos || {};
  const s = rentalStatus(r);

  let lock = '';
  if (!picked) {
    if (lockT === 'code') lock = r.lockReleased && r.lockCode
      ? `<p>Dein Code für das Schloss:</p><div class="code-big">${esc(r.lockCode)}</div><p class="small muted">Gültig ${fmtShort(r.von)} – ${fmtShort(r.bis)}. Bitte nach der Rückgabe das Schloss wieder verschließen.</p>`
      : `<div class="alert teal">⏳ <span>Sobald alles passt, schaltet ${esc(v.name || 'dein Vermieter')} hier deinen Schloss-Code frei. Diese Seite aktualisiert sich automatisch.</span></div>`;
    else if (lockT === 'fern') lock = r.lockReleased
      ? `<div class="alert teal">🔓 <span><b>Das Schloss ist offen.</b> Du kannst den ${esc(r.item?.name || 'Mietgegenstand')} jetzt mitnehmen.</span></div>`
      : r.openRequestAt
        ? `<div class="alert teal">⏳ <span>Anfrage gesendet (${fmtShort(r.openRequestAt)}). ${esc(v.name || 'Dein Vermieter')} öffnet gleich aus der Ferne.</span></div>${v.telefon ? `<a class="btn ghost block" href="tel:${esc(v.telefon)}">📞 Anrufen</a>` : ''}`
        : `<p class="small">Wenn du vor Ort bist, tippe hier – ${esc(v.name || 'dein Vermieter')} bekommt eine WhatsApp und öffnet das Schloss.</p>${v.telefon ? `<a class="btn block" id="openReq" target="_blank" href="${toOwner(`ich bin jetzt am ${r.item?.name || 'Mietgegenstand'} und warte auf die Öffnung.`)}">📍 Ich bin da – bitte öffnen</a>` : `<button class="btn block" id="openReq">📍 Ich bin da – bitte öffnen</button>`}`;
    else lock = `<p class="small">Die Übergabe machst du persönlich mit ${esc(v.name || 'deinem Vermieter')}${v.telefon ? ` (<a href="tel:${esc(v.telefon)}">${esc(v.telefon)}</a>)` : ''}.</p>`;
  }

  const photoBox = (kind, title, hint, doneAt, btnId, btnText) => `
    <div class="card"><h2>${title} ${doneAt ? `<span class="badge green">${fmtShort(doneAt)}</span>` : ''}</h2>
      ${doneAt ? `<p class="small muted">Danke, ist gespeichert. ${pc[kind] || 0} Foto(s).</p>` : `
      <p class="small">${hint}</p>
      <div class="photos" id="rp-${kind}"><label class="upload ${pc[kind] >= 2 ? 'done' : ''}"><span class="big">📷</span>Foto hinzufügen<span class="tiny">${pc[kind] || 0} gespeichert</span><input type="file" accept="image/*" multiple data-ph="${kind}"></label></div>
      <div class="btns"><button class="btn block" id="${btnId}" ${(pc[kind] || 0) >= 2 ? '' : 'disabled'}>${btnText}</button></div>
      ${(pc[kind] || 0) < 2 ? '<p class="tiny muted">Mindestens 2 Fotos nötig.</p>' : ''}`}
    </div>`;

  app.innerHTML = head() + `
    ${notify && v.telefon ? `<div class="card" style="border-color:#25d366"><p style="margin-top:0"><b>Gib ${esc((v.name || 'deinem Vermieter').split(' ')[0])} kurz Bescheid:</b></p><a class="btn wa block" id="notifyBtn" target="_blank" href="${toOwner(notify)}">📲 Per WhatsApp Bescheid geben</a></div>` : ''}
    <div class="alert ${s.key === 'ueberfaellig' ? 'red' : 'teal'}">✅ <span>Vertrag unterschrieben am ${fmtShort(r.signedAt)}. ${s.key === 'ueberfaellig' ? '<b>Die Mietzeit ist abgelaufen – bitte zurückbringen oder dich melden.</b>' : ''}</span></div>

    <div class="card"><h2>💶 Bezahlen</h2>
      <dl class="kv"><dt>Miete</dt><dd>${eur(r.preis)} ${r.mietePaid ? '<span class="badge green">bezahlt</span>' : '<span class="badge amber">offen</span>'}</dd>
      <dt>Kaution</dt><dd>${eur(r.kaution)} ${kautionIn ? '<span class="badge green">ok</span>' : '<span class="badge amber">offen</span>'}</dd></dl>
      ${toPay > 0 ? `${v.paypalMe && r.zahlungsart === 'paypal' ? `<div class="btns"><a class="btn pp block" target="_blank" rel="noopener" href="https://paypal.me/${encodeURIComponent(v.paypalMe)}/${toPay.toFixed(2)}EUR">Mit PayPal zahlen (${eur(toPay)})</a></div>` : ''}<p class="small muted">${v.paypalMe && r.zahlungsart === 'paypal' ? 'Oder bar bei der Abholung.' : 'Bezahlung in bar bei der Abholung.'} Die Kaution bekommst du nach ordnungsgemäßer Rückgabe zurück.</p>` : '<p class="small muted">Alles bezahlt – danke!</p>'}
    </div>

    ${!picked ? `<div class="card"><h2>🔑 Abholung</h2>${lock}</div>` : ''}

    ${(r.lockReleased || lockT === 'persoenlich' || picked) ? photoBox('abholung', '📸 Zustand bei Abholung', 'Bevor du losfährst: Bitte mach 2–4 Fotos von allen Seiten und der Ladefläche. Das schützt dich, falls schon Schäden da sind.', picked, 'pickBtn', 'Abgeholt – Fotos gemacht ✓') : ''}

    ${picked ? `
      <div class="card"><h2>⚠️ Wichtig unterwegs</h2><ul class="small" style="margin:0;padding-left:18px">
        <li>Ladung sichern, zulässiges Gewicht beachten</li><li>Schäden oder Unfall sofort melden${v.telefon ? `: <a href="tel:${esc(v.telefon)}">${esc(v.telefon)}</a>` : ''}</li>
        <li>Rückgabe bis <b>${fmtDT(r.bis)}</b>, besenrein</li></ul></div>
      ${photoBox('rueckgabe', '↩️ Rückgabe', 'Bei der Rückgabe: Bitte wieder 2–4 Fotos von allen Seiten und der Ladefläche machen' + (lockT === 'code' ? ' und danach das Schloss verschließen.' : '.'), returned, 'retBtn', 'Zurückgegeben ✓')}` : ''}

    ${returned ? `<div class="alert blue">🧾 <span>Danke! ${esc(v.name || 'Dein Vermieter')} prüft jetzt den Zustand und zahlt dir die Kaution zurück.</span></div>` : ''}

    <div class="card"><h2>📄 Dein Vertrag</h2><button class="btn sec block" id="pdf">Mietvertrag als PDF herunterladen</button>
      ${v.telefon ? `<div class="btns"><a class="btn ghost grow" href="tel:${esc(v.telefon)}">📞 ${esc(v.name || 'Vermieter')} anrufen</a></div>` : ''}</div>`;

  loadCondPhotos();
  $('#openReq') && ($('#openReq').onclick = () => save({ openRequestAt: nowIso() }, 'Anfrage gesendet'));
  $('#pdf').onclick = async () => { toast('PDF wird erstellt …'); try { await downloadContract(r, []); } catch (e) { toast(e.message, 'err'); } };
  $('#pickBtn') && ($('#pickBtn').onclick = () => { notify = `ich habe ${r.item?.name || 'den Mietgegenstand'} abgeholt, die Fotos sind hochgeladen.`; save({ renterPickupAt: nowIso() }, 'Gute Fahrt! 🚗'); });
  $('#retBtn') && ($('#retBtn').onclick = () => { notify = `ich habe ${r.item?.name || 'den Mietgegenstand'} zurückgebracht, die Rückgabe-Fotos sind hochgeladen.`; save({ renterReturnAt: nowIso() }, 'Danke für die Rückgabe!'); });
  $('#notifyBtn') && ($('#notifyBtn').onclick = () => setTimeout(() => { notify = null; render(); }, 500));
  $$('[data-ph]').forEach(inp => inp.onchange = async () => {
    const kind = inp.dataset.ph, files = [...inp.files]; if (!files.length || busy) return;
    busy = true; toast(`${files.length} Foto(s) werden hochgeladen …`);
    let n = r.renterPhotos?.[kind] || 0;
    for (const file of files) {
      try { const data = await compressImage(file); await store.addPhoto(id, { kind, data, by: 'mieter', createdAt: nowIso() }); n++; }
      catch (e) { toast('Ein Foto ging nicht – bitte nochmal', 'err'); }
    }
    await save({ ['renterPhotos.' + kind]: n }, 'Fotos gespeichert ✓');
    busy = false; render();
  });
}

function renderClosed() {
  const fees = r.gebuehren || [];
  const back = ['erhalten', 'zurueck', 'einbehalten'].includes(r.kautionStatus) ? num(r.kaution) - feesTotal(r) - (r.mietePaid === 'kaution' ? num(r.preis) : 0) : 0;
  app.innerHTML = head() + `
    ${r.storniert ? `<div class="card"><h2>Miete storniert</h2><p class="muted">Diese Miete findet nicht statt. Bei Fragen melde dich bei ${esc(V().name || 'deinem Vermieter')}.</p></div>` : ''}
    <div class="card" ${r.storniert ? 'hidden' : ''}><h2>✅ Miete abgeschlossen</h2><p>Danke fürs Mieten bei ${esc(V().name || 'uns')}!</p>
    ${fees.length ? `<h3>Gebühren</h3>${fees.map(f => `<div class="fee-row"><div class="grow">${FEE_TYPES[f.typ] || f.typ}${f.notiz ? ` <span class="small muted">– ${esc(f.notiz)}</span>` : ''}</div><b>${eur(f.betrag)}</b></div>`).join('')}` : ''}
    ${r.kautionStatus === 'zurueck' ? `<p>Kaution zurück: <b>${eur(Math.max(0, back))}</b></p>` : ''}
    <button class="btn sec block" id="pdf">Mietvertrag als PDF</button></div>`;
  $('#pdf').onclick = async () => { try { await downloadContract(r, []); } catch (e) { toast(e.message, 'err'); } };
}

let condToken = 0;
async function loadCondPhotos() {
  const my = ++condToken;
  try {
    const ps = await store.listPhotos(id, COND_KINDS);
    if (my !== condToken) return;
    ps.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    for (const p of ps) {
      const host = $('#rp-' + p.kind); if (!host) continue;
      const el = document.createElement('div'); el.className = 'photo';
      el.innerHTML = `<img src="${p.data}" alt=""><div class="cap">${fmtShort(p.createdAt)}</div>`;
      el.querySelector('img').onclick = () => { const v = document.createElement('div'); v.className = 'viewer'; v.innerHTML = `<img src="${p.data}" alt="">`; v.onclick = () => v.remove(); document.body.appendChild(v); };
      host.insertBefore(el, host.querySelector('.upload'));
    }
  } catch (e) { console.warn('Fotos konnten nicht geladen werden', e); }
}
