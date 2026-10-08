import {
  type AppState,
  type Campaign,
  type Job,
  addDays,
  dateTime,
  countsTowardLimit,
  dayKey,
  validateState,
} from "./model";
export function planCampaign(
  state: AppState,
  campaign: Campaign,
  now = Date.now(),
): { jobs: Job[]; warnings: string[] } {
  const groups = campaign.groupIds
    .map((id) => state.groups.find((g) => g.id === id))
    .filter((g) => g?.active);
  const posts = campaign.postIds
    .map((id) => state.posts.find((p) => p.id === id))
    .filter((p) => p && !p.archived);
  if (!groups.length || !posts.length)
    throw new Error(
      "Selecione pelo menos um grupo ativo e um post disponível.",
    );
  const start = dateTime(campaign.startDate, campaign.startTime),
    end = dateTime(campaign.startDate, campaign.endTime);
  if (
    !Number.isFinite(Date.parse(start)) ||
    Date.parse(end) <= Date.parse(start)
  )
    throw new Error("O horário final precisa ser depois do inicial.");
  const jobs: Job[] = [],
    warnings: string[] = [];
  let groupCursor = 0,
    postCursor = 0;
  for (let d = 0; d < campaign.days; d++) {
    const day = addDays(campaign.startDate, d);
    const occupied = state.jobs.filter(
      (j) => countsTowardLimit(j) && dayKey(j.scheduledAt) === day,
    );
    const quota = Math.min(campaign.dailyLimit, 10 - occupied.length);
    if (quota <= 0) {
      warnings.push(`${day}: limite diário já preenchido.`);
      continue;
    }
    const a = Date.parse(dateTime(day, campaign.startTime)),
      b = Date.parse(dateTime(day, campaign.endTime));
    let made = 0;
    for (let slot = 0; slot < quota; slot++) {
      const at =
        a +
        (quota === 1
          ? 0
          : Math.floor(((b - a) * slot) / (quota - 1) / 60000) * 60000);
      if (at < now) {
        warnings.push(`${day}: horário passado ignorado.`);
        continue;
      }
      if (
        [...occupied, ...jobs].some(
          (j) =>
            countsTowardLimit(j) &&
            Math.abs(Date.parse(j.scheduledAt) - at) < 15 * 60000,
        )
      ) {
        warnings.push(`${day}: horários muito próximos (mínimo 15 minutos).`);
        continue;
      }
      let selected: (typeof groups)[number];
      for (let i = 0; i < groups.length; i++) {
        const g = groups[(groupCursor + i) % groups.length]!;
        if (
          ![...state.jobs, ...jobs].some(
            (j) =>
              j.groupId === g.id &&
              countsTowardLimit(j) &&
              Math.abs(Date.parse(j.scheduledAt) - at) <
                g.intervalHours * 3600000,
          )
        ) {
          selected = g;
          groupCursor = (groupCursor + i + 1) % groups.length;
          break;
        }
      }
      if (!selected) {
        warnings.push(
          `${day}: intervalo entre posts no grupo não permite preencher todos os horários.`,
        );
        continue;
      }
      const post = posts[postCursor++ % posts.length]!;
      jobs.push({
        id: crypto.randomUUID(),
        campaignId: campaign.id,
        groupId: selected.id,
        postId: post.id,
        scheduledAt: new Date(at).toISOString(),
        status: "scheduled",
        resultUrl: "",
        note: "",
        completedAt: "",
        postSnapshot: structuredClone(post),
        groupSnapshot: structuredClone(selected),
      });
      made++;
    }
    if (made < quota && !warnings.some((w) => w.startsWith(day)))
      warnings.push(`${day}: ${made} de ${quota} horários disponíveis.`);
  }
  if (!jobs.length)
    throw new Error(
      "Nenhum horário disponível. Ajuste datas, grupos ou intervalos.",
    );
  return { jobs, warnings: [...new Set(warnings)] };
}
export function reschedule(
  state: AppState,
  id: string,
  at: string,
  now = Date.now(),
): AppState {
  const job = state.jobs.find((j) => j.id === id);
  if (!job || job.status !== "scheduled")
    throw new Error("Somente publicações agendadas podem ser reagendadas.");
  if (Date.parse(at) <= now) throw new Error("Escolha um horário futuro.");
  const group = state.groups.find((g) => g.id === job.groupId)!;
  const others = state.jobs.filter((j) => j.id !== id && countsTowardLimit(j));
  if (
    others.some(
      (j) => Math.abs(Date.parse(j.scheduledAt) - Date.parse(at)) < 15 * 60000,
    )
  )
    throw new Error("Deixe pelo menos 15 minutos entre publicações.");
  if (
    others.some(
      (j) =>
        j.groupId === job.groupId &&
        Math.abs(Date.parse(j.scheduledAt) - Date.parse(at)) <
          group.intervalHours * 3600000,
    )
  )
    throw new Error("O intervalo mínimo desse grupo não foi respeitado.");
  return validateState({
    ...state,
    jobs: state.jobs.map((j) => (j.id === id ? { ...j, scheduledAt: at } : j)),
  });
}
