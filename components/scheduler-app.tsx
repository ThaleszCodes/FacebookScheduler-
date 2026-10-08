"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CalendarDays,
  LayoutDashboard,
  Users,
  Megaphone,
  Files,
  Send,
  History,
  ChartNoAxesColumn,
  Settings,
  Plus,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Check,
  Pause,
  Play,
  Download,
  Search,
  Menu,
  X,
  Bell,
  LogOut,
  RefreshCw,
  Clock,
  ArrowUpRight,
} from "lucide-react";
import { cleanupClosedHistory } from "@/lib/retention";
import { humanError } from "@/lib/errors";
import { useWorkspace } from "@/lib/use-workspace";
import { supabase } from "@/lib/supabase";
import {
  type AppState,
  type Group,
  type Post,
  type Campaign,
  type Job,
  type Status,
  emptyState,
  dayKey,
  addDays,
  formatDate,
  formatTime,
  statusLabels,
  contentFor,
  log,
  dateTime,
  canPrepare,
  validateState,
  countsTowardLimit,
} from "@/lib/model";
import { packState, unpackState, payloadJSON } from "@/lib/transport";
import { planCampaign, reschedule } from "@/lib/scheduler";
type View =
  | "dashboard"
  | "groups"
  | "campaigns"
  | "posts"
  | "calendar"
  | "publisher"
  | "history"
  | "reports"
  | "settings";
const nav = [
  ["dashboard", "Hoje", LayoutDashboard],
  ["groups", "Grupos", Users],
  ["campaigns", "Campanhas", Megaphone],
  ["posts", "Biblioteca", Files],
  ["calendar", "Calendário", CalendarDays],
  ["publisher", "Publicador", Send],
  ["history", "Histórico", History],
  ["reports", "Relatórios", ChartNoAxesColumn],
  ["settings", "Configurações", Settings],
] as const;
const uuid = () => crypto.randomUUID();
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-header">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="Fechar" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function download(data: Blob, name: string) {
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function csvCell(value: string) {
  return (
    '"' +
    (/^[=+@\-\t\r]/.test(value) ? "'" : "") +
    value.replaceAll('"', '""') +
    '"'
  );
}
function Auth() {
  const [mode, setMode] = useState<"login" | "signup" | "reset" | "password">(
      "login",
    ),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const { data } = supabase!.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setMode("password");
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return (
    <main className="auth">
      <div className="brand-mark">
        G<span>↗</span>
      </div>
      <p className="eyebrow">GROUP SCHEDULER</p>
      <h1>
        Sua próxima publicação.
        <br />
        No lugar certo.
      </h1>
      <p className="muted">
        Organize os horários. Publique no Facebook. Confirme aqui.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMessage("");
          const f = new FormData(e.currentTarget),
            email = String(f.get("email")),
            password = String(f.get("password"));
          try {
            const r =
              mode === "login"
                ? await supabase!.auth.signInWithPassword({ email, password })
                : mode === "signup"
                  ? await supabase!.auth.signUp({
                      email,
                      password,
                      options: { emailRedirectTo: location.origin },
                    })
                  : mode === "password"
                    ? await supabase!.auth.updateUser({ password })
                    : await supabase!.auth.resetPasswordForEmail(email, {
                        redirectTo: location.origin + "/reset",
                      });
            if (r.error) throw r.error;
            setMessage(
              mode === "signup"
                ? "Confira seu e-mail para ativar sua conta."
                : mode === "reset"
                  ? "Se a conta existir, você receberá o link de recuperação."
                  : mode === "password"
                    ? "Senha atualizada."
                    : "",
            );
          } catch (e) {
            setMessage(
              e instanceof Error ? e.message : "Não foi possível entrar.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2>
          {mode === "signup"
            ? "Criar conta"
            : mode === "reset"
              ? "Recuperar acesso"
              : mode === "password"
                ? "Definir nova senha"
                : "Entrar"}
        </h2>
        {mode !== "password" && (
          <Field label="E-mail">
            <input name="email" type="email" required autoComplete="email" />
          </Field>
        )}
        {mode !== "reset" && (
          <Field label="Senha">
            <input
              name="password"
              type="password"
              minLength={8}
              required
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
            />
          </Field>
        )}
        <button className="primary" disabled={busy}>
          {busy
            ? "Aguarde…"
            : mode === "signup"
              ? "Criar conta"
              : mode === "reset"
                ? "Enviar link"
                : mode === "password"
                  ? "Atualizar senha"
                  : "Entrar"}
        </button>
        {message && <p role="status">{message}</p>}
        <div className="form-links">
          <button
            type="button"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
          >
            {mode === "login" ? "Criar conta" : "Voltar para entrar"}
          </button>
          {mode === "login" && (
            <button type="button" onClick={() => setMode("reset")}>
              Esqueci minha senha
            </button>
          )}
        </div>
      </form>
      <small>Confirmação manual · Nenhum acesso à sua conta do Facebook</small>
    </main>
  );
}
export default function SchedulerApp() {
  const w = useWorkspace();
  const { state, commit } = w;
  const [view, setView] = useState<View>("dashboard"),
    [menu, setMenu] = useState(false),
    [day, setDay] = useState(dayKey(new Date())),
    [query, setQuery] = useState(""),
    [modal, setModal] = useState<
      null | "group" | "post" | "campaign" | "result" | "reschedule" | "confirm"
    >(null),
    [editing, setEditing] = useState<Group | Post | null>(null),
    [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null),
    [selected, setSelected] = useState<string>(""),
    [toast, setToast] = useState(""),
    [formError, setFormError] = useState(""),
    [preview, setPreview] = useState<{
      campaign: Campaign;
      jobs: Job[];
      warnings: string[];
    } | null>(null),
    [confirmAction, setConfirmAction] = useState<{
      title: string;
      description: string;
      run: () => Promise<void>;
    } | null>(null),
    [copied, setCopied] = useState(false),
    [opened, setOpened] = useState(false),
    [busy, setBusy] = useState(false),
    [pushEnabled, setPushEnabled] = useState(false),
    [installPrompt, setInstallPrompt] = useState<
      (Event & { prompt: () => Promise<void> }) | null
    >(null),
    [clock, setClock] = useState(Date.now());
  const fileRef = useRef<HTMLInputElement>(null),
    job = state.jobs.find((j) => j.id === selected);
  const today = dayKey(new Date(clock));
  const daily = state.jobs
    .filter((j) => dayKey(j.scheduledAt) === day)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const queue = state.jobs
    .filter((j) => canPrepare(state, j))
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const next = queue.find((j) => dayKey(j.scheduledAt) >= today) || queue[0];
  useEffect(() => {
    if ("serviceWorker" in navigator)
      navigator.serviceWorker
        .register("/sw.js")
        .then(async (reg) =>
          setPushEnabled(!!(await reg.pushManager?.getSubscription())),
        )
        .catch(() => {});
    const install = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as typeof installPrompt);
    };
    window.addEventListener("beforeinstallprompt", install);
    const id = setInterval(() => setClock(Date.now()), 30000);
    return () => {
      clearInterval(id);
      window.removeEventListener("beforeinstallprompt", install);
    };
  }, []);
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("job");
    if (id) {
      setSelected(id);
      setView("publisher");
    }
  }, []);
  useEffect(() => {
    setCopied(false);
    setOpened(false);
  }, [selected]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(id);
  }, [toast]);
  function go(v: View) {
    setView(v);
    setMenu(false);
    setQuery("");
  }
  async function save(s: AppState, msg = "Salvo") {
    await commit(s);
    setToast(msg);
  }
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setFormError("");
    try {
      await fn();
    } catch (e) {
      setFormError(humanError(e));
    } finally {
      setBusy(false);
    }
  }
  function openModal(m: typeof modal, item?: Group | Post) {
    setFormError("");
    setEditing(item || null);
    if (m === "campaign") setEditingCampaign(null);
    setPreview(null);
    setModal(m);
  }
  function campaignBase() {
    return editingCampaign
      ? {
          ...state,
          jobs: state.jobs.map((j) =>
            j.campaignId === editingCampaign.id && j.status === "scheduled"
              ? { ...j, status: "cancelled" as const }
              : j,
          ),
        }
      : state;
  }
  function confirm(
    title: string,
    description: string,
    run: () => Promise<void>,
  ) {
    setConfirmAction({ title, description, run });
    openModal("confirm");
  }
  function prepare(j: Job) {
    setSelected(j.id);
    go("publisher");
  }
  function groupName(j: Job) {
    return (
      state.groups.find((g) => g.id === j.groupId)?.name || j.groupSnapshot.name
    );
  }
  function postName(j: Job) {
    return j.postSnapshot.title;
  }
  function exportCSV() {
    const rows = [
      [
        "Data",
        "Horário",
        "Campanha",
        "Grupo",
        "Post",
        "Status",
        "Link",
        "Observação",
      ],
      ...state.jobs.map((j) => [
        dayKey(j.scheduledAt),
        formatTime(j.scheduledAt),
        state.campaigns.find((c) => c.id === j.campaignId)?.name || "",
        groupName(j),
        postName(j),
        statusLabels[j.status],
        j.resultUrl,
        j.note,
      ]),
    ];
    download(
      new Blob(
        ["\uFEFF" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n")],
        { type: "text/csv;charset=utf-8" },
      ),
      "scheduler-publicacoes.csv",
    );
  }
  async function enablePush() {
    if (!w.cloud || !w.session)
      throw new Error(
        "Conecte o Supabase e entre na sua conta para receber lembretes com o app fechado.",
      );
    if (!("serviceWorker" in navigator) || !("PushManager" in window))
      throw new Error(
        "Este navegador não suporta Web Push. Use Chrome no Android.",
      );
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key)
      throw new Error("As chaves de notificação ainda não foram configuradas.");
    if ((await Notification.requestPermission()) !== "granted")
      throw new Error(
        "Permissão de notificações não concedida. Confira as configurações do navegador.",
      );
    const registration = await navigator.serviceWorker.ready;
    let sub = await registration.pushManager.getSubscription();
    if (!sub) {
      const bytes = Uint8Array.from(
        atob(key.replace(/-/g, "+").replace(/_/g, "/")),
        (c) => c.charCodeAt(0),
      );
      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: bytes,
      });
    }
    const r = await fetch("/api/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${w.session.access_token}`,
      },
      body: JSON.stringify(sub.toJSON()),
    });
    if (!r.ok) throw new Error((await r.json()).error);
    setPushEnabled(true);
    setToast("Lembretes ativados neste dispositivo.");
  }
  async function disablePush() {
    const reg = await navigator.serviceWorker.ready,
      sub = await reg.pushManager.getSubscription();
    if (sub && w.session) {
      const r = await fetch("/api/push", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${w.session.access_token}`,
        },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      await sub.unsubscribe();
    }
    setPushEnabled(false);
  }
  if (w.loading)
    return (
      <main className="loading">
        <div className="brand-mark">
          G<span>↗</span>
        </div>
        <p>Carregando sua fila…</p>
      </main>
    );
  if (w.cloud && !w.session) return <Auth />;
  const title = nav.find((n) => n[0] === view)![1];
  const filteredJobs = state.jobs
    .filter((j) =>
      `${groupName(j)} ${postName(j)} ${statusLabels[j.status]}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
  const jobRow = (j: Job) => (
    <div className="job-row" key={j.id}>
      <div className="row-time">
        <strong>{formatTime(j.scheduledAt)}</strong>
        <span>{formatDate(j.scheduledAt)}</span>
      </div>
      <div className="row-main">
        <h3>{postName(j)}</h3>
        <p>{groupName(j)}</p>
        <span className={"status " + j.status}>
          {j.status === "scheduled" && new Date(j.scheduledAt).getTime() < clock
            ? "Horário passou · pendente"
            : statusLabels[j.status]}
          {state.campaigns.find((c) => c.id === j.campaignId)?.paused
            ? " · Campanha pausada"
            : ""}
          {!state.groups.find((g) => g.id === j.groupId)?.active
            ? " · Grupo pausado"
            : ""}
        </span>
      </div>
      <button className="secondary compact" onClick={() => prepare(j)}>
        {j.status === "scheduled" ? "Preparar" : "Ver registro"}
        <ChevronRight size={16} />
      </button>
    </div>
  );
  return (
    <div className="app-shell">
      <aside className={"sidebar " + (menu ? "visible" : "")}>
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            go("dashboard");
          }}
        >
          <div className="brand-mark">
            G<span>↗</span>
          </div>
          <div>
            Group<span>Scheduler</span>
          </div>
        </a>
        <button
          className="sidebar-close icon-button"
          aria-label="Fechar menu"
          onClick={() => setMenu(false)}
        >
          <X />
        </button>
        <p className="nav-caption">ESPAÇO DE TRABALHO</p>
        <nav aria-label="Navegação principal">
          {nav.map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => go(id)}
              className={view === id ? "active" : ""}
              aria-current={view === id ? "page" : undefined}
            >
              <Icon size={19} />
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="manual-label">
            <Check size={15} /> Confirmação manual
          </span>
          <p>Você mantém o controle de cada publicação.</p>
          <button onClick={() => go("settings")} className="account">
            <div className="avatar">
              {w.session?.user.email?.[0]?.toUpperCase() || "K"}
            </div>
            <div>
              {w.session?.user.email?.split("@")[0] || "Meu espaço"}
              <small>
                {w.cloud ? "Sincronizado na nuvem" : "Neste dispositivo"}
              </small>
            </div>
          </button>
        </div>
      </aside>
      {menu && (
        <button
          className="menu-scrim"
          aria-label="Fechar navegação"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="mobile-menu icon-button"
              aria-label="Abrir menu"
              onClick={() => setMenu(true)}
            >
              <Menu size={22} />
            </button>
            <span>
              Workspace <span className="slash">/</span>{" "}
              <strong>{title}</strong>
            </span>
          </div>
          <div className="topbar-right">
            <span className="save-state">
              {w.saving
                ? "Salvando…"
                : w.cloud
                  ? "Nuvem conectada"
                  : "Modo neste dispositivo"}
            </span>
            <button
              className="icon-button"
              aria-label="Configurar notificações"
              onClick={() => go("settings")}
            >
              <Bell size={19} />
            </button>
          </div>
        </header>
        <main className="workspace">
          {!w.cloud && (
            <div className="local-notice">
              Seus dados ficam neste navegador. A sincronização e os lembretes
              com o app fechado dependem da conexão com Supabase.
              <button onClick={() => go("settings")}>Ver configuração</button>
            </div>
          )}
          {w.error && (
            <div className="error-banner" role="alert">
              {w.error}
              <button onClick={() => void w.reload()}>Recarregar</button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {view === "dashboard"
                  ? new Intl.DateTimeFormat("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    }).format(new Date(clock))
                  : "GROUP SCHEDULER"}
              </p>
              <h1>
                {view === "dashboard" ? "Sua fila, sob controle." : title}
              </h1>
            </div>
            {view === "groups" && (
              <button className="primary" onClick={() => openModal("group")}>
                <Plus size={18} />
                Adicionar grupo
              </button>
            )}
            {view === "posts" && (
              <button className="primary" onClick={() => openModal("post")}>
                <Plus size={18} />
                Novo post
              </button>
            )}
            {["dashboard", "campaigns", "calendar"].includes(view) && (
              <button className="primary" onClick={() => openModal("campaign")}>
                <Plus size={18} />
                Criar campanha
              </button>
            )}
            {["reports", "history"].includes(view) && (
              <button className="secondary" onClick={exportCSV}>
                <Download size={17} />
                Exportar CSV
              </button>
            )}
          </div>
          {view === "dashboard" && (
            <>
              <section className="daily-summary" aria-label="Resumo do dia">
                <div>
                  <span>Confirmadas hoje</span>
                  <strong>
                    {
                      state.jobs.filter(
                        (j) =>
                          dayKey(j.scheduledAt) === today &&
                          j.status === "published",
                      ).length
                    }
                    <small> / 10</small>
                  </strong>
                </div>
                <div>
                  <span>Na fila de hoje</span>
                  <strong>
                    {
                      state.jobs.filter(
                        (j) =>
                          dayKey(j.scheduledAt) === today &&
                          j.status === "scheduled",
                      ).length
                    }
                  </strong>
                </div>
                <div>
                  <span>Campanhas ativas</span>
                  <strong>
                    {
                      state.campaigns.filter(
                        (c) =>
                          !c.paused &&
                          state.jobs.some(
                            (j) =>
                              j.campaignId === c.id && j.status === "scheduled",
                          ),
                      ).length
                    }
                  </strong>
                </div>
              </section>
              <div className="dashboard-grid">
                <section className="schedule-section">
                  <div className="section-heading">
                    <h2>Agenda do dia</h2>
                    <div className="date-control">
                      <button
                        aria-label="Dia anterior"
                        className="icon-button"
                        onClick={() => setDay(addDays(day, -1))}
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <input
                        aria-label="Data da agenda"
                        type="date"
                        value={day}
                        onChange={(e) => setDay(e.target.value || today)}
                      />
                      <button
                        aria-label="Próximo dia"
                        className="icon-button"
                        onClick={() => setDay(addDays(day, 1))}
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>
                  {daily.length ? (
                    <div className="job-list">{daily.map(jobRow)}</div>
                  ) : (
                    <Empty title="O dia está livre">
                      {state.groups.length && state.posts.length
                        ? "Crie uma campanha para distribuir seus posts entre os grupos."
                        : "Comece adicionando seus grupos e o primeiro post."}
                      <div className="empty-actions">
                        <button
                          className="secondary"
                          onClick={() =>
                            go(state.groups.length ? "posts" : "groups")
                          }
                        >
                          {state.groups.length
                            ? "Criar primeiro post"
                            : "Adicionar grupos"}
                        </button>
                      </div>
                    </Empty>
                  )}
                </section>
                <aside className="next-panel">
                  <p className="eyebrow">PRÓXIMA PUBLICAÇÃO</p>
                  {next ? (
                    <>
                      <div className="next-time">
                        {formatTime(next.scheduledAt)}
                        <span>{formatDate(next.scheduledAt)}</span>
                      </div>
                      <h2>{postName(next)}</h2>
                      <p className="next-group">
                        <Users size={17} />
                        {groupName(next)}
                      </p>
                      <div className="post-excerpt">
                        {next.postSnapshot.text.slice(0, 220)}
                        {next.postSnapshot.text.length > 220 ? "…" : ""}
                      </div>
                      <button
                        className="primary full"
                        onClick={() => prepare(next)}
                      >
                        Preparar publicação
                        <Send size={17} />
                      </button>
                      <small>
                        Copie o conteúdo, abra o grupo e confirme o resultado.
                      </small>
                    </>
                  ) : (
                    <>
                      <h2>Tudo pronto para começar.</h2>
                      <p>
                        Cadastre os grupos e salve um post. Depois, monte sua
                        primeira campanha.
                      </p>
                      <ol className="setup-list">
                        <li>
                          <Check size={16} />{" "}
                          {state.groups.length
                            ? "Grupos cadastrados"
                            : "Adicione seus grupos"}
                        </li>
                        <li>
                          <Check size={16} />{" "}
                          {state.posts.length
                            ? "Posts disponíveis"
                            : "Crie um post na biblioteca"}
                        </li>
                        <li>
                          <Clock size={16} /> Distribua os horários
                        </li>
                      </ol>
                    </>
                  )}
                </aside>
              </div>
            </>
          )}
          {view === "groups" && (
            <>
              <div className="toolbar">
                <label className="search">
                  <Search size={18} />
                  <input
                    placeholder="Buscar grupo"
                    aria-label="Buscar grupo"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <span className="muted">
                  {state.groups.filter((g) => g.active).length} ativos
                </span>
              </div>
              {state.groups.length ? (
                <div className="entity-list">
                  {state.groups
                    .filter((g) =>
                      `${g.name} ${g.category}`
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                    )
                    .map((g) => (
                      <article className="group-row" key={g.id}>
                        <div className="entity-icon">
                          <Users size={22} />
                        </div>
                        <div className="row-main">
                          <h3>{g.name}</h3>
                          <p>
                            {g.category || "Sem categoria"} · intervalo de{" "}
                            {g.intervalHours}h
                          </p>
                          <span className="status">
                            {g.active ? "Ativo" : "Pausado"}
                          </span>
                          {g.rules && (
                            <details>
                              <summary>Regras do grupo</summary>
                              <p>{g.rules}</p>
                            </details>
                          )}
                        </div>
                        <div className="row-actions">
                          <a
                            className="icon-button"
                            aria-label={"Abrir " + g.name}
                            href={g.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink size={18} />
                          </a>
                          <button
                            className="secondary compact"
                            onClick={() => openModal("group", g)}
                          >
                            Editar
                          </button>
                          <button
                            className="icon-button"
                            aria-label={
                              g.active ? "Pausar grupo" : "Ativar grupo"
                            }
                            onClick={() =>
                              void action(() =>
                                save(
                                  log(
                                    {
                                      ...state,
                                      groups: state.groups.map((x) =>
                                        x.id === g.id
                                          ? { ...x, active: !x.active }
                                          : x,
                                      ),
                                    },
                                    g.active
                                      ? "Grupo pausado"
                                      : "Grupo ativado",
                                    g.name,
                                  ),
                                ),
                              )
                            }
                          >
                            {g.active ? (
                              <Pause size={18} />
                            ) : (
                              <Play size={18} />
                            )}
                          </button>
                        </div>
                      </article>
                    ))}
                </div>
              ) : (
                <Empty
                  title="Quais grupos fazem parte da sua rotina?"
                  action={
                    <button
                      className="primary"
                      onClick={() => openModal("group")}
                    >
                      Adicionar primeiro grupo
                    </button>
                  }
                >
                  Salve o link e as regras de cada grupo antes de montar uma
                  campanha.
                </Empty>
              )}
            </>
          )}
          {view === "posts" && (
            <>
              <div className="toolbar">
                <label className="search">
                  <Search size={18} />
                  <input
                    placeholder="Buscar título, texto ou tags"
                    aria-label="Buscar posts"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <span className="muted">
                  {state.posts.filter((p) => !p.archived).length} disponíveis
                </span>
              </div>
              {state.posts.length ? (
                <div className="post-library">
                  {state.posts
                    .filter((p) =>
                      `${p.title} ${p.text} ${p.tags}`
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                    )
                    .map((p) => (
                      <article
                        key={p.id}
                        className={
                          "library-post " + (p.archived ? "archived" : "")
                        }
                      >
                        {p.image && (
                          <img src={p.image} alt={"Imagem de " + p.title} />
                        )}
                        <div className="library-body">
                          <p className="eyebrow">
                            {p.tags || "POST"}
                            {p.archived ? " · ARQUIVADO" : ""}
                          </p>
                          <h2>{p.title}</h2>
                          <p className="library-text">{p.text}</p>
                          {p.link && (
                            <a
                              href={p.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="post-link"
                            >
                              {p.link}
                              <ExternalLink size={14} />
                            </a>
                          )}
                          <div className="row-actions">
                            <button
                              className="secondary compact"
                              onClick={() => openModal("post", p)}
                            >
                              Editar
                            </button>
                            <button
                              className="text-button"
                              onClick={() =>
                                void action(() =>
                                  save(
                                    log(
                                      {
                                        ...state,
                                        posts: [
                                          ...state.posts,
                                          {
                                            ...p,
                                            id: uuid(),
                                            title: (p.title + " (cópia)").slice(
                                              0,
                                              120,
                                            ),
                                          },
                                        ],
                                      },
                                      "Post duplicado",
                                      p.title,
                                    ),
                                  ),
                                )
                              }
                            >
                              Duplicar
                            </button>
                            <button
                              className="text-button"
                              onClick={() =>
                                void action(() =>
                                  save({
                                    ...state,
                                    posts: state.posts.map((x) =>
                                      x.id === p.id
                                        ? { ...x, archived: !x.archived }
                                        : x,
                                    ),
                                  }),
                                )
                              }
                            >
                              {p.archived ? "Restaurar" : "Arquivar"}
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                </div>
              ) : (
                <Empty
                  title="Seu conteúdo começa aqui"
                  action={
                    <button
                      className="primary"
                      onClick={() => openModal("post")}
                    >
                      Criar primeiro post
                    </button>
                  }
                >
                  Salve texto, link e imagem. Cada agendamento guarda uma cópia
                  do conteúdo aprovado.
                </Empty>
              )}
            </>
          )}
          {view === "campaigns" && (
            <>
              {state.campaigns.length ? (
                <div className="entity-list">
                  {state.campaigns.map((c) => {
                    const jobs = state.jobs.filter(
                        (j) => j.campaignId === c.id,
                      ),
                      done = jobs.filter(
                        (j) => j.status === "published",
                      ).length;
                    return (
                      <article key={c.id} className="campaign-row">
                        <div className="campaign-summary">
                          <p className="eyebrow">
                            {c.paused
                              ? "PAUSADA"
                              : jobs.some((j) => j.status === "scheduled")
                                ? "EM ANDAMENTO"
                                : "ENCERRADA"}
                          </p>
                          <h2>{c.name}</h2>
                          <p>
                            {formatDate(c.startDate)} –{" "}
                            {formatDate(addDays(c.startDate, c.days - 1))} ·{" "}
                            {c.groupIds.length} grupos · até {c.dailyLimit}/dia
                          </p>
                        </div>
                        <div className="campaign-progress">
                          <span>
                            {done} publicadas{" "}
                            <small>de {jobs.length} agendamentos</small>
                          </span>
                          <progress value={done} max={jobs.length || 1} />
                        </div>
                        <div className="row-actions">
                          <button
                            className="secondary compact"
                            onClick={() => {
                              openModal("campaign");
                              setEditingCampaign(c);
                            }}
                          >
                            Editar horários
                          </button>
                          <button
                            className="secondary compact"
                            onClick={() =>
                              void action(() =>
                                save(
                                  log(
                                    {
                                      ...state,
                                      campaigns: state.campaigns.map((x) =>
                                        x.id === c.id
                                          ? { ...x, paused: !x.paused }
                                          : x,
                                      ),
                                    },
                                    c.paused
                                      ? "Campanha retomada"
                                      : "Campanha pausada",
                                    c.name,
                                  ),
                                ),
                              )
                            }
                          >
                            {c.paused ? (
                              <Play size={16} />
                            ) : (
                              <Pause size={16} />
                            )}{" "}
                            {c.paused ? "Retomar" : "Pausar"}
                          </button>
                          <button
                            className="text-button danger"
                            onClick={() =>
                              confirm(
                                "Cancelar horários restantes?",
                                `Os registros de “${c.name}” serão mantidos. As publicações agendadas serão canceladas.`,
                                async () => {
                                  await save(
                                    log(
                                      {
                                        ...state,
                                        jobs: state.jobs.map((j) =>
                                          j.campaignId === c.id &&
                                          j.status === "scheduled"
                                            ? { ...j, status: "cancelled" }
                                            : j,
                                        ),
                                      },
                                      "Campanha cancelada",
                                      c.name,
                                    ),
                                  );
                                  setModal(null);
                                },
                              )
                            }
                          >
                            Cancelar restantes
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <Empty
                  title="Uma campanha, vários grupos"
                  action={
                    <button
                      className="primary"
                      onClick={() => openModal("campaign")}
                    >
                      Criar primeira campanha
                    </button>
                  }
                >
                  O planejador distribui até 10 publicações por dia e respeita o
                  intervalo definido em cada grupo.
                </Empty>
              )}
            </>
          )}
          {view === "calendar" && (
            <>
              <div className="calendar-header">
                <button
                  className="icon-button"
                  aria-label="Mês anterior"
                  onClick={() => {
                    const d = new Date(day + "T12:00:00Z");
                    d.setUTCMonth(d.getUTCMonth() - 1, 1);
                    setDay(d.toISOString().slice(0, 10));
                  }}
                >
                  <ChevronLeft />
                </button>
                <h2>
                  {new Intl.DateTimeFormat("pt-BR", {
                    month: "long",
                    year: "numeric",
                    timeZone: "UTC",
                  }).format(new Date(day + "T12:00:00Z"))}
                </h2>
                <button
                  className="icon-button"
                  aria-label="Próximo mês"
                  onClick={() => {
                    const d = new Date(day + "T12:00:00Z");
                    d.setUTCMonth(d.getUTCMonth() + 1, 1);
                    setDay(d.toISOString().slice(0, 10));
                  }}
                >
                  <ChevronRight />
                </button>
                <button className="text-button" onClick={() => setDay(today)}>
                  Hoje
                </button>
              </div>
              <div className="calendar-grid">
                {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
                  <span className="weekday" key={d}>
                    {d}
                  </span>
                ))}
                {(() => {
                  const first = day.slice(0, 7) + "-01",
                    offset = new Date(first + "T12:00:00Z").getUTCDay();
                  return Array.from({ length: 42 }, (_, i) => {
                    const date = addDays(first, i - offset),
                      jobs = state.jobs.filter(
                        (j) =>
                          dayKey(j.scheduledAt) === date &&
                          countsTowardLimit(j),
                      );
                    return (
                      <button
                        aria-label={`${date}, ${jobs.length} publicações`}
                        aria-pressed={date === day}
                        className={
                          "calendar-day " +
                          (date === day ? "selected " : "") +
                          (date.slice(0, 7) !== day.slice(0, 7)
                            ? "outside "
                            : "") +
                          (date === today ? "today" : "")
                        }
                        key={date}
                        onClick={() => setDay(date)}
                      >
                        <strong>{Number(date.slice(-2))}</strong>
                        {jobs.length > 0 && (
                          <span>
                            {jobs.length}
                            <span className="desktop-text"> posts</span>
                          </span>
                        )}
                      </button>
                    );
                  });
                })()}
              </div>
              <div className="section-heading">
                <h2>
                  {formatDate(day)} · {daily.length} agendamentos
                </h2>
              </div>
              {daily.length ? (
                <div className="job-list">{daily.map(jobRow)}</div>
              ) : (
                <Empty title="Sem publicações neste dia" />
              )}
            </>
          )}
          {view === "publisher" && (
            <div className="publisher-layout">
              <section className="publisher-queue">
                <h2>
                  Fila de publicação <span>{queue.length}</span>
                </h2>
                {queue.length ? (
                  queue.map((j) => (
                    <button
                      key={j.id}
                      onClick={() => setSelected(j.id)}
                      className={
                        "queue-item " + (j.id === selected ? "selected" : "")
                      }
                    >
                      <span>
                        {formatDate(j.scheduledAt)} ·{" "}
                        {formatTime(j.scheduledAt)}
                      </span>
                      <strong>{postName(j)}</strong>
                      <small>{groupName(j)}</small>
                    </button>
                  ))
                ) : (
                  <p className="muted">Nenhuma publicação disponível.</p>
                )}
              </section>
              <section className="publisher-detail">
                {job ? (
                  <>
                    <div className="section-heading">
                      <div>
                        <p className="eyebrow">
                          {formatDate(job.scheduledAt)} ·{" "}
                          {formatTime(job.scheduledAt)}
                        </p>
                        <h2>{postName(job)}</h2>
                      </div>
                      <span className={"status " + job.status}>
                        {statusLabels[job.status]}
                      </span>
                    </div>
                    <div className="publisher-target">
                      <Users size={20} />
                      <div>
                        <strong>{groupName(job)}</strong>
                        <p>
                          {job.groupSnapshot.rules ||
                            "Confira as regras do grupo antes de publicar."}
                        </p>
                      </div>
                    </div>
                    {!canPrepare(state, job) && job.status === "scheduled" && (
                      <div className="error-banner">
                        Esta publicação está pausada. Retome a campanha ou ative
                        o grupo para preparar.
                      </div>
                    )}
                    <div className="post-preview">
                      {job.postSnapshot.image && (
                        <img
                          src={job.postSnapshot.image}
                          alt="Imagem da publicação"
                        />
                      )}
                      <p>{contentFor(job.postSnapshot)}</p>
                    </div>
                    {job.status === "scheduled" ? (
                      <>
                        <div className="publisher-steps">
                          <div>
                            <span className="step-number">1</span>
                            <div>
                              <h3>Leve o conteúdo</h3>
                              <p>Copie o texto e salve a imagem, se houver.</p>
                              <div className="row-actions">
                                <button
                                  className="secondary"
                                  disabled={!canPrepare(state, job)}
                                  onClick={() =>
                                    void action(async () => {
                                      await navigator.clipboard.writeText(
                                        contentFor(job.postSnapshot),
                                      );
                                      setCopied(true);
                                      setToast("Texto copiado.");
                                    })
                                  }
                                >
                                  {copied ? (
                                    <Check size={17} />
                                  ) : (
                                    <Copy size={17} />
                                  )}{" "}
                                  {copied ? "Copiado" : "Copiar texto"}
                                </button>
                                {job.postSnapshot.image && (
                                  <button
                                    className="secondary"
                                    onClick={() =>
                                      void action(async () => {
                                        const blob = await (
                                          await fetch(job.postSnapshot.image)
                                        ).blob();
                                        download(
                                          blob,
                                          "post." +
                                            (blob.type === "image/jpeg"
                                              ? "jpg"
                                              : blob.type.split("/")[1]),
                                        );
                                      })
                                    }
                                  >
                                    <Download size={17} />
                                    Salvar imagem
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                          <div>
                            <span className="step-number">2</span>
                            <div>
                              <h3>Publique no grupo</h3>
                              <p>
                                Cole o conteúdo no Facebook e envie manualmente.
                              </p>
                              <a
                                className={
                                  "secondary " +
                                  (!canPrepare(state, job) ? "disabled" : "")
                                }
                                href={
                                  canPrepare(state, job)
                                    ? job.groupSnapshot.url
                                    : undefined
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => {
                                  if (canPrepare(state, job)) setOpened(true);
                                }}
                              >
                                Abrir grupo
                                <ExternalLink size={17} />
                              </a>
                            </div>
                          </div>
                          <div>
                            <span className="step-number">3</span>
                            <div>
                              <h3>Registre o que aconteceu</h3>
                              <p>
                                O app não verifica a publicação no Facebook.
                              </p>
                              <button
                                className="primary"
                                disabled={!canPrepare(state, job)}
                                onClick={() => openModal("result")}
                              >
                                Confirmar resultado
                                <Check size={17} />
                              </button>
                              {opened && (
                                <small>
                                  Grupo aberto. Confirme somente após enviar o
                                  post.
                                </small>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="publisher-footer">
                          <button
                            className="text-button"
                            onClick={() => openModal("reschedule")}
                          >
                            Reagendar
                          </button>
                          <button
                            className="text-button danger"
                            onClick={() =>
                              confirm(
                                "Ignorar esta publicação?",
                                "O horário será liberado e o registro ficará no histórico.",
                                async () => {
                                  await save(
                                    log(
                                      {
                                        ...state,
                                        jobs: state.jobs.map((j) =>
                                          j.id === job.id
                                            ? {
                                                ...j,
                                                status: "skipped",
                                                completedAt:
                                                  new Date().toISOString(),
                                              }
                                            : j,
                                        ),
                                      },
                                      "Publicação ignorada",
                                      postName(job),
                                      job.id,
                                    ),
                                  );
                                  setModal(null);
                                },
                              )
                            }
                          >
                            Ignorar
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="result-record">
                        <h3>Resultado registrado</h3>
                        <p>{job.note || "Sem observação."}</p>
                        {job.resultUrl && (
                          <a
                            className="secondary"
                            href={job.resultUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Ver no Facebook
                            <ExternalLink size={16} />
                          </a>
                        )}
                        {["pending", "failed"].includes(job.status) && (
                          <button
                            className="secondary"
                            onClick={() => openModal("result")}
                          >
                            Atualizar resultado
                          </button>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <Empty title="Escolha uma publicação da fila">
                    O conteúdo e as instruções aparecem aqui.
                  </Empty>
                )}
              </section>
            </div>
          )}
          {view === "history" && (
            <>
              <div className="toolbar">
                <label className="search">
                  <Search size={18} />
                  <input
                    aria-label="Buscar histórico"
                    placeholder="Buscar por grupo, post ou status"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <span className="muted">{state.logs.length} registros</span>
              </div>
              <div className="history-layout">
                <section>
                  {filteredJobs.filter((j) => j.status !== "scheduled")
                    .length ? (
                    filteredJobs
                      .filter((j) => j.status !== "scheduled")
                      .map(jobRow)
                  ) : (
                    <Empty title="Nenhum resultado registrado ainda" />
                  )}
                </section>
                <section className="audit">
                  <h2>Atividade recente</h2>
                  {state.logs.slice(0, 40).map((l) => (
                    <div key={l.id}>
                      <span>
                        {formatDate(l.at)} · {formatTime(l.at)}
                      </span>
                      <strong>{l.action}</strong>
                      <p>{l.detail}</p>
                    </div>
                  ))}
                </section>
              </div>
            </>
          )}
          {view === "reports" && (
            <>
              <p className="muted report-note">
                Resultados informados manualmente. Alcance, cliques e
                engajamento não são coletados do Facebook.
              </p>
              <section className="daily-summary">
                <div>
                  <span>Publicadas</span>
                  <strong>
                    {state.jobs.filter((j) => j.status === "published").length}
                  </strong>
                </div>
                <div>
                  <span>Aguardando aprovação</span>
                  <strong>
                    {state.jobs.filter((j) => j.status === "pending").length}
                  </strong>
                </div>
                <div>
                  <span>Não publicadas</span>
                  <strong>
                    {state.jobs.filter((j) => j.status === "failed").length}
                  </strong>
                </div>
              </section>
              <h2 className="section-title">Por grupo</h2>
              {state.groups.length ? (
                <div className="report-table">
                  <div className="report-row table-head">
                    <span>Grupo</span>
                    <span>Agendadas</span>
                    <span>Publicadas</span>
                    <span>Pendentes</span>
                  </div>
                  {state.groups.map((g) => (
                    <div className="report-row" key={g.id}>
                      <strong>{g.name}</strong>
                      <span>
                        {
                          state.jobs.filter(
                            (j) =>
                              j.groupId === g.id && j.status === "scheduled",
                          ).length
                        }
                      </span>
                      <span>
                        {
                          state.jobs.filter(
                            (j) =>
                              j.groupId === g.id && j.status === "published",
                          ).length
                        }
                      </span>
                      <span>
                        {
                          state.jobs.filter(
                            (j) => j.groupId === g.id && j.status === "pending",
                          ).length
                        }
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty title="Seus resultados aparecerão aqui" />
              )}
              <h2 className="section-title">Últimos 7 dias</h2>
              <div className="weekly-chart">
                {Array.from({ length: 7 }, (_, i) => {
                  const d = addDays(today, i - 6),
                    total = state.jobs.filter(
                      (j) =>
                        dayKey(j.scheduledAt) === d && j.status === "published",
                    ).length;
                  return (
                    <div className="chart-row" key={d}>
                      <span>{formatDate(d)}</span>
                      <div>
                        <div style={{ width: `${total * 10}%` }} />
                      </div>
                      <strong>{total}</strong>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {view === "settings" && (
            <div className="settings-list">
              <section>
                <div>
                  <h2>Dados e sincronização</h2>
                  <p>
                    {w.cloud
                      ? "Seus dados estão vinculados à sua conta Supabase."
                      : "Modo neste dispositivo: os dados são salvos no navegador. Exporte um backup antes de trocar de aparelho ou limpar os dados."}
                  </p>
                </div>
                <button className="secondary" onClick={() => void w.reload()}>
                  <RefreshCw size={17} />
                  Recarregar
                </button>
              </section>
              <section>
                <div>
                  <h2>Lembretes de publicação</h2>
                  <p>
                    {pushEnabled
                      ? "Ativados neste dispositivo."
                      : "Receba uma notificação quando um horário estiver próximo. Requer conexão com o banco e serviço de lembretes configurado."}
                  </p>
                </div>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void action(pushEnabled ? disablePush : enablePush)
                  }
                >
                  <Bell size={17} />
                  {pushEnabled ? "Desativar" : "Ativar notificações"}
                </button>
              </section>
              <section>
                <div>
                  <h2>Instalar no Android</h2>
                  <p>
                    Use o Chrome: menu ⋮ → Adicionar à tela inicial → Instalar.
                    A instalação depende de HTTPS.
                  </p>
                </div>
                {installPrompt && (
                  <button
                    className="secondary"
                    onClick={() => void installPrompt.prompt()}
                  >
                    <Download size={17} />
                    Instalar app
                  </button>
                )}
              </section>
              <section>
                <div>
                  <h2>Backup dos seus dados</h2>
                  <p>
                    O arquivo inclui grupos, imagens, campanhas e histórico.
                    Guarde em um local privado.
                  </p>
                </div>
                <div className="row-actions">
                  <button
                    className="secondary"
                    onClick={() =>
                      download(
                        new Blob([payloadJSON(state)], {
                          type: "application/json",
                        }),
                        "scheduler-backup.json",
                      )
                    }
                  >
                    <Download size={17} />
                    Exportar backup
                  </button>
                  <button
                    className="secondary"
                    onClick={() => fileRef.current?.click()}
                  >
                    Importar backup
                  </button>
                  <input
                    hidden
                    ref={fileRef}
                    type="file"
                    accept="application/json,.json"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      void action(async () => {
                        if (file.size > 12_000_000)
                          throw new Error("Backup deve ter até 12 MB.");
                        const incoming = unpackState(
                          JSON.parse(await file.text()),
                        );
                        confirm(
                          "Substituir dados pelo backup?",
                          `${incoming.groups.length} grupos, ${incoming.posts.length} posts e ${incoming.jobs.length} agendamentos. Os dados atuais serão substituídos.`,
                          async () => {
                            await save(
                              log(incoming, "Backup importado", file.name),
                            );
                            setModal(null);
                          },
                        );
                      });
                    }}
                  />
                </div>
              </section>
              <section>
                <div>
                  <h2>Histórico antigo</h2>
                  <p>
                    Remova registros encerrados há mais de 90 dias para liberar
                    espaço. Exportar um backup antes mantém uma cópia dos
                    resultados. Publicações agendadas e aguardando aprovação
                    serão mantidas.
                  </p>
                </div>
                <button
                  className="secondary"
                  disabled={!cleanupClosedHistory(state, today).removed}
                  onClick={() => {
                    const cleaned = cleanupClosedHistory(state, today);
                    confirm(
                      "Limpar histórico encerrado?",
                      `${cleaned.removed} registros com mais de 90 dias serão removidos. Seus relatórios passarão a considerar somente os dados mantidos. Exporte um backup antes de confirmar.`,
                      async () => {
                        await save(cleaned.state, "Histórico antigo removido");
                        setModal(null);
                      },
                    );
                  }}
                >
                  Limpar registros antigos
                </button>
              </section>
              <section>
                <div>
                  <h2>Regras do agendamento</h2>
                  <p>
                    Até 10 publicações por dia no total, horário de Brasília.
                    Mínimo de 15 minutos entre horários; intervalo por grupo
                    configurável. Esses limites organizam a fila e não garantem
                    aprovação pelo Facebook ou pelos administradores.
                  </p>
                </div>
              </section>
              {w.session && (
                <section>
                  <div>
                    <h2>Conta</h2>
                    <p>{w.session.user.email}</p>
                  </div>
                  <button
                    className="secondary"
                    onClick={() =>
                      void action(async () => {
                        await disablePush();
                        const { error } = await supabase!.auth.signOut();
                        if (error) throw error;
                      })
                    }
                  >
                    <LogOut size={17} />
                    Sair
                  </button>
                </section>
              )}
            </div>
          )}
          {formError && !modal && (
            <div className="error-banner" role="alert">
              {formError}
            </div>
          )}
        </main>
        <footer className="app-footer">
          Publicação assistida. A confirmação é sempre sua.
          <span>Brasília · UTC−3</span>
        </footer>
      </div>
      <nav className="bottom-nav" aria-label="Navegação mobile">
        {[
          ["dashboard", "Hoje", LayoutDashboard],
          ["calendar", "Agenda", CalendarDays],
          ["publisher", "Publicar", Send],
          ["campaigns", "Campanhas", Megaphone],
        ].map(([id, label, Icon]) => {
          const I = Icon as typeof Send;
          return (
            <button
              key={id as string}
              className={view === id ? "active" : ""}
              onClick={() => go(id as View)}
            >
              <I size={20} />
              <span>{label as string}</span>
            </button>
          );
        })}
        <button onClick={() => setMenu(true)}>
          <Menu size={20} />
          <span>Mais</span>
        </button>
      </nav>
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
        </div>
      )}
      {modal === "group" && (
        <Modal
          title={editing ? "Editar grupo" : "Adicionar grupo"}
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void action(async () => {
                const g: Group = {
                  id: editing?.id || uuid(),
                  name: String(f.get("name")),
                  url: String(f.get("url")).replace(/\?.*$/, ""),
                  category: String(f.get("category")),
                  rules: String(f.get("rules")),
                  intervalHours: Number(f.get("interval")),
                  active: (editing as Group)?.active ?? true,
                };
                if (
                  state.groups.some(
                    (x) =>
                      x.id !== g.id &&
                      x.url
                        .replace("m.facebook.com", "www.facebook.com")
                        .replace(
                          "https://facebook.com",
                          "https://www.facebook.com",
                        )
                        .replace(/\/$/, "") ===
                        g.url
                          .replace("m.facebook.com", "www.facebook.com")
                          .replace(
                            "https://facebook.com",
                            "https://www.facebook.com",
                          )
                          .replace(/\/$/, ""),
                  )
                )
                  throw new Error("Este grupo já está cadastrado.");
                await save(
                  log(
                    {
                      ...state,
                      groups: editing
                        ? state.groups.map((x) => (x.id === g.id ? g : x))
                        : [...state.groups, g],
                    },
                    editing ? "Grupo atualizado" : "Grupo adicionado",
                    g.name,
                  ),
                );
                setModal(null);
              });
            }}
          >
            <Field label="Nome do grupo">
              <input
                name="name"
                required
                minLength={2}
                maxLength={120}
                defaultValue={(editing as Group)?.name}
                autoFocus
              />
            </Field>
            <Field
              label="Link do grupo"
              hint="Ex.: https://www.facebook.com/groups/123456"
            >
              <input
                name="url"
                type="url"
                required
                defaultValue={(editing as Group)?.url}
              />
            </Field>
            <div className="form-grid">
              <Field label="Categoria">
                <input
                  name="category"
                  maxLength={80}
                  placeholder="Ex.: Comércio local"
                  defaultValue={(editing as Group)?.category}
                />
              </Field>
              <Field label="Intervalo mínimo (horas)">
                <input
                  name="interval"
                  type="number"
                  min={1}
                  max={720}
                  required
                  defaultValue={(editing as Group)?.intervalHours || 24}
                />
              </Field>
            </div>
            <Field label="Regras e observações">
              <textarea
                name="rules"
                maxLength={2000}
                rows={3}
                placeholder="Dias permitidos, aprovação, tipo de conteúdo…"
                defaultValue={(editing as Group)?.rules}
              />
            </Field>
            <FormError message={formError} />
            <div className="form-footer">
              <button
                type="button"
                className="secondary"
                onClick={() => setModal(null)}
              >
                Cancelar
              </button>
              <button className="primary" disabled={busy || w.saving}>
                Salvar grupo
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "post" && (
        <PostModal
          post={editing as Post | null}
          error={formError}
          busy={busy || w.saving}
          onClose={() => setModal(null)}
          onSave={(p) =>
            action(async () => {
              await save(
                log(
                  {
                    ...state,
                    posts: editing
                      ? state.posts.map((x) => (x.id === p.id ? p : x))
                      : [...state.posts, p],
                  },
                  editing ? "Post atualizado" : "Post criado",
                  p.title,
                ),
              );
              setModal(null);
            })
          }
        />
      )}
      {modal === "campaign" && (
        <Modal
          title={preview ? "Revisar agendamentos" : "Criar campanha"}
          onClose={() => setModal(null)}
        >
          {!state.groups.some((g) => g.active) ||
          !state.posts.some((p) => !p.archived) ? (
            <Empty title="Prepare grupos e conteúdo primeiro">
              <button
                className="primary"
                onClick={() => {
                  setModal(null);
                  go(state.groups.some((g) => g.active) ? "posts" : "groups");
                }}
              >
                {state.groups.some((g) => g.active)
                  ? "Ir à biblioteca"
                  : "Adicionar grupos"}
              </button>
            </Empty>
          ) : preview ? (
            <>
              <p className="preview-summary">
                <strong>{preview.jobs.length} publicações</strong> para{" "}
                {preview.campaign.name}. Revise os horários antes de salvar.
              </p>
              {preview.warnings.length > 0 && (
                <div className="warning">
                  <strong>Alguns horários não foram preenchidos</strong>
                  <ul>
                    {preview.warnings.slice(0, 10).map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="preview-list">
                {preview.jobs.map((j) => (
                  <div key={j.id}>
                    <span>
                      {formatDate(j.scheduledAt)} · {formatTime(j.scheduledAt)}
                    </span>
                    <strong>{j.groupSnapshot.name}</strong>
                    <small>{j.postSnapshot.title}</small>
                  </div>
                ))}
              </div>
              <FormError message={formError} />
              <div className="form-footer">
                <button className="secondary" onClick={() => setPreview(null)}>
                  Ajustar
                </button>
                <button
                  className="primary"
                  disabled={busy || w.saving}
                  onClick={() =>
                    void action(async () => {
                      if (
                        preview.jobs.some(
                          (j) => Date.parse(j.scheduledAt) <= Date.now(),
                        )
                      )
                        throw new Error(
                          "Um horário passou durante a revisão. Ajuste o início.",
                        );
                      const base = campaignBase();
                      const planned = planCampaign(base, preview.campaign);
                      if (
                        JSON.stringify(
                          planned.jobs.map((j) => [
                            j.groupId,
                            j.postId,
                            j.scheduledAt,
                          ]),
                        ) !==
                        JSON.stringify(
                          preview.jobs.map((j) => [
                            j.groupId,
                            j.postId,
                            j.scheduledAt,
                          ]),
                        )
                      )
                        throw new Error(
                          "Disponibilidade mudou. Ajuste e revise novamente.",
                        );
                      await save(
                        log(
                          {
                            ...base,
                            campaigns: editingCampaign
                              ? state.campaigns.map((c) =>
                                  c.id === editingCampaign.id
                                    ? preview.campaign
                                    : c,
                                )
                              : [...state.campaigns, preview.campaign],
                            jobs: [...base.jobs, ...preview.jobs],
                          },
                          "Campanha criada",
                          `${preview.campaign.name}: ${preview.jobs.length} horários`,
                        ),
                        "Campanha agendada",
                      );
                      setModal(null);
                      go("dashboard");
                    })
                  }
                >
                  Confirmar agendamento
                </button>
              </div>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void action(async () => {
                  const c: Campaign = {
                    id: editingCampaign?.id || uuid(),
                    name: String(f.get("name")),
                    groupIds: f.getAll("groups").map(String),
                    postIds: f.getAll("posts").map(String),
                    startDate: String(f.get("date")),
                    days: Number(f.get("days")),
                    dailyLimit: Number(f.get("limit")),
                    startTime: String(f.get("start")),
                    endTime: String(f.get("end")),
                    paused: false,
                  };
                  if (!c.groupIds.length || !c.postIds.length)
                    throw new Error("Selecione grupos e posts.");
                  const result = planCampaign(campaignBase(), c);
                  setPreview({ campaign: c, ...result });
                });
              }}
            >
              <Field label="Nome da campanha">
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={120}
                  placeholder="Ex.: Divulgação da semana"
                  defaultValue={editingCampaign?.name}
                  autoFocus
                />
              </Field>
              <div className="form-grid">
                <Field label="Data de início">
                  <input
                    name="date"
                    type="date"
                    min={today}
                    defaultValue={
                      editingCampaign && editingCampaign.startDate >= today
                        ? editingCampaign.startDate
                        : addDays(today, 1)
                    }
                    required
                  />
                </Field>
                <Field label="Quantidade de dias">
                  <input
                    name="days"
                    type="number"
                    min={1}
                    max={90}
                    defaultValue={editingCampaign?.days || 7}
                    required
                  />
                </Field>
              </div>
              <div className="form-grid three">
                <Field label="Publicações por dia">
                  <input
                    name="limit"
                    type="number"
                    min={1}
                    max={10}
                    defaultValue={editingCampaign?.dailyLimit || 10}
                    required
                  />
                </Field>
                <Field label="Início">
                  <input
                    name="start"
                    type="time"
                    defaultValue={editingCampaign?.startTime || "09:00"}
                    required
                  />
                </Field>
                <Field label="Fim">
                  <input
                    name="end"
                    type="time"
                    defaultValue={editingCampaign?.endTime || "20:00"}
                    required
                  />
                </Field>
              </div>
              <fieldset className="selection">
                <legend>Grupos</legend>
                {state.groups
                  .filter((g) => g.active)
                  .map((g) => (
                    <label key={g.id}>
                      <input
                        name="groups"
                        type="checkbox"
                        value={g.id}
                        defaultChecked={editingCampaign?.groupIds.includes(
                          g.id,
                        )}
                      />
                      <span>
                        {g.name}
                        <small>Intervalo {g.intervalHours}h</small>
                      </span>
                    </label>
                  ))}
              </fieldset>
              <fieldset className="selection">
                <legend>Posts</legend>
                {state.posts
                  .filter((p) => !p.archived)
                  .map((p) => (
                    <label key={p.id}>
                      <input
                        name="posts"
                        type="checkbox"
                        value={p.id}
                        defaultChecked={editingCampaign?.postIds.includes(p.id)}
                      />
                      {p.title}
                    </label>
                  ))}
              </fieldset>
              <p className="hint">
                Horário de Brasília. O limite diário considera todas as
                campanhas.{" "}
                {editingCampaign
                  ? "Ao salvar, os horários restantes serão substituídos; os resultados anteriores serão mantidos."
                  : ""}
              </p>
              <FormError message={formError} />
              <div className="form-footer">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setModal(null)}
                >
                  Cancelar
                </button>
                <button className="primary" disabled={busy}>
                  Revisar horários
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
      {modal === "result" && job && (
        <Modal title="Confirmar resultado" onClose={() => setModal(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void action(async () => {
                const status = String(f.get("status")) as Status;
                if (!["scheduled", "pending", "failed"].includes(job.status))
                  throw new Error("Este resultado já foi encerrado.");
                if (job.status === "scheduled" && !canPrepare(state, job))
                  throw new Error("Retome a publicação antes de confirmar.");
                if (
                  Date.parse(job.scheduledAt) > Date.now() &&
                  job.status === "scheduled"
                )
                  throw new Error(
                    "Aguarde o horário agendado ou reagende para o horário atual.",
                  );
                const url = String(f.get("url")),
                  note = String(f.get("note"));
                await save(
                  log(
                    {
                      ...state,
                      jobs: state.jobs.map((j) =>
                        j.id === job.id
                          ? {
                              ...j,
                              status,
                              resultUrl: url,
                              note,
                              completedAt: new Date().toISOString(),
                            }
                          : j,
                      ),
                    },
                    statusLabels[status],
                    `${postName(job)} · ${groupName(job)}`,
                    job.id,
                  ),
                  "Resultado registrado",
                );
                setModal(null);
              });
            }}
          >
            <p className="muted">
              Selecione o resultado que você viu no Facebook.
            </p>
            <Field label="Resultado">
              <select
                name="status"
                defaultValue={
                  job.status === "pending" ? "published" : "published"
                }
              >
                <option value="published">Publicada e visível no grupo</option>
                <option value="pending">Enviada, aguardando aprovação</option>
                <option value="failed">Não publicada / recusada</option>
              </select>
            </Field>
            <Field label="Link da publicação (opcional)">
              <input
                name="url"
                type="url"
                placeholder="https://www.facebook.com/…"
                defaultValue={job.resultUrl}
              />
            </Field>
            <Field label="Observação (opcional)">
              <textarea
                name="note"
                rows={3}
                maxLength={2000}
                defaultValue={job.note}
              />
            </Field>
            <label className="checkbox-confirm">
              <input type="checkbox" required />
              Conferi o resultado no Facebook.
            </label>
            <FormError message={formError} />
            <div className="form-footer">
              <button
                className="secondary"
                type="button"
                onClick={() => setModal(null)}
              >
                Voltar
              </button>
              <button className="primary" disabled={busy || w.saving}>
                Salvar resultado
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "reschedule" && job && (
        <Modal title="Reagendar publicação" onClose={() => setModal(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void action(async () => {
                const at = dateTime(
                  String(f.get("date")),
                  String(f.get("time")),
                );
                await save(
                  log(
                    reschedule(state, job.id, at),
                    "Publicação reagendada",
                    `${postName(job)}: ${formatDate(at)} ${formatTime(at)}`,
                    job.id,
                  ),
                );
                setModal(null);
              });
            }}
          >
            <div className="form-grid">
              <Field label="Data">
                <input
                  name="date"
                  type="date"
                  min={today}
                  defaultValue={dayKey(job.scheduledAt)}
                  required
                />
              </Field>
              <Field label="Horário (Brasília)">
                <input
                  name="time"
                  type="time"
                  defaultValue={formatTime(job.scheduledAt)}
                  required
                />
              </Field>
            </div>
            <FormError message={formError} />
            <div className="form-footer">
              <button
                className="secondary"
                type="button"
                onClick={() => setModal(null)}
              >
                Cancelar
              </button>
              <button className="primary" disabled={busy}>
                Reagendar
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "confirm" && confirmAction && (
        <Modal title={confirmAction.title} onClose={() => setModal(null)}>
          <p className="confirm-description">{confirmAction.description}</p>
          <FormError message={formError} />
          <div className="form-footer">
            <button className="secondary" onClick={() => setModal(null)}>
              Voltar
            </button>
            <button
              className="primary"
              disabled={busy || w.saving}
              onClick={() => void action(confirmAction.run)}
            >
              Confirmar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function FormError({ message }: { message: string }) {
  return message ? (
    <p className="form-error" role="alert">
      {message}
    </p>
  ) : null;
}
function PostModal({
  post,
  error,
  busy,
  onClose,
  onSave,
}: {
  post: Post | null;
  error: string;
  busy: boolean;
  onClose: () => void;
  onSave: (p: Post) => Promise<void>;
}) {
  const [image, setImage] = useState(post?.image || ""),
    [imageError, setImageError] = useState(""),
    [reading, setReading] = useState(false);
  return (
    <Modal title={post ? "Editar post" : "Novo post"} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void onSave({
            id: post?.id || uuid(),
            title: String(f.get("title")),
            text: String(f.get("text")),
            link: String(f.get("link")),
            image,
            tags: String(f.get("tags")),
            archived: post?.archived || false,
          });
        }}
      >
        <Field label="Título interno">
          <input
            name="title"
            required
            minLength={2}
            maxLength={120}
            defaultValue={post?.title}
            placeholder="Ex.: Oferta da semana"
            autoFocus
          />
        </Field>
        <Field label="Texto da publicação">
          <textarea
            name="text"
            required
            maxLength={10000}
            rows={7}
            defaultValue={post?.text}
            placeholder="O texto que você vai colar no Facebook"
          />
        </Field>
        <Field label="Link (opcional)">
          <input
            name="link"
            type="url"
            defaultValue={post?.link}
            placeholder="https://…"
          />
        </Field>
        <Field label="Tags (opcional)">
          <input
            name="tags"
            maxLength={160}
            defaultValue={post?.tags}
            placeholder="Ex.: VivaPlay, promoção"
          />
        </Field>
        <Field
          label="Imagem (opcional)"
          hint="PNG, JPG ou WebP. Até 2 MB; otimizada para celular e incluída no backup."
        >
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              setImageError("");
              if (!f) return;
              if (
                f.size > 2 * 1024 * 1024 ||
                !["image/png", "image/jpeg", "image/webp"].includes(f.type)
              ) {
                setImageError("Use PNG, JPG ou WebP de até 2 MB.");
                e.target.value = "";
                return;
              }
              setReading(true);
              try {
                const bitmap = await createImageBitmap(f);
                const ratio = Math.min(
                  1,
                  1400 / Math.max(bitmap.width, bitmap.height),
                );
                const canvas = document.createElement("canvas");
                canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
                canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
                const context = canvas.getContext("2d")!;
                context.fillStyle = "#ffffff";
                context.fillRect(0, 0, canvas.width, canvas.height);
                context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
                bitmap.close();
                setImage(canvas.toDataURL("image/jpeg", 0.78));
              } catch {
                setImageError("Não foi possível ler a imagem.");
              } finally {
                setReading(false);
              }
            }}
          />
        </Field>
        {image && (
          <div className="image-preview">
            <img src={image} alt="Prévia da imagem" />
            <button
              type="button"
              className="text-button danger"
              onClick={() => setImage("")}
            >
              Remover imagem
            </button>
          </div>
        )}
        <FormError message={imageError || error} />
        <div className="form-footer">
          <button type="button" className="secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary" disabled={busy || reading}>
            Salvar post
          </button>
        </div>
      </form>
    </Modal>
  );
}
