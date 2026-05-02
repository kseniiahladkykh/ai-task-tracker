import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTaskOwner, setGuestCookie } from "@/lib/task-owner";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function PATCH(req: Request, context: Ctx) {
  const { id } = context.params;
  try {
    const owner = await getTaskOwner();
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

    const result = await prisma.task.updateMany({
      where: { id, ...owner.where },
      data,
    });

    if (result.count === 0) {
      return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
    }

    const task = await prisma.task.findFirst({
      where: { id, ...owner.where },
    });

    return setGuestCookie(NextResponse.json(task), owner);
  } catch {
    return NextResponse.json({ error: "Не знайдено або помилка" }, { status: 404 });
  }
}

export async function DELETE(_req: Request, context: Ctx) {
  const { id } = context.params;
  try {
    const owner = await getTaskOwner();
    const result = await prisma.task.deleteMany({ where: { id, ...owner.where } });
    if (result.count === 0) {
      return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
    }
    return setGuestCookie(NextResponse.json({ ok: true }), owner);
  } catch {
    return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  }
}
