// Echter, serverseitiger Passwortschutz für Cloudflare Pages.
// Läuft auf Cloudflares Edge-Netzwerk, BEVOR irgendeine Datei ausgeliefert wird.
// Das Passwort steht nirgends im ausgelieferten JavaScript und kann nicht über
// "Seitenquelltext ansehen" ausgelesen werden.
//
// Passwort wird über die Umgebungsvariable SITE_PASSWORD im Cloudflare-Dashboard
// gesetzt (Pages-Projekt → Settings → Environment variables) — steht NIRGENDS im Code.
//
// Cloudflare Pages führt diese Datei automatisch für JEDEN Request aus, da sie unter
// /functions/_middleware.js liegt (Cloudflare-Konvention, kein Import nötig).

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000; // 15 Minuten

function unauthorized() {
  return new Response("Zugriff verweigert", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Qwui", charset="UTF-8"',
    },
  });
}

function tooManyAttempts(retryAfterSeconds) {
  return new Response("Zu viele fehlgeschlagene Versuche. Bitte später erneut versuchen.", {
    status: 429,
    headers: { "Retry-After": String(retryAfterSeconds) },
  });
}

// Vergleicht zwei Strings anhand ihres SHA-256-Hashs statt direkt als Text.
// Dadurch ist die Vergleichszeit unabhängig von Länge/Inhalt des eingegebenen
// Passworts (kein Timing-Seitenkanal, über den sich das echte Passwort
// zeichenweise erraten liesse).
async function constantTimeEqual(a, b) {
  const enc = new TextEncoder();
  const [digestA, digestB] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const viewA = new Uint8Array(digestA);
  const viewB = new Uint8Array(digestB);
  let diff = 0;
  for (let i = 0; i < viewA.length; i++) {
    diff |= viewA[i] ^ viewB[i];
  }
  return diff === 0;
}

// Einfache Rate-Limitierung gegen automatisiertes Passwort-Raten, gespeichert
// in derselben D1-Tabelle wie die App-Daten (kv_store). Zählt fehlgeschlagene
// Versuche pro IP in einem 15-Minuten-Fenster; ab MAX_ATTEMPTS wird die IP für
// den Rest des Fensters mit 429 abgewiesen, ohne das Passwort überhaupt zu
// prüfen. Erfolgreiche Logins verursachen bewusst KEINEN zusätzlichen
// D1-Zugriff (Fast Path), nur tatsächliche Fehlversuche.
async function recordFailedAttempt(db, ip) {
  const key = `ratelimit:auth:${ip}`;
  const now = Date.now();

  let state = { count: 0, windowStart: now };
  try {
    const row = await db.prepare("SELECT value FROM kv_store WHERE full_key = ?").bind(key).first();
    if (row) {
      const parsed = JSON.parse(row.value);
      if (Number.isFinite(parsed.windowStart) && now - parsed.windowStart < WINDOW_MS) {
        state = parsed;
      }
    }
  } catch (e) {
    // Kaputter/fehlender Eintrag -> bei 0 neu anfangen, kein harter Fehler.
  }

  state.count += 1;

  try {
    await db
      .prepare(
        `INSERT INTO kv_store (full_key, value, updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(full_key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
      )
      .bind(key, JSON.stringify(state))
      .run();
  } catch (e) {
    // D1 nicht erreichbar -> Rate-Limit fällt aus, Passwortschutz bleibt aber
    // über den normalen Vergleich bestehen. Kein Grund, den Request abzulehnen.
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((state.windowStart + WINDOW_MS - now) / 1000));
  return { blocked: state.count > MAX_ATTEMPTS, retryAfterSeconds };
}

export async function onRequest(context) {
  const { request, env } = context;
  const password = env.SITE_PASSWORD;

  // Kein Passwort gesetzt -> App sicherheitshalber nicht offen lassen
  if (!password) {
    return unauthorized();
  }

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const authHeader = request.headers.get("Authorization");

  if (authHeader && authHeader.startsWith("Basic ")) {
    try {
      const encoded = authHeader.slice(6);
      const decoded = atob(encoded);
      const separatorIndex = decoded.indexOf(":");
      const enteredPassword = decoded.slice(separatorIndex + 1);

      if (await constantTimeEqual(enteredPassword, password)) {
        return context.next(); // Zugriff erlaubt, normale Seite ausliefern
      }

      // Falsches Passwort -> Fehlversuch zählen und ggf. sperren. Bewusst
      // erst HIER (nicht schon vor dem Vergleich) geprüft, damit bereits
      // eingeloggte Nutzer mit korrektem Passwort keinen zusätzlichen
      // D1-Zugriff pro Request verursachen (Fast Path).
      const result = await recordFailedAttempt(env.DB, ip);
      if (result.blocked) {
        return tooManyAttempts(result.retryAfterSeconds);
      }
    } catch (e) {
      // Ungültiger Base64-Header (z.B. von automatisierten Scans) ->
      // sauber als "nicht autorisiert" behandeln statt mit 500 abzustürzen.
      await recordFailedAttempt(env.DB, ip);
    }
  }

  return unauthorized();
}
