import OpenAI from "openai";

export type ParsedTaskFields = {
  title: string;
  priority: "high" | "medium" | "low";
  deadline: Date | null;
};

function normalizePriority(v: unknown): "high" | "medium" | "low" {
  const s = String(v ?? "").toLowerCase();
  if (s === "high" || s === "medium" || s === "low") return s;
  return "medium";
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
Required JSON shape: {"title": string, "priority": "high"|"medium"|"low", "deadline": string|null}
- title: short, clear task name (keep user's language: Ukrainian if they wrote Ukrainian).
- priority rules:
  - high for urgent/ASAP/терміново/срочно/critical/дуже важливо/сьогодні до/до кінця дня/дедлайн сьогодні.
  - low for nice-to-have, не терміново, не дуже важливо, не критично, не горить, без дедлайну, без фанатизму, без поспіху, коли буде час, колись, якщо буде натхнення, можна якось, при нагоді, для вайбу.
  - medium only when the message sounds normal/important but not urgent and not explicitly relaxed.
- deadline: ISO 8601 datetime string if the user implies a date/time; otherwise null.
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
    };
  } catch {
    return fallbackParse(rawInput);
  }
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
