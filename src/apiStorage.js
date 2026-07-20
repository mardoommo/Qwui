// Ersetzt den bisherigen localStorage-Shim durch echte, zentrale Speicherung in
// Cloudflare D1 über die Pages Functions unter /api/storage. Gleiche Signatur wie
// zuvor (get/set/delete/list mit key + shared-Flag) — App.jsx muss dafür nicht
// angepasst werden.
//
// Die Basic-Auth-Anmeldedaten (Passwort) werden vom Browser automatisch bei jedem
// Request an dieselbe Domain mitgeschickt, sobald man einmal eingeloggt ist — die
// API-Endpunkte sind durch dieselbe functions/_middleware.js geschützt wie die Seite.

export const storageShim = {
  async get(key, shared = false) {
    const params = new URLSearchParams({ key, shared: String(shared) });
    const res = await fetch(`/api/storage?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`storage.get fehlgeschlagen: ${res.status}`);
    }
    const data = await res.json();
    return data; // null oder {key, value, shared}
  },

  async set(key, value, shared = false) {
    const res = await fetch(`/api/storage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value, shared }),
    });
    if (!res.ok) {
      throw new Error(`storage.set fehlgeschlagen: ${res.status}`);
    }
    return res.json();
  },

  async delete(key, shared = false) {
    const params = new URLSearchParams({ key, shared: String(shared) });
    const res = await fetch(`/api/storage?${params.toString()}`, { method: "DELETE" });
    if (!res.ok) {
      throw new Error(`storage.delete fehlgeschlagen: ${res.status}`);
    }
    return res.json();
  },

  async list(prefix = "", shared = false) {
    const params = new URLSearchParams({ prefix, shared: String(shared) });
    const res = await fetch(`/api/storage-list?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`storage.list fehlgeschlagen: ${res.status}`);
    }
    return res.json();
  },
};

export function installStorageShim() {
  if (typeof window !== "undefined") {
    window.storage = storageShim;
  }
}
