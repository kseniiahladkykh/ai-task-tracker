import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const GUEST_COOKIE = "ai_task_guest_id";

type OwnerWhere = { userId: string } | { guestId: string };
type OwnerData =
  | { userId: string; guestId: null }
  | { guestId: string; userId?: null };

export type TaskOwner = {
  where: OwnerWhere;
  data: OwnerData;
  guestId: string;
  isNewGuest: boolean;
};

export async function getTaskOwner(): Promise<TaskOwner> {
  const session = await getServerSession(authOptions);
  const cookieStore = cookies();
  const savedGuestId = cookieStore.get(GUEST_COOKIE)?.value;
  const guestId = savedGuestId ?? crypto.randomUUID();
  const isNewGuest = !savedGuestId;

  if (session?.user?.id) {
    if (savedGuestId) {
      await prisma.task.updateMany({
        where: { userId: null, guestId: savedGuestId },
        data: { userId: session.user.id, guestId: null },
      });
    }

    return {
      where: { userId: session.user.id },
      data: { userId: session.user.id, guestId: null },
      guestId,
      isNewGuest,
    };
  }

  if (isNewGuest) {
    await prisma.task.updateMany({
      where: { userId: null, guestId: null },
      data: { guestId },
    });
  }

  return {
    where: { guestId },
    data: { guestId },
    guestId,
    isNewGuest,
  };
}

export function setGuestCookie(response: NextResponse, owner: TaskOwner) {
  if (owner.isNewGuest) {
    response.cookies.set(GUEST_COOKIE, owner.guestId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  }
  return response;
}
