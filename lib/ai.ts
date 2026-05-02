import OpenAI from "openai";

export type ParsedTaskFields = {
  title: string;
  priority: "high" | "medium" | "low";
  deadline: Date | null;
  energy: "brain" | "quick" | "autopilot" | "emotional" | "focus";
  tag: "work" | "study" | "personal" | "health" | "admin" | "chaos";
};

function normalizePriority(v: unknown): "high" | "medium" | "low" {
  const s = String(v ?? "").toLowerCase();
  if (s === "high" || s === "medium" || s === "low") return s;
  return "medium";
}

function normalizeEnergy(
  v: unknown
): "brain" | "quick" | "autopilot" | "emotional" | "focus" {
  const s = String(v ?? "").toLowerCase();
  if (["brain", "quick", "autopilot", "emotional", "focus"].includes(s)) {
    return s as "brain" | "quick" | "autopilot" | "emotional" | "focus";
  }
  return "focus";
}

function normalizeTag(
  v: unknown
): "work" | "study" | "personal" | "health" | "admin" | "chaos" {
  const s = String(v ?? "").toLowerCase();
  if (["work", "study", "personal", "health", "admin", "chaos"].includes(s)) {
    return s as "work" | "study" | "personal" | "health" | "admin" | "chaos";
  }
  return "chaos";
}

function parseDeadline(v: unknown): Date | null {
  if (v == null || v === "") return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function priorityFromText(rawInput: string): "high" | "low" | null {
  const text = rawInput.toLowerCase();

  // Check relaxed/negated phrases before urgent words like "терміново".
  const lowSignals = [
    "не терміново",
    "не дуже терміново",
    "не дуже важливо",
    "не критично",
    "не горить",
    "без дедлайну",
    "без фанатизму",
    "без героїзму",
    "без поспіху",
    "коли буде час",
    "коли буде вільна хвилина",
    "якщо буде вільна хвилина",
    "якщо буде час",
    "якщо буде натхнення",
    "якщо не переможе диван",
    "колись",
    "можна якось",
    "можна пізніше",
    "при нагоді",
    "для вайбу",
    "чисто для вайбу",
    "nice to have",
    "low priority",
  ];

  if (lowSignals.some((signal) => text.includes(signal))) return "low";

  const urgentSignals = [
    "дуже терміново",
    "терміново",
    "срочно",
    "негайно",
    "прям зараз",
    "якнайшвидше",
    "asap",
    "urgent",
    "critical",
    "критично",
    "дуже важливо",
    "це прям важливо",
    "high priority",
    "сьогодні до",
    "до кінця дня",
    "до вечора",
    "дедлайн сьогодні",
  ];

  if (urgentSignals.some((signal) => text.includes(signal))) return "high";

  return null;
}

export function fallbackParse(rawInput: string): ParsedTaskFields {
  const title = rawInput.trim().split("\n")[0]?.slice(0, 500) || "Без назви";
  return {
    title,
    priority: priorityFromText(rawInput) ?? "medium",
    deadline: null,
    energy: "focus",
    tag: "chaos",
  };
}

export async function parseTaskWithOpenAI(
  rawInput: string
): Promise<ParsedTaskFields> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return fallbackParse(rawInput);
  }

  const openai = new OpenAI({ apiKey: key });
  const nowIso = new Date().toISOString();

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You extract a single task from the user's message. Respond ONLY with valid JSON, no markdown, no explanation.
Required JSON shape: {"title": string, "priority": "high"|"medium"|"low", "deadline": string|null, "energy": "brain"|"quick"|"autopilot"|"emotional"|"focus", "tag": "work"|"study"|"personal"|"health"|"admin"|"chaos"}
- title: short, clear task name (keep user's language: Ukrainian if they wrote Ukrainian).
- priority rules:
  - high for urgent/ASAP/терміново/срочно/critical/дуже важливо/сьогодні до/до кінця дня/дедлайн сьогодні.
  - low for nice-to-have, не терміново, не дуже важливо, не критично, не горить, без дедлайну, без фанатизму, без поспіху, коли буде час, колись, якщо буде натхнення, можна якось, при нагоді, для вайбу.
  - medium only when the message sounds normal/important but not urgent and not explicitly relaxed.
- deadline: ISO 8601 datetime string if the user implies a date/time; otherwise null.
- energy: brain for thinking/research/writing/code; quick for <= 5 minute tasks; autopilot for chores/admin; emotional for uncomfortable calls/messages/decisions; focus default.
- tag: work/study/personal/health/admin/chaos based on task context.
Current datetime (UTC) for reference: ${nowIso}. Interpret relative phrases like "tomorrow", "by lunch", "на вихідних" against this moment.`,
        },
        { role: "user", content: rawInput.trim().slice(0, 4000) },
      ],
    });

    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) return fallbackParse(rawInput);

    const data = JSON.parse(text) as Record<string, unknown>;
    const title =
      typeof data.title === "string" && data.title.trim()
        ? data.title.trim().slice(0, 500)
        : fallbackParse(rawInput).title;

    return {
      title,
      priority: priorityFromText(rawInput) ?? normalizePriority(data.priority),
      deadline: parseDeadline(data.deadline),
      energy: normalizeEnergy(data.energy),
      tag: normalizeTag(data.tag),
    };
  } catch {
    return fallbackParse(rawInput);
  }
}

type AiTask = {
  id: string;
  title: string;
  priority: string;
  deadline: string | null;
  energy?: string;
  tag?: string;
  done?: boolean;
};

async function jsonAi(prompt: string, payload: unknown) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const openai = new OpenAI({ apiKey: key });
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.55,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `${prompt}\nRespond ONLY with valid JSON, no markdown. Keep Ukrainian language and a friendly meme-ish tone.`,
      },
      { role: "user", content: JSON.stringify(payload) },
    ],
  });

  const text = completion.choices[0]?.message?.content?.trim();
  return text ? (JSON.parse(text) as Record<string, unknown>) : null;
}

export async function getPanicPlan(tasks: AiTask[], mood: string) {
  return jsonAi(
    'Create an anti-panic plan. Shape: {"headline": string, "firstStep": string, "nextSteps": string[], "delegateOrDrop": string[], "meme": string}. nextSteps max 4, delegateOrDrop max 3.',
    { mood, tasks }
  );
}

export async function getTwoMinuteTasks(tasks: AiTask[], mood: string) {
  return jsonAi(
    'Find tiny tasks doable in about 2 minutes. Shape: {"headline": string, "items": [{"id": string, "reason": string}], "meme": string}. Pick max 5. If none, suggest the smallest first move.',
    { mood, tasks }
  );
}

export async function explainProcrastination(task: AiTask, mood: string) {
  return jsonAi(
    'Explain why this task might be procrastinated. Shape: {"reason": string, "tinyFirstStep": string, "meme": string}. Be kind, practical, and slightly funny.',
    { mood, task }
  );
}

export async function breakTaskIntoSubtasks(rawInput: string, mood: string) {
  return jsonAi(
    'Break one big task into concrete subtasks. Shape: {"title": string, "subtasks": [{"title": string, "priority": "high"|"medium"|"low", "energy": "brain"|"quick"|"autopilot"|"emotional"|"focus", "tag": "work"|"study"|"personal"|"health"|"admin"|"chaos"}], "meme": string}. Create 3-6 subtasks.',
    { mood, rawInput }
  );
}

export type RecommendItem = { id: string; reason: string };

export async function recommendTopTasks(
  tasks: { id: string; title: string; priority: string; deadline: string | null }[]
): Promise<RecommendItem[]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key || tasks.length === 0) return [];

  const openai = new OpenAI({ apiKey: key });
  const nowIso = new Date().toISOString();

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You help pick what to do in the next ~2 hours. Respond ONLY with valid JSON, no markdown.
Shape: {"items":[{"id":"<task id from input>","reason":"<one short sentence in Ukrainian why now>"}]}
Pick at most 3 tasks. Prefer urgent deadlines, high priority, and quick wins. Current time (UTC): ${nowIso}`,
        },
        {
          role: "user",
          content: JSON.stringify(tasks),
        },
      ],
    });

    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) return [];

    const data = JSON.parse(text) as { items?: unknown };
    const items = Array.isArray(data.items) ? data.items : [];
    const out: RecommendItem[] = [];
    const validIds = new Set(tasks.map((t) => t.id));

    for (const row of items) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const id = typeof r.id === "string" ? r.id : "";
      const reason = typeof r.reason === "string" ? r.reason : "";
      if (validIds.has(id) && reason) out.push({ id, reason });
      if (out.length >= 3) break;
    }
    return out;
  } catch {
    return [];
  }
}
