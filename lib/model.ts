import { z } from "zod";
export const TIMEZONE = "America/Sao_Paulo";
export const statusLabels = {
  scheduled: "Agendada",
  published: "Publicada",
  pending: "Aguardando aprovação",
  failed: "Não publicada",
  skipped: "Ignorada",
  cancelled: "Cancelada",
};
export type Status = keyof typeof statusLabels;
export const groupSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(2).max(120),
  url: z
    .string()
    .url()
    .refine((v) => {
      try {
        const u = new URL(v);
        return (
          u.protocol === "https:" &&
          ["facebook.com", "www.facebook.com", "m.facebook.com"].includes(
            u.hostname,
          ) &&
          /^\/groups\/[^/]+\/?$/.test(u.pathname)
        );
      } catch {
        return false;
      }
    }, "Use um link https://www.facebook.com/groups/nome-ou-id"),
  category: z.string().max(80),
  rules: z.string().max(2000),
  intervalHours: z.number().int().min(1).max(720),
  active: z.boolean(),
});
export const postSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(2).max(120),
  text: z.string().trim().min(1).max(10000),
  link: z.union([
    z.literal(""),
    z
      .string()
      .url()
      .refine((v) => /^https?:/.test(v)),
  ]),
  image: z
    .string()
    .max(4200000)
    .refine(
      (v) =>
        v === "" ||
        /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v),
    ),
  tags: z.string().max(160),
  archived: z.boolean(),
});
export const campaignSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(2).max(120),
  groupIds: z.array(z.uuid()).min(1),
  postIds: z.array(z.uuid()).min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  days: z.number().int().min(1).max(90),
  dailyLimit: z.number().int().min(1).max(10),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  paused: z.boolean(),
});
export const jobSchema = z.object({
  id: z.uuid(),
  campaignId: z.uuid(),
  groupId: z.uuid(),
  postId: z.uuid(),
  scheduledAt: z.iso.datetime(),
  status: z.enum([
    "scheduled",
    "published",
    "pending",
    "failed",
    "skipped",
    "cancelled",
  ]),
  resultUrl: z.union([
    z.literal(""),
    z
      .string()
      .url()
      .refine((v) => {
        try {
          const u = new URL(v);
          return (
            u.protocol === "https:" &&
            ["facebook.com", "www.facebook.com", "m.facebook.com"].includes(
              u.hostname,
            )
          );
        } catch {
          return false;
        }
      }),
  ]),
  note: z.string().max(2000),
  completedAt: z.union([z.literal(""), z.iso.datetime()]),
  postSnapshot: postSchema,
  groupSnapshot: groupSchema,
});
export const stateSchema = z.object({
  version: z.literal(1),
  groups: z.array(groupSchema).max(200),
  posts: z.array(postSchema).max(200),
  campaigns: z.array(campaignSchema).max(100),
  jobs: z.array(jobSchema).max(5000),
  logs: z
    .array(
      z.object({
        id: z.uuid(),
        jobId: z.uuid().optional(),
        at: z.iso.datetime(),
        action: z.string().max(120),
        detail: z.string().max(1000),
      }),
    )
    .max(10000),
});
export type Group = z.infer<typeof groupSchema>;
export type Post = z.infer<typeof postSchema>;
export type Campaign = z.infer<typeof campaignSchema>;
export type Job = z.infer<typeof jobSchema>;
export type AppState = z.infer<typeof stateSchema>;
export const emptyState = (): AppState => ({
  version: 1,
  groups: [],
  posts: [],
  campaigns: [],
  jobs: [],
  logs: [],
});
const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
});
const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TIMEZONE,
  day: "2-digit",
  month: "short",
});
export function dayKey(date: string | Date) {
  return dayFormatter.format(new Date(date));
}
export function dateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00-03:00`).toISOString();
}
export function addDays(day: string, n: number) {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function formatTime(date: string) {
  return timeFormatter.format(new Date(date));
}
export function formatDate(date: string) {
  return dateFormatter.format(
    new Date(date.length === 10 ? date + "T12:00:00Z" : date),
  );
}
export const countsTowardLimit = (j: Job) =>
  !["cancelled", "skipped"].includes(j.status);
export function log(
  state: AppState,
  action: string,
  detail: string,
  jobId?: string,
): AppState {
  return {
    ...state,
    logs: [
      {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        action,
        detail,
        jobId,
      },
      ...state.logs,
    ].slice(0, 10000),
  };
}
export function validateState(input: unknown): AppState {
  const s = stateSchema.parse(input);
  for (const key of ["groups", "posts", "campaigns", "jobs", "logs"] as const) {
    const ids = s[key].map((x) => x.id);
    if (new Set(ids).size !== ids.length)
      throw new Error("Identificadores duplicados.");
  }
  const days = new Map<string, number>();
  for (const j of s.jobs) {
    if (
      !s.campaigns.some((c) => c.id === j.campaignId) ||
      !s.groups.some((g) => g.id === j.groupId) ||
      !s.posts.some((p) => p.id === j.postId)
    )
      throw new Error("Agendamento com referência inválida.");
    if (j.groupSnapshot.id !== j.groupId || j.postSnapshot.id !== j.postId)
      throw new Error("Conteúdo do agendamento inválido.");
    if (countsTowardLimit(j)) {
      const day = dayKey(j.scheduledAt);
      days.set(day, (days.get(day) || 0) + 1);
      if (days.get(day)! > 10)
        throw new Error(
          "O limite é de 10 publicações por dia, somando todas as campanhas.",
        );
    }
  }
  return s;
}
export function contentFor(post: Post) {
  return post.text + (post.link ? "\n\n" + post.link : "");
}
export function canPrepare(state: AppState, job: Job) {
  return (
    job.status === "scheduled" &&
    !state.campaigns.find((c) => c.id === job.campaignId)?.paused &&
    !!state.groups.find((g) => g.id === job.groupId)?.active
  );
}
