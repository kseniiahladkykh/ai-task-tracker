import { NextResponse } from "next/server";
import { breakTaskIntoSubtasks } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { getTaskOwner, setGuestCookie } from "@/lib/task-owner";

export const dynamic = "force-dynamic";

function safePriority(value: unknown) {
  return ["high", "medium", "low"].includes(String(value)) ? String(value) : "medium";
}

function safeEnergy(value: unknown) {
  return ["brain", "quick", "autopilot", "emotional", "focus"].includes(String(value))
    ? String(value)
    : "focus";
}

function safeTag(value: unknown) {
  return ["work", "study", "personal", "health", "admin", "chaos"].includes(String(value))
    ? String(value)
    : "chaos";
}

export async function POST(req: Request) {
  try {
    const owner = await getTaskOwner();
    const body = (await req.json()) as { rawInput?: string; mood?: string };
    const rawInput = body.rawInput?.trim();
    if (!rawInput) {
      return NextResponse.json({ error: "Немає тексту для розбиття" }, { status: 400 });
    }

    const result = await breakTaskIntoSubtasks(rawInput, body.mood ?? "meme-1");
    const subtasks = Array.isArray(result?.subtasks) ? result.subtasks : [];

    const created = [];
    for (const row of subtasks.slice(0, 6)) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const title = typeof r.title === "string" ? r.title.trim().slice(0, 500) : "";
      if (!title) continue;

      created.push(
        await prisma.task.create({
          data: {
            ...owner.data,
            rawInput: `[Підзадача з: ${rawInput.slice(0, 120)}] ${title}`,
            title,
            priority: safePriority(r.priority),
            deadline: null,
            energy: safeEnergy(r.energy),
            tag: safeTag(r.tag),
          },
        })
      );
    }

    if (created.length === 0) {
      created.push(
        await prisma.task.create({
          data: {
            ...owner.data,
            rawInput,
            title: rawInput.slice(0, 500),
            priority: "medium",
            deadline: null,
            energy: "focus",
            tag: "chaos",
          },
        })
      );
    }

    return setGuestCookie(
      NextResponse.json({
        title: typeof result?.title === "string" ? result.title : "План розбиття",
        meme:
          typeof result?.meme === "string"
            ? result.meme
            : "Велика задача стала маленькими жабками. Уже не так страшно.",
        created,
      }),
      owner
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Не вдалося розбити задачу." }, { status: 500 });
  }
}
