import { NextResponse } from "next/server";
import { getTwoMinuteTasks } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { getTaskOwner, setGuestCookie } from "@/lib/task-owner";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const owner = await getTaskOwner();
    const body = (await req.json().catch(() => ({}))) as { mood?: string };
    const tasks = await prisma.task.findMany({
      where: { done: false, ...owner.where },
      orderBy: { createdAt: "desc" },
      take: 30,
    });

    const result = await getTwoMinuteTasks(
      tasks.map((t) => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        deadline: t.deadline?.toISOString() ?? null,
        energy: t.energy,
        tag: t.tag,
      })),
      body.mood ?? "meme-1"
    );

    return setGuestCookie(
      NextResponse.json(
        result ?? {
          headline: "2-хвилинний режим",
          items: tasks.slice(0, 3).map((t) => ({
            id: t.id,
            reason: "Почни з мікрокроку: відкрити, глянути, не драматизувати.",
          })),
          meme: "Дві хвилини теж рахуються. Мозок не підозрює пастку.",
        }
      ),
      owner
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Не знайшла 2-хвилинні задачі." }, { status: 500 });
  }
}
