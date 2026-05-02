import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseTaskWithOpenAI } from "@/lib/ai";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const tasks = await prisma.task.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(tasks);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Не вдалося завантажити задачі. Перевір DATABASE_URL." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { rawInput?: string };
    const rawInput = typeof body.rawInput === "string" ? body.rawInput.trim() : "";
    if (!rawInput) {
      return NextResponse.json({ error: "Порожній текст" }, { status: 400 });
    }

    const parsed = await parseTaskWithOpenAI(rawInput);

    const task = await prisma.task.create({
      data: {
        rawInput,
        title: parsed.title,
        priority: parsed.priority,
        deadline: parsed.deadline,
      },
    });

    return NextResponse.json(task);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Не вдалося створити задачу." },
      { status: 500 }
    );
  }
}
