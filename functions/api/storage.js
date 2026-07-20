// API-Endpunkt für einzelne Schlüssel: /api/storage
// GET    /api/storage?key=X&shared=false   -> liest einen Wert
// POST   /api/storage  (Body: {key, value, shared})  -> speichert einen Wert
// DELETE /api/storage?key=X&shared=false   -> löscht einen Wert
//
// Läuft als Cloudflare Pages Function, geschützt durch functions/_middleware.js
// (dieselbe Passwortabfrage wie für die restliche Seite gilt automatisch auch hier).
//
// Braucht ein D1-Datenbank-Binding namens "DB" im Cloudflare-Dashboard
// (Pages-Projekt -> Settings -> Functions -> D1 database bindings).

function fullKey(key, shared) {
  return `${shared === "true" || shared === true ? "shared" : "personal"}:${key}`;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const shared = url.searchParams.get("shared") === "true";

  if (!key) {
    return new Response(JSON.stringify({ error: "key fehlt" }), { status: 400 });
  }

  const row = await env.DB.prepare("SELECT value FROM kv_store WHERE full_key = ?")
    .bind(fullKey(key, shared))
    .first();

  if (!row) {
    return new Response(JSON.stringify(null), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ key, value: row.value, shared }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const body = await request.json();
  const { key, value, shared } = body;

  if (!key || value === undefined) {
    return new Response(JSON.stringify({ error: "key oder value fehlt" }), { status: 400 });
  }

  await env.DB.prepare(
    `INSERT INTO kv_store (full_key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(full_key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  )
    .bind(fullKey(key, shared), value)
    .run();

  return new Response(JSON.stringify({ key, value, shared: !!shared }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const shared = url.searchParams.get("shared") === "true";

  if (!key) {
    return new Response(JSON.stringify({ error: "key fehlt" }), { status: 400 });
  }

  await env.DB.prepare("DELETE FROM kv_store WHERE full_key = ?")
    .bind(fullKey(key, shared))
    .run();

  return new Response(JSON.stringify({ key, deleted: true, shared }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
