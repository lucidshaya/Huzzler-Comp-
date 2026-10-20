// End-to-end smoke test against a running API (start it with AI_MOCK=true).
// Creates throwaway users, drives the whole journey through the HTTP API, exercises the admin
// endpoints with the configured admin account, then deletes everything it created.
//   AI_MOCK=true npm run dev   (in another terminal)
//   npx tsx scripts/e2e-smoke.ts
import { db, anon } from "../src/lib/supabase.js";
import { env } from "../src/config/env.js";
import { applySuccessfulCharge } from "../src/services/payments.js";
import { runMatching } from "../src/services/teams.js";

const BASE = process.env.E2E_API ?? `http://localhost:${env.PORT}`;
const API = `${BASE}/api`;
const stamp = Date.now().toString(36);
const created: { users: string[]; teams: string[] } = { users: [], teams: [] };
let failures = 0;

const ok = (msg: string) => console.log(`  ✓ ${msg}`);
const bad = (msg: string, extra?: unknown) => {
  failures++;
  console.log(`  ✗ ${msg}`, extra ?? "");
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
async function expect2xx(token: string | null, label: string, path: string, method = "GET", body?: unknown) {
  const r = await call(token, path, method, body);
  if (r.status >= 200 && r.status < 300) ok(label);
  else bad(`${label} → ${r.status}`, r.data);
  return r.data;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until<T>(label: string, fn: () => Promise<T | null | undefined | false>, timeoutMs = 30_000): Promise<T | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = await fn();
    if (v) return v as T;
    await sleep(800);
  }
  bad(`timed out waiting for: ${label}`);
  return null;
}

async function makeUser(role: string, n: number) {
  const email = `huzzler.e2e+${stamp}-${n}@example.com`;
  const password = `E2e!${stamp}pass`;
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `E2E ${role}` } });
  if (error) throw error;
  created.users.push(data.user!.id);
  const { data: s, error: e2 } = await anon.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { id: data.user!.id, token: s.session!.access_token, role };
}

async function onboard(u: { id: string; token: string; role: string }, n: number) {
  console.log(`\n▶ User ${n} (${u.role})`);
  const t = u.token;
  await expect2xx(t, "GET /me", "/me");
  const blocked = await call(t, "/me/profile", "PUT", { full_name: "Too Young", username: `young${stamp}${n}`, dob: "2012-01-01", phone: "+2348012345678", timezone: "Africa/Lagos", hours_per_week: 10 });
  blocked.status === 400 ? ok("under-17 blocked") : bad("under-17 not blocked", blocked);
  await expect2xx(t, "update profile", "/me/profile", "PUT", { full_name: `E2E User ${n}`, username: `e2e_${stamp}_${n}`, dob: "2000-05-05", phone: "+2348012345678", timezone: "Africa/Lagos", hours_per_week: 10 });
  const early = await call(t, "/billing/initialize", "POST", { plan: "one_time" });
  early.status === 409 ? ok("payment refused before onboarding") : bad("payment allowed too early", early);
  await expect2xx(t, "choose field", "/me/field", "POST", { role_id: u.role });
  await expect2xx(t, "preview seen", "/me/preview", "POST");
  const tooSoon = await call(t, "/onboarding", "GET");
  tooSoon.status === 403 ? ok("tests locked before payment") : bad("tests open before payment", tooSoon);
  await expect2xx(t, "record consents", "/me/consents", "POST", { items: ["terms", "privacy", "ai_grading", "cross_border"].map((type) => ({ type, granted: true })).concat([{ type: "marketing", granted: false }]) });
  const j = await expect2xx(t, "begin onboarding", "/me/begin-onboarding", "POST");
  j?.status === "PAYMENT_PENDING" ? ok("journey → PAYMENT_PENDING") : bad("unexpected status", j?.status);

  const init = await expect2xx(t, "Paystack initialize (test mode)", "/billing/initialize", "POST", { plan: "one_time" });
  if (init?.reference) {
    const fake = { id: Math.floor(Math.random() * 1e9), status: "success", reference: init.reference, amount: 500000, currency: "NGN", channel: "card", paid_at: new Date().toISOString(), metadata: { user_id: u.id }, customer: { email: "huzzler.e2e@example.com", customer_code: `CUS_e2e_${n}` } } as any;
    const r1 = await applySuccessfulCharge(fake, "webhook");
    const r2 = await applySuccessfulCharge(fake, "verify");
    r1.applied && !r2.applied ? ok("charge applied exactly once (webhook + verify)") : bad("idempotency broken", { r1, r2 });
    const tampered = await applySuccessfulCharge({ ...fake, reference: init.reference, amount: 100 } as any, "webhook");
    !tampered.applied ? ok("wrong amount rejected") : bad("wrong amount accepted");
  }
  const billing = await expect2xx(t, "GET /billing", "/billing");
  billing?.status === "PAID" ? ok("journey → PAID") : bad("not PAID", billing?.status);

  await expect2xx(t, "start attempt", "/onboarding/start", "POST");
  for (let no = 1; no <= 5; no++) {
    const test = await expect2xx(t, `T${no}: open`, `/onboarding/tests/${no}`);
    if (!test) continue;
    if (test.test?.content && JSON.stringify(test).includes("answer_key")) bad(`T${no}: answer key leaked to client`);
    await expect2xx(t, `T${no}: start timer`, `/onboarding/tests/${no}/start`, "POST");
    const { data: bank } = await db.from("test_bank").select("kind, answer_key, content").eq("role_id", u.role).eq("test_no", no).eq("version", 1).single();
    const k = bank!.answer_key as any;
    let answers: any;
    switch (bank!.kind) {
      case "mcq":
        answers = { answers: k.answers };
        break;
      case "sjt":
        answers = { answers: Object.fromEntries(Object.entries(k.scores).map(([q, opts]: any) => [q, Object.entries(opts).sort((a: any, b: any) => b[1] - a[1])[0][0]])) };
        break;
      case "ranking":
        answers = { order: k.order };
        break;
      case "seeded_issues":
        answers = { found: k.issues.map((i: any) => ({ target: i.target, category: i.category })) };
        break;
      case "numeric":
        answers = { answers: Object.fromEntries(Object.entries(k.answers).map(([q, v]: any) => [q, String(v.value)])) };
        break;
      default:
        answers = { text: ("This is a thorough, structured answer covering the problem, users, scope, non-goals, requirements with acceptance criteria, success metrics and risks. ").repeat(30) };
    }
    await expect2xx(t, `T${no}: autosave draft`, `/onboarding/tests/${no}/draft`, "PUT", { draft: answers });
    await expect2xx(t, `T${no}: submit`, `/onboarding/tests/${no}/submit`, "POST", { answers, ai_declaration: true });
  }
  const results = await until("attempt graded", async () => {
    const r = await call(t, "/onboarding/results");
    return r.data?.result ? r.data : null;
  }, 45_000);
  if (results) results.result.passed ? ok(`passed onboarding (${results.result.weighted_score}%)`) : bad("did not pass", results.result);
  const offers = await until("offers generated", async () => {
    const r = await call(t, "/offers");
    return Array.isArray(r.data) && r.data.length ? r.data : null;
  });
  return offers;
}

async function main() {
  console.log(`E2E smoke against ${API}`);
  const health = await fetch(`${BASE}/health`).then((r) => r.json()).catch(() => null);
  if (!health?.ok) throw new Error("API not running. Start it with: AI_MOCK=true npm run dev");

  console.log("\n▶ Security");
  for (const [path, method] of [["/me", "GET"], ["/onboarding", "GET"], ["/admin/overview", "GET"], ["/billing/initialize", "POST"]] as const) {
    const r = await call(null, path, method, method === "POST" ? {} : undefined);
    r.status === 401 ? ok(`${method} ${path} needs auth`) : bad(`${method} ${path} open without auth`, r.status);
  }
  const forged = await call(null, "/webhooks/paystack", "POST", { event: "charge.success", data: { reference: "x" } });
  forged.status === 401 ? ok("unsigned webhook rejected") : bad("unsigned webhook accepted", forged.status);

  const pm = await makeUser("product_manager", 1);
  const tw = await makeUser("technical_writer", 2);
  const userAsAdmin = await call(pm.token, "/admin/overview");
  userAsAdmin.status === 403 ? ok("normal user blocked from admin") : bad("normal user reached admin", userAsAdmin.status);

  const o1 = await onboard(pm, 1);
  const o2 = await onboard(tw, 2);

  console.log("\n▶ Offers & matching");
  if (o1 && o2) {
    const decline = await call(tw.token, `/offers/${o2[o2.length - 1].id}/respond`, "POST", { accept: false });
    decline.status === 200 ? ok("decline offer") : bad("decline offer", decline);
    const open2 = (await call(tw.token, "/offers")).data.filter((o: any) => o.status === "pending");
    const a1 = await call(pm.token, `/offers/${o1[0].id}/respond`, "POST", { accept: true });
    a1.status === 200 ? ok("accept offer (user 1)") : bad("accept offer", a1);
    const pick2 = open2[0] ?? (await until("replacement offer", async () => (await call(tw.token, "/offers")).data.find((o: any) => o.status === "pending")));
    if (pick2) {
      const a2 = await call(tw.token, `/offers/${pick2.id}/respond`, "POST", { accept: true });
      a2.status === 200 ? ok("accept offer (user 2)") : bad("accept offer 2", a2);
    }
    // Same archetype + waited past 72h so the stand-in rule lets a 2-person team start.
    const { data: acc1 } = await db.from("offers").select("archetype_id, persona_id, cohort_id").eq("user_id", pm.id).eq("status", "accepted").single();
    const old = new Date(Date.now() - 4 * 86_400_000).toISOString();
    await db.from("offers").update({ archetype_id: acc1!.archetype_id, persona_id: acc1!.persona_id, cohort_id: acc1!.cohort_id, responded_at: old }).in("user_id", [pm.id, tw.id]).eq("status", "accepted");
    await runMatching();
  }
  const team = await until("team formed", async () => {
    const r = await call(pm.token, "/team");
    return r.data?.team ? r.data : null;
  });
  if (team) {
    created.teams.push(team.team.id);
    ok(`team "${team.team.name}" with ${team.members.length} seats (${team.members.filter((m: any) => m.is_standin).length} stand-ins)`);
  }

  console.log("\n▶ Workspace (create / read / update)");
  const ws = await expect2xx(pm.token, "GET /workspace", "/workspace");
  const myTask = ws?.tasks?.find((x: any) => x.assignee_id === pm.id);
  if (myTask) {
    await expect2xx(pm.token, "read task", `/tasks/${myTask.id}`);
    await expect2xx(pm.token, "update task status", `/tasks/${myTask.id}`, "PATCH", { status: "in_progress" });
    const notMine = await call(tw.token, `/tasks/${myTask.id}`, "PATCH", { status: "blocked" });
    notMine.status === 403 ? ok("teammate can't change someone else's task") : bad("ownership check missing", notMine.status);
    const early = await call(pm.token, `/mentor/${myTask.id}`, "POST", { question: "How should I start?" });
    early.status === 403 ? ok("mentor locked until 3 hints") : bad("mentor open too early", early.status);
    for (let i = 0; i < 3; i++) await expect2xx(pm.token, `unlock hint ${i + 1}`, `/tasks/${myTask.id}/hints`, "POST");
    const m = await expect2xx(pm.token, "ask mentor", `/mentor/${myTask.id}`, "POST", { question: "What should a good spec include here?" });
    m?.reply ? ok(`mentor replied (${m.source})`) : bad("no mentor reply");
    await expect2xx(pm.token, "submit deliverable", `/tasks/${myTask.id}/deliverables`, "POST", { content: "Spec: problem, user story, 4 acceptance criteria and 2 non-goals. ".repeat(20), links: [], file_paths: [], ai_declaration: true });
    await until("deliverable graded", async () => (await call(pm.token, `/tasks/${myTask.id}`)).data?.deliverables?.[0]?.status === "graded");
  } else bad("no task assigned to user 1");
  await expect2xx(pm.token, "daily check-in", "/checkins", "POST", { yesterday: "Read the brief", today: "Write the spec", blockers: "" });
  const dup = await call(pm.token, "/checkins", "POST", { yesterday: "x x", today: "y y" });
  dup.status === 409 ? ok("duplicate check-in rejected") : bad("duplicate check-in allowed", dup.status);
  const msg = await expect2xx(pm.token, "send chat message", "/team/messages", "POST", { body: "Hello team 👋" });
  const msgs = await expect2xx(tw.token, "teammate reads chat", "/team/messages");
  msgs?.some?.((x: any) => x.id === msg?.id) ? ok("message visible to teammate") : bad("message not visible to teammate");
  if (ws?.project) await expect2xx(tw.token, "peer review", `/projects/${ws.project.id}/peer-reviews`, "POST", { reviews: [{ reviewee_id: pm.id, ratings: { communication: 4, quality: 5, reliability: 4, collaboration: 5 } }] });
  await expect2xx(pm.token, "certification status", "/certification");
  await expect2xx(pm.token, "privacy export", "/me/privacy/export");
  await expect2xx(pm.token, "notifications", "/me/notifications");
  await expect2xx(pm.token, "mark notifications read", "/me/notifications/read", "POST");
  await expect2xx(pm.token, "update bio", "/me/bio", "PATCH", { bio: "E2E bio" });

  console.log("\n▶ Admin (login with ADMIN_USERNAME / ADMIN_PASSWORD)");
  const wrong = await call(null, "/admin/auth/login", "POST", { username: env.ADMIN_USERNAME, password: "wrong-password" });
  wrong.status === 401 ? ok("wrong admin password rejected") : bad("wrong password accepted", wrong.status);
  const login = await call(null, "/admin/auth/login", "POST", { username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD });
  if (login.status !== 200) {
    bad("admin login", login);
  } else {
    ok(`admin login as ${env.ADMIN_USERNAME}`);
    const a = login.data.access_token as string;
    await expect2xx(a, "whoami", "/admin/whoami");
    const ov = await expect2xx(a, "overview", "/admin/overview");
    ov?.funnel ? ok("overview has funnel") : bad("overview missing funnel");
    const users = await expect2xx(a, "list users", `/admin/users?q=e2e_${stamp}`);
    users?.length === 2 ? ok("search finds both test users") : bad("user search", users?.length);
    await expect2xx(a, "user detail", `/admin/users/${pm.id}`);
    await expect2xx(a, "verify identity", `/admin/users/${pm.id}/verify-identity`, "POST", { verified: true });
    await expect2xx(a, "suspend user", `/admin/users/${tw.id}/status`, "POST", { to: "SUSPENDED", reason: "e2e" });
    const suspended = await call(tw.token, "/offers");
    suspended.status === 403 ? ok("suspended user blocked") : bad("suspended user not blocked", suspended.status);
    await expect2xx(a, "lift suspension", `/admin/users/${tw.id}/status`, "POST", { to: "RESUME", reason: "e2e" });
    await expect2xx(a, "payments", "/admin/payments");
    const tests = await expect2xx(a, "content: tests", "/admin/content/tests?status=approved");
    if (tests?.[0]) {
      await expect2xx(a, "content: retire", `/admin/content/tests/${tests[0].id}/status`, "POST", { status: "retired" });
      await expect2xx(a, "content: re-approve", `/admin/content/tests/${tests[0].id}/status`, "POST", { status: "approved" });
    }
    for (const k of ["projects", "personas", "faq"]) await expect2xx(a, `content: ${k}`, `/admin/content/${k}?status=approved`);
    await expect2xx(a, "grading queue", "/admin/grading/review");
    await expect2xx(a, "appeals", "/admin/appeals");
    await expect2xx(a, "calibration", "/admin/calibration");
    await expect2xx(a, "teams", "/admin/teams");
    await expect2xx(a, "integrity", "/admin/integrity");
    const opp = await expect2xx(a, "create opportunity", "/admin/opportunities", "POST", { company_name: `E2E Co ${stamp}`, role_id: "product_manager" });
    if (opp?.id) {
      await expect2xx(a, "shortlist", `/admin/opportunities/${opp.id}/shortlist`, "POST");
      await db.from("opportunities").delete().eq("id", opp.id);
    }
    await expect2xx(a, "flags", "/admin/flags");
    await expect2xx(a, "update flag", "/admin/flags/e2e_flag", "PUT", { enabled: true, value: { stamp } });
    await db.from("feature_flags").delete().eq("key", "e2e_flag");
    await expect2xx(a, "audit log", "/admin/audit");

    const migrated = !(await db.from("support_tickets").select("id").limit(1)).error;
    if (!migrated) {
      console.log("  • skipped support/help/protection checks: apply migration 20261020000003 first");
    } else {
      console.log("\n▶ Report an issue & help bot");
      const up = await expect2xx(pm.token, "screenshot upload URL", "/support/upload-url", "POST", { ext: "png" });
      if (up?.token) {
        const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
        const { error } = await db.storage.from("submissions").uploadToSignedUrl(up.path, up.token, png, { contentType: "image/png" });
        error ? bad("screenshot upload", error.message) : ok("screenshot uploaded to private storage");
      }
      const forged = await call(pm.token, "/support/tickets", "POST", { category: "bug", subject: "Forged", body: "Trying someone else's file path", attachment_path: `${tw.id}/support/00000000-0000-0000-0000-000000000000.png` });
      forged.status === 403 ? ok("someone else's screenshot path rejected") : bad("forged attachment accepted", forged.status);
      const ticket = await expect2xx(pm.token, "create report with screenshot", "/support/tickets", "POST", { category: "tests", subject: "Test 3 won't submit", body: "I press submit and nothing happens.", page_url: "/tests/3", attachment_path: up?.path });
      if (ticket?.id) {
        const spy = await call(tw.token, `/support/tickets/${ticket.id}`);
        spy.status === 404 ? ok("other users can't read the report") : bad("report visible to another user", spy.status);
        const mine = await expect2xx(pm.token, "list my reports", "/support/tickets");
        mine?.some?.((t: any) => t.id === ticket.id) ? ok("report appears in my list") : bad("report missing from list");
        await expect2xx(pm.token, "user follow-up message", `/support/tickets/${ticket.id}/messages`, "POST", { body: "It happens on Chrome on Android." });
        const inbox = await expect2xx(a, "admin support inbox", "/admin/support?status=open");
        inbox?.some?.((t: any) => t.id === ticket.id) ? ok("report in admin inbox") : bad("report not in admin inbox");
        const thread = await expect2xx(a, "admin opens report", `/admin/support/${ticket.id}`);
        thread?.messages?.[0]?.attachment_url ? ok("admin sees the screenshot (signed URL)") : bad("screenshot not visible to admin");
        await expect2xx(a, "admin replies", `/admin/support/${ticket.id}/messages`, "POST", { body: "Thanks! We've fixed it — please try again." });
        const after = await expect2xx(pm.token, "user reads reply", `/support/tickets/${ticket.id}`);
        after?.messages?.some?.((m: any) => m.is_staff) && after.ticket.status === "awaiting_user" ? ok("reply delivered, status 'Huzzler replied'") : bad("reply not delivered", after?.ticket?.status);
        await expect2xx(a, "admin resolves", `/admin/support/${ticket.id}`, "PATCH", { status: "resolved" });
        const notStaff = await call(pm.token, "/admin/support");
        notStaff.status === 403 ? ok("normal user blocked from support inbox") : bad("user reached support inbox", notStaff.status);
      }
      const sugg = await expect2xx(pm.token, "help suggestions", "/help/suggestions");
      Array.isArray(sugg) && sugg.length ? ok(`${sugg.length} suggested questions`) : bad("no suggestions");
      const ans = await expect2xx(pm.token, "help bot: pricing question", "/help/ask", "POST", { question: "how much does it cost?" });
      ans?.source === "faq" && /5,000/.test(ans.answer) ? ok("answered from the FAQ (₦5,000)") : bad("pricing not answered from FAQ", ans);
      const ans2 = await expect2xx(pm.token, "help bot: refund question", "/help/ask", "POST", { question: "Can I get my money back?" });
      ans2?.answer ? ok(`refund question → ${ans2.source}`) : bad("no refund answer");
      const nonsense = await expect2xx(pm.token, "help bot: unknown question", "/help/ask", "POST", { question: "zxqv blorp quantum spaghetti" });
      nonsense?.source === "none" ? ok("unknown question routed to 'Report an issue'") : bad("unknown question got a made-up answer", nonsense);
      if (ans?.id) await expect2xx(pm.token, "help feedback", "/help/feedback", "POST", { id: ans.id, helpful: true });
      await expect2xx(a, "admin: unanswered questions", "/admin/help/queries");

      console.log("\n▶ Protected admin account");
      const me = await expect2xx(a, "admin whoami", "/admin/whoami");
      const { data: adminProfile } = await db.from("profiles").select("is_protected").eq("id", me?.id).single();
      adminProfile?.is_protected ? ok("admin account is marked protected") : bad("admin not protected — run npm run seed after the migration");
      const demote = await call(a, `/admin/users/${me?.id}/role`, "POST", { app_role: "user", reason: "e2e" });
      demote.status === 403 ? ok("API refuses to demote the admin") : bad("admin demotion allowed", demote.status);
      const suspend = await call(a, `/admin/users/${me?.id}/status`, "POST", { to: "SUSPENDED", reason: "e2e" });
      suspend.status === 403 ? ok("API refuses to suspend the admin") : bad("admin suspension allowed", suspend.status);
      if (adminProfile?.is_protected) {
        const direct = await db.from("profiles").update({ app_role: "moderator" }).eq("id", me?.id).select();
        direct.error ? ok("database trigger blocks demotion even with the service key") : bad("database allowed demotion!", direct.data);
        const del = await db.from("profiles").delete().eq("id", me?.id).select();
        del.error ? ok("database trigger blocks deleting the admin") : bad("database allowed deleting the admin!");
      }
    }
  }

  console.log("\n▶ Account deletion");
  await expect2xx(tw.token, "delete account (user 2)", "/me", "DELETE", { confirm: "DELETE" });
}

async function cleanup() {
  console.log("\n▶ Cleanup");
  for (const t of created.teams) await db.from("teams").delete().eq("id", t);
  for (const u of created.users) {
    await db.from("offers").delete().eq("user_id", u);
    await db.from("audit_logs").delete().eq("actor_id", u);
    const { error } = await db.auth.admin.deleteUser(u);
    if (error) console.log(`  could not delete ${u}: ${error.message}`);
  }
  await db.from("audit_logs").delete().like("target_id", "%").in("target_id", created.users);
  console.log(`  removed ${created.users.length} test users and ${created.teams.length} team(s)`);
}

try {
  await main();
} catch (err) {
  bad("crashed", err);
} finally {
  await cleanup();
  console.log(failures ? `\n✗ ${failures} check(s) failed` : "\n✓ All checks passed");
  process.exit(failures ? 1 : 0);
}
