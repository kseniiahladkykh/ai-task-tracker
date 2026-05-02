import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type GoogleCalendarEvent = {
  id: string;
  summary?: string;
  htmlLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

async function refreshGoogleToken(account: {
  id: string;
  refresh_token: string | null;
}) {
  if (!account.refresh_token) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
      refresh_token: account.refresh_token,
    }),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
  };

  if (!data.access_token) return null;

  await prisma.account.update({
    where: { id: account.id },
    data: {
      access_token: data.access_token,
      expires_at: Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
      token_type: data.token_type,
      scope: data.scope,
    },
  });

  return data.access_token;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Спочатку увійди через Google." },
      { status: 401 }
    );
  }

  const account = await prisma.account.findFirst({
    where: { userId: session.user.id, provider: "google" },
  });

  if (!account?.access_token) {
    return NextResponse.json(
      {
        error:
          "Google Calendar ще не підключений. Вийди й увійди через Google ще раз, щоб дати доступ до календаря.",
      },
      { status: 403 }
    );
  }

  let accessToken = account.access_token;
  if (account.expires_at && account.expires_at < Math.floor(Date.now() / 1000) + 60) {
    accessToken = (await refreshGoogleToken(account)) ?? accessToken;
  }

  const url = new URL(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events"
  );
  url.searchParams.set("timeMin", new Date().toISOString());
  url.searchParams.set("maxResults", "8");
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json(
      {
        error:
          "Не вдалося прочитати Google Calendar. Спробуй вийти й увійти знову, щоб оновити permission.",
      },
      { status: res.status }
    );
  }

  const data = (await res.json()) as { items?: GoogleCalendarEvent[] };
  const events = (data.items ?? []).map((event) => ({
    id: event.id,
    title: event.summary ?? "Без назви, але календар так вирішив",
    start: event.start?.dateTime ?? event.start?.date ?? null,
    end: event.end?.dateTime ?? event.end?.date ?? null,
    url: event.htmlLink ?? null,
  }));

  return NextResponse.json({ events });
}
