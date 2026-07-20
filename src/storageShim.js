// Ersetzt die Claude-Artifact-API "window.storage" durch echten Browser-localStorage,
// damit die App ausserhalb von Claude (Web, Electron, Android/Capacitor) funktioniert.
// Behält exakt dieselbe Signatur bei: get/set/delete/list(key, shared?)

const PREFIX = "quittungstool";

function fullKey(key, shared) {
  return `${PREFIX}:${shared ? "shared" : "personal"}:${key}`;
}

function scopePrefix(shared) {
  return `${PREFIX}:${shared ? "shared" : "personal"}:`;
}

export const storageShim = {
  async get(key, shared = false) {
    try {
      const raw = window.localStorage.getItem(fullKey(key, shared));
      if (raw === null) return null;
      return { key, value: raw, shared };
    } catch (e) {
      console.error("storage.get failed", e);
      throw e;
    }
  },

  async set(key, value, shared = false) {
    try {
      window.localStorage.setItem(fullKey(key, shared), value);
      return { key, value, shared };
    } catch (e) {
      console.error("storage.set failed", e);
      throw e;
    }
  },

  async delete(key, shared = false) {
    try {
      window.localStorage.removeItem(fullKey(key, shared));
      return { key, deleted: true, shared };
    } catch (e) {
      console.error("storage.delete failed", e);
      throw e;
    }
  },

  async list(prefix = "", shared = false) {
    try {
      const scoped = scopePrefix(shared);
      const search = scoped + prefix;
      const keys = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(search)) {
          keys.push(k.slice(scoped.length));
        }
      }
      return { keys, prefix, shared };
    } catch (e) {
      console.error("storage.list failed", e);
      throw e;
    }
  },
};

export function installStorageShim() {
  if (typeof window !== "undefined" && !window.storage) {
    window.storage = storageShim;
  }
}
