// Kopiert den Vite-Produktions-Build aus dem Projekt-Root (../dist) nach
// desktop/dist, damit electron-builder ihn einpacken kann. electron-builder
// packt relativ zu desktop/, daher reicht ein direkter Verweis auf ../dist
// nicht — die Kopie hält das Electron-Teilprojekt eigenständig paketierbar.

import { cpSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = resolve(__dirname, "..", "..", "dist");
const dest = resolve(__dirname, "..", "dist");

if (!existsSync(src)) {
  console.error(
    "dist/ wurde im Projekt-Root nicht gefunden — zuerst dort `npm run build` ausführen."
  );
  process.exit(1);
}

if (existsSync(dest)) {
  rmSync(dest, { recursive: true, force: true });
}

cpSync(src, dest, { recursive: true });
console.log(`Web-Build kopiert: ${src} -> ${dest}`);
