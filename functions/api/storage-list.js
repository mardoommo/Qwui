// API-Endpunkt zum Auflisten von Schlüsseln: /api/storage-list
// GET /api/storage-list?prefix=X&shared=false -> Liste aller passenden Schlüssel
//
// Wird aktuell von der App nicht zwingend gebraucht (sie kennt ihre Schlüssel-Namen
// bereits fest, z.B. "customers-list"), ist aber Teil der vollständigen
// window.storage-kompatiblen API für zukünftige Erweiterungen.

function scopePrefix(shared) {
  return `${shared ? "shared" : "personal"}:`;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const prefix = url.searchParams.get("prefix") || "";
  const shared = url.searchParams.get("shared") === "true";

  const scoped = scopePrefix(shared);
  const searchPattern = `${scoped}${prefix}%`;

  const { results } = await env.DB.prepare(
    "SELECT full_key FROM kv_store WHERE full_key LIKE ?"
  )
    .bind(searchPattern)
    .all();

  const keys = (results || []).map((r) => r.full_key.slice(scoped.length));

  return new Response(JSON.stringify({ keys, prefix, shared }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
