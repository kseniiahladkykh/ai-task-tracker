import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recommendTopTasks } from "@/lib/ai";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const open = await prisma.task.findMany({
      where: { done: false },
      orderBy: { createdAt: "desc" },
    });

    if (open.length === 0) {
      return NextResponse.json({
        items: [] as { id: string; title: string; reason: string }[],
        message: "Активних задач немає — можна відпочити ☕",
      });
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

    return NextResponse.json({ items, message: null as string | null });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Не вдалося отримати рекомендації." },
      { status: 500 }
    );
  }
}
