# Qwui

Schweizer Quittungen erstellen, Firmen- und Kundendaten verwalten, Quittungen als PDF
speichern und per E-Mail oder WhatsApp versenden. Web-App, gehostet auf Cloudflare
Pages mit zentraler Datenbank (Cloudflare D1) und Passwortschutz.

Getestet: `npm install` und `npm run build` laufen fehlerfrei durch (siehe `dist/`).

## Projektstruktur

```
src/                  React-App (UI, Logik)
src/apiStorage.js     Speicher-Adapter, spricht mit der D1-Datenbank via /api/storage
src/storageShim.js    Alte localStorage-Variante (Referenz/Offline-Fallback)
public/                Icons, PWA-Manifest, Service Worker
functions/_middleware.js   Passwortschutz (läuft vor jedem Request)
functions/api/         API-Endpunkte für die D1-Datenbank
schema.sql             Datenbankschema für Cloudflare D1
```

## 1. Lokale Entwicklung

```bash
npm install
npm run dev
```
Öffnet die App unter `http://localhost:5173`.

## 2. Deployment (Cloudflare Pages)

1. Repo auf GitHub pushen (siehe unten).
2. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git** → dein Repo auswählen.
3. Build-Einstellungen: **Build command** `npm run build`, **Build output directory**
   `dist`.
4. **Save and Deploy**.

Bei jedem `git push` auf `main` baut Cloudflare automatisch neu.

## 3. Aufs eigene GitHub-Repo hochladen

```bash
cd qwui
git init
git add .
git commit -m "Initial commit: Qwui"
git branch -M main
git remote add origin https://github.com/DEIN-USERNAME/DEIN-REPO.git
git push -u origin main
```

## 4. Passwortschutz (echt, nicht im Code sichtbar)

Zwei Schutzschichten sind im Projekt vorgesehen:

### Cloudflare Access (Login mit E-Mail-Code oder bestehendem Konto)
1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Zero Trust** →
   **Access → Applications → Add an application → Self-hosted**.
2. Domain deines Pages-Projekts eintragen.
3. Unter **Policies** eine Regel erstellen (z. B. deine eigene E-Mail-Adresse als
   "Include").
4. Speichern.

### Passwort per Cloudflare Pages Function (`functions/_middleware.js`, bereits enthalten)
1. Im Pages-Projekt: **Settings → Environment variables** → Name `SITE_PASSWORD`,
   Wert = dein Passwort → Speichern.
2. Neu deployen, damit die Variable greift.

Beide Schichten lassen sich kombinieren, wie aktuell bei dir eingerichtet.

## 5. Zentrale Datenbank (Cloudflare D1)

Alle Daten (Firma, Kunden, Quittungen) liegen zentral in einer Cloudflare-D1-Datenbank
statt im Browser — dieselben Daten sind von jedem Gerät aus sichtbar, sobald man sich
anmeldet.

**Einmalige Einrichtung:**
1. Cloudflare Dashboard → **Workers & Pages** → **D1 SQL Database** →
   **Create database** (z. B. `qwui-db`).
2. Datenbank öffnen → Tab **Console** → Inhalt von `schema.sql` einfügen und ausführen.
3. Pages-Projekt → **Settings → Functions → D1 database bindings** → **Add binding**:
   Variable name `DB`, Datenbank auswählen → Speichern.
4. Neu deployen.

**Sicherheit:** Die API-Endpunkte (`/api/storage`, `/api/storage-list`) sind durch
dieselbe `functions/_middleware.js` geschützt wie der Rest der Seite.

## 6. QR-Rechnung als exakt positioniertes PDF

Für Quittungen mit aktivierter QR-Rechnung wird das PDF **serverseitig** erzeugt
(`functions/api/generate-pdf.js` + `functions/_lib/pdfGenerator.js`, via `pdf-lib`)
statt über den Browser-Druckdialog. Der Vorteil: Jedes Element wird mit exakten
Koordinaten selbst platziert — die QR-Rechnung landet dadurch **garantiert** am
unteren Seitenrand, unabhängig von Browser/Druck-Engine, und unabhängig davon, wie
lang die Quittung ist (getestet von 1 bis 100 Positionen, jeweils exakt dieselbe
Position, keine Inhalte gehen je verloren).

**Wichtig für den Cloudflare-Deploy:** Die `qrcode`-Bibliothek benötigt Node.js-
Kompatibilität. Das ist über `wrangler.toml` im Projekt-Root bereits konfiguriert
(`compatibility_flags = ["nodejs_compat"]`). Falls Cloudflare das nicht automatisch
übernimmt, zusätzlich manuell setzen: Pages-Projekt → **Settings** → **Functions** →
**Compatibility flags** → `nodejs_compat` für Production **und** Preview hinzufügen.

Normale Quittungen (ohne QR-Rechnung) nutzen weiterhin den einfachen
Browser-Druck (`window.print()`) — das hat schon immer zuverlässig funktioniert.

## Wichtig: Daten und Geräte

Firma-, Kunden- und Quittungsdaten liegen zentral in der D1-Datenbank. Jedes Gerät,
das sich erfolgreich anmeldet (PC, Handy-Browser), sieht dieselben, aktuellen Daten.
