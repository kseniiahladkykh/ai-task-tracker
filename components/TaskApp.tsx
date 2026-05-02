"use client";

import Image from "next/image";
import { signIn, signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: { [index: number]: { [index: number]: { transcript: string } } } }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export type TaskRow = {
  id: string;
  rawInput: string;
  title: string;
  priority: string;
  deadline: string | null;
  done: boolean;
  createdAt: string;
  source: string;
  externalId: string | null;
  externalUrl: string | null;
  energy: string;
  tag: string;
};

type CalendarEvent = {
  id: string;
  title: string;
  start: string | null;
  end: string | null;
  url: string | null;
};

const priorityEmoji: Record<string, string> = {
  high: "🔴",
  medium: "🟡",
  low: "🟢",
};

const priorityRank: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const moods = [
  {
    id: "meme-1",
    label: "1. зависла",
    advice: "Сьогодні без героїзму: вибери одну маленьку дію і не відкривай 14 нових вкладок.",
  },
  {
    id: "meme-2",
    label: "2. під ковдрою",
    advice: "Режим виживання: бери задачі на автопілоті або 2-хвилинні мікрокроки.",
  },
  {
    id: "meme-3",
    label: "3. плачу красиво",
    advice: "Почни з задачі, де найменше сорому й найбільше полегшення після виконання.",
  },
  {
    id: "meme-4",
    label: "4. на кофеїні",
    advice: "Енергія є, але не рознеси прод: спочатку високий пріоритет, потім красивості.",
  },
  {
    id: "meme-5",
    label: "5. тихий хаос",
    advice: "Не довіряємо мозку, довіряємо списку: натисни Антипаніка і роби перший крок.",
  },
  {
    id: "meme-6",
    label: "6. гіперфокус",
    advice: "Лови хвилю: бери brain/focus задачу, але постав таймер, щоб не переїхати в задачу жити.",
  },
  {
    id: "meme-7",
    label: "7. fake it",
    advice: "Ідеальний день для задач, які треба просто закрити. Не ідеально, зате done.",
  },
  {
    id: "meme-8",
    label: "8. підозра",
    advice: "Якщо задача мутна, натисни «Чому відкладаю?» або розбий її на підзадачі.",
  },
  {
    id: "meme-9",
    label: "9. мудрий біль",
    advice: "Ти вже все бачив/бачила. Обери найважливіше і зроби спокійно, як людина з character development.",
  },
] as const;

const energyLabels: Record<string, string> = {
  brain: "🧠 мозок",
  quick: "⚡ швидко",
  autopilot: "🧍 автопілот",
  emotional: "😭 емоційно",
  focus: "🎯 фокус",
};

const tagLabels: Record<string, string> = {
  work: "робота",
  study: "навчання",
  personal: "особисте",
  health: "здоровʼя",
  admin: "адмінка",
  chaos: "хаос",
};

function formatDeadline(iso: string | null): string {
  if (!iso) return "без дедлайну";
  try {
    return new Intl.DateTimeFormat("uk-UA", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function isOverdue(iso: string | null, done: boolean): boolean {
  if (!iso || done) return false;
  return new Date(iso).getTime() < Date.now();
}

function formatEventTime(value: string | null) {
  if (!value) return "час сховався";
  return new Intl.DateTimeFormat("uk-UA", {
    dateStyle: "medium",
    timeStyle: value.includes("T") ? "short" : undefined,
  }).format(new Date(value));
}

export default function TaskApp() {
  const { data: session, status } = useSession();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "done">("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | "manual" | "jira">(
    "all"
  );
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [mood, setMood] = useState<(typeof moods)[number]["id"] | null>(null);
  const [moodOpen, setMoodOpen] = useState(false);
  const [sort, setSort] = useState<"deadline" | "priority" | "created">(
    "created"
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [recLoading, setRecLoading] = useState(false);
  const [jiraLoading, setJiraLoading] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [panicLoading, setPanicLoading] = useState(false);
  const [quickLoading, setQuickLoading] = useState(false);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [coachLoadingId, setCoachLoadingId] = useState<string | null>(null);
  const [recItems, setRecItems] = useState<
    { id: string; title: string; reason: string }[]
  >([]);
  const [recMessage, setRecMessage] = useState<string | null>(null);
  const [coachCard, setCoachCard] = useState<{
    title: string;
    body: string[];
    meme?: string;
  } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/tasks");
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(typeof j.error === "string" ? j.error : "Помилка завантаження");
      setTasks([]);
      setLoading(false);
      return;
    }
    const data = (await res.json()) as TaskRow[];
    setTasks(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load, status]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setVoiceSupported(
        Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
      );
    }
  }, []);

  const visible = useMemo(() => {
    let list = tasks.filter((t) => {
      if (filter === "active") return !t.done;
      if (filter === "done") return t.done;
      return true;
    });

    if (sourceFilter !== "all") {
      list = list.filter((t) => t.source === sourceFilter);
    }

    if (tagFilter !== "all") {
      list = list.filter((t) => t.tag === tagFilter);
    }

    list = [...list].sort((a, b) => {
      if (sort === "created") {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sort === "priority") {
        const pa = priorityRank[a.priority] ?? 99;
        const pb = priorityRank[b.priority] ?? 99;
        return pa - pb;
      }
      const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
      const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
      return da - db;
    });

    return list;
  }, [tasks, filter, sourceFilter, tagFilter, sort]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const raw = input.trim();
    if (!raw || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawInput: raw }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : "Упс");
      setInput("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося додати");
    } finally {
      setSubmitting(false);
    }
  }

  function startVoiceInput() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError("Голосове введення підтримується не всюди. Chrome каже: я тут головний.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "uk-UA";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) {
        setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
      }
    };
    recognition.onerror = () => {
      setError("Не розчула голос. Мікрофон або всесвіт сьогодні проти нас.");
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    setListening(true);
    recognition.start();
  }

  async function toggleDone(task: TaskRow) {
    setError(null);
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !task.done }),
    });
    if (!res.ok) {
      setError("Не вдалося оновити статус");
      return;
    }
    await load();
  }

  async function removeTask(id: string) {
    setError(null);
    const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Не вдалося видалити");
      return;
    }
    await load();
  }

  async function saveTitle(id: string) {
    const title = editDraft.trim();
    setEditingId(null);
    if (!title) return;
    const res = await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) setError("Не вдалося зберегти назву");
    await load();
  }

  async function whatNow() {
    setRecLoading(true);
    setRecMessage(null);
    setRecItems([]);
    setError(null);
    try {
      const res = await fetch("/api/tasks/recommend", { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Помилка AI");
      if (j.message) setRecMessage(j.message);
      setRecItems(Array.isArray(j.items) ? j.items : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка");
    } finally {
      setRecLoading(false);
    }
  }

  async function runCoach(
    url: string,
    setBusy: (v: boolean) => void,
    title: string
  ) {
    setBusy(true);
    setError(null);
    setCoachCard(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mood: mood ?? "neutral" }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "AI не відповів");

      const body = [
        j.headline,
        j.firstStep ? `Перший крок: ${j.firstStep}` : null,
        ...(Array.isArray(j.nextSteps) ? j.nextSteps : []),
        ...(Array.isArray(j.delegateOrDrop) && j.delegateOrDrop.length
          ? [`Відкласти/делегувати: ${j.delegateOrDrop.join(", ")}`]
          : []),
        ...(Array.isArray(j.items)
          ? j.items.map((item: { id?: string; reason?: string }) => {
              const task = tasks.find((t) => t.id === item.id);
              return `${task?.title ?? "Мікротаска"} — ${item.reason ?? ""}`;
            })
          : []),
      ].filter(Boolean) as string[];

      setCoachCard({ title, body, meme: j.meme });
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI режим не спрацював");
    } finally {
      setBusy(false);
    }
  }

  async function breakdownTask() {
    const raw = input.trim();
    if (!raw || breakdownLoading) return;
    setBreakdownLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/breakdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawInput: raw, mood: mood ?? "neutral" }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Не вдалося розбити");
      setInput("");
      setCoachCard({
        title: j.title ?? "Задача розбита",
        body: [`Створено підзадач: ${Array.isArray(j.created) ? j.created.length : 0}`],
        meme: j.meme,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося розбити задачу");
    } finally {
      setBreakdownLoading(false);
    }
  }

  async function explainTask(task: TaskRow) {
    setCoachLoadingId(task.id);
    setError(null);
    try {
      const res = await fetch("/api/ai/procrastination", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: task.id, mood: mood ?? "neutral" }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "AI не пояснив");
      setCoachCard({
        title: `Чому відкладається: ${task.title}`,
        body: [j.reason, `Мікрокрок: ${j.tinyFirstStep}`].filter(Boolean),
        meme: j.meme,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося пояснити");
    } finally {
      setCoachLoadingId(null);
    }
  }

  async function importJira() {
    setJiraLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/jira/import", { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Jira import failed");
      await load();
      setSourceFilter("jira");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не вдалося імпортувати задачі з Jira"
      );
    } finally {
      setJiraLoading(false);
    }
  }

  async function loadCalendar() {
    setCalendarOpen(true);
    setCalendarLoading(true);
    setCalendarError(null);
    try {
      const res = await fetch("/api/calendar/events");
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Calendar refused to cooperate");
      setCalendarEvents(Array.isArray(j.events) ? j.events : []);
    } catch (err) {
      setCalendarError(
        err instanceof Error ? err.message : "Не вдалося підтягнути календар"
      );
    } finally {
      setCalendarLoading(false);
    }
  }

  const total = tasks.length;
  const hasAny = total > 0;
  const emptyFiltered = hasAny && visible.length === 0;
  const selectedMood = moods.find((m) => m.id === mood);

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-4 py-10 pb-24 font-[family-name:var(--font-geist-sans)]">
      <header className="overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950/70 p-6 shadow-2xl shadow-violet-950/30 ring-1 ring-violet-500/20 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-violet-300">
              OMT command center
            </p>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-5xl">
              Oh My Tasks!
            </h1>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white/70 px-2 py-1 text-xs shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
            <span className="max-w-[180px] truncate px-2 text-zinc-600 dark:text-zinc-300">
              {status === "loading"
                ? "Перевіряю профіль…"
                : session?.user?.email
                  ? session.user.email
                  : "Гостьовий режим"}
            </span>
            {session?.user ? (
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/" })}
                className="rounded-full bg-zinc-900 px-3 py-1.5 font-semibold text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                Вийти
              </button>
            ) : (
              <button
                type="button"
                onClick={() => signIn("google")}
                className="rounded-full bg-white px-3 py-1.5 font-semibold text-zinc-900 shadow-sm ring-1 ring-zinc-200 transition hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-50 dark:ring-zinc-700"
              >
                Увійти через Google
              </button>
            )}
          </div>
        </div>
        <p className="mt-4 max-w-2xl text-base text-zinc-300">
          Brain dump, Jira, mood, panic button і календар в одному місці. Пиши
          як думаєш, говори як біжиш між мітингами — OMT розкладе хаос по
          картках.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <p className="text-2xl font-bold text-white">{tasks.length}</p>
            <p className="text-xs text-zinc-400">усіх задач</p>
          </div>
          <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-3">
            <p className="text-2xl font-bold text-red-200">
              {tasks.filter((t) => t.priority === "high" && !t.done).length}
            </p>
            <p className="text-xs text-red-100/70">горить</p>
          </div>
          <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-3">
            <p className="text-2xl font-bold text-sky-200">
              {tasks.filter((t) => t.source === "jira").length}
            </p>
            <p className="text-xs text-sky-100/70">з Jira</p>
          </div>
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-3">
            <p className="text-2xl font-bold text-emerald-200">
              {tasks.filter((t) => t.done).length}
            </p>
            <p className="text-xs text-emerald-100/70">закрито</p>
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-zinc-200 bg-white/60 p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Mood of the Day
            </p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Не обовʼязково. Але якщо день вже мем, можна чесно зізнатись.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMoodOpen((v) => !v)}
            className="rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-500"
          >
            {selectedMood ? selectedMood.label : "Обрати mood"}
          </button>
        </div>

        {moodOpen && (
          <div className="mt-4">
            <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800">
              <Image
                src="/mood-memes.png"
                alt="Which meme are you today?"
                width={700}
                height={700}
                className="block w-full"
              />
              <div className="absolute inset-x-0 bottom-0 top-[17%] grid grid-cols-3 grid-rows-3">
                {moods.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setMood(m.id);
                      setMoodOpen(false);
                    }}
                    aria-label={m.label}
                    className={`m-1 rounded-xl text-left text-[0px] transition hover:bg-violet-500/10 ${
                      mood === m.id
                        ? "border-4 border-violet-500 bg-violet-500/10"
                        : "border border-transparent"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {selectedMood && (
          <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900 dark:border-violet-900 dark:bg-violet-950/50 dark:text-violet-100">
            <strong>{selectedMood.label}:</strong> {selectedMood.advice}
          </div>
        )}
      </section>

      <form onSubmit={handleAdd} className="space-y-3">
        <label className="sr-only" htmlFor="task-input">
          Нова задача
        </label>
        <div className="rounded-[1.75rem] border border-violet-200/60 bg-white/80 p-3 shadow-xl shadow-violet-950/10 backdrop-blur dark:border-violet-900/60 dark:bg-zinc-950/80">
          <textarea
            id="task-input"
            rows={3}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='Наприклад: «Завтра до обіду написати Славі про відео, терміново»'
            className="w-full resize-y rounded-2xl border border-transparent bg-transparent px-3 py-2 text-base outline-none placeholder:text-zinc-400"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200/70 pt-3 dark:border-zinc-800">
            <p className="text-xs text-zinc-500">
              Natural language або голосом. Без форми з 17 полями, ми не в банку.
            </p>
            <button
              type="button"
              onClick={() => startVoiceInput()}
              disabled={!voiceSupported || listening}
              className="rounded-full border border-pink-300 bg-pink-50 px-4 py-2 text-sm font-semibold text-pink-800 transition hover:bg-pink-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-pink-800 dark:bg-pink-950 dark:text-pink-200"
            >
              {listening ? "Слухаю…" : "🎙️ Voice task"}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={submitting || !input.trim()}
            className="rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-900/20 transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Думаю…" : "Dump task"}
          </button>
          <button
            type="button"
            onClick={() => whatNow()}
            disabled={recLoading}
            className="rounded-full border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-800 transition hover:bg-violet-100 disabled:opacity-50 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-200"
          >
            {recLoading ? "Аналізую список…" : "Що робити зараз?"}
          </button>
          <button
            type="button"
            onClick={() =>
              runCoach("/api/ai/panic", setPanicLoading, "Антипаніка режим")
            }
            disabled={panicLoading}
            className="rounded-full border border-fuchsia-300 bg-fuchsia-50 px-4 py-2 text-sm font-semibold text-fuchsia-800 transition hover:bg-fuchsia-100 disabled:opacity-50 dark:border-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-200"
          >
            {panicLoading ? "Заспокоюю хаос…" : "Антипаніка"}
          </button>
          <button
            type="button"
            onClick={() =>
              runCoach("/api/ai/two-minute", setQuickLoading, "2-хвилинний режим")
            }
            disabled={quickLoading}
            className="rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
          >
            {quickLoading ? "Шукаю мікротаски…" : "2 хвилини"}
          </button>
          <button
            type="button"
            onClick={() => breakdownTask()}
            disabled={breakdownLoading || !input.trim()}
            className="rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
          >
            {breakdownLoading ? "Ріжу жабу…" : "Розбити на підзадачі"}
          </button>
          <button
            type="button"
            onClick={() => importJira()}
            disabled={jiraLoading || !session?.user}
            title={
              session?.user
                ? "Підтягнути задачі з Jira"
                : "Спочатку увійди через Google"
            }
            className="rounded-full border border-sky-300 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-800 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200"
          >
            {jiraLoading ? "Тягну Jira…" : "Імпортувати Jira"}
          </button>
          <button
            type="button"
            onClick={() => loadCalendar()}
            disabled={calendarLoading || !session?.user}
            className="rounded-full border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-800 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-200"
          >
            {calendarLoading ? "Читаю календар…" : "Google Calendar"}
          </button>
        </div>
      </form>

      {calendarOpen && (
        <section className="rounded-2xl border border-indigo-200 bg-indigo-50/80 p-4 dark:border-indigo-900 dark:bg-indigo-950/40">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-indigo-800 dark:text-indigo-300">
              Upcoming calendar chaos
            </h2>
            <button
              type="button"
              onClick={() => setCalendarOpen(false)}
              className="text-xs font-semibold text-indigo-700 hover:underline dark:text-indigo-300"
            >
              сховати
            </button>
          </div>
          {calendarError ? (
            <p className="mt-3 rounded-xl bg-white/80 px-3 py-2 text-sm text-red-700 dark:bg-zinc-900/80 dark:text-red-300">
              {calendarError}
            </p>
          ) : calendarLoading ? (
            <p className="mt-3 text-sm text-indigo-700 dark:text-indigo-200">
              Дивлюсь у календар і намагаюсь не засуджувати…
            </p>
          ) : calendarEvents.length === 0 ? (
            <p className="mt-3 text-sm text-indigo-700 dark:text-indigo-200">
              Найближчих подій нема. Підозріло, але приємно.
            </p>
          ) : (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {calendarEvents.map((event) => (
                <li
                  key={event.id}
                  className="rounded-xl bg-white/90 px-3 py-2 text-sm dark:bg-zinc-900/90"
                >
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {event.title}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {formatEventTime(event.start)}
                  </p>
                  {event.url && (
                    <a
                      href={event.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block text-xs font-semibold text-indigo-700 hover:underline dark:text-indigo-300"
                    >
                      відкрити в Calendar
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {(recItems.length > 0 || recMessage) && (
        <section className="rounded-2xl border border-violet-200 bg-violet-50/80 p-4 dark:border-violet-900 dark:bg-violet-950/40">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-violet-800 dark:text-violet-300">
            Топ на найближчі години
          </h2>
          {recMessage && (
            <p className="mt-2 text-zinc-700 dark:text-zinc-300">{recMessage}</p>
          )}
          <ul className="mt-3 space-y-2">
            {recItems.map((item) => (
              <li
                key={item.id}
                className="rounded-xl bg-white/90 px-3 py-2 text-sm dark:bg-zinc-900/90"
              >
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {item.title}
                </span>
                <span className="text-zinc-600 dark:text-zinc-400">
                  {" "}
                  — {item.reason}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {coachCard && (
        <section className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50/80 p-4 dark:border-fuchsia-900 dark:bg-fuchsia-950/40">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-fuchsia-800 dark:text-fuchsia-300">
            {coachCard.title}
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
            {coachCard.body.map((line, idx) => (
              <li key={`${line}-${idx}`} className="rounded-xl bg-white/80 px-3 py-2 dark:bg-zinc-900/80">
                {line}
              </li>
            ))}
          </ul>
          {coachCard.meme && (
            <p className="mt-3 text-sm font-medium text-fuchsia-800 dark:text-fuchsia-200">
              {coachCard.meme}
            </p>
          )}
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase text-zinc-500">Фільтр</span>
        {(["all", "active", "done"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              filter === f
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
            }`}
          >
            {f === "all" ? "Усі" : f === "active" ? "Активні" : "Виконані"}
          </button>
        ))}
        <span className="ml-2 text-xs font-medium uppercase text-zinc-500">
          Джерело
        </span>
        {(["all", "manual", "jira"] as const).map((source) => (
          <button
            key={source}
            type="button"
            onClick={() => setSourceFilter(source)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              sourceFilter === source
                ? "bg-sky-700 text-white"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
            }`}
          >
            {source === "all" ? "Усе" : source === "jira" ? "Jira" : "AI"}
          </button>
        ))}
        <span className="ml-2 text-xs font-medium uppercase text-zinc-500">
          Тег
        </span>
        {(["all", "work", "study", "personal", "health", "admin", "chaos"] as const).map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => setTagFilter(tag)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              tagFilter === tag
                ? "bg-violet-700 text-white"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
            }`}
          >
            {tag === "all" ? "Усі" : tagLabels[tag]}
          </button>
        ))}
        <span className="ml-2 text-xs font-medium uppercase text-zinc-500">
          Сортування
        </span>
        <select
          value={sort}
          onChange={(e) =>
            setSort(e.target.value as "deadline" | "priority" | "created")
          }
          className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="created">За датою створення</option>
          <option value="deadline">За дедлайном</option>
          <option value="priority">За пріоритетом</option>
        </select>
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-center text-zinc-500">Завантажую задачі…</p>
      ) : !hasAny ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-zinc-200 bg-white/50 px-8 py-16 text-center dark:border-zinc-700 dark:bg-zinc-900/40">
          <span className="text-4xl">🧠</span>
          <p className="mt-4 text-lg font-semibold text-zinc-800 dark:text-zinc-100">
            OMT ще не панікує — задач поки нема
          </p>
          <p className="mt-2 max-w-sm text-zinc-600 dark:text-zinc-400">
            Напиши все, що крутиться в голові, одним повідомленням. ШІ розкладе по
            поличках, а ти зробиш вигляд, що так і планувалось.
          </p>
        </div>
      ) : emptyFiltered ? (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50/80 px-8 py-12 text-center dark:border-emerald-900 dark:bg-emerald-950/30">
          <p className="text-2xl font-bold text-emerald-800 dark:text-emerald-200">
            Все зроблено 🎉
          </p>
          <p className="mt-2 text-emerald-700 dark:text-emerald-300">
            У цьому фільтрі задач немає. Спробуй «Усі» або додай новий хаос вище.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((task) => {
            const emoji = priorityEmoji[task.priority] ?? "⚪";
            const overdue = isOverdue(task.deadline, task.done);
            return (
              <li
                key={task.id}
                className={`rounded-2xl border bg-white/90 px-4 py-3 shadow-sm dark:bg-zinc-900/90 ${
                  overdue
                    ? "border-red-400 ring-2 ring-red-200 dark:border-red-700 dark:ring-red-900"
                    : "border-zinc-200 dark:border-zinc-700"
                }`}
              >
                <div className="flex flex-wrap items-start gap-3">
                  <label className="flex cursor-pointer items-start gap-2 pt-0.5">
                    <input
                      type="checkbox"
                      checked={task.done}
                      onChange={() => toggleDone(task)}
                      className="mt-1 h-4 w-4 rounded border-zinc-300 text-violet-600 focus:ring-violet-500"
                    />
                  </label>
                  <div className="min-w-0 flex-1">
                    {editingId === task.id ? (
                      <input
                        autoFocus
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        onBlur={() => saveTitle(task.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveTitle(task.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="w-full rounded-lg border border-violet-300 px-2 py-1 text-base dark:bg-zinc-800"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(task.id);
                          setEditDraft(task.title);
                        }}
                        className={`text-left text-base font-semibold text-zinc-900 hover:text-violet-700 dark:text-zinc-50 dark:hover:text-violet-300 ${
                          task.done ? "line-through opacity-60" : ""
                        }`}
                      >
                        {emoji}{" "}
                        <span className="align-middle">{task.title}</span>
                      </button>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          task.source === "jira"
                            ? "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200"
                            : "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200"
                        }`}
                      >
                        {task.source === "jira" ? "Jira" : "AI"}
                      </span>
                      {task.externalUrl && (
                        <a
                          href={task.externalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-sky-700 hover:underline dark:text-sky-300"
                        >
                          {task.externalId ?? "Відкрити в Jira"}
                        </a>
                      )}
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        {energyLabels[task.energy] ?? "🎯 фокус"}
                      </span>
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        #{tagLabels[task.tag] ?? "хаос"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500 line-clamp-2 dark:text-zinc-400">
                      Оригінал: {task.rawInput}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                      <span>
                        Дедлайн:{" "}
                        <strong
                          className={
                            overdue ? "text-red-600 dark:text-red-400" : ""
                          }
                        >
                          {formatDeadline(task.deadline)}
                        </strong>
                        {overdue && " · прострочено"}
                      </span>
                      <span>
                        Пріоритет:{" "}
                        <strong>
                          {task.priority === "high"
                            ? "високий"
                            : task.priority === "low"
                              ? "низький"
                              : "середній"}
                        </strong>
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeTask(task.id)}
                    className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                    aria-label="Видалити задачу"
                  >
                    Видалити
                  </button>
                  <button
                    type="button"
                    onClick={() => explainTask(task)}
                    disabled={coachLoadingId === task.id}
                    className="rounded-lg px-2 py-1 text-xs font-medium text-violet-600 hover:bg-violet-50 disabled:opacity-50 dark:text-violet-300 dark:hover:bg-violet-950"
                  >
                    {coachLoadingId === task.id ? "Думаю…" : "Чому відкладаю?"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <footer className="mt-auto border-t border-zinc-200 pt-6 text-center text-xs text-zinc-500 dark:border-zinc-800">
        Oh My Tasks! · Neon + Prisma · AI, Jira, Calendar і трошки емоційної підтримки
      </footer>
    </div>
  );
}
