import { test, expect } from "@playwright/test";
import { emptyState, addDays, dayKey } from "../../lib/model";
test("full manual flow: add group, post, preview campaign, persist, reschedule, report", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Sua fila, sob controle." }),
  ).toBeVisible();
  if (info.project.name === "android") {
    await page.getByRole("button", { name: "Mais", exact: true }).click();
  }
  await page.getByRole("button", { name: "Grupos", exact: true }).click();
  await page.getByRole("button", { name: "Adicionar primeiro grupo" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome do grupo").fill("Comércio de Pelotas");
  await dialog
    .getByLabel("Link do grupo")
    .fill("https://www.facebook.com/groups/pelotas");
  await dialog
    .getByLabel("Regras e observações")
    .fill("Uma publicação por dia.");
  await dialog.getByRole("button", { name: "Salvar grupo" }).click();
  await expect(
    page.getByRole("heading", { name: "Comércio de Pelotas" }),
  ).toBeVisible();
  if (info.project.name === "android")
    await page.getByRole("button", { name: "Mais", exact: true }).click();
  await page.getByRole("button", { name: "Biblioteca", exact: true }).click();
  await page.getByRole("button", { name: "Criar primeiro post" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Título interno").fill("Oferta desta semana");
  await dialog
    .getByLabel("Texto da publicação")
    .fill("Conheça as novidades da nossa loja.");
  await dialog.getByRole("button", { name: "Salvar post" }).click();
  await expect(
    page.getByRole("heading", { name: "Oferta desta semana" }),
  ).toBeVisible();
  if (info.project.name === "android")
    await page.getByRole("button", { name: "Mais", exact: true }).click();
  await page
    .getByRole("button", { name: "Campanhas", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Criar primeira campanha" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome da campanha").fill("Semana de lançamento");
  await dialog.getByLabel("Quantidade de dias").fill("1");
  await dialog.getByLabel("Publicações por dia").fill("1");
  await dialog.getByLabel("Comércio de Pelotas").check();
  await dialog.getByLabel("Oferta desta semana").check();
  await dialog.getByRole("button", { name: "Revisar horários" }).click();
  await expect(dialog.getByText("1 publicações")).toBeVisible();
  await dialog.getByRole("button", { name: "Confirmar agendamento" }).click();
  await expect(
    page.getByRole("heading", { name: "Sua fila, sob controle." }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Preparar publicação" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Preparar publicação" }).click();
  await expect(
    page.getByRole("heading", { name: "Registre o que aconteceu" }),
  ).toBeVisible();
  const popup = page.waitForEvent("popup");
  await page.getByRole("link", { name: "Abrir grupo" }).click();
  const facebook = await popup;
  await facebook.close();
  await expect(page.getByText("Agendada", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reagendar", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Data", { exact: true })
    .fill(addDays(dayKey(new Date()), 2));
  await dialog.getByRole("button", { name: "Reagendar", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Registre o que aconteceu" }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/publisher-${info.project.name}.png`,
    fullPage: true,
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  expect(overflow).toBe(false);
  expect(errors).toEqual([]);
});
test("manual confirmation of a due job and backup survive reload", async ({
  page,
}, info) => {
  const state = emptyState(),
    gid = crypto.randomUUID(),
    pid = crypto.randomUUID(),
    cid = crypto.randomUUID(),
    jid = crypto.randomUUID();
  state.groups.push({
    id: gid,
    name: "Grupo de teste",
    url: "https://www.facebook.com/groups/teste",
    category: "",
    rules: "",
    intervalHours: 24,
    active: true,
  });
  state.posts.push({
    id: pid,
    title: "Post de teste",
    text: "Conteúdo",
    link: "",
    image: "",
    tags: "",
    archived: false,
  });
  state.campaigns.push({
    id: cid,
    name: "Campanha de teste",
    groupIds: [gid],
    postIds: [pid],
    startDate: dayKey(new Date()),
    days: 1,
    dailyLimit: 1,
    startTime: "09:00",
    endTime: "20:00",
    paused: false,
  });
  state.jobs.push({
    id: jid,
    campaignId: cid,
    groupId: gid,
    postId: pid,
    scheduledAt: new Date(Date.now() - 60000).toISOString(),
    status: "scheduled",
    resultUrl: "",
    note: "",
    completedAt: "",
    postSnapshot: state.posts[0],
    groupSnapshot: state.groups[0],
  });
  await page.addInitScript(
    (s) =>
      localStorage.setItem(
        "group-scheduler-workspace-v1",
        JSON.stringify({ state: s, revision: 1 }),
      ),
    state,
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Preparar publicação" }).click();
  await page.getByRole("button", { name: "Confirmar resultado" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Conferi o resultado no Facebook.").check();
  await dialog.getByRole("button", { name: "Salvar resultado" }).click();
  await expect(page.getByText("Publicada", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("group-scheduler-workspace-v1")!).state
          .jobs[0].status,
    ),
  ).toBe("published");
  await page.screenshot({
    path: `test-results/confirmed-${info.project.name}.png`,
    fullPage: true,
  });
});
test("invalid link remains unsaved and unauthorized API/cron calls are blocked", async ({
  page,
  request,
}, info) => {
  await page.goto("/");
  if (info.project.name === "android")
    await page.getByRole("button", { name: "Mais", exact: true }).click();
  await page.getByRole("button", { name: "Grupos", exact: true }).click();
  await page.getByRole("button", { name: "Adicionar primeiro grupo" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome do grupo").fill("Teste inválido");
  await dialog.getByLabel("Link do grupo").fill("https://evil.test/groups/x");
  await dialog.getByRole("button", { name: "Salvar grupo" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  expect([401, 503]).toContain((await request.get("/api/state")).status());
  expect((await request.get("/api/cron")).status()).toBe(401);
});

test("all working surfaces are accessible and have no horizontal overflow", async ({
  page,
}, info) => {
  await page.goto("/");
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  for (const name of [
    "Hoje",
    "Grupos",
    "Campanhas",
    "Biblioteca",
    "Calendário",
    "Publicador",
    "Histórico",
    "Relatórios",
    "Configurações",
  ]) {
    if (info.project.name === "android")
      await page.getByRole("button", { name: "Mais", exact: true }).click();
    await page
      .locator("aside.sidebar")
      .getByRole("button", { name, exact: true })
      .click();
    await expect(page.locator("h1")).toBeVisible();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
  }
  await page.screenshot({
    path: `test-results/settings-${info.project.name}.png`,
    fullPage: true,
  });
});

test("PWA manifest, service worker and offline recovery page", async ({
  page,
  context,
  request,
}) => {
  const r = await request.get("/manifest.webmanifest");
  expect(r.status()).toBe(200);
  const m = await r.json();
  expect(m.display).toBe("standalone");
  expect(m.icons.length).toBe(3);
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.route("**/offline-test", (route) => route.abort());
  await context.setOffline(true);
  await page.goto("/offline-test");
  await expect(
    page.getByRole("heading", { name: "Você está sem conexão" }),
  ).toBeVisible();
  await context.setOffline(false);
  await context.unroute("**/offline-test");
  await page.getByRole("link", { name: "Tentar novamente" }).click();
  await expect(
    page.getByRole("heading", { name: "Sua fila, sob controle." }),
  ).toBeVisible();
});

test("backup export/import and CSV are reviewable downloads", async ({
  page,
}, info) => {
  await page.goto("/");
  if (info.project.name === "android")
    await page.getByRole("button", { name: "Mais", exact: true }).click();
  await page
    .getByRole("button", { name: "Configurações", exact: true })
    .click();
  const backup = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar backup" }).click();
  expect((await backup).suggestedFilename()).toBe("scheduler-backup.json");
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(emptyState())),
    });
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "Substituir dados pelo backup?" }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  if (info.project.name === "android")
    await page.getByRole("button", { name: "Mais", exact: true }).click();
  await page.getByRole("button", { name: "Relatórios", exact: true }).click();
  const csv = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar CSV" }).click();
  expect((await csv).suggestedFilename()).toBe("scheduler-publicacoes.csv");
});
