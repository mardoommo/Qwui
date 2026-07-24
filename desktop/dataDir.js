// Ermittelt den lokalen Datenordner für die Desktop-Version und legt ihn beim
// ersten Start an. Bewusst NICHT relativ zur .exe: Der "portable" Windows-Build
// entpackt sich bei jedem Start in einen wechselnden Temp-Ordner — Daten dort
// abzulegen würde sie bei jedem Neustart der App verschwinden lassen.
// app.getPath('documents') ist stabil und unabhängig davon, wo/wie sich die
// .exe gerade entpackt hat.

import { app } from "electron";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const FOLDER_NAME = "Qwui-Daten";

let cachedDir = null;

export function getDataDir() {
  if (cachedDir) return cachedDir;
  // Override für Tests/Entwicklung (siehe README) — im normalen Betrieb nicht
  // gesetzt, dann immer der stabile Documents-Pfad.
  const base = process.env.QWUI_DATA_DIR || app.getPath("documents");
  const dir = process.env.QWUI_DATA_DIR ? base : join(base, FOLDER_NAME);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const logosDir = join(dir, "logos");
  if (!existsSync(logosDir)) {
    mkdirSync(logosDir, { recursive: true });
  }
  cachedDir = dir;
  return dir;
}

export function getLogosDir() {
  return join(getDataDir(), "logos");
}

export function getWorkbookPath() {
  return join(getDataDir(), "Qwui-Daten.xlsx");
}

export function getCompanyPath() {
  return join(getDataDir(), "firma.json");
}
