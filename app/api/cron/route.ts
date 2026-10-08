import { timingSafeEqual } from "node:crypto";
import webpush from "web-push";
import { admin, apiError } from "@/lib/server";
import { isPushEndpoint } from "@/lib/push";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET,
    header = request.headers.get("authorization") || "",
    expected = `Bearer ${secret}`;
  if (
    !secret ||
    Buffer.byteLength(header) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(header), Buffer.from(expected))
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (
    !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
    !process.env.VAPID_PRIVATE_KEY ||
    !process.env.VAPID_SUBJECT
  )
    return Response.json({ error: "Push não configurado." }, { status: 503 });
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    );
    const db = admin();
    const { data: tasks, error } = await db.rpc("scheduler_claim_reminders", {
      batch_size: 10,
    });
    if (error) throw new Error("Não foi possível buscar lembretes.");
    let sent = 0,
      failed = 0;
    for (const task of tasks || []) {
      const { data: sub, error: se } = await db
        .from("scheduler_push_subscriptions")
        .select("subscription")
        .eq("id", task.subscription_id)
        .eq("user_id", task.user_id)
        .maybeSingle();
      if (se) {
        failed++;
        continue;
      }
      if (!sub) {
        await db
          .from("scheduler_reminders")
          .update({ status: "discarded" })
          .eq("id", task.id);
        continue;
      }
      if (!isPushEndpoint(sub.subscription.endpoint)) {
        await db
          .from("scheduler_push_subscriptions")
          .delete()
          .eq("id", task.subscription_id);
        continue;
      }
      // Recheck after claiming so cancelled/paused jobs are not intentionally sent.
      const { data: workspace } = await db
        .from("scheduler_workspaces")
        .select("state")
        .eq("user_id", task.user_id)
        .maybeSingle();
      const job = workspace?.state.jobs.find(
        (j: { id: string }) => j.id === task.job_id,
      );
      const campaign = workspace?.state.campaigns.find(
        (c: { id: string }) => c.id === job?.campaignId,
      );
      const group = workspace?.state.groups.find(
        (g: { id: string }) => g.id === job?.groupId,
      );
      if (
        !job ||
        job.status !== "scheduled" ||
        campaign?.paused ||
        !group?.active ||
        job.scheduledAt !== task.scheduled_at
      ) {
        await db
          .from("scheduler_reminders")
          .update({ status: "discarded" })
          .eq("id", task.id);
        continue;
      }
      try {
        await webpush.sendNotification(
          sub.subscription,
          JSON.stringify({
            title: "Hora de preparar sua publicação",
            body: `${job.postSnapshot.title} · ${group.name}`,
            jobId: job.id,
            tag: task.id,
          }),
          { TTL: 900, timeout: 4000 },
        );
        const { error: updateError } = await db
          .from("scheduler_reminders")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", task.id);
        if (updateError) failed++;
        else sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        failed++;
        if (status === 404 || status === 410) {
          await db
            .from("scheduler_push_subscriptions")
            .delete()
            .eq("id", task.subscription_id);
        } else {
          await db
            .from("scheduler_reminders")
            .update({
              status: task.attempts >= 3 ? "discarded" : "pending",
              lease_until: new Date(Date.now() + 60000).toISOString(),
            })
            .eq("id", task.id);
        }
      }
    }
    return Response.json({ sent, failed, claimed: tasks?.length || 0 });
  } catch (e) {
    return apiError(e);
  }
}
