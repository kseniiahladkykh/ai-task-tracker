import { NextResponse } from "next/server";
import { explainProcrastination } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { getTaskOwner, setGuestCookie } from "@/lib/task-owner";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const owner = await getTaskOwner();
    const body = (await req.json()) as { id?: string; mood?: string };
    if (!body.id) {
      return NextResponse.json({ error: "Немає id задачі" }, { status: 400 });
    }

    const task = await prisma.task.findFirst({
      where: { id: body.id, ...owner.where },
    });

    if (!task) {
      return NextResponse.json({ error: "Задачу не знайдено" }, { status: 404 });
    }

    const result = await explainProcrastination(
      {
        id: task.id,
        title: task.title,
        priority: task.priority,
        deadline: task.deadline?.toISOString() ?? null,
        energy: task.energy,
        tag: task.tag,
      },
      body.mood ?? "meme-1"
    );

    return setGuestCookie(
      NextResponse.json(
        result ?? {
          reason: "Ймовірно, задача звучить трохи туманно або завелика.",
          tinyFirstStep: "Відкрий місце, де це робиться, і зроби перший очевидний клік.",
          meme: "Прокрастинація каже: потім. Ми кажемо: 2 хвилини і без драми.",
        }
      ),
      owner
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Не вдалося пояснити прокрастинацію." }, { status: 500 });
  }
}
