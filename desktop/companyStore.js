// Speichert die Firmendaten (Name, Adresse, QR-Rechnungs-Konto, Logo) in einer
// einfachen firma.json im Datenordner. Kein Excel-Zellenlimit hier, daher bleibt
// logoDataUrl (Base64) einfach inline — anders als bei den Quittungen in
// excelStore.js, wo das Logo aus Platzgründen ausgelagert werden muss.

import { readFile, writeFile } from "node:fs/promises";
import { getCompanyPath } from "./dataDir.js";

export async function readCompany() {
  try {
    const raw = await readFile(getCompanyPath(), "utf-8");
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}

export async function writeCompany(company) {
  await writeFile(getCompanyPath(), JSON.stringify(company, null, 2), "utf-8");
}
