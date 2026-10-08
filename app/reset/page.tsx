"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
export default function Reset() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  return (
    <main className="auth">
      <h1>Defina uma nova senha</h1>
      {done ? (
        <>
          <p>Senha atualizada.</p>
          <a className="primary" href="/">
            Abrir minha fila
          </a>
        </>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              if (!supabase) throw new Error("Conexão não configurada.");
              const { data } = await supabase.auth.getSession();
              if (!data.session)
                throw new Error(
                  "Link expirado. Solicite outro link na tela de entrada.",
                );
              const { error } = await supabase.auth.updateUser({
                password: String(new FormData(e.currentTarget).get("password")),
              });
              if (error) throw error;
              setDone(true);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Falha ao atualizar.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            <span>Nova senha</span>
            <input
              type="password"
              name="password"
              minLength={8}
              required
              autoComplete="new-password"
            />
          </label>
          <button className="primary" disabled={busy}>
            Atualizar senha
          </button>
          {error && <p role="alert">{error}</p>}
        </form>
      )}
      <a className="text-button" href="/">
        Voltar
      </a>
    </main>
  );
}
