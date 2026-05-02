import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recommendTopTasks } from "@/lib/ai";
import { getTaskOwner, setGuestCookie } from "@/lib/task-owner";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const owner = await getTaskOwner();
    const open = await prisma.task.findMany({
      where: { done: false, ...owner.where },
      orderBy: { createdAt: "desc" },
    });

    if (open.length === 0) {
      return setGuestCookie(
        NextResponse.json({
          items: [] as { id: string; title: string; reason: string }[],
          message: "Активних задач немає — можна відпочити ☕",
        }),
        owner
      );
    }

    const payload = open.map((t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      deadline: t.deadline ? t.deadline.toISOString() : null,
    }));

    const picked = await recommendTopTasks(payload);

    const items = picked.map((p) => {
      const task = open.find((t) => t.id === p.id);
      return {
        id: p.id,
        title: task?.title ?? "",
        reason: p.reason,
      };
    });

    return setGuestCookie(
      NextResponse.json({ items, message: null as string | null }),
      owner
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Не вдалося отримати рекомендації." },
      { status: 500 }
    );
  }
}
