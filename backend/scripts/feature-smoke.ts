// Feature smoke test against a running API: help bot + report an issue + support inbox, then
// (once migration 20261021000001 is applied) opportunities → accept → squad workspace, tokens and
// the Workstation, identity portfolio, admin listings/tokens/invites and the AI PM portal.
// Creates throwaway users and deletes everything it created, including token pool changes.
//   npm run dev            (in another terminal)
//   npx tsx scripts/feature-smoke.ts
// The script's own process never sends email; the running API sends the new-report email.
// Empty (not deleted): dotenv won't refill a key that exists, and the config treats "" as unset.
process.env.SMTP_HOST = "";
process.env.RESEND_API_KEY = "";

const { db, anon } = await import("../src/lib/supabase.js");
const { env } = await import("../src/config/env.js");

const API = `${process.env.E2E_API ?? `http://localhost:${env.PORT}`}/api`;
const stamp = Date.now().toString(36);
const created = { users: [] as string[], teams: [] as string[], listings: [] as string[], invites: [] as string[], tickets: [] as string[] };
let failures = 0;
let pool0: { balance: number; lifetime_funded: number; lifetime_granted: number } | null = null;

const ok = (msg: string) => console.log(`  ✓ ${msg}`);
const bad = (msg: string, extra?: unknown) => {
  failures++;
  console.log(`  ✗ ${msg}`, extra === undefined ? "" : JSON.stringify(extra).slice(0, 400));
};
async function call<T = any>(token: string | null, path: string, method = "GET", body?: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}
async function expect2xx<T = any>(token: string | null, label: string, path: string, method = "GET", body?: unknown): Promise<T | null> {
  const r = await call<T>(token, path, method, body);
  if (r.status >= 200 && r.status < 300) {
    ok(label);
    return r.data;
  }
  bad(`${label} → ${r.status}`, r.data);
  return null;
}

async function makeUser(n: number) {
  const email = `huzzler.e2e+feat${stamp}-${n}@example.com`;
  const password = `E2e!${stamp}pass`;
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `Feature Test ${n}` } });
  if (error) throw error;
  created.users.push(data.user!.id);
  const { data: s, error: e2 } = await anon.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { id: data.user!.id, email, token: s.session!.access_token };
}

async function adminToken() {
  const r = await call(null, "/admin/auth/login", "POST", { username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD });
  if (!r.data?.access_token) throw new Error(`admin login failed: ${JSON.stringify(r.data)}`);
  return r.data.access_token as string;
}

async function supportAndHelp(u: { id: string; token: string }, admin: string) {
  console.log("\n▶ Help bot");
  const sugg = await expect2xx<string[]>(u.token, "suggested questions", "/help/suggestions");
  if (sugg && !sugg.length) bad("no suggested questions (approve some FAQ entries)");
  const a = await expect2xx<any>(u.token, "ask a FAQ question", "/help/ask", "POST", { question: sugg?.[0] ?? "How much does Huzzler cost?" });
  a?.source === "faq" || a?.source === "ai" ? ok(`answered from ${a.source}`) : bad("FAQ question not answered", a);
  if (a?.id) await expect2xx(u.token, "rate the answer", "/help/feedback", "POST", { id: a.id, helpful: true });
  const none = await expect2xx<any>(u.token, "ask something the FAQ can't answer", "/help/ask", "POST", { question: "zxqv purple elephant quantum soup" });
  none?.source === "none" ? ok("unanswered question falls back to 'report an issue'") : bad("expected source none", none);

  if (process.env.E2E_SKIP_REPORT) return console.log("\n▶ Report an issue: skipped (E2E_SKIP_REPORT, avoids emailing support)");
  console.log("\n▶ Report an issue");
  const up = await expect2xx<any>(u.token, "screenshot upload URL", "/support/upload-url", "POST", { ext: "png" });
  let attachment: string | undefined;
  if (up) {
    // 1x1 PNG
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    const { error } = await db.storage.from("submissions").uploadToSignedUrl(up.path, up.token, png, { contentType: "image/png" });
    error ? bad("screenshot upload", error.message) : ok("screenshot uploaded");
    attachment = error ? undefined : up.path;
  }
  const started = Date.now();
  const t = await expect2xx<any>(u.token, "create a report", "/support/tickets", "POST", {
    category: "bug",
    subject: `Feature smoke ${stamp}`,
    body: "Automated check of the report flow. Please ignore — it's deleted right after the test.",
    page_url: "/dashboard",
    user_agent: "feature-smoke",
    attachment_path: attachment,
  });
  if (t) {
    created.tickets.push(t.id);
    Date.now() - started < 8000 ? ok(`report saved in ${Date.now() - started} ms (email sent in the background)`) : bad(`report took ${Date.now() - started} ms`);
  }
  const list = await expect2xx<any[]>(u.token, "list my reports", "/support/tickets");
  if (t && !list?.some((x) => x.id === t.id)) bad("new report missing from my list");
  if (t) {
    const th = await expect2xx<any>(u.token, "open my report", `/support/tickets/${t.id}`);
    th?.messages?.[0]?.attachment_url ? ok("screenshot visible in the thread") : attachment ? bad("screenshot missing from thread") : null;
    await expect2xx(u.token, "reply to my report", `/support/tickets/${t.id}/messages`, "POST", { body: "Adding a detail." });
    const inbox = await expect2xx<any[]>(admin, "staff inbox (All)", "/admin/support?status=all");
    inbox?.some((x) => x.id === t.id) ? ok("report appears in the staff inbox") : bad("report missing from staff inbox");
    await expect2xx(admin, "open in inbox", `/admin/support/${t.id}`);
    await expect2xx(admin, "staff reply", `/admin/support/${t.id}/messages`, "POST", { body: "Thanks, looking into it." });
    const unread = await expect2xx<any>(u.token, "unread count", "/support/unread");
    unread?.unread >= 1 ? ok("user sees the staff reply as unread") : bad("unread not set", unread);
    await expect2xx(admin, "resolve report", `/admin/support/${t.id}`, "PATCH", { status: "resolved" });
  }
}

async function migrationApplied() {
  const { data, error } = await db.from("token_pool").select("balance").eq("id", 1).maybeSingle();
  return !error && Boolean(data);
}

async function journeyToOffers(u: { id: string }) {
  // Shortcut through onboarding (covered by e2e-smoke): a verified software engineer with a passing score.
  await db.from("profiles").update({ full_name: "Feature Test Learner", username: `feat_${stamp}`, role_id: "software_engineer", hours_per_week: 10, dob: "2000-01-01", phone: "+2348012345678" }).eq("id", u.id);
  await db.from("user_journey").update({ status: "TESTS_PASSED", plan_id: "one_time", access_expires_at: new Date(Date.now() + 90 * 86_400_000).toISOString() }).eq("user_id", u.id);
  const { generateOffers } = await import("../src/services/offers.js");
  await generateOffers(u.id);
}

async function opportunitiesAndWorkspace(u: { id: string; token: string }, admin: string) {
  console.log("\n▶ Opportunities");
  const { data: p } = await db.from("token_pool").select("balance, lifetime_funded, lifetime_granted").eq("id", 1).single();
  pool0 = { balance: Number(p!.balance), lifetime_funded: Number(p!.lifetime_funded), lifetime_granted: Number(p!.lifetime_granted) };
  await expect2xx(admin, "fund the token pool", "/admin/tokens/fund", "POST", { amount: 5000, note: `feature smoke ${stamp}` });

  await journeyToOffers(u);
  const offers = await expect2xx<any[]>(u.token, "list opportunities", "/offers");
  const open = (offers ?? []).filter((o) => o.stage === "offers");
  open.length ? ok(`${open.length} open opportunities`) : bad("no opportunities generated", offers);
  const o = open[0];
  if (o) {
    o.title && o.location && typeof o.match_score === "number" ? ok(`listing data: "${o.title}" at ${o.persona?.name}, ${o.match_score}% match, +${o.stipend_tokens} tokens`) : bad("offer missing listing fields", o);
  }
  if (open[1]) {
    await expect2xx(u.token, "decline one", `/offers/${open[1].id}/respond`, "POST", { accept: false });
    const after = await call<any[]>(u.token, "/offers");
    const d = after.data?.find((x) => x.id === open[1].id);
    d?.stage === "rejected" && d.can_restore ? ok("declined offer is in Rejected and restorable") : bad("decline/restore state wrong", d);
    await expect2xx(u.token, "restore it", `/offers/${open[1].id}/restore`, "POST");
  }
  if (!o) return;
  const acc = await expect2xx<any>(u.token, "accept", `/offers/${o.id}/respond`, "POST", { accept: true });
  acc?.placed ? ok("accepting placed them on a squad straight away") : bad("not placed on accept", acc);
  if (o.stipend_tokens) acc?.stipend_tokens > 0 ? ok(`stipend paid: +${acc.stipend_tokens} tokens`) : bad("stipend not paid", acc);
  const team = await expect2xx<any>(u.token, "GET /team", "/team");
  if (team?.team) {
    created.teams.push(team.team.id);
    ok(`squad "${team.team.name}" (${team.members.length} seats, ${team.members.filter((m: any) => m.is_standin).length} stand-ins)`);
  } else bad("no team after accept");
  const ws = await expect2xx<any>(u.token, "GET /workspace", "/workspace");
  ws?.project ? ok(`project started: ${ws.project.template?.title} (${ws.tasks.length} tasks)`) : bad("no project in workspace", ws);
  const after = await call<any[]>(u.token, "/offers");
  after.data?.find((x) => x.id === o.id)?.stage === "active" ? ok("accepted opportunity shows as Active") : bad("accepted opportunity not Active");
  await expect2xx(u.token, "squad stand-ups", "/team/checkins");

  console.log("\n▶ Tokens & Workstation");
  const w0 = await expect2xx<any>(u.token, "wallet", "/billing/tokens");
  w0?.prices?.length >= 6 && w0?.packs?.length === 3 ? ok(`balance ${w0.balance}, ${w0.packs.length} packs, ${w0.prices.length} prices`) : bad("wallet shape", w0);
  await expect2xx(admin, "grant 300 tokens to the learner", "/admin/tokens/grant", "POST", { user_id: u.id, amount: 300, note: "smoke" });
  const ws0 = await expect2xx<any>(u.token, "Workstation state", "/workstation");
  const start = ws0?.balance ?? 0;
  const v = await expect2xx<any>(u.token, "Voice Studio summary", "/workstation/run", "POST", { action: "voice_summary", transcript: "Yesterday I finished the spec. Today I will build the API. Waiting on design." });
  v?.output?.blockers?.includes("Waiting") ? ok(`stand-up parsed (${v.engine})`) : bad("voice summary output", v);
  const c = await expect2xx<any>(u.token, "Logic Canvas node", "/workstation/run", "POST", { action: "logic_canvas", prompt: "If payment fails, retry twice" });
  c?.output?.nodes?.length >= 5 ? ok("node added and canvas saved") : bad("canvas output", c);
  const f = await expect2xx<any>(u.token, "Data Forge SQL", "/workstation/run", "POST", { action: "data_forge", question: "weekly signups by region" });
  const spent = (v?.cost ?? 0) + (c?.cost ?? 0) + (f?.cost ?? 0);
  f?.balance === start - spent ? ok(`charged ${spent} tokens; balance ${f.balance}`) : bad("balance after runs", { start, spent, got: f?.balance });
  await expect2xx(u.token, "save canvas", "/workstation/canvas", "PUT", { nodes: [{ id: "n1", label: "Start", kind: "trigger" }] });
  await expect2xx(u.token, "post the summary as a check-in", "/checkins", "POST", { yesterday: v?.output?.shipped ?? "Spec", today: v?.output?.today ?? "API", blockers: "Waiting on design" });
  await db.from("token_wallets").update({ balance: 0 }).eq("user_id", u.id);
  const broke = await call(u.token, "/workstation/run", "POST", { action: "data_forge", question: "anything at all here" });
  broke.status === 402 && broke.data?.code === "INSUFFICIENT_TOKENS" ? ok("out of tokens → 402 with a top-up prompt") : bad("insufficient tokens not enforced", broke);
  const buy = await call<any>(u.token, "/billing/tokens/initialize", "POST", { pack_id: "starter" });
  buy.data?.authorization_url ? ok("Paystack checkout started for a token pack") : bad("token checkout", buy);
  if (buy.data?.reference) await db.from("token_purchases").delete().eq("reference", buy.data.reference);

  console.log("\n▶ Identity portfolio");
  const id = await expect2xx<any>(u.token, "GET /me/identity", "/me/identity");
  id?.badges?.length && id.heatmap && Object.values(id.heatmap).some((d: any) => d.workstation > 0) ? ok(`${id.badges.length} badges, today's Workstation runs on the heatmap`) : bad("identity shape", id);
}

async function resumeBuilder(u: { id: string; token: string }, admin: string) {
  console.log("\n▶ Profile → AI résumé");
  await expect2xx(admin, "grant 120 tokens for the résumé", "/admin/tokens/grant", "POST", { user_id: u.id, amount: 120, note: "smoke résumé" });
  const s0 = await expect2xx<any>(u.token, "GET /cv", "/cv");
  s0?.cost > 0 ? ok(`draft costs ${s0.cost} tokens; balance ${s0.balance}`) : bad("no résumé price", s0);
  const w = await call<any>(u.token, "/billing/tokens");
  w.data?.prices?.some((p: any) => p.action === "cv_generate") ? ok("résumé price listed in Billing") : bad("résumé price missing from Billing");
  const g = await expect2xx<any>(u.token, "draft my résumé", "/cv/generate", "POST", { target_role: "Junior Platform Engineer", background: "BSc Computer Science, University of Lagos, 2022 – 2026" });
  if (g) {
    g.balance === s0.balance - s0.cost ? ok(`charged ${g.charged} tokens (${g.engine}); balance ${g.balance}`) : bad("résumé charge wrong", { before: s0.balance, after: g.balance });
    g.cv?.full_name && g.cv?.experience?.length ? ok(`résumé: "${g.cv.headline}" with ${g.cv.experience.length} role(s), ${g.cv.projects.length} project(s)`) : bad("résumé content thin", g.cv);
    g.cv?.education?.[0]?.school === "University of Lagos" ? ok("education taken from the user's notes") : bad("education", g.cv?.education);
    const edited = { ...g.cv, headline: "Edited headline" };
    await expect2xx(u.token, "save edits (free)", "/cv", "PUT", { content: edited });
    const s1 = await call<any>(u.token, "/cv");
    s1.data?.cv?.headline === "Edited headline" && s1.data.balance === g.balance ? ok("edit saved without charging") : bad("edit not saved / charged", s1.data);
  }
  await db.from("token_wallets").update({ balance: 10 }).eq("user_id", u.id);
  const broke = await call(u.token, "/cv/generate", "POST", {});
  broke.status === 402 && broke.data?.code === "INSUFFICIENT_TOKENS" ? ok("not enough tokens → 402, nothing charged") : bad("insufficient tokens not enforced", broke);
  const after = await call<any>(u.token, "/cv");
  after.data?.balance === 10 ? ok("balance untouched after refusal") : bad("balance changed", after.data?.balance);
}

async function adminSide(admin: string) {
  console.log("\n▶ Admin");
  const who = await expect2xx<any>(admin, "whoami", "/admin/whoami");
  who?.full_name !== undefined ? ok(`signed in as ${who.full_name ?? "admin"} (${who.role})`) : null;
  const home = await expect2xx<any>(admin, "my dashboard", "/admin/home");
  home?.cards?.length ? ok(`${home.cards.length} home cards`) : bad("home cards", home);
  await expect2xx(admin, "overview", "/admin/overview");
  await expect2xx(admin, "team list", "/admin/staff");
  await expect2xx(admin, "onboarding grading queue", "/admin/grading/review");
  await expect2xx(admin, "onboarding appeals", "/admin/appeals");
  const emails = await expect2xx<any>(admin, "emails config", "/admin/emails");
  if (emails?.configured) ok(`bulk email ready via ${emails.provider}`);
  else if (process.env.E2E_NO_EMAIL) ok("bulk email off for this run (E2E_NO_EMAIL)");
  else bad("bulk email not configured", emails);

  if (!(await migrationApplied())) return;
  const l = await expect2xx<any>(admin, "create a listing", "/admin/listings", "POST", {
    name: `Smoke Co ${stamp}`, title: "QA Intern", archetype_id: "saas_mobile", engagement_type: "internship", location: "Remote", compensation: "₦100k / mo",
    stipend_tokens: 500, duration_weeks: 6, role_ids: ["qa_engineer"], mission: "Test the listing editor end to end.", product_brief: "A listing created by the feature smoke test.", culture: "Throwaway.", status: "draft",
  });
  if (l?.id) {
    created.listings.push(l.id);
    await expect2xx(admin, "edit the listing", `/admin/listings/${l.id}`, "PUT", { status: "approved", stipend_tokens: 600 });
    const all = await expect2xx<any[]>(admin, "list listings", "/admin/listings");
    all?.find((x) => x.id === l.id)?.stipend_tokens === 600 ? ok("edit saved") : bad("edit not saved");
    const del = await expect2xx<any>(admin, "delete the listing", `/admin/listings/${l.id}`, "DELETE");
    if (del?.deleted) created.listings.pop();
  }
  await expect2xx(admin, "offer pipeline", "/admin/offers");
  const tk = await expect2xx<any>(admin, "token pool", "/admin/tokens");
  tk?.prices?.length >= 6 ? ok(`pool ${tk.pool.balance}, ${tk.paid_users} paid members`) : bad("token summary", tk);
  const price = tk?.prices?.[0];
  if (price) {
    await expect2xx(admin, "change a price", `/admin/tokens/prices/${price.action}`, "PUT", { cost: price.cost + 1 });
    await expect2xx(admin, "put the price back", `/admin/tokens/prices/${price.action}`, "PUT", { cost: price.cost });
  }

  console.log("\n▶ Staff invites (no account needed)");
  const { createInvite } = await import("../src/services/staff.js");
  const me = await call<any>(admin, "/admin/whoami");
  const inv = await createInvite(me.data.id, { email: `huzzler.e2e+invite${stamp}@example.com`, app_role: "project_manager", staff_title: "Smoke PM" });
  created.invites.push(inv.id);
  const token = inv.link.split("/invite/")[1];
  const list = await expect2xx<any[]>(admin, "pending invites", "/admin/staff/invites");
  list?.some((i) => i.id === inv.id) ? ok("invite listed") : bad("invite missing");
  const info = await expect2xx<any>(null, "open invite link", `/invites/${token}`);
  info?.app_role === "project_manager" && info?.has_account === false ? ok("invite shows the role and needs no account") : bad("invite info", info);
  const acc = await expect2xx<any>(null, "accept invite", `/invites/${token}/accept`, "POST", { full_name: "Smoke PM", username: `smoke_pm_${stamp}`, password: `Smoke!${stamp}pw` });
  if (acc) {
    acc.portal === "/aipm" ? ok("project manager is sent to the AI PM portal") : bad("wrong portal", acc);
    const { data: p } = await db.from("profiles").select("id, app_role").eq("username", acc.username).single();
    if (p) created.users.push(p.id);
    p?.app_role === "project_manager" ? ok("account created with the invited role") : bad("role not applied", p);
    const login = await call<any>(null, "/admin/auth/login", "POST", { username: acc.username, password: `Smoke!${stamp}pw` });
    login.data?.portal === "/aipm" ? ok("new staff member can sign in") : bad("new staff sign-in", login.data);
    const again = await call(null, `/invites/${token}/accept`, "POST", { full_name: "Second Try", username: `again_${stamp}`, password: "whatever123" });
    again.status === 409 ? ok("invite link can't be reused") : bad("invite reused", again);

    console.log("\n▶ AI PM portal (as the invited project manager)");
    const pm = login.data?.access_token;
    if (pm) {
      const st = await expect2xx<any>(pm, "AI status", "/aipm/ai/status");
      st && typeof st.configured === "boolean" ? ok(`AI ${st.configured ? "connected" : "not connected (rules engine)"}`) : null;
      const dec = await expect2xx<any[]>(pm, "decision log", "/aipm/ai/decisions");
      dec?.some((d) => d.kind === "squad_matching") && dec?.some((d) => d.kind === "offer_ranking") ? ok("matching and opportunity-ranking reasoning logged") : bad("decisions missing", dec?.map((d) => d.kind));
      await expect2xx(pm, "matching dry run", "/aipm/ai/matching-preview");
      await expect2xx(pm, "project grading queue", "/aipm/grading");
      const ob = await call(pm, "/admin/grading/review");
      ob.status === 403 ? ok("project managers can't open onboarding grading") : bad("PM reached admin grading", ob.status);
    }
  }
}

async function cleanup() {
  console.log("\n▶ Cleanup");
  for (const t of created.tickets) await db.from("support_tickets").delete().eq("id", t);
  for (const t of created.teams) {
    await db.from("ai_decisions").delete().eq("team_id", t);
    await db.from("teams").delete().eq("id", t);
  }
  for (const l of created.listings) await db.from("company_personas").delete().eq("id", l);
  for (const i of created.invites) await db.from("staff_invites").delete().eq("id", i);
  for (const u of created.users) {
    await db.from("ai_decisions").delete().eq("user_id", u);
    await db.from("cv_documents").delete().eq("user_id", u);
    await db.from("help_queries").delete().eq("user_id", u);
    await db.from("offers").delete().eq("user_id", u);
    await db.from("audit_logs").delete().eq("actor_id", u);
    await db.from("profiles").update({ app_role: "user" }).eq("id", u);
    const { error } = await db.auth.admin.deleteUser(u);
    if (error) console.log(`  could not delete ${u}: ${error.message}`);
  }
  await db.from("audit_logs").delete().in("target_id", created.users);
  if (pool0) {
    // Put the pool back exactly as it was; the test's pool ledger rows go too.
    await db.from("token_pool").update(pool0).eq("id", 1);
    await db.from("token_ledger").delete().is("user_id", null).ilike("label", `%${stamp}%`);
    await db.from("token_ledger").delete().is("user_id", null).in("reference", created.users);
    await db.from("audit_logs").delete().eq("action", "tokens.pool_funded").contains("details", { note: `feature smoke ${stamp}` });
  }
  console.log(`  removed ${created.users.length} users, ${created.teams.length} team(s), ${created.tickets.length} report(s), ${created.invites.length} invite(s)`);
}

try {
  const admin = await adminToken();
  const u = await makeUser(1);
  await supportAndHelp(u, admin);
  if (await migrationApplied()) {
    await opportunitiesAndWorkspace(u, admin);
    await resumeBuilder(u, admin);
  }
  else console.log("\n▶ Skipping opportunities/tokens/workstation: migration 20261021000001 isn't applied yet");
  await adminSide(admin);
} catch (err) {
  bad("crashed", err instanceof Error ? err.message : err);
} finally {
  await cleanup();
  console.log(failures ? `\n✗ ${failures} check(s) failed` : "\n✓ All checks passed");
  process.exit(failures ? 1 : 0);
}
