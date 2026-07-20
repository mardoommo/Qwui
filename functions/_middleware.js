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

function unauthorized() {
  return new Response("Zugriff verweigert", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Qwui", charset="UTF-8"',
    },
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const password = env.SITE_PASSWORD;

  // Kein Passwort gesetzt -> App sicherheitshalber nicht offen lassen
  if (!password) {
    return unauthorized();
  }

  const authHeader = request.headers.get("Authorization");

  if (authHeader && authHeader.startsWith("Basic ")) {
    const encoded = authHeader.slice(6);
    const decoded = atob(encoded);
    const separatorIndex = decoded.indexOf(":");
    const enteredPassword = decoded.slice(separatorIndex + 1);

    if (enteredPassword === password) {
      return context.next(); // Zugriff erlaubt, normale Seite ausliefern
    }
  }

  return unauthorized();
}
