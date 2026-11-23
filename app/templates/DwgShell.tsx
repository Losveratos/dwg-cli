// dwg: App-Rahmen für eine ganze Spec. Kopfleiste oben (bleibt beim Scrollen stehen) mit Navigation (Gruppen,
// Seiten mit Template-Kennung) und Schaltern, darunter die Seite mit ihren Zonen nach dem Pixelraster
// (MockupKitchen): Kopf mit Seitentitel, festen Filtern der Spec (Chips, nicht klickbar) und Erklärtext, Filter-Panel links (Slicer, Werte per DAX), Kacheln,
// Fußleiste. Die Slicer-Auswahl wirkt per TREATAS auf alle Kacheln aller Seiten, zusammen mit dem Querfilter
// per Klick. Filterwechsel fragt die Kacheln der Seite neu ab, Seitenwechsel nur die neue Seite.
//
// Filter-Panel einklappen (Knopf im Panel oder Taste F): das Panel verschwindet, die Kacheln nutzen die ganze Breite,
// unter dem Seitenkopf steht eine Filterleiste mit den aktiven Slicern als Chips (× hebt einen Filter auf) und den
// festen Filtern der Spec (ohne ×); „Filter“ öffnet das Panel wieder. Der Zustand gilt je Browser (localStorage).
//
// Auflösung: „fullhd“ bzw. „hd“ baut die Seite in 1920 bzw. 1280 px auf und skaliert sie als Ganzes
// (Schriften, Abstände und Visuals im selben Verhältnis, Visuals rechnen in Seitenpixeln); unter
// MIN_STAGE_WIDTH scrollt sie waagerecht. Die Bühne passt sich der Fensterhöhe an (höchstens Seitenhöhe, mindestens
// MIN_FIT davon): die Kacheln werden über das Pixelraster neu verteilt, damit die ganze Seite ohne Scrollen sichtbar ist.
// „responsive“ skaliert nur die Kacheln. Unter 900 px wird gestapelt.
// Layout und Farben als Inline-Styles (ohne Tailwind lauffähig).
// Von `dwg app page` geschrieben, wird bei jedem Lauf ersetzt.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type Ref } from 'react';

import { useSemanticModelQuery } from '@/hooks/use-semantic-model-query';

import type { DaxValue } from '../vendor/dwg-visuals/dwg-visuals.js';
import {
  FILTER_BAR_H,
  RESOLUTION_WIDTH,
  columnType,
  findPage,
  fitHeight,
  formatSlicerValue,
  isEmptyValue,
  navGroups,
  pageId,
  pageLabel,
  pageRegion,
  sameValues,
  slicerChips,
  slicerDefaults,
  stagePage,
  slicerFilters,
  slicerQuery,
  slicerValues,
  stageScale,
  toggleSlicerValue,
  valueText,
  type DwgAppSpec,
  type DwgBox,
  type DwgPageSpec,
  type DwgResolution,
  type DwgSlicerSpec,
  type DwgSlicerState,
} from './dwg-page';
import { DwgPage, FixedFilterChips } from './DwgPage';

const FONT = "'Geist', 'Segoe UI', system-ui, sans-serif";

/** Ruhige Flächen, ein Akzent (Daten-WG). Dunkel passend zum Visual-Hintergrund #16191d. */
function palette(isDark: boolean) {
  return isDark
    ? {
        bg: '#0f1114',
        surface: '#16191d',
        panel: '#14171a',
        border: '#2c3138',
        text: '#e8eaed',
        muted: '#9aa0a6',
        accent: '#d9774b',
        accentSoft: 'rgba(217, 119, 75, 0.16)',
        onAccent: '#14171a',
      }
    : {
        bg: '#f4f4f1',
        surface: '#ffffff',
        panel: '#fbfaf7',
        border: '#e1dfd6',
        text: '#1f2328',
        muted: '#5f6368',
        accent: '#c25a2d',
        accentSoft: 'rgba(194, 90, 45, 0.10)',
        onAccent: '#ffffff',
      };
}
type Palette = ReturnType<typeof palette>;

/** Viele Werte: Liste bzw. Auswahlfeld statt Knöpfen */
const MAX_PILLS = 12;
const RESOLUTIONS: { id: DwgResolution; label: string; title: string }[] = [
  { id: 'fullhd', label: 'FHD', title: 'Seite in Full HD (1920 px) aufbauen und als Ganzes skalieren' },
  { id: 'hd', label: 'HD', title: 'Seite in HD (1280 px) aufbauen und als Ganzes skalieren: größere Schrift' },
  { id: 'responsive', label: 'Fließend', title: 'Nur die Kacheln skalieren, Schrift bleibt gleich' },
];

/** Einstellung je Browser merken (Auflösung, Kopfzeilen); ohne Speicher (privat, Tests) einfach nicht */
function stored<T extends string>(key: string, allowed: readonly T[]): T | null {
  try {
    const v = window.localStorage.getItem(key);
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : null;
  } catch {
    return null;
  }
}
function store(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ohne Speicher */
  }
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => {
      const w = Math.floor(node.getBoundingClientRect().width);
      if (w > 0) setWidth(w);
    };
    if (typeof ResizeObserver === 'undefined') {
      const frame = requestAnimationFrame(measure);
      window.addEventListener('resize', measure);
      return () => {
        cancelAnimationFrame(frame);
        window.removeEventListener('resize', measure);
      };
    }
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

/** Knopf in Pillenform; `k` skaliert Schrift und Abstände (Bühne: Seitenpixel) */
function pill(c: Palette, active: boolean, k = 1): CSSProperties {
  return {
    font: `500 ${12 * k}px/${16 * k}px ${FONT}`,
    padding: `${4 * k}px ${9 * k}px`,
    borderRadius: 999,
    border: `${Math.max(1, Math.round(k))}px solid ${active ? c.accent : c.border}`,
    background: active ? c.accentSoft : c.surface,
    color: active ? c.accent : c.text,
    cursor: 'pointer',
  };
}

interface SlicerProps {
  slicer: DwgSlicerSpec;
  /** Datentyp der Slicer-Spalte aus dem TMDL, wenn bekannt */
  type?: string;
  value: DaxValue[];
  connection: string;
  c: Palette;
  k: number;
  showEmpty: boolean;
  onChange: (next: DaxValue[]) => void;
}

function DwgSlicer({ slicer, type, value, connection, c, k, showEmpty, onChange }: SlicerProps) {
  const query = useMemo(() => slicerQuery(slicer), [slicer]);
  const { data, isLoading, error } = useSemanticModelQuery({ connection, query });
  const all = useMemo(() => (data?.status === 'success' ? slicerValues(data.table, slicer, type) : []), [data, slicer, type]);
  // leere Werte („(leer)“ aus Zeilen ohne Kunde/Produkt) ausblenden, außer gewünscht oder gerade gewählt
  const values = useMemo(
    () => (showEmpty || slicer.showEmpty ? all : all.filter((v) => !isEmptyValue(v) || value.some(isEmptyValue))),
    [all, showEmpty, slicer.showEmpty, value]
  );
  const message = error?.message ?? (data?.status === 'error' ? data.error.message : null);
  const isOn = (v: DaxValue) => value.some((x) => formatSlicerValue(x) === formatSlicerValue(v) && typeof x === typeof v);
  const summary = value.length === 0 ? 'Alle' : value.length === 1 ? formatSlicerValue(value[0]) : `${value.length} gewählt`;
  const small = `400 ${12 * k}px/${16 * k}px ${FONT}`;

  return (
    <fieldset data-dwg-slicer={slicer.label} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
      <legend
        style={{
          display: 'flex',
          width: '100%',
          justifyContent: 'space-between',
          gap: 8 * k,
          padding: 0,
          marginBottom: 6 * k,
          font: `600 ${12 * k}px/${16 * k}px ${FONT}`,
          color: c.text,
        }}
      >
        <span>{slicer.label}</span>
        <span style={{ fontWeight: 400, color: c.muted }}>{summary}</span>
      </legend>
      {isLoading && <p style={{ margin: 0, font: small, color: c.muted }}>lädt …</p>}
      {message && (
        <p role="alert" style={{ margin: 0, font: small, color: c.accent }}>
          Werte fehlen: {message}
        </p>
      )}
      {!isLoading && !message && values.length <= MAX_PILLS && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 * k }}>
          <button type="button" aria-pressed={value.length === 0} style={pill(c, value.length === 0, k)} onClick={() => onChange([])}>
            Alle
          </button>
          {values.map((v) => (
            <button
              key={`${typeof v}:${String(v)}`}
              type="button"
              data-value={valueText(v)}
              aria-pressed={isOn(v)}
              style={pill(c, isOn(v), k)}
              onClick={() => onChange(toggleSlicerValue(slicer, value, v))}
            >
              {formatSlicerValue(v)}
            </button>
          ))}
        </div>
      )}
      {!isLoading && !message && values.length > MAX_PILLS && !slicer.multi && (
        <select
          aria-label={slicer.label}
          value={value.length ? String(values.findIndex((v) => isOn(v))) : ''}
          onChange={(e) => onChange(e.target.value === '' ? [] : [values[Number(e.target.value)]])}
          style={{
            width: '100%',
            font: `400 ${13 * k}px ${FONT}`,
            padding: `${6 * k}px ${8 * k}px`,
            borderRadius: 6 * k,
            border: `1px solid ${c.border}`,
            background: c.surface,
            color: c.text,
          }}
        >
          <option value="">Alle</option>
          {values.map((v, i) => (
            <option key={`${typeof v}:${String(v)}`} value={String(i)}>
              {formatSlicerValue(v)}
            </option>
          ))}
        </select>
      )}
      {!isLoading && !message && values.length > MAX_PILLS && slicer.multi && (
        <div
          style={{
            maxHeight: 220 * k,
            overflowY: 'auto',
            border: `1px solid ${c.border}`,
            borderRadius: 6 * k,
            background: c.surface,
            padding: `${4 * k}px 0`,
          }}
        >
          {values.map((v) => (
            <label
              key={`${typeof v}:${String(v)}`}
              style={{ display: 'flex', gap: 8 * k, alignItems: 'center', padding: `${3 * k}px ${10 * k}px`, font: `400 ${13 * k}px/${18 * k}px ${FONT}`, color: c.text }}
            >
              <input
                type="checkbox"
                data-value={valueText(v)}
                checked={isOn(v)}
                onChange={() => onChange(toggleSlicerValue(slicer, value, v))}
                style={{ accentColor: c.accent }}
              />
              {formatSlicerValue(v)}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

/** id des Filter-Panels (aria-controls der Knöpfe zum Ein- und Ausklappen) */
const PANEL_ID = 'dwg-filter-panel';
/** Tastenkürzel zum Ein- und Ausklappen (ohne Umschalt-, Strg-, Alt- und Meta-Taste, nicht in Eingabefeldern) */
const PANEL_KEY = 'f';
/** So oft darf die Bühne je Seite und Panelzustand für die gemeldete Höhe eines Visuals wachsen */
const NEED_STEPS = 3;

/** Linien-Icons ohne Bibliothek (die Vorlagen laufen auch ohne lucide-react) */
function Icon({ d, size }: { d: string; size: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
      <path d={d} />
    </svg>
  );
}
const ICON_COLLAPSE = 'M11 17l-5-5 5-5M18 17l-5-5 5-5';
const ICON_FILTER = 'M3 5h18l-7 8.5V19l-4 2v-7.5z';

function smallButton(c: Palette, k: number, active: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5 * k,
    font: `500 ${12 * k}px/${16 * k}px ${FONT}`,
    padding: `${4 * k}px ${8 * k}px`,
    borderRadius: 6 * k,
    border: `1px solid ${c.border}`,
    background: 'transparent',
    color: active ? c.accent : c.muted,
    cursor: active ? 'pointer' : 'default',
    opacity: active ? 1 : 0.6,
    whiteSpace: 'nowrap',
  };
}

interface PanelProps {
  app: DwgAppSpec;
  state: DwgSlicerState;
  setState: (fn: (prev: DwgSlicerState) => DwgSlicerState) => void;
  defaults: DwgSlicerState;
  connection: string;
  c: Palette;
  k: number;
  style: CSSProperties;
  /** eingeklappt: bleibt eingehängt (keine neuen Abfragen der Werte), nur unsichtbar */
  collapsed: boolean;
  onCollapse: () => void;
  collapseRef: Ref<HTMLButtonElement>;
}

/** Filter-Panel: Slicer, Zurücksetzen, leere Werte einblenden, Einklappen */
function FilterPanel({ app, state, setState, defaults, connection, c, k, style, collapsed, onCollapse, collapseRef }: PanelProps) {
  const [showEmpty, setShowEmpty] = useState(false);
  const changed = app.slicers.some((s) => !sameValues(state[s.column] ?? [], defaults[s.column] ?? []));
  return (
    <aside
      id={PANEL_ID}
      aria-label="Filter"
      style={{ boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 16 * k, ...style, ...(collapsed ? { display: 'none' } : {}) }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 * k }}>
        <h2 style={{ margin: 0, marginRight: 'auto', font: `700 ${12 * k}px/${16 * k}px ${FONT}`, letterSpacing: '0.08em', textTransform: 'uppercase', color: c.muted }}>
          Filter
        </h2>
        <button
          type="button"
          disabled={!changed}
          onClick={() => setState(() => defaults)}
          style={smallButton(c, k, changed)}
        >
          Zurücksetzen
        </button>
        <button
          ref={collapseRef}
          type="button"
          data-dwg-toggle="panel"
          aria-expanded={true}
          aria-controls={PANEL_ID}
          aria-keyshortcuts="F"
          aria-label="Filter-Panel einklappen"
          title="Filter einklappen: Kacheln über die ganze Breite (Taste F)"
          onClick={onCollapse}
          style={{ ...smallButton(c, k, true), color: c.text, padding: `${4 * k}px ${6 * k}px` }}
        >
          <Icon d={ICON_COLLAPSE} size={14 * k} />
        </button>
      </div>
      {app.slicers.map((s) => (
        <DwgSlicer
          key={s.column}
          slicer={s}
          type={columnType(app.columnTypes, s.column)}
          value={state[s.column] ?? []}
          connection={connection}
          c={c}
          k={k}
          showEmpty={showEmpty}
          onChange={(next) => setState((prev) => ({ ...prev, [s.column]: next }))}
        />
      ))}
      <label style={{ display: 'flex', gap: 6 * k, alignItems: 'center', font: `400 ${12 * k}px/${16 * k}px ${FONT}`, color: c.muted }}>
        <input
          type="checkbox"
          data-dwg-toggle="empty"
          checked={showEmpty}
          onChange={(e) => setShowEmpty(e.target.checked)}
          style={{ accentColor: c.accent }}
        />
        Leere Werte zeigen
      </label>
    </aside>
  );
}

interface BarProps {
  app: DwgAppSpec;
  page: DwgPageSpec;
  state: DwgSlicerState;
  setState: (fn: (prev: DwgSlicerState) => DwgSlicerState) => void;
  defaults: DwgSlicerState;
  c: Palette;
  k: number;
  isDark: boolean;
  /** Bühne: eine Zeile in fester Höhe (FILTER_BAR_H), sonst umbrechen */
  height?: number;
  onOpen: () => void;
  openRef: Ref<HTMLButtonElement>;
}

/**
 * Filterleiste bei eingeklapptem Panel: „Filter“ öffnet das Panel, aktive Slicer als Chips mit × (hebt den Filter auf,
 * Auswahl „Alle“), feste Filter der Spec ohne ×, Zurücksetzen auf die Vorgaben.
 */
function FilterBar({ app, page, state, setState, defaults, c, k, isDark, height, onOpen, openRef }: BarProps) {
  const chips = slicerChips(app.slicers, state, defaults);
  const changed = app.slicers.some((s) => !sameValues(state[s.column] ?? [], defaults[s.column] ?? []));
  const list = useRef<HTMLUListElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const remove = (column: string, index: number) => {
    setState((prev) => ({ ...prev, [column]: [] }));
    // Fokus auf den nächsten Chip (sonst den vorigen, sonst „Filter“), der Knopf × verschwindet mit dem Chip
    requestAnimationFrame(() => {
      const left = [...(list.current?.querySelectorAll<HTMLButtonElement>('button[data-dwg-chip-remove]') ?? [])];
      (left[Math.min(index, left.length - 1)] ?? bar.current?.querySelector<HTMLButtonElement>('[data-dwg-toggle=filter]'))?.focus();
    });
  };
  const font = `500 ${11.5 * k}px/${15 * k}px ${FONT}`;
  return (
    <div
      ref={bar}
      data-dwg-filterbar=""
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8 * k,
        flexWrap: height ? 'nowrap' : 'wrap',
        ...(height ? { height, overflow: 'hidden' } : { marginTop: 10 * k }),
      }}
    >
      <button
        ref={openRef}
        type="button"
        data-dwg-toggle="filter"
        aria-expanded={false}
        aria-controls={PANEL_ID}
        aria-keyshortcuts="F"
        title="Filter-Panel öffnen (Taste F)"
        onClick={onOpen}
        style={{
          ...smallButton(c, k, true),
          font: `600 ${12 * k}px/${16 * k}px ${FONT}`,
          color: c.onAccent,
          background: c.accent,
          borderColor: c.accent,
        }}
      >
        <Icon d={ICON_FILTER} size={13 * k} />
        Filter
        {chips.length > 0 && <span aria-label={`${chips.length} aktiv`}>({chips.length})</span>}
      </button>
      <ul ref={list} aria-label="Aktive Filter" style={{ display: 'flex', flexWrap: height ? 'nowrap' : 'wrap', gap: 6 * k, margin: 0, padding: 0, listStyle: 'none', minWidth: 0 }}>
        {chips.map((chip, i) => (
          <li
            key={chip.column}
            data-dwg-filter-chip={chip.column}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 2 * k,
              padding: `${1 * k}px ${2 * k}px ${1 * k}px ${9 * k}px`,
              borderRadius: 999,
              border: `1px solid ${chip.changed ? c.accent : c.border}`,
              background: chip.changed ? c.accentSoft : c.surface,
              color: c.text,
              font,
              whiteSpace: 'nowrap',
            }}
          >
            <span>
              <span style={{ color: c.muted }}>{chip.label}:</span> {chip.values}
            </span>
            <button
              type="button"
              data-dwg-chip-remove={chip.column}
              aria-label={`Filter ${chip.label}: ${chip.values} entfernen`}
              title="Filter entfernen (Alle)"
              onClick={() => remove(chip.column, i)}
              style={{
                display: 'grid',
                placeItems: 'center',
                width: 20 * k,
                height: 20 * k,
                padding: 0,
                border: 0,
                borderRadius: 999,
                background: 'transparent',
                color: c.muted,
                font: `500 ${14 * k}px/1 ${FONT}`,
                cursor: 'pointer',
              }}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {chips.length === 0 && <span style={{ font: `400 ${11.5 * k}px/${15 * k}px ${FONT}`, color: c.muted, whiteSpace: 'nowrap' }}>Alle Daten, kein Filter gewählt</span>}
      <FixedFilterChips page={page} isDark={isDark} k={k * 0.95} colors={{ text: c.text, muted: c.muted, border: c.border, surface: c.surface }} style={{ flexWrap: height ? 'nowrap' : 'wrap' }} />
      {changed && (
        <button type="button" data-dwg-reset="" onClick={() => setState(() => defaults)} style={{ ...smallButton(c, k, true), marginLeft: 'auto' }}>
          Zurücksetzen
        </button>
      )}
    </div>
  );
}

/** Kopf der Seite: Kennung + Name, Gruppe, feste Filter (rechts), Erklärtext; eingeklappt darunter die Filterleiste */
function PageHeader({
  page,
  c,
  k,
  isDark,
  style,
  bar,
}: {
  page: DwgPageSpec;
  c: Palette;
  k: number;
  isDark: boolean;
  style?: CSSProperties;
  /** Filterleiste (eingeklapptes Panel); die festen Filter stehen dann dort statt rechts neben dem Titel */
  bar?: ReactNode;
}) {
  return (
    <div style={{ boxSizing: 'border-box', overflow: 'hidden', display: 'flex', flexDirection: 'column', ...style }}>
      <div style={{ margin: 0, display: 'flex', alignItems: 'baseline', gap: 12 * k, flexWrap: 'wrap' }}>
        <span data-dwg-title="" style={{ font: `700 ${15 * k}px/${20 * k}px ${FONT}`, letterSpacing: '-0.01em', color: c.text }}>
          {pageLabel(page)}
        </span>
        {page.group && <span style={{ font: `600 ${11 * k}px/${16 * k}px ${FONT}`, letterSpacing: '0.04em', color: c.accent }}>{page.group}</span>}
        {!bar && (
          <FixedFilterChips
            page={page}
            isDark={isDark}
            k={k * 0.9}
            colors={{ text: c.text, muted: c.muted, border: c.border, surface: c.surface }}
            style={{ marginLeft: 'auto', alignSelf: 'center' }}
          />
        )}
      </div>
      {page.description && (
        <p data-dwg-description="" style={{ margin: `${3 * k}px 0 0`, font: `400 ${10.5 * k}px/${15 * k}px ${FONT}`, color: c.muted }}>
          {page.description}
        </p>
      )}
      {bar && <div style={{ marginTop: 'auto' }}>{bar}</div>}
    </div>
  );
}

interface ShellProps {
  app: DwgAppSpec;
  connection: string;
  isDark: boolean;
  /** Titel oben links (Standard: Name der Spec) */
  title?: string;
  subtitle?: string;
  /** rechts in der Kopfleiste, z. B. Umschalter hell/dunkel */
  actions?: ReactNode;
  /** Fußtext (Standard: footer der Spec) */
  footer?: ReactNode;
}

export function DwgShell({ app, connection, isDark, title, subtitle, actions, footer }: ShellProps) {
  const c = palette(isDark);
  const { ref, width } = useWidth();
  const [page, setPage] = useState(() => findPage(app, typeof window === 'undefined' ? '' : window.location.hash));
  const [state, setState] = useState<DwgSlicerState>(() => slicerDefaults(app.slicers, app.columnTypes));
  const [resolution, setResolution] = useState<DwgResolution>(
    () => stored('dwg-resolution', ['fullhd', 'hd', 'responsive'] as const) ?? app.resolution ?? 'fullhd'
  );
  const [headers, setHeaders] = useState<boolean>(() => {
    const v = stored('dwg-visual-headers', ['on', 'off'] as const);
    return v ? v === 'on' : Boolean(app.visualHeaders);
  });

  useEffect(() => {
    const onHash = () => setPage(findPage(app, window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [app]);

  // eine Referenz je Auswahl: Theme, Fenstergröße, Auflösung und Kopfzeilen lösen keine neuen Abfragen aus
  const filters = useMemo(() => slicerFilters(app.slicers, state, app.columnTypes), [app.slicers, state, app.columnTypes]);
  const groups = navGroups(app.pages);
  const current = groups.find((g) => g.pages.includes(page)) ?? groups[0];
  const hasPanel = app.slicers.length > 0;
  const foot = footer ?? app.footer;
  const narrow = width > 0 && width < 900;
  const scaled = !narrow && resolution !== 'responsive' && Boolean(page.zones);
  const defaults = useMemo(() => slicerDefaults(app.slicers, app.columnTypes), [app.slicers, app.columnTypes]);

  // Filter-Panel ein- und ausklappen (Knopf, Taste F); Fokus wandert zum Gegenknopf, der Zustand gilt je Browser
  const [open, setOpen] = useState(() => stored('dwg-filter-panel', ['open', 'closed'] as const) !== 'closed');
  const collapsed = hasPanel && !open;
  const openRef = useRef<HTMLButtonElement>(null);
  const collapseRef = useRef<HTMLButtonElement>(null);
  const moveFocus = useRef(false);
  const togglePanel = useCallback((focus: boolean) => {
    moveFocus.current = focus;
    setOpen((o) => {
      store('dwg-filter-panel', o ? 'closed' : 'open');
      return !o;
    });
  }, []);
  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    (open ? collapseRef.current : openRef.current)?.focus();
  }, [open]);
  useEffect(() => {
    if (!hasPanel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== PANEL_KEY || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      // Fokus mitnehmen, wenn er im Panel bzw. auf einem der Knöpfe lag (sonst bleibt er, wo er ist)
      const inside = t && (t.closest(`#${PANEL_ID}`) || t.closest('[data-dwg-filterbar]'));
      togglePanel(Boolean(inside));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasPanel, togglePanel]);

  // Fensterhöhe unter der Kopfleiste: die Bühne passt sich ihr an, damit die ganze Seite ohne Scrollen sichtbar ist
  const topbar = useRef<HTMLElement>(null);
  const [room, setRoom] = useState(0);
  useEffect(() => {
    const measure = () => {
      const h = document.documentElement.clientHeight - (topbar.current?.offsetHeight ?? 0);
      if (h > 0) setRoom(h);
    };
    measure();
    window.addEventListener('resize', measure);
    const ro = typeof ResizeObserver === 'undefined' || !topbar.current ? null : new ResizeObserver(measure);
    if (ro && topbar.current) ro.observe(topbar.current);
    return () => {
      window.removeEventListener('resize', measure);
      ro?.disconnect();
    };
  }, []);

  // Bühne (fullhd/hd): Seite in Basisbreite, Zonen aus der Spec umgerechnet, als Ganzes skaliert
  // Seite in Bühnenpixeln: Zonen und Kacheln aus dem Pixelraster der Basisbreite (HD exakt im 1280er-Raster), auf die
  // Fensterhöhe eingepasst, eingeklappt ohne Filterzone
  const base = scaled ? RESOLUTION_WIDTH[resolution as 'fullhd' | 'hd'] : page.width;
  const sWidth = scaled && width > 0 ? stageScale(width, base) : 1;
  // unter MIN_STAGE_WIDTH scrollt die Bühne waagerecht: die Bildlaufleiste kostet Höhe
  const hScroll = scaled && width > 0 && Math.round(base * sWidth) > width ? 16 : 0;
  // Messungen einer vorigen Seite bzw. eines vorigen Panelzustands verwerfen (Schlüssel je Seite, Auflösung, Panel)
  const needKey = `${pageId(page)}|${base}|${collapsed ? 'zu' : 'auf'}`;
  const needKeyRef = useRef(needKey);
  useEffect(() => {
    needKeyRef.current = needKey;
  }, [needKey]);
  const [needs, setNeeds] = useState<{ key: string; steps: number; tiles: Record<string, number> }>({ key: '', steps: 0, tiles: {} });
  const onTileNeed = useCallback(
    (tile: string, h: number) => {
      if (needKeyRef.current !== needKey) return;
      setNeeds((prev) => {
        const same = prev.key === needKey;
        const cur = same ? prev.tiles : {};
        // höchstens NEED_STEPS Mal je Seite wachsen: ein Visual, das jede Höhe füllt, kann die Bühne nicht aufschaukeln
        if ((cur[tile] ?? 0) >= h || (same && prev.steps >= NEED_STEPS)) return prev;
        return { key: needKey, steps: (same ? prev.steps : 0) + 1, tiles: { ...cur, [tile]: Math.ceil(h) } };
      });
    },
    [needKey]
  );

  // Bühnenhöhe: auf das Fenster eingepasst (fitH), dazu die Höhe, die die Visuals melden (P&L, das trotz
  // layout.maximize einen Bildlauf braucht, z. B. ein hoher Baum). Dann wird die Bühne so viel höher, dass die Kachel
  // reicht, und skaliert etwas kleiner, damit sie ins Fenster passt. Je Seite, Auflösung und Panelzustand, nur wachsend.
  // Ein Memo mit den Rohwerten: dieselbe Seite behält ihr Objekt, Visuals rendern nur bei echten Änderungen neu.
  const { stage, fitH, needH } = useMemo(() => {
    const nominal = Math.round((page.height * base) / page.width);
    const fit = scaled ? fitHeight(room - hScroll, sWidth, nominal) : nominal;
    const fitted = scaled ? stagePage(page, base, app.chrome, { height: fit, collapsed }) : page;
    const content = fitted.zones?.content;
    let need = fit;
    if (scaled && content && needs.key === needKey) {
      let extra = 0;
      for (const [id, h] of Object.entries(needs.tiles)) {
        const t = fitted.tiles.find((x) => x.id === id);
        if (!t || h <= t.rect[3]) continue;
        // die Hauptkachel wächst um den fehlenden Betrag (absorbHeight); sonst wächst jede Rasterzeile anteilig
        const exact = h - t.rect[3] + 2;
        const grown = stagePage(page, base, app.chrome, { height: fit + exact, collapsed }).tiles.find((x) => x.id === id);
        extra = Math.max(extra, grown && grown.rect[3] >= h ? exact : Math.ceil(((h - t.rect[3]) * content.h) / t.rect[3]) + 2);
      }
      need = Math.min(fit + extra, Math.round(nominal * 1.6));
    }
    const staged = need > fit ? stagePage(page, base, app.chrome, { height: need, collapsed }) : fitted;
    return { stage: staged, fitH: fit, needH: need };
  }, [scaled, page, base, app.chrome, room, hScroll, sWidth, collapsed, needs, needKey]);
  // höhere Bühne: so weit kleiner skalieren, dass sie wieder ins Fenster passt (mittig)
  const s = needH > fitH && room > 0 ? Math.max(0.4, Math.min(sWidth, (room - hScroll) / needH)) : sWidth;
  const z = stage.zones;
  const f = 1;
  const k = base / 1280;
  const stageH = stage.height;
  const px = (b: DwgBox): CSSProperties => ({
    position: 'absolute',
    boxSizing: 'border-box',
    left: Math.round(b.x * f),
    top: Math.round(b.y * f),
    width: Math.round(b.w * f),
    height: Math.round(b.h * f),
  });
  const m = z ? Math.round((z.content.x - (z.filter ? z.filter.x + z.filter.w : 0)) * f) : 0;
  const oneCol = narrow || !hasPanel || collapsed;

  const chooseResolution = (r: DwgResolution) => {
    setResolution(r);
    store('dwg-resolution', r);
  };
  const toggleHeaders = () => {
    setHeaders((h) => {
      store('dwg-visual-headers', h ? 'off' : 'on');
      return !h;
    });
  };
  // Kopfleiste kompakt: Gruppen und Seiten je eine Zeile, bei Platzmangel waagerecht scrollbar (statt umzubrechen
  // und der Seite Höhe zu nehmen); die aktive Gruppe und Seite werden in den sichtbaren Bereich gerollt
  const navRow: CSSProperties = {
    display: 'flex',
    flexWrap: 'nowrap',
    flex: '1 1 0',
    minWidth: 0,
    overflowX: 'auto',
    overflowY: 'hidden',
    scrollbarWidth: 'thin',
    padding: '1px 0',
  };
  useEffect(() => {
    topbar.current?.querySelectorAll('nav [aria-current]').forEach((el) => el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }));
  }, [page]);
  const ctl = (on: boolean): CSSProperties => ({
    font: `500 12px/16px ${FONT}`,
    padding: '4px 8px',
    border: 0,
    borderRadius: 5,
    background: on ? c.surface : 'transparent',
    color: on ? c.accent : c.muted,
    boxShadow: on ? `0 0 0 1px ${c.border}` : 'none',
    cursor: 'pointer',
  });

  return (
    <div
      ref={ref}
      data-dwg-shell=""
      data-dwg-mode={narrow ? 'narrow' : scaled ? resolution : 'responsive'}
      data-dwg-panel={hasPanel ? (collapsed ? 'closed' : 'open') : undefined}
      style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', background: c.bg, color: c.text, font: `400 14px/20px ${FONT}` }}
    >
      <header
        ref={topbar}
        data-dwg-topbar=""
        style={{ position: 'sticky', top: 0, zIndex: 20, background: c.surface, borderBottom: `1px solid ${c.border}` }}
      >
        <div style={{ display: 'flex', flexWrap: narrow ? 'wrap' : 'nowrap', alignItems: 'center', gap: '10px 28px', padding: '12px 24px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '0 1 auto', minWidth: 0, maxWidth: narrow ? '100%' : '42%' }}>
            <span aria-hidden style={{ flex: 'none', width: 10, height: 22, borderRadius: 2, background: c.accent }} />
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0, font: `700 18px/22px ${FONT}`, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>{title ?? app.name}</h1>
              {subtitle && (
                <p
                  title={typeof subtitle === 'string' ? subtitle : undefined}
                  style={{ margin: 0, font: `400 12px/16px ${FONT}`, color: c.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                >
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <nav aria-label="Gruppen" style={{ ...navRow, gap: 2 }}>
            {groups.map((g) => {
              const on = g === current;
              return (
                <a
                  key={g.group}
                  href={`#${pageId(g.pages[0])}`}
                  aria-current={on ? 'true' : undefined}
                  style={{
                    flex: 'none',
                    whiteSpace: 'nowrap',
                    padding: '6px 10px',
                    borderRadius: 6,
                    textDecoration: 'none',
                    font: `${on ? 600 : 500} 13px/18px ${FONT}`,
                    color: on ? c.accent : c.muted,
                    background: on ? c.accentSoft : 'transparent',
                  }}
                >
                  {g.group}
                </a>
              );
            })}
          </nav>
        </div>
        <div style={{ display: 'flex', flexWrap: narrow ? 'wrap' : 'nowrap', alignItems: 'center', gap: '8px 16px', padding: '0 24px 10px' }}>
          <nav aria-label="Seiten" style={{ ...navRow, gap: 6 }}>
            {current.pages.map((p) => {
              const on = p === page;
              return (
                <a
                  key={pageId(p)}
                  href={`#${pageId(p)}`}
                  aria-current={on ? 'page' : undefined}
                  style={{
                    flex: 'none',
                    whiteSpace: 'nowrap',
                    display: 'inline-flex',
                    gap: 6,
                    alignItems: 'baseline',
                    padding: '4px 12px',
                    borderRadius: 999,
                    textDecoration: 'none',
                    border: `1px solid ${on ? c.accent : c.border}`,
                    background: on ? c.accent : c.surface,
                    color: on ? c.onAccent : c.text,
                    font: `500 13px/18px ${FONT}`,
                  }}
                >
                  {p.template && <span style={{ fontWeight: 700 }}>{p.template}</span>}
                  <span>{p.template ? pageLabel(p).slice(p.template.length).trim() || p.name : p.name}</span>
                </a>
              );
            })}
          </nav>
          <div style={{ marginLeft: 'auto', flex: 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div role="group" aria-label="Auflösung" style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 7, background: c.bg }}>
              {RESOLUTIONS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  data-dwg-resolution={r.id}
                  aria-pressed={resolution === r.id}
                  title={r.title}
                  onClick={() => chooseResolution(r.id)}
                  style={ctl(resolution === r.id)}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              data-dwg-toggle="headers"
              aria-pressed={headers}
              title="Titelblöcke und Bedienleisten in den Grafiken zeigen"
              onClick={toggleHeaders}
              style={{ ...ctl(headers), boxShadow: `0 0 0 1px ${c.border}` }}
            >
              Kopfzeilen {headers ? 'an' : 'aus'}
            </button>
            {actions}
          </div>
        </div>
      </header>

      {/* Ein Elementbaum für alle Modi (nur die Styles wechseln): DwgPage und die Slicer bleiben eingehängt,
          Auflösung, Fensterbreite und Kopfzeilen lösen deshalb keine neuen Abfragen aus. */}
      <div data-dwg-body="" style={scaled ? { overflowX: 'auto', overflowY: 'hidden' } : { flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={scaled ? { position: 'relative', width: Math.round(base * s), height: Math.round(stageH * s), margin: s < sWidth ? '0 auto' : undefined } : { flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div
            data-dwg-stage={scaled ? '' : undefined}
            data-dwg-scale={scaled ? s.toFixed(3) : undefined}
            style={
              scaled
                ? {
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: base,
                    height: stageH,
                    transform: `scale(${s})`,
                    transformOrigin: '0 0',
                    background: c.bg,
                    overflow: 'hidden',
                  }
                : {
                    flex: 1,
                    display: 'grid',
                    gridTemplateColumns: oneCol ? 'minmax(0, 1fr)' : '280px minmax(0, 1fr)',
                    gridTemplateRows: narrow ? 'auto auto 1fr auto' : 'auto 1fr auto',
                  }
            }
          >
            <PageHeader
              page={page}
              isDark={isDark}
              c={c}
              k={scaled ? k : 1.25}
              bar={
                collapsed ? (
                  <FilterBar
                    app={app}
                    page={page}
                    state={state}
                    setState={setState}
                    defaults={defaults}
                    c={c}
                    k={scaled ? k : 1}
                    isDark={isDark}
                    height={scaled ? Math.round(FILTER_BAR_H * k) : undefined}
                    onOpen={() => togglePanel(true)}
                    openRef={openRef}
                  />
                ) : undefined
              }
              style={
                scaled && z
                  ? { ...px(z.header), padding: `${Math.round(9 * k)}px ${m}px ${collapsed ? Math.round(3 * k) : 0}px`, borderBottom: `1px solid ${c.border}` }
                  : { gridColumn: oneCol ? '1' : '2', gridRow: narrow ? '2' : '1', padding: narrow ? '12px 12px 0' : '20px 24px 0', maxWidth: 1100 }
              }
            />
            {hasPanel && (
              <FilterPanel
                app={app}
                state={state}
                setState={setState}
                defaults={defaults}
                connection={connection}
                c={c}
                k={scaled ? k * 0.85 : 1}
                collapsed={collapsed}
                onCollapse={() => togglePanel(true)}
                collapseRef={collapseRef}
                style={
                  scaled && z?.filter
                    ? { ...px(z.filter), padding: m, background: c.panel, borderRight: `1px solid ${c.border}`, overflowY: 'auto' }
                    : {
                        gridColumn: '1',
                        gridRow: narrow ? '1' : '1 / span 2',
                        padding: 20,
                        background: c.panel,
                        borderRight: narrow ? 'none' : `1px solid ${c.border}`,
                        borderBottom: narrow ? `1px solid ${c.border}` : 'none',
                      }
                }
              />
            )}
            {/* Kachelfläche; auf der Bühne über die ganze Seite und durchlässig für Klicks ins Panel */}
            <div
              style={
                scaled
                  ? { position: 'absolute', left: 0, top: 0, width: base, height: stageH, pointerEvents: 'none' }
                  : { gridColumn: oneCol ? '1' : '2', gridRow: narrow ? '3' : '2', padding: narrow ? 12 : '12px 24px 24px', minWidth: 0 }
              }
            >
              <DwgPage
                key={pageId(page)}
                page={stage}
                connection={connection}
                isDark={isDark}
                filters={filters}
                hideVisualHeaders={!headers}
                fitVisuals
                onTileNeed={scaled ? onTileNeed : undefined}
                showFixedFilters={false}
                fixedWidth={scaled ? base : undefined}
                region={scaled ? undefined : pageRegion(page, true)}
                chipStyle={
                  scaled && z
                    ? { position: 'absolute', top: Math.round(z.footer.y * f) + Math.round(3 * k), right: m, zIndex: 2, minHeight: 0, pointerEvents: 'auto' }
                    : undefined
                }
                tileStyle={
                  scaled
                    ? { background: c.surface, border: `1px solid ${c.border}`, borderRadius: Math.round(6 * k), padding: Math.round(6 * k), pointerEvents: 'auto' }
                    : { background: c.surface, border: `1px solid ${c.border}`, borderRadius: 8, padding: 8 }
                }
              />
            </div>
            {foot && (
              <footer
                style={
                  scaled && z
                    ? {
                        ...px(z.footer),
                        boxSizing: 'border-box',
                        padding: `0 ${m}px`,
                        display: 'flex',
                        alignItems: 'center',
                        borderTop: `1px solid ${c.border}`,
                        font: `400 ${10 * k}px/${14 * k}px ${FONT}`,
                        color: c.muted,
                      }
                    : { gridColumn: '1 / -1', gridRow: narrow ? '4' : '3', padding: '10px 24px 16px', font: `400 12px/16px ${FONT}`, color: c.muted }
                }
              >
                {foot}
              </footer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
