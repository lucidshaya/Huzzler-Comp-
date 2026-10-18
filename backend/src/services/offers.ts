import { db, must } from "../lib/supabase.js";
import { render } from "../lib/templates.js";
import { notify } from "../lib/notify.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { MAX_OFFER_DECLINES, OFFER_TTL_HOURS } from "../domain/constants.js";
import { OFFER_LETTER } from "../content/templates.js";
import { getJourney, transition } from "./journey.js";
import { getProfile } from "./profile.js";
import { enqueue } from "../jobs/queue.js";

/** The next cohort start (Monday) at least 3 days away; created on demand. */
export async function nextCohort() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 3);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  const start = d.toISOString().slice(0, 10);
  const { data } = await db.from("cohorts").upsert({ start_date: start }, { onConflict: "start_date" }).select().single();
  return data!;
}

/** 1–3 simulated offers from pre-made personas in archetypes compatible with the user's role. */
export async function generateOffers(userId: string) {
  const j = await getJourney(userId);
  if (j.status !== "TESTS_PASSED" && j.status !== "OFFER_PENDING") return [];
  const { data: open } = await db.from("offers").select("id").eq("user_id", userId).in("status", ["pending", "accepted"]);
  if (open?.length) return open;

  const profile = await getProfile(userId);
  const { data: compat } = await db.from("role_archetype_compatibility").select("archetype_id").eq("role_id", profile.role_id);
  const archetypes = (compat ?? []).map((c) => c.archetype_id);
  const { data: personas } = await db.from("company_personas").select("*").in("archetype_id", archetypes).eq("status", "approved");
  if (!personas?.length) throw new Error(`No approved personas for ${profile.role_id}`);

  // Prefer archetypes where people are already waiting (teams fill faster), then shuffle.
  const { data: waiting } = await db.from("offers").select("archetype_id").eq("status", "accepted");
  const demand = new Map<string, number>();
  for (const w of waiting ?? []) demand.set(w.archetype_id, (demand.get(w.archetype_id) ?? 0) + 1);
  const { data: seen } = await db.from("offers").select("persona_id").eq("user_id", userId);
  const seenIds = new Set((seen ?? []).map((s) => s.persona_id));
  const ranked = personas
    .filter((p) => !seenIds.has(p.id))
    .map((p) => ({ p, k: (demand.get(p.archetype_id) ?? 0) + Math.random() }))
    .sort((a, b) => b.k - a.k)
    .map((x) => x.p);
  const picks: typeof personas = [];
  for (const p of ranked) {
    if (picks.length >= 3) break;
    if (!picks.some((x) => x.archetype_id === p.archetype_id)) picks.push(p);
  }
  if (!picks.length) picks.push(personas[Math.floor(Math.random() * personas.length)]);

  const cohort = await nextCohort();
  const { data: role } = await db.from("roles").select("name").eq("id", profile.role_id).single();
  const expires = new Date(Date.now() + OFFER_TTL_HOURS * 3_600_000);
  const rows = picks.map((p) => ({
    user_id: userId,
    persona_id: p.id,
    archetype_id: p.archetype_id,
    role_id: profile.role_id,
    cohort_id: cohort.id,
    hours_per_week: profile.hours_per_week ?? 10,
    expires_at: expires.toISOString(),
    letter: render(OFFER_LETTER, {
      first_name: (profile.full_name ?? "").split(" ")[0],
      role_name: role?.name,
      company: p.name,
      mission: p.mission,
      product_brief: p.product_brief,
      culture: p.culture,
      start_date: new Date(cohort.start_date).toDateString(),
      hours: profile.hours_per_week ?? 10,
      expires_at: expires.toUTCString(),
    }),
  }));
  const created = must(await db.from("offers").insert(rows).select("id"), "offers");
  if (j.status === "TESTS_PASSED") await transition(userId, "OFFER_PENDING", "offers sent");
  await notify(userId, "offers.new", "You have job offers", `${rows.length} simulated internship offer${rows.length > 1 ? "s" : ""} waiting. Accept within ${OFFER_TTL_HOURS} hours.`);
  return created;
}

export async function listOffers(userId: string) {
  const { data } = await db
    .from("offers")
    .select("id, status, letter, expires_at, responded_at, hours_per_week, archetype_id, persona:persona_id(name, logo_url, mission, product_brief, culture), cohort:cohort_id(start_date)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function respondToOffer(userId: string, offerId: string, accept: boolean) {
  const { data: offer } = await db.from("offers").select("*").eq("id", offerId).eq("user_id", userId).single();
  if (!offer) throw notFound();
  if (offer.status !== "pending") throw conflict("This offer is no longer open.");
  if (new Date(offer.expires_at) < new Date()) throw conflict("This offer has expired.");
  const j = await getJourney(userId);
  if (j.status !== "OFFER_PENDING") throw badRequest("You can't respond to offers right now.");

  const now = new Date().toISOString();
  if (accept) {
    await db.from("offers").update({ status: "accepted", responded_at: now }).eq("id", offerId).eq("status", "pending");
    await db.from("offers").update({ status: "superseded" }).eq("user_id", userId).eq("status", "pending");
    await enqueue("run_matching", {});
    return { accepted: true };
  }
  await db.from("offers").update({ status: "declined", responded_at: now }).eq("id", offerId);
  const declined = j.offers_declined + 1;
  await db.from("user_journey").update({ offers_declined: declined }).eq("user_id", userId);
  const { data: stillOpen } = await db.from("offers").select("id").eq("user_id", userId).eq("status", "pending");
  if (!stillOpen?.length) {
    if (declined >= MAX_OFFER_DECLINES) {
      // Two declines: back in the queue for the next cohort.
      const cohort = await nextCohort();
      const delay = Math.max(0, new Date(cohort.start_date).getTime() - 3 * 86_400_000 - Date.now());
      await db.from("user_journey").update({ offers_declined: 0 }).eq("user_id", userId);
      await enqueue("generate_offers", { userId }, { delayMs: delay });
      await notify(userId, "offers.requeued", "We'll send new offers for the next cohort", `New offers arrive before ${new Date(cohort.start_date).toDateString()}.`);
    } else {
      await enqueue("generate_offers", { userId });
    }
  }
  return { accepted: false };
}

/** Hourly: expire stale offers and send the next ones. */
export async function expireOffers() {
  const { data } = await db.from("offers").update({ status: "expired" }).eq("status", "pending").lt("expires_at", new Date().toISOString()).select("user_id");
  const users = [...new Set((data ?? []).map((o) => o.user_id))];
  for (const u of users) {
    const { data: open } = await db.from("offers").select("id").eq("user_id", u).in("status", ["pending", "accepted"]);
    if (!open?.length) await enqueue("generate_offers", { userId: u });
  }
  return users.length;
}
