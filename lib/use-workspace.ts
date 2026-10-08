"use client";
import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { humanError } from "./errors";
import { unpackState, payloadJSON } from "./transport";
import { supabase, configured } from "./supabase";
import { emptyState, validateState, type AppState } from "./model";
const KEY = "group-scheduler-workspace-v1";
export function useWorkspace() {
  const [state, setState] = useState<AppState>(emptyState),
    [session, setSession] = useState<Session | null>(null),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  const busy = useRef(false);
  const loadGeneration = useRef(0);
  async function load(s: Session | null) {
    const generation = ++loadGeneration.current;
    setLoading(true);
    setError("");
    try {
      if (configured && s) {
        const r = await fetch("/api/state", {
          headers: { Authorization: `Bearer ${s.access_token}` },
          cache: "no-store",
        });
        const data = await r.json();
        if (generation !== loadGeneration.current) return;
        if (!r.ok) throw new Error(data.error);
        setState(data.state ? unpackState(data.state) : emptyState());
        setRevision(data.revision);
      } else if (!configured) {
        const data = localStorage.getItem(KEY);
        const parsed = data ? JSON.parse(data) : null;
        setState(parsed ? unpackState(parsed.state) : emptyState());
        setRevision(parsed?.revision || 0);
      } else {
        setState(emptyState());
        setRevision(0);
      }
    } catch (e) {
      if (generation !== loadGeneration.current) return;
      setError(
        e instanceof Error ? e.message : "Não foi possível carregar os dados.",
      );
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    if (supabase) {
      supabase.auth.getSession().then(({ data }) => {
        if (active) {
          setSession(data.session);
          void load(data.session);
        }
      });
      const { data } = supabase.auth.onAuthStateChange((_e, s) => {
        setSession(s);
        setLoading(true);
        setTimeout(() => {
          if (active) void load(s);
        }, 0);
      });
      return () => {
        active = false;
        data.subscription.unsubscribe();
      };
    }
    void load(null);
    const storage = (e: StorageEvent) => {
      if (e.key === KEY && !busy.current) void load(null);
    };
    window.addEventListener("storage", storage);
    return () => window.removeEventListener("storage", storage);
    // Initial load and auth events own reloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function commit(next: AppState) {
    if (busy.current) throw new Error("Aguarde o salvamento atual.");
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      const valid = validateState(next);
      if (configured) {
        if (!session) throw new Error("Entre para salvar.");
        const r = await fetch("/api/state", {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            state: JSON.parse(payloadJSON(valid)),
            revision,
          }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        setRevision(data.revision);
      } else {
        const persist = () => {
          const previous = localStorage.getItem(KEY);
          const current = previous ? JSON.parse(previous).revision : 0;
          if (current !== revision)
            throw new Error(
              "Dados alterados em outra aba. Recarregue antes de continuar.",
            );
          localStorage.setItem(
            KEY,
            JSON.stringify({
              state: JSON.parse(payloadJSON(valid)),
              revision: revision + 1,
            }),
          );
        };
        if (navigator.locks) await navigator.locks.request(KEY, persist);
        else persist();
        setRevision(revision + 1);
      }
      setState(valid);
    } catch (e) {
      const message = humanError(e);
      setError(message);
      throw e;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  return {
    state,
    session,
    loading,
    saving,
    error,
    setError,
    commit,
    reload: () => load(session),
    cloud: configured,
    revision,
  };
}
