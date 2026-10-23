// Ersatz für useSemanticModelQuery im Browser-Test: beantwortet die DAX-Abfragen der
// dwg-Spike-Seite mit Demodaten (visuals/demo/fixtures.json) und protokolliert jede
// Abfrage in window.__dwgQueries. Ein TREATAS-Filter auf einen Monat skaliert die Werte,
// damit sichtbar wird, dass die Kachel neu abgefragt wurde.
import { useEffect, useState } from 'react';

import fixtures from '../../../visuals/demo/fixtures.json';

type Table = { columns: { name: string }[]; rows: unknown[][] };
type Result = { status: 'success'; table: Table; requestId: string };

declare global {
  interface Window { __dwgQueries: string[] }
}
window.__dwgQueries = [];

const F = fixtures as Record<string, Table>;
const COUNTRIES = ['Germany', 'France', 'United Kingdom', 'Italy', 'Spain', 'Netherlands', 'Poland', 'Austria', 'Switzerland', 'Belgium', 'Sweden'];
const KPIS = ['Revenue', 'Cost', 'Gross Margin', 'Units'];

function rename(t: Table, names: string[]): Table {
  return { columns: names.map((name) => ({ name })), rows: t.rows };
}

function answer(fullQuery: string): Table {
  const month = /TREATAS\(\{"([^"]+)"\}, 'Calender'\[Month Name Short\]\)/.exec(fullQuery)?.[1];
  // Zuordnung über die gruppierenden Spalten, nicht über Filter
  const query = fullQuery.replace(/TREATAS\([^)]*\)/g, '');
  const f = month ? 1 / 6 : 1;
  const scale = (t: Table, from: number): Table => ({
    columns: t.columns,
    rows: t.rows.map((r) => r.map((v, i) => (i >= from && typeof v === 'number' ? Math.round(v * f) : v))),
  });
  if (query.includes("'Sales Demo'[KPI]")) {
    const t = rename(F.kpis, ['Sales Demo[KPI]', 'x', '[actual]', '[previousYear]', '[plan]']);
    return scale({ columns: t.columns.filter((_, i) => i !== 1), rows: t.rows.map((r, i) => [KPIS[i], r[2], r[3], r[4]]) }, 1);
  }
  if (query.includes("'Calender'[Month Name Short]")) {
    return rename(F.zeit, ['Calender[Month Name Short]', 'Calender[Month]', '[actual]', '[previousYear]', '[plan]', '[forecast]']);
  }
  if (query.includes("'Sales Demo'[Country]")) {
    return scale({ columns: [{ name: 'Sales Demo[Country]' }, { name: '[actual]' }, { name: '[plan]' }],
      rows: F.kosten.rows.map((r, i) => [COUNTRIES[i] ?? `Land ${i}`, r[1], r[2]]) }, 1);
  }
  if (query.includes("'dim-konten'[L1]")) {
    const g = F.guv;
    const keep = g.rows.filter((r) => r[10] == null || r[10] === (month ?? 'Jan'));
    // Monatszeilen zu einer Zeile je Konto (wie SUMMARIZECOLUMNS ohne Monatsspalte)
    const byAcc = new Map<unknown, unknown[]>();
    for (const r of month ? keep : g.rows) {
      const prev = byAcc.get(r[3]);
      if (!prev) { byAcc.set(r[3], [...r]); continue; }
      for (const i of [11, 12, 13]) prev[i] = (Number(prev[i]) || 0) + (Number(r[i]) || 0);
    }
    return {
      columns: ['dim-konten[L1]', 'dim-konten[L2]', 'dim-konten[L3]', 'dim-konten[AccountID]', 'dim-konten[Name]',
        'dim-konten[SortOrder]', 'dim-konten[RowType]', 'dim-konten[FormulaDef]', 'dim-konten[SignConvention]',
        'dim-konten[DisplayInvert]', 'dim-konten[VarianceInvert]', '[ac]', '[py]', '[pl]', '[fcFy]', '[plFy]'].map((name) => ({ name })),
      rows: [...byAcc.values()].map((r) => [r[0], r[1], r[2], r[3], r[1] ?? r[0], r[4], r[5], r[6], r[7], r[8], r[9], r[11], r[12], r[13], r[14], r[15]]),
    };
  }
  throw new Error(`Mock kennt die Abfrage nicht:\n${query}`);
}

export function useSemanticModelQuery({ query }: { connection: string; query: string }) {
  const [state, setState] = useState<{ query: string; data?: Result }>({ query });
  useEffect(() => {
    window.__dwgQueries.push(query);
    const t = setTimeout(() => setState({ query, data: { status: 'success', table: answer(query), requestId: 'mock' } }), 30);
    return () => clearTimeout(t);
  }, [query]);
  return { data: state.data, isLoading: state.query !== query || !state.data, error: undefined as Error | undefined, refetch: async () => {} };
}
