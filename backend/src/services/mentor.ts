import { db } from "../lib/supabase.js";
import { env } from "../config/env.js";
import { forbidden, HttpError } from "../lib/errors.js";
import { HINTS_PER_TASK, MENTOR_DAILY_LIMIT } from "../domain/constants.js";
import { aiConfigured, callStructured, AiUnavailableError, AiBudgetError, AiOutputError } from "../ai/aiClient.js";
import { MentorReply } from "../ai/schemas.js";
import { MENTOR_RULES, PROMPT_VERSIONS } from "../ai/prompts.js";
import { faqLookup, retrieveForMentor } from "../ai/rag.js";
import { assertTeamMember } from "./teams.js";

async function mentorSettings() {
  const { data } = await db.from("feature_flags").select("enabled, value").eq("key", "mentor_chat").maybeSingle();
  const v = (data?.value ?? {}) as { daily_limit?: number; faq_threshold?: number };
  return { enabled: data?.enabled ?? true, limit: v.daily_limit ?? MENTOR_DAILY_LIMIT, threshold: v.faq_threshold ?? 0.85 };
}

async function usedToday(userId: string) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const { count } = await db.from("mentor_messages").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("role", "user").gte("created_at", start.toISOString());
  return count ?? 0;
}

export async function mentorHistory(userId: string, taskId: string) {
  const { data } = await db.from("mentor_messages").select("role, content, source, created_at").eq("user_id", userId).eq("task_id", taskId).order("created_at").limit(50);
  const s = await mentorSettings();
  return { messages: data ?? [], remainingToday: Math.max(0, s.limit - (await usedToday(userId))), limit: s.limit };
}

/**
 * Mentor chat: opens after the 3 hints; 10 messages/day. FAQ/hint lookup first (no LLM call when
 * similarity ≥ threshold), otherwise the AI model with only the top retrieved chunks, the task brief and
 * the user's draft. History is trimmed to keep prompts small.
 */
export async function askMentor(userId: string, taskId: string, question: string, draft?: string) {
  const s = await mentorSettings();
  if (!s.enabled) throw forbidden("Mentor chat is turned off right now.");
  const { data: task } = await db.from("team_tasks").select("id, title, description, role_id, project:project_instance_id(team_id, template:template_id(title, brief))").eq("id", taskId).single();
  if (!task) throw forbidden();
  if (!(await assertTeamMember(userId, (task as any).project.team_id))) throw forbidden();
  const { count: hints } = await db.from("hint_unlocks").select("id", { count: "exact", head: true }).eq("task_id", taskId).eq("user_id", userId);
  if ((hints ?? 0) < HINTS_PER_TASK) throw forbidden("Unlock all three hints before opening mentor chat.", "HINTS_FIRST");
  if ((await usedToday(userId)) >= s.limit) throw new HttpError(429, `You've used your ${s.limit} mentor messages for today.`, "MENTOR_LIMIT");

  await db.from("mentor_messages").insert({ user_id: userId, task_id: taskId, role: "user", content: question });

  const faq = await faqLookup(task.role_id, question, s.threshold);
  if (faq) {
    await db.from("mentor_messages").insert({ user_id: userId, task_id: taskId, role: "assistant", content: faq.answer, source: "faq" });
    return { reply: faq.answer, source: "faq" as const };
  }

  const chunks = await retrieveForMentor(task.role_id, `${task.title}\n${question}`, 4);
  const { data: history } = await db.from("mentor_messages").select("role, content").eq("user_id", userId).eq("task_id", taskId).order("created_at", { ascending: false }).limit(7);
  const trimmed = (history ?? []).slice(1).reverse().map((m) => `${m.role === "user" ? "User" : "Mentor"}: ${m.content.slice(0, 600)}`).join("\n");
  const t = task as any;

  try {
    const { data } = await callStructured({
      feature: "mentor_chat",
      userId,
      roleId: task.role_id,
      promptVersion: PROMPT_VERSIONS.mentor,
      cachedSystem: [MENTOR_RULES],
      schema: MentorReply,
      userContent: [
        {
          type: "text",
          text: [
            `<task_brief>\nProject: ${t.project.template.title}\n${t.project.template.brief.slice(0, 1500)}\n\nTask: ${task.title}\n${task.description}\n</task_brief>`,
            chunks.length ? `<reference>\n${chunks.map((c) => `## ${c.title}\n${c.content.slice(0, 1200)}`).join("\n\n")}\n</reference>` : "",
            trimmed ? `<recent_conversation>\n${trimmed}\n</recent_conversation>` : "",
            draft ? `<draft>\n${draft.slice(0, 4000)}\n</draft>` : "",
            `<question>\n${question}\n</question>`,
          ].filter(Boolean).join("\n\n"),
        },
      ],
    });
    await db.from("mentor_messages").insert({ user_id: userId, task_id: taskId, role: "assistant", content: data.reply, source: "ai" });
    return { reply: data.reply, source: "ai" as const };
  } catch (err) {
    if (err instanceof AiUnavailableError || err instanceof AiBudgetError || err instanceof AiOutputError) {
      const reply = aiConfigured()
        ? "The mentor can't answer right now. Try rephrasing, or ask your PM in team chat."
        : "Mentor chat isn't switched on yet. Re-read the three hints and ask your team in chat — they're the fastest help.";
      await db.from("mentor_messages").insert({ user_id: userId, task_id: taskId, role: "assistant", content: reply, source: "fallback" });
      return { reply, source: "fallback" as const };
    }
    throw err;
  }
}
