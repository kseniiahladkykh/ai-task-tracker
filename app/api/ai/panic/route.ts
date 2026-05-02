import { NextResponse } from "next/server";
import { getPanicPlan } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { getTaskOwner, setGuestCookie } from "@/lib/task-owner";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const owner = await getTaskOwner();
    const body = (await req.json().catch(() => ({}))) as { mood?: string };
    const tasks = await prisma.task.findMany({
      where: { done: false, ...owner.where },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      take: 20,
    });

    const plan = await getPanicPlan(
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
        plan ?? {
          headline: "Антипаніка без AI, але ми тримаємось",
          firstStep: "Обери одну найменшу задачу і відкрий потрібну вкладку.",
          nextSteps: ["Постав таймер на 10 хвилин", "Закрий зайві вкладки"],
          delegateOrDrop: [],
          meme: "Ти не хаос. Ти просто Chrome з людським обличчям.",
        }
      ),
      owner
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Антипаніка спіткнулась об кабель." }, { status: 500 });
  }
}
