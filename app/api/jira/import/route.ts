import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchAssignedJiraTasks } from "@/lib/jira";
import { prisma } from "@/lib/prisma";
import { getTaskOwner, setGuestCookie } from "@/lib/task-owner";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Спочатку увійди через Google, тоді можна імпортувати Jira." },
        { status: 401 }
      );
    }

    const allowedEmails = process.env.JIRA_ALLOWED_GOOGLE_EMAILS?.split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);

    if (
      allowedEmails?.length &&
      !allowedEmails.includes(session.user.email.toLowerCase())
    ) {
      return NextResponse.json(
        { error: "Цей Google email не має доступу до Jira імпорту." },
        { status: 403 }
      );
    }

    const owner = await getTaskOwner();
    const jiraTasks = await fetchAssignedJiraTasks();
    let created = 0;
    let updated = 0;

    for (const jiraTask of jiraTasks) {
      const existing = await prisma.task.findFirst({
        where: {
          source: "jira",
          externalId: jiraTask.externalId,
          ...owner.where,
        },
      });

      if (existing) {
        await prisma.task.update({
          where: { id: existing.id },
          data: {
            title: jiraTask.title,
            rawInput: jiraTask.rawInput,
            priority: jiraTask.priority,
            deadline: jiraTask.deadline,
            done: jiraTask.done,
            externalUrl: jiraTask.externalUrl,
            energy: jiraTask.energy,
            tag: jiraTask.tag,
          },
        });
        updated += 1;
      } else {
        await prisma.task.create({
          data: {
            ...owner.data,
            source: "jira",
            externalId: jiraTask.externalId,
            externalUrl: jiraTask.externalUrl,
            title: jiraTask.title,
            rawInput: jiraTask.rawInput,
            priority: jiraTask.priority,
            deadline: jiraTask.deadline,
            done: jiraTask.done,
            energy: jiraTask.energy,
            tag: jiraTask.tag,
          },
        });
        created += 1;
      }
    }

    return setGuestCookie(
      NextResponse.json({
        imported: jiraTasks.length,
        created,
        updated,
      }),
      owner
    );
  } catch (e) {
    console.error(e);
    const details = e instanceof Error ? e.message : "Unknown Jira error";
    return NextResponse.json(
      {
        error: `Не вдалося імпортувати Jira: ${details}`,
      },
      { status: 500 }
    );
  }
}
