export type JiraTask = {
  externalId: string;
  externalUrl: string;
  title: string;
  priority: "high" | "medium" | "low";
  deadline: Date | null;
  done: boolean;
  rawInput: string;
  energy: "brain" | "quick" | "autopilot" | "emotional" | "focus";
  tag: "work";
};

type JiraIssue = {
  key: string;
  fields: {
    summary?: string;
    duedate?: string | null;
    priority?: { name?: string } | null;
    status?: { statusCategory?: { key?: string } } | null;
  };
};

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function mapPriority(name?: string): "high" | "medium" | "low" {
  const n = (name ?? "").toLowerCase();
  if (["highest", "high", "blocker", "critical"].some((s) => n.includes(s))) {
    return "high";
  }
  if (["lowest", "low", "minor", "trivial"].some((s) => n.includes(s))) {
    return "low";
  }
  return "medium";
}

function parseDueDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T23:59:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function fetchAssignedJiraTasks(): Promise<JiraTask[]> {
  const baseUrl = normalizeBaseUrl(requireEnv("JIRA_BASE_URL"));
  const email = requireEnv("JIRA_EMAIL");
  const apiToken = requireEnv("JIRA_API_TOKEN");

  const auth = Buffer.from(`${email}:${apiToken}`).toString("base64");
  const jql =
    process.env.JIRA_JQL?.trim() ||
    'assignee = currentUser() AND statusCategory != Done ORDER BY priority DESC, updated DESC';

  const url = new URL(`${baseUrl}/rest/api/3/search/jql`);
  url.searchParams.set("jql", jql);
  url.searchParams.set("maxResults", "25");
  url.searchParams.set("fields", "summary,duedate,priority,status");

  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Jira request failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { issues?: JiraIssue[] };
  const issues = Array.isArray(data.issues) ? data.issues : [];

  return issues.map((issue) => {
    const summary = issue.fields.summary?.trim() || issue.key;
    const statusKey = issue.fields.status?.statusCategory?.key;

    return {
      externalId: issue.key,
      externalUrl: `${baseUrl}/browse/${issue.key}`,
      title: summary,
      priority: mapPriority(issue.fields.priority?.name),
      deadline: parseDueDate(issue.fields.duedate),
      done: statusKey === "done",
      rawInput: `[Jira ${issue.key}] ${summary}`,
      energy: "focus",
      tag: "work",
    };
  });
}
