// ============================================================
//  MIETBOX – gemeinsamer Code (Vermieter-App + Mieter-Seite)
// ============================================================
import { firebaseConfig } from './config.js';

export const APP_NAME = 'Mietbox';
const FB_VERSION = '10.12.2';

// ---------- kleine Helfer ----------
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? 0 : n; };
export const eur = (n) => (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
export const nowIso = () => new Date().toISOString();
const pad = (n) => String(n).padStart(2, '0');
export const toLocalInput = (d) => { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const dayKey = (d) => { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const fmtDate = (d) => d ? new Date(d).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }) : '–';
export const fmtDT = (d) => d ? new Date(d).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' Uhr' : '–';
export const fmtShort = (d) => d ? new Date(d).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–';
export const rentalDays = (von, bis) => Math.max(1, Math.ceil((new Date(bis) - new Date(von)) / 864e5 - 0.0001));
export const randomCode = (len = 4) => Array.from({ length: len }, () => Math.floor(Math.random() * 10)).join('');

export function toast(msg, type = '') {
  let box = $('#toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = 'toast ' + type; t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.classList.add('hide'), 2600);
  setTimeout(() => t.remove(), 3100);
}

// ---------- Konstanten ----------
export const ITEM_TYPES = { anhaenger: 'Anhänger', werkzeug: 'Werkzeug', roller: 'E-Roller / E-Scooter', sonstiges: 'Sonstiges' };
export const LOCK_TYPES = {
  fern: 'Ich öffne das Schloss (aus der Ferne / vor Ort)',
  code: 'Code-Schloss (Mieter bekommt einen Zeit-Code)',
  persoenlich: 'Persönliche Übergabe',
};
export const DEFAULT_CHECKLIST = {
  anhaenger: 'Beleuchtung geprüft\nReifen / Luftdruck ok\nKupplung & Stützrad ok\nPlane / Netz vorhanden\nSpanngurte vorhanden\nStecker-Adapter 7/13-polig\nBordwände & Verschlüsse ok\nSauber & besenrein',
  werkzeug: 'Funktion geprüft\nZubehör vollständig\nKoffer / Tasche vorhanden\nSauber',
  roller: 'Akku geladen\nLicht & Bremsen ok\nLadegerät dabei\nKeine Kratzer / Schäden\nSauber',
  sonstiges: 'Vollständig\nFunktion geprüft\nSauber',
};
export const PHOTO_KINDS = {
  ausweis_vorne: 'Ausweis Vorderseite',
  ausweis_hinten: 'Ausweis Rückseite',
  fuehrerschein: 'Führerschein',
  fuehrerschein2: 'Führerschein weiterer Fahrer',
  abholung: 'Zustand bei Abholung',
  rueckgabe: 'Zustand bei Rückgabe',
};
export const ID_KINDS = ['ausweis_vorne', 'ausweis_hinten', 'fuehrerschein', 'fuehrerschein2'];
export const COND_KINDS = ['abholung', 'rueckgabe'];
// Welche Ausweisfotos für diese Miete nötig sind
export function requiredDocs(r) {
  const k = ['ausweis_vorne', 'ausweis_hinten'];
  if (r.item?.typ === 'anhaenger' || r.item?.typ === 'roller') k.push('fuehrerschein');
  if (r.fahrer2?.name) k.push('fuehrerschein2');
  return k;
}
export const docsComplete = (r) => !!r.consent && requiredDocs(r).every(k => r.docs?.[k]);
export const FEE_TYPES = { reinigung: 'Reinigung', verspaetung: 'Verspätung', schaden: 'Schaden', tank: 'Fehlendes Zubehör', sonstiges: 'Sonstiges' };
export const LICENSE_CLASSES = ['B', 'B96', 'BE', 'C1E / CE', 'Klasse 3 (alt)', 'Nicht nötig'];

export const DEFAULT_TERMS = `## 1. Mietgegenstand
Der Vermieter überlässt dem Mieter den oben genannten Mietgegenstand samt Zubehör in verkehrssicherem und sauberem Zustand. Zustand und Zubehör werden bei der Übergabe per Checkliste und Fotos festgehalten. Der Mieter prüft den Mietgegenstand vor Fahrtantritt (z. B. Beleuchtung, Reifen, Kupplung) und meldet Mängel sofort.

## 2. Mietzeit und Rückgabe
Der Mietgegenstand ist zum vereinbarten Zeitpunkt am vereinbarten Ort zurückzugeben. Nach einer Kulanzzeit von {KULANZ} Minuten werden für jede angefangene Stunde Verspätung {VERSPAETUNG} berechnet, höchstens jedoch der Tagesmietpreis je angefangenem Tag. Eine Verlängerung ist nur nach vorheriger Absprache möglich.

## 3. Miete, Zahlung und Kaution
Die Miete ist spätestens bei der Übergabe fällig. Die Kaution sichert alle Ansprüche des Vermieters aus diesem Vertrag. Sie wird nach ordnungsgemäßer Rückgabe zurückgezahlt. Berechtigte Forderungen (z. B. Reinigung, Verspätung, Schäden, fehlendes Zubehör) dürfen mit der Kaution verrechnet werden.

## 4. Fahrer, Fahrerlaubnis und Nutzung
Den Mietgegenstand darf ausschließlich der Mieter{FAHRER} nutzen bzw. mit einem Zugfahrzeug bewegen. Jeder Fahrer muss eine gültige Fahrerlaubnis für das Gespann aus Zugfahrzeug und Anhänger besitzen. Zulässiges Gesamtgewicht, Nutzlast, Stützlast und die Anhängelast des Zugfahrzeugs sind zu beachten, die Ladung ist vorschriftsmäßig zu sichern. Die Weitervermietung oder Überlassung an andere Personen, Fahrten ins Ausland ohne Zustimmung sowie der Transport gefährlicher Güter sind nicht erlaubt.

## 5. Reinigung
Der Mietgegenstand ist besenrein zurückzugeben. Bei starker Verschmutzung wird eine Reinigungspauschale von {REINIGUNG} berechnet.

## 6. Schäden, Unfall, Bußgelder
Schäden, Unfälle und Diebstahl sind dem Vermieter sofort zu melden; bei Unfall oder Diebstahl ist zusätzlich die Polizei zu verständigen. Der Mieter haftet für Schäden und Verlust während der Mietzeit, soweit er sie zu vertreten hat. Bußgelder, Maut und Gebühren während der Mietzeit trägt der Mieter. Fragt eine Behörde wegen eines Verstoßes oder Unfalls während der Mietzeit an, darf der Vermieter Name und Anschrift des Mieters mitteilen.

{GPS}## 8. Datenschutz und Aufbewahrung
Die Daten des Mieters werden zur Abwicklung dieses Vertrags gespeichert. Fotos von Ausweis und Führerschein werden nur mit ausdrücklicher Einwilligung erstellt, als Kopie gekennzeichnet und {LOESCHTAGE} Tage nach Abschluss der Miete automatisch gelöscht; nicht benötigte Angaben dürfen vor dem Foto abgedeckt werden. Zustandsfotos werden nach {FOTOTAGE} Tagen gelöscht. Vertrag und Abrechnung werden im Rahmen der gesetzlichen Aufbewahrungspflichten aufbewahrt.

## 9. Fotos als Nachweis
Die bei Abholung und Rückgabe mit Datum und Uhrzeit aufgenommenen Fotos dienen beiden Seiten als Nachweis über den Zustand des Mietgegenstands.

## 10. Sonstiges
Änderungen und Absprachen sind in Textform (z. B. WhatsApp oder E-Mail) ausreichend. Sollte eine Bestimmung unwirksam sein, bleibt der Vertrag im Übrigen wirksam.`;

const GPS_TERM = `## 7. GPS-Ortung
Der Mietgegenstand ist zum Schutz vor Diebstahl mit einer GPS-Ortung ausgestattet. Der Mieter wurde darüber informiert. Der Standort wird nur bei Verdacht auf Diebstahl oder Unterschlagung sowie bei Überschreitung der Mietzeit ausgewertet.

`;

export const DEFAULT_SETTINGS = {
  name: '', adresse: '', telefon: '', email: '', paypalMe: '',
  reinigung: 30, verspaetungStunde: 5, kulanzMinuten: 30, loeschTage: 90, fotoTage: 365,
  terms: '', ownerSignature: null,
};

// ---------- Status einer Miete ----------
export function rentalStatus(r, now = new Date()) {
  if (r.storniert) return { key: 'storniert', label: 'Storniert', cls: 'grey' };
  if (r.closed) return { key: 'abgeschlossen', label: 'Abgeschlossen', cls: 'grey' };
  const picked = r.pickedUpAt || r.renterPickupAt;
  const returned = r.returnedAt || r.renterReturnAt;
  if (returned) return { key: 'zurueck', label: 'Zurück – abrechnen', cls: 'blue' };
  if (picked) {
    if (now > new Date(r.bis)) return { key: 'ueberfaellig', label: 'Überfällig!', cls: 'red' };
    return { key: 'aktiv', label: 'Unterwegs', cls: 'green' };
  }
  if (r.signature) return { key: 'unterschrieben', label: 'Unterschrieben', cls: 'teal' };
  if (r.linkSentAt) return { key: 'link', label: 'Link gesendet', cls: 'amber' };
  return { key: 'entwurf', label: 'Angelegt', cls: 'amber' };
}
export const feesTotal = (r) => (r.gebuehren || []).reduce((s, f) => s + num(f.betrag), 0);

export function suggestLateFee(r) {
  const ret = new Date(r.returnedAt || r.renterReturnAt || Date.now());
  const s = r.cfg || {};
  const lateMs = ret - new Date(r.bis) - (num(s.kulanzMinuten) * 60e3);
  if (lateMs <= 0) return { hours: 0, fee: 0 };
  const hours = Math.ceil(lateMs / 3600e3);
  const tagespreis = num(r.tagespreis) || num(r.preis) / Math.max(1, rentalDays(r.von, r.bis));
  const byHour = hours * num(s.verspaetungStunde);
  const cap = Math.ceil(hours / 24) * tagespreis;
  return { hours, fee: Math.round(Math.min(byHour, cap || byHour) * 100) / 100 };
}

// ---------- Vertrag ----------
export function contractSections(r) {
  const c = r.cfg || {};
  let t = (r.terms || DEFAULT_TERMS)
    .replaceAll('{KULANZ}', String(num(c.kulanzMinuten)))
    .replaceAll('{VERSPAETUNG}', eur(c.verspaetungStunde))
    .replaceAll('{REINIGUNG}', eur(c.reinigung))
    .replaceAll('{LOESCHTAGE}', String(num(c.loeschTage) || 90))
    .replaceAll('{FOTOTAGE}', String(num(c.fotoTage) || 365))
    .replaceAll('{FAHRER}', r.fahrer2?.name ? ` sowie der weitere Fahrer ${r.fahrer2.name}${r.fahrer2.fuehrerschein ? ' (Führerscheinklasse ' + r.fahrer2.fuehrerschein + ')' : ''}` : '')
    .replaceAll('{GPS}', r.item?.gps ? GPS_TERM : '');
  const sections = [];
  for (const block of t.split(/^## /m)) {
    if (!block.trim()) continue;
    const [h, ...rest] = block.split('\n');
    sections.push({ h: h.trim(), t: rest.join('\n').trim() });
  }
  return sections;
}

export function contractHead(r) {
  const v = r.vermieter || {}, m = r.mieter || {}, it = r.item || {};
  return {
    vermieter: [v.name, v.adresse, v.telefon, v.email].filter(Boolean),
    mieter: [m.name, m.adresse, m.geburtsdatum ? 'geb. ' + new Date(m.geburtsdatum).toLocaleDateString('de-DE') : '', m.telefon, m.email, m.fuehrerschein ? 'Führerscheinklasse: ' + m.fuehrerschein : '',
      r.fahrer2?.name ? `Weiterer Fahrer: ${r.fahrer2.name}${r.fahrer2.geburtsdatum ? ', geb. ' + new Date(r.fahrer2.geburtsdatum).toLocaleDateString('de-DE') : ''}${r.fahrer2.fuehrerschein ? ', Kl. ' + r.fahrer2.fuehrerschein : ''}` : ''].filter(Boolean),
    gegenstand: [it.name, it.kennzeichen ? 'Kennzeichen: ' + it.kennzeichen : '', it.zgg ? 'zul. Gesamtgewicht: ' + it.zgg + ' kg' : ''].filter(Boolean),
    zeitraum: `${fmtDT(r.von)}  bis  ${fmtDT(r.bis)}`,
    preise: `Miete: ${eur(r.preis)}   ·   Kaution: ${eur(r.kaution)}`,
  };
}

export function contractHtml(r) {
  const h = contractHead(r);
  return `
  <div class="contract">
    <h3>Mietvertrag</h3>
    <div class="c-grid">
      <div><b>Vermieter</b><br>${h.vermieter.map(esc).join('<br>') || '<i>noch nicht eingetragen</i>'}</div>
      <div><b>Mieter</b><br>${h.mieter.map(esc).join('<br>') || '<i>noch nicht eingetragen</i>'}</div>
    </div>
    <p><b>Mietgegenstand:</b> ${h.gegenstand.map(esc).join(' · ')}</p>
    <p><b>Mietzeit:</b> ${esc(h.zeitraum)}</p>
    <p><b>${esc(h.preise)}</b></p>
    ${contractSections(r).map(s => `<h4>${esc(s.h)}</h4><p>${esc(s.t).replace(/\n/g, '<br>')}</p>`).join('')}
  </div>`;
}

// ---------- PDF ----------
let jspdfLoading;
function loadJsPDF() {
  if (window.jspdf) return Promise.resolve();
  jspdfLoading ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = res; s.onerror = () => rej(new Error('PDF-Bibliothek konnte nicht geladen werden'));
    document.head.appendChild(s);
  });
  return jspdfLoading;
}

export async function makeContractPdf(r, photos = []) {
  await loadJsPDF();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 16, CW = W - 2 * M;
  let y = M;
  const need = (h) => { if (y + h > 285) { doc.addPage(); y = M; } };
  const text = (str, size = 10, style = 'normal', gap = 1.5) => {
    doc.setFont('helvetica', style); doc.setFontSize(size);
    const lines = doc.splitTextToSize(String(str), CW);
    for (const ln of lines) { need(size * 0.42); doc.text(ln, M, y); y += size * 0.42; }
    y += gap;
  };
  const h = contractHead(r);
  const v = r.vermieter || {};
  doc.setFillColor(15, 118, 110); doc.rect(0, 0, W, 6, 'F');
  y = 16;
  text('Mietvertrag' + (v.name ? ' – ' + v.name : ''), 17, 'bold', 1);
  text('Vertrags-Nr. ' + r.id.slice(0, 8).toUpperCase() + '   ·   erstellt mit ' + APP_NAME, 8, 'normal', r.storniert ? 1 : 4);
  if (r.storniert) text('STORNIERT am ' + fmtShort(r.closedAt), 11, 'bold', 4);

  // Parteien zweispaltig
  doc.setFontSize(10);
  const colW = CW / 2 - 4;
  const block = (title, lines, x) => {
    let yy = y; doc.setFont('helvetica', 'bold'); doc.text(title, x, yy); yy += 5; doc.setFont('helvetica', 'normal');
    for (const l of lines.length ? lines : ['–']) for (const s of doc.splitTextToSize(l, colW)) { doc.text(s, x, yy); yy += 4.4; }
    return yy;
  };
  const y1 = block('Vermieter', h.vermieter, M), y2 = block('Mieter', h.mieter, M + CW / 2 + 4);
  y = Math.max(y1, y2) + 3;
  doc.setDrawColor(200); doc.line(M, y, W - M, y); y += 5;
  text('Mietgegenstand: ' + (h.gegenstand.join(' · ') || '–'), 10, 'bold');
  text('Mietzeit: ' + h.zeitraum, 10, 'normal');
  text(h.preise + (r.zahlungsart ? '   ·   Zahlung: ' + (r.zahlungsart === 'paypal' ? 'PayPal' : 'Bar') : ''), 10, 'normal', 4);

  for (const s of contractSections(r)) { need(14); text(s.h, 10.5, 'bold', 0.8); text(s.t, 9, 'normal', 2.5); }

  // Unterschriften
  need(48); y += 4;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('Unterschriften', M, y); y += 3;
  const sigBox = (img, label, x) => {
    if (img) { try { doc.addImage(img, 'PNG', x, y, 70, 26); } catch (e) { } }
    doc.setDrawColor(120); doc.line(x, y + 28, x + 75, y + 28);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text(label, x, y + 32);
  };
  sigBox(r.ownerSignature, 'Vermieter' + (r.signedAt ? ' – ' + fmtShort(r.signedAt) : ''), M);
  sigBox(r.signature, 'Mieter' + (r.signedAt ? ' – unterschrieben ' + fmtShort(r.signedAt) + (r.signedBy === 'link' ? ' (per Link)' : ' (vor Ort)') : ' – noch nicht unterschrieben'), M + CW / 2 + 4);
  y += 38;
  if (r.consent) text('Einwilligung zur Ausweiskopie erteilt am ' + fmtShort(r.consentAt || r.signedAt) + '.', 8, 'italic', 3);

  // Protokoll
  const proto = (title, chk, at, note) => {
    if (!at && !chk) return;
    need(16); text(title + (at ? ' – ' + fmtDT(at) : ''), 10.5, 'bold', 1);
    const lst = Object.entries(chk || {});
    if (lst.length) text(lst.map(([k, ok]) => (ok ? '[x] ' : '[ ] ') + k).join('    '), 8.5, 'normal', 1.5);
    if (note) text('Notiz: ' + note, 8.5, 'italic', 2);
  };
  doc.addPage(); y = M;
  text('Übergabeprotokoll', 14, 'bold', 3);
  proto('Abholung', r.checkPickup, r.pickedUpAt || r.renterPickupAt, r.notePickup);
  proto('Rückgabe', r.checkReturn, r.returnedAt || r.renterReturnAt, r.noteReturn);
  if ((r.gebuehren || []).length) {
    text('Gebühren', 10.5, 'bold', 1);
    for (const f of r.gebuehren) text(`• ${FEE_TYPES[f.typ] || f.typ}: ${eur(f.betrag)}${f.notiz ? ' – ' + f.notiz : ''}`, 9, 'normal', 0.5);
    text('Summe Gebühren: ' + eur(feesTotal(r)), 9.5, 'bold', 2);
  }
  const pay = [];
  pay.push('Miete: ' + (r.mietePaid ? 'bezahlt (' + (r.mietePaid === 'paypal' ? 'PayPal' : 'bar') + ')' : 'offen'));
  pay.push('Kaution: ' + ({ offen: 'offen', erhalten: 'erhalten', zurueck: 'zurückgezahlt', einbehalten: 'verrechnet', keine: 'keine' }[r.kautionStatus || 'offen']));
  if (r.kautionStatus === 'zurueck' || r.kautionStatus === 'einbehalten') pay.push('Auszahlung: ' + eur(Math.max(0, num(r.kaution) - feesTotal(r))));
  text(pay.join('   ·   '), 9.5, 'normal', 3);

  // Zustandsfotos (keine Ausweisfotos)
  const pics = photos.filter(p => p.kind === 'abholung' || p.kind === 'rueckgabe');
  if (pics.length) {
    need(20); text('Zustandsfotos', 10.5, 'bold', 2);
    let x = M; const pw = 56, ph = 42;
    for (const p of pics) {
      if (x + pw > W - M + 1) { x = M; y += ph + 9; }
      need(ph + 9);
      try { doc.addImage(p.data, 'JPEG', x, y, pw, ph); } catch (e) { }
      doc.setFontSize(7); doc.setFont('helvetica', 'normal');
      doc.text(`${PHOTO_KINDS[p.kind]} · ${fmtShort(p.createdAt)}`, x, y + ph + 3.5);
      x += pw + 4;
    }
  }
  return doc;
}

export async function downloadContract(r, photos) {
  const doc = await makeContractPdf(r, photos);
  const name = `Mietvertrag_${(r.mieter?.name || 'Mieter').replace(/[^\wäöüÄÖÜß-]+/g, '_')}_${dayKey(r.von)}.pdf`;
  doc.save(name);
}

// ---------- Bilder verkleinern (+ Wasserzeichen für Ausweise) ----------
export function compressImage(file, { max = 1280, quality = 0.6, watermark = '' } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.naturalWidth, h = img.naturalHeight;
      const s = Math.min(1, max / Math.max(w, h)); w = Math.round(w * s); h = Math.round(h * s);
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
      if (watermark) {
        ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(-Math.atan2(h, w));
        ctx.font = `bold ${Math.round(Math.min(w, h) / 9)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(220,30,30,.38)'; ctx.fillText('KOPIE', 0, -Math.min(w, h) / 12);
        ctx.font = `bold ${Math.round(Math.min(w, h) / 24)}px sans-serif`; ctx.fillText(watermark, 0, Math.min(w, h) / 14);
        ctx.restore();
      }
      let q = quality, out = cv.toDataURL('image/jpeg', q);
      while (out.length > 700000 && q > 0.25) { q -= 0.1; out = cv.toDataURL('image/jpeg', q); }
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bild konnte nicht gelesen werden')); };
    img.src = url;
  });
}

// ---------- Unterschriften-Feld ----------
export class SignaturePad {
  constructor(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d'); this.empty = true; this.drawing = false;
    this.resize(); new ResizeObserver(() => this.resize()).observe(canvas);
    const pos = (e) => { const b = canvas.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    canvas.addEventListener('pointerdown', e => { e.preventDefault(); canvas.setPointerCapture(e.pointerId); this.drawing = true; this.last = pos(e); this.dot(this.last); });
    canvas.addEventListener('pointermove', e => { if (!this.drawing) return; e.preventDefault(); const p = pos(e); this.line(this.last, p); this.last = p; });
    const end = () => { this.drawing = false; };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  }
  resize() {
    const b = this.cv.getBoundingClientRect(); if (!b.width) return;
    const dpr = window.devicePixelRatio || 1;
    if (this.cv.width === Math.round(b.width * dpr)) return;
    const old = this.empty ? null : this.cv.toDataURL();
    this.cv.width = Math.round(b.width * dpr); this.cv.height = Math.round(b.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.lineWidth = 2.4; this.ctx.lineCap = 'round'; this.ctx.lineJoin = 'round'; this.ctx.strokeStyle = '#111';
    if (old) { const i = new Image(); i.onload = () => this.ctx.drawImage(i, 0, 0, b.width, b.height); i.src = old; }
  }
  dot(p) { this.ctx.beginPath(); this.ctx.arc(p[0], p[1], 1.2, 0, 7); this.ctx.fillStyle = '#111'; this.ctx.fill(); this.empty = false; }
  line(a, b) { this.ctx.beginPath(); this.ctx.moveTo(...a); this.ctx.lineTo(...b); this.ctx.stroke(); this.empty = false; }
  clear() { this.ctx.clearRect(0, 0, this.cv.width, this.cv.height); this.empty = true; }
  isEmpty() { return this.empty; }
  toDataURL() {
    // auf weißem Hintergrund, verkleinert speichern
    const w = 600, h = 220, c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(this.cv, 0, 0, w, h);
    return c.toDataURL('image/png');
  }
}

// ---------- Datenspeicher ----------
// Firebase (echt) oder Demo (localStorage). Beide haben die gleichen Funktionen.
export const isDemo = !firebaseConfig.apiKey;

function setPath(obj, path, val) {
  const keys = path.split('.'); let o = obj;
  for (let i = 0; i < keys.length - 1; i++) { o[keys[i]] = (o[keys[i]] && typeof o[keys[i]] === 'object') ? o[keys[i]] : {}; o = o[keys[i]]; }
  if (val === undefined) delete o[keys.at(-1)]; else o[keys.at(-1)] = val;
}

function demoStore() {
  const KEY = 'mietbox_demo_v1';
  const listeners = new Set();
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || { items: {}, rentals: {}, settings: null, photos: {} }; } catch { return { items: {}, rentals: {}, settings: null, photos: {} }; } };
  const save = (d) => {
    try { localStorage.setItem(KEY, JSON.stringify(d)); }
    catch (e) { toast('Demo-Speicher voll – bitte Firebase einrichten', 'err'); throw e; }
    emit();
  };
  const emit = () => setTimeout(() => listeners.forEach(l => l()), 0);
  window.addEventListener('storage', e => { if (e.key === KEY) emit(); });
  const sub = (fn) => { listeners.add(fn); fn(); return () => listeners.delete(fn); };
  const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(15)), b => 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'[b % 57]).join('');
  let user = JSON.parse(sessionStorage.getItem('mietbox_demo_user') || 'null');
  const authL = new Set();
  return {
    mode: 'demo',
    onAuth: (cb) => { authL.add(cb); cb(user); },
    login: async (email) => { user = { email: email || 'demo@mietbox' }; sessionStorage.setItem('mietbox_demo_user', JSON.stringify(user)); authL.forEach(c => c(user)); },
    register: async (email) => { user = { email }; sessionStorage.setItem('mietbox_demo_user', JSON.stringify(user)); authL.forEach(c => c(user)); },
    resetPw: async () => { },
    logout: async () => { user = null; sessionStorage.removeItem('mietbox_demo_user'); authL.forEach(c => c(null)); },
    newId: rid,
    watchCol: (col, cb) => sub(() => cb(Object.entries(load()[col] || {}).map(([id, d]) => ({ id, ...d })))),
    watchOne: (col, id, cb) => sub(() => { const d = load()[col]?.[id]; cb(d ? { id, ...d } : null); }),
    getSettings: async () => load().settings,
    saveSettings: async (s) => { const d = load(); d.settings = s; save(d); },
    set: async (col, id, data) => { const d = load(); d[col] ||= {}; d[col][id] = JSON.parse(JSON.stringify(data)); save(d); },
    update: async (col, id, patch) => {
      const d = load(); if (!d[col]?.[id]) throw new Error('Nicht gefunden');
      for (const [k, v] of Object.entries(patch)) setPath(d[col][id], k, v === undefined ? undefined : JSON.parse(JSON.stringify(v ?? null)));
      save(d);
    },
    del: async (col, id) => { const d = load(); delete d[col]?.[id]; if (col === 'rentals') delete d.photos[id]; save(d); },
    addPhoto: async (rentalId, p) => { const d = load(); d.photos[rentalId] ||= {}; d.photos[rentalId][rid()] = p; save(d); },
    listPhotos: async (rentalId, kinds) => Object.entries(load().photos[rentalId] || {}).map(([id, p]) => ({ id, ...p })).filter(p => !kinds || kinds.includes(p.kind)),
    delPhoto: async (rentalId, pid) => { const d = load(); delete d.photos[rentalId]?.[pid]; save(d); },
  };
}

async function fbStore() {
  const base = `https://www.gstatic.com/firebasejs/${FB_VERSION}/`;
  const [A, F, U] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-firestore.js'), import(base + 'firebase-auth.js')]);
  const app = A.initializeApp(firebaseConfig);
  const db = F.getFirestore(app);
  const auth = U.getAuth(app);
  const clean = (o) => JSON.parse(JSON.stringify(o));
  const onErr = (e) => { console.error(e); toast('Fehler: ' + (e.code === 'permission-denied' ? 'keine Berechtigung' : e.message), 'err'); };
  return {
    mode: 'firebase',
    onAuth: (cb) => U.onAuthStateChanged(auth, u => cb(u ? { email: u.email, uid: u.uid } : null)),
    login: (e, p) => U.signInWithEmailAndPassword(auth, e, p),
    register: (e, p) => U.createUserWithEmailAndPassword(auth, e, p),
    resetPw: (e) => U.sendPasswordResetEmail(auth, e),
    logout: () => U.signOut(auth),
    newId: () => F.doc(F.collection(db, 'rentals')).id,
    watchCol: (col, cb) => F.onSnapshot(F.collection(db, col), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))), onErr),
    watchOne: (col, id, cb, err) => F.onSnapshot(F.doc(db, col, id), d => cb(d.exists() ? { id: d.id, ...d.data() } : null), err || onErr),
    getSettings: async () => { const d = await F.getDoc(F.doc(db, 'settings', 'main')); return d.exists() ? d.data() : null; },
    saveSettings: (s) => F.setDoc(F.doc(db, 'settings', 'main'), clean(s)),
    set: (col, id, data) => F.setDoc(F.doc(db, col, id), clean(data)),
    update: (col, id, patch) => {
      const p = {}; for (const [k, v] of Object.entries(patch)) p[k] = v === undefined ? F.deleteField() : (v === null ? null : clean(v));
      return F.updateDoc(F.doc(db, col, id), p);
    },
    del: async (col, id) => {
      if (col === 'rentals') { const ps = await F.getDocs(F.collection(db, 'rentals', id, 'photos')); await Promise.all(ps.docs.map(d => F.deleteDoc(d.ref))); }
      return F.deleteDoc(F.doc(db, col, id));
    },
    addPhoto: (rentalId, p) => F.addDoc(F.collection(db, 'rentals', rentalId, 'photos'), p),
    listPhotos: async (rentalId, kinds) => {
      const col = F.collection(db, 'rentals', rentalId, 'photos');
      const snap = await F.getDocs(kinds ? F.query(col, F.where('kind', 'in', kinds)) : col);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    },
    delPhoto: (rentalId, pid) => F.deleteDoc(F.doc(db, 'rentals', rentalId, 'photos', pid)),
  };
}

export async function initStore() {
  if (isDemo) return demoStore();
  return fbStore();
}
