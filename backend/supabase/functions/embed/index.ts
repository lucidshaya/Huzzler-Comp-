// Supabase Edge Function: text -> 384-dim gte-small embedding (free, runs inside Supabase).
// Deploy: supabase functions deploy embed
// deno-lint-ignore-file
const session = new Supabase.ai.Session("gte-small");

Deno.serve(async (req) => {
  const { input } = await req.json();
  if (typeof input !== "string" || !input.trim()) {
    return new Response(JSON.stringify({ error: "input required" }), { status: 400 });
  }
  const embedding = await session.run(input, { mean_pool: true, normalize: true });
  return new Response(JSON.stringify({ embedding }), { headers: { "Content-Type": "application/json" } });
});
