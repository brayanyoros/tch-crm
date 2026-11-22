"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { subscribe } from "./data/db";

export interface Query<T> { data: T | undefined; loading: boolean; error: boolean; retry: () => void }
/** Busca, guarda e refaz a busca quando a base muda (tempo real). */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[] = []): Query<T> {
  const [s, set] = useState<{ data?: T; loading: boolean; error: boolean }>({ loading: true, error: false });
  const ref = useRef(fn);
  ref.current = fn;
  const run = useRef(0);
  const load = useCallback((silent: boolean) => {
    const n = ++run.current;
    if (!silent) set((p) => ({ data: p.data, loading: true, error: false }));
    ref.current().then(
      (data) => { if (n === run.current) set({ data, loading: false, error: false }); },
      () => { if (n === run.current) set((p) => ({ data: p.data, loading: false, error: !p.data })); },
    );
  }, []);
  useEffect(() => { load(false); return () => { run.current++; }; }, deps);
  useEffect(() => subscribe(() => load(true)), [load]);
  return { data: s.data, loading: s.loading, error: s.error, retry: () => load(false) };
}
