"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type TaskRow = {
  id: string;
  rawInput: string;
  title: string;
  priority: string;
  deadline: string | null;
  done: boolean;
  createdAt: string;
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

export default function TaskApp() {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "done">("all");
  const [sort, setSort] = useState<"deadline" | "priority" | "created">(
    "created"
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [recLoading, setRecLoading] = useState(false);
  const [recItems, setRecItems] = useState<
    { id: string; title: string; reason: string }[]
  >([]);
  const [recMessage, setRecMessage] = useState<string | null>(null);

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
  }, [load]);

  const visible = useMemo(() => {
    let list = tasks.filter((t) => {
      if (filter === "active") return !t.done;
      if (filter === "done") return t.done;
      return true;
    });

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
  }, [tasks, filter, sort]);

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

  const total = tasks.length;
  const hasAny = total > 0;
  const emptyFiltered = hasAny && visible.length === 0;

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-4 py-10 pb-24 font-[family-name:var(--font-geist-sans)]">
      <header className="space-y-2">
        <p className="text-sm font-medium text-violet-600 dark:text-violet-400">
          AI таск-трекер
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Пиши як у Slack — решту зробить GPT
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Одне поле: назва, дедлайн і пріоритет витягне модель. Без нудних форм.
        </p>
      </header>

      <form onSubmit={handleAdd} className="space-y-3">
        <label className="sr-only" htmlFor="task-input">
          Нова задача
        </label>
        <textarea
          id="task-input"
          rows={3}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='Наприклад: «Завтра до обіду написати Славі про відео, терміново»'
          className="w-full resize-y rounded-2xl border border-zinc-200 bg-white/80 px-4 py-3 text-base shadow-sm outline-none ring-violet-500/30 placeholder:text-zinc-400 focus:border-violet-400 focus:ring-4 dark:border-zinc-700 dark:bg-zinc-900/80 dark:focus:border-violet-500"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={submitting || !input.trim()}
            className="rounded-full bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Думаю…" : "Додати задачу"}
          </button>
          <button
            type="button"
            onClick={() => whatNow()}
            disabled={recLoading}
            className="rounded-full border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-800 transition hover:bg-violet-100 disabled:opacity-50 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-200"
          >
            {recLoading ? "Аналізую список…" : "Що робити зараз?"}
          </button>
        </div>
      </form>

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
            Тут поки порожньо — і це нормально
          </p>
          <p className="mt-2 max-w-sm text-zinc-600 dark:text-zinc-400">
            Напиши все, що крутиться в голові, одним повідомленням. ШІ розкладе по
            поличках, а ти сміливо підеш пити какао.
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
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <footer className="mt-auto border-t border-zinc-200 pt-6 text-center text-xs text-zinc-500 dark:border-zinc-800">
        Зберігання в Neon через Prisma · ключі лише на сервері
      </footer>
    </div>
  );
}
