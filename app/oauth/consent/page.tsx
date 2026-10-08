"use client";
import { useEffect, useState, type FormEvent } from "react";
import type { OAuthAuthorizationDetails } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { safeOAuthRedirect } from "@/lib/mcp-auth";
export default function ConsentPage() {
  const [id, setId] = useState("");
  const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(
    null,
  );
  const [login, setLogin] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const authorizationId = new URLSearchParams(window.location.search).get(
      "authorization_id",
    );
    if (!authorizationId || !supabase) {
      setError("Conexão inválida ou Supabase não configurado.");
      return;
    }
    setId(authorizationId);
    let active = true;
    async function load() {
      try {
        const { data: identity } = await supabase!.auth.getUser();
        if (!active) return;
        if (!identity.user) {
          setLogin(true);
          return;
        }
        setLogin(false);
        const { data, error } =
          await supabase!.auth.oauth.getAuthorizationDetails(authorizationId!);
        if (!active) return;
        if (error || !data)
          throw new Error(
            error?.message || "Não foi possível consultar a autorização.",
          );
        if ("redirect_url" in data) {
          window.location.assign(safeOAuthRedirect(data.redirect_url));
          return;
        }
        setDetails(data);
      } catch (e) {
        if (active)
          setError(e instanceof Error ? e.message : "Falha na conexão.");
      }
    }
    void load();
    const { data } = supabase.auth.onAuthStateChange(() => {
      setTimeout(() => {
        if (active) void load();
      }, 0);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const { error } = await supabase!.auth.signInWithPassword({
        email: String(form.get("email")),
        password: String(form.get("password")),
      });
      if (error) throw error;
    } catch {
      setError("Não foi possível entrar. Confira seu e-mail e senha.");
    } finally {
      setBusy(false);
    }
  }
  async function decide(approve: boolean) {
    setBusy(true);
    setError("");
    try {
      const method = approve ? "approveAuthorization" : "denyAuthorization";
      const { data, error } = await supabase!.auth.oauth[method](id, {
        skipBrowserRedirect: true,
      });
      if (error || !data)
        throw new Error(error?.message || "Autorização não concluída.");
      window.location.assign(safeOAuthRedirect(data.redirect_url));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Autorização não concluída.");
      setBusy(false);
    }
  }
  return (
    <main style={{ maxWidth: 540, margin: "64px auto", padding: 24 }}>
      <p className="eyebrow">Facebook Scheduler · Conexão segura</p>
      <h1 style={{ margin: "16px 0" }}>Conectar seu agendador</h1>
      {error && (
        <p role="alert" style={{ margin: "16px 0", color: "var(--danger)" }}>
          {error}
        </p>
      )}
      {login ? (
        <form onSubmit={signIn} style={{ display: "grid", gap: 16 }}>
          <p>Entre com sua conta do Scheduler para revisar a conexão.</p>
          <label>
            E-mail
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label>
            Senha
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button className="primary" disabled={busy}>
            Entrar
          </button>
        </form>
      ) : details ? (
        <section style={{ display: "grid", gap: 20 }}>
          <p>
            <strong>{details.client.name}</strong> solicita acesso à conta{" "}
            <strong>{details.user.email}</strong>.
          </p>
          <p>
            A conexão permite consultar seus grupos e horários, cadastrar textos
            e imagens, agendar e cancelar publicações no Scheduler. A publicação
            no Facebook permanece manual.
          </p>
          <p>Escopos solicitados: {details.scope || "Acesso à sua conta"}.</p>
          <p>Retorno da conexão: {new URL(details.redirect_uri).hostname}</p>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => decide(false)}
            >
              Recusar
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => decide(true)}
            >
              Autorizar conexão
            </button>
          </div>
        </section>
      ) : !error ? (
        <p>Verificando sua conexão…</p>
      ) : null}
      <p style={{ marginTop: 24 }}>
        <a href="/">Voltar ao Scheduler</a>
      </p>
    </main>
  );
}
