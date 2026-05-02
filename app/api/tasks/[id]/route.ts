import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function PATCH(req: Request, context: Ctx) {
  const { id } = context.params;
  try {
    const body = (await req.json()) as { done?: boolean; title?: string };
    const data: { done?: boolean; title?: string } = {};

    if (typeof body.done === "boolean") data.done = body.done;
    if (typeof body.title === "string") {
      const t = body.title.trim().slice(0, 500);
      if (t) data.title = t;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Немає полів для оновлення" }, { status: 400 });
    }

    const task = await prisma.task.update({
      where: { id },
      data,
    });
    return NextResponse.json(task);
  } catch {
    return NextResponse.json({ error: "Не знайдено або помилка" }, { status: 404 });
  }
}

export async function DELETE(_req: Request, context: Ctx) {
  const { id } = context.params;
  try {
    await prisma.task.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  }
}
