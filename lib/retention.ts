import { type AppState, addDays, dayKey, log } from "./model";
export function cleanupClosedHistory(
  state: AppState,
  today: string,
): { state: AppState; removed: number } {
  const cutoff = addDays(today, -90);
  const removable = new Set(
    state.jobs
      .filter(
        (j) =>
          !["scheduled", "pending"].includes(j.status) &&
          dayKey(j.scheduledAt) < cutoff,
      )
      .map((j) => j.id),
  );
  const jobs = state.jobs.filter((j) => !removable.has(j.id));
  const campaigns = state.campaigns.filter(
    (c) =>
      jobs.some((j) => j.campaignId === c.id) ||
      addDays(c.startDate, c.days - 1) >= cutoff,
  );
  return {
    removed: removable.size,
    state: log(
      {
        ...state,
        jobs,
        campaigns,
        logs: state.logs.filter(
          (l) => dayKey(l.at) >= cutoff && !removable.has(l.jobId || ""),
        ),
      },
      "Histórico antigo limpo",
      `${removable.size} horários encerrados há mais de 90 dias foram removidos.`,
    ),
  };
}
