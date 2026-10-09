# Mietbox – Einrichtung (ca. 20 Minuten)

Die App besteht aus zwei Seiten:
- **index.html** – deine Vermieter-App (Login nur für dich)
- **mieter.html** – die Seite, die der Mieter über seinen persönlichen Link öffnet (ohne Anmeldung)

Ohne Firebase läuft alles im **Demo-Modus** (Daten nur im Browser) – gut zum Ausprobieren.

---

## 1. Firebase-Projekt anlegen
1. https://console.firebase.google.com → **Projekt hinzufügen** → Name z. B. `mietbox` (Google Analytics brauchst du nicht).
2. Links **Build → Firestore Database** → **Datenbank erstellen** → Standort **europe-west3 (Frankfurt)** → im **Produktionsmodus** starten.
3. Links **Build → Authentication** → **Los gehts** → Anbieter **E-Mail/Passwort** aktivieren.
4. Zahnrad → **Projekteinstellungen** → unten **Web-App hinzufügen** (`</>`) → Name `Mietbox` → die angezeigte `firebaseConfig` kopieren.

> Firebase Storage wird **nicht** gebraucht – Fotos werden verkleinert direkt in Firestore gespeichert. Der kostenlose Spark-Tarif reicht.

## 2. config.js ausfüllen
Die Werte aus Schritt 1.4 in `config.js` eintragen (apiKey, authDomain, projectId, …).

## 3. Sicherheitsregeln eintragen (wichtig!)
1. In `firestore.rules` die Zeile `DEINE-EMAIL@BEISPIEL.DE` durch **deine E-Mail** ersetzen.
2. Firebase → **Firestore Database → Regeln** → alles löschen, Inhalt von `firestore.rules` einfügen → **Veröffentlichen**.

Damit gilt: Nur du siehst alle Mieten und Fotos. Ein Mieter sieht nur seine eigene Miete (über den zufälligen Link) und darf nur seine Daten, Fotos und Unterschrift ergänzen – Ausweisfotos kann er danach nicht mehr abrufen.

## 4. Online stellen mit GitHub Pages
1. Auf GitHub neues Repository `Mietbox` anlegen (öffentlich ist ok – es stehen keine Kundendaten im Code).
2. Alle Dateien aus diesem Ordner hochladen.
3. Repository → **Settings → Pages** → Branch `main` / Ordner `/ (root)` → Speichern.
4. Nach 1–2 Minuten ist die App erreichbar unter `https://ceyser.github.io/Mietbox/`.
5. Firebase → **Authentication → Einstellungen → Autorisierte Domains** → `ceyser.github.io` hinzufügen.

## 5. Erster Start
1. App öffnen → **Erstes Mal? Konto anlegen** (mit derselben E-Mail wie in den Regeln).
2. **Mehr → Einstellungen**: deine Daten, PayPal.me-Name, Gebühren, Unterschrift.
3. **Mehr → Artikel**: Anhänger anlegen (Preis, Kaution, Kennzeichen, TÜV, Schloss-Art, GPS).
4. Auf dem Handy im Browser **„Zum Home-Bildschirm“** – dann sieht sie aus wie eine App.

---

## So läuft eine Miete
1. **+ Neue Miete** → Artikel, Zeitraum (Preis wird berechnet), Kaution.
2. **Vor Ort:** Ausweis fotografieren → Mieter unterschreibt auf deinem Handy.
   **Aus der Ferne:** „WhatsApp-Link“ → Mieter trägt Daten ein, fotografiert Ausweis/Führerschein, unterschreibt.
3. Du bekommst den Hinweis „hat unterschrieben“ → Schloss-Code eintragen und **freigeben** (oder bei Fernöffnung: Mieter tippt „Ich bin da“, du öffnest).
4. Mieter macht Abholfotos und tippt „Abgeholt“. Zahlung: bar oder PayPal-Link.
5. Rückgabe: Mieter macht Fotos → du prüfst, trägst Gebühren ein (Reinigung, Verspätung wird vorgeschlagen, Schaden) → **Kaution zurückgezahlt & abschließen**.
6. Ausweisfotos werden nach der eingestellten Frist automatisch gelöscht.

## Hinweise
- Der Vertragstext ist eine **Vorlage, keine Rechtsberatung** – lass ihn bei Gelegenheit prüfen.
- Bei Zeit-Code-Schlössern (z. B. igloohome) erzeugst du den Code in der Schloss-App für genau den Mietzeitraum und trägst ihn in Mietbox ein.
- Backup: **Mehr → Backup herunterladen** (ohne Fotos). CSV für die Steuer: **Einnahmen → CSV**.
