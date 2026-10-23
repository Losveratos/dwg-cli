// Ersatz für useSemanticModelQuery im Browser-Test: führt die DAX-Abfragen mit dem Mini-DAX
// (../minidax.mjs) auf einem exportierten Datensatz aus, z. B. dem GuV- oder Showcase-Demo-Set.
// Protokolliert jede Abfrage in window.__dwgQueries.
import { useEffect, useState } from 'react';

// @ts-expect-error reines JS-Modul ohne Typen
import { createEngine } from '../minidax.mjs';
// @ts-expect-error reines JS-Modul ohne Typen, Pfad setzt e2e.mjs (Alias @dataset)
import { model } from '@dataset';

type Table = { columns: { name: string }[]; rows: unknown[][] };
type Result = { status: 'success'; table: Table; requestId: string } | { status: 'error'; error: { message: string }; requestId: string };

declare global {
  interface Window { __dwgQueries: string[] }
}
window.__dwgQueries = [];
const engine = createEngine(model);

export function useSemanticModelQuery({ query }: { connection: string; query: string }) {
  const [state, setState] = useState<{ query: string; data?: Result }>({ query });
  useEffect(() => {
    window.__dwgQueries.push(query);
    const t = setTimeout(() => {
      let data: Result;
      try {
        data = { status: 'success', table: engine.query(query), requestId: 'minidax' };
      } catch (e) {
        data = { status: 'error', error: { message: String((e as Error).message) }, requestId: 'minidax' };
      }
      setState({ query, data });
    }, 30);
    return () => clearTimeout(t);
  }, [query]);
  return { data: state.data, isLoading: state.query !== query || !state.data, error: undefined as Error | undefined, refetch: async () => {} };
}
