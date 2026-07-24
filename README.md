# Qwui

Schweizer Quittungen erstellen, Firmen- und Kundendaten verwalten, Quittungen als PDF
herunterladen und per E-Mail oder WhatsApp versenden — inklusive Schweizer
QR-Einzahlungsschein. Web-App (PWA), gehostet auf Cloudflare Pages mit zentraler
Datenbank (Cloudflare D1) und Passwortschutz.

Dieser Guide führt einmal komplett von "leeres Verzeichnis" bis "fertig
eingerichtete, live erreichbare App" durch.

## Inhaltsverzeichnis

1. [Überblick & Funktionen](#1-überblick--funktionen)
2. [Voraussetzungen](#2-voraussetzungen)
3. [Lokale Entwicklung](#3-lokale-entwicklung)
4. [Projektstruktur](#4-projektstruktur)
5. [Auf GitHub bringen](#5-auf-github-bringen)
6. [Deployment auf Cloudflare Pages](#6-deployment-auf-cloudflare-pages)
7. [Zentrale Datenbank einrichten (Cloudflare D1)](#7-zentrale-datenbank-einrichten-cloudflare-d1)
8. [Passwortschutz einrichten](#8-passwortschutz-einrichten)
9. [Erste Schritte in der App](#9-erste-schritte-in-der-app)
10. [PDF-Erzeugung & Versand](#10-pdf-erzeugung--versand)
11. [Als App installieren (PWA)](#11-als-app-installieren-pwa)
12. [Sicherheit](#12-sicherheit)
13. [Updates & weitere Deployments](#13-updates--weitere-deployments)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Überblick & Funktionen

- **Quittungen erstellen**: Positionen mit Beschreibung/Betrag, optional 8.1 %
  Mehrwertsteuer, fortlaufende Quittungsnummer.
- **Kundenverwaltung**: Kunden mit strukturierter Adresse speichern und wiederverwenden.
- **Firmendaten**: Name, Adresse, Kontakt, MWST-Nummer, QR-Rechnungs-Konto (IBAN),
  optional ein Firmenlogo (erscheint oben links auf Quittung/Rechnung).
- **QR-Einzahlungsschein**: Schweizer QR-Rechnung nach aktueller Spezifikation
  (strukturierte Adresse, ISO-11649-Referenz), funktioniert mit jeder normalen
  Schweizer/Liechtensteiner IBAN — keine QR-IBAN nötig.
- **PDF-Export**: Exakt positioniertes PDF direkt im Browser erzeugt (`pdf-lib`),
  QR-Rechnung landet garantiert am unteren Seitenrand.
- **Versand**: Per E-Mail (`mailto:`) oder WhatsApp (`wa.me`) mit vorausgefülltem Text.
- **Verlauf & Bearbeiten**: Alle Quittungen einsehen, bearbeiten, löschen.
- **Buchhaltung**: Monats-/Jahresübersicht, offene/bezahlte Beträge, Excel-Export.
- **Zentrale Datenbank**: Alle Daten liegen in Cloudflare D1 — jedes Gerät sieht nach
  dem Login denselben, aktuellen Stand.
- **Passwortschutz**: Echter, serverseitiger Schutz (Basic Auth via Cloudflare Pages
  Function), inkl. Rate-Limiting gegen Brute-Force.
- **PWA**: Installierbar auf Desktop/Handy, mit Icon und Offline-Cache für die
  Oberfläche.

## 2. Voraussetzungen

- [Node.js](https://nodejs.org) 18 oder neuer (inkl. `npm`)
- Ein [GitHub](https://github.com)-Account
- Ein [Cloudflare](https://dash.cloudflare.com)-Account (kostenlos ausreichend)
- Git

## 3. Lokale Entwicklung

```bash
npm install
npm run dev
```

Öffnet die App unter `http://localhost:5173`.

> Hinweis: Im reinen `npm run dev`-Modus laufen die Cloudflare Pages Functions
> (`/api/storage`, Passwortschutz) **nicht** — dafür bräuchte es `wrangler pages dev`.
> Ohne Backend zeigt die Konsole 404-Fehler beim Speichern; die Oberfläche selbst lässt
> sich aber trotzdem bedienen und testen. Für einen vollständigen lokalen Test inkl.
> API und D1 siehe [Troubleshooting](#14-troubleshooting).

Weitere Befehle:

```bash
npm run build      # Produktions-Build nach dist/
npm run preview    # Baut nicht neu, zeigt nur dist/ lokal an
```

## 4. Projektstruktur

```
index.html                     Einstiegspunkt (Vite)
src/                            React-App (UI, Logik)
  App.jsx                       Hauptkomponente: alle Tabs, Formulare, Vorschau
  BuchhaltungTab.jsx             Buchhaltungs-Übersicht + Excel-Export
  QrBillDocument.jsx             Bildschirm-/Druckansicht des QR-Einzahlungsscheins
  qrbill.js                      Swiss-QR-Payload, IBAN-/Referenz-Prüfziffern
  pdfGenerator.js                Clientseitige PDF-Erzeugung (pdf-lib)
  apiStorage.js                  Speicher-Adapter, spricht mit D1 via /api/storage
  storageShim.js                 Alte localStorage-Variante (Referenz/Offline-Fallback)
public/                          Icons, PWA-Manifest, Service Worker
functions/
  _middleware.js                 Passwortschutz + Rate-Limiting (läuft vor jedem Request)
  api/storage.js                 GET/POST/DELETE für einzelne Schlüssel (D1)
  api/storage-list.js            Auflisten von Schlüsseln nach Präfix (D1)
schema.sql                       Datenbankschema für Cloudflare D1
wrangler.toml                    Cloudflare-Konfiguration (D1-Binding, Compat-Flags)
vite.config.js                   Build-Konfiguration
```

## 5. Auf GitHub bringen

Falls das Repo noch nicht existiert:

```bash
git init
git add .
git commit -m "Initial commit: Qwui"
git branch -M main
git remote add origin https://github.com/DEIN-USERNAME/DEIN-REPO.git
git push -u origin main
```

Ist das Repo (wie bei `mardoommo/Qwui`) bereits verbunden, reicht ab jetzt:

```bash
git add .
git commit -m "Beschreibung der Änderung"
git push origin main
```

## 6. Deployment auf Cloudflare Pages

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** →
   **Create** → **Pages** → **Connect to Git** → dein Repo auswählen.
2. Build-Einstellungen:
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
3. **Save and Deploy**.

Ab jetzt baut Cloudflare bei jedem `git push` auf `main` automatisch neu und
veröffentlicht die neue Version.

> Ohne die Schritte 7 und 8 unten ist die App zwar erreichbar, aber ohne Datenbank
> und ohne Passwortschutz. Beides einmalig einrichten, bevor echte Daten
> hineinkommen.

## 7. Zentrale Datenbank einrichten (Cloudflare D1)

Alle Daten (Firma, Kunden, Quittungen) liegen zentral in einer Cloudflare-D1-Datenbank
statt im Browser — dieselben Daten sind von jedem Gerät aus sichtbar, sobald man sich
anmeldet.

**Einmalige Einrichtung:**

1. Cloudflare Dashboard → **Workers & Pages** → **D1 SQL Database** →
   **Create database** (Name frei wählbar, z. B. `qwui-db`).
2. Datenbank öffnen → Tab **Console** → Inhalt von [`schema.sql`](schema.sql)
   einfügen und ausführen. Das legt die Tabelle `kv_store` an (ein generischer
   Key-Value-Speicher für Firma/Kunden/Quittungen/Rate-Limiting).
3. Pages-Projekt → **Settings → Functions → D1 database bindings** →
   **Add binding**: Variable name **`DB`** (exakt so, gross geschrieben), Datenbank
   auswählen → **Speichern**.
4. Neu deployen (z. B. mit einem leeren Commit oder über **Retry deployment**),
   damit die Bindung greift.

> Die `database_id` in [`wrangler.toml`](wrangler.toml) ist kein Geheimnis — es ist
> nur ein Bezeichner, kein Zugangsschlüssel. Sie darf bedenkenlos im Repo stehen;
> Zugriff auf die Datenbank erfordert einen authentifizierten Cloudflare-Account.

Die API-Endpunkte (`/api/storage`, `/api/storage-list`) sind durch dieselbe
`functions/_middleware.js` geschützt wie der Rest der Seite — ohne gültiges Passwort
kommt niemand an die Daten.

## 8. Passwortschutz einrichten

Der eigentliche Zugriffsschutz läuft über eine Cloudflare Pages Function
(`functions/_middleware.js`, bereits im Repo enthalten) und ist **echt
serverseitig** — das Passwort steht nirgends im ausgelieferten JavaScript und lässt
sich nicht über "Seitenquelltext ansehen" auslesen.

**Einrichtung:**

1. Pages-Projekt → **Settings → Environment variables** → **Add variable**.
2. Name: **`SITE_PASSWORD`**, Wert: dein Passwort (empfohlen: lang und zufällig,
   z. B. 20+ Zeichen — Brute-Force-Angriffe werden zusätzlich serverseitig
   abgeblockt, siehe [Sicherheit](#12-sicherheit)).
3. **Save**, danach neu deployen, damit die Variable greift.

Ohne gesetztes `SITE_PASSWORD` blockiert die App den Zugriff sicherheitshalber
komplett (kein offener Fallback-Modus).

**Optional, als zusätzliche Schicht:** Cloudflare Access (Login per E-Mail-Code oder
bestehendem Konto), lässt sich mit dem Passwortschutz kombinieren:

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Zero Trust** →
   **Access → Applications → Add an application → Self-hosted**.
2. Domain deines Pages-Projekts eintragen.
3. Unter **Policies** eine Regel erstellen (z. B. eigene E-Mail-Adresse als
   "Include").
4. Speichern.

## 9. Erste Schritte in der App

Nach dem Login (Passwort aus Schritt 8) einmalig:

1. **Firma** (Sidebar) → Firmenname, Adresse, Kontakt, ggf. MWST-Nummer eintragen
   → **Speichern**. Optional ein **Firmenlogo hochladen** (erscheint danach oben
   links auf jeder Quittung/Rechnung, PDF und Druck) — ein Bild mit wenig Rand
   wirkt am besten, PNG mit transparentem Hintergrund wird unterstützt.
2. Falls QR-Rechnungen gewünscht: im selben Tab unter "QR-Rechnung" die
   Zahlungsempfänger-Adresse und die IBAN eintragen (Validierung erfolgt live,
   grüner Haken = gültige Schweizer/Liechtensteiner IBAN).
3. **Kunden** (optional vorab) → Kunden mit Adresse anlegen, damit sie später in der
   Quittung per Dropdown auswählbar sind. Alternativ kann pro Quittung auch ein
   Kunde manuell eingetragen werden.

**Eine Quittung erstellen:**

1. Tab **Neue Quittung** → Datum, Empfänger (gespeicherten Kunden wählen oder manuell
   eintragen), eine oder mehrere Positionen mit Betrag.
2. Optional **Mehrwertsteuerpflichtig** aktivieren (Normalsatz 8.1 %) — Netto/MWST/
   Total werden automatisch ausgerechnet.
3. Optional **Bezahlbar per Rechnung (QR-Einzahlungsschein)** aktivieren (setzt eine
   gültige IBAN unter Firma voraus). Ist diese Option aktiv, heisst das Dokument
   auf Bildschirm, PDF und Druck **"RECHNUNG"** statt **"QUITTUNG"** — schliesslich
   ist der Betrag noch nicht bezahlt, sondern erst fällig.
4. Ab CHF 400 Total ist laut OR Art. 958f die Adresse des Käufers gesetzlich
   vorgeschrieben — die App weist darauf hin, wenn sie fehlt.
5. **Quittung erstellen →** — Nummer wird automatisch fortlaufend vergeben.

**Verlauf & Buchhaltung:**

- Tab **Verlauf**: alle Quittungen öffnen, bearbeiten oder löschen.
- Tab **Buchhaltung**: nach Monat/Jahr filtern, offene vs. bezahlte QR-Rechnungen
  markieren, Summen einsehen, per Button **Export zu Excel** als `.xlsx`
  herunterladen. Offene QR-Rechnungen, deren 30-Tage-Zahlungsfrist abgelaufen ist,
  werden farblich hervorgehoben (inkl. Anzahl überfälliger Tage); für diese steht
  ein Button **Mahnung erstellen** bereit, der eine eigenständige Mahnungs-PDF mit
  erneut beigelegtem Einzahlungsschein generiert.

## 10. PDF-Erzeugung & Versand

In der Quittungs-Vorschau stehen mehrere Aktionen zur Verfügung:

- **PDF herunterladen**: erzeugt das PDF **clientseitig im Browser**
  (`src/pdfGenerator.js`, via `pdf-lib`) — kein Server-Umweg. Jedes Element wird mit
  exakten Koordinaten selbst platziert; ist die QR-Rechnung aktiviert, landet sie
  dadurch garantiert am unteren Seitenrand, unabhängig von Browser/Druck-Engine und
  unabhängig von der Länge der Quittung.
- **Drucken**: klassischer Browser-Druckdialog (`window.print()`) als Alternative.
- **Per E-Mail senden**: öffnet das E-Mail-Programm mit vorausgefülltem Betreff/Text
  (kein automatischer Anhang möglich — PDF vorher herunterladen und manuell
  anhängen).
- **Per WhatsApp senden**: öffnet WhatsApp (App oder Web) mit fertigem Text; ist eine
  Telefonnummer beim Kunden hinterlegt, wird der Chat direkt vorausgewählt.
- **Teilen** (nur sichtbar, wenn das Gerät es unterstützt — v. a. mobile Browser):
  übergibt die Quittung direkt als PDF-Anhang an den nativen Teilen-Dialog des
  Geräts (WhatsApp, Mail, weitere Apps), ohne den Umweg über „PDF herunterladen"
  und manuelles Anhängen. Nutzt die
  [Web Share API (Level 2)](https://developer.mozilla.org/docs/Web/API/Navigator/canShare);
  auf Desktop-Browsern ohne Unterstützung bleibt der Button ausgeblendet, die
  bisherigen Wege (Herunterladen, E-Mail, WhatsApp) funktionieren dort unverändert.

## 11. Als App installieren (PWA)

Qwui liefert ein Web-App-Manifest und einen Service Worker mit, dadurch:

- **Desktop (Chrome/Edge)**: Adressleiste → Install-Icon → "Qwui installieren".
- **Android**: Browser-Menü → "Zum Startbildschirm hinzufügen".
- **iOS (Safari)**: Teilen-Menü → "Zum Home-Bildschirm".

Die Oberfläche (HTML/CSS/JS) wird für schnelleren Start zwischengespeichert. API-
Aufrufe (`/api/...`) sind davon ausgenommen und laden immer frisch vom Server, damit
nie veraltete Firmen-/Kunden-/Quittungsdaten angezeigt werden.

## 12. Sicherheit

Kurzüberblick, was bereits eingebaut ist:

- **Serverseitiger Passwortschutz** vor jedem Request (`functions/_middleware.js`),
  nicht im Client-Code auslesbar.
- **Konstante-Zeit-Vergleich** des Passworts (SHA-256-Hash-Vergleich statt direktem
  String-Vergleich) — kein Timing-Seitenkanal.
- **Rate-Limiting**: nach 10 fehlgeschlagenen Login-Versuchen pro IP innerhalb von
  15 Minuten wird mit `429 Too Many Requests` gesperrt, ohne das Passwort weiter zu
  prüfen. Erfolgreiche Logins verursachen dabei keinen zusätzlichen Datenbankzugriff.
- **Parametrisierte D1-Queries** überall — kein SQL-Injection-Risiko.
- **`database_id` in `wrangler.toml` ist unbedenklich** im Repo (siehe Hinweis in
  Abschnitt 7) — kein Geheimnis, sondern nur ein Bezeichner.
- **`.gitignore`** schliesst `.dev.vars`, `node_modules/`, `dist/` und Logs aus —
  echte Secrets (`SITE_PASSWORD`) werden ausschliesslich über Cloudflare
  Environment Variables gesetzt, nie im Code.

Was bewusst nicht umgesetzt ist (da für den Anwendungsfall nicht nötig): einzelne
Benutzerkonten/Rollen — alle, die das eine Passwort kennen, haben vollen Zugriff auf
alle Daten. Wer das nicht will, kann zusätzlich Cloudflare Access (Abschnitt 8)
einrichten, um den Zugriff auf bestimmte E-Mail-Adressen einzuschränken.

## 13. Updates & weitere Deployments

Für jede weitere Änderung reicht:

```bash
git add .
git commit -m "Beschreibung der Änderung"
git push origin main
```

Cloudflare Pages baut daraufhin automatisch neu und veröffentlicht die neue Version
innerhalb weniger Minuten (Fortschritt im Cloudflare Dashboard unter
**Workers & Pages → dein Projekt → Deployments** sichtbar).

## 14. Troubleshooting

**"Speichern fehlgeschlagen" / 404 bei `/api/storage` in der lokalen Entwicklung**
Erwartet bei reinem `npm run dev` — die Pages Functions laufen nur auf Cloudflare
selbst oder lokal über die Cloudflare-CLI `wrangler` (`npm install -g wrangler`,
danach `npm run build` gefolgt von `wrangler pages dev dist`; die D1-Bindung aus
`wrangler.toml` wird dabei automatisch berücksichtigt — Details in der offiziellen
Wrangler-Dokumentation von Cloudflare).

**Zugriff komplett verweigert (401), obwohl Passwort stimmt**
`SITE_PASSWORD` in den Environment Variables des Pages-Projekts prüfen (Tippfehler,
führende/nachfolgende Leerzeichen) und danach neu deployen — Variablenänderungen
gelten erst ab dem nächsten Deployment.

**"Zu viele fehlgeschlagene Versuche" (429)**
Rate-Limiting hat nach 10 Fehlversuchen in 15 Minuten gegriffen (siehe
Abschnitt 12). Der `Retry-After`-Header in der Antwort gibt an, in wie vielen
Sekunden es weitergeht — einfach kurz warten und erneut versuchen.

**QR-Rechnung wird nicht angeboten / Hinweis "gültige IBAN" erscheint**
Unter **Firma → QR-Rechnung** muss eine gültige Schweizer (`CH...`) oder
liechtensteinische (`LI...`) IBAN mit korrekter Prüfziffer hinterlegt sein (grüner
Haken = gültig).

**Build schlägt fehl**
`npm install` erneut ausführen (stellt sicher, dass `node_modules/` vollständig ist)
und danach `npm run build`. Bei Fehlermeldungen zur `xlsx`-Abhängigkeit: Diese wird
bewusst direkt von `cdn.sheetjs.com` bezogen (offizieller Vertriebsweg von
SheetJS), nicht vom npm-Registry — eine funktionierende Internetverbindung beim
`npm install` ist dafür nötig.

**Daten von Gerät A erscheinen nicht auf Gerät B / Eingaben verschwinden nach Reload**
Sicherstellen, dass auf beiden Geräten dasselbe Cloudflare-Pages-Projekt (Domain)
verwendet wird und die D1-Bindung (Abschnitt 7) korrekt eingerichtet ist. Es gibt
keinen lokalen Fallback-Speicher — ohne funktionierende D1-Bindung schlägt jedes
Speichern und Laden fehl (sichtbar als Fehler in der Browser-Konsole), Eingaben
gehen dann nach einem Neuladen der Seite verloren.
